/** Fantasma de colocación: la misma huella que validará el worker, con un
 * edificio translúcido y un tinte pastel de estado. No muta el grid. */
import * as THREE from 'three';
import { PALETTE } from '../../palette';
import { CELL_SIZE, Grid, rotatedFootprint } from '../grid';
import { catalogItem } from '../catalog';
import { placementCheck } from '../placement';
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

  constructor(private grid: Grid) {
    this.root.visible = false;
    this.root.renderOrder = 3;
  }

  update(tool: Tool, cell: [number, number]): void {
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
