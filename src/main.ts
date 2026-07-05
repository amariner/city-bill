/**
 * Punto de entrada: ensambla stage (renderer + luz), cámara isométrica jugable,
 * mundo (por chunks) y bucle. La lógica vive en core/ y world/; aquí se conecta.
 */
import { createStage, updateSun, updateSeason } from './core/renderer';
import { IsoCamera } from './core/camera';
import { Input } from './core/input';
import { CameraController } from './core/cameraController';
import { GameLoop } from './core/loop';
import { DebugHud } from './core/debugHud';
import { createWorldView } from './neighborhood';
import { seedWorld, seedFarm } from './world/seed';
import { extendRoad, townCenter } from './world/growth';
import { Simulation } from './sim/simulation';
import { CELL_SIZE } from './world/grid';
import { createRng } from './rng';
import { buildShowcase } from './showcase';
import { SimClient, AgentView } from './sim/client';
import { CitizenView } from './world/render/citizens';
import { ConstructionView } from './world/render/construction';
import { SelectionMarker } from './world/render/selectionMarker';
import { DAY_GAME_SECONDS, TICK_GAME_S } from './sim/clock';
import { seasonalWarmth } from './sim/weather';
import { updateTerrainSeason } from './world/render/terrain';
import { Speed } from './sim/protocol';
import { CitizenInspector } from './ui/inspector';
import { Chronicle } from './ui/chronicle';
import { CityHud } from './ui/cityHud';
import { ControlBar } from './ui/controlBar';
import { Toasts } from './ui/toasts';

const sceneName = new URLSearchParams(window.location.search).get('scene');

/** Semilla del mundo: la guardada, o una nueva aleatoria que se persiste. Así el
 * pueblo es único por jugador y sobrevive a las recargas. `?seed=N` la fuerza
 * (útil para compartir un pueblo o reproducir un bug). */
function pickWorldSeed(): number {
  const KEY = 'city-bill:worldSeed';
  const forced = new URLSearchParams(window.location.search).get('seed');
  if (forced !== null && Number.isFinite(Number(forced))) return Number(forced) >>> 0;
  const stored = localStorage.getItem(KEY);
  if (stored !== null && Number.isFinite(Number(stored))) return Number(stored) >>> 0;
  const seed = Math.floor(Math.random() * 0x7fffffff); // bootstrap de sesión, no lógica de sim
  try { localStorage.setItem(KEY, String(seed)); } catch { /* localStorage lleno: mundo efímero */ }
  return seed;
}

/** Overlay de la vitrina `?scene=grown`: mensaje de carga → caption del pueblo. */
function showGrownOverlay(): { done: (caption: string) => void } {
  const load = document.createElement('div');
  load.textContent = 'generando el pueblo…';
  load.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
    'font:14px/1.4 ui-monospace,monospace', 'color:#2d3327', 'letter-spacing:0.04em',
    'padding:12px 20px', 'background:rgba(241,239,230,0.92)',
    'border:1px solid rgba(45,51,39,0.18)', 'border-radius:10px',
    'box-shadow:0 1px 8px rgba(45,51,39,0.14)', 'z-index:20', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(load);
  return {
    done(caption: string) {
      load.remove();
      const cap = document.createElement('div');
      cap.textContent = caption;
      cap.style.cssText = [
        'position:fixed', 'top:14px', 'left:50%', 'transform:translateX(-50%)',
        'max-width:90vw', 'text-align:center',
        'font:12px/1.4 ui-monospace,monospace', 'color:#2d3327', 'letter-spacing:0.02em',
        'padding:8px 16px', 'background:rgba(241,239,230,0.92)',
        'border:1px solid rgba(45,51,39,0.18)', 'border-radius:10px',
        'box-shadow:0 1px 6px rgba(45,51,39,0.12)', 'z-index:20', 'pointer-events:none',
      ].join(';');
      document.body.appendChild(cap);
    },
  };
}

const stage = createStage();

const camera = new IsoCamera();
camera.setZoomIndex(1);

