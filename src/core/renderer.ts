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

// --- Ciclo de luz (T1.8) ------------------------------------------------------
// El sol deriva LENTAMENTE su azimut a lo largo del día de juego, entre la hora
// dorada de la mañana y la de la tarde, y se entibia en los extremos. La
// ELEVACIÓN no cambia: las sombras siguen siendo largas SIEMPRE (regla de arte).
// La derivada por frame es minúscula (un día = 10 min reales), imperceptible.
const SUN_RADIUS = 108.2; // = hipotenusa horizontal del sol base (-90,·,60)
const SUN_HEIGHT = 110; // altura fija → elevación fija → sombras largas fijas
const SUN_BASE_AZ = Math.atan2(60, -90); // dirección base (la firma de siempre)
const SUN_SWING = (24 * Math.PI) / 180; // ±24° de barrido a lo largo del día
const _midday = new THREE.Color(PALETTE.sun);
const _golden = new THREE.Color(PALETTE.sunGolden);

/** Actualiza el sol según la fracción de día [0,1). Llamar cada frame con el
 * reloj de JUEGO (no el real): así el ciclo va ligado a la sim, no a los fps. */
export function updateSun(sun: THREE.DirectionalLight, dayFraction: number): void {
  const swing = Math.sin(dayFraction * Math.PI * 2); // periódico: sin saltos a medianoche
  const az = SUN_BASE_AZ + swing * SUN_SWING;
  sun.position.set(Math.cos(az) * SUN_RADIUS, SUN_HEIGHT, Math.sin(az) * SUN_RADIUS);
  // Calidez en los extremos del barrido (mañana/tarde doradas), neutra a mediodía.
  const warmth = Math.abs(swing);
  sun.color.copy(_midday).lerp(_golden, warmth);
  sun.intensity = 2.6 - 0.45 * warmth; // la hora dorada, algo más suave
}
