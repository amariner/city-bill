/**
 * Primer barrio: una parcela rural habitada rodeada de campos de cultivo
 * en patchwork, cruzada por carreteras rectas con arbolado en los márgenes.
 * Composición fija y determinista (semilla), pensada como "viñeta" inicial.
 */
import * as THREE from 'three';
import { PALETTE } from './palette';
import { createRng } from './rng';
import { blobTree, cypress, farmhouse, barn, shed, cottage, shop, citizen, mat } from './props';

const rng = createRng(20260703);

/** Rectángulo plano apoyado en el suelo (para campos, hierba, carreteras). */
function flat(w: number, d: number, color: number, y = 0.01): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function scatterTrees(
  parent: THREE.Group,
  count: number,
  areaX: [number, number],
  areaZ: [number, number],
  cypressRatio = 0.35,
): void {
  for (let i = 0; i < count; i++) {
    const t =
      rng.next() < cypressRatio
        ? cypress(rng.range(0.9, 1.35))
        : blobTree(rng.range(1.0, 1.55), rng.next() < 0.4);
    t.position.set(rng.range(areaX[0], areaX[1]), 0, rng.range(areaZ[0], areaZ[1]));
    t.rotation.y = rng.range(0, Math.PI * 2);
    parent.add(t);
  }
}

/** Fila de árboles a lo largo de un eje, con huecos aleatorios. */
function treeLine(
  parent: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  spacing: number,
): void {
  const dir = to.clone().sub(from);
  const len = dir.length();
  dir.normalize();
  for (let d = 0; d < len; d += spacing * rng.range(0.7, 1.6)) {
    if (rng.next() < 0.25) continue; // huecos: nada de filas perfectas
    const p = from.clone().addScaledVector(dir, d);
    const t = rng.next() < 0.55 ? cypress(rng.range(0.7, 1.0)) : blobTree(rng.range(0.55, 0.85));
    t.position.set(p.x + rng.range(-0.8, 0.8), 0, p.z + rng.range(-0.8, 0.8));
    parent.add(t);
  }
}

