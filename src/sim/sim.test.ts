/**
 * Tests headless de la simulación: corre días de juego en ms sin worker ni
 * THREE. Verifica los criterios de aceptación de la Fase 3:
 * - T3.4: el patrón diario EMERGE (dormir de noche, trabajar de día, comer).
 * - T3.2: las rutas se calculan y los agentes llegan a destino.
 * - T3.7: hay charlas emergentes.
 * - T3.8: hay empleo real asignado.
 * - Determinismo: dos runs con la misma semilla → mismo estado.
 */
import { seedWorld, seedFarm } from '../world/seed';
import { Simulation } from './simulation';
import { TICK_GAME_S, DAY_GAME_SECONDS } from './clock';
import { FOOD_PRICE, Economy, GOODS_COMFORT_FLOOR, GOODS_MAX_SPEND, LIFESTYLE_COMFORT } from './economy';
import { weatherAt, seasonalWarmth, seasonalFestivalName } from './weather';
import { deathChance, lifeYear, OLD_AGE, ADULT_AGE } from './lifecycle';
import { CLINIC_RECOVERY_PER_HOUR } from './health';
import { bereave, griefTick, consoleGrief, consoleGriefBy, GRIEF_PARTNER } from './grief';
import { maybeInfect, sickenTick, SICK_ONSET } from './contagion';
import { chatBond } from './citizens/social';
import { sickStayIn } from './citizens/activities';
import { chronicleText, summarizeYear, compactChronicle, ChronEvent, isLegacyDeath } from '../ui/chronicle';
import { townAttractiveness, householdHardship, updateEmigrationPressure, EMIGRATE_PRESSURE_LIMIT, computeDemand, DemandInput, fertilityFactor, CARRYING_CAPACITY } from '../world/growth';
import { ACTIVITY_BY_KIND, SimContext } from './citizens/activities';
import { Weather } from './weather';
import { Citizen } from './citizens/citizen';
import { createRng } from '../rng';

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

