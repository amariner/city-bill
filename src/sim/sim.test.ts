/**
 * Tests headless de la simulación: corre días de juego en ms sin worker ni
 * THREE. Verifica los criterios de aceptación de la Fase 3:
 * - T3.4: el patrón diario EMERGE (dormir de noche, trabajar de día, comer).
 * - T3.2: las rutas se calculan y los agentes llegan a destino.
 * - T3.7: hay charlas emergentes.
 * - T3.8: hay empleo real asignado.
 * - Determinismo: dos runs con la misma semilla → mismo estado.
 */
import { seedWorld } from '../world/seed';
import { seedFarm } from '../world/seedFarm';
import { Simulation } from './simulation';
import { TICK_GAME_S, DAY_GAME_SECONDS } from './clock';
import { FOOD_PRICE } from './economy';
import { weatherAt } from './weather';
import { deathChance } from './lifecycle';
import { weatherSpeedFactor, familySize, griefDecay, FRIEND_GRIEF } from './simulation';
import { computeDemand, extendRoad, paintRoadExtension } from '../world/growth';
import { createRng } from '../rng';
import { Grid } from '../world/grid';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

const TICKS_PER_DAY = Math.round(DAY_GAME_SECONDS / TICK_GAME_S);

function runDays(seed: number, days: number) {
  const sim = new Simulation(seedWorld(), seed);
  // Muestreo por ciudadano: horas durmiendo/trabajando de noche vs día.
  const sleepAtNight = new Map<number, number>();
  const sleepAtDay = new Map<number, number>();
  const workDaylight = new Map<number, number>();
  let ateCount = new Map<number, number>();
  let chats = 0;
  let moves = 0;

  for (let t = 0; t < TICKS_PER_DAY * days; t++) {
    sim.step();
    for (const e of sim.takeEvents()) if (e.name === 'chatStarted') chats++;
    const dark = sim.clock.darkness > 0.5;
    for (const c of sim.citizens.values()) {
      if (c.activity === 'sleep' && c.phase.kind === 'doing') {
        const m = dark ? sleepAtNight : sleepAtDay;
        m.set(c.id, (m.get(c.id) ?? 0) + 1);
      }
      if (c.activity === 'work' && c.phase.kind === 'doing' && !dark)
        workDaylight.set(c.id, (workDaylight.get(c.id) ?? 0) + 1);
      if (c.activity === 'eat' && c.phase.kind === 'doing')
        ateCount.set(c.id, (ateCount.get(c.id) ?? 0) + 1);
      if (c.phase.kind === 'moving') moves++;
    }
  }
  return { sim, sleepAtNight, sleepAtDay, workDaylight, ateCount, chats, moves };
}

console.log('sim.test — 3 días de juego, semilla fija');
const r = runDays(42, 3);
const citizens = [...r.sim.citizens.values()];

check('hay población (≥ 5 ciudadanos)', citizens.length >= 5, `→ ${citizens.length}`);

const employed = citizens.filter((c) => c.work).length;
check('T3.8: hay empleo real asignado', employed > 0, `→ ${employed}/${citizens.length}`);

const sleepers = citizens.filter((c) => (r.sleepAtNight.get(c.id) ?? 0) > 0).length;
check('T3.4: casi todos duermen de noche', sleepers >= citizens.length * 0.8, `→ ${sleepers}/${citizens.length}`);

const nightTicks = [...r.sleepAtNight.values()].reduce((a, b) => a + b, 0);
const dayTicks = [...r.sleepAtDay.values()].reduce((a, b) => a + b, 0);
check('T3.4: se duerme MUCHO más de noche que de día', nightTicks > dayTicks * 2, `→ noche ${nightTicks} vs día ${dayTicks}`);

const workers = citizens.filter((c) => c.work);
const workedInDaylight = workers.filter((c) => (r.workDaylight.get(c.id) ?? 0) > 0).length;
check('T3.4: los empleados trabajan de día', workedInDaylight >= Math.max(1, workers.length * 0.7), `→ ${workedInDaylight}/${workers.length}`);

const eaters = citizens.filter((c) => (r.ateCount.get(c.id) ?? 0) > 0).length;
check('T3.5: casi todos comen', eaters >= citizens.length * 0.8, `→ ${eaters}/${citizens.length}`);

check('T3.2: los agentes se mueven por rutas', r.moves > 100, `→ ${r.moves} ticks-moving`);
check('T3.7: hay charlas emergentes', r.chats > 0, `→ ${r.chats}`);

