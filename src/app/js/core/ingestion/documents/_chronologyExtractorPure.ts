// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// RICH-DOC-FULL-001 F3 — extrator pure-logic de cronologia de campanhas.
//
// Captura datas de eventos do relatório (sondagem, coleta, análise) e
// classifica por tipo. Alimenta core/campaigns/manager (CampaignEvent
// vira Campaign no modelo).
//
// Exemplos:
//   "Sondagem dos poços PM-01 a PM-12 realizada em 15/08/2024"
//   "Coleta de solo realizada em 02/09/2024"
//   "Relatório emitido em março de 2025"
//
// SPEC: docs/specs/_archived/SPEC_RICH_DOC_FULL_EXTRACTION.md RF-4
//
// PRIOR ART:
//   - src/app/js/core/campaigns/manager.ts (Campaign domain model)
//   - src/app/js/utils/i18n/datetime helpers

// ===========================================================================
// Tipos
// ===========================================================================

export type CampaignKind = 'sampling' | 'drilling' | 'monitoring' | 'analysis' | 'report' | 'other';

export interface CampaignEvent {
    readonly date: string; // ISO YYYY-MM-DD
    readonly kind: CampaignKind;
    readonly wellsCount: number | null;
    readonly wellIds: ReadonlyArray<string>;
    readonly quotedSentence: string;
}

export interface ChronologyExtraction {
    readonly events: ReadonlyArray<CampaignEvent>;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Patterns
// ===========================================================================

// Date formats:
// - DD/MM/YYYY ou DD-MM-YYYY
// - DD de Mês de YYYY ("15 de agosto de 2024")
// - Mês de YYYY ("agosto de 2024") - menor especificidade
const DATE_NUM_REGEX = /\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](20\d{2})\b/;
const MONTH_PT = 'Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro';
const DATE_TEXT_FULL_REGEX = new RegExp(
    `\\b(0?[1-9]|[12]\\d|3[01])\\s+de\\s+(${MONTH_PT})\\s+de\\s+(20\\d{2})`,
    'i',
);
const DATE_TEXT_MONTHYEAR_REGEX = new RegExp(`\\b(${MONTH_PT})\\s+(?:de\\s+)?(20\\d{2})`, 'i');

// Kind anchors
const KIND_PATTERNS: ReadonlyArray<{ readonly kind: CampaignKind; readonly patterns: ReadonlyArray<RegExp> }> = Object.freeze([
    Object.freeze({
        kind: 'drilling' as CampaignKind,
        patterns: Object.freeze([
            /\bsondagem(?:s|es)?\b/i,
            /\bperfura[çc][ãa]o\b/i,
            /\binstala[çc][ãa]o\s+de\s+po[çc]os?\b/i,
        ]),
    }),
    Object.freeze({
        kind: 'sampling' as CampaignKind,
        patterns: Object.freeze([
            /\bcoleta(?:s)?\s+de\s+(solo|água|amostras?)/i,
            /\bamostragem\b/i,
            /\bcampanha\s+(de\s+)?(amostragem|coleta)/i,
        ]),
    }),
    Object.freeze({
        kind: 'monitoring' as CampaignKind,
        patterns: Object.freeze([
            /\bmonitoramento(?:s)?\s+(?:semestral|anual|trimestral|mensal|periódico)?/i,
            /\b(?:campanha|rodada)\s+de\s+monitoramento\b/i,
        ]),
    }),
    Object.freeze({
        kind: 'analysis' as CampaignKind,
        patterns: Object.freeze([
            /\ban[áa]lise(?:s)?\s+(?:laboratoriais?|cromat[oó]gr[áa]fica)/i,
            /\benvio\s+(?:das?\s+)?amostras?\s+(?:para|ao)\s+laborat[óo]rio/i,
            /\bemiss[ãa]o\s+do\s+(?:laudo|relat[óo]rio\s+anal[íi]tico)/i,
        ]),
    }),
    Object.freeze({
        kind: 'report' as CampaignKind,
        patterns: Object.freeze([
            /\brelat[óo]rio\s+(?:emitido|finalizado|aprovado)/i,
            /\bentrega\s+(?:do|deste)\s+relat[óo]rio\b/i,
            /\bemiss[ãa]o\s+do\s+relat[óo]rio\b/i,
        ]),
    }),
]);

// Well ID pattern (igual a F2)
const WELL_ID_GLOBAL_REGEX = /\b(P[MTZSC]|SP|SM|PMC|PZN?)[-\s]?(\d{1,4}[A-Z]?)\b/gi;

// Conta poços com padrão "PM-01 a PM-12" / "PM-01 ao PM-12"
const WELL_RANGE_REGEX =
    /\b(P[MTZSC]|SP|SM|PMC|PZN?)[-\s]?(\d{1,4})\s+(?:a|ao|até|at[eé])\s+(P[MTZSC]|SP|SM|PMC|PZN?)?[-\s]?(\d{1,4})\b/i;

const MONTH_INDEX: Record<string, number> = Object.freeze({
    janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
});

