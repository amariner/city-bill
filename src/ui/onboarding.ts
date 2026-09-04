/**
 * Primeros pasos (T6.3). No es un tutorial que detenga el pueblo: son cuatro
 * notas pequeñas que acompañan las primeras interacciones y desaparecen para
 * siempre. La ciudad sigue viva detrás de ellas en todo momento.
 */
import { PALETTE } from '../palette';
import { css, INK, PANEL_BORDER, PANEL_SHADOW, rgba } from './theme';

export const ONBOARDING_STORAGE_KEY = 'city-bill:onboarding:v1';

export interface OnboardingTip {
  key: string;
  text: string;
}

export const ONBOARDING_TIPS: readonly OnboardingTip[] = [
  { key: 'explore', text: 'Tu pueblo crece solo. Recorrelo con arrastre o WASD.' },
  { key: 'chronicle', text: 'C abre la Crónica: aquí quedan sus vidas y sus hitos.' },
  { key: 'neighbor', text: 'Haz clic en un vecino para conocer su día. F lo sigue.' },
  { key: 'time', text: 'Abajo controlas el tiempo: 0 pausa; 1–3 lo aceleran.' },
];

const STYLE_ID = 'city-bill-onboarding-style';

/** Guarda la decisión como un dato aislado para que pueda probarse sin DOM. */
export function onboardingSeen(value: string | null): boolean {
  return value === 'done';
}

export class Onboarding {
  private el: HTMLDivElement | null = null;
  private index = 0;
  private done = false;
  private armed = false;

  constructor() {
    try { this.done = onboardingSeen(localStorage.getItem(ONBOARDING_STORAGE_KEY)); } catch { /* modo privado: vive esta sesión */ }
    if (this.done) return;
    this.injectStyle();
    this.el = document.createElement('div');
    this.el.className = 'ob-tip';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.el);
    this.render();
    // El gesto que abre el juego no debería comerse la primera pista; a partir
    // del siguiente, cada gesto avanza una nota sin interceptar su acción.
    window.setTimeout(() => { this.armed = true; }, 350);
    window.addEventListener('pointerdown', this.advanceFromInteraction, true);
    window.addEventListener('keydown', this.advanceFromInteraction, true);
  }

  /** Permite empezar tras cerrar el menú de una partida restaurada. */
  start(): void {
    if (!this.el || this.done) return;
    this.el.classList.add('ob-visible');
  }

  private advanceFromInteraction = (event: Event): void => {
    if (!this.armed || this.done || !this.el) return;
    const target = event.target as HTMLElement | null;
    // No avanzar al escribir una semilla nueva en el menú.
    if (target?.tagName === 'INPUT') return;
    this.index++;
    if (this.index >= ONBOARDING_TIPS.length) {
      this.finish();
      return;
    }
    this.render();
  };

  private render(): void {
    if (!this.el) return;
    const tip = ONBOARDING_TIPS[this.index];
    this.el.textContent = `${this.index + 1}/${ONBOARDING_TIPS.length} · ${tip.text}`;
    this.el.classList.add('ob-visible');
  }

  private finish(): void {
    this.done = true;
    try { localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done'); } catch { /* almacenamiento opcional */ }
    window.removeEventListener('pointerdown', this.advanceFromInteraction, true);
    window.removeEventListener('keydown', this.advanceFromInteraction, true);
    if (!this.el) return;
    const el = this.el;
    el.classList.remove('ob-visible');
    window.setTimeout(() => el.remove(), 260);
    this.el = null;
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.ob-tip{position:fixed;right:14px;bottom:14px;z-index:12;max-width:min(310px,calc(100vw - 28px));
  padding:9px 12px;border:${PANEL_BORDER};border-left:3px solid ${css(PALETTE.selectRing)};border-radius:9px;
  background:${rgba(PALETTE.houseWall,0.94)};box-shadow:${PANEL_SHADOW};font:11px/1.45 ui-monospace,monospace;
  color:${INK};opacity:0;transform:translateY(7px);pointer-events:none;
  transition:opacity .24s ease,transform .24s ease}
.ob-tip.ob-visible{opacity:1;transform:translateY(0)}
`;
    document.head.appendChild(style);
  }
}