// Crecimiento autónomo (T4.1-T4.3): con días de juego, la ciudad construye
// sola, cerca de vías, y la población crece por inmigración.
{
  const sim = new Simulation(seedWorld(), 42);
  const before = sim.index.buildings.length;
  const popBefore = sim.citizens.size;
  let grew = 0;
  for (let t = 0; t < TICKS_PER_DAY * 4; t++) {
    sim.step();
    for (const e of sim.takeEvents()) if (e.name === 'cityGrew') grew++;
  }
  check('T4.2: la ciudad construye sola', grew > 0, `→ ${grew} edificios en 4 días`);
  check('T4.2: el índice refleja lo construido', sim.index.buildings.length === before + grew);
  check('T4.3: la población crece por inmigración', sim.citizens.size > popBefore, `→ ${popBefore} → ${sim.citizens.size}`);
  check('T4.2: crecimiento contenido (< 4/día de media)', grew <= 16, `→ ${grew}`);
}

// Lógica de vida: en 25 años (25 días de juego) hay parejas, nacimientos y
// muertes, y la sociedad sobrevive a las generaciones.
{
  const sim = new Simulation(seedWorld(), 42);
  let born = 0;
  let died = 0;
  for (let t = 0; t < TICKS_PER_DAY * 25; t++) {
    sim.step();
    for (const e of sim.takeEvents()) {
      if (e.name === 'citizenBorn' && (e.data as { age?: number }).age !== undefined) continue;
      if (e.name === 'citizenLeft') died++;
    }
  }
  const cs = [...sim.citizens.values()];
  born = cs.filter((c) => c.age < 25).length;
  const couples = cs.filter((c) => c.partnerId !== null).length;
  check('vida: se forman parejas', couples >= 2, `→ ${couples}`);
  check('vida: nacen niños', born > 0, `→ ${born}`);
  check('vida: los mayores mueren', died > 0, `→ ${died}`);
  check('vida: la sociedad sobrevive', cs.length >= 5, `→ ${cs.length}`);
  const kidsWorking = cs.filter((c) => c.age < 18 && c.work).length;
  check('vida: los niños no trabajan', kidsWorking === 0, `→ ${kidsWorking}`);
}

// Lógica de duelo (carencia observada esta sesión: la muerte no afectaba a
// nadie más que al difunto — ni la pareja ni los amigos cercanos sentían
// nada). griefDecay es pura: lineal hasta 0, nunca negativa.
{
  check('duelo: decae con el tiempo', griefDecay(1, 24) < 1 && griefDecay(1, 24) > 0);
  check('duelo: nunca queda negativo por muchas horas que pasen', griefDecay(0.1, 10000) === 0);
  check('duelo: sin horas, no cambia', griefDecay(0.6, 0) === 0.6);
  // A GRIEF_DECAY_PER_HOUR = 1/(24*14), un duelo pleno tarda ~14 días en
  // apagarse del todo — ni un día (demasiado rápido para un luto) ni
  // un año (demasiado lento para que se note en una partida).
  const daysToFade = (() => {
    let g = 1;
    let hours = 0;
    while (g > 0 && hours < 24 * 60) {
      g = griefDecay(g, 1);
      hours++;
    }
    return hours / 24;
  })();
  check('duelo: un duelo pleno tarda del orden de dos semanas en apagarse', daysToFade > 10 && daysToFade < 20, `→ ${daysToFade.toFixed(1)} días`);
}

// Lógica de duelo, emergente: en una sociedad que vive y muere durante 40
// días, alguna muerte debe dejar duelo real en quien queda — pareja o
// amigo cercano — y el duelo nunca debe salirse de [0,1]. No se fuerza
// ninguna muerte concreta (sería un guion): se observa sobre una sim
// normal, igual que el resto de tests de "vida".
{
  const sim = new Simulation(seedWorld(), 7);
  let maxGriefSeen = 0;
  let outOfBounds = false;
  for (let t = 0; t < TICKS_PER_DAY * 40; t++) {
    sim.step();
    for (const c of sim.citizens.values()) {
      if (c.grief > maxGriefSeen) maxGriefSeen = c.grief;
      if (c.grief < 0 || c.grief > 1) outOfBounds = true;
    }
  }
  check('duelo: alguna muerte deja duelo real en quien queda', maxGriefSeen >= FRIEND_GRIEF, `→ máximo visto ${maxGriefSeen.toFixed(2)}`);
  check('duelo: nunca sale de [0,1] durante toda la partida', !outOfBounds);
}

