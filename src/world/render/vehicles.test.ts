/** Prueba headless del render instanciado de transporte público (H5.4). */
import * as THREE from 'three';
import { BUS_STOP_STRIDE, VEHICLE_STRIDE, VehicleKindCode } from '../../sim/protocol';
import { VehicleView } from './vehicles';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) passed++;
  else { failed++; console.error(`  ✗ ${name}`); }
}

const view = new VehicleView();
const vehicles = new Float32Array(VEHICLE_STRIDE * 2);
vehicles.set([11, 2.5, 3.5, Math.PI / 2, VehicleKindCode.Bus, 4, 22, 5.5, 6.5, 0, 99, 0]);
const stops = new Float32Array(BUS_STOP_STRIDE * 2);
stops.set([4, 2, 3, 0, 4, 8, 9, 1]);
view.update(vehicles, stops);

const buses = view.root.getObjectByName('buses') as THREE.InstancedMesh;
const busGlass = view.root.getObjectByName('bus-glass') as THREE.InstancedMesh;
const pads = view.root.getObjectByName('bus-stop-pads') as THREE.InstancedMesh;
const poles = view.root.getObjectByName('bus-stop-poles') as THREE.InstancedMesh;
check('render: dibuja solo los vehículos tipo bus', buses.count === 1 && busGlass.count === 1);
check('render: convierte celdas a metros en la flota', buses.getMatrixAt(0, new THREE.Matrix4()).elements[12] === 5);
check('render: instancia todas las paradas recibidas', pads.count === 2 && poles.count === 2);
view.update(null, null);
check('render: limpia la flota y paradas cuando el canal llega vacío', buses.count === 0 && pads.count === 0);

console.log(`\nvehicles.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
