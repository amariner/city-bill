/** Fantasma de colocación: la misma huella que validará el worker, con un
 * edificio translúcido y un tinte pastel de estado. No muta el grid. */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CELL_SIZE, Grid, rotatedFootprint } from '../grid';
import { catalogItem } from '../catalog';
import { placementCheck } from '../placement';
import { planRoad, previewRoad } from '../roads';
import type { Tool } from '../../core/tools';

type GhostMaterial = THREE.Material & {
  color?: THREE.Color;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
};

export class Ghost {
  readonly root = new THREE.Group();
  private footprint: THREE.Mesh | null = null;
  private building: THREE.Object3D | null = null;
  private signature = '';
  private pending = false;
  private rejectedUntil = 0;
  /** Coste de la L propuesta, para que la toolbar lo muestre sin duplicar lógica. */
  onRoadCost: ((cost: number | null) => void) | null = null;

  constructor(private grid: Grid) {
    this.root.visible = false;
    this.root.renderOrder = 3;
  }

  update(tool: Tool, cell: [number, number]): void {
    if (tool.kind === 'road') {
      this.updateRoad(tool, cell);
      return;
    }
    if (tool.kind === 'zone') {
      this.updateZone(tool, cell);
      return;
    }
    this.onRoadCost?.(null);
    if (tool.kind !== 'place') {
      this.root.visible = false;
      return;
    }
    const item = catalogItem(tool.id);
    if (!item) {
      this.root.visible = false;
      return;
    }
    const signature = `${tool.id}:${tool.rot}`;
    if (signature !== this.signature) this.rebuild(item, tool.rot);
    const [fw, fd] = rotatedFootprint(item.w, item.d, tool.rot);
    this.root.position.set((cell[0] + fw / 2) * CELL_SIZE, 0.12, (cell[1] + fd / 2) * CELL_SIZE);
    const bad = placementCheck(this.grid, item.w, item.d, cell[0], cell[1], tool.rot, { margin: 0 }) !== null;
    const color = this.pending ? PALETTE.ghostPending : Date.now() < this.rejectedUntil ? PALETTE.ghostBad : bad ? PALETTE.ghostBad : PALETTE.ghostOk;
    this.tint(color);
    this.root.visible = true;
  }

  private updateRoad(tool: Extract<Tool, { kind: 'road' }>, cell: [number, number]): void {
    if (!tool.from) {
      this.root.visible = false;
      this.onRoadCost?.(null);
      return;
    }
    const preview = previewRoad(this.grid, planRoad(tool.from, cell), tool.road);
    this.root.clear();
    this.footprint = null;
    this.building = null;
    this.root.position.set(0, 0, 0);
    const y: Record<'road' | 'sidewalk' | 'median' | 'margin', number> = {
      road: 0.19,
      sidewalk: 0.2,
      median: 0.16,
      margin: 0.14,
    };
    for (const item of preview.cells) {
      const color = item.blocked ? PALETTE.ghostBad
        : item.role === 'road' ? PALETTE.ghostOk
        : item.role === 'sidewalk' ? PALETTE.path
        : PALETTE.grass;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: item.blocked ? 0.58 : item.existing ? 0.22 : 0.38, depthWrite: false, side: THREE.DoubleSide }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((item.cell[0] + 0.5) * CELL_SIZE, y[item.role], (item.cell[1] + 0.5) * CELL_SIZE);
      this.root.add(plane);
    }
    this.onRoadCost?.(preview.cost);
    this.root.visible = preview.cells.length > 0;
  }

  private updateZone(tool: Extract<Tool, { kind: 'zone' }>, cell: [number, number]): void {
    this.onRoadCost?.(null);
    if (!tool.from) {
      this.root.visible = false;
      return;
    }
    this.root.clear();
    this.footprint = null;
    this.building = null;
    this.root.position.set(0, 0, 0);
    const x0 = Math.min(tool.from[0], cell[0]);
    const x1 = Math.max(tool.from[0], cell[0]);
    const z0 = Math.min(tool.from[1], cell[1]);
    const z1 = Math.max(tool.from[1], cell[1]);
    const zoneColor: Record<'R' | 'C' | 'I' | 'A' | 'P', number> = {
      R: PALETTE.zoneR,
      C: PALETTE.zoneC,
      I: PALETTE.zoneI,
      A: PALETTE.zoneA,
      P: PALETTE.zoneP,
    };
    let count = 0;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const current = this.grid.get(cx, cz);
        if (!current) continue;
        const eligible = !current.building && current.terrain !== 'road' && current.terrain !== 'water';
        const color = tool.erase
          ? current.zone === undefined ? PALETTE.ghostBad : zoneColor[current.zone]
          : eligible ? zoneColor[tool.zone] : PALETTE.ghostBad;
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(CELL_SIZE * 0.94, CELL_SIZE * 0.94),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: eligible ? 0.7 : 0.5, depthWrite: false, side: THREE.DoubleSide }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set((cx + 0.5) * CELL_SIZE, 0.16, (cz + 0.5) * CELL_SIZE);
        this.root.add(plane);
        count++;
      }
    }
    this.root.visible = count > 0;
  }

  markPending(): void {
    this.pending = true;
  }

  resolve(applied: boolean): void {
    this.pending = false;
    if (!applied) this.rejectedUntil = Date.now() + 300;
  }

  private rebuild(item: ReturnType<typeof catalogItem> & object, rot: 0 | 1 | 2 | 3): void {
    this.signature = `${item.id}:${rot}`;
    this.root.clear();
    const [fw, fd] = rotatedFootprint(item.w, item.d, rot);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(fw * CELL_SIZE, fd * CELL_SIZE),
      new THREE.MeshBasicMaterial({ color: PALETTE.ghostOk, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.02;
    this.footprint = plane;
    this.root.add(plane);

    this.building = item.build();
    this.building.rotation.y = (-rot * Math.PI) / 2;
    this.building.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = materials.map((material) => {
        const clone = material.clone() as GhostMaterial;
        clone.transparent = true;
        clone.opacity = 0.46;
        clone.depthWrite = false;
        return clone;
      });
    });
    this.root.add(this.building);
  }

  private tint(color: number): void {
    const tint = new THREE.Color(color);
    const paint = (object: THREE.Object3D): void => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const ghost = material as GhostMaterial;
        ghost.color?.copy(tint);
        ghost.opacity = this.pending ? 0.28 : 0.46;
      }
    };
    if (this.footprint) paint(this.footprint);
    if (this.building) this.building.traverse(paint);
  }
}
