/**
 * Fábrica de props low-poly: árboles, casa de campo, granero, cobertizo.
 * Todo son primitivas flat-shaded sin texturas; el estilo sale de la
 * paleta, las proporciones y las sombras.
 */
import * as THREE from 'three';
import { PALETTE } from './palette';
import { createRng } from './rng';

const materialCache = new Map<number, THREE.MeshLambertMaterial>();

export function mat(color: number): THREE.MeshLambertMaterial {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materialCache.set(color, m);
  }
  return m;
}

function solid(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Árbol de copa redonda (silueta de "huevo" verde oscuro). */
export function blobTree(scale = 1, alt = false): THREE.Group {
  const g = new THREE.Group();
  const trunk = solid(new THREE.CylinderGeometry(0.14 * scale, 0.18 * scale, 0.7 * scale, 6), PALETTE.trunk);
  trunk.position.y = 0.35 * scale;
  const crown = solid(new THREE.SphereGeometry(1.15 * scale, 10, 8), alt ? PALETTE.treeBlobAlt : PALETTE.treeBlob);
  crown.scale.set(1, 1.35, 1);
  crown.position.y = 1.9 * scale;
  g.add(trunk, crown);
  return g;
}

/** Ciprés (cono alto y estrecho). */
export function cypress(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = solid(new THREE.CylinderGeometry(0.1 * scale, 0.13 * scale, 0.5 * scale, 6), PALETTE.trunk);
  trunk.position.y = 0.25 * scale;
  const crown = solid(new THREE.ConeGeometry(0.7 * scale, 3.6 * scale, 8), PALETTE.cypress);
  crown.position.y = 2.2 * scale;
  g.add(trunk, crown);
  return g;
}

/** Prisma con tejado a dos aguas (cuerpo + tejado), base de casas y cobertizos. */
function gabledVolume(
  w: number,
  d: number,
  wallH: number,
  roofH: number,
  wallColor: number,
  roofColor: number,
): THREE.Group {
  const g = new THREE.Group();
  const body = solid(new THREE.BoxGeometry(w, wallH, d), wallColor);
  body.position.y = wallH / 2;
  g.add(body);

  // Tejado: prisma triangular extruido a lo largo de Z
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.18, 0);
  shape.lineTo(w / 2 + 0.18, 0);
  shape.lineTo(0, roofH);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.36, bevelEnabled: false });
  roofGeo.translate(0, 0, -(d + 0.36) / 2);
  const roof = solid(roofGeo, roofColor);
  roof.position.y = wallH;
  g.add(roof);
  return g;
}

/** Casa de campo blanca: volumen principal + ala cruzada + porche con columnas. */
export function farmhouse(): THREE.Group {
  const g = new THREE.Group();

  const main = gabledVolume(7.5, 5.2, 3.1, 2.2, PALETTE.houseWall, PALETTE.houseRoof);
  g.add(main);

  const wing = gabledVolume(4.2, 5.6, 2.9, 2.0, PALETTE.houseWall, PALETTE.houseRoof);
  wing.rotation.y = Math.PI / 2;
  wing.position.set(-2.2, 0, 2.6);
  g.add(wing);

  // Porche delantero: losa, tejadillo plano y columnas
  const slab = solid(new THREE.BoxGeometry(5.4, 0.25, 2.2), PALETTE.porch);
  slab.position.set(1.2, 0.13, 3.6);
  g.add(slab);
  const canopy = solid(new THREE.BoxGeometry(5.4, 0.18, 2.3), PALETTE.houseTrim);
  canopy.position.set(1.2, 2.55, 3.6);
  g.add(canopy);
  for (const x of [-1.1, 0.4, 1.9, 3.4]) {
    const col = solid(new THREE.BoxGeometry(0.16, 2.3, 0.16), PALETTE.houseTrim);
    col.position.set(x, 1.4, 4.5);
    g.add(col);
  }

  // Ventanas encendibles del frente (a la izquierda del porche, sin taparse).
  for (const x of [-2.7, -1.4]) {
    const win = litWindow(0.9, 0.95);
    win.position.set(x, 1.6, 2.61);
    g.add(win);
  }

  // Chimenea
  const chimney = solid(new THREE.BoxGeometry(0.55, 1.4, 0.55), PALETTE.houseWallShade);
  chimney.position.set(2.4, 5.2, -1.2);
  tagChimney(chimney, 0.7);
  g.add(chimney);

  return g;
}

