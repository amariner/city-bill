/** Mismo contacto, mismos vecinos: comprueba el acoplamiento real social → contagio. */
import { SocialSystem } from './citizens/social';
import type { Citizen } from './citizens/citizen';
import { SICK_ISOLATE, SICK_ONSET } from './contagion';
import { createRng } from '../rng';

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}
function encounter(quarantine: boolean, sick: number, sickId: 1 | 2) {
  function person(id: number): Citizen {
    return {
      id, x: id, z: 0, sick: id === sickId ? sick : 0, immune: 0, grief: 0,
      needs: { energy: 1, food: 1, social: 0.2, fun: 1, purpose: 1 },
      personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
      friends: new Map(), lastChatTick: -1000,
    } as Citizen;
  }
  const a = person(1), b = person(2);
  SocialSystem.acquaint(a, b);
  const rng = createRng(99);
  rng.next = () => 0; // todo contacto infeccioso contagia; aislamos la oportunidad de contacto
  const social = new SocialSystem(rng);
  const pairs = social.detectEncounters([a, b], 1000, quarantine);
  social.advance(new Map([[a.id, a], [b.id, b]]), 1001);
  return { contacts: pairs.length, infected: (sickId === 1 ? b : a).sick > 0 };
}
for (const sickId of [1, 2] as const) {
  const on = encounter(true, SICK_ONSET, sickId);
  const off = encounter(false, SICK_ONSET, sickId);
  check(on.contacts === 0 && !on.infected, 'la cuarentena evita el contacto del enfermo grave en ambos órdenes del par');
  check(off.contacts === 1 && off.infected, 'sin cuarentena ese mismo contacto transmite la enfermedad');
  check(encounter(true, 0, sickId).contacts === 1, 'los sanos conservan la interacción');
  check(encounter(true, SICK_ISOLATE, sickId).contacts === 1, 'los casos leves siguen circulando hasta el umbral');
}
console.log('quarantine.test: contactos, transmisión, sanos y umbral en ambos órdenes passed');
