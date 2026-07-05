/**
 * Índice de sim del mundo: qué edificios existen, de qué rol, dónde está su
 * entrada y qué celdas "agradables" hay (naturaleza/agua para pasear).
 * Se reconstruye al deserializar el grid y tras cada acción de construcción
 * (barato: solo escanea celdas usadas).
 */
import { Grid } from '../world/grid';
import { catalogData, CatalogItemData, SimRole } from '../world/catalogData';
import { buildingEntrance, CellXZ, isWalkable, rotatedSize } from './geometry';

export interface SimBuilding {
  ax: number;
  az: number;
  id: string;
  data: CatalogItemData;
  entrance: CellXZ | null;
  /** Celda central (para distancias). */
  cx: number;
  cz: number;
}

export class WorldIndex {
  buildings: SimBuilding[] = [];
  byRole = new Map<SimRole, SimBuilding[]>();
  /** Celdas junto a agua o arboledas: destinos de paseo. */
  strollSpots: CellXZ[] = [];
  /** Celdas de carretera (ciclo 14 — para hallar la salida del pueblo). */
  roadCells: CellXZ[] = [];

  constructor(readonly grid: Grid) {
    this.rebuild();
  }

  rebuild(): void {
    this.buildings = [];
    this.byRole = new Map();
    this.strollSpots = [];
    this.roadCells = [];
    const seen = new Set<string>();
    const waterCells: CellXZ[] = [];
    const treeCells: CellXZ[] = [];

    this.grid.forEachChunk((ch) => {
      ch.cells.forEach((cell, k) => {
        const cx = Math.floor(k / 65536) - 32768;
        const cz = (k % 65536) - 32768;
        if (cell.terrain === 'water') waterCells.push([cx, cz]);
        if (cell.terrain === 'road') this.roadCells.push([cx, cz]);
        if (cell.prop) treeCells.push([cx, cz]);
        const b = cell.building;
        if (!b || b.anchorX !== cx || b.anchorZ !== cz) return;
        const kk = `${b.anchorX},${b.anchorZ}`;
        if (seen.has(kk)) return;
        seen.add(kk);
        const data = catalogData(b.id);
        if (!data) return;
        const [fw, fd] = rotatedSize(data.w, data.d, b.rot);
        const sb: SimBuilding = {
          ax: cx,
          az: cz,
          id: b.id,
          data,
          entrance: buildingEntrance(this.grid, cx, cz, fw, fd),
          cx: cx + fw / 2,
          cz: cz + fd / 2,
        };
        this.buildings.push(sb);
        const list = this.byRole.get(data.role) ?? [];
        list.push(sb);
        this.byRole.set(data.role, list);
      });
    });

    // Puntos de paseo: celdas transitables junto a agua; y muestreo junto a árboles.
    for (const [wx, wz] of waterCells) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as CellXZ[]) {
        if (isWalkable(this.grid, wx + dx, wz + dz)) this.strollSpots.push([wx + dx, wz + dz]);
      }
    }
    for (let i = 0; i < treeCells.length; i += 7) {
      const [tx, tz] = treeCells[i];
      if (isWalkable(this.grid, tx + 1, tz)) this.strollSpots.push([tx + 1, tz]);
    }
    // Orden determinista (el muestreo de chunks de un Map ya es de inserción,
    // pero tras deserializar puede variar el orden: fijamos por coordenada).
    this.buildings.sort((a, b) => a.ax - b.ax || a.az - b.az);
    this.strollSpots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    this.roadCells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  /** Salida del pueblo (ciclo 14): la celda de carretera más lejana del centro
   * — el punto por donde la vía abandona lo construido. Determinista. */
  townExit(center: [number, number]): CellXZ | null {
    let best: CellXZ | null = null;
    let bestD = -1;
    for (const [rx, rz] of this.roadCells) {
      const d = Math.abs(rx - center[0]) + Math.abs(rz - center[1]);
      if (d > bestD) {
        bestD = d;
        best = [rx, rz];
      }
    }
    return best;
  }

  ofRole(role: SimRole): SimBuilding[] {
    return this.byRole.get(role) ?? [];
  }

  at(ax: number, az: number): SimBuilding | undefined {
    return this.buildings.find((b) => b.ax === ax && b.az === az);
  }
}
