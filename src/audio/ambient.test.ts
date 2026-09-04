import { ambientMix } from './ambient';
let failed = 0;
function check(name: string, ok: boolean): void { if (!ok) { failed++; console.error(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); }
const nearDay = ambientMix(0, 12, 100, 6);
const farNight = ambientMix(3, 1, 100, 6);
const quietVillage = ambientMix(0, 12, 100, 0);
check('mezcla: el pueblo cercano gana murmullo', nearDay.murmur > farNight.murmur);
check('mezcla: los pájaros descansan por la noche', nearDay.birds > 0 && farNight.birds === 0);
check('mezcla: el viento siempre conserva una base', nearDay.wind > 0 && farNight.wind > 0);
check('mezcla: el murmullo nace de charlas cercanas', nearDay.murmur > quietVillage.murmur && quietVillage.murmur === 0);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
