/**
 * Cliente main-thread de la sim: arranca el worker, guarda los DOS últimos
 * snapshots y expone posiciones INTERPOLADAS para animar a 60 fps entre ticks
 * de 250 ms (contrato §1.3). Sin THREE: devuelve arrays planos; el render
 * (world/render/citizens.ts) los convierte en instancias.
 */
import {
  MainToWorker,
  WorkerToMain,
  SnapshotMsg,
  Speed,
  AGENT_STRIDE,
  AgentState,
  CitizenInfoMsg,
} from './protocol';
import { TICK_REAL_S } from './clock';

export interface AgentView {
  id: number;
  /** Posición en CELDAS (float), ya interpolada. */
  x: number;
  z: number;
  heading: number;
  state: AgentState;
  activity: number;
}

export class SimClient {
  private worker: Worker;
  private prev: SnapshotMsg | null = null;
  private curr: SnapshotMsg | null = null;
  private currAt = 0; // performance.now() al llegar `curr`
  private byIdPrev = new Map<number, number>(); // id → offset en prev.agents
  speed: Speed = 1;
  /** Tiempo de juego (s) del último snapshot — para HUD. */
  gameTime = 0;
  /** Población y edificios del último snapshot — para la Crónica. */
  population = 0;
  buildings = 0;
  onCitizenInfo: ((info: CitizenInfoMsg) => void) | null = null;
  /** Eventos de sim (cityGrew, citizenBorn…) para que el main reaccione. */
  onEvent: ((name: string, data?: Record<string, unknown>) => void) | null = null;

  constructor(seed: number, gridJson: string) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerToMain>) => this.onMessage(ev.data);
    this.send({ type: 'init', seed, gridJson });
  }

  private send(msg: MainToWorker): void {
    this.worker.postMessage(msg);
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.send({ type: 'setSpeed', speed });
  }

  queryCitizen(id: number): void {
    this.send({ type: 'queryCitizen', id });
  }

  private onMessage(msg: WorkerToMain): void {
    switch (msg.type) {
      case 'snapshot': {
        this.prev = this.curr;
        this.byIdPrev.clear();
        if (this.prev) {
          for (let i = 0; i < this.prev.count; i++) {
            this.byIdPrev.set(this.prev.agents[i * AGENT_STRIDE], i * AGENT_STRIDE);
          }
        }
        this.curr = msg;
        this.currAt = performance.now();
        this.gameTime = msg.time;
        this.population = msg.count;
        this.buildings = msg.buildings;
        break;
      }
      case 'citizenInfo':
        this.onCitizenInfo?.(msg);
        break;
      case 'event':
        this.onEvent?.(msg.name, msg.data);
        break;
    }
  }

  /**
   * Vista interpolada de todos los agentes en este frame.
   * alpha = fracción transcurrida del intervalo de tick real.
   */
  view(out: AgentView[]): number {
    const c = this.curr;
    if (!c) return 0;
    const alpha = Math.min(1, (performance.now() - this.currAt) / (TICK_REAL_S * 1000));
    let n = 0;
    for (let i = 0; i < c.count; i++) {
      const o = i * AGENT_STRIDE;
      const id = c.agents[o];
      let x = c.agents[o + 1];
      let z = c.agents[o + 2];
      let heading = c.agents[o + 3];
      const po = this.byIdPrev.get(id);
      if (po !== undefined && this.prev) {
        const p = this.prev.agents;
        // Lerp posición; heading por el camino corto del círculo.
        x = p[po + 1] + (x - p[po + 1]) * alpha;
        z = p[po + 2] + (z - p[po + 2]) * alpha;
        let dh = heading - p[po + 3];
        if (dh > Math.PI) dh -= Math.PI * 2;
        if (dh < -Math.PI) dh += Math.PI * 2;
        heading = p[po + 3] + dh * alpha;
      }
      if (!out[n]) out[n] = { id: 0, x: 0, z: 0, heading: 0, state: 0, activity: 0 };
      const v = out[n++];
      v.id = id;
      v.x = x;
      v.z = z;
      v.heading = heading;
      v.state = c.agents[o + 4] as AgentState;
      v.activity = c.agents[o + 5];
    }
    return n;
  }
}
