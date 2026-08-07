// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * CBMD-001 F3 — balance badge na statusbar (claude - ui, 2026-06-11).
 *
 * Entregue nos itens ⏳ do WBS §19: F3.1 (DOM `#balance-badge` após
 * `#status-save-state`), F3.2 (CSS `.credits-balance-*` em
 * credits-badge.css — namespace `.credits-*` por ownership), F3.4 (tick
 * 30s de frescor via TRUST-012 freshnessClassifier) e F3.6 (aria-label
 * dinâmico "Saldo {amount}, atualizado há {time}").
 *
 * ATUALIZADO 2026-08-06 (o texto anterior deste bloco estava OBSOLETO e dizia
 * que nada disto existia — campo velho mente para quem lê depois):
 *   - F3.3 fetch Supabase: **ENTREGUE**. `fetchBalanceSnapshot()` abaixo consulta
 *     a view `wallet_balance_snapshot`, que **existe em produção** (verificado por
 *     information_schema em 2026-08-06; migration 20260701120000). O bloqueio
 *     "🔒 F2" caiu — o F2 está done. `window.__ecbtBalanceSnapshot` segue como o
 *     canal de publicação lido por `_getSnapshot`, agora alimentado de verdade.
 *   - F3.5 click → BalanceHub: **ENTREGUE** (F4, commit a06f50e42) — o Hub existe
 *     com 3 abas e a11y medida 100/100 (axe-core, 4365886db). O fallback para o
 *     wallet panel continua para o modo legacy.
 *
 * Flag `CONFIG.FEATURES.BALANCE_BADGE` = **true** (ON) — decisão D1 do Calvin em
 * 2026-06-11 ("1 ligar"). NÃO confundir com `BALANCE_HUB_ENABLED`, que segue
 * false: o Hub tem gate JURÍDICO em produção (LIA SPEC_LGPD_LIA_BALANCE_ALERTS
 * §6.3 exige revisão jurídica externa + aprovação do controlador + designação de
 * DPO), não gate técnico.
 * Offline-first UX: sem snapshot → badge mostra "—" com title acionável.
 */
import { CONFIG } from '../../config.js';
import { t } from '../i18n/translations.js';
import {
    classifyAlertTier,
    computeNetBalance,
    formatBalance,
    type BalanceSnapshot,
} from '../../core/billing/balanceLedger.js';
import {
    classifyFreshness,
    formatRelativeTimeI18n,
} from '../../core/feedback/freshnessClassifier.js';

const BADGE_ID = 'balance-badge';
const TICK_MS = 30_000; // F3.4 — atualização periódica do frescor
let _tickTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Rollback hatch (CBMD-001 §8 / DoD "Rollback testado") — gate canônico do
 * badge de saldo. `CONFIG.FEATURES.BALANCE_BADGE !== true` (false/ausente)
 * DESATIVA a feature: `initBalanceBadge` vira no-op e nenhum `#balance-badge`
 * é montado na statusbar (legacy restaurado). Exportado para o gate cheap
 * `tests/customer-balance-flag.test.mjs` provar non-no-op sem DOM.
 */
export function isBalanceBadgeEnabled(): boolean {
    try {
        return (CONFIG as any)?.FEATURES?.BALANCE_BADGE === true;
    } catch {
        return false;
    }
}

function _featureOn(): boolean {
    return isBalanceBadgeEnabled();
}

function _getSnapshot(): BalanceSnapshot | null {
    const snap = (window as any).__ecbtBalanceSnapshot;
    if (snap && typeof snap === 'object' && Number.isFinite(Number(snap.netEcbt))) {
        return snap as BalanceSnapshot;
    }
    return null;
}

/**
 * F3.3 — produtor real do snapshot (fio F2→F3). Consulta a view owner-only
 * `wallet_balance_snapshot` (aplicada em prod, migration 20260701120000) via o
 * client Supabase já exposto no boot (`window.__ecbyts_supabase_client`),
 * mapeia as colunas para `BalanceSnapshot` e publica em
 * `window.__ecbtBalanceSnapshot` (fonte que `_getSnapshot` lê).
 *
 * Offline-first: sem client/sessão ou em qualquer falha/0 linhas, é no-op
 * silencioso — o badge mantém o estado "—" acionável (nunca lança).
 * `net_ecbt` NÃO é exposto pela view (é derivação fiscal client-side, F1) —
 * derivado aqui via `computeNetBalance(gross)`.
 */
export async function fetchBalanceSnapshot(): Promise<BalanceSnapshot | null> {
    let client: any = null;
    try {
        client = (window as any).__ecbyts_supabase_client || null;
    } catch {
        client = null;
    }
    if (!client || typeof client.from !== 'function') return null;
    try {
        const { data, error } = await client
            .from('wallet_balance_snapshot')
            .select('gross_ecbt, eic_credits, quota_used, quota_total, burn_rate_per_day, fetched_at')
            .maybeSingle();
        if (error || !data) return null;
        const gross = Number(data.gross_ecbt) || 0;
        const fetchedAtMs = data.fetched_at ? Date.parse(String(data.fetched_at)) : Date.now();
        const snap: BalanceSnapshot = {
            grossEcbt: gross,
            // net_ecbt não vem da view (fiscal, F1) — derivado client-side.
            netEcbt: computeNetBalance(gross),
            eicCredits: Number(data.eic_credits) || 0,
            quotaUsed: Number(data.quota_used) || 0,
            quotaTotal: Number(data.quota_total) || 0,
            burnRatePerDay: Number(data.burn_rate_per_day) || 0,
            fetchedAtMs: Number.isFinite(fetchedAtMs) ? fetchedAtMs : Date.now(),
        };
        (window as any).__ecbtBalanceSnapshot = snap;
        return snap;
    } catch {
        // Rede/RLS/sem sessão → mantém estado offline do badge, sem ruído.
        return null;
    }
}

