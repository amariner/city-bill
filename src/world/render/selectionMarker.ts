/**
 * Anillo de selección (surfacing 3): vincula VISUALMENTE la tarjeta del
 * inspector con el cuerpo real en el mundo. Un aro plano y pastel late bajo los
 * pies del ciudadano seleccionado y le sigue frame a frame (con [F], se ve
 * rastreándole por la ciudad). Sin él, el inspector era texto sin cara; con él,
 * la autonomía de la Fase 3 se puede SEGUIR con los ojos.
 *
 * Un solo mesh reutilizado (cero coste al haber selección o no): +1 draw call.
 */
import * as THREE from 'three';
import { CELL_SIZE } from '../grid';
import { PALETTE } from '../../palette';
import { AgentView } from '../../sim/client';

export class SelectionMarker {
  readonly root = new THREE.Group();
  private ring: THREE.Mesh;
  private t = 0;

  constructor() {
    // Aro plano sobre el suelo (RingGeometry en el plano XZ).
    const geo = new THREE.RingGeometry(CELL_SIZE * 0.5, CELL_SIZE * 0.72, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.selectRing,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(geo, mat);
    this.ring.rotation.x = -Math.PI / 2; // tumbado en el suelo
    this.root.add(this.ring);
    this.root.visible = false;
    this.root.renderOrder = 2; // por encima del terreno, sin z-fighting
  }

  /** Coloca el aro bajo el agente; ocúltalo si no hay selección visible. */
  update(agent: AgentView | null, dt: number): void {
    if (!agent) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.root.position.set(agent.x * CELL_SIZE, 0.06, agent.z * CELL_SIZE);
    // Latido sutil (cosmético, no persiste): respira despacio para llamar la
    // atención sin distraer de la escena.
    this.t += dt;
    const pulse = 1 + Math.sin(this.t * 3) * 0.06;
    this.ring.scale.set(pulse, pulse, 1);
  }
}
