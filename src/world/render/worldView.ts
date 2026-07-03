/**
 * Vista 3D del mundo, construida por CHUNKS leyendo el grid. Cada chunk es un
 * Group (terreno + vegetación + edificios anclados en él) con una boundingSphere
 * acotada, de modo que el frustum culling de THREE descarta los chunks fuera de
 * cámara. La clase ofrece `countVisibleChunks` para el HUD de debug.
 */
import * as THREE from 'three';
import { Grid, Chunk, CELL_SIZE, CHUNK, rotatedFootprint } from '../grid';
import { catalogItem } from '../catalog';
import { buildTerrainMeshForChunk } from './terrain';
import { buildVegetationForChunk } from './instances';

function cellFromKey(key: number): [number, number] {
  return [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];
}

interface ChunkVisual {
  group: THREE.Group;
  sphere: THREE.Sphere;
}

export class WorldView {
  readonly root = new THREE.Group();
  readonly chunkCount: number;
  private visuals: ChunkVisual[] = [];
  private frustum = new THREE.Frustum();
  private mat = new THREE.Matrix4();

  constructor(grid: Grid) {
    grid.forEachChunk((chunk) => {
      const visual = this.buildChunk(grid, chunk);
      if (visual) {
        this.visuals.push(visual);
        this.root.add(visual.group);
      }
    });
    this.chunkCount = this.visuals.length;
  }

  private buildChunk(grid: Grid, chunk: Chunk): ChunkVisual | null {
    const group = new THREE.Group();
    group.name = `chunk_${chunk.chx}_${chunk.chz}`;

    const terrain = buildTerrainMeshForChunk(chunk);
    if (terrain) group.add(terrain);

    const veg = buildVegetationForChunk(chunk);
    if (veg) group.add(veg);

    // Edificios anclados en este chunk.
    chunk.cells.forEach((cell, key) => {
      const [cx, cz] = cellFromKey(key);
      if (cell.building && cell.building.anchorX === cx && cell.building.anchorZ === cz) {
        const it = catalogItem(cell.building.id);
        if (!it) return;
        const rot = cell.building.rot;
        const [fw, fd] = rotatedFootprint(it.w, it.d, rot);
        const mesh = it.build();
        mesh.position.set((cx + fw / 2) * CELL_SIZE, 0, (cz + fd / 2) * CELL_SIZE);
        mesh.rotation.y = (-rot * Math.PI) / 2;
        group.add(mesh);
      }
    });

    if (group.children.length === 0) return null;

    // BoundingSphere del chunk (centro del chunk + margen para edificios altos).
    const cx = (chunk.chx * CHUNK + CHUNK / 2) * CELL_SIZE;
    const cz = (chunk.chz * CHUNK + CHUNK / 2) * CELL_SIZE;
    const radius = (CHUNK * CELL_SIZE * Math.SQRT2) / 2 + 20;
    const sphere = new THREE.Sphere(new THREE.Vector3(cx, 0, cz), radius);
    return { group, sphere };
  }

  /** Cuántos chunks intersectan el frustum de la cámara ahora mismo. */
  countVisibleChunks(cam: THREE.Camera): number {
    this.mat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.mat);
    let n = 0;
    for (const v of this.visuals) if (this.frustum.intersectsSphere(v.sphere)) n++;
    return n;
  }
}
