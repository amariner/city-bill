/**
 * Paleta central del juego. Toda la dirección de arte vive aquí:
 * tonos tierra desaturados, verdes suaves y acentos rojizos apagados.
 * Ningún material debe definir un color fuera de este archivo.
 */
export const PALETTE = {
  // Suelo y campos de cultivo (patchwork beige)
  groundBase: 0xd8cab0,
  fields: [0xdccfb5, 0xd3c4a9, 0xe0d4bc, 0xd7c9ae, 0xdbcdb2] as const,
  fieldAccents: [0xcbbcae, 0xc6b5a8, 0xd0c1b3] as const, // parches malva/rosados

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
  windowLit: 0xf3e2b3,
  windowCool: 0x8fa0a6,
  roofTerracotta: 0xc07a52,
  signYellow: 0xd4ae4b,
  signRed: 0xc25e54,

  // Ciudadanos (ropa en tonos apagados, como siluetas de acuarela)
  citizenClothes: [0x7d8fa6, 0xe8e2d2, 0x9a8a74, 0x8fa07e, 0xc09a92, 0x6f7d8c] as const,
  citizenSkin: 0xd9bfa8,

  // Coches (ciclo 8/T3.9 — carrocerías en tonos apagados, cabina cristal frío)
  carBodies: [0x8a9bab, 0xb7a99a, 0x9a8f7e, 0xa9736c, 0x8f9c86, 0xccc3b2] as const,
  carCabin: 0x8fa0a6,

  // Agua y cielo
  pond: 0x86b7cd,
  sky: 0xddd0b8,

  // Luces
  sun: 0xfff2dd,
  sunGolden: 0xffd9a6, // hora dorada (mañana/tarde) — T1.8, más cálido
  ambient: 0xcfd8e8,
} as const;
