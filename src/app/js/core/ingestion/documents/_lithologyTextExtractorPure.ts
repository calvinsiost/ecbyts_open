// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// RICH-DOC-FULL-001 F2 — extrator pure-logic de litologia textual.
//
// Parseia logs de sondagem narrativos em camadas estruturadas:
//   "PM-03: 0,0 a 2,5 m argila siltosa marrom; 2,5 a 5,0 m areia fina cinza"
//   →
//   [
//     { wellId: 'PM-03', topDepthM: 0.0, bottomDepthM: 2.5, lithology: 'argila siltosa', color: 'marrom' },
//     { wellId: 'PM-03', topDepthM: 2.5, bottomDepthM: 5.0, lithology: 'areia fina', color: 'cinza' },
//   ]
//
// Alimenta core/geology/wellLithology + core/elements/families/well para
// gerar perfis 3D automaticamente do PDF.
//
// SPEC: docs/specs/_archived/SPEC_RICH_DOC_FULL_EXTRACTION.md RF-3
//
// PRIOR ART:
//   - src/app/js/core/geology/wellLithology.ts (14 litologias canônicas)
//   - src/app/js/core/ingestion/documents/wellIdCanon.ts (canonização wellId)

// ===========================================================================
// Tipos
// ===========================================================================

export interface LithologyLayer {
    readonly wellId: string | null;
    readonly topDepthM: number;
    readonly bottomDepthM: number;
    readonly lithology: string;
    readonly color: string | null;
    readonly quotedSentence: string; // verbatim para auditoria
}

