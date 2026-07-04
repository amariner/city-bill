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

// --- Acoplamiento salud→mortalidad (ciclo 11 de RESEARCH.md) ------------------
// La edad marca el riesgo BASE; la fragilidad (mala salud) lo MULTIPLICA, y una
// enfermedad crítica puede matar incluso al joven. Un cuerpo sano (health=1) no
// altera la curva de siempre: el acoplamiento solo "muerde" a quien está frágil.
/** Cuánto multiplica la peor salud el riesgo por edad (health 0 → ×(1+esto)). */
const FRAILTY_STRENGTH = 2;
/** Salud por debajo de la cual la enfermedad mata por sí sola (aún joven). */
export const ILLNESS_HEALTH = 0.2;
/** Prob. anual máxima de morir por enfermedad crítica (salud 0). */
const ILLNESS_MAX = 0.08;

/**
 * Prob. de muerte por año. `health` [0,1] la modula (ciclo 11): la fragilidad
 * multiplica el riesgo por edad y la enfermedad crítica añade su propio riesgo.
 * Con salud plena equivale exactamente a la curva de edad original.
 */
export function deathChance(age: number, health = 1): number {
  const h = Math.min(1, Math.max(0, health));
  const base = age < OLD_AGE ? 0 : Math.min(0.5, (age - OLD_AGE) / 25);
  const frailty = 1 + FRAILTY_STRENGTH * (1 - h);
  const illness = h < ILLNESS_HEALTH ? (ILLNESS_MAX * (ILLNESS_HEALTH - h)) / ILLNESS_HEALTH : 0;
  return Math.min(0.6, base * frailty + illness);
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
