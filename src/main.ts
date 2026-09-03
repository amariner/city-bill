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
import { Pointer } from './core/pointer';
import { ToolState } from './core/tools';
import { WorldView } from './world/render/worldView';
import { seedWorld, seedFarm, seedSandbox } from './world/seed';
import { buildShowcase } from './showcase';
import { SimClient, AgentView } from './sim/client';
import { CitizenView } from './world/render/citizens';
import { SelectionMarker } from './world/render/selectionMarker';
import { ConstructionSites } from './world/render/construction';
import { Ghost } from './world/render/ghost';
import { ZonesLayer } from './world/render/zones';
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
import { ControlBar } from './ui/controlBar';
import { Toolbar } from './ui/toolbar';
import { Grid, cellToWorld } from './world/grid';
import { clearSave, loadSave, writeSave } from './save/save';

const sceneName = new URLSearchParams(window.location.search).get('scene');
const query = new URLSearchParams(window.location.search);
const saveEnabled = sceneName === null;
if (saveEnabled && query.get('new') === '1') clearSave();
const initialSave = saveEnabled && query.get('new') !== '1' ? loadSave() : null;

/** Semilla del mundo: la guardada, o una nueva aleatoria que se persiste. Así el
 * pueblo es único por jugador y sobrevive a las recargas. `?seed=N` la fuerza
 * (útil para compartir un pueblo o reproducir un bug). */
function pickWorldSeed(): number {
  const KEY = 'city-bill:worldSeed';
  const forced = new URLSearchParams(window.location.search).get('seed');
  if (forced !== null && Number.isFinite(Number(forced))) return Number(forced) >>> 0;
  if (initialSave && Number.isFinite(initialSave.seed)) return initialSave.seed >>> 0;
  const stored = localStorage.getItem(KEY);
  if (stored !== null && Number.isFinite(Number(stored))) return Number(stored) >>> 0;
  const seed = Math.floor(Math.random() * 0x7fffffff); // bootstrap de sesión, no lógica de sim
  try { localStorage.setItem(KEY, String(seed)); } catch { /* localStorage lleno: mundo efímero */ }
  return seed;
}

const stage = createStage();

const camera = new IsoCamera();
camera.setZoomIndex(1);

