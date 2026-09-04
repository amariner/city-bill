/** Contrato T3.6: el LOD lejano conserva las siluetas, no su microanimación. */
import { idleSway, walkingBob } from './citizens';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) passed++;
  else { failed++; console.error(`  ✗ ${name}`); }
}

check('render: caminar se anima con detalle cercano', walkingBob(0.1, 0, true) > 0);
check('render: caminar no hace bobbing en LOD lejano', walkingBob(0.1, 0, false) === 0);
check('render: espera se balancea con detalle cercano', idleSway(0.1, 0, true) !== 0);
check('render: espera no se balancea en LOD lejano', idleSway(0.1, 0, false) === 0);

console.log(`\ncitizens.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