/** Granero rojo con tejado gambrel (perfil de "arco" facetado). */
export function barn(w = 6, d = 8, wallH = 2.4): THREE.Group {
  const g = new THREE.Group();
  const body = solid(new THREE.BoxGeometry(w, wallH, d), PALETTE.barnWall);
  body.position.y = wallH / 2;
  g.add(body);

  // Perfil gambrel facetado
  const hw = w / 2 + 0.15;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw * 0.62, w * 0.42);
  shape.lineTo(0, w * 0.58);
  shape.lineTo(-hw * 0.62, w * 0.42);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.3, bevelEnabled: false });
  roofGeo.translate(0, 0, -(d + 0.3) / 2);
  const roof = solid(roofGeo, PALETTE.barnRoof);
  roof.position.y = wallH;
  g.add(roof);

  // Portón claro en el hastial
  const door = solid(new THREE.BoxGeometry(w * 0.36, wallH * 0.8, 0.1), PALETTE.barnTrim);
  door.position.set(0, wallH * 0.4, d / 2 + 0.06);
  g.add(door);

  return g;
}

/** Cobertizo pequeño blanco. */
export function shed(): THREE.Group {
  return gabledVolume(2.2, 2.6, 1.6, 1.1, PALETTE.houseWall, PALETTE.houseRoof);
}

/** Casita de pueblo: volumen a dos aguas con porche opcional. */
export function cottage(w = 5, d = 4.2, porchSide = true): THREE.Group {
  const g = gabledVolume(w, d, 2.7, 1.9, PALETTE.houseWall, PALETTE.houseRoof);

  if (porchSide) {
    const slab = solid(new THREE.BoxGeometry(w * 0.55, 0.22, 1.5), PALETTE.porch);
    slab.position.set(0, 0.11, d / 2 + 0.75);
    g.add(slab);
    const canopy = solid(new THREE.BoxGeometry(w * 0.55, 0.14, 1.6), PALETTE.houseTrim);
    canopy.position.set(0, 2.2, d / 2 + 0.75);
    g.add(canopy);
    for (const x of [-w * 0.22, w * 0.22]) {
      const col = solid(new THREE.BoxGeometry(0.14, 2.0, 0.14), PALETTE.houseTrim);
      col.position.set(x, 1.1, d / 2 + 1.4);
      g.add(col);
    }
  }

  const win = litWindow(1.0, 0.95);
  win.position.set(-w * 0.2, 1.55, d / 2 + 0.06);
  g.add(win);

  const chimney = solid(new THREE.BoxGeometry(0.45, 1.0, 0.45), PALETTE.houseWallShade);
  chimney.position.set(w * 0.25, 3.6, 0);
  tagChimney(chimney, 0.5);
  g.add(chimney);
  return g;
}

/** Tienda/almacén de pueblo: volumen bajo con frente recto y toldo. */
export function shop(): THREE.Group {
  const g = new THREE.Group();
  const body = solid(new THREE.BoxGeometry(6.5, 3.2, 5), PALETTE.houseWall);
  body.position.y = 1.6;
  g.add(body);
  const parapet = solid(new THREE.BoxGeometry(6.9, 0.5, 5.4), PALETTE.houseWallShade);
  parapet.position.y = 3.35;
  g.add(parapet);
  const awning = solid(new THREE.BoxGeometry(5.8, 0.12, 1.3), PALETTE.barnWall);
  awning.position.set(0, 2.3, 3.1);
  g.add(awning);
  const door = solid(new THREE.BoxGeometry(1.1, 2.0, 0.1), PALETTE.houseWallShade);
  door.position.set(0, 1.0, 2.56);
  g.add(door);
  return g;
}

// ---------------------------------------------------------------------------
// Edificios urbanos (tiers T2-T4). Las ventanas van en un InstancedMesh por
// edificio: retícula sobre las fachadas con mezcla determinista de ventanas
// "encendidas" (cálidas) y "apagadas" (frías).
// ---------------------------------------------------------------------------

