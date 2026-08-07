// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * CBMD-001 — runtime de export do saldo do cliente (LGPD Art. 18 II).
 * claude - ui 2026-06-15.
 *
 * EN: Wire layer that connects the pure-logic `_balanceExportPure` to the UI.
 *     Gathers the customer's balance + transaction history (ecbtLedger), adapts
 *     them to the neutral export shape and triggers the browser download (CSV
 *     RFC 4180 or portable JSON). Only the data subject's own billing data is
 *     exported — no internal bookkeeping fields leak (the pure module enforces
 *     the column whitelist).
 *
 * PT (leigo): esta é a "ponte" entre a regra pronta (que monta a planilha sem
 *     tela nem rede) e o botão da carteira. Junta o saldo e as transações DAQUELE
 *     cliente, monta o arquivo e dispara o download. É o direito da LGPD de o
 *     cliente LEVAR os próprios dados embora num formato que outra empresa leia.
 */
import { t } from '../i18n/translations.js';
import { toCsv, downloadCsv } from '../helpers/csvExport.js';
import { showToast } from './toast.js';
import { getBalance, getTransactions } from '../../core/currency/ecbtLedger.js';
import {
    buildBalanceExportRows,
    buildBalanceExportJson,
    buildExportFilename,
    type ExportTransaction,
    type ExportBalanceSnapshot,
} from '../../core/billing/_balanceExportPure.js';

const MICRO = 1_000_000;
/** Ref pseudonimizada por padrão (LGPD) — nunca embute id bruto no arquivo. */
const SUBJECT_REF = 'cliente';

/** Adapta uma transação do ecbtLedger para o formato neutro de export. */
function _toExportTx(tx: any): ExportTransaction {
    // exactOptionalPropertyTypes: omitir campos ausentes em vez de setar undefined.
    const out: Record<string, unknown> = {
        txId: String(tx?.id ?? ''),
        actionLabel: String(tx?.description ?? tx?.type ?? ''),
        units: Number(tx?.amount ?? 0) / MICRO,
        unit: 'ECBT',
    };
    if (tx?.created_at) out.timestampMs = Date.parse(tx.created_at);
    const after = Number(tx?.balance_after);
    if (Number.isFinite(after)) out.balanceAfterEcbt = after / MICRO;
    return out as ExportTransaction;
}

/** Junta saldo + histórico do cliente no formato neutro de export. */
async function _gather(): Promise<{ snapshot: ExportBalanceSnapshot; txs: ExportTransaction[] }> {
    const [balanceMicro, rawTxs] = await Promise.all([getBalance(), getTransactions({ limit: 500 })]);
    const netEcbt = Number(balanceMicro ?? 0) / MICRO;
    const snapshot: ExportBalanceSnapshot = {
        grossEcbt: netEcbt,
        netEcbt,
        eicCredits: 0,
        quotaUsed: 0,
        quotaTotal: 0,
        fetchedAtMs: Date.now(),
    };
    const txs = (Array.isArray(rawTxs) ? rawTxs : []).map(_toExportTx);
    return { snapshot, txs };
}

/** Dispara o download de um Blob (helper local, espelha downloadCsv). */
function _downloadBlob(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Exporta saldo + histórico do cliente em CSV (LGPD Art. 18 II — portabilidade). */
export async function exportMyBalanceDataCsv(nowMs: number = Date.now()): Promise<void> {
    try {
        const { txs } = await _gather();
        const { headers, rows } = buildBalanceExportRows(txs);
        const csv = toCsv(headers as string[], rows);
        downloadCsv(csv, buildExportFilename(SUBJECT_REF, 'csv', nowMs));
        showToast(t('wallet.exportDone') || 'Dados exportados com sucesso', 'success');
    } catch {
        showToast(t('wallet.exportError') || 'Falha ao exportar os dados', 'error');
    }
}

/** Exporta saldo + histórico do cliente em JSON portável (LGPD Art. 18 II). */
export async function exportMyBalanceDataJson(nowMs: number = Date.now()): Promise<void> {
    try {
        const { snapshot, txs } = await _gather();
        const obj = buildBalanceExportJson(snapshot, txs, SUBJECT_REF, nowMs);
        _downloadBlob(
            JSON.stringify(obj, null, 2),
            buildExportFilename(SUBJECT_REF, 'json', nowMs),
            'application/json;charset=utf-8',
        );
        showToast(t('wallet.exportDone') || 'Dados exportados com sucesso', 'success');
    } catch {
        showToast(t('wallet.exportError') || 'Falha ao exportar os dados', 'error');
    }
}
