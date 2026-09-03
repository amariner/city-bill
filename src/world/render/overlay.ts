/**
 * Overlay espacial de edificios (H4.6). Una malla de huellas por chunk añade
 * como máximo un draw call visible por chunk y el canal lento del worker solo
 * reescribe el atributo `color`: la geometría no se reconstruye al cambiar
 * felicidad, suelo, cobertura o tráfico.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { COVERAGE_BITS } from '../../sim/coverage';
import { BUILDING_STRIDE } from '../../sim/protocol';
import { catalogData } from '../catalogData';
import { CHUNK, CELL_SIZE, Cell, Chunk, Grid, cellFromKey, rotatedFootprint } from '../grid';

export const OVERLAY_MODES = ['none', 'happiness', 'landValue', 'coverage', 'zones', 'traffic'] as const;
export type OverlayMode = (typeof OVERLAY_MODES)[number];

export const OVERLAY_LABELS: Record<OverlayMode, string> = {
  none: 'sin overlay',
  happiness: 'ánimo',
  landValue: 'valor del suelo',
  coverage: 'cobertura',
  zones: 'zonas',
  traffic: 'tráfico',
};

export interface BuildingOverlayStat {
  happiness: number;
  landValue: number;
  coverageMask: number;
  alertMask: number;
  occupancy: number;
  load: number;
}

const ZONE_COLORS: Record<NonNullable<Cell['zone']>, number> = {
  R: PALETTE.zoneR,
  C: PALETTE.zoneC,
  I: PALETTE.zoneI,
  A: PALETTE.zoneA,
  P: PALETTE.zoneP,
};

const HEAT_LOW = new THREE.Color(PALETTE.heatLow);
const HEAT_MID = new THREE.Color(PALETTE.heatMid);
const HEAT_HIGH = new THREE.Color(PALETTE.heatHigh);
const NEUTRAL = new THREE.Color(PALETTE.groundBase);

/** Fracción de los cinco servicios públicos presentes en una máscara. */
export function coverageFraction(mask: number): number {
  let covered = 0;
  for (const bit of Object.values(COVERAGE_BITS)) if ((mask & bit) !== 0) covered++;
  return covered / Object.values(COVERAGE_BITS).length;
}

/** Interpolación común de las tres escalas de calor del overlay. */
export function heatColor(value: number, target = new THREE.Color()): THREE.Color {
  const v = Math.max(0, Math.min(1, value));
  if (v <= 0.5) return target.copy(HEAT_LOW).lerp(HEAT_MID, v * 2);
  return target.copy(HEAT_MID).lerp(HEAT_HIGH, (v - 0.5) * 2);
}

interface ChunkVisual {
  mesh: THREE.Mesh;
  buildingKeys: string[];
}

function statKey(ax: number, az: number): string {
  return `${ax},${az}`;
}

function heatValue(mode: OverlayMode, stat: BuildingOverlayStat | undefined): number | null {
  if (!stat) return null;
  switch (mode) {
    case 'happiness': return stat.happiness >= 0 ? stat.happiness : null;
    case 'landValue': return stat.landValue;
    case 'coverage': return coverageFraction(stat.coverageMask);
    case 'traffic': return stat.load;
    default: return null;
  }
}

export class OverlayLayer {
  readonly root = new THREE.Group();
  private readonly byChunk = new Map<string, ChunkVisual>();
  private readonly stats = new Map<string, BuildingOverlayStat>();
  private lastStatsBuffer: Float32Array | null = null;
  private mode: OverlayMode = 'none';
  private readonly material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  constructor(private readonly grid: Grid) {
    this.root.name = 'building-overlays';
    this.root.visible = false;
    grid.forEachChunk((chunk) => this.refreshChunk(chunk));
  }

  getMode(): OverlayMode {
    return this.mode;
  }

  setMode(mode: OverlayMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.root.visible = mode !== 'none';
    this.refreshColors();
  }

  /**
   * Consume el último snapshot transferido. La comparación por referencia es
   * intencionada: mientras no llegue un buffer nuevo, solo se toca nada.
   */
  refreshFromStats(buffer: Float32Array | null): void {
    if (!buffer || buffer === this.lastStatsBuffer) return;
    this.lastStatsBuffer = buffer;
    this.stats.clear();
    for (let offset = 0; offset + BUILDING_STRIDE <= buffer.length; offset += BUILDING_STRIDE) {
      this.stats.set(statKey(buffer[offset], buffer[offset + 1]), {
        happiness: buffer[offset + 2],
        landValue: buffer[offset + 3],
        coverageMask: buffer[offset + 4],
        alertMask: buffer[offset + 5],
        occupancy: buffer[offset + 6],
        load: buffer[offset + 7],
      });
    }
    // Solo cambia BufferAttribute.color; la malla por chunk queda intacta.
    this.refreshColors();
  }

