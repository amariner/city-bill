/** Render rico de transporte público (H5.4): buses y postes de parada
 * instanciados. Solo lee los buffers transferidos por SimClient; no decide
 * rutas ni modifica la simulación. */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CELL_SIZE } from '../grid';
import { BUS_STOP_STRIDE, VEHICLE_STRIDE, VehicleKindCode } from '../../sim/protocol';

const MAX_BUSES = 4096;
const MAX_STOPS = 4096;

function busBodyGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1.45, 0.72, 3.25);
  geometry.translate(0, 0.58, 0);
  return geometry;
}

function busGlassGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1.18, 0.42, 1.65);
  geometry.translate(0, 1.03, -0.22);
  return geometry;
}

export class VehicleView {
  readonly root = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly glass: THREE.InstancedMesh;
  private readonly stopPads: THREE.InstancedMesh;
  private readonly stopPoles: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.root.name = 'public-transport';
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.busBody, flatShading: true });
    const glassMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.glass, flatShading: true });
    this.bodies = new THREE.InstancedMesh(busBodyGeometry(), bodyMaterial, MAX_BUSES);
    this.glass = new THREE.InstancedMesh(busGlassGeometry(), glassMaterial, MAX_BUSES);
    for (const mesh of [this.bodies, this.glass]) {
      mesh.name = mesh === this.bodies ? 'buses' : 'bus-glass';
      mesh.castShadow = mesh === this.bodies;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(mesh);
    }

    const stopMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.signYellow, flatShading: true });
    this.stopPads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8), stopMaterial, MAX_STOPS);
    this.stopPads.name = 'bus-stop-pads';
    this.stopPads.frustumCulled = false;
    this.root.add(this.stopPads);
    const poleMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.houseTrim, flatShading: true });
    this.stopPoles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), poleMaterial, MAX_STOPS);
    this.stopPoles.name = 'bus-stop-poles';
    this.stopPoles.frustumCulled = false;
    this.root.add(this.stopPoles);
  }

  /** Actualiza la flota y las paradas sin reconstruir geometría. */
  update(vehicles: Float32Array | null, busStops: Float32Array | null): void {
    let buses = 0;
    if (vehicles) {
      for (let offset = 0; offset + VEHICLE_STRIDE <= vehicles.length && buses < MAX_BUSES; offset += VEHICLE_STRIDE) {
        if (vehicles[offset + 4] !== VehicleKindCode.Bus) continue;
        const x = vehicles[offset + 1];
        const z = vehicles[offset + 2];
        const heading = vehicles[offset + 3];
        this.position.set(x * CELL_SIZE, 0, z * CELL_SIZE);
        this.quaternion.setFromAxisAngle(this.up, heading);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.bodies.setMatrixAt(buses, this.matrix);
        this.glass.setMatrixAt(buses, this.matrix);
        buses++;
      }
    }
    this.bodies.count = buses;
    this.glass.count = buses;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.glass.instanceMatrix.needsUpdate = true;

    let stops = 0;
    if (busStops) {
      for (let offset = 0; offset + BUS_STOP_STRIDE <= busStops.length && stops < MAX_STOPS; offset += BUS_STOP_STRIDE) {
        const x = busStops[offset + 1];
        const z = busStops[offset + 2];
        this.position.set((x + 0.5) * CELL_SIZE, 0.18, (z + 0.5) * CELL_SIZE);
        this.matrix.compose(this.position, this.quaternion.set(0, 0, 0, 1), this.scale);
        this.stopPads.setMatrixAt(stops, this.matrix);
        this.position.y = 0.66;
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.stopPoles.setMatrixAt(stops, this.matrix);
        stops++;
      }
    }
    this.stopPads.count = stops;
    this.stopPoles.count = stops;
    this.stopPads.instanceMatrix.needsUpdate = true;
    this.stopPoles.instanceMatrix.needsUpdate = true;
  }
}
