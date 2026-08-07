// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   GREENWASHING DETECTION PURE (Module C extraction)
   ================================================================

   Helpers pure-logic extraídos de core/audit/greenwashing.ts.
   Detecção de linguagem vaga + cálculo de reliability index. Testáveis
   sem LLM/state.
   ================================================================ */

export interface VaguePattern {
    pattern: RegExp;
    term: string;
}

export interface Finding {
    severity?: string;
    finding?: string;
    [key: string]: any;
}

/**
 * Catálogo canônico de padrões de linguagem vaga ESG (EN + PT).
 * Exportado para reuso por outros validators ESG ou customização.
 */
export const VAGUE_PATTERNS_DEFAULT: ReadonlyArray<VaguePattern> = Object.freeze([
    { pattern: /eco[- ]?friendly/gi, term: 'eco-friendly' },
    { pattern: /sustain\w*/gi, term: 'sustainable/sustainability' },
    { pattern: /green\s+(?:solution|product|approach|initiative)/gi, term: 'green (adjective)' },
    { pattern: /carbon[- ]?neutral/gi, term: 'carbon neutral' },
    { pattern: /net[- ]?zero/gi, term: 'net zero' },
    { pattern: /clean(?:er)?\s+(?:energy|technology|solution)/gi, term: 'clean (adjective)' },
    { pattern: /environmentally\s+(?:responsible|conscious|aware)/gi, term: 'environmentally responsible' },
    { pattern: /100%\s+(?:natural|organic|recycled)/gi, term: '100% claim' },
    { pattern: /impacto\s+(?:zero|nulo|negligenciavel|insignificante)/gi, term: 'impacto zero/negligível' },
    { pattern: /ambientalmente\s+(?:responsavel|correto|adequado)/gi, term: 'ambientalmente responsável' },
    { pattern: /totalmente\s+(?:limpo|seguro|natural)/gi, term: 'totalmente limpo/seguro' },
]);

/**
 * Detecta linguagem vaga em texto contra catálogo de padrões. Pure.
 * Cada match vira finding com severity 'medium', category 'VAGUE_CLAIMS',
 * count de ocorrências.
 *
 * Default patterns: VAGUE_PATTERNS_DEFAULT. Custom patterns para
 * domain-specific ESG (ex: vocabulário mining específico).
 */
export function detectVagueLanguage(text: any, patterns: ReadonlyArray<VaguePattern> = VAGUE_PATTERNS_DEFAULT): any[] {
    if (!text || typeof text !== 'string') return [];
    const findings: any[] = [];
    for (const vp of patterns) {
        const matches = text.match(vp.pattern);
        if (matches) {
            findings.push({
                severity: 'medium',
                category: 'VAGUE_CLAIMS',
                finding: `Vague term "${vp.term}" used ${matches.length} time(s) without quantitative metrics`,
                match: matches[0],
                count: matches.length,
            });
        }
    }
    return findings;
}

/**
 * Default severity weights — escala de penalidades para reliability score.
 */
export const SEVERITY_WEIGHTS_DEFAULT: Readonly<Record<string, number>> = Object.freeze({
    critical: 15,
    high: 10,
    medium: 5,
    low: 2,
});

/**
 * Calcula reliability index 0-100 + grade A-F + redFlags array.
 *
 * - score = 100 − soma(weights[severity]), clamp [0, 100].
 * - grade thresholds: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F < 40.
 * - redFlags: array de finding strings com severity critical|high.
 *
 * Findings vazias → { score:100, grade:'A', redFlags:[] } (sem dúvidas).
 *
 * weights injetável — domain-specific pode customizar penalidades.
 */
export function calculateReliabilityIndex(
    findings: any,
    weights: Readonly<Record<string, number>> = SEVERITY_WEIGHTS_DEFAULT,
): { score: number; grade: string; redFlags: string[] } {
    if (!Array.isArray(findings) || findings.length === 0) {
        return { score: 100, grade: 'A', redFlags: [] };
    }
    let totalPenalty = 0;
    const redFlags: string[] = [];
    for (const f of findings) {
        const severity = f?.severity || 'medium';
        const penalty = weights[severity] ?? 5;
        totalPenalty += penalty;
        if (severity === 'critical' || severity === 'high') {
            redFlags.push(f.finding);
        }
    }
    const score = Math.max(0, Math.min(100, 100 - totalPenalty));
    let grade: string;
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'F';
    return { score, grade, redFlags };
}

/* ================================================================
   CLAIM SUBSTANTIATION RATE
   ================================================================

   Mede a fração de afirmações ambientais (claims) que vêm acompanhadas
   de EVIDÊNCIA competente e verificável, dentro do próprio texto da
   afirmação.

   Norma de referência:
     - ISO 14021:2016 (Environmental labels and declarations — Self-declared
       environmental claims, Type II), §5.7 "Evaluation and making of a claim":
       toda alegação ambiental deve ser específica, exata, NÃO enganosa e
       VERIFICÁVEL/SUBSTANCIÁVEL com informação de suporte disponível.
       ABNT NBR ISO 14021:2017 (adoção brasileira). ISBN 978-92-67-10704-7.
     - FTC Green Guides, 16 CFR Part 260 (2012), §260.2 "Interpretation and
       substantiation of environmental marketing claims": alegações ambientais
       devem ser sustentadas por "competent and reliable scientific evidence".
     - EU Green Claims Directive proposal COM(2023) 166 final, Art. 3:
       explicit environmental claims must be substantiated.

   Distinto de detectVagueLanguage (que acha TERMOS vagos) e de
   calculateReliabilityIndex (que agrega FINDINGS por severidade): aqui a
   métrica é a PROPORÇÃO de claims com lastro quantitativo/normativo —
   o requisito central e diretamente testável da ISO 14021 §5.7.
   ================================================================ */