// Material de ventana COMPARTIDO (una sola compilación de shader). El cristal
// base es frío; el brillo cálido de "encendida" se suma como EMISSIVE por
// instancia vía el atributo `aGlow` (vec3), que Atmosphere sube al anochecer.
// Se añade a la emisión SIN tocar el difuso → las apagadas siguen leyéndose como
// cristal normal a plena luz, y las encendidas brillan aunque el pueblo se atenúe.
let _windowMat: THREE.MeshLambertMaterial | null = null;
function windowMaterial(): THREE.MeshLambertMaterial {
  if (_windowMat) return _windowMat;
  const m = new THREE.MeshLambertMaterial({ color: PALETTE.windowCool });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute vec3 aGlow;\nvarying vec3 vGlow;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vGlow = aGlow;',
      );
    shader.fragmentShader = 'varying vec3 vGlow;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vGlow;',
      );
  };
  _windowMat = m;
  return m;
}

function windowGrid(
  g: THREE.Group,
  w: number,
  d: number,
  wallH: number,
  floors: number,
  opts: { colSpacing?: number; litRatio?: number; sides?: boolean; groundFloor?: boolean } = {},
): void {
  const { colSpacing = 1.7, litRatio = 0.35, sides = false, groundFloor = true } = opts;
  const floorH = wallH / floors;
  const slots: Array<[number, number, number, boolean]> = []; // x, y, z, girado 90°

  const addFace = (faceW: number, fixed: number, alongX: boolean) => {
    const cols = Math.max(1, Math.floor((faceW - 1.4) / colSpacing));
    const start = -((cols - 1) * colSpacing) / 2;
    for (let f = groundFloor ? 0 : 1; f < floors; f++) {
      const y = floorH * (f + 0.55);
      for (let c = 0; c < cols; c++) {
        const off = start + c * colSpacing;
        if (alongX) slots.push([off, y, fixed, false]);
        else slots.push([fixed, y, off, true]);
      }
    }
  };
  addFace(w, d / 2 + 0.04, true);
  addFace(w, -d / 2 - 0.04, true);
  if (sides) {
    addFace(d, w / 2 + 0.04, false);
    addFace(d, -w / 2 - 0.04, false);
  }

  const geo = new THREE.BoxGeometry(0.85, floorH * 0.42, 0.12);
  const inst = new THREE.InstancedMesh(geo, windowMaterial(), slots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const rot90 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  const one = new THREE.Vector3(1, 1, 1);
  // T5.4: cada ventana lleva su ficha de encendido. `canLight` = fracción que
  // puede iluminarse (el resto es cristal frío, nunca enciende); `threshold` = en
  // qué punto del atardecer prende (efecto "una a una"). El brillo cálido vive en
  // el atributo por instancia `aGlow` (arranca a 0 = apagado); Atmosphere lo sube.
  const canLight = new Uint8Array(slots.length);
  const threshold = new Float32Array(slots.length);
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(slots.length * 3), 3);
  geo.setAttribute('aGlow', glow);
  slots.forEach(([x, y, z, turned], i) => {
    m.compose(new THREE.Vector3(x, y, z), turned ? rot90 : q, one);
    inst.setMatrixAt(i, m);
    canLight[i] = ((i * 37 + 11) % 100) / 100 < litRatio ? 1 : 0;
    threshold[i] = ((i * 97 + 43) % 100) / 100; // orden pseudo-aleatorio del anochecer
  });
  inst.userData.kind = 'windows';
  inst.userData.canLight = canLight;
  inst.userData.threshold = threshold;
  g.add(inst);
}

/** Marca un mesh de chimenea para que Atmosphere emita humo desde su boca
 * (`topOffset` = altura desde el centro del mesh hasta la boca, en unidades de
 * mundo; invariante a la rotación del edificio porque el humo sube en +Y). */
function tagChimney(mesh: THREE.Mesh, topOffset: number): void {
  mesh.userData.kind = 'chimney';
  mesh.userData.topOffset = topOffset;
}

