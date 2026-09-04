/** Planificación y pintado puro de vías. No conoce THREE ni el worker. */
import { Grid, RoadKind as GridRoadKind } from './grid';
import type { CellXZ } from '../sim/geometry';
import type { RoadKind } from '../sim/protocol';

export type { RoadKind } from '../sim/protocol';

export interface RoadSpec {
  lanes: number;
  sidewalk: number;
  median: number;
  margin: number;
  trees: boolean;
  costPerCell: number;
  upkeepPerCell: number;
  speed: number;
  capacity: number;
}

export const ROAD_SPECS: Record<RoadKind, RoadSpec> = {
  path: { lanes: 1, sidewalk: 0, median: 0, margin: 0, trees: false, costPerCell: 3, upkeepPerCell: 0.5, speed: 1, capacity: 4 },
  rural: { lanes: 3, sidewalk: 0, median: 0, margin: 2, trees: true, costPerCell: 8, upkeepPerCell: 1, speed: 2, capacity: 12 },
  street: { lanes: 3, sidewalk: 1, median: 0, margin: 1, trees: true, costPerCell: 14, upkeepPerCell: 2, speed: 2.5, capacity: 24 },
  avenue: { lanes: 2, sidewalk: 1, median: 1, margin: 2, trees: true, costPerCell: 24, upkeepPerCell: 3, speed: 3.5, capacity: 48 },
};

export interface RoadAxis {
  axis: 'x' | 'z';
  from: CellXZ;
  to: CellXZ;
}

export interface RoadPaintResult {
  /** Nuevas celdas de calzada, sin duplicar los cruces ya existentes. */
  laid: CellXZ[];
  /** Primeras celdas que impidieron continuar cada tramo. */
  blocked: CellXZ[];
  cost: number;
}

export type RoadPreviewRole = 'road' | 'sidewalk' | 'median' | 'margin';

export interface RoadPreviewCell {
  cell: CellXZ;
  role: RoadPreviewRole;
  /** La calzada propuesta pisa un obstáculo en esta celda o en su perfil. */
  blocked: boolean;
  /** Ya había calzada: no incrementa el coste. */
  existing: boolean;
}

export interface RoadPreviewResult {
  cells: RoadPreviewCell[];
  laid: CellXZ[];
  blocked: CellXZ[];
  cost: number;
}

export interface RailPaintResult {
  laid: CellXZ[];
  blocked: CellXZ[];
}

/** Plan ortogonal en L, primero X y después Z para que sea reproducible. */
export function planRoad(from: CellXZ, to: CellXZ): RoadAxis[] {
  if (from[0] === to[0] && from[1] === to[1]) return [];
  if (from[0] === to[0]) return [{ axis: 'z', from: [...from], to: [...to] }];
  if (from[1] === to[1]) return [{ axis: 'x', from: [...from], to: [...to] }];
  const corner: CellXZ = [to[0], from[1]];
  return [
    { axis: 'x', from: [...from], to: corner },
    { axis: 'z', from: corner, to: [...to] },
  ];
}

/** Pinta un segmento recto y se detiene ante una celda fuera del grid, agua o edificio. */
export function paintRoad(grid: Grid, axis: RoadAxis, kind: RoadKind, seed: number): RoadPaintResult {
  const spec = ROAD_SPECS[kind];
  const laid: CellXZ[] = [];
  const blocked: CellXZ[] = [];
  const start = axis.axis === 'x' ? axis.from[0] : axis.from[1];
  const end = axis.axis === 'x' ? axis.to[0] : axis.to[1];
  const step = start <= end ? 1 : -1;

  for (let along = start; ; along += step) {
    const base: CellXZ = axis.axis === 'x' ? [along, axis.from[1]] : [axis.from[0], along];
    const profiles = profilesFor(kind);
    let canContinue = true;
    for (const offset of profiles.road) {
      const cell = cellAt(base, axis.axis, offset);
      const current = grid.get(cell[0], cell[1]);
      if (!current || current.building || current.terrain === 'water') {
        blocked.push(cell);
        canContinue = false;
        break;
      }
    }
    if (!canContinue) break;

    for (const offset of profiles.road) {
      const cell = cellAt(base, axis.axis, offset);
      const current = grid.get(cell[0], cell[1]);
      if (!current) continue;
      if (current.terrain !== 'road') {
        grid.setProp(cell[0], cell[1], undefined);
        grid.setRoad(cell[0], cell[1], kind as GridRoadKind);
        laid.push(cell);
      }
    }
    paintSide(grid, base, axis.axis, profiles.sidewalk, 'path', true);
    paintSide(grid, base, axis.axis, profiles.median, 'grass', false);
    paintSide(grid, base, axis.axis, profiles.margin, 'grass', false);
    if (spec.trees) {
      for (const offset of profiles.trees) {
        const cell = cellAt(base, axis.axis, offset);
        const current = grid.get(cell[0], cell[1]);
        if (!current || current.building || current.prop || current.terrain === 'water' || current.terrain === 'road') continue;
        if (hash01(cell[0], cell[1], seed) < 0.35) continue;
        grid.setProp(cell[0], cell[1], { id: hash01(cell[0], cell[1], seed + 17) < 0.6 ? 'tree-cypress' : 'tree-blob', variant: hash(cell[0], cell[1], seed + 31) });
      }
    }
    if (along === end) break;
  }
  return { laid, blocked, cost: laid.length * spec.costPerCell };
}

