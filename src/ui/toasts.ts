/**
 * Avisos efímeros (surfacing 2): la sim ya EMITE eventos de vida (nacimientos,
 * parejas, hitos de población, festival, epidemia, legados) que hasta ahora solo
 * se veían en la Crónica (tecla C). Aquí los MEMORABLES asoman un instante como
 * una tarjetita discreta abajo-centro y se desvanecen — la ciudad "avisa" de lo
 * que le pasa sin que haya que abrir nada.
 *
 * Reutiliza `chronicleText` (única fuente de narración, ciclo 18): el toast no
 * inventa texto, muestra la misma frase que la Crónica registrará. Solo DOM;
 * cero lógica de sim. Los acentos salen de la paleta (regla de arte nº 1).
 */
import { PALETTE } from '../palette';
import { chronicleText, isLegacyDeath } from './chronicle';
import { css, INK, panelStyle, rgba } from './theme';
const ALERT = css(PALETTE.signRed);
const GOLDEN = css(PALETTE.signYellow);
const MILESTONE = css(PALETTE.grass);

/** Cuánto vive un aviso en pantalla (ms) antes de desvanecerse. */
const LIFE_MS = 5200;
const FADE_MS = 500;
/** Tope de avisos simultáneos (los viejos se retiran antes si llegan más). */
const MAX_TOASTS = 4;

interface Style {
  accent: string;
  /** Prefijo semántico monocromo (no emoji de color). */
  mark: string;
}

/** Qué eventos MERECEN un aviso y con qué acento. Los rutinarios (nacimiento,
 * muerte común, emigración, construcción) NO avisan — irían a spam; viven en la
 * Crónica. Devuelve null si el evento no es digno de aviso. */
function styleFor(name: string, data?: Record<string, unknown>): Style | null {
  switch (name) {
    case 'tierUnlocked':
      return { accent: MILESTONE, mark: '✦' };
    case 'festivalDay':
      return { accent: GOLDEN, mark: '✦' };
    case 'epidemic':
      return { accent: ALERT, mark: '!' };
    case 'coupleFormed':
      return { accent: MILESTONE, mark: '♥' };
    case 'vocationFound':
      // Rotación vocacional (ciclo 41): alguien encontró su llamada — historia
      // personal digna de un aviso (la sim la genera sin guion).
      return { accent: MILESTONE, mark: '✦' };
    case 'dynastyRose':
      // Dinastía (ciclo 43): una estirpe se afianza — un hito del largo plazo.
      return { accent: GOLDEN, mark: '❦' };
    case 'dynastyFell':
      // Extinción (ciclo 44): el arco de una familia se cierra — un beat sobrio.
      return { accent: '', mark: '❧' };
    case 'firstBuilding':
      // Hito del pueblo (ciclo 45): estrena un tipo de edificio — desarrollo urbano.
      return { accent: MILESTONE, mark: '⌂' };
    case 'roadBuilt':
      return { accent: MILESTONE, mark: '═' };
    case 'settlementRose':
      // Mayoría de edad (ciclo 47): el lugar asciende de categoría — un gran hito.
      return { accent: GOLDEN, mark: '✦' };
    case 'citizenLeft':
      // Solo los LEGADOS (matriarcas/patriarcas, ciclo 35) — no cada muerte.
      return isLegacyDeath(data) ? { accent: '', mark: '†' } : null;
    default:
      return null;
  }
}

export class Toasts {
  private el: HTMLDivElement;
  private live: HTMLDivElement[] = [];

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'bottom:72px',
      'left:50%',
      'transform:translateX(-50%)',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:6px',
      'pointer-events:none',
      'z-index:11',
    ].join(';');
    document.body.appendChild(this.el);
  }

  /** Engánchalo al `simClient.onEvent` (junto a la Crónica). */
  onEvent(name: string, data?: Record<string, unknown>): void {
    const style = styleFor(name, data);
    if (!style) return;
    const text = chronicleText(name, data);
    if (!text) return;
    this.push(text, style);
  }

  onActionRejected(reason: string): void {
    const labels: Record<string, string> = {
      outOfWorld: 'fuera del terreno conocido',
      blocked: 'la parcela está ocupada',
      water: 'no se puede construir sobre agua',
      road: 'no se puede construir sobre una vía',
      tierLocked: 'edificio aún no desbloqueado',
      notFound: 'no hay nada que demoler aquí',
      notPlayerPlaceable: 'ese elemento no se coloca a mano',
      invalid: 'acción no disponible',
    };
    this.push(labels[reason] ?? 'acción rechazada', { accent: ALERT, mark: '!' });
  }

  private push(text: string, style: Style): void {
    const card = document.createElement('div');
    card.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'max-width:340px',
      'padding:7px 13px',
      'font:12px/1.35 ui-monospace,monospace',
      `color:${INK}`,
      panelStyle(0.94),
      `border-left:3px solid ${style.accent || rgba(PALETTE.treeBlob, 0.35)}`,
      'border-radius:8px',
      'opacity:0',
      'transform:translateY(6px)',
      `transition:opacity ${FADE_MS}ms ease,transform ${FADE_MS}ms ease`,
    ].join(';');

    const mark = document.createElement('span');
    mark.textContent = style.mark;
    mark.style.cssText = `font-weight:700;opacity:0.8;color:${style.accent || 'inherit'}`;
    const body = document.createElement('span');
    body.textContent = text;

    card.append(mark, body);
    this.el.append(card);
    this.live.push(card);

    // Retira los más viejos si se acumulan.
    while (this.live.length > MAX_TOASTS) {
      const old = this.live.shift();
      if (old) this.remove(old);
    }

    // Entra en el siguiente frame (para que la transición dispare).
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
    setTimeout(() => this.remove(card), LIFE_MS);
  }

  private remove(card: HTMLDivElement): void {
    if (!card.isConnected) return;
    card.style.opacity = '0';
    card.style.transform = 'translateY(6px)';
    const i = this.live.indexOf(card);
    if (i >= 0) this.live.splice(i, 1);
    setTimeout(() => card.remove(), FADE_MS);
  }
}
