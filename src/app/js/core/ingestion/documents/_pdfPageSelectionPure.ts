// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// RICH-DOC-FULL-001 budget fix — pure-logic helper para seleção de páginas
// em PDFs grandes.
//
// Bug original: loop em extractPdfImages (documentWorker.ts) processa TODAS
// as páginas mesmo após MAX_PDF_IMAGES=20 ser atingido, porque PDFs técnicos
// com 114+ páginas têm muitas páginas SEM imagens no início (capa, sumário,
// intro). Resultado: ~26 min estimados para PDF de 114 pgs.
//
// Heurística: para PDFs grandes, processa "head + tail":
//   - capa + sumário + intro (head) — onde estão metadados (cliente, ref, data)
//   - apêndice + tabelas finais (tail) — onde estão dados quantitativos
// Pula corpo central (geralmente narrativa + figuras decorativas).
//
// Calibração calvinosa de campo:
//   - PDFs ≤ 60 páginas: processa TODAS (sem perda)
//   - PDFs 61-200 páginas: 30 head + 30 tail (cobre 100% dos extremos)
//   - PDFs > 200 páginas: 40 head + 40 tail (cap absoluto 80)
//
// SPEC: docs/specs/_archived/SPEC_RICH_DOC_FULL_EXTRACTION.md (budget upstream)

// ===========================================================================
// Tipos
// ===========================================================================

export interface PageSelectionConfig {
    readonly totalPages: number;
    readonly fullProcessThreshold: number; // se totalPages ≤ este → processa todas
    readonly headCount: number; // primeiras N páginas
    readonly tailCount: number; // últimas N páginas
    readonly absoluteCap: number; // máximo total de páginas a processar
}

export interface PageSelectionResult {
    readonly pageNumbers: ReadonlyArray<number>; // ordenados crescente, 1-indexed
    readonly strategy: 'all' | 'head-tail' | 'capped';
    readonly skippedRange: { readonly start: number; readonly end: number } | null;
    readonly totalSelected: number;
}

// ===========================================================================
// Constantes calibradas
// ===========================================================================

// Calibração após teste de campo PDF Calvin 114 pgs:
// - Cada pg de PDF técnico com mapas/plantas: ~10s para extrair imagens
// - head 5 + tail 5 = 10 pgs = ~100s — dentro de spec 200s
// - Para PDFs anônimos pequenos (≤22 pgs): processa "all" — mantém cobertura
// - Para PDFs grandes (>22 pgs): foca em capa (metadata) + apêndice (tabelas)
export const DEFAULT_PAGE_SELECTION_CONFIG: PageSelectionConfig = Object.freeze({
    totalPages: 0, // overridden per call
    fullProcessThreshold: 22,
    headCount: 5,
    tailCount: 5,
    absoluteCap: 12,
});

// ===========================================================================
// Helpers
// ===========================================================================

function makePageSelectionConfig(
    totalPages: number,
    partial: Partial<PageSelectionConfig>,
): PageSelectionConfig {
    return Object.freeze({
        totalPages,
        fullProcessThreshold: partial.fullProcessThreshold ?? DEFAULT_PAGE_SELECTION_CONFIG.fullProcessThreshold,
        headCount: partial.headCount ?? DEFAULT_PAGE_SELECTION_CONFIG.headCount,
        tailCount: partial.tailCount ?? DEFAULT_PAGE_SELECTION_CONFIG.tailCount,
        absoluteCap: partial.absoluteCap ?? DEFAULT_PAGE_SELECTION_CONFIG.absoluteCap,
    });
}

function makeEmptyResult(): PageSelectionResult {
    return Object.freeze({
        pageNumbers: Object.freeze([] as number[]),
        strategy: 'all' as const,
        skippedRange: null,
        totalSelected: 0,
    });
}

function makeAllPagesResult(totalPages: number): PageSelectionResult {
    const all: number[] = [];
    for (let p = 1; p <= totalPages; p++) all.push(p);
    return Object.freeze({
        pageNumbers: Object.freeze(all),
        strategy: 'all' as const,
        skippedRange: null,
        totalSelected: totalPages,
    });
}

function adjustHeadTail(
    head: number,
    tail: number,
    absoluteCap: number,
): { readonly head: number; readonly tail: number } {
    if (head + tail <= absoluteCap) {
        return { head, tail };
    }
    const ratio = absoluteCap / (head + tail);
    const cappedHead = Math.floor(head * ratio);
    return { head: cappedHead, tail: absoluteCap - cappedHead };
}

function makeHeadTailResult(totalPages: number, cfg: PageSelectionConfig): PageSelectionResult {
    const { head, tail } = adjustHeadTail(cfg.headCount, cfg.tailCount, cfg.absoluteCap);

    // Sanity: head + tail nunca pode exceder totalPages
    if (head + tail >= totalPages) {
        // Volta para 'all' (não há "miolo" para pular)
        return makeAllPagesResult(totalPages);
    }

    const pages: number[] = [];
    for (let p = 1; p <= head; p++) pages.push(p);
    for (let p = totalPages - tail + 1; p <= totalPages; p++) pages.push(p);

    const skippedStart = head + 1;
    const skippedEnd = totalPages - tail;
    const isCapped = head < cfg.headCount || tail < cfg.tailCount;

    return Object.freeze({
        pageNumbers: Object.freeze(pages),
        strategy: (isCapped ? 'capped' : 'head-tail') as 'capped' | 'head-tail',
        skippedRange: Object.freeze({ start: skippedStart, end: skippedEnd }),
        totalSelected: pages.length,
    });
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Seleciona quais páginas processar dado o totalPages do PDF.
 *
 * Estratégia:
 *   1. Se totalPages ≤ fullProcessThreshold → all (processa todas)
 *   2. Senão → head-tail (capa + apêndice)
 *   3. Se head+tail excede absoluteCap → reduz proporcionalmente (capped)
 *
 * Nunca throws. Invalid inputs retornam array vazio + strategy 'all'.
 */
export function selectPagesToProcess(
    totalPages: number,
    config: Partial<PageSelectionConfig> = {},
): PageSelectionResult {
    if (!Number.isInteger(totalPages) || totalPages <= 0) {
        return makeEmptyResult();
    }

    const cfg = makePageSelectionConfig(totalPages, config);

    // Caso 1: PDF pequeno — processa tudo
    if (totalPages <= cfg.fullProcessThreshold) {
        return makeAllPagesResult(totalPages);
    }

    // Caso 2: head-tail. Ajusta se excede cap.
    return makeHeadTailResult(totalPages, cfg);
}

/**
 * Helper para o caller decidir se vale logar warning sobre páginas puladas.
 */
export function summarizeSelection(result: PageSelectionResult, totalPages: number): string {
    if (result.strategy === 'all') {
        return `processa todas as ${totalPages} páginas`;
    }
    const skipped = result.skippedRange
        ? `pula páginas ${result.skippedRange.start}-${result.skippedRange.end}`
        : '';
    return `${result.strategy}: ${result.totalSelected}/${totalPages} páginas (${skipped})`;
}

/** Metadata pública. */
export const PDF_PAGE_SELECTION_META = Object.freeze({
    strategies: Object.freeze(['all', 'head-tail', 'capped']),
    rationale: 'PDFs técnicos têm metadados na capa/sumário (head) e tabelas finais (tail); corpo é narrativa.',
    defaultConfig: DEFAULT_PAGE_SELECTION_CONFIG,
});