/** Pinta los segmentos de un plan L, deduplicando la esquina y cruces. */
export function paintRoadPlan(grid: Grid, plan: RoadAxis[], kind: RoadKind, seed: number): RoadPaintResult {
  const seen = new Set<string>();
  const laid: CellXZ[] = [];
  const blocked: CellXZ[] = [];
  for (const axis of plan) {
    const result = paintRoad(grid, axis, kind, seed);
    for (const cell of result.laid) {
      const key = `${cell[0]},${cell[1]}`;
      if (!seen.has(key)) { seen.add(key); laid.push(cell); }
    }
    blocked.push(...result.blocked);
    // Una L bloqueada no puede "saltar" el primer obstáculo y pintar el
    // segundo tramo desde la esquina: el plan se detiene donde se corta.
    if (result.blocked.length > 0) break;
  }
  return { laid, blocked, cost: laid.length * ROAD_SPECS[kind].costPerCell };
}

/** Pinta una vía ferroviaria de una celda. No comparte el perfil de carretera:
 * no crea aceras, árboles ni tránsito peatonal. Una línea ya existente puede
 * cruzarse a sí misma, pero nunca reemplaza agua, edificios o calzada. */
export function paintRailPlan(grid: Grid, plan: RoadAxis[]): RailPaintResult {
  const laid: CellXZ[] = [];
  const blocked: CellXZ[] = [];
  const seen = new Set<string>();
  for (const axis of plan) {
    const start = axis.axis === 'x' ? axis.from[0] : axis.from[1];
    const end = axis.axis === 'x' ? axis.to[0] : axis.to[1];
    const step = start <= end ? 1 : -1;
    for (let along = start; ; along += step) {
      const cell: CellXZ = axis.axis === 'x' ? [along, axis.from[1]] : [axis.from[0], along];
      const current = grid.get(cell[0], cell[1]);
      if (!current || current.building || current.terrain === 'water' || current.terrain === 'road' || current.terrain === 'path') {
        blocked.push(cell);
        break;
      }
      const key = `${cell[0]},${cell[1]}`;
      if (current.terrain !== 'rail' && !seen.has(key)) {
        grid.setProp(cell[0], cell[1], undefined);
        grid.setTerrain(cell[0], cell[1], 'rail');
        seen.add(key);
        laid.push(cell);
      }
      if (along === end) break;
    }
    if (blocked.length > 0) break;
  }
  return { laid, blocked };
}

/** Calcula el mismo resultado espacial que `paintRoadPlan` sin mutar el grid.
 * Lo consume el fantasma 3D para enseñar la L, los obstáculos y el coste real
 * antes de enviar la acción al worker. */
