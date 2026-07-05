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

// --- Vocación (ciclo 36, N5 autorrealización) ---------------------------------
// A qué se siente LLAMADO alguien, según su carácter. Trabajar en la propia
// vocación llena el PROPÓSITO mucho más (hacer lo que uno ama; la autorrealización
// de Maslow). No hay campo nuevo: la vocación SALE del carácter (personalidad),
// así que es pura y determinista y no toca el estado ni los tests de fábrica.
export type Vocation = 'labrar' | 'tratar' | 'cuidar';

/** La vocación de alguien, por su rasgo dominante: el trabajador se realiza con
 * las MANOS (labrar), el sociable con el TRATO (tratar), el hogareño CUIDANDO. */
export function vocationOf(p: Personality): Vocation {
  if (p.trabajador >= p.sociable && p.trabajador >= p.hogareño) return 'labrar';
  if (p.sociable >= p.hogareño) return 'tratar';
  return 'cuidar';
}

/** Roles de empleo que COLMAN cada vocación. */
export const VOCATION_ROLES: Record<Vocation, string[]> = {
  labrar: ['agriculture', 'work'],
  tratar: ['commerce'],
  cuidar: ['civic'],
};

/** ¿El empleo (por su rol) es la vocación de quien lo ejerce? Pura. */
export function jobFitsVocation(p: Personality, role: string | undefined): boolean {
  return role !== undefined && VOCATION_ROLES[vocationOf(p)].includes(role);
}

/** Bonus de propósito por hora al trabajar EN la propia vocación (ciclo 36):
 * se suma al propósito base del trabajo — hacer lo que amas realiza el doble. */
export const VOCATION_PURPOSE_BONUS = 1 / 7;

/** Referencia a un edificio por su celda ancla (estable ante cambios). */
export interface PlaceRef {
  ax: number;
  az: number;
  /** id de catálogo — para saber qué se hace allí. */
  buildingId: string;
}

/** Modo de trayecto (ciclo 8 — vehículos). A pie por defecto; en coche solo
 * para trayectos largos y si el hogar puede pagar el trayecto. */
export type TravelMode = 'foot' | 'car';

export type CitizenPhase =
  | { kind: 'deciding' }
  | { kind: 'waitingPath'; ticket: number; next: PlannedActivity }
  | { kind: 'moving'; path: CellXZ[]; segment: number; t: number; next: PlannedActivity; mode: TravelMode }
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
  /** Duelo [0,1] (lógica de duelo, ciclo 16). Salta al perder a la pareja o a
   * un amigo íntimo (muerte/emigración); apaga la alegría y decae en ~días. */
  grief: number;
  /** Enfermedad CONTAGIOSA [0,1] (contagio, ciclo 25). Se pega en los
   * encuentros, mella la salud mientras dura y se pasa en unos días (antes en
   * la clínica). Distinta de `health` (fondo crónico): esto es agudo y contagioso. */
  sick: number;
  /** Inmunidad [0,1] tras pasar la enfermedad (contagio, ciclo 25). Protege del
   * recontagio y decae en ~una estación → de ahí las OLEADAS (modelo SIRS). */
  immune: number;
  /** Hijos criados a lo largo de la vida (ciclo 34, N5 legado): puro RECUERDO,
   * no alimenta ninguna dinámica — da a cada vida un rastro que la Crónica honra
   * al morir (una vida deja huella: la estima nace de lo vivido, no del dinero). */
  childrenRaised: number;
  /** Afinidad por id de conocido [0,1]. Se refuerza con encuentros. */
  friends: Map<number, number>;
  /** Tick en que terminó su última charla (histéresis anti-bucle). */
  lastChatTick: number;
  /** true si está bajo techo (no renderizar). */
  inside: boolean;
  /** Progenitor del que desciende (nombre completo al nacer) — linaje, ciclo 42.
   * Puro recuerdo para el inspector ("hijo/a de …"); los fundadores/inmigrantes
   * no tienen (llegan de fuera). El APELLIDO se hereda por el nombre. */
  parent?: string;
  /** Id del progenitor (estable) — linaje, ciclo 43. Para contar descendencia. */
  parentId?: number;
  /** Id del TRONCO de la estirpe (el fundador de la línea) — dinastías, ciclo 43.
   * Se propaga al nacer (`parents[0].lineId ?? parents[0].id`) sin caminar hacia
   * arriba, así una línea sobrevive a la muerte de sus ancestros. Undefined en los
   * fundadores/inmigrantes (aún sin descendencia propia registrada). */
  lineId?: number;
}

/** Apellido (todo tras el primer nombre) — para el linaje (ciclo 42). */
export function surnameOf(name: string): string {
  const i = name.indexOf(' ');
  return i >= 0 ? name.slice(i + 1) : name;
}

const FIRST = ['Vera', 'Tomás', 'Irene', 'Jan', 'Marta', 'Óscar', 'Lena', 'Pau', 'Alba', 'Emil', 'Nora', 'Iván', 'Júlia', 'Adam', 'Carme', 'Hugo', 'Zoe', 'Petr', 'Aina', 'Milan'];
const LAST = ['Vidal', 'Novák', 'Ferrer', 'Svoboda', 'Serra', 'Dvořák', 'Roca', 'Černý', 'Puig', 'Horák', 'Bosch', 'Marek'];

export function citizenName(rng: { pick<T>(a: readonly T[]): T }): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}
