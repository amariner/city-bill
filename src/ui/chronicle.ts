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
import { activeLogicNames } from '../sim/logics';
import { ILLNESS_HEALTH, OLD_AGE } from '../sim/lifecycle';

/** Lógicas integradas — la fuente de verdad es sim/logics.ts (manifiesto). */
const ACTIVE_LOGICS = activeLogicNames();

/** Tipo de evento para la compactación por años (RESEARCH §5). */
export type ChronKind = 'birth' | 'death' | 'emigrated' | 'couple' | 'milestone' | 'summary';

export interface ChronEvent {
  year: number;
  text: string;
  kind?: ChronKind;
}

interface ChronicleData {
  /** [año, población, edificios] por año de la ciudad. */
  series: Array<[number, number, number]>;
  events: ChronEvent[];
  counters: { births: number; deaths: number; couples: number; emigrated?: number };
}

/** Cuántos años recientes se guardan en DETALLE antes de resumirse. */
const RETAIN_DETAIL_YEARS = 4;
/** Tope duro de líneas (con compactación, rara vez se toca). */
const MAX_EVENTS = 120;

/**
 * Compacta los eventos de UN año en una sola línea-resumen (RESEARCH §5:
 * "memoria por niveles como los humanos" — los años viejos se recuerdan
 * resumidos, no borrados). Cuenta lo rutinario (nacimientos, muertes…) y
 * PRESERVA lo memorable (hitos: escuela, tier, fiesta). Pura y testeable.
 */
export function summarizeYear(year: number, events: ChronEvent[]): ChronEvent {
  let births = 0, deaths = 0, emigrated = 0, couples = 0;
  const notes: string[] = [];
  for (const e of events) {
    if (e.kind === 'birth') births++;
    else if (e.kind === 'death') deaths++;
    else if (e.kind === 'emigrated') emigrated++;
    else if (e.kind === 'couple') couples++;
    else notes.push(e.text); // hitos y eventos sin tipo: se preservan verbatim
  }
  const parts: string[] = [];
  if (births) parts.push(`${births} ${births === 1 ? 'nacimiento' : 'nacimientos'}`);
  if (couples) parts.push(`${couples} ${couples === 1 ? 'pareja' : 'parejas'}`);
  if (deaths) parts.push(`${deaths} ${deaths === 1 ? 'muerte' : 'muertes'}`);
  if (emigrated) parts.push(`${emigrated} se ${emigrated === 1 ? 'marchó' : 'marcharon'}`);
  parts.push(...notes);
  return { year, text: `año ${year}: ${parts.join(', ') || 'sin novedades'}`, kind: 'summary' };
}

/** Reemplaza el detalle de los años ya "viejos" (≤ currentYear − RETAIN) por una
 * línea-resumen cada uno. Idempotente: un año ya resumido (kind 'summary') no se
 * vuelve a tocar. Devuelve la nueva lista de eventos. */
export function compactChronicle(events: ChronEvent[], currentYear: number): ChronEvent[] {
  const cutoff = currentYear - RETAIN_DETAIL_YEARS;
  const detailByYear = new Map<number, ChronEvent[]>();
  for (const e of events) {
    if (e.year <= cutoff && e.kind !== 'summary') {
      (detailByYear.get(e.year) ?? detailByYear.set(e.year, []).get(e.year)!).push(e);
    }
  }
  if (detailByYear.size === 0) return events;
  const kept = events.filter((e) => !(e.year <= cutoff && e.kind !== 'summary'));
  const summaries = [...detailByYear.entries()].map(([y, evs]) => summarizeYear(y, evs));
  return [...kept, ...summaries].sort((a, b) => a.year - b.year);
}

/** Edad a partir de la cual una muerte se narra como "una vida larga". */
const LONG_LIFE_AGE = 85;

/**
 * Evento de sim → frase de la Crónica (PURA y testeable — ciclo 18). La Crónica
 * es la memoria del juego (§3/§6.1: ganamos cuando cuenta historias que no
 * escribimos nosotros), así que las despedidas se narran con contexto AFECTIVO:
 * la causa (enfermedad/vejez), una vida larga, y sobre todo la VIUDEZ — quién
 * queda sin su pareja (acopla con el duelo, ciclos 16/17). Devuelve null para
 * los eventos que no narran.
 */
export function chronicleText(name: string, data?: Record<string, unknown>): string | null {
  const who = (data?.name as string) ?? 'alguien';
  switch (name) {
    case 'citizenBorn':
      return `nace ${who}`;
    case 'citizenLeft': {
      if (data?.reason === 'emigrated') return `${who} se marcha a otra ciudad`;
      const h = typeof data?.health === 'number' ? data.health : 1;
      const age = typeof data?.age === 'number' ? data.age : 0;
      const partner = typeof data?.partnerName === 'string' ? data.partnerName : '';
      const kids = typeof data?.childrenRaised === 'number' ? data.childrenRaised : 0;
      const cause = h < ILLNESS_HEALTH && age < OLD_AGE ? ' por enfermedad' : '';
      const longLife = !cause && age >= LONG_LIFE_AGE ? ', una vida larga' : '';
      // Legado (ciclo 34, N5): una vida deja huella — los hijos criados se honran
      // al morir. La estima nace de lo VIVIDO (no del dinero, ver §4 ciclo 34).
      const legacy = kids > 0 ? `, deja ${kids} ${kids === 1 ? 'hijo' : 'hijos'}` : '';
      const widowing = partner ? ` — ${partner} pierde a su pareja` : '';
      return `muere ${who} (${age || '?'} años)${cause}${longLife}${legacy}${widowing}`;
    }
    case 'coupleFormed':
      return `${data?.a} y ${data?.b} se emparejan`;
    case 'cityGrew':
      return `la ciudad construye: ${data?.id}`;
    case 'tierUnlocked':
      return `¡hito! tier ${data?.tier} desbloqueado (${data?.population} hab.)`;
    case 'festivalDay':
      return typeof data?.name === 'string' ? data.name : 'fiesta mayor del pueblo';
    case 'epidemic':
      return `una epidemia recorre la ciudad (${data?.sick ?? '?'} enfermos)`;
    default:
      return null;
  }
}

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
    // Fundadores: no inundar la crónica con el nacimiento inicial.
    if (name === 'citizenBorn' && year === 0) return;
    // Contadores (memoria numérica; la narración va aparte, en chronicleText).
    switch (name) {
      case 'citizenBorn':
        this.data.counters.births++;
        break;
      case 'citizenLeft':
        if (data?.reason === 'emigrated') this.data.counters.emigrated = (this.data.counters.emigrated ?? 0) + 1;
        else this.data.counters.deaths++;
        break;
      case 'coupleFormed':
        this.data.counters.couples++;
        break;
    }
    const text = chronicleText(name, data);
    if (!text) return;
    const kind: ChronKind =
      name === 'citizenBorn' ? 'birth'
      : name === 'coupleFormed' ? 'couple'
      : name === 'citizenLeft' ? (data?.reason === 'emigrated' ? 'emigrated' : 'death')
      : 'milestone';
    this.data.events.push({ year, text, kind });
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
      // Memoria por niveles (ciclo 21 / RESEARCH §5): al pasar de año, los años
      // ya viejos se recuerdan resumidos en una línea, no borrados ni intactos.
      this.data.events = compactChronicle(this.data.events, year);
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
      `nacimientos ${d.counters.births} · muertes ${d.counters.deaths} · parejas ${d.counters.couples}` +
      (d.counters.emigrated ? ` · emigrados ${d.counters.emigrated}` : '');

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
