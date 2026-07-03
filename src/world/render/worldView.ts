/**
 * Construye la vista 3D LEYENDO el grid: terreno mergeado + edificios del
 * catálogo colocados en el centro de su footprint + árboles de las celdas prop.
 * En T1.6 los árboles pasarán a InstancedMesh; aquí van como grupos.
 */
import * as THREE from 'three';
import { Grid, CELL_SIZE, rotatedFootprint, Cell } from '../grid';
import { catalogItem } from '../catalog';
import { buildTerrainMesh } from './terrain';
import { blobTree, cypress } from '../../props';
import { createRng } from '../../rng';

function cellFromKey(key: number): [number, number] {
  return [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];
}

export function buildWorldView(grid: Grid): THREE.Group {
  const world = new THREE.Group();
  world.add(buildTerrainMesh(grid));

  const buildings = new THREE.Group();
  buildings.name = 'buildings';
  const props = new THREE.Group();
  props.name = 'props';
  world.add(buildings, props);

  grid.forEachChunk((chunk) => {
    chunk.cells.forEach((cell: Cell, key: number) => {
      const [cx, cz] = cellFromKey(key);

      // --- Edificios: solo en la celda ancla --------------------------------
      if (cell.building && cell.building.anchorX === cx && cell.building.anchorZ === cz) {
        const it = catalogItem(cell.building.id);
        if (it) {
          const rot = cell.building.rot;
          const [fw, fd] = rotatedFootprint(it.w, it.d, rot);
          const mesh = it.build();
          mesh.position.set((cx + fw / 2) * CELL_SIZE, 0, (cz + fd / 2) * CELL_SIZE);
          mesh.rotation.y = (-rot * Math.PI) / 2;
          buildings.add(mesh);
        }
      }

      // --- Props (árboles) --------------------------------------------------
      if (cell.prop) {
        const rng = createRng(cell.prop.variant);
        const scale = rng.range(0.75, 1.3);
        const tree =
          cell.prop.id === 'tree-cypress'
            ? cypress(scale)
            : blobTree(scale, rng.next() < 0.45);
        tree.position.set((cx + 0.5) * CELL_SIZE, 0, (cz + 0.5) * CELL_SIZE);
        tree.rotation.y = rng.range(0, Math.PI * 2);
        props.add(tree);
      }
    });
  });

  return world;
}
