/**
 * Pins de alerta sobre edificios (H4.7). Es una pareja de InstancedMesh —cono
 * y esfera— con un máximo fijo de 2000 incidencias, así la ciudad puede señalar
 * problemas sin pagar un draw call por edificio. La sim sigue siendo la fuente
 * de verdad: este módulo solo lee BuildingStatsMsg y anima un rebote cosmético.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { AlertBit, BUILDING_STRIDE } from '../../sim/protocol';
import { catalogData } from '../catalogData';
import { CELL_SIZE, Grid } from '../grid';

export const MAX_ALERTS = 2000;

const ALERT_COLORS: Array<[AlertBit, number]> = [
  [AlertBit.Abandoned, PALETTE.alertAbandoned],
  [AlertBit.NoRoad, PALETTE.alertNoRoad],
  [AlertBit.NoJob, PALETTE.alertNoJob],
  [AlertBit.Unhappy, PALETTE.alertUnhappy],
  [AlertBit.NoService, PALETTE.alertNoService],
  [AlertBit.Congested, PALETTE.alertCongested],
];

/** Elige la incidencia más útil para un pin cuando varias afectan al edificio. */
export function primaryAlert(mask: number): { bit: AlertBit; color: number } | null {
  for (const [bit, color] of ALERT_COLORS) if ((mask & bit) !== 0) return { bit, color };
  return null;
}

interface AlertInstance {
  x: number;
  z: number;
  y: number;
  phase: number;
  azimuth: number;
  color: THREE.Color;
}

export class AlertsLayer {
  readonly root = new THREE.Group();
  private readonly cone: THREE.InstancedMesh;
  private readonly sphere: THREE.InstancedMesh;
  private readonly alerts: AlertInstance[] = [];
  private readonly scratch = new THREE.Object3D();
  private lastStatsBuffer: Float32Array | null = null;
  private elapsed = 0;

  constructor(private readonly grid: Grid) {
    this.root.name = 'building-alerts';
    this.root.visible = false;
    const material = new THREE.MeshBasicMaterial({
      color: PALETTE.houseWall,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.cone = new THREE.InstancedMesh(new THREE.ConeGeometry(0.30, 0.95, 6), material, MAX_ALERTS);
    this.sphere = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 5), material, MAX_ALERTS);
    this.cone.name = 'alert-pin-cones';
    this.sphere.name = 'alert-pin-spheres';
    this.cone.renderOrder = 4;
    this.sphere.renderOrder = 4;
    this.cone.frustumCulled = false;
    this.sphere.frustumCulled = false;
    this.root.add(this.cone, this.sphere);
  }

  /** Consume el canal espacial lento; el buffer se compara por referencia. */
  refreshFromStats(buffer: Float32Array | null): void {
    if (!buffer || buffer === this.lastStatsBuffer) return;
    this.lastStatsBuffer = buffer;
    this.alerts.length = 0;
    for (let offset = 0; offset + BUILDING_STRIDE <= buffer.length; offset += BUILDING_STRIDE) {
      const ax = buffer[offset];
      const az = buffer[offset + 1];
      const mask = buffer[offset + 5];
      if (mask === 0 || this.alerts.length >= MAX_ALERTS) continue;
      const alert = primaryAlert(mask);
      const cell = this.grid.get(ax, az);
      const ref = cell?.building;
      if (!alert || !ref) continue;
      const item = catalogData(ref.id);
      if (!item) continue;
      const fw = ref.fw ?? (ref.rot % 2 === 0 ? item.w : item.d);
      const fd = ref.fd ?? (ref.rot % 2 === 0 ? item.d : item.w);
      this.alerts.push({
        x: (ax + fw / 2) * CELL_SIZE,
        z: (az + fd / 2) * CELL_SIZE,
        // El catálogo tiene alturas distintas; esta cota común deja la señal
        // por encima incluso de los bloques T3 sin transportar otra estadística.
        y: 6.5,
        phase: (ax * 0.173 + az * 0.319) % (Math.PI * 2),
        azimuth: Math.atan2(az + 0.5, ax + 0.5),
        color: new THREE.Color(alert.color),
      });
    }
    this.cone.count = this.alerts.length;
    this.sphere.count = this.alerts.length;
    for (let i = 0; i < this.alerts.length; i++) {
      this.cone.setColorAt(i, this.alerts[i].color);
      this.sphere.setColorAt(i, this.alerts[i].color);
    }
    if (this.cone.instanceColor) this.cone.instanceColor.needsUpdate = true;
    if (this.sphere.instanceColor) this.sphere.instanceColor.needsUpdate = true;
    this.root.visible = this.alerts.length > 0;
    this.cone.computeBoundingSphere();
    this.sphere.computeBoundingSphere();
    this.update(0);
  }

  /** Rebote/azimut de presentación; no cambia ninguna estadística. */
  update(dt: number): void {
    this.elapsed += dt;
    for (let i = 0; i < this.alerts.length; i++) {
      const alert = this.alerts[i];
      const bob = Math.sin(this.elapsed * 3 + alert.phase) * 0.10;
      this.scratch.position.set(alert.x, alert.y + bob, alert.z);
      this.scratch.rotation.set(0, alert.azimuth, 0);
      this.scratch.updateMatrix();
      this.cone.setMatrixAt(i, this.scratch.matrix);
      this.scratch.position.y += 0.48;
      this.scratch.updateMatrix();
      this.sphere.setMatrixAt(i, this.scratch.matrix);
    }
    if (this.alerts.length > 0) {
      this.cone.instanceMatrix.needsUpdate = true;
      this.sphere.instanceMatrix.needsUpdate = true;
    }
  }
}
