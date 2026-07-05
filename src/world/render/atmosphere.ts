/**
 * Juice atmosférico del anochecer (T5.4). Un único sistema, ligado al reloj de
 * JUEGO (no a los fps), que da vida al crepúsculo del banco de pruebas y del
 * juego normal:
 *
 *  1. LUCES DE VENTANA — al caer la tarde las ventanas se encienden UNA A UNA
 *     (cada una tiene su umbral) pasando de cristal frío a cálido; al amanecer se
 *     apagan igual. Las ventanas las marca `windowGrid` (props.ts) con
 *     `userData.kind==='windows'` + fichas `canLight`/`threshold` por instancia.
 *  2. HUMO DE CHIMENEA — bocanadas lentas que suben y se deshacen, sólo al
 *     anochecer/amanecer (hogares encendidos). Las chimeneas se marcan con
 *     `userData.kind==='chimney'` + `topOffset`.
 *  3. BANDADA — una bandada que gira sobre la ciudad al alba y al ocaso.
 *
 * Determinismo: las ventanas y la bandada son deterministas (índice/tiempo de
 * juego). El humo es FX puramente cosmético y efímero → puede usar `Math.random`
 * (regla §0.6 de CLAUDE.md/ROADMAP).
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';

const SMOKE_MAX = 140;
const BIRDS = 14;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Intensidad de las luces artificiales por hora [0,24): 0 de día, 1 de noche
 * cerrada, con rampa suave al anochecer (~17.5→20 h) y al amanecer (~5.5→7.5 h).
 * Es LA señal del crepúsculo (nada de `if hora == X`). El banco de pruebas abre
 * a ~19 h, en plena rampa: las luces se ven encenderse al instante.
 */
export function lampFactor(hour: number): number {
  const dusk = smoothstep(17.5, 20, hour); // 0→1 al anochecer
  const dawn = 1 - smoothstep(5.5, 7.5, hour); // 1→0 al amanecer
  return Math.max(dusk, dawn);
}

interface Puff {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
}

export class Atmosphere {
  /** Grupo propio (humo + bandada). Las VENTANAS viven en el árbol del mundo. */
  readonly root = new THREE.Group();

  private windows: THREE.InstancedMesh[] = [];
  private litMeshes: Array<{ mat: THREE.MeshLambertMaterial; threshold: number }> = [];
  private chimneys: THREE.Vector3[] = [];
  private center = new THREE.Vector3();
  private dirty = true;
  private lastLamp = -1;

  private smoke: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private birds: THREE.InstancedMesh;
  private birdPhase: number[] = [];
  private time = 0;

  // Color LINEAL del brillo cálido de una ventana encendida (el atributo aGlow se
  // suma a la emisión en el espacio de trabajo del shader → conversión explícita).
  private _glowLin = new THREE.Color(PALETTE.windowLit).convertSRGBToLinear();
  // Scratch reutilizable (cero asignaciones por frame).
  private _m = new THREE.Matrix4();
  private _p = new THREE.Vector3();
  private _s = new THREE.Vector3();
  private _q = new THREE.Quaternion();
  private _identity = new THREE.Quaternion();
  private _up = new THREE.Vector3(0, 1, 0);

