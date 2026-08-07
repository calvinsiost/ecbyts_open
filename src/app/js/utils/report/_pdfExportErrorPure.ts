// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PDF EXPORT ERROR — classificador de falha de export PDF (P9-9)
   FRIEND-SCORE-001 (Calvin loop 2026-06-14). O export PDF grande
   "falhava silencioso, sem retry": erro técnico cru ou nada. Este
   pure classifica o erro → mensagem ACIONÁVEL + se deve re-tentar.
   Sem DOM, sem rede. Determinístico.
   ================================================================ */

export type PdfErrorKind = 'cdn_load' | 'empty' | 'oversize' | 'unknown';

export interface PdfErrorVM {
    readonly kind: PdfErrorKind;
    /** CDN falhou → vale 1 retry automático (carga transitória). */
    readonly canRetry: boolean;
    readonly i18nKey: string;
    readonly severity: 'warning' | 'error';
}

/**
 * Classifica o erro de export PDF a partir da mensagem/nome. Heurística
 * conservadora: só marca canRetry para falhas de carga (CDN/rede), que são
 * transitórias; relatório vazio/oversize NÃO re-tenta (não muda no retry).
 */
export function classifyPdfError(err: unknown): PdfErrorVM {
    const msg = (err && typeof err === 'object' && 'message' in err ? String((err as any).message) : String(err || ''))
        .toLowerCase();

    // jsPDF não carregou (CDN/rede) — transitório, vale retry.
    if (
        msg.includes('jspdf') ||
        msg.includes('load') ||
        msg.includes('script') ||
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('failed to fetch')
    ) {
        return Object.freeze({ kind: 'cdn_load', canRetry: true, i18nKey: 'pdf.error.cdn', severity: 'error' });
    }
    // Relatório vazio — não re-tenta.
    if (msg.includes('empty') || msg.includes('vazio')) {
        return Object.freeze({ kind: 'empty', canRetry: false, i18nKey: 'pdf.error.empty', severity: 'warning' });
    }
    // Memória/tamanho — não re-tenta automaticamente.
    if (msg.includes('memory') || msg.includes('quota') || msg.includes('maximum') || msg.includes('too large')) {
        return Object.freeze({ kind: 'oversize', canRetry: false, i18nKey: 'pdf.error.oversize', severity: 'error' });
    }
    return Object.freeze({ kind: 'unknown', canRetry: false, i18nKey: 'pdf.error.unknown', severity: 'error' });
}