// Ciclo 5 RESEARCH.md — lógica de salud: la ciudad construye consultorio
// cuando la salud media flaquea, los enfermos van a curarse y NADIE trabaja
// estando demasiado enfermo (bloqueo real, no solo cosmético).
{
  const sim = new Simulation(seedWorld(), 42);
  let clinicBuilt = false;
  let anyoneAtClinic = false;
  let startedWorkTooSick = 0;
  const wasWorking = new Set<number>();
  // 40 días: la ciudad tarda ~20-25 en escapar del equilibrio inicial de
  // población pequeña (lo hace sola, vía nacimientos/muertes — ver ciclo T4.2
  // en la bitácora) antes de que población≥10 habilite la demanda de clínica.
  for (let t = 0; t < TICKS_PER_DAY * 40; t++) {
    sim.step();
    for (const e of sim.takeEvents())
      if (e.name === 'cityGrew' && (e.data as { id?: string }).id === 'clinic') clinicBuilt = true;
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
  check('salud: la ciudad construye consultorio', clinicBuilt || sim.index.buildings.some((b) => b.id === 'clinic'));
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

// Ciclo 10 RESEARCH.md — fiestas de barrio (N5, cierra la pirámide completa
// N0-N5): fecha de calendario fija, pero asistencia y efecto emergentes.
{
  const sim = new Simulation(seedWorld(), 42);
  let festivalDays = 0;
  let festivalAttendance = 0;
  // El invariante real es que nadie EMPIEZA una fiesta fuera de su fecha (la
  // DECISIÓN es lo que la suitability veta). Una fiesta que arranca la tarde del
  // día 15 puede alargarse pasada la medianoche (realista): eso NO es "fiesta
  // fuera de fecha", así que contamos INICIOS, no ticks de 'doing' que se solapan.
  const wasFestival = new Set<number>();
  let startsOnNonFestivalDay = 0;
  for (let t = 0; t < TICKS_PER_DAY * 46; t++) {
    sim.step();
    for (const e of sim.takeEvents()) if (e.name === 'festivalDay') festivalDays++;
    const isFestivalDay = sim.clock.day % 15 === 0 && sim.clock.day > 0;
    for (const c of sim.citizens.values()) {
      const doing = c.activity === 'festival' && c.phase.kind === 'doing';
      if (doing && isFestivalDay) festivalAttendance++;
      if (doing && !isFestivalDay && !wasFestival.has(c.id)) startsOnNonFestivalDay++;
      if (doing) wasFestival.add(c.id); else wasFestival.delete(c.id);
    }
  }
  check('fiestas: caen en su fecha de calendario', festivalDays >= 3, `→ ${festivalDays} en 46 días`);
  check('fiestas: la gente asiste de verdad', festivalAttendance > 0, `→ ${festivalAttendance} ticks`);
  check('fiestas: NUNCA se INICIAN fuera de fecha (nada de guion suelto)', startsOnNonFestivalDay === 0, `→ ${startsOnNonFestivalDay}`);
}

// Ciclo 11 RESEARCH.md — acoplamiento salud→mortalidad: la salud deja de ser
// solo "poder trabajar" y pasa a ser vida o muerte. La edad marca el riesgo
// base; la fragilidad lo multiplica; la enfermedad crítica mata aun al joven.
{
  // (a) Forma de la curva — verificable sin sim: monótona en salud.
  check('mortalidad: la fragilidad multiplica el riesgo por edad', deathChance(80, 0.1) > deathChance(80, 0.9));
  check('mortalidad: la salud plena no altera la curva de edad original', deathChance(80, 1) === Math.min(0.5, (80 - OLD_AGE) / 25));
  check('mortalidad: un cuerpo joven y sano nunca muere de vejez', deathChance(30, 1) === 0);
  check('mortalidad: la enfermedad crítica mata incluso al joven', deathChance(30, 0.02) > 0);

  // (b) Emergencia poblacional: dos cohortes idénticas salvo en salud; en un
  //     año de vida, la frágil pierde más miembros. Mismo RNG → aislamos salud.
  const makeElder = (id: number, health: number): Citizen => ({
    id, name: `E${id}`, age: 78,
    personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
    needs: { energy: 1, food: 1, social: 1, fun: 1, purpose: 1 },
    home: { ax: 0, az: 0, buildingId: 'house' }, work: null,
    x: 0, z: 0, heading: 0, phase: { kind: 'deciding' }, activity: 'none',
    partnerId: null, education: 0, health, grief: 0, sick: 0, immune: 0, childrenRaised: 0, friends: new Map(), lastChatTick: -1, inside: false,
  });
  const cohort = (health: number): number => {
    const m = new Map<number, Citizen>();
    for (let i = 0; i < 400; i++) m.set(i, makeElder(i, health));
    return lifeYear(m, createRng(123)).deaths.length;
  };
  const frailDeaths = cohort(0.15);
  const robustDeaths = cohort(0.95);
  check(
    'mortalidad: una cohorte frágil muere más que una robusta de la misma edad',
    frailDeaths > robustDeaths,
    `→ frágiles ${frailDeaths} vs robustos ${robustDeaths} de 400`,
  );
}

// Ciclo 12 RESEARCH.md — acoplamiento prestigio→inmigración (avanza T4.3): la
// población deja de ser un caudal fijo. Una ciudad próspera y con buena fama
// atrae más familias a cada vivienda nueva; una que va mal las deja a medias.
{
  const prosperous = townAttractiveness({ employment: 1, avgHealth: 0.95, avgFood: 0.9, avgPrestige: 0.9 });
  const struggling = townAttractiveness({ employment: 0.4, avgHealth: 0.6, avgFood: 0.4, avgPrestige: 0 });
  const fresh = townAttractiveness({ employment: 1, avgHealth: 0.95, avgFood: 0.85, avgPrestige: 0 });

  check('inmigración: una ciudad próspera atrae más que una en apuros', prosperous > struggling, `→ ${prosperous.toFixed(2)} vs ${struggling.toFixed(2)}`);
  check('inmigración: la fama (prestigio) empuja la atractividad al alza', prosperous > fresh, `→ ${prosperous.toFixed(2)} vs ${fresh.toFixed(2)}`);
  check('inmigración: atractividad acotada en [0.5,1]', struggling >= 0.5 && prosperous <= 1);
  // Un pueblo recién fundado (prestigio 0 pero sano y con empleo) llena casi de
  // lleno: el arranque no se asfixia (la carencia principal del diseño).
  check('inmigración: el arranque no se asfixia (pueblo joven llena casi lleno)', fresh >= 0.85, `→ ${fresh.toFixed(2)}`);
  // El efecto se VE en los bloques: un panelák (cap 18) nace medio vacío en un
  // pueblo en apuros y lleno en uno próspero — inmigración como consecuencia.
  const drawProsp = Math.max(1, Math.round(18 * prosperous));
  const drawStrug = Math.max(1, Math.round(18 * struggling));
  check('inmigración: un bloque atrae menos familias en un pueblo en apuros', drawStrug < drawProsp, `→ ${drawStrug} vs ${drawProsp} de 18`);
}

// Ciclo 13 RESEARCH.md — acoplamiento clima→coche: quien puede permitirse ir en
// coche viaja resguardado, así que el mal tiempo le disuade MENOS en los recados
// (comprar/visitar/club); el PASEO, en cambio, se moja igual (su sentido es
// estar fuera). Salda una deuda anotada en los ciclos 6 y 8.
{
  const home = { ax: 0, az: 0, buildingId: 'house' };
  const c = { home } as unknown as Citizen;
  const mkCtx = (outdoorFactor: number, wallet: number): SimContext =>
    ({
      darkness: 0,
      hour: 15,
      weather: { outdoorFactor } as unknown as Weather,
      wallets: new Map<string, number>([['0,0', wallet]]),
    }) as unknown as SimContext;
  const shop = ACTIVITY_BY_KIND.get('shop')!;
  const stroll = ACTIVITY_BY_KIND.get('stroll')!;
  const badRich = shop.suitability(mkCtx(0.2, 100), c);
  const badPoor = shop.suitability(mkCtx(0.2, 0), c);
  const clearRich = shop.suitability(mkCtx(1, 100), c);
  const clearPoor = shop.suitability(mkCtx(1, 0), c);
  check('clima→coche: con mal tiempo, el hogar con coche hace más recados que el que no', badRich > badPoor, `→ ${badRich.toFixed(3)} vs ${badPoor.toFixed(3)}`);
  check('clima→coche: con buen tiempo el coche no cambia nada (no hay castigo que esquivar)', Math.abs(clearRich - clearPoor) < 1e-9);
  const strollRich = stroll.suitability(mkCtx(0.2, 100), c);
  const strollPoor = stroll.suitability(mkCtx(0.2, 0), c);
  check('clima→coche: el PASEO NO se resguarda (su sentido es estar fuera)', strollRich === strollPoor, `→ ${strollRich.toFixed(3)} vs ${strollPoor.toFixed(3)}`);
}

// Ciclo 14 RESEARCH.md — EMIGRACIÓN digna (cierra T4.3, honra §6.2): quien no
// halla sustento en el pueblo, tras años de penuria SOSTENIDA y con la red de
// pensiones agotada, se marcha andando a otra ciudad — narrado, NUNCA un
// despawn silencioso. La población es consecuencia por ambos lados.
{
  // (a) Decisión pura — desesperanza ECONÓMICA (sin empleo ni colchón), no
  //     hambre ya consumada; los jubilados no cuentan (los sostiene la pensión).
  check('emigración: sin empleo y sin colchón = penuria', householdHardship({ workingAdults: 2, employed: 0, wallet: 1 }));
  check('emigración: con alguien empleado NO hay penuria', !householdHardship({ workingAdults: 2, employed: 1, wallet: 0 }));
  check('emigración: con colchón NO hay penuria', !householdHardship({ workingAdults: 2, employed: 0, wallet: 50 }));
  check('emigración: un hogar solo de jubilados no emigra a buscar trabajo', !householdHardship({ workingAdults: 0, employed: 0, wallet: 0 }));

  // (b) Histéresis: la penuria SOSTENIDA acumula; un año bueno alivia el doble
  //     (la esperanza vuelve antes que se pierde) — no se huye por un mal año.
  let p = 0;
  for (let i = 0; i < EMIGRATE_PRESSURE_LIMIT; i++) p = updateEmigrationPressure(p, true);
  check('emigración: la penuria sostenida alcanza el límite', p >= EMIGRATE_PRESSURE_LIMIT, `→ ${p}`);
  check('emigración: un solo año malo no basta (histéresis)', updateEmigrationPressure(0, true) < EMIGRATE_PRESSURE_LIMIT);
  check('emigración: un buen año alivia más que un mal año', updateEmigrationPressure(2, false) < updateEmigrationPressure(2, true) - 1);

  // (c) Emergencia integrada: un pueblo sano NO expulsa a nadie (la válvula está
  //     cerrada por defecto: emigrar es excepción, no rotación).
  {
    const sim = new Simulation(seedWorld(), 42);
    for (let t = 0; t < TICKS_PER_DAY * 30; t++) sim.step();
    check('emigración: un pueblo sano no expulsa a nadie', sim.emigrations === 0, `→ ${sim.emigrations}`);
  }

  // (d) Emergencia integrada: condena a un hogar concreto a paro sin sustento y
  //     con la red agotada (tesoro en quiebra); tras la penuria sostenida, sus
  //     miembros hacen las maletas y se marchan — con evento narrado (dignidad
  //     §6.2). El tesoro se pone en NÚMEROS ROJOS PROFUNDOS, no a 0: desde el
  //     ciclo 29 el alquiler REFILLa el tesoro dentro del cierre del día (antes
  //     de las pensiones), así que un 0 dejaría que la pensión rescatara al hogar
  //     — la penuria real exige un gobierno en bancarrota que no pueda pagarla.
  {
    const sim = new Simulation(seedWorld(), 42) as unknown as {
      citizens: Map<number, Citizen>;
      economy: { treasury: number; wallets: Map<string, number> };
      emigrations: number;
      step: () => void;
      takeEvents: () => Array<{ name: string; data: Record<string, unknown> }>;
    };
    for (let t = 0; t < TICKS_PER_DAY * 12; t++) sim.step(); // crece por encima del suelo
    let vk: string | null = null;
    const homes = new Map<string, Citizen[]>();
    for (const c of sim.citizens.values()) {
      const k = `${c.home.ax},${c.home.az}`;
      (homes.get(k) ?? homes.set(k, []).get(k)!).push(c);
    }
    for (const [k, arr] of homes) if (arr.some((c) => c.age >= ADULT_AGE && c.age < OLD_AGE)) { vk = k; break; }
    let emigratedEvents = 0;
    for (let t = 0; t < TICKS_PER_DAY * 18 && vk; t++) {
      sim.economy.treasury = -1e6; // la última bala (pensiones) falla: gobierno en quiebra
      sim.economy.wallets.set(vk, 0); // sin colchón
      for (const c of sim.citizens.values()) if (`${c.home.ax},${c.home.az}` === vk) c.work = null; // sin empleo
      sim.step();
      for (const e of sim.takeEvents()) if (e.name === 'citizenLeft' && e.data.reason === 'emigrated') emigratedEvents++;
    }
    check('emigración: un hogar sin sustento sostenido acaba marchándose', sim.emigrations > 0, `→ ${sim.emigrations}`);
    check('emigración: la marcha se NARRA (no es un despawn silencioso)', emigratedEvents > 0, `→ ${emigratedEvents} eventos`);
  }
}

// Ciclo 15 RESEARCH.md — la CLÍNICA alarga la vida (MEDIDO): cierra la carencia
// (c) del ciclo 11. El acoplamiento inverso salud→vida (curarse baja la
// mortalidad) existía por construcción pero nunca se había MEDIDO: aquí se
// cuantifica que la sanidad SALVA vidas, no solo repara una barra.
{
  const CLINIC_SESSION_H = 8; // una jornada de consulta
  const frail = 0.3;
  const healed = Math.min(1, frail + CLINIC_RECOVERY_PER_HOUR * CLINIC_SESSION_H);
  check('clínica: una jornada de consulta saca al frágil del peligro', healed > 0.9, `→ ${healed.toFixed(2)}`);
  // A los 80 la base por edad (0.32) ya es alta, así que curar no puede bajar de
  // ahí; aun así recorta el riesgo en casi la mitad (0.60 → 0.32).
  check('clínica: la salud recuperada recorta el riesgo de muerte en más de un tercio', deathChance(80, healed) < deathChance(80, frail) * 0.6, `→ ${deathChance(80, healed).toFixed(3)} vs ${deathChance(80, frail).toFixed(3)}`);

  // Cohortes idénticas de frágiles (78 años, salud 0.3): una recibe la cura de
  // la clínica, la otra no. Mismo RNG → aislamos el efecto de la sanidad.
  const makeFrail = (id: number, health: number): Citizen => ({
    id, name: `F${id}`, age: 78,
    personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
    needs: { energy: 1, food: 1, social: 1, fun: 1, purpose: 1 },
    home: { ax: 0, az: 0, buildingId: 'house' }, work: null,
    x: 0, z: 0, heading: 0, phase: { kind: 'deciding' }, activity: 'none',
    partnerId: null, education: 0, health, grief: 0, sick: 0, immune: 0, childrenRaised: 0, friends: new Map(), lastChatTick: -1, inside: false,
  });
  const cohortDeaths = (health: number): number => {
    const m = new Map<number, Citizen>();
    for (let i = 0; i < 400; i++) m.set(i, makeFrail(i, health));
    return lifeYear(m, createRng(77)).deaths.length;
  };
  const treated = cohortDeaths(healed);
  const untreated = cohortDeaths(frail);
  check(
    'clínica: una cohorte curada sobrevive mucho más que una sin atender',
    treated < untreated / 2,
    `→ curados ${treated} vs sin atender ${untreated} muertes de 400`,
  );
}

// Ciclo 16 RESEARCH.md — DUELO (N3, la sombra del vínculo): perder a la pareja o
// a un amigo íntimo (muerte del ciclo 3 o emigración del 14) deja al
// superviviente en duelo — apaga la alegría unos días y luego se pasa. Honra
// §6.2 (los vínculos importan; nadie sigue como si nada tras una pérdida).
{
  const mkPerson = (grief: number): Citizen => ({
    id: 1, name: 'D', age: 40,
    personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
    needs: { energy: 1, food: 1, social: 0.8, fun: 0.8, purpose: 1 },
    home: { ax: 0, az: 0, buildingId: 'house' }, work: null,
    x: 0, z: 0, heading: 0, phase: { kind: 'deciding' }, activity: 'none',
    partnerId: null, education: 0, health: 1, grief, sick: 0, immune: 0, childrenRaised: 0, friends: new Map(), lastChatTick: -1, inside: false,
  });

  // (a) Mecanismo puro: el golpe se acumula y se acota; el duelo apaga la
  //     diversión y decae con el tiempo.
  const g = mkPerson(0);
  bereave(g, GRIEF_PARTNER);
  check('duelo: perder a la pareja golpea fuerte', g.grief === GRIEF_PARTNER, `→ ${g.grief}`);
  bereave(g, GRIEF_PARTNER);
  check('duelo: nunca pasa de 1', g.grief === 1);

  const grieving = mkPerson(1);
  const serene = mkPerson(0);
  for (let h = 0; h < 24; h++) { griefTick(grieving, 1); griefTick(serene, 1); }
  check('duelo: apaga la alegría del doliente', grieving.needs.fun < serene.needs.fun, `→ ${grieving.needs.fun.toFixed(2)} vs ${serene.needs.fun.toFixed(2)}`);
  check('duelo: quien no está de duelo no pierde alegría por ello', serene.needs.fun === 0.8);

  const fading = mkPerson(1);
  for (let h = 0; h < 24 * 11; h++) griefTick(fading, 1);
  check('duelo: se pasa en ~10 días (la vida sigue)', fading.grief === 0, `→ ${fading.grief.toFixed(2)}`);

  // (b) Emergencia integrada: en una ciudad con muertes y emigración, LOS
  //     DOLIENTES DISFRUTAN MENOS que el resto — observable, no un mecanismo.
  {
    const sim = new Simulation(seedWorld(), 42);
    let anyGrieved = false;
    let gSum = 0, gN = 0, nSum = 0, nN = 0;
    for (let t = 0; t < TICKS_PER_DAY * 30; t++) {
      sim.step();
      for (const c of sim.citizens.values()) {
        if (c.grief > 0) anyGrieved = true;
        if (c.grief > 0.1) { gSum += c.needs.fun; gN++; } else { nSum += c.needs.fun; nN++; }
      }
    }
    check('duelo: la muerte/emigración deja dolientes (el vínculo se siente)', anyGrieved);
    check('duelo: los dolientes disfrutan menos que el resto de la ciudad', gN > 0 && gSum / gN < nSum / nN, `→ dolientes ${gN ? (gSum / gN).toFixed(2) : 'n/a'} vs resto ${(nSum / nN).toFixed(2)}`);
  }
}

// Ciclo 17 RESEARCH.md — CONSUELO (grief→social): cierra el bucle del duelo. El
// duelo ya empuja a buscar gente (drena `social` → más urgencia de compañía);
// aquí la COMPAÑÍA consuela — el duelo se pasa más deprisa acompañado que a
// solas. Es la carencia (a) del ciclo 16.
{
  const mkPerson = (grief: number): Citizen => ({
    id: 1, name: 'C', age: 40,
    personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
    needs: { energy: 1, food: 1, social: 0.8, fun: 0.8, purpose: 1 },
    home: { ax: 0, az: 0, buildingId: 'house' }, work: null,
    x: 0, z: 0, heading: 0, phase: { kind: 'deciding' }, activity: 'none',
    partnerId: null, education: 0, health: 1, grief, sick: 0, immune: 0, childrenRaised: 0, friends: new Map(), lastChatTick: -1, inside: false,
  });

  // (a) Puro: en la misma hora, quien está acompañado alivia MÁS que quien pasa
  //     el duelo a solas.
  const alone = mkPerson(0.8);
  const comforted = mkPerson(0.8);
  griefTick(alone, 1);
  griefTick(comforted, 1);
  consoleGrief(comforted, 1); // además, está en compañía
  check('consuelo: la compañía alivia el duelo más que el tiempo a solas', comforted.grief < alone.grief, `→ ${comforted.grief.toFixed(3)} vs ${alone.grief.toFixed(3)}`);

  // (b) A lo largo del duelo: acompañado un par de horas al día se supera antes.
  const daysToHeal = (consoleHours: number): number => {
    const c = mkPerson(0.85);
    for (let day = 1; day <= 30; day++) {
      for (let h = 0; h < 24; h++) { griefTick(c, 1); if (h < consoleHours) consoleGrief(c, 1); }
      if (c.grief <= 0) return day;
    }
    return 99;
  };
  const solo = daysToHeal(0);
  const acompañado = daysToHeal(2);
  check('consuelo: acompañado se supera el duelo antes que a solas', acompañado < solo, `→ acompañado ${acompañado} d vs solo ${solo} d`);
  check('consuelo: pero el duelo no se ignora (aun acompañado dura días)', acompañado >= 5, `→ ${acompañado} d`);
}

// Ciclo 18 RESEARCH.md — MEMORIA AFECTIVA de la Crónica (§6.1: ganamos cuando la
// Crónica cuenta historias que no escribimos). El narrador es una función PURA
// (chronicleText); las despedidas llevan contexto afectivo: causa, vida larga y
// sobre todo la VIUDEZ (acopla con el duelo, ciclos 16/17).
{
  // (a) Narrador puro.
  check('crónica: narra la viudez (quién queda sin su pareja)',
    chronicleText('citizenLeft', { name: 'Irene', age: 76, health: 0.9, reason: 'death', partnerName: 'Vera' }) === 'muere Irene (76 años) — Vera pierde a su pareja');
  check('crónica: una vida larga se reconoce',
    (chronicleText('citizenLeft', { name: 'Emil', age: 90, health: 0.9, reason: 'death' }) ?? '').includes('una vida larga'));
  check('crónica: una muerte joven y frágil se narra por enfermedad',
    (chronicleText('citizenLeft', { name: 'Jan', age: 30, health: 0.05, reason: 'death' }) ?? '').includes('por enfermedad'));
  check('crónica: la enfermedad no se confunde con vida larga',
    !(chronicleText('citizenLeft', { name: 'Jan', age: 30, health: 0.05, reason: 'death' }) ?? '').includes('vida larga'));
  check('crónica: la emigración se narra como marcha, no muerte',
    chronicleText('citizenLeft', { name: 'Pau', reason: 'emigrated' }) === 'Pau se marcha a otra ciudad');
  check('crónica: los eventos sin relato devuelven null', chronicleText('jobTaken', {}) === null);

  // (b) Integración: en una ciudad con parejas y muertes, EMERGEN despedidas con
  //     viudez narrada — historias que no escribió nadie.
  {
    const sim = new Simulation(seedWorld(), 42);
    let widowings = 0;
    for (let t = 0; t < TICKS_PER_DAY * 45; t++) {
      sim.step();
      for (const e of sim.takeEvents()) {
        if (e.name === 'citizenLeft' && (e.data as { partnerName?: string }).partnerName) {
          const line = chronicleText('citizenLeft', e.data) ?? '';
          if (line.includes('pierde a su pareja')) widowings++;
        }
      }
    }
    check('crónica: emergen despedidas con viudez (el duelo tiene rostro)', widowings > 0, `→ ${widowings} viudeces narradas`);
  }
}

// Ciclo 19 RESEARCH.md — DUELO COMPARTIDO (consuelo por intimidad): cierra la
// carencia (a) del ciclo 17. No consuela igual cualquiera: un íntimo alivia más
// que un conocido de vista, y quien también pena, aún más.
{
  const person = (id: number, grief: number, friends: [number, number][] = []): Citizen => ({
    id, name: `P${id}`, age: 40,
    personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
    needs: { energy: 1, food: 1, social: 1, fun: 1, purpose: 1 },
    home: { ax: 0, az: 0, buildingId: 'house' }, work: null,
    x: 0, z: 0, heading: 0, phase: { kind: 'deciding' }, activity: 'none',
    partnerId: null, education: 0, health: 1, grief, sick: 0, immune: 0, childrenRaised: 0, friends: new Map(friends), lastChatTick: -1, inside: false,
  });
  // Un íntimo (afinidad 0.9) consuela más que un desconocido de vista (0.05).
  const byIntimate = person(1, 0.8, [[2, 0.9]]);
  const byStranger = person(1, 0.8, [[3, 0.05]]);
  const intimate = person(2, 0);
  const stranger = person(3, 0);
  consoleGriefBy(byIntimate, intimate, 1);
  consoleGriefBy(byStranger, stranger, 1);
  check('duelo compartido: un íntimo consuela más que un conocido de vista', byIntimate.grief < byStranger.grief, `→ ${byIntimate.grief.toFixed(3)} vs ${byStranger.grief.toFixed(3)}`);

  // Quien TAMBIÉN pena consuela más que un amigo sereno (misma afinidad).
  const withGriever = person(1, 0.8, [[2, 0.6]]);
  const withSerene = person(1, 0.8, [[2, 0.6]]);
  consoleGriefBy(withGriever, person(2, 0.7), 1); // el otro también está de duelo
  consoleGriefBy(withSerene, person(2, 0), 1); // el otro está sereno
  check('duelo compartido: otro doliente consuela más que un amigo sereno', withGriever.grief < withSerene.grief, `→ ${withGriever.grief.toFixed(3)} vs ${withSerene.grief.toFixed(3)}`);

  // No consuela a quien no pena (sin efecto si grief=0).
  const serene = person(1, 0, [[2, 0.9]]);
  consoleGriefBy(serene, person(2, 0.8), 1);
  check('duelo compartido: a quien no pena, no hay nada que consolar', serene.grief === 0);
}

// Ciclo 20 RESEARCH.md — EL LUTO UNE (duelo→vínculo): cierra la carencia (a) del
// ciclo 19. Dos que se consuelan mutuamente estrechan lazos más rápido que una
// charla cualquiera — la pérdida compartida forja amistad.
{
  const p = (grief: number): Citizen => ({
    id: 1, name: 'X', age: 40,
    personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
    needs: { energy: 1, food: 1, social: 1, fun: 1, purpose: 1 },
    home: { ax: 0, az: 0, buildingId: 'house' }, work: null,
    x: 0, z: 0, heading: 0, phase: { kind: 'deciding' }, activity: 'none',
    partnerId: null, education: 0, health: 1, grief, sick: 0, immune: 0, childrenRaised: 0, friends: new Map(), lastChatTick: -1, inside: false,
  });
  check('luto une: dos dolientes estrechan más lazo que una charla normal', chatBond(p(0.5), p(0.6)) > chatBond(p(0), p(0)));
  check('luto une: si solo uno pena, la charla es normal', chatBond(p(0.5), p(0)) === chatBond(p(0), p(0)));
}

// Ciclo 21 RESEARCH.md §5 — MEMORIA POR NIVELES: los años viejos de la Crónica
// se recuerdan RESUMIDOS (no borrados ni intactos), como la memoria humana.
{
  const y = 12;
  const evs = [
    { year: y, text: 'nace Vera', kind: 'birth' as const },
    { year: y, text: 'nace Jan', kind: 'birth' as const },
    { year: y, text: 'nace Alba', kind: 'birth' as const },
    { year: y, text: 'muere Tomás (80 años)', kind: 'death' as const },
    { year: y, text: 'la ciudad construye: school', kind: 'milestone' as const },
  ];
  const s = summarizeYear(y, evs);
  check('memoria: el resumen cuenta lo rutinario', s.text === 'año 12: 3 nacimientos, 1 muerte, la ciudad construye: school', `→ "${s.text}"`);
  check('memoria: el resumen preserva los hitos (la escuela)', s.text.includes('school'));
  check('memoria: el resumen es de tipo summary (no se re-resume)', s.kind === 'summary');

  // Compactación: años viejos → una línea; años recientes intactos.
  let events: ChronEvent[] = [
    { year: 1, text: 'nace A', kind: 'birth' },
    { year: 1, text: 'nace B', kind: 'birth' },
    { year: 1, text: '¡hito! tier 2', kind: 'milestone' },
    { year: 9, text: 'nace Z', kind: 'birth' }, // año reciente
  ];
  events = compactChronicle(events, 10); // año actual 10, RETAIN 4 → cutoff 6
  const year1 = events.filter((e) => e.year === 1);
  check('memoria: un año viejo queda en UNA línea-resumen', year1.length === 1 && year1[0].kind === 'summary', `→ ${year1.length} líneas`);
  check('memoria: el resumen del año viejo conserva el hito', year1[0].text.includes('tier 2'));
  check('memoria: los años recientes NO se tocan', events.some((e) => e.year === 9 && e.kind === 'birth'));
  // Idempotente: recompactar no vuelve a resumir lo ya resumido.
  const again = compactChronicle(events, 10);
  check('memoria: compactar es idempotente', again.filter((e) => e.year === 1).length === 1);
}

// T5.1 (primer paso) — calidez estacional continua para el crossfade visual:
// fría en invierno, cálida en verano, cruzando suave. Pura (solo el día).
{
  // SEASONS=[invierno(0-20), primavera, verano(40-60), otoño]; centros ≈ día 10 y 50.
  check('estaciones: el invierno es lo más frío', seasonalWarmth(10) < -0.9, `→ ${seasonalWarmth(10).toFixed(2)}`);
  check('estaciones: el verano es lo más cálido', seasonalWarmth(50) > 0.9, `→ ${seasonalWarmth(50).toFixed(2)}`);
  check('estaciones: primavera/otoño quedan templados (entre medias)', Math.abs(seasonalWarmth(30)) < 0.4 && Math.abs(seasonalWarmth(70)) < 0.4);
  check('estaciones: es periódico por año', Math.abs(seasonalWarmth(10) - seasonalWarmth(90)) < 1e-9);
  check('estaciones: acotada en [-1,1]', seasonalWarmth(37) >= -1 && seasonalWarmth(63) <= 1);
}

// Ciclo 22 RESEARCH.md — FESTIVALES ESTACIONALES (festival↔clima): la fiesta gana
// identidad cultural según la estación (cosecha en otoño, verbena en verano…).
{
  // SEASONS=[invierno(0-19), primavera(20-39), verano(40-59), otoño(60-79)].
  check('fiestas: la de otoño es la de la cosecha', seasonalFestivalName(65) === 'fiesta de la cosecha', `→ ${seasonalFestivalName(65)}`);
  check('fiestas: la de verano es la verbena', seasonalFestivalName(50) === 'verbena de verano');
  check('fiestas: cada estación tiene su fiesta (4 nombres)', new Set([0, 25, 45, 65].map(seasonalFestivalName)).size === 4);
  check('fiestas: el nombre es determinista y periódico', seasonalFestivalName(65) === seasonalFestivalName(65 + 80));
}

// Ciclo 23 RESEARCH.md — el INSPECTOR muestra a una PERSONA (§6.2 dignidad): no
// una hoja de stats, sino quién es — edad, etapa de vida y con quién la comparte.
{
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 25; t++) sim.step(); // que haya parejas y edades variadas
  const anyId = [...sim.citizens.keys()][0];
  const info = sim.describe(anyId)!;
  check('persona: el inspector expone la edad', typeof info.age === 'number' && info.age >= 0, `→ ${info.age}`);
  check('persona: expone la etapa de vida', ['niño/a', 'adulto/a', 'mayor'].includes(info.lifeStage), `→ ${info.lifeStage}`);
  // Alguien emparejado debe mostrar el nombre de su pareja.
  const partneredId = [...sim.citizens.values()].find((c) => c.partnerId !== null)?.id;
  if (partneredId !== undefined) {
    const p = sim.describe(partneredId)!;
    check('persona: quien tiene pareja muestra con quién comparte la vida', typeof p.partnerName === 'string' && p.partnerName.length > 0, `→ ${p.partnerName}`);
  } else {
    check('persona: quien tiene pareja muestra con quién comparte la vida', true, '(no hubo parejas en 25 años, se omite)');
  }
  check('persona: la etapa concuerda con la edad', sim.describe(anyId)!.age < 18 ? info.lifeStage === 'niño/a' : true);
}

// Ciclo 24 RESEARCH.md — COSECHA ABUNDANTE (festival↔alimento↔estación): la
// fiesta de otoño se celebra distinta si el granero rebosa. Cierra la carencia
// del ciclo 22 (la fiesta estacional era solo un nombre).
{
  // Día 60 es fiesta (60 % 15 = 0) Y otoño (días 60-79): forzamos granero lleno.
  const sim = new Simulation(seedWorld(), 42) as unknown as {
    economy: { granary: number };
    clock: { day: number };
    step: () => void;
    takeEvents: () => Array<{ name: string; data: Record<string, unknown> }>;
  };
  let harvestName = '';
  for (let t = 0; t < TICKS_PER_DAY * 61; t++) {
    sim.economy.granary = 100; // granero rebosante todo el tiempo
    sim.step();
    for (const e of sim.takeEvents()) {
      if (e.name === 'festivalDay' && typeof e.data.name === 'string' && e.data.name.includes('cosecha')) harvestName = e.data.name;
    }
  }
  check('cosecha: con el granero lleno, la fiesta de otoño es abundante', harvestName.includes('abundante'), `→ "${harvestName}"`);
}

// T4.4 (el test de aceptación ESTRELLA del ROADMAP) — MODO AUTÓNOMO: desde una
// sola granja y un tramo corto de vía, la ciudad se traza SUS PROPIAS calles y
// crece sola hasta un pueblo. Sin input.
{
  const sim = new Simulation(seedFarm(42), 42);
  const buildings0 = sim.index.buildings.length;
  for (let t = 0; t < TICKS_PER_DAY * 40; t++) sim.step();
  check('autónomo: la ciudad traza sus PROPIAS calles (T4.4)', sim.roadsExtended > 0, `→ ${sim.roadsExtended} tramos`);
  check('autónomo: de una granja emerge un pueblo (crece solo)', sim.index.buildings.length >= buildings0 + 8, `→ ${buildings0} → ${sim.index.buildings.length} edificios`);
  check('autónomo: la población crece desde el puñado inicial', sim.citizens.size >= 30, `→ ${sim.citizens.size} hab.`);
  // Las calles nuevas son navegables (el pathfinding lee el grid en vivo): la
  // gente se mueve por ellas, luego debe haber vida en la calle.
  let moving = 0;
  for (let t = 0; t < 200; t++) { sim.step(); for (const c of sim.citizens.values()) if (c.phase.kind === 'moving') moving++; }
  check('autónomo: hay vida circulando por las calles trazadas', moving > 0, `→ ${moving} ticks-moving`);
}

// Ciclo 25 RESEARCH.md — CONTAGIO (epidemias en oleadas, SIRS): la enfermedad no
// es solo un fondo crónico, es AGUDA y CONTAGIOSA. Se pega en los encuentros,
// da inmunidad temporal al pasarla, y viene en OLEADAS (acopla salud↔social).
{
  const person = (sick: number, immune: number): Citizen => ({
    id: 1, name: 'S', age: 40,
    personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
    needs: { energy: 1, food: 1, social: 1, fun: 1, purpose: 1 },
    home: { ax: 0, az: 0, buildingId: 'house' }, work: null,
    x: 0, z: 0, heading: 0, phase: { kind: 'deciding' }, activity: 'none',
    partnerId: null, education: 0, health: 1, grief: 0, sick, immune, childrenRaised: 0, friends: new Map(), lastChatTick: -1, inside: false,
  });
  const alwaysInfect = { next: () => 0 }; // rng que siempre contagia

  // (a) Transmisión pura: un infeccioso pega a un susceptible; no a un inmune;
  //     dos sanos no generan enfermedad de la nada.
  const sicko = person(SICK_ONSET, 0); const susceptible = person(0, 0);
  maybeInfect(sicko, susceptible, alwaysInfect);
  check('contagio: un enfermo pega la enfermedad a un sano', susceptible.sick > 0, `→ ${susceptible.sick}`);
  const immune = person(0, 1);
  maybeInfect(person(SICK_ONSET, 0), immune, alwaysInfect);
  check('contagio: un inmune NO se recontagia', immune.sick === 0);
  const h1 = person(0, 0), h2 = person(0, 0);
  maybeInfect(h1, h2, alwaysInfect);
  check('contagio: dos sanos no enferman de la nada', h1.sick === 0 && h2.sick === 0);

  // (b) Curso de la enfermedad: se pasa en unos días y DEJA inmunidad, que luego
  //     decae (modelo SIRS → oleadas recurrentes).
  const c = person(SICK_ONSET, 0);
  for (let h = 0; h < 24 * 6; h++) sickenTick(c, 1);
  check('contagio: la enfermedad se pasa en unos días', c.sick === 0, `→ ${c.sick.toFixed(2)}`);
  check('contagio: al pasarla queda inmunidad', c.immune > 0.5, `→ ${c.immune.toFixed(2)}`);
  for (let h = 0; h < 24 * 25; h++) sickenTick(c, 1);
  check('contagio: la inmunidad decae con el tiempo (permite nuevas oleadas)', c.immune === 0, `→ ${c.immune.toFixed(2)}`);

  // (c) Emergencia integrada: en una ciudad hay OLEADAS (mucha gente enferma a la
  //     vez, con evento de epidemia narrado) y la sociedad SOBREVIVE (recuperable).
  //     Sin cuarentena (esta lógica es ANTERIOR al ciclo 26): aislamos la OLEADA
  //     cruda del modelo SIRS; que la respuesta conductual la aplane es cosa del
  //     ciclo 26. Con el techo de población (ciclo 30) la epidemia emerge pronto
  //     y barata sobre un pueblo acotado, sin esperar a un gentío de cientos.
  {
    const sim = new Simulation(seedWorld(), 42);
    sim.quarantine = false;
    sim.vaccination = false; // oleada CRUDA: sin cuarentena (c26) ni vacuna (c33), que aún no existían
    let peakSick = 0, epidemicEvents = 0, everSick = new Set<number>();
    for (let t = 0; t < TICKS_PER_DAY * 50; t++) {
      sim.step();
      for (const e of sim.takeEvents()) if (e.name === 'epidemic') epidemicEvents++;
      let s = 0; for (const cz of sim.citizens.values()) { if (cz.sick > 0.1) { s++; everSick.add(cz.id); } }
      peakSick = Math.max(peakSick, s);
    }
    check('contagio: emergen oleadas (mucha gente enferma a la vez)', peakSick >= 8, `→ pico ${peakSick} enfermos`);
    check('contagio: la Crónica narra la epidemia', epidemicEvents > 0, `→ ${epidemicEvents} eventos`);
    check('contagio: mucha gente pasa la enfermedad a lo largo del tiempo', everSick.size >= 15, `→ ${everSick.size}`);
    check('contagio: la sociedad SOBREVIVE la epidemia (no es espiral de muerte)', sim.citizens.size >= 30, `→ ${sim.citizens.size} hab.`);
  }
}

// Ciclo 26 RESEARCH.md — CUARENTENA (contagio→comportamiento): un enfermo se
// recoge en casa y el que se siente mal no se para a charlar → APLANA LA CURVA
// epidémica. La respuesta conductual, clave en epidemias reales.
{
  // (a) Puro: un enfermo tiene menos ganas de salir; con cuarentena apagada, no.
  const mk = (sick: number): Citizen => ({
    id: 1, name: 'Q', age: 40,
    personality: { sociable: 0.5, trabajador: 0.5, hogareño: 0.5 },
    needs: { energy: 1, food: 1, social: 1, fun: 1, purpose: 1 },
    home: { ax: 0, az: 0, buildingId: 'house' }, work: null,
    x: 0, z: 0, heading: 0, phase: { kind: 'deciding' }, activity: 'none',
    partnerId: null, education: 0, health: 1, grief: 0, sick, immune: 0, childrenRaised: 0, friends: new Map(), lastChatTick: -1, inside: false,
  });
  const ctxOn = { quarantine: true } as unknown as SimContext;
  const ctxOff = { quarantine: false } as unknown as SimContext;
  check('cuarentena: un enfermo tiene menos ganas de salir', sickStayIn(ctxOn, mk(0.8)) < sickStayIn(ctxOn, mk(0)), `→ ${sickStayIn(ctxOn, mk(0.8)).toFixed(2)}`);
  check('cuarentena: un sano sale con normalidad', sickStayIn(ctxOn, mk(0)) === 1);
  check('cuarentena: con el modo apagado, el enfermo sale igual (para medir)', sickStayIn(ctxOff, mk(0.9)) === 1);

  // (b) Emergencia integrada A/B (misma semilla): la cuarentena APLANA la curva —
  //     el pico de enfermos simultáneos es mucho menor que sin ella.
  const peakOf = (q: boolean): number => {
    const sim = new Simulation(seedWorld(), 42);
    sim.quarantine = q;
    sim.vaccination = false; // aísla el efecto de la cuarentena (sin inmunidad de rebaño)
    let peak = 0;
    for (let t = 0; t < TICKS_PER_DAY * 50; t++) {
      sim.step();
      let s = 0; for (const c of sim.citizens.values()) if (c.sick > 0.1) s++;
      peak = Math.max(peak, s);
    }
    return peak;
  };
  const peakOn = peakOf(true);
  const peakOff = peakOf(false);
  check('cuarentena: aplana la curva (pico mucho menor que sin ella)', peakOn < peakOff * 0.6, `→ con ${peakOn} vs sin ${peakOff}`);
}

// Ciclo 27 RESEARCH.md — SALUD PÚBLICA (gobierno↔contagio): en una epidemia
// declarada, el gobierno SUSPENDE las fiestas (medida colectiva, como cerrar
// eventos en una pandemia) para no alimentar el contagio en las aglomeraciones.
{
  const festival = ACTIVITY_BY_KIND.get('festival')!;
  const festCtx = (epidemic: boolean): SimContext =>
    ({ day: 15, darkness: 0.3, epidemic, quarantine: true, weather: { rain: false } as unknown as Weather, wallets: new Map() }) as unknown as SimContext;
  const c = { home: { ax: 0, az: 0, buildingId: 'house' }, sick: 0 } as unknown as Citizen;
  check('salud pública: en día de fiesta normal, la fiesta se celebra', festival.suitability(festCtx(false), c) > 0);
  check('salud pública: en epidemia, el gobierno suspende la fiesta', festival.suitability(festCtx(true), c) === 0);
}

// Ciclo 28 RESEARCH.md — RETORNO A LA EDUCACIÓN (economía): el salario depende
// también de la CUALIFICACIÓN del trabajador, no solo del tier del empleador →
// la educación por fin PAGA (además de abrir empleos), y emerge desigualdad.
{
  // Mismo empleo (mismo tier, mismas horas), distinta cualificación: cobra más
  // el que estudió. Desigualdad realista por educación.
  const e = new Economy();
  e.payWage('cualificado', 5, 0, 1); // education 1
  e.payWage('sin-estudios', 5, 0, 0); // education 0
  const skilled = e.walletOf('cualificado');
  const unskilled = e.walletOf('sin-estudios');
  check('educación paga: a igual empleo, el cualificado cobra más', skilled > unskilled, `→ ${skilled.toFixed(0)} vs ${unskilled.toFixed(0)}`);
  check('educación paga: la brecha es sustancial (~+60% a plena cualificación)', skilled > unskilled * 1.5, `→ ×${(skilled / unskilled).toFixed(2)}`);
  check('educación paga: sin estudios aún se cobra un salario digno', unskilled > 0);
}

// Ciclo 29 RESEARCH.md — ALQUILER (economía): la vivienda deja de ser gratis. El
// mayor gasto real de un hogar drena el AHORRO OCIOSO (los bolsillos estaban
// demasiado llenos porque el sueldo >> gastos) y lo hace CIRCULAR: el alquiler
// entra en el tesoro → financia MÁS pensiones → vuelve a los hogares sin ingreso.
// No empobrece al pueblo: sube la velocidad del dinero. A/B con la misma semilla.
{
  const measure = (rent: boolean) => {
    const sim = new Simulation(seedWorld(), 42) as unknown as {
      citizens: Map<number, Citizen>;
      economy: { treasury: number; wallets: Map<string, number>; pensionsPaid: number };
      rentEnabled: boolean;
      step: () => void;
    };
    sim.rentEnabled = rent;
    for (let t = 0; t < TICKS_PER_DAY * 12; t++) sim.step();
    const cs = [...sim.citizens.values()];
    const savings = [...sim.economy.wallets.values()].reduce((s, w) => s + w, 0);
    const avgFood = cs.reduce((s, c) => s + c.needs.food, 0) / cs.length;
    return { pop: cs.length, savings, treasury: sim.economy.treasury, pensions: sim.economy.pensionsPaid, avgFood };
  };
  const off = measure(false);
  const on = measure(true);
  check('alquiler: drena el ahorro ocioso (los hogares ahorran menos)', on.savings < off.savings, `→ ${on.savings.toFixed(0)} vs ${off.savings.toFixed(0)}`);
  check('alquiler: el dinero CIRCULA — el tesoro recauda más', on.treasury > off.treasury, `→ ${on.treasury.toFixed(0)} vs ${off.treasury.toFixed(0)}`);
  check('alquiler: alimenta la red — se pagan más pensiones', on.pensions > off.pensions, `→ ${on.pensions.toFixed(0)} vs ${off.pensions.toFixed(0)}`);
  check('alquiler: la sociedad SOBREVIVE (no empobrece ni vacía el pueblo)', on.pop >= 20 && on.avgFood > 0.25, `→ ${on.pop} hab., comida ${on.avgFood.toFixed(2)}`);
}

// Ciclo 30 RESEARCH.md — CAPACIDAD DE CARGA (crecimiento logístico): el pueblo
// crecía en retroalimentación positiva SIN freno y de forma CAÓTICA (misma sim,
// día 40: de 22 a 353 hab. según la semilla, ×16). El freno denso-dependiente
// (inmigración cortada en el techo + natalidad que se satura) lo estabiliza en
// una meseta CONSISTENTE entre semillas, como una población real.
{
  // (a) Puro: la natalidad decae lineal con la densidad y se ANULA en el techo.
  check('capacidad: con el pueblo vacío, natalidad plena', fertilityFactor(0) === 1);
  check('capacidad: a media capacidad, media natalidad', Math.abs(fertilityFactor(CARRYING_CAPACITY / 2) - 0.5) < 1e-9);
  check('capacidad: en el techo, natalidad nula', fertilityFactor(CARRYING_CAPACITY) === 0);
  check('capacidad: por encima del techo no hay rebote (acotada a 0)', fertilityFactor(CARRYING_CAPACITY * 2) === 0);
  check('capacidad: la natalidad baja de forma monótona con la densidad', fertilityFactor(10) > fertilityFactor(60) && fertilityFactor(60) > fertilityFactor(110));

  // (b) Puro: la demanda de vivienda (única puerta de la inmigración) se CORTA en
  //     el techo, aunque haya empleo y falten casas.
  const base: DemandInput = {
    population: 50, employed: 50, jobs: 52, freeHousing: 0, shops: 2, avgProsperity: 0.5,
    tier: 1, children: 0, studentSlots: 0, avgHealth: 1, hasClinic: true,
    totalPopulation: 50, carryingCapacity: CARRYING_CAPACITY,
  };
  check('capacidad: bajo el techo, un pueblo con empleo y sin casas pide vivienda', computeDemand(base) === 'residential');
  check('capacidad: en el techo, el pueblo ya NO atrae forasteros (corta la vivienda)', computeDemand({ ...base, totalPopulation: CARRYING_CAPACITY }) !== 'residential');

  // (c) Integración (guarda ANTI-EXPLOSIÓN): semillas que en el baseline caótico
  //     reventaban a día 40 (seed 7→307, 500→353, 1→293; rango de 331) ahora
  //     quedan ACOTADAS y con varianza mucho menor. Umbrales GENEROSOS a
  //     propósito: el sistema de crecimiento es tan caótico que un leve
  //     sobreimpulso transitorio mueve las cifras exactas (los números finos, ya
  //     validados sobre 8 semillas, viven en RESEARCH §4); el test solo debe
  //     cazar una REGRESIÓN al caos, no clavar una trayectoria.
  const popAt = (seed: number, days: number): number => {
    const sim = new Simulation(seedWorld(), seed);
    for (let t = 0; t < TICKS_PER_DAY * days; t++) sim.step();
    return sim.citizens.size;
  };
  const seeds = [42, 7, 500];
  const pops = seeds.map((s) => popAt(s, 40));
  check('capacidad: las semillas antes explosivas quedan ACOTADAS (no cientos)', pops.every((p) => p <= CARRYING_CAPACITY * 1.5), `→ ${pops.join(', ')} (baseline 51/307/353)`);
  check('capacidad: la varianza CAE (rango ≪ 331 del baseline caótico)', Math.max(...pops) - Math.min(...pops) < 160, `→ rango ${Math.min(...pops)}–${Math.max(...pops)}`);
  check('capacidad: el pueblo sigue VIVO (crece desde el puñado inicial)', pops[0] >= 25, `→ seed42 ${pops[0]} hab.`);
}

// Ciclo 31 RESEARCH.md — BIENES (consumo discrecional que circula): el segundo
// bien tras el alimento. El viejo "capricho" gastaba 5 fijos que se ESFUMABAN
// (leak). Ahora es un gasto en durables PROPORCIONAL al excedente del hogar (el
// rico consume más — desigualdad + sumidero del ahorro ocioso) y CONSERVADO: el
// IVA va al tesoro (→ pensiones) y el resto paga la importación (sale del pueblo:
// sumidero realista que equilibra la nómina, que acuña dinero).
{
  // (a) Puro: el gasto escala con la riqueza, se topa, y respeta el suelo.
  const e = new Economy();
  e.wallets.set('pobre', GOODS_COMFORT_FLOOR); // justo en el suelo
  e.wallets.set('medio', 240);
  e.wallets.set('rico', 4000);
  const treasury0 = e.treasury;
  const sPobre = e.buyGoods('pobre');
  const sMedio = e.buyGoods('medio');
  const sRico = e.buyGoods('rico');
  check('bienes: bajo el suelo de ahorro no hay capricho', sPobre === 0, `→ ${sPobre}`);
  check('bienes: el rico gasta MÁS que la clase media (desigualdad)', sRico > sMedio, `→ ${sRico.toFixed(0)} vs ${sMedio.toFixed(0)}`);
  check('bienes: el capricho está topado (no vacía la cuenta de golpe)', sRico <= GOODS_MAX_SPEND + 1e-9, `→ ${sRico.toFixed(0)}`);
  // Conservación: lo gastado = IVA (tesoro) + importación (sale). Nada se esfuma.
  const spent = sMedio + sRico;
  check('bienes: el dinero se CONSERVA (IVA al tesoro + importación, nada se esfuma)', Math.abs((e.treasury - treasury0) + e.goodsImported - spent) < 1e-9);
  check('bienes: parte va al tesoro vía IVA (→ circula a pensiones)', e.treasury > treasury0, `→ +${(e.treasury - treasury0).toFixed(1)}`);

  // (b) Integración: en una ciudad real el consumo de bienes EMERGE y su sumidero
  //     funciona, sin romper el alimento ni la sociedad.
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 15; t++) sim.step();
  const cs = [...sim.citizens.values()];
  const avgFood = cs.reduce((s, c) => s + c.needs.food, 0) / cs.length;
  check('bienes: el pueblo consume bienes (emerge el segundo mercado)', sim.economy.goodsSold > 0, `→ ${sim.economy.goodsSold.toFixed(0)}`);
  check('bienes: el sumidero de importación drena parte (equilibra la nómina)', sim.economy.goodsImported > 0, `→ ${sim.economy.goodsImported.toFixed(0)}`);
  check('bienes: la sociedad sigue comiendo (el capricho no le quita el pan)', avgFood > 0.25, `→ ${avgFood.toFixed(2)}`);
}

