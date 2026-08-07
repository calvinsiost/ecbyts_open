// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * CBMD-001 F4 / SPEC_COMMERCIAL_READINESS T1.3 — BalanceHub: modal 3 abas
 * (Saldos / Histórico / Alertas) do saldo do cliente.
 *
 * Wire DOM fino sobre as camadas puras já testadas:
 *   - `_balanceHubTabsPure.ts`  — state machine WAI-ARIA das tabs (F4.9)
 *   - `_balanceHubViewPure.ts`  — view-model das 3 abas + prefs (F4.8)
 *   - `balanceLedger.ts`        — formatação/fiscal/tier (F1)
 *   - `_balanceMeteringPeriodPure.ts` — agregação por período
 *   - `balanceExportRuntime.ts` — export CSV/JSON LGPD (F4.4)
 *
 * Dados: mesmo seam do balanceBadge (F3.3) — `window.__ecbtBalanceSnapshot`
 * alimentado pela view `wallet_balance_snapshot`, com degradação graciosa
 * offline-first (sem snapshot → estado vazio acionável, nunca lança).
 *
 * Padrão da casa: .ecbt-overlay/.ecbt-dialog--xl + attachModalA11y
 * (referência: ipNoticeModal.ts / balanceProtectionModal.ts).
 */
import { t, getCurrentLanguage } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { attachModalA11y } from './modalA11y.js';
import { CONFIG } from '../../config.js';
import {
    resolveBalanceHubMode,
    FEATURE_OVERRIDES_STORAGE_KEY,
    type BalanceHubMode,
} from './_balanceHubFlagPure.js';
import { asyncConfirm } from './asyncDialogs.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import {
    handleTabKey,
    selectTab,
    type BalanceHubTabsState,
} from './_balanceHubTabsPure.js';
import { buildTabsVm } from './_balanceHubTabsPure.js';
import {
    BALANCE_PREFS_STORAGE_KEY,
    buildHistoryVm,
    buildSaldosVm,
    normalizeAlertPrefs,
    restoreBalancePrefs,
    serializeBalancePrefs,
    tabsStateFromPrefs,
    ALERT_THRESHOLD_PCTS,
    buildNfseCellVm,
    indexNfseRowsByTx,
    type BalanceAlertPrefs,
    type NfseInvoiceRawRow,
} from './_balanceHubViewPure.js';
import { validateCancelReason, MIN_CANCEL_REASON_CHARS } from '../../core/billing/_nfseActionButtonsPure.js';
import { deriveReissueIdempotencyKey } from '../../core/billing/nfseGateway.js';
import { mapPaymentError } from '../../core/billing/_paymentErrorMessagesPure.js';
import { showToast } from './toast.js';
import type { SupportedLocale, TransactionLine } from '../../core/billing/balanceLedger.js';
import type { MeteringPeriodGranularity } from '../../core/billing/_balanceMeteringPeriodPure.js';

const OVERLAY_ID = 'balance-hub-overlay';
const DIALOG_ID = 'balance-hub-modal';

// ----------------------------------------------------------------
// STATE (por abertura — reconstruído em cada openBalanceHub)
// ----------------------------------------------------------------
let _tabs: BalanceHubTabsState | null = null;
let _alerts: BalanceAlertPrefs | null = null;
let _txLines: TransactionLine[] = [];
let _nfseByTx: Map<string, NfseInvoiceRawRow> = new Map();
let _cancelTargetTxId: string | null = null; // modal F12.6 aberto p/ esta tx
let _period = ''; // '' = todos
let _granularity: MeteringPeriodGranularity = 'month';
let _a11yCleanup: (() => void) | null = null;
let _abort: AbortController | null = null;

/**
 * Gate de rollback do Hub (spec §8/§8.2) — CONFIG.FEATURES.BALANCE_HUB_ENABLED
 * + override de runtime em localStorage 'ecbyts-feature-overrides'.
 * Decisão 100% pura em `_balanceHubFlagPure.resolveBalanceHubMode` (o wire só
 * lê o localStorage defensivamente). 'legacy' = badge F3 sem Hub.
 */
