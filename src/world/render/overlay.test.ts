/** Pruebas sin WebGL de la capa de overlays por chunk (H4.6). */
import * as THREE from 'three';
import { BUILDING_STRIDE } from '../../sim/protocol';
import { cellKey, Grid } from '../grid';
import { coverageFraction, heatColor, OverlayLayer } from './overlay';
import { COVERAGE_BITS } from '../../sim/coverage';
import { ROAD_SPECS } from '../roads';

let passed = 0;
let failed = 0;
function check(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

check(coverageFraction(0) === 0, 'overlay: cobertura cero es cero');
const allCoverage = Object.values(COVERAGE_BITS).reduce((mask, bit) => mask | bit, 0);
check(coverageFraction(allCoverage) === 1, 'overlay: cobertura completa es uno');
const cold = heatColor(0);
const hot = heatColor(1);
check(cold.b > hot.b && hot.r > cold.r, 'overlay: escala de calor va de frío a caliente');
check(heatColor(5).equals(hot) && heatColor(-2).equals(cold), 'overlay: calor se acota');

{
  const grid = new Grid();
  grid.fillTerrain(-4, -4, 20, 10, 'field');
  check(grid.placeBuilding('cottage', 3, 3, 0, 0), 'fixture overlay: coloca vivienda');
  check(grid.placeBuilding('shop', 4, 3, 6, 0), 'fixture overlay: coloca tienda');
  const layer = new OverlayLayer(grid);
  check(layer.root.children.length === 1, 'overlay: un chunk produce una malla');
  const mesh = layer.root.children[0] as THREE.Mesh;
  const geometry = mesh.geometry;
  const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
  const before = colors.getX(0);

  const stats = new Float32Array(2 * BUILDING_STRIDE);
  stats[0] = 0; stats[1] = 0; stats[2] = 0.1; stats[3] = 0.2;
  stats[8] = 6; stats[9] = 0; stats[10] = -1; stats[11] = 0.9;
  layer.setMode('happiness');
  layer.refreshFromStats(stats);
  check(layer.getMode() === 'happiness', 'overlay: cambia a felicidad');
  check(mesh.geometry === geometry, 'overlay: refrescar stats no reconstruye geometría');
  check(colors.getX(0) !== before, 'overlay: refrescar stats actualiza solo el color');
  layer.setMode('zones');
  check(layer.root.visible, 'overlay: modo zonas hace visible la capa');
  layer.setMode('none');
  check(!layer.root.visible, 'overlay: none oculta la capa');
}

{
  const grid = new Grid();
  grid.fillTerrain(-2, -2, 2, 2, 'field');
  grid.setRoad(0, 0, 'rural');
  const layer = new OverlayLayer(grid);
  const roadMesh = layer.root.children.find((child) => child.name.startsWith('traffic_overlay_')) as THREE.Mesh;
  const colors = roadMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const cold = colors.getX(0);
  layer.setMode('traffic');
  layer.refreshFromTraffic(new Uint32Array([cellKey(0, 0), ROAD_SPECS.rural.capacity]));
  check(layer.root.visible && roadMesh.visible, 'overlay: tráfico muestra la malla de calzadas');
  check(colors.getX(0) !== cold, 'overlay: TrafficMsg cambia el color de la calzada');
  layer.setMode('none');
  check(!roadMesh.visible, 'overlay: tráfico se oculta al volver a sin overlay');
}

console.log(`\noverlay.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