/** Busca o snapshot e re-renderiza o badge (no-op se a feature estiver OFF). */
async function _refreshSnapshotAndRender(): Promise<void> {
    if (!_featureOn()) return;
    await fetchBalanceSnapshot();
    renderBalanceBadge();
}

function _ensureBadge(): HTMLElement | null {
    let el = document.getElementById(BADGE_ID);
    if (el) return el;
    const anchor = document.getElementById('status-save-state');
    if (!anchor || !anchor.parentElement) return null;
    el = document.createElement('span');
    el.id = BADGE_ID;
    el.className = 'status-item credits-balance-badge';
    // WCAG 2.1.1 (F3.5 P2): elemento clicável TEM que ser operável por
    // teclado — role="button" + tabindex="0" + Enter/Space. aria-live
    // explícito preserva o anúncio de atualização do saldo (antes implícito
    // via role="status", que não é papel de controle interativo).
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-live', 'polite');
    // F3.5 (🔒 F4): fallback até o BalanceHub existir — abre wallet panel.
    const _open = (): void => {
        const w = window as any;
        if (typeof w.handleOpenBalanceHub === 'function') w.handleOpenBalanceHub();
        else if (typeof w.handleOpenWalletPanel === 'function') w.handleOpenWalletPanel();
    };
    el.addEventListener('click', _open);
    el.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            _open();
        }
    });
    anchor.insertAdjacentElement('afterend', el);
    return el;
}

/** Re-renderiza o badge a partir do snapshot atual (ou estado offline). */
export function renderBalanceBadge(nowMs: number = Date.now()): void {
    const el = document.getElementById(BADGE_ID);
    if (!el) return;
    const snap = _getSnapshot();
    if (!snap) {
        // Offline-first: badge presente, estado claro, mensagem acionável.
        el.textContent = `— $ECBT`; // ◌ vem do CSS ::before (data-tier unknown)
        el.dataset.tier = 'unknown';
        const offline = t('balance.badge.offline');
        el.title = offline;
        el.setAttribute('aria-label', offline);
        return;
    }
    const amountTxt = formatBalance(snap.netEcbt, 'ECBT');
    const alert = classifyAlertTier(snap.quotaUsed, snap.quotaTotal);
    const fresh = classifyFreshness(snap.fetchedAtMs, nowMs, 'default');
    const rel = formatRelativeTimeI18n(snap.fetchedAtMs, nowMs);
    const relTxt = t(rel.key, rel.vars);
    // Regra no-emoji em UI: o icon do core (🟢/🟡/🔴, ok p/ logs) vira ●
    // via CSS ::before com cor por [data-tier] (credits-badge.css).
    el.textContent = amountTxt;
    el.dataset.tier = alert.tier;
    el.dataset.freshness = fresh.tier;
    // F3.6 — aria dinâmico: saldo + frescor (lido por screen reader no tick).
    const aria = t('balance.badge.aria', { amount: amountTxt, time: relTxt });
    el.title = `${aria}${fresh.recomputeRecommended ? ` · ${t('balance.badge.staleHint')}` : ''}`;
    el.setAttribute('aria-label', aria);
}

/**
 * Init idempotente — chamado no boot (feature-init). No-op com flag OFF
 * (D1 pendente) ou se a statusbar não existir (páginas secundárias).
 */
export function initBalanceBadge(attempt: number = 0): void {
    if (!_featureOn()) return;
    const el = _ensureBadge();
    if (!el) {
        // D1 ON (Calvin 2026-06-11): o wire roda no boot-preflight, ANTES da
        // statusbar montar — retry curto até a âncora existir (máx ~10s).
        if (attempt < 20) setTimeout(() => initBalanceBadge(attempt + 1), 500);
        return;
    }
    renderBalanceBadge();
    // F3.3 — busca inicial do snapshot real (fio F2→F3). Assíncrona e
    // offline-safe: falha vira no-op e o badge fica no estado "—".
    void _refreshSnapshotAndRender();
    if (_tickTimer) clearInterval(_tickTimer);
    _tickTimer = setInterval(() => {
        // Pausa quando aba oculta (economia — frescor não importa sem viewer).
        // Re-busca o snapshot no tick (poll 30s alinhado à cadência da view F2).
        if (document.visibilityState === 'visible') void _refreshSnapshotAndRender();
    }, TICK_MS);
}

/** Teardown p/ testes e re-init. */
export function disposeBalanceBadge(): void {
    if (_tickTimer) {
        clearInterval(_tickTimer);
        _tickTimer = null;
    }
    document.getElementById(BADGE_ID)?.remove();
}
