/**
 * Lógica de CONTAGIO (multiuniverso, ciclo 25 de RESEARCH.md — N2 seguridad).
 * La enfermedad real no es solo un fondo crónico (`health`, ciclo 5): es AGUDA y
 * CONTAGIOSA, se pega en el contacto social y viene en OLEADAS. Modelo tipo SIR
 * simplificado: susceptible → infectado (por encuentro con un enfermo, o un
 * brote espontáneo en el frío del invierno) → recuperado (con el tiempo, antes
 * en la clínica). Mientras dura, mella la salud y cansa (baja energía), así que
 * un frágil o un anciano lo pasa peor (acopla con salud→mortalidad, ciclo 11:
 * las epidemias se ceban en los débiles, como en la vida real).
 *
 * Deliberadamente SUAVE y RECUPERABLE: un adulto sano se cura sin morir; el
 * riesgo real es para quien ya está frágil. Así el sistema NO entra en espiral
 * de muerte, pero las oleadas se VEN. Datos puros. Acopla: social, health.
 */
import { Citizen } from './citizens/citizen';

/** Severidad al contagiarse (arranca alto y decae). */
export const SICK_ONSET = 0.8;
/** Prob. de contagio en un encuentro cara a cara con un enfermo. */
export const INFECT_CHANCE = 0.4;
/** Por encima de esto un enfermo ya contagia (los primeros compases incuban). */
export const INFECTIOUS_ABOVE = 0.15;
/** Por encima de esto uno se siente lo bastante mal como para NO pararse a
 * charlar (evita el contacto estrecho). Los casos leves/incubando (sick entre
 * INFECTIOUS_ABOVE y esto) SÍ propagan — como en la vida real. */
export const SICK_ISOLATE = 0.5;
/** Recuperación por hora en soledad: la enfermedad se pasa en ~5 días — ventana
 * infecciosa lo bastante larga para que cada enfermo contagie a >1 (oleadas). */
const RECOVERY_PER_HOUR = 1 / 120;
/** Recuperación EXTRA en la clínica (se cura mucho antes). */
export const CLINIC_RECOVERY_PER_HOUR = 1 / 10;
/** Mella en la salud por hora, proporcional a la severidad (leve: recuperable). */
const HEALTH_DRAIN_PER_HOUR = 1 / 260;
/** La fiebre cansa un poco, pero un resfriado no te tumba: sigues circulando
 * (y contagiando) — de ahí las oleadas. */
const ENERGY_DRAIN_PER_HOUR = 1 / 80;
/** Decaimiento de la inmunidad por hora: dura ~una estación (20 días) y luego
 * vuelve la susceptibilidad → nuevas oleadas (modelo SIRS). */
const IMMUNE_DECAY_PER_HOUR = 1 / 480;
/** Inmunidad que confiere la vacuna (ciclo 33): protección plena, pero decae
 * igual que la natural (IMMUNE_DECAY) → hace falta revacunar cada temporada. La
 * vacuna es prevención: da la inmunidad SIN pasar la enfermedad. */
export const VACCINE_IMMUNITY = 1;

/** Un tick de enfermedad: si está enfermo, mella salud y energía y se va
 * curando; al recuperarse queda INMUNE un tiempo. La inmunidad decae despacio.
 * Se llama SIEMPRE (como la salud/el duelo): es un fondo, no actividad. */
export function sickenTick(c: Citizen, hours: number): void {
  if (c.sick > 0) {
    c.health = Math.max(0, c.health - HEALTH_DRAIN_PER_HOUR * c.sick * hours);
    c.needs.energy = Math.max(0, c.needs.energy - ENERGY_DRAIN_PER_HOUR * c.sick * hours);
    c.sick = Math.max(0, c.sick - RECOVERY_PER_HOUR * hours);
    if (c.sick === 0) c.immune = 1; // acaba de pasarla → inmune un tiempo
  } else if (c.immune > 0) {
    c.immune = Math.max(0, c.immune - IMMUNE_DECAY_PER_HOUR * hours);
  }
}

/** Contagio en un encuentro cara a cara: si uno está infeccioso y el otro
 * SUSCEPTIBLE (ni enfermo ni inmune), puede pegárselo. Determinista. */
export function maybeInfect(a: Citizen, b: Citizen, rng: { next(): number }): void {
  if (a.sick > INFECTIOUS_ABOVE && b.sick <= 0 && b.immune <= 0 && rng.next() < INFECT_CHANCE) b.sick = SICK_ONSET;
  if (b.sick > INFECTIOUS_ABOVE && a.sick <= 0 && a.immune <= 0 && rng.next() < INFECT_CHANCE) a.sick = SICK_ONSET;
}

/** Curarse en la clínica: acelera mucho el paso de la enfermedad. */
export function treatSick(c: Citizen, hours: number): void {
  if (c.sick > 0) c.sick = Math.max(0, c.sick - CLINIC_RECOVERY_PER_HOUR * hours);
}
