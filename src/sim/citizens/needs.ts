/**
 * Necesidades del ciudadano: valores [0,1] que DECAEN con el tiempo y se
 * restauran haciendo actividades. La urgencia crece de forma no lineal al
 * vaciarse — de ahí emerge el patrón día/noche sin ningún horario fijo.
 */
import { Personality } from './citizen';

export interface Needs {
  /** Sueño. Se restaura durmiendo. */
  energy: number;
  /** Saciedad. Comer en casa o comprar comida. */
  food: number;
  /** Compañía. Charlas y visitas. */
  social: number;
  /** Ocio/variedad. Paseos, compras, escaparates. */
  fun: number;
  /** Propósito/deber. Se restaura trabajando (los desempleados la ignoran). */
  purpose: number;
}

export type NeedKey = keyof Needs;

export const NEED_KEYS: NeedKey[] = ['energy', 'food', 'social', 'fun', 'purpose'];

/** Decaimiento base por HORA de juego (fracción del depósito). */
const DECAY_PER_HOUR: Needs = {
  energy: 1 / 18, // aguanta ~18 h despierto
  food: 1 / 7, // hambre cada ~7 h
  social: 1 / 16,
  fun: 1 / 14,
  purpose: 1 / 12,
};

/** La personalidad modula el decaimiento: un sociable "gasta" social antes;
 * un trabajador siente antes el gusanillo del deber. */
export function decayRate(need: NeedKey, p: Personality): number {
  const base = DECAY_PER_HOUR[need];
  switch (need) {
    case 'social':
      return base * (0.6 + 0.8 * p.sociable);
    case 'purpose':
      return base * (0.5 + 1.0 * p.trabajador);
    case 'fun':
      return base * (1.2 - 0.5 * p.hogareño);
    default:
      return base;
  }
}

export function decayNeeds(needs: Needs, p: Personality, gameHours: number): void {
  for (const k of NEED_KEYS) {
    needs[k] = Math.max(0, needs[k] - decayRate(k, p) * gameHours);
  }
}

/**
 * Urgencia [0,~1.5]: cuadrática al vaciarse + "pánico" extra por debajo de 0.25.
 * Con el depósito lleno es ~0: nadie come dos veces seguidas.
 */
export function urgency(value: number): number {
  const lack = 1 - value;
  const panic = value < 0.25 ? (0.25 - value) * 2 : 0;
  return lack * lack + panic;
}

export function restore(needs: Needs, key: NeedKey, amount: number): void {
  needs[key] = Math.min(1, needs[key] + amount);
}
