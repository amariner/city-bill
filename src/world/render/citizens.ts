/**
 * Render instanciado de ciudadanos (T3.6): 2 draw calls para peatones
 * (cuerpo acampanado + cabeza) + 2 draw calls para coches (chasis+ruedas +
 * cabina de cristal) — ciclo 8 de RESEARCH.md, vehículos. Lee AgentView[]
 * interpolado del SimClient cada frame; nada de lógica de sim aquí.
 * - Inside → escala 0 (con fade rápido al entrar/salir).
 * - Walking a pie → bobbing sutil; Idle → sway lento.
 * - mode===1 (coche): se dibuja el mesh de coche en vez del peatón,
 *   orientado con el mismo heading (frente del coche a +Z, igual que el
 *   resto de props — ver props.ts).
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CELL_SIZE } from '../grid';
import { AgentView } from '../../sim/client';
import { AgentState, TravelModeCode } from '../../sim/protocol';

const MAX_AGENTS = 2048;

/** Convierte una geometría de THREE en no-indexada, coloreada y transformada. */
function paintedPart(
  geo: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  color: THREE.Color,
): { positions: Float32Array; normals: Float32Array; colors: Float32Array } {
  const flat = geo.toNonIndexed();
  flat.applyMatrix4(matrix);
  const positions = flat.attributes.position.array as Float32Array;
  const normals = flat.attributes.normal.array as Float32Array;
  const count = positions.length / 3;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.dispose();
  flat.dispose();
  return { positions, normals, colors };
}

/** Funde varias piezas (geometría + matriz local + color) en una sola BufferGeometry. */
function mergeParts(parts: Array<{ geo: THREE.BufferGeometry; matrix: THREE.Matrix4; color: THREE.Color }>): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  for (const part of parts) {
    const flat = paintedPart(part.geo, part.matrix, part.color);
    positions.push(...flat.positions);
    normals.push(...flat.normals);
    colors.push(...flat.colors);
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

function at(x: number, y: number, z: number, rotZ = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotZ));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  return m;
}

/** Chasis + ruedas fundidos: chasis en blanco (para el tinte por instancia), ruedas oscuras. */
function buildCarBodyGeometry(): THREE.BufferGeometry {
  const white = new THREE.Color(0xffffff);
  const tire = new THREE.Color(PALETTE.carTire);
  const wheelR = 0.36;
  const wheelT = 0.26;
  const hx = 0.8; // semieje X de las ruedas
  const hz = 1.275; // semieje Z de las ruedas
  const wheel = () => new THREE.CylinderGeometry(wheelR, wheelR, wheelT, 8);
  return mergeParts([
    { geo: new THREE.BoxGeometry(1.7, 0.62, 3.65), matrix: at(0, 0.61, 0), color: white },
    { geo: wheel(), matrix: at(hx, wheelR, hz, Math.PI / 2), color: tire },
    { geo: wheel(), matrix: at(-hx, wheelR, hz, Math.PI / 2), color: tire },
    { geo: wheel(), matrix: at(hx, wheelR, -hz, Math.PI / 2), color: tire },
    { geo: wheel(), matrix: at(-hx, wheelR, -hz, Math.PI / 2), color: tire },
  ]);
}

/** Cabina/parabrisas: caja única en el color de cristal fijo (como el resto del catálogo). */
function buildCarGlassGeometry(): THREE.BufferGeometry {
  const glass = new THREE.Color(PALETTE.glass);
  return mergeParts([{ geo: new THREE.BoxGeometry(1.3, 0.48, 1.85), matrix: at(0, 1.16, -0.15), color: glass }]);
}

export class CitizenView {
  readonly root = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private carBody: THREE.InstancedMesh;
  private carGlass: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private clothColor = new THREE.Color();
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
    // El color de la ropa se pinta cada frame en update() (depende del id
    // ESTABLE del ciudadano, no del slot de instancia — y del duelo, que
    // apaga el tono). instanceColor se crea ya aquí para que exista el
    // atributo desde el primer frame.
    const color = new THREE.Color(0xffffff);
    for (let i = 0; i < MAX_AGENTS; i++) this.bodies.setColorAt(i, color);
    this.bodies.instanceColor!.needsUpdate = true;

    const carBodyMat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
    const carGlassMat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
    this.carBody = new THREE.InstancedMesh(buildCarBodyGeometry(), carBodyMat, MAX_AGENTS);
    this.carGlass = new THREE.InstancedMesh(buildCarGlassGeometry(), carGlassMat, MAX_AGENTS);
    this.carBody.castShadow = true;
    this.carGlass.castShadow = false; // cristal: como el resto del catálogo (glassFront, etc.)
    for (const mesh of [this.carBody, this.carGlass]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    for (let i = 0; i < MAX_AGENTS; i++) {
      color.setHex(PALETTE.carBody[i % PALETTE.carBody.length]);
      this.carBody.setColorAt(i, color);
    }
    this.carBody.instanceColor!.needsUpdate = true;
  }

  /** Vuelca la vista interpolada a las instancias. Llamar cada frame. */
  update(agents: AgentView[], count: number, dt: number): void {
    this.time += dt;
    let nWalk = 0;
    let nCar = 0;
    for (let i = 0; i < count && nWalk + nCar < MAX_AGENTS; i++) {
      const a = agents[i];
      const target = a.state === AgentState.Inside ? 0 : 1;
      const cur = this.appear.get(a.id) ?? target;
      const next = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 5);
      this.appear.set(a.id, next);
      if (next <= 0.01) continue;

      this.s.setScalar(next);

      if (a.mode === TravelModeCode.Car) {
        this.p.set(a.x * CELL_SIZE, 0, a.z * CELL_SIZE);
        this.q.setFromAxisAngle(this.up, a.heading);
        this.m.compose(this.p, this.q, this.s);
        this.carBody.setMatrixAt(nCar, this.m);
        this.carGlass.setMatrixAt(nCar, this.m);
        nCar++;
      } else {
        const bob = a.state === AgentState.Walking ? Math.abs(Math.sin(this.time * 9 + a.id)) * 0.06 : 0;
        const sway = a.state === AgentState.Idle ? Math.sin(this.time * 1.3 + a.id) * 0.04 : 0;
        this.p.set(a.x * CELL_SIZE, bob, a.z * CELL_SIZE);
        this.q.setFromAxisAngle(this.up, a.heading + sway);
        this.m.compose(this.p, this.q, this.s);
        this.bodies.setMatrixAt(nWalk, this.m);
        this.heads.setMatrixAt(nWalk, this.m);
        // Duelo (ciclo 11): la ropa se apaga hasta la mitad de saturación a
        // duelo pleno — nada de escaparate cuando se está de luto. Color por
        // ID (estable por ciudadano), no por slot de instancia.
        this.clothColor.setHex(PALETTE.citizenClothes[a.id % PALETTE.citizenClothes.length]);
        if (a.grief > 0) this.clothColor.multiplyScalar(1 - 0.5 * a.grief);
        this.bodies.setColorAt(nWalk, this.clothColor);
        nWalk++;
      }
    }
    this.bodies.count = nWalk;
    this.heads.count = nWalk;
    this.carBody.count = nCar;
    this.carGlass.count = nCar;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.carBody.instanceMatrix.needsUpdate = true;
    this.carGlass.instanceMatrix.needsUpdate = true;
    this.bodies.instanceColor!.needsUpdate = true;
  }
}
