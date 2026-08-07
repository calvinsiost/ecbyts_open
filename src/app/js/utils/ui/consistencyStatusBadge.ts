// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   CONSISTENCY STATUS BADGE — CONSIST-OBS-001 S2 statusbar trigger
   Pilar 2 do North Star v2: tornar a confiança no resultado VISÍVEL.

   Renderiza um indicador permanente no statusbar (#consistency-status-badge)
   com:
   - dot SVG colorido (verde/vermelho/cinza)
   - label "Sistema" (i18n)
   - tooltip com summary

   Click no badge → window.handleOpenConsistencyPanel() abre o painel
   completo (consistencyPanel.ts).

   Sem emoji (regra ecbyts) — dot via SVG circle.
   ================================================================ */

import { CONFIG } from '../../config.js';
import type { ConsistencyVeredict } from '../telemetry/consistencyVeredictPure.js';
import { createPollBackoff } from '../helpers/_pollBackoffPure.js';

const BADGE_ID = 'consistency-status-badge';
const REFRESH_MS = 60_000; // re-fetch a cada 60s enquanto o endpoint responde
/** BOOT-RESILIENCE-001: teto do backoff quando o server local esta fora. */
const REFRESH_MAX_MS = 600_000; // 10min
const VEREDICT_URL = '/.runtime/consistency-veredict.json';
const FALLBACK_URL = '.runtime/consistency-veredict.json';

const DOT_COLORS: Record<string, string> = {
    green: '#15803d', // verde escuro WCAG AAA contrast on dark statusbar
    red: '#dc2626', // vermelho WCAG AAA
    unknown: '#9ca3af', // cinza neutro
};

const DOT_TITLES: Record<string, string> = {
    green: 'Sistema íntegro — todos os checks passam',
    red: 'Falha de consistência detectada',
    unknown: 'Status de consistência desconhecido (sem veredict)',
};

const LABEL_PT = 'Sistema';

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let veredictPollingDisabled = false;
let refreshStopped = true;
/**
 * BOOT-RESILIENCE-001: com o servidor local fora, o fetch do veredict falha
 * e o poll de cadencia fixa martelava a cada 60s para sempre. O backoff
 * espaca ate REFRESH_MAX_MS e volta a 60s no primeiro sucesso.
 */
const fetchBackoff = createPollBackoff({ baseMs: REFRESH_MS, capMs: REFRESH_MAX_MS });

function isFlagOn(): boolean {
    try {
        return Boolean((CONFIG as any)?.FEATURES?.CONSISTENCY_ADMIN_PANEL);
    } catch (e) {
        if (typeof console !== 'undefined') console.debug('[consistencyBadge:flag]', (e as Error)?.message || e);
        return false;
    }
}

function svgDot(color: string): string {
    return (
        '<svg width="10" height="10" viewBox="0 0 10 10" ' +
        'style="margin-right:4px;vertical-align:middle" aria-hidden="true">' +
        `<circle cx="5" cy="5" r="4" fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="0.5" />` +
        '</svg>'
    );
}

/**
 * Busca o veredict. `reachable` distingue "servidor respondeu" de "nao deu
 * para falar com o servidor" — so o segundo alimenta o backoff (um artefato
 * ausente ou malformado nao e problema de conectividade).
 */
async function fetchVeredict(): Promise<{ veredict: ConsistencyVeredict | null; reachable: boolean }> {
    if (veredictPollingDisabled) return { veredict: null, reachable: true };
    let missingRuntimeArtifact = false;
    let reachable = false;
    for (const u of [VEREDICT_URL, FALLBACK_URL]) {
        try {
            const r = await fetch(u, { cache: 'no-store' });
            reachable = true;
            if (r.status === 404) {
                missingRuntimeArtifact = true;
                continue;
            }
            if (!r.ok) continue;
            const j = await r.json();
            if (j && typeof j === 'object' && typeof j.status === 'string') {
                return { veredict: j as ConsistencyVeredict, reachable: true };
            }
        } catch (e) {
            if (typeof console !== 'undefined') console.debug('[consistencyBadge:fetch]', u, (e as Error)?.message || e);
            /* try next URL */
        }
    }
    if (missingRuntimeArtifact) veredictPollingDisabled = true;
    return { veredict: null, reachable };
}

function renderBadge(target: HTMLElement, v: ConsistencyVeredict | null): void {
    const status: string = v?.status === 'green' || v?.status === 'red' ? v.status : 'unknown';
    const color = DOT_COLORS[status] ?? DOT_COLORS.unknown!; // 'unknown' sempre no catálogo
    const summary =
        v && typeof v.summary === 'string' && v.summary.length > 0
            ? v.summary
            : (DOT_TITLES[status] ?? DOT_TITLES.unknown ?? '');
    target.innerHTML = `${svgDot(color)}<span>${LABEL_PT}</span>`;
    target.setAttribute('data-status', status);
    target.setAttribute('title', summary);
    target.setAttribute('aria-label', `Consistência do Sistema: ${summary}`);
}

async function refreshBadge(): Promise<void> {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById(BADGE_ID);
    if (!badge) return;
    if (!isFlagOn()) {
        badge.style.display = 'none';
        return;
    }
    badge.style.display = '';
    const { veredict, reachable } = await fetchVeredict();
    if (reachable) {
        fetchBackoff.recordSuccess();
    } else {
        fetchBackoff.recordFailure();
    }
    renderBadge(badge, veredict);
}

/**
 * Agenda o proximo refresh (BOOT-RESILIENCE-001).
 *
 * Era `setInterval(REFRESH_MS)` fixo: com o server local fora, isso virava
 * um fetch falho a cada 60s indefinidamente (o 404 desligava o poll, mas
 * ERRO DE REDE nao — e esse e justamente o caso do server morto). Agora e
 * uma cadeia de `setTimeout` guiada pelo backoff.
 */
function scheduleNextRefresh(): void {
    if (refreshStopped || typeof setTimeout === 'undefined') return;
    // 404 nas duas URLs: o artefato nao existe neste host — parar de vez.
    if (veredictPollingDisabled) {
        refreshTimer = null;
        return;
    }
    refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshBadge()
            .catch((e) => {
                if (typeof console !== 'undefined') console.debug('[consistencyBadge:refresh]', (e as Error)?.message || e);
            })
            .finally(() => scheduleNextRefresh());
    }, fetchBackoff.nextDelayMs());
}

/**
 * Initialize the consistency status badge in the statusbar.
 * Idempotent — clears any existing refresh timer before scheduling a new one.
 * Respects CONFIG.FEATURES.CONSISTENCY_ADMIN_PANEL (hides badge when OFF).
 */
export async function initConsistencyStatusBadge(): Promise<void> {
    if (typeof document === 'undefined') return;
    disposeConsistencyStatusBadge();
    fetchBackoff.reset();
    await refreshBadge();
    if (isFlagOn() && !veredictPollingDisabled && typeof setTimeout !== 'undefined') {
        refreshStopped = false;
        scheduleNextRefresh();
    }
}

/**
 * Programmatic teardown — stops the refresh chain.
 * Idempotente: marca parado ANTES de limpar, para que um tick em voo nao
 * se reagende depois do dispose.
 */
export function disposeConsistencyStatusBadge(): void {
    refreshStopped = true;
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
}

/**
 * Pure helper exposed for tests — given a veredict, return the canonical status.
 */
export function resolveBadgeStatus(v: ConsistencyVeredict | null): 'green' | 'red' | 'unknown' {
    if (!v || typeof v.status !== 'string') return 'unknown';
    return v.status === 'green' || v.status === 'red' ? v.status : 'unknown';
}
