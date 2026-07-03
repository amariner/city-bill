/**
 * Captura de entrada cruda (ratón, rueda, teclado, táctil) y su traducción a
 * "intents" que el controlador de cámara consume. Aquí NO hay lógica de juego:
 * solo estado de dispositivos y deltas acumulados.
 */
export class Input {
  private keys = new Set<string>();
  private dragging = false;
  /** Desplazamiento de arrastre acumulado desde el último consumo (px). */
  dragDX = 0;
  dragDY = 0;
  /** Pasos de zoom pendientes (rueda): + acerca, − aleja. */
  private zoomQueue = 0;
  /** Pasos de rotación pendientes (Q/E). */
  private rotateQueue = 0;

  constructor(target: HTMLElement) {
    target.addEventListener('contextmenu', (e) => e.preventDefault());

    target.addEventListener('pointerdown', (e) => {
      // Botón izquierdo, central o derecho arrastran.
      this.dragging = true;
      target.setPointerCapture(e.pointerId);
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragDX += e.movementX;
      this.dragDY += e.movementY;
    });
    const endDrag = (e: PointerEvent) => {
      this.dragging = false;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    };
    target.addEventListener('pointerup', endDrag);
    target.addEventListener('pointercancel', endDrag);

    target.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // Rueda arriba (deltaY<0) acerca → índice menor (viewSize menor).
        this.zoomQueue += e.deltaY < 0 ? -1 : 1;
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'q') this.rotateQueue -= 1;
      else if (k === 'e') this.rotateQueue += 1;
      else this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Vector de desplazamiento por teclado (WASD / flechas), normalizado a [-1,1]. */
  keyboardPan(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    return { x, y };
  }

  /** Devuelve y limpia el arrastre acumulado. */
  consumeDrag(): { dx: number; dy: number } {
    const d = { dx: this.dragDX, dy: this.dragDY };
    this.dragDX = 0;
    this.dragDY = 0;
    return d;
  }

  consumeZoom(): number {
    const z = this.zoomQueue;
    this.zoomQueue = 0;
    return z;
  }

  consumeRotate(): number {
    const r = this.rotateQueue;
    this.rotateQueue = 0;
    return r;
  }
}
