/**
 * Orquestador de la simulación: mundo + ciudadanos + economía + social + reloj.
 * SIN worker ni THREE: es una clase pura que avanza por ticks — así los tests
 * pueden correr días de juego en milisegundos (sim.test.ts). El worker
 * (worker.ts) solo la envuelve con mensajería.
 *
 * Autómata del ciudadano por tick:
 *   deciding → (brain elige) → waitingPath → moving → doing → deciding
 * Con una excepción emergente: si al caminar se cruza con un conocido y ambos
 * van faltos de social, la charla INTERRUMPE el plan (social.ts).
 */
import { Cell, Grid, cellKey } from '../world/grid';
import { createRng, Rng } from '../rng';
import { GameClock, TICK_GAME_S, DAY_GAME_SECONDS } from './clock';
import { PathQueue, pathLength } from './pathfinding';
import { CellXZ, manhattan } from './geometry';
import { WorldIndex, isUrban } from './worldIndex';
import type { SimBuilding } from './worldIndex';
import { coverageRates } from './coverage';
import { householdHappiness } from './happiness';
import { computeLandValue } from './landValue';
import { Economy, EconomySaveState } from './economy';
import { Citizen, CitizenPhase, citizenName, PlannedActivity, TravelMode, BusPlan, BusRide, BusWait, jobFitsVocation, vocationOf, VOCATION_PURPOSE_BONUS, surnameOf } from './citizens/citizen';
import { decayNeeds, restore, NEED_KEYS } from './citizens/needs';
import { chooseActivity } from './citizens/brain';
import { ACTIVITY_BY_KIND, SimContext, activityLabel, EDU_PER_HOUR, CLINIC_FEE, isFestivalDay } from './citizens/activities';
import { SocialSystem, SocialSaveState } from './citizens/social';
import { AgentState, ActivityKind, activityId, AGENT_STRIDE, AlertBit, BUILDING_STRIDE, BUS_STOP_STRIDE, VEHICLE_STRIDE, TravelModeCode, VehicleKindCode, CityStats, CitizenInfoMsg, settlementLevel, SETTLEMENT_CLASSES, PlayerAction, RecordedAction, GrowthPolicy, PublicAutobuildPolicy, BudgetHistoryPoint, RoadKind, DistrictPolicy, DistrictPolicyState, emptyDistrictPolicy } from './protocol';
import {
  computeDemand, demandLevels, itemForDemand, findParcel, townCenter, townAttractiveness,
  householdHardship, updateEmigrationPressure, EMIGRATE_POP_FLOOR, EMIGRATE_PRESSURE_LIMIT,
  extendRoad, GrowthPlacement, CARRYING_CAPACITY, fertilityFactor, growthCenter, residentialVisualId,
  upgradeCandidate, UPGRADE_LAND_VALUE, tierForPopulation,
} from '../world/growth';
import { lifeYear, ADULT_AGE, OLD_AGE, RETIREMENT_AGE } from './lifecycle';
import { STARTING_MONEY, PENSION_PER_DAY, RENT_PER_DAY, RENT_TIER_FACTOR, SEASON_YIELD_SWING } from './economy';
import { catalogData, Tier } from '../world/catalogData';
import { healthTick, CLINIC_RECOVERY_PER_HOUR, WORK_BLOCK_HEALTH } from './health';
import { griefTick, consoleGrief, bereave, GRIEF_PARTNER, GRIEF_FRIEND, GRIEF_FRIEND_AFFINITY } from './grief';
import { sickenTick, treatSick, SICK_ONSET, VACCINE_IMMUNITY } from './contagion';
import { weatherAt, seasonalFestivalName, seasonalWarmth, Weather } from './weather';
import { applyPlayerAction, ActionResult } from './actions';
import { ROAD_SPECS } from '../world/roads';
import { congestionFactor, decayTraffic } from './traffic';
import { BUS_SPEED_FACTOR, Bus, BusLine, Train, buildBusLine, buildRailLoop, createBuses, createTrain, stepBuses, stepTrain, trainWagonPositions } from './transit';

/** Velocidad al caminar, en celdas por tick (0.25 s reales a vel. 1). */
const WALK_CELLS_PER_TICK = 0.9; // ≈ 7 km/h de juego a escala urbana

// --- Lógica de vehículos (ciclo 8) --------------------------------------------
/** A partir de esta distancia (celdas), el trayecto se plantea en coche —
 * igual que a pie, es una PREFERENCIA de la utility AI, no un guion: si no
 * hay dinero para el trayecto, se va a pie igualmente (más lento pero libre). */
const CAR_TRIP_THRESHOLD = 40;
/** Coste de combustible por trayecto en coche (acopla vehículos↔dinero). */
export const CAR_TRIP_COST = 4;
/** Velocidad en coche sobre asfalto: mucho más rápida que a pie. */
const CAR_CELLS_PER_TICK_ROAD = 3.6;
/** Fuera de vía (aparcando, accediendo a la puerta) el coche va despacio —
 * similar al peatón, no vuela por el campo. */
const CAR_CELLS_PER_TICK_OFFROAD = WALK_CELLS_PER_TICK;
/** Un atasco aislado se enseña en el overlay, pero no frena todo el pueblo.
 * El freno físico entra cuando la saturación media de la red ya es visible. */
const MIN_NETWORK_CONGESTION_TO_SLOW = 0.02;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasDistrictPolicy(policy: DistrictPolicyState): boolean {
  return policy.taxDelta !== 0 || policy.noIndustry || policy.parksPriority || policy.speed30;
}

// --- Lógica de estatus y propiedad (ciclo 9) ----------------------------------
/** Bonus de 'fun' por hora en casa, a prestigio máximo (se escala por él). */
const COMFORT_FUN_PER_HOUR = 0.15;

/** Granero por encima del cual la fiesta de la cosecha es "abundante" (ciclo 24). */
const BOUNTIFUL_GRANARY = 40;

/** Días de aislamiento vial antes de cerrar un edificio (H2.6). */
export const ABANDON_DAYS = 10;

// --- Lógica de jubilación (ciclo 12) ------------------------------------------
/** Ritmo al que un jubilado reconstruye 'purpose' FUERA del trabajo, PROPORCIONAL
 * al déficit: `k·(1 - purpose)` por hora. La forma importa: un restore PLANO
 * (constante/hora) no tiene equilibrio intermedio contra el decay plano de
 * needs.ts (satura a 1 o cae a 0 → dos castas). Proporcional al déficit da un
 * ATRACTOR por persona (v* = 1 - d/k), un continuo suave en [0.375, 0.79] con
 * k = 1/5 — nunca 0 ni 1, siempre por debajo de lo que da un empleo real.
 * k debe superar el decay máximo (0.125) para que hasta el más 'trabajador'
 * tenga punto fijo positivo. Ver RESEARCH.md (ciclo 12). */
const RETIREMENT_PURPOSE_RECOVERY = 1 / 5;

// --- Lógica de vacunación (ciclo 33): salud pública preventiva -----------------
/** Coste por dosis que paga el tesoro (acopla contagio↔gobierno: la salud
 * pública cuesta; un pueblo en quiebra no puede permitírsela). */
const VACCINE_COST_PER_DOSE = 6;
/** Fracción de la población a la que se ofrece la vacuna al día durante la
 * campaña (otoño-invierno): la capacidad del sistema, ~toda en dos semanas. */
const VACCINE_DAILY_FRACTION = 0.12;

// --- Rotación vocacional (ciclo 41): que la vocación MUEVA a la gente ----------
/** Probabilidad diaria de que un adulto INFELIZ en su oficio (trabaja lejos de
 * su vocación) lo deje para buscar el suyo — pero solo si hay una vacante que sí
 * lo colma a su alcance (`hasVocationVacancy`). Bajo a propósito: un goteo de
 * HISTORIAS ("deja la tienda y por fin labra la tierra"), no un vuelco laboral.
 * El ciclo 37 demostró que preferir en la asignación es un no-op sin este churn. */
const VOCATION_QUIT_CHANCE = 0.05;

// --- Dinastías (ciclo 43): la estirpe que se afianza -------------------------
/** Descendientes VIVOS de un mismo tronco a partir de los cuales la Crónica
 * reconoce una DINASTÍA (una familia que ha echado raíces). Medido: las líneas
 * dominantes llegan a 20-40 en pueblos pequeños; 8 marca una familia grande de
 * verdad y dispara pocas veces (un hito raro, no spam). */
const DYNASTY_THRESHOLD = 8;

export interface SimEvent {
  name: 'citizenBorn' | 'citizenLeft' | 'jobTaken' | 'chatStarted' | 'cityGrew' | 'buildingRazed' | 'buildingUpgraded' | 'buildingAbandoned' | 'serviceNeeded' | 'tierUnlocked' | 'coupleFormed' | 'festivalDay' | 'roadExtended' | 'roadBuilt' | 'epidemic' | 'citizenRetired' | 'homePrestige' | 'cultivationChanged' | 'vocationFound' | 'dynastyRose' | 'dynastyFell' | 'firstBuilding' | 'settlementRose' | 'familyArrived' | 'townFounded';
  data: Record<string, unknown>;
}

export interface BuiltChange {
  id: string;
  /** Tipología que anima/dibuja el render; `id` conserva la estructura lógica. */
  visualId?: string;
  cx: number;
  cz: number;
  rot: 0 | 1 | 2 | 3;
}

export interface RazedChange {
  cx: number;
  cz: number;
}

export type CitizenSaveState = Omit<Citizen, 'friends' | 'phase'> & {
  friends: Array<[number, number]>;
  phase: CitizenPhase;
};

/** Snapshot JSON completo del worker. Los campos derivados (índice, workplaces,
 * PathQueue) se reconstruyen, no se duplican en el contrato de guardado. */
export interface SimSaveState {
  version: 1;
  seed: number;
  gridJson: string;
  clock: { time: number; tick: number };
  citizens: CitizenSaveState[];
  households: Array<[string, number]>;
  pantry: Array<[string, number]>;
  emigrationPressure: Array<[string, number]>;
  /** Felicidad por hogar, recalculada en cada cierre de día. */
  happiness?: Array<[string, number]>;
  /** Valor del suelo por edificio, recalculado en cada cierre de día. */
  landValue?: Array<[string, number]>;
  /** Último día con intento de densificación; evita dos upgrades en un día. */
  lastUpgradeDay?: number;
  /** Política de obras públicas autónomas; opcional para compatibilidad con saves H4.7. */
  publicAutobuild?: PublicAutobuildPolicy;
  /** Necesidades de servicio ya notificadas, para no repetir avisos cada tick. */
  serviceNeedsReported?: string[];
  noAccessSince: Array<[string, number]>;
  /** Edificios que ya estuvieron conectados; evita castigar una semilla antigua
   * hasta que realmente pierda su acceso. */
  roadAccessSeen?: string[];
  leaving: number[];
  inEpidemic: boolean;
  tier: Tier;
  lastDay: number;
  lastRoadDay: number;
  roadsExtended: number;
  carTrips: number;
  /** Carga residual por celda de vía; opcional para saves anteriores a H5.1. */
  traffic?: Array<[number, number]>;
  /** Líneas y vehículos de transporte; opcionales para saves anteriores a H5.3. */
  busLines?: Array<{ id: number; stops: CellXZ[] }>;
  buses?: Bus[];
  busTrips?: number;
  nextBusLineId?: number;
  nextBusId?: number;
  /** Progreso del tren; el trazado se deriva del grid, no se duplica. */
  train?: Pick<Train, 'routeIndex' | 'x' | 'z' | 'heading' | 'wagonCount'>;
  /** Políticas administrativas por distrito; opcional para saves anteriores a H5.5. */
  districtPolicies?: Array<[number, DistrictPolicyState]>;
  emigrations: number;
  vaccinationsGiven: number;
  firstBuildingSeen: string[];
  dynastiesSeen: number[];
  dynastiesFallen: number[];
  dynastyNames: Array<[number, string]>;
  settlementLevelSeen: number;
  nextId: number;
  flags: {
    autonomousGrowth: boolean;
    clinicHealing: boolean;
    quarantine: boolean;
    rentEnabled: boolean;
    vaccination: boolean;
    vocationalMobility: boolean;
  };
  growthPolicy?: GrowthPolicy;
  actions: RecordedAction[];
  budgetHistory?: BudgetHistoryPoint[];
  rngState: number;
  churnRngState: number;
  social: SocialSaveState;
  economy: EconomySaveState;
}

function serializePhase(phase: CitizenPhase): CitizenPhase {
  return phase.kind === 'waitingPath' ? { kind: 'deciding' } : phase;
}

function restorePhase(phase: CitizenPhase): CitizenPhase {
  return phase.kind === 'waitingPath' ? { kind: 'deciding' } : phase;
}

