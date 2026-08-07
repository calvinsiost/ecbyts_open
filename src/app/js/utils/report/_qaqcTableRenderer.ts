// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) de TABELA RESUMO QA/QC laboratorial — gap analysis CETESB
// DD 038/2017 IC §2.1.j (resultados analíticos) + §2.4 (cadeia de custódia +
// rastreabilidade analítica). Resume por parâmetro: laboratório, método, LOQ/LOD,
// recovery em duplicatas, classe de incerteza, cadeia de custódia. Sem DOM/canvas.
// Reusa svgToDataUrl do radius plan p/ encoding base64 UTF-8 safe cross-env.
import { svgToDataUrl } from './_radiusPlanRenderer.js';

export interface QaQcRow {
    /** Identificador do parâmetro (CAS ou sigla, ex: "71-43-2", "PCE"). */
    parameterId: string;
    /** Nome legível opcional (ex: "Benzeno"). */
    parameterName?: string;
    /** Unidade (ex: "µg/L"). */
    unit: string;
    /** Método analítico (ex: "EPA 8260D", "ABNT NBR 15847"). */
    method?: string;
    /** Laboratório executor. */
    laboratory?: string;
    /** Acreditação ISO/IEC 17025 (ex: "INMETRO CRL 0123"). */
    accreditation?: string;
    /** Limit of quantification. */
    loq?: number;
    /** Limit of detection. */
    lod?: number;
    /** Número total de amostras analisadas. */
    nSamples: number;
    /** Quantas amostras ficaram < LOQ (não-detectáveis). */
    nBelowLoq?: number;
    /** Quantas amostras excederam o threshold VI. */
    nExceedance?: number;
    /** % recovery em duplicatas (75-125% é aceitável). */
    duplicateRecoveryPct?: number;
    /** Classe de incerteza agregada (pior caso entre as observações). */
    uncertaintyClass?: 'low' | 'medium' | 'high';
    /** Estado da cadeia de custódia (pior caso entre as observações). */
    chainOfCustody?: 'complete' | 'partial' | 'missing';
}

export interface QaQcTableOpts {
    title?: string;
    width?: number;
    /** Nome do laboratório principal exibido no cabeçalho. */
    headerLab?: string;
    /** Janela da campanha de monitoramento (data início → data fim). */
    campaignWindow?: { startDate?: string; endDate?: string };
    /** Metadados de rodapé (datum/fonte). */
    centerLabel?: { source?: string; datum?: string };
}

const COLOR = {
    headerBg: '#e5e7eb',
    rowAlt: '#f8fafc',
    rowBg: '#ffffff',
    border: '#cccccc',
    text: '#222222',
    textMuted: '#666666',
    em: '#888888',
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    neutral: '#9ca3af',
};

const UNCERTAINTY_LABEL: Record<string, string> = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
};
const COC_LABEL: Record<string, string> = {
    complete: 'Completa',
    partial: 'Parcial',
    missing: 'Ausente',
};

function _esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Formata número: notação científica quando |v|<0.01 ou ≥10000; caso contrário 2 casas decimais. */
function _fmtNum(v: number | undefined | null): string {
    if (v == null || !Number.isFinite(v as number)) return '—';
    const n = Number(v);
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs < 0.01 || abs >= 10000) return n.toExponential(2);
    return n.toFixed(2);
}

/** Cor para a célula de recovery%: verde 75-125, amarelo 70-75 ou 125-130, vermelho fora. */
function _recoveryColor(pct: number | undefined): string {
    if (pct == null || !Number.isFinite(pct)) return COLOR.neutral;
    if (pct >= 75 && pct <= 125) return COLOR.green;
    if ((pct >= 70 && pct < 75) || (pct > 125 && pct <= 130)) return COLOR.amber;
    return COLOR.red;
}

function _uncertaintyColor(cls: string | undefined): string {
    if (cls === 'low') return COLOR.green;
    if (cls === 'medium') return COLOR.amber;
    if (cls === 'high') return COLOR.red;
    return COLOR.neutral;
}
function _cocColor(coc: string | undefined): string {
    if (coc === 'complete') return COLOR.green;
    if (coc === 'partial') return COLOR.amber;
    if (coc === 'missing') return COLOR.red;
    return COLOR.neutral;
}

