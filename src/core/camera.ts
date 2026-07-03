/**
 * Cámara ortográfica isométrica. La elevación (32°) NUNCA cambia. El azimut
 * solo cambia en múltiplos de 90° (rotación suavizada). El zoom mueve
 * `viewSize` entre niveles discretos con easing. La clase guarda el estado y
 * `apply()` lo vuelca a la OrthographicCamera de THREE.
 */
import * as THREE from 'three';

export const ELEVATION = THREE.MathUtils.degToRad(32);
export const ZOOM_LEVELS = [70, 125, 180, 250] as const;
const DIST = 320;

export class IsoCamera {
  readonly cam = new THREE.OrthographicCamera();
  target = new THREE.Vector3(0, 0, 0);
  zoomIndex = 1;

  /** Límite del área navegable (metros, medio-lado). */
  bound = 260;

  private viewSize: number = ZOOM_LEVELS[1];
  private azimuthTarget = Math.PI / 4; // acumulador continuo (no mod)
  private azimuthCurrent = Math.PI / 4;

  setTarget(x: number, z: number): this {
    this.target.set(x, 0, z);
    return this;
  }

  setZoomIndex(i: number): this {
    this.zoomIndex = THREE.MathUtils.clamp(i, 0, ZOOM_LEVELS.length - 1);
    return this;
  }

  rotate(dir: number): void {
    this.azimuthTarget += dir * (Math.PI / 2);
  }

  /** Mueve el target en el plano del suelo, en unidades de mundo. */
  pan(worldX: number, worldZ: number): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x + worldX, -this.bound, this.bound);
    this.target.z = THREE.MathUtils.clamp(this.target.z + worldZ, -this.bound, this.bound);
  }

  /** Metros de mundo por píxel de pantalla al zoom actual. */
  get worldPerPixel(): number {
    return this.viewSize / window.innerHeight;
  }

  /** Suaviza zoom y rotación hacia sus objetivos (llamar cada frame). */
  update(dt: number): void {
    const kZoom = Math.min(1, dt * 9);
    this.viewSize += (ZOOM_LEVELS[this.zoomIndex] - this.viewSize) * kZoom;
    const kRot = Math.min(1, dt * 10);
    this.azimuthCurrent += (this.azimuthTarget - this.azimuthCurrent) * kRot;
  }

  /** Ejes del plano de suelo alineados con la pantalla (para el pan).
   * Usa el azimut objetivo (discreto) para que el pan sea estable. */
  screenAxes(): { right: THREE.Vector3; forward: THREE.Vector3 } {
    const a = this.azimuthTarget;
    const forward = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).normalize();
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).normalize();
    return { right, forward };
  }

  resize(): void {
    this.apply();
  }

  apply(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const c = this.cam;
    c.left = (-this.viewSize * aspect) / 2;
    c.right = (this.viewSize * aspect) / 2;
    c.top = this.viewSize / 2;
    c.bottom = -this.viewSize / 2;
    c.near = 1;
    c.far = 1000;

    const a = this.azimuthCurrent;
    c.position.set(
      this.target.x + DIST * Math.cos(ELEVATION) * Math.sin(a),
      this.target.y + DIST * Math.sin(ELEVATION),
      this.target.z + DIST * Math.cos(ELEVATION) * Math.cos(a),
    );
    c.lookAt(this.target);
    c.updateProjectionMatrix();
  }
}
