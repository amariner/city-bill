/** Máquina mínima de herramientas del jugador. La UI puede cambiar la
 * herramienta, pero la acción siempre sale por SimClient.act(). */
import type { SimClient } from '../sim/client';
import type { PlayerAction, ZoneKind } from '../sim/protocol';
import type { Rot } from '../world/grid';
import type { CellXZ } from '../sim/geometry';
import type { PointerButton } from './pointer';

export type Tool =
  | { kind: 'none' }
  | { kind: 'place'; id: string; rot: Rot }
  | { kind: 'bulldoze' }
  | { kind: 'road'; road: 'path' | 'rural' | 'street' | 'avenue'; from: CellXZ | null }
  | { kind: 'zone'; zone: ZoneKind; from: CellXZ | null; erase: boolean };

export class ToolState {
  private tool: Tool = { kind: 'none' };
  private shiftDown = false;
  onChange: ((tool: Tool) => void) | null = null;

  constructor(private sim: Pick<SimClient, 'act'>) {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'shift') {
        if (!this.shiftDown) {
          this.shiftDown = true;
          if (this.tool.kind === 'zone') this.set({ ...this.tool, erase: true });
        }
        return;
      }
      if (key === 'b') {
        e.preventDefault();
        this.set({ kind: 'place', id: 'cottage', rot: 0 });
      } else if (key === 'x') {
        e.preventDefault();
        this.set({ kind: 'bulldoze' });
      } else if (key === 'r') {
        e.preventDefault();
        this.set({ kind: 'road', road: 'rural', from: null });
      } else if (key === 'z') {
        e.preventDefault();
        this.set({ kind: 'zone', zone: 'R', from: null, erase: this.shiftDown });
      } else if (key === 'tab' && this.tool.kind === 'place') {
        e.preventDefault();
        this.rotate();
      } else if (key === 'escape') {
        if (this.tool.kind !== 'none') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.cancel();
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() !== 'shift') return;
      this.shiftDown = false;
      if (this.tool.kind === 'zone') this.set({ ...this.tool, erase: false });
    });
  }

  get active(): Tool {
    return this.tool;
  }

  get isActive(): boolean {
    return this.tool.kind !== 'none';
  }

  set(tool: Tool): void {
    this.tool = tool;
    this.onChange?.(tool);
  }

  cancel(): void {
    this.set({ kind: 'none' });
  }

  rotate(): void {
    if (this.tool.kind !== 'place') return;
    this.set({ ...this.tool, rot: ((this.tool.rot + 1) % 4) as Rot });
  }

  handleClick(cell: [number, number], button: PointerButton = 'left'): number | null {
    if (button !== 'left') return null;
    let action: PlayerAction;
    if (this.tool.kind === 'place') {
      action = { kind: 'place', id: this.tool.id, cx: cell[0], cz: cell[1], rot: this.tool.rot };
    } else if (this.tool.kind === 'bulldoze') {
      action = { kind: 'bulldoze', cx: cell[0], cz: cell[1] };
    } else if (this.tool.kind === 'road') {
      if (!this.tool.from) {
        this.set({ ...this.tool, from: [...cell] });
        return null;
      }
      action = { kind: 'road', road: this.tool.road, from: [...this.tool.from], to: [...cell] };
      this.set({ ...this.tool, from: null });
    } else if (this.tool.kind === 'zone') {
      if (!this.tool.from) {
        this.set({ ...this.tool, from: [...cell] });
        return null;
      }
      action = {
        kind: 'zone',
        zone: this.tool.erase ? null : this.tool.zone,
        x0: Math.min(this.tool.from[0], cell[0]),
        z0: Math.min(this.tool.from[1], cell[1]),
        x1: Math.max(this.tool.from[0], cell[0]),
        z1: Math.max(this.tool.from[1], cell[1]),
      };
      this.set({ ...this.tool, from: null });
    } else {
      return null;
    }
    return this.sim.act(action);
  }

  handleDragStart(cell: [number, number], button: PointerButton): void {
    if (button !== 'left' || (this.tool.kind !== 'road' && this.tool.kind !== 'zone') || this.tool.from) return;
    this.set({ ...this.tool, from: [...cell] });
  }

  handleDrag(_cell: [number, number], _button: PointerButton): void {
    // El destino lo mantiene Pointer en hover; no hace falta mutar la máquina
    // por cada píxel del arrastre.
  }

  handleDragEnd(cell: [number, number], button: PointerButton): number | null {
    if (button !== 'left' || (this.tool.kind !== 'road' && this.tool.kind !== 'zone') || !this.tool.from) return null;
    const action: PlayerAction = this.tool.kind === 'road'
      ? { kind: 'road', road: this.tool.road, from: [...this.tool.from], to: [...cell] }
      : {
        kind: 'zone',
        zone: this.tool.erase ? null : this.tool.zone,
        x0: Math.min(this.tool.from[0], cell[0]),
        z0: Math.min(this.tool.from[1], cell[1]),
        x1: Math.max(this.tool.from[0], cell[0]),
        z1: Math.max(this.tool.from[1], cell[1]),
      };
    this.set({ ...this.tool, from: null });
    return this.sim.act(action);
  }
}
