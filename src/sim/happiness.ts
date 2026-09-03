/** Felicidad por hogar (H4.3). Es una función pura: la simulación decide
 * cuándo muestrearla (en el cierre del día), pero aquí no hay reloj ni estado.
 *
 * Pesos deliberadamente explícitos para que el resultado sea legible y
 * calibrable: necesidades .35, servicios .25, impuestos .15, empleo .10,
 * salud/duelo .10 y proximidad industrial .05.
 */
import type { Needs } from './citizens/needs';
import { COVERAGE_BITS } from './coverage';
import type { CoverageMask } from './coverage';

export interface HouseholdHappinessInput {
  needs: Needs;
  /** Máscara de servicios del hogar, según COVERAGE_BITS. */
  coverage: CoverageMask;
  /** Niños en el hogar: solo ellos hacen obligatoria la educación. */
  children: number;
  /** Carga fiscal ponderada [0,1]. */
  taxBurden: number;
  /** Adultos en edad laboral sin empleo [0,1]. */
  unemployment: number;
  /** Malestar de salud [0,1], incluyendo enfermedad contagiosa. */
  illness: number;
  /** Duelo actual [0,1]. */
  grief: number;
  /** Presión industrial [0,1]; 1 significa industria a menos de seis celdas. */
  industryPressure: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function serviceScore(mask: CoverageMask, children: number): number {
  const required = [
    COVERAGE_BITS.health,
    COVERAGE_BITS.police,
    COVERAGE_BITS.fire,
    COVERAGE_BITS.park,
  ];
  if (children > 0) required.push(COVERAGE_BITS.education);
  let covered = 0;
  for (const bit of required) if ((mask & bit) !== 0) covered++;
  return covered / required.length;
}

/** Devuelve felicidad [0,1]. Aumentar cualquier condición favorable nunca
 * puede reducirla: esta propiedad es más importante que una falsa precisión. */
export function householdHappiness(input: HouseholdHappinessInput): number {
  const needValues = [input.needs.energy, input.needs.food, input.needs.social, input.needs.fun, input.needs.purpose];
  const needsScore = needValues.reduce((sum, value) => sum + clamp01(value), 0) / needValues.length;
  const services = serviceScore(input.coverage, input.children);
  const taxes = 1 - clamp01(input.taxBurden);
  const employment = 1 - clamp01(input.unemployment);
  const wellbeing = 1 - Math.max(clamp01(input.illness), clamp01(input.grief));
  const industry = 1 - clamp01(input.industryPressure);
  return clamp01(
    0.35 * needsScore +
    0.25 * services +
    0.15 * taxes +
    0.10 * employment +
    0.10 * wellbeing +
    0.05 * industry,
  );
}
