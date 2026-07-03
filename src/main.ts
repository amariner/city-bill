/**
 * Punto de entrada: escena, cámara isométrica ortográfica y luz.
 * Sin controles ni UI todavía — solo la viñeta del primer barrio.
 */
import * as THREE from 'three';
import { PALETTE } from './palette';
import { buildNeighborhood } from './neighborhood';
import { buildShowcase } from './showcase';

const sceneName = new URLSearchParams(window.location.search).get('scene');

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// --- Escena -----------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.add(sceneName === 'buildings' ? buildShowcase() : buildNeighborhood());

// --- Cámara isométrica ------------------------------------------------------
// Ortográfica con azimut 45° y elevación ~32°: la vista "de maqueta" clásica.
const camera = new THREE.OrthographicCamera();
const VIEW_SIZE = 125; // metros visibles en el eje vertical

function frameCamera(): void {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW_SIZE * aspect) / 2;
  camera.right = (VIEW_SIZE * aspect) / 2;
  camera.top = VIEW_SIZE / 2;
  camera.bottom = -VIEW_SIZE / 2;
  camera.near = 1;
  camera.far = 1000;

  const azimuth = Math.PI / 4;
  const elevation = THREE.MathUtils.degToRad(32);
  const dist = 320;
  const target = sceneName === 'buildings' ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(15, 0, 15);
  camera.position.set(
    target.x + dist * Math.cos(elevation) * Math.sin(azimuth),
    target.y + dist * Math.sin(elevation),
    target.z + dist * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}
frameCamera();

// --- Luz --------------------------------------------------------------------
// Sol cálido lateral (sombras largas y suaves) + relleno ambiental frío.
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
sun.position.set(-90, 110, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -220;
sun.shadow.camera.right = 220;
sun.shadow.camera.top = 220;
sun.shadow.camera.bottom = -220;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0004;
scene.add(sun);

const ambient = new THREE.AmbientLight(PALETTE.ambient, 1.35);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xf5ead7, 0xb8ab90, 0.5);
scene.add(hemi);

// --- Bucle ------------------------------------------------------------------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  frameCamera();
});

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
