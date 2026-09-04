/** Contratos del crossfade estacional T5.1: continuo y periódico. */
import { DAYS_PER_SEASON, DAYS_PER_YEAR, seasonalPaletteBlend } from './weather';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) passed++;
  else { failed++; console.error(`  ✗ ${name}`); }
}

const winterStart = seasonalPaletteBlend(0);
const winterMid = seasonalPaletteBlend(DAYS_PER_SEASON / 2);
const springStart = seasonalPaletteBlend(DAYS_PER_SEASON);
const repeated = seasonalPaletteBlend(DAYS_PER_YEAR + 7.5);
const canonical = seasonalPaletteBlend(7.5);

check('paleta: invierno arranca en su propio tono', winterStart.from === 'invierno' && winterStart.to === 'primavera' && winterStart.mix === 0);
check('paleta: el cruce progresa dentro de la estación', winterMid.mix === 0.5);
check('paleta: el límite conserva el color y cambia de pareja', springStart.from === 'primavera' && springStart.mix === 0);
check('paleta: el calendario es periódico', repeated.from === canonical.from && repeated.to === canonical.to && repeated.mix === canonical.mix);

console.log(`\nweather.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