function _hubMode(): BalanceHubMode {
    let overridesRaw: string | null = null;
    try {
        overridesRaw = localStorage.getItem(FEATURE_OVERRIDES_STORAGE_KEY);
    } catch {
        overridesRaw = null;
    }
    return resolveBalanceHubMode((CONFIG as any)?.FEATURES, overridesRaw);
}

function _locale(): SupportedLocale {
    try {
        const lang = getCurrentLanguage();
        if (lang === 'en-US' || lang === 'es-LA' || lang === 'pt-BR') return lang;
    } catch (e: any) {
        console.debug('[balanceHub] i18n indisponível → pt-BR:', e?.message || e);
    }
    return 'pt-BR';
}

function _persistPrefs(): void {
    if (!_tabs || !_alerts) return;
    // F4.8 — safeSetItem: quota cheia não crasha, fallback silencioso.
    safeSetItem(BALANCE_PREFS_STORAGE_KEY, serializeBalancePrefs(_tabs, _alerts));
}

// ----------------------------------------------------------------
// DADOS (seam do badge F3.3 — degradação graciosa)
// ----------------------------------------------------------------

/** Snapshot: cache global do badge, senão fetch da view (offline → null). */
async function _getSnapshot(): Promise<unknown> {
    const cached = (window as any).__ecbtBalanceSnapshot;
    if (cached && typeof cached === 'object') return cached;
    try {
        const mod = await import('./balanceBadge.js' as string);
        return await mod.fetchBalanceSnapshot();
    } catch {
        return null;
    }
}

/** Transações do ledger → TransactionLine[] (vazio em qualquer falha). */
async function _getTxLines(): Promise<TransactionLine[]> {
    try {
        const mod = await import('../../core/currency/ecbtLedger.js' as string);
        const raw = await mod.getTransactions({ limit: 500 });
        return (Array.isArray(raw) ? raw : []).map((tx: any, i: number): TransactionLine => {
            const balanceAfterEcbt = Number.isFinite(Number(tx?.balance_after))
                ? Number(tx.balance_after) / 1_000_000
                : undefined;
            return {
                txId: String(tx?.id ?? `tx-${i}`),
                timestampMs: tx?.created_at ? Date.parse(String(tx.created_at)) : NaN,
                actionLabel: String(tx?.description || tx?.type || ''),
                units: Math.abs(Number(tx?.amount) || 0) / 1_000_000,
                unit: 'ECBT',
                // costBrl não vem do ledger ainda; omitido (não `undefined` explícito)
                // para respeitar exactOptionalPropertyTypes.
                ...(balanceAfterEcbt !== undefined ? { balanceAfterEcbt } : {}),
            };
        });
    } catch {
        return [];
    }
}

/**
 * F12 — linhas de nfse_invoices das transações visíveis, pelo MESMO seam de
 * boot do badge/ledger (window.__ecbyts_supabase_client). Qualquer falha,
 * RLS negando ou seam ausente → Map vazio (célula '—', nunca lança).
 */
