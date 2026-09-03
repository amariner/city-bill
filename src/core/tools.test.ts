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
tools.set({ kind: 'road', road: 'rural', from: null });
check('la vía espera un punto de origen', tools.handleClick([2, 3]) === null && tools.active.kind === 'road' && tools.active.from?.join() === '2,3');
check('el segundo clic emite una L reproducible', tools.handleClick([8, 5]) === 3 && sent[2]?.kind === 'road' && sent[2]?.from.join() === '2,3' && sent[2]?.to.join() === '8,5');
tools.set({ kind: 'road', road: 'path', from: null });
tools.handleDragStart([-1, -1], 'left');
check('el arrastre fija el origen', tools.active.kind === 'road' && tools.active.from?.join() === '-1,-1');
check('fin de arrastre emite road', tools.handleDragEnd([3, 4], 'left') === 4 && sent[3]?.kind === 'road' && sent[3]?.road === 'path');
tools.set({ kind: 'zone', zone: 'C', from: null, erase: false });
tools.handleDragStart([1, 2], 'left');
check('la zona fija el origen al arrastrar', tools.active.kind === 'zone' && tools.active.from?.join() === '1,2');
check('la zona emite un rectángulo normalizado', tools.handleDragEnd([-2, 5], 'left') === 5 && sent[4]?.kind === 'zone' && sent[4]?.x0 === -2 && sent[4]?.z0 === 2 && sent[4]?.x1 === 1 && sent[4]?.z1 === 5);
tools.set({ kind: 'busLine', stops: [] });
check('la línea: el primer clic fija una parada', tools.handleClick([2, 2]) === null && tools.active.kind === 'busLine' && tools.active.stops.length === 1);
check('la línea: evita duplicar una parada', tools.handleClick([2, 2]) === null && tools.active.kind === 'busLine' && tools.active.stops.length === 1);
tools.handleClick([6, 2]);
tools.handleClick([6, 6]);
const lineSeq = tools.finishBusLine();
check('la línea: Enter emite busLine y cancela la herramienta', lineSeq === 6 && sent[5]?.kind === 'busLine' && sent[5]?.op === 'create' && !tools.isActive);

console.log(`\ntools.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
