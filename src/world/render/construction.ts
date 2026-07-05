/**
 * Animación de construcción autónoma (T4.2 — el "juice" del sector de
 * construcción). Cuando la ciudad se hace un edificio (`cityGrew`), no aparece
 * de golpe: se despeja un SOLAR de tierra, se levanta un ANDAMIO low-poly y el
 * edificio EMERGE del suelo y remata con un POP elástico. Al terminar, el
 * edificio se hornea en el grid de render (chunk) y el andamio se retira.
 *
 * Es FX puramente cosmético del hilo principal: usa el dt real (no la sim), así
 * que la obra dura lo mismo a cualquier velocidad. No toca el grid de la sim
 * (el worker ya colocó el edificio); solo retrasa ~1.4 s la réplica visual.
 *
 * Estética (§4 del ROADMAP): colores SOLO de la paleta, flat shading, sin
 * texturas. El andamio es una jaula de postes + travesaño, madera pálida.
 */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CELL_SIZE, CHUNK, rotatedFootprint, Rot, Grid } from '../grid';
import { catalogItem } from '../catalog';
import { paintYard } from '../growth';
import type { WorldView } from './worldView';

const RISE_DUR = 0.9; // s hasta que el edificio alcanza su altura
const POP_DUR = 0.42; // s de rebote elástico + retirada del andamio
const TOTAL = RISE_DUR + POP_DUR;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface Site {
  cont: THREE.Group;
  building: THREE.Object3D;
  scaffold: THREE.Group;
  scaffoldMats: THREE.MeshLambertMaterial[];
  foundation: THREE.Mesh;
  foundationMat: THREE.MeshLambertMaterial;
  id: string;
  cx: number;
  cz: number;
  rot: Rot;
  t: number;
}

export class ConstructionView {
  readonly root = new THREE.Group();
  private sites: Site[] = [];

  constructor(private grid: Grid, private world: WorldView) {}

  /** Arranca la obra de un edificio recién demandado por la ciudad. */
  spawn(id: string, cx: number, cz: number, rot: Rot): void {
    const it = catalogItem(id);
    if (!it) return;
    const [fw, fd] = rotatedFootprint(it.w, it.d, rot);

    const cont = new THREE.Group();
    cont.position.set((cx + fw / 2) * CELL_SIZE, 0, (cz + fd / 2) * CELL_SIZE);
    cont.rotation.y = (-rot * Math.PI) / 2;

    // Solar: losa de tierra despejada bajo la obra (tamaño del footprint sin
    // rotar; el contenedor ya orienta). Aparece al instante.
    const foundationMat = new THREE.MeshLambertMaterial({ color: PALETTE.constructionSite });
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(it.w * CELL_SIZE * 0.98, 0.12, it.d * CELL_SIZE * 0.98),
      foundationMat,
    );
    foundation.position.y = 0.06;
    foundation.receiveShadow = true;
    cont.add(foundation);

    // Edificio: emerge escalando en Y desde casi cero.
    const building = it.build();
    building.scale.y = 0.03;
    cont.add(building);

    // Altura para dimensionar el andamio (bounding box del mesh a escala 1).
    const box = new THREE.Box3().setFromObject(building);
    const h = Math.max(1.2, box.max.y);

    // Andamio: 4 postes en las esquinas + travesaño superior. Madera pálida.
    const scaffold = new THREE.Group();
    const scaffoldMats: THREE.MeshLambertMaterial[] = [];
    const hx = (it.w * CELL_SIZE) / 2 + 0.15;
    const hz = (it.d * CELL_SIZE) / 2 + 0.15;
    const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.scaffold, transparent: true });
    const railMat = new THREE.MeshLambertMaterial({ color: PALETTE.scaffoldShade, transparent: true });
    scaffoldMats.push(poleMat, railMat);
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, h + 0.4, 5);
    for (const sx of [-hx, hx]) {
      for (const sz of [-hz, hz]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(sx, (h + 0.4) / 2, sz);
        pole.castShadow = true;
        scaffold.add(pole);
      }
    }
    // Travesaños superiores (rectángulo) — dos en X, dos en Z.
    const railX = new THREE.BoxGeometry(hx * 2, 0.09, 0.09);
    const railZ = new THREE.BoxGeometry(0.09, 0.09, hz * 2);
    for (const ry of [h * 0.55, h + 0.2]) {
      for (const sz of [-hz, hz]) {
        const r = new THREE.Mesh(railX, railMat);
        r.position.set(0, ry, sz);
        scaffold.add(r);
      }
      for (const sx of [-hx, hx]) {
        const r = new THREE.Mesh(railZ, railMat);
        r.position.set(sx, ry, 0);
        scaffold.add(r);
      }
    }
    cont.add(scaffold);

    this.root.add(cont);
    this.sites.push({ cont, building, scaffold, scaffoldMats, foundation, foundationMat, id, cx, cz, rot, t: 0 });
  }

  /** Avanza las obras con dt real. Al completar una, la hornea en el chunk. */
  update(dt: number): void {
    if (this.sites.length === 0) return;
    for (let i = this.sites.length - 1; i >= 0; i--) {
      const s = this.sites[i];
      s.t += dt;
      const t = s.t;
      if (t >= TOTAL) {
        this.finish(s);
        this.sites.splice(i, 1);
        continue;
      }
      const rise = easeOutCubic(Math.min(1, t / RISE_DUR));
      const pop = Math.max(0, Math.min(1, (t - RISE_DUR) / POP_DUR));
      const bounce = Math.sin(pop * Math.PI) * (1 - pop) * 0.09;
      s.building.scale.set(1 + bounce, 0.03 + 0.97 * rise, 1 + bounce);
      // El andamio se mantiene durante la subida y se desvanece con el pop.
      const op = pop <= 0 ? 1 : 1 - pop;
      for (const m of s.scaffoldMats) m.opacity = op;
      s.scaffold.visible = op > 0.02;
      // El solar se aclara/desvanece al final (lo cubre el edificio ya).
      s.foundationMat.opacity = pop <= 0 ? 1 : 1 - pop * 0.7;
      s.foundationMat.transparent = pop > 0;
    }
  }

  private finish(s: Site): void {
    const it = catalogItem(s.id);
    if (it) {
      // Réplica en el grid de render → el chunk dibuja el edificio definitivo.
      this.grid.placeBuilding(s.id, it.w, it.d, s.cx, s.cz, s.rot);
      // Jardín de hierba bajo/alrededor (mismo verde que en la sim): refresca
      // los chunks tocados por el anillo (puede cruzar la frontera de chunk).
      const [fw, fd] = rotatedFootprint(it.w, it.d, s.rot);
      const painted = paintYard(this.grid, s.cx, s.cz, fw, fd);
      const seen = new Set<string>();
      for (const [cx, cz] of [...painted, [s.cx, s.cz] as [number, number]]) {
        const k = `${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        this.world.refreshChunkAt(cx, cz);
      }
    }
    this.root.remove(s.cont);
    s.cont.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
      }
    });
    for (const m of s.scaffoldMats) m.dispose();
    s.foundationMat.dispose();
  }

  /** ¿Hay obras en curso? (para no dormir la escena mientras algo se anima). */
  get active(): boolean {
    return this.sites.length > 0;
  }
}
