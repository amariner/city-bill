/** Transporte público H5.3: líneas circulares y buses deterministas.
 * La ruta se construye sobre los puntos de parada en orden X→Z; la validación
 * de que las paradas estén en calzada vive en actions.ts, no aquí. */
import type { CellXZ } from './geometry';
import type { Grid } from '../world/grid';

export const BUS_SPEED_FACTOR = 0.8;
export const BUS_CELLS_PER_TICK = 3.6 * BUS_SPEED_FACTOR;
export const BUS_CELLS_PER_BUS = 12;
export const BUS_STOP_DWELL_TICKS = 2;

export interface BusLine {
  id: number;
  stops: CellXZ[];
  /** Celdas intermedias del loop, incluida una copia final de la primera. */
  route: CellXZ[];
  /** Índices de `route` donde el bus se detiene (la copia final no cuenta). */
  stopRouteIndices: number[];
}

export interface Bus {
  id: number;
  lineId: number;
  routeIndex: number;
  stopIndex: number;
  dwellTicks: number;
  x: number;
  z: number;
  heading: number;
}

/** El tren recorre un circuito de celdas rail. Los vagones se derivan de la
 * cabeza para mantener el estado de guardado pequeño y canónico. */
export interface Train {
  route: CellXZ[];
  routeIndex: number;
  x: number;
  z: number;
  heading: number;
  wagonCount: number;
}

export const TRAIN_CELLS_PER_TICK = 2.4;

function railNeighbors(grid: Grid, cx: number, cz: number): CellXZ[] {
  const out: CellXZ[] = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as CellXZ[]) {
    if (grid.get(cx + dx, cz + dz)?.terrain === 'rail') out.push([cx + dx, cz + dz]);
  }
  return out;
}

/** Encuentra el primer componente ferroviario cerrado en orden canónico.
 * Un circuito válido tiene exactamente dos vecinos de vía en cada celda; así
 * se evita que un cruce ambiguo haga saltar al tren entre ramas. */
export function buildRailLoop(grid: Grid): CellXZ[] | null {
  const rails: CellXZ[] = [];
  grid.forEachChunk((chunk) => chunk.cells.forEach((cell, key) => {
    if (cell.terrain === 'rail') rails.push([Math.floor(key / 65536) - 32768, (key % 65536) - 32768]);
  }));
  rails.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const visited = new Set<string>();
  for (const start of rails) {
    const startKey = `${start[0]},${start[1]}`;
    if (visited.has(startKey)) continue;
    const component: CellXZ[] = [];
    const queue: CellXZ[] = [[...start]];
    visited.add(startKey);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const next of railNeighbors(grid, current[0], current[1])) {
        const key = `${next[0]},${next[1]}`;
        if (!visited.has(key)) { visited.add(key); queue.push(next); }
      }
    }
    if (component.length < 8 || component.some(([x, z]) => railNeighbors(grid, x, z).length !== 2)) continue;
    const ordered: CellXZ[] = [[...start]];
    let previous: CellXZ | null = null;
    let current = start;
    while (true) {
      const candidates = railNeighbors(grid, current[0], current[1])
        .filter(([x, z]) => !previous || x !== previous[0] || z !== previous[1]);
      candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const next = candidates[0];
      if (!next) break;
      if (next[0] === start[0] && next[1] === start[1]) return ordered.length === component.length ? ordered : null;
      if (ordered.some(([x, z]) => x === next[0] && z === next[1])) break;
      ordered.push(next);
      previous = current;
      current = next;
    }
  }
  return null;
}

export function createTrain(route: readonly CellXZ[], wagonCount = 3): Train | null {
  if (route.length < 8) return null;
  const [x, z] = route[0];
  return { route: route.map(([cx, cz]) => [cx, cz]), routeIndex: 0, x: x + 0.5, z: z + 0.5, heading: 0, wagonCount: Math.max(3, Math.min(5, wagonCount)) };
}

/** Avance continuo sobre el lazo; la interpolación del main hace el resto. */
export function stepTrain(train: Train, speed = TRAIN_CELLS_PER_TICK): void {
  if (train.route.length < 2) return;
  let budget = Math.max(0, speed);
  while (budget > 0) {
    const nextIndex = (train.routeIndex + 1) % train.route.length;
    const [tx, tz] = train.route[nextIndex];
    const targetX = tx + 0.5;
    const targetZ = tz + 0.5;
    const dx = targetX - train.x;
    const dz = targetZ - train.z;
    const distance = Math.abs(dx) + Math.abs(dz);
    if (distance <= budget) {
      train.x = targetX;
      train.z = targetZ;
      if (dx !== 0 || dz !== 0) train.heading = Math.atan2(dx, dz);
      train.routeIndex = nextIndex;
      budget -= distance;
    } else {
      const fraction = budget / distance;
      train.x += dx * fraction;
      train.z += dz * fraction;
      if (dx !== 0 || dz !== 0) train.heading = Math.atan2(dx, dz);
      budget = 0;
    }
  }
}

