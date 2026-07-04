/**
 * ÚNICA frontera main ↔ worker de simulación (contrato §1.3 del ROADMAP).
 * Todo mensaje que cruce el hilo se tipa AQUÍ. Nada de THREE a ningún lado.
 *
 * Snapshot de agentes: Float32Array plano transferible, AGENT_STRIDE floats
 * por agente → [id, x, z, heading, state, activity, mode, grief]. x/z en
 * CELDAS (float); el main convierte a metros con CELL_SIZE al renderizar.
 *
 * Si cambias AGENT_STRIDE: actualiza TAMBIÉN `simulation.snapshot()`
 * (escritor) y `client.view()` (lector) en el MISMO commit — es la única
 * frontera y las tres piezas deben coincidir en el layout.
 */

export type Speed = 0 | 1 | 2 | 3;

/** Multiplicador de tiempo por nivel de velocidad. */
export const SPEED_MULT: Record<Speed, number> = { 0: 0, 1: 1, 2: 3, 3: 8 };

export const AGENT_STRIDE = 8;

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
  /** Guardado (T2.6): JSON de `Simulation.serialize()`. Si viene, el worker
   * restaura ciudadanos/economía/reloj en vez de poblar una ciudad nueva —
   * `gridJson` debe ser entonces el grid YA evolucionado, coherente con este
   * blob (main.ts los guarda y carga siempre juntos). */
  saveBlob?: string;
}

/** Petición de guardado (T2.6): el worker responde con `SaveBlobMsg`. */
export interface SaveMsg {
  type: 'save';
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

export type MainToWorker = InitMsg | SetSpeedMsg | ActionMsg | QueryCitizenMsg | SaveMsg;

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
  /** count * AGENT_STRIDE floats. TRANSFERIDO (zero-copy). */
  agents: Float32Array;
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
    | 'homePrestige'
    | 'cultivationChanged'
    | 'roadBuilt'
    | 'citizenRetired';
  data?: Record<string, unknown>;
}

/** Respuesta al inspector (T3.10): estado legible de un ciudadano. */
export interface CitizenInfoMsg {
  type: 'citizenInfo';
  id: number;
  name: string;
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
  /** Duelo [0,1] — lógica de duelo. */
  grief: number;
}

/** Respuesta a `SaveMsg` (T2.6): JSON de `Simulation.serialize()`, opaco para
 * el main — lo guarda tal cual (localStorage) y lo reenvía en un futuro
 * `InitMsg.saveBlob` sin tocarlo. */
export interface SaveBlobMsg {
  type: 'saveBlob';
  blob: string;
}

export type WorkerToMain = SnapshotMsg | SimEventMsg | CitizenInfoMsg | SaveBlobMsg;
