/**
 * Vegetación instanciada: todos los árboles del grid se dibujan con unos pocos
 * InstancedMesh (tronco + copa por especie) en vez de un Group por árbol.
 * Variación por instancia: posición, escala, rotación y tono de copa.
 * Toda la vegetación cuesta ~4 draw calls, escale a miles de árboles.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { createRng } from '../../rng';
import { Grid, Chunk, CELL_SIZE, Cell } from '../grid';
import { mat } from '../../props';

interface TreeInstance {
  wx: number;
  wz: number;
  scale: number;
  rotY: number;
  alt: boolean;
}

function cellFromKey(key: number): [number, number] {
  return [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];
}

// Geometrías base con el pivote en y=0 y la escala no uniforme ya "horneada",
// de modo que la matriz por instancia solo aplica traslación + escala uniforme.
function makeGeometries() {
  const trunk = new THREE.CylinderGeometry(0.14, 0.18, 0.7, 6).translate(0, 0.35, 0);
  const blobCrown = new THREE.SphereGeometry(1.15, 10, 8).scale(1, 1.35, 1).translate(0, 1.9, 0);
  const cypTrunk = new THREE.CylinderGeometry(0.1, 0.13, 0.5, 6).translate(0, 0.25, 0);
  const cypCrown = new THREE.ConeGeometry(0.7, 3.6, 8).translate(0, 2.2, 0);
  return { trunk, blobCrown, cypTrunk, cypCrown };
}

function fillMatrices(mesh: THREE.InstancedMesh, list: TreeInstance[]): void {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  list.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rotY);
    pos.set(t.wx, 0, t.wz);
    scl.set(t.scale, t.scale, t.scale);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function crownMesh(
  geo: THREE.BufferGeometry,
  list: TreeInstance[],
  colorFor: (t: TreeInstance, rng: () => number) => THREE.Color,
): THREE.InstancedMesh {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  fillMatrices(mesh, list);
  const rng = createRng(0x5eed);
  list.forEach((t, i) => mesh.setColorAt(i, colorFor(t, rng.next)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function trunkMesh(geo: THREE.BufferGeometry, list: TreeInstance[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat(PALETTE.trunk), list.length);
  fillMatrices(mesh, list);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function collect(cell: Cell, key: number, blobs: TreeInstance[], cypresses: TreeInstance[]): void {
  if (!cell.prop) return;
  const [cx, cz] = cellFromKey(key);
  const rng = createRng(cell.prop.variant);
  const inst: TreeInstance = {
    wx: (cx + 0.5) * CELL_SIZE,
    wz: (cz + 0.5) * CELL_SIZE,
    scale: rng.range(0.75, 1.3),
    rotY: rng.range(0, Math.PI * 2),
    alt: rng.next() < 0.45,
  };
  if (cell.prop.id === 'tree-cypress') cypresses.push(inst);
  else blobs.push(inst);
}

function assemble(blobs: TreeInstance[], cypresses: TreeInstance[]): THREE.Group {
  const geo = makeGeometries();
  const group = new THREE.Group();
  group.name = 'vegetation';
  const base = new THREE.Color();

  if (blobs.length) {
    group.add(trunkMesh(geo.trunk, blobs));
    group.add(
      crownMesh(geo.blobCrown, blobs, (t, rand) => {
        base.set(t.alt ? PALETTE.treeBlobAlt : PALETTE.treeBlob);
        return base.clone().multiplyScalar(0.9 + rand() * 0.2);
      }),
    );
  }
  if (cypresses.length) {
    group.add(trunkMesh(geo.cypTrunk, cypresses));
    group.add(
      crownMesh(geo.cypCrown, cypresses, (_t, rand) => {
        base.set(PALETTE.cypress);
        return base.clone().multiplyScalar(0.9 + rand() * 0.2);
      }),
    );
  }

  return group;
}

/** Vegetación de todo el grid. */
export function buildVegetation(grid: Grid): THREE.Group {
  const blobs: TreeInstance[] = [];
  const cypresses: TreeInstance[] = [];
  grid.forEachChunk((chunk) => chunk.cells.forEach((cell, key) => collect(cell, key, blobs, cypresses)));
  return assemble(blobs, cypresses);
}

/** Vegetación de un solo chunk (o null si no tiene árboles). */
export function buildVegetationForChunk(chunk: Chunk): THREE.Group | null {
  const blobs: TreeInstance[] = [];
  const cypresses: TreeInstance[] = [];
  chunk.cells.forEach((cell, key) => collect(cell, key, blobs, cypresses));
  if (blobs.length === 0 && cypresses.length === 0) return null;
  return assemble(blobs, cypresses);
}