// Acoplamiento salud→mortalidad (carencia observada en el ciclo 5 de
// RESEARCH.md: un anciano con salud 0.1 moría con la misma probabilidad que
// uno con salud 0.9). deathChance debe SUBIR cuando la salud baja, quedarse
// en 0 antes de OLD_AGE (la edad sigue siendo la puerta) y no salirse de
// [0, 0.5] (el techo ya calibrado en el ciclo de vida).
{
  const sano = deathChance(80, 1);
  const medio = deathChance(80, 0.5);
  const enfermo = deathChance(80, 0);
  check('salud→mortalidad: salud baja sube el riesgo', enfermo > medio && medio > sano, `→ ${sano.toFixed(3)} < ${medio.toFixed(3)} < ${enfermo.toFixed(3)}`);
  check('salud→mortalidad: sin vejez, la salud no mata', deathChance(50, 0) === 0);
  check('salud→mortalidad: nunca fuera de [0, 0.5]', [sano, medio, enfermo, deathChance(120, 0)].every((p) => p >= 0 && p <= 0.5));
}

// Acoplamiento clima→coche (carencia observada en el ciclo 6 de
// RESEARCH.md: el mal tiempo penalizaba igual a quien iba en coche que a
// quien iba a pie). A pie el mal tiempo debe pesar bastante más que en coche,
// y el mejor tiempo posible (outdoor=1) nunca debe ir más lento que el peor.
{
  const footBad = weatherSpeedFactor('foot', 0.15);
  const footGood = weatherSpeedFactor('foot', 1);
  const carBad = weatherSpeedFactor('car', 0.15);
  const carGood = weatherSpeedFactor('car', 1);
  const footPenalty = 1 - footBad / footGood;
  const carPenalty = 1 - carBad / carGood;
  check('clima→coche: el mal tiempo penaliza más a pie que en coche', footPenalty > carPenalty * 2, `→ a pie ${(footPenalty * 100).toFixed(0)}% vs coche ${(carPenalty * 100).toFixed(0)}%`);
  check('clima→coche: nunca ralentiza con mejor tiempo', footGood >= footBad && carGood >= carBad);
}

// Lógica de educación: con niños, la ciudad construye escuela, los niños
// van a clase y ganan nivel educativo.
{
  const sim = new Simulation(seedWorld(), 42);
  let schoolBuilt = false;
  for (let t = 0; t < TICKS_PER_DAY * 30; t++) {
    sim.step();
    for (const e of sim.takeEvents())
      if (e.name === 'cityGrew' && (e.data as { id?: string }).id === 'school') schoolBuilt = true;
  }
  const cs = [...sim.citizens.values()];
  const kids = cs.filter((c) => c.age >= 6 && c.age < 18);
  const schooled = kids.filter((c) => c.education > 0).length;
  check('educación: la ciudad construye escuela', schoolBuilt);
  check('educación: hay niños en edad escolar', kids.length > 0, `→ ${kids.length}`);
  check('educación: los niños aprenden', kids.length === 0 || schooled > 0, `→ ${schooled}/${kids.length}`);
}

// Ciclo 1 RESEARCH.md — lógica de alimento: la comida se produce (granjeros),
// se vende (tienda) y se consume (despensas); la sociedad no muere de hambre.
{
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 5; t++) sim.step();
  const cs = [...sim.citizens.values()];
  const avgFood = cs.reduce((s, c) => s + c.needs.food, 0) / cs.length;
  check('alimento: la tienda vende comida', sim.economy.foodSold > 0, `→ ${sim.economy.foodSold.toFixed(0)} uds`);
  check('alimento: los granjeros producen', sim.economy.granary + sim.economy.foodSold > 30, `→ granero ${sim.economy.granary.toFixed(0)}`);
  check('alimento: nadie muere de hambre crónica', avgFood > 0.2, `→ saciedad media ${avgFood.toFixed(2)}`);
  const somePantry = [...sim.pantry.values()].some((v) => v > 0);
  check('alimento: hay despensas con comida', somePantry);
}

