/**
 * Paleta central del juego. Toda la dirección de arte vive aquí:
 * tonos tierra desaturados, verdes suaves y acentos rojizos apagados.
 * Ningún material debe definir un color fuera de este archivo.
 */
import type { Season } from './sim/weather';

export const PALETTE = {
  // Suelo y campos de cultivo (patchwork beige)
  groundBase: 0xd8cab0,
  fields: [0xdccfb5, 0xd3c4a9, 0xe0d4bc, 0xd7c9ae, 0xdbcdb2] as const,
  fieldAccents: [0xcbbcae, 0xc6b5a8, 0xd0c1b3] as const, // parches malva/rosados
  // Campo en cultivo activo (T3.8 deuda): tonos más verdes/ricos que el
  // barbecho de `fields`; el terreno interpola hacia esto según la faena
  // agrícola reciente, con franjas por fila que leen como surcos.
  fieldsCultivated: [0xb9c48a, 0xaebd80, 0xc3cd93, 0xa9b877, 0xbfc98d] as const,

  // Carreteras y caminos
  road: 0xeae0c8,
  path: 0xe6dcc4,

  // Hierba de las parcelas habitadas
  grass: 0xa9c286,
  grassPatches: [0x9fb97c, 0xb1c88e, 0x97b174, 0xa4bd80] as const,

  // Vegetación (verdes casi negros, como siluetas)
  treeBlob: 0x2d3827,
  treeBlobAlt: 0x333f2c,
  cypress: 0x323d2a,
  trunk: 0x4a4238,

  // Casa de campo
  houseWall: 0xf1efe6,
  houseWallShade: 0xbdb8ae,
  houseRoof: 0x847b72,
  houseTrim: 0xe8e5da,
  porch: 0xd9d4c6,

  // Granero
  barnWall: 0xd08079,
  barnWallShade: 0xb96b66,
  barnRoof: 0x776e66,
  barnTrim: 0xe5ded0,

  // Edificios urbanos
  concrete: 0xe0dcd1,
  concreteShade: 0xb9b4a7,
  flatRoof: 0x5a554e,
  brick: 0xca8166,
  brickShade: 0xb06f57,
  creamWall: 0xe9dcc0,
  glass: 0x9db2b6,
  windowLit: 0xffe4a3, // ventana encendida: ámbar cálido y luminoso (glow del anochecer)
  windowCool: 0x8fa0a6,
  windowDay: 0xaab4b8, // panel de día de una ventana que SÍ se enciende (frío, apagado)
  roofTerracotta: 0xc07a52,
  signYellow: 0xd4ae4b,
  signRed: 0xc25e54,

  // Ciudadanos (ropa en tonos apagados, como siluetas de acuarela)
  citizenClothes: [0x7d8fa6, 0xe8e2d2, 0x9a8a74, 0x8fa07e, 0xc09a92, 0x6f7d8c] as const,
  citizenSkin: 0xd9bfa8,

  // Vehículos (chasis en tonos apagados variados, ruedas casi negras)
  carBody: [0x8b96a6, 0xcdbb96, 0xab7f74, 0x8ea082] as const,
  carTire: 0x2c2a26,

  // Jardines de estatus (ciclo 9): setos y flores discretas al invertir en casa
  gardenHedge: 0x7a9457,
  gardenFlowers: [0xc98fa0, 0xd6b869, 0xb9c98a] as const,

  // Atmósfera / juice (T5.4 — FX cosméticos del anochecer)
  smoke: 0xd7d0c4, // humo de chimenea al anochecer: gris cálido pálido
  bird: 0x3b4136, // bandada: siluetas oscuras casi negras contra el cielo

  // Agua y cielo
  pond: 0x86b7cd,
  sky: 0xddd0b8,

  // Luces
  sun: 0xfff2dd,
  sunGolden: 0xffd9a6, // hora dorada (mañana/tarde) — T1.8, más cálido
  ambient: 0xcfd8e8,

  // Tinte estacional (T5.1 paso 1): crossfade lento entre invierno frío/pálido y
  // verano cálido. Se aplican a cielo y ambiente, no a la geometría.
  skyWinter: 0xdfe4ea, // cielo invernal, frío y lavado
  skySummer: 0xe6dcc0, // cielo estival, cálido y dorado
  ambientWinter: 0xc4d2e6, // relleno frío azulado (nieve, sombra fría)
  ambientSummer: 0xdcd8c8, // relleno cálido de verano
  snow: 0xeef2f7, // manto de nieve del terreno en invierno (emissive, T5.1 paso 2)

  // Hora azul / noche (T5.4): al caer la tarde el pueblo se atenúa y enfría
  // (nunca a negro — la silueta sigue legible) para que las luces cálidas de las
  // ventanas y el humo canten. La ELEVACIÓN del sol no cambia (regla de arte §4).
  skyNight: 0x9aa0b8, // cielo del crepúsculo, malva-azulado apagado
  ambientNight: 0x8e9ac2, // relleno frío nocturno (azul luna)

  // UI diegética
  selectRing: 0xd8b25a, // anillo bajo el ciudadano seleccionado en el inspector

  // Construcción (T4.2): andamio de madera al levantar un edificio — postes y
  // travesaños de timber pálido, luego se retira con un "pop" del edificio.
  scaffold: 0xb59d78,
} as const;

