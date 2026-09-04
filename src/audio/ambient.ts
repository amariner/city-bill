/** Ambiente procedimental, exclusivamente cosmético. No toca la simulación ni
 * genera trabajo por frame: las fuentes nacen tras el primer gesto y los gains
 * ya existentes solo se suavizan según cámara, hora y población. */
export interface AmbientMix { wind: number; birds: number; murmur: number; }

/** Calcula la mezcla sin tocar Web Audio. `chatters` son ciudadanos que están
 * charlando ahora mismo: el pueblo solo murmura cuando hay una conversación
 * cercana que escuchar. */
function fillAmbientMix(out: AmbientMix, zoomIndex: number, hour: number, population: number, chatters: number): AmbientMix {
  const near = Math.max(0, Math.min(1, 1 - zoomIndex / 3));
  const daylight = Math.max(0, Math.sin(((hour - 5) / 14) * Math.PI));
  out.wind = 0.055 + (1 - near) * 0.035;
  out.birds = daylight * (0.025 + near * 0.035);
  // Una charla es una pareja: 2 voces ya bastan; la población solo modula
  // ligeramente el techo para que una villa animada se sienta más viva.
  out.murmur = near * Math.min(0.06, (chatters / 40) * (0.025 + Math.min(0.02, population / 5000)));
  return out;
}

/** Función pura para pruebas y futuras interfaces de mezcla. */
export function ambientMix(zoomIndex: number, hour: number, population: number, chatters = 0): AmbientMix {
  return fillAmbientMix({ wind: 0, birds: 0, murmur: 0 }, zoomIndex, hour, population, chatters);
}

const STORAGE_KEY = 'city-bill:audio:muted';

export class AmbientAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private birds: GainNode | null = null;
  private murmur: GainNode | null = null;
  private bellHour = -1;
  private birdTimer: number | null = null;
  // Se reutiliza en update(): el bucle de render no crea basura por frame.
  private mix: AmbientMix = { wind: 0, birds: 0, murmur: 0 };
  muted = false;
  onMuteChange: ((muted: boolean) => void) | null = null;

  constructor() {
    try { this.muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* almacenamiento opcional */ }
  }

  /** Debe llamarse desde clic o tecla: respeta la política de autoplay. */
  activate(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const Audio = window.AudioContext;
    if (!Audio) return;
    const context = new Audio();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(context.destination);
    this.wind = this.addNoise(260, 0.045);
    this.murmur = this.addNoise(720, 0.025);
    this.birds = context.createGain();
    this.birds.gain.value = 0;
    this.birds.connect(this.master);
    this.birdTimer = window.setInterval(() => this.chirp(), 9000);
  }

  update(zoomIndex: number, hour: number, population: number, chatters = 0): void {
    if (!this.context || !this.wind || !this.birds || !this.murmur) return;
    const mix = fillAmbientMix(this.mix, zoomIndex, hour, population, chatters);
    const now = this.context.currentTime;
    this.wind.gain.setTargetAtTime(mix.wind, now, 0.7);
    this.birds.gain.setTargetAtTime(mix.birds, now, 0.5);
    this.murmur.gain.setTargetAtTime(mix.murmur, now, 0.7);
    const wholeHour = Math.floor(hour);
    if (!this.muted && wholeHour !== this.bellHour && (wholeHour === 8 || wholeHour === 12 || wholeHour === 18)) {
      this.bellHour = wholeHour;
      this.bell();
    }
  }

  toggle(): void { this.setMuted(!this.muted); }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* almacenamiento opcional */ }
    if (this.context && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.08);
    this.onMuteChange?.(muted);
  }

  private addNoise(cutoff: number, initial: number): GainNode {
    const context = this.context!;
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 0x1f123bb5;
    for (let i = 0; i < data.length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      data[i] = ((state / 0x100000000) * 2 - 1) * 0.35;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.value = initial;
    source.connect(filter).connect(gain).connect(this.master!);
    source.start();
    return gain;
  }

  private chirp(): void {
    if (!this.context || !this.birds || this.muted || this.birds.gain.value < 0.002) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(1900, now + 0.12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(this.birds);
    osc.start(now); osc.stop(now + 0.17);
  }

  private bell(): void {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = 'sine'; osc.frequency.value = 740;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    osc.connect(gain).connect(this.master);
    osc.start(now); osc.stop(now + 1.45);
  }
}