/** Helper p/ desenhar chip = bolinha colorida + texto curto. */
function _chip(text: string, color: string, x: number, y: number): string {
    return (
        `<g><circle cx="${x + 5}" cy="${y - 3}" r="4" fill="${color}"/>` +
        `<text x="${x + 13}" y="${y}" font-size="9" fill="${COLOR.text}">${_esc(text)}</text></g>`
    );
}

/** Veredito agregado do dataset com base nas rows (majority chainOfCustody). */
function _aggregateVerdict(rows: QaQcRow[]): { label: string; color: string } {
    let complete = 0;
    let partial = 0;
    let missing = 0;
    for (const r of rows) {
        if (r.chainOfCustody === 'complete') complete++;
        else if (r.chainOfCustody === 'partial') partial++;
        else if (r.chainOfCustody === 'missing') missing++;
    }
    const total = complete + partial + missing;
    if (total === 0) return { label: 'QA/QC: PENDENTE', color: COLOR.neutral };
    if (missing >= complete && missing >= partial) return { label: 'QA/QC: AUSENTE', color: COLOR.red };
    if (partial >= complete) return { label: 'QA/QC: PARCIAL', color: COLOR.amber };
    return { label: 'QA/QC: COMPLETO', color: COLOR.green };
}

/**
 * Constrói o SVG (string) da tabela QA/QC. Pure — sem efeitos colaterais.
 * Layout: cabeçalho (60px) com título + lab + janela campanha + badge veredito,
 * tabela com 10 colunas, rodapé (40px) com datum + fonte.
 */