let worldView: ReturnType<typeof createWorldView> | null = null;
let simClient: SimClient | null = null;
let citizenView: CitizenView | null = null;
let construction: ConstructionView | null = null;
let selectionMarker: SelectionMarker | null = null;
let chronicle: Chronicle | null = null;
let toasts: Toasts | null = null;
if (sceneName === 'buildings') {
  stage.scene.add(buildShowcase());
  camera.setTarget(0, 0);
} else if (sceneName === 'grown') {
  // Vitrina de la CONSTRUCCIÓN AUTÓNOMA: corre la sim en el hilo principal unos
  // días de juego y muestra el pueblo que la ciudad se ha construido sola desde
  // una granja — calles, mezcla de densidades y todo. Estático (sin worker): es
  // una foto del RESULTADO, para apreciar de un vistazo lo que emerge sin input.
  const worldSeed = pickWorldSeed();
  const overlay = showGrownOverlay();
  camera.setTarget(0, 2);
  camera.setZoomIndex(2);
  // Deferimos dos frames para que el mensaje se pinte antes del cálculo bloqueante.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const growDays = 90;
    const sim = new Simulation(seedFarm(worldSeed), worldSeed);
    for (let i = 0; i < growDays * Math.round(DAY_GAME_SECONDS / TICK_GAME_S); i++) sim.step();
    worldView = createWorldView(sim.grid);
    stage.scene.add(worldView.root);
    const anchors = sim.index.buildings.filter((b) => b.data.role !== 'nature').map((b) => [b.ax, b.az] as [number, number]);
    const [ccx, ccz] = townCenter(anchors);
    camera.setTarget(ccx * CELL_SIZE, ccz * CELL_SIZE);
    const stats = sim.cityStats();
    const roads = sim.roadsExtended;
    const streets = `${roads} ${roads === 1 ? 'calle trazada' : 'calles trazadas'}`;
    overlay.done(`Este pueblo se construyó solo — ${growDays} días desde una granja · ${stats.population} habitantes · ${sim.index.buildings.length} edificios · ${streets}`);
  }));
} else {
  // Semilla del mundo: aleatoria la primera vez y PERSISTIDA — cada jugador
  // tiene su propio pueblo (no el mismo para todos) y perdura al recargar.
  // Math.random aquí es bootstrap de sesión (elegir partida), no lógica de
  // mundo: a partir de la semilla, todo es 100% determinista.
  const worldSeed = pickWorldSeed();
  // Escenario "granja" (?scene=farm): arranque mínimo para el modo autónomo
  // (T4.4) — la ciudad se traza sus propias calles desde una sola granja.
  const grid = sceneName === 'farm' ? seedFarm(worldSeed) : seedWorld(worldSeed);
  worldView = createWorldView(grid);
  stage.scene.add(worldView.root);
  camera.setTarget(sceneName === 'farm' ? 0 : 20, sceneName === 'farm' ? 2 : 20);

  // Simulación en worker (T3.1+). Velocidad con teclas 0-3.
  simClient = new SimClient(worldSeed, grid.serialize());
  citizenView = new CitizenView();
  stage.scene.add(citizenView.root);
  // Obras en curso: el sector de construcción autónoma se ve levantarse (T4.2).
  construction = new ConstructionView(grid, worldView);
  stage.scene.add(construction.root);
  selectionMarker = new SelectionMarker();
  stage.scene.add(selectionMarker.root);
  // Crecimiento autónomo (T4.2): el worker construye → replicamos en el
  // grid de render y refrescamos el chunk (misma colocación, mismo mundo).
  chronicle = new Chronicle(worldSeed);
  toasts = new Toasts(); // avisos efímeros de los eventos memorables (surfacing)
  const roadRng = createRng(worldSeed ^ 0x1d872b41); // arbolado de las vías nuevas (solo visual)
  simClient.onEvent = (name, data) => {
    chronicle?.onEvent(name, data);
    toasts?.onEvent(name, data);
    if (!data || !worldView) return;
    if (name === 'cityGrew') {
      const { id, cx, cz, rot } = data as { id: string; cx: number; cz: number; rot: 0 | 1 | 2 | 3 };
      // La obra se ANIMA (andamio → subida → pop); al terminar, ConstructionView
      // hornea el edificio en el grid de render. No lo colocamos aquí.
      construction?.spawn(id, cx, cz, rot);
    } else if (name === 'roadExtended') {
      // T4.4: la ciudad trazó una calle en el worker → la replicamos EN EL RENDER.
      // La calzada/márgenes son deterministas (sin RNG); el arbolado puede diferir.
      const { fromX, fromZ, dx, dz, length } = data as { fromX: number; fromZ: number; dx: number; dz: number; length: number };
      const laid = extendRoad(grid, [fromX, fromZ], { dx, dz }, length, roadRng);
      for (const [cx, cz] of laid) worldView.refreshChunkAt(cx, cz);
      // Refresca también los márgenes/arbolado (±3 alrededor de la calzada).
      for (let s = 1; s <= length; s++) worldView.refreshChunkAt(fromX + dx * s, fromZ + dz * s);
    }
  };
  window.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '3') simClient!.setSpeed(Number(e.key) as Speed);
  });
}
camera.apply();

