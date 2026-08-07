// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 1 F2 — Dispatcher (boot pipeline integration).
//
// Lê `window.location.search` após scene-ready, parseia via parser, faz lazy
// import do módulo registrado, invoca openExport(payload), limpa URL via
// history.replaceState.
//
// Idempotente — flag global previne dupla aplicação no boot.
// Defensivo — qualquer erro em qualquer etapa registra console.debug + segue.
//
// SPEC: docs/specs/_archived/SPEC_DEEP_LINK_TOOLS_SHARING.md REQ-3

import { parseToolsParam, type ParseResult } from './deepLinkParser.js';

const FLAG_KEY = '__ecbytsDeepLinkApplied';

export interface DispatchOptions {
    /** Query string a parsear (default: window.location.search). */
    readonly queryString?: string;
    /** Callback no sucesso (telemetry/toast). */
    readonly onSuccess?: (toolId: string, payload: unknown) => void;
    /** Callback no erro (telemetry/toast). */
    readonly onError?: (reason: string, detail: string) => void;
    /**
     * Se true, FORÇA limpeza da URL após apply (legado pre-2026-06-03).
     *
     * **Default false** (Calvin diretiva 2026-06-03): URL `?tools=<id>` é
     * preservada após apply para que o address bar reflita o painel aberto
     * em tempo real. O painel passa a controlar a URL via
     * {@link syncDeepLinkUrl} / {@link clearDeepLinkUrl}.
     *
     * Opt-in para testes que precisam URL limpa explicitamente.
     */
    readonly forceUrlCleanup?: boolean;
    /**
     * @deprecated Renomeado para forceUrlCleanup com semântica invertida —
     * cleanup hoje é opt-in, não opt-out. Mantido para compat de testes legados.
     */
    readonly skipUrlCleanup?: boolean;
}

export interface DispatchResult {
    readonly applied: boolean;
    readonly result: ParseResult | null;
}

/**
 * Resolve a query string a usar.
 */
function resolveQueryString(opts: DispatchOptions): string {
    if (typeof opts.queryString === 'string') return opts.queryString;
    try {
        const loc = (globalThis as any).location;
        if (loc && typeof loc.search === 'string') return loc.search;
    } catch (e) {
        console.debug('[deepLink:dispatcher] query resolution failed', (e as Error)?.message || e);
    }
    return '';
}

/**
 * Aplica o deep-link (se houver) ao boot. Idempotente.
 *
 * Ordem:
 *   1. parseToolsParam(location.search)
 *   2. lazy import(entry.module)
 *   3. invoke export[entry.openExport](payload)
 *   4. history.replaceState clean (preserva ?key= se existir)
 *
 * NUNCA throws — captura tudo internamente.
 */
export async function applyDeepLink(opts: DispatchOptions = {}): Promise<DispatchResult> {
    // Idempotência global (anti-double-apply em hot reload)
    const g = globalThis as Record<string, unknown>;
    if (g[FLAG_KEY] === true) {
        return Object.freeze({ applied: false, result: null });
    }

    // Feature flag DEEP_LINK_ENABLED (SPEC §A5 — default ON, rollback hatch).
    // Toggle false em CONFIG.FEATURES → applyDeepLink no-op silencioso.
    try {
        const cfg = (g as any).CONFIG;
        if (cfg?.FEATURES && cfg.FEATURES.DEEP_LINK_ENABLED === false) {
            return Object.freeze({ applied: false, result: null });
        }
    } catch (e) {
        // Defensive: CONFIG ausente em test environment — segue comportamento default ON
        console.debug('[deepLink:dispatcher] flag-check-failed', (e as Error)?.message || e);
    }

    const qs = resolveQueryString(opts);
    const result = parseToolsParam(qs);

    if (!result.ok) {
        // Sem ?tools= → no-op silencioso
        if (result.reason === 'no-tools-param') {
            return Object.freeze({ applied: false, result });
        }
        // Erro real → callback + log
        opts.onError?.(result.reason, result.detail);
        console.debug('[deepLink:dispatcher]', result.reason, result.detail);
        return Object.freeze({ applied: false, result });
    }

    // Marca aplicado ANTES do invoke (evita dupla execução se invoke recarregar)
    g[FLAG_KEY] = true;

    try {
        // Lazy import do módulo (resolve relativo a este arquivo no runtime)
        const mod = (await import(result.entry.module as string)) as Record<string, unknown>;
        const fn = mod[result.entry.openExport];
        if (typeof fn !== 'function') {
            const detail = `export "${result.entry.openExport}" não é função em ${result.entry.module}`;
            opts.onError?.('payload-invalid', detail);
            console.debug('[deepLink:dispatcher] open-fn-missing', detail);
            return Object.freeze({ applied: false, result });
        }
        // Invoca com payload; openExport tem assinatura openX(payload?)
        await (fn as (p: unknown) => unknown | Promise<unknown>)(result.payload);
        opts.onSuccess?.(result.toolId, result.payload);
        // Telemetria opt-in (REQ-8 spec): emite `deep_link_opened`.
        // Defensive: trackEvent já checa isTelemetryEnabled() — LGPD opt-in.
        try {
            const mod = (await import('../telemetry/tracker.js')) as Record<string, unknown>;
            const track = mod['trackEvent'] as
                | ((eventType: string, target: string, metadata?: Record<string, unknown>) => void)
                | undefined;
            if (typeof track === 'function') {
                track('deep_link_opened', result.toolId, {
                    hasPayload: result.payload !== null && result.payload !== undefined,
                });
            }
        } catch (e) {
            console.debug('[deepLink:telemetry] opened track failed', (e as Error)?.message || e);
        }
    } catch (e) {
        const msg = (e as Error)?.message || String(e);
        opts.onError?.('payload-invalid', msg);
        console.debug('[deepLink:dispatcher] invoke-failed', msg);
    }

    // URL cleanup é opt-in (Calvin 2026-06-03): preservar `?tools=<id>` para que
    // o address bar reflita o painel aberto. Painel controla URL via
    // syncDeepLinkUrl / clearDeepLinkUrl em open/close lifecycle.
    // forceUrlCleanup=true preserva comportamento legado (limpa após apply).
    // skipUrlCleanup mantido para compat — semântica antiga: skip=true não limpava.
    const legacySkip = opts.skipUrlCleanup === true;
    if (opts.forceUrlCleanup === true && !legacySkip) {
        try {
            const hist = (globalThis as any).history;
            const loc = (globalThis as any).location;
            if (hist && typeof hist.replaceState === 'function' && loc) {
                const params = new URLSearchParams(loc.search);
                const key = params.get('key');
                const cleanQs = key ? `?key=${key}` : '';
                const clean = `${loc.pathname}${cleanQs}${loc.hash || ''}`;
                hist.replaceState({}, '', clean);
            }
        } catch (e) {
            console.debug('[deepLink:dispatcher] url-cleanup-failed', (e as Error)?.message);
        }
    }

    return Object.freeze({ applied: true, result });
}

/** Reseta o flag de idempotência — uso em testes. */
export function _resetDeepLinkApplied(): void {
    delete (globalThis as Record<string, unknown>)[FLAG_KEY];
}
