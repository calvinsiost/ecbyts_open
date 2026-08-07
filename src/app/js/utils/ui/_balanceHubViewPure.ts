// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * CBMD-001 F4 / T1.3 — view-model PURO do modal BalanceHub (sem DOM).
 *
 * Companheiro de `_balanceHubTabsPure.ts` (state machine das tabs): aqui
 * vivem as derivações testáveis do conteúdo das 3 abas — Saldos (linhas +
 * progressbar + tier), Histórico (linhas formatadas + filtro por período)
 * e Alertas (prefs 50/80/95/100 + canais + auto-top-up NUNCA default-on),
 * mais a (de)serialização defensiva de `ecbyts-balance-prefs` v1 (F4.8).
 *
 * Consumido pelo wire DOM em `balanceHub.ts`; cheap tests em
 * `tests/balance-hub-view-pure.test.mjs`.
 */
import {
    classifyAlertTier,
    formatBalance,
    summarizeTransactionLine,
    type AlertVerdict,
    type BalanceSnapshot,
    type SupportedLocale,
    type TransactionDisplay,
    type TransactionLine,
} from '../../core/billing/balanceLedger.js';
import {
    aggregateMeteringByPeriod,
    periodKeyOf,
    type MeteringPeriodGranularity,
    type MeteringPeriodSummary,
} from '../../core/billing/_balanceMeteringPeriodPure.js';
import {
    createTabsState,
    isBalanceHubTabId,
    type BalanceHubTabId,
    type BalanceHubTabsState,
} from './_balanceHubTabsPure.js';
import {
    resolveNfseStatusBadge,
    type NFSeStatusBadgeVm,
} from '../../core/billing/_nfseStatusBadgePure.js';
import {
    resolveNfseActionButtons,
    type NFSeActionButtonsVm,
} from '../../core/billing/_nfseActionButtonsPure.js';
import { classifyNFSeError } from '../../core/billing/nfseGateway.js';

// ----------------------------------------------------------------
// Aba "Saldos" — F4.2
// ----------------------------------------------------------------

export interface SaldosRowVm {
    /** i18n key do label da linha (balance.hub.saldos.*). */
    readonly labelKey: string;
    /** Valor já formatado no locale. */
    readonly value: string;
}

export interface SaldosVm {
    /** Snapshot ausente/inválido → degradação graciosa (offline-first). */
    readonly offline: boolean;
    readonly rows: ReadonlyArray<SaldosRowVm>;
    /** Progressbar da cota (aria-valuenow/min/max) — 0..100 inteiro. */
    readonly quotaPct: number;
    readonly alert: AlertVerdict;
}

function _isSnapshot(snap: unknown): snap is BalanceSnapshot {
    return (
        !!snap &&
        typeof snap === 'object' &&
        Number.isFinite(Number((snap as BalanceSnapshot).netEcbt))
    );
}

/** Deriva as 4 linhas (gross/líquido/EIC/quota) + progressbar + tier. */
export function buildSaldosVm(snapshot: unknown, locale: SupportedLocale = 'pt-BR'): SaldosVm {
    if (!_isSnapshot(snapshot)) {
        return Object.freeze({
            offline: true,
            rows: Object.freeze([]),
            quotaPct: 0,
            alert: classifyAlertTier(0, 0),
        });
    }
    const s = snapshot;
    const quotaUsed = Number.isFinite(s.quotaUsed) ? s.quotaUsed : 0;
    const quotaTotal = Number.isFinite(s.quotaTotal) ? s.quotaTotal : 0;
    const alert = classifyAlertTier(quotaUsed, quotaTotal);
    const quotaPct = Math.max(0, Math.min(100, Math.round(alert.pctUsed * 100)));
    const rows: SaldosRowVm[] = [
        { labelKey: 'balance.hub.saldos.gross', value: formatBalance(s.grossEcbt || 0, 'ECBT', locale) },
        { labelKey: 'balance.hub.saldos.net', value: formatBalance(s.netEcbt || 0, 'ECBT', locale) },
        { labelKey: 'balance.hub.saldos.eic', value: formatBalance(s.eicCredits || 0, 'EIC', locale) },
        { labelKey: 'balance.hub.saldos.quota', value: `${quotaUsed} / ${quotaTotal}` },
    ];
    return Object.freeze({ offline: false, rows: Object.freeze(rows), quotaPct, alert });
}

// ----------------------------------------------------------------
// Aba "Histórico" — F4.3 (filtro por período via metering pure)
// ----------------------------------------------------------------

export interface HistoryVm {
    /** Linhas formatadas (summarizeTransactionLine), já filtradas. */
    readonly rows: ReadonlyArray<TransactionDisplay>;
    /** Chaves de período disponíveis (mais recente primeiro) p/ o <select>. */
    readonly periodKeys: ReadonlyArray<string>;
    /** Período efetivamente aplicado ('' = todos). */
    readonly appliedPeriod: string;
    /** Agregação por período (totais p/ rodapé). */
    readonly summary: MeteringPeriodSummary;
}

