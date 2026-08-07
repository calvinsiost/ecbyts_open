// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * broadcastAdapter.js - Cross-tab message adapter (pure-logic, injectable channel)
 *
 * Motivação: testar lógica de publish/subscribe sem tocar em `BroadcastChannel`
 * do browser. Factory recebe `channel` injetado que implementa a interface
 * mínima: { postMessage(data), addEventListener(type, listener),
 * removeEventListener(type, listener), close() }.
 *
 * Em produção, o caller passa `new BroadcastChannel('ecbyts-project-tabs')`.
 * Em testes, passa um mock in-memory.
 *
 * Não referencia `BroadcastChannel`, `window`, `document` - é puro.
 *
 * Mensagens seguem envelope:
 *   { v: 1, type: string, senderId: string, ts: number, payload: any }
 *
 * Assinantes com `{type: 'open-tab'}` só recebem envelopes com type igual.
 * Assinantes sem `type` recebem tudo. Envelopes do próprio sender são
 * filtrados por default (echo suppression).
 */

const ENVELOPE_VERSION = 1;

interface ChannelLike {
    postMessage: (data: unknown) => void;
    addEventListener: (type: string, listener: (ev: { data?: unknown }) => void) => void;
    removeEventListener: (type: string, listener: (ev: { data?: unknown }) => void) => void;
    close: () => void;
}

interface Envelope {
    v: number;
    type: string;
    senderId: string;
    ts: number;
    payload: unknown;
}

export class BroadcastAdapterError extends Error {
    code: string;
    details: Record<string, unknown>;

    constructor(code: string, details: Record<string, unknown> = {}) {
        super(`[BroadcastAdapter] ${code} ${JSON.stringify(details)}`);
        this.name = 'BroadcastAdapterError';
        this.code = code;
        this.details = details;
    }
}

function _isChannelLike(ch: unknown): ch is ChannelLike {
    if (!ch || typeof ch !== 'object') return false;
    const c = ch as {
        postMessage?: unknown;
        addEventListener?: unknown;
        removeEventListener?: unknown;
        close?: unknown;
    };
    return (
        typeof c.postMessage === 'function' &&
        typeof c.addEventListener === 'function' &&
        typeof c.removeEventListener === 'function' &&
        typeof c.close === 'function'
    );
}

function _defaultSenderId(clock: () => number): string {
    return `sender-${clock().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type EnvelopeHandler = (env: Readonly<Envelope>) => void;

/**
 * Cria adapter ligado a `channel`.
 */
export function createBroadcastAdapter(opts: {
    channel: ChannelLike;
    senderId?: string;
    suppressEcho?: boolean;
    clock?: () => number;
}): Readonly<{
    publish: (type: string, payload?: unknown) => Readonly<Envelope>;
    subscribe: (
        arg1: string | EnvelopeHandler | { type?: string },
        arg2?: EnvelopeHandler,
    ) => Readonly<{ id: number; unsubscribe: () => void }>;
    close: () => void;
    getSenderId: () => string;
    isClosed: () => boolean;
}> {
    if (!opts || typeof opts !== 'object') {
        throw new BroadcastAdapterError('missing_opts', {});
    }
    const { channel } = opts;
    if (!_isChannelLike(channel)) {
        throw new BroadcastAdapterError('invalid_channel', {
            got: channel == null ? String(channel) : typeof channel,
        });
    }
    const clock: () => number = typeof opts.clock === 'function' ? opts.clock : () => Date.now();
    const suppressEcho = opts.suppressEcho !== false;
    const senderId =
        typeof opts.senderId === 'string' && opts.senderId.length > 0 ? opts.senderId : _defaultSenderId(clock);

    const subs: Map<number, { typeFilter: string | null; handler: EnvelopeHandler }> = new Map();
    let subIdSeq = 0;
    let closed = false;

    function _dispatchEvent(ev: { data?: unknown }): void {
        if (closed) return;
        const raw = ev && typeof ev === 'object' ? ev.data : null;
        if (!raw || typeof raw !== 'object') return;
        const env = raw as Partial<Envelope>;
        if (env.v !== ENVELOPE_VERSION) return; // silenciosamente ignora versões incompatíveis
        if (typeof env.type !== 'string') return;
        if (suppressEcho && env.senderId === senderId) return;

        const fullEnv = env as Envelope;

        // Iteração defensiva: copia antes de iterar (listeners podem des-subscrever)
        const snapshot = Array.from(subs.values());
        for (const sub of snapshot) {
            if (sub.typeFilter != null && sub.typeFilter !== fullEnv.type) continue;
            try {
                sub.handler(Object.freeze({ ...fullEnv }));
            } catch (err) {
                // Silencia para não derrubar canal; caller decide logging
                console.warn('[BroadcastAdapter] subscriber threw', err);
            }
        }
    }

    // Listener único atachado ao canal; fan-out para subs internos.
    channel.addEventListener('message', _dispatchEvent);

    function publish(type: string, payload?: unknown): Readonly<Envelope> {
        if (closed) throw new BroadcastAdapterError('adapter_closed', {});
        if (typeof type !== 'string' || type.length === 0) {
            throw new BroadcastAdapterError('invalid_type', { type });
        }
        const env: Envelope = {
            v: ENVELOPE_VERSION,
            type,
            senderId,
            ts: clock(),
            payload: payload === undefined ? null : payload,
        };
        try {
            channel.postMessage(env);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new BroadcastAdapterError('post_failed', { message });
        }
        return Object.freeze({ ...env });
    }

    function subscribe(
        arg1: string | EnvelopeHandler | { type?: string },
        arg2?: EnvelopeHandler,
    ): Readonly<{ id: number; unsubscribe: () => void }> {
        if (closed) throw new BroadcastAdapterError('adapter_closed', {});
        // Assinaturas:
        //   subscribe(handler) - recebe todo tipo
        //   subscribe(type, handler) - filtrado
        //   subscribe({type}, handler) - filtrado por objeto opts
        let typeFilter: string | null = null;
        let handler: EnvelopeHandler | null;
        if (typeof arg1 === 'function' && arg2 === undefined) {
            handler = arg1;
        } else if (typeof arg1 === 'string' && typeof arg2 === 'function') {
            typeFilter = arg1;
            handler = arg2;
        } else if (arg1 && typeof arg1 === 'object' && typeof arg2 === 'function') {
            const optsArg = arg1 as { type?: string };
            typeFilter = typeof optsArg.type === 'string' ? optsArg.type : null;
            handler = arg2;
        } else {
            throw new BroadcastAdapterError('invalid_subscribe_args', {});
        }
        if (!handler) throw new BroadcastAdapterError('invalid_subscribe_args', {});
        subIdSeq += 1;
        const id = subIdSeq;
        subs.set(id, { typeFilter, handler });
        return Object.freeze({
            id,
            unsubscribe: () => {
                subs.delete(id);
            },
        });
    }

    function close(): void {
        if (closed) return;
        closed = true;
        try {
            channel.removeEventListener('message', _dispatchEvent);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.debug('[broadcastAdapter] removeListener:', message);
            /* best-effort */
        }
        try {
            channel.close();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.debug('[broadcastAdapter] channel-close:', message);
            /* best-effort */
        }
        subs.clear();
    }

    function getSenderId(): string {
        return senderId;
    }

    function isClosed(): boolean {
        return closed;
    }

    return Object.freeze({
        publish,
        subscribe,
        close,
        getSenderId,
        isClosed,
    });
}
