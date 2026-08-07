// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Event Bus - Phase 44 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S44
 *
 * Phase 44 (2026-05-02) - pure-logic event bus state machine.
 * Subscribers identificados por id, eventos enfileirados em buffer
 * imutável. Não dispatcha automaticamente - caller drena buffer.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase/Promise.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const BUS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 44,
    deliveredAt: '2026-05-02',
});

/** Default config canônica. */
export const DEFAULT_CONFIG = Object.freeze({
    maxBuffer: 1000,
});

/**
 * Cria bus state inicial frozen.
 */
export function createBus(config: any = {}): any {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    return Object.freeze({
        maxBuffer: Number.isInteger(cfg.maxBuffer) && cfg.maxBuffer > 0 ? cfg.maxBuffer : DEFAULT_CONFIG.maxBuffer,
        subscribers: Object.freeze([]), // [{id, event, filter?}]
        buffer: Object.freeze([]), // [{id, event, payload, at}]
        stats: Object.freeze({ published: 0, dropped: 0, drained: 0 }),
    });
}

/**
 * Inscreve subscriber. Retorna novo bus + status.
 */
export function subscribe(bus: any, spec: any): any {
    if (!bus || !spec || typeof spec !== 'object') {
        return { bus, status: 'rejected' };
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        return { bus, status: 'rejected' };
    }
    if (typeof spec.event !== 'string' || !spec.event.trim()) {
        return { bus, status: 'rejected' };
    }
    if (bus.subscribers.some((s: any) => s.id === spec.id && s.event === spec.event)) {
        return { bus, status: 'duplicate' };
    }
    return Object.freeze({
        bus: Object.freeze({
            ...bus,
            subscribers: Object.freeze([
                ...bus.subscribers,
                Object.freeze({ id: spec.id, event: spec.event, filter: spec.filter || null }),
            ]),
        }),
        status: 'subscribed',
    });
}

/**
 * Remove subscriber por id (todos eventos) ou {id, event}.
 */
export function unsubscribe(bus: any, idOrSpec: any): any {
    if (!bus) return bus;
    if (typeof idOrSpec === 'string') {
        return Object.freeze({
            ...bus,
            subscribers: Object.freeze(bus.subscribers.filter((s: any) => s.id !== idOrSpec)),
        });
    }
    if (idOrSpec && typeof idOrSpec === 'object' && idOrSpec.id && idOrSpec.event) {
        return Object.freeze({
            ...bus,
            subscribers: Object.freeze(
                bus.subscribers.filter(
                    (s: any) =>
                        !((s.id === idOrSpec.id && s.event === idOrSpec.event) as any),
                ),
            ),
        });
    }
    return bus;
}

/**
 * Publica evento. Cada subscriber matching gera entry no buffer.
 */
export function publish(
    bus: any,
    event: any,
    payload: any,
    now: any,
): any {
    if (!bus || typeof event !== 'string' || !event.trim()) {
        return { bus, queued: 0, dropped: 0 };
    }
    if (!Number.isFinite(now)) now = Date.now();
    const matched = bus.subscribers.filter((s: any) => {
        if (s.event !== event && s.event !== '*') return false;
        if (typeof s.filter === 'function') {
            try {
                return s.filter(payload) !== false;
            } catch {
                return false;
            }
        }
        return true;
    });
    let buffer = bus.buffer;
    let dropped = 0;
    let queued = 0;
    for (const sub of matched) {
        if (buffer.length >= bus.maxBuffer) {
            dropped++;
            continue;
        }
        buffer = [...buffer, Object.freeze({ id: sub.id, event, payload, at: now })];
        queued++;
    }
    return Object.freeze({
        bus: Object.freeze({
            ...bus,
            buffer: Object.freeze(buffer),
            stats: Object.freeze({
                ...bus.stats,
                published: bus.stats.published + 1,
                dropped: bus.stats.dropped + dropped,
            }),
        }),
        queued,
        dropped,
    });
}

/**
 * Drena buffer (retorna entries + bus zerado).
 */
export function drain(bus: any): any {
    if (!bus) return { bus, entries: Object.freeze([]) };
    const entries = bus.buffer;
    return Object.freeze({
        bus: Object.freeze({
            ...bus,
            buffer: Object.freeze([]),
            stats: Object.freeze({ ...bus.stats, drained: bus.stats.drained + entries.length }),
        }),
        entries,
    });
}

/**
 * Drena entries por subscriber id.
 */
export function drainFor(bus: any, subscriberId: any): any {
    if (!bus || typeof subscriberId !== 'string') {
        return { bus, entries: Object.freeze([]) };
    }
    const entries = Object.freeze(bus.buffer.filter((e: any) => e.id === subscriberId));
    const remaining = bus.buffer.filter((e: any) => e.id !== subscriberId);
    return Object.freeze({
        bus: Object.freeze({
            ...bus,
            buffer: Object.freeze(remaining),
            stats: Object.freeze({ ...bus.stats, drained: bus.stats.drained + entries.length }),
        }),
        entries,
    });
}

/**
 * Sumariza state.
 */
export function summarizeBus(bus: any): any {
    const empty = { subscribers: 0, buffered: 0, published: 0, dropped: 0, drained: 0 };
    if (!bus) return empty;
    return Object.freeze({
        subscribers: bus.subscribers.length,
        buffered: bus.buffer.length,
        maxBuffer: bus.maxBuffer,
        published: bus.stats?.published || 0,
        dropped: bus.stats?.dropped || 0,
        drained: bus.stats?.drained || 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineEventBusMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 44,
    deliveredAt: '2026-05-02',
    exports: [
        'BUS_META',
        'DEFAULT_CONFIG',
        'createBus',
        'subscribe',
        'unsubscribe',
        'publish',
        'drain',
        'drainFor',
        'summarizeBus',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
