/**
 * Renderiza el terreno como mallas mergeadas con vertex-colors: un quad por
 * celda con tono variado (patchwork por región + jitter por celda), ~1 draw
 * call por chunk. Al trocearlo por chunk, el frustum culling de THREE descarta
 * los chunks fuera de cámara. El render LEE el grid; nunca lo modifica.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { createRng } from '../../rng';
import { Grid, Chunk, Terrain, CELL_SIZE, Cell } from '../grid';

const LAYER_Y: Record<Terrain, number> = {
  none: 0,
  field: 0.02,
  grass: 0.05,
  water: 0.07,
  path: 0.09,
  road: 0.11,
};

function baseColor(terrain: Terrain, rng: ReturnType<typeof createRng>): number {
  switch (terrain) {
    case 'field':
      return rng.pick(PALETTE.fields);
    case 'grass':
      return rng.pick(PALETTE.grassPatches);
    case 'water':
      return PALETTE.pond;
    case 'path':
      return PALETTE.path;
    case 'road':
      return PALETTE.road;
    default:
      return PALETTE.groundBase;
  }
}

interface QuadBuffers {
  positions: number[];
  normals: number[];
  colors: number[];
}

function cellFromKey(key: number): [number, number] {
  return [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];
}

function emitCell(buf: QuadBuffers, cx: number, cz: number, cell: Cell, c: THREE.Color, cultivation: number): void {
  if (cell.terrain === 'none') return;

  // Color base por región (parches grandes) + jitter fino por celda.
  const shift = cell.terrain === 'field' ? 4 : cell.terrain === 'grass' ? 2 : 8;
  const regionRng = createRng(((cx >> shift) * 73856093) ^ ((cz >> shift) * 19349663));
  c.set(baseColor(cell.terrain, regionRng));
  if (cell.terrain === 'field' && cultivation > 0) {
    // Faena reciente (economy.cultivation): el barbecho vira a tonos de
    // cultivo, con franjas por fila (surcos) que se marcan más cuanto más
    // trabajado está el campo — cero horario fijo, solo el nivel agregado.
    const worked = new THREE.Color(regionRng.pick(PALETTE.fieldsCultivated));
    c.lerp(worked, cultivation);
    if (((cz % 2) + 2) % 2 === 1) c.multiplyScalar(1 - cultivation * 0.12);
  }
  const cellRng = createRng((cx * 83492791) ^ (cz * 29874321));
  c.multiplyScalar(0.97 + cellRng.next() * 0.06);

  const y = LAYER_Y[cell.terrain];
  const x0 = cx * CELL_SIZE;
  const x1 = x0 + CELL_SIZE;
  const z0 = cz * CELL_SIZE;
  const z1 = z0 + CELL_SIZE;

  // Winding CCW visto desde +Y (cara frontal hacia la cámara).
  buf.positions.push(x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1);
  for (let i = 0; i < 6; i++) {
    buf.normals.push(0, 1, 0);
    buf.colors.push(c.r, c.g, c.b);
  }
}

function finish(buf: QuadBuffers): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Malla de terreno de un solo chunk (o null si no tiene terreno). `cultivation`
 * [0,1]: cuánta faena agrícola reciente hay en la ciudad (economy.cultivation). */
export function buildTerrainMeshForChunk(chunk: Chunk, cultivation = 0): THREE.Mesh | null {
  const buf: QuadBuffers = { positions: [], normals: [], colors: [] };
  const c = new THREE.Color();
  chunk.cells.forEach((cell, key) => {
    const [cx, cz] = cellFromKey(key);
    emitCell(buf, cx, cz, cell, c, cultivation);
  });
  if (buf.positions.length === 0) return null;
  return finish(buf);
}

/** Malla de terreno de todo el grid (una sola geometría). */
export function buildTerrainMesh(grid: Grid, cultivation = 0): THREE.Mesh {
  const buf: QuadBuffers = { positions: [], normals: [], colors: [] };
  const c = new THREE.Color();
  grid.forEachChunk((chunk) => {
    chunk.cells.forEach((cell, key) => {
      const [cx, cz] = cellFromKey(key);
      emitCell(buf, cx, cz, cell, c, cultivation);
    });
  });
  return finish(buf);
}
