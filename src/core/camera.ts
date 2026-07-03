/**
 * Cámara ortográfica isométrica. La elevación (32°) NUNCA cambia; el azimut
 * solo salta en múltiplos de 90°. El zoom mueve `viewSize` entre niveles
 * discretos. La clase guarda el estado (target, zoom, azimut) y `apply()` lo
 * vuelca a la OrthographicCamera de THREE.
 */
import * as THREE from 'three';

export const ELEVATION = THREE.MathUtils.degToRad(32);
export const ZOOM_LEVELS = [70, 125, 180, 250] as const;
const DIST = 320;

export class IsoCamera {
  readonly cam = new THREE.OrthographicCamera();
  target = new THREE.Vector3(0, 0, 0);
  azimuthStep = 0; // 0..3 → 45°, 135°, 225°, 315°
  zoomIndex = 1;

  private viewSize: number = ZOOM_LEVELS[1];

  setTarget(x: number, z: number): this {
    this.target.set(x, 0, z);
    return this;
  }

  setZoomIndex(i: number): this {
    this.zoomIndex = THREE.MathUtils.clamp(i, 0, ZOOM_LEVELS.length - 1);
    return this;
  }

  /** Suaviza el zoom hacia el nivel objetivo (llamar cada frame). */
  updateZoom(dt: number): void {
    const goal = ZOOM_LEVELS[this.zoomIndex];
    this.viewSize += (goal - this.viewSize) * Math.min(1, dt * 8);
  }

  get azimuth(): number {
    return Math.PI / 4 + (this.azimuthStep * Math.PI) / 2;
  }

  /** Vectores del plano de suelo alineados con la pantalla (para el pan). */
  screenAxes(): { right: THREE.Vector3; forward: THREE.Vector3 } {
    const a = this.azimuth;
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

    const a = this.azimuth;
    c.position.set(
      this.target.x + DIST * Math.cos(ELEVATION) * Math.sin(a),
      this.target.y + DIST * Math.sin(ELEVATION),
      this.target.z + DIST * Math.cos(ELEVATION) * Math.cos(a),
    );
    c.lookAt(this.target);
    c.updateProjectionMatrix();
  }
}