async function _getNfseRows(txIds: readonly string[]): Promise<Map<string, NfseInvoiceRawRow>> {
    try {
        const client = (window as any).__ecbyts_supabase_client;
        if (!client || typeof client.from !== 'function' || !txIds.length) return new Map();
        const res: any = await client
            .from('nfse_invoices')
            .select('ledger_tx_id,status,invoice_url,nfse_idempotency_key,retry_count,last_error_code,nfse_events,created_at,updated_at')
            .in('ledger_tx_id', txIds.slice(0, 500));
        return indexNfseRowsByTx(res?.data);
    } catch {
        return new Map();
    }
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/** Abre o BalanceHub (F4). Idempotente — reabre recarregando dados. */
export async function openBalanceHub(): Promise<void> {
    // §8 — rollback hatch: em modo 'legacy' o Hub NÃO abre; cai no wallet
    // panel legado (mesmo fallback do balanceBadge F3.5). Remover este gate
    // quebra tests/cbmd-001-balance-hub-modal-wire.test.mjs (non-no-op).
    if (_hubMode() !== 'hub') {
        const w = window as any;
        if (typeof w.handleOpenWalletPanel === 'function') w.handleOpenWalletPanel();
        return;
    }
    // balance-hub.css é deferred desde 6c0dee6da (perf boot budget) e só
    // seria ativado por lotes de pointerover — abrir o hub antes disso
    // renderizaria o modal sem estilo (progressbar com altura 0). Ativa o
    // stylesheet do hub no momento da abertura (mesmo mecanismo de
    // deferred-styles.ts).
    const cssLink = document.querySelector<HTMLLinkElement>(
        'link[data-deferred-href$="balance-hub.css"]',
    );
    if (cssLink?.dataset.deferredHref) {
        cssLink.href = cssLink.dataset.deferredHref;
        delete cssLink.dataset.deferredHref;
    }
    const prefs = restoreBalancePrefs(_readPrefsRaw());
    _tabs = tabsStateFromPrefs(prefs);
    _alerts = prefs.alerts;
    _period = '';
    _cancelTargetTxId = null;
    const overlay = _getOrCreateOverlay();
    _render(overlay);
    overlay.style.display = 'flex';
    _a11yCleanup = attachModalA11y(overlay, closeBalanceHub);
    // Dados assíncronos depois do primeiro paint (offline-first: o modal
    // abre imediatamente com estado vazio acionável e preenche ao chegar).
    const [snapshot, txs] = await Promise.all([_getSnapshot(), _getTxLines()]);
    if (!document.getElementById(OVERLAY_ID)) return; // fechado no meio
    (overlay as any).__snapshot = snapshot;
    _txLines = txs;
    _nfseByTx = await _getNfseRows(txs.map((l) => l.txId));
    if (!document.getElementById(OVERLAY_ID)) return; // fechado no meio
    _render(overlay);
    // A11y (WCAG 2.4.3): o re-render assíncrono troca o innerHTML do modal e
    // derruba o foco para <body> — sem isto, Escape/Tab param de alcançar o
    // overlay (bug pego no gate visual Playwright 2026-08-05). Se o foco não
    // está mais dentro do modal, devolve para a tab ativa.
    const active = document.activeElement;
    if (!active || active === document.body || !overlay.contains(active)) {
        _focusActiveTab(overlay);
    }
}

export function closeBalanceHub(): void {
    const overlay = document.getElementById(OVERLAY_ID) as HTMLElement | null;
    if (overlay) overlay.style.display = 'none';
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
    if (_abort) {
        _abort.abort();
        _abort = null;
    }
    _persistPrefs();
}

/** Expõe os openers globais (padrão registerBuyerPurchasesHandlers). */
export function registerBalanceHubHandlers(): void {
    (window as any).openBalanceHub = openBalanceHub;
    (window as any).closeBalanceHub = closeBalanceHub;
    // F3.5 — o balanceBadge chama handleOpenBalanceHub no click.
    (window as any).handleOpenBalanceHub = openBalanceHub;
}

// ----------------------------------------------------------------
// DOM
// ----------------------------------------------------------------

function _readPrefsRaw(): string | null {
    try {
        return localStorage.getItem(BALANCE_PREFS_STORAGE_KEY);
    } catch {
        return null;
    }
}

function _getOrCreateOverlay(): HTMLElement {
    const existing = document.getElementById(OVERLAY_ID) as HTMLElement | null;
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9200;';
    const modal = document.createElement('div');
    modal.id = DIALOG_ID;
    modal.className = 'ecbt-dialog ecbt-dialog--xl';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'balance-hub-title');
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) closeBalanceHub();
    });
    document.body.appendChild(overlay);
    return overlay;
}