export function buildNeighborhood(): THREE.Group {
  const world = new THREE.Group();

  // --- Suelo base -----------------------------------------------------------
  world.add(flat(600, 600, PALETTE.groundBase, 0));

  // --- Patchwork de campos --------------------------------------------------
  // Rejilla irregular de parcelas beige con parches malva ocasionales.
  const cell = 70;
  for (let gx = -4; gx <= 4; gx++) {
    for (let gz = -4; gz <= 4; gz++) {
      if (gx === 0 && gz === 0) continue; // hueco para la parcela habitada
      const w = cell * rng.range(0.75, 0.98);
      const d = cell * rng.range(0.75, 0.98);
      const field = flat(w, d, rng.pick(PALETTE.fields), 0.005 + rng.next() * 0.004);
      field.position.x = gx * cell + rng.range(-4, 4);
      field.position.z = gz * cell + rng.range(-4, 4);
      world.add(field);
      // Parche de acento (malva/rosado) dentro de algunos campos
      if (rng.next() < 0.3) {
        const patch = flat(w * rng.range(0.3, 0.5), d * rng.range(0.3, 0.5), rng.pick(PALETTE.fieldAccents), 0.012);
        patch.position.set(
          field.position.x + rng.range(-w / 4, w / 4),
          0.012,
          field.position.z + rng.range(-d / 4, d / 4),
        );
        world.add(patch);
      }
    }
  }

  // --- Carreteras -----------------------------------------------------------
  // Dos ejes principales cruzados fuera del centro, con margen verde y arbolado.
  const roadW = 5;
  const vergeW = 11;

  // Margen verde bajo cada carretera
  const vergeH = flat(600, vergeW, rng.pick(PALETTE.grassPatches), 0.015);
  vergeH.position.z = 38;
  world.add(vergeH);
  const roadH = flat(600, roadW, PALETTE.road, 0.02);
  roadH.position.z = 38;
  world.add(roadH);

  const vergeV = flat(vergeW, 600, rng.pick(PALETTE.grassPatches), 0.015);
  vergeV.position.x = 52;
  world.add(vergeV);
  const roadV = flat(roadW, 600, PALETTE.road, 0.02);
  roadV.position.x = 52;
  world.add(roadV);

  // Arbolado en los márgenes de ambas carreteras
  treeLine(world, new THREE.Vector3(-290, 0, 33.5), new THREE.Vector3(290, 0, 33.5), 14);
  treeLine(world, new THREE.Vector3(-290, 0, 42.5), new THREE.Vector3(290, 0, 42.5), 16);
  treeLine(world, new THREE.Vector3(47.5, 0, -290), new THREE.Vector3(47.5, 0, 290), 15);
  treeLine(world, new THREE.Vector3(56.5, 0, -290), new THREE.Vector3(56.5, 0, 290), 17);

  // --- Parcela habitada (el primer "barrio") ---------------------------------
  const parcel = new THREE.Group();
  parcel.position.set(-14, 0, -18);
  world.add(parcel);

  const lawnW = 92;
  const lawnD = 72;
  parcel.add(flat(lawnW, lawnD, PALETTE.grass, 0.018));

  // Franjas de "césped segado": rectángulos verdes con tonos alternos
  for (let i = 0; i < 9; i++) {
    const stripe = flat(rng.range(14, 34), rng.range(8, 18), rng.pick(PALETTE.grassPatches), 0.022 + i * 0.0006);
    stripe.position.set(rng.range(-lawnW / 2 + 14, lawnW / 2 - 14), stripe.position.y, rng.range(-lawnD / 2 + 8, lawnD / 2 - 8));
    parcel.add(stripe);
  }

  // Casa principal orientada al camino
  const house = farmhouse();
  house.position.set(-6, 0, 4);
  house.rotation.y = Math.PI;
  parcel.add(house);

  // Granero rojo grande y cobertizo
  const bigBarn = barn(6.5, 8.5, 2.6);
  bigBarn.position.set(12, 0, 6);
  bigBarn.rotation.y = Math.PI / 2;
  parcel.add(bigBarn);

  const smallShed = shed();
  smallShed.position.set(18, 0, -14);
  parcel.add(smallShed);

  // Camino de entrada desde la carretera hasta la casa
  const driveway = flat(3, 48, PALETTE.path, 0.024);
  driveway.position.set(-6, 0.024, 32);
  parcel.add(driveway);

  // Estanque
  const pondGeo = new THREE.CircleGeometry(6.5, 22);
  const pond = new THREE.Mesh(pondGeo, mat(PALETTE.pond));
  pond.rotation.x = -Math.PI / 2;
  pond.scale.x = 1.5;
  pond.position.set(-28, 0.026, -16);
  pond.receiveShadow = true;
  parcel.add(pond);

  // Arboledas dentro de la parcela: densas detrás, sueltas delante
  scatterTrees(parcel, 16, [-lawnW / 2 + 6, lawnW / 2 - 6], [-lawnD / 2 + 4, -6], 0.3);
  scatterTrees(parcel, 8, [-lawnW / 2 + 6, -14], [0, lawnD / 2 - 6], 0.4);
  scatterTrees(parcel, 5, [20, lawnW / 2 - 6], [-4, lawnD / 2 - 8], 0.5);

  // Vecinos charlando frente a la casa (como en la referencia)
  for (const [cx, cz] of [
    [-11.5, 9.5],
    [-10.2, 10.4],
  ] as const) {
    const c = citizen(rng.pick(PALETTE.citizenClothes));
    c.position.set(cx, 0, cz);
    c.rotation.y = rng.range(0, Math.PI * 2);
    parcel.add(c);
  }

  // --- Zona de pueblo ---------------------------------------------------------
  // Pequeño núcleo al otro lado del cruce: casitas alineadas a la carretera,
  // una tienda cerca de la esquina y vecinos paseando.
  const village = new THREE.Group();
  village.position.set(76, 0, 62);
  world.add(village);

  // Manzana verde del pueblo
  village.add(flat(64, 46, PALETTE.grass, 0.018));
  for (let i = 0; i < 6; i++) {
    const stripe = flat(rng.range(10, 22), rng.range(6, 13), rng.pick(PALETTE.grassPatches), 0.022 + i * 0.0006);
    stripe.position.set(rng.range(-24, 24), stripe.position.y, rng.range(-16, 16));
    village.add(stripe);
  }

  // Fila de casitas orientadas a la carretera horizontal (norte de la manzana)
  const lots: Array<[number, number, number]> = [
    [-22, -13, 5.4],
    [-7, -14, 4.8],
    [8, -13, 5.2],
    [22, -14, 4.6],
  ];
  for (const [lx, lz, lw] of lots) {
    const home = cottage(lw, rng.range(3.8, 4.6), rng.next() < 0.75);
    home.position.set(lx, 0, lz);
    home.rotation.y = Math.PI; // porche mirando a la carretera
    village.add(home);
    // Sendero del porche a la carretera
    const path = flat(1.6, 9, PALETTE.path, 0.024);
    path.position.set(lx, 0.024, lz - 8);
    village.add(path);
  }

  // Tienda en la esquina del cruce y un cobertizo trasero
  const store = shop();
  store.position.set(-24, 0, 8);
  store.rotation.y = -Math.PI / 2;
  village.add(store);
  const backShed = shed();
  backShed.position.set(14, 0, 12);
  backShed.rotation.y = rng.range(0, Math.PI);
  village.add(backShed);

  // Calle interior del pueblo (conecta con la carretera vertical)
  const lane = flat(38, 2.6, PALETTE.path, 0.024);
  lane.position.set(-6, 0.024, 4);
  village.add(lane);

  // Vecinos paseando y charlando
  const villagers: Array<[number, number]> = [
    [-18, 4.5],
    [-16.8, 5.2],
    [-2, 3],
    [9, -7],
    [20, 6],
    [3.5, 4.8],
  ];
  for (const [cx, cz] of villagers) {
    const c = citizen(rng.pick(PALETTE.citizenClothes), rng.range(0.9, 1.05));
    c.position.set(cx, 0, cz);
    c.rotation.y = rng.range(0, Math.PI * 2);
    village.add(c);
  }

  // Arbolado del pueblo: denso al fondo, suelto entre casas
  scatterTrees(village, 9, [-30, 30], [12, 21], 0.35);
  scatterTrees(village, 4, [-30, 30], [-8, 2], 0.5);

  // --- Árboles sueltos por los campos ----------------------------------------
  for (let i = 0; i < 26; i++) {
    const t = rng.next() < 0.45 ? cypress(rng.range(0.7, 1.1)) : blobTree(rng.range(0.7, 1.15), rng.next() < 0.5);
    // Evitar el centro (parcela) y las carreteras
    let x = 0;
    let z = 0;
    do {
      x = rng.range(-280, 280);
      z = rng.range(-280, 280);
    } while ((Math.abs(x + 14) < 60 && Math.abs(z + 18) < 50) || Math.abs(z - 38) < 9 || Math.abs(x - 52) < 9);
    t.position.set(x, 0, z);
    world.add(t);
  }

  return world;
}
