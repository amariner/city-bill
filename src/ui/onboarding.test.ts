import { ONBOARDING_STORAGE_KEY, ONBOARDING_TIPS, onboardingSeen } from './onboarding';

let failed = 0;
function check(name: string, ok: boolean): void {
  if (ok) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}`); }
}

check('onboarding: ofrece cuatro pistas, dentro del máximo del MVP', ONBOARDING_TIPS.length === 4);
check('onboarding: cada pista tiene identidad propia', new Set(ONBOARDING_TIPS.map((tip) => tip.key)).size === ONBOARDING_TIPS.length);
check('onboarding: solo la marca explícita oculta la guía', onboardingSeen('done') && !onboardingSeen(null) && !onboardingSeen('otro'));
check('onboarding: la clave de memoria está versionada', ONBOARDING_STORAGE_KEY.endsWith(':v1'));
if (failed > 0) throw new Error(`${failed} test(s) failed`);
