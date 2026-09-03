/** Acciones del jugador: validación y replay sin dependencias del render. */
import type { Simulation } from './simulation';
import type { PlayerAction, RejectReason, RecordedAction, RoadKind } from './protocol';
import { catalogData } from '../world/catalogData';
import { placementCheck } from '../world/placement';
import { paintRoadPlan, planRoad, previewRoad, ROAD_SPECS } from '../world/roads';
import { buildBusLine } from './transit';

export type ActionResult =
  | { ok: true; cost: number }
  | { ok: false; reason: RejectReason; detail?: string };

const ROAD_TIERS: Record<RoadKind, number> = { path: 0, rural: 1, street: 2, avenue: 3 };

/** Aplica las acciones disponibles al alcalde. Cada acción aceptada es
 * determinista y queda registrada para replay en el llamador. */
export function applyPlayerAction(sim: Simulation, action: PlayerAction): ActionResult {
  switch (action.kind) {
    case 'place': {
      const item = catalogData(action.id);
      if (!item) return { ok: false, reason: 'invalid', detail: `edificio desconocido: ${action.id}` };
      if (sim.economy.bankrupt || sim.economy.updateBankruptcy(sim.citizens.size)) {
        return { ok: false, reason: 'bankrupt', detail: 'el tesoro está en quiebra' };
      }
      if (item.playerPlaceable !== true) return { ok: false, reason: 'notPlayerPlaceable' };
      if (item.tier > sim.tier) return { ok: false, reason: 'tierLocked' };
      const cost = item.cost ?? 0;
      if (sim.economy.treasury < cost) return { ok: false, reason: 'noMoney', detail: `faltan fondos para ${item.name}` };
      const reason = placementCheck(sim.grid, item.w, item.d, action.cx, action.cz, action.rot, {
        margin: 0,
        allowPath: false,
      });
      if (reason) return { ok: false, reason };
      if (!sim.placeBuildingForPlayer(action.id, action.cx, action.cz, action.rot)) {
        return { ok: false, reason: 'blocked' };
      }
      // La validación anterior y la colocación ocurren en el mismo hilo: el
      // débito no puede fallar entre ambas operaciones.
      if (!sim.economy.spendPublic(cost, 'build')) throw new Error('tesoro incoherente al cobrar una obra');
      return { ok: true, cost };
    }
    case 'bulldoze':
      if (!sim.grid.buildingAt(action.cx, action.cz)) return { ok: false, reason: 'notFound' };
      return sim.removeBuildingAt(action.cx, action.cz)
        ? { ok: true, cost: 0 }
        : { ok: false, reason: 'notFound' };
    case 'road': {
      if (sim.economy.bankrupt || sim.economy.updateBankruptcy(sim.citizens.size)) {
        return { ok: false, reason: 'bankrupt', detail: 'el tesoro está en quiebra' };
      }
      if (ROAD_TIERS[action.road] > sim.tier) return { ok: false, reason: 'tierLocked', detail: `vía aún no desbloqueada: ${action.road}` };
      const plan = planRoad(action.from, action.to);
      if (plan.length === 0) return { ok: false, reason: 'invalid', detail: 'la vía necesita origen y destino distintos' };
      const preview = previewRoad(sim.grid, plan, action.road);
      if (preview.laid.length === 0) {
        return preview.blocked.length > 0
          ? { ok: false, reason: 'blocked', detail: 'la calzada encuentra un obstáculo al salir' }
          : { ok: false, reason: 'invalid', detail: 'no hay terreno conocido para trazar la vía' };
      }
      if (sim.economy.treasury < preview.cost) {
        return { ok: false, reason: 'noMoney', detail: `faltan fondos para ${action.road}` };
      }
      const painted = paintRoadPlan(sim.grid, plan, action.road, sim.seed);
      if (painted.laid.length === 0) {
        return painted.blocked.length > 0
          ? { ok: false, reason: 'blocked', detail: 'la calzada encuentra un obstáculo al salir' }
          : { ok: false, reason: 'invalid', detail: 'no hay terreno conocido para trazar la vía' };
      }
      if (!sim.economy.spendPublic(painted.cost, 'road')) throw new Error('tesoro incoherente al cobrar una vía');
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
    case 'setTax': {
      if (!['R', 'C', 'I'].includes(action.sector)) return { ok: false, reason: 'invalid', detail: 'sector fiscal desconocido' };
      if (!Number.isFinite(action.rate)) return { ok: false, reason: 'invalid', detail: 'tipo fiscal no numérico' };
      sim.economy.taxRates[action.sector] = Math.max(0, Math.min(0.5, action.rate));
      return { ok: true, cost: 0 };
    }
    case 'loan': {
      const loan = sim.economy.takeLoan(action.tier);
      if (!loan) return { ok: false, reason: 'invalid', detail: 'ya existe un préstamo vivo de ese tramo' };
      sim.economy.updateBankruptcy(sim.citizens.size);
      return { ok: true, cost: 0 };
    }
    case 'repayLoan': {
      const loan = sim.economy.loans.find((candidate) => candidate.id === action.id);
      if (!loan) return { ok: false, reason: 'notFound', detail: 'préstamo desconocido' };
      if (sim.economy.treasury < loan.balance) return { ok: false, reason: 'noMoney', detail: 'faltan fondos para cancelar el préstamo' };
      const paid = sim.economy.repayLoan(action.id);
      if (paid <= 0) return { ok: false, reason: 'invalid', detail: 'no se pudo cancelar el préstamo' };
      sim.economy.updateBankruptcy(sim.citizens.size);
      return { ok: true, cost: paid };
    }
    case 'setPolicy':
      if (action.policy === 'growth') {
        sim.growthPolicy = action.value;
        return { ok: true, cost: 0 };
      }
      if (action.policy === 'publicAutobuild') {
        sim.publicAutobuild = action.value;
        return { ok: true, cost: 0 };
      }
      return { ok: false, reason: 'invalid', detail: 'política aún no disponible' };
    case 'busLine': {
      if (action.op === 'create') {
        const stops = action.stops ?? [];
        const keys = new Set(stops.map(([cx, cz]) => `${cx},${cz}`));
        if (stops.length < 2 || stops.length > 12 || keys.size !== stops.length) {
          return { ok: false, reason: 'invalid', detail: 'una línea necesita entre 2 y 12 paradas distintas' };
        }
        const previewLine = buildBusLine(0, stops);
        if (!previewLine) return { ok: false, reason: 'invalid', detail: 'línea de bus inválida' };
        for (const [cx, cz] of stops) {
          const cell = sim.grid.get(cx, cz);
          if (!cell || cell.terrain !== 'road') {
            return { ok: false, reason: 'blocked', detail: 'cada parada debe estar sobre una calzada' };
          }
        }
        if (previewLine.route.some(([cx, cz]) => sim.grid.get(cx, cz)?.terrain !== 'road')) {
          return { ok: false, reason: 'blocked', detail: 'la ruta completa debe seguir una calzada' };
        }
        const id = sim.createBusLine(stops);
        return id === null
          ? { ok: false, reason: 'invalid', detail: 'no se pudo construir la línea' }
          : { ok: true, cost: 0 };
      }
      if (action.lineId === undefined || !sim.deleteBusLine(action.lineId)) {
        return { ok: false, reason: 'notFound', detail: 'línea de bus desconocida' };
      }
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
