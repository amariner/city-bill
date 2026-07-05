/**
 * ÚNICA frontera main ↔ worker de simulación (contrato §1.3 del ROADMAP).
 * Todo mensaje que cruce el hilo se tipa AQUÍ. Nada de THREE a ningún lado.
 *
 * Snapshot de agentes: Float32Array plano transferible, AGENT_STRIDE floats
 * por agente → [id, x, z, heading, state, activity, mode]. x/z en CELDAS
 * (float); el main convierte a metros con CELL_SIZE al renderizar.
 *
 * Si cambias AGENT_STRIDE: actualiza TAMBIÉN `simulation.snapshot()`
 * (escritor) y `client.view()` (lector) en el MISMO commit — es la única
 * frontera y las tres piezas deben coincidir en el layout.
 */

import type { Season } from './weather';
import type { Vocation } from './citizens/citizen';

export type Speed = 0 | 1 | 2 | 3;

/** Multiplicador de tiempo por nivel de velocidad. */
export const SPEED_MULT: Record<Speed, number> = { 0: 0, 1: 1, 2: 3, 3: 8 };

export const AGENT_STRIDE = 7;

/** Modo de trayecto (columna `mode` del snapshot) — ciclo 8, vehículos. */
export const enum TravelModeCode {
  Foot = 0,
  Car = 1,
}

/** Estado físico del agente (columna `state` del snapshot). */
export const enum AgentState {
  /** Dentro de un edificio: no se renderiza (o fade-out). */
  Inside = 0,
  /** Caminando por el mundo. */
  Walking = 1,
  /** De pie al aire libre (charlando, mirando, sentado). */
  Idle = 2,
}

/** Ids numéricos de actividad para el snapshot (columna `activity`). */
export const ACTIVITY_IDS = [
  'none',
  'sleep',
  'work',
  'eat',
  'shop',
  'stroll',
  'visit',
  'chat',
  'school',
  'clinic',
  'club',
  'festival',
] as const;
export type ActivityKind = (typeof ACTIVITY_IDS)[number];

export function activityId(kind: ActivityKind): number {
  return ACTIVITY_IDS.indexOf(kind);
}

// --- main → worker -----------------------------------------------------------

export interface InitMsg {
  type: 'init';
  seed: number;
  /** Grid serializado (grid.serialize()); el worker lo deserializa. */
  gridJson: string;
}

export interface SetSpeedMsg {
  type: 'setSpeed';
  speed: Speed;
}

/** Acción del jugador sobre el mundo (Fase 2/4). El worker es dueño del grid
 * lógico de sim: replica la acción para mantener navegación/economía al día. */
export interface ActionMsg {
  type: 'action';
  action:
    | { kind: 'place'; id: string; cx: number; cz: number; rot: 0 | 1 | 2 | 3 }
    | { kind: 'demolish'; cx: number; cz: number }
    | { kind: 'terrain'; cx: number; cz: number; terrain: string };
}

export interface QueryCitizenMsg {
  type: 'queryCitizen';
  id: number;
}

export type MainToWorker = InitMsg | SetSpeedMsg | ActionMsg | QueryCitizenMsg;

// --- worker → main -----------------------------------------------------------

export interface SnapshotMsg {
  type: 'snapshot';
  /** Tiempo de juego en segundos desde el día 0 a las 00:00. */
  time: number;
  tick: number;
  speed: Speed;
  count: number;
  /** Nº de edificios del índice de sim (para la Crónica). */
  buildings: number;
  /** Estado agregado de la ciudad — para el HUD de ciudad (surfacing). */
  city: CityStats;
  /** count * AGENT_STRIDE floats. TRANSFERIDO (zero-copy). */
  agents: Float32Array;
}

/** Estado agregado de la ciudad que la sim ya conoce por dentro y el HUD saca
 * a la superficie: tesoro, paro, estación/cosecha, epidemia, riqueza media.
 * Puros números derivados del estado real de la sim (nada de THREE). */
export interface CityStats {
  population: number;
  /** Caja pública (impuestos − gasto). */
  treasury: number;
  /** Fracción de adultos SIN empleo [0,1]. */
  unemployment: number;
  /** Estación en curso (calendario, weather.ts). */
  season: Season;
  /** Reserva del granero comunal (colchón estacional, ciclo 40). */
  granary: number;
  /** Ahorro medio por hogar. */
  avgWealth: number;
  /** ¿Hay oleada epidémica declarada? (ciclo 25). */
  epidemic: boolean;
  /** Nº de enfermos contagiosos ahora mismo. */
  sick: number;
}

export interface SimEventMsg {
  type: 'event';
  name:
    | 'citizenBorn'
    | 'citizenLeft'
    | 'jobTaken'
    | 'chatStarted'
    | 'cityGrew'
    | 'tierUnlocked'
    | 'coupleFormed'
    | 'festivalDay'
    | 'roadExtended'
    | 'epidemic'
    | 'vocationFound'
    | 'dynastyRose'
    | 'dynastyFell';
  data?: Record<string, unknown>;
}

/** Respuesta al inspector (T3.10): estado legible de un ciudadano. */
export interface CitizenInfoMsg {
  type: 'citizenInfo';
  id: number;
  name: string;
  /** Quién es (ciclo 23): edad, etapa de vida y pareja. */
  age: number;
  lifeStage: string;
  partnerName?: string;
  /** Progenitor del que desciende — linaje, ciclo 42 (el inspector: "hijo/a de …"). */
  parent?: string;
  /** Hijos VIVOS ahora mismo — linaje, ciclo 43 (la familia vista hacia abajo). */
  livingChildren: number;
  activity: ActivityKind;
  activityLabel: string;
  needs: Record<string, number>;
  home: [number, number];
  work?: [number, number];
  /** Salud, ahorro y despensa del hogar — ciclos 2/4/5 de RESEARCH.md. */
  health: number;
  wallet: number;
  pantry: number;
  /** Prestigio de la vivienda [0,1] — ciclo 9. */
  prestige: number;
  /** Duelo [0,1] — ciclo 16. Solo el inspector lo pinta cuando pesa. */
  grief: number;
  /** Enfermedad contagiosa [0,1] — ciclo 25. El inspector la pinta si está enfermo. */
  sick: number;
  /** Vocación por carácter — ciclo 36 (N5, autorrealización). */
  vocation: Vocation;
  /** ¿Su empleo actual COLMA su vocación? (rol del puesto ∈ vocación). */
  vocationMet: boolean;
  /** Rol del empleo actual, si trabaja (agriculture/commerce/civic/work…). */
  jobRole?: string;
  /** Hijos criados — legado, ciclo 34 (N5). Puro recuerdo, varía por vida vivida. */
  childrenRaised: number;
  /** Alquiler diario de la vivienda — ciclo 29 (situación económica). */
  rent: number;
}

export type WorkerToMain = SnapshotMsg | SimEventMsg | CitizenInfoMsg;