/**
 * Deriva a view do Histórico: filtra por `periodKey` ('' = todos), formata
 * cada linha no locale e agrega os totais por período. Lista defensiva —
 * entrada não-array vira vazia, período inexistente cai para 'todos'.
 */
export function buildHistoryVm(
    lines: readonly TransactionLine[] | null | undefined,
    locale: SupportedLocale = 'pt-BR',
    periodKey: string = '',
    granularity: MeteringPeriodGranularity = 'month',
): HistoryVm {
    const list = Array.isArray(lines) ? lines : [];
    const summary = aggregateMeteringByPeriod(
        list.map((l) => ({ timestampMs: l?.timestampMs, costBrl: l?.costBrl, units: l?.units })),
        granularity,
    );
    const periodKeys = summary.buckets.map((b) => b.periodKey);
    const applied = periodKey && periodKeys.includes(periodKey) ? periodKey : '';
    const filtered = applied
        ? list.filter((l) => periodKeyOf(l?.timestampMs, summary.granularity) === applied)
        : list;
    const rows = filtered
        .slice()
        .sort((a, b) => (b?.timestampMs || 0) - (a?.timestampMs || 0))
        .map((l) => summarizeTransactionLine(l, locale));
    return Object.freeze({
        rows: Object.freeze(rows),
        periodKeys: Object.freeze(periodKeys),
        appliedPeriod: applied,
        summary,
    });
}

// ----------------------------------------------------------------
// Aba "Alertas" — F4.5/F4.6 prefs + persistência F4.8
// ----------------------------------------------------------------

/** Thresholds canônicos (%) — espelham DEFAULT_ALERT_THRESHOLDS ×100. */
export const ALERT_THRESHOLD_PCTS: ReadonlyArray<number> = Object.freeze([50, 80, 95, 100]);

export interface BalanceAlertPrefs {
    /** Threshold (%) → alerta habilitado. Default: todos ON (protetivo). */
    readonly thresholds: Readonly<Record<number, boolean>>;
    readonly channelEmail: boolean;
    readonly channelPush: boolean;
    /** CDC dark-pattern protection: NUNCA true por default (F4.6). */
    readonly autoTopUp: boolean;
    /** Valor da recarga automática em BRL (só relevante se autoTopUp). */
    readonly autoTopUpAmountBrl: number;
}

export const DEFAULT_ALERT_PREFS: BalanceAlertPrefs = Object.freeze({
    thresholds: Object.freeze({ 50: true, 80: true, 95: true, 100: true }),
    channelEmail: true,
    channelPush: false,
    autoTopUp: false,
    autoTopUpAmountBrl: 50,
});

function _bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

/** Normaliza prefs cruas (localStorage/legacy) — nunca lança. */
export function normalizeAlertPrefs(raw: unknown): BalanceAlertPrefs {
    const d = DEFAULT_ALERT_PREFS;
    if (!raw || typeof raw !== 'object') return d;
    const r = raw as Record<string, unknown>;
    const rawTh = (r.thresholds && typeof r.thresholds === 'object' ? r.thresholds : {}) as Record<
        string,
        unknown
    >;
    const thresholds: Record<number, boolean> = {};
    for (const pct of ALERT_THRESHOLD_PCTS) {
        // d.thresholds[pct] sempre existe (ALERT_THRESHOLD_PCTS espelha as
        // chaves de DEFAULT_ALERT_PREFS.thresholds); `?? false` é só o guard
        // exigido por noUncheckedIndexedAccess.
        thresholds[pct] = _bool(rawTh[String(pct)], d.thresholds[pct] ?? false);
    }
    const amount = Number(r.autoTopUpAmountBrl);
    return Object.freeze({
        thresholds: Object.freeze(thresholds),
        channelEmail: _bool(r.channelEmail, d.channelEmail),
        channelPush: _bool(r.channelPush, d.channelPush),
        // Corrupção/ausência NUNCA liga auto-top-up sozinha (CDC).
        autoTopUp: r.autoTopUp === true,
        autoTopUpAmountBrl: Number.isFinite(amount) && amount > 0 ? amount : d.autoTopUpAmountBrl,
    });
}

// ----------------------------------------------------------------
// Persistência unificada `ecbyts-balance-prefs` v1 (F4.8)
// ----------------------------------------------------------------

export const BALANCE_PREFS_STORAGE_KEY = 'ecbyts-balance-prefs';

export interface BalanceHubPrefs {
    readonly activeTab: BalanceHubTabId;
    readonly alerts: BalanceAlertPrefs;
}

/** Serializa prefs completas (tab ativa + alertas) com versão de schema. */
export function serializeBalancePrefs(tabs: BalanceHubTabsState, alerts: BalanceAlertPrefs): string {
    return JSON.stringify({
        v: 1,
        active: tabs?.active ?? 'saldos',
        alerts: normalizeAlertPrefs(alerts),
    });
}

/**
 * Restaura prefs persistidas. Qualquer corrupção → defaults (tab 'saldos',
 * alertas protetivos, auto-top-up OFF). Compatível com o payload legado
 * `{active}` de serializeTabsState (forward-compat F4.8 P2).
 */