/** Ventana "encendible" para casas pequeñas (mesh individual, no instanciado):
 * cristal frío con MATERIAL PROPIO cuyo `emissiveIntensity` sube Atmosphere al
 * anochecer (0 de día → cálido de noche). Así el pueblo entero —no sólo los
 * bloques urbanos— se ilumina. El escalonado "una a una" lo fija Atmosphere por
 * la posición de mundo de cada ventana. */
export function litWindow(w: number, h: number): THREE.Mesh {
  const m = new THREE.MeshLambertMaterial({ color: PALETTE.windowCool });
  m.emissive = new THREE.Color(PALETTE.windowLit);
  m.emissiveIntensity = 0; // apagada de día; Atmosphere la enciende
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), m);
  mesh.castShadow = false;
  mesh.userData.kind = 'litWindow';
  return mesh;
}

/** Bloque de viviendas tipo "panelák": losa larga de hormigón claro. */
export function apartmentSlab(floors = 6, w = 20, d = 8): THREE.Group {
  const g = new THREE.Group();
  const wallH = floors * 2.6;
  const body = solid(new THREE.BoxGeometry(w, wallH, d), PALETTE.concrete);
  body.position.y = wallH / 2;
  g.add(body);
  const roof = solid(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3), PALETTE.flatRoof);
  roof.position.y = wallH + 0.25;
  g.add(roof);
  const stair = solid(new THREE.BoxGeometry(2.2, wallH + 1.4, 1.2), PALETTE.concreteShade);
  stair.position.set(w * 0.18, (wallH + 1.4) / 2, d / 2 + 0.35);
  g.add(stair);
  const canopy = solid(new THREE.BoxGeometry(3.2, 0.2, 1.8), PALETTE.concreteShade);
  canopy.position.set(-w * 0.22, 2.4, d / 2 + 0.8);
  g.add(canopy);
  windowGrid(g, w, d, wallH, floors, { litRatio: 0.3 });
  return g;
}

/** Bloque de ladrillo estilo Zlín: rojizo con retícula de ventanas crema. */
export function brickBlock(floors = 5, w = 13, d = 9): THREE.Group {
  const g = new THREE.Group();
  const wallH = floors * 2.7;
  const body = solid(new THREE.BoxGeometry(w, wallH, d), PALETTE.brick);
  body.position.y = wallH / 2;
  g.add(body);
  const roof = solid(new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4), PALETTE.flatRoof);
  roof.position.y = wallH + 0.3;
  g.add(roof);
  const base = solid(new THREE.BoxGeometry(w + 0.2, 0.8, d + 0.2), PALETTE.brickShade);
  base.position.y = 0.4;
  g.add(base);
  windowGrid(g, w, d, wallH, floors, { colSpacing: 1.5, litRatio: 0.5, sides: true, groundFloor: false });
  return g;
}

/** Torre de oficinas: volumen gris con franjas verticales de vidrio. */
export function officeBlock(floors = 8, w = 9, d = 9): THREE.Group {
  const g = new THREE.Group();
  const wallH = floors * 2.7;
  const body = solid(new THREE.BoxGeometry(w, wallH, d), PALETTE.concreteShade);
  body.position.y = wallH / 2;
  g.add(body);
  for (const [fx, fz, turned] of [
    [0, d / 2 + 0.05, false],
    [0, -d / 2 - 0.05, false],
    [w / 2 + 0.05, 0, true],
    [-w / 2 - 0.05, 0, true],
  ] as const) {
    for (let s = -1; s <= 1; s++) {
      const strip = solid(new THREE.BoxGeometry(1.4, wallH * 0.92, 0.12), PALETTE.glass);
      strip.castShadow = false;
      strip.position.set(turned ? fx : s * 2.4, wallH * 0.5, turned ? s * 2.4 : fz);
      if (turned) strip.rotation.y = Math.PI / 2;
      g.add(strip);
    }
  }
  const crown = solid(new THREE.BoxGeometry(w + 0.3, 0.7, d + 0.3), PALETTE.houseTrim);
  crown.position.y = wallH + 0.35;
  g.add(crown);
  return g;
}