// ===========================================================================
// Helpers
// ===========================================================================

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function isoDate(year: number, month: number, day: number): string | null {
    if (!Number.isInteger(year) || year < 1990 || year > 2100) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    // Sanity: dias por mês
    const daysIn = new Date(year, month, 0).getDate();
    if (day > daysIn) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

function detectKind(text: string): CampaignKind {
    for (const { kind, patterns } of KIND_PATTERNS) {
        for (const p of patterns) {
            if (p.test(text)) return kind;
        }
    }
    return 'other';
}

function countWells(text: string): { count: number | null; ids: string[] } {
    // Tenta range PM-01 a PM-12 primeiro
    const rangeMatch = text.match(WELL_RANGE_REGEX);
    if (rangeMatch && rangeMatch[2] && rangeMatch[4]) {
        const start = parseInt(rangeMatch[2], 10);
        const end = parseInt(rangeMatch[4], 10);
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start < 1000) {
            const prefix = rangeMatch[1]!.toUpperCase(); // [2]/[4] casaram → [1] também
            const ids: string[] = [];
            for (let i = start; i <= end; i++) {
                ids.push(`${prefix}-${i.toString().padStart(2, '0')}`);
            }
            return { count: end - start + 1, ids: ids.slice(0, 50) };
        }
    }
    // Senão, captura IDs individuais
    const ids = new Set<string>();
    const re = new RegExp(WELL_ID_GLOBAL_REGEX.source, WELL_ID_GLOBAL_REGEX.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        ids.add(m[0].toUpperCase().replace(/\s+/g, '-'));
    }
    return { count: ids.size > 0 ? ids.size : null, ids: Array.from(ids).slice(0, 50) };
}

function quote(text: string, maxLen: number = 200): string {
    const norm = text.replace(/\s+/g, ' ').trim();
    return norm.length > maxLen ? norm.slice(0, maxLen - 1) + '…' : norm;
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Extrai eventos de cronologia de texto narrativo de relatório.
 *
 * Algoritmo:
 *   1. Divide texto em sentenças (. ! ? + new lines)
 *   2. Para cada sentença com data: extrai date + classify kind
 *   3. Conta poços (range ou IDs individuais)
 *   4. Acumula em events[] deduplicado por date+kind+quote
 *   5. Ordena por data crescente
 *
 * Nunca throws. Sentenças sem data → ignoradas.
 */
export function extractChronology(rawText: unknown): ChronologyExtraction {
    const warnings: string[] = [];

    if (typeof rawText !== 'string' || rawText.trim() === '') {
        return Object.freeze({
            events: Object.freeze([] as CampaignEvent[]),
            warnings: Object.freeze(['rawText vazio ou tipo inválido']),
        });
    }

    const text = rawText.slice(0, 50_000);
    // Split por sentença (incluindo nova linha)
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 8);

    const events: CampaignEvent[] = [];
    const seen = new Set<string>();

    for (const sentence of sentences) {
        let dateIso: string | null = null;

        // 1. DD/MM/YYYY
        const numMatch = sentence.match(DATE_NUM_REGEX);
        if (numMatch && numMatch[1] && numMatch[2] && numMatch[3]) {
            const day = parseInt(numMatch[1], 10);
            const month = parseInt(numMatch[2], 10);
            const year = parseInt(numMatch[3], 10);
            dateIso = isoDate(year, month, day);
        }

        // 2. "DD de Mês de YYYY"
        if (!dateIso) {
            const fullMatch = sentence.match(DATE_TEXT_FULL_REGEX);
            if (fullMatch && fullMatch[1] && fullMatch[2] && fullMatch[3]) {
                const day = parseInt(fullMatch[1], 10);
                const monthName = fullMatch[2].toLowerCase();
                const month = MONTH_INDEX[monthName] || MONTH_INDEX[monthName.replace('ç', 'c')];
                const year = parseInt(fullMatch[3], 10);
                if (month) dateIso = isoDate(year, month, day);
            }
        }

        // 3. "Mês de YYYY" → assume dia 01
        if (!dateIso) {
            const myMatch = sentence.match(DATE_TEXT_MONTHYEAR_REGEX);
            if (myMatch && myMatch[1] && myMatch[2]) {
                const monthName = myMatch[1].toLowerCase();
                const month = MONTH_INDEX[monthName] || MONTH_INDEX[monthName.replace('ç', 'c')];
                const year = parseInt(myMatch[2], 10);
                if (month) dateIso = isoDate(year, month, 1);
            }
        }

        if (!dateIso) continue;

        const kind = detectKind(sentence);
        const { count, ids } = countWells(sentence);
        const quoted = quote(sentence);
        const key = `${dateIso}|${kind}|${quoted.slice(0, 50)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        events.push(
            Object.freeze({
                date: dateIso,
                kind,
                wellsCount: count,
                wellIds: Object.freeze(ids),
                quotedSentence: quoted,
            }),
        );
    }

    // Ordena por data crescente
    const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    if (sorted.length === 0) {
        warnings.push('nenhuma data com kind reconhecido extraída');
    }

    return Object.freeze({
        events: Object.freeze(sorted),
        warnings: Object.freeze(warnings),
    });
}

/** Metadata pública. */
export const CHRONOLOGY_EXTRACTOR_META = Object.freeze({
    supportedKinds: Object.freeze(['sampling', 'drilling', 'monitoring', 'analysis', 'report', 'other']),
    dateFormats: Object.freeze([
        'DD/MM/YYYY (numérico)',
        'DD de Mês de YYYY (extenso)',
        'Mês de YYYY (assume dia 01)',
    ]),
    maxTextSize: 50_000,
    maxWellsPerEvent: 50,
});
