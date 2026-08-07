// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   EVENT DEDUP (utils/helpers — cross-spec pure-logic)
   ================================================================

   Server-side dedup de eventos via sliding window. Diferente de
   _idempotencyKeyPure (client-side, evita double-charge no retry),
   este protege contra:
     - Webhook replay attacks (mesmo evento enviado 2x)
     - Sensor IoT repeated readings (mesmo valor em janela curta)
     - Telemetry bursts (flood from client bug)
     - PhotoLog duplicate EXIF (mesma foto enviada 2x)

   Pure-logic: estado é Map<key, lastSeenAtMs>. Caller injeta nowMs
   (Date.now()) e windowMs. Updates retornam NOVO Map (immutable).

   Cross-spec consumers (SEC-HARDENING-001 F1 🔴):
     - supabase/functions/mercadopago-webhook (dedup antes de ecbt_credit)
     - supabase/functions/stripe-webhook (idempotent event processing)
     - core/sensor/* (drop repeated sensor readings)
     - supabase/functions/telemetry-ingest (drop client bursts)
     - core/photolog/* (dedup duplicate uploads by EXIF hash)

   Webhook replay use case:
     1. Webhook recebe POST com evento provedor
     2. buildDedupKey({event_id, source, body_hash})
     3. decideEventDedup(key, store, nowMs, windowMs)
        - 'accept' → processa + recordSeen(store, key, nowMs)
        - 'drop' → 200 OK silencioso (não re-processa)
        - 'expired_replay' → 409 Conflict (chave expirou janela mas
          é replay malicioso de evento muito antigo)
   ================================================================ */

import { fnv1aHashHex } from './hashFnv1a.js';

export const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MIN_WINDOW_MS = 1000;
export const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const DEDUP_KEY_PREFIX = 'evt';
const MAX_FIELD_VALUE_LEN = 2048;

export type DedupAction = 'accept' | 'drop' | 'expired_replay';

export interface EventInput {
    readonly source: string;
    readonly eventId?: string | null;
    readonly bodyHash?: string | null;
    readonly extraFields?: Readonly<Record<string, unknown>>;
}

export interface DedupVerdict {
    readonly action: DedupAction;
    readonly reason: string;
    readonly lastSeenAtMs: number | null;
    readonly ageMs: number;
}

export type SeenMap = ReadonlyMap<string, number>;

function safeString(value: unknown, fallback: string): string {
    if (typeof value !== 'string' || value.length === 0) return fallback;
    return value.length > MAX_FIELD_VALUE_LEN ? value.slice(0, MAX_FIELD_VALUE_LEN) : value;
}

function clampWindow(windowMs: unknown): number {
    if (typeof windowMs !== 'number' || !isFinite(windowMs) || windowMs <= 0) {
        return DEFAULT_WINDOW_MS;
    }
    if (windowMs < MIN_WINDOW_MS) return MIN_WINDOW_MS;
    if (windowMs > MAX_WINDOW_MS) return MAX_WINDOW_MS;
    return Math.floor(windowMs);
}

function clampNow(nowMs: unknown): number {
    if (typeof nowMs !== 'number' || !isFinite(nowMs)) return 0;
    return Math.floor(nowMs);
}

export function buildDedupKey(input: EventInput | null | undefined): string {
    if (!input || typeof input !== 'object') {
        return `${DEDUP_KEY_PREFIX}-empty`;
    }
    const source = safeString(input.source, 'unknown');
    const eventId = safeString(input.eventId ?? null, '');
    const bodyHash = safeString(input.bodyHash ?? null, '');
    let extraSerialized = '';
    if (input.extraFields && typeof input.extraFields === 'object') {
        const entries = Object.entries(input.extraFields as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        extraSerialized = entries
            .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, MAX_FIELD_VALUE_LEN) : String(v)}`)
            .join('|');
    }
    const seed = `${source}|${eventId}|${bodyHash}|${extraSerialized}`;
    const hash = fnv1aHashHex(seed, 8);
    return `${DEDUP_KEY_PREFIX}-${hash}`;
}

export function decideEventDedup(
    key: string,
    seenMap: SeenMap | null | undefined,
    nowMs: number,
    windowMs?: number
): DedupVerdict {
    const safeNow = clampNow(nowMs);
    const window = clampWindow(windowMs);
    if (typeof key !== 'string' || key.length === 0) {
        return Object.freeze({
            action: 'accept' as const,
            reason: 'no_key_pass_through',
            lastSeenAtMs: null,
            ageMs: 0,
        });
    }
    const lastSeen = seenMap?.get?.(key);
    if (typeof lastSeen !== 'number' || !isFinite(lastSeen)) {
        return Object.freeze({
            action: 'accept' as const,
            reason: 'first_seen',
            lastSeenAtMs: null,
            ageMs: 0,
        });
    }
    const ageMs = safeNow - lastSeen;
    if (ageMs < 0) {
        return Object.freeze({
            action: 'expired_replay' as const,
            reason: 'clock_skew_or_future_event',
            lastSeenAtMs: lastSeen,
            ageMs,
        });
    }
    if (ageMs <= window) {
        return Object.freeze({
            action: 'drop' as const,
            reason: 'within_dedup_window',
            lastSeenAtMs: lastSeen,
            ageMs,
        });
    }
    return Object.freeze({
        action: 'expired_replay' as const,
        reason: 'beyond_dedup_window_replay_suspected',
        lastSeenAtMs: lastSeen,
        ageMs,
    });
}

export function recordSeen(seenMap: SeenMap | null | undefined, key: string, nowMs: number): Map<string, number> {
    const next = new Map<string, number>(seenMap ?? []);
    if (typeof key === 'string' && key.length > 0) {
        next.set(key, clampNow(nowMs));
    }
    return next;
}

export function pruneExpired(
    seenMap: SeenMap | null | undefined,
    nowMs: number,
    windowMs?: number
): Map<string, number> {
    const safeNow = clampNow(nowMs);
    const window = clampWindow(windowMs);
    const next = new Map<string, number>();
    if (!seenMap || typeof seenMap.forEach !== 'function') return next;
    seenMap.forEach((lastSeen, key) => {
        if (typeof lastSeen !== 'number' || !isFinite(lastSeen)) return;
        if (safeNow - lastSeen <= window) {
            next.set(key, lastSeen);
        }
    });
    return next;
}

export function countActive(seenMap: SeenMap | null | undefined, nowMs: number, windowMs?: number): number {
    if (!seenMap || typeof seenMap.forEach !== 'function') return 0;
    const safeNow = clampNow(nowMs);
    const window = clampWindow(windowMs);
    let count = 0;
    seenMap.forEach(lastSeen => {
        if (typeof lastSeen === 'number' && isFinite(lastSeen) && safeNow - lastSeen <= window) {
            count++;
        }
    });
    return count;
}
