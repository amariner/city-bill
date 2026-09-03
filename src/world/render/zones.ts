/** Overlay de zonas R/C/I/A/P. Una sola malla con vertex-colors por chunk:
 * no cambia el terreno lógico y desaparece por defecto fuera de la herramienta.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CHUNK, Cell, Chunk, Grid, CELL_SIZE } from '../grid';

const ZONE_COLOR: Record<NonNullable<Cell['zone']>, number> = {
  R: PALETTE.zoneR,
  C: PALETTE.zoneC,
  I: PALETTE.zoneI,
  A: PALETTE.zoneA,
  P: PALETTE.zoneP,
};

interface ChunkVisual {
  mesh: THREE.Mesh;
  chx: number;
  chz: number;
}

function cellFromKey(key: number): [number, number] {
  return [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];
}

export class ZonesLayer {
  readonly root = new THREE.Group();
  private readonly byChunk = new Map<string, ChunkVisual>();
  private toolActive = false;
  private overlayEnabled = false;
  private readonly material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  constructor(private grid: Grid) {
    this.root.name = 'zones';
    this.root.visible = false;
    grid.forEachChunk((chunk) => this.refreshChunk(chunk));
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() !== 'v') return;
        event.preventDefault();
        this.overlayEnabled = !this.overlayEnabled;
        this.updateVisibility();
      });
    }
  }

  setToolActive(active: boolean): void {
    this.toolActive = active;
    this.updateVisibility();
  }

  setOverlayEnabled(enabled: boolean): void {
    this.overlayEnabled = enabled;
    this.updateVisibility();
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

  private updateVisibility(): void {
    this.root.visible = this.toolActive || this.overlayEnabled;
  }

  private refreshChunk(chunk: Chunk): void {
    const key = `${chunk.chx},${chunk.chz}`;
    const old = this.byChunk.get(key);
    if (old) {
      this.root.remove(old.mesh);
      old.mesh.geometry.dispose();
      this.byChunk.delete(key);
    }
    const mesh = buildChunkMesh(chunk, this.material);
    if (!mesh) return;
    mesh.name = `zones_${key}`;
    this.byChunk.set(key, { mesh, chx: chunk.chx, chz: chunk.chz });
    this.root.add(mesh);
  }
}

function buildChunkMesh(chunk: Chunk, material: THREE.Material): THREE.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  chunk.cells.forEach((cell, key) => {
    if (!cell.zone || cell.building || cell.terrain === 'road' || cell.terrain === 'water') return;
    const [cx, cz] = cellFromKey(key);
    color.set(ZONE_COLOR[cell.zone]);
    const x0 = cx * CELL_SIZE;
    const x1 = x0 + CELL_SIZE;
    const z0 = cz * CELL_SIZE;
    const z1 = z0 + CELL_SIZE;
    const y = 0.135;
    positions.push(x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1);
    for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
  });
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}
