/** Pruebas puras del contrato del menú de partida. */
import { DAY_GAME_SECONDS } from '../sim/clock';
import { savedDay } from './startMenu';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

check('menú: muestra el día entero guardado', savedDay(JSON.stringify({ clock: { time: DAY_GAME_SECONDS * 12.75 } })) === 12);
check('menú: un save ilegible vuelve al día cero', savedDay('{ roto') === 0);
check('menú: un reloj ausente vuelve al día cero', savedDay(JSON.stringify({ seed: 42 })) === 0);

console.log(`\nstartMenu.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