export class Simulation {
  readonly clock = new GameClock();
  readonly index: WorldIndex;
  readonly economy = new Economy();
  readonly citizens = new Map<number, Citizen>();
  readonly social: SocialSystem;
  readonly paths: PathQueue;
  private rng: Rng;
  /** RNG APARTE para el churn vocacional (ciclo 41): así el goteo de renuncias
   * no altera el flujo del RNG general (natalidad, crecimiento…) — el resto de
   * la sim conserva su secuencia exacta y el churn sigue siendo determinista. */
  private churnRng: Rng;
  /** Quienes dejaron su puesto HOY buscando su vocación (ciclo 41): se reasignan
   * con preferencia y, si aciertan, la Crónica lo narra. Se reusa por día. */
  private readonly churnSeekers = new Set<number>();
  /** Troncos de estirpe ya reconocidos como dinastía (ciclo 43): el hito se narra
   * UNA vez por línea, cuando cruza el umbral de descendientes vivos. */
  private readonly dynastiesSeen = new Set<number>();
  /** Dinastías ya extinguidas (ciclo 44): su caída se narra una sola vez. */
  private readonly dynastiesFallen = new Set<number>();
  /** Apellido de cada tronco reconocido (ciclo 44): para narrar su extinción
   * cuando ya no queda ningún miembro vivo de quien leerlo. */
  private readonly dynastyNames = new Map<number, string>();
  /** Tipos de edificio ya vistos (ciclo 45): se pre-puebla con los de la aldea
   * fundacional; la ciudad anuncia el PRIMERO de cada tipo NUEVO que levanta. */
  private readonly firstBuildingSeen = new Set<string>();
  /** Clase de asentamiento ya alcanzada (ciclo 47): aldea→pueblo→villa→ciudad.
   * Se inicia con la del arranque para no narrar la identidad de partida. */
  private settlementLevelSeen = 0;
  private nextId = 1;
  private lastDay = 0;
  events: SimEvent[] = [];
  /** Journal de acciones aceptadas; es la fuente del replay y del guardado. */
  readonly actions: RecordedAction[] = [];
  /** Últimos 30 cierres del tesoro para el sparkline del presupuesto. */
  private budgetHistory: BudgetHistoryPoint[] = [];
  /** Cambios espaciales pendientes de entregar al hilo de render. */
  private pendingBuilt: BuiltChange[] = [];
  private pendingRazed: RazedChange[] = [];
  /** T4.4: la ciudad crece sola. Activado por defecto (es el alma del juego). */
  autonomousGrowth = true;
  /** Política espacial del crecimiento: las zonas orientan, no sustituyen la
   * demanda. Se guarda para que una partida continúe con la misma intención. */
  growthPolicy: GrowthPolicy = 'free';
  /** Política pública: por defecto el pueblo levanta servicios si puede pagarlos. */
  publicAutobuild: PublicAutobuildPolicy = 'paid';
  /** Sanidad activa (ciclo 15): si es false, la clínica no cura — permite medir
   * cuánta vida SALVA la sanidad (escenario "sin sistema de salud"). */
  clinicHealing = true;
  /** Autoaislamiento activo (ciclo 26): los enfermos se recogen en casa y
   * aplanan la curva. false = escenario "sin cuarentena" (para medir/estudiar). */
  quarantine = true;
  /** Alquiler activo (ciclo 29): los hogares pagan por la vivienda. false =
   * escenario "vivienda gratis" (para medir cuánto drena y cómo circula). */
  rentEnabled = true;
  /** Vacunación activa (ciclo 33): salud pública preventiva. false = escenario
   * "sin vacuna" (para medir la inmunidad de rebaño contra la epidemia cruda). */
  vaccination = true;
  /** Rotación vocacional activa (ciclo 41): los infelices en su oficio buscan su
   * vocación. false = escenario "sin churn" (para medir cuánto ACERCA la gente a
   * su llamada — la lección del ciclo 37: preferir sin churn es un no-op). */
  vocationalMobility = true;
  /** Vacunaciones administradas (ciclo 33 — métrica de tests/Crónica). */
  vaccinationsGiven = 0;
  /** Tier desbloqueado (T4.5 lo ligará a población; fijo de momento). */
  tier: Tier = 1;
  /** Familias alojadas por vivienda ('ax,az') — para la demanda de techo. */
  private households = new Map<string, number>();
  /** Despensa por hogar ('ax,az') — lógica de alimento (ciclo 1). */
  readonly pantry = new Map<string, number>();
  /** Trayectos en coche acumulados (ciclo 8 — métrica de tests/Crónica). */
  carTrips = 0;
  /** Carga de tráfico por celda de vía; decae por hora y se guarda para replay. */
  readonly traffic = new Map<number, number>();
  /** Líneas de bus activas y sus vehículos físicos (H5.3). */
  readonly busLines = new Map<number, BusLine>();
  readonly buses: Bus[] = [];
  /** Embarques completados; sirve para medir si el transporte público se usa. */
  busTrips = 0;
  private nextBusLineId = 1;
  private nextBusId = 1;
  /** Un único servicio regional por circuito cerrado; los vagones se derivan. */
  train: Train | null = null;
  /** Política local de cada distrito pintado; el mapa solo guarda estados no
   * neutros para que un save siga siendo pequeño y canónico. */
  readonly districtPolicies = new Map<number, DistrictPolicyState>();
  /** Emigraciones acumuladas (ciclo 14 — métrica de tests/Crónica). */
  emigrations = 0;
  /** Tramos de vía trazados por la ciudad sola (T4.4 — métrica de tests). */
  roadsExtended = 0;
  /** Último día en que se trazó vía (T4.4 — ritmo: una calle no cada tick). */
  private lastRoadDay = -10;
  /** Último día en que se intentó una densificación (H4.5 — una obra/día). */
  private lastUpgradeDay = -10;
  /** Presión migratoria por hogar ('ax,az') — penuria sostenida (ciclo 14). */
  private emigrationPressure = new Map<string, number>();
  /** Felicidad por hogar; solo se recalcula en el cierre del día (H4.3). */
  private happiness = new Map<string, number>();
  /** Valor del suelo por edificio; solo se recalcula en el cierre del día. */
  private landValue = new Map<string, number>();
  /** Avisos de servicio pendientes ya emitidos; se limpian al construirlo. */
  private readonly serviceNeedsReported = new Set<string>();
  /** Día en que cada edificio activo perdió acceso a la red vial. */
  private noAccessSince = new Map<string, number>();
  /** Accesos conocidos para detectar cortes, no solo edificios nacidos lejos. */
  private roadAccessSeen = new Set<string>();
  /** Ciudadanos decididos a marcharse: caminan a la salida y despawnean allí. */
  private leaving = new Set<number>();
  /** Recogidos al LLEGAR a la salida este tick; se despawnean tras el bucle. */
  private departed: Citizen[] = [];

  constructor(readonly grid: Grid, readonly seed: number, restoreState?: SimSaveState) {
    this.rng = createRng(seed ^ 0x5f3759df);
    this.churnRng = createRng(seed ^ 0x243f6a88);
    this.index = new WorldIndex(grid);
    this.social = new SocialSystem(createRng(seed ^ 0x9e3779b9));
    this.paths = new PathQueue(grid);
    for (const b of this.index.buildings) if (b.roadAccess) this.roadAccessSeen.add(`${b.ax},${b.az}`);
    if (restoreState) {
      this.restore(restoreState);
      return;
    }
    this.spawnPopulation();
    this.economy.rebuild(this.index, this.citizens);
    this.refreshTrain();
    this.hireAndAcquaint();
    this.recalculateLandValue();
    this.recalculateHappiness();
    // Hitos del pueblo (ciclo 45): los edificios de la aldea fundacional no son
    // "primicias" — solo lo será el primer tipo NUEVO que la ciudad levante sola.
    for (const b of this.index.buildings) this.firstBuildingSeen.add(b.id);
    // Identidad de partida (ciclo 47): no se narra el ascenso a la clase inicial.
    this.settlementLevelSeen = settlementLevel(this.citizens.size);
    // El principio de la saga (ciclo 49): el pueblo se funda. Primer beat de la
    // Crónica — la historia necesita un comienzo. La Crónica lo deduplica al
    // recargar (persiste por semilla), así que se emite siempre sin miedo.
    this.events.push({ name: 'townFounded', data: { founders: this.citizens.size } });
  }

  /** Restaura un save ya validado por el worker. El grid se entrega ya
   * deserializado para que índice y PathQueue nazcan apuntando a la misma fuente. */
  private restore(state: SimSaveState): void {
    this.clock.time = state.clock.time;
    this.clock.tick = state.clock.tick;
    this.citizens.clear();
    for (const raw of state.citizens) {
      this.citizens.set(raw.id, {
        ...raw,
        friends: new Map(raw.friends),
        phase: restorePhase(raw.phase),
      });
    }
    this.households = new Map(state.households);
    this.pantry.clear();
    for (const [key, value] of state.pantry) this.pantry.set(key, value);
    this.emigrationPressure = new Map(state.emigrationPressure);
    this.happiness = new Map(state.happiness ?? []);
    this.landValue = new Map(state.landValue ?? []);
    this.noAccessSince = new Map(state.noAccessSince ?? []);
    this.roadAccessSeen = new Set(state.roadAccessSeen ?? []);
    this.leaving.clear();
    for (const id of state.leaving) this.leaving.add(id);
    this.inEpidemic = state.inEpidemic;
    this.tier = state.tier;
    this.lastDay = state.lastDay;
    this.lastRoadDay = state.lastRoadDay;
    this.lastUpgradeDay = state.lastUpgradeDay ?? -10;
    this.publicAutobuild = state.publicAutobuild ?? 'paid';
    this.serviceNeedsReported.clear();
    for (const id of state.serviceNeedsReported ?? []) this.serviceNeedsReported.add(id);
    this.roadsExtended = state.roadsExtended;
    this.carTrips = state.carTrips;
    this.traffic.clear();
    for (const [key, load] of state.traffic ?? []) {
      if (Number.isFinite(key) && Number.isFinite(load) && load > 0) this.traffic.set(key, load);
    }
    this.busLines.clear();
    this.buses.length = 0;
    for (const raw of state.busLines ?? []) {
      const line = buildBusLine(raw.id, raw.stops);
      if (line) this.busLines.set(line.id, line);
    }
    for (const raw of state.buses ?? []) {
      if (this.busLines.has(raw.lineId) && Number.isFinite(raw.x) && Number.isFinite(raw.z)) this.buses.push({ ...raw });
    }
    this.nextBusLineId = state.nextBusLineId ?? (Math.max(0, ...this.busLines.keys()) + 1);
    this.nextBusId = state.nextBusId ?? (Math.max(0, ...this.buses.map((bus) => bus.id)) + 1);
    this.busTrips = state.busTrips ?? 0;
    if (this.busLines.size > 0 && this.buses.length === 0) {
      for (const line of this.busLines.values()) {
        const created = createBuses(line, this.nextBusId);
        this.nextBusId += created.length;
        this.buses.push(...created);
      }
    }
    this.refreshTrain(state.train);
    this.districtPolicies.clear();
    for (const [district, raw] of state.districtPolicies ?? []) {
      if (!Number.isInteger(district) || district < 0 || district > 99) continue;
      const policy = { ...emptyDistrictPolicy(), ...raw };
      if (hasDistrictPolicy(policy)) this.districtPolicies.set(district, policy);
    }
    this.emigrations = state.emigrations;
    this.vaccinationsGiven = state.vaccinationsGiven;
    this.firstBuildingSeen.clear();
    for (const id of state.firstBuildingSeen) this.firstBuildingSeen.add(id);
    this.dynastiesSeen.clear();
    for (const id of state.dynastiesSeen) this.dynastiesSeen.add(id);
    this.dynastiesFallen.clear();
    for (const id of state.dynastiesFallen) this.dynastiesFallen.add(id);
    this.dynastyNames.clear();
    for (const [id, name] of state.dynastyNames) this.dynastyNames.set(id, name);
    this.settlementLevelSeen = state.settlementLevelSeen;
    this.nextId = state.nextId;
    this.autonomousGrowth = state.flags.autonomousGrowth;
    this.growthPolicy = state.growthPolicy ?? 'free';
    this.clinicHealing = state.flags.clinicHealing;
    this.quarantine = state.flags.quarantine;
    this.rentEnabled = state.flags.rentEnabled;
    this.vaccination = state.flags.vaccination;
    this.vocationalMobility = state.flags.vocationalMobility ?? true;
    this.actions.push(...state.actions);
    this.budgetHistory = [...(state.budgetHistory ?? [])];
    this.rng = createRng(0, state.rngState);
    this.churnRng = createRng(0, state.churnRngState);
    this.social.restore(state.social);
    this.economy.restore(state.economy);
    this.pendingBuilt = [];
    this.pendingRazed = [];
    this.events = [];
    this.departed = [];
    this.churnSeekers.clear();
    this.economy.rebuild(this.index, this.citizens);
    if (state.landValue === undefined) this.recalculateLandValue();
    if (state.happiness === undefined) this.recalculateHappiness();
  }

  /** Serializa el estado que cambia el futuro; las búsquedas A* pendientes se
   * normalizan a `deciding` porque su heap no forma parte del save. */
  serialize(): SimSaveState {
    return {
      version: 1,
      seed: this.seed,
      gridJson: this.grid.serialize(),
      clock: { time: this.clock.time, tick: this.clock.tick },
      citizens: [...this.citizens.values()].map((c) => ({
        ...c,
        friends: [...c.friends.entries()].sort((a, b) => a[0] - b[0]),
        phase: serializePhase(c.phase),
      })),
      households: [...this.households].sort(([a], [b]) => a.localeCompare(b)),
      pantry: [...this.pantry].sort(([a], [b]) => a.localeCompare(b)),
      emigrationPressure: [...this.emigrationPressure].sort(([a], [b]) => a.localeCompare(b)),
      happiness: [...this.happiness].sort(([a], [b]) => a.localeCompare(b)),
      landValue: [...this.landValue].sort(([a], [b]) => a.localeCompare(b)),
      noAccessSince: [...this.noAccessSince].sort(([a], [b]) => a.localeCompare(b)),
      roadAccessSeen: [...this.roadAccessSeen].sort(),
      leaving: [...this.leaving].sort((a, b) => a - b),
      inEpidemic: this.inEpidemic,
      tier: this.tier,
      lastDay: this.lastDay,
      lastRoadDay: this.lastRoadDay,
      lastUpgradeDay: this.lastUpgradeDay,
      roadsExtended: this.roadsExtended,
      carTrips: this.carTrips,
      traffic: [...this.traffic].filter(([, load]) => load > 0).sort(([a], [b]) => a - b),
      busLines: [...this.busLines.values()]
        .sort((a, b) => a.id - b.id)
        .map((line) => ({ id: line.id, stops: line.stops.map(([x, z]) => [x, z] as CellXZ) })),
      buses: this.buses.map((bus) => ({ ...bus })).sort((a, b) => a.id - b.id),
      busTrips: this.busTrips,
      nextBusLineId: this.nextBusLineId,
      nextBusId: this.nextBusId,
      train: this.train ? {
        routeIndex: this.train.routeIndex,
        x: this.train.x,
        z: this.train.z,
        heading: this.train.heading,
        wagonCount: this.train.wagonCount,
      } : undefined,
      districtPolicies: [...this.districtPolicies]
        .sort(([a], [b]) => a - b)
        .map(([district, policy]) => [district, { ...policy }] as [number, DistrictPolicyState]),
      emigrations: this.emigrations,
      vaccinationsGiven: this.vaccinationsGiven,
      firstBuildingSeen: [...this.firstBuildingSeen].sort(),
      dynastiesSeen: [...this.dynastiesSeen].sort((a, b) => a - b),
      dynastiesFallen: [...this.dynastiesFallen].sort((a, b) => a - b),
      dynastyNames: [...this.dynastyNames].sort(([a], [b]) => a - b),
      settlementLevelSeen: this.settlementLevelSeen,
      nextId: this.nextId,
      flags: {
        autonomousGrowth: this.autonomousGrowth,
        clinicHealing: this.clinicHealing,
        quarantine: this.quarantine,
        rentEnabled: this.rentEnabled,
        vaccination: this.vaccination,
        vocationalMobility: this.vocationalMobility,
      },
      growthPolicy: this.growthPolicy,
      publicAutobuild: this.publicAutobuild,
      serviceNeedsReported: [...this.serviceNeedsReported].sort(),
      actions: this.actions.map((a) => ({ ...a, action: { ...a.action } as PlayerAction })),
      budgetHistory: this.budgetHistory.map((point) => ({ ...point })),
      rngState: this.rng.state,
      churnRngState: this.churnRng.state,
      social: this.social.serialize(),
      economy: this.economy.serialize(),
    };
  }

  // --- Población -------------------------------------------------------------

  /** 1-3 adultos por hueco de vivienda. Vecinos de la misma casa se conocen. */
  private spawnPopulation(): void {
    for (const b of this.index.ofRole('residential')) {
      this.fillHome(b.ax, b.az, b.id, b.capacity || 1);
    }
  }

  /** Aloja `count` familias en una vivienda (inmigración T4.3 y arranque).
   * `arrival` (ciclo 48): true cuando son INMIGRANTES que llegan durante el juego
   * (no los fundadores del arranque) → emite un beat `familyArrived` para la Crónica. */
  private fillHome(ax: number, az: number, buildingId: string, count: number, arrival = false): void {
    const k = `${ax},${az}`;
    this.households.set(k, (this.households.get(k) ?? 0) + count);
    // Los recién llegados traen algo de comida y unos ahorros en la mudanza.
    this.pantry.set(k, (this.pantry.get(k) ?? 0) + 3 * count);
    this.economy.seedWallet(k, STARTING_MONEY * count, arrival);
    let firstName = '';
    for (let h = 0; h < count; h++) {
      const adults = 1 + Math.floor(this.rng.next() * 2.4); // 1-3
      const family: Citizen[] = [];
      for (let a = 0; a < adults; a++) family.push(this.spawnCitizen(ax, az, buildingId));
      if (!firstName && family.length) firstName = family[0].name;
      for (let i = 0; i < family.length; i++)
        for (let j = i + 1; j < family.length; j++) SocialSystem.acquaint(family[i], family[j], 0.6);
    }
    // Historia de la llegada (ciclo 48): una ciudad atractiva RECIBE gente — el
    // reverso de la emigración digna (ciclo 14). Un solo beat por vivienda poblada.
    if (arrival && firstName) {
      this.events.push({ name: 'familyArrived', data: { count, surname: surnameOf(firstName) } });
    }
  }

  private avgHealth(): number {
    if (this.citizens.size === 0) return 1;
    let sum = 0;
    for (const c of this.citizens.values()) sum += c.health;
    return sum / this.citizens.size;
  }

  private avgFood(): number {
    if (this.citizens.size === 0) return 1;
    let sum = 0;
    for (const c of this.citizens.values()) sum += c.needs.food;
    return sum / this.citizens.size;
  }

  /** Fama media de los hogares (prestigio, ciclo 9). Alimenta la atractividad. */
  private avgPrestige(): number {
    const homes = this.index.ofRole('residential');
    if (homes.length === 0) return 0;
    let sum = 0;
    for (const b of homes) sum += this.economy.prestigeOf(`${b.ax},${b.az}`);
    return sum / homes.length;
  }

