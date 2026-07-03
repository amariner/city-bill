/**
 * La Crónica (tecla C): la MEMORIA VISUAL del algoritmo de investigación
 * (RESEARCH.md §3). Muestra y persiste en localStorage (por semilla):
 * - sparkline de población por año de la ciudad (crece sesión a sesión),
 * - contadores vivos (población, edificios, parejas, nacimientos, muertes),
 * - feed de eventos con fecha de juego,
 * - lista de lógicas del multiuniverso ya activas (el progreso del proyecto).
 * Solo DOM/canvas 2D; cero lógica de sim.
 */
import { DAY_GAME_SECONDS } from '../sim/clock';

/** Lógicas integradas — AMPLIAR en cada ciclo de RESEARCH.md. */
export const ACTIVE_LOGICS = [
  'necesidades + cerebro',
  'social (charlas/afinidad)',
  'economía (empleos)',
  'crecimiento autónomo',
  'vida (generaciones)',
  'educación',
  'alimento (cadena granja→tienda→despensa)',
];

interface ChronicleData {
  /** [año, población, edificios] por año de la ciudad. */
  series: Array<[number, number, number]>;
  events: Array<{ year: number; text: string }>;
  counters: { births: number; deaths: number; couples: number };
}

const MAX_EVENTS = 60;

export class Chronicle {
  private el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private visible = false;
  private data: ChronicleData;
  private key: string;
  private lastYear = -1;
  private lastSave = 0;
  private dirty = false;

  constructor(seed: number) {
    this.key = `city-bill-chronicle-${seed}`;
    this.data = this.load();

    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:8px',
      'width:250px',
      'max-height:82vh',
      'overflow:hidden',
      'padding:10px 12px',
      'font:11px/1.55 ui-monospace,monospace',
      'color:#2d3327',
      'background:rgba(241,239,230,0.92)',
      'border:1px solid rgba(45,51,39,0.18)',
      'border-radius:8px',
      'pointer-events:none',
      'z-index:10',
      'display:none',
      'white-space:pre-wrap',
    ].join(';');
    this.canvas = document.createElement('canvas');
    this.canvas.width = 226;
    this.canvas.height = 48;
    this.canvas.style.cssText = 'display:block;margin:6px 0;';
    document.body.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'block' : 'none';
        if (this.visible) this.render();
      }
    });
  }

  private load(): ChronicleData {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) return JSON.parse(raw) as ChronicleData;
    } catch {
      /* corrupto: se empieza crónica nueva */
    }
    return { series: [], events: [], counters: { births: 0, deaths: 0, couples: 0 } };
  }

  private save(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      /* almacenamiento lleno: la crónica vive solo en memoria */
    }
  }

  /** Evento de sim → texto de crónica. Devuelve null para los que no narran. */
  onEvent(name: string, data?: Record<string, unknown>): void {
    const year = this.lastYear < 0 ? 0 : this.lastYear;
    let text: string | null = null;
    switch (name) {
      case 'citizenBorn':
        if (year === 0) return; // fundadores: no inundar la crónica
        text = `nace ${data?.name ?? 'alguien'}`;
        this.data.counters.births++;
        break;
      case 'citizenLeft':
        text = `muere ${data?.name ?? 'alguien'} (${data?.age ?? '?'} años)`;
        this.data.counters.deaths++;
        break;
      case 'coupleFormed':
        text = `${data?.a} y ${data?.b} se emparejan`;
        this.data.counters.couples++;
        break;
      case 'cityGrew':
        text = `la ciudad construye: ${data?.id}`;
        break;
      case 'tierUnlocked':
        text = `¡hito! tier ${data?.tier} desbloqueado (${data?.population} hab.)`;
        break;
      default:
        return;
    }
    this.data.events.push({ year, text });
    if (this.data.events.length > MAX_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
    this.dirty = true;
  }

  /** Llamar cada frame con el estado del último snapshot. */
  update(gameTime: number, population: number, buildings: number): void {
    const year = Math.floor(gameTime / DAY_GAME_SECONDS);
    if (year !== this.lastYear) {
      this.lastYear = year;
      const last = this.data.series[this.data.series.length - 1];
      if (!last || last[0] !== year) this.data.series.push([year, population, buildings]);
      this.dirty = true;
      if (this.visible) this.render();
    } else if (this.data.series.length > 0) {
      // Mantén el año en curso fresco.
      const last = this.data.series[this.data.series.length - 1];
      last[1] = population;
      last[2] = buildings;
    }
    const now = performance.now();
    if (this.dirty && now - this.lastSave > 3000) {
      this.lastSave = now;
      this.dirty = false;
      this.save();
      if (this.visible) this.render();
    }
  }

  private render(): void {
    const d = this.data;
    const last = d.series[d.series.length - 1] ?? [0, 0, 0];
    const head =
      `CRÓNICA DE LA CIUDAD — año ${last[0]}\n` +
      `población ${last[1]} · edificios ${last[2]}\n` +
      `nacimientos ${d.counters.births} · muertes ${d.counters.deaths} · parejas ${d.counters.couples}`;

    const feed = d.events
      .slice(-14)
      .map((e) => `a${e.year} · ${e.text}`)
      .join('\n');

    const logics = ACTIVE_LOGICS.map((l) => `● ${l}`).join('\n');

    this.el.textContent = '';
    this.el.append(head);
    this.drawSpark();
    this.el.append(this.canvas);
    this.el.append(`${feed || '(aún sin historia)'}\n\nLÓGICAS VIVAS\n${logics}\n\n[C] cerrar`);
  }

  private drawSpark(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);
    const s = this.data.series;
    if (s.length < 2) {
      ctx.fillStyle = 'rgba(45,51,39,0.4)';
      ctx.fillText('población: aún poca historia…', 4, h / 2);
      return;
    }
    const maxPop = Math.max(...s.map((p) => p[1]), 1);
    ctx.strokeStyle = '#6f7d5c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    s.forEach((p, i) => {
      const x = (i / (s.length - 1)) * (w - 4) + 2;
      const y = h - 4 - (p[1] / maxPop) * (h - 10);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = 'rgba(45,51,39,0.55)';
    ctx.fillText(`pop máx ${maxPop}`, 4, 9);
  }
}
