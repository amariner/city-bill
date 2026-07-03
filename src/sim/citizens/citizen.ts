/**
 * El ciudadano: DATOS PUROS (sin THREE, sin DOM). Todo lo que la sim sabe de
 * una persona. La posición va en CELDAS float; el render la escala a metros.
 */
import { Needs } from './needs';
import { ActivityKind } from '../protocol';
import { CellXZ } from '../pathfinding';

export interface Personality {
  /** 0-1: busca compañía, charla más, visita amigos. */
  sociable: number;
  /** 0-1: siente antes el deber, aguanta jornadas más largas. */
  trabajador: number;
  /** 0-1: prefiere casa; sale menos a pasear/comprar. */
  hogareño: number;
}

/** Referencia a un edificio por su celda ancla (estable ante cambios). */
export interface PlaceRef {
  ax: number;
  az: number;
  /** id de catálogo — para saber qué se hace allí. */
  buildingId: string;
}

export type CitizenPhase =
  | { kind: 'deciding' }
  | { kind: 'waitingPath'; ticket: number; next: PlannedActivity }
  | { kind: 'moving'; path: CellXZ[]; segment: number; t: number; next: PlannedActivity }
  | { kind: 'doing'; until: number };

export interface PlannedActivity {
  activity: ActivityKind;
  /** Dónde se hace; null = donde estás (charla, mirar). */
  target: PlaceRef | null;
  /** Celda concreta a la que caminar (entrada del edificio o punto del paseo). */
  cell: CellXZ;
  /** Duración en segundos de juego. */
  duration: number;
  /** Con quién (visitas/charlas). */
  withId?: number;
}

export interface Citizen {
  id: number;
  name: string;
  age: number;
  personality: Personality;
  needs: Needs;
  home: PlaceRef;
  work: PlaceRef | null;
  /** Posición en celdas (float). */
  x: number;
  z: number;
  heading: number;
  /** Fase del autómata de ejecución (decidir → ir → hacer). */
  phase: CitizenPhase;
  /** Actividad en curso o planeada (para snapshot/inspector). */
  activity: ActivityKind;
  /** Pareja (lógica de vida). null = soltero. */
  partnerId: number | null;
  /** Nivel educativo [0,1] (lógica de educación). Abre empleos de tier alto. */
  education: number;
  /** Salud [0,1] (lógica de salud, ciclo 5). Decae con hambre/sueño crónicos
   * y la edad; se recupera descansando o en la clínica. */
  health: number;
  /** Afinidad por id de conocido [0,1]. Se refuerza con encuentros. */
  friends: Map<number, number>;
  /** Tick en que terminó su última charla (histéresis anti-bucle). */
  lastChatTick: number;
  /** true si está bajo techo (no renderizar). */
  inside: boolean;
}

const FIRST = ['Vera', 'Tomás', 'Irene', 'Jan', 'Marta', 'Óscar', 'Lena', 'Pau', 'Alba', 'Emil', 'Nora', 'Iván', 'Júlia', 'Adam', 'Carme', 'Hugo', 'Zoe', 'Petr', 'Aina', 'Milan'];
const LAST = ['Vidal', 'Novák', 'Ferrer', 'Svoboda', 'Serra', 'Dvořák', 'Roca', 'Černý', 'Puig', 'Horák', 'Bosch', 'Marek'];

export function citizenName(rng: { pick<T>(a: readonly T[]): T }): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}
