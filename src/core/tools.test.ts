/** Prueba headless de la máquina de herramientas (sin DOM ni THREE). */
import { ToolState } from './tools';
import type { PlayerAction } from '../sim/protocol';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) passed++;
  else { failed++; console.error(`  ✗ ${name}`); }
}

const sent: PlayerAction[] = [];
const tools = new ToolState({ act(action): number { sent.push(action); return sent.length; } });
check('la herramienta empieza desactivada', !tools.isActive && tools.active.kind === 'none');
tools.set({ kind: 'place', id: 'cottage', rot: 0 });
tools.rotate();
check('Tab/rotate gira la huella', tools.active.kind === 'place' && tools.active.rot === 1);
check('clic de construir sale por SimClient.act', tools.handleClick([4, 7]) === 1 && sent[0]?.kind === 'place' && sent[0].rot === 1);
tools.set({ kind: 'bulldoze' });
check('clic de demoler emite bulldoze', tools.handleClick([4, 7]) === 2 && sent[1]?.kind === 'bulldoze');
tools.cancel();
check('cancelar vuelve a none', !tools.isActive);

console.log(`\ntools.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
