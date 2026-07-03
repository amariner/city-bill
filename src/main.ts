/**
 * Punto de entrada: ensambla stage (renderer + luz), cámara isométrica jugable,
 * escena y bucle. La lógica vive en core/ y world/; aquí solo se conecta todo.
 */
import { createStage } from './core/renderer';
import { IsoCamera } from './core/camera';
import { Input } from './core/input';
import { CameraController } from './core/cameraController';
import { GameLoop } from './core/loop';
import { buildNeighborhood } from './neighborhood';
import { buildShowcase } from './showcase';

const sceneName = new URLSearchParams(window.location.search).get('scene');

const stage = createStage();
stage.scene.add(sceneName === 'buildings' ? buildShowcase() : buildNeighborhood());

const camera = new IsoCamera();
camera.setTarget(sceneName === 'buildings' ? 0 : 20, sceneName === 'buildings' ? 0 : 20);
camera.setZoomIndex(1);
camera.apply();

const input = new Input(stage.renderer.domElement);
const controller = new CameraController(camera, input);

window.addEventListener('resize', () => {
  stage.renderer.setSize(window.innerWidth, window.innerHeight);
  camera.resize();
});

const loop = new GameLoop(() => stage.renderer.render(stage.scene, camera.cam));
loop.onUpdate((dt) => controller.update(dt));
loop.start();
