/** Puntero unificado: raycast al plano de suelo y separación click/arrastre. */
import * as THREE from 'three';
import { IsoCamera } from './camera';
import { worldToCell } from '../world/grid';

export const DRAG_THRESHOLD_PX = 6;
export type PointerButton = 'left' | 'middle' | 'right';

function buttonName(button: number): PointerButton {
  return button === 2 ? 'right' : button === 1 ? 'middle' : 'left';
}

export class Pointer {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private down: { x: number; y: number; button: PointerButton } | null = null;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  onHover: ((cell: [number, number]) => void) | null = null;
  onClick: ((cell: [number, number], button: PointerButton) => void) | null = null;
  onDragStart: ((cell: [number, number], button: PointerButton) => void) | null = null;
  onDrag: ((dx: number, dy: number, cell: [number, number], button: PointerButton) => void) | null = null;
  onDragEnd: ((cell: [number, number], button: PointerButton) => void) | null = null;

  constructor(private element: HTMLElement, private camera: IsoCamera) {
    element.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, button: buttonName(e.button) };
      this.dragging = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      element.setPointerCapture(e.pointerId);
    });
    element.addEventListener('pointermove', (e) => {
      const cell = this.cellAt(e.clientX, e.clientY);
      if (cell) this.onHover?.(cell);
      if (!this.down) return;
      if (!this.dragging && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > DRAG_THRESHOLD_PX) {
        this.dragging = true;
        this.onDragStart?.(cell ?? [0, 0], this.down.button);
      }
      if (!this.dragging) return;
      this.onDrag?.(e.clientX - this.lastX, e.clientY - this.lastY, cell ?? [0, 0], this.down.button);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (!this.down) return;
      const down = this.down;
      const cell = this.cellAt(e.clientX, e.clientY) ?? [0, 0] as [number, number];
      if (this.dragging) this.onDragEnd?.(cell, down.button);
      else this.onClick?.(cell, down.button);
      this.down = null;
      this.dragging = false;
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
    };
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  }

  private cellAt(clientX: number, clientY: number): [number, number] | null {
    const rect = this.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    ), this.camera.cam);
    if (!this.raycaster.ray.intersectPlane(this.ground, this.hit)) return null;
    return worldToCell(this.hit.x, this.hit.z);
  }
}