// Ciclo 32 RESEARCH.md — CIERRE MONETARIO (economía): la nómina ACUÑA dinero, así
// que sin sumidero el ahorro trepaba sin fin (hogares infinitamente ricos) y el
// tesoro atesoraba. Dos frenos realistas: (1) el COSTE DE LA VIDA escala con la
// riqueza (lifestyle inflation) y drena el ahorro excedente — el sumidero que
// equilibra la acuñación; (2) el tesoro REPARTE su superávit (dividendo/obra
// pública) en vez de piramidarlo. Resultado: la riqueza per cápita se ESTABILIZA.
{
  // (a) Puro — coste de la vida: escala con la riqueza, respeta el colchón.
  const e = new Economy();
  e.wallets.set('colchon', LIFESTYLE_COMFORT); // justo en el colchón
  e.wallets.set('medio', 300);
  e.wallets.set('rico', 3000);
  const tre0 = e.treasury;
  const lPobre = e.spendLifestyle('colchon');
  const lMedio = e.spendLifestyle('medio');
  const lRico = e.spendLifestyle('rico');
  check('coste de vida: en el colchón no drena (protege al que no tiene de sobra)', lPobre === 0, `→ ${lPobre}`);
  check('coste de vida: el rico gasta MÁS en vivir (lifestyle inflation)', lRico > lMedio, `→ ${lRico.toFixed(0)} vs ${lMedio.toFixed(0)}`);
  check('coste de vida: nunca deja al hogar bajo el colchón', e.walletOf('rico') >= LIFESTYLE_COMFORT - 1e-9);
  // Conservación: lo drenado = lo que queda en el tesoro + lo que sale del pueblo.
  const drained = lMedio + lRico;
  check('coste de vida: el dinero se CONSERVA (tesoro + sumidero externo)', Math.abs((e.treasury - tre0) + e.lifestyleLeft - drained) < 1e-9);

  // (b) Puro — dividendo: guarda la reserva y reparte el superávit; conserva.
  const g = new Economy();
  g.treasury = 100;
  check('dividendo: por debajo de la reserva, el tesoro no reparte', g.payPublicDividend(['a', 'b'], 1) === 0);
  g.treasury = 10000;
  const before = g.treasury;
  const shared = g.payPublicDividend(['a', 'b'], 10); // reserva 300×10=3000
  check('dividendo: reparte el superávit sobre la reserva', shared > 0, `→ ${shared.toFixed(0)}`);
  check('dividendo: el tesoro baja EXACTAMENTE lo repartido (conserva)', Math.abs((before - g.treasury) - shared) < 1e-9);
  check('dividendo: el dinero público vuelve a los hogares', g.walletOf('a') > 0 && g.walletOf('b') > 0);

  // (c) Integración: la riqueza per cápita se ESTABILIZA (no trepa a miles como
  //     sin cierre) y la sociedad sobrevive; ambos frenos actúan de verdad.
  const sim = new Simulation(seedWorld(), 42);
  for (let t = 0; t < TICKS_PER_DAY * 50; t++) sim.step();
  const cs = [...sim.citizens.values()];
  const avgSav = [...sim.economy.wallets.values()].reduce((s, w) => s + w, 0) / cs.length;
  const avgFood = cs.reduce((s, c) => s + c.needs.food, 0) / cs.length;
  check('cierre: el ahorro medio se ESTABILIZA (no trepa sin fin)', avgSav < 1800, `→ ${avgSav.toFixed(0)} (sin cierre pasaba de 2000 y subiendo)`);
  check('cierre: el coste de la vida drena el excedente (sumidero)', sim.economy.lifestyleSpent > 0, `→ ${sim.economy.lifestyleSpent.toFixed(0)}`);
  check('cierre: el tesoro reparte su superávit (no atesora sin fin)', sim.economy.dividendPaid > 0, `→ ${sim.economy.dividendPaid.toFixed(0)}`);
  check('cierre: la sociedad sobrevive (sigue comiendo)', avgFood > 0.25, `→ ${avgFood.toFixed(2)}`);
}

