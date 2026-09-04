/**
 * Banco de render H2. No crea ciudadanos de la simulación: entrega una nube
 * determinista de vistas para comprobar el límite de instancias con
 * `?stress=N`, sin alterar población, economía ni guardado de la partida.
 */
import { AgentView } from '../../sim/client';
import { AgentState, TravelModeCode } from '../../sim/protocol';

export const MAX_STRESS_AGENTS = 12_000;

export function stressCountFrom(value: string | null): number {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(MAX_STRESS_AGENTS, Math.floor(count));
}

/** Crea una sola vez una retícula compacta de peatones que atraviesan la vista. */
export function makeStressAgents(count: number): AgentView[] {
  const safeCount = Math.min(MAX_STRESS_AGENTS, Math.max(0, Math.floor(count)));
  const side = Math.ceil(Math.sqrt(safeCount));
  const agents: AgentView[] = [];
  for (let id = 0; id < safeCount; id++) {
    const col = id % side;
    const row = Math.floor(id / side);
    agents.push({
      id,
      x: (col - (side - 1) / 2) * 0.62,
      z: (row - (side - 1) / 2) * 0.62,
      heading: (id % 4) * Math.PI / 2,
      state: AgentState.Walking,
      activity: 0,
      mode: TravelModeCode.Foot,
      grief: 0,
    });
  }
  return agents;
}
