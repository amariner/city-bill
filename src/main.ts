/**
 * Punto de entrada: ensambla stage (renderer + luz), cámara isométrica, escena
 * y bucle. La lógica vive en core/ y world/; aquí solo se conecta todo.
 */
import { createStage } from './core/renderer';
import { IsoCamera } from './core/camera';
import { GameLoop } from './core/loop';
import { buildNeighborhood } from './neighborhood';
import { buildShowcase } from './showcase';

const sceneName = new URLSearchParams(window.location.search).get('scene');

const stage = createStage();
stage.scene.add(sceneName === 'buildings' ? buildShowcase() : buildNeighborhood());

const camera = new IsoCamera();
camera.setTarget(sceneName === 'buildings' ? 0 : 15, sceneName === 'buildings' ? 0 : 15);
camera.setZoomIndex(1);
camera.apply();

window.addEventListener('resize', () => {
  stage.renderer.setSize(window.innerWidth, window.innerHeight);
  camera.resize();
});

const loop = new GameLoop(() => stage.renderer.render(stage.scene, camera.cam));
loop.onUpdate((dt) => {
  camera.updateZoom(dt);
  camera.apply();
});
loop.start();
