/**
 * Punto de entrada: ensambla stage (renderer + luz), cámara isométrica jugable,
 * mundo (por chunks) y bucle. La lógica vive en core/ y world/; aquí se conecta.
 */
import { createStage, updateSun, updateSeason, updateNight } from './core/renderer';
import { IsoCamera } from './core/camera';
import { Input } from './core/input';
import { CameraController } from './core/cameraController';
import { GameLoop } from './core/loop';
import { DebugHud } from './core/debugHud';
import { createWorldView } from './neighborhood';
import { seedWorld, seedFarm } from './world/seed';
import { extendRoad } from './world/growth';
import { createRng } from './rng';
import { catalogItem } from './world/catalog';
import { buildShowcase } from './showcase';
import { SimClient, AgentView } from './sim/client';
import { CitizenView } from './world/render/citizens';
import { SelectionMarker } from './world/render/selectionMarker';
import { Atmosphere, lampFactor } from './world/render/atmosphere';
import { DAY_GAME_SECONDS } from './sim/clock';
import { seasonalWarmth, weatherAt } from './sim/weather';
import { isFestivalDay } from './sim/citizens/activities';
import { updateTerrainSeason } from './world/render/terrain';
import { Speed } from './sim/protocol';
import { CitizenInspector } from './ui/inspector';
import { Chronicle } from './ui/chronicle';
import { CityHud } from './ui/cityHud';
import { Toasts } from './ui/toasts';
import { DevPanel } from './ui/devPanel';
import { Grid, cellToWorld } from './world/grid';

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

const stage = createStage();

const camera = new IsoCamera();
camera.setZoomIndex(1);

let worldView: ReturnType<typeof createWorldView> | null = null;
let simClient: SimClient | null = null;
let citizenView: CitizenView | null = null;
let selectionMarker: SelectionMarker | null = null;
let atmosphere: Atmosphere | null = null;
let chronicle: Chronicle | null = null;
let toasts: Toasts | null = null;
let inspector: CitizenInspector | null = null;
let cityHud: CityHud | null = null;
let devPanel: DevPanel | null = null;
/** Semilla realmente en juego: la del pueblo montado (fija la estación/fiestas
 * del bucle de render). La fija `buildRenderAndUi`. */
let activeSeed = 0;

/** Monta el RENDER + UI a partir de un grid ya poblado, sobre el `simClient` ya
 * creado. En el juego normal el grid es el sembrado; en el banco de pruebas
 * (?scene=test-dev) es el grid MADURO que el worker devuelve tras pre-crecer su
 * sim (misma ciudad que la sim, cero divergencia). El worker es dueño de la vida
 * (gente, edades, relaciones); aquí solo se dibuja y se conecta la UI. */
