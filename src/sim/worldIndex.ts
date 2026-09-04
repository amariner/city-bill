/**
 * Índice de sim del mundo: qué edificios existen, de qué rol, dónde está su
 * entrada y qué celdas "agradables" hay (naturaleza/agua para pasear).
 * Se reconstruye al deserializar el grid y tras cada acción de construcción
 * (barato: solo escanea celdas usadas).
 */
import { Grid } from '../world/grid';
import { catalogData, CatalogItemData, SimRole } from '../world/catalogData';
import { buildingEntrance, CellXZ, isWalkable, rotatedSize } from './geometry';
import type { Rot } from '../world/grid';
import { computeCoverage, coverageKey } from './coverage';

/** Roles que forman parte del tejido urbano para centros, salidas y métricas.
 * La naturaleza sigue siendo paisaje; la infraestructura viaria se consulta
 * desde `roadCells`, no como edificio urbano. */
export function isUrban(role: SimRole): boolean {
  return role !== 'nature';
}

export interface SimBuilding {
  ax: number;
  az: number;
  id: string;
  /** Rotación original de la huella; la densificación la conserva. */
  rot: Rot;
  data: CatalogItemData;
  /** Capacidad de familias de la parcela; puede superar la tipología visual. */
  capacity: number;
  /** Fachada opcional de la parcela; nunca sustituye su estructura lógica. */
  visualId?: string;
  entrance: CellXZ | null;
  /** Celda central (para distancias). */
  cx: number;
  cz: number;
  /** Hay una carretera/sendero en el anillo exterior de tres celdas. */
  roadAccess: boolean;
  /** El edificio ocupa la huella, pero está fuera de servicio. */
  abandoned: boolean;
  /** Máscara de servicios que cubren este edificio (H4.2). */
  coverage: number;
}

/** Acceso peatonal mínimo a una vía: basta una carretera o sendero dentro del
 * anillo exterior de `radius` celdas alrededor de toda la huella. La huella no
 * se considera acceso por sí misma (y sigue bloqueada para caminos). */
export function hasRoadAccess(grid: Grid, ax: number, az: number, fw: number, fd: number, radius = 3): boolean {
  for (let x = ax - radius; x < ax + fw + radius; x++) {
    for (let z = az - radius; z < az + fd + radius; z++) {
      const inside = x >= ax && x < ax + fw && z >= az && z < az + fd;
      if (inside) continue;
      const dx = x < ax ? ax - x : x >= ax + fw ? x - (ax + fw - 1) : 0;
      const dz = z < az ? az - z : z >= az + fd ? z - (az + fd - 1) : 0;
      if (Math.max(dx, dz) > radius) continue;
      const terrain = grid.get(x, z)?.terrain;
      if (terrain === 'road' || terrain === 'path') return true;
    }
  }
  return false;
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
        if (cell.terrain === 'road' || cell.terrain === 'path') this.roadCells.push([cx, cz]);
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
          rot: b.rot,
          data,
          capacity: b.housingCapacity ?? data.capacity ?? 0,
          visualId: b.visualId,
          entrance: buildingEntrance(this.grid, cx, cz, fw, fd),
          cx: cx + fw / 2,
          cz: cz + fd / 2,
          roadAccess: hasRoadAccess(this.grid, cx, cz, fw, fd),
          abandoned: b.abandoned === true,
          coverage: 0,
        };
        this.buildings.push(sb);
        if (!sb.abandoned) {
          const list = this.byRole.get(data.role) ?? [];
          list.push(sb);
          this.byRole.set(data.role, list);
        }
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
    // Los parques son edificios (bloquean su huella), pero su borde y sus
    // senderos sí son destinos públicos de paseo. Se calcula al reconstruir el
    // índice, igual que el resto de puntos derivados del grid.
    for (const b of this.buildings) {
      if (b.abandoned || b.data.role !== 'park') continue;
      const [fw, fd] = rotatedSize(b.data.w, b.data.d, this.grid.get(b.ax, b.az)?.building?.rot ?? 0);
      for (let x = b.ax - 1; x <= b.ax + fw; x++) {
        for (let z = b.az - 1; z <= b.az + fd; z++) {
          if (x !== b.ax - 1 && x !== b.ax + fw && z !== b.az - 1 && z !== b.az + fd) continue;
          if (isWalkable(this.grid, x, z)) this.strollSpots.push([x, z]);
        }
      }
    }
    const uniqueSpots = new Map<string, CellXZ>();
    for (const spot of this.strollSpots) uniqueSpots.set(`${spot[0]},${spot[1]}`, spot);
    this.strollSpots = [...uniqueSpots.values()];
    const coverage = computeCoverage(this);
    for (const building of this.buildings) building.coverage = coverage.get(coverageKey(building.ax, building.az)) ?? 0;
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