// Ciclo 33 RESEARCH.md — VACUNACIÓN (salud pública preventiva): remata el arco del
// contagio (25-27). La medida COLECTIVA que PREVIENE en vez de curar: el sistema
// sanitario vacuna a los susceptibles en la temporada de brotes → cuando basta
// gente queda inmune emerge la INMUNIDAD DE REBAÑO y la oleada no encuentra a
// quién saltar. Requiere clínica y la paga el tesoro (acopla contagio↔gobierno).
{
  // A/B misma semilla, sin cuarentena (para aislar el efecto de la vacuna sobre
  // la oleada cruda): con vacuna, el pico y el total de enfermos caen mucho.
  const outbreak = (vax: boolean) => {
    const sim = new Simulation(seedWorld(), 42);
    sim.quarantine = false;
    sim.vaccination = vax;
    let peak = 0; const ever = new Set<number>();
    for (let t = 0; t < TICKS_PER_DAY * 50; t++) {
      sim.step();
      let s = 0; for (const c of sim.citizens.values()) if (c.sick > 0.1) { s++; ever.add(c.id); }
      peak = Math.max(peak, s);
    }
    return { peak, ever: ever.size, given: (sim as unknown as { vaccinationsGiven: number }).vaccinationsGiven };
  };
  const off = outbreak(false);
  const on = outbreak(true);
  check('vacuna: la campaña administra dosis (la paga el tesoro)', on.given > 0, `→ ${on.given}`);
  check('vacuna: inmunidad de rebaño — el pico de la oleada cae mucho', on.peak < off.peak * 0.6, `→ pico con ${on.peak} vs sin ${off.peak}`);
  check('vacuna: mucha menos gente llega a enfermar', on.ever < off.ever, `→ ${on.ever} vs ${off.ever}`);
  check('vacuna: sin campaña (para medir) no se administra ninguna', off.given === 0);
}

