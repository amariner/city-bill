/** Acciones del jugador: validación y replay sin dependencias del render. */
import type { Simulation } from './simulation';
import type { PlayerAction, RejectReason, RecordedAction, RoadKind } from './protocol';
import { catalogData } from '../world/catalogData';
import { placementCheck } from '../world/placement';
import { paintRoadPlan, planRoad, ROAD_SPECS } from '../world/roads';

export type ActionResult =
  | { ok: true; cost: number }
  | { ok: false; reason: RejectReason; detail?: string };

const ROAD_TIERS: Record<RoadKind, number> = { path: 0, rural: 1, street: 2, avenue: 3 };

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
    case 'road': {
      if (ROAD_TIERS[action.road] > sim.tier) return { ok: false, reason: 'tierLocked', detail: `vía aún no desbloqueada: ${action.road}` };
      const plan = planRoad(action.from, action.to);
      if (plan.length === 0) return { ok: false, reason: 'invalid', detail: 'la vía necesita origen y destino distintos' };
      const painted = paintRoadPlan(sim.grid, plan, action.road, sim.seed);
      if (painted.laid.length === 0) {
        return painted.blocked.length > 0
          ? { ok: false, reason: 'blocked', detail: 'la calzada encuentra un obstáculo al salir' }
          : { ok: false, reason: 'invalid', detail: 'no hay terreno conocido para trazar la vía' };
      }
      sim.index.rebuild();
      sim.economy.rebuild(sim.index, sim.citizens);
      sim.roadsExtended++;
      sim.events.push({ name: 'roadBuilt', data: {
        road: action.road,
        cells: painted.laid.length,
        cost: painted.cost,
        byPlayer: true,
        speed: ROAD_SPECS[action.road].speed,
      } });
      return { ok: true, cost: painted.cost };
    }
    case 'zone': {
      let eligible = 0;
      const zone = action.zone ?? undefined;
      const x0 = Math.min(action.x0, action.x1);
      const x1 = Math.max(action.x0, action.x1);
      const z0 = Math.min(action.z0, action.z1);
      const z1 = Math.max(action.z0, action.z1);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const cell = sim.grid.get(cx, cz);
          if (!cell || cell.building || cell.terrain === 'road' || cell.terrain === 'water') continue;
          eligible++;
          if (cell.zone !== zone) {
            sim.grid.setZone(cx, cz, zone);
          }
        }
      }
      if (eligible === 0) return { ok: false, reason: 'blocked', detail: 'no hay parcelas libres para zonificar' };
      // Un repintado idéntico sigue siendo una acción válida: conserva la
      // intención del jugador y hace que el replay sea fiel aunque no cambie
      // ninguna celda en ese momento.
      sim.index.rebuild();
      sim.economy.rebuild(sim.index, sim.citizens);
      return { ok: true, cost: 0 };
    }
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
