/**
 * Renderiza el terreno del grid como UNA malla mergeada con vertex-colors:
 * un quad por celda con tono variado (RNG determinista por celda), de modo que
 * el patchwork pastel se conserva pero cuesta ~1 draw call.
 * El render LEE el grid; nunca lo modifica.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { createRng } from '../../rng';
import { Grid, Terrain, CELL_SIZE, Cell } from '../grid';

// Altura de cada capa: escalona las vías por encima del suelo para evitar
// z-fighting sin necesidad de polygonOffset.
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

export function buildTerrainMesh(grid: Grid): THREE.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const c = new THREE.Color();

  grid.forEachChunk((chunk) => {
    chunk.cells.forEach((cell: Cell, key: number) => {
      if (cell.terrain === 'none') return;
      // Reconstruye coords de celda desde la clave empaquetada.
      const cx = Math.floor(key / 65536) - 32768;
      const cz = (key % 65536) - 32768;

      // Color base por REGIÓN (parches grandes tipo patchwork) + jitter fino
      // por celda. Los campos usan parches grandes (16 celdas); la hierba,
      // parches medianos (4 celdas) que evocan el césped segado a franjas.
      const shift = cell.terrain === 'field' ? 4 : cell.terrain === 'grass' ? 2 : 8;
      const regionRng = createRng(((cx >> shift) * 73856093) ^ ((cz >> shift) * 19349663));
      c.set(baseColor(cell.terrain, regionRng));
      const cellRng = createRng((cx * 83492791) ^ (cz * 29874321));
      c.multiplyScalar(0.97 + cellRng.next() * 0.06);

      const y = LAYER_Y[cell.terrain];
      const x0 = cx * CELL_SIZE;
      const x1 = x0 + CELL_SIZE;
      const z0 = cz * CELL_SIZE;
      const z1 = z0 + CELL_SIZE;

      // Dos triángulos con winding CCW visto desde +Y (cara frontal arriba,
      // hacia la cámara) — si no, el backface culling los descartaría.
      positions.push(x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1);
      for (let i = 0; i < 6; i++) {
        normals.push(0, 1, 0);
        colors.push(c.r, c.g, c.b);
      }
    });
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
