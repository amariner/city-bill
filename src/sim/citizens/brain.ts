/**
 * Cerebro utility-AI (T3.4). Puntúa cada actividad posible:
 *
 *   score = urgencia(need) × idoneidad(hora) × cercanía × personalidad × ruido
 *
 * y elige la mejor. CERO horarios fijos: el día coherente (dormir de noche,
 * trabajar de día, comer al tener hambre) EMERGE de las curvas.
 */
import { Citizen, PlannedActivity } from './citizen';
import { urgency } from './needs';
import { ACTIVITIES, SimContext, plan } from './activities';
import { manhattan } from '../geometry';
import { WORK_BLOCK_HEALTH } from '../health';

/** Distancia a partir de la cual ir andando "pesa" la mitad en el score. */
const HALF_DISTANCE = 60; // celdas = 120 m

export function chooseActivity(c: Citizen, ctx: SimContext): PlannedActivity | null {
  let best: PlannedActivity | null = null;
  let bestScore = 0.05; // umbral de apatía: por debajo, seguir como estás

  for (const def of ACTIVITIES) {
    const u = def.urgencyOverride ? def.urgencyOverride(c) : urgency(c.needs[def.need]);
    if (u <= 0.02) continue; // depósito lleno: ni lo considera
    // Los desempleados no puntúan 'work' (su purpose decae igual: presión
    // para aceptar el empleo que economy.ts les ofrezca).
    if (def.kind === 'work' && !c.work) continue;
    // Demasiado enfermo para trabajar (lógica de salud, ciclo 5).
    if (def.kind === 'work' && c.health < WORK_BLOCK_HEALTH) continue;
    if (def.eligible && !def.eligible(c)) continue;

    const suit = def.suitability(ctx, c);
    if (suit <= 0.01) continue;

    const target = def.findTarget(ctx, c);
    if (!target) continue;

    const dist = manhattan([Math.round(c.x), Math.round(c.z)], target.cell);
    const proximity = HALF_DISTANCE / (HALF_DISTANCE + dist);
    const pers = def.personality(c);
    const noise = 0.85 + 0.3 * ctx.rng.next(); // determinista (RNG con semilla)

    const score = u * suit * proximity * pers * noise;
    if (score > bestScore) {
      bestScore = score;
      best = plan(def, ctx, target);
    }
  }
  return best;
}
