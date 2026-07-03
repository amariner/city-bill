/**
 * Traduce los intents del Input a movimientos de la IsoCamera cada frame:
 * pan (arrastre + WASD), zoom por rueda (niveles discretos) y rotación 90° (Q/E).
 */
import { Input } from './input';
import { IsoCamera, ZOOM_LEVELS } from './camera';

const KEY_PAN_SPEED = 0.9; // fracción del viewSize por segundo

export class CameraController {
  constructor(
    private cam: IsoCamera,
    private input: Input,
  ) {}

  update(dt: number): void {
    const { right, forward } = this.cam.screenAxes();

    // --- Pan por arrastre (el mundo sigue al cursor) ------------------------
    const drag = this.input.consumeDrag();
    if (drag.dx !== 0 || drag.dy !== 0) {
      const wpp = this.cam.worldPerPixel;
      // El eje vertical de pantalla está comprimido por la elevación iso.
      const moveX = -drag.dx * wpp;
      const moveY = (-drag.dy * wpp) / Math.cos((32 * Math.PI) / 180);
      this.cam.pan(
        right.x * moveX + forward.x * moveY,
        right.z * moveX + forward.z * moveY,
      );
    }

    // --- Pan por teclado ----------------------------------------------------
    const kp = this.input.keyboardPan();
    if (kp.x !== 0 || kp.y !== 0) {
      const speed = ZOOM_LEVELS[this.cam.zoomIndex] * KEY_PAN_SPEED * dt;
      const len = Math.hypot(kp.x, kp.y) || 1;
      const nx = (kp.x / len) * speed;
      const ny = (kp.y / len) * speed;
      this.cam.pan(right.x * nx + forward.x * ny, right.z * nx + forward.z * ny);
    }

    // --- Zoom ---------------------------------------------------------------
    const z = this.input.consumeZoom();
    if (z !== 0) this.cam.setZoomIndex(this.cam.zoomIndex + z);

    // --- Rotación -----------------------------------------------------------
    const r = this.input.consumeRotate();
    if (r !== 0) this.cam.rotate(r);

    this.cam.update(dt);
    this.cam.apply();
  }
}