/** Fila de casas adosadas con tejados naranjas alternos. */
export function rowHouses(units = 4): THREE.Group {
  const g = new THREE.Group();
  const uw = 3.9;
  for (let i = 0; i < units; i++) {
    const wall = i % 2 === 0 ? PALETTE.houseWall : PALETTE.creamWall;
    const unit = gabledVolume(uw - 0.12, 6, 3.2, 2.6, wall, PALETTE.roofTerracotta);
    unit.position.x = (i - (units - 1) / 2) * uw;
    g.add(unit);
    const door = solid(new THREE.BoxGeometry(0.9, 1.9, 0.1), PALETTE.houseWallShade);
    door.position.set(unit.position.x - uw * 0.18, 0.95, 3.06);
    g.add(door);
    const win = litWindow(1.1, 1.0);
    win.position.set(unit.position.x + uw * 0.2, 1.9, 3.06);
    g.add(win);
  }
  return g;
}

/** Supermercado: caja baja con franja de fachada y rótulo amarillo. */
export function supermarket(): THREE.Group {
  const g = new THREE.Group();
  const body = solid(new THREE.BoxGeometry(18, 4.2, 12), PALETTE.houseWall);
  body.position.y = 2.1;
  g.add(body);
  const fascia = solid(new THREE.BoxGeometry(18.3, 1.1, 12.3), PALETTE.signRed);
  fascia.position.y = 3.9;
  g.add(fascia);
  const sign = solid(new THREE.BoxGeometry(4.4, 1.6, 0.4), PALETTE.signYellow);
  sign.position.set(-4, 4.9, 5.9);
  g.add(sign);
  const glassFront = solid(new THREE.BoxGeometry(9, 2.2, 0.12), PALETTE.glass);
  glassFront.castShadow = false;
  glassFront.position.set(1.5, 1.25, 6.06);
  g.add(glassFront);
  const dock = solid(new THREE.BoxGeometry(4, 1.1, 2.4), PALETTE.concreteShade);
  dock.position.set(5, 0.55, -7.1);
  g.add(dock);
  return g;
}

/** Parking en altura: losas abiertas con antepechos y columnas. */
export function parkingGarage(floors = 3): THREE.Group {
  const g = new THREE.Group();
  const w = 15;
  const d = 10;
  const floorH = 2.5;
  for (let f = 0; f <= floors; f++) {
    const slab = solid(new THREE.BoxGeometry(w, 0.45, d), PALETTE.concrete);
    slab.position.y = f * floorH;
    g.add(slab);
    if (f < floors) {
      const rail = solid(new THREE.BoxGeometry(w, 0.55, d), PALETTE.concreteShade);
      rail.castShadow = false;
      rail.scale.set(1, 1, 0.02);
      rail.position.set(0, f * floorH + 0.5, d / 2 - 0.1);
      g.add(rail);
      for (const [cx, cz] of [
        [-w / 2 + 0.6, -d / 2 + 0.6],
        [w / 2 - 0.6, -d / 2 + 0.6],
        [-w / 2 + 0.6, d / 2 - 0.6],
        [w / 2 - 0.6, d / 2 - 0.6],
        [0, -d / 2 + 0.6],
        [0, d / 2 - 0.6],
      ] as const) {
        const col = solid(new THREE.BoxGeometry(0.5, floorH, 0.5), PALETTE.concreteShade);
        col.position.set(cx, f * floorH + floorH / 2, cz);
        g.add(col);
      }
    }
  }
  const core = solid(new THREE.BoxGeometry(2.4, floors * floorH + 1.2, 2.4), PALETTE.concreteShade);
  core.position.set(-w / 2 + 1.4, (floors * floorH + 1.2) / 2, -d / 2 + 1.4);
  g.add(core);
  return g;
}