const input = new Input(stage.renderer.domElement);
const controller = new CameraController(camera, input);
const hud = new DebugHud(stage.renderer, camera);
const inspector = simClient ? new CitizenInspector(stage.renderer, camera, simClient) : null;
// HUD de ciudad (surfacing): siempre visible mientras haya simulación.
const cityHud = simClient ? new CityHud() : null;
// Barra de control: marca + velocidad clicable + leyenda de controles.
const controlBar = simClient ? new ControlBar((s) => simClient!.setSpeed(s)) : null;

window.addEventListener('resize', () => {
  stage.renderer.setSize(window.innerWidth, window.innerHeight);
  camera.resize();
});

const agentViews: AgentView[] = [];

const loop = new GameLoop(() => stage.renderer.render(stage.scene, camera.cam));
loop.onUpdate((dt) => {
  controller.update(dt);
  construction?.update(dt); // obras en curso (FX cosmético, dt real)
  if (worldView) hud.setStats({ chunks: worldView.countVisibleChunks(camera.cam) });
  if (simClient && citizenView) {
    const n = simClient.view(agentViews);
    citizenView.update(agentViews, n, dt);
    if (inspector) {
      inspector.setAgents(agentViews, n);
      inspector.update(agentViews, n);
      // Marcador de selección: sigue al ciudadano abierto en el inspector.
      if (selectionMarker) {
        const sel = inspector.selected;
        let selView: AgentView | null = null;
        if (sel !== null) {
          for (let i = 0; i < n; i++) {
            if (agentViews[i].id === sel && agentViews[i].state !== 0 /* Inside */) {
              selView = agentViews[i];
              break;
            }
          }
        }
        selectionMarker.update(selView, dt);
      }
    }
    const t = simClient.gameTime;
    updateSun(stage.sun, (t % DAY_GAME_SECONDS) / DAY_GAME_SECONDS); // ciclo de luz T1.8
    const day = Math.floor(t / DAY_GAME_SECONDS);
    const warmth = seasonalWarmth(day);
    updateSeason(stage, warmth); // tinte estacional de luz/cielo (T5.1 paso 1)
    updateTerrainSeason(warmth); // nieve del terreno en invierno (T5.1 paso 2)
    const h = (t % DAY_GAME_SECONDS) / 3600;
    const hh = String(Math.floor(h)).padStart(2, '0');
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    hud.setStats({ agents: n, clock: `${hh}:${mm} día ${day} ×${simClient.speed}` });
    cityHud?.update(simClient.city, { day, hour: h, speed: simClient.speed });
    controlBar?.update(simClient.speed);
    chronicle?.update(t, simClient.population, simClient.buildings);
  }
  hud.update(dt);
});
loop.start();