function buildRenderAndUi(grid: Grid, worldSeed: number): void {
  const sim = simClient!;
  activeSeed = worldSeed;
  worldView = createWorldView(grid);
  stage.scene.add(worldView.root);
  // Atmósfera del anochecer (T5.4): luces de ventana, humo y bandada. Escanea el
  // árbol del mundo (ventanas/chimeneas marcadas) y añade su propio grupo de FX.
  atmosphere = new Atmosphere(worldView.root);
  stage.scene.add(atmosphere.root);
  citizenView = new CitizenView();
  stage.scene.add(citizenView.root);
  selectionMarker = new SelectionMarker();
  stage.scene.add(selectionMarker.root);
  chronicle = new Chronicle(worldSeed);
  toasts = new Toasts(); // avisos efímeros de los eventos memorables (surfacing)
  const roadRng = createRng(worldSeed ^ 0x1d872b41); // arbolado de las vías nuevas (solo visual)
  // Crecimiento autónomo (T4.2/T4.4): el worker construye en vivo → replicamos en
  // el grid de render y refrescamos el chunk (misma colocación, mismo mundo).
  sim.onEvent = (name, data) => {
    chronicle?.onEvent(name, data);
    toasts?.onEvent(name, data);
    if (!data || !worldView) return;
    if (name === 'cityGrew') {
      const { id, cx, cz, rot } = data as { id: string; cx: number; cz: number; rot: 0 | 1 | 2 | 3 };
      const it = catalogItem(id);
      if (!it) return;
      grid.placeBuilding(id, it.w, it.d, cx, cz, rot);
      worldView.refreshChunkAt(cx, cz);
      atmosphere?.invalidate(); // ventanas/chimeneas nuevas → re-escanear
    } else if (name === 'roadExtended') {
      // La calzada/márgenes son deterministas (sin RNG); el arbolado puede diferir.
      const { fromX, fromZ, dx, dz, length } = data as { fromX: number; fromZ: number; dx: number; dz: number; length: number };
      const laid = extendRoad(grid, [fromX, fromZ], { dx, dz }, length, roadRng);
      for (const [cx, cz] of laid) worldView.refreshChunkAt(cx, cz);
      // Refresca también los márgenes/arbolado (±3 alrededor de la calzada).
      for (let s = 1; s <= length; s++) worldView.refreshChunkAt(fromX + dx * s, fromZ + dz * s);
    } else if (name === 'homePrestige') {
      // Estatus (ciclo 9): decora ESA vivienda (jardín) sin re-sincronizar todo.
      const { ax, az, prestige } = data as { ax: number; az: number; prestige: number };
      worldView.setHomePrestige(ax, az, prestige);
    } else if (name === 'cultivationChanged') {
      // Faena agrícola agregada (T3.8): surcos sobre el barbecho.
      const { level } = data as { level: number };
      worldView.setCultivation(level);
    }
  };
  window.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '3') sim.setSpeed(Number(e.key) as Speed);
  });

  inspector = new CitizenInspector(stage.renderer, camera, sim);
  cityHud = new CityHud(); // surfacing: siempre visible mientras haya simulación
  // Panel del banco de pruebas: solo en ?scene=test-dev (fuerza/observa mecánicas).
  if (sceneName === 'test-dev') devPanel = new DevPanel(sim);
}

/** Centra la cámara en el centro de masa de la ciudad (para el modo dev, que
 * abre sobre un pueblo ya extendido y no sabe de antemano dónde ha crecido). */
function centerCameraOn(centerCell: [number, number]): void {
  const [wx, wz] = cellToWorld(centerCell[0], centerCell[1]);
  camera.setTarget(wx, wz);
  camera.apply();
}

if (sceneName === 'buildings') {
  stage.scene.add(buildShowcase());
  camera.setTarget(0, 0);
} else if (sceneName === 'test-dev') {
  // BANCO DE PRUEBAS: una ciudad ya avanzada y VIVA de un vistazo. El worker
  // PRE-CRECE su propia sim (así conserva toda la vida: gente, edades, vínculos)
  // y devuelve el grid maduro para dibujarlo. La semilla es fija (pueblo
  // reproducible para testear a ojo), forzable con ?seed=; los días de
  // maduración con ?days= y el encuadre con ?zoom=.
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  const devSeed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) >>> 0 : 0x7e57de5;
  const daysParam = Number(params.get('days'));
  const growDays = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(400, Math.floor(daysParam)) : 100;
  const zoomParam = Number(params.get('zoom'));
  const devZoom = Number.isFinite(zoomParam) ? zoomParam : 1; // ?zoom= para encuadrar el banco
  camera.setTarget(0, 6).setZoomIndex(devZoom);
  const overlay = makeLoadingOverlay(growDays);
  // Semilla mínima (granja): la ciudad se traza sus propias calles al crecer — el
  // pueblo resultante es trama 2D tupida, el más vistoso para el banco de pruebas.
  simClient = new SimClient(devSeed, seedFarm(devSeed).serialize(), growDays);
  simClient.onGrowProgress = (day) => overlay.progress(day);
  simClient.onGrownGrid = (gridJson, center) => {
    buildRenderAndUi(Grid.deserialize(gridJson), devSeed);
    centerCameraOn(center);
    simClient!.setSpeed(2); // arranca en ×3: la ciudad se ve vivir sin esperar
    overlay.remove();
  };
} else {
  // Semilla del mundo: aleatoria la primera vez y PERSISTIDA — cada jugador
  // tiene su propio pueblo (no el mismo para todos) y perdura al recargar.
  // Math.random aquí es bootstrap de sesión (elegir partida), no lógica de
  // mundo: a partir de la semilla, todo es 100% determinista.
  const worldSeed = pickWorldSeed();
  // Escenario "granja" (?scene=farm): arranque mínimo para el modo autónomo
  // (T4.4) — la ciudad se traza sus propias calles desde una sola granja.
  const grid = sceneName === 'farm' ? seedFarm(worldSeed) : seedWorld(worldSeed);
  camera.setTarget(sceneName === 'farm' ? 0 : 20, sceneName === 'farm' ? 2 : 20);
  simClient = new SimClient(worldSeed, grid.serialize());
  buildRenderAndUi(grid, worldSeed);
}
camera.apply();

