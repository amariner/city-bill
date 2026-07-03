/**
 * Expositor del catálogo: recorre CATALOG_ITEMS y coloca cada build() sobre una
 * parcela, con su nombre-footprint implícito. Test visual de T1.3.
 * Se abre con ?scene=buildings
 */
import * as THREE from 'three';
import { PALETTE } from './palette';
import { createRng } from './rng';
import { CATALOG_ITEMS } from './world/catalog';
import { CELL_SIZE } from './world/grid';
import { blobTree, cypress, citizen, mat } from './props';

const rng = createRng(19870412);

function pad(w: number, d: number, color: number, y = 0.015): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

export function buildShowcase(): THREE.Group {
  const world = new THREE.Group();
  world.add(pad(600, 600, PALETTE.groundBase, 0));

  // Solo edificios en el expositor (los árboles sueltos se ven de escala).
  const exhibits = CATALOG_ITEMS.filter((it) => it.role !== 'nature');

  const cols = 4;
  const spacingX = 36;
  const spacingZ = 36;
  exhibits.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * spacingX;
    const z = (row - 1.5) * spacingZ;

    // Parcela verde dimensionada al footprint del ítem.
    const p = pad(Math.max(it.w * CELL_SIZE + 8, 20), Math.max(it.d * CELL_SIZE + 8, 20), rng.pick(PALETTE.grassPatches));
    p.position.set(x, p.position.y, z);
    world.add(p);

    const mesh = it.build();
    mesh.position.set(x, 0, z);
    world.add(mesh);

    // Árboles y un ciudadano de escala por parcela.
    for (let t = 0; t < 2; t++) {
      const tree = rng.next() < 0.5 ? blobTree(rng.range(0.8, 1.1)) : cypress(rng.range(0.8, 1.1));
      tree.position.set(x + rng.range(-14, 14), 0, z + it.d * CELL_SIZE * 0.5 + rng.range(2, 5));
      world.add(tree);
    }
    const c = citizen(rng.pick(PALETTE.citizenClothes));
    c.position.set(x + rng.range(-5, 5), 0, z + it.d * CELL_SIZE * 0.5 + 3);
    c.rotation.y = rng.range(0, Math.PI * 2);
    world.add(c);
  });

  return world;
}
