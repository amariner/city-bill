/**
 * Expositor de edificios: todos los modelos del catálogo colocados en rejilla
 * sobre una manzana urbana, para validar la estética de cada pieza.
 * Se abre con ?scene=buildings
 */
import * as THREE from 'three';
import { PALETTE } from './palette';
import { createRng } from './rng';
import {
  apartmentSlab,
  brickBlock,
  officeBlock,
  rowHouses,
  supermarket,
  parkingGarage,
  civic,
  factory,
  farmhouse,
  barn,
  cottage,
  shop,
  blobTree,
  cypress,
  citizen,
  mat,
} from './props';

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
  world.add(pad(500, 500, PALETTE.groundBase, 0));

  const exhibits: Array<() => THREE.Group> = [
    () => apartmentSlab(6, 20, 8),
    () => brickBlock(5),
    () => officeBlock(8),
    () => rowHouses(4),
    () => supermarket(),
    () => parkingGarage(3),
    () => civic(),
    () => factory(),
    () => farmhouse(),
    () => barn(),
    () => cottage(),
    () => shop(),
  ];

  const cols = 4;
  const spacingX = 34;
  const spacingZ = 34;
  exhibits.forEach((build, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * spacingX;
    const z = (row - 1) * spacingZ;

    // Parcela verde bajo cada pieza
    world.add(((): THREE.Mesh => {
      const p = pad(28, 26, rng.pick(PALETTE.grassPatches));
      p.position.set(x, p.position.y, z);
      return p;
    })());

    const b = build();
    b.position.set(x, 0, z);
    world.add(b);

    // Un par de árboles y un ciudadano de escala por parcela
    for (let t = 0; t < 2; t++) {
      const tree = rng.next() < 0.5 ? blobTree(rng.range(0.8, 1.1)) : cypress(rng.range(0.8, 1.1));
      tree.position.set(x + rng.range(-12, 12), 0, z + rng.range(9, 12));
      world.add(tree);
    }
    const c = citizen(rng.pick(PALETTE.citizenClothes));
    c.position.set(x + rng.range(-4, 4), 0, z + rng.range(11, 13));
    c.rotation.y = rng.range(0, Math.PI * 2);
    world.add(c);
  });

  return world;
}
