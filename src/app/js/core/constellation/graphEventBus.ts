// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * graphEventBus.ts — CONSTELLATION_METRIC_SIZING Phase 1.61
 * Pure event bus for graph changes. Zero browser/DOM/Three.js/Supabase dependencies.
 */

export type GraphEvent =
    | 'nodeAdded'
    | 'nodeRemoved'
    | 'nodeUpdated'
    | 'edgeAdded'
    | 'edgeRemoved'
    | 'edgeUpdated'
    | 'graphCleared'
    | 'layoutChanged';

export type GraphEventHandler = (payload: unknown) => void;

export interface BusSubscription {
    readonly id: string;
    readonly handler: GraphEventHandler;
}

export type BusSubscriptions = Readonly<Record<GraphEvent, ReadonlyArray<BusSubscription>>>;

export interface BusHistoryEntry {
    readonly event: GraphEvent;
    readonly payload: unknown;
    readonly at: number;
}

export interface EventBus {
    readonly subscriptions: BusSubscriptions;
    readonly history: ReadonlyArray<BusHistoryEntry>;
}

export interface SubscribeResult {
    readonly bus: EventBus;
    readonly subscriptionId: string;
}

export interface PublishResult {
    readonly bus: EventBus;
    readonly handled: number;
    readonly errors: ReadonlyArray<string>;
}

export interface DrainResult {
    readonly bus: EventBus;
    readonly totalHandled: number;
}

export interface BusSummary {
    readonly totalSubscribers: number;
    readonly totalHistory: number;
    readonly byEvent: Readonly<Record<string, number>>;
}

export const GRAPH_EVENTS = Object.freeze([
    'nodeAdded',
    'nodeRemoved',
    'nodeUpdated',
    'edgeAdded',
    'edgeRemoved',
    'edgeUpdated',
    'graphCleared',
    'layoutChanged',
] as const);

export const GRAPH_EVENT_BUS_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.61',
    deliveredAt: '2026-05-02',
    module: 'graphEventBus',
} as const);

let _counter = 0;
function _genId(): string {
    _counter += 1;
    return `sub_${_counter}_${Date.now()}`;
}

function _emptySubscriptions(): Record<GraphEvent, BusSubscription[]> {
    const subs: Record<GraphEvent, BusSubscription[]> = {
        nodeAdded: [],
        nodeRemoved: [],
        nodeUpdated: [],
        edgeAdded: [],
        edgeRemoved: [],
        edgeUpdated: [],
        graphCleared: [],
        layoutChanged: [],
    };
    return subs;
}

interface RawBus {
    readonly subscriptions: Partial<Record<GraphEvent, ReadonlyArray<BusSubscription>>>;
    readonly history: ReadonlyArray<BusHistoryEntry>;
}

function _freezeBus(bus: RawBus): EventBus {
    const frozenSubs: Record<GraphEvent, ReadonlyArray<BusSubscription>> = {
        nodeAdded: Object.freeze([...(bus.subscriptions.nodeAdded || [])]),
        nodeRemoved: Object.freeze([...(bus.subscriptions.nodeRemoved || [])]),
        nodeUpdated: Object.freeze([...(bus.subscriptions.nodeUpdated || [])]),
        edgeAdded: Object.freeze([...(bus.subscriptions.edgeAdded || [])]),
        edgeRemoved: Object.freeze([...(bus.subscriptions.edgeRemoved || [])]),
        edgeUpdated: Object.freeze([...(bus.subscriptions.edgeUpdated || [])]),
        graphCleared: Object.freeze([...(bus.subscriptions.graphCleared || [])]),
        layoutChanged: Object.freeze([...(bus.subscriptions.layoutChanged || [])]),
    };
    Object.freeze(frozenSubs);
    const frozenHistory = Object.freeze((bus.history || []).map((e) => Object.freeze({ ...e })));
    return Object.freeze({ subscriptions: frozenSubs, history: frozenHistory });
}

/** Cria um bus frozen vazio. */
export function createBus(): EventBus {
    return _freezeBus({ subscriptions: _emptySubscriptions(), history: [] });
}

/** Subscreve handler a evento → retorna novo bus frozen + subscriptionId. */
export function subscribe(bus: EventBus, event: GraphEvent, handler: GraphEventHandler): SubscribeResult {
    if (!(GRAPH_EVENTS as ReadonlyArray<string>).includes(event)) {
        throw new Error(`graphEventBus.subscribe: unknown event '${event}'`);
    }
    if (typeof handler !== 'function') {
        throw new TypeError('graphEventBus.subscribe: handler must be a function');
    }
    const id = _genId();
    const newSubs: Record<GraphEvent, BusSubscription[]> = _emptySubscriptions();
    for (const ev of GRAPH_EVENTS) {
        const existing = bus.subscriptions[ev] || [];
        newSubs[ev] = ev === event ? [...existing, { id, handler }] : [...existing];
    }
    return Object.freeze({
        bus: _freezeBus({ subscriptions: newSubs, history: bus.history || [] }),
        subscriptionId: id,
    });
}

