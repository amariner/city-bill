/** Piel compartida de la interfaz: una única traducción de la paleta a CSS. */
import { PALETTE } from '../palette';

export function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export function rgba(hex: number, opacity: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${opacity})`;
}

export const INK = css(PALETTE.treeBlob);
export const PANEL_BG = rgba(PALETTE.houseWall, 0.92);
export const PANEL_BORDER = `1px solid ${rgba(PALETTE.treeBlob, 0.18)}`;
export const PANEL_SHADOW = `0 1px 6px ${rgba(PALETTE.treeBlob, 0.12)}`;

/** Fragmento común para paneles flotantes de la UI diegética. */
export function panelStyle(opacity = 0.92): string {
  return [
    `background:${rgba(PALETTE.houseWall, opacity)}`,
    `border:${PANEL_BORDER}`,
    `box-shadow:${PANEL_SHADOW}`,
  ].join(';');
}