const input = new Input(stage.renderer.domElement);
const controller = new CameraController(camera, input);
const hud = new DebugHud(stage.renderer, camera);

/** Overlay de carga para el pre-crecido del banco de pruebas (pastel, discreto). */
function makeLoadingOverlay(total: number): { progress(day: number): void; remove(): void } {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:14px',
    'background:rgba(221,208,184,0.97)',
    'z-index:100',
    'color:#2d3327',
    'font:14px/1.4 ui-monospace,monospace',
  ].join(';');
  const title = document.createElement('div');
  title.textContent = 'construyendo una ciudad viva…';
  title.style.cssText = 'font-size:16px;font-weight:600;letter-spacing:0.02em';
  const barOuter = document.createElement('div');
  barOuter.style.cssText = 'width:260px;height:6px;background:rgba(45,51,39,0.15);border-radius:3px;overflow:hidden';
  const barInner = document.createElement('div');
  barInner.style.cssText = 'height:100%;width:0%;background:#a9c286;transition:width 0.15s linear';
  barOuter.appendChild(barInner);
  const sub = document.createElement('div');
  sub.style.cssText = 'opacity:0.6;font-size:12px';
  el.appendChild(title);
  el.appendChild(barOuter);
  el.appendChild(sub);
  document.body.appendChild(el);
  return {
    progress(day: number): void {
      barInner.style.width = `${Math.round((day / total) * 100)}%`;
      sub.textContent = `madurando la simulación · día ${day} de ${total}`;
    },
    remove(): void {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 420);
    },
  };
}

window.addEventListener('resize', () => {
  stage.renderer.setSize(window.innerWidth, window.innerHeight);
  camera.resize();
});

const agentViews: AgentView[] = [];

const loop = new GameLoop(() => stage.renderer.render(stage.scene, camera.cam));
loop.onUpdate((dt) => {
  controller.update(dt);
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
    // Render rico: paleta estacional del terreno/vegetación (T5.1) y decoración
    // de fiesta en los edificios cívicos (ciclo 10) — se recomponen los chunks.
    worldView?.setSeason(weatherAt(activeSeed, day).season);
    worldView?.setFestivalActive(isFestivalDay(day));
    const h = (t % DAY_GAME_SECONDS) / 3600;
    updateNight(stage, lampFactor(h)); // hora azul: atenúa/enfría al anochecer (T5.4)
    updateTerrainSeason(warmth); // nieve del terreno en invierno (T5.1 paso 2)
    atmosphere?.update(h, dt); // juice del anochecer: luces de ventana, humo, bandada (T5.4)
    const hh = String(Math.floor(h)).padStart(2, '0');
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    hud.setStats({ agents: n, clock: `${hh}:${mm} día ${day} ×${simClient.speed}` });
    cityHud?.update(simClient.city, { day, hour: h, speed: simClient.speed });
    devPanel?.update();
    chronicle?.update(t, simClient.population, simClient.buildings);
  }
  hud.update(dt);
});
loop.start();