export function previewRoad(grid: Grid, plan: RoadAxis[], kind: RoadKind): RoadPreviewResult {
  const cells = new Map<string, RoadPreviewCell>();
  const laid: CellXZ[] = [];
  const laidKeys = new Set<string>();
  const blocked: CellXZ[] = [];
  const add = (cell: CellXZ, role: RoadPreviewRole, blockedCell = false): void => {
    const current = grid.get(cell[0], cell[1]);
    if (!current) return;
    const key = `${cell[0]},${cell[1]}`;
    const old = cells.get(key);
    // La calzada tiene prioridad visual en un cruce y una acera no oculta un
    // obstáculo que la calzada ya marcó como rojo.
    if (old?.role === 'road' && role !== 'road') return;
    cells.set(key, {
      cell,
      role,
      blocked: blockedCell || old?.blocked === true,
      existing: role === 'road' ? current.terrain === 'road' : false,
    });
  };

  for (const axis of plan) {
    const profiles = profilesFor(kind);
    const start = axis.axis === 'x' ? axis.from[0] : axis.from[1];
    const end = axis.axis === 'x' ? axis.to[0] : axis.to[1];
    const step = start <= end ? 1 : -1;
    let segmentBlocked = false;
    for (let along = start; ; along += step) {
      const base: CellXZ = axis.axis === 'x' ? [along, axis.from[1]] : [axis.from[0], along];
      let obstacle: CellXZ | null = null;
      for (const offset of profiles.road) {
        const cell = cellAt(base, axis.axis, offset);
        const current = grid.get(cell[0], cell[1]);
        if (!current || current.building || current.terrain === 'water') {
          obstacle = cell;
          break;
        }
      }
      if (obstacle) {
        for (const offset of profiles.road) add(cellAt(base, axis.axis, offset), 'road', true);
        blocked.push(obstacle);
        segmentBlocked = true;
        break;
      }

      for (const offset of profiles.road) {
        const cell = cellAt(base, axis.axis, offset);
        const current = grid.get(cell[0], cell[1]);
        if (!current) continue;
        add(cell, 'road');
        const key = `${cell[0]},${cell[1]}`;
        if (current.terrain !== 'road' && !laidKeys.has(key)) {
          laidKeys.add(key);
          laid.push(cell);
        }
      }
      addSidePreview(grid, cells, base, axis.axis, profiles.sidewalk, 'sidewalk');
      addSidePreview(grid, cells, base, axis.axis, profiles.median, 'median');
      addSidePreview(grid, cells, base, axis.axis, profiles.margin, 'margin');
      if (along === end) break;
    }
    if (segmentBlocked) break;
  }

  return {
    cells: [...cells.values()],
    laid,
    blocked,
    cost: laid.length * ROAD_SPECS[kind].costPerCell,
  };
}

/** Compatibilidad geométrica con la extensión autónoma: eje recto rural. */
export function extendRoad(grid: Grid, from: CellXZ, dir: { dx: number; dz: number }, length: number, seed: number): RoadPaintResult {
  if (dir.dx !== 0 && dir.dz !== 0) return { laid: [], blocked: [from], cost: 0 };
  const first: CellXZ = [from[0] + dir.dx, from[1] + dir.dz];
  const last: CellXZ = [from[0] + dir.dx * length, from[1] + dir.dz * length];
  const axis: RoadAxis = dir.dx !== 0 ? { axis: 'x', from: first, to: last } : { axis: 'z', from: first, to: last };
  return paintRoad(grid, axis, 'rural', seed);
}

interface Profiles {
  road: number[];
  sidewalk: number[];
  median: number[];
  margin: number[];
  trees: number[];
}

function profilesFor(kind: RoadKind): Profiles {
  switch (kind) {
    case 'path': return { road: [0], sidewalk: [], median: [], margin: [], trees: [] };
    case 'rural': return { road: [-1, 0, 1], sidewalk: [], median: [], margin: [-2, 2], trees: [-3, 3] };
    case 'street': return { road: [-1, 0, 1], sidewalk: [-2, 2], median: [], margin: [-3, 3], trees: [-3, 3] };
    case 'avenue': return { road: [-2, -1, 1, 2], sidewalk: [-3, 3], median: [0], margin: [-4, 4], trees: [-5, 5] };
  }
}

function cellAt(base: CellXZ, axis: 'x' | 'z', offset: number): CellXZ {
  return axis === 'x' ? [base[0], base[1] + offset] : [base[0] + offset, base[1]];
}

function paintSide(grid: Grid, base: CellXZ, axis: 'x' | 'z', offsets: number[], terrain: 'grass' | 'path', replaceProp: boolean): void {
  for (const offset of offsets) {
    const cell = cellAt(base, axis, offset);
    const current = grid.get(cell[0], cell[1]);
    if (!current || current.building || current.terrain === 'water' || current.terrain === 'road') continue;
    if (replaceProp) grid.setProp(cell[0], cell[1], undefined);
    grid.setTerrain(cell[0], cell[1], terrain);
  }
}

function addSidePreview(
  grid: Grid,
  cells: Map<string, RoadPreviewCell>,
  base: CellXZ,
  axis: 'x' | 'z',
  offsets: number[],
  role: Exclude<RoadPreviewRole, 'road'>,
): void {
  for (const offset of offsets) {
    const cell = cellAt(base, axis, offset);
    const current = grid.get(cell[0], cell[1]);
    if (!current || current.building || current.terrain === 'water' || current.terrain === 'road') continue;
    const key = `${cell[0]},${cell[1]}`;
    const old = cells.get(key);
    if (old?.role === 'road') continue;
    cells.set(key, { cell, role, blocked: false, existing: false });
  }
}

function hash(x: number, z: number, seed: number): number {
  let n = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(z + seed, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

function hash01(x: number, z: number, seed: number): number {
  return hash(x, z, seed) / 0x100000000;
}