  /** Muestrea la situación de cada hogar en un solo cierre diario. Los
   * agregados por hogar evitan que la felicidad sea un atributo individual
   * ruidoso y permiten que la migración observe una presión sostenida. */
  private recalculateHappiness(): void {
    const people = new Map<string, Citizen[]>();
    for (const citizen of this.citizens.values()) {
      const key = `${citizen.home.ax},${citizen.home.az}`;
      const members = people.get(key) ?? [];
      members.push(citizen);
      people.set(key, members);
    }

    const next = new Map<string, number>();
    const homes = [...this.households.keys()].sort();
    const industrial = this.index.ofRole('work');
    for (const key of homes) {
      const [ax, az] = key.split(',').map(Number);
      const home = this.index.at(ax, az);
      const members = people.get(key) ?? [];
      const needs = { energy: 0, food: 0, social: 0, fun: 0, purpose: 0 };
      let illness = 0;
      let grief = 0;
      let children = 0;
      let workingAdults = 0;
      let employed = 0;
      for (const citizen of members) {
        needs.energy += citizen.needs.energy;
        needs.food += citizen.needs.food;
        needs.social += citizen.needs.social;
        needs.fun += citizen.needs.fun;
        needs.purpose += citizen.needs.purpose;
        illness += Math.max(1 - citizen.health, citizen.sick);
        grief += citizen.grief;
        if (citizen.age < ADULT_AGE) children++;
        if (citizen.age >= ADULT_AGE && citizen.age < OLD_AGE) {
          workingAdults++;
          if (citizen.work) employed++;
        }
      }
      const count = Math.max(1, members.length);
      needs.energy /= count;
      needs.food /= count;
      needs.social /= count;
      needs.fun /= count;
      needs.purpose /= count;
      illness /= count;
      grief /= count;
      const unemployment = workingAdults > 0 ? 1 - employed / workingAdults : 0;
      const industryPressure = home && industrial.some((building) =>
        Math.abs(home.cx - building.cx) + Math.abs(home.cz - building.cz) < 6,
      ) ? 1 : 0;
      next.set(key, householdHappiness({
        needs,
        coverage: home?.coverage ?? 0,
        children,
        taxBurden: this.economy.taxBurden(),
        unemployment,
        illness,
        grief,
        industryPressure,
      }));
    }
    this.happiness = next;
  }

  private averageHappiness(): number {
    if (this.happiness.size === 0) return 1;
    let total = 0;
    for (const value of this.happiness.values()) total += value;
    return total / this.happiness.size;
  }

  /** El valor del suelo es un snapshot diario: no cambia en mitad del día por
   * una consulta del HUD y no añade trabajo al movimiento de ciudadanos. */
  private recalculateLandValue(): void {
    this.landValue = computeLandValue(this.index);
  }

  private averageLandValue(): number {
    const homes = this.index.ofRole('residential');
    if (homes.length === 0) return 0;
    let total = 0;
    for (const home of homes) total += this.landValue.get(`${home.ax},${home.az}`) ?? 0;
    return total / homes.length;
  }

  /** Elige una vivienda llena y bien situada para densificarla. La selección
   * es estable por coordenada; el límite diario hace que cada upgrade sea una
   * pequeña historia urbana y no una demolición en cadena. */
  private maybeUpgrade(): void {
    if (!this.autonomousGrowth || this.lastUpgradeDay === this.clock.day) return;
    this.lastUpgradeDay = this.clock.day;
    const candidates = this.index.ofRole('residential')
      .filter((building) => {
        const key = `${building.ax},${building.az}`;
        return (this.landValue.get(key) ?? 0) >= UPGRADE_LAND_VALUE
          && (this.households.get(key) ?? 0) === building.capacity;
      })
      .sort((a, b) => a.ax - b.ax || a.az - b.az);
    for (const building of candidates) {
      const key = `${building.ax},${building.az}`;
      const candidate = upgradeCandidate(this.grid, building, this.tier, this.landValue.get(key) ?? 0);
      if (candidate && this.applyUpgrade(building, candidate)) return;
    }
  }

  /** Sustituye una vivienda sin pasar por el flujo de demolición: las personas
   * siguen teniendo el mismo hogar mientras cambia la huella. Los huecos nuevos
   * se ocupan después de reconstruir el índice, para que nazcan con una puerta
   * válida y entren en la contratación de ese mismo cierre. */
  private applyUpgrade(building: SimBuilding, candidate: GrowthPlacement): boolean {
    const oldKey = `${building.ax},${building.az}`;
    const oldId = building.id;
    const oldFamilies = this.households.get(oldKey) ?? 0;
    const next = catalogData(candidate.id);
    const nextCapacity = Math.max(next?.capacity ?? 1, building.capacity);
    const visualId = residentialVisualId(candidate.id, candidate.cx, candidate.cz, candidate.rot, this.seed);
    if (!next || oldFamilies > nextCapacity) return false;
    if (!this.grid.removeBuilding(building.ax, building.az)) return false;
    if (building.id === 'station') this.refreshTrain();
    if (!this.grid.placeBuilding(candidate.id, next.w, next.d, candidate.cx, candidate.cz, candidate.rot, nextCapacity, visualId)) {
      if (!this.grid.placeBuilding(oldId, building.data.w, building.data.d, building.ax, building.az, building.rot, building.capacity, building.visualId)) {
        throw new Error('no se pudo restaurar una vivienda tras fallar su upgrade');
      }
      return false;
    }
    this.pendingRazed.push({ cx: building.ax, cz: building.az });
    this.pendingBuilt.push({ ...candidate, ...(visualId === candidate.id ? {} : { visualId }) });
    const newKey = `${candidate.cx},${candidate.cz}`;
    this.moveHomeKey(oldKey, newKey, candidate.id);
    this.index.rebuild();
    this.economy.rebuild(this.index, this.citizens);
    const vacancies = Math.max(0, nextCapacity - oldFamilies);
    if (vacancies > 0) this.fillHome(candidate.cx, candidate.cz, candidate.id, vacancies, true);
    this.hireAndAcquaint();
    this.events.push({ name: 'buildingUpgraded', data: {
      from: oldId,
      id: candidate.id,
      fromLabel: building.data.name,
      label: next.name,
      cx: candidate.cx,
      cz: candidate.cz,
      rot: candidate.rot,
    } });
    return true;
  }

  /** Huecos de familia libres en todas las viviendas. */
  private freeHousing(): number {
    let free = 0;
    for (const b of this.index.ofRole('residential')) {
      if (b.abandoned) continue;
      free += b.capacity - (this.households.get(`${b.ax},${b.az}`) ?? 0);
    }
    return free;
  }

  private spawnCitizen(
    ax: number,
    az: number,
    buildingId: string,
    age?: number,
    lineage?: { surname: string; parentName: string; parentId: number; lineId: number },
  ): Citizen {
    const b = this.index.at(ax, az);
    const door: CellXZ = b?.entrance ?? [ax, az];
    // Linaje (ciclo 42): un hijo hereda el APELLIDO de un progenitor. Se genera
    // igualmente el nombre completo (mismo nº de tiradas de RNG → determinismo y
    // crecimiento intactos) y solo se SUSTITUYE el apellido por el heredado.
    const generated = citizenName(this.rng);
    const name = lineage ? `${generated.split(' ')[0]} ${lineage.surname}` : generated;
    const c: Citizen = {
      id: this.nextId++,
      name,
      parent: lineage?.parentName,
      parentId: lineage?.parentId,
      lineId: lineage?.lineId,
      age: age ?? Math.floor(this.rng.range(18, 72)),
      personality: {
        sociable: this.rng.next(),
        trabajador: this.rng.next(),
        hogareño: this.rng.next(),
      },
      needs: {
        // Arrancan variados para desincronizar el primer día.
        energy: this.rng.range(0.55, 0.95),
        food: this.rng.range(0.5, 0.9),
        social: this.rng.range(0.4, 0.9),
        fun: this.rng.range(0.4, 0.9),
        purpose: this.rng.range(0.3, 0.8),
      },
      home: { ax, az, buildingId },
      work: null,
      partnerId: null,
      // Los adultos fundadores llegan con estudios variados; los niños, de cero.
      education: age === undefined ? this.rng.range(0.2, 0.9) : 0,
      health: this.rng.range(0.75, 1),
      grief: 0,
      sick: 0,
      immune: 0,
      childrenRaised: 0,
      x: door[0] + 0.5,
      z: door[1] + 0.5,
      heading: this.rng.range(0, Math.PI * 2),
      phase: { kind: 'deciding' },
      activity: 'none',
      friends: new Map(),
      lastChatTick: -9999,
      inside: true, // empiezan en casa
    };
    this.citizens.set(c.id, c);
    // Solo un NACIMIENTO real (age 0) se narra como tal (ciclo 48): los fundadores
    // y los inmigrantes (edad dada) NO "nacen" — llegan de fuera. Antes todos
    // emitían citizenBorn, así que un inmigrante salía en la Crónica como "nace X"
    // y falseaba el contador de nacimientos. La llegada la narra `familyArrived`.
    if (age === 0) this.events.push({ name: 'citizenBorn', data: { id: c.id, name: c.name, parent: c.parent } });
    return c;
  }

  /** Rotación vocacional (ciclo 41): un adulto que trabaja LEJOS de su vocación
   * puede, de tanto en tanto, DEJAR su puesto para buscar el suyo — pero solo si
   * existe una vacante que sí lo colma a su alcance (si no, quedarse es lo cuerdo:
   * nada de paro estéril). Marca a los que renuncian como buscadores para que la
   * reasignación (hireAndAcquaint) los lleve a su llamada y la Crónica lo narre.
   * Usa un RNG APARTE → no perturba el flujo general. Determinista. */
  private vocationalChurn(): void {
    this.churnSeekers.clear();
    if (!this.vocationalMobility) return;
    const quitters: Citizen[] = [];
    for (const c of this.citizens.values()) {
      if (!c.work || c.age < ADULT_AGE || c.age >= OLD_AGE) continue;
      if (jobFitsVocation(c.personality, catalogData(c.work.buildingId)?.role)) continue; // ya en lo suyo
      if (!this.economy.hasVocationVacancy(c)) continue; // sin destino: no renuncia
      if (this.churnRng.next() < VOCATION_QUIT_CHANCE) quitters.push(c);
    }
    // Determinista: renuncia por orden de id (el orden del Map ya es de inserción,
    // pero fijamos por si acaso — libera sillas antes de reasignar).
    quitters.sort((a, b) => a.id - b.id);
    for (const c of quitters) {
      this.economy.vacate(c);
      this.churnSeekers.add(c.id);
    }
  }

  /** Dinastías (ciclo 43): cuenta los descendientes VIVOS de cada tronco y, la
   * primera vez que una línea cruza el umbral, la Crónica la reconoce como una
   * familia afianzada. Descendencia REAL (por `lineId`), no coincidencia de
   * apellido — sobrevive a la muerte de los ancestros. Sin RNG; O(n)/día. */
  private checkDynasties(): void {
    const alive = new Map<number, number>();
    const surname = new Map<number, string>();
    for (const c of this.citizens.values()) {
      if (c.lineId === undefined) continue;
      alive.set(c.lineId, (alive.get(c.lineId) ?? 0) + 1);
      if (!surname.has(c.lineId)) surname.set(c.lineId, surnameOf(c.name));
    }
    for (const [line, count] of alive) {
      if (count < DYNASTY_THRESHOLD || this.dynastiesSeen.has(line)) continue;
      this.dynastiesSeen.add(line);
      const founder = this.citizens.get(line); // vivo aún? (puede haber muerto)
      const fam = surname.get(line) ?? '';
      this.dynastyNames.set(line, fam);
      this.events.push({
        name: 'dynastyRose',
        data: { line, surname: fam, members: count, founder: founder?.name },
      });
    }
    // Extinción (ciclo 44): una dinastía reconocida cuya SANGRE se apaga del todo
    // — ni un descendiente vivo (alive) ni el tronco (el fundador) — cierra su arco.
    // Requerir también al fundador muerto evita el falso positivo de que aún podría
    // tener más hijos y revivir la línea. Se narra una sola vez.
    for (const line of this.dynastiesSeen) {
      if (this.dynastiesFallen.has(line)) continue;
      if (alive.has(line) || this.citizens.has(line)) continue; // aún hay sangre
      this.dynastiesFallen.add(line);
      this.events.push({ name: 'dynastyFell', data: { line, surname: this.dynastyNames.get(line) } });
    }
  }

  /** Tras reasignar, narra a los buscadores (ciclo 41) que aterrizaron en un
   * empleo que COLMA su vocación: la historia que el churn genera. */
  private reportVocationFound(): void {
    for (const id of this.churnSeekers) {
      const c = this.citizens.get(id);
      if (c?.work && jobFitsVocation(c.personality, catalogData(c.work.buildingId)?.role)) {
        this.events.push({ name: 'vocationFound', data: { id, name: c.name, vocation: vocationOf(c.personality) } });
      }
    }
  }