/**
 * Paleta estacional (T5.1 paso 1, terreno/vegetación): variantes de terreno y
 * vegetación por estación. El verano ES la paleta base de arriba (el juego se
 * diseñó y verificó visualmente en verano) — las otras tres son variaciones
 * sobre las mismas familias de color, nunca un hex nuevo fuera de aquí.
 * `cypress` no varía: es de hoja perenne, se queda verde todo el año incluso
 * en invierno. Complementa (no sustituye) el crossfade continuo de cielo/luz/
 * nieve de `skyWinter`/`skySummer`/`snow` arriba: aquella es una transición
 * suave por emissive/color de luz; ésta es la paleta BASE del terreno, que se
 * repinta al reconstruir el chunk (corte discreto — el crossfade de esta parte
 * sigue pendiente, ver ROADMAP §2 T5.1).
 */
export interface SeasonPalette {
  groundBase: number;
  fields: readonly number[];
  fieldsCultivated: readonly number[];
  grass: number;
  grassPatches: readonly number[];
  treeBlob: number;
  treeBlobAlt: number;
}

export const SEASON_PALETTES: Record<Season, SeasonPalette> = {
  verano: {
    groundBase: PALETTE.groundBase,
    fields: PALETTE.fields,
    fieldsCultivated: PALETTE.fieldsCultivated,
    grass: PALETTE.grass,
    grassPatches: PALETTE.grassPatches,
    treeBlob: PALETTE.treeBlob,
    treeBlobAlt: PALETTE.treeBlobAlt,
  },
  primavera: {
    groundBase: 0xdccdad,
    fields: [0xd6cf9f, 0xccc794, 0xdcd4a8, 0xd0c99b, 0xd8d0a4],
    fieldsCultivated: [0xa8c07f, 0x9db571, 0xb0c887, 0x9cb474, 0xa7c17e],
    grass: 0x9cc17e,
    grassPatches: [0x92b573, 0xa2c586, 0x8aab6b, 0x9bbc78],
    treeBlob: 0x33472c,
    treeBlobAlt: 0x3a4f32,
  },
  otoño: {
    groundBase: 0xd6b992,
    fields: [0xcf9f66, 0xc4935c, 0xd6ab74, 0xc99a63, 0xd0a26c],
    fieldsCultivated: [0xb98a58, 0xae7f4f, 0xc19662, 0xa87c4c, 0xba8c56],
    grass: 0xac8f52,
    grassPatches: [0x9d8049, 0xb59a5c, 0x8f7442, 0xa68b50],
    treeBlob: 0x7a4a2a,
    treeBlobAlt: 0x8a5a2e,
  },
  invierno: {
    groundBase: 0xe8e6df,
    fields: [0xe3e1d8, 0xdcdad0, 0xeae8e1, 0xe0ded4, 0xe6e4dc],
    fieldsCultivated: [0xcdd2c4, 0xc3c9b8, 0xd4d8c9, 0xc8ceba, 0xd0d5c5],
    grass: 0xd6dccb,
    grassPatches: [0xccd3bf, 0xdae0cd, 0xc3cab5, 0xd1d7c4],
    treeBlob: 0x3c463c,
    treeBlobAlt: 0x424c42,
  },
} as const;
