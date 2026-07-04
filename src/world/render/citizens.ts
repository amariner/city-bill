/**
 * Render instanciado de ciudadanos (T3.6): cuerpo acampanado + cabeza para los
 * que van a PIE, y chasis + cabina para los que van en COCHE (ciclo 8/T3.9).
 * Lee AgentView[] interpolado del SimClient cada frame; nada de lógica de sim.
 * - Inside → escala 0 (con fade rápido al entrar/salir).
 * - Walking → bobbing sutil; Idle → sway lento (solo a pie).
 * - mode===1 (en coche): se dibuja el coche en vez del peatón (el dato `mode`
 *   ya viajaba entero por el pipeline desde el ciclo 8; aquí por fin se ve).
 * 4 draw calls para TODA la población (2 peatón + 2 coche), instancing puro.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CELL_SIZE } from '../grid';
import { AgentView } from '../../sim/client';
import { AgentState, TravelModeCode } from '../../sim/protocol';

const MAX_AGENTS = 2048;

export class CitizenView {
  readonly root = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private carBodies: THREE.InstancedMesh;
  private carCabins: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  /** Escala de aparición por id (fade al entrar/salir de edificios). */
  private appear = new Map<number, number>();
  private time = 0;

  constructor() {
    const bodyGeo = new THREE.CylinderGeometry(0.14, 0.3, 1.1, 8);
    bodyGeo.translate(0, 0.55, 0);
    const headGeo = new THREE.SphereGeometry(0.16, 8, 6);
    headGeo.translate(0, 1.32, 0);
    const bodyMat = new THREE.MeshLambertMaterial({ flatShading: true });
    const headMat = new THREE.MeshLambertMaterial({ flatShading: true, color: PALETTE.citizenSkin });

    // Coche low-poly: chasis largo y bajo + cabina (el eje LARGO es +z = la
    // dirección de marcha, igual que el heading del peatón). Muy achatado para
    // leerse como un cochecito desde la isométrica, no como un ladrillo.
    const chassisGeo = new THREE.BoxGeometry(0.66, 0.3, 1.4);
    chassisGeo.translate(0, 0.2, 0);
    const cabinGeo = new THREE.BoxGeometry(0.58, 0.28, 0.72);
    cabinGeo.translate(0, 0.48, -0.06);
    const carBodyMat = new THREE.MeshLambertMaterial({ flatShading: true });
    const cabinMat = new THREE.MeshLambertMaterial({ flatShading: true, color: PALETTE.carCabin });

    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX_AGENTS);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, MAX_AGENTS);
    this.carBodies = new THREE.InstancedMesh(chassisGeo, carBodyMat, MAX_AGENTS);
    this.carCabins = new THREE.InstancedMesh(cabinGeo, cabinMat, MAX_AGENTS);
    for (const mesh of [this.bodies, this.heads, this.carBodies, this.carCabins]) {
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // se mueven cada frame; culled a mano no compensa aún
      this.root.add(mesh);
    }
    const color = new THREE.Color();
    for (let i = 0; i < MAX_AGENTS; i++) {
      color.setHex(PALETTE.citizenClothes[i % PALETTE.citizenClothes.length]);
      this.bodies.setColorAt(i, color);
      color.setHex(PALETTE.carBodies[i % PALETTE.carBodies.length]);
      this.carBodies.setColorAt(i, color);
    }
    this.bodies.instanceColor!.needsUpdate = true;
    this.carBodies.instanceColor!.needsUpdate = true;
  }

  /** Vuelca la vista interpolada a las instancias. Llamar cada frame. */
  update(agents: AgentView[], count: number, dt: number): void {
    this.time += dt;
    let nPed = 0;
    let nCar = 0;
    for (let i = 0; i < count && nPed < MAX_AGENTS && nCar < MAX_AGENTS; i++) {
      const a = agents[i];
      const target = a.state === AgentState.Inside ? 0 : 1;
      const cur = this.appear.get(a.id) ?? target;
      const next = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 5);
      this.appear.set(a.id, next);
      if (next <= 0.01) continue;

      if (a.mode === TravelModeCode.Car) {
        // En coche: se dibuja el coche (sin bobbing — un coche no cabecea).
        this.p.set(a.x * CELL_SIZE, 0, a.z * CELL_SIZE);
        this.q.setFromAxisAngle(this.up, a.heading);
        this.s.setScalar(next);
        this.m.compose(this.p, this.q, this.s);
        this.carBodies.setMatrixAt(nCar, this.m);
        this.carCabins.setMatrixAt(nCar, this.m);
        nCar++;
        continue;
      }

      const bob = a.state === AgentState.Walking ? Math.abs(Math.sin(this.time * 9 + a.id)) * 0.06 : 0;
      const sway = a.state === AgentState.Idle ? Math.sin(this.time * 1.3 + a.id) * 0.04 : 0;

      this.p.set(a.x * CELL_SIZE, bob, a.z * CELL_SIZE);
      this.q.setFromAxisAngle(this.up, a.heading + sway);
      this.s.setScalar(next);
      this.m.compose(this.p, this.q, this.s);
      this.bodies.setMatrixAt(nPed, this.m);
      this.heads.setMatrixAt(nPed, this.m);
      nPed++;
    }
    this.bodies.count = nPed;
    this.heads.count = nPed;
    this.carBodies.count = nCar;
    this.carCabins.count = nCar;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.carBodies.instanceMatrix.needsUpdate = true;
    this.carCabins.instanceMatrix.needsUpdate = true;
  }
}
