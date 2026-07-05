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
import { Grid } from '../world/grid';
import { createRng, Rng } from '../rng';
import { GameClock, TICK_GAME_S } from './clock';
import { PathQueue, pathLength } from './pathfinding';
import { CellXZ, manhattan } from './geometry';
import { WorldIndex } from './worldIndex';
import { Economy } from './economy';
import { Citizen, citizenName, PlannedActivity, TravelMode, jobFitsVocation, VOCATION_PURPOSE_BONUS } from './citizens/citizen';
import { decayNeeds, restore, NEED_KEYS } from './citizens/needs';
import { chooseActivity } from './citizens/brain';
import { ACTIVITY_BY_KIND, SimContext, activityLabel, EDU_PER_HOUR, CLINIC_FEE, isFestivalDay } from './citizens/activities';
import { SocialSystem } from './citizens/social';
import { AgentState, ActivityKind, activityId, AGENT_STRIDE, TravelModeCode } from './protocol';
import {
  computeDemand, itemForDemand, findParcel, townCenter, townAttractiveness,
  householdHardship, updateEmigrationPressure, EMIGRATE_POP_FLOOR, EMIGRATE_PRESSURE_LIMIT,
  extendRoad, GrowthPlacement, CARRYING_CAPACITY, fertilityFactor,
} from '../world/growth';
import { lifeYear, ADULT_AGE, OLD_AGE } from './lifecycle';
import { STARTING_MONEY, PENSION_PER_DAY, RENT_PER_DAY, RENT_TIER_FACTOR } from './economy';
import { catalogData, Tier } from '../world/catalogData';
import { healthTick, CLINIC_RECOVERY_PER_HOUR, WORK_BLOCK_HEALTH } from './health';
import { griefTick, consoleGrief, bereave, GRIEF_PARTNER, GRIEF_FRIEND, GRIEF_FRIEND_AFFINITY } from './grief';
import { sickenTick, treatSick, SICK_ONSET, VACCINE_IMMUNITY } from './contagion';
import { weatherAt, seasonalFestivalName, Weather } from './weather';

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

// --- Lógica de estatus y propiedad (ciclo 9) ----------------------------------
/** Bonus de 'fun' por hora en casa, a prestigio máximo (se escala por él). */
const COMFORT_FUN_PER_HOUR = 0.15;

/** Granero por encima del cual la fiesta de la cosecha es "abundante" (ciclo 24). */
const BOUNTIFUL_GRANARY = 40;

// --- Lógica de vacunación (ciclo 33): salud pública preventiva -----------------
/** Coste por dosis que paga el tesoro (acopla contagio↔gobierno: la salud
 * pública cuesta; un pueblo en quiebra no puede permitírsela). */
const VACCINE_COST_PER_DOSE = 6;
/** Fracción de la población a la que se ofrece la vacuna al día durante la
 * campaña (otoño-invierno): la capacidad del sistema, ~toda en dos semanas. */
const VACCINE_DAILY_FRACTION = 0.12;

export interface SimEvent {
  name: 'citizenBorn' | 'citizenLeft' | 'jobTaken' | 'chatStarted' | 'cityGrew' | 'tierUnlocked' | 'coupleFormed' | 'festivalDay' | 'roadExtended' | 'epidemic';
  data: Record<string, unknown>;
}

export class Simulation {
  readonly clock = new GameClock();
  readonly index: WorldIndex;
  readonly economy = new Economy();
  readonly citizens = new Map<number, Citizen>();
  readonly social: SocialSystem;
  readonly paths: PathQueue;
  private rng: Rng;
  private nextId = 1;
  private lastDay = 0;
  events: SimEvent[] = [];
  /** T4.4: la ciudad crece sola. Activado por defecto (es el alma del juego). */
  autonomousGrowth = true;
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
  /** Emigraciones acumuladas (ciclo 14 — métrica de tests/Crónica). */
  emigrations = 0;
  /** Tramos de vía trazados por la ciudad sola (T4.4 — métrica de tests). */
  roadsExtended = 0;
  /** Último día en que se trazó vía (T4.4 — ritmo: una calle no cada tick). */
  private lastRoadDay = -10;
  /** Presión migratoria por hogar ('ax,az') — penuria sostenida (ciclo 14). */
  private emigrationPressure = new Map<string, number>();
  /** Ciudadanos decididos a marcharse: caminan a la salida y despawnean allí. */
  private leaving = new Set<number>();
  /** Recogidos al LLEGAR a la salida este tick; se despawnean tras el bucle. */
  private departed: Citizen[] = [];

