/**
 * Lógica de CLIMA Y ESTACIONES (multiuniverso, ciclo 6 — nivel N0 física).
 * Puramente derivada del día de juego: NADA de estado mutable propio (no
 * rompe el determinismo ni el guardado). Cada día tiene una estación fija
 * por el calendario y un tiempo (lluvia/frío) derivado de un RNG propio
 * sembrado por (seed, día) — así dos partidas con la misma semilla tienen
 * exactamente el mismo tiempo el mismo día, sin consumir el RNG general.
 *
 * Acopla con actividades: llover o hacer frío hace que pasear/comprar/
 * visitar pierdan idoneidad (la gente prefiere quedarse en casa) — sin
 * ningún `if season === 'invierno'` en brain.ts, solo un factor continuo.
 * El render (paleta estacional, T5.1 del ROADMAP) es tarea aparte para Sonnet.
 */
import { createRng } from '../rng';

export type Season = 'primavera' | 'verano' | 'otoño' | 'invierno';
const SEASONS: Season[] = ['invierno', 'primavera', 'verano', 'otoño'];
/** Días de juego por estación (año de 4 estaciones iguales). */
const DAYS_PER_SEASON = 20;

export interface Weather {
  season: Season;
  /** [0,1]: 0 templado, 1 crudo (frío en invierno, bochorno en verano). */
  harshness: number;
  rain: boolean;
  /** Factor único [0.15,1] para modular idoneidad de actividades al aire libre. */
  outdoorFactor: number;
}

function seasonAt(day: number): Season {
  return SEASONS[Math.floor(day / DAYS_PER_SEASON) % SEASONS.length];
}

/** Días de un año completo (4 estaciones). */
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;

/**
 * Calidez estacional CONTINUA [-1,1] para el crossfade visual (T5.1): −1 en el
 * corazón del invierno, +1 en el del verano, cruzando suave por primavera/otoño.
 * Pura y determinista (solo el día); la usa el render para graduar luz y cielo.
 * SEASONS = [invierno(0-20), primavera, verano(40-60), otoño] → el invierno cae
 * en el centro del primer bloque (día≈10) y el verano en el tercero (día≈50).
 */
export function seasonalWarmth(day: number): number {
  const p = ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR / DAYS_PER_YEAR; // [0,1)
  const winterCenter = (0.5 * DAYS_PER_SEASON) / DAYS_PER_YEAR; // centro del invierno
  return -Math.cos(2 * Math.PI * (p - winterCenter));
}

/** Nombre de la fiesta según la ESTACIÓN en que cae (ciclo 22): una fiesta de
 * verano no es la de la cosecha — le da identidad cultural al calendario. Pura. */
export function seasonalFestivalName(day: number): string {
  switch (seasonAt(day)) {
    case 'invierno': return 'fiesta de invierno';
    case 'primavera': return 'fiesta de primavera';
    case 'verano': return 'verbena de verano';
    case 'otoño': return 'fiesta de la cosecha';
  }
}

/** Determinista por (seed, día): no consume el RNG general de la sim. */
export function weatherAt(seed: number, day: number): Weather {
  const season = seasonAt(day);
  const rng = createRng((seed ^ 0xa5a5a5a5) + day * 2654435761);
  const rainChance = season === 'otoño' ? 0.4 : season === 'invierno' ? 0.3 : season === 'primavera' ? 0.25 : 0.1;
  const rain = rng.next() < rainChance;
  const baseHarsh = season === 'invierno' || season === 'verano' ? 0.5 : 0.15;
  const harshness = Math.min(1, baseHarsh + rng.range(-0.15, 0.35) + (rain ? 0.15 : 0));
  // A más crudeza (y lluvia), menos ganas de estar fuera; nunca cero: la
  // vida no se detiene, solo se retrae (personalidad ya module el resto).
  const outdoorFactor = Math.max(0.15, 1 - harshness * 0.75 - (rain ? 0.2 : 0));
  return { season, harshness, rain, outdoorFactor };
}
