/**
 * Actividades: qué se puede hacer, dónde, cuánto dura y qué restaura.
 * El cerebro (brain.ts) las puntúa; aquí NO hay decisiones, solo definición.
 *
 * Idoneidad por hora = CURVAS CONTINUAS derivadas de clock.darkness — jamás
 * un `if hora == X`. El patrón diario emerge de necesidad × idoneidad.
 */
import { ActivityKind } from '../protocol';
import { Citizen, PlannedActivity, PlaceRef } from './citizen';
import { NeedKey, urgency } from './needs';
import { WorldIndex, SimBuilding } from '../worldIndex';
import { CellXZ, manhattan } from '../geometry';
import { Rng } from '../../rng';
import { SEEK_CLINIC_HEALTH } from '../health';
import { Weather } from '../weather';
import { SOCIAL_THRESHOLD } from './social';

export interface SimContext {
  index: WorldIndex;
  rng: Rng;
  /** darkness [0,1] del reloj (0 mediodía, 1 medianoche). */
  darkness: number;
  hour: number;
  citizens: Map<number, Citizen>;
  /** Clientes por tienda en el día (economía T3.8). */
  visitCounters: Map<string, number>;
  /** Despensa por hogar ('ax,az') — lógica de alimento (ciclo 1). */
  pantry: Map<string, number>;
  /** Ahorro por hogar ('ax,az') — lógica de dinero (ciclo 2). */
  wallets: Map<string, number>;
  /** Tiempo de hoy (ciclo 6) — modula idoneidad de actividades al aire libre. */
  weather: Weather;
}

/** Coste de la consulta (lógica de salud, ciclo 5) — acopla con dinero. */
export const CLINIC_FEE = 6;

export interface ActivityDef {
  kind: ActivityKind;
  /** Necesidad principal que atiende (urgencia = urgency(needs[need])). */
  need: NeedKey;
  /** Si la urgencia no sale de `needs` (p. ej. salud, que vive fuera de
   * Needs): la sustituye por completo cuando está presente. */
  urgencyOverride?: (c: Citizen) => number;
  /** Restauración por HORA de juego haciendo la actividad. */
  restorePerHour: Partial<Record<NeedKey, number>>;
  /** Duración típica en horas de juego [min,max] (RNG determinista). */
  durationH: [number, number];
  /** Curva [0,1] de idoneidad según oscuridad/hora. */
  suitability: (ctx: SimContext, c: Citizen) => number;
  /** Dónde: devuelve destino o null si ahora mismo no es posible. */
  findTarget: (ctx: SimContext, c: Citizen) => { place: PlaceRef | null; cell: CellXZ } | null;
  /** Peso de personalidad [~0.5, ~1.5]. */
  personality: (c: Citizen) => number;
  /** true si se hace bajo techo (el agente desaparece). */
  indoors: boolean;
  /** Quién puede hacerla (p. ej. escuela = niños). Sin definir = todos. */
  eligible?: (c: Citizen) => boolean;
}

/** Educación ganada por hora de escuela: ~12 años escolarizado ≈ nivel 1. */
export const EDU_PER_HOUR = 1 / 70;
const SCHOOL_MIN_AGE = 6;
const SCHOOL_MAX_AGE = 18;

function placeOf(b: SimBuilding): PlaceRef {
  return { ax: b.ax, az: b.az, buildingId: b.id };
}

function entranceTarget(b: SimBuilding): { place: PlaceRef; cell: CellXZ } | null {
  return b.entrance ? { place: placeOf(b), cell: b.entrance } : null;
}

