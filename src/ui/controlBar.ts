/**
 * Barra de control (veta INTERFAZ — hacer el juego legible y vendible). Da al
 * proyecto identidad de producto y un control REAL de la velocidad con el ratón
 * (hasta ahora solo por teclado 0-3): marca discreta + pastillas de velocidad
 * clicables + una leyenda de controles plegable para que quien abra el juego por
 * primera vez sepa moverse. Diegética y translúcida, misma estética pastel del
 * resto de la UI; no tapa la viñeta (esquina inferior izquierda).
 *
 * Solo DOM + un callback `setSpeed`. Cero lógica de sim. Colores neutros de la
 * tinta ya establecida en la UI; el acento activo sale de la paleta (regla nº1).
 */
import { PALETTE } from '../palette';
import { Speed } from '../sim/protocol';

function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
const ACCENT = css(PALETTE.selectRing); // oro suave para la velocidad activa
const WARN = css(PALETTE.signYellow); // ámbar de "pausa" (coherente con el HUD)

const SPEEDS: Array<{ s: Speed; glyph: string; title: string }> = [
  { s: 0, glyph: '❙❙', title: 'Pausa · tecla 0' },
  { s: 1, glyph: '▶', title: 'Velocidad ×1 · tecla 1' },
  { s: 2, glyph: '▶▶', title: 'Velocidad ×3 · tecla 2' },
  { s: 3, glyph: '▶▶▶', title: 'Velocidad ×8 · tecla 3' },
];

const CONTROLS: Array<[string, string]> = [
  ['arrastrar · WASD', 'mover la cámara'],
  ['rueda', 'acercar / alejar'],
  ['Q · E', 'rotar la vista'],
  ['clic en vecino', 'inspeccionar'],
  ['F', 'seguir al vecino'],
  ['C', 'abrir la crónica'],
  ['0 – 3', 'velocidad del tiempo'],
  ['F3', 'panel de rendimiento'],
];

const STYLE_ID = 'city-bill-controlbar-style';

export class ControlBar {
  private root: HTMLDivElement;
  private pills = new Map<Speed, HTMLButtonElement>();
  private helpPanel: HTMLDivElement;
  private helpToggle: HTMLButtonElement;
  private helpOpen = false;
  private current: Speed | null = null;

  constructor(private setSpeed: (s: Speed) => void) {
    this.injectStyle();

    this.root = document.createElement('div');
    this.root.className = 'cb-bar';
    document.body.appendChild(this.root);

    // Marca discreta: identidad de producto sin gritar.
    const brand = document.createElement('div');
    brand.className = 'cb-brand';
    brand.innerHTML = '<span class="cb-brand-dot"></span>city<span class="cb-brand-sep">·</span>bill';
    this.root.appendChild(brand);

    // Control de velocidad: pastillas clicables.
    const speedRow = document.createElement('div');
    speedRow.className = 'cb-speed';
    for (const sp of SPEEDS) {
      const b = document.createElement('button');
      b.className = 'cb-pill';
      b.textContent = sp.glyph;
      b.title = sp.title;
      b.addEventListener('click', () => this.setSpeed(sp.s));
      speedRow.appendChild(b);
      this.pills.set(sp.s, b);
    }
    this.root.appendChild(speedRow);

    // Ayuda: "?" que despliega la leyenda de controles.
    this.helpToggle = document.createElement('button');
    this.helpToggle.className = 'cb-help-toggle';
    this.helpToggle.textContent = 'controles';
    this.helpToggle.title = 'Mostrar / ocultar los controles';
    this.helpToggle.addEventListener('click', () => this.toggleHelp());
    this.root.appendChild(this.helpToggle);

    this.helpPanel = document.createElement('div');
    this.helpPanel.className = 'cb-help';
    this.helpPanel.style.display = 'none';
    for (const [keys, what] of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'cb-help-row';
      const k = document.createElement('span');
      k.className = 'cb-key';
      k.textContent = keys;
      const w = document.createElement('span');
      w.className = 'cb-what';
      w.textContent = what;
      row.append(k, w);
      this.helpPanel.appendChild(row);
    }
    this.root.appendChild(this.helpPanel);
  }

  /** Resalta la pastilla activa cuando cambia la velocidad (llamar cada frame). */
  update(speed: Speed): void {
    if (speed === this.current) return;
    this.current = speed;
    for (const [s, b] of this.pills) {
      const active = s === speed;
      b.classList.toggle('cb-active', active);
      // La pausa se resalta en ámbar (el mundo está congelado a propósito).
      b.style.setProperty('--cb-accent', speed === 0 && active ? WARN : ACCENT);
    }
  }

  private toggleHelp(): void {
    this.helpOpen = !this.helpOpen;
    this.helpPanel.style.display = this.helpOpen ? 'grid' : 'none';
    this.helpToggle.classList.toggle('cb-active', this.helpOpen);
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
.cb-bar{position:fixed;left:12px;bottom:12px;z-index:10;
  display:flex;flex-direction:column;align-items:flex-start;gap:7px;
  font:12px/1.2 ui-monospace,monospace;color:#2d3327;user-select:none}
.cb-brand{display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px;
  letter-spacing:0.04em;padding:4px 10px;border-radius:9px;
  background:rgba(241,239,230,0.9);border:1px solid rgba(45,51,39,0.18);
  box-shadow:0 1px 6px rgba(45,51,39,0.12)}
.cb-brand-dot{width:8px;height:8px;border-radius:50%;background:${ACCENT};
  box-shadow:0 0 0 3px rgba(216,178,90,0.22)}
.cb-brand-sep{opacity:0.4;margin:0 1px}
.cb-speed{display:flex;gap:4px;padding:4px;border-radius:10px;
  background:rgba(241,239,230,0.9);border:1px solid rgba(45,51,39,0.18);
  box-shadow:0 1px 6px rgba(45,51,39,0.12)}
.cb-pill{--cb-accent:${ACCENT};cursor:pointer;min-width:30px;height:24px;
  padding:0 8px;font:11px/1 ui-monospace,monospace;color:#2d3327;
  background:transparent;border:1px solid transparent;border-radius:7px;
  transition:background 0.15s ease,border-color 0.15s ease,transform 0.08s ease}
.cb-pill:hover{background:rgba(45,51,39,0.07)}
.cb-pill:active{transform:translateY(1px)}
.cb-pill.cb-active{background:rgba(45,51,39,0.09);
  border-color:var(--cb-accent);color:#1f241b;font-weight:700;
  box-shadow:inset 0 -2px 0 var(--cb-accent)}
.cb-help-toggle{cursor:pointer;align-self:flex-start;padding:4px 10px;
  font:10px/1 ui-monospace,monospace;letter-spacing:0.08em;text-transform:uppercase;
  color:#2d3327;opacity:0.7;background:rgba(241,239,230,0.9);
  border:1px solid rgba(45,51,39,0.18);border-radius:8px;
  transition:opacity 0.15s ease,background 0.15s ease}
.cb-help-toggle:hover{opacity:1;background:rgba(45,51,39,0.06)}
.cb-help-toggle.cb-active{opacity:1;box-shadow:inset 0 -2px 0 ${ACCENT}}
.cb-help{grid-template-columns:auto auto;gap:3px 12px;padding:9px 12px;
  border-radius:9px;background:rgba(241,239,230,0.92);
  border:1px solid rgba(45,51,39,0.18);box-shadow:0 1px 6px rgba(45,51,39,0.12)}
.cb-help-row{display:contents}
.cb-key{font-weight:600;white-space:nowrap}
.cb-what{opacity:0.62;white-space:nowrap}
`;
    document.head.appendChild(s);
  }
}
