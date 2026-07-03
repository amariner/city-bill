/**
 * Overlay de depuración (F3): fps, draw calls, triángulos, nº de agentes y la
 * celda de grid bajo el cursor. Es la herramienta de verificación de
 * rendimiento y de la rejilla para el resto de fases.
 */
import * as THREE from 'three';
import { IsoCamera } from './camera';
import { worldToCell } from '../world/grid';

export interface DebugStats {
  agents?: number;
  chunks?: number;
  /** "HH:MM día N ×v" del reloj de sim. */
  clock?: string;
}

export class DebugHud {
  private el: HTMLDivElement;
  private visible = false;
  private acc = 0;
  private frames = 0;
  private fps = 0;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2(0, 0);
  private hoverCell: [number, number] = [0, 0];

  constructor(
    private renderer: THREE.WebGLRenderer,
    private camera: IsoCamera,
    private stats: DebugStats = {},
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:8px',
      'padding:8px 10px',
      'font:11px/1.5 ui-monospace,monospace',
      'color:#2d3327',
      'background:rgba(241,239,230,0.82)',
      'border:1px solid rgba(45,51,39,0.18)',
      'border-radius:6px',
      'pointer-events:none',
      'white-space:pre',
      'z-index:10',
      'display:none',
    ].join(';');
    document.body.appendChild(this.el);

    this.renderer.domElement.addEventListener('pointermove', (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3' || (e.key === '3' && e.shiftKey)) {
        e.preventDefault();
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  setStats(stats: DebugStats): void {
    this.stats = { ...this.stats, ...stats };
  }

  update(dt: number): void {
    this.acc += dt;
    this.frames++;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.acc = 0;
      this.frames = 0;
    }
    if (!this.visible) return;

    // Celda bajo el cursor (raycast al plano de suelo).
    this.raycaster.setFromCamera(this.ndc, this.camera.cam);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.ground, hit)) {
      this.hoverCell = worldToCell(hit.x, hit.z);
    }

    const r = this.renderer.info.render;
    const mem = this.renderer.info.memory;
    this.el.textContent = [
      `fps        ${this.fps.toFixed(0)}`,
      `draw calls ${r.calls}`,
      `triangles  ${(r.triangles / 1000).toFixed(1)}k`,
      `geometries ${mem.geometries}`,
      `textures   ${mem.textures}`,
      `agents     ${this.stats.agents ?? 0}`,
      `clock      ${this.stats.clock ?? '—'}`,
      `chunks vis ${this.stats.chunks ?? 0}`,
      `cell       ${this.hoverCell[0]}, ${this.hoverCell[1]}`,
      `zoom       ${this.camera.zoomIndex}`,
    ].join('\n');
  }
}