/** Posiciones de cola a lo largo de celdas ya recorridas; sin estado por
 * vagón, por lo que un save nunca puede desincronizar una composición. */
export function trainWagonPositions(train: Train): Array<{ x: number; z: number; heading: number }> {
  const out: Array<{ x: number; z: number; heading: number }> = [];
  for (let wagon = 0; wagon < train.wagonCount; wagon++) {
    const index = (train.routeIndex - (wagon + 1) * 2 + train.route.length * 8) % train.route.length;
    const [x, z] = train.route[index];
    const next = train.route[(index + 1) % train.route.length];
    out.push({ x: x + 0.5, z: z + 0.5, heading: Math.atan2(next[0] - x, next[1] - z) });
  }
  return out;
}

function appendAxis(route: CellXZ[], from: CellXZ, to: CellXZ): void {
  const step = from[0] <= to[0] ? 1 : -1;
  for (let x = from[0] + step; ; x += step) {
    route.push([x, from[1]]);
    if (x === to[0]) break;
  }
}

function appendSegment(route: CellXZ[], from: CellXZ, to: CellXZ): void {
  const corner: CellXZ = [to[0], from[1]];
  if (corner[0] !== from[0]) appendAxis(route, from, corner);
  const current = route[route.length - 1];
  if (current[1] === to[1]) return;
  const step = current[1] <= to[1] ? 1 : -1;
  for (let z = current[1] + step; ; z += step) {
    route.push([to[0], z]);
    if (z === to[1]) break;
  }
}

/** Línea circular reproducible para cualquier secuencia de paradas distintas. */
export function buildBusLine(id: number, stops: readonly CellXZ[]): BusLine | null {
  if (stops.length < 2) return null;
  const copied = stops.map(([x, z]) => [x, z] as CellXZ);
  const route: CellXZ[] = [[...copied[0]]];
  const stopRouteIndices = [0];
  for (let i = 1; i <= copied.length; i++) {
    const from = route[route.length - 1];
    const to = copied[i % copied.length];
    appendSegment(route, from, to);
    if (i < copied.length) stopRouteIndices.push(route.length - 1);
  }
  return { id, stops: copied, route, stopRouteIndices };
}

function stopAtRouteIndex(line: BusLine, routeIndex: number): number {
  return line.stopRouteIndices.indexOf(routeIndex);
}

/** Un bus por cada 12 celdas de loop, con un mínimo de dos para que la línea
 * tenga frecuencia incluso en un circuito corto. */
export function createBuses(line: BusLine, firstBusId: number): Bus[] {
  const count = Math.max(2, Math.ceil(line.route.length / BUS_CELLS_PER_BUS));
  return Array.from({ length: count }, (_, i) => {
    const routeIndex = Math.floor((i * line.route.length) / count) % line.route.length;
    const [x, z] = line.route[routeIndex];
    const stopIndex = stopAtRouteIndex(line, routeIndex);
    return {
      id: firstBusId + i,
      lineId: line.id,
      routeIndex,
      stopIndex,
      dwellTicks: stopIndex >= 0 ? BUS_STOP_DWELL_TICKS : 0,
      x: x + 0.5,
      z: z + 0.5,
      heading: 0,
    };
  });
}

/** Avanza buses sin crear fases ciudadanas. `speedAt` puede aplicar la
 * congestión local de la calzada y mantiene esta lógica independiente de THREE. */
export function stepBuses(
  lines: Map<number, BusLine>,
  buses: Bus[],
  speedAt: (x: number, z: number) => number = () => BUS_CELLS_PER_TICK,
): void {
  for (const bus of buses) {
    const line = lines.get(bus.lineId);
    if (!line || line.route.length < 2) continue;
    if (bus.dwellTicks > 0) {
      bus.dwellTicks--;
      continue;
    }
    let budget = Math.max(0, speedAt(bus.x - 0.5, bus.z - 0.5));
    while (budget > 0) {
      const nextIndex = (bus.routeIndex + 1) % line.route.length;
      const [tx, tz] = line.route[nextIndex];
      const targetX = tx + 0.5;
      const targetZ = tz + 0.5;
      const dx = targetX - bus.x;
      const dz = targetZ - bus.z;
      const distance = Math.abs(dx) + Math.abs(dz);
      if (distance <= budget) {
        bus.x = targetX;
        bus.z = targetZ;
        if (dx !== 0 || dz !== 0) bus.heading = Math.atan2(dx, dz);
        bus.routeIndex = nextIndex;
        budget -= distance;
        const stopIndex = stopAtRouteIndex(line, nextIndex);
        if (stopIndex >= 0) {
          bus.stopIndex = stopIndex;
          bus.dwellTicks = BUS_STOP_DWELL_TICKS;
          break;
        }
      } else {
        const fraction = budget / distance;
        bus.x += dx * fraction;
        bus.z += dz * fraction;
        if (dx !== 0 || dz !== 0) bus.heading = Math.atan2(dx, dz);
        budget = 0;
      }
    }
  }
}
