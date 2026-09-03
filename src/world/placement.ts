/** Validación espacial compartida por herramientas, fantasma y simulación.
 * No decide qué construir ni muta el grid: solo devuelve el primer motivo de
 * rechazo observable para que ambos hilos tengan exactamente la misma regla. */
import type { Grid, Rot } from './grid';
import { rotatedFootprint } from './grid';
import type { RejectReason } from '../sim/protocol';

export interface PlacementOptions {
  /** Celdas de respeto alrededor de la huella (crecimiento autónomo). */
  margin?: 0 | 1;
  /** Los senderos existentes sí pueden quedar bajo una construcción. */
  allowPath?: boolean;
}

export function placementCheck(
  grid: Grid,
  w: number,
  d: number,
  cx: number,
  cz: number,
  rot: Rot,
  options: PlacementOptions = {},
): RejectReason | null {
  const margin = options.margin ?? 0;
  const allowPath = options.allowPath ?? false;
  const [fw, fd] = rotatedFootprint(w, d, rot);
  for (let x = cx - margin; x < cx + fw + margin; x++) {
    for (let z = cz - margin; z < cz + fd + margin; z++) {
      const cell = grid.get(x, z);
      if (!cell) return 'outOfWorld';
      const inFootprint = x >= cx && x < cx + fw && z >= cz && z < cz + fd;
      if (!inFootprint) {
        // El margen protege de solapes y agua, pero no penaliza una vía que
        // sirve precisamente de fachada para el crecimiento.
        if (cell.building) return 'blocked';
        if (cell.terrain === 'water') return 'water';
        continue;
      }
      if (cell.building) return 'blocked';
      if (cell.terrain === 'water') return 'water';
      if (cell.terrain === 'road') return 'road';
      if (cell.terrain === 'path' && !allowPath) return 'road';
    }
  }
  return null;
}
