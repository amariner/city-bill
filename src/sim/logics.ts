/**
 * MANIFIESTO del multiuniverso de lógicas — la ÚNICA lista de qué lógicas
 * están vivas, a qué nivel de la pirámide pertenecen (RESEARCH.md §2) y
 * dónde viven. La Crónica lo muestra; los tests pueden recorrerlo; cada
 * ciclo de investigación AÑADE su entrada aquí (y solo aquí).
 *
 * Datos puros: lo importan worker y main.
 */

export interface LogicEntry {
  id: string;
  /** Nombre humano para la Crónica. */
  name: string;
  /** Nivel de la pirámide (0 física … 5 autorrealización). */
  level: 0 | 1 | 2 | 3 | 4 | 5;
  /** Archivos donde vive (orientación para agentes, no se valida). */
  files: string[];
  /** Con qué otras lógicas se acopla (ids). */
  couples: string[];
}

export const LOGICS: LogicEntry[] = [
  { id: 'time', name: 'tiempo y día-noche', level: 0, files: ['sim/clock.ts'], couples: [] },
  { id: 'space', name: 'espacio y movimiento', level: 0, files: ['sim/geometry.ts', 'sim/pathfinding.ts'], couples: ['time'] },
  { id: 'needs', name: 'necesidades + cerebro', level: 1, files: ['citizens/needs.ts', 'citizens/brain.ts', 'citizens/activities.ts'], couples: ['time', 'space'] },
  { id: 'food', name: 'alimento (granja→tienda→despensa)', level: 1, files: ['economy.ts', 'citizens/activities.ts'], couples: ['needs', 'jobs'] },
  { id: 'jobs', name: 'trabajo (empleos reales)', level: 2, files: ['economy.ts'], couples: ['needs', 'education'] },
  { id: 'money', name: 'dinero (salario→ahorro→precios)', level: 2, files: ['economy.ts'], couples: ['jobs', 'food'] },
  { id: 'education', name: 'educación', level: 2, files: ['citizens/activities.ts', 'economy.ts'], couples: ['jobs', 'life'] },
  { id: 'social', name: 'social (charlas/afinidad)', level: 3, files: ['citizens/social.ts'], couples: ['needs', 'space'] },
  { id: 'life', name: 'vida (generaciones)', level: 3, files: ['sim/lifecycle.ts'], couples: ['social', 'growth'] },
  { id: 'growth', name: 'ciudad autónoma (demanda→construcción)', level: 2, files: ['world/growth.ts'], couples: ['jobs', 'life', 'food'] },
  { id: 'government', name: 'gobierno (impuestos y pensiones)', level: 2, files: ['economy.ts', 'simulation.ts'], couples: ['money', 'life'] },
  { id: 'circular-economy', name: 'economía circular (mayorista + caja de tienda)', level: 2, files: ['economy.ts'], couples: ['money', 'food', 'government'] },
  { id: 'health', name: 'salud (consultorio, bajas laborales)', level: 2, files: ['sim/health.ts', 'citizens/activities.ts'], couples: ['life', 'money', 'jobs'] },
  { id: 'weather', name: 'clima y estaciones', level: 0, files: ['sim/weather.ts', 'citizens/activities.ts'], couples: ['needs', 'social'] },
  { id: 'third-place', name: 'vecindario y pandillas (tercer lugar)', level: 3, files: ['citizens/activities.ts'], couples: ['social'] },
  { id: 'vehicles', name: 'vehículos (coche para trayectos largos)', level: 0, files: ['sim/simulation.ts', 'sim/protocol.ts'], couples: ['space', 'money'] },
];

/** Para la Crónica: nombres ordenados por nivel (básico → superior). */
export function activeLogicNames(): string[] {
  return [...LOGICS].sort((a, b) => a.level - b.level).map((l) => `N${l.level} ${l.name}`);
}