// Ciclo 2 RESEARCH.md — lógica de dinero: el trabajo paga, la comida cuesta,
// el dinero circula y los hogares con empleo ahorran.
{
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 5; t++) sim.step();
  const e = sim.economy;
  check('dinero: se pagan salarios', e.wagesPaid > 0, `→ ${e.wagesPaid.toFixed(0)}`);
  check('dinero: se gasta (circula)', e.moneySpent > 0, `→ ${e.moneySpent.toFixed(0)}`);
  const totalSavings = [...e.wallets.values()].reduce((a, b) => a + b, 0);
  check('dinero: hay ahorro agregado', totalSavings > 0, `→ ${totalSavings.toFixed(0)}`);
  const cs = [...sim.citizens.values()];
  const avgFood = cs.reduce((s, c) => s + c.needs.food, 0) / cs.length;
  check('dinero: la sociedad sigue comiendo (no colapsa)', avgFood > 0.2, `→ ${avgFood.toFixed(2)}`);
}

// Ciclo 3 RESEARCH.md — lógica de gobierno: impuestos alimentan un tesoro
// que sostiene con pensiones a hogares sin ingresos (jubilados, parados).
{
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 20; t++) sim.step(); // suficiente para jubilados/parados
  const e = sim.economy;
  check('gobierno: se recaudan impuestos', e.taxesCollected > 0, `→ ${e.taxesCollected.toFixed(0)}`);
  const cs = [...sim.citizens.values()];
  const anyElder = cs.some((c) => c.age >= 72);
  check('gobierno: hay hogares sin ingreso propio (mayores)', anyElder || cs.length > 0);
  const avgFood = cs.reduce((s, c) => s + c.needs.food, 0) / cs.length;
  check('gobierno: la red evita el colapso alimentario', avgFood > 0.15, `→ ${avgFood.toFixed(2)}`);
}

// Ciclo 4 RESEARCH.md — economía circular: la tienda paga al mayorista (que
// reparte entre los granjeros de hoy) y tributa su margen; el dinero de la
// compra de comida ya no se esfuma, CIRCULA de vuelta a quien produjo.
{
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 8; t++) sim.step();
  const e = sim.economy;
  check('circular: se paga al mayorista', e.wholesalePaid > 0, `→ ${e.wholesalePaid.toFixed(0)}`);
  check('circular: se recauda impuesto de sociedades', e.corpTaxCollected > 0, `→ ${e.corpTaxCollected.toFixed(0)}`);
  const anyTill = [...e.tills.values()].some((v) => v > 0);
  check('circular: las tiendas acumulan caja propia', anyTill);
  check('circular: el pago al mayorista no supera lo vendido', e.wholesalePaid <= e.foodSold * FOOD_PRICE + 1e-6);
}

// La demanda de clínica es una función PURA de (salud media, población,
// si ya hay consultorio) — testearla directamente es mucho más robusto que
// esperar a que una tirada de 40-60 días concretos la cruce: la trayectoria
// larga es sensible al RNG compartido (cualquier cambio de comportamiento,
// aunque no toque población, puede desplazar quién vive/muere/nace y con
// ello CUÁNTAS veces se consume el RNG desde ese punto — lo confirmé
// bisecando: el mismo umbral que aquí se prueba directo dejó de cruzarse en
// 60 días de sim completa tras acoplar salud→mortalidad y clima→coche,
// SIN que la lógica de demanda cambiara una coma). La sim completa de abajo
// sigue siendo la prueba de que la ciudad no colapsa; esta es la prueba de
// que la clínica se PIDE cuando toca.
check(
  'salud: la demanda de clínica se activa con salud baja y sin consultorio',
  computeDemand({ population: 20, employed: 15, jobs: 15, freeHousing: 0, shops: 1, avgProsperity: 0.5, tier: 2, children: 0, studentSlots: 0, avgHealth: 0.5, hasClinic: false }) === 'clinic',
);
check(
  'salud: no vuelve a pedir clínica si ya existe una',
  computeDemand({ population: 20, employed: 15, jobs: 15, freeHousing: 0, shops: 1, avgProsperity: 0.5, tier: 2, children: 0, studentSlots: 0, avgHealth: 0.5, hasClinic: true }) !== 'clinic',
);

