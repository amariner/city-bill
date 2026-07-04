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
import { homeGarden, festivalDecor } from '../../props';
import { Season } from '../../palette';

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
  private byChunk = new Map<string, ChunkVisual>();
  private frustum = new THREE.Frustum();
  private mat = new THREE.Matrix4();
  /** Prestigio [0,1] por vivienda ('ax,az') — ciclo 9, estatus y propiedad. */
  private homePrestige = new Map<string, number>();
  /** Faena agrícola reciente [0,1] (economy.cultivation) — deuda de T3.8. */
  private cultivation = 0;
  /** Fiesta de barrio en curso (ciclo 10) — decora los edificios cívicos. */
  private festivalActive = false;
  /** Estación actual (T5.1) — colorea terreno y vegetación. */
  private season: Season = 'verano';

  constructor(private grid: Grid) {
    grid.forEachChunk((chunk) => {
      const visual = this.buildChunk(grid, chunk);
      if (visual) {
        this.addVisual(chunk, visual);
      }
    });
    this.chunkCount = this.visuals.length;
  }

  private addVisual(chunk: Chunk, visual: ChunkVisual): void {
    this.visuals.push(visual);
    this.byChunk.set(`${chunk.chx},${chunk.chz}`, visual);
    this.root.add(visual.group);
  }

  /** Reconstruye la vista del chunk que contiene la celda (cx,cz) — para
   * crecimiento autónomo y construcción del jugador. */
  refreshChunkAt(cx: number, cz: number): void {
    const chx = Math.floor(cx / CHUNK);
    const chz = Math.floor(cz / CHUNK);
    const key = `${chx},${chz}`;
    const chunk = this.grid.chunkAt(chx, chz);
    if (!chunk) return;
    const old = this.byChunk.get(key);
    if (old) {
      this.root.remove(old.group);
      this.visuals.splice(this.visuals.indexOf(old), 1);
      this.byChunk.delete(key);
    }
    const visual = this.buildChunk(this.grid, chunk);
    if (visual) this.addVisual(chunk, visual);
  }

  /** Registra el nuevo prestigio de una vivienda y redecora su chunk (ciclo 9). */
  setHomePrestige(ax: number, az: number, prestige: number): void {
    this.homePrestige.set(`${ax},${az}`, prestige);
    this.refreshChunkAt(ax, az);
  }

  /** Actualiza el nivel de faena agrícola y repinta el terreno (deuda T3.8).
   * Se ignoran cambios minúsculos: repintar el terreno reconstruye TODOS los
   * chunks (barato, pero no hace falta hacerlo por un 1% de diferencia). */
  setCultivation(level: number): void {
    if (Math.abs(level - this.cultivation) < 0.03) return;
    this.cultivation = level;
    this.rebuildAllChunks();
  }

  /** Activa o apaga la decoración de fiesta en los edificios cívicos (ciclo 10). */
  setFestivalActive(active: boolean): void {
    if (active === this.festivalActive) return;
    this.festivalActive = active;
    this.rebuildAllChunks();
  }

  /** Cambia la estación (T5.1) y repinta terreno + vegetación de todo el mapa. */
  setSeason(season: Season): void {
    if (season === this.season) return;
    this.season = season;
    this.rebuildAllChunks();
  }

  private rebuildAllChunks(): void {
    for (const chunk of [...this.byChunk.keys()]) {
      const [chx, chz] = chunk.split(',').map(Number);
      this.refreshChunkAt(chx * CHUNK, chz * CHUNK);
    }
  }

  private buildChunk(grid: Grid, chunk: Chunk): ChunkVisual | null {
    const group = new THREE.Group();
    group.name = `chunk_${chunk.chx}_${chunk.chz}`;

    const terrain = buildTerrainMeshForChunk(chunk, this.cultivation, this.season);
    if (terrain) group.add(terrain);

    const veg = buildVegetationForChunk(chunk, this.season);
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
        if (it.role === 'residential') {
          const prestige = this.homePrestige.get(`${cx},${cz}`) ?? 0;
          if (prestige > 0) {
            const seed = (cx * 92821 + cz * 68917) | 0;
            mesh.add(homeGarden(prestige, it.w * CELL_SIZE, it.d * CELL_SIZE, seed));
          }
        } else if (it.role === 'civic' && this.festivalActive) {
          const seed = (cx * 92821 + cz * 68917) | 0;
          mesh.add(festivalDecor(it.w * CELL_SIZE, it.d * CELL_SIZE, seed));
        }
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