export interface EvidenceMarker {
    pattern: RegExp;
    kind: string;
}

/**
 * Catálogo canônico de marcadores de "evidência competente e verificável"
 * (ISO 14021 §5.7 / FTC §260.2). A co-ocorrência de pelo menos um marcador no
 * texto da afirmação a classifica como SUBSTANCIADA.
 *
 * Marcadores são case-insensitive e NÃO devem usar a flag /g (avaliados via
 * RegExp.test por afirmação, sem estado de lastIndex). EN + PT.
 */
export const SUBSTANTIATION_EVIDENCE_DEFAULT: ReadonlyArray<EvidenceMarker> = Object.freeze([
    // Grandeza física com unidade (mg/L, t CO2eq, kWh, ppm, m³, %, etc.).
    {
        pattern:
            /\d[\d.,]*\s*(?:%|mg\/l|µg\/l|ug\/l|ppm|ppb|kg|t(?:on(?:elada)?s?)?|kwh|mwh|gj|m³|m3|m²|m2|ha|tco2|tco2e|tco2eq|co2eq|co2-?e)\b/i,
        kind: 'quantitative_with_unit',
    },
    // Redução/variação percentual contra baseline declarado.
    { pattern: /\d[\d.,]*\s*%[^.]{0,40}?(?:vs\.?|versus|compared|em rela[cç][aã]o|baseline|base year|ano[- ]base)/i, kind: 'percent_vs_baseline' },
    // Referência normativa / método (ISO, CONAMA, CETESB, NBR, EPA, EN, ASTM, CONAMA 420 etc.).
    {
        pattern: /\b(?:iso\s?\d{3,5}|nbr\s?\d+|conama\s?\d+|cetesb|ibama|epa\s?\d+|astm\s?[a-z]?\d+|en\s?\d{3,5}|ghg\s?protocol|ipcc)\b/i,
        kind: 'normative_reference',
    },
    // Verificação por terceira parte / auditoria / certificação.
    {
        pattern:
            /\b(?:third[- ]party|terceira parte|independently verified|verifica[cç][aã]o independente|audit(?:ed|oria)?|certif(?:ied|icad[oa]|ica[cç][aã]o)|assured by|laudo|relat[oó]rio de ensaio)\b/i,
        kind: 'third_party_verification',
    },
]);

export interface ClaimSubstantiationResult {
    /** Número total de afirmações avaliadas. */
    total: number;
    /** Afirmações com ao menos um marcador de evidência. */
    substantiated: number;
    /** Afirmações sem qualquer marcador de evidência. */
    unsubstantiated: number;
    /** substantiated / total ∈ [0,1]; total=0 ⇒ rate=1 (vacuamente conforme). */
    rate: number;
    /** Grade ISO 14021: A ≥0.90, B ≥0.75, C ≥0.50, D ≥0.25, F <0.25. */
    grade: string;
    /** Textos das afirmações não-substanciadas (até 50, truncadas a 160 chars). */
    unsubstantiatedClaims: string[];
}

/**
 * Calcula a taxa de substanciação de afirmações ambientais (ISO 14021 §5.7 /
 * FTC §260.2). Pure, sem DOM/LLM.
 *
 * Cada item de `claims` pode ser uma string (texto da afirmação) ou um objeto
 * `{ text }` / `{ claim }` / `{ finding }`. Itens não-textuais ou vazios são
 * ignorados (não contam para o total).
 *
 * Uma afirmação é SUBSTANCIADA se seu texto contém ≥1 marcador de
 * `SUBSTANTIATION_EVIDENCE_DEFAULT` (ou catálogo custom injetado).
 *
 * `claims` vazio/sem texto → rate=1, grade='A' (nada a substanciar é vacuamente
 * conforme; coerente com calculateReliabilityIndex que retorna 100/A sem findings).
 *
 * @param claims    afirmações extraídas do relatório
 * @param markers   catálogo de marcadores de evidência (default canônico)
 */
export function scoreClaimSubstantiation(
    claims: any,
    markers: ReadonlyArray<EvidenceMarker> = SUBSTANTIATION_EVIDENCE_DEFAULT,
): ClaimSubstantiationResult {
    const texts: string[] = [];
    if (Array.isArray(claims)) {
        for (const c of claims) {
            let t: any = c;
            if (c && typeof c === 'object') t = c.text ?? c.claim ?? c.finding ?? '';
            if (typeof t === 'string' && t.trim().length > 0) texts.push(t);
        }
    } else if (typeof claims === 'string' && claims.trim().length > 0) {
        texts.push(claims);
    }

    const total = texts.length;
    if (total === 0) {
        return { total: 0, substantiated: 0, unsubstantiated: 0, rate: 1, grade: 'A', unsubstantiatedClaims: [] };
    }

    let substantiated = 0;
    const unsubstantiatedClaims: string[] = [];
    for (const t of texts) {
        const ok = markers.some((m) => m.pattern.test(t));
        if (ok) {
            substantiated += 1;
        } else if (unsubstantiatedClaims.length < 50) {
            unsubstantiatedClaims.push(t.length > 160 ? `${t.slice(0, 157)}...` : t);
        }
    }

    const unsubstantiated = total - substantiated;
    const rate = substantiated / total;
    let grade: string;
    if (rate >= 0.9) grade = 'A';
    else if (rate >= 0.75) grade = 'B';
    else if (rate >= 0.5) grade = 'C';
    else if (rate >= 0.25) grade = 'D';
    else grade = 'F';

    return { total, substantiated, unsubstantiated, rate, grade, unsubstantiatedClaims };
}
