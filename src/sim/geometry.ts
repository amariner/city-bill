/**
 * Geometría de sim compartida: transitabilidad, entradas de edificio y
 * utilidades de celdas. Sin THREE. La usan pathfinding, worldIndex y
 * actividades.
 */
import { Grid, Cell, Rot, rotatedFootprint } from '../world/grid';

export type CellXZ = [number, number];

const TERRAIN_COST: Record<string, number> = {
  road: 1,
  path: 1.05,
  grass: 1.6,
  field: 2.4,
};

export function walkCost(cell: Cell | undefined): number | null {
  if (!cell) return null;
  if (cell.building) return null;
  const c = TERRAIN_COST[cell.terrain];
  return c ?? null;
}

export function isWalkable(grid: Grid, cx: number, cz: number): boolean {
  return walkCost(grid.get(cx, cz)) !== null;
}

export const rotatedSize: (w: number, d: number, rot: Rot) => [number, number] = rotatedFootprint;

/** Celda transitable adyacente al footprint de un edificio anclado en (ax,az).
 * Preferimos la de menor coste (una acera/camino antes que campo). */
export function buildingEntrance(grid: Grid, ax: number, az: number, fw: number, fd: number): CellXZ | null {
  let best: CellXZ | null = null;
  let bestCost = Infinity;
  const consider = (cx: number, cz: number) => {
    const c = walkCost(grid.get(cx, cz));
    if (c !== null && c < bestCost) {
      bestCost = c;
      best = [cx, cz];
    }
  };
  for (let x = ax; x < ax + fw; x++) {
    consider(x, az - 1);
    consider(x, az + fd);
  }
  for (let z = az; z < az + fd; z++) {
    consider(ax - 1, z);
    consider(ax + fw, z);
  }
  return best;
}

export function manhattan(a: CellXZ, b: CellXZ): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}
