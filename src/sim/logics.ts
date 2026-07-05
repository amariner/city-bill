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
  { id: 'life', name: 'vida (generaciones)', level: 3, files: ['sim/lifecycle.ts'], couples: ['social', 'growth', 'health', 'grief'] },
  { id: 'grief', name: 'duelo (la sombra del vínculo)', level: 3, files: ['sim/grief.ts'], couples: ['life', 'social', 'needs'] },
  { id: 'growth', name: 'ciudad autónoma (demanda→construcción + emigración)', level: 2, files: ['world/growth.ts', 'sim/simulation.ts'], couples: ['jobs', 'life', 'food', 'status', 'money'] },
  { id: 'carrying-capacity', name: 'capacidad de carga (crecimiento logístico, no exponencial)', level: 2, files: ['world/growth.ts', 'sim/lifecycle.ts', 'sim/simulation.ts'], couples: ['growth', 'life'] },
  { id: 'government', name: 'gobierno (impuestos, pensiones, salud pública)', level: 2, files: ['economy.ts', 'simulation.ts'], couples: ['money', 'life', 'contagion'] },
  { id: 'circular-economy', name: 'economía circular (mayorista + caja de tienda)', level: 2, files: ['economy.ts'], couples: ['money', 'food', 'government'] },
  { id: 'rent', name: 'alquiler (la vivienda cuesta → drena el ahorro ocioso y circula)', level: 2, files: ['economy.ts', 'sim/simulation.ts'], couples: ['money', 'government', 'status'] },
  { id: 'goods', name: 'bienes (consumo discrecional: el rico consume más, IVA + importación)', level: 2, files: ['economy.ts', 'sim/simulation.ts'], couples: ['money', 'government'] },
  { id: 'monetary-closure', name: 'cierre monetario (coste de la vida + el tesoro reparte → riqueza estable)', level: 2, files: ['economy.ts', 'sim/simulation.ts'], couples: ['money', 'government', 'goods'] },
  { id: 'health', name: 'salud (consultorio, bajas laborales)', level: 2, files: ['sim/health.ts', 'citizens/activities.ts'], couples: ['life', 'money', 'jobs'] },
  { id: 'contagion', name: 'contagio (epidemias en oleadas + cuarentena)', level: 2, files: ['sim/contagion.ts', 'citizens/social.ts', 'citizens/activities.ts'], couples: ['health', 'social', 'government'] },
  { id: 'vaccination', name: 'vacunación (inmunidad de rebaño, salud pública preventiva)', level: 2, files: ['sim/contagion.ts', 'sim/simulation.ts'], couples: ['contagion', 'government', 'health'] },
  { id: 'weather', name: 'clima y estaciones', level: 0, files: ['sim/weather.ts', 'citizens/activities.ts'], couples: ['needs', 'social', 'vehicles'] },
  { id: 'seasonal-harvest', name: 'cosecha estacional + granero-colchón (superávit en verano, reserva para el invierno)', level: 1, files: ['economy.ts', 'sim/simulation.ts'], couples: ['food', 'weather'] },
  { id: 'third-place', name: 'vecindario y pandillas (tercer lugar)', level: 3, files: ['citizens/activities.ts'], couples: ['social'] },
  { id: 'vehicles', name: 'vehículos (coche para trayectos largos)', level: 0, files: ['sim/simulation.ts', 'sim/protocol.ts'], couples: ['space', 'money', 'weather'] },
  { id: 'status', name: 'estatus y propiedad (mejoras del hogar)', level: 4, files: ['economy.ts', 'sim/simulation.ts'], couples: ['money', 'needs', 'growth'] },
  { id: 'festival', name: 'fiestas de barrio (calendario emergente)', level: 5, files: ['citizens/activities.ts'], couples: ['social', 'weather'] },
  { id: 'lineage', name: 'linaje (los hijos heredan el apellido → dinastías que perduran generación a generación)', level: 3, files: ['sim/citizens/citizen.ts', 'sim/simulation.ts', 'ui/chronicle.ts', 'ui/inspector.ts'], couples: ['life', 'legacy'] },
  { id: 'legacy', name: 'legado (la vida deja huella: los hijos criados se honran al morir)', level: 5, files: ['sim/citizens/citizen.ts', 'ui/chronicle.ts', 'sim/simulation.ts'], couples: ['life', 'social'] },
  { id: 'vocation', name: 'vocación (trabajar en lo que uno ama colma el propósito; y se busca: quien es infeliz en su oficio lo deja por su llamada)', level: 5, files: ['sim/citizens/citizen.ts', 'sim/economy.ts', 'sim/simulation.ts', 'ui/chronicle.ts'], couples: ['jobs', 'needs'] },
];

/** Para la Crónica: nombres ordenados por nivel (básico → superior). */
export function activeLogicNames(): string[] {
  return [...LOGICS].sort((a, b) => a.level - b.level).map((l) => `N${l.level} ${l.name}`);
}