  /** Contrata parados y presenta a vecinos cercanos y compañeros de trabajo.
   * `seekers` (ciclo 41): parados que buscan su vocación — se colocan con
   * preferencia por los empleos que la colman. */
  private hireAndAcquaint(seekers?: ReadonlySet<number>): void {
    const hires = this.economy.assignJobs(this.citizens, seekers);
    for (const h of hires) this.events.push({ name: 'jobTaken', data: h as unknown as Record<string, unknown> });
    // Compañeros de trabajo se conocen.
    for (const w of this.economy.workplaces) {
      for (let i = 0; i < w.workers.length; i++)
        for (let j = i + 1; j < w.workers.length; j++) {
          const a = this.citizens.get(w.workers[i]);
          const b = this.citizens.get(w.workers[j]);
          if (a && b) SocialSystem.acquaint(a, b, 0.3);
        }
    }
    // Vecinos a < 12 celdas se conocen de vista.
    const all = [...this.citizens.values()];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (manhattan([a.home.ax, a.home.az], [b.home.ax, b.home.az]) < 40) SocialSystem.acquaint(a, b);
      }
  }

  // --- Tick -------------------------------------------------------------------

  /** Tiempo de HOY — puro por (seed, día), no consume el RNG general. */
  get weather(): Weather {
    return weatherAt(this.seed, this.clock.day);
  }

  private context(): SimContext {
    return {
      index: this.index,
      rng: this.rng,
      darkness: this.clock.darkness,
      hour: this.clock.hour,
      day: this.clock.day,
      citizens: this.citizens,
      visitCounters: this.economy.visitsToday,
      pantry: this.pantry,
      wallets: this.economy.wallets,
      weather: this.weather,
      quarantine: this.quarantine,
      epidemic: this.inEpidemic,
    };
  }

  /** Un sub-tick de TICK_GAME_S segundos de juego. */
  step(): void {
    this.clock.advance();
    const hours = TICK_GAME_S / 3600;
    decayTraffic(this.traffic, hours);
    stepBuses(this.busLines, this.buses, (x, z) => this.speedAt(x, z, 'bus'));
    if (this.train) stepTrain(this.train);
    const ctx = this.context();

    this.paths.process();

    // Charlas en curso (antes que el autómata: ocupan a sus participantes).
    this.social.advance(this.citizens, this.clock.tick);

    const walkers: Citizen[] = [];

    for (const c of this.citizens.values()) {
      decayNeeds(c.needs, c.personality, hours);
      healthTick(c, hours); // lógica de salud: fondo, no una actividad
      griefTick(c, hours); // lógica de duelo (ciclo 16): apaga la alegría del doliente
      sickenTick(c, hours); // contagio (ciclo 25): la enfermedad aguda mella y se pasa
      // Jubilación (ciclo 12): un jubilado no tiene 'work' que le reponga el
      // propósito, así que se lo damos aquí, PROPORCIONAL al déficit — le da un
      // atractor por persona en un continuo suave (ver RETIREMENT_PURPOSE_RECOVERY).
      if (c.age >= RETIREMENT_AGE && !c.work) {
        restore(c.needs, 'purpose', RETIREMENT_PURPOSE_RECOVERY * (1 - c.needs.purpose) * hours);
      }
      // Estatus (ciclo 9): una vivienda mejorada es más agradable — quien
      // está EN CASA (durmiendo, comiendo) recupera algo más de ánimo.
      if (c.inside && (c.activity === 'sleep' || c.activity === 'eat' || c.activity === 'none')) {
        const prestige = this.economy.prestigeOf(`${c.home.ax},${c.home.az}`);
        if (prestige > 0) restore(c.needs, 'fun', prestige * COMFORT_FUN_PER_HOUR * hours);
      }
      if (this.social.isChatting(c.id)) {
        c.activity = 'chat';
        // El consuelo de la charla lo aplica social.advance() escalado por
        // intimidad y duelo compartido (ciclo 19), que conoce al interlocutor.
        continue; // parado charlando; social.ts le restaura
      }
      this.stepCitizen(c, ctx);
      // Candidatos a saludo: cualquiera al aire libre (andando o parado).
      if (!c.inside && ((c.phase.kind === 'moving' && c.phase.mode !== 'bus')
        || (c.phase.kind === 'doing' && !c.phase.busWait))) walkers.push(c);
    }

    // Encuentros emergentes entre caminantes.
    const started = this.social.detectEncounters(walkers, this.clock.tick, this.quarantine);
    for (const chat of started) {
      const a = this.citizens.get(chat.a)!;
      const b = this.citizens.get(chat.b)!;
      // Se paran, cara a cara; el plan que llevaban se descarta (re-decidirán).
      for (const [self, other] of [[a, b], [b, a]] as const) {
        self.phase = { kind: 'deciding' };
        self.activity = 'chat';
        self.heading = Math.atan2(other.x - self.x, other.z - self.z);
      }
      this.events.push({ name: 'chatStarted', data: { a: a.id, b: b.id } });
    }

    // Los que llegaron a la salida este tick se marchan de verdad (ciclo 14).
    if (this.departed.length > 0) this.processDepartures();

    // Crecimiento autónomo: un intento por hora de juego, solo de día
    // (los edificios "brotan" con luz — cosmética barata y determinista).
    if (this.autonomousGrowth && this.clock.tick % 100 === 0 && this.clock.darkness < 0.5) {
      this.maybeGrow();
    }

    // Cierre del día: vida (1 día = 1 año), economía, contratos, tiers.
    if (this.clock.day !== this.lastDay) {
      this.budgetHistory.push({ day: this.lastDay, treasury: this.economy.treasury });
      if (this.budgetHistory.length > 30) this.budgetHistory.shift();
      this.economy.rollBudgetDay();
      this.lastDay = this.clock.day;
      this.stepLife();
      this.economy.endOfDay();
      this.chargeUpkeep(); // H3.1: mantenimiento antes de alquileres y pensiones
      this.economy.serviceLoans(); // H3.3: la deuda se amortiza tras el patrimonio corriente
      this.economy.updateBankruptcy(this.citizens.size);
      this.chargeRent(); // ciclo 29: la vivienda cuesta (antes de pensiones: la red cubre a quien no llega)
      this.chargeLifestyle(); // ciclo 32: el coste de la vida escala con la riqueza (drena el ahorro excedente)
      this.payPensions();
      this.vaccinate(); // ciclo 33: salud pública preventiva (antes del dividendo: la salud primero)
      this.economy.payPublicDividend([...this.households.keys()], this.citizens.size); // ciclo 32: el tesoro no atesora sin fin — reparte su superávit
      this.economy.updateBankruptcy(this.citizens.size);
      this.stepOutbreak(); // ciclo 25: en invierno, algún resfriado prende y se propaga
      this.stepEmigration(); // ciclo 14: tras la red de pensiones (última bala)
      this.stepAbandonment(); // H2.6: una vía cortada cierra tras diez días, no de golpe
      this.recalculateLandValue(); // H4.4: snapshot de ubicación, solo al cerrar el día
      this.maybeUpgrade(); // H4.5: una densificación autónoma como máximo por día
      this.recalculateHappiness(); // H4.3: una muestra estable, solo al cerrar el día
      // Estatus (ciclo 9): cada hogar que mejora emite su evento para que el
      // render decore ESA vivienda (jardín) sin re-sincronizar todo (render rico).
      for (const u of this.economy.investInHomes(this.households.keys())) {
        const [ax, az] = u.key.split(',').map(Number);
        this.events.push({ name: 'homePrestige', data: { ax, az, prestige: u.prestige } });
      }
      // Faena agrícola agregada (T3.8): el render pinta surcos sobre el barbecho.
      this.events.push({ name: 'cultivationChanged', data: { level: this.economy.cultivation } });
      this.vocationalChurn(); // ciclo 41: quien es infeliz en su oficio busca su vocación
      this.hireAndAcquaint(this.churnSeekers);
      this.reportVocationFound(); // narra a quien, tras dejar su puesto, encontró su llamada
      if (isFestivalDay(this.clock.day)) {
        // Cosecha abundante (ciclo 24): la fiesta de otoño se celebra distinta si
        // el granero rebosa — acopla festival↔alimento↔estación, sin guion.
        let festName = seasonalFestivalName(this.clock.day);
        if (festName === 'fiesta de la cosecha' && this.economy.granary > BOUNTIFUL_GRANARY) festName += ' abundante';
        this.events.push({ name: 'festivalDay', data: { day: this.clock.day, name: festName } });
      }
      this.checkDynasties(); // ciclo 43: ¿alguna estirpe se ha afianzado?
      const pop = this.citizens.size;
      // Mayoría de edad del asentamiento (ciclo 47): al cruzar un umbral de tamaño,
      // el lugar ASCIENDE de categoría (aldea→pueblo→villa→ciudad) — su identidad,
      // distinta del tier. Se narra cada escalón cruzado (puede subir dos de golpe).
      const lvl = settlementLevel(pop);
      while (this.settlementLevelSeen < lvl) {
        this.settlementLevelSeen++;
        this.events.push({ name: 'settlementRose', data: { class: SETTLEMENT_CLASSES[this.settlementLevelSeen], population: pop } });
      }
      const unlocked = tierForPopulation(pop);
      if (unlocked > this.tier) {
        this.tier = unlocked;
        this.events.push({ name: 'tierUnlocked', data: { tier: unlocked, population: pop } });
      }
    }
  }

  // --- Lógica de gobierno (impuestos ya en economy.payWage; pensiones aquí) ---

  /** Hogares sin ningún adulto empleado y con bolsillo bajo: red de
   * protección mínima (ciclo 3 de RESEARCH.md). Sostiene a jubilados y
   * parados de larga duración para que no emigren por pura miseria. */
  private payPensions(): void {
    const employedHomes = new Set<string>();
    for (const c of this.citizens.values()) if (c.work) employedHomes.add(`${c.home.ax},${c.home.az}`);
    const needy: string[] = [];
    for (const k of this.households.keys()) {
      if (employedHomes.has(k)) continue;
      if (this.economy.walletOf(k) < PENSION_PER_DAY * 2) needy.push(k);
    }
    needy.sort(); // determinista
    this.economy.payPensions(needy);
  }

  // --- Lógica de vida (lifecycle.ts) -------------------------------------------

  /** Un año por día de juego: envejecer, emparejar, nacer, morir. */
  private stepLife(): void {
    // Natalidad denso-dependiente (ciclo 30): cerca del techo se tienen menos
    // hijos — el freno vegetativo que, junto al corte de inmigración, aplana el
    // crecimiento en meseta estable en vez de una exponencial caótica.
    const life = lifeYear(this.citizens, this.rng, fertilityFactor(this.citizens.size));
    for (const d of life.deaths) {
      const partner = d.partnerId !== null ? this.citizens.get(d.partnerId) : undefined;
      if (partner) partner.partnerId = null;
      this.mournFor(d); // duelo (ciclo 16): la pareja y los amigos íntimos penan
      this.citizens.delete(d.id);
      this.leaving.delete(d.id);
      const k = `${d.home.ax},${d.home.az}`;
      // Ojo: la familia sigue en la casa; solo liberamos el hueco si era el último.
      if (![...this.citizens.values()].some((c) => c.home.ax === d.home.ax && c.home.az === d.home.az)) {
        this.households.set(k, Math.max(0, (this.households.get(k) ?? 1) - 1));
      }
      this.events.push({ name: 'citizenLeft', data: { id: d.id, name: d.name, age: d.age, health: d.health, reason: 'death', partnerName: partner?.name, childrenRaised: d.childrenRaised } });
    }
    for (const [a, b] of life.couples) {
      this.events.push({ name: 'coupleFormed', data: { a: a.name, b: b.name } });
    }
    for (const b of life.births) {
      // Linaje (ciclo 42): el hijo hereda el apellido de un progenitor → los
      // apellidos se perpetúan y el pueblo cría DINASTÍAS visibles en la Crónica.
      const surname = surnameOf(b.parents[0].name);
      const child = this.spawnCitizen(b.home.ax, b.home.az, b.home.buildingId, 0, {
        surname,
        parentName: b.parents[0].name,
        parentId: b.parents[0].id,
        // El tronco de la estirpe (ciclo 43): el fundador de la línea. Se propaga
        // hacia abajo → sobrevive a la muerte de los ancestros.
        lineId: b.parents[0].lineId ?? b.parents[0].id,
      });
      SocialSystem.acquaint(child, b.parents[0], 0.8);
      SocialSystem.acquaint(child, b.parents[1], 0.8);
      b.parents[0].childrenRaised++; // ciclo 34: cada vida deja rastro (legado)
      b.parents[1].childrenRaised++;
    }
    // Jubilación (ciclo 12): lifeYear ya liberó su `work`; aquí solo se narra.
    for (const r of life.retirements) {
      this.events.push({ name: 'citizenRetired', data: { id: r.id, name: r.name } });
    }
    // Muertes y jubilaciones liberan puestos → recontratar (reconstruye el índice).
    if (life.deaths.length > 0 || life.retirements.length > 0) this.economy.rebuild(this.index, this.citizens);
  }

  // --- Emigración digna (ciclo 14 — cierra T4.3, RESEARCH.md §6.2) --------------

  /** Cierre de año: acumula la penuria de cada hogar; si alguno lleva años sin
   * salida (y tras la red de pensiones), UNA familia decide marcharse (despacio,
   * como el crecimiento). No se despawnea: se marca para caminar a la salida. */
  private stepEmigration(): void {
    interface Agg { workingAdults: number; employed: number; anyLeaving: boolean }
    const byHome = new Map<string, Agg>();
    for (const c of this.citizens.values()) {
      const k = `${c.home.ax},${c.home.az}`;
      let h = byHome.get(k);
      if (!h) { h = { workingAdults: 0, employed: 0, anyLeaving: false }; byHome.set(k, h); }
      if (c.age >= ADULT_AGE && c.age < OLD_AGE) { h.workingAdults++; if (c.work) h.employed++; }
      if (this.leaving.has(c.id)) h.anyLeaving = true;
    }

    let worstKey: string | null = null;
    let worstPressure = -1;
    for (const [k, h] of byHome) {
      const hardship = householdHardship({ workingAdults: h.workingAdults, employed: h.employed, wallet: this.economy.walletOf(k) });
      const unhappy = (this.happiness.get(k) ?? 1) < 0.25;
      const p = updateEmigrationPressure(this.emigrationPressure.get(k) ?? 0, hardship || unhappy);
      this.emigrationPressure.set(k, p);
      // Un pueblo diminuto no se despuebla; y no re-elige a quien ya se marcha.
      if (this.citizens.size <= EMIGRATE_POP_FLOOR || h.anyLeaving) continue;
      if (p >= EMIGRATE_PRESSURE_LIMIT && p > worstPressure) { worstPressure = p; worstKey = k; }
    }

    if (!worstKey) return;
    // Toda la familia hace las maletas: caminarán a la salida y se marcharán.
    for (const c of this.citizens.values()) {
      if (`${c.home.ax},${c.home.az}` !== worstKey) continue;
      this.leaving.add(c.id);
      c.phase = { kind: 'deciding' };
    }
    this.emigrationPressure.delete(worstKey);
  }

  /** Vigila el anillo vial de cada edificio. La presión empieza cuando se
   * observa la pérdida, exige diez cierres diarios consecutivos y desaparece
   * en cuanto vuelve una carretera o sendero. Solo un edificio por ciclo puede
   * cerrarse para que el cambio sea legible y no vacíe el pueblo de golpe. */
  private stepAbandonment(): void {
    const present = new Set<string>();
    const toAbandon: Array<[number, number]> = [];
    const toRestore: Array<[number, number]> = [];
    for (const b of this.index.buildings) {
      const key = `${b.ax},${b.az}`;
      present.add(key);
      if (b.abandoned) {
        if (b.roadAccess) toRestore.push([b.ax, b.az]);
        continue;
      }
      if (b.roadAccess) {
        this.roadAccessSeen.add(key);
        this.noAccessSince.delete(key);
        continue;
      }
      // Un edificio ya desconectado al cargar una semilla no se convierte en
      // una expulsión retroactiva. El abandono vigila pérdidas de acceso reales.
      if (!this.roadAccessSeen.has(key)) continue;
      const since = this.noAccessSince.get(key);
      if (since === undefined) this.noAccessSince.set(key, this.clock.day);
      else if (this.clock.day - since >= ABANDON_DAYS) toAbandon.push([b.ax, b.az]);
    }
    for (const key of this.noAccessSince.keys()) if (!present.has(key)) this.noAccessSince.delete(key);
    for (const [ax, az] of toRestore) this.restoreBuilding(ax, az);
    if (toAbandon.length > 0) this.abandonBuilding(toAbandon[0][0], toAbandon[0][1]);
  }

  private restoreBuilding(ax: number, az: number): boolean {
    const building = this.index.at(ax, az);
    if (!building?.abandoned || !building.roadAccess) return false;
    if (!this.grid.setBuildingAbandoned(ax, az, false)) return false;
    this.noAccessSince.delete(`${ax},${az}`);
    this.index.rebuild();
    this.economy.rebuild(this.index, this.citizens);
    return true;
  }

  /** Cierra sin demoler: la huella permanece ocupada y la familia se realoja
   * con la misma rutina digna que una demolición. Los puestos se liberan para
   * que el índice económico deje de ofrecer un edificio inaccesible. */
  private abandonBuilding(ax: number, az: number): boolean {
    const building = this.index.at(ax, az);
    if (!building || building.abandoned || building.roadAccess) return false;
    const oldKey = `${building.ax},${building.az}`;
    const oldEntrance = building.entrance ?? [building.ax, building.az] as CellXZ;
    const residents = [...this.citizens.values()]
      .filter((c) => c.home.ax === building.ax && c.home.az === building.az)
      .sort((a, b) => a.id - b.id)
      .map((c) => c.id);
    this.rehouseOrEmigrate(residents, oldKey, oldEntrance);
    for (const c of this.citizens.values()) {
      if (c.work?.ax === building.ax && c.work.az === building.az) c.work = null;
    }
    if (!this.grid.setBuildingAbandoned(building.ax, building.az, true)) return false;
    this.noAccessSince.delete(oldKey);
    this.index.rebuild();
    this.economy.rebuild(this.index, this.citizens);
    this.events.push({ name: 'buildingAbandoned', data: { id: building.id, label: building.data.name, ax: building.ax, az: building.az } });
    return true;
  }

  /** Despawn DIGNO de quienes llegaron a la salida: se marchan a otra ciudad,
   * narrado en la Crónica (nunca en silencio — RESEARCH.md §6.2). */
  private processDepartures(): void {
    for (const c of this.departed) {
      if (!this.citizens.has(c.id)) continue;
      const partner = c.partnerId !== null ? this.citizens.get(c.partnerId) : undefined;
      if (partner) partner.partnerId = null;
      this.mournFor(c); // el pueblo pena por quien se marcha (ciclo 16)
      this.citizens.delete(c.id);
      this.leaving.delete(c.id);
      const k = `${c.home.ax},${c.home.az}`;
      if (![...this.citizens.values()].some((o) => o.home.ax === c.home.ax && o.home.az === c.home.az)) {
        const remaining = Math.max(0, (this.households.get(k) ?? 1) - 1);
        if (remaining === 0) {
          this.households.delete(k);
          this.pantry.delete(k);
          this.economy.removeWalletExternal(k);
          this.economy.prestige.delete(k);
        } else {
          this.households.set(k, remaining);
        }
      }
      this.emigrations++;
      this.events.push({ name: 'citizenLeft', data: { id: c.id, name: c.name, age: c.age, reason: 'emigrated' } });
    }
    this.departed = [];
    this.economy.rebuild(this.index, this.citizens);
  }

  /** true mientras una oleada supera el umbral epidémico (para narrar una sola vez). */
  private inEpidemic = false;

  /** Alquiler (ciclo 29): cada hogar ocupado paga por su vivienda al cierre del
   * día, según cuántas familias alberga y el tier de la casa (mejor casa, más
   * cara). Paga lo que puede (sin desahucio: la pensión cubre a quien no llega).
   * El alquiler entra en el tesoro → circula (financia pensiones). */
  private chargeRent(): void {
    if (!this.rentEnabled) return;
    for (const b of this.index.ofRole('residential')) {
      const k = `${b.ax},${b.az}`;
      const families = this.households.get(k) ?? 0;
      if (families <= 0) continue;
      const land = this.landValue.get(k) ?? 0;
      const rent = RENT_PER_DAY * families * (1 + RENT_TIER_FACTOR * (b.data.tier ?? 0)) * (1 + 0.5 * land);
      this.economy.collectRent(this.economy.spend(k, rent));
    }
  }

  /** Mantenimiento diario del patrimonio público: una vía cuenta por celda y
   * cada edificio activo por su ficha de catálogo. El índice ya contiene las
   * celdas de carretera y sendero; aquí solo recuperamos su categoría. */
  private chargeUpkeep(): void {
    const roadKinds = this.index.roadCells.map(([cx, cz]) => {
      const cell = this.grid.get(cx, cz);
      return cell?.terrain === 'path' ? 'path' : cell?.roadKind ?? 'rural';
    });
    this.economy.chargeUpkeep(this.index, roadKinds);
  }

  /** Coste de la vida (ciclo 32): cada hogar gasta en vivir una fracción de su
   * ahorro excedente — el sumidero que faltaba para que el ahorro no trepe sin
   * fin (la nómina acuña dinero). Escala con la riqueza (lifestyle inflation). */
  private chargeLifestyle(): void {
    for (const k of this.households.keys()) this.economy.spendLifestyle(k);
  }

  /** Vacunación (ciclo 33): salud pública PREVENTIVA. En la temporada de brotes
   * (otoño-invierno) el sistema sanitario ofrece la vacuna a los SUSCEPTIBLES
   * (ni enfermos ni ya inmunes), que confiere inmunidad SIN pasar la enfermedad.
   * Cuando una fracción alta queda inmune emerge la INMUNIDAD DE REBAÑO: el
   * contagio (social.ts salta a los inmunes) no encuentra a quién saltar y la
   * oleada se apaga sola. Requiere clínica (infraestructura) y la paga el tesoro
   * (acopla contagio↔gobierno↔salud): un pueblo en quiebra no la puede costear.
   * Determinista (orden de inserción del Map). */
  private vaccinate(): void {
    if (!this.vaccination) return;
    const season = this.weather.season;
    if (season !== 'otoño' && season !== 'invierno') return; // campaña de temporada
    if (!this.index.buildings.some((b) => b.id === 'clinic')) return; // hace falta clínica
    let doses = Math.ceil(this.citizens.size * VACCINE_DAILY_FRACTION);
    for (const c of this.citizens.values()) {
      if (doses <= 0) break;
      if (c.sick > 0 || c.immune > 0) continue; // solo susceptibles
      if (this.economy.treasury < VACCINE_COST_PER_DOSE) break; // sin fondos, se para la campaña
      if (!this.economy.spendPublicExternal(VACCINE_COST_PER_DOSE)) break;
      c.immune = VACCINE_IMMUNITY;
      this.vaccinationsGiven++;
      doses--;
    }
  }

  /** Contagio (ciclo 25): en el frío del invierno, con cierta probabilidad
   * prende un resfriado en alguien sano (caso índice). A partir de ahí se
   * propaga solo en los encuentros (social.ts). Además, VIGILA la oleada: si más
   * de ~1/4 de la ciudad enferma, la Crónica narra la epidemia (una vez). */
  private stepOutbreak(): void {
    const pop = this.citizens.size;
    if (pop >= 6) {
      // Vigilancia de la oleada (para la Crónica).
      let sick = 0;
      for (const c of this.citizens.values()) if (c.sick > 0.1) sick++;
      const frac = sick / pop;
      // Umbral bajo a propósito (12%): con la cuarentena (ciclo 26) las oleadas
      // se aplanan, y un 12% de la ciudad enferma ya es una epidemia que contar.
      if (!this.inEpidemic && frac > 0.12) {
        this.inEpidemic = true;
        this.events.push({ name: 'epidemic', data: { sick, population: pop } });
      } else if (this.inEpidemic && frac < 0.05) {
        this.inEpidemic = false;
      }
      // Caso índice espontáneo en invierno.
      if (this.weather.season === 'invierno' && this.rng.next() < 0.12) {
        const arr = [...this.citizens.values()];
        const c = arr[Math.floor(this.rng.next() * arr.length)];
        if (c && c.sick <= 0 && c.immune <= 0) c.sick = SICK_ONSET;
      }
    }
  }

  /** Duelo (ciclo 16): cuando alguien se va (muere o emigra), su pareja sufre el
   * mayor golpe y sus amigos ÍNTIMOS (afinidad alta) también penan, menos. */
  private mournFor(gone: Citizen): void {
    if (gone.partnerId !== null) {
      const partner = this.citizens.get(gone.partnerId);
      if (partner) bereave(partner, GRIEF_PARTNER);
    }
    for (const [id, aff] of gone.friends) {
      if (id === gone.partnerId || aff < GRIEF_FRIEND_AFFINITY) continue;
      const f = this.citizens.get(id);
      if (f) bereave(f, GRIEF_FRIEND);
    }
  }

  // --- Crecimiento autónomo (T4.1-T4.3) ---------------------------------------

  /** Devuelve el distrito administrativo de una parcela, si está pintado. */
  districtAt(cx: number, cz: number): number | undefined {
    return this.grid.get(cx, cz)?.district;
  }

  /** Siempre devuelve un objeto completo para que las reglas no tengan que
   * distinguir entre un distrito nuevo y uno sin política. */
  policyForDistrict(district: number | undefined): DistrictPolicyState {
    const policy = district === undefined ? undefined : this.districtPolicies.get(district);
    return { ...emptyDistrictPolicy(), ...(policy ?? {}) };
  }

  /** Actualiza una política y elimina entradas neutras para mantener el save
   * pequeño. La acción ya valida la entrada; este método también es defensivo
   * porque los tests y futuras herramientas pueden llamarlo directamente. */
  setDistrictPolicy(district: number, policy: DistrictPolicy, value: boolean | number): boolean {
    if (!Number.isInteger(district) || district < 0 || district > 99) return false;
    const next = this.policyForDistrict(district);
    if (policy === 'taxDelta') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      next.taxDelta = Math.max(-0.2, Math.min(0.2, value));
    } else {
      if (typeof value !== 'boolean') return false;
      next[policy] = value;
    }
    if (hasDistrictPolicy(next)) this.districtPolicies.set(district, next);
    else this.districtPolicies.delete(district);
    return true;
  }

  /** Delta fiscal del barrio donde vive el hogar. Se aplica a la nómina del
   * residente y evita inventar un segundo sistema tributario paralelo. */
  districtTaxDelta(cx: number, cz: number): number {
    return this.policyForDistrict(this.districtAt(cx, cz)).taxDelta;
  }

  private growthAllowed(itemId: string, cx: number, cz: number): boolean {
    const item = catalogData(itemId);
    if (!item) return false;
    const policy = this.policyForDistrict(this.districtAt(cx, cz));
    // noIndustry bloquea solo los edificios de trabajo (oficinas/fábricas), no
    // tiendas ni agricultura: el barrio conserva vida económica sin industria.
    return item.role !== 'work' || !policy.noIndustry;
  }

  private maybeGrow(): void {
    const stats = this.economy.stats(this.citizens);
    const shops = this.economy.workplaces.filter((w) => w.building.data.role === 'commerce');
    const coverage = coverageRates(this.index);
    let avgProsperity = 0;
    for (const s of shops) avgProsperity += this.economy.prosperity.get(`${s.building.ax},${s.building.az}`) ?? 0.5;
    avgProsperity = shops.length > 0 ? avgProsperity / shops.length : 0;

    const demand = computeDemand({
      // Para el mercado laboral cuentan los adultos (los niños no son "paro").
      population: stats.adults,
      employed: stats.employed,
      jobs: stats.jobs,
      freeHousing: this.freeHousing(),
      shops: shops.length,
      avgProsperity,
      tier: this.tier,
      children: [...this.citizens.values()].filter((c) => c.age >= 6 && c.age < 18).length,
      studentSlots: this.index.buildings.reduce((n, b) => n + (b.data.students ?? 0), 0),
      avgHealth: this.avgHealth(),
      hasClinic: this.index.buildings.some((b) => b.id === 'clinic' && !b.abandoned),
      totalPopulation: this.citizens.size,
      carryingCapacity: CARRYING_CAPACITY,
      policeCoverage: coverage.police,
      fireCoverage: coverage.fire,
      parkCoverage: coverage.park,
      avgHappiness: this.averageHappiness(),
    });
    if (!demand) return;

    const id = itemForDemand(demand, this.tier);
    const it = catalogData(id);
    if (!it) return;
    const publicService = demand === 'school' || demand === 'clinic' || demand === 'police' || demand === 'fire' || demand === 'park';
    const cost = publicService ? it.cost ?? 0 : 0;
    if (publicService && this.publicAutobuild === 'off') {
      this.reportServiceNeeded(id, it.name, cost, 'disabled');
      return;
    }
    if (publicService && cost > this.economy.treasury) {
      this.reportServiceNeeded(id, it.name, cost, 'noMoney');
      return;
    }
    const center = growthCenter(this.grid,
      this.index.buildings.filter((b) => isUrban(b.data.role)).map((b) => [b.ax, b.az]),
    );
    const p = findParcel(this.grid, id, center, this.rng, this.growthPolicy, {
      searchRadius: 60,
      allow: (cx, cz) => this.growthAllowed(id, cx, cz),
      scoreAdjustment: (cx, cz) => demand === 'park' && this.policyForDistrict(this.districtAt(cx, cz)).parksPriority ? -12 : 0,
    });
    if (!p) {
      // T4.4: hay demanda pero NO queda frente construible junto a una vía →
      // la ciudad se traza una CALLE nueva hacia campo abierto. El siguiente
      // intento de crecer ya encontrará parcela en ella.
      if (this.growthPolicy !== 'zonesOnly') this.maybeExtendRoad(center);
      return;
    }
    const visualId = demand === 'residential' ? residentialVisualId(id, p.cx, p.cz, p.rot, this.seed) : undefined;
    if (!this.applyGrowth(p, demand === 'residential' ? it.capacity ?? 1 : undefined, visualId)) return;
    if (publicService) {
      if (cost > 0 && !this.economy.spendPublic(cost, 'build')) throw new Error('tesoro incoherente al cobrar un servicio autónomo');
      this.serviceNeedsReported.delete(id);
    }
  }

  /** Emite una sola señal por tipo de servicio hasta que la necesidad se resuelva. */
  private reportServiceNeeded(id: string, label: string, cost: number, reason: 'disabled' | 'noMoney'): void {
    if (this.serviceNeedsReported.has(id)) return;
    this.serviceNeedsReported.add(id);
    this.events.push({
      name: 'serviceNeeded',
      data: { kind: id, id, label, cost, reason, treasury: this.economy.treasury },
    });
  }

  private isRoad(cx: number, cz: number): boolean {
    return this.grid.get(cx, cz)?.terrain === 'road';
  }

  /** Celdas de carretera consecutivas desde (cx,cz) en una dirección (hasta 10). */
  private roadRun(cx: number, cz: number, dx: number, dz: number): number {
    let n = 0;
    for (let s = 1; s <= 10; s++) { if (this.isRoad(cx + dx * s, cz + dz * s)) n++; else break; }
    return n;
  }

  /** ¿Hay hueco abierto para ramificar? La franja perpendicular (calzada ±2)
   * debe estar libre de vías y edificios por `depth` celdas — así la calle nueva
   * no se solapa con el pueblo ni nace pegada a otra calle paralela. */
  private branchIsClear(rx: number, rz: number, dir: { dx: number; dz: number }, depth: number, halfWidth = 2): boolean {
    const px = -dir.dz, pz = dir.dx;
    for (let step = 1; step <= depth; step++) {
      for (let w = -halfWidth; w <= halfWidth; w++) {
        const c = this.grid.get(rx + dir.dx * step + px * w, rz + dir.dz * step + pz * w);
        if (c?.building || c?.terrain === 'road' || c?.terrain === 'water') return false;
      }
    }
    return true;
  }

  /** T4.4 — traza una calle nueva PERPENDICULAR a la vía existente hacia campo
   * abierto, empezando por la celda de vía más cercana al centro que tenga hueco
   * (el pueblo crece compacto). Emite `roadExtended` para replicar en el render. */
  private maybeExtendRoad(center: [number, number]): boolean {
    // Ritmo: una calle nueva abre frente para VARIOS edificios; extender en cada
    // intento fallido sería un sprawl de asfalto vacío. Se deja que los
    // edificios llenen lo trazado antes de abrir más (T4.4 estético).
    if (this.clock.day - this.lastRoadDay < 2) return false;
    const roads = [...this.index.roadCells].sort(
      (a, b) => (Math.abs(a[0] - center[0]) + Math.abs(a[1] - center[1])) - (Math.abs(b[0] - center[0]) + Math.abs(b[1] - center[1])),
    );
    // Dos estrategias, en orden: (1) RAMIFICAR perpendicular desde una vía con
    // hueco al lado (abre trama 2D — un pueblo, no una tira); (2) si no cabe,
    // PROLONGAR un extremo recto hacia campo abierto. Las dos usan branchIsClear
    // (delante debe haber campo libre), así el pueblo crece compacto y ortogonal.
    for (const strategy of ['branch', 'extend'] as const) {
      for (const [rx, rz] of roads) {
        const runX = this.roadRun(rx, rz, 1, 0) + this.roadRun(rx, rz, -1, 0);
        const runZ = this.roadRun(rx, rz, 0, 1) + this.roadRun(rx, rz, 0, -1);
        if (Math.abs(runX - runZ) < 3) continue; // cruce/cabo ambiguo
        const lengthIsX = runX > runZ;
        const dirs = strategy === 'branch'
          // Ramificar = perpendicular a la longitud.
          ? (lengthIsX ? [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }] : [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }])
          // Prolongar = seguir la longitud (solo desde un EXTREMO: sin vía delante).
          : (lengthIsX ? [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }] : [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }]);
        for (const dir of dirs) {
          if (strategy === 'extend' && this.isRoad(rx + dir.dx, rz + dir.dz)) continue; // no es extremo
          // Ramificar exige margen ancho (una calle nueva con sus frentes) pero
          // menos LARGO (basta un corredor corto para arrancar una calle 2D);
          // prolongar solo punza la calzada (±1) pero mira lejos (recto y libre).
          const halfWidth = strategy === 'branch' ? 2 : 1;
          const depth = strategy === 'branch' ? 6 : 10;
          if (!this.branchIsClear(rx, rz, dir, depth, halfWidth)) continue;
          const laid = extendRoad(this.grid, [rx, rz], dir, 12, this.seed);
          if (laid.length < 8) continue;
          this.index.rebuild();
          this.roadsExtended++;
          this.lastRoadDay = this.clock.day;
          this.events.push({ name: 'roadExtended', data: { fromX: rx, fromZ: rz, dx: dir.dx, dz: dir.dz, length: 12 } });
          return true;
        }
      }
    }
    return false;
  }

  /** Coloca el edificio, reindexa y aloja/contrata. Emite `cityGrew` para que
   * el main replique la colocación en el grid de render. */
  private applyGrowth(p: GrowthPlacement, housingCapacity?: number, visualId?: string): boolean {
    const it = catalogData(p.id);
    if (!it || !this.grid.placeBuilding(p.id, it.w, it.d, p.cx, p.cz, p.rot, housingCapacity, visualId)) return false;
    this.pendingBuilt.push({ id: p.id, ...(visualId === undefined || visualId === p.id ? {} : { visualId }), cx: p.cx, cz: p.cz, rot: p.rot });
    this.index.rebuild();
    this.economy.rebuild(this.index, this.citizens);
    if (it.role === 'residential') {
      // Inmigración MODULADA por atractividad (ciclo 12): una ciudad próspera y
      // con buena fama llena la vivienda; una que va mal la deja a medias. El
      // efecto se nota sobre todo en los bloques (18-24 familias): un panelák
      // en un pueblo con paro y hambre nace medio vacío, no lleno por decreto.
      const s = this.economy.stats(this.citizens);
      const attractiveness = townAttractiveness({
        employment: s.adults > 0 ? s.employed / s.adults : 1,
        avgHealth: this.avgHealth(),
        avgFood: this.avgFood(),
        avgPrestige: this.avgPrestige(),
        avgHappiness: this.averageHappiness(),
        taxBurden: this.economy.taxBurden(),
        bankrupt: this.economy.bankrupt,
        railService: this.train !== null,
      });
      const cap = housingCapacity ?? it.capacity ?? 1;
      const families = Math.max(1, Math.round(cap * attractiveness));
      this.fillHome(p.cx, p.cz, p.id, families, true); // ciclo 48: inmigración → beat de llegada
    }
    this.hireAndAcquaint();
    // `label` (ciclo 50): el nombre de catálogo para que la Crónica lea "se levanta
    // una Casita de pueblo", no el id crudo "cottage". El render usa id/cx/cz/rot.
    this.events.push({ name: 'cityGrew', data: { ...p, label: it.name } });
    // Hito del pueblo (ciclo 45): la PRIMERA vez que se levanta un tipo de edificio
    // — el pueblo estrena escuela, tienda, consultorio, fábrica… un beat de su
    // desarrollo (acopla con los tiers: cada tier abre tipos nuevos).
    if (!this.firstBuildingSeen.has(p.id)) {
      this.firstBuildingSeen.add(p.id);
      this.events.push({ name: 'firstBuilding', data: { id: p.id, name: it.name } });
    }
    return true;
  }

  /** Colocación aceptada por una acción del jugador. La mutación ocurre en el
   * worker y el render la recibe por GridPatch, igual que el crecimiento. */
  placeBuildingForPlayer(id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3): boolean {
    const it = catalogData(id);
    if (!it || !this.grid.placeBuilding(id, it.w, it.d, cx, cz, rot)) return false;
    this.pendingBuilt.push({ id, cx, cz, rot });
    this.index.rebuild();
    this.economy.rebuild(this.index, this.citizens);
    if (it.role === 'residential') {
      const s = this.economy.stats(this.citizens);
      const attractiveness = townAttractiveness({
        employment: s.adults > 0 ? s.employed / s.adults : 1,
        avgHealth: this.avgHealth(),
        avgFood: this.avgFood(),
        avgPrestige: this.avgPrestige(),
        avgHappiness: this.averageHappiness(),
        taxBurden: this.economy.taxBurden(),
        bankrupt: this.economy.bankrupt,
        railService: this.train !== null,
      });
      this.fillHome(cx, cz, id, Math.max(1, Math.round((it.capacity ?? 1) * attractiveness)), true);
    }
    this.hireAndAcquaint();
    if (it.service) this.serviceNeedsReported.delete(id);
    this.events.push({ name: 'cityGrew', data: { id, cx, cz, rot, label: it.name, byPlayer: true } });
    return true;
  }

  /** Entrada única para acciones. Solo registra acciones aceptadas, de modo
   * que un intento rechazado nunca contamine el replay. */
  applyAction(action: PlayerAction, seq: number): ActionResult {
    const result = applyPlayerAction(this, action);
    if (result.ok) this.actions.push({ seq, tick: this.clock.tick, action });
    return result;
  }

  /**
   * Realoja una familia completa si encuentra capacidad suficiente en una
   * vivienda vecina. Las cuatro bolsas por hogar se fusionan, nunca se borran.
   * Si no hay una vivienda que pueda recibirla, sus miembros salen caminando:
   * la demolición no convierte a ciudadanos en un despawn silencioso.
   */
  private rehouseOrEmigrate(ids: number[], oldKey: string, oldEntrance: CellXZ): void {
    const recordedFamilies = this.households.get(oldKey) ?? 0;
    const displacedFamilies = recordedFamilies > 0 ? recordedFamilies : ids.length > 0 ? 1 : 0;
    if (displacedFamilies === 0) {
      this.households.delete(oldKey);
      this.pantry.delete(oldKey);
      this.economy.wallets.delete(oldKey);
      this.emigrationPressure.delete(oldKey);
      this.economy.prestige.delete(oldKey);
      return;
    }
    const [oldAx, oldAz] = oldKey.split(',').map(Number);
    const homes = this.index.ofRole('residential')
      .filter((b) => (b.ax !== oldAx || b.az !== oldAz) && !b.abandoned)
      .sort((a, b) => manhattan([oldAx, oldAz], [a.ax, a.az]) - manhattan([oldAx, oldAz], [b.ax, b.az]) || a.ax - b.ax || a.az - b.az);
    const target = homes.find((b) => {
      const key = `${b.ax},${b.az}`;
      return b.capacity - (this.households.get(key) ?? 0) >= displacedFamilies;
    });

    for (const id of ids) {
      const c = this.citizens.get(id);
      if (!c) continue;
      // Quien estaba dentro del edificio demolido sale a su puerta antes de
      // que el autómata vuelva a decidir. Los que ya estaban fuera conservan
      // su trayectoria actual si no dependía de estar bajo techo.
      if (c.inside) {
        c.inside = false;
        c.phase = { kind: 'deciding' };
        c.activity = 'none';
        c.x = oldEntrance[0] + 0.5;
        c.z = oldEntrance[1] + 0.5;
      }
      if (target) {
        c.home = { ax: target.ax, az: target.az, buildingId: target.id };
        this.leaving.delete(id);
      } else {
        this.leaving.add(id);
        c.phase = { kind: 'deciding' };
      }
    }

    if (!target) return;
    const targetKey = `${target.ax},${target.az}`;
    this.households.set(targetKey, (this.households.get(targetKey) ?? 0) + displacedFamilies);
    this.pantry.set(targetKey, (this.pantry.get(targetKey) ?? 0) + (this.pantry.get(oldKey) ?? 0));
    this.economy.wallets.set(targetKey, (this.economy.walletOf(targetKey) + this.economy.walletOf(oldKey)));
    this.emigrationPressure.set(targetKey, (this.emigrationPressure.get(targetKey) ?? 0) + (this.emigrationPressure.get(oldKey) ?? 0));
    this.households.delete(oldKey);
    this.pantry.delete(oldKey);
    this.economy.wallets.delete(oldKey);
    this.emigrationPressure.delete(oldKey);
    // El prestigio no es una bolsa fungible: conserva la mejor inversión del
    // hogar al mudarse, para que demoler no castigue dos veces a la familia.
    const oldPrestige = this.economy.prestigeOf(oldKey);
    if (oldPrestige > this.economy.prestigeOf(targetKey)) this.economy.prestige.set(targetKey, oldPrestige);
    this.economy.prestige.delete(oldKey);
  }

  /** Mueve todas las bolsas que pertenecen al hogar cuando una obra cambia su
   * ancla. En H4.5 la mayoría de upgrades conserva la ancla, pero mantener esta
   * costura explícita evita dejar ciudadanos o dinero apuntando a una clave
   * huérfana si una futura reparcelación la necesita. */
  private moveHomeKey(oldKey: string, newKey: string, buildingId: string): void {
    const [newAx, newAz] = newKey.split(',').map(Number);
    for (const citizen of this.citizens.values()) {
      if (`${citizen.home.ax},${citizen.home.az}` !== oldKey) continue;
      citizen.home = { ax: newAx, az: newAz, buildingId };
    }
    if (oldKey === newKey) return;

    const addMap = (map: Map<string, number>) => {
      const value = map.get(oldKey);
      if (value === undefined) return;
      map.set(newKey, (map.get(newKey) ?? 0) + value);
      map.delete(oldKey);
    };
    addMap(this.households);
    addMap(this.pantry);
    addMap(this.economy.wallets);
    addMap(this.emigrationPressure);
    const preserveMap = (map: Map<string, number>) => {
      const value = map.get(oldKey);
      if (value === undefined) return;
      if (!map.has(newKey)) map.set(newKey, value);
      map.delete(oldKey);
    };
    preserveMap(this.happiness);
    preserveMap(this.landValue);
    const oldPrestige = this.economy.prestigeOf(oldKey);
    if (oldPrestige > this.economy.prestigeOf(newKey)) this.economy.prestige.set(newKey, oldPrestige);
    this.economy.prestige.delete(oldKey);
  }

  /** Demolición digna desde cualquier celda de la huella. */
  private razeBuilding(ax: number, az: number, byPlayer: boolean): boolean {
    const ref = this.grid.get(ax, az)?.building;
    if (!ref) return false;
    const building = this.index.at(ref.anchorX, ref.anchorZ);
    if (!building) return false;
    const oldKey = `${building.ax},${building.az}`;
    const oldEntrance = building.entrance ?? [building.ax, building.az] as CellXZ;
    const residents = [...this.citizens.values()]
      .filter((c) => c.home.ax === building.ax && c.home.az === building.az)
      .sort((a, b) => a.id - b.id)
      .map((c) => c.id);
    this.rehouseOrEmigrate(residents, oldKey, oldEntrance);
    for (const c of this.citizens.values()) {
      if (c.work?.ax === building.ax && c.work.az === building.az) c.work = null;
    }
    if (!this.grid.removeBuilding(building.ax, building.az)) return false;
    this.pendingRazed.push({ cx: building.ax, cz: building.az });
    this.index.rebuild();
    this.economy.rebuild(this.index, this.citizens);
    this.events.push({ name: 'buildingRazed', data: { id: building.id, label: building.data.name, ax: building.ax, az: building.az, byPlayer } });
    return true;
  }

  /** Demuele desde cualquier celda de la huella y deja un diff para el render.
   * La lógica de acciones del jugador lo reutiliza; mantener esta costura aquí
   * evita que el worker tenga que interpretar edificios por su cuenta. */
  removeBuildingAt(cx: number, cz: number): boolean {
    const building = this.grid.get(cx, cz)?.building;
    if (!building) return false;
    return this.razeBuilding(building.anchorX, building.anchorZ, true);
  }

  /** Crea una línea circular y sus buses físicos. La acción ya ha validado que
   * las paradas están en calzada; aquí se conserva el estado determinista que
   * necesitan el replay y los saves. */
  createBusLine(stops: readonly CellXZ[]): number | null {
    const line = buildBusLine(this.nextBusLineId, stops);
    if (!line) return null;
    this.nextBusLineId++;
    this.busLines.set(line.id, line);
    const buses = createBuses(line, this.nextBusId);
    this.nextBusId += buses.length;
    this.buses.push(...buses);
    return line.id;
  }

  /** Elimina una línea y devuelve a decidir a quienes dependían de ella. */
  deleteBusLine(id: number): boolean {
    if (!this.busLines.delete(id)) return false;
    for (let i = this.buses.length - 1; i >= 0; i--) {
      if (this.buses[i].lineId === id) this.buses.splice(i, 1);
    }
    for (const citizen of this.citizens.values()) {
      const phase = citizen.phase;
      const dependsOnLine = (phase.kind === 'moving' && phase.busRide?.lineId === id)
        || (phase.kind === 'doing' && phase.busWait?.lineId === id);
      if (dependsOnLine) {
        citizen.phase = { kind: 'deciding' };
        citizen.activity = 'none';
        citizen.inside = false;
      }
    }
    return true;
  }

  /** Reconstruye el recorrido solo tras una obra/carga. Un tren necesita un
   * bucle ferroviario cerrado y una estación en la ciudad; sin ambos, la
   * infraestructura queda como trazado inerte y honesto. */
  refreshTrain(saved?: SimSaveState['train']): void {
    const hasStation = this.index.buildings.some((building) => building.id === 'station' && !building.abandoned);
    const route = hasStation ? buildRailLoop(this.grid) : null;
    const train = route ? createTrain(route, saved?.wagonCount ?? 3) : null;
    if (!train) { this.train = null; return; }
    if (saved && Number.isInteger(saved.routeIndex) && Number.isFinite(saved.x) && Number.isFinite(saved.z) && Number.isFinite(saved.heading)) {
      train.routeIndex = ((saved.routeIndex % train.route.length) + train.route.length) % train.route.length;
      train.x = saved.x;
      train.z = saved.z;
      train.heading = saved.heading;
    }
    this.train = train;
  }

  /** Elige la combinación de parada de subida/bajada más cercana. El coste es
   * solo geométrico y estable: la utilidad de la actividad sigue decidiendo
   * adónde quiere ir la persona, el bus únicamente sustituye el tramo largo. */
  private busPlanFor(from: CellXZ, to: CellXZ): BusPlan | undefined {
    if (manhattan(from, to) <= 12) return undefined;
    let best: { score: number; plan: BusPlan } | undefined;
    const lines = [...this.busLines.values()].sort((a, b) => a.id - b.id);
    for (const line of lines) {
      for (let boardStopIndex = 0; boardStopIndex < line.stops.length; boardStopIndex++) {
        const boardDistance = manhattan(from, line.stops[boardStopIndex]);
        if (boardDistance > 6) continue;
        for (let alightStopIndex = 0; alightStopIndex < line.stops.length; alightStopIndex++) {
          if (alightStopIndex === boardStopIndex) continue;
          const alightDistance = manhattan(to, line.stops[alightStopIndex]);
          if (alightDistance > 6) continue;
          const boardRouteIndex = line.stopRouteIndices[boardStopIndex];
          const alightRouteIndex = line.stopRouteIndices[alightStopIndex];
          const routeDistance = (alightRouteIndex - boardRouteIndex + line.route.length) % line.route.length;
          const score = boardDistance + routeDistance + alightDistance;
          const candidate = { score, plan: { lineId: line.id, boardStopIndex, alightStopIndex } };
          if (!best || score < best.score
            || (score === best.score && (line.id < best.plan.lineId
              || (line.id === best.plan.lineId && (boardStopIndex < best.plan.boardStopIndex
                || (boardStopIndex === best.plan.boardStopIndex && alightStopIndex < best.plan.alightStopIndex)))))) {
            best = candidate;
          }
        }
      }
    }
    return best?.plan;
  }

  private beginBusWait(c: Citizen, planned: PlannedActivity): void {
    const bus = planned.bus;
    if (!bus || !this.busLines.has(bus.lineId)) {
      c.phase = { kind: 'deciding' };
      c.activity = 'none';
      c.inside = false;
      return;
    }
    const stop = this.busLines.get(bus.lineId)!.stops[bus.boardStopIndex];
    c.x = stop[0] + 0.5;
    c.z = stop[1] + 0.5;
    c.activity = planned.activity;
    c.inside = false;
    c.phase = {
      kind: 'doing',
      until: this.clock.time + TICK_GAME_S * 12,
      busWait: { ...bus, next: planned },
    };
  }

  private stepBusWait(c: Citizen, wait: BusWait): void {
    const line = this.busLines.get(wait.lineId);
    if (!line) {
      c.phase = { kind: 'deciding' };
      c.activity = 'none';
      return;
    }
    const stopRouteIndex = line.stopRouteIndices[wait.boardStopIndex];
    const bus = this.buses.find((candidate) => candidate.lineId === wait.lineId
      && candidate.routeIndex === stopRouteIndex);
    if (bus) {
      c.x = bus.x;
      c.z = bus.z;
      c.heading = bus.heading;
      c.phase = {
        kind: 'moving',
        path: [],
        segment: 0,
        t: 0,
        next: wait.next,
        mode: 'bus',
        busRide: { ...wait, busId: bus.id, boardedAtTick: this.clock.tick },
      };
      this.busTrips++;
      return;
    }
    const until = c.phase.kind === 'doing' ? c.phase.until : 0;
    if (this.clock.time >= until) {
      c.phase = { kind: 'deciding' };
      c.activity = 'none';
    }
  }

  private stepBusRide(c: Citizen): void {
    if (c.phase.kind !== 'moving' || c.phase.mode !== 'bus' || !c.phase.busRide) return;
    const ride = c.phase.busRide;
    const line = this.busLines.get(ride.lineId);
    const bus = this.buses.find((candidate) => candidate.id === ride.busId);
    if (!line || !bus || this.clock.tick <= ride.boardedAtTick) {
      if (!line || !bus) {
        c.phase = { kind: 'deciding' };
        c.activity = 'none';
      }
      return;
    }
    c.x = bus.x;
    c.z = bus.z;
    c.heading = bus.heading;
    const alightRouteIndex = line.stopRouteIndices[ride.alightStopIndex];
    if (bus.routeIndex !== alightRouteIndex) return;

    const destination: PlannedActivity = { ...ride.next, bus: undefined };
    const from: CellXZ = [Math.round(bus.x - 0.5), Math.round(bus.z - 0.5)];
    if (manhattan(from, destination.cell) <= 1) {
      this.beginDoing(c, destination);
      return;
    }
    const ticket = this.paths.request(from, destination.cell);
    c.phase = { kind: 'waitingPath', ticket, next: destination };
    c.activity = destination.activity;
  }

  /** Toma los cambios espaciales desde el último envío al hilo principal. */
  takeGridChanges(): { cells: Array<[number, number, Cell]>; built: BuiltChange[]; razed: RazedChange[] } {
    const changes = {
      cells: this.grid.takeJournal(),
      built: this.pendingBuilt,
      razed: this.pendingRazed,
    };
    this.pendingBuilt = [];
    this.pendingRazed = [];
    return changes;
  }

  private stepCitizen(c: Citizen, ctx: SimContext): void {
    // Emigración (ciclo 14): quien decidió marcharse ignora toda otra actividad
    // y camina hacia la salida del pueblo. Al llegar (o si no hay ruta), se va.
    if (this.leaving.has(c.id) && c.phase.kind === 'deciding') {
      const center = townCenter(this.index.buildings.filter((b) => isUrban(b.data.role)).map((b) => [b.ax, b.az]));
      const exit = this.index.townExit(center);
      const from: CellXZ = [Math.round(c.x - 0.5), Math.round(c.z - 0.5)];
      if (!exit || manhattan(from, exit) <= 1) {
        this.departed.push(c);
        return;
      }
      const ticket = this.paths.request(from, exit);
      c.phase = { kind: 'waitingPath', ticket, next: { activity: 'none', target: null, cell: exit, duration: 0 } };
      c.activity = 'none';
      c.inside = false;
      return;
    }
    switch (c.phase.kind) {
      case 'deciding': {
        const next = chooseActivity(c, ctx);
        if (!next) return; // apatía: idle donde está
        const from: CellXZ = [Math.round(c.x - 0.5), Math.round(c.z - 0.5)];
        const bus = next.activity === 'none' ? undefined : this.busPlanFor(from, next.cell);
        const planned = bus
          ? { ...next, cell: this.busLines.get(bus.lineId)!.stops[bus.boardStopIndex], bus }
          : next;
        if (manhattan(from, planned.cell) <= 1) {
          planned.bus ? this.beginBusWait(c, planned) : this.beginDoing(c, planned);
          return;
        }
        const ticket = this.paths.request(from, planned.cell);
        c.phase = { kind: 'waitingPath', ticket, next: planned };
        c.activity = planned.activity;
        return;
      }
      case 'waitingPath': {
        const res = this.paths.take(c.phase.ticket);
        if (!res) return; // aún calculando (presupuesto incremental)
        if (res.status === 'fail') {
          // Si se marcha y no hay ruta a la salida, se va igualmente (no queda
          // atrapado en un pueblo que ya no quiere): despawn digno, narrado.
          if (this.leaving.has(c.id)) {
            this.departed.push(c);
            return;
          }
          c.phase = { kind: 'deciding' };
          c.activity = 'none';
          return;
        }
        c.inside = false;
        // Trayecto largo Y el hogar puede pagar el combustible → coche;
        // si no, a pie (más lento pero siempre disponible). Sin coordinación
        // con nadie más: cada cual decide con lo suyo, como el resto del motor.
        const homeKey = `${c.home.ax},${c.home.az}`;
        let mode: TravelMode = 'foot';
        if (!c.phase.next.bus && pathLength(res.path) > CAR_TRIP_THRESHOLD && this.economy.walletOf(homeKey) >= CAR_TRIP_COST) {
          this.economy.spendExternal(homeKey, CAR_TRIP_COST, 'transport');
          mode = 'car';
          this.carTrips++;
        }
        c.phase = { kind: 'moving', path: res.path, segment: 0, t: 0, next: c.phase.next, mode };
        return;
      }
      case 'moving': {
        if (c.phase.mode === 'bus') this.stepBusRide(c);
        else this.stepWalk(c);
        return;
      }
      case 'doing': {
        if (c.phase.busWait) {
          this.stepBusWait(c, c.phase.busWait);
          return;
        }
        const def = ACTIVITY_BY_KIND.get(c.activity);
        if (def) {
          const hours = TICK_GAME_S / 3600;
          for (const k of NEED_KEYS) {
            const r = def.restorePerHour[k];
            if (r) restore(c.needs, k, r * hours);
          }
          // Consuelo (ciclo 17): las actividades de COMPAÑÍA de verdad (visita,
          // club, fiesta — mucha restauración social) alivian el duelo.
          if ((def.restorePerHour.social ?? 0) >= 0.5) consoleGrief(c, hours);
          if (c.activity === 'school') c.education = Math.min(1, c.education + EDU_PER_HOUR * hours);
          if (c.activity === 'clinic' && this.clinicHealing) {
            c.health = Math.min(1, c.health + CLINIC_RECOVERY_PER_HOUR * hours);
            treatSick(c, hours); // contagio (ciclo 25): la clínica también cura la enfermedad aguda
          }
          if (c.activity === 'work' && c.work) {
            const employer = catalogData(c.work.buildingId);
            // Cadena de alimento: los granjeros en faena llenan el granero.
            if (employer?.role === 'agriculture') {
              // Cosecha estacional (ciclo 39): el campo rinde menos en invierno,
              // más en verano → hay que acumular granero para pasar el frío.
              const yieldFactor = 1 + SEASON_YIELD_SWING * seasonalWarmth(this.clock.day);
              this.economy.produceFood(`${c.home.ax},${c.home.az}`, hours, yieldFactor);
            }
            // Dinero: cada hora trabajada es salario para el hogar. El sector
            // público (civic) se paga del tesoro, no se acuña (ciclo 37bis).
            this.economy.payWage(`${c.home.ax},${c.home.az}`, hours, employer?.tier ?? 0, c.education, employer?.role, this.districtTaxDelta(c.home.ax, c.home.az));
            // Vocación (ciclo 36): trabajar en lo que uno ama COLMA el propósito.
            if (jobFitsVocation(c.personality, employer?.role)) restore(c.needs, 'purpose', VOCATION_PURPOSE_BONUS * hours);
          }
        }
        if (this.clock.time >= c.phase.until) {
          c.phase = { kind: 'deciding' };
          c.activity = 'none';
          c.inside = false;
        }
        return;
      }
    }
  }

  private beginDoing(c: Citizen, planned: PlannedActivity): void {
    // Revalida salud AL LLEGAR (no solo al decidir): si empeoró de camino,
    // se da media vuelta y vuelve a decidir (probablemente irá a curarse).
    // Cierra un caso límite real observado en el ciclo 6: caminar a un
    // trabajo lejano puede tardar más de lo que la salud aguanta.
    if (planned.activity === 'work' && c.health < WORK_BLOCK_HEALTH) {
      c.phase = { kind: 'deciding' };
      c.activity = 'none';
      return;
    }
    const def = ACTIVITY_BY_KIND.get(planned.activity);
    c.activity = planned.activity;
    c.phase = { kind: 'doing', until: this.clock.time + planned.duration };
    c.inside = def?.indoors ?? false;
    if (planned.activity === 'shop' && planned.target) {
      this.economy.registerVisit(planned.target);
      const k = `${c.home.ax},${c.home.az}`;
      const shopKey = `${planned.target.ax},${planned.target.az}`;
      // Compra de comida: limitada por granero Y bolsillo (lógica de dinero);
      // el importe entra en la caja de ESA tienda (economía circular).
      const got = this.economy.buyFood(shopKey, k, 3);
      this.pantry.set(k, (this.pantry.get(k) ?? 0) + got);
      // Un capricho en BIENES si el hogar va holgado (ciclo 31): ya no se esfuma
      // sin más — el IVA va al tesoro y el resto paga la importación; escala con
      // lo que le sobra al hogar (el rico consume más).
      this.economy.buyGoods(k);
    }
    if (planned.activity === 'clinic') {
      // Consultorio público: la consulta paga una tasa que va al tesoro
      // (acopla salud↔dinero↔gobierno). Si no llega a cubrirla, se atiende
      // igual (nadie se queda sin curar por 6 monedas) pero el gasto es 0.
      const k = `${c.home.ax},${c.home.az}`;
      this.economy.collectWalletPayment(k, CLINIC_FEE);
      if (planned.target) this.economy.registerVisit(planned.target);
    }
    if (planned.activity === 'eat') {
      const k = `${c.home.ax},${c.home.az}`;
      const atShop = planned.target && catalogData(planned.target.buildingId)?.role === 'commerce';
      if (atShop && planned.target) {
        // Comer fuera: compra, come una unidad y lleva el resto a la despensa.
        const shopKey = `${planned.target.ax},${planned.target.az}`;
        const got = this.economy.buyFood(shopKey, k, 4);
        this.pantry.set(k, (this.pantry.get(k) ?? 0) + Math.max(0, got - 1));
        this.economy.registerVisit(planned.target);
      } else {
        this.pantry.set(k, Math.max(0, (this.pantry.get(k) ?? 0) - 1));
      }
    }
    // Ancla la posición a la celda destino (la puerta) mientras "hace".
    c.x = planned.cell[0] + 0.5;
    c.z = planned.cell[1] + 0.5;
  }

  /** Tipo de calzada en una coordenada. Los senderos son peatonales: no
   * cuentan como vía de coches ni contaminan la capacidad de tráfico. */
  private roadKindAt(cx: number, cz: number): RoadKind | null {
    const cell = this.grid.get(Math.round(cx), Math.round(cz));
    if (!cell || cell.terrain !== 'road') return null;
    return cell.roadKind ?? 'rural';
  }

  private congestionAt(cx: number, cz: number): number {
    const kind = this.roadKindAt(cx, cz);
    if (!kind) return 1;
    if (this.averageCongestion() < MIN_NETWORK_CONGESTION_TO_SLOW) return 1;
    return congestionFactor(this.traffic.get(cellKey(Math.round(cx), Math.round(cz))) ?? 0, ROAD_SPECS[kind].capacity);
  }

  /** Celdas/tick en (cx,cz): a pie siempre igual; en coche depende del
   * terreno y de la carga que comparte la vía (H5.1). */
  private speedAt(cx: number, cz: number, mode: TravelMode): number {
    if (mode === 'foot') return WALK_CELLS_PER_TICK;
    const onRoad = this.roadKindAt(cx, cz) !== null;
    const districtFactor = this.policyForDistrict(this.districtAt(Math.round(cx), Math.round(cz))).speed30 ? 0.6 : 1;
    if (mode === 'bus') return onRoad ? CAR_CELLS_PER_TICK_ROAD * BUS_SPEED_FACTOR * this.congestionAt(cx, cz) * districtFactor : CAR_CELLS_PER_TICK_OFFROAD;
    return onRoad ? CAR_CELLS_PER_TICK_ROAD * this.congestionAt(cx, cz) * districtFactor : CAR_CELLS_PER_TICK_OFFROAD;
  }

  private stepWalk(c: Citizen): void {
    if (c.phase.kind !== 'moving') return;
    const ph = c.phase;
    // Presupuesto en FRACCIONES DE TICK (no celdas): así, si el trayecto
    // cruza de asfalto a fuera de vía a media tick, la velocidad se
    // recalcula en el momento justo del cambio, no de golpe al principio.
    let tickBudget = 1;
    let trafficCounted = false;
    while (tickBudget > 0) {
      const a = ph.path[ph.segment];
      const b = ph.path[ph.segment + 1];
      if (!b) {
        // Llegó a la salida del pueblo: se marcha (ciclo 14).
        if (this.leaving.has(c.id)) {
          this.departed.push(c);
          return;
        }
        // Un trayecto puede cruzar medianoche. Una fiesta es una fecha, no un
        // destino que pueda empezar al día siguiente por llegar tarde.
        if (ph.next.activity === 'festival' && !isFestivalDay(this.clock.day)) {
          c.activity = 'none';
          c.phase = { kind: 'deciding' };
          return;
        }
        if (ph.next.bus) this.beginBusWait(c, ph.next);
        else this.beginDoing(c, ph.next);
        return;
      }
      // Una ocupación cuenta una vez por coche y sub-tick, en la primera celda
      // de calzada que pisa. Un coche rápido puede cruzar varios segmentos en
      // el mismo sub-tick: no debe aparentar ser varios coches.
      // El decaimiento se ejecuta aparte en horas, así la carga no depende de
      // que el reloj tenga 36 s/tick o cambie su cadencia interna.
      if (!trafficCounted && ph.mode === 'car' && this.roadKindAt(a[0], a[1]) !== null) {
        const key = cellKey(Math.round(a[0]), Math.round(a[1]));
        this.traffic.set(key, (this.traffic.get(key) ?? 0) + 1);
        trafficCounted = true;
      }
      const speed = this.speedAt(a[0], a[1], ph.mode);
      const segLen = manhattan(a, b);
      const cellsLeft = (1 - ph.t) * segLen;
      const ticksToFinish = speed > 0 ? cellsLeft / speed : Infinity;
      const ticksUsed = Math.min(tickBudget, ticksToFinish);
      const advance = ticksUsed * speed;
      ph.t += segLen > 0 ? advance / segLen : 1;
      tickBudget -= ticksUsed;
      const x = a[0] + (b[0] - a[0]) * ph.t + 0.5;
      const z = a[1] + (b[1] - a[1]) * ph.t + 0.5;
      c.heading = Math.atan2(x - c.x, z - c.z) || c.heading;
      c.x = x;
      c.z = z;
      if (ph.t >= 1) {
        ph.segment++;
        ph.t = 0;
      }
      // Si no llegó a t=1, fue porque se agotó tickBudget (queda ~0): el
      // `while` de arriba corta solo, sin condición extra que duplicar.
    }
  }

  // --- Snapshot ----------------------------------------------------------------

  /** Serializa agentes al layout plano del protocolo. */
  snapshot(): Float32Array {
    const arr = new Float32Array(this.citizens.size * AGENT_STRIDE);
    let i = 0;
    for (const c of this.citizens.values()) {
      const state = c.inside
        ? AgentState.Inside
        : c.phase.kind === 'moving'
          ? AgentState.Walking
          : AgentState.Idle;
      arr[i++] = c.id;
      arr[i++] = c.x;
      arr[i++] = c.z;
      arr[i++] = c.heading;
      arr[i++] = state;
      arr[i++] = activityId(c.activity);
      arr[i++] = c.phase.kind === 'moving' && c.phase.mode === 'bus'
        ? TravelModeCode.Bus
        : c.phase.kind === 'moving' && c.phase.mode === 'car'
          ? TravelModeCode.Car
          : TravelModeCode.Foot;
      arr[i++] = c.grief; // 8ª columna (AGENT_STRIDE=8): el render apaga la ropa del doliente
    }
    return arr;
  }

  /** Estado plano de buses y tren: [id, x, z, heading, kind, lineId]. */
  vehiclesSnapshot(): Float32Array {
    const buses = [...this.buses].sort((a, b) => a.id - b.id);
    const wagons = this.train ? trainWagonPositions(this.train) : [];
    const arr = new Float32Array((buses.length + (this.train ? 1 : 0) + wagons.length) * VEHICLE_STRIDE);
    let i = 0;
    for (const bus of buses) {
      arr[i++] = bus.id;
      arr[i++] = bus.x;
      arr[i++] = bus.z;
      arr[i++] = bus.heading;
      arr[i++] = VehicleKindCode.Bus;
      arr[i++] = bus.lineId;
    }
    if (this.train) {
      arr[i++] = -1;
      arr[i++] = this.train.x;
      arr[i++] = this.train.z;
      arr[i++] = this.train.heading;
      arr[i++] = VehicleKindCode.Locomotive;
      arr[i++] = 0;
      wagons.forEach((wagon, index) => {
        arr[i++] = -2 - index;
        arr[i++] = wagon.x;
        arr[i++] = wagon.z;
        arr[i++] = wagon.heading;
        arr[i++] = VehicleKindCode.Wagon;
        arr[i++] = 0;
      });
    }
    return arr;
  }

  /** Paradas planas para el render: [lineId, cx, cz, stopIndex]. */
  busStopsSnapshot(): Float32Array {
    const lines = [...this.busLines.values()].sort((a, b) => a.id - b.id);
    const arr = new Float32Array(lines.reduce((total, line) => total + line.stops.length, 0) * BUS_STOP_STRIDE);
    let i = 0;
    for (const line of lines) {
      line.stops.forEach(([cx, cz], stopIndex) => {
        arr[i++] = line.id;
        arr[i++] = cx;
        arr[i++] = cz;
        arr[i++] = stopIndex;
      });
    }
    return arr;
  }

  /**
   * Estadísticas espaciales compactas para overlays. El orden es exactamente
   * el del índice estable (ax, az, felicidad, suelo, máscara de cobertura,
   * alertas, ocupación, carga); no contiene referencias ni depende de THREE.
   * Se calcula solo cuando el worker decide emitir el canal lento (~1 Hz).
   */
  buildingStats(): Float32Array {
    const arr = new Float32Array(this.index.buildings.length * BUILDING_STRIDE);
    const workersByBuilding = new Map<SimBuilding, number>();
    for (const workplace of this.economy.workplaces) {
      workersByBuilding.set(workplace.building, workplace.workers.length);
    }

    let offset = 0;
    for (const building of this.index.buildings) {
      const key = `${building.ax},${building.az}`;
      const jobs = building.data.jobs ?? 0;
      const workers = workersByBuilding.get(building) ?? 0;
      const capacity = building.capacity;
      const households = this.households.get(key) ?? 0;
      const residential = building.data.role === 'residential';
      const occupancy = residential
        ? capacity > 0 ? households / capacity : 0
        : jobs > 0 ? workers / jobs : 0;
      const visits = this.economy.visitsToday.get(key) ?? 0;
      let alertMask = 0;
      if (!building.roadAccess) alertMask |= AlertBit.NoRoad;
      if (building.data.role === 'commerce' && workers === 0) alertMask |= AlertBit.NoJob;
      if (residential && this.happiness.get(key) !== undefined && (this.happiness.get(key) ?? 1) < 0.25) alertMask |= AlertBit.Unhappy;
      if (building.abandoned) alertMask |= AlertBit.Abandoned;
      if (residential && building.coverage === 0) alertMask |= AlertBit.NoService;
      if (visits >= 6) alertMask |= AlertBit.Congested;

      arr[offset++] = building.ax;
      arr[offset++] = building.az;
      // Los edificios no residenciales usan -1 para que el overlay de ánimo
      // pueda pintar un neutro, no confundir "sin hogar" con felicidad cero.
      arr[offset++] = residential ? this.happiness.get(key) ?? 0 : -1;
      arr[offset++] = this.landValue.get(key) ?? 0;
      arr[offset++] = building.coverage;
      arr[offset++] = alertMask;
      arr[offset++] = clamp01(occupancy);
      // Visitas del período actual: señal ligera, suficiente para leer comercio
      // y carga sin hacer crecer el buffer ni transportar rutas completas.
      arr[offset++] = Math.min(1, visits / 8);
    }
    return arr;
  }

  /** Snapshot compacto de carga por calzada para el overlay H5.2. El key va
   * unsigned: `cellKey` usa los 32 bits completos para coordenadas positivas. */
  trafficSnapshot(): Uint32Array {
    const cells: Array<[number, number]> = [];
    for (const [key, load] of this.traffic) {
      const quantized = Math.min(255, Math.max(1, Math.round(load)));
      if (Number.isFinite(key) && Number.isFinite(load) && quantized > 0) {
        cells.push([key >>> 0, quantized]);
      }
    }
    cells.sort(([a], [b]) => a - b);
    const data = new Uint32Array(cells.length * 2);
    for (let i = 0; i < cells.length; i++) {
      data[i * 2] = cells[i][0];
      data[i * 2 + 1] = cells[i][1];
    }
    return data;
  }

  /** Congestión media normalizada de la red [0,1]. Solo cuenta la saturación
   * observada frente a la capacidad de cada tipo de vía, no el tráfico vacío. */
  private averageCongestion(): number {
    if (this.index.roadCells.length === 0) return 0;
    let total = 0;
    for (const [cx, cz] of this.index.roadCells) {
      const kind = this.roadKindAt(cx, cz);
      if (!kind) continue;
      const capacity = ROAD_SPECS[kind].capacity;
      const load = this.traffic.get(cellKey(cx, cz)) ?? 0;
      total += Math.min(1, Math.max(0, load) / capacity);
    }
    return total / this.index.roadCells.length;
  }

  /** Estado agregado de la ciudad (surfacing en el HUD): datos que la sim ya
   * lleva por dentro y que hasta ahora no salían a la superficie. Puro read. */
  cityStats(): CityStats {
    this.economy.updateBankruptcy(this.citizens.size);
    const s = this.economy.stats(this.citizens);
    const unemployment = s.adults > 0 ? 1 - s.employed / s.adults : 0;
    const shops = this.economy.workplaces.filter((w) => w.building.data.role === 'commerce');
    let avgProsperity = 0;
    for (const shop of shops) avgProsperity += this.economy.prosperity.get(`${shop.building.ax},${shop.building.az}`) ?? 0.5;
    avgProsperity = shops.length > 0 ? avgProsperity / shops.length : 0;
    const demand = demandLevels({
      population: s.adults,
      employed: s.employed,
      jobs: s.jobs,
      freeHousing: this.freeHousing(),
      shops: shops.length,
      avgProsperity,
      attractiveness: townAttractiveness({
        employment: s.adults > 0 ? s.employed / s.adults : 1,
        avgHealth: this.avgHealth(),
        avgFood: this.avgFood(),
        avgPrestige: this.avgPrestige(),
        avgHappiness: this.averageHappiness(),
        taxBurden: this.economy.taxBurden(),
        bankrupt: this.economy.bankrupt,
        railService: this.train !== null,
      }),
      totalPopulation: this.citizens.size,
      carryingCapacity: CARRYING_CAPACITY,
    });
    let totalWealth = 0;
    for (const k of this.households.keys()) totalWealth += this.economy.walletOf(k);
    const avgWealth = this.households.size > 0 ? totalWealth / this.households.size : 0;
    let sick = 0;
    let children = 0;
    let elders = 0;
    for (const c of this.citizens.values()) {
      if (c.sick > 0.05) sick++;
      if (c.age < ADULT_AGE) children++;
      else if (c.age >= OLD_AGE) elders++;
    }
    const districtIds = new Set<number>();
    this.grid.forEachChunk((chunk) => chunk.cells.forEach((cell) => {
      if (cell.district !== undefined) districtIds.add(cell.district);
    }));
    return {
      population: this.citizens.size,
      treasury: this.economy.treasury,
      unemployment,
      season: this.weather.season,
      granary: this.economy.granary,
      avgWealth,
      epidemic: this.inEpidemic,
      sick,
      tier: this.tier,
      growthPolicy: this.growthPolicy,
      publicAutobuild: this.publicAutobuild,
      congestion: this.averageCongestion(),
      busLines: this.busLines.size,
      busTrips: this.busTrips,
      trainActive: this.train !== null,
      districts: districtIds.size,
      districtPolicies: [...this.districtPolicies]
        .sort(([a], [b]) => a - b)
        .map(([district, policy]) => [district, { ...policy }] as [number, DistrictPolicyState]),
      demand,
      coverage: coverageRates(this.index),
      happiness: this.averageHappiness(),
      avgLandValue: this.averageLandValue(),
      taxRates: { ...this.economy.taxRates },
      debt: this.economy.debt,
      bankrupt: this.economy.bankrupt,
      budget: {
        incomeToday: this.economy.incomeToday,
        expenseToday: this.economy.expenseToday,
        upkeepPerDay: this.economy.upkeepDueToday,
        debt: this.economy.debt,
        bankrupt: this.economy.bankrupt,
        breakdown: {
          taxR: this.economy.ledger.taxR,
          taxC: this.economy.ledger.taxC,
          taxI: this.economy.ledger.taxI,
          rent: this.economy.rentCollected,
          goods: this.economy.goodsTaxCollected,
          lifestyle: this.economy.lifestyleSpent,
          wages: this.economy.wagesFromTreasury,
          pensions: this.economy.pensionsPaid,
          upkeep: this.economy.ledger.upkeep,
          interest: this.economy.ledger.interest,
          build: this.economy.ledger.build,
          dividend: this.economy.dividendPaid,
        },
        history: this.budgetHistory.map((point) => ({ ...point })),
        loans: this.economy.loans.map(({ id, tier, balance, interestRate, daysRemaining }) => ({ id, tier, balance, interestRate, daysRemaining })),
      },
      abandoned: this.index.buildings.filter((b) => b.abandoned).length,
      children,
      adults: s.adults,
      elders,
      employed: s.employed,
      jobs: s.jobs,
      buildings: this.index.buildings.length,
      roadsExtended: this.roadsExtended,
      carTrips: this.carTrips,
      vaccinationsGiven: this.vaccinationsGiven,
      quarantine: this.quarantine,
      vaccination: this.vaccination,
      clinicHealing: this.clinicHealing,
      rentEnabled: this.rentEnabled,
      autonomousGrowth: this.autonomousGrowth,
    };
  }

  // --- DEV (banco de pruebas ?scene=test-dev) ---------------------------------
  // Utilidades SOLO para el modo dev: no cambian la lógica del juego, solo dejan
  // forzar/acelerar mecánicas que la sim ya tiene para verlas de un vistazo.

  /** Siembra varios casos índice para disparar una oleada a voluntad. Como es un
   * disparador del banco de pruebas, GARANTIZA los casos: en un pueblo con
   * inmunidad de rebaño (vacunación) apenas quedan susceptibles, así que a los
   * elegidos se les levanta la inmunidad para que el brote arranque de verdad.
   * Si el rebaño sigue inmune la oleada no cundirá (esa es justo la mecánica a
   * observar: apagar la vacuna y ver la diferencia). Determinista (orden del Map). */
  forceEpidemic(count = 4): void {
    let seeded = 0;
    for (const c of this.citizens.values()) {
      if (seeded >= count) break;
      if (c.sick > 0) continue; // ya enfermo, no cuenta como caso nuevo
      c.immune = 0;
      c.sick = SICK_ONSET;
      seeded++;
    }
    this.inEpidemic = false; // que stepOutbreak la vuelva a declarar al cruzar el umbral
  }

  /** Avanza la sim N días de juego de golpe (saltar de estación, madurar). Usa
   * el mismo `step()` que el bucle normal → estado idéntico, solo sin esperar. */
  advanceDays(days: number): void {
    const ticks = Math.round((days * DAY_GAME_SECONDS) / TICK_GAME_S);
    for (let i = 0; i < ticks; i++) this.step();
  }

  /** Hijos vivos de un ciudadano (linaje, ciclo 43): descendencia directa aún en
   * el pueblo. O(n) por consulta del inspector (2/s) — barato. */
  private countChildren(id: number): number {
    let n = 0;
    for (const c of this.citizens.values()) if (c.parentId === id) n++;
    return n;
  }

  /** Amistad más cercana VIVA de un ciudadano (social, ciclo 46): la afinidad más
   * alta hacia alguien aún en el pueblo. Devuelve su nombre e íntimidad (≥ el umbral
   * de duelo por amigo = un lazo de verdad, no un simple conocido). */
  private closestFriend(c: Citizen): { name?: string; close: boolean } {
    let name: string | undefined;
    let best = -1;
    for (const [fid, aff] of c.friends) {
      const f = this.citizens.get(fid);
      if (!f) continue; // muerto o emigrado: ya no cuenta
      if (aff > best) { best = aff; name = f.name; }
    }
    return { name, close: best >= GRIEF_FRIEND_AFFINITY };
  }

  /** Estado legible de un ciudadano (inspector T3.10). */
  describe(id: number): Omit<CitizenInfoMsg, 'type' | 'id'> | null {
    const c = this.citizens.get(id);
    if (!c) return null;
    const friend = this.closestFriend(c);
    const homeKey = `${c.home.ax},${c.home.az}`;
    // Quién es (ciclo 23): edad, etapa de vida y con quién comparte la vida —
    // el inspector deja de ser una hoja de stats y pasa a mostrar una PERSONA.
    const lifeStage = c.age < ADULT_AGE ? 'niño/a' : c.age >= OLD_AGE ? 'mayor' : 'adulto/a';
    const partner = c.partnerId !== null ? this.citizens.get(c.partnerId) : undefined;
    // Vocación (ciclo 36) y si el empleo actual la colma (ciclo 36).
    const jobRole = c.work ? catalogData(c.work.buildingId)?.role : undefined;
    // Alquiler diario del hogar (ciclo 29): mismo cálculo que chargeRent.
    const homeTier = catalogData(c.home.buildingId)?.tier ?? 0;
    const families = this.households.get(homeKey) ?? 0;
    const rent = this.rentEnabled && families > 0
      ? RENT_PER_DAY * families * (1 + RENT_TIER_FACTOR * homeTier) * (1 + 0.5 * (this.landValue.get(homeKey) ?? 0))
      : 0;
    return {
      name: c.name,
      age: c.age,
      lifeStage,
      partnerName: partner?.name,
      parent: c.parent,
      livingChildren: this.countChildren(c.id),
      bestFriend: friend.name,
      bestFriendClose: friend.close,
      activity: c.activity,
      activityLabel: activityLabel(c.activity, c.phase.kind === 'moving' || c.phase.kind === 'waitingPath'),
      needs: { ...c.needs },
      home: [c.home.ax, c.home.az],
      work: c.work ? [c.work.ax, c.work.az] : undefined,
      health: c.health,
      happiness: this.happiness.get(homeKey) ?? 0.5,
      grief: c.grief,
      sick: c.sick,
      wallet: this.economy.walletOf(homeKey),
      pantry: this.pantry.get(homeKey) ?? 0,
      prestige: this.economy.prestigeOf(homeKey),
      vocation: vocationOf(c.personality),
      vocationMet: jobFitsVocation(c.personality, jobRole),
      jobRole,
      childrenRaised: c.childrenRaised,
      rent,
    };
  }

  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
