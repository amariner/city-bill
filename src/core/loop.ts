/**
 * Bucle de juego. Separa `update(dt)` (lógica de cámara/animación) del render,
 * y expone un delta en segundos. El tick de simulación va aparte, en el worker.
 */
export type UpdateFn = (dt: number) => void;

export class GameLoop {
  private last = 0;
  private updates: UpdateFn[] = [];

  constructor(private render: () => void) {}

  onUpdate(fn: UpdateFn): void {
    this.updates.push(fn);
  }

  start(): void {
    const tick = (now: number) => {
      const dt = this.last === 0 ? 0 : Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      for (const u of this.updates) u(dt);
      this.render();
    };
    // requestAnimationFrame vía three no está aquí; usamos rAF directo.
    const frame = (now: number) => {
      tick(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