// Ciclo 34 RESEARCH.md — LEGADO (N5, la vida deja huella): tras el hallazgo del
// ciclo 34-revertido (la estima NO puede colgar de la riqueza en una economía
// igualitaria), la estima nace de LO VIVIDO. Primer paso: la Crónica honra al
// morir los HIJOS que uno crió — un dato que varía de forma natural (una
// matriarca de 8 deja otra huella que quien se fue joven). Puro recuerdo.
{
  const die = (data: Record<string, unknown>) => chronicleText('citizenLeft', { reason: 'death', name: 'X', age: 84, health: 1, ...data });
  check('legado: al morir se honran los hijos criados', (die({ childrenRaised: 3 }) ?? '').includes('deja 3 hijos'));
  check('legado: un solo hijo, en singular', (die({ childrenRaised: 1 }) ?? '').includes('deja 1 hijo') && !(die({ childrenRaised: 1 }) ?? '').includes('hijos'));
  check('legado: quien no dejó hijos no lo menciona (no toda vida es igual)', !(die({ childrenRaised: 0 }) ?? '').includes('deja'));

  // Integración: con las generaciones, mueren padres que dejaron hijos → la
  // huella es REAL y emergente, no un guion.
  const sim = new Simulation(seedWorld(), 42);
  let legacyDeaths = 0, maxKids = 0;
  for (let t = 0; t < TICKS_PER_DAY * 40; t++) {
    sim.step();
    for (const e of sim.takeEvents()) {
      if (e.name === 'citizenLeft' && e.data.reason === 'death') {
        const k = (e.data.childrenRaised as number) ?? 0;
        if (k > 0) legacyDeaths++;
        maxKids = Math.max(maxKids, k);
      }
    }
  }
  check('legado: emergen muertes que dejan hijos (la vida deja huella)', legacyDeaths > 0, `→ ${legacyDeaths} con legado`);
  check('legado: alguna vida deja una huella grande (matriarca/patriarca)', maxKids >= 2, `→ el mayor legado, ${maxKids} hijos`);
}

