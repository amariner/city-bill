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
import { consoleGriefBy } from '../grief';
import { maybeInfect, SICK_ISOLATE } from '../contagion';

/** Distancia máx. (celdas) para pararse a charlar. */
const CHAT_RANGE = 3;
/** Necesitan tener ganas: social por debajo de este umbral. */
/** Bajo esto, alguien "tiene ganas" de socializar (charla, club). Compartido
 * con activities.ts para que el ciclo 7 (club) use el mismo criterio. */
export const SOCIAL_THRESHOLD = 0.78;
/** Ticks de gracia tras una charla (evita bucles de saludo infinito). */
const CHAT_COOLDOWN_TICKS = 60; // ≈ 36 min de juego

export const CHAT_RESTORE_PER_HOUR = 0.9;

/** Afinidad inicial entre convecinos/compañeros; crece con encuentros. */
export const AFFINITY_SEED = 0.15;
export const AFFINITY_PER_CHAT = 0.08;
/** Afinidad ganada en una charla cuando AMBOS penan (ciclo 20): el luto une —
 * consolarse mutuamente estrecha lazos más rápido que una charla cualquiera. */
export const GRIEF_BOND_AFFINITY = 0.16;

/** Afinidad que deja una charla: la normal, o la reforzada si los dos están de
 * duelo (duelo compartido → vínculo, ciclo 20). Pura y testeable. */
export function chatBond(a: Citizen, b: Citizen): number {
  return a.grief > 0 && b.grief > 0 ? GRIEF_BOND_AFFINITY : AFFINITY_PER_CHAT;
}

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
   * Hash espacial por buckets de 4 celdas: solo se comparan vecinos de bucket
   * (O(n) amortizado; CHAT_RANGE=1.6 < 4 garantiza que no se escapa ninguno).
   */
  detectEncounters(walkers: Citizen[], tick: number, quarantine = true): ChatPair[] {
    const started: ChatPair[] = [];
    const BUCKET = 4;
    const buckets = new Map<number, Citizen[]>();
    const bkey = (x: number, z: number) => (Math.floor(x / BUCKET) + 4096) * 8192 + (Math.floor(z / BUCKET) + 4096);
    for (const w of walkers) {
      const k = bkey(w.x, w.z);
      (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(w);
    }
    for (const a of walkers) {
      if (this.chatting.has(a.id) || a.needs.social >= SOCIAL_THRESHOLD) continue;
      if (tick - a.lastChatTick < CHAT_COOLDOWN_TICKS) continue;
      if (quarantine && a.sick > SICK_ISOLATE) continue; // cuarentena (ciclo 26): el que se siente mal no se para a charlar
      let paired = false;
      for (let dx = -1; dx <= 1 && !paired; dx++) {
        for (let dz = -1; dz <= 1 && !paired; dz++) {
          const cell = buckets.get(bkey(a.x + dx * BUCKET, a.z + dz * BUCKET));
          if (!cell) continue;
          for (const b of cell) {
            if (b.id <= a.id) continue; // cada par una sola vez, determinista
            if (this.chatting.has(b.id) || b.needs.social >= SOCIAL_THRESHOLD) continue;
            if (tick - b.lastChatTick < CHAT_COOLDOWN_TICKS) continue;
            if (quarantine && b.sick > SICK_ISOLATE) continue; // cuarentena (ciclo 26): no te paras con quien está muy enfermo
            if (!a.friends.has(b.id)) continue; // solo conocidos se paran
            const ex = a.x - b.x;
            const ez = a.z - b.z;
            if (ex * ex + ez * ez > CHAT_RANGE * CHAT_RANGE) continue;

            // Duración de la charla: 15-35 min de juego, sesgada por sociabilidad.
            const mins = this.rng.range(15, 35) * (0.7 + 0.3 * (a.personality.sociable + b.personality.sociable) / 2);
            const chat: ChatPair = { a: a.id, b: b.id, remaining: mins * 60 };
            this.chats.push(chat);
            this.chatting.add(a.id);
            this.chatting.add(b.id);
            started.push(chat);
            paired = true; // a ya está ocupado
            break;
          }
        }
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
      // Consuelo cara a cara (ciclo 19): escala con la intimidad y el duelo
      // compartido — quien charla contigo te alivia la pena según quién es.
      if (a && b) {
        consoleGriefBy(a, b, hours); consoleGriefBy(b, a, hours);
        maybeInfect(a, b, this.rng); // contagio (ciclo 25): el trato cara a cara pega la enfermedad
      }
      if (chat.remaining <= 0 || !a || !b) {
        ended.push(chat);
        if (a && b) {
          SocialSystem.acquaint(a, b, chatBond(a, b)); // el luto une (ciclo 20)
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