/** Remove subscriber pelo id → novo bus frozen. */
export function unsubscribe(bus: EventBus, subscriptionId: string): EventBus {
    const newSubs: Record<GraphEvent, BusSubscription[]> = _emptySubscriptions();
    for (const ev of GRAPH_EVENTS) {
        newSubs[ev] = (bus.subscriptions[ev] || []).filter((s) => s.id !== subscriptionId);
    }
    return _freezeBus({ subscriptions: newSubs, history: bus.history || [] });
}

/** Publica evento: chama handlers + registra em history. */
export function publish(bus: EventBus, event: GraphEvent, payload: unknown): PublishResult {
    if (!(GRAPH_EVENTS as ReadonlyArray<string>).includes(event)) {
        return Object.freeze({
            bus,
            handled: 0,
            errors: Object.freeze([`unknown event '${event}'`]),
        });
    }

    const handlers = bus.subscriptions[event] || [];
    let handled = 0;
    const errors: string[] = [];

    for (const sub of handlers) {
        try {
            sub.handler(payload);
            handled += 1;
        } catch (e) {
            const err = e as Error;
            errors.push(err && err.message ? err.message : String(e));
        }
    }

    const entry: BusHistoryEntry = Object.freeze({ event, payload, at: Date.now() });
    const newHistory = Object.freeze([...(bus.history || []), entry]);

    const newSubs: Record<GraphEvent, BusSubscription[]> = _emptySubscriptions();
    for (const ev of GRAPH_EVENTS) {
        newSubs[ev] = [...(bus.subscriptions[ev] || [])];
    }

    return Object.freeze({
        bus: _freezeBus({ subscriptions: newSubs, history: newHistory }),
        handled,
        errors: Object.freeze(errors),
    });
}

/** Drena array de eventos processando em sequência. */
export function drainEvents(
    bus: EventBus,
    events: ReadonlyArray<{ event: GraphEvent; payload: unknown }>,
): DrainResult {
    if (!Array.isArray(events) || events.length === 0) {
        return Object.freeze({ bus, totalHandled: 0 });
    }

    let currentBus = bus;
    let totalHandled = 0;

    for (const { event, payload } of events) {
        const result = publish(currentBus, event, payload);
        currentBus = result.bus;
        totalHandled += result.handled;
    }

    return Object.freeze({ bus: currentBus, totalHandled });
}

/** Filtra history por tipo de evento. */
export function queryHistory(bus: EventBus | null | undefined, event: GraphEvent): ReadonlyArray<BusHistoryEntry> {
    const history = bus && bus.history ? bus.history : [];
    return Object.freeze(history.filter((e) => e.event === event).map((e) => Object.freeze({ ...e })));
}

/** Limpa history → novo bus frozen. */
export function clearHistory(bus: EventBus): EventBus {
    const newSubs: Record<GraphEvent, BusSubscription[]> = _emptySubscriptions();
    for (const ev of GRAPH_EVENTS) {
        newSubs[ev] = [...(bus.subscriptions[ev] || [])];
    }
    return _freezeBus({ subscriptions: newSubs, history: [] });
}

/** Sumariza bus: total subscribers, total history, por evento. */
export function summarizeBus(bus: EventBus | null | undefined): BusSummary {
    if (!bus || !bus.subscriptions) {
        return Object.freeze({
            totalSubscribers: 0,
            totalHistory: 0,
            byEvent: Object.freeze({}),
        });
    }
    const byEvent: Record<string, number> = {};
    let totalSubscribers = 0;
    for (const ev of GRAPH_EVENTS) {
        const count = (bus.subscriptions[ev] || []).length;
        byEvent[ev] = count;
        totalSubscribers += count;
    }
    return Object.freeze({
        totalSubscribers,
        totalHistory: (bus.history || []).length,
        byEvent: Object.freeze(byEvent),
    });
}

export const graphEventBusMeta = Object.freeze({
    module: 'graphEventBus',
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.61',
    exports: Object.freeze([
        'GRAPH_EVENTS',
        'GRAPH_EVENT_BUS_META',
        'createBus',
        'subscribe',
        'unsubscribe',
        'publish',
        'drainEvents',
        'queryHistory',
        'clearHistory',
        'summarizeBus',
        'graphEventBusMeta',
    ]),
    provenance: Object.freeze({
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    }),
} as const);
