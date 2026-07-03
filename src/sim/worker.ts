/**
 * Entry del Web Worker de simulación: envuelve `Simulation` con la mensajería
 * de protocol.ts. Cadencia real fija de 250 ms; cada intervalo ejecuta
 * SPEED_MULT[speed] sub-ticks (así ×3/×8 no cambia el resultado, solo el ritmo).
 */
import { Grid } from '../world/grid';
import { Simulation } from './simulation';
import { TICK_REAL_S } from './clock';
import {
  MainToWorker,
  WorkerToMain,
  Speed,
  SPEED_MULT,
  SnapshotMsg,
} from './protocol';

let sim: Simulation | null = null;
let speed: Speed = 1;

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
    agents,
  };
  post(msg, [agents.buffer]);
  for (const e of sim.takeEvents()) post({ type: 'event', name: e.name, data: e.data });
}

setInterval(() => {
  if (!sim) return;
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
  }
};