export function restoreBalancePrefs(raw: string | null | undefined): BalanceHubPrefs {
    let active: BalanceHubTabId = 'saldos';
    let alerts = DEFAULT_ALERT_PREFS;
    if (typeof raw === 'string' && raw) {
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (isBalanceHubTabId(parsed?.active)) active = parsed.active;
            alerts = normalizeAlertPrefs(parsed?.alerts);
        } catch (e: any) {
            console.debug('[balanceHubViewPure] prefs corrompidas → defaults:', e?.message || e);
        }
    }
    return Object.freeze({ activeTab: active, alerts });
}

/** Estado inicial das tabs a partir das prefs restauradas. */
export function tabsStateFromPrefs(prefs: BalanceHubPrefs): BalanceHubTabsState {
    return createTabsState(prefs?.activeTab);
}

// ----------------------------------------------------------------
// Coluna "NFSe" do Histórico — F12 (badge + PDF + reemitir/cancelar)
// ----------------------------------------------------------------

/** Linha crua de public.nfse_invoices como chega do seam de dados. */
export interface NfseInvoiceRawRow {
    readonly ledger_tx_id?: unknown;
    readonly status?: unknown;
    readonly invoice_url?: unknown;
    readonly nfse_idempotency_key?: unknown;
    readonly retry_count?: unknown;
    readonly last_error_code?: unknown;
    readonly nfse_events?: unknown;
    readonly created_at?: unknown;
    readonly updated_at?: unknown;
}

export interface NfseCellVm {
    /** false = transação sem NFSe → célula '—' (degradação graciosa F12). */
    readonly present: boolean;
    readonly badge: NFSeStatusBadgeVm | null;
    readonly actions: NFSeActionButtonsVm | null;
    /** URL do PDF quando existir E o pure autorizar download (F12.3). */
    readonly pdfUrl: string;
    /** Chave base p/ deriveReissueIdempotencyKey no wire (F12.5). */
    readonly idempotencyKey: string;
    readonly retryCount: number;
}

const EMPTY_NFSE_CELL: NfseCellVm = Object.freeze({
    present: false,
    badge: null,
    actions: null,
    pdfUrl: '',
    idempotencyKey: '',
    retryCount: 0,
});

/** Epoch ms da autorização: evento 'authorized' do audit trail, senão updated_at. */
function _authorizedAtMs(row: NfseInvoiceRawRow): number | null {
    const events = Array.isArray(row.nfse_events) ? row.nfse_events : [];
    for (const ev of events) {
        const e = ev as Record<string, unknown>;
        if (e && (e.to === 'authorized' || e.status === 'authorized')) {
            const at = Date.parse(String(e.at ?? e.timestamp ?? ''));
            if (Number.isFinite(at)) return at;
        }
    }
    const upd = Date.parse(String(row.updated_at ?? ''));
    return Number.isFinite(upd) ? upd : null;
}

/**
 * Deriva o view-model da célula NFSe de UMA linha do histórico (F12.2-F12.5).
 * Fail-safe: linha ausente/suja → célula vazia ('—'), nunca lança.
 */
export function buildNfseCellVm(row: NfseInvoiceRawRow | null | undefined, nowMs: number): NfseCellVm {
    if (!row || typeof row !== 'object') return EMPTY_NFSE_CELL;
    const status = String(row.status ?? '').trim().toLowerCase();
    if (!status) return EMPTY_NFSE_CELL;
    const badge = resolveNfseStatusBadge(status);
    const errorTier =
        status === 'rejected' ? classifyNFSeError(String(row.last_error_code ?? '') || null).tier : null;
    const actions = resolveNfseActionButtons(
        { status, authorizedAtMs: _authorizedAtMs(row), errorTier },
        nowMs,
    );
    const rawUrl = typeof row.invoice_url === 'string' ? row.invoice_url.trim() : '';
    // F12.3 — só http(s) (nunca javascript: etc) e só quando o pure permitir.
    const pdfUrl = actions.canDownloadPdf && /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
    const retry = Number(row.retry_count);
    return Object.freeze({
        present: true,
        badge,
        actions,
        pdfUrl,
        idempotencyKey: String(row.nfse_idempotency_key ?? ''),
        retryCount: Number.isFinite(retry) && retry >= 0 ? Math.floor(retry) : 0,
    });
}

/**
 * Indexa linhas cruas de nfse_invoices por ledger_tx_id (a mais recente
 * por created_at vence quando houver reemissões). Entrada não-array → Map vazio.
 */
export function indexNfseRowsByTx(rows: unknown): Map<string, NfseInvoiceRawRow> {
    const map = new Map<string, NfseInvoiceRawRow>();
    if (!Array.isArray(rows)) return map;
    for (const raw of rows) {
        const row = raw as NfseInvoiceRawRow;
        const txId = String(row?.ledger_tx_id ?? '');
        if (!txId) continue;
        const prev = map.get(txId);
        if (!prev) {
            map.set(txId, row);
            continue;
        }
        const prevAt = Date.parse(String(prev.created_at ?? '')) || 0;
        const curAt = Date.parse(String(row.created_at ?? '')) || 0;
        if (curAt >= prevAt) map.set(txId, row);
    }
    return map;
}
