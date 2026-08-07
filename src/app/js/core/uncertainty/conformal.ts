// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   Uncertainty — Split Conformal Prediction (distribution-free UQ).
   FC-F10 (Calvin frontier 2026-06-02). Spec:
   docs/specs/frontier/SPEC_FCF10_CONFORMAL_PREDICTION.md (+ _PROF).

   SEGUNDO método de UQ em core/uncertainty — NÃO substitui o GUM
   (propagation.ts cobre metrologia/medição); conformal cobre as SAÍDAS
   de modelos de ML (GP de FC-05, classificação de FC-04, PINN de FC-F6)
   com garantia de cobertura SEM suposição distribucional nem de modelo,
   válida em amostra FINITA. Os dois coexistem sob o mesmo módulo (WH-1).

   Garantia (split conformal, troca/exchangeability):
       P( Y_{n+1} ∈ C(X_{n+1}) )  ≥  1 − α
   e, sob continuidade dos scores,
       P( Y_{n+1} ∈ C(X_{n+1}) )  ≤  1 − α + 1/(n+1).
   A cobertura é MARGINAL (média sobre o sorteio do conjunto de calibração).

   Algoritmo (regressão, score absoluto):
     1. Num conjunto de calibração held-out de tamanho n, computar os
        scores de não-conformidade  s_i = |y_i − ŷ_i|.
     2. Quantil conformal com correção de amostra finita:
            k = ceil( (n+1)(1−α) )      (rank, 1-based)
            q̂ = s_(k)  (k-ésimo menor score)   se k ≤ n
            q̂ = +∞                              se k > n  (n pequeno demais)
     3. Para um novo ponto com predição ŷ:  C(x) = [ ŷ − q̂ , ŷ + q̂ ].

   Classificação (score = 1 − p̂_y, "softmax" da classe verdadeira):
     mesmo q̂; o conjunto de predição é
        C(x) = { rótulo c : (1 − p̂_c) ≤ q̂ }  ⇔  { c : p̂_c ≥ 1 − q̂ }.

   Proveniência acadêmica (doutorado Poli/USP):
   - Vovk, Gammerman & Shafer 2005. Algorithmic Learning in a Random World
     (ISBN 978-0-387-00152-4) — fundação da predição conformal.
   - Lei et al. 2018. Distribution-Free Predictive Inference for Regression.
     JASA 113(523):1094-1111 (DOI 10.1080/01621459.2017.1307116) — split conformal.
   - Angelopoulos & Bates 2021. A Gentle Introduction to Conformal Prediction
     and Distribution-Free UQ (arXiv:2107.07511) — quantil 1-based + correção.

   Pure: sem DOM, sem I/O, sem mutação da entrada. Resultado frozen e
   determinístico. Entradas não-finitas são descartadas (defensivo, RNF-4).
   ================================================================ */

export interface ConformalRegressionResult {
    /** Quantil conformal q̂ (meia-largura do intervalo). +Infinity se n insuficiente. */
    readonly quantile: number;
    /** Nível nominal solicitado 1−α (clampado a (0,1)). */
    readonly nominalCoverage: number;
    /** Tamanho efetivo do conjunto de calibração (scores finitos). */
    readonly calibrationSize: number;
    /** true quando (n+1)(1−α) > n ⇒ q̂ = +∞ (calibração pequena demais). */
    readonly infiniteWidth: boolean;
}

export interface PredictionInterval {
    readonly point: number;
    readonly lower: number;
    readonly upper: number;
    /** Meia-largura = quantile (q̂). */
    readonly halfWidth: number;
}

export interface ConformalClassificationResult {
    readonly quantile: number;
    readonly nominalCoverage: number;
    readonly calibrationSize: number;
    readonly infiniteWidth: boolean;
}

/** Clampa o nível nominal 1−α ao intervalo aberto (0,1). */
function _clampCoverage(nominalCoverage: number): number {
    if (typeof nominalCoverage !== 'number' || !Number.isFinite(nominalCoverage)) return 0.9;
    if (nominalCoverage <= 0) return Number.EPSILON;
    if (nominalCoverage >= 1) return 1 - Number.EPSILON;
    return nominalCoverage;
}

/** Mantém só números finitos de um array (defensivo). */
function _finite(values: ReadonlyArray<number> | null | undefined): number[] {
    if (!Array.isArray(values)) return [];
    const out: number[] = [];
    for (const v of values) {
        if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    }
    return out;
}

