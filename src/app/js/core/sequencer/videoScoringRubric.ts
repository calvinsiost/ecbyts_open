// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   VIDEO SCORING RUBRIC — SPEC_VIDEO_FINAL_SCORING_RUBRIC

   Pure helpers para rubric 4-LLM consensus gate:
   - 20 critérios (C1-C20): 10 técnica-narrativa + 10 Canva-polish
   - Gate dura: cada C_i ≥ 4.9 por LLM → PASS; qualquer < 4.9 → REJECT
   - Consensus: 4 LLMs × 20 critérios = 80 notas mínimas
   - Rubric anti-gaming: 5.0 exige zero nits; 4.9 exige nit declarado

   Sem dependência de CLI/shell — entrada é array de scores,
   saída é veredito PASS/REJECT + rationale.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Rubric §C1-C20
// ──────────────────────────────────────────────────────────────────────

export const CRITERIA_TECHNICAL = Object.freeze([
    { id: 'C1', name: 'Fidelidade visual ao produto', weight: 1.0 },
    { id: 'C2', name: 'Narrativa coerente', weight: 1.0 },
    { id: 'C3', name: 'Audio quality (narração)', weight: 1.0 },
    { id: 'C4', name: 'Caption legibilidade', weight: 1.0 },
    { id: 'C5', name: 'DataStudio data visível', weight: 1.0 },
    { id: 'C6', name: 'Presentation Mode hero beat', weight: 1.0 },
    { id: 'C7', name: 'CTA claro', weight: 1.0 },
    { id: 'C8', name: 'Sem defeitos UI', weight: 1.0 },
    { id: 'C9', name: 'Formato 9:16', weight: 1.0 },
    { id: 'C10', name: 'Audiência técnica', weight: 1.0 },
]);

export const CRITERIA_CANVA = Object.freeze([
    { id: 'C11', name: 'Typography hierarchy', weight: 1.0 },
    { id: 'C12', name: 'Color harmony & branding', weight: 1.0 },
    { id: 'C13', name: 'Sound design', weight: 1.0 },
    { id: 'C14', name: 'Micro-interactions', weight: 1.0 },
    { id: 'C15', name: 'Composition rules', weight: 1.0 },
    { id: 'C16', name: 'Pacing variation', weight: 1.0 },
    { id: 'C17', name: 'Motion variety', weight: 1.0 },
    { id: 'C18', name: 'Brand integration', weight: 1.0 },
    { id: 'C19', name: 'Energy level', weight: 1.0 },
    { id: 'C20', name: 'Kinetic typography', weight: 1.0 },
]);

export const ALL_CRITERIA = Object.freeze([...CRITERIA_TECHNICAL, ...CRITERIA_CANVA]);

export const CRITERIA_IDS = Object.freeze(ALL_CRITERIA.map((c) => c.id));

export const APPROVED_LLMS = Object.freeze(['claude', 'codex', 'gemini', 'kimi']);

export const MIN_SCORE = 1.0;
export const MAX_SCORE = 5.0;
export const GATE_THRESHOLD = 4.9; // Calvin hard rule

export const TIMEOUT_PER_LLM_MS = 10 * 60_000; // 10 min

export const SCORE_MEANINGS: Readonly<Record<string, string>> = Object.freeze({
    '5.0': 'Impecável, publicável imediato',
    4.9: 'Quase perfeito, 1 nit trivial que não afeta mensagem',
    4.5: 'Bom mas com 1-2 defeitos visíveis',
    '4.0': 'Aceitável internamente mas não para público',
    '3.0': 'Funcional mas dealbreaker de UX/polish',
    '2.0': 'Broken em algum beat',
    '1.0': 'Inutilizável',
});

// ──────────────────────────────────────────────────────────────────────
// Score validators
// ──────────────────────────────────────────────────────────────────────

export function isValidScore(score: unknown): boolean {
    const n = Number(score);
    return Number.isFinite(n) && n >= MIN_SCORE && n <= MAX_SCORE;
}

export function isValidCriterionId(id: string): boolean {
    return typeof id === 'string' && CRITERIA_IDS.includes(id);
}

export function isApprovedLlm(llm: string): boolean {
    return typeof llm === 'string' && APPROVED_LLMS.includes(llm.toLowerCase());
}

/**
 * Valida scorecard: 20 críérios, cada um score válido.
 *
 * @param scorecard - { C1: 4.9, C2: 5.0, ... }
 */
