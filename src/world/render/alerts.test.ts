/** Pruebas sin WebGL de los pins de alerta H4.7. */
import * as THREE from 'three';
import { AlertBit, BUILDING_STRIDE } from '../../sim/protocol';
import { Grid } from '../grid';
import { AlertsLayer, MAX_ALERTS, primaryAlert } from './alerts';

let passed = 0;
let failed = 0;
function check(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

check(primaryAlert(0) === null, 'alertas: máscara cero no crea pin');
check(primaryAlert(AlertBit.NoRoad | AlertBit.NoJob)?.bit === AlertBit.NoRoad, 'alertas: selecciona la incidencia de mayor prioridad');
check(primaryAlert(AlertBit.Abandoned | AlertBit.Congested)?.bit === AlertBit.Abandoned, 'alertas: abandono domina a congestión');

{
  const grid = new Grid();
  grid.fillTerrain(-4, -4, 10, 10, 'field');
  check(grid.placeBuilding('cottage', 3, 3, 0, 0), 'fixture alertas: coloca vivienda');
  const layer = new AlertsLayer(grid);
  const stats = new Float32Array(BUILDING_STRIDE);
  stats[0] = 0;
  stats[1] = 0;
  stats[5] = AlertBit.NoRoad | AlertBit.NoService;
  layer.refreshFromStats(stats);
  const cone = layer.root.children[0] as THREE.InstancedMesh;
  const sphere = layer.root.children[1] as THREE.InstancedMesh;
  check(layer.root.visible, 'alertas: un problema hace visible la capa');
  check(cone.count === 1 && sphere.count === 1, 'alertas: una vivienda genera un pin instanciado');
  check(cone.count <= MAX_ALERTS, 'alertas: respeta el máximo de instancias');
  check(cone.instanceColor !== null && sphere.instanceColor !== null, 'alertas: cada pin transporta su color');
  const before = cone.instanceMatrix.array[13];
  layer.update(0.25);
  check(cone.instanceMatrix.array[13] !== before, 'alertas: el pin tiene rebote cosmético');
  layer.refreshFromStats(stats);
  check(cone.count === 1, 'alertas: mismo buffer no duplica instancias');
}

console.log(`\nalerts.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