/**
 * Quantil conformal de uma lista de scores de não-conformidade (≥ 0 ou não),
 * com a CORREÇÃO de amostra finita 1-based de Angelopoulos & Bates 2021:
 *   k = ceil((n+1)(1−α));  q̂ = s_(k) se k ≤ n, senão +∞.
 *
 * @param scores  scores de não-conformidade do conjunto de calibração.
 * @param nominalCoverage  nível nominal 1−α (ex.: 0.9). Clampado a (0,1).
 * @returns objeto frozen { quantile, k, calibrationSize, infiniteWidth, nominalCoverage }.
 */
export function conformalQuantile(
    scores: ReadonlyArray<number>,
    nominalCoverage: number,
): Readonly<{
    quantile: number;
    k: number;
    calibrationSize: number;
    infiniteWidth: boolean;
    nominalCoverage: number;
}> {
    const cov = _clampCoverage(nominalCoverage);
    const s = _finite(scores).sort((a, b) => a - b);
    const n = s.length;
    if (n === 0) {
        return Object.freeze({ quantile: Number.POSITIVE_INFINITY, k: 0, calibrationSize: 0, infiniteWidth: true, nominalCoverage: cov });
    }
    // rank 1-based; ceil garante cobertura ≥ 1−α
    const k = Math.ceil((n + 1) * cov);
    if (k > n) {
        return Object.freeze({ quantile: Number.POSITIVE_INFINITY, k, calibrationSize: n, infiniteWidth: true, nominalCoverage: cov });
    }
    return Object.freeze({ quantile: s[k - 1]!, k, calibrationSize: n, infiniteWidth: false, nominalCoverage: cov });
}

/**
 * Calibra um preditor de REGRESSÃO via split conformal usando o score de
 * não-conformidade absoluto s_i = |y_i − ŷ_i|. Domain-agnostic (serve o GP
 * de FC-05, o PINN de FC-F6 ou qualquer regressor).
 *
 * @param calibrationTruth  valores observados y_i do conjunto de calibração.
 * @param calibrationPred   predições ŷ_i correspondentes (mesma ordem/tamanho).
 * @param nominalCoverage   nível nominal 1−α (ex.: 0.9). Default 0.9.
 * @returns ConformalRegressionResult frozen com o quantil q̂.
 */
export function calibrateRegression(
    calibrationTruth: ReadonlyArray<number>,
    calibrationPred: ReadonlyArray<number>,
    nominalCoverage: number = 0.9,
): ConformalRegressionResult {
    const truth = Array.isArray(calibrationTruth) ? calibrationTruth : [];
    const pred = Array.isArray(calibrationPred) ? calibrationPred : [];
    const len = Math.min(truth.length, pred.length);
    const scores: number[] = [];
    for (let i = 0; i < len; i++) {
        const y = truth[i];
        const yhat = pred[i];
        if (typeof y === 'number' && Number.isFinite(y) && typeof yhat === 'number' && Number.isFinite(yhat)) {
            scores.push(Math.abs(y - yhat));
        }
    }
    const q = conformalQuantile(scores, nominalCoverage);
    return Object.freeze({
        quantile: q.quantile,
        nominalCoverage: q.nominalCoverage,
        calibrationSize: q.calibrationSize,
        infiniteWidth: q.infiniteWidth,
    });
}

/**
 * Constrói o intervalo de predição conformal C(x) = [ŷ − q̂, ŷ + q̂] para um
 * ponto novo, a partir de uma calibração já feita.
 *
 * @param pointPrediction  predição ŷ do ponto novo.
 * @param calibration  resultado de calibrateRegression.
 * @returns PredictionInterval frozen.
 */
export function predictionInterval(
    pointPrediction: number,
    calibration: ConformalRegressionResult,
): PredictionInterval {
    const yhat = typeof pointPrediction === 'number' && Number.isFinite(pointPrediction) ? pointPrediction : NaN;
    const q = calibration && typeof calibration.quantile === 'number' ? calibration.quantile : Number.POSITIVE_INFINITY;
    return Object.freeze({
        point: yhat,
        lower: yhat - q,
        upper: yhat + q,
        halfWidth: q,
    });
}

