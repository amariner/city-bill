/**
 * Navegación de agentes: A* sobre las celdas del grid con presupuesto
 * incremental (máx. expansiones por tick, contrato T3.2). Sin THREE.
 *
 * - Transitable: road (coste 1), path (1.05), grass (1.6), field (2.4).
 *   water / edificio / vacío = bloqueado. Los NPCs PREFIEREN vías: el coste
 *   hace que crucen campo solo si acorta mucho.
 * - Destino "edificio": se camina hasta una celda transitable adyacente al
 *   footprint (la "entrada"), no dentro.
 * - Búsquedas resumibles: `PathQueue.request()` devuelve un ticket; cada tick
 *   la cola gasta un presupuesto global de expansiones repartido round-robin.
 */
import { Grid } from '../world/grid';
import { CellXZ, walkCost, isWalkable } from './geometry';

export type { CellXZ };
export { isWalkable, walkCost, buildingEntrance } from './geometry';

// --- A* resumible -------------------------------------------------------------

const KEY_HALF = 32768;
function key(cx: number, cz: number): number {
  return (cx + KEY_HALF) * 65536 + (cz + KEY_HALF);
}
function unkey(k: number): CellXZ {
  return [Math.floor(k / 65536) - KEY_HALF, (k % 65536) - KEY_HALF];
}

/** Min-heap binario sobre f-score. */
class Heap {
  private ks: number[] = [];
  private fs: number[] = [];
  get size(): number {
    return this.ks.length;
  }
  push(k: number, f: number): void {
    this.ks.push(k);
    this.fs.push(f);
    let i = this.ks.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.fs[p] <= this.fs[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.ks[0];
    const lastK = this.ks.pop()!;
    const lastF = this.fs.pop()!;
    if (this.ks.length > 0) {
      this.ks[0] = lastK;
      this.fs[0] = lastF;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.fs.length && this.fs[l] < this.fs[m]) m = l;
        if (r < this.fs.length && this.fs[r] < this.fs[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ks[a], this.ks[b]] = [this.ks[b], this.ks[a]];
    [this.fs[a], this.fs[b]] = [this.fs[b], this.fs[a]];
  }
}

export type PathResult = { status: 'ok'; path: CellXZ[] } | { status: 'fail' };

interface Search {
  ticket: number;
  goalK: number;
  goal: CellXZ;
  open: Heap;
  g: Map<number, number>;
  from: Map<number, number>;
  done?: PathResult;
}

const NEIGHBORS: CellXZ[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class PathQueue {
  private searches: Search[] = [];
  private results = new Map<number, PathResult>();
  private nextTicket = 1;

  constructor(
    private grid: Grid,
    /** Presupuesto de expansiones por tick, repartido entre búsquedas. */
    private budgetPerTick = 4000,
    /** Tope duro por búsqueda: si lo agota, 'fail' (destino inalcanzable). */
    private maxPerSearch = 20000,
  ) {}

  /** Encola una búsqueda; recoge el resultado con `take(ticket)`. */
  request(from: CellXZ, to: CellXZ): number {
    const ticket = this.nextTicket++;
    if (!isWalkable(this.grid, to[0], to[1]) || !isWalkable(this.grid, from[0], from[1])) {
      this.results.set(ticket, { status: 'fail' });
      return ticket;
    }
    const s: Search = {
      ticket,
      goalK: key(to[0], to[1]),
      goal: to,
      open: new Heap(),
      g: new Map(),
      from: new Map(),
    };
    const startK = key(from[0], from[1]);
    s.g.set(startK, 0);
    s.open.push(startK, this.h(from, to));
    this.searches.push(s);
    return ticket;
  }

  /** Resultado si está listo (y lo consume); undefined si sigue en curso. */
  take(ticket: number): PathResult | undefined {
    const r = this.results.get(ticket);
    if (r) this.results.delete(ticket);
    return r;
  }

  get pending(): number {
    return this.searches.length;
  }

  /** Gasta el presupuesto del tick. Llamar UNA vez por tick de sim. */
  process(): void {
    let budget = this.budgetPerTick;
    while (budget > 0 && this.searches.length > 0) {
      // Round-robin: cada búsqueda avanza en rodajas para que ninguna muera de hambre.
      const slice = Math.max(50, Math.floor(budget / this.searches.length));
      for (let i = 0; i < this.searches.length && budget > 0; ) {
        const s = this.searches[i];
        const spent = this.step(s, Math.min(slice, budget));
        budget -= spent;
        if (s.done) {
          this.results.set(s.ticket, s.done);
          this.searches.splice(i, 1);
        } else {
          i++;
        }
      }
    }
  }

  private h(a: CellXZ, b: CellXZ): number {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  }

  /** Avanza una búsqueda hasta `maxExp` expansiones. Devuelve las gastadas. */
  private step(s: Search, maxExp: number): number {
    let exp = 0;
    while (exp < maxExp) {
      if (s.open.size === 0 || s.g.size > this.maxPerSearch) {
        s.done = { status: 'fail' };
        return exp;
      }
      const ck = s.open.pop();
      exp++;
      if (ck === s.goalK) {
        s.done = { status: 'ok', path: this.reconstruct(s, ck) };
        return exp;
      }
      const [cx, cz] = unkey(ck);
      const gc = s.g.get(ck)!;
      for (const [dx, dz] of NEIGHBORS) {
        const nx = cx + dx;
        const nz = cz + dz;
        const cost = walkCost(this.grid.get(nx, nz));
        if (cost === null) continue;
        const nk = key(nx, nz);
        const ng = gc + cost;
        const prev = s.g.get(nk);
        if (prev !== undefined && prev <= ng) continue;
        s.g.set(nk, ng);
        s.from.set(nk, ck);
        s.open.push(nk, ng + this.h([nx, nz], s.goal));
      }
    }
    return exp;
  }

  private reconstruct(s: Search, endK: number): CellXZ[] {
    const cells: CellXZ[] = [];
    let k: number | undefined = endK;
    while (k !== undefined) {
      cells.push(unkey(k));
      k = s.from.get(k);
    }
    cells.reverse();
    return simplify(cells);
  }
}

/** Quita puntos colineales: el agente interpola tramos rectos y las esquinas
 * quedan como waypoints (el suavizado visual lo hace el main al animar). */
export function simplify(cells: CellXZ[]): CellXZ[] {
  if (cells.length <= 2) return cells;
  const out: CellXZ[] = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const [ax, az] = out[out.length - 1];
    const [bx, bz] = cells[i];
    const [cx, cz] = cells[i + 1];
    const collinear = (bx - ax) * (cz - bz) === (cx - bx) * (bz - az);
    if (!collinear) out.push(cells[i]);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

/** Longitud de un camino simplificado, en celdas (métrica Manhattan real). */
export function pathLength(path: CellXZ[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]);
  }
  return len;
}