  constructor(private worldRoot: THREE.Group) {
    // Humo: esferas facetadas pálidas, sin sombra; se desvanecen encogiendo.
    const smokeGeo = new THREE.IcosahedronGeometry(0.6, 0);
    const smokeMat = new THREE.MeshLambertMaterial({
      color: PALETTE.smoke,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    this.smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, SMOKE_MAX);
    this.smoke.castShadow = false;
    this.smoke.frustumCulled = false;
    this.smoke.count = 0;
    this.smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.smoke);

    // Bandada: pequeñas siluetas oscuras (cono triangular achatado que, de lejos
    // y desde la isométrica, lee como pájaro con las alas abiertas).
    const birdGeo = new THREE.ConeGeometry(0.55, 0.16, 3);
    birdGeo.rotateX(Math.PI / 2); // eje del cono → +z (dirección de vuelo)
    const birdMat = new THREE.MeshLambertMaterial({ color: PALETTE.bird });
    this.birds = new THREE.InstancedMesh(birdGeo, birdMat, BIRDS);
    this.birds.castShadow = false;
    this.birds.frustumCulled = false;
    this.birds.count = 0;
    this.birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < BIRDS; i++) this.birdPhase.push(i * 0.618034 * Math.PI * 2); // reparto áureo
    this.root.add(this.birds);
  }

  /** Vuelve a escanear el mundo (tras crecer la ciudad: ventanas/chimeneas nuevas). */
  invalidate(): void {
    this.dirty = true;
  }

  private rescan(): void {
    this.windows = [];
    this.litMeshes = [];
    this.chimneys = [];
    this.worldRoot.updateWorldMatrix(true, true); // matrices de mundo al día
    const acc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let n = 0;
    this.worldRoot.traverse((o) => {
      const kind = o.userData?.kind;
      if (kind === 'windows') {
        this.windows.push(o as THREE.InstancedMesh);
      } else if (kind === 'litWindow') {
        // Umbral por POSICIÓN de mundo → las casas se encienden escalonadas por
        // el pueblo (no todas a la vez), determinista y sin RNG.
        o.getWorldPosition(pos);
        const t = (((Math.floor(pos.x * 7.3 + pos.z * 3.1) % 100) + 100) % 100) / 100;
        this.litMeshes.push({ mat: (o as THREE.Mesh).material as THREE.MeshLambertMaterial, threshold: t });
      } else if (kind === 'chimney') {
        o.getWorldPosition(pos);
        const c = pos.clone();
        c.y += (o.userData.topOffset as number) ?? 0; // sube a la boca
        this.chimneys.push(c);
        acc.add(c);
        n++;
      }
    });
    if (n > 0) this.center.copy(acc.multiplyScalar(1 / n));
    this.dirty = false;
    this.lastLamp = -1; // fuerza repintar las ventanas recién aparecidas
  }

  /** Sube el brillo emisivo `aGlow` de cada ventana según el crepúsculo (las que
   * no iluminan quedan a 0 = cristal frío). GAIN>1 para que "florezcan". */
  private applyWindows(lamp: number): void {
    const gr = this._glowLin.r;
    const gg = this._glowLin.g;
    const gb = this._glowLin.b;
    const GRID_GAIN = 1.8; // retículas urbanas (emissive por atributo, espacio lineal)
    for (const inst of this.windows) {
      const canLight = inst.userData.canLight as Uint8Array;
      const threshold = inst.userData.threshold as Float32Array;
      const glow = inst.geometry.getAttribute('aGlow') as THREE.InstancedBufferAttribute;
      const arr = glow.array as Float32Array;
      for (let i = 0; i < canLight.length; i++) {
        const lit = canLight[i] ? smoothstep(threshold[i], threshold[i] + 0.18, lamp) * GRID_GAIN : 0;
        arr[i * 3] = gr * lit;
        arr[i * 3 + 1] = gg * lit;
        arr[i * 3 + 2] = gb * lit;
      }
      glow.needsUpdate = true;
    }
    // Ventanas sueltas de casas: mismo crepúsculo, vía emissiveIntensity del material.
    const MESH_GAIN = 1.5;
    for (const w of this.litMeshes) {
      w.mat.emissiveIntensity = smoothstep(w.threshold, w.threshold + 0.18, lamp) * MESH_GAIN;
    }
  }

  private updateSmoke(dt: number, lamp: number): void {
    // Emite sólo con los hogares encendidos (anochecer/noche/amanecer).
    if (lamp > 0.2 && this.chimneys.length > 0) {
      // ~0.4 bocanadas/seg por chimenea; sólo un tercio "humea" a la vez.
      let toSpawn = this.chimneys.length * 0.4 * dt;
      while (toSpawn > 0 && this.puffs.length < SMOKE_MAX) {
        if (Math.random() < toSpawn) {
          const c = this.chimneys[(Math.random() * this.chimneys.length) | 0];
          if (Math.random() < 0.62) {
            this.puffs.push({
              x: c.x + (Math.random() - 0.5) * 0.25,
              y: c.y,
              z: c.z + (Math.random() - 0.5) * 0.25,
              vx: (Math.random() - 0.5) * 0.3,
              vy: 0.55 + Math.random() * 0.3,
              vz: (Math.random() - 0.5) * 0.3 - 0.12, // ligera deriva del "viento"
              age: 0,
              life: 4.5 + Math.random() * 3,
            });
          }
        }
        toSpawn -= 1;
      }
    }

    // Avanza y compacta en sitio (descarta las muertas).
    let n = 0;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= 1 - 0.15 * dt; // se frena al subir
      const t = p.age / p.life;
      let sc = 0.5 + 1.5 * t; // crece al dispersarse
      if (t > 0.62) sc *= (1 - t) / 0.38; // se deshace al final
      this._p.set(p.x, p.y, p.z);
      this._s.setScalar(Math.max(0.001, sc));
      this._m.compose(this._p, this._identity, this._s);
      this.smoke.setMatrixAt(n, this._m);
      this.puffs[n] = p;
      n++;
    }
    this.puffs.length = n;
    this.smoke.count = n;
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  private updateBirds(hour: number): void {
    // La bandada sale al alba (~7 h) y al ocaso (~18.5 h); dormida el resto.
    const activity = Math.max(
      Math.exp(-((hour - 7.0) ** 2) / 3),
      Math.exp(-((hour - 18.5) ** 2) / 3),
    );
    if (activity < 0.06 || (this.center.x === 0 && this.center.z === 0)) {
      this.birds.count = 0;
      return;
    }
    const cx = this.center.x;
    const cz = this.center.z;
    const spin = this.time * 0.32; // velocidad angular de la bandada
    for (let i = 0; i < BIRDS; i++) {
      const off = this.birdPhase[i];
      const r = 24 + Math.sin(spin * 0.7 + off) * 5 + (i % 4) * 1.6; // órbitas escalonadas
      const ang = spin + off;
      const x = cx + Math.cos(ang) * r;
      const z = cz + Math.sin(ang) * r;
      const y = 33 + Math.sin(spin * 1.3 + off) * 3;
      const heading = ang + Math.PI / 2; // tangente a la órbita
      this._p.set(x, y, z);
      this._q.setFromAxisAngle(this._up, heading);
      this._s.setScalar(0.55 + 0.6 * activity); // más visibles en el pico
      this._m.compose(this._p, this._q, this._s);
      this.birds.setMatrixAt(i, this._m);
    }
    this.birds.count = BIRDS;
    this.birds.instanceMatrix.needsUpdate = true;
  }

  /** Llamar cada frame con la hora de JUEGO [0,24) y el delta real en segundos. */
  update(hour: number, dt: number): void {
    this.time += dt;
    if (this.dirty) this.rescan();
    const lamp = lampFactor(hour);
    if (Math.abs(lamp - this.lastLamp) > 0.0015) {
      this.applyWindows(lamp); // sólo cuando el crepúsculo se mueve (de día/noche pleno, gratis)
      this.lastLamp = lamp;
    }
    this.updateSmoke(dt, lamp);
    this.updateBirds(hour);
  }
}