/** Consultorio: caja baja con tejado plano, porche discreto y cruz roja sobre la puerta. */
export function clinic(): THREE.Group {
  const g = new THREE.Group();
  const w = 7.4;
  const d = 5.6;
  const wallH = 2.7;
  const body = solid(new THREE.BoxGeometry(w, wallH, d), PALETTE.houseWall);
  body.position.y = wallH / 2;
  g.add(body);
  const roof = solid(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), PALETTE.flatRoof);
  roof.position.y = wallH + 0.18;
  g.add(roof);

  const canopy = solid(new THREE.BoxGeometry(2.6, 0.14, 1.1), PALETTE.houseTrim);
  canopy.position.set(0, wallH * 0.82, d / 2 + 0.55);
  g.add(canopy);
  for (const x of [-1.1, 1.1]) {
    const col = solid(new THREE.BoxGeometry(0.14, wallH * 0.8, 0.14), PALETTE.houseTrim);
    col.position.set(x, wallH * 0.42, d / 2 + 1.05);
    g.add(col);
  }

  const door = solid(new THREE.BoxGeometry(1.0, 1.85, 0.1), PALETTE.houseWallShade);
  door.position.set(0, 0.93, d / 2 + 0.05);
  g.add(door);

  // Cruz roja discreta sobre la puerta (dos listones cruzados)
  const crossV = solid(new THREE.BoxGeometry(0.3, 0.8, 0.08), PALETTE.signRed);
  crossV.position.set(0, wallH + 0.55, d / 2 + 0.02);
  const crossH = solid(new THREE.BoxGeometry(0.8, 0.3, 0.08), PALETTE.signRed);
  crossH.position.copy(crossV.position);
  g.add(crossV, crossH);

  return g;
}

/** Escuela: aulas + patio cubierto con columnas + campanita sobre el tejado. */
export function school(): THREE.Group {
  const g = new THREE.Group();
  const bodyW = 7.4;
  const bodyD = 7.6;
  const wallH = 3.0;
  const bodyX = -2.1;

  const body = solid(new THREE.BoxGeometry(bodyW, wallH, bodyD), PALETTE.houseWall);
  body.position.set(bodyX, wallH / 2, 0);
  g.add(body);
  const roof = solid(new THREE.BoxGeometry(bodyW + 0.3, 0.35, bodyD + 0.3), PALETTE.flatRoof);
  roof.position.set(bodyX, wallH + 0.18, 0);
  g.add(roof);

  const door = solid(new THREE.BoxGeometry(1.1, 2.0, 0.1), PALETTE.houseWallShade);
  door.position.set(bodyX, 1.0, bodyD / 2 + 0.05);
  g.add(door);

  // Patio cubierto: losa + columnas + tejadillo, al lado de las aulas
  const yardX = bodyX + bodyW / 2 + 2.3;
  const yardSlab = solid(new THREE.BoxGeometry(4.4, 0.14, bodyD), PALETTE.porch);
  yardSlab.position.set(yardX, 0.07, 0);
  g.add(yardSlab);
  for (const z of [-bodyD / 2 + 0.7, 0, bodyD / 2 - 0.7]) {
    const col = solid(new THREE.BoxGeometry(0.28, 2.3, 0.28), PALETTE.houseTrim);
    col.position.set(yardX, 1.15, z);
    g.add(col);
  }
  const canopy = solid(new THREE.BoxGeometry(4.6, 0.16, bodyD + 0.2), PALETTE.houseTrim);
  canopy.position.set(yardX, 2.4, 0);
  g.add(canopy);

  // Campanita: torrecita con tejado a cuatro aguas y campana
  const tower = solid(new THREE.BoxGeometry(1.1, 1.3, 1.1), PALETTE.houseWall);
  tower.position.set(bodyX, wallH + 0.85, 0);
  g.add(tower);
  const towerRoof = solid(new THREE.ConeGeometry(1, 0.9, 4), PALETTE.roofTerracotta);
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.scale.set(1.25, 1, 1.25);
  towerRoof.position.set(bodyX, wallH + 1.3 + 0.45, 0);
  g.add(towerRoof);
  const bell = solid(new THREE.SphereGeometry(0.2, 8, 6), PALETTE.barnWallShade);
  bell.position.set(bodyX, wallH + 1.05, 0);
  g.add(bell);

  return g;
}

