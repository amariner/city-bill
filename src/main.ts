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
import { createWorldView, worldGrid } from './neighborhood';
import { catalogItem } from './world/catalog';
import { buildShowcase } from './showcase';
import { SimClient, AgentView } from './sim/client';
import { CitizenView } from './world/render/citizens';
import { DAY_GAME_SECONDS } from './sim/clock';
import { seasonalWarmth } from './sim/weather';
import { updateTerrainSeason } from './world/render/terrain';
import { Speed } from './sim/protocol';
import { CitizenInspector } from './ui/inspector';
import { Chronicle } from './ui/chronicle';

const sceneName = new URLSearchParams(window.location.search).get('scene');

const stage = createStage();

const camera = new IsoCamera();
camera.setZoomIndex(1);

let worldView: ReturnType<typeof createWorldView> | null = null;
let simClient: SimClient | null = null;
let citizenView: CitizenView | null = null;
let chronicle: Chronicle | null = null;
if (sceneName === 'buildings') {
  stage.scene.add(buildShowcase());
  camera.setTarget(0, 0);
} else {
  worldView = createWorldView();
  stage.scene.add(worldView.root);
  camera.setTarget(20, 20);

  // Simulación en worker (T3.1+). Velocidad con teclas 0-3.
  simClient = new SimClient(20260703, worldGrid.serialize());
  citizenView = new CitizenView();
  stage.scene.add(citizenView.root);
  // Crecimiento autónomo (T4.2): el worker construye → replicamos en el
  // grid de render y refrescamos el chunk (misma colocación, mismo mundo).
  chronicle = new Chronicle(20260703);
  simClient.onEvent = (name, data) => {
    chronicle?.onEvent(name, data);
    if (name !== 'cityGrew' || !data || !worldView) return;
    const { id, cx, cz, rot } = data as { id: string; cx: number; cz: number; rot: 0 | 1 | 2 | 3 };
    const it = catalogItem(id);
    if (!it) return;
    worldGrid.placeBuilding(id, it.w, it.d, cx, cz, rot);
    worldView.refreshChunkAt(cx, cz);
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
    chronicle?.update(t, simClient.population, simClient.buildings);
  }
  hud.update(dt);
});
loop.start();
