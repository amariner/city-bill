import { roofSnowAmount } from './buildings';

let failed = 0;
function check(name: string, ok: boolean): void {
  if (ok) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}`); }
}

check('nieve de tejado: invierno pleno cubre la cubierta', roofSnowAmount(-1) === 1);
check('nieve de tejado: verano no blanquea la cubierta', roofSnowAmount(1) === 0);
check('nieve de tejado: el cruce es continuo y acotado', Math.abs(roofSnowAmount(-0.35) - 0.35) < 1e-9 && roofSnowAmount(-9) === 1 && roofSnowAmount(NaN) === 0);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