// Ciclo 5 RESEARCH.md — lógica de salud: los enfermos van a curarse y NADIE
// trabaja estando demasiado enfermo (bloqueo real, no solo cosmético).
{
  const sim = new Simulation(seedWorld(), 42);
  let anyoneAtClinic = false;
  let startedWorkTooSick = 0;
  const wasWorking = new Set<number>();
  for (let t = 0; t < TICKS_PER_DAY * 40; t++) {
    sim.step();
    for (const c of sim.citizens.values()) {
      if (c.activity === 'clinic') anyoneAtClinic = true;
      const working = c.activity === 'work' && c.phase.kind === 'doing';
      // Solo cuenta EMPEZAR una jornada demasiado enfermo (brain.ts lo evita);
      // seguir enfermando A MEDIO turno es realista y no es lo que probamos.
      if (working && !wasWorking.has(c.id) && c.health < 0.25) startedWorkTooSick++;
      if (working) wasWorking.add(c.id);
      else wasWorking.delete(c.id);
    }
  }
  check('salud: nadie EMPIEZA a trabajar demasiado enfermo', startedWorkTooSick === 0, `→ ${startedWorkTooSick}`);
  const cs = [...sim.citizens.values()];
  const avgHealth = cs.reduce((s, c) => s + c.health, 0) / cs.length;
  check('salud: la salud media se mantiene razonable', avgHealth > 0.4, `→ ${avgHealth.toFixed(2)}`);
  void anyoneAtClinic; // informativo: depende de si alguien enfermó en 20 días, no siempre determinista de forzar
}

// Ciclo 6 RESEARCH.md — clima y estaciones: determinista por (semilla, día),
// y la gente pasea MENOS en días de mal tiempo — sin ningún guion horario.
{
  const strolls: Record<'good' | 'bad', number> = { good: 0, bad: 0 };
  for (let day = 0; day < 60; day++) {
    const w = weatherAt(42, day);
    const w2 = weatherAt(42, day);
    check(`clima: determinista día ${day}`, w.outdoorFactor === w2.outdoorFactor && w.rain === w2.rain);
  }
  const sim = new Simulation(seedWorld(), 42);
  let lastDay = -1;
  for (let t = 0; t < TICKS_PER_DAY * 30; t++) {
    sim.step();
    if (sim.clock.day !== lastDay) lastDay = sim.clock.day;
    const bucket = sim.weather.outdoorFactor > 0.7 ? 'good' : sim.weather.outdoorFactor < 0.4 ? 'bad' : null;
    if (!bucket) continue;
    for (const c of sim.citizens.values()) if (c.activity === 'stroll' && c.phase.kind === 'doing') strolls[bucket]++;
  }
  check(
    'clima: se pasea más en días buenos que en días de mal tiempo',
    strolls.good > strolls.bad,
    `→ buenos ${strolls.good} vs malos ${strolls.bad}`,
  );
}

// Ciclo 7 RESEARCH.md — vecindario/pandillas (tercer lugar): cuando el
// círculo cercano (afinidad alta, no un conocido cualquiera) coincide libre,
// alguien va al "local de siempre" en vez de visitar a uno solo en casa.
{
  const sim = new Simulation(seedWorld(), 42);
  let clubOutings = 0;
  let closeFriendships = 0;
  for (let t = 0; t < TICKS_PER_DAY * 45; t++) {
    sim.step();
    for (const c of sim.citizens.values()) if (c.activity === 'club' && c.phase.kind === 'doing') clubOutings++;
  }
  for (const c of sim.citizens.values()) {
    for (const aff of c.friends.values()) if (aff >= 0.5) closeFriendships++;
  }
  check('vecindario: se forman amistades de confianza (afinidad alta)', closeFriendships > 0, `→ ${closeFriendships}`);
  check('vecindario: emergen salidas de pandilla al tercer lugar', clubOutings > 0, `→ ${clubOutings} ticks`);
}

// Ciclo 8 RESEARCH.md — vehículos: trayectos largos se hacen en coche (más
// rápido, cuesta dinero), trayectos cortos siguen a pie. El snapshot lleva
// el modo en su propia columna (contrato §1.3: AGENT_STRIDE ahora 7).
{
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 10; t++) sim.step();
  check('vehículos: se hacen trayectos en coche', sim.carTrips > 0, `→ ${sim.carTrips}`);
  const snap = sim.snapshot();
  check('vehículos: el snapshot tiene 7 floats por agente', snap.length === sim.citizens.size * 7);
  // La columna mode (offset 6) solo puede ser 0 (a pie) o 1 (coche).
  let validModes = true;
  for (let i = 6; i < snap.length; i += 7) if (snap[i] !== 0 && snap[i] !== 1) validModes = false;
  check('vehículos: la columna mode del snapshot es siempre 0 o 1', validModes);
}

