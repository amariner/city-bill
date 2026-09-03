/** Acciones del jugador: validación y replay sin dependencias del render. */
import type { Simulation } from './simulation';
import type { PlayerAction, RejectReason, RecordedAction } from './protocol';
import { catalogData } from '../world/catalogData';
import { placementCheck } from '../world/placement';

export type ActionResult =
  | { ok: true; cost: number }
  | { ok: false; reason: RejectReason; detail?: string };

/** Aplica únicamente el subconjunto de acciones disponible en H1.2. Las
 * acciones de calles, zonas, presupuesto y transporte se habilitan en sus
 * respectivos hitos y se rechazan de forma explícita mientras tanto. */
export function applyPlayerAction(sim: Simulation, action: PlayerAction): ActionResult {
  switch (action.kind) {
    case 'place': {
      const item = catalogData(action.id);
      if (!item) return { ok: false, reason: 'invalid', detail: `edificio desconocido: ${action.id}` };
      if (item.role === 'nature' || item.role === 'infra') return { ok: false, reason: 'notPlayerPlaceable' };
      if (item.tier > sim.tier) return { ok: false, reason: 'tierLocked' };
      const reason = placementCheck(sim.grid, item.w, item.d, action.cx, action.cz, action.rot, {
        margin: 0,
        allowPath: false,
      });
      if (reason) return { ok: false, reason };
      if (!sim.placeBuildingForPlayer(action.id, action.cx, action.cz, action.rot)) {
        return { ok: false, reason: 'blocked' };
      }
      return { ok: true, cost: 0 };
    }
    case 'bulldoze':
      if (!sim.grid.buildingAt(action.cx, action.cz)) return { ok: false, reason: 'notFound' };
      return sim.removeBuildingAt(action.cx, action.cz)
        ? { ok: true, cost: 0 }
        : { ok: false, reason: 'notFound' };
    default:
      return { ok: false, reason: 'invalid', detail: `acción no disponible: ${action.kind}` };
  }
}

/** Reproduce una secuencia de acciones en los ticks en que fue aceptada.
 * Aplicar la acción después de avanzar al mismo tick conserva el orden de
 * consumo del RNG que tuvo la partida original. */
export function replayActions(sim: Simulation, actions: readonly RecordedAction[], endTick?: number): void {
  const ordered = [...actions].sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  for (const recorded of ordered) {
    while (sim.clock.tick < recorded.tick) sim.step();
    if (sim.clock.tick !== recorded.tick) throw new Error(`acción ${recorded.seq} fuera de orden en tick ${recorded.tick}`);
    const result = sim.applyAction(recorded.action, recorded.seq);
    if (!result.ok) throw new Error(`replay rechazó la acción ${recorded.seq}: ${result.reason}`);
  }
  if (endTick !== undefined) {
    while (sim.clock.tick < endTick) sim.step();
    if (sim.clock.tick !== endTick) throw new Error(`fin de replay fuera de tick: ${endTick}`);
  }
}
