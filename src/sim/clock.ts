/**
 * Reloj de juego. 1 día = 10 min reales a velocidad 1 (contrato §1.3).
 * El tiempo de juego avanza en pasos fijos de TICK_GAME_S por sub-tick,
 * de forma que la sim es determinista e independiente del framerate real.
 */

export const DAY_REAL_SECONDS = 600; // 10 min reales por día a velocidad 1
export const DAY_GAME_SECONDS = 86400;
export const TIME_SCALE = DAY_GAME_SECONDS / DAY_REAL_SECONDS; // 144×

/** Cadencia real del tick del worker (§1.3: 250 ms). */
export const TICK_REAL_S = 0.25;
/** Segundos de juego que avanza UN sub-tick de sim. */
export const TICK_GAME_S = TICK_REAL_S * TIME_SCALE; // 36 s de juego

export class GameClock {
  /** Segundos de juego desde el día 0 a las 00:00. */
  time = 0;
  tick = 0;

  advance(): void {
    this.time += TICK_GAME_S;
    this.tick++;
  }

  /** Hora del día en [0,24). */
  get hour(): number {
    return (this.time % DAY_GAME_SECONDS) / 3600;
  }

  get day(): number {
    return Math.floor(this.time / DAY_GAME_SECONDS);
  }

  /**
   * Factor de oscuridad [0,1]: 0 a mediodía, 1 a medianoche, transición
   * suave al amanecer/atardecer. Es LA señal para curvas de idoneidad
   * (dormir, luces, ciclo de sol T1.8) — nada de `if hora == X`.
   */
  get darkness(): number {
    const h = this.hour;
    // Coseno centrado en las 12h: -1 mediodía, +1 medianoche → [0,1].
    return (Math.cos(((h - 12) / 24) * Math.PI * 2) + 1) / 2;
  }

  /** "HH:MM" para HUD/debug. */
  get label(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
