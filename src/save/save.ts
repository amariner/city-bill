/** Slot local mínimo: el worker sigue siendo la fuente de verdad del contenido. */
export const SAVE_KEY = 'city-bill:save:v1';

export interface SaveSlot {
  seed: number;
  saveBlob: string;
}

export function loadSave(): SaveSlot | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const slot = JSON.parse(raw) as SaveSlot;
    return Number.isFinite(slot.seed) && typeof slot.saveBlob === 'string' ? slot : null;
  } catch {
    return null;
  }
}

export function writeSave(slot: SaveSlot): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(slot));
  } catch {
    // El slot es una comodidad; una cuota llena no debe detener la simulación.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // localStorage puede estar bloqueado en modo privado.
  }
}
