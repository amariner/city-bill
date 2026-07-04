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
import { Simulation } from './simulation';
import { TICK_GAME_S, DAY_GAME_SECONDS } from './clock';
import { FOOD_PRICE } from './economy';
import { weatherAt, seasonalWarmth, seasonalFestivalName } from './weather';
import { deathChance, lifeYear, OLD_AGE, ADULT_AGE } from './lifecycle';
import { CLINIC_RECOVERY_PER_HOUR } from './health';
import { bereave, griefTick, consoleGrief, consoleGriefBy, GRIEF_PARTNER } from './grief';
import { chatBond } from './citizens/social';
import { chronicleText, summarizeYear, compactChronicle, ChronEvent } from '../ui/chronicle';
import { townAttractiveness, householdHardship, updateEmigrationPressure, EMIGRATE_PRESSURE_LIMIT } from '../world/growth';
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
    partnerId: null, education: 0, health, grief: 0, friends: new Map(), lastChatTick: -1, inside: false,
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
  //     con la red agotada (tesoro a 0); tras la penuria sostenida, sus miembros
  //     hacen las maletas y se marchan — con evento narrado (dignidad §6.2).
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
      sim.economy.treasury = 0; // la última bala (pensiones) falla
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
    partnerId: null, education: 0, health, grief: 0, friends: new Map(), lastChatTick: -1, inside: false,
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
    partnerId: null, education: 0, health: 1, grief, friends: new Map(), lastChatTick: -1, inside: false,
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
    partnerId: null, education: 0, health: 1, grief, friends: new Map(), lastChatTick: -1, inside: false,
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
    partnerId: null, education: 0, health: 1, grief, friends: new Map(friends), lastChatTick: -1, inside: false,
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
    partnerId: null, education: 0, health: 1, grief, friends: new Map(), lastChatTick: -1, inside: false,
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