/** Re-render completo (modal pequeno — sem diff incremental). */
function _render(overlay: HTMLElement): void {
    const modal = overlay.querySelector(`#${DIALOG_ID}`) as HTMLElement | null;
    if (!modal || !_tabs || !_alerts) return;
    if (_abort) _abort.abort();
    _abort = new AbortController();
    const { signal } = _abort;
    const vms = buildTabsVm(_tabs);
    const tabsHtml = vms
        .map(
            (vm) => `
        <button type="button" role="tab" id="bh-tab-${vm.id}" class="balance-hub-tab${vm.selected ? ' active' : ''}"
            aria-selected="${vm.selected}" aria-controls="bh-panel-${vm.id}" tabindex="${vm.tabIndex}" data-tab="${vm.id}">
            ${escapeHtml(t(vm.labelKey) || vm.id)}
        </button>`,
        )
        .join('');
    const panelsHtml = vms
        .map((vm) => {
            if (!vm.mounted) return '';
            const body =
                vm.id === 'saldos'
                    ? _renderSaldos(overlay)
                    : vm.id === 'historico'
                      ? _renderHistorico()
                      : _renderAlertas();
            return `
        <div role="tabpanel" id="bh-panel-${vm.id}" aria-labelledby="bh-tab-${vm.id}" class="balance-hub-panel"
            ${vm.selected ? '' : 'hidden'} tabindex="0">${body}</div>`;
        })
        .join('');
    modal.innerHTML = `
        <div class="ecbt-header">
            <h3 class="ecbt-title" id="balance-hub-title">${escapeHtml(t('balance.hub.title') || 'Central de Saldo')}</h3>
            <button class="ecbt-close balance-hub-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
        </div>
        <div role="tablist" aria-label="${escapeHtml(t('balance.hub.title') || 'Central de Saldo')}" class="balance-hub-tablist">
            ${tabsHtml}
        </div>
        ${panelsHtml}
    `;
    _wire(overlay, modal, signal);
}

function _renderSaldos(overlay: HTMLElement): string {
    const vm = buildSaldosVm((overlay as any).__snapshot, _locale());
    if (vm.offline) {
        return `
        <div class="balance-hub-empty">${escapeHtml(t('balance.hub.saldos.offline') || t('balance.badge.offline') || 'Saldo indisponível no momento.')}</div>
        <button type="button" class="btn btn-primary balance-hub-topup">${escapeHtml(t('balance.hub.saldos.topup') || 'Recarregar agora')}</button>`;
    }
    const rows = vm.rows
        .map(
            (r) => `
            <div class="balance-hub-row">
                <span class="balance-hub-row-label">${escapeHtml(t(r.labelKey) || r.labelKey)}</span>
                <span class="balance-hub-row-value">${escapeHtml(r.value)}</span>
            </div>`,
        )
        .join('');
    const quotaLabel = t('balance.hub.saldos.quotaPct', { pct: String(vm.quotaPct) }) || `${vm.quotaPct}%`;
    const alertHtml =
        vm.alert.tier !== 'ok'
            ? `<div class="balance-hub-alert" data-tier="${vm.alert.tier}">${escapeHtml(t(vm.alert.labelKey) || vm.alert.tier)}</div>`
            : '';
    return `
        ${rows}
        <div class="balance-hub-quota">
            <div role="progressbar" class="balance-hub-progress" aria-valuenow="${vm.quotaPct}" aria-valuemin="0" aria-valuemax="100"
                aria-label="${escapeHtml(quotaLabel)}">
                <div class="balance-hub-progress-fill" data-tier="${vm.alert.tier}" style="width:${vm.quotaPct}%"></div>
            </div>
        </div>
        ${alertHtml}
        <button type="button" class="btn btn-primary balance-hub-topup">${escapeHtml(t('balance.hub.saldos.topup') || 'Recarregar agora')}</button>`;
}