export interface LithologyExtraction {
    readonly layers: ReadonlyArray<LithologyLayer>;
    readonly wellCount: number;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Vocabulário litológico (alinhado a core/geology/wellLithology.ts)
// ===========================================================================

const LITHOLOGY_TERMS: ReadonlyArray<string> = Object.freeze([
    'argila',
    'argila siltosa',
    'argila arenosa',
    'silte',
    'silte argiloso',
    'silte arenoso',
    'areia',
    'areia fina',
    'areia média',
    'areia grossa',
    'areia siltosa',
    'areia argilosa',
    'cascalho',
    'pedregulho',
    'rocha',
    'rocha alterada',
    'rocha sã',
    'aterro',
    'solo orgânico',
    'turfa',
    'concreto',
]);

const COLOR_TERMS: ReadonlyArray<string> = Object.freeze([
    'marrom',
    'marrom-claro',
    'marrom-escuro',
    'cinza',
    'cinza-claro',
    'cinza-escuro',
    'amarelo',
    'amarelado',
    'avermelhado',
    'vermelho',
    'preto',
    'preta',
    'branco',
    'branca',
    'esverdeado',
    'rosado',
    'bege',
    'ocre',
]);

// Well ID — PM-NN / PT-NN / SR-NN / SP-NN / etc.
const WELL_ID_REGEX = /\b(P[MTZSC]|SP|SM|PMC|PZN?)[-\s]?(\d{1,4}[A-Z]?)\b/i;

// Depth range: "0,0 a 2,5 m" / "0.0-2.5 m" / "0 — 2.5m" / "de 0,0 a 2,5 m" / "0 até 2 m"
// NOTA: \b é ASCII-only — para "até" (com é) usar lookahead manual.
const DEPTH_RANGE_REGEX =
    /(?:^|\s|de\s+)(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:a\s|at[eé]\s|to\s|[-–—]\s*)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*m\b/i;

// ===========================================================================
// Helpers
// ===========================================================================

function normNumPt(s: string): number {
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
}

function findLithology(snippet: string): string | null {
    const lower = snippet.toLowerCase();
    // Match mais longo primeiro (areia fina antes de areia)
    const sorted = [...LITHOLOGY_TERMS].sort((a, b) => b.length - a.length);
    for (const term of sorted) {
        if (lower.includes(term)) return term;
    }
    return null;
}

function findColor(snippet: string): string | null {
    const lower = snippet.toLowerCase();
    const sorted = [...COLOR_TERMS].sort((a, b) => b.length - a.length);
    for (const c of sorted) {
        if (lower.includes(c)) return c;
    }
    return null;
}

function splitByLayers(text: string): string[] {
    // Cada layer geralmente termina em ; ou \n após "m"
    return text
        .split(/[;\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Extrai camadas litológicas de texto narrativo de logs de sondagem.
 *
 * Algoritmo:
 *   1. Divide texto em parágrafos
 *   2. Para cada parágrafo: tenta extrair wellId
 *   3. Divide parágrafo em layers (por ; ou \n)
 *   4. Para cada layer: extrai depth range + lithology + color
 *   5. Valida monotonicidade (topDepth < bottomDepth)
 *   6. Acumula em layers[] herdando wellId do contexto
 *
 * Nunca throws. Camadas inválidas (sem litologia ou sem range) são descartadas
 * mas geram warning.
 */
export function extractLithology(rawText: unknown): LithologyExtraction {
    const warnings: string[] = [];

    if (typeof rawText !== 'string' || rawText.trim() === '') {
        return Object.freeze({
            layers: Object.freeze([] as LithologyLayer[]),
            wellCount: 0,
            warnings: Object.freeze(['rawText vazio ou tipo inválido']),
        });
    }

    const text = rawText.slice(0, 50_000);
    const paragraphs = text.split(/\n{2,}|\r\n{2,}/);
    const layers: LithologyLayer[] = [];
    const wellsSeen = new Set<string>();
    let currentWellId: string | null = null;

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (trimmed.length < 8) continue;

        // Atualiza contexto de wellId se este parágrafo declara um
        const wellMatch = trimmed.match(WELL_ID_REGEX);
        if (wellMatch && wellMatch[0]) {
            const id = wellMatch[0].toUpperCase().replace(/\s+/g, '-');
            currentWellId = id;
            wellsSeen.add(id);
        }

        const segments = splitByLayers(trimmed);
        for (const seg of segments) {
            const depthMatch = seg.match(DEPTH_RANGE_REGEX);
            if (!depthMatch || !depthMatch[1] || !depthMatch[2]) continue;
            const topDepthM = normNumPt(depthMatch[1]);
            const bottomDepthM = normNumPt(depthMatch[2]);

            if (!Number.isFinite(topDepthM) || !Number.isFinite(bottomDepthM)) {
                warnings.push(`profundidade inválida em "${seg.slice(0, 40)}"`);
                continue;
            }
            if (topDepthM >= bottomDepthM) {
                warnings.push(
                    `topDepth ≥ bottomDepth em "${seg.slice(0, 40)}" — ignorada`,
                );
                continue;
            }
            if (topDepthM < 0 || bottomDepthM > 1000) {
                warnings.push(
                    `profundidade fora de [0, 1000] em "${seg.slice(0, 40)}" — ignorada`,
                );
                continue;
            }

            const lithology = findLithology(seg);
            if (!lithology) {
                warnings.push(`nenhuma litologia reconhecida em "${seg.slice(0, 40)}"`);
                continue;
            }

            const color = findColor(seg);

            // Também considera wellId in-segment (se este segmento tem wellId próprio)
            const segWellMatch = seg.match(WELL_ID_REGEX);
            const wellId = segWellMatch && segWellMatch[0]
                ? segWellMatch[0].toUpperCase().replace(/\s+/g, '-')
                : currentWellId;

            if (wellId && !wellsSeen.has(wellId)) wellsSeen.add(wellId);

            layers.push(
                Object.freeze({
                    wellId,
                    topDepthM,
                    bottomDepthM,
                    lithology,
                    color,
                    quotedSentence: seg.length > 200 ? seg.slice(0, 197) + '…' : seg,
                }),
            );
        }
    }

    return Object.freeze({
        layers: Object.freeze(layers),
        wellCount: wellsSeen.size,
        warnings: Object.freeze(warnings),
    });
}

/** Metadata pública. */
export const LITHOLOGY_TEXT_EXTRACTOR_META = Object.freeze({
    lithologyTermCount: LITHOLOGY_TERMS.length,
    colorTermCount: COLOR_TERMS.length,
    maxTextSize: 50_000,
    depthUnit: 'm',
    canonicalLithologies: Object.freeze(LITHOLOGY_TERMS),
    canonicalColors: Object.freeze(COLOR_TERMS),
});
