/**
 * Social emergente (T3.7). Sin guion: si dos conocidos se CRUZAN por la calle
 * y ambos van faltos de `social`, se paran, se orientan cara a cara y charlan.
 * Las amistades se refuerzan con cada encuentro; brain.ts usa la afinidad
 * para decidir visitas.
 */
import { Citizen } from './citizen';
import { restore } from './needs';
import { TICK_GAME_S } from '../clock';
import { Rng } from '../../rng';

/** Distancia máx. (celdas) para pararse a charlar. */
const CHAT_RANGE = 1.6;
/** Necesitan tener ganas: social por debajo de este umbral. */
const SOCIAL_THRESHOLD = 0.6;
/** Ticks de gracia tras una charla (evita bucles de saludo infinito). */
const CHAT_COOLDOWN_TICKS = 60; // ≈ 36 min de juego

export const CHAT_RESTORE_PER_HOUR = 0.9;

/** Afinidad inicial entre convecinos/compañeros; crece con encuentros. */
export const AFFINITY_SEED = 0.15;
export const AFFINITY_PER_CHAT = 0.08;

export interface ChatPair {
  a: number;
  b: number;
  /** Segundos de juego restantes. */
  remaining: number;
}

export class SocialSystem {
  /** Charlas en curso. */
  chats: ChatPair[] = [];
  private chatting = new Set<number>();

  constructor(private rng: Rng) {}

  isChatting(id: number): boolean {
    return this.chatting.has(id);
  }

  /** Se conocen (vecinos, compañeros) — siembra afinidad simétrica. */
  static acquaint(a: Citizen, b: Citizen, amount = AFFINITY_SEED): void {
    if (a.id === b.id) return;
    a.friends.set(b.id, Math.min(1, (a.friends.get(b.id) ?? 0) + amount));
    b.friends.set(a.id, Math.min(1, (b.friends.get(a.id) ?? 0) + amount));
  }

  /**
   * Detecta cruces entre ciudadanos CAMINANDO al aire libre y arranca charlas.
   * `walkers` ya viene filtrado (fuera, en fase moving) — O(n²) con n pequeño;
   * cuando haya cientos, sustituir por hash espacial (nota en SIMULATION.md).
   */
  detectEncounters(walkers: Citizen[], tick: number): ChatPair[] {
    const started: ChatPair[] = [];
    for (let i = 0; i < walkers.length; i++) {
      const a = walkers[i];
      if (this.chatting.has(a.id) || a.needs.social >= SOCIAL_THRESHOLD) continue;
      if (tick - a.lastChatTick < CHAT_COOLDOWN_TICKS) continue;
      for (let j = i + 1; j < walkers.length; j++) {
        const b = walkers[j];
        if (this.chatting.has(b.id) || b.needs.social >= SOCIAL_THRESHOLD) continue;
        if (tick - b.lastChatTick < CHAT_COOLDOWN_TICKS) continue;
        if (!a.friends.has(b.id)) continue; // solo conocidos se paran
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        if (dx * dx + dz * dz > CHAT_RANGE * CHAT_RANGE) continue;

        // Duración de la charla: 15-35 min de juego, sesgada por sociabilidad.
        const mins = this.rng.range(15, 35) * (0.7 + 0.3 * (a.personality.sociable + b.personality.sociable) / 2);
        const chat: ChatPair = { a: a.id, b: b.id, remaining: mins * 60 };
        this.chats.push(chat);
        this.chatting.add(a.id);
        this.chatting.add(b.id);
        started.push(chat);
        break; // a ya está ocupado
      }
    }
    return started;
  }

  /** Avanza charlas un tick; restaura social y refuerza afinidad al acabar.
   * Devuelve los pares terminados (para que el sistema los libere). */
  advance(citizens: Map<number, Citizen>, tick: number): ChatPair[] {
    const ended: ChatPair[] = [];
    const hours = TICK_GAME_S / 3600;
    for (const chat of this.chats) {
      chat.remaining -= TICK_GAME_S;
      const a = citizens.get(chat.a);
      const b = citizens.get(chat.b);
      if (a) restore(a.needs, 'social', CHAT_RESTORE_PER_HOUR * hours);
      if (b) restore(b.needs, 'social', CHAT_RESTORE_PER_HOUR * hours);
      if (chat.remaining <= 0 || !a || !b) {
        ended.push(chat);
        if (a && b) {
          SocialSystem.acquaint(a, b, AFFINITY_PER_CHAT);
          a.lastChatTick = tick;
          b.lastChatTick = tick;
        }
      }
    }
    if (ended.length > 0) {
      this.chats = this.chats.filter((c) => !ended.includes(c));
      for (const c of ended) {
        this.chatting.delete(c.a);
        this.chatting.delete(c.b);
      }
    }
    return ended;
  }
}