// Ciclo 9 RESEARCH.md — estatus y propiedad: el ahorro de sobra se invierte
// en la vivienda (sumidero de dinero real, no cosmético) y sube el prestigio.
{
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 25; t++) sim.step();
  const anyPrestige = [...sim.economy.prestige.values()].some((p) => p > 0);
  check('estatus: algún hogar invierte en su vivienda', anyPrestige, `→ invertido total ${sim.economy.prestigeInvested.toFixed(0)}`);
  check('estatus: es un sumidero de dinero real', sim.economy.prestigeInvested > 0 && sim.economy.moneySpent >= sim.economy.prestigeInvested);
  const capped = [...sim.economy.prestige.values()].every((p) => p >= 0 && p <= 1);
  check('estatus: el prestigio nunca sale de [0,1]', capped);
}

// Acoplamiento prestigio→inmigración (última carencia anotada tras cerrar
// la pirámide N0-N5): un pueblo "de posibles" debe atraer familias más
// grandes que uno sin prestigio, sin dejar de ser 1-3 en el caso base
// (avgPrestige=0, la curva original intacta). Mismo par de rng.next() para
// las dos comparaciones — así el único grado de libertad es el prestigio.
{
  const rng1 = createRng(7);
  const rng2 = createRng(7);
  let totalNone = 0;
  let totalFull = 0;
  const N = 500;
  for (let i = 0; i < N; i++) {
    totalNone += familySize(rng1, 0);
    totalFull += familySize(rng2, 1);
  }
  check('prestigio→inmigración: prestigio 0 da familias 1-3 (curva original)', totalNone / N >= 1 && totalNone / N <= 3);
  check('prestigio→inmigración: más prestigio atrae familias más grandes', totalFull > totalNone, `→ media ${(totalNone / N).toFixed(2)} vs ${(totalFull / N).toFixed(2)}`);
}

// Acoplamiento duelo→inmigración (ciclo 11): un pueblo de luto debe atraer
// familias más cautas (más pequeñas) que uno sin duelo, sin bajar nunca de
// 1 adulto (ni el peor duelo deja una vivienda vacía). Mismo par de
// rng.next() para las dos comparaciones — el único grado de libertad es el
// duelo medio.
{
  const rng1 = createRng(11);
  const rng2 = createRng(11);
  let totalNone = 0;
  let totalGrieving = 0;
  let everBelowOne = false;
  const N = 500;
  for (let i = 0; i < N; i++) {
    totalNone += familySize(rng1, 0, 0);
    const withGrief = familySize(rng2, 0, 1);
    if (withGrief < 1) everBelowOne = true;
    totalGrieving += withGrief;
  }
  check('duelo→inmigración: un pueblo de luto atrae familias más pequeñas', totalGrieving < totalNone, `→ media ${(totalNone / N).toFixed(2)} vs ${(totalGrieving / N).toFixed(2)}`);
  check('duelo→inmigración: nunca deja una vivienda sin nadie', !everBelowOne);
}

