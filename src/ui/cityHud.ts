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
import { CityStats, Speed, settlementClass } from '../sim/protocol';
import { css, INK, panelStyle } from './theme';

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
      `color:${INK}`,
      panelStyle(0.9),
      'border-radius:10px',
      'pointer-events:none',
      'z-index:10',
      'white-space:nowrap',
    ].join(';');
    document.body.appendChild(this.el);

    for (const key of ['time', 'pop', 'treasury', 'jobless', 'season', 'granary', 'health', 'happiness', 'congestion', 'wealth', 'abandoned']) {
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
      if (key === 'abandoned') root.style.display = 'none';
    }
    this.chips.time.label.textContent = 'tiempo';
    this.chips.pop.label.textContent = 'población';
    this.chips.treasury.label.textContent = 'tesoro';
    this.chips.jobless.label.textContent = 'paro';
    this.chips.season.label.textContent = 'estación';
    this.chips.granary.label.textContent = 'granero';
    this.chips.health.label.textContent = 'salud';
    this.chips.happiness.label.textContent = 'ánimo';
    this.chips.congestion.label.textContent = 'tráfico';
    this.chips.wealth.label.textContent = 'riqueza media';
    this.chips.abandoned.label.textContent = 'cerrados';
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
      Math.round(city.happiness * 100),
      Math.round(city.congestion * 100),
      city.avgWealth | 0,
      city.debt | 0,
      city.bankrupt ? 1 : 0,
      city.abandoned,
    ].join('|');
    if (sig === this.last) return;
    this.last = sig;

    if (clock) {
      this.chips.time.value.textContent = `d${clock.day} · ${hh}:${mm} · ${SPEED_LABEL[clock.speed]}`;
      // La pausa se avisa en ámbar (el mundo está congelado a propósito).
      this.chips.time.value.style.color = clock.speed === 0 ? WARN : '';
    }

    // Identidad del lugar (ciclo 47): la etiqueta del chip de población es su
    // CLASE (aldea/pueblo/villa/ciudad) — se ve crecer el asentamiento, no solo
    // el número. El label ya va en mayúsculas y atenuado (encaja como categoría).
    this.chips.pop.label.textContent = settlementClass(city.population);
    this.chips.pop.value.textContent = String(city.population);

    const treasury = this.chips.treasury.value;
    treasury.textContent = fmtMoney(city.treasury);
    treasury.style.color = city.bankrupt ? ALERT : city.debt > 0 ? WARN : '';

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

    const happiness = this.chips.happiness.value;
    const happinessPct = Math.round(city.happiness * 100);
    happiness.textContent = `${happinessPct}%`;
    happiness.style.color = happinessPct < 25 ? ALERT : happinessPct < 50 ? WARN : '';

    const congestion = this.chips.congestion.value;
    const congestionPct = Math.round(city.congestion * 100);
    congestion.textContent = `${congestionPct}%`;
    congestion.style.color = congestionPct >= 70 ? ALERT : congestionPct >= 35 ? WARN : '';

    this.chips.wealth.value.textContent = fmtMoney(city.avgWealth);

    const abandoned = this.chips.abandoned;
    abandoned.root.style.display = city.abandoned > 0 ? 'flex' : 'none';
    abandoned.value.textContent = String(city.abandoned);
    abandoned.value.style.color = city.abandoned > 0 ? ALERT : '';
  }
}

/** Dinero compacto: 1.2k, 44k, 1.3M — para que la barra no crezca. */
function fmtMoney(v: number): string {
  const n = Math.round(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return String(n);
}
