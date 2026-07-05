/**
 * Inspector de ciudadano (T3.10): click sobre un ciudadano → tarjetita
 * diegética con nombre, actividad y necesidades; tecla F para que la cámara
 * le siga. Es LA ventana para verificar la autonomía de la Fase 3.
 * Solo DOM + consultas al SimClient; cero lógica de sim.
 */
import * as THREE from 'three';
import { IsoCamera } from '../core/camera';
import { CELL_SIZE } from '../world/grid';
import { SimClient, AgentView } from '../sim/client';
import { CitizenInfoMsg, AgentState } from '../sim/protocol';

/** Radio de selección en celdas. */
const PICK_RANGE = 2.5;
const NEED_LABELS: Record<string, string> = {
  energy: 'sueño',
  food: 'comida',
  social: 'social',
  fun: 'ocio',
  purpose: 'deber',
};
/** Vocación (ciclo 36) en palabras del inspector: a qué se siente llamado. */
const VOCATION_LABELS: Record<string, string> = {
  labrar: 'labrar la tierra',
  tratar: 'el trato con la gente',
  cuidar: 'cuidar de otros',
};
/** Oficio por rol del empleo (economy.ts): lo que HACE para vivir. */
const JOB_LABELS: Record<string, string> = {
  agriculture: 'granjero/a',
  commerce: 'tendero/a',
  civic: 'servicio público',
  work: 'artesano/a',
  industry: 'artesano/a',
};

export class CitizenInspector {
  private el: HTMLDivElement;
  private selectedId: number | null = null;
  private follow = false;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private downAt: [number, number] | null = null;
  private lastQuery = 0;
  private lastInfo: CitizenInfoMsg | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private camera: IsoCamera,
    private sim: SimClient,
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'min-width:180px',
      'padding:10px 12px',
      'font:12px/1.6 ui-monospace,monospace',
      'color:#2d3327',
      'background:rgba(241,239,230,0.9)',
      'border:1px solid rgba(45,51,39,0.18)',
      'border-radius:8px',
      'pointer-events:none',
      'white-space:pre',
      'z-index:10',
      'display:none',
    ].join(';');
    document.body.appendChild(this.el);

    sim.onCitizenInfo = (info) => {
      if (info.id === this.selectedId) {
        this.lastInfo = info;
        this.renderCard();
      }
    };

    // Click sin arrastre (el pan usa drag): umbral de 6 px.
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', (e) => (this.downAt = [e.clientX, e.clientY]));
    dom.addEventListener('pointerup', (e) => {
      if (!this.downAt) return;
      const [x0, y0] = this.downAt;
      this.downAt = null;
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > 6) return;
      this.pick(e.clientX, e.clientY);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') this.follow = this.selectedId !== null && !this.follow;
      if (e.key === 'Escape') this.deselect();
    });
  }

  /** Llamar cada frame con la vista de agentes ya interpolada. */
  update(agents: AgentView[], count: number): void {
    if (this.selectedId === null) return;
    let sel: AgentView | null = null;
    for (let i = 0; i < count; i++) {
      if (agents[i].id === this.selectedId) {
        sel = agents[i];
        break;
      }
    }
    if (!sel) {
      this.deselect();
      return;
    }
    if (this.follow) this.camera.setTarget(sel.x * CELL_SIZE, sel.z * CELL_SIZE);
    // Refresco de la tarjeta 2 veces/s (el estado cambia a ritmo de tick).
    const now = performance.now();
    if (now - this.lastQuery > 500) {
      this.lastQuery = now;
      this.sim.queryCitizen(this.selectedId);
    }
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera.cam);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return;
    const cx = hit.x / CELL_SIZE;
    const cz = hit.z / CELL_SIZE;

    // Agente VISIBLE más cercano al punto clicado.
    let best: AgentView | null = null;
    let bestD = PICK_RANGE;
    for (const a of this.lastAgents ?? []) {
      if (a.state === AgentState.Inside) continue;
      const d = Math.hypot(a.x - cx, a.z - cz);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) {
      this.selectedId = best.id;
      this.lastInfo = null;
      this.sim.queryCitizen(best.id);
      this.el.style.display = 'block';
      this.el.textContent = '…';
    } else {
      this.deselect();
    }
  }

  /** Id del ciudadano seleccionado (para el marcador visual en el mundo). */
  get selected(): number | null {
    return this.selectedId;
  }

  /** El main nos presta la lista del frame para el picking. */
  lastAgents: AgentView[] | null = null;
  lastCount = 0;

  setAgents(agents: AgentView[], count: number): void {
    this.lastAgents = agents.slice(0, count);
  }

  private deselect(): void {
    this.selectedId = null;
    this.follow = false;
    this.el.style.display = 'none';
  }

  private renderCard(): void {
    const info = this.lastInfo;
    if (!info) return;
    const bar = (v: number) => {
      const n = Math.round(Math.max(0, Math.min(1, v)) * 8);
      return `${'▮'.repeat(n)}${'▯'.repeat(8 - n)}`;
    };
    const bars = Object.entries(info.needs)
      .map(([k, v]) => `${(NEED_LABELS[k] ?? k).padEnd(7)}${bar(v)}`)
      .join('\n');
    const meta = [
      `salud   ${bar(info.health)}`,
      // Enfermedad contagiosa (ciclo 25): solo cuando está enfermo.
      ...(info.sick > 0.05 ? [`enfermo ${bar(info.sick)}`] : []),
      // Duelo (ciclo 16): solo se muestra cuando pesa — un doliente reconocible.
      ...(info.grief > 0.05 ? [`duelo   ${bar(info.grief)}`] : []),
      `dinero  ${info.wallet.toFixed(0)}`,
      // Situación económica (ciclo 29): el alquiler que paga el hogar.
      ...(info.rent > 0 ? [`alquiler ${info.rent.toFixed(0)}/día`] : []),
      `despensa ${info.pantry.toFixed(0)} uds`,
      `hogar   ${bar(info.prestige)}`,
    ].join('\n');
    // Quién es (ciclo 23): edad, etapa y pareja bajo el nombre.
    const who = `${info.age} años · ${info.lifeStage}${info.partnerName ? ` · con ${info.partnerName}` : ''}`;
    // Vocación (ciclo 36) y legado (ciclo 34): lo que la sim ya modela por
    // dentro y no salía. La vocación se marca cumplida (✓) si el empleo la colma.
    // Oficio (lo que hace) vs vocación (lo que ama): si coinciden, ✓.
    const job = info.jobRole
      ? `oficio: ${JOB_LABELS[info.jobRole] ?? info.jobRole}`
      : info.age >= 18 && info.lifeStage !== 'mayor' ? 'oficio: sin empleo' : '';
    const vocLabel = VOCATION_LABELS[info.vocation] ?? info.vocation;
    const voc = `vocación: ${vocLabel}${info.vocationMet ? ' ✓' : ''}`;
    const legacy = info.childrenRaised > 0
      ? `\nlegado: ${info.childrenRaised} ${info.childrenRaised === 1 ? 'hijo criado' : 'hijos criados'}`
      : '';
    const trade = job ? `${job}\n` : '';
    this.el.textContent = `${info.name}\n${who}\n${info.activityLabel}${this.follow ? '  ⌖' : ''}\n\n${bars}\n${meta}\n\n${trade}${voc}${legacy}\n\n[F] seguir · [Esc] cerrar`;
  }
}
