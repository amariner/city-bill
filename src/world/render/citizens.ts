/**
 * Render instanciado de ciudadanos (T3.6): 2 draw calls para TODOS
 * (cuerpo acampanado + cabeza). Lee AgentView[] interpolado del SimClient
 * cada frame; nada de lógica de sim aquí.
 * - Inside → escala 0 (con fade rápido al entrar/salir).
 * - Walking → bobbing sutil; Idle → sway lento.
 *
 * TODO(Sonnet, ciclo 8 de RESEARCH.md — vehículos): `AgentView.mode` ya trae
 * 0=a pie / 1=en coche desde la sim. Hoy se renderiza igual (silueta de
 * peatón moviéndose más rápido). Falta: mesh de coche low-poly propio +
 * InstancedMesh aparte, y no dibujar cuerpo/cabeza cuando mode===1.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CELL_SIZE } from '../grid';
import { AgentView } from '../../sim/client';
import { AgentState } from '../../sim/protocol';

const MAX_AGENTS = 2048;

export class CitizenView {
  readonly root = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
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

    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX_AGENTS);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, MAX_AGENTS);
    for (const mesh of [this.bodies, this.heads]) {
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // se mueven cada frame; culled a mano no compensa aún
      this.root.add(mesh);
    }
    const color = new THREE.Color();
    for (let i = 0; i < MAX_AGENTS; i++) {
      color.setHex(PALETTE.citizenClothes[i % PALETTE.citizenClothes.length]);
      this.bodies.setColorAt(i, color);
    }
    this.bodies.instanceColor!.needsUpdate = true;
  }

  /** Vuelca la vista interpolada a las instancias. Llamar cada frame. */
  update(agents: AgentView[], count: number, dt: number): void {
    this.time += dt;
    let n = 0;
    for (let i = 0; i < count && n < MAX_AGENTS; i++) {
      const a = agents[i];
      const target = a.state === AgentState.Inside ? 0 : 1;
      const cur = this.appear.get(a.id) ?? target;
      const next = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 5);
      this.appear.set(a.id, next);
      if (next <= 0.01) continue;

      const bob = a.state === AgentState.Walking ? Math.abs(Math.sin(this.time * 9 + a.id)) * 0.06 : 0;
      const sway = a.state === AgentState.Idle ? Math.sin(this.time * 1.3 + a.id) * 0.04 : 0;

      this.p.set(a.x * CELL_SIZE, bob, a.z * CELL_SIZE);
      this.q.setFromAxisAngle(this.up, a.heading + sway);
      this.s.setScalar(next);
      this.m.compose(this.p, this.q, this.s);
      this.bodies.setMatrixAt(n, this.m);
      this.heads.setMatrixAt(n, this.m);
      n++;
    }
    this.bodies.count = n;
    this.heads.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
}
