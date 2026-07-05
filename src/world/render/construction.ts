/**
 * FX de construcción (T4.2): cuando la ciudad levanta un edificio (evento
 * `cityGrew`), en vez de aparecer de golpe se ANIMA — el edificio "crece" desde
 * el suelo con un pop elástico dentro de un andamio de madera que se retira al
 * acabar. Es cosmético puro (rAF/tiempo, permitido por §0.6): no toca ni el grid
 * ni la lógica de sim.
 *
 * Truco de arquitectura: los edificios se FUNDEN por chunk (buildings.ts), así que
 * no son objetos animables sueltos. Aquí montamos una copia STANDALONE del edificio
 * (mismo `build()`, misma pose) + andamio y la animamos; mientras, el chunk OMITE
 * ese edificio (`worldView.beginConstruction`). Al terminar, `endConstruction`
 * revela el edificio ya fundido en el chunk y retiramos el FX — a escala 1 la copia
 * coincide con el definitivo, así que el relevo es invisible.
 */
import * as THREE from 'three';
import { catalogItem } from '../catalog';
import { CELL_SIZE, rotatedFootprint } from '../grid';
import { scaffold } from '../../props';
import type { WorldView } from './worldView';

/** Duración de la obra en segundos reales. */
const BUILD_SECONDS = 1.5;
/** Fracción final en la que el andamio se retira (se hunde y encoge). */
const SCAFFOLD_RETRACT_FROM = 0.72;

/** easeOutBack: arranca en 0, sobrepasa 1 y se asienta en 1 → el "pop" elástico. */
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = x - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

interface Site {
  ax: number;
  az: number;
  group: THREE.Group;
  building: THREE.Object3D;
  scaffold: THREE.Object3D;
  scaffoldTop: number;
  elapsed: number;
  onDone: () => void;
}

export class ConstructionSites {
  readonly root = new THREE.Group();
  private sites: Site[] = [];
  private active = new Set<string>();

  constructor(private view: WorldView) {}

  /** ¿Hay alguna obra en curso? (para no molestar con updates si no). */
  get busy(): boolean {
    return this.sites.length > 0;
  }

  /** Empieza la obra de un edificio recién colocado en el grid (T4.2). */
  start(id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3, onDone: () => void): boolean {
    const key = `${cx},${cz}`;
    if (this.active.has(key)) return false; // ya en obra (no duplicar)
    const it = catalogItem(id);
    if (!it) return false;

    const [fw, fd] = rotatedFootprint(it.w, it.d, rot);
    const group = new THREE.Group();
    group.position.set((cx + fw / 2) * CELL_SIZE, 0, (cz + fd / 2) * CELL_SIZE);

    // Copia standalone del edificio, con la MISMA pose que tendrá en el chunk.
    const building = it.build();
    building.rotation.y = (-rot * Math.PI) / 2;
    building.scale.y = 0.001; // arranca aplastado contra el suelo
    group.add(building);

    // Altura real del edificio → dimensiona el andamio.
    const box = new THREE.Box3().setFromObject(building);
    const top = Math.max(1.5, box.max.y);
    const frame = scaffold(fw * CELL_SIZE, fd * CELL_SIZE, top);
    group.add(frame);

    this.root.add(group);
    this.view.beginConstruction(cx, cz); // el chunk deja de dibujarlo
    this.active.add(key);
    this.sites.push({ ax: cx, az: cz, group, building, scaffold: frame, scaffoldTop: top, elapsed: 0, onDone });
    return true;
  }

  /** Avanza todas las obras; al terminar, revela el edificio y retira el FX. */
  update(dt: number): void {
    if (this.sites.length === 0) return;
    for (let i = this.sites.length - 1; i >= 0; i--) {
      const s = this.sites[i];
      s.elapsed += dt;
      const t = Math.min(1, s.elapsed / BUILD_SECONDS);

      // El edificio crece desde el suelo con pop elástico (sobrepasa y se asienta).
      s.building.scale.y = Math.max(0.001, easeOutBack(t));

      // El andamio se retira en el tramo final: se hunde y encoge.
      if (t >= SCAFFOLD_RETRACT_FROM) {
        const r = (t - SCAFFOLD_RETRACT_FROM) / (1 - SCAFFOLD_RETRACT_FROM); // 0→1
        s.scaffold.scale.y = Math.max(0.001, 1 - r);
        s.scaffold.position.y = -r * s.scaffoldTop * 0.5;
        s.scaffold.visible = r < 0.98;
      }

      if (t >= 1) {
        this.view.endConstruction(s.ax, s.az); // el chunk revela el edificio acabado
        this.root.remove(s.group);
        this.active.delete(`${s.ax},${s.az}`);
        this.sites.splice(i, 1);
        s.onDone();
      }
    }
  }
}