/** El edificio del rol dado con entrada más cercana al ciudadano. */
function nearestOfRole(ctx: SimContext, c: Citizen, role: Parameters<WorldIndex['ofRole']>[0]): SimBuilding | null {
  let best: SimBuilding | null = null;
  let bestD = Infinity;
  for (const b of ctx.index.ofRole(role)) {
    if (!b.entrance) continue;
    const d = manhattan([c.x | 0, c.z | 0], b.entrance);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function homeBuilding(ctx: SimContext, c: Citizen): SimBuilding | undefined {
  return ctx.index.at(c.home.ax, c.home.az);
}

export const ACTIVITIES: ActivityDef[] = [
  {
    kind: 'sleep',
    need: 'energy',
    restorePerHour: { energy: 1 / 7 }, // noche completa ≈ depósito lleno
    durationH: [6, 8.5],
    // Dormir "apetece" cuanto más oscuro; la necesidad hace el resto.
    suitability: (ctx) => 0.15 + 0.85 * ctx.darkness,
    findTarget: (ctx, c) => {
      const b = homeBuilding(ctx, c);
      return b ? entranceTarget(b) : null;
    },
    personality: () => 1,
    indoors: true,
  },
  {
    kind: 'work',
    need: 'purpose',
    restorePerHour: { purpose: 1 / 6 },
    durationH: [3.5, 5], // dos bloques con pausa a comer emergen solos
    // Trabajar apetece con luz (los turnos nocturnos llegarán con la fábrica).
    suitability: (ctx) => Math.max(0, 1 - ctx.darkness * 1.6),
    findTarget: (ctx, c) => {
      if (!c.work) return null;
      const b = ctx.index.at(c.work.ax, c.work.az);
      return b ? entranceTarget(b) : null;
    },
    personality: (c) => 0.6 + 0.8 * c.personality.trabajador,
    indoors: true,
  },
  {
    kind: 'school',
    need: 'purpose',
    restorePerHour: { purpose: 1 / 6, social: 0.08 }, // el patio también es vida
    durationH: [4, 6],
    suitability: (ctx) => Math.max(0, 1 - ctx.darkness * 1.6), // horario lectivo emerge de la luz
    findTarget: (ctx, c) => {
      let best: { place: PlaceRef; cell: CellXZ } | null = null;
      let bestD = Infinity;
      for (const b of ctx.index.ofRole('civic')) {
        if (!b.data.students || !b.entrance) continue;
        const d = manhattan([c.x | 0, c.z | 0], b.entrance);
        if (d < bestD) {
          bestD = d;
          best = { place: placeOf(b), cell: b.entrance };
        }
      }
      return best;
    },
    personality: () => 1,
    indoors: true,
    eligible: (c) => c.age >= SCHOOL_MIN_AGE && c.age < SCHOOL_MAX_AGE,
  },
  {
    kind: 'clinic',
    need: 'energy', // placeholder: la urgencia real la da urgencyOverride (salud)
    urgencyOverride: (c) => urgency(c.health),
    restorePerHour: {},
    durationH: [0.8, 1.5],
    suitability: (ctx) => Math.max(0.15, 1 - ctx.darkness * 1.3), // consulta de día, urgencias sí de noche
    findTarget: (ctx, c) => {
      let best: { place: PlaceRef; cell: CellXZ } | null = null;
      let bestD = Infinity;
      for (const b of ctx.index.buildings) {
        if (b.id !== 'clinic' || !b.entrance) continue;
        const d = manhattan([c.x | 0, c.z | 0], b.entrance);
        if (d < bestD) {
          bestD = d;
          best = { place: placeOf(b), cell: b.entrance };
        }
      }
      // Sin dinero para la consulta, no se puede ir (lógica de dinero).
      if (best && (ctx.wallets.get(`${c.home.ax},${c.home.az}`) ?? 0) < CLINIC_FEE) return null;
      return best;
    },
    personality: () => 1,
    indoors: true,
    eligible: (c) => c.health < SEEK_CLINIC_HEALTH,
  },
  {
    kind: 'eat',
    need: 'food',
    restorePerHour: { food: 1.4, energy: 0.05 },
    durationH: [0.6, 1.1],
    suitability: () => 1, // comer siempre es apropiado si hay hambre
    findTarget: (ctx, c) => {
      // Con despensa se come en casa; vacía, se come fuera (tienda) y de paso
      // se trae algo a casa — la cadena de alimento cierra sola.
      const k = `${c.home.ax},${c.home.az}`;
      if ((ctx.pantry.get(k) ?? 0) >= 1) {
        const b = homeBuilding(ctx, c);
        return b ? entranceTarget(b) : null;
      }
      // Comer fuera solo si el hogar puede pagarlo: sin dinero hay hambre real.
      if ((ctx.wallets.get(k) ?? 0) < 2) return null;
      const s = nearestOfRole(ctx, c, 'commerce');
      return s ? entranceTarget(s) : null;
    },
    personality: () => 1,
    indoors: true,
  },
  {
    kind: 'shop',
    need: 'fun',
    restorePerHour: { fun: 0.5, food: 0.35, social: 0.1 },
    durationH: [0.7, 1.4],
    // Comprar: con luz, mejor hacia la tarde, algo menos con mal tiempo
    // (trayecto corto: se nota menos que en un paseo — ciclo 6).
    suitability: (ctx) =>
      Math.max(0, 1 - ctx.darkness * 1.8) *
      (0.7 + 0.3 * Math.sin(((ctx.hour - 10) / 24) * Math.PI * 2)) *
      (0.6 + 0.4 * ctx.weather.outdoorFactor),
    findTarget: (ctx, c) => {
      const b = nearestOfRole(ctx, c, 'commerce');
      return b ? entranceTarget(b) : null;
    },
    personality: (c) => 1.1 - 0.5 * c.personality.hogareño,
    indoors: true,
  },
  {
    kind: 'stroll',
    need: 'fun',
    restorePerHour: { fun: 0.8, energy: -0.02 },
    durationH: [0.8, 1.6],
    // Pasear es la actividad MÁS expuesta: el tiempo pega de lleno (ciclo 6)
    // — con lluvia o crudeza, casi nadie sale a pasear, sin ningún guion.
    suitability: (ctx) => Math.max(0, 1 - ctx.darkness * 1.4) * ctx.weather.outdoorFactor,
    findTarget: (ctx, c) => {
      if (ctx.index.strollSpots.length === 0) return null;
      // Punto de paseo aleatorio entre los 5 más cercanos: variedad sin absurdos.
      const sorted = [...ctx.index.strollSpots].sort(
        (a, b) => manhattan([c.x | 0, c.z | 0], a) - manhattan([c.x | 0, c.z | 0], b),
      );
      const cell = ctx.rng.pick(sorted.slice(0, Math.min(5, sorted.length)));
      return { place: null, cell };
    },
    personality: (c) => 1.2 - 0.6 * c.personality.hogareño,
    indoors: false,
  },
  {
    kind: 'visit',
    need: 'social',
    restorePerHour: { social: 0.7, fun: 0.2 },
    durationH: [1, 2],
    suitability: (ctx) => Math.max(0.1, 1 - ctx.darkness * 1.2) * (0.65 + 0.35 * ctx.weather.outdoorFactor),
    findTarget: (ctx, c) => {
      // Visitar al amigo con más afinidad que esté EN CASA (localizable).
      let best: Citizen | null = null;
      let bestAff = 0.25; // umbral: no visitas a desconocidos
      for (const [id, aff] of c.friends) {
        const f = ctx.citizens.get(id);
        if (!f || aff < bestAff) continue;
        if (f.activity === 'sleep') continue;
        if (f.inside && f.activity !== 'work') {
          best = f;
          bestAff = aff;
        }
      }
      if (!best) return null;
      const b = ctx.index.at(best.home.ax, best.home.az);
      if (!b || !b.entrance) return null;
      return { place: placeOf(b), cell: b.entrance };
    },
    personality: (c) => 0.5 + 1.0 * c.personality.sociable,
    indoors: true,
  },
  {
    kind: 'club',
    need: 'social',
    // Mejor que una visita 1:1: el "tercer lugar" (ciclo 7) rinde más porque
    // ahí confluyen VARIOS del círculo cercano, no solo uno.
    restorePerHour: { social: 1.0, fun: 0.5 },
    durationH: [1, 2],
    suitability: (ctx) => Math.max(0.1, 1 - ctx.darkness * 1.2) * (0.7 + 0.3 * ctx.weather.outdoorFactor),
    findTarget: (ctx, c) => {
      // Un "club" no es una entidad que se guarda: emerge cada vez que 2+
      // amigos de CONFIANZA (afinidad alta, no cualquier conocido) están
      // TAMBIÉN libres y faltos de socializar ahora mismo. Sin coordinación
      // explícita: si varios convergen en el mismo local, el sistema de
      // encuentros (social.ts) ya se encarga de sentarlos a charlar.
      let closeAndFree = 0;
      for (const [id, aff] of c.friends) {
        if (aff < CLUB_AFFINITY) continue;
        const f = ctx.citizens.get(id);
        if (!f || f.inside || f.activity === 'sleep' || f.activity === 'work') continue;
        if (f.needs.social < SOCIAL_THRESHOLD) closeAndFree++;
      }
      if (closeAndFree < 2) return null; // hace falta un CÍRCULO, no un amigo suelto
      const spot = nearestOfRole(ctx, c, 'commerce');
      return spot ? entranceTarget(spot) : null;
    },
    personality: (c) => 0.6 + 0.9 * c.personality.sociable,
    indoors: true,
  },
];

/** Afinidad mínima para considerarse parte del mismo círculo cercano
 * ("club"): muy por encima del umbral de una visita 1:1 (0.25) — hace
 * falta tiempo compartido de verdad, no un simple conocido. */
export const CLUB_AFFINITY = 0.5;

export const ACTIVITY_BY_KIND: Map<ActivityKind, ActivityDef> = new Map(
  ACTIVITIES.map((a) => [a.kind, a]),
);

/** Etiqueta legible para el inspector (T3.10). */
export function activityLabel(kind: ActivityKind, moving: boolean): string {
  const doing: Record<string, string> = {
    sleep: 'Durmiendo',
    work: 'Trabajando',
    school: 'En la escuela',
    clinic: 'En el consultorio',
    club: 'De charla con la pandilla',
    eat: 'Comiendo',
    shop: 'De compras',
    stroll: 'Paseando',
    visit: 'De visita',
    chat: 'Charlando',
    none: 'Sin planes',
  };
  const going: Record<string, string> = {
    sleep: 'Volviendo a casa',
    work: 'Yendo al trabajo',
    school: 'Yendo a la escuela',
    clinic: 'Yendo al consultorio',
    club: 'Yendo a ver a la pandilla',
    eat: 'Volviendo a comer',
    shop: 'Yendo a la tienda',
    stroll: 'Saliendo a pasear',
    visit: 'Yendo de visita',
    chat: 'Acercándose a saludar',
    none: 'Deambulando',
  };
  return (moving ? going : doing)[kind] ?? kind;
}

/** Construye el plan concreto (duración con RNG determinista). */
export function plan(def: ActivityDef, ctx: SimContext, target: { place: PlaceRef | null; cell: CellXZ }): PlannedActivity {
  const [a, b] = def.durationH;
  return {
    activity: def.kind,
    target: target.place,
    cell: target.cell,
    duration: ctx.rng.range(a, b) * 3600,
  };
}
