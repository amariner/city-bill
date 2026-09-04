import { MAX_PRE_GROW_DAYS, preGrowDaysFrom } from './preGrow';

let failed = 0;
function check(name: string, ok: boolean): void {
  if (ok) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}`); }
}

check('preGrow: un entero positivo se conserva', preGrowDaysFrom('42') === 42);
check('preGrow: redondea hacia abajo días parciales', preGrowDaysFrom('7.9') === 7);
check('preGrow: ausente, negativo o ilegible arrancan en día cero', preGrowDaysFrom(null) === 0 && preGrowDaysFrom('-3') === 0 && preGrowDaysFrom('x') === 0);
check('preGrow: limita la maduración para la URL', preGrowDaysFrom('999999') === MAX_PRE_GROW_DAYS);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
