/**
 * Lógica de SALUD (multiuniverso, ciclo 5 de RESEARCH.md — nivel N2 seguridad).
 * `health` [0,1] es un depósito lento: decae si el cuerpo lleva tiempo sin
 * cubrir lo básico (hambre/sueño crónicos) y decae algo más solo por la edad;
 * se recupera despacio descansando, y rápido en la clínica. Por debajo de un
 * umbral el cuerpo ya no rinde en el trabajo (bloquea 'work' en brain.ts) y
 * por debajo de otro más alto ya "apetece" ir a la clínica (utility AI, sin
 * guion). NO toca la lógica de vida (mortalidad): eso es un acoplamiento
 * futuro anotado en la bitácora, deliberadamente no cerrado aún.
 */
import { Citizen } from './citizens/citizen';
import { OLD_AGE } from './lifecycle';

/** Por debajo de esto, ya no se puede trabajar (demasiado enfermo). */
export const WORK_BLOCK_HEALTH = 0.25;
/** Por debajo de esto, la utility AI empieza a valorar ir a la clínica. */
export const SEEK_CLINIC_HEALTH = 0.55;
/** Recuperación pasiva por hora (descansando en casa, con needs cubiertas). */
const PASSIVE_RECOVERY_PER_HOUR = 1 / 200;
/** Recuperación en clínica, muy por encima de la pasiva. */
export const CLINIC_RECOVERY_PER_HOUR = 1 / 8;
/** Decaimiento por hora cuando `need` está por debajo de 0.2 (crónico). */
const CHRONIC_DECAY_PER_HOUR = 1 / 120;
/** Decaimiento extra por hora solo por ser mayor (fragilidad). */
const ELDER_DECAY_PER_HOUR = 1 / 400;

/** Un tick de salud para un ciudadano. Se llama SIEMPRE (no solo si "hace"
 * algo): la salud es un fondo, no una actividad. */
export function healthTick(c: Citizen, hours: number): void {
  let delta = 0;
  if (c.needs.food < 0.2) delta -= CHRONIC_DECAY_PER_HOUR * hours;
  if (c.needs.energy < 0.2) delta -= CHRONIC_DECAY_PER_HOUR * hours;
  if (c.age >= OLD_AGE) delta -= ELDER_DECAY_PER_HOUR * hours;
  if (delta === 0 && c.activity !== 'clinic') delta += PASSIVE_RECOVERY_PER_HOUR * hours;
  c.health = Math.min(1, Math.max(0, c.health + delta));
}