/**
 * Cobertura empírica de uma lista de intervalos sobre observações de teste —
 * a fração de vezes em que y_i ∈ [lower_i, upper_i]. Usada para VERIFICAR que
 * a cobertura empírica ≈ nível nominal (critério de sucesso FC-F10).
 *
 * @param testTruth  observações y_i do conjunto de teste.
 * @param intervals  intervalos C(x_i) correspondentes (mesma ordem).
 * @returns fração em [0,1]; NaN se não houver par válido.
 */
export function empiricalCoverage(
    testTruth: ReadonlyArray<number>,
    intervals: ReadonlyArray<{ lower: number; upper: number }>,
): number {
    if (!Array.isArray(testTruth) || !Array.isArray(intervals)) return NaN;
    const len = Math.min(testTruth.length, intervals.length);
    let covered = 0;
    let total = 0;
    for (let i = 0; i < len; i++) {
        const y = testTruth[i];
        const iv = intervals[i];
        if (typeof y !== 'number' || !Number.isFinite(y) || !iv) continue;
        const lo = iv.lower;
        const hi = iv.upper;
        if (typeof lo !== 'number' || typeof hi !== 'number') continue;
        total++;
        // +Infinity de half-width ⇒ intervalo (−∞,+∞) cobre tudo
        if (y >= lo && y <= hi) covered++;
    }
    return total === 0 ? NaN : covered / total;
}

/**
 * Calibra um classificador via split conformal com o score s_i = 1 − p̂_{y_i}
 * (1 menos a probabilidade atribuída à classe VERDADEIRA). Probabilidades fora
 * de [0,1] são clampadas; ausentes contam como p̂ = 0 (score 1).
 *
 * @param calibrationTrueLabels  rótulos verdadeiros (string|number) de calibração.
 * @param calibrationProbs  mapa rótulo→probabilidade por amostra (mesma ordem).
 * @param number>>  nível nominal 1−α. Default 0.9.
 * @returns ConformalClassificationResult frozen com o quantil q̂.
 */
export function calibrateClassification(
    calibrationTrueLabels: ReadonlyArray<string | number>,
    calibrationProbs: ReadonlyArray<Record<string | number, number>>,
    nominalCoverage: number = 0.9,
): ConformalClassificationResult {
    const labels = Array.isArray(calibrationTrueLabels) ? calibrationTrueLabels : [];
    const probs = Array.isArray(calibrationProbs) ? calibrationProbs : [];
    const len = Math.min(labels.length, probs.length);
    const scores: number[] = [];
    for (let i = 0; i < len; i++) {
        const y = labels[i];
        const dist = probs[i];
        if ((typeof y !== 'string' && typeof y !== 'number') || dist === null || typeof dist !== 'object') continue;
        const raw = (dist as Record<string | number, number>)[y as string | number];
        const p = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
        scores.push(1 - p);
    }
    const q = conformalQuantile(scores, nominalCoverage);
    return Object.freeze({
        quantile: q.quantile,
        nominalCoverage: q.nominalCoverage,
        calibrationSize: q.calibrationSize,
        infiniteWidth: q.infiniteWidth,
    });
}

/**
 * Conjunto de predição conformal para classificação:
 *   C(x) = { c : (1 − p̂_c) ≤ q̂ }  =  { c : p̂_c ≥ 1 − q̂ }.
 * Retorna os rótulos ordenados por probabilidade desc. (desempate por rótulo).
 *
 * @param pointProbs  mapa rótulo→probabilidade do ponto novo.
 * @param number>  resultado de calibrateClassification.
 * @returns array frozen de rótulos no conjunto de predição.
 */
export function predictionSet(
    pointProbs: Record<string | number, number>,
    calibration: ConformalClassificationResult,
): ReadonlyArray<string> {
    if (pointProbs === null || typeof pointProbs !== 'object') return Object.freeze([]);
    const q = calibration && typeof calibration.quantile === 'number' ? calibration.quantile : Number.POSITIVE_INFINITY;
    const entries: Array<{ label: string; p: number }> = [];
    for (const key of Object.keys(pointProbs)) {
        const raw = pointProbs[key];
        const p = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
        // s = 1 − p ≤ q̂  ⇔  p ≥ 1 − q̂. q̂=+∞ ⇒ inclui tudo.
        if (1 - p <= q) entries.push({ label: key, p });
    }
    entries.sort((a, b) => b.p - a.p || a.label.localeCompare(b.label));
    return Object.freeze(entries.map((e) => e.label));
}