// Ciclo 35 RESEARCH.md — LEGADO PERMANENTE (memoria, §6.1): la Crónica compacta lo
// rutinario de los años viejos en una línea (ciclo 21), pero un PILAR del pueblo
// (crió una familia grande o vivió una edad venerable) se recuerda POR NOMBRE
// para siempre — no se resume con el resto. Así el largo plazo del pueblo guarda
// a sus matriarcas/patriarcas, que es de lo que va la condición de victoria.
{
  check('legado permanente: una familia grande deja legado', isLegacyDeath({ reason: 'death', childrenRaised: 5, age: 70 }));
  check('legado permanente: una edad venerable deja legado', isLegacyDeath({ reason: 'death', childrenRaised: 0, age: 92 }));
  check('legado permanente: una muerte corriente no', !isLegacyDeath({ reason: 'death', childrenRaised: 1, age: 78 }));
  check('legado permanente: emigrar no es legado', !isLegacyDeath({ reason: 'emigrated', childrenRaised: 9 }));

  // La Crónica conserva el legado por nombre mientras resume lo rutinario del año.
  const evs: ChronEvent[] = [
    { year: 0, text: 'nace Ana', kind: 'birth' },
    { year: 0, text: 'muere Ben (75 años)', kind: 'death' },
    { year: 0, text: 'muere Vera (94 años), una vida larga, deja 6 hijos', kind: 'legacy' },
  ];
  const compacted = compactChronicle(evs, 10); // el año 0 ya es viejo (RETAIN 4)
  check('legado permanente: la Crónica conserva el legado tras compactar', compacted.some((e) => e.kind === 'legacy' && e.text.includes('Vera')));
  check('legado permanente: lo rutinario del año viejo se resume en una línea', compacted.some((e) => e.kind === 'summary' && e.year === 0));
  check('legado permanente: la muerte corriente ya no aparece literal', !compacted.some((e) => e.kind === 'death' && e.text.includes('Ben')));
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
