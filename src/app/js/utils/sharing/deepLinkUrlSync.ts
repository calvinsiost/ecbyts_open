// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 3 — Live URL sync (Calvin 2026-06-03).
//
// Calvin diretiva 2026-06-03: address bar deve refletir o painel aberto em tempo
// real. Ao abrir painel deep-linkable, URL vira `?tools=<id>&payload=<b64>` sem
// reload. Ao fechar, URL volta ao estado prévio (preserva `?key=` ECBT).
//
// Pattern: cada painel Tier-A chama no boot/open:
//     import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
//     syncDeepLinkUrl('mca', { … });    // ao abrir / mudança de estado relevante
//     clearDeepLinkUrl();                 // ao fechar / dispose
//
// Idempotente — chamadas consecutivas com mesma URL são no-op.
// Defensivo — captura qualquer erro internamente; jamais propaga ao painel.
//
// SPEC: docs/specs/_archived/SPEC_DEEP_LINK_TOOLS_SHARING.md REQ-9 (live sync)

import { generateToolsUrl } from './deepLinkGenerator.js';
import { getDeepLinkEntry } from './deepLinkRegistry.js';

console.debug('[mod:load]', 'app/js/utils/sharing/deepLinkUrlSync.ts');

/** Última URL que escrevemos via replaceState. Anti-double-write idempotency. */
let lastWrittenUrl: string | null = null;

/**
 * Resolve a query string preservada (key= ECBT) a manter no replaceState.
 * Reutiliza window.location.search atual; remove apenas tools/payload.
 */
function preservedQueryParams(): URLSearchParams {
    const out = new URLSearchParams();
    try {
        const loc = (globalThis as any).location;
        if (loc && typeof loc.search === 'string') {
            const cur = new URLSearchParams(loc.search);
            // Preserva tudo EXCETO os params que controlamos.
            cur.forEach((v, k) => {
                if (k !== 'tools' && k !== 'payload') out.set(k, v);
            });
        }
    } catch (e) {
        console.debug('[deepLink:urlSync] preserve-query-failed', (e as Error)?.message || e);
    }
    return out;
}

/**
 * Atualiza o address bar com `?tools=<id>&payload=<b64>` preservando outros
 * params (key, _v cache-bust, etc.). Não recarrega a página.
 *
 * Se toolId desconhecido → no-op silencioso (não polui URL).
 * Se payload muito grande / não-serializável → URL apenas com tools (sem payload).
 *
 * @returns true se URL foi atualizada (mudou de estado), false se no-op.
 */
export function syncDeepLinkUrl(toolId: string, payload?: unknown): boolean {
    if (typeof toolId !== 'string' || !toolId) return false;
    const entry = getDeepLinkEntry(toolId);
    if (!entry) {
        // Tool desconhecido — defensive: não escreve URL, log debug.
        console.debug('[deepLink:urlSync] unknown-tool-id', toolId);
        return false;
    }

    try {
        const hist = (globalThis as any).history;
        const loc = (globalThis as any).location;
        if (!hist || typeof hist.replaceState !== 'function' || !loc) return false;

        // Construímos params manualmente para mesclar tools+payload com preservados.
        const params = preservedQueryParams();
        params.set('tools', entry.toolId);

        if (payload !== undefined && payload !== null) {
            // Reaproveita generator para encode + size cap; descarta baseUrl.
            const gen = generateToolsUrl(toolId, payload, { baseUrl: '' });
            if (gen.ok) {
                const inner = new URLSearchParams(gen.url.replace(/^\?/, ''));
                const encoded = inner.get('payload');
                if (encoded) params.set('payload', encoded);
            }
            // Se gen falhou (payload too large) → URL fica só com tools=<id>.
        }

        const qs = params.toString();
        const newUrl = `${loc.pathname}${qs ? `?${qs}` : ''}${loc.hash || ''}`;

        if (lastWrittenUrl === newUrl) return false; // Idempotente
        hist.replaceState({}, '', newUrl);
        lastWrittenUrl = newUrl;
        return true;
    } catch (e) {
        console.debug('[deepLink:urlSync] sync-failed', (e as Error)?.message || e);
        return false;
    }
}

/**
 * Remove `tools=` e `payload=` da URL preservando todos os outros params.
 * Chamado quando painel deep-linkable fecha.
 *
 * @returns true se URL foi alterada, false se já estava limpa.
 */
export function clearDeepLinkUrl(): boolean {
    try {
        const hist = (globalThis as any).history;
        const loc = (globalThis as any).location;
        if (!hist || typeof hist.replaceState !== 'function' || !loc) return false;

        const cur = new URLSearchParams(typeof loc.search === 'string' ? loc.search : '');
        if (!cur.has('tools') && !cur.has('payload')) {
            // Já está limpa
            lastWrittenUrl = null;
            return false;
        }
        cur.delete('tools');
        cur.delete('payload');
        const qs = cur.toString();
        const newUrl = `${loc.pathname}${qs ? `?${qs}` : ''}${loc.hash || ''}`;

        hist.replaceState({}, '', newUrl);
        lastWrittenUrl = null;
        return true;
    } catch (e) {
        console.debug('[deepLink:urlSync] clear-failed', (e as Error)?.message || e);
        return false;
    }
}

/**
 * Reseta estado interno (idempotency cache). Uso em testes.
 * @internal
 */
export function _resetDeepLinkUrlSync(): void {
    lastWrittenUrl = null;
}

/**
 * Retorna o último URL que escrevemos (debug/tests).
 * @internal
 */
export function _getLastWrittenUrl(): string | null {
    return lastWrittenUrl;
}