/** Edificio cívico: cuerpo blanco con pórtico, tejado a cuatro aguas y torre. */
export function civic(): THREE.Group {
  const g = new THREE.Group();
  const w = 16;
  const d = 9;
  const wallH = 6.2;
  const body = solid(new THREE.BoxGeometry(w, wallH, d), PALETTE.houseWall);
  body.position.y = wallH / 2;
  g.add(body);

  // Tejado a cuatro aguas: pirámide rectangular (cono de 4 lados girado 45°)
  const hip = solid(new THREE.ConeGeometry(1, 2.6, 4), PALETTE.roofTerracotta);
  hip.rotation.y = Math.PI / 4;
  hip.scale.set((w / 2 + 0.5) * 1.35, 1, (d / 2 + 0.5) * 1.35);
  hip.position.y = wallH + 1.3;
  g.add(hip);

  // Torre central con su propia pirámide
  const tower = solid(new THREE.BoxGeometry(2.6, 4.4, 2.6), PALETTE.houseWall);
  tower.position.y = wallH + 2.2;
  g.add(tower);
  const towerRoof = solid(new THREE.ConeGeometry(1, 1.8, 4), PALETTE.roofTerracotta);
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.scale.set(2.4, 1, 2.4);
  towerRoof.position.y = wallH + 4.4 + 0.9;
  g.add(towerRoof);

  // Pórtico de columnas
  for (let i = -2; i <= 2; i++) {
    const col = solid(new THREE.BoxGeometry(0.4, 3.4, 0.4), PALETTE.houseTrim);
    col.position.set(i * 1.5, 1.7, d / 2 + 1.3);
    g.add(col);
  }
  const pediment = solid(new THREE.BoxGeometry(8.2, 0.5, 2.2), PALETTE.houseTrim);
  pediment.position.set(0, 3.6, d / 2 + 1.2);
  g.add(pediment);
  windowGrid(g, w, d, wallH, 2, { colSpacing: 2.1, litRatio: 0.2 });
  return g;
}

/** Fábrica: nave de ladrillo con cubierta en dientes de sierra y chimenea. */
export function factory(): THREE.Group {
  const g = new THREE.Group();
  const w = 16;
  const d = 11;
  const wallH = 4.6;
  const body = solid(new THREE.BoxGeometry(w, wallH, d), PALETTE.brick);
  body.position.y = wallH / 2;
  g.add(body);

  // Dientes de sierra: prismas triangulares rectos con cara de vidrio
  const teeth = 4;
  const tw = w / teeth;
  for (let i = 0; i < teeth; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(tw, 0);
    shape.lineTo(0, 1.7);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geo.translate(-w / 2 + i * tw, 0, -d / 2);
    const tooth = solid(geo, PALETTE.flatRoof);
    tooth.position.y = wallH;
    g.add(tooth);
    const glassFace = solid(new THREE.BoxGeometry(0.1, 1.5, d - 0.4), PALETTE.glass);
    glassFace.castShadow = false;
    glassFace.position.set(-w / 2 + i * tw + 0.05, wallH + 0.8, 0);
    g.add(glassFace);
  }

  const chimney = solid(new THREE.CylinderGeometry(0.8, 1.1, 10, 10), PALETTE.brickShade);
  chimney.position.set(w / 2 - 1.6, 5, -d / 2 + 1.8);
  tagChimney(chimney, 5); // la chimenea alta de la fábrica: humo desde su boca
  g.add(chimney);
  const band = solid(new THREE.CylinderGeometry(0.85, 0.9, 0.8, 10), PALETTE.houseTrim);
  band.position.set(w / 2 - 1.6, 9.2, -d / 2 + 1.8);
  g.add(band);

  const door = solid(new THREE.BoxGeometry(3.2, 3, 0.12), PALETTE.barnTrim);
  door.position.set(0, 1.5, d / 2 + 0.07);
  g.add(door);
  return g;
}

/**
 * Jardín/fachada de estatus (ciclo 9 de RESEARCH.md): decoración plantada en
 * el borde frontal (+Z) de una vivienda cuando su hogar invierte ahorro de
 * sobra. Escalonado por `prestige` [0,1] — más seto y flores cuanto más alto.
 * `seed` fija la posición de las flores por vivienda (determinista, sin
 * Math.random()).
 */