export function validateScorecard(
    scorecard: Record<string, unknown> | null | undefined,
): { valid: boolean; errors: string[]; completeness: number } {
    const errors: string[] = [];
    if (!scorecard || typeof scorecard !== 'object') {
        return { valid: false, errors: ['not object'], completeness: 0 };
    }
    let scored = 0;
    for (const id of CRITERIA_IDS) {
        const v = (scorecard as Record<string, unknown>)[id];
        if (v === undefined || v === null) {
            errors.push(`${id} missing`);
            continue;
        }
        if (!isValidScore(v)) {
            errors.push(`${id} invalid score (${String(v)})`);
            continue;
        }
        scored++;
    }
    return {
        valid: errors.length === 0,
        errors,
        completeness: scored / CRITERIA_IDS.length,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Gate evaluation §Anti-gaming
// ──────────────────────────────────────────────────────────────────────

interface ScorecardEvaluation {
    verdict: 'PASS' | 'REJECT';
    failed: string[];
    passed: string[];
    minScore: number;
    avgScore: number;
    total: number;
    errors?: string[];
}

/**
 * Avalia scorecard contra gate threshold. Retorna PASS/REJECT por critério.
 */
export function evaluateScorecard(
    scorecard: Record<string, unknown> | null | undefined,
): ScorecardEvaluation {
    const validation = validateScorecard(scorecard);
    const safeCard = (scorecard || {}) as Record<string, unknown>;
    if (!validation.valid) {
        return {
            verdict: 'REJECT',
            failed: CRITERIA_IDS.filter((id) => !isValidScore(safeCard[id])),
            passed: [],
            minScore: 0,
            avgScore: 0,
            total: 0,
            errors: validation.errors,
        };
    }
    const failed: string[] = [];
    const passed: string[] = [];
    let minScore = MAX_SCORE;
    let total = 0;

    for (const id of CRITERIA_IDS) {
        const v = Number(safeCard[id]);
        total += v;
        if (v < minScore) minScore = v;
        if (v >= GATE_THRESHOLD) passed.push(id);
        else failed.push(id);
    }

    const avgScore = total / CRITERIA_IDS.length;
    const verdict: 'PASS' | 'REJECT' = failed.length === 0 ? 'PASS' : 'REJECT';

    return { verdict, failed, passed, minScore, avgScore, total };
}

// ──────────────────────────────────────────────────────────────────────
// Consensus across LLMs §Dispatch protocol
// ──────────────────────────────────────────────────────────────────────

interface ConsensusReview {
    llm?: string;
    scorecard?: Record<string, unknown> | null | undefined;
    nits?: Array<{ criterion: string; nit: string }>;
    timedOut?: boolean;
}

interface ConsensusResult {
    verdict: 'PASS' | 'REJECT';
    pass: string[];
    reject: string[];
    timedOut: string[];
    perLlm: Record<string, ScorecardEvaluation | { verdict: 'REJECT'; reason: string }>;
    reason: string;
}

interface PerLlmAccumulator {
    pass: string[];
    reject: string[];
    timedOut: string[];
    perLlm: Record<string, ScorecardEvaluation | { verdict: 'REJECT'; reason: string }>;
}

/**
 * Process a single review, updating the consensus accumulator.
 *
 * @param {PerLlmAccumulator} acc
 * @param {ConsensusReview} review
 * @returns {PerLlmAccumulator}
 */
function accumulateReview(acc: PerLlmAccumulator, review: ConsensusReview): PerLlmAccumulator {
    const llm = typeof review?.llm === 'string' ? review.llm.toLowerCase() : 'unknown';
    if (review?.timedOut) {
        acc.timedOut.push(llm);
        acc.perLlm[llm] = { verdict: 'REJECT', reason: 'timeout' };
        return acc;
    }
    const eval_ = evaluateScorecard(review?.scorecard);
    acc.perLlm[llm] = eval_;
    if (eval_.verdict === 'PASS') acc.pass.push(llm);
    else acc.reject.push(llm);
    return acc;
}

/**
 * Determine consensus reason from verdict and counters.
 *
 * @param {'PASS'|'REJECT'} verdict
 * @param {number} timedOutCount
 * @param {number} rejectCount
 * @returns {string}
 */
function consensusReason(verdict: 'PASS' | 'REJECT', timedOutCount: number, rejectCount: number): string {
    if (verdict === 'PASS') return 'all_llms_passed';
    if (timedOutCount > 0) return 'llm_timeout';
    if (rejectCount > 0) return 'llm_rejected';
    return 'insufficient_reviews';
}

/**
 * Avalia consensus entre múltiplos LLMs. PASS quando TODOS aprovam.
 */
export function evaluateConsensus(reviews: ConsensusReview[]): ConsensusResult {
    if (!Array.isArray(reviews) || reviews.length === 0) {
        return { verdict: 'REJECT', pass: [], reject: [], timedOut: [], perLlm: {}, reason: 'no_reviews' };
    }
    const acc = reviews.reduce<PerLlmAccumulator>(
        (memo, r) => accumulateReview(memo, r),
        { pass: [], reject: [], timedOut: [], perLlm: {} },
    );

    const verdict: 'PASS' | 'REJECT' =
        acc.reject.length === 0 && acc.timedOut.length === 0 && acc.pass.length >= APPROVED_LLMS.length ? 'PASS' : 'REJECT';

    return {
        verdict,
        pass: acc.pass,
        reject: acc.reject,
        timedOut: acc.timedOut,
        perLlm: acc.perLlm,
        reason: consensusReason(verdict, acc.timedOut.length, acc.reject.length),
    };
}

// ──────────────────────────────────────────────────────────────────────
// Nit declaration §Anti-gaming: 4.9 exige nit
// ──────────────────────────────────────────────────────────────────────

interface AntiGamingViolation {
    criterion: string;
    type: string;
}

/**
 * Group nits by criterion id.
 *
 * @param {Array<{ criterion: string; nit: string }>} nits
 * @returns {Record<string, string[]>}
 */
function groupNitsByCriterion(nits: Array<{ criterion: string; nit: string }>): Record<string, string[]> {
    const nitsByCriterion: Record<string, string[]> = {};
    for (const n of nits) {
        if (!n?.criterion) continue;
        const list = nitsByCriterion[n.criterion] ?? (nitsByCriterion[n.criterion] = []);
        list.push(n.nit);
    }
    return nitsByCriterion;
}

/**
 * Detect anti-gaming violations for a single criterion.
 *
 * @param {string} id
 * @param {number} score
 * @param {boolean} hasNit
 * @returns {AntiGamingViolation|null}
 */
function antiGamingViolation(id: string, score: number, hasNit: boolean): AntiGamingViolation | null {
    if (score === MAX_SCORE && hasNit) return { criterion: id, type: '5.0_with_nit' };
    if (score >= 4.9 && score < MAX_SCORE && !hasNit) return { criterion: id, type: '4.9_without_nit' };
    return null;
}

/**
 * Valida anti-gaming: scorecard com 5.0 NÃO pode listar nits;
 * scorecard com 4.9 DEVE listar pelo menos 1 nit.
 */
export function validateAntiGaming(
    scorecard: Record<string, unknown> | null | undefined,
    nits: Array<{ criterion: string; nit: string }> = [],
): { valid: boolean; violations: AntiGamingViolation[] } {
    const violations: AntiGamingViolation[] = [];
    if (!scorecard || typeof scorecard !== 'object') return { valid: true, violations };
    const safeCard = scorecard as Record<string, unknown>;
    const nitsByCriterion = Array.isArray(nits) ? groupNitsByCriterion(nits) : {};
    for (const id of CRITERIA_IDS) {
        const score = Number(safeCard[id]);
        if (!Number.isFinite(score)) continue;
        const hasNit = Boolean(nitsByCriterion[id]?.length);
        const violation = antiGamingViolation(id, score, hasNit);
        if (violation) violations.push(violation);
    }
    return { valid: violations.length === 0, violations };
}

// ──────────────────────────────────────────────────────────────────────
// Score meaning interpreter
// ──────────────────────────────────────────────────────────────────────

/**
 * Interpreta score numérico → string de significado.
 */
export function interpretScore(score: unknown): string {
    const n = Number(score);
    if (!Number.isFinite(n)) return 'invalid';
    if (n >= 5.0) return SCORE_MEANINGS['5.0'] || '';
    if (n >= 4.9) return SCORE_MEANINGS['4.9'] || '';
    if (n >= 4.5) return SCORE_MEANINGS['4.5'] || '';
    if (n >= 4.0) return SCORE_MEANINGS['4.0'] || '';
    if (n >= 3.0) return SCORE_MEANINGS['3.0'] || '';
    if (n >= 2.0) return SCORE_MEANINGS['2.0'] || '';
    return SCORE_MEANINGS['1.0'] || '';
}

// ──────────────────────────────────────────────────────────────────────
// Result record builder
// ──────────────────────────────────────────────────────────────────────

interface ScoringRecordInput {
    llm?: string;
    scorecard?: Record<string, unknown> | null | undefined;
    nits?: Array<{ criterion: string; nit: string }>;
    timedOut?: boolean;
    videoVersion?: string;
}

/**
 * Constrói registro de resultado para persistência em JSON file.
 */
export function buildScoringRecord(
    input: ScoringRecordInput | null | undefined,
    nowMs?: number,
): Record<string, unknown> | null {
    if (!input || typeof input !== 'object') return null;
    const ts = nowMs ? new Date(nowMs).toISOString() : new Date().toISOString();
    const evaluation = evaluateScorecard(input.scorecard);
    const antiGaming = validateAntiGaming(input.scorecard, input.nits);
    return {
        llm: typeof input.llm === 'string' ? input.llm.toLowerCase() : null,
        video_version: input.videoVersion || null,
        scorecard: input.scorecard || {},
        nits: Array.isArray(input.nits) ? input.nits : [],
        verdict: evaluation.verdict,
        failed_criteria: evaluation.failed,
        avg_score: evaluation.avgScore,
        min_score: evaluation.minScore,
        anti_gaming_valid: antiGaming.valid,
        anti_gaming_violations: antiGaming.violations,
        timed_out: Boolean(input.timedOut),
        timestamp: ts,
    };
}
