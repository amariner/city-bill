/**
 * HUD de CIUDAD (surfacing): saca a la superficie la vida que la simulación ya
 * produce por dentro pero que hasta ahora era casi invisible. Barra superior
 * translúcida, diegética y discreta (misma estética pastel del inspector/debug
 * HUD): población, tesoro, paro, estación + granero, salud/epidemia y riqueza
 * media. Solo DOM + lectura del SimClient; cero lógica de sim.
 *
 * Estética: tipografía pequeña y limpia, sin tapar la viñeta. Los acentos de
 * alerta (paro alto, epidemia) usan colores SEMÁNTICOS de palette.ts
 * (signRed/signYellow), no hex sueltos — respeta la regla de arte nº 1.
 */
import { PALETTE } from '../palette';
import { CityStats, Speed } from '../sim/protocol';

/** Hex numérico de la paleta → color CSS. */
function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

const ALERT = css(PALETTE.signRed);
const WARN = css(PALETTE.signYellow);

/** Reloj de juego para el HUD (el paso del tiempo, hoy solo en F3). */
export interface ClockView {
  day: number;
  /** Hora de juego en [0,24). */
  hour: number;
  speed: Speed;
}

/** Etiqueta de velocidad: pausa o multiplicador. */
const SPEED_LABEL: Record<Speed, string> = { 0: '⏸ pausa', 1: '×1', 2: '×3', 3: '×8' };


interface Chip {
  label: HTMLSpanElement;
  value: HTMLSpanElement;
  root: HTMLDivElement;
}

export class CityHud {
  private el: HTMLDivElement;
  private chips: Record<string, Chip> = {};
  private last = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'top:10px',
      'left:50%',
      'transform:translateX(-50%)',
      'display:flex',
      'gap:18px',
      'align-items:center',
      'padding:7px 16px',
      'font:12px/1.2 ui-monospace,monospace',
      'color:#2d3327',
      'background:rgba(241,239,230,0.9)',
      'border:1px solid rgba(45,51,39,0.18)',
      'border-radius:10px',
      'box-shadow:0 1px 6px rgba(45,51,39,0.12)',
      'pointer-events:none',
      'z-index:10',
      'white-space:nowrap',
    ].join(';');
    document.body.appendChild(this.el);

    for (const key of ['time', 'pop', 'treasury', 'jobless', 'season', 'granary', 'health', 'wealth']) {
      const root = document.createElement('div');
      root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1px';
      const label = document.createElement('span');
      label.style.cssText = 'font-size:9px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.55';
      const value = document.createElement('span');
      value.style.cssText = 'font-size:13px;font-weight:600';
      root.appendChild(label);
      root.appendChild(value);
      this.el.appendChild(root);
      this.chips[key] = { label, value, root };
    }
    this.chips.time.label.textContent = 'tiempo';
    this.chips.pop.label.textContent = 'población';
    this.chips.treasury.label.textContent = 'tesoro';
    this.chips.jobless.label.textContent = 'paro';
    this.chips.season.label.textContent = 'estación';
    this.chips.granary.label.textContent = 'granero';
    this.chips.health.label.textContent = 'salud';
    this.chips.wealth.label.textContent = 'riqueza media';
  }

  /** Llamar cada frame; sólo reescribe el DOM cuando algo cambia. */
  update(city: CityStats | null, clock?: ClockView): void {
    if (!city) return;
    const hh = clock ? String(Math.floor(clock.hour)).padStart(2, '0') : '';
    const mm = clock ? String(Math.floor((clock.hour % 1) * 60)).padStart(2, '0') : '';
    // Firma barata para evitar tocar el DOM en cada frame (la sim va a 4 Hz).
    const sig = [
      clock ? `${clock.day}|${hh}:${mm}|${clock.speed}` : '',
      city.population,
      city.treasury | 0,
      Math.round(city.unemployment * 100),
      city.season,
      city.granary | 0,
      city.epidemic ? 1 : 0,
      city.sick,
      city.avgWealth | 0,
    ].join('|');
    if (sig === this.last) return;
    this.last = sig;

    if (clock) {
      this.chips.time.value.textContent = `d${clock.day} · ${hh}:${mm} · ${SPEED_LABEL[clock.speed]}`;
      // La pausa se avisa en ámbar (el mundo está congelado a propósito).
      this.chips.time.value.style.color = clock.speed === 0 ? WARN : '';
    }

    this.chips.pop.value.textContent = String(city.population);

    this.chips.treasury.value.textContent = fmtMoney(city.treasury);

    const joblessPct = Math.round(city.unemployment * 100);
    const jv = this.chips.jobless.value;
    jv.textContent = `${joblessPct}%`;
    // Acento de alerta cuando el paro aprieta (>20% preocupa, >8% avisa).
    jv.style.color = joblessPct > 20 ? ALERT : joblessPct > 8 ? WARN : '';

    this.chips.season.value.textContent = city.season;
    this.chips.granary.value.textContent = String(Math.round(city.granary));

    const hv = this.chips.health.value;
    if (city.epidemic) {
      hv.textContent = `epidemia · ${city.sick}`;
      hv.style.color = ALERT;
    } else if (city.sick > 0) {
      hv.textContent = `${city.sick} enfermo${city.sick === 1 ? '' : 's'}`;
      hv.style.color = WARN;
    } else {
      hv.textContent = 'sana';
      hv.style.color = '';
    }

    this.chips.wealth.value.textContent = fmtMoney(city.avgWealth);
  }
}

/** Dinero compacto: 1.2k, 44k, 1.3M — para que la barra no crezca. */
function fmtMoney(v: number): string {
  const n = Math.round(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return String(n);
}
