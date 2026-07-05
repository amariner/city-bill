/**
 * Entry del Web Worker de simulación: envuelve `Simulation` con la mensajería
 * de protocol.ts. Cadencia real fija de 250 ms; cada intervalo ejecuta
 * SPEED_MULT[speed] sub-ticks (así ×3/×8 no cambia el resultado, solo el ritmo).
 */
import { Grid } from '../world/grid';
import { Simulation } from './simulation';
import { TICK_REAL_S, TICK_GAME_S, DAY_GAME_SECONDS } from './clock';
import { townCenter } from '../world/growth';
import {
  MainToWorker,
  WorkerToMain,
  Speed,
  SPEED_MULT,
  SnapshotMsg,
} from './protocol';

let sim: Simulation | null = null;
let speed: Speed = 1;
/** El bucle en vivo no corre hasta que el pre-crecido (si lo hay) termina. */
let ready = false;
/** Ticks de salto pendientes (banco de pruebas): un "+estación/+año" no congela
 * el worker de golpe — se consume a trozos por frame, así el salto se VE (reloj
 * y estaciones corriendo) en vez de bloquear con la pantalla quieta. */
let pendingSkip = 0;
/** Ticks de salto por frame: ~1.7 días de juego → un año salta en ~3-4 s visibles. */
const SKIP_TICKS_PER_FRAME = 4000;

/** Pre-crece la sim del worker N días de juego y la deja lista a mediodía (la
 * hora con más gente en la calle). Emite `growProgress` para el overlay y
 * DESCARTA los eventos del pasado (100 días de nacimientos/muertes no deben
 * inundar la Crónica al ir en vivo). Determinista por (semilla, días). */
function preGrow(s: Simulation, days: number): void {
  const ticksPerDay = Math.round(DAY_GAME_SECONDS / TICK_GAME_S);
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < ticksPerDay; t++) s.step();
    // El post cruza al hilo main aunque este bucle sea síncrono (hilos distintos).
    if ((d + 1) % 2 === 0 || d === days - 1) post({ type: 'growProgress', day: d + 1, total: days });
  }
  // Aterriza a las ~19:00: acabada la jornada, la gente sale a pasear, visitar y
  // charlar — el PICO de actividad al aire libre (medido: ~2× más gente en la
  // calle que a mediodía, cuando casi todos trabajan/estudian dentro). La ciudad
  // abre viva de un vistazo, con luz de atardecer.
  const toEvening = Math.round((19 / 24) * ticksPerDay);
  for (let t = 0; t < toEvening; t++) s.step();
  s.takeEvents(); // tira el historial del pre-crecido; a partir de aquí, en vivo
}

function post(msg: WorkerToMain, transfer?: Transferable[]): void {
  (self as unknown as Worker).postMessage(msg, { transfer });
}

function sendSnapshot(): void {
  if (!sim) return;
  const agents = sim.snapshot();
  const msg: SnapshotMsg = {
    type: 'snapshot',
    time: sim.clock.time,
    tick: sim.clock.tick,
    speed,
    count: sim.citizens.size,
    buildings: sim.index.buildings.length,
    city: sim.cityStats(),
    agents,
  };
  post(msg, [agents.buffer]);
  for (const e of sim.takeEvents()) post({ type: 'event', name: e.name, data: e.data });
}

setInterval(() => {
  if (!sim || !ready) return;
  if (pendingSkip > 0) {
    // Salto en curso: consume un lote por frame (ignora la velocidad normal) →
    // el reloj/estaciones corren a ojos vista hasta agotar el salto.
    const batch = Math.min(pendingSkip, SKIP_TICKS_PER_FRAME);
    for (let i = 0; i < batch; i++) sim.step();
    pendingSkip -= batch;
    sendSnapshot();
    return;
  }
  const steps = SPEED_MULT[speed];
  for (let i = 0; i < steps; i++) sim.step();
  sendSnapshot(); // también en pausa: el main sigue teniendo estado fresco
}, TICK_REAL_S * 1000);

self.onmessage = (ev: MessageEvent<MainToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init': {
      const grid = Grid.deserialize(msg.gridJson);
      sim = new Simulation(grid, msg.seed);
      if (msg.preGrowDays && msg.preGrowDays > 0) {
        // Banco de pruebas: madura la ciudad DENTRO del worker (su sim guarda
        // toda la vida: gente, edades, relaciones) y devuelve el grid resultante
        // para que el render dibuje lo mismo. Bloquea el worker ~seg, no el main.
        preGrow(sim, msg.preGrowDays);
        const anchors = sim.index.buildings
          .filter((b) => b.data.role !== 'nature')
          .map((b) => [b.ax, b.az] as [number, number]);
        const center: [number, number] = anchors.length > 0 ? townCenter(anchors) : [0, 6];
        post({ type: 'grownGrid', gridJson: sim.grid.serialize(), center });
      }
      ready = true;
      sendSnapshot();
      break;
    }
    case 'setSpeed':
      speed = msg.speed;
      break;
    case 'action': {
      // Fase 2/4: replicar construcción/demolición y reindexar.
      if (!sim) break;
      const a = msg.action;
      if (a.kind === 'demolish') sim.grid.removeBuilding(a.cx, a.cz);
      // 'place' necesita el footprint → catalogData (pendiente de Fase 2).
      sim.index.rebuild();
      sim.economy.rebuild(sim.index, sim.citizens);
      break;
    }
    case 'queryCitizen': {
      const info = sim?.describe(msg.id);
      if (info && sim) post({ type: 'citizenInfo', id: msg.id, ...info });
      break;
    }
    case 'dev': {
      // Banco de pruebas (?scene=test-dev): forzar/observar mecánicas ya
      // existentes. Los efectos inmediatos (bandera, epidemia) mandan un
      // snapshot al momento; el salto de tiempo se encola (lo consume el bucle).
      if (!sim) break;
      const c = msg.cmd;
      if (c.kind === 'setFlag') {
        switch (c.flag) {
          case 'quarantine': sim.quarantine = c.value; break;
          case 'vaccination': sim.vaccination = c.value; break;
          case 'clinicHealing': sim.clinicHealing = c.value; break;
          case 'rentEnabled': sim.rentEnabled = c.value; break;
          case 'autonomousGrowth': sim.autonomousGrowth = c.value; break;
        }
        sendSnapshot();
      } else if (c.kind === 'forceEpidemic') {
        sim.forceEpidemic();
        sendSnapshot();
      } else if (c.kind === 'advanceDays') {
        // No se ejecuta aquí (bloquearía): se encola y el bucle lo consume por
        // frames, así el salto se ve correr en vez de congelar la pantalla.
        pendingSkip += Math.round((c.days * DAY_GAME_SECONDS) / TICK_GAME_S);
      }
      break;
    }
  }
};