export function homeGarden(prestige: number, w: number, d: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  if (prestige < 0.3) return g;
  const rng = createRng(seed);
  const frontZ = d / 2 + 0.25;

  const hedgeCount = Math.max(2, Math.round(w / 1.1));
  for (let i = 0; i < hedgeCount; i++) {
    const x = -w / 2 + 0.5 + (i * (w - 1)) / Math.max(1, hedgeCount - 1);
    const hedge = solid(new THREE.BoxGeometry(0.85, 0.32, 0.32), PALETTE.gardenHedge);
    hedge.position.set(x, 0.16, frontZ);
    hedge.castShadow = false;
    g.add(hedge);
  }

  if (prestige >= 0.6) {
    const flowerCount = Math.round(2 + prestige * 3);
    for (let i = 0; i < flowerCount; i++) {
      const bush = solid(new THREE.SphereGeometry(0.2, 6, 5), rng.pick(PALETTE.gardenFlowers));
      bush.position.set(rng.range(-w / 2 + 0.4, w / 2 - 0.4), 0.2, frontZ + rng.range(0.35, 0.85));
      bush.castShadow = false;
      g.add(bush);
    }
  }

  if (prestige >= 1) {
    const pole = solid(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), PALETTE.houseTrim);
    pole.position.set(w * 0.32, 0.75, frontZ + 0.15);
    g.add(pole);
    const flag = solid(new THREE.BoxGeometry(0.42, 0.3, 0.04), rng.pick(PALETTE.gardenFlowers));
    flag.castShadow = false;
    flag.position.set(w * 0.32 + 0.22, 1.32, frontZ + 0.15);
    g.add(flag);
  }

  return g;
}

/**
 * Decoración de fiesta de barrio (ciclo 10 de RESEARCH.md): guirnalda de
 * luces entre dos postes + un par de puestos de mercado frente al edificio
 * cívico usado como plaza. Solo visible el día de fiesta (FESTIVAL_DAY_INTERVAL).
 */
export function festivalDecor(w: number, d: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rng = createRng(seed);
  const frontZ = d / 2 + 1.2;
  const poleH = 2.6;

  for (const px of [-w / 2 - 0.4, w / 2 + 0.4]) {
    const pole = solid(new THREE.CylinderGeometry(0.05, 0.05, poleH, 6), PALETTE.houseTrim);
    pole.position.set(px, poleH / 2, frontZ);
    g.add(pole);
  }
  const lights = 7;
  for (let i = 0; i < lights; i++) {
    const t = i / (lights - 1);
    const sag = Math.sin(t * Math.PI) * 0.5; // catenaria aproximada de la guirnalda
    const bulb = solid(new THREE.SphereGeometry(0.09, 6, 5), PALETTE.windowLit);
    bulb.castShadow = false;
    bulb.position.set(-w / 2 - 0.4 + t * (w + 0.8), poleH - 0.3 - sag, frontZ);
    g.add(bulb);
  }

  const stallColors = [PALETTE.signRed, PALETTE.signYellow];
  for (let i = 0; i < 2; i++) {
    const sx = (i - 0.5) * 2.6;
    const sz = frontZ + 1.6 + rng.range(-0.2, 0.2);
    const counter = solid(new THREE.BoxGeometry(1.6, 0.7, 0.7), PALETTE.porch);
    counter.position.set(sx, 0.35, sz);
    g.add(counter);
    const canopy = solid(new THREE.BoxGeometry(1.9, 0.12, 1.4), rng.pick(stallColors));
    canopy.position.set(sx, 1.5, sz);
    g.add(canopy);
    for (const px of [-0.8, 0.8]) {
      const pole = solid(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), PALETTE.houseTrim);
      pole.position.set(sx + px, 0.75, sz + 0.5);
      g.add(pole);
    }
  }

  return g;
}

/** Ciudadano: silueta simple (cuerpo acampanado + cabeza), ~1.6 m. */
export function citizen(clothesColor: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = solid(new THREE.CylinderGeometry(0.14 * scale, 0.3 * scale, 1.1 * scale, 8), clothesColor);
  body.position.y = 0.55 * scale;
  const head = solid(new THREE.SphereGeometry(0.16 * scale, 8, 6), PALETTE.citizenSkin);
  head.position.y = 1.32 * scale;
  g.add(body, head);
  return g;
}