function _renderHistorico(): string {
    const vm = buildHistoryVm(_txLines, _locale(), _period, _granularity);
    const allLabel = t('balance.hub.hist.allPeriods') || 'Todos os períodos';
    const options = [`<option value=""${vm.appliedPeriod === '' ? ' selected' : ''}>${escapeHtml(allLabel)}</option>`]
        .concat(
            vm.periodKeys.map(
                (k) => `<option value="${escapeHtml(k)}"${k === vm.appliedPeriod ? ' selected' : ''}>${escapeHtml(k)}</option>`,
            ),
        )
        .join('');
    const rowsHtml = vm.rows
        .map(
            (r) => `
            <tr>
                <td>${escapeHtml(r.whenIso ? r.whenIso.slice(0, 10) : '—')}</td>
                <td>${escapeHtml(r.actionLabel)}</td>
                <td>${escapeHtml(`${r.units} ${r.unit}`)}</td>
                <td>${escapeHtml(r.balanceAfterFormatted)}</td>
                <td class="balance-hub-nfse-cell">${_renderNfseCell(r.txId)}</td>
            </tr>`,
        )
        .join('');
    const emptyHtml = vm.rows.length
        ? ''
        : `<div class="balance-hub-empty">${escapeHtml(t('balance.hub.hist.empty') || 'Nenhuma transação no período.')}</div>`;
    return `
        <div class="balance-hub-hist-toolbar">
            <label>
                ${escapeHtml(t('balance.hub.hist.period') || 'Período')}
                <select class="balance-hub-period">${options}</select>
            </label>
            <button type="button" class="btn btn-secondary btn-sm balance-hub-export-csv">${escapeHtml(t('balance.hub.hist.exportCsv') || 'Exportar CSV')}</button>
            <button type="button" class="btn btn-secondary btn-sm balance-hub-export-json">${escapeHtml(t('balance.hub.hist.exportJson') || 'Exportar JSON')}</button>
        </div>
        <table class="balance-hub-table">
            <caption>${escapeHtml(t('balance.hub.hist.caption') || 'Histórico de transações do saldo')}</caption>
            <thead>
                <tr>
                    <th scope="col">${escapeHtml(t('balance.hub.hist.colWhen') || 'Data')}</th>
                    <th scope="col">${escapeHtml(t('balance.hub.hist.colAction') || 'Ação')}</th>
                    <th scope="col">${escapeHtml(t('balance.hub.hist.colUnits') || 'Unidades')}</th>
                    <th scope="col">${escapeHtml(t('balance.hub.hist.colBalanceAfter') || 'Saldo após')}</th>
                    <th scope="col">${escapeHtml(t('balance.hub.hist.colNfse') || 'NFSe')}</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
        ${emptyHtml}
        ${_renderNfseCancelModal()}`;
}

/**
 * F12.2-F12.5 — célula NFSe de uma linha do histórico: badge WCAG 1.4.1
 * (cor + ícone + rótulo), link do PDF (só quando invoice_url existir),
 * Reemitir/Cancelar habilitados pelos pure (janela 30d, rejected recoverable).
 * Sem NFSe para a transação → '—' (degradação graciosa).
 */
function _renderNfseCell(txId: string): string {
    const vm = buildNfseCellVm(_nfseByTx.get(txId), Date.now());
    if (!vm.present || !vm.badge || !vm.actions) {
        return `<span class="balance-hub-nfse-none" aria-hidden="true">—</span>`;
    }
    const badge = `<span class="balance-hub-nfse-badge nfse-badge ${vm.badge.cssClass}" data-tier="${vm.badge.tier}">
            <span class="balance-hub-nfse-icon" aria-hidden="true">${vm.badge.icon}</span>${escapeHtml(t(vm.badge.labelKey) || vm.badge.status)}</span>`;
    const pdf = vm.pdfUrl
        ? `<a class="balance-hub-nfse-pdf btn btn-secondary btn-sm" href="${escapeHtml(vm.pdfUrl)}" target="_blank" rel="noopener noreferrer" download>${escapeHtml(t('balance.hub.nfse.downloadPdf') || 'Baixar PDF')}</a>`
        : '';
    const reissue = vm.actions.canReissue
        ? `<button type="button" class="balance-hub-nfse-reissue btn btn-secondary btn-sm" data-tx="${escapeHtml(txId)}">${escapeHtml(t('balance.hub.nfse.reissue') || 'Reemitir')}</button>`
        : '';
    const cancel = vm.actions.canCancel
        ? `<button type="button" class="balance-hub-nfse-cancel btn btn-secondary btn-sm" data-tx="${escapeHtml(txId)}">${escapeHtml(t('balance.hub.nfse.cancel') || 'Cancelar NFSe')}</button>`
        : '';
    return `${badge}<span class="balance-hub-nfse-actions">${pdf}${reissue}${cancel}</span>`;
}

