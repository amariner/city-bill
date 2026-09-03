/** Transporte público H5.3: líneas circulares y buses deterministas.
 * La ruta se construye sobre los puntos de parada en orden X→Z; la validación
 * de que las paradas estén en calzada vive en actions.ts, no aquí. */
import type { CellXZ } from './geometry';

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
