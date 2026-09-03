/** Máquina mínima de herramientas del jugador. La UI puede cambiar la
 * herramienta, pero la acción siempre sale por SimClient.act(). */
import type { SimClient } from '../sim/client';
import type { PlayerAction } from '../sim/protocol';
import type { Rot } from '../world/grid';
import type { PointerButton } from './pointer';

export type Tool =
  | { kind: 'none' }
  | { kind: 'place'; id: string; rot: Rot }
  | { kind: 'bulldoze' }
  | { kind: 'road'; road: 'path' | 'rural' | 'street' | 'avenue' }
  | { kind: 'zone'; zone: 'R' | 'C' | 'I' | 'A' | 'P' | null };

export class ToolState {
  private tool: Tool = { kind: 'none' };
  onChange: ((tool: Tool) => void) | null = null;

  constructor(private sim: Pick<SimClient, 'act'>) {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        this.set({ kind: 'place', id: 'cottage', rot: 0 });
      } else if (key === 'x') {
        e.preventDefault();
        this.set({ kind: 'bulldoze' });
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
    } else {
      return null;
    }
    return this.sim.act(action);
  }

  handleDrag(_cell: [number, number], _button: PointerButton): void {
    // Las herramientas de arrastre (vías/zonas) se habilitan en H2.
  }
}