/** F12.6 — mini-modal de cancelamento com motivo obrigatório (≥ 10 chars). */
function _renderNfseCancelModal(): string {
    if (!_cancelTargetTxId) return '';
    const hint =
        t('balance.hub.nfse.cancelReasonHint', { min: String(MIN_CANCEL_REASON_CHARS) }) ||
        `Informe o motivo do cancelamento (mínimo ${MIN_CANCEL_REASON_CHARS} caracteres).`;
    return `
        <div class="balance-hub-nfse-cancel-modal" role="group" aria-label="${escapeHtml(t('balance.hub.nfse.cancelTitle') || 'Cancelar NFSe')}">
            <p class="balance-hub-nfse-cancel-hint">${escapeHtml(hint)}</p>
            <textarea class="balance-hub-nfse-cancel-reason" rows="3" aria-label="${escapeHtml(t('balance.hub.nfse.cancelReasonLabel') || 'Motivo do cancelamento')}"></textarea>
            <p class="balance-hub-nfse-cancel-error" role="alert" hidden></p>
            <div class="balance-hub-nfse-cancel-actions">
                <button type="button" class="btn btn-secondary btn-sm balance-hub-nfse-cancel-abort">${escapeHtml(t('cancel') || 'Voltar')}</button>
                <button type="button" class="btn btn-primary btn-sm balance-hub-nfse-cancel-confirm">${escapeHtml(t('balance.hub.nfse.cancelConfirm') || 'Confirmar cancelamento')}</button>
            </div>
        </div>`;
}

/**
 * F12.4/F12.5 — chama a Edge Function nfse-issue existente. Hoje o backend
 * responde 503 fail-loud (certificado A1 ainda não está no Vault): a UI
 * traduz para erro amigável via mapPaymentError + toast — comportamento
 * correto atual, não bug.
 */
async function _invokeNfseAction(body: Record<string, unknown>): Promise<void> {
    const client = (window as any).__ecbyts_supabase_client;
    if (!client?.functions?.invoke) {
        throw new Error('network');
    }
    const { error } = await client.functions.invoke('nfse-issue', { body });
    if (error) throw error;
}

function _renderAlertas(): string {
    const a = _alerts || normalizeAlertPrefs(null);
    const thresholds = ALERT_THRESHOLD_PCTS.map(
        (pct) => `
        <label class="balance-hub-check">
            <input type="checkbox" class="balance-hub-threshold" data-pct="${pct}"${a.thresholds[pct] ? ' checked' : ''}>
            ${escapeHtml(t('balance.hub.alerts.threshold', { pct: String(pct) }) || `Alertar a ${pct}% da cota`)}
        </label>`,
    ).join('');
    return `
        <p class="balance-hub-alerts-intro">${escapeHtml(t('balance.hub.alerts.intro') || 'Escolha quando e por onde ser avisado sobre o consumo do saldo.')}</p>
        <fieldset class="balance-hub-fieldset">
            <legend>${escapeHtml(t('balance.hub.alerts.thresholds') || 'Limiares de alerta')}</legend>
            ${thresholds}
        </fieldset>
        <fieldset class="balance-hub-fieldset">
            <legend>${escapeHtml(t('balance.hub.alerts.channels') || 'Canais')}</legend>
            <label class="balance-hub-check">
                <input type="checkbox" class="balance-hub-channel-email"${a.channelEmail ? ' checked' : ''}>
                ${escapeHtml(t('balance.hub.alerts.channelEmail') || 'E-mail')}
            </label>
            <label class="balance-hub-check">
                <input type="checkbox" class="balance-hub-channel-push"${a.channelPush ? ' checked' : ''}>
                ${escapeHtml(t('balance.hub.alerts.channelPush') || 'Push')}
            </label>
        </fieldset>
        <fieldset class="balance-hub-fieldset">
            <legend>${escapeHtml(t('balance.hub.alerts.autoTopUp') || 'Recarga automática')}</legend>
            <label class="balance-hub-check">
                <input type="checkbox" class="balance-hub-autotopup"${a.autoTopUp ? ' checked' : ''}>
                ${escapeHtml(t('balance.hub.alerts.autoTopUpLabel') || 'Recarregar automaticamente quando o saldo acabar')}
            </label>
        </fieldset>`;
}

