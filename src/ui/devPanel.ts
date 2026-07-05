/**
 * Panel del BANCO DE PRUEBAS (?scene=test-dev). Overlay DOM plegable para
 * FORZAR y OBSERVAR de un vistazo todas las mecánicas de la sim: velocidad,
 * salto de estación, epidemia a voluntad, toggles de cuarentena/vacuna/sanidad/
 * alquiler/crecimiento y contadores en vivo (población por edad, empleo, obras,
 * tiers, economía, contagio).
 *
 * Regla de oro: CERO lógica de sim aquí. El panel solo LEE `simClient.city`
 * (fuente de verdad) y ENVÍA comandos ya existentes (`setSpeed`, `dev`). Los
 * toggles reflejan el estado real que devuelve la sim, no un estado propio.
 *
 * Estética: misma piel pastel translúcida del HUD/inspector; acentos SOLO desde
 * palette.ts (regla de arte nº 1).
 */
import { PALETTE } from '../palette';
import { SimClient } from '../sim/client';
import { CityStats, Speed, DevFlag } from '../sim/protocol';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../sim/weather';

function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
const ALERT = css(PALETTE.signRed);
const WARN = css(PALETTE.signYellow);
const OK = css(PALETTE.grass);
const INK = '#2d3327';

const SPEEDS: { s: Speed; label: string }[] = [
  { s: 0, label: '⏸' },
  { s: 1, label: '×1' },
  { s: 2, label: '×3' },
  { s: 3, label: '×8' },
];

const FLAGS: { flag: DevFlag; label: string }[] = [
  { flag: 'autonomousGrowth', label: 'crecimiento' },
  { flag: 'quarantine', label: 'cuarentena' },
  { flag: 'vaccination', label: 'vacuna' },
  { flag: 'clinicHealing', label: 'sanidad' },
  { flag: 'rentEnabled', label: 'alquiler' },
];

/** Fila de contador (etiqueta + valor). */
interface Row {
  value: HTMLSpanElement;
}

export class DevPanel {
  private el: HTMLDivElement;
  private body: HTMLDivElement;
  private speedBtns = new Map<Speed, HTMLButtonElement>();
  private flagBtns = new Map<DevFlag, HTMLButtonElement>();
  private rows: Record<string, Row> = {};
  private last = '';
  private collapsed = false;