  constructor(readonly grid: Grid, readonly seed: number) {
    this.rng = createRng(seed ^ 0x5f3759df);
    this.index = new WorldIndex(grid);
    this.social = new SocialSystem(createRng(seed ^ 0x9e3779b9));
    this.paths = new PathQueue(grid);
    this.spawnPopulation();
    this.economy.rebuild(this.index, this.citizens);
    this.hireAndAcquaint();
  }

  // --- Población -------------------------------------------------------------

  /** 1-3 adultos por hueco de vivienda. Vecinos de la misma casa se conocen. */
  private spawnPopulation(): void {
    for (const b of this.index.ofRole('residential')) {
      this.fillHome(b.ax, b.az, b.id, b.data.capacity ?? 1);
    }
  }

  /** Aloja `count` familias en una vivienda (inmigración T4.3 y arranque). */
  private fillHome(ax: number, az: number, buildingId: string, count: number): void {
    const k = `${ax},${az}`;
    this.households.set(k, (this.households.get(k) ?? 0) + count);
    // Los recién llegados traen algo de comida y unos ahorros en la mudanza.
    this.pantry.set(k, (this.pantry.get(k) ?? 0) + 3 * count);
    this.economy.wallets.set(k, (this.economy.wallets.get(k) ?? 0) + STARTING_MONEY * count);
    for (let h = 0; h < count; h++) {
      const adults = 1 + Math.floor(this.rng.next() * 2.4); // 1-3
      const family: Citizen[] = [];
      for (let a = 0; a < adults; a++) family.push(this.spawnCitizen(ax, az, buildingId));
      for (let i = 0; i < family.length; i++)
        for (let j = i + 1; j < family.length; j++) SocialSystem.acquaint(family[i], family[j], 0.6);
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

  /** Huecos de familia libres en todas las viviendas. */
  private freeHousing(): number {
    let free = 0;
    for (const b of this.index.ofRole('residential')) {
      free += (b.data.capacity ?? 1) - (this.households.get(`${b.ax},${b.az}`) ?? 0);
    }
    return free;
  }

  private spawnCitizen(ax: number, az: number, buildingId: string, age?: number): Citizen {
    const b = this.index.at(ax, az);
    const door: CellXZ = b?.entrance ?? [ax, az];
    const c: Citizen = {
      id: this.nextId++,
      name: citizenName(this.rng),
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
    this.events.push({ name: 'citizenBorn', data: { id: c.id, name: c.name } });
    return c;
  }

  /** Contrata parados y presenta a vecinos cercanos y compañeros de trabajo. */
  private hireAndAcquaint(): void {
    const hires = this.economy.assignJobs(this.citizens);
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
      if (!c.inside && (c.phase.kind === 'moving' || c.phase.kind === 'doing')) walkers.push(c);
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
      this.lastDay = this.clock.day;
      this.stepLife();
      this.economy.endOfDay();
      this.chargeRent(); // ciclo 29: la vivienda cuesta (antes de pensiones: la red cubre a quien no llega)
      this.chargeLifestyle(); // ciclo 32: el coste de la vida escala con la riqueza (drena el ahorro excedente)
      this.payPensions();
      this.vaccinate(); // ciclo 33: salud pública preventiva (antes del dividendo: la salud primero)
      this.economy.payPublicDividend([...this.households.keys()], this.citizens.size); // ciclo 32: el tesoro no atesora sin fin — reparte su superávit
      this.stepOutbreak(); // ciclo 25: en invierno, algún resfriado prende y se propaga
      this.stepEmigration(); // ciclo 14: tras la red de pensiones (última bala)
      this.economy.investInHomes(this.households.keys()); // estatus, ciclo 9
      this.hireAndAcquaint();
      if (isFestivalDay(this.clock.day)) {
        // Cosecha abundante (ciclo 24): la fiesta de otoño se celebra distinta si
        // el granero rebosa — acopla festival↔alimento↔estación, sin guion.
        let festName = seasonalFestivalName(this.clock.day);
        if (festName === 'fiesta de la cosecha' && this.economy.granary > BOUNTIFUL_GRANARY) festName += ' abundante';
        this.events.push({ name: 'festivalDay', data: { day: this.clock.day, name: festName } });
      }
      const pop = this.citizens.size;
      const unlocked: Tier = pop >= 200 ? 4 : pop >= 80 ? 3 : pop >= 25 ? 2 : 1;
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
      const child = this.spawnCitizen(b.home.ax, b.home.az, b.home.buildingId, 0);
      SocialSystem.acquaint(child, b.parents[0], 0.8);
      SocialSystem.acquaint(child, b.parents[1], 0.8);
      b.parents[0].childrenRaised++; // ciclo 34: cada vida deja rastro (legado)
      b.parents[1].childrenRaised++;
    }
    if (life.deaths.length > 0) this.economy.rebuild(this.index, this.citizens);
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
      const p = updateEmigrationPressure(this.emigrationPressure.get(k) ?? 0, hardship);
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
        this.households.set(k, Math.max(0, (this.households.get(k) ?? 1) - 1));
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
      const rent = RENT_PER_DAY * families * (1 + RENT_TIER_FACTOR * (b.data.tier ?? 0));
      this.economy.treasury += this.economy.spend(k, rent);
    }
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
      this.economy.treasury -= VACCINE_COST_PER_DOSE;
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

  private maybeGrow(): void {
    const stats = this.economy.stats(this.citizens);
    const shops = this.economy.workplaces.filter((w) => w.building.data.role === 'commerce');
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
      hasClinic: this.index.buildings.some((b) => b.id === 'clinic'),
      totalPopulation: this.citizens.size,
      carryingCapacity: CARRYING_CAPACITY,
    });
    if (!demand) return;

    const id = itemForDemand(demand, this.tier);
    const it = catalogData(id);
    if (!it) return;
    const center = townCenter(
      this.index.buildings.filter((b) => b.data.role !== 'nature').map((b) => [b.ax, b.az]),
    );
    const p = findParcel(this.grid, id, center, this.rng);
    if (!p) {
      // T4.4: hay demanda pero NO queda frente construible junto a una vía →
      // la ciudad se traza una CALLE nueva hacia campo abierto. El siguiente
      // intento de crecer ya encontrará parcela en ella.
      this.maybeExtendRoad(center);
      return;
    }
    this.applyGrowth(p);
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
          const laid = extendRoad(this.grid, [rx, rz], dir, 12, this.rng);
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
  private applyGrowth(p: GrowthPlacement): void {
    const it = catalogData(p.id);
    if (!it || !this.grid.placeBuilding(p.id, it.w, it.d, p.cx, p.cz, p.rot)) return;
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
      });
      const cap = it.capacity ?? 1;
      const families = Math.max(1, Math.round(cap * attractiveness));
      this.fillHome(p.cx, p.cz, p.id, families);
    }
    this.hireAndAcquaint();
    this.events.push({ name: 'cityGrew', data: { ...p } });
  }

  private stepCitizen(c: Citizen, ctx: SimContext): void {
    // Emigración (ciclo 14): quien decidió marcharse ignora toda otra actividad
    // y camina hacia la salida del pueblo. Al llegar (o si no hay ruta), se va.
    if (this.leaving.has(c.id) && c.phase.kind === 'deciding') {
      const center = townCenter(this.index.buildings.filter((b) => b.data.role !== 'nature').map((b) => [b.ax, b.az]));
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
        if (manhattan(from, next.cell) <= 1) {
          this.beginDoing(c, next);
          return;
        }
        const ticket = this.paths.request(from, next.cell);
        c.phase = { kind: 'waitingPath', ticket, next };
        c.activity = next.activity;
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
        if (pathLength(res.path) > CAR_TRIP_THRESHOLD && this.economy.walletOf(homeKey) >= CAR_TRIP_COST) {
          this.economy.spend(homeKey, CAR_TRIP_COST);
          mode = 'car';
          this.carTrips++;
        }
        c.phase = { kind: 'moving', path: res.path, segment: 0, t: 0, next: c.phase.next, mode };
        return;
      }
      case 'moving': {
        this.stepWalk(c);
        return;
      }
      case 'doing': {
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
            if (employer?.role === 'agriculture') this.economy.produceFood(`${c.home.ax},${c.home.az}`, hours);
            // Dinero: cada hora trabajada es salario para el hogar. El sector
            // público (civic) se paga del tesoro, no se acuña (ciclo 37bis).
            this.economy.payWage(`${c.home.ax},${c.home.az}`, hours, employer?.tier ?? 0, c.education, employer?.role);
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
      this.economy.treasury += this.economy.spend(k, CLINIC_FEE);
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

  /** Celdas/tick en (cx,cz): a pie siempre igual; en coche depende del
   * terreno (rápido en 'road', al ritmo de un peatón fuera de vía). */
  private speedAt(cx: number, cz: number, mode: 'foot' | 'car'): number {
    if (mode === 'foot') return WALK_CELLS_PER_TICK;
    const onRoad = this.grid.get(Math.round(cx), Math.round(cz))?.terrain === 'road';
    return onRoad ? CAR_CELLS_PER_TICK_ROAD : CAR_CELLS_PER_TICK_OFFROAD;
  }

  private stepWalk(c: Citizen): void {
    if (c.phase.kind !== 'moving') return;
    const ph = c.phase;
    // Presupuesto en FRACCIONES DE TICK (no celdas): así, si el trayecto
    // cruza de asfalto a fuera de vía a media tick, la velocidad se
    // recalcula en el momento justo del cambio, no de golpe al principio.
    let tickBudget = 1;
    while (tickBudget > 0) {
      const a = ph.path[ph.segment];
      const b = ph.path[ph.segment + 1];
      if (!b) {
        // Llegó a la salida del pueblo: se marcha (ciclo 14).
        if (this.leaving.has(c.id)) {
          this.departed.push(c);
          return;
        }
        this.beginDoing(c, ph.next);
        return;
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
      arr[i++] = c.phase.kind === 'moving' && c.phase.mode === 'car' ? TravelModeCode.Car : TravelModeCode.Foot;
    }
    return arr;
  }

  /** Estado legible de un ciudadano (inspector T3.10). */
  describe(id: number): { name: string; age: number; lifeStage: string; partnerName?: string; activity: ActivityKind; activityLabel: string; needs: Record<string, number>; home: [number, number]; work?: [number, number]; health: number; grief: number; sick: number; wallet: number; pantry: number; prestige: number } | null {
    const c = this.citizens.get(id);
    if (!c) return null;
    const homeKey = `${c.home.ax},${c.home.az}`;
    // Quién es (ciclo 23): edad, etapa de vida y con quién comparte la vida —
    // el inspector deja de ser una hoja de stats y pasa a mostrar una PERSONA.
    const lifeStage = c.age < ADULT_AGE ? 'niño/a' : c.age >= OLD_AGE ? 'mayor' : 'adulto/a';
    const partner = c.partnerId !== null ? this.citizens.get(c.partnerId) : undefined;
    return {
      name: c.name,
      age: c.age,
      lifeStage,
      partnerName: partner?.name,
      activity: c.activity,
      activityLabel: activityLabel(c.activity, c.phase.kind === 'moving' || c.phase.kind === 'waitingPath'),
      needs: { ...c.needs },
      home: [c.home.ax, c.home.az],
      work: c.work ? [c.work.ax, c.work.az] : undefined,
      health: c.health,
      grief: c.grief,
      sick: c.sick,
      wallet: this.economy.walletOf(homeKey),
      pantry: this.pantry.get(homeKey) ?? 0,
      prestige: this.economy.prestigeOf(homeKey),
    };
  }

  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
