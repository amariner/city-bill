/**
 * Punto de entrada: ensambla stage (renderer + luz), cámara isométrica jugable,
 * mundo (por chunks) y bucle. La lógica vive en core/ y world/; aquí se conecta.
 */
import { createStage } from './core/renderer';
import { IsoCamera } from './core/camera';
import { Input } from './core/input';
import { CameraController } from './core/cameraController';
import { GameLoop } from './core/loop';
import { DebugHud } from './core/debugHud';
import { createWorldView, worldGrid } from './neighborhood';
import { buildShowcase } from './showcase';
import { SimClient, AgentView } from './sim/client';
import { CitizenView } from './world/render/citizens';
import { DAY_GAME_SECONDS } from './sim/clock';
import { Speed } from './sim/protocol';

const sceneName = new URLSearchParams(window.location.search).get('scene');

const stage = createStage();

const camera = new IsoCamera();
camera.setZoomIndex(1);

let worldView: ReturnType<typeof createWorldView> | null = null;
let simClient: SimClient | null = null;
let citizenView: CitizenView | null = null;
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
  window.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '3') simClient!.setSpeed(Number(e.key) as Speed);
  });
}
camera.apply();

const input = new Input(stage.renderer.domElement);
const controller = new CameraController(camera, input);
const hud = new DebugHud(stage.renderer, camera);

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
    const t = simClient.gameTime;
    const day = Math.floor(t / DAY_GAME_SECONDS);
    const h = (t % DAY_GAME_SECONDS) / 3600;
    const hh = String(Math.floor(h)).padStart(2, '0');
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    hud.setStats({ agents: n, clock: `${hh}:${mm} día ${day} ×${simClient.speed}` });
  }
  hud.update(dt);
});
loop.start();