  constructor(private sim: SimClient) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'top:10px',
      'left:10px',
      'width:212px',
      'font:11px/1.35 ui-monospace,monospace',
      `color:${INK}`,
      'background:rgba(241,239,230,0.94)',
      'border:1px solid rgba(45,51,39,0.18)',
      'border-radius:10px',
      'box-shadow:0 2px 10px rgba(45,51,39,0.16)',
      'z-index:20',
      'overflow:hidden',
      'user-select:none',
    ].join(';');

    // --- Cabecera (plegable) ---
    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 10px;cursor:pointer;background:rgba(45,51,39,0.05)';
    const title = document.createElement('span');
    title.textContent = '⚙ banco de pruebas';
    title.style.cssText = 'font-size:10px;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;opacity:0.8';
    const chevron = document.createElement('span');
    chevron.textContent = '▾';
    chevron.style.cssText = 'font-size:10px;opacity:0.6';
    header.appendChild(title);
    header.appendChild(chevron);
    header.onclick = () => {
      this.collapsed = !this.collapsed;
      this.body.style.display = this.collapsed ? 'none' : 'block';
      chevron.textContent = this.collapsed ? '▸' : '▾';
    };
    this.el.appendChild(header);

    this.body = document.createElement('div');
    this.body.style.cssText = 'padding:8px 10px 10px';
    this.el.appendChild(this.body);

    // --- Velocidad ---
    this.section('velocidad');
    const speedRow = this.btnRow();
    for (const { s, label } of SPEEDS) {
      const b = this.button(label, () => this.sim.setSpeed(s));
      this.speedBtns.set(s, b);
      speedRow.appendChild(b);
    }

    // --- Saltar tiempo (cambiar de estación / madurar) ---
    // El salto NO congela: el worker lo consume por frames y se ve correr el
    // reloj y las estaciones. Saltos alineados al calendario (estación/año).
    this.section('saltar tiempo');
    const jumpRow = this.btnRow();
    const jumps: [string, number][] = [
      ['+1d', 1],
      ['+estación', DAYS_PER_SEASON],
      ['+año', DAYS_PER_YEAR],
    ];
    for (const [label, d] of jumps) {
      jumpRow.appendChild(this.button(label, () => this.sim.dev({ kind: 'advanceDays', days: d })));
    }

    // --- Mecánicas ---
    this.section('mecánicas');
    const epiRow = this.btnRow();
    const epi = this.button('☣ disparar epidemia', () => this.sim.dev({ kind: 'forceEpidemic' }));
    epi.style.flex = '1';
    epiRow.appendChild(epi);
    const flagsWrap = document.createElement('div');
    flagsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:5px';
    for (const { flag, label } of FLAGS) {
      const b = this.button(label, () => {
        // Alterna respecto al estado REAL que reporta la sim (no un espejo local).
        const cur = this.currentFlag(flag);
        this.sim.dev({ kind: 'setFlag', flag, value: !cur });
      });
      this.flagBtns.set(flag, b);
      flagsWrap.appendChild(b);
    }
    this.body.appendChild(flagsWrap);

    // --- Contadores en vivo ---
    this.section('en vivo');
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:1px 8px;font-size:11px';
    const meters: [string, string][] = [
      ['pop', 'población'],
      ['ages', 'niños·adultos·mayores'],
      ['jobs', 'empleo'],
      ['builds', 'edificios · tier'],
      ['roads', 'calles trazadas'],
      ['cars', 'viajes en coche'],
      ['treasury', 'tesoro'],
      ['granary', 'granero'],
      ['wealth', 'riqueza media'],
      ['vacc', 'vacunas'],
      ['health', 'salud'],
    ];
    for (const [key, label] of meters) {
      const l = document.createElement('span');
      l.textContent = label;
      l.style.cssText = 'opacity:0.55;white-space:nowrap';
      const v = document.createElement('span');
      v.style.cssText = 'font-weight:600;text-align:right';
      grid.appendChild(l);
      grid.appendChild(v);
      this.rows[key] = { value: v };
    }
    this.body.appendChild(grid);

    document.body.appendChild(this.el);
  }

  private section(name: string): void {
    const h = document.createElement('div');
    h.textContent = name;
    h.style.cssText =
      'font-size:9px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.45;margin:9px 0 4px;font-weight:700';
    this.body.appendChild(h);
  }

  private btnRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px';
    this.body.appendChild(row);
    return row;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = [
      'flex:1',
      'padding:4px 6px',
      'font:600 10px/1.2 ui-monospace,monospace',
      `color:${INK}`,
      'background:rgba(255,255,255,0.55)',
      'border:1px solid rgba(45,51,39,0.2)',
      'border-radius:6px',
      'cursor:pointer',
      'white-space:nowrap',
    ].join(';');
    b.onmouseenter = () => (b.style.background = 'rgba(255,255,255,0.85)');
    b.onmouseleave = () => this.repaintButtonBase(b);
    b.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
    return b;
  }

  /** Fondo base del botón (los activos se repintan en update). */
  private repaintButtonBase(b: HTMLButtonElement): void {
    if (b.dataset.active === '1') return; // update lo mantiene resaltado
    b.style.background = 'rgba(255,255,255,0.55)';
  }

  private currentFlag(flag: DevFlag): boolean {
    const c = this.sim.city;
    return c ? (c[flag] as boolean) : true;
  }

  /** Llamar cada frame; solo toca el DOM cuando algo cambia (la sim va a 4 Hz). */
  update(): void {
    const c: CityStats | null = this.sim.city;
    if (!c) return;
    const sig = [
      this.sim.speed,
      c.population,
      c.children,
      c.adults,
      c.elders,
      c.employed,
      c.jobs,
      c.buildings,
      c.tier,
      c.roadsExtended,
      c.carTrips,
      c.treasury | 0,
      c.granary | 0,
      c.avgWealth | 0,
      c.vaccinationsGiven,
      c.epidemic ? 1 : 0,
      c.sick,
      c.quarantine ? 1 : 0,
      c.vaccination ? 1 : 0,
      c.clinicHealing ? 1 : 0,
      c.rentEnabled ? 1 : 0,
      c.autonomousGrowth ? 1 : 0,
    ].join('|');
    if (sig === this.last) return;
    this.last = sig;

    // Botones de velocidad: resalta el activo.
    for (const [s, b] of this.speedBtns) this.setActive(b, s === this.sim.speed);

    // Toggles: color según estado real (verde ON, ámbar OFF — un OFF en el
    // banco de pruebas es un "escenario contrafactual" activado a propósito).
    for (const { flag } of FLAGS) {
      const b = this.flagBtns.get(flag)!;
      const on = c[flag] as boolean;
      b.dataset.active = on ? '1' : '0';
      b.style.background = on ? 'rgba(169,194,134,0.55)' : 'rgba(212,174,75,0.4)';
      b.style.borderColor = on ? 'rgba(45,51,39,0.2)' : WARN;
      b.title = on ? 'activo — clic para desactivar (escenario contrafactual)' : 'DESACTIVADO — clic para reactivar';
    }

    this.rows.pop.value.textContent = String(c.population);
    this.rows.ages.value.textContent = `${c.children}·${c.adults}·${c.elders}`;
    const joblessPct = c.adults > 0 ? Math.round((1 - c.employed / c.adults) * 100) : 0;
    const jr = this.rows.jobs.value;
    jr.textContent = `${c.employed}/${c.jobs} · ${joblessPct}% paro`;
    jr.style.color = joblessPct > 20 ? ALERT : joblessPct > 8 ? WARN : '';
    this.rows.builds.value.textContent = `${c.buildings} · T${c.tier}`;
    this.rows.roads.value.textContent = String(c.roadsExtended);
    this.rows.cars.value.textContent = String(c.carTrips);
    this.rows.treasury.value.textContent = fmtMoney(c.treasury);
    this.rows.granary.value.textContent = String(Math.round(c.granary));
    this.rows.wealth.value.textContent = fmtMoney(c.avgWealth);
    this.rows.vacc.value.textContent = String(c.vaccinationsGiven);
    const hr = this.rows.health.value;
    if (c.epidemic) {
      hr.textContent = `epidemia · ${c.sick}`;
      hr.style.color = ALERT;
    } else if (c.sick > 0) {
      hr.textContent = `${c.sick} enfermo${c.sick === 1 ? '' : 's'}`;
      hr.style.color = WARN;
    } else {
      hr.textContent = 'sana';
      hr.style.color = OK;
    }
  }

  private setActive(b: HTMLButtonElement, active: boolean): void {
    b.dataset.active = active ? '1' : '0';
    b.style.background = active ? 'rgba(169,194,134,0.6)' : 'rgba(255,255,255,0.55)';
    b.style.borderColor = active ? 'rgba(45,51,39,0.35)' : 'rgba(45,51,39,0.2)';
  }
}

function fmtMoney(v: number): string {
  const n = Math.round(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return String(n);
}