export function buildQaQcTableSvg(rows: QaQcRow[], opts: QaQcTableOpts = {}): string {
    const W = Math.max(560, Math.floor(opts.width || 720));
    const HEADER_H = 60;
    const FOOTER_H = 40;
    const ROW_H = 22;
    const HEADER_ROW_H = 22;

    const safeRows = Array.isArray(rows) ? rows.filter((r) => r && typeof r.parameterId === 'string') : [];

    // Placeholder quando sem dados.
    if (safeRows.length === 0) {
        const H = 110;
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">` +
            `<rect width="${W}" height="${H}" fill="#f8fafc"/>` +
            `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="#555">Sem dados QA/QC disponíveis para o relatório</text></svg>`
        );
    }

    // Truncate >30 rows com placeholder de cauda.
    const MAX_ROWS = 30;
    const truncated = safeRows.length > MAX_ROWS;
    const displayRows = truncated ? safeRows.slice(0, MAX_ROWS) : safeRows;
    const overflow = truncated ? safeRows.length - MAX_ROWS : 0;

    const tableH = HEADER_ROW_H + displayRows.length * ROW_H + (truncated ? ROW_H : 0);
    const totalH = HEADER_H + tableH + FOOTER_H;

    // ── Colunas (10): Parâmetro / Método / LOQ / LOD / N / <LOQ / >VI / Recovery% / Inc. / Cad.Cust.
    // Distribuição: param=90, demais ~ (W - 90) / 9 ≈ 70 px (com width=720 → 70 cada).
    const padX = 8;
    const innerW = W - padX * 2;
    const paramW = 110;
    const restW = innerW - paramW;
    const colW = restW / 9;
    const cols: Array<{ label: string; key: string; w: number; align?: 'start' | 'middle' | 'end' }> = [
        { label: 'Parâmetro', key: 'param', w: paramW, align: 'start' },
        { label: 'Método', key: 'method', w: colW, align: 'start' },
        { label: 'LOQ', key: 'loq', w: colW, align: 'end' },
        { label: 'LOD', key: 'lod', w: colW, align: 'end' },
        { label: 'N', key: 'n', w: colW, align: 'end' },
        { label: '<LOQ', key: 'belowLoq', w: colW, align: 'end' },
        { label: '>VI', key: 'exceed', w: colW, align: 'end' },
        { label: 'Recovery%', key: 'rec', w: colW, align: 'middle' },
        { label: 'Inc.', key: 'unc', w: colW, align: 'start' },
        { label: 'Cad.Cust.', key: 'coc', w: colW, align: 'start' },
    ];

    // x acumulado por coluna (para posicionamento).
    const colX: number[] = [];
    {
        let cur = padX;
        for (const c of cols) {
            colX.push(cur);
            cur += c.w;
        }
    }

    // ── Cabeçalho ─────────────────────────────────────────────────────────
    const title = _esc(opts.title || 'Resumo QA/QC laboratorial');
    const headerLab = _esc(opts.headerLab || '');
    const cw = opts.campaignWindow;
    let windowLine = '';
    if (cw && (cw.startDate || cw.endDate)) {
        if (cw.startDate && cw.endDate) windowLine = `Campanha: ${_esc(cw.startDate)} — ${_esc(cw.endDate)}`;
        else if (cw.startDate) windowLine = `Campanha desde ${_esc(cw.startDate)}`;
        else windowLine = `Campanha até ${_esc(cw.endDate)}`;
    }
    const verdict = _aggregateVerdict(displayRows);
    // Badge global no canto superior direito do cabeçalho.
    const badgeW = 130;
    const badgeX = W - badgeW - 10;
    const badgeY = 14;
    const headerSvg =
        `<rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="#f8fafc" stroke="#e5e7eb"/>` +
        `<text x="${W / 2}" y="22" text-anchor="middle" font-size="13" fill="${COLOR.text}" font-weight="bold">${title}</text>` +
        (headerLab
            ? `<text x="${padX}" y="40" font-size="10" fill="${COLOR.textMuted}">Lab: ${headerLab}</text>`
            : '') +
        (windowLine
            ? `<text x="${padX}" y="54" font-size="9" fill="${COLOR.textMuted}">${windowLine}</text>`
            : '') +
        `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="22" rx="11" ry="11" fill="${verdict.color}" opacity="0.85"/>` +
        `<text x="${badgeX + badgeW / 2}" y="${badgeY + 15}" text-anchor="middle" font-size="10" fill="#ffffff" font-weight="bold">${_esc(verdict.label)}</text>`;

    // ── Header row da tabela ──────────────────────────────────────────────
    const tableY0 = HEADER_H;
    const headerRowY = tableY0;
    let tableSvg =
        `<rect x="0" y="${headerRowY}" width="${W}" height="${HEADER_ROW_H}" fill="${COLOR.headerBg}" stroke="${COLOR.border}"/>`;
    for (let i = 0; i < cols.length; i++) {
        const c = cols[i]!;
        const x = colX[i]!;
        const align = c.align || 'start';
        const tx = align === 'middle' ? x + c.w / 2 : align === 'end' ? x + c.w - 6 : x + 4;
        const anchor = align === 'middle' ? 'middle' : align === 'end' ? 'end' : 'start';
        tableSvg +=
            `<text x="${tx}" y="${headerRowY + 14}" font-size="9" font-weight="bold" fill="${COLOR.text}" text-anchor="${anchor}">${_esc(c.label)}</text>`;
    }

    // ── Data rows ────────────────────────────────────────────────────────
    for (let i = 0; i < displayRows.length; i++) {
        const r = displayRows[i]!;
        const y = tableY0 + HEADER_ROW_H + i * ROW_H;
        const bg = i % 2 === 0 ? COLOR.rowBg : COLOR.rowAlt;
        tableSvg += `<rect x="0" y="${y}" width="${W}" height="${ROW_H}" fill="${bg}"/>`;

        // Helper local p/ texto numérico/string em coluna.
        const _cell = (colIdx: number, text: string, color: string = COLOR.text, bold = false) => {
            const c = cols[colIdx]!;
            const x = colX[colIdx]!;
            const align = c.align || 'start';
            const tx = align === 'middle' ? x + c.w / 2 : align === 'end' ? x + c.w - 6 : x + 4;
            const anchor = align === 'middle' ? 'middle' : align === 'end' ? 'end' : 'start';
            return `<text x="${tx}" y="${y + 15}" font-size="9" fill="${color}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ''}>${_esc(text)}</text>`;
        };

        // (0) Parâmetro — usa parameterName se disponível, senão parameterId.
        const paramLabel = r.parameterName
            ? `${r.parameterName} (${r.parameterId})`
            : r.parameterId;
        // Truncate visual se >18 chars (sem alterar string lógica) p/ caber.
        const paramTrim = paramLabel.length > 22 ? paramLabel.slice(0, 21) + '…' : paramLabel;
        tableSvg += _cell(0, paramTrim);

        // (1) Método (truncate >10 chars).
        const m = r.method == null ? '—' : r.method;
        const mTrim = m.length > 11 ? m.slice(0, 10) + '…' : m;
        tableSvg += _cell(1, mTrim);

        // (2) LOQ
        tableSvg += _cell(2, _fmtNum(r.loq));
        // (3) LOD
        tableSvg += _cell(3, _fmtNum(r.lod));
        // (4) N
        tableSvg += _cell(4, String(r.nSamples != null ? r.nSamples : 0), COLOR.text, true);
        // (5) <LOQ (cinza neutro)
        tableSvg += _cell(5, r.nBelowLoq == null ? '—' : String(r.nBelowLoq), COLOR.textMuted);
        // (6) >VI (vermelho se >0)
        const ex = r.nExceedance;
        const exColor = ex != null && ex > 0 ? COLOR.red : COLOR.textMuted;
        tableSvg += _cell(6, ex == null ? '—' : String(ex), exColor, ex != null && ex > 0);

        // (7) Recovery% — texto colorido (não chip), centralizado.
        if (r.duplicateRecoveryPct == null || !Number.isFinite(r.duplicateRecoveryPct)) {
            tableSvg += _cell(7, '—', COLOR.textMuted);
        } else {
            const recColor = _recoveryColor(r.duplicateRecoveryPct);
            tableSvg += _cell(7, `${r.duplicateRecoveryPct.toFixed(1)}%`, recColor, true);
        }

        // (8) Inc. — chip bolinha colorida + label PT-BR.
        if (r.uncertaintyClass) {
            tableSvg += _chip(UNCERTAINTY_LABEL[r.uncertaintyClass] || '—', _uncertaintyColor(r.uncertaintyClass), colX[8]!, y + 15);
        } else {
            tableSvg += _cell(8, '—', COLOR.textMuted);
        }

        // (9) Cad.Cust. — chip bolinha colorida + label PT-BR.
        if (r.chainOfCustody) {
            tableSvg += _chip(COC_LABEL[r.chainOfCustody] || '—', _cocColor(r.chainOfCustody), colX[9]!, y + 15);
        } else {
            tableSvg += _cell(9, '—', COLOR.textMuted);
        }
    }
    // Tail "... +N mais" quando truncado.
    if (truncated) {
        const y = tableY0 + HEADER_ROW_H + displayRows.length * ROW_H;
        tableSvg +=
            `<rect x="0" y="${y}" width="${W}" height="${ROW_H}" fill="${COLOR.rowAlt}"/>` +
            `<text x="${W / 2}" y="${y + 15}" text-anchor="middle" font-size="9" fill="${COLOR.textMuted}" font-style="italic">… +${overflow} parâmetro(s) adicional(is) omitido(s)</text>`;
    }

    // ── Borda externa da tabela ──────────────────────────────────────────
    tableSvg += `<rect x="0" y="${tableY0}" width="${W}" height="${tableH}" fill="none" stroke="${COLOR.border}"/>`;

    // ── Rodapé ───────────────────────────────────────────────────────────
    const datum = _esc(opts.centerLabel?.datum || '');
    const source = _esc(opts.centerLabel?.source || '');
    const footerY = HEADER_H + tableH;
    const footer =
        `<rect x="0" y="${footerY}" width="${W}" height="${FOOTER_H}" fill="#ffffff" stroke="${COLOR.border}"/>` +
        (datum
            ? `<text x="${W / 2}" y="${footerY + 16}" text-anchor="middle" font-size="10" fill="${COLOR.textMuted}">${datum}</text>`
            : '') +
        (source
            ? `<text x="${W / 2}" y="${footerY + 30}" text-anchor="middle" font-size="9" fill="${COLOR.em}" font-style="italic">${source}</text>`
            : '');

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" font-family="sans-serif">` +
        `<rect width="${W}" height="${totalH}" fill="#ffffff"/>` +
        headerSvg +
        tableSvg +
        footer +
        `</svg>`
    );
}

/** Conveniência: SVG da tabela direto como data URL embutível. */
export function buildQaQcTableDataUrl(rows: QaQcRow[], opts: QaQcTableOpts = {}): string {
    return svgToDataUrl(buildQaQcTableSvg(rows, opts));
}
