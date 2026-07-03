/**
 * Setup del renderer, la escena y la iluminación firmada.
 * Un único sitio donde se toca WebGL y las luces (el sol se expone para el
 * ciclo día/tarde de T1.8).
 */
import * as THREE from 'three';
import { PALETTE } from '../palette';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
}

export function createStage(): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);

  // Sol cálido lateral: sombras largas. Es la firma de luz del juego.
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
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(PALETTE.ambient, 1.35);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xf5ead7, 0xb8ab90, 0.5);
  scene.add(hemi);

  return { renderer, scene, sun, ambient, hemi };
}