let worldView: WorldView | null = null;
let simClient: SimClient | null = null;
let citizenView: CitizenView | null = null;
let selectionMarker: SelectionMarker | null = null;
let construction: ConstructionSites | null = null;
let atmosphere: Atmosphere | null = null;
let chronicle: Chronicle | null = null;
let toasts: Toasts | null = null;
let inspector: CitizenInspector | null = null;
let cityHud: CityHud | null = null;
let devPanel: DevPanel | null = null;
let controlBar: ControlBar | null = null;
let toolbar: Toolbar | null = null;
let toolState: ToolState | null = null;
let ghost: Ghost | null = null;
let zonesLayer: ZonesLayer | null = null;
let hoverCell: [number, number] = [0, 0];
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
  worldView = new WorldView(grid);
  stage.scene.add(worldView.root);
  // Atmósfera del anochecer (T5.4): luces de ventana, humo y bandada. Escanea el
  // árbol del mundo (ventanas/chimeneas marcadas) y añade su propio grupo de FX.
  atmosphere = new Atmosphere(worldView.root);
  stage.scene.add(atmosphere.root);
  citizenView = new CitizenView();
  stage.scene.add(citizenView.root);
  selectionMarker = new SelectionMarker();
  stage.scene.add(selectionMarker.root);
  // FX de construcción (T4.2): anima cada obra nueva (andamio → pop) en vez de
  // que el edificio aparezca de golpe.
  construction = new ConstructionSites(worldView);
  stage.scene.add(construction.root);
  ghost = new Ghost(grid);
  stage.scene.add(ghost.root);
  zonesLayer = new ZonesLayer(grid);
  stage.scene.add(zonesLayer.root);
  // La máquina de herramientas se registra antes que el inspector para que Esc
  // cancele primero la herramienta activa y solo después pueda cerrar la ficha.
  toolState = new ToolState(sim);
  toolbar = new Toolbar(sim, toolState);
  ghost.onRoadCost = (cost) => toolbar?.setRoadCost(cost);
  toolState.onChange = (tool) => {
    ghost?.update(tool, hoverCell);
    zonesLayer?.setToolActive(tool.kind === 'zone');
    toolbar?.update();
  };
  chronicle = new Chronicle(worldSeed);
  toasts = new Toasts(); // avisos efímeros de los eventos memorables (surfacing)
  // Toda mutación espacial llega del worker como diff. El render solo aplica el
  // resultado y se ocupa de sus efectos visuales (chunk y construcción).
  sim.onGridPatch = (patch) => {
    grid.applyPatch(patch.cells);
    worldView?.refreshCells(patch.cells);
    zonesLayer?.refreshCells(patch.cells);
    for (const built of patch.built) {
      const started = construction?.start(built.id, built.cx, built.cz, built.rot, () => atmosphere?.invalidate());
      if (!started) {
        worldView?.refreshChunkAt(built.cx, built.cz);
        atmosphere?.invalidate();
      }
    }
    if (patch.razed.length > 0) atmosphere?.invalidate();
  };
  sim.onActionApplied = () => ghost?.resolve(true);
  sim.onActionRejected = (msg) => {
    ghost?.resolve(false);
    toasts?.onActionRejected(msg.reason);
  };
  sim.onEvent = (name, data) => {
    chronicle?.onEvent(name, data);
    toasts?.onEvent(name, data);
    if (!data || !worldView) return;
    if (name === 'homePrestige') {
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

  inspector = new CitizenInspector(camera, sim);
  cityHud = new CityHud(); // surfacing: siempre visible mientras haya simulación
  // Barra de control (rescate de la veta INTERFAZ): velocidad clicable + leyenda
  // de controles para quien llega en frío. Solo DOM; la lógica sigue en la sim.
  controlBar = new ControlBar((s) => sim.setSpeed(s), saveEnabled ? {
    seed: worldSeed,
    onNewGame: () => {
      clearSave();
      window.location.reload();
    },
  } : undefined);
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
  simClient.onWorldReady = (gridJson, center) => {
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
  let savedGrid: Grid | null = null;
  if (initialSave && initialSave.seed === worldSeed) {
    try {
      const parsed = JSON.parse(initialSave.saveBlob) as { gridJson?: unknown };
      if (typeof parsed.gridJson === 'string') savedGrid = Grid.deserialize(parsed.gridJson);
    } catch {
      // Si el slot está corrupto, la semilla normal sigue siendo jugable.
    }
  }
  const grid = savedGrid ?? (sceneName === 'sandbox'
    ? seedSandbox(worldSeed)
    : sceneName === 'farm' ? seedFarm(worldSeed) : seedWorld(worldSeed));
  camera.setTarget(sceneName === 'sandbox' || sceneName === 'farm' ? 0 : 20, sceneName === 'sandbox' ? 0 : sceneName === 'farm' ? 2 : 20);
  simClient = new SimClient(worldSeed, grid.serialize(), 0, sceneName !== 'sandbox', initialSave?.seed === worldSeed ? initialSave.saveBlob : undefined);
  if (saveEnabled) {
    simClient.onSaveReady = (msg) => writeSave({ seed: worldSeed, saveBlob: msg.saveBlob });
    window.setInterval(() => simClient?.save('auto'), 10_000);
    window.addEventListener('beforeunload', () => simClient?.save('unload'));
  }
  buildRenderAndUi(grid, worldSeed);
}
camera.apply();

const input = new Input(stage.renderer.domElement);
const controller = new CameraController(camera, input);
const hud = new DebugHud(stage.renderer, camera);
const pointer = new Pointer(stage.renderer.domElement, camera);
pointer.onHover = (cell) => {
  hoverCell = cell;
  hud.setHoverCell(cell);
  ghost?.update(toolState?.active ?? { kind: 'none' }, cell);
};
pointer.onClick = (cell, button) => {
  if (button !== 'left') return;
  if (toolState?.isActive) {
    const seq = toolState.handleClick(cell, button);
    if (seq !== null) ghost?.markPending();
  }
  else inspector?.pickCell(cell);
};
pointer.onDragStart = (cell, button) => {
  if (button === 'left' && toolState?.isActive) toolState.handleDragStart(cell, button);
};
pointer.onDrag = (dx, dy, cell, button) => {
  if (button === 'left' && toolState?.isActive) toolState.handleDrag(cell, button);
  else input.feedPan(dx, dy);
};
pointer.onDragEnd = (cell, button) => {
  if (button !== 'left' || !toolState?.isActive) return;
  const seq = toolState.handleDragEnd(cell, button);
  if (seq !== null) ghost?.markPending();
};

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
  ghost?.update(toolState?.active ?? { kind: 'none' }, hoverCell);
  construction?.update(dt); // FX de construcción en curso (T4.2)
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
    controlBar?.update(simClient.speed); // resalta la pastilla de velocidad activa
    toolbar?.update();
    devPanel?.update();
    chronicle?.update(t, simClient.population, simClient.buildings);
  }
  hud.update(dt);
});
loop.start();
