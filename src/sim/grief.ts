/**
 * Lógica de DUELO (multiuniverso, ciclo 16 de RESEARCH.md — nivel N3
 * pertenencia: es la sombra del vínculo). Cuando alguien pierde a su pareja o a
 * un amigo íntimo (muerte del ciclo 3 de vida, o emigración del ciclo 14), el
 * superviviente NO sigue como si nada: entra en duelo. El duelo `grief` [0,1]
 * salta al perder el vínculo y decae en ~días; mientras dura, APAGA LA ALEGRÍA
 * (cuesta disfrutar: la diversión se escurre más rápido de lo que se puede
 * reponer) y retrae un poco (menos ganas de compañía). NO toca la salud ni la
 * población: es un peso del ánimo, no una causa de muerte — se emigra o se muere
 * por otras lógicas, no por tristeza (decisión deliberada para no perturbar la
 * dinámica demográfica, ya de por sí sensible; ver bitácora ciclos 5/15).
 *
 * Datos puros, sin THREE. Acoplamientos: life (quién muere), social (quién era
 * íntimo), needs (dónde pega).
 */
import { Citizen } from './citizens/citizen';

/** Golpe de duelo al perder a la PAREJA — el vínculo más fuerte. */
export const GRIEF_PARTNER = 0.85;
/** Golpe al perder a un AMIGO íntimo (afinidad alta). Más leve que la pareja. */
export const GRIEF_FRIEND = 0.35;
/** Afinidad a partir de la cual la pérdida de un amigo se siente como duelo. */
export const GRIEF_FRIEND_AFFINITY = 0.55;
/** Recuperación por hora EN SOLEDAD: se pasa el duelo en ~10 días de juego. */
const GRIEF_RECOVERY_PER_HOUR = 1 / 240;
/** Consuelo por hora EN COMPAÑÍA (charlando/visitando): el duelo se lleva mucho
 * mejor acompañado — ~4× más rápido que a solas (ciclo 17). Es el otro lado del
 * bucle: el duelo empuja a buscar gente (drena `social`) y la gente consuela. */
export const GRIEF_CONSOLE_PER_HOUR = 1 / 60;
/** A pleno duelo, la diversión se escurre a este ritmo por hora (además del
 * decaimiento normal): por eso a un doliente no le levanta el ánimo nada. */
const GRIEF_FUN_DRAIN_PER_HOUR = 1 / 14;
/** El duelo también retrae un poco de la vida social (menos, la compañía consuela). */
const GRIEF_SOCIAL_DRAIN_PER_HOUR = 1 / 40;

/** Aplica un golpe de duelo (no baja nunca; se acumula hacia 1). */
export function bereave(c: Citizen, amount: number): void {
  c.grief = Math.min(1, c.grief + amount);
}

/** Un tick de duelo. Se llama SIEMPRE (como la salud): el duelo es un fondo del
 * ánimo, no una actividad. Apaga la alegría proporcional al duelo y lo deja
 * decaer despacio. */
export function griefTick(c: Citizen, hours: number): void {
  if (c.grief <= 0) return;
  c.needs.fun = Math.max(0, c.needs.fun - GRIEF_FUN_DRAIN_PER_HOUR * c.grief * hours);
  c.needs.social = Math.max(0, c.needs.social - GRIEF_SOCIAL_DRAIN_PER_HOUR * c.grief * hours);
  c.grief = Math.max(0, c.grief - GRIEF_RECOVERY_PER_HOUR * hours);
}

/** Consuelo (ciclo 17): estar en compañía (visita/club/fiesta) alivia el duelo
 * más deprisa que el paso del tiempo a solas. Se llama ADEMÁS del `griefTick`
 * cuando el ciudadano está acompañado, sin saber de quién (actividad grupal). */
export function consoleGrief(c: Citizen, hours: number): void {
  if (c.grief <= 0) return;
  c.grief = Math.max(0, c.grief - GRIEF_CONSOLE_PER_HOUR * hours);
}

/** Bonus de consuelo cuando el que acompaña TAMBIÉN pena (duelo compartido). */
const SHARED_GRIEF_BONUS = 1.5;

/** Consuelo de una charla CARA A CARA (ciclo 19): no consuela igual cualquiera.
 * Un ÍNTIMO (afinidad alta) alivia más que un conocido de vista; y quien también
 * está de duelo, aún más — nadie entiende una pérdida como otro doliente. */
export function consoleGriefBy(c: Citizen, other: Citizen, hours: number): void {
  if (c.grief <= 0) return;
  const affinity = c.friends.get(other.id) ?? 0;
  const intimacy = 0.4 + 0.6 * Math.min(1, Math.max(0, affinity)); // 0.4 (conocido) … 1.0 (íntimo)
  const shared = other.grief > 0 ? SHARED_GRIEF_BONUS : 1;
  c.grief = Math.max(0, c.grief - GRIEF_CONSOLE_PER_HOUR * intimacy * shared * hours);
}