  refreshCells(cells: Array<[number, number, Cell]>): void {
    const touched = new Set<string>();
    for (const [cx, cz] of cells) touched.add(`${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}`);
    for (const key of touched) {
      const [chx, chz] = key.split(',').map(Number);
      const chunk = this.grid.chunkAt(chx, chz);
      if (chunk) this.refreshChunk(chunk);
    }
  }

  private refreshColors(): void {
    for (const visual of this.byChunk.values()) {
      const colors = visual.mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
      if (!colors) continue;
      const color = new THREE.Color();
      for (let i = 0; i < visual.buildingKeys.length; i++) {
        const stat = this.stats.get(visual.buildingKeys[i]);
        const cell = this.cellForKey(visual.buildingKeys[i]);
        const zone = cell?.zone;
        if (this.mode === 'zones' && zone) color.set(ZONE_COLORS[zone]);
        else {
          const value = heatValue(this.mode, stat);
          if (value === null) color.copy(NEUTRAL);
          else heatColor(value, color);
        }
        for (let vertex = 0; vertex < 6; vertex++) colors.setXYZ(i * 6 + vertex, color.r, color.g, color.b);
      }
      colors.needsUpdate = true;
    }
  }

  private cellForKey(key: string): Cell | undefined {
    const [ax, az] = key.split(',').map(Number);
    return this.grid.get(ax, az);
  }

  private refreshChunk(chunk: Chunk): void {
    const key = `${chunk.chx},${chunk.chz}`;
    const old = this.byChunk.get(key);
    if (old) {
      this.root.remove(old.mesh);
      old.mesh.geometry.dispose();
      this.byChunk.delete(key);
    }
    const visual = buildChunkMesh(chunk, this.material);
    if (!visual) return;
    visual.mesh.name = `building_overlay_${key}`;
    this.byChunk.set(key, visual);
    this.root.add(visual.mesh);
    this.refreshColorsFor(visual);
  }

  private refreshColorsFor(visual: ChunkVisual): void {
    const colors = visual.mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!colors) return;
    const color = new THREE.Color();
    for (let i = 0; i < visual.buildingKeys.length; i++) {
      const stat = this.stats.get(visual.buildingKeys[i]);
      const zone = this.cellForKey(visual.buildingKeys[i])?.zone;
      if (this.mode === 'zones' && zone) color.set(ZONE_COLORS[zone]);
      else {
        const value = heatValue(this.mode, stat);
        if (value === null) color.copy(NEUTRAL);
        else heatColor(value, color);
      }
      for (let vertex = 0; vertex < 6; vertex++) colors.setXYZ(i * 6 + vertex, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }
}

function buildChunkMesh(chunk: Chunk, material: THREE.Material): ChunkVisual | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const buildingKeys: string[] = [];
  const neutral = new THREE.Color(PALETTE.groundBase);

  chunk.cells.forEach((cell, packed) => {
    if (!cell.building) return;
    const [cx, cz] = cellFromKey(packed);
    if (cell.building.anchorX !== cx || cell.building.anchorZ !== cz) return;
    const data = cell.building;
    // El catálogo lógico ya garantiza esta huella; los saves antiguos pueden no
    // traer fw/fd, por eso el render usa la ficha actual en el propio grid.
    const dims = data.fw !== undefined && data.fd !== undefined
      ? [data.fw, data.fd] as [number, number]
      : null;
    // `fw/fd` son opcionales en el grid; el fallback conservador de 1×1 se
    // amplía en `footprintFor` al leer el catálogo sin importar THREE builders.
    const [fw, fd] = dims ?? footprintFor(data.id, data.rot);
    const x0 = cx * CELL_SIZE;
    const x1 = (cx + fw) * CELL_SIZE;
    const z0 = cz * CELL_SIZE;
    const z1 = (cz + fd) * CELL_SIZE;
    const y = 0.17;
    positions.push(x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1);
    for (let vertex = 0; vertex < 6; vertex++) colors.push(neutral.r, neutral.g, neutral.b);
    buildingKeys.push(statKey(cx, cz));
  });

  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  return { mesh, buildingKeys };
}

/** Dimensiones de huella sin cargar builders ni introducir THREE en la sim. */
function footprintFor(id: string, rot: 0 | 1 | 2 | 3): [number, number] {
  const item = catalogData(id);
  return item ? rotatedFootprint(item.w, item.d, rot) : [1, 1];
}