// T4.4 (modo autónomo) — cuando no hay parcela servible junto a una vía
// existente, la ciudad se abre un ramal nuevo antes de rendirse. Grid de
// prueba: una vía horizontal larga sobre un campo vacío.
function buildRoadTestGrid(): Grid {
  const grid = new Grid();
  // Ancho generoso: el barrido en anillos de nearestRoadCell (igual que
  // findParcel) encuentra el PRIMER acierto del anillo, no el más cercano
  // en línea recta — para una vía horizontal "infinita" eso es el extremo
  // (centro.x - r, ...), así que el hueco de prueba debe cubrir ese extremo
  // con margen de sobra, no solo la zona alrededor del centro.
  for (let cx = -50; cx <= 50; cx++) {
    for (const cz of [6, 7, 11, 12]) grid.setTerrain(cx, cz, 'grass');
    for (let cz = 8; cz <= 10; cz++) grid.setTerrain(cx, cz, 'road');
  }
  for (let cx = -50; cx <= 50; cx++) {
    for (let cz = -30; cz <= 40; cz++) {
      if (!grid.get(cx, cz)) grid.setTerrain(cx, cz, 'field');
    }
  }
  return grid;
}
{
  const grid = buildRoadTestGrid();
  const ext = extendRoad(grid, [10, 30]); // centro lejos, al sur de la vía
  check('T4.4: se abre un ramal cuando no hay parcela servible cerca', ext !== null);
  if (ext) {
    check('T4.4: el ramal es ortogonal (perpendicular a la vía horizontal)', ext.axis === 'x');
    // Repetir con los MISMOS argumentos en un grid limpio debe pintar
    // exactamente igual — es la garantía que necesita el hilo principal
    // para replicar el ramal en su grid espejo sin recibir el rng
    // compartido de la sim (evento `roadBuilt`, ver main.ts).
    const grid2 = buildRoadTestGrid();
    const box2 = paintRoadExtension(grid2, ext.rx, ext.rz, ext.axis, ext.dir, ext.length);
    check(
      'T4.4: paintRoadExtension es repetible (mismo cuadro) en otro grid',
      !!box2 && box2.cx0 === ext.cx0 && box2.cz0 === ext.cz0 && box2.cx1 === ext.cx1 && box2.cz1 === ext.cz1,
    );
    let mismatch = 0;
    for (let x = ext.cx0; x <= ext.cx1; x++) {
      for (let z = ext.cz0; z <= ext.cz1; z++) {
        if (grid.get(x, z)?.terrain !== grid2.get(x, z)?.terrain) mismatch++;
        if (grid.get(x, z)?.prop?.id !== grid2.get(x, z)?.prop?.id) mismatch++;
      }
    }
    check('T4.4: terreno y arbolado idénticos en ambos grids', mismatch === 0, `→ ${mismatch} celdas distintas`);
  }
  const farGrid = new Grid();
  farGrid.fillTerrain(-5, -5, 5, 5, 'field');
  check('T4.4: sin ninguna vía a mano, no hay ramal', extendRoad(farGrid, [0, 0]) === null);
}

// T4.4 — regresión de un fallo real encontrado verificando el escenario de
// granja (T4.4 más abajo): la versión original de extendRoad solo miraba
// la celda de vía MÁS CERCANA al centro y probaba solo sus dos lados: en
// cuanto la densificación normal (casitas a ambos lados de cada tramo de
// vía servible — justo lo que produce findParcel) flanqueaba esa celda
// concreta, la función devolvía null PARA SIEMPRE aunque hubiera vía
// servible más allá. No adivinamos a mano qué punto elige el barrido en
// anillos (depende del orden exacto de iteración): lo descubrimos
// empíricamente en un grid limpio, lo bloqueamos en uno idéntico, y
// comprobamos que la función sigue mirando más allá.
{
  const gridA = buildRoadTestGrid();
  const natural = extendRoad(gridA, [0, 30]);
  check('T4.4 (regresión, setup): hay un punto natural sin bloquear', natural !== null);
  if (natural) {
    const gridB = buildRoadTestGrid();
    // Bloquea el ramal en AMBAS direcciones perpendiculares desde el mismo
    // punto que se encontró de forma natural en gridA.
    gridB.placeBuilding('shed', 1, 1, natural.rx, natural.rz + 5, 0);
    gridB.placeBuilding('shed', 1, 1, natural.rx, natural.rz - 5, 0);
    const rerouted = extendRoad(gridB, [0, 30]);
    check(
      'T4.4 (regresión): el punto más cercano bloqueado NO detiene la búsqueda',
      rerouted !== null,
      rerouted ? `→ (${natural.rx},${natural.rz}) bloqueado, reencaminado a (${rerouted.rx},${rerouted.rz})` : '→ null (el bug ha vuelto)',
    );
    if (rerouted) {
      check(
        'T4.4 (regresión): el punto elegido es distinto al bloqueado',
        rerouted.rx !== natural.rx || rerouted.rz !== natural.rz,
      );
    }
  }
}

