/**
 * Lógica de VIDA (multiuniverso de lógicas, ver SIMULATION.md §5.b):
 * envejecimiento, parejas, nacimientos y muerte. Datos puros, tick DIARIO.
 *
 * Convención temporal: 1 día de juego = 1 año de vida (la escala íntima del
 * juego: en una sesión ves generaciones). Acoplamientos explícitos:
 * - social: las parejas nacen de la afinidad ya cultivada en charlas.
 * - vivienda: la pareja se muda a un solo hogar (libera hueco → growth).
 * - economía: la muerte libera el puesto (el llamador reconstruye/contrata).
 */
import { Citizen } from './citizens/citizen';
import { SocialSystem } from './citizens/social';
import { Rng } from '../rng';

export const ADULT_AGE = 18;
/** Edad desde la que la muerte empieza a rondar (y la salud, ciclo 5, decae más). */
export const OLD_AGE = 72;
/**
 * Prob. de muerte por año una vez mayor (rampa suave por edad), modulada por
 * `health` [0,1] (ciclo 5 de RESEARCH.md, acoplamiento pendiente desde
 * entonces): un anciano sano (salud 1) aguanta la mitad de riesgo que la
 * rampa base; uno desatendido (salud 0) lo eleva un 50%. Neutro en 0.5 (el
 * valor típico de un adulto sin crisis) para no desestabilizar la curva ya
 * calibrada. La edad sigue siendo la puerta: sin ella, la salud no mata.
 */
export function deathChance(age: number, health: number): number {
  if (age < OLD_AGE) return 0;
  const base = Math.min(0.5, (age - OLD_AGE) / 25);
  const healthFactor = 1 + (0.5 - health);
  return Math.min(0.5, base * healthFactor);
}

/** Afinidad mínima para emparejarse. */
const PAIR_AFFINITY = 0.45;
/** Prob. de hijo por año de pareja fértil. */
const BIRTH_CHANCE = 0.22;
const FERTILE_MAX = 45;

export interface LifeEvents {
  deaths: Citizen[];
  births: Array<{ home: Citizen['home']; parents: [Citizen, Citizen] }>;
  couples: Array<[Citizen, Citizen]>;
}

/**
 * Un año de vida para todos. NO muta población (nacer/morir): devuelve los
 * hechos y el orquestador los aplica (spawn/despawn tocan índices que esta
 * lógica no debe conocer).
 */
export function lifeYear(citizens: Map<number, Citizen>, rng: Rng): LifeEvents {
  const out: LifeEvents = { deaths: [], births: [], couples: [] };

  for (const c of citizens.values()) {
    c.age += 1;
    if (rng.next() < deathChance(c.age, c.health)) out.deaths.push(c);
  }
  const dead = new Set(out.deaths.map((d) => d.id));

  // Emparejamiento: solteros adultos con afinidad alta. Orden determinista.
  const singles = [...citizens.values()].filter(
    (c) => !dead.has(c.id) && c.partnerId === null && c.age >= ADULT_AGE,
  );
  const taken = new Set<number>();
  for (const a of singles) {
    if (taken.has(a.id)) continue;
    let best: Citizen | null = null;
    let bestAff = PAIR_AFFINITY;
    for (const [id, aff] of a.friends) {
      if (aff < bestAff || taken.has(id) || dead.has(id)) continue;
      const b = citizens.get(id);
      if (!b || b.partnerId !== null || b.age < ADULT_AGE) continue;
      if (Math.abs(a.age - b.age) > 15) continue;
      best = b;
      bestAff = aff;
    }
    if (!best) continue;
    a.partnerId = best.id;
    best.partnerId = a.id;
    taken.add(a.id);
    taken.add(best.id);
    // Se mudan juntos: al hogar de quien tenga la afinidad como ancla (a).
    best.home = { ...a.home };
    SocialSystem.acquaint(a, best, 0.3);
    out.couples.push([a, best]);
  }

  // Nacimientos: parejas fértiles conviviendo.
  const seen = new Set<number>();
  for (const c of citizens.values()) {
    if (dead.has(c.id) || c.partnerId === null || seen.has(c.id)) continue;
    const p = citizens.get(c.partnerId);
    if (!p || dead.has(p.id)) continue;
    seen.add(c.id);
    seen.add(p.id);
    if (Math.min(c.age, p.age) >= FERTILE_MAX) continue;
    if (rng.next() < BIRTH_CHANCE) out.births.push({ home: { ...c.home }, parents: [c, p] });
  }

  return out;
}
