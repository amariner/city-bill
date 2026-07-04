/**
 * Funde todos los edificios (ya posicionados/rotados/decorados) de un chunk en
 * como mucho 2 THREE.Mesh con vertex-colors: uno para las partes que proyectan
 * sombra y otro para las que no (cristal, toldos, seto, banderines, luces de
 * guirnalda...). Mismo patrón que `terrain.ts` (buf/emit/finish) y la técnica
 * de horneado de `citizens.ts` (paintedPart: geometría no-indexada + matriz +
 * color plano por vértice), generalizado a un recorrido recursivo de un
 * Object3D arbitrario en vez de una lista fija de piezas.
 *
 * Cada edificio pasa de costar 5-15 draw calls (uno por Mesh/InstancedMesh
 * hijo) a 0: sus vértices terminan horneados en el buffer compartido del
 * chunk. El chunk entero de edificios cuesta como mucho 2 draw calls, sin
 * importar cuántos edificios tenga ni cuántas piezas tenga cada uno.
 */
import * as THREE from 'three';

interface QuadBuffers {
  positions: number[];
  normals: number[];
  colors: number[];
}

function emptyBuf(): QuadBuffers {
  return { positions: [], normals: [], colors: [] };
}

/** Aplana una geometría (ya no-indexada) transformada por `matrix` y coloreada
 * de forma plana en `buf`. Mismo truco que `paintedPart()` en citizens.ts. */
function bakeInto(buf: QuadBuffers, geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color): void {
  const flat = geo.index ? geo.toNonIndexed() : geo.clone();
  flat.applyMatrix4(matrix);
  const positions = flat.attributes.position.array as ArrayLike<number>;
  const normals = flat.attributes.normal.array as ArrayLike<number>;
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    buf.positions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    buf.normals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    buf.colors.push(color.r, color.g, color.b);
  }
  flat.dispose();
}

function finish(buf: QuadBuffers): THREE.Mesh | null {
  if (buf.positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();

/** Recorre un edificio ya posicionado/rotado/decorado y hornea cada Mesh
 * sólido en el bucket de sombra que corresponda; cada InstancedMesh (las
 * ventanas de `windowGrid`) se expande instancia a instancia. `root` debe
 * tener su matrixWorld actualizada (se llama updateMatrixWorld en el
 * llamador antes de recorrer, una vez por chunk basta porque los edificios
 * cuelgan directamente del group del chunk). */
function bakeBuilding(root: THREE.Object3D, shadowBuf: QuadBuffers, unshadowedBuf: QuadBuffers): void {
  root.traverse((child) => {
    if (child instanceof THREE.InstancedMesh) {
      const buf = child.castShadow ? shadowBuf : unshadowedBuf;
      for (let i = 0; i < child.count; i++) {
        child.getMatrixAt(i, tmpMatrix);
        tmpMatrix.premultiply(child.matrixWorld);
        if (child.instanceColor) {
          child.getColorAt(i, tmpColor);
        } else {
          tmpColor.copy((child.material as THREE.MeshLambertMaterial).color);
        }
        bakeInto(buf, child.geometry, tmpMatrix, tmpColor);
      }
      return;
    }
    if (child instanceof THREE.Mesh) {
      const buf = child.castShadow ? shadowBuf : unshadowedBuf;
      const material = child.material as THREE.MeshLambertMaterial;
      tmpColor.copy(material.color);
      bakeInto(buf, child.geometry, child.matrixWorld, tmpColor);
    }
  });
}

/** Funde todos los edificios (Object3D ya posicionados/rotados, con sus
 * decoraciones de jardín/fiesta ya añadidas como hijos) de un chunk en como
 * mucho 2 THREE.Mesh: { shadowMesh, unshadowedMesh }. Dispone las geometrías
 * originales de cada pieza horneada para no filtrar memoria GPU en los
 * reconstruye-todo-el-chunk de setCultivation/setFestivalActive/setSeason/
 * setHomePrestige. */
export function mergeBuildingsForChunk(buildings: THREE.Object3D[]): {
  shadowMesh: THREE.Mesh | null;
  unshadowedMesh: THREE.Mesh | null;
} {
  const shadowBuf = emptyBuf();
  const unshadowedBuf = emptyBuf();

  for (const root of buildings) {
    root.updateMatrixWorld(true);
    bakeBuilding(root, shadowBuf, unshadowedBuf);
  }

  // Las geometrías originales ya no hacen falta: sus vértices viven ahora en
  // los buffers fundidos. Liberar los buffers de GPU de cada pieza (mirroring
  // paintedPart()'s geo.dispose() en citizens.ts).
  for (const root of buildings) {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
      }
    });
  }

  const shadowMesh = finish(shadowBuf);
  if (shadowMesh) {
    shadowMesh.castShadow = true;
    shadowMesh.name = 'buildings_shadow';
  }
  const unshadowedMesh = finish(unshadowedBuf);
  if (unshadowedMesh) {
    unshadowedMesh.castShadow = false;
    unshadowedMesh.name = 'buildings_unshadowed';
  }
  return { shadowMesh, unshadowedMesh };
}
