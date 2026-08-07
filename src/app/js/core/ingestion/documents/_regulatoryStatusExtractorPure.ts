// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CETESB-RISK-001 + RICH-DOC-FULL-001 F1 — extrator pure-logic de status
// regulatório CETESB (AP/AS/ACI/ACRi/ACR/AME) a partir de texto narrativo.
//
// Complementa core/validation/gacClassification.ts: gacClassification CLASSIFICA
// (input GacFacts → output GacClass); este módulo EXTRAI evidências textuais
// que sugerem qual classe o documento já declara.
//
// SPEC: docs/specs/_archived/SPEC_RICH_DOC_FULL_EXTRACTION.md RF-2
//
// PRIOR ART:
//   - src/app/js/core/validation/gacClassification.ts (GacClass enum + GAC_CLASSES + classifyGac)
//   - src/app/js/core/ingestion/documents/proseParser.ts (extractRegulations — regulações citadas)

import type { GacClass } from '../../validation/gacClassification.js';

// ===========================================================================
// Tipos
// ===========================================================================

export type ExtractedGacStatus = GacClass | 'undetermined';

export interface RegulatoryStatus {
    readonly classification: ExtractedGacStatus;
    readonly evidenceQuotes: ReadonlyArray<string>; // até 3 trechos verbatim (≤200 chars cada)
    readonly cetesbDecreesQuoted: ReadonlyArray<string>; // "DD 256/2016", "Decreto 59.263/2013", etc.
    readonly confidence: number; // 0..1
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Patterns
// ===========================================================================

// Frases-âncora por classe — listas ordenadas por especificidade
// (mais específicas primeiro, evita classificar "monitoramento" como AME
// quando contexto é só monitoramento preventivo).
interface ClassAnchor {
    readonly cls: GacClass;
    readonly patterns: ReadonlyArray<RegExp>;
    readonly weight: number; // 0..1 — contribuição para confidence
}

// IMPORTANTE: `\b` (word boundary) é ASCII-only — não funciona com chars
// acentuados (á, ã, é...). Usar lookaround manual (?:^|\W) / (?=$|\W) para
// patterns que começam/terminam com letras acentuadas.
const ANCHOR_PATTERNS: ReadonlyArray<ClassAnchor> = Object.freeze([
    Object.freeze({
        cls: 'AME' as GacClass,
        weight: 0.85,
        patterns: Object.freeze([
            /(?:^|\W)área\s+em\s+monitoramento\s+para\s+encerramento/i,
            /\bAME\s*\(\s*Monitoramento\s+para\s+Encerramento\s*\)/i,
            /\bmetas\s+(de\s+remediação\s+)?atingidas/i,
            /\bmonitoramento\s+(de|para)\s+encerramento\b/i,
        ]),
    }),
    Object.freeze({
        cls: 'ACRi' as GacClass,
        weight: 0.85,
        patterns: Object.freeze([
            /(?:^|\W)área\s+contaminada\s+em\s+(processo\s+de\s+)?remediação/i,
            /\bACRi\b/,
            /\bem\s+remediação\s+(ambiental\s+)?ativa/i,
            /\bremediação\s+(ambiental\s+)?em\s+andamento/i,
        ]),
    }),
    Object.freeze({
        cls: 'ACR' as GacClass,
        weight: 0.9,
        patterns: Object.freeze([
            /(?:^|\W)área\s+(em\s+processo\s+de\s+)?reabilitação/i,
            /\breabilitada\s+para\s+(o\s+)?uso\s+(declarado|pretendido)/i,
            /\bACR\b/,
            /\bintervenção\s+(ambiental\s+)?(concluída|encerrada)/i,
        ]),
    }),
    Object.freeze({
        cls: 'ACI' as GacClass,
        weight: 0.9,
        patterns: Object.freeze([
            /(?:^|\W)área\s+contaminada\s+sob\s+investigação/i,
            /\bACI\s*\(\s*Área\s+Contaminada\s+sob\s+Investigação\s*\)/i,
            /\bconcentração\s+(acima|superior)\s+(do|ao)\s+VI\b/i,
            /\bproduto\s+em\s+fase\s+livre\b/i,
            /(?:^|\W)área\s+contaminada\s+(?:identificada|confirmada)/i,
        ]),
    }),
    Object.freeze({
        cls: 'AS' as GacClass,
        weight: 0.7,
        patterns: Object.freeze([
            /(?:^|\W)área\s+suspeita\s+de\s+contaminação/i,
            /\bAS\s*\(\s*Área\s+Suspeita\s*\)/i,
            /\bavaliação\s+preliminar\s+(identificou|indicou|apontou)\s+(indícios|suspeita)/i,
            /\bindícios\s+de\s+contaminação/i,
        ]),
    }),
    Object.freeze({
        cls: 'AP' as GacClass,
        weight: 0.6,
        patterns: Object.freeze([
            /(?:^|\W)área\s+com\s+potencial\s+de\s+contaminação/i,
            /\bAP\s*\(\s*Potencial\s+de\s+Contaminação\s*\)/i,
            /\batividade\s+com\s+potencial\s+(poluidor|de\s+contaminação)/i,
            /\bsem\s+investigação\s+confirmatória/i,
        ]),
    }),
]);

// Decretos/DDs canônicos — captura referência verbatim
const DECREE_PATTERNS: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> = Object.freeze([
    Object.freeze({ label: 'DD CETESB 256/2016', pattern: /\bDD\s*(CETESB\s*)?256\s*\/\s*2016\b/i }),
    Object.freeze({ label: 'DD CETESB 038/2017', pattern: /\bDD\s*(CETESB\s*)?038?\s*\/\s*2017\b/i }),
    Object.freeze({ label: 'DD CETESB 103/2007', pattern: /\bDD\s*(CETESB\s*)?103\s*\/\s*2007(?:\/[CE])?\b/i }),
    Object.freeze({ label: 'Decreto 59.263/2013', pattern: /\bDecreto\s*(?:Estadual\s*)?(?:n[°ºo.]?\s*)?59\.?263\s*\/\s*2013\b/i }),
    Object.freeze({ label: 'CONAMA 420/2009', pattern: /\bCONAMA\s*(n[°ºo.]?\s*)?420\s*\/\s*2009\b/i }),
    Object.freeze({ label: 'CONAMA 460/2013', pattern: /\bCONAMA\s*(n[°ºo.]?\s*)?460\s*\/\s*2013\b/i }),
]);

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Captura até 2 trechos verbatim (≤200 chars) em torno do match,
 * para uso como evidência no review screen.
 */
function quotesAround(text: string, regex: RegExp, maxQuotes: number = 2): string[] {
    const quotes: string[] = [];
    let copy = text;
    let offset = 0;
    while (quotes.length < maxQuotes) {
        const m = copy.match(regex);
        if (!m || m.index === undefined) break;
        const start = Math.max(0, m.index - 60);
        const end = Math.min(copy.length, m.index + (m[0] || '').length + 60);
        let quote = copy.slice(start, end).replace(/\s+/g, ' ').trim();
        if (quote.length > 200) quote = quote.slice(0, 197) + '…';
        if (quote.length >= 20) quotes.push(quote);
        const advance = m.index + (m[0] || '').length + 1;
        copy = copy.slice(advance);
        // eslint-disable-next-line
        offset += advance;
    }
    return quotes;
}

function emptyRegulatoryStatus(warning: string): RegulatoryStatus {
    return Object.freeze({
        classification: 'undetermined' as const,
        evidenceQuotes: Object.freeze([] as string[]),
        cetesbDecreesQuoted: Object.freeze([] as string[]),
        confidence: 0,
        warnings: Object.freeze([warning]),
    });
}

function detectDecrees(text: string): string[] {
    const decrees: string[] = [];
    for (const { label, pattern } of DECREE_PATTERNS) {
        if (pattern.test(text)) decrees.push(label);
    }
    return decrees;
}

interface ClassificationOutcome {
    readonly classification: ExtractedGacStatus;
    readonly confidence: number;
    readonly evidenceQuotes: string[];
}

function detectClassification(text: string): ClassificationOutcome {
    for (const anchor of ANCHOR_PATTERNS) {
        let matchCount = 0;
        const collected: string[] = [];
        for (const pattern of anchor.patterns) {
            if (pattern.test(text)) {
                matchCount++;
                const qs = quotesAround(text, pattern, 1);
                for (const q of qs) {
                    if (!collected.includes(q) && collected.length < 3) collected.push(q);
                }
            }
        }
        if (matchCount > 0) {
            return {
                classification: anchor.cls,
                confidence: Math.min(1, anchor.weight * (matchCount / anchor.patterns.length) + 0.3),
                evidenceQuotes: collected,
            };
        }
    }
    return { classification: 'undetermined' as const, confidence: 0, evidenceQuotes: [] };
}

function applyDecreeBoost(confidence: number, classification: ExtractedGacStatus, decreeCount: number): number {
    if (classification !== 'undetermined' && decreeCount >= 2) {
        return Math.min(1, confidence + 0.1);
    }
    return confidence;
}

function buildRegulatoryWarnings(classification: ExtractedGacStatus, decreeCount: number): string[] {
    const warnings: string[] = [];
    if (classification === 'undetermined') {
        warnings.push('Nenhuma frase-âncora canônica detectada — classificação manual necessária');
    }
    if (decreeCount === 0) {
        warnings.push('Nenhum decreto CETESB/CONAMA citado — verificar fundamentação legal');
    }
    return warnings;
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Extrai status regulatório CETESB de texto narrativo.
 *
 * Algoritmo:
 *   1. Roda patterns por classe (AME → ACRi → ACR → ACI → AS → AP — mais
 *      específica primeiro)
 *   2. Primeira classe com ≥1 match vence (heurística "documento declara
 *      um status, não múltiplos")
 *   3. Confidence = peso da classe × (matches_dessa_classe / patterns_dessa_classe)
 *   4. Decretos citados são extraídos independente da classificação
 *
 * Nunca throws. Texto cap 50KB para performance.
 */
export function extractRegulatoryStatus(rawText: unknown): RegulatoryStatus {
    if (typeof rawText !== 'string' || rawText.trim() === '') {
        return emptyRegulatoryStatus('rawText vazio ou tipo inválido');
    }

    const text = rawText.slice(0, 50_000);

    // Detect decrees first (independente da classificação)
    const decrees = detectDecrees(text);

    // Detect classification — primeira classe com matches vence
    const { classification, confidence: rawConfidence, evidenceQuotes } = detectClassification(text);

    // Boost confidence se há decretos citados
    const confidence = applyDecreeBoost(rawConfidence, classification, decrees.length);

    const warnings = buildRegulatoryWarnings(classification, decrees.length);

    return Object.freeze({
        classification,
        evidenceQuotes: Object.freeze(evidenceQuotes),
        cetesbDecreesQuoted: Object.freeze(decrees),
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        warnings: Object.freeze(warnings),
    });
}

/** Metadata pública para auditoria. */
export const REGULATORY_STATUS_EXTRACTOR_META = Object.freeze({
    supportedClasses: Object.freeze(['AP', 'AS', 'ACI', 'ACRi', 'ACR', 'AME', 'undetermined']),
    anchorPatternCount: ANCHOR_PATTERNS.reduce((acc, a) => acc + a.patterns.length, 0),
    decreePatternCount: DECREE_PATTERNS.length,
    maxTextSize: 50_000,
    classificationStrategy: 'first-match-wins-most-specific-first',
});