// ----------------------------------------------------------------
// WIRE (delegação por render — AbortController limpa listeners velhos)
// ----------------------------------------------------------------

function _wire(overlay: HTMLElement, modal: HTMLElement, signal: AbortSignal): void {
    modal
        .querySelector('.balance-hub-close')
        ?.addEventListener('click', closeBalanceHub, { signal });

    // Tabs — click + teclado WAI-ARIA via state machine pura.
    const tablist = modal.querySelector('[role="tablist"]') as HTMLElement | null;
    tablist?.addEventListener(
        'click',
        (e: Event) => {
            const btn = (e.target as HTMLElement).closest('[role="tab"]') as HTMLElement | null;
            if (!btn || !_tabs) return;
            _tabs = selectTab(_tabs, btn.dataset.tab);
            _persistPrefs();
            _render(overlay);
            _focusActiveTab(overlay);
        },
        { signal },
    );
    tablist?.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
            if (!_tabs) return;
            const next = handleTabKey(_tabs, e.key);
            if (next === _tabs) return;
            e.preventDefault();
            _tabs = next;
            _persistPrefs();
            _render(overlay);
            _focusActiveTab(overlay);
        },
        { signal },
    );

    // Saldos — Recarregar agora → fluxo de checkout topup existente.
    modal.querySelectorAll('.balance-hub-topup').forEach((btn) => {
        btn.addEventListener(
            'click',
            async () => {
                closeBalanceHub();
                try {
                    const mod = await import('./checkoutModal.js' as string);
                    await mod.openCheckoutModal('topup', null, {});
                } catch (e: any) {
                    console.debug('[balanceHub] checkout open failed:', e?.message || e);
                }
            },
            { signal },
        );
    });

    // Histórico — filtro período + exports LGPD (runtime já auditado).
    modal.querySelector('.balance-hub-period')?.addEventListener(
        'change',
        (e: Event) => {
            _period = (e.target as HTMLSelectElement).value || '';
            _render(overlay);
        },
        { signal },
    );
    modal.querySelector('.balance-hub-export-csv')?.addEventListener(
        'click',
        async () => {
            const mod = await import('./balanceExportRuntime.js' as string);
            void mod.exportMyBalanceDataCsv();
        },
        { signal },
    );
    modal.querySelector('.balance-hub-export-json')?.addEventListener(
        'click',
        async () => {
            const mod = await import('./balanceExportRuntime.js' as string);
            void mod.exportMyBalanceDataJson();
        },
        { signal },
    );

    // F12.5 — Reemitir: edge nfse-issue com chave idempotente derivada.
    modal.querySelectorAll('.balance-hub-nfse-reissue').forEach((btn) => {
        btn.addEventListener(
            'click',
            async (e: Event) => {
                const txId = (e.currentTarget as HTMLElement).dataset.tx || '';
                const vm = buildNfseCellVm(_nfseByTx.get(txId), Date.now());
                if (!vm.present || !vm.actions?.canReissue) return;
                try {
                    await _invokeNfseAction({
                        action: 'reissue',
                        ledger_tx_id: txId,
                        idempotency_key: deriveReissueIdempotencyKey(vm.idempotencyKey, vm.retryCount + 1),
                    });
                    showToast(t('balance.hub.nfse.reissueRequested') || 'Reemissão solicitada.', 'success');
                } catch (err: any) {
                    const friendly = mapPaymentError(err?.message || err);
                    showToast(t(friendly.key) || friendly.fallback, 'error');
                }
            },
            { signal },
        );
    });

    // F12.4/F12.6 — Cancelar: abre o mini-modal de motivo obrigatório.
    modal.querySelectorAll('.balance-hub-nfse-cancel').forEach((btn) => {
        btn.addEventListener(
            'click',
            (e: Event) => {
                _cancelTargetTxId = (e.currentTarget as HTMLElement).dataset.tx || null;
                _render(overlay);
                (modal.querySelector('.balance-hub-nfse-cancel-reason') as HTMLElement | null)?.focus();
            },
            { signal },
        );
    });
    modal.querySelector('.balance-hub-nfse-cancel-abort')?.addEventListener(
        'click',
        () => {
            _cancelTargetTxId = null;
            _render(overlay);
        },
        { signal },
    );
    modal.querySelector('.balance-hub-nfse-cancel-confirm')?.addEventListener(
        'click',
        async () => {
            const txId = _cancelTargetTxId;
            if (!txId) return;
            const reasonEl = modal.querySelector('.balance-hub-nfse-cancel-reason') as HTMLTextAreaElement | null;
            const errorEl = modal.querySelector('.balance-hub-nfse-cancel-error') as HTMLElement | null;
            const verdict = validateCancelReason(reasonEl?.value);
            if (!verdict.valid) {
                if (errorEl) {
                    errorEl.textContent =
                        t('balance.hub.nfse.cancelReasonTooShort', { missing: String(verdict.missingChars) }) ||
                        `Motivo muito curto — faltam ${verdict.missingChars} caracteres.`;
                    errorEl.hidden = false;
                }
                return;
            }
            const vm = buildNfseCellVm(_nfseByTx.get(txId), Date.now());
            if (!vm.present || !vm.actions?.canCancel) return;
            try {
                await _invokeNfseAction({
                    action: 'cancel',
                    ledger_tx_id: txId,
                    reason: String(reasonEl?.value || '').trim(),
                });
                showToast(t('balance.hub.nfse.cancelRequested') || 'Cancelamento solicitado.', 'success');
                _cancelTargetTxId = null;
                _render(overlay);
            } catch (err: any) {
                const friendly = mapPaymentError(err?.message || err);
                showToast(t(friendly.key) || friendly.fallback, 'error');
            }
        },
        { signal },
    );

    // Alertas — persistência imediata a cada mudança.
    modal.querySelectorAll('.balance-hub-threshold').forEach((input) => {
        input.addEventListener(
            'change',
            (e: Event) => {
                const el = e.target as HTMLInputElement;
                const pct = Number(el.dataset.pct);
                if (!_alerts || !ALERT_THRESHOLD_PCTS.includes(pct)) return;
                _alerts = normalizeAlertPrefs({
                    ..._alerts,
                    thresholds: { ..._alerts.thresholds, [pct]: el.checked },
                });
                _persistPrefs();
            },
            { signal },
        );
    });
    modal.querySelector('.balance-hub-channel-email')?.addEventListener(
        'change',
        (e: Event) => {
            if (!_alerts) return;
            _alerts = normalizeAlertPrefs({ ..._alerts, channelEmail: (e.target as HTMLInputElement).checked });
            _persistPrefs();
        },
        { signal },
    );
    modal.querySelector('.balance-hub-channel-push')?.addEventListener(
        'change',
        (e: Event) => {
            if (!_alerts) return;
            _alerts = normalizeAlertPrefs({ ..._alerts, channelPush: (e.target as HTMLInputElement).checked });
            _persistPrefs();
        },
        { signal },
    );
    // F4.6 — auto-top-up: NUNCA pré-marcado + warning explícito ao ativar
    // (proteção anti dark-pattern, CDC).
    modal.querySelector('.balance-hub-autotopup')?.addEventListener(
        'change',
        async (e: Event) => {
            const el = e.target as HTMLInputElement;
            if (!_alerts) return;
            if (el.checked) {
                const warning =
                    t('balance.hub.alerts.autoTopUpWarning') ||
                    'A recarga automática irá cobrar seu método de pagamento sem confirmação a cada recarga. Confirma?';
                const ok = await asyncConfirm(warning, { danger: true });
                if (!ok) {
                    el.checked = false;
                    return;
                }
            }
            _alerts = normalizeAlertPrefs({ ..._alerts, autoTopUp: el.checked });
            _persistPrefs();
        },
        { signal },
    );
}

function _focusActiveTab(overlay: HTMLElement): void {
    (overlay.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement | null)?.focus();
}
