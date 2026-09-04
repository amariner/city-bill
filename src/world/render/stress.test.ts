/** Contrato del banco H2: URL segura y conjunto sintético estable. */
import { MAX_STRESS_AGENTS, makeStressAgents, stressCountFrom } from './stress';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) passed++;
  else { failed++; console.error(`  ✗ ${name}`); }
}

check('stress: sin parámetro no habilita el banco', stressCountFrom(null) === 0);
check('stress: descarta negativos y texto', stressCountFrom('-2') === 0 && stressCountFrom('nada') === 0);
check('stress: redondea un número de URL', stressCountFrom('500.9') === 500);
check('stress: acota el banco al máximo de instancias', stressCountFrom('99999') === MAX_STRESS_AGENTS);
const agents = makeStressAgents(500);
check('stress: crea el número pedido una sola vez', agents.length === 500 && agents[499].id === 499);
check('stress: son peatones visibles y deterministas', agents[0].mode === 0 && agents[0].state === 1 && agents[0].x === -6.82);

console.log(`\nstress.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
