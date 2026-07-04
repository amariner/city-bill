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
/** Recuperación por hora: se pasa el duelo en ~10 días de juego. */
const GRIEF_RECOVERY_PER_HOUR = 1 / 240;
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
