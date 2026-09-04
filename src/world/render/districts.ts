/** Overlay administrativo de distritos (H5.5). Solo lee el grid del main y
 * repinta por chunks; las políticas y su validación viven en el worker. */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CHUNK, CELL_SIZE, Cell, Chunk, cellFromKey, Grid } from '../grid';

interface ChunkVisual {
  mesh: THREE.Mesh;
}

export class DistrictsLayer {
  readonly root = new THREE.Group();
  private readonly byChunk = new Map<string, ChunkVisual>();
  private toolActive = false;
  private readonly material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  constructor(private grid: Grid) {
    this.root.name = 'districts';
    this.root.visible = false;
    grid.forEachChunk((chunk) => this.refreshChunk(chunk));
  }

  setToolActive(active: boolean): void {
    this.toolActive = active;
    this.root.visible = active;
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
    mesh.name = `districts_${key}`;
    this.byChunk.set(key, { mesh });
    this.root.add(mesh);
  }
}

function buildChunkMesh(chunk: Chunk, material: THREE.Material): THREE.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  chunk.cells.forEach((cell, key) => {
    if (cell.district === undefined || cell.terrain === 'water' || cell.building) return;
    const [cx, cz] = cellFromKey(key);
    color.set(PALETTE.districts[Math.abs(cell.district) % PALETTE.districts.length]);
    const x0 = cx * CELL_SIZE;
    const x1 = x0 + CELL_SIZE;
    const z0 = cz * CELL_SIZE;
    const z1 = z0 + CELL_SIZE;
    const y = 0.145;
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