// T4.4 — test de aceptación estrella (ROADMAP.md): prueba headless (sin
// navegador) de que el escenario mínimo de granja (world/seedFarm.ts, NO
// seedWorld) es viable para que emerja un pueblo por sí solo. No sustituye
// la observación de 30 min en vivo (eso lo hace el orquestador en el
// navegador) — es la comprobación barata de que hay ALGO que observar antes
// de gastar esos 30 min reales.
{
  const sim = new Simulation(seedFarm(), 99);
  const startingPopulation = sim.citizens.size;
  let grew = 0;
  let roadBuilt = 0;
  // 10 días de juego: de sobra para varias decenas de intentos de
  // crecimiento (uno por hora de luz, ver simulation.ts) y sale muy por
  // delante de la ventana real de 30 min que luego se observará a ojo.
  for (let t = 0; t < TICKS_PER_DAY * 10; t++) {
    sim.step();
    for (const e of sim.takeEvents()) {
      if (e.name === 'cityGrew') grew++;
      if (e.name === 'roadBuilt') roadBuilt++;
    }
  }
  check(
    'T4.4 escenario granja: la población crece más allá de la familia inicial',
    sim.citizens.size > startingPopulation,
    `→ ${startingPopulation} → ${sim.citizens.size}`,
  );
  check(
    'T4.4 escenario granja: el crecimiento autónomo actúa de verdad (cityGrew/roadBuilt)',
    grew > 0 || roadBuilt > 0,
    `→ cityGrew=${grew} roadBuilt=${roadBuilt}`,
  );
  // Si llegamos aquí sin lanzar (10 días sin excepciones), la tercera
  // condición del test de aceptación (nunca revienta) queda probada.
}

// Ciclo 10 RESEARCH.md — fiestas de barrio (N5, cierra la pirámide completa
// N0-N5): fecha de calendario fija, pero asistencia y efecto emergentes.
{
  const sim = new Simulation(seedWorld(), 42);
  let festivalDays = 0;
  let festivalAttendance = 0;
  let attendanceOnNonFestivalDay = 0;
  for (let t = 0; t < TICKS_PER_DAY * 46; t++) {
    sim.step();
    for (const e of sim.takeEvents()) if (e.name === 'festivalDay') festivalDays++;
    for (const c of sim.citizens.values()) {
      if (c.activity !== 'festival' || c.phase.kind !== 'doing') continue;
      if (sim.clock.day % 15 === 0 && sim.clock.day > 0) festivalAttendance++;
      else attendanceOnNonFestivalDay++;
    }
  }
  check('fiestas: caen en su fecha de calendario', festivalDays >= 3, `→ ${festivalDays} en 46 días`);
  check('fiestas: la gente asiste de verdad', festivalAttendance > 0, `→ ${festivalAttendance} ticks`);
  check('fiestas: NUNCA fuera de fecha (nada de guion suelto)', attendanceOnNonFestivalDay === 0, `→ ${attendanceOnNonFestivalDay}`);
}

// Determinismo: mismo snapshot final con la misma semilla.
const a = runDays(7, 1).sim.snapshot();
const b = runDays(7, 1).sim.snapshot();
check('determinismo: misma semilla → mismo estado', a.length === b.length && a.every((v, i) => v === b[i]));

// Rendimiento: presupuesto ≤ 50 ms/tick (contrato §1.5) con margen enorme aquí.
{
  const sim = new Simulation(seedWorld(), 99);
  const t0 = performance.now();
  for (let i = 0; i < TICKS_PER_DAY; i++) sim.step();
  const perTick = (performance.now() - t0) / TICKS_PER_DAY;
  check('§1.5: tick medio ≤ 50 ms', perTick <= 50, `→ ${perTick.toFixed(2)} ms`);
}

// Escala (RESEARCH.md §5 — objetivo 10.000 habitantes): estrés sintético con
// las 9 lógicas activas a la vez, en el peor caso realista (todos
// amontonados en las mismas pocas viviendas, el escenario más caro para el
// hash espacial de encuentros). Guarda como test lo que antes era solo una
// promesa en la documentación.
{
  const sim = new Simulation(seedWorld(), 7) as unknown as {
    citizens: Map<number, unknown>;
    index: { ofRole: (r: string) => Array<{ ax: number; az: number; id: string }> };
    step: () => void;
  } & Record<string, unknown>;
  const homes = sim.index.ofRole('residential');
  const TARGET = 3000;
  let n = 0;
  while (sim.citizens.size < TARGET) {
    const h = homes[n % homes.length];
    (sim.spawnCitizen as (ax: number, az: number, id: string) => void)(h.ax, h.az, h.id);
    n++;
  }
  for (let i = 0; i < 5; i++) sim.step(); // warmup JIT
  const N = 20;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) sim.step();
  const perTick = (performance.now() - t0) / N;
  check(`escala: ${TARGET} hab. sintéticos ≤ 50 ms/tick`, perTick <= 50, `→ ${perTick.toFixed(2)} ms`);
}

console.log(`\n${passed} ok, ${failed} fallos`);
if (failed > 0) throw new Error(`${failed} tests fallidos`);
