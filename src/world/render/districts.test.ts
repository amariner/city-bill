/** Prueba headless del overlay de distritos (H5.5). */
import * as THREE from 'three';
import { Grid } from '../grid';
import { DistrictsLayer } from './districts';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) passed++;
  else { failed++; console.error(`  ✗ ${name}`); }
}

const grid = new Grid();
grid.fillTerrain(-2, -2, 3, 3, 'field');
grid.setDistrict(0, 0, 1);
grid.setDistrict(1, 0, 2);
grid.setTerrain(2, 0, 'water');
const layer = new DistrictsLayer(grid);
const first = layer.root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
check('render: crea una malla por chunk con distritos', first.length === 1);
check('render: empieza oculto hasta activar herramienta', layer.root.visible === false);
layer.setToolActive(true);
check('render: activa el overlay con la herramienta', layer.root.visible === true);
const geometry = first[0]?.geometry as THREE.BufferGeometry | undefined;
check('render: pinta solo celdas de distrito no acuáticas', geometry?.getAttribute('position').count === 12);
grid.setDistrict(0, 0, undefined);
const patch = grid.takeJournal();
layer.refreshCells(patch);
const updated = layer.root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
check('render: refresca el chunk al borrar una celda', (updated[0]?.geometry as THREE.BufferGeometry).getAttribute('position').count === 6);

console.log(`\ndistricts.render.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);

