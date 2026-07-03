/**
 * Rejilla lógica del mundo. ÚNICA fuente de verdad del estado espacial.
 * No importa THREE ni nada de render: el render LEE el grid, nunca al revés.
 *
 * - 1 celda = 2 m (CELL_SIZE). Coordenadas de celda enteras (cx, cz).
 * - Mundo disperso: solo se guardan celdas usadas, agrupadas en chunks de 64×64
 *   (CHUNK) para que el render pueda cargar/descartar por chunk (T1.7).
 * - Capas por celda: terrain, building (ancla + rotación), prop.
 */

export const CELL_SIZE = 2;
export const CHUNK = 64;

export type Terrain = 'none' | 'field' | 'grass' | 'water' | 'road' | 'path';
export type Rot = 0 | 1 | 2 | 3;

/** Referencia a un edificio. Todas las celdas del footprint la comparten;
 * `anchorX/anchorZ` apuntan a la celda ancla (esquina de menor coord). */
export interface BuildingRef {
  id: string;
  rot: Rot;
  anchorX: number;
  anchorZ: number;
}

export interface PropRef {
  id: string;
  /** Semilla de variación (escala/rotación/tono) — determinista por celda. */
  variant: number;
}

export interface Cell {
  terrain: Terrain;
  building?: BuildingRef;
  prop?: PropRef;
}

const HALF = 32768; // offset para empaquetar coords con signo en clave numérica

function cellKey(cx: number, cz: number): number {
  return (cx + HALF) * 65536 + (cz + HALF);
}

export function chunkCoord(c: number): number {
  return Math.floor(c / CHUNK);
}

function chunkKey(chx: number, chz: number): string {
  return `${chx},${chz}`;
}

/** Footprint (ancho×fondo en celdas) tras aplicar rotación de 90°. */
export function rotatedFootprint(w: number, d: number, rot: Rot): [number, number] {
  return rot % 2 === 0 ? [w, d] : [d, w];
}

export class Chunk {
  readonly cells = new Map<number, Cell>();
  /** Marca de cambio para que el render regenere solo lo sucio (T1.7). */
  dirty = true;
  constructor(readonly chx: number, readonly chz: number) {}
}

export class Grid {
  private readonly chunks = new Map<string, Chunk>();

  // --- Acceso a chunks ------------------------------------------------------
  chunkAt(chx: number, chz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(chx, chz));
  }

  private ensureChunk(cx: number, cz: number): Chunk {
    const chx = chunkCoord(cx);
    const chz = chunkCoord(cz);
    const k = chunkKey(chx, chz);
    let ch = this.chunks.get(k);
    if (!ch) {
      ch = new Chunk(chx, chz);
      this.chunks.set(k, ch);
    }
    return ch;
  }

  forEachChunk(fn: (chunk: Chunk) => void): void {
    this.chunks.forEach(fn);
  }

  // --- Acceso a celdas ------------------------------------------------------
  get(cx: number, cz: number): Cell | undefined {
    return this.chunks.get(chunkKey(chunkCoord(cx), chunkCoord(cz)))?.cells.get(cellKey(cx, cz));
  }

  private ensureCell(cx: number, cz: number): Cell {
    const ch = this.ensureChunk(cx, cz);
    const k = cellKey(cx, cz);
    let cell = ch.cells.get(k);
    if (!cell) {
      cell = { terrain: 'none' };
      ch.cells.set(k, cell);
    }
    ch.dirty = true;
    return cell;
  }

  private markDirty(cx: number, cz: number): void {
    const ch = this.chunks.get(chunkKey(chunkCoord(cx), chunkCoord(cz)));
    if (ch) ch.dirty = true;
  }

  setTerrain(cx: number, cz: number, terrain: Terrain): void {
    this.ensureCell(cx, cz).terrain = terrain;
  }

  fillTerrain(cx0: number, cz0: number, cx1: number, cz1: number, terrain: Terrain): void {
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) this.setTerrain(cx, cz, terrain);
    }
  }

  setProp(cx: number, cz: number, prop: PropRef | undefined): void {
    this.ensureCell(cx, cz).prop = prop;
  }

  // --- Edificios ------------------------------------------------------------
  /** ¿Cabe un edificio w×d (celdas base) anclado en (cx,cz) con rotación rot? */
  canPlace(w: number, d: number, cx: number, cz: number, rot: Rot = 0): boolean {
    const [fw, fd] = rotatedFootprint(w, d, rot);
    for (let x = cx; x < cx + fw; x++) {
      for (let z = cz; z < cz + fd; z++) {
        const cell = this.get(x, z);
        if (cell?.building) return false;
        if (cell?.terrain === 'water' || cell?.terrain === 'road') return false;
      }
    }
    return true;
  }

  placeBuilding(id: string, w: number, d: number, cx: number, cz: number, rot: Rot = 0): boolean {
    if (!this.canPlace(w, d, cx, cz, rot)) return false;
    const [fw, fd] = rotatedFootprint(w, d, rot);
    const ref: BuildingRef = { id, rot, anchorX: cx, anchorZ: cz };
    for (let x = cx; x < cx + fw; x++) {
      for (let z = cz; z < cz + fd; z++) this.ensureCell(x, z).building = ref;
    }
    return true;
  }

  removeBuilding(cx: number, cz: number): boolean {
    const cell = this.get(cx, cz);
    if (!cell?.building) return false;
    const { anchorX, anchorZ } = cell.building;
    // Escanea el chunk-vecindario del ancla para limpiar todas sus celdas.
    for (let x = anchorX - 1; x < anchorX + 40; x++) {
      for (let z = anchorZ - 1; z < anchorZ + 40; z++) {
        const c = this.get(x, z);
        if (c?.building && c.building.anchorX === anchorX && c.building.anchorZ === anchorZ) {
          c.building = undefined;
          this.markDirty(x, z);
        }
      }
    }
    return true;
  }

  // --- Iteración ------------------------------------------------------------
  forEachInRect(cx0: number, cz0: number, cx1: number, cz1: number, fn: (cell: Cell, cx: number, cz: number) => void): void {
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const cell = this.get(cx, cz);
        if (cell) fn(cell, cx, cz);
      }
    }
  }

  // --- Serialización --------------------------------------------------------
  serialize(): string {
    const out: Array<[number, number, Cell]> = [];
    this.chunks.forEach((ch) => {
      ch.cells.forEach((cell, k) => {
        const packed = k;
        const cx = Math.floor(packed / 65536) - HALF;
        const cz = (packed % 65536) - HALF;
        out.push([cx, cz, cell]);
      });
    });
    return JSON.stringify(out);
  }

  static deserialize(json: string): Grid {
    const grid = new Grid();
    const data: Array<[number, number, Cell]> = JSON.parse(json);
    for (const [cx, cz, cell] of data) {
      const target = grid.ensureCell(cx, cz);
      target.terrain = cell.terrain;
      target.building = cell.building;
      target.prop = cell.prop;
    }
    return grid;
  }
}

// --- Conversión celda ↔ mundo (metros) --------------------------------------
/** Centro en metros de una celda. */
export function cellToWorld(cx: number, cz: number): [number, number] {
  return [(cx + 0.5) * CELL_SIZE, (cz + 0.5) * CELL_SIZE];
}

export function worldToCell(x: number, z: number): [number, number] {
  return [Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)];
}
