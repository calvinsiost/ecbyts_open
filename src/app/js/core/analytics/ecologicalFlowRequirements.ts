// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Ecological Flow Requirements / Environmental Flows

/* ================================================================
   ECOLOGICAL FLOW REQUIREMENTS — Pure mathematical functions
   Requisitos de vazao ecologica baseados em metodos padrao internacionais
   ================================================================

   METODOS:
   - Tennant (1976) desktop reserve (% MAF)
   - Tesman (1999) / Richter et al. (1997) Range of Variability / IHA
   - Smakhtin (2001) regionalized Q-minimo biologico
   - Gustard et al. (1992) / Lyne & Hollick (1979) Baseflow Index BFI
   - Vogel & Kroll (1989) LP3 low-flow statistics
   - DWAF (2009) South African Desktop Reserve — harvestable yield
   - Mitsch & Gosselink (2015) wetland hydroperiod bucket model
   - Bovee (1978) PHABSIM-inspired instream flow need (HSI curves)
   - Mitsch & Gosselink (2015) Eq.2.1 wetland water budget
   - Hughes & Smakhtin (1996) IFR Desktop Reserve — ecological management class

   Referencias academicas documentadas em cada funcao.
   ================================================================ */

'use strict';

console.debug('[ecoflow:load]', 'app/js/core/analytics/ecologicalFlowRequirements.js');

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

// ================================================================
// CONSTANTES - sem numeros magicos
// ================================================================

/** Porcentagem MAF para cada classe Tennant — estacao umida */
const TENNANT_WET = Object.freeze({
    outstanding: 0.6,
    excellent: 0.4,
    good: 0.3,
    fair: 0.2,
    poor: 0.1,
    flushing: 2.0,
});

/** Porcentagem MAF para cada classe Tennant — estacao seca */
const TENNANT_DRY = Object.freeze({
    outstanding: 0.4,
    excellent: 0.3,
    good: 0.2,
    fair: 0.1,
    poor: 0.1,
    flushing: 2.0,
});

/** Fracoes Q-minimo por excedencia — Smakhtin (2001) global averages */
const SMAKHTIN_FRACTIONS = Object.freeze({ q95: 0.05, q90: 0.1, q75: 0.25 });

/** Alocacoes IFR por classe de manejo ecologico — Hughes & Smakhtin (1996) */
const IFR_EMC_FRACTIONS = Object.freeze({
    pristine: 0.75,
    slightly_modified: 0.6,
    moderately_modified: 0.45,
    heavily_modified: 0.25,
    critically_modified: 0.1,
});

/** Parametro do filtro digital de separacao de escoamento de base — Lyne & Hollick (1979) */
const BFI_ALPHA = 0.925;

/** Profundidade minima para wetland considerado inundado (m) */
const WETLAND_MIN_DEPTH_M = 0.05;

/**
 * Parametros HSI por especie alvo - Bovee (1978)
 * flow_opt: centroide de fluxo otimo [m³/s]; flow_sigma: desvio padrao do fluxo
 * temp_opt: temperatura otima [°C]; temp_sigma: desvio padrao da temperatura
 */
const INSTREAM_SPECIES = Object.freeze({
    trout: Object.freeze({ flow_opt: 2.75, flow_sigma: 2.25, temp_opt: 14.0, temp_sigma: 4.0 }),
    salmon: Object.freeze({ flow_opt: 11.0, flow_sigma: 9.0, temp_opt: 12.0, temp_sigma: 4.0 }),
    warmwater_fish: Object.freeze({ flow_opt: 1.05, flow_sigma: 0.95, temp_opt: 25.0, temp_sigma: 5.0 }),
    macroinvertebrates: Object.freeze({ flow_opt: 2.55, flow_sigma: 2.45, temp_opt: 15.0, temp_sigma: 10.0 }),
});

// ================================================================
// UTILITARIOS INTERNOS
// ================================================================

/** Valida se value eh numero finito dentro do intervalo [min, max] (inclusive). */
function validateFiniteRange(value: unknown, name: string, min: number, max?: number): void {
    if (typeof value !== 'number' || !isFinite(value)) {
        throw new RangeError(`${name} deve ser numero finito`);
    }
    if (value < min) {
        throw new RangeError(`${name} deve ser >= ${min}`);
    }
    if (max !== undefined && value > max) {
        throw new RangeError(`${name} deve ser <= ${max}`);
    }
}

/** Valida se value eh numero finito estritamente positivo. */
function validatePositiveFinite(value: unknown, name: string): void {
    if (typeof value !== 'number' || value <= 0 || !isFinite(value)) {
        throw new RangeError(`${name} deve ser numero finito positivo`);
    }
}

/** Valida se value eh numero finito nao-negativo. */
function validateNonNegativeFinite(value: unknown, name: string): void {
    if (typeof value !== 'number' || value < 0 || !isFinite(value)) {
        throw new RangeError(`${name} deve ser numero finito nao-negativo`);
    }
}

/** Valida se value eh um objeto nao-nulo. */
function validateObject(value: unknown, name: string): void {
    if (typeof value !== 'object' || value === null) {
        throw new TypeError(`${name} deve ser objeto com campos validos`);
    }
}

/**
 * Media aritmetica de um array.
 * @param {number[]} arr
 * @returns {number}
 */
function mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Desvio padrao amostral (ddof=1).
 * @param {number[]} arr
 * @param {number} [mu] - Media pre-calculada (opcional)
 * @returns {number}
 */
function stddev(arr: number[], mu?: number): number {
    if (arr.length < 2) return 0;
    const m = mu !== undefined ? mu : mean(arr);
    const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
}

/**
 * Quantil da distribuicao normal padrao via aproximacao racional (Abramowitz & Stegun 26.2.17).
 * Usado para calculo de percentis LP3.
 * @param {number} p - Probabilidade em (0, 1)
 * @returns {number} z-score correspondente
 */
function normalQuantile(p: number): number {
    if (p <= 0 || p >= 1) throw new RangeError('p deve ser em (0, 1)');
    const isLow = p < 0.5;
    const t = Math.sqrt(-2 * Math.log(isLow ? p : 1 - p));
    const c0 = 2.515517,
        c1 = 0.802853,
        c2 = 0.010328;
    const d1 = 1.432788,
        d2 = 0.189269,
        d3 = 0.001308;
    const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
    return isLow ? -z : z;
}

/**
 * Curva HSI gaussiana para fluxo ou temperatura.
 * HSI = exp(-((x - opt)^2) / (2 * sigma^2))
 * @param {number} x - Valor observado
 * @param {number} opt - Valor otimo
 * @param {number} sigma - Largura da curva
 * @returns {number} HSI em [0, 1]
 */
function gaussianHSI(x: number, opt: number, sigma: number): number {
    return Math.exp(-((x - opt) ** 2) / (2 * sigma ** 2));
}

// ================================================================
// 1. TENNANT METHOD
// Metodo Tennant (1976) de reserva ecologica via % MAF
// ================================================================

/**
 * Tennant (1976) desktop ecological reserve method.
 * Classifica o status ecologico de um curso d'agua com base no percentual do
 * escoamento medio anual (MAF) disponivel.
 *
 * Recomendacao: minimo biologico = 10% MAF; bom = 30% (umido) ou 20% (seco).
 * Vazao de flushing = 200% MAF (curta duracao).
 *
 * @param {number} meanAnnualFlowM3s - Escoamento medio anual [m³/s]
 * @param {string} month - 'wet' (out-mar) ou 'dry' (abr-set)
 * @returns {{ recommendedFlowM3s: number, minimumFlowM3s: number, flushingFlowM3s: number,
 *             ecologicalStatus: string }}
 *
 * @reference Tennant, D.L. (1976). Instream flow regimens for fish, wildlife, recreation
 *   and related environmental resources. Fisheries, 1(4):6-10.
 */
export function tennantMethod(
    meanAnnualFlowM3s: number,
    month: string,
): { recommendedFlowM3s: number; minimumFlowM3s: number; flushingFlowM3s: number; ecologicalStatus: string } {
    if (typeof meanAnnualFlowM3s !== 'number' || meanAnnualFlowM3s <= 0 || !isFinite(meanAnnualFlowM3s)) {
        throw new RangeError('meanAnnualFlowM3s deve ser numero finito positivo [m³/s]');
    }
    if (month !== 'wet' && month !== 'dry') {
        throw new RangeError("month deve ser 'wet' ou 'dry'");
    }

    const pct = month === 'wet' ? TENNANT_WET : TENNANT_DRY;
    const minimumFlowM3s = pct.poor * meanAnnualFlowM3s; // 10% MAF
    const recommendedFlowM3s = pct.good * meanAnnualFlowM3s; // 30% wet / 20% dry
    const flushingFlowM3s = pct.flushing * meanAnnualFlowM3s; // 200% MAF

    // Status baseado no fluxo recomendado como fracao do MAF
    const ratio = recommendedFlowM3s / meanAnnualFlowM3s;
    let ecologicalStatus;
    if (ratio >= pct.outstanding) {
        ecologicalStatus = 'optimal';
    } else if (ratio >= pct.good) {
        ecologicalStatus = 'good';
    } else if (ratio >= pct.fair) {
        ecologicalStatus = 'fair';
    } else {
        ecologicalStatus = 'poor';
    }

    return { recommendedFlowM3s, minimumFlowM3s, flushingFlowM3s, ecologicalStatus };
}

// ================================================================
// 2. TESMAN / IHA HYDROLOGICAL INDICES
// Indicadores de Alteracao Hidrologica (IHA) - Richter et al. (1997)
// ================================================================

/**
 * Calcula 5 Indicadores de Alteracao Hidrologica (IHA) chave.
 * Baseado em Tesman (1999) e Richter et al. (1997) Range of Variability Approach.
 *
 * IHA Group 1: Escoamentos medios mensais (12 valores)
 * IHA Group 2: Extremos de duracao minima/maxima
 * IHA Group 3: Timing de extremos anuais
 * Indice de escoamento de base: min7dia / media anual
 *
 * @param {number[]} dailyFlows - Array de escoamentos diarios [m³/s], N >= 14
 * @returns {{ meanAnnualFlow: number, min7dayAvg: number, max7dayAvg: number,
 *             basflowIndex: number, variabilityCoeff: number,
 *             dateOfAnnualMin: number, meanMonthlyFlows: number[] }}
 *
 * @reference Richter, B.D. et al. (1997). A spatial assessment of hydrologic alteration
 *   within a river network. Regulated Rivers: Research & Management, 13(4):335-348.
 * @reference Tesman, B. (1999). Ecological limits of hydrologic alteration. TNC.
 */
export function tesmanHydrologicalIndices(dailyFlows: number[]): {
    meanAnnualFlow: number;
    min7dayAvg: number;
    max7dayAvg: number;
    basflowIndex: number;
    variabilityCoeff: number;
    dateOfAnnualMin: number;
    meanMonthlyFlows: number[];
} {
    if (!Array.isArray(dailyFlows) || dailyFlows.length < 14) {
        throw new RangeError('dailyFlows deve ter pelo menos 14 valores diarios');
    }
    if (dailyFlows.some((v) => typeof v !== 'number' || v < 0 || !isFinite(v))) {
        throw new RangeError('Todos os valores de escoamento devem ser numeros finitos nao-negativos');
    }

    const n = dailyFlows.length;
    const meanAnnualFlow = mean(dailyFlows);

    // Min e max 7-day rolling average
    let min7dayAvg = Infinity;
    let max7dayAvg = -Infinity;
    let dateOfAnnualMin = 1;
    let minVal = Infinity;

    for (let i = 0; i <= n - 7; i++) {
        const window7 = dailyFlows.slice(i, i + 7);
        const avg = mean(window7);
        if (avg < min7dayAvg) {
            min7dayAvg = avg;
        }
        if (avg > max7dayAvg) {
            max7dayAvg = avg;
        }
    }

    // Dia do minimo anual 1-dia (day of year, 1-based)
    for (let i = 0; i < n; i++) {
        if ((dailyFlows[i] as number) < minVal) {
            minVal = dailyFlows[i] as number;
            dateOfAnnualMin = i + 1;
        }
    }

    // Escoamentos medios mensais - distribui os dias proporcionalmente
    // Usa meses de 30/31 dias padrao para dados sinteticos
    const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const meanMonthlyFlows = new Array(12).fill(0);
    let dayIdx = 0;
    for (let m = 0; m < 12; m++) {
        const days = Math.min(daysPerMonth[m] as number, n - dayIdx);
        if (days <= 0) {
            // Dados insuficientes - usar media anual como fallback
            meanMonthlyFlows[m] = meanAnnualFlow;
        } else {
            const slice = dailyFlows.slice(dayIdx, dayIdx + days);
            meanMonthlyFlows[m] = mean(slice);
            dayIdx += days;
        }
    }

    // Indice de escoamento de base (BFI simplificado): min7dia / media anual
    const basflowIndex = meanAnnualFlow > 0 ? min7dayAvg / meanAnnualFlow : 0;

    // Coeficiente de variabilidade
    const sd = stddev(dailyFlows, meanAnnualFlow);
    const variabilityCoeff = meanAnnualFlow > 0 ? sd / meanAnnualFlow : 0;

    return {
        meanAnnualFlow,
        min7dayAvg,
        max7dayAvg,
        basflowIndex,
        variabilityCoeff,
        dateOfAnnualMin,
        meanMonthlyFlows,
    };
}

// ================================================================
// 3. Q-MINIMO BIOLOGICO - Smakhtin (2001)
// Vazao minima biologica regionalizada com HSI
// ================================================================

/**
 * Estima vazao minima biologica usando regressoes regionalizadas globais.
 * Baseado em Smakhtin (2001) - medias globais aproximadas por probabilidade de excedencia.
 *
 * HSI = (Q_atual - Q_min) / (MAF - Q_min), limitado a [0, 1]
 *
 * @param {number} catchmentAreaKm2 - Area da bacia hidraulica [km²] (nao usado diretamente na formula, mas valida entrada)
 * @param {string} model - 'q95'|'q90'|'q75' (probabilidade de excedencia)
 * @returns {{ fraction: number, compute: (mafM3s: number, qCurrentM3s?: number) => { qMinM3s: number, hsi: number, ecologicalStatus: string } }}
 *
 * @reference Smakhtin, V.U. (2001). Low flow hydrology: a review.
 *   Journal of Hydrology, 240(3-4):147-186.
 */
export function qMinimumBiological(
    catchmentAreaKm2: number,
    model: string,
): {
    fraction: number;
    compute: (
        mafM3s: number,
        qCurrentM3s?: number,
    ) => { qMinM3s: number; hsi: number; ecologicalStatus: string };
} {
    if (typeof catchmentAreaKm2 !== 'number' || catchmentAreaKm2 <= 0 || !isFinite(catchmentAreaKm2)) {
        throw new RangeError('catchmentAreaKm2 deve ser numero finito positivo [km²]');
    }
    if (!Object.prototype.hasOwnProperty.call(SMAKHTIN_FRACTIONS, model)) {
        throw new RangeError("model deve ser 'q95', 'q90' ou 'q75'");
    }

    const fraction = (SMAKHTIN_FRACTIONS as Record<string, number>)[model] as number;

    /**
     * Calcula resultado completo dado MAF e escoamento atual.
     * @param {number} mafM3s - Escoamento medio anual [m³/s]
     * @param {number} [qCurrentM3s?] - Escoamento atual [m³/s] (opcional, default = qMin)
     * @returns {{ qMinM3s: number, hsi: number, ecologicalStatus: string }}
     */
    function compute(
        mafM3s: number,
        qCurrentM3s?: number,
    ): { qMinM3s: number; hsi: number; ecologicalStatus: string } {
        if (typeof mafM3s !== 'number' || mafM3s <= 0 || !isFinite(mafM3s)) {
            throw new RangeError('mafM3s deve ser numero finito positivo');
        }
        const qMinM3s = fraction * mafM3s;
        const qCur = qCurrentM3s !== undefined ? qCurrentM3s : qMinM3s;
        const range = mafM3s - qMinM3s;
        const hsi = range > 0 ? Math.min(1, Math.max(0, (qCur - qMinM3s) / range)) : 0;

        let ecologicalStatus;
        if (hsi > 0.8) {
            ecologicalStatus = 'optimal';
        } else if (hsi > 0.5) {
            ecologicalStatus = 'good';
        } else if (hsi > 0.2) {
            ecologicalStatus = 'fair';
        } else {
            ecologicalStatus = 'critical';
        }

        return { qMinM3s, hsi, ecologicalStatus };
    }

    return { fraction, compute };
}

// ================================================================
// 4. BASEFLOW INDEX - Gustard et al. (1992) / Lyne & Hollick (1979)
// Separacao de escoamento de base por filtro digital recursivo
// ================================================================

/**
 * Calcula o Baseflow Index (BFI) usando filtro digital recursivo de Lyne & Hollick (1979).
 *
 * Filtro: qf(t) = alpha * qf(t-1) + (1+alpha)/2 * (Q(t) - Q(t-1))
 *         qb(t) = Q(t) - qf(t),  limitado a [0, Q(t)]
 * BFI = sum(qb) / sum(Q)
 * alpha = 0.925 (Chapra & Canale; Gustard et al. 1992)
 *
 * @param {number[]} dailyFlows - Array de escoamentos diarios [m³/s]
 * @returns {{ bfi: number, meanBaseflowM3s: number, meanStormflowM3s: number,
 *             separatedFlows: Array<{Q: number, quickflow: number, baseflow: number}> }}
 *
 * @reference Gustard, A., Bullock, A. & Dixon, J.M. (1992). Low flow estimation in the
 *   United Kingdom. IH Report No. 108. Institute of Hydrology.
 * @reference Lyne, V.D. & Hollick, M. (1979). Stochastic time-variable rainfall-runoff
 *   modelling. Hydrology and Water Resources Symposium, Perth.
 */
export function baseflowIndex(dailyFlows: number[]): {
    bfi: number;
    meanBaseflowM3s: number;
    meanStormflowM3s: number;
    separatedFlows: Array<{ Q: number; quickflow: number; baseflow: number }>;
} {
    if (!Array.isArray(dailyFlows) || dailyFlows.length < 2) {
        throw new RangeError('dailyFlows deve ter pelo menos 2 valores');
    }
    if (dailyFlows.some((v) => typeof v !== 'number' || v < 0 || !isFinite(v))) {
        throw new RangeError('Todos os valores de escoamento devem ser numeros finitos nao-negativos');
    }

    const n = dailyFlows.length;
    const alpha = BFI_ALPHA;
    const separatedFlows = new Array(n);

    // Inicializacao: primeiro valor de quickflow = 0
    let qfPrev = 0;
    let sumQ = 0;
    let sumQb = 0;

    for (let i = 0; i < n; i++) {
        const Q = dailyFlows[i] as number;
        let qf;
        if (i === 0) {
            qf = 0;
        } else {
            qf = alpha * qfPrev + ((1 + alpha) / 2) * ((dailyFlows[i] as number) - (dailyFlows[i - 1] as number));
        }
        // Quickflow nao pode ser negativo nem maior que Q
        qf = Math.min(Math.max(qf, 0), Q);
        const qb = Math.min(Math.max(Q - qf, 0), Q);

        separatedFlows[i] = { Q, quickflow: qf, baseflow: qb };
        sumQ += Q;
        sumQb += qb;
        qfPrev = qf;
    }

    const bfi = sumQ > 0 ? sumQb / sumQ : 0;
    const meanBaseflowM3s = sumQb / n;
    const meanStormflowM3s = (sumQ - sumQb) / n;

    return { bfi, meanBaseflowM3s, meanStormflowM3s, separatedFlows };
}

// ================================================================
// 5. LOW FLOW STATISTICS - Vogel & Kroll (1989) LP3
// Estatisticas de vazao minima por ajuste Log-Pearson III
// ================================================================

/**
 * Ajusta distribuicao Log-Pearson III a minimos anuais para estimativa de baixas vazoes.
 * Usa aproximacao de Wilson-Hilferty para quantis da Pearson III.
 *
 * ln(Q) ~ Pearson III(mean, std, skew)
 * z_p = [(1 - k²/6 + k*z_norm/6)³ - 1] * 6/k   (Wilson-Hilferty)
 * Q_p = exp(mean + std * z_p)
 *
 * @param {number[]} annualMinima - Array de minimos anuais (ex: medias 7-dia anuais) [m³/s]
 * @returns {{ Q2_m3s: number, Q10_m3s: number, meanLogQ: number, stdLogQ: number,
 *             skewLogQ: number, nYears: number }}
 *
 * @reference Vogel, R.M. & Kroll, C.N. (1989). Low-flow frequency analysis using
 *   probability-plot correlation coefficients. Journal of Water Resources Planning
 *   and Management, 115(3):338-357.
 */
export function lowFlowStatistics(annualMinima: number[]): {
    Q2_m3s: number;
    Q10_m3s: number;
    meanLogQ: number;
    stdLogQ: number;
    skewLogQ: number;
    nYears: number;
} {
    if (!Array.isArray(annualMinima) || annualMinima.length < 3) {
        throw new RangeError('annualMinima deve ter pelo menos 3 anos de dados');
    }
    if (annualMinima.some((v) => typeof v !== 'number' || v <= 0 || !isFinite(v))) {
        throw new RangeError('Todos os minimos anuais devem ser numeros finitos positivos');
    }

    const nYears = annualMinima.length;
    const logQ = annualMinima.map((q) => Math.log(q));
    const meanLogQ = mean(logQ);
    const stdLogQ = stddev(logQ, meanLogQ);

    // Assimetria amostral (skewness, Fisher g1)
    const skewLogQ =
        nYears < 3
            ? 0
            : (logQ.reduce((s, v) => s + (v - meanLogQ) ** 3, 0) * nYears) /
              ((nYears - 1) * (nYears - 2) * stdLogQ ** 3);

    /**
     * Wilson-Hilferty approximation for Pearson III quantile.
     * Para baixas excedencias (minimos): usamos complemento.
     * Q2 = mediana (p=0.50 exceedance = 2-yr return period para maximos).
     * Para minimos: Q2 = 50th percentile; Q10 = 10th percentile (90% exceedance).
     */
    /** @param {number} p */
    function wilsonHilferty(p: number): number {
        const k = skewLogQ;
        const z = normalQuantile(p);
        let zP;
        if (Math.abs(k) < 1e-6) {
            // Normal aproximacao
            zP = z;
        } else {
            const term = 1 - k ** 2 / 6 + (k * z) / 6;
            zP = ((Math.sign(term) * Math.abs(term) ** 3 - 1) * 6) / k;
        }
        const logQp = meanLogQ + stdLogQ * zP;
        return Math.exp(logQp);
    }

    // Q2: periodo de retorno 2 anos = 50% exceedance (mediana da distribuicao)
    const Q2_m3s = wilsonHilferty(0.5);
    // Q10: periodo de retorno 10 anos para baixas vazoes = 10% exceedance (percentil 10)
    const Q10_m3s = wilsonHilferty(0.1);

    return { Q2_m3s, Q10_m3s, meanLogQ, stdLogQ, skewLogQ, nYears };
}

// ================================================================
// 6. HARVESTABLE WATER YIELD - DWAF (2009) Desktop Reserve
// Rendimento hidrico disponivel para uso apos reserva ambiental
// ================================================================

/**
 * Calcula o rendimento hidrico colhivel apos deducao da reserva ambiental.
 * Baseado no metodo Desktop Reserve da DWAF (2009) - Africa do Sul.
 *
 * totalRunoff = area * precip * runoffCoeff
 * envFlow = totalRunoff * envFlowPct / 100
 * harvestable = totalRunoff * (1 - envFlowPct/100)
 *
 * @param {number} catchmentAreaKm2 - Area da bacia [km²]
 * @param {number} annualPrecipMm - Precipitacao media anual [mm/ano]
 * @param {number} runoffCoeff - Coeficiente de escoamento superficial [0-1]
 * @param {number} baseflowFraction - Fracao do escoamento como escoamento de base [0-1]
 * @param {number} envFlowPct - Porcentagem de reserva ambiental [%] (tipico 10-30%)
 * @returns {{ totalRunoffM3yr: number, envFlowM3yr: number, harvestableM3yr: number,
 *             harvestableMmYr: number }}
 *
 * @reference Department of Water Affairs and Forestry (DWAF) (2009). Resource Directed
 *   Measures for Protection of Water Resources. Desktop Reserve. South Africa.
 */
export function harvestableWaterYield(
    catchmentAreaKm2: number,
    annualPrecipMm: number,
    runoffCoeff: number,
    baseflowFraction: number,
    envFlowPct: number,
): { totalRunoffM3yr: number; envFlowM3yr: number; harvestableM3yr: number; harvestableMmYr: number } {
    validatePositiveFinite(catchmentAreaKm2, 'catchmentAreaKm2');
    validateNonNegativeFinite(annualPrecipMm, 'annualPrecipMm');
    validateFiniteRange(runoffCoeff, 'runoffCoeff', 0, 1);
    validateFiniteRange(baseflowFraction, 'baseflowFraction', 0, 1);
    validateFiniteRange(envFlowPct, 'envFlowPct', 0, 100);

    // area km² * 1e6 m²/km² * precip m * runoffCoeff = volume m³/ano
    const totalRunoffM3yr = catchmentAreaKm2 * 1e6 * (annualPrecipMm / 1000) * runoffCoeff;
    const envFlowM3yr = totalRunoffM3yr * (envFlowPct / 100);
    const harvestableM3yr = totalRunoffM3yr * (1 - envFlowPct / 100);
    // Converte de volta para mm/ano: volume / area
    const harvestableMmYr = (harvestableM3yr / (catchmentAreaKm2 * 1e6)) * 1000;

    return { totalRunoffM3yr, envFlowM3yr, harvestableM3yr, harvestableMmYr };
}

// ================================================================
// 7. WETLAND HYDROPERIOD - Mitsch & Gosselink (2015)
// Modelo bucket de hidroporiodo de zonas umidas
// ================================================================

/**
 * Calcula hidroperiodo de zona umida usando modelo de balde simples (bucket).
 * Baseado em Mitsch & Gosselink (2015) - Wetlands, 5th ed.
 *
 * No estado estacionario: V_ss = influx / outflowRate * V_max
 * Hidroperiodo = fracao do ano com profundidade > 0.05 m
 *
 * @param {number} inflowM3d - Escoamento de entrada [m³/dia]
 * @param {number} outflowRate - Taxa de saida [dia⁻¹] (fracao do volume que sai por dia)
 * @param {number} areaM2 - Area da zona umida [m²]
 * @param {number} maxDepthM - Profundidade maxima [m]
 * @returns {{ steadyStateVolumeM3: number, steadyStateDepthM: number,
 *             hydroperiodFraction: number, wetlandType: string }}
 *
 * @reference Mitsch, W.J. & Gosselink, J.G. (2015). Wetlands, 5th edition.
 *   John Wiley & Sons, New Jersey.
 */
export function wetlandHydroperiod(
    inflowM3d: number,
    outflowRate: number,
    areaM2: number,
    maxDepthM: number,
): { steadyStateVolumeM3: number; steadyStateDepthM: number; hydroperiodFraction: number; wetlandType: string } {
    validateNonNegativeFinite(inflowM3d, 'inflowM3d');
    validatePositiveFinite(outflowRate, 'outflowRate');
    validatePositiveFinite(areaM2, 'areaM2');
    validatePositiveFinite(maxDepthM, 'maxDepthM');

    const vMax = areaM2 * maxDepthM;
    // Estado estacionario: dV/dt = 0 → inflow = outflowRate * V_ss → V_ss = inflow / outflowRate
    const steadyStateVolumeM3 = Math.min(inflowM3d / outflowRate, vMax);
    const steadyStateDepthM = steadyStateVolumeM3 / areaM2;

    // Hidroperiodo: fracao do ano com lamina d'agua > 0.05 m
    let hydroperiodFraction;
    if (steadyStateDepthM > WETLAND_MIN_DEPTH_M) {
        // Zona permanentemente inundada em estado estacionario
        hydroperiodFraction = 1.0;
    } else {
        // Estimativa simples: proporcao do volume anual em relacao a capacidade
        hydroperiodFraction = Math.min(1.0, (inflowM3d * 365) / vMax);
    }

    const wetlandType = classifyWetlandType(hydroperiodFraction);

    return { steadyStateVolumeM3, steadyStateDepthM, hydroperiodFraction, wetlandType };
}

/** Classifica tipo de zona umida pela fracao de hidroperiodo. */
function classifyWetlandType(hydroperiodFraction: number): string {
    if (hydroperiodFraction > 0.9) return 'permanent';
    if (hydroperiodFraction > 0.5) return 'seasonal';
    if (hydroperiodFraction > 0.1) return 'temporary';
    return 'ephemeral';
}

// ================================================================
// 8. INSTREAM FLOW NEED - Bovee (1978) PHABSIM HSI
// Necessidade de vazao intracanal por especie alvo
// ================================================================

/**
 * Calcula necessidade de vazao intracanal por habitat suitability index (HSI).
 * Inspirado no metodo PHABSIM de Bovee (1978).
 *
 * HSI_flow = exp(-((Q - Q_opt)² / (2σ²_Q)))  curva gaussiana
 * HSI_temp = exp(-((T - T_opt)² / (2σ²_T)))  curva gaussiana
 * combinedHSI = sqrt(HSI_flow × HSI_temp)    media geometrica
 *
 * @param {string} targetSpecies - 'trout'|'salmon'|'warmwater_fish'|'macroinvertebrates'
 * @param {number} flowRangeM3s - Escoamento atual [m³/s]
 * @param {number} temperature_C - Temperatura da agua [°C]
 * @returns {{ HSI_flow: number, HSI_temp: number, combinedHSI: number, habitatQuality: string }}
 *
 * @reference Bovee, K.D. (1978). Probability of use criteria for the family Salmonidae.
 *   IFIP Report No. 4. US Fish & Wildlife Service.
 */
export function inStreamFlowNeed(
    targetSpecies: string,
    flowRangeM3s: number,
    temperature_C: number,
): { HSI_flow: number; HSI_temp: number; combinedHSI: number; habitatQuality: string } {
    if (!Object.prototype.hasOwnProperty.call(INSTREAM_SPECIES, targetSpecies)) {
        throw new RangeError("targetSpecies deve ser 'trout', 'salmon', 'warmwater_fish' ou 'macroinvertebrates'");
    }
    if (typeof flowRangeM3s !== 'number' || flowRangeM3s < 0 || !isFinite(flowRangeM3s)) {
        throw new RangeError('flowRangeM3s deve ser numero finito nao-negativo [m³/s]');
    }
    if (typeof temperature_C !== 'number' || !isFinite(temperature_C)) {
        throw new RangeError('temperature_C deve ser numero finito [°C]');
    }

    const sp = (
        INSTREAM_SPECIES as Record<
            string,
            { flow_opt: number; flow_sigma: number; temp_opt: number; temp_sigma: number }
        >
    )[targetSpecies] as { flow_opt: number; flow_sigma: number; temp_opt: number; temp_sigma: number };
    const HSI_flow = gaussianHSI(flowRangeM3s, sp.flow_opt, sp.flow_sigma);
    const HSI_temp = gaussianHSI(temperature_C, sp.temp_opt, sp.temp_sigma);
    const combinedHSI = Math.sqrt(HSI_flow * HSI_temp);

    let habitatQuality;
    if (combinedHSI > 0.8) {
        habitatQuality = 'excellent';
    } else if (combinedHSI > 0.6) {
        habitatQuality = 'good';
    } else if (combinedHSI > 0.4) {
        habitatQuality = 'moderate';
    } else {
        habitatQuality = 'poor';
    }

    return { HSI_flow, HSI_temp, combinedHSI, habitatQuality };
}

// ================================================================
// 9. WETLAND WATER BUDGET - Mitsch & Gosselink (2015) Eq.2.1
// Balanco hidrico completo de zona umida
// ================================================================

/**
 * Calcula balanco hidrico completo de zona umida.
 * Mitsch & Gosselink (2015) Equacao 2.1: dS/dt = entradas - saidas
 *
 * netChange = sum(inputs) - sum(outputs)
 * WY = surfaceOutflow / (precipitation + surfaceInflow)
 *
 * @param {{ precipitation_m3: number, surfaceInflow_m3: number,
 *            groundwaterIn_m3: number, tidalIn_m3: number }} inputs - Entradas [m³]
 * @param {{ evapotranspiration_m3: number, surfaceOutflow_m3: number,
 *            groundwaterOut_m3: number, tidalOut_m3: number }} outputs - Saidas [m³]
 * @param {number} initialStorageM3 - Armazenamento inicial [m³]
 * @returns {{ totalInputs: number, totalOutputs: number, netChangeM3: number,
 *             finalStorageM3: number, waterYieldCoeff: number,
 *             balance: 'surplus'|'deficit'|'balanced' }}
 *
 * @reference Mitsch, W.J. & Gosselink, J.G. (2015). Wetlands, 5th edition.
 *   John Wiley & Sons, New Jersey. Equation 2.1.
 */
export function wetlandWaterBudget(
    inputs: {
        precipitation_m3?: number;
        surfaceInflow_m3?: number;
        groundwaterIn_m3?: number;
        tidalIn_m3?: number;
    },
    outputs: {
        evapotranspiration_m3?: number;
        surfaceOutflow_m3?: number;
        groundwaterOut_m3?: number;
        tidalOut_m3?: number;
    },
    initialStorageM3: number,
): {
    totalInputs: number;
    totalOutputs: number;
    netChangeM3: number;
    finalStorageM3: number;
    waterYieldCoeff: number;
    balance: 'surplus' | 'deficit' | 'balanced';
} {
    validateObject(inputs, 'inputs');
    validateObject(outputs, 'outputs');
    validateNonNegativeFinite(initialStorageM3, 'initialStorageM3');

    const { precipitation_m3 = 0, surfaceInflow_m3 = 0, groundwaterIn_m3 = 0, tidalIn_m3 = 0 } = inputs as Record<string, number>;
    const { evapotranspiration_m3 = 0, surfaceOutflow_m3 = 0, groundwaterOut_m3 = 0, tidalOut_m3 = 0 } = outputs as Record<string, number>;

    const totalInputs = precipitation_m3 + surfaceInflow_m3 + groundwaterIn_m3 + tidalIn_m3;
    const totalOutputs = evapotranspiration_m3 + surfaceOutflow_m3 + groundwaterOut_m3 + tidalOut_m3;
    const netChangeM3 = totalInputs - totalOutputs;
    const finalStorageM3 = initialStorageM3 + netChangeM3;

    // Coeficiente de rendimento hidrico
    const denomWY = precipitation_m3 + surfaceInflow_m3;
    const waterYieldCoeff = denomWY > 0 ? surfaceOutflow_m3 / denomWY : 0;

    const balance = classifyWaterBalance(netChangeM3, totalInputs, totalOutputs);

    return { totalInputs, totalOutputs, netChangeM3, finalStorageM3, waterYieldCoeff, balance };
}

/** Classifica balanco hidrico em surplus/deficit/balanced com limiar dinamico. */
function classifyWaterBalance(netChangeM3: number, totalInputs: number, totalOutputs: number): 'surplus' | 'deficit' | 'balanced' {
    const threshold = 1e-6 * (Math.abs(totalInputs) + Math.abs(totalOutputs) + 1);
    if (netChangeM3 > threshold) return 'surplus';
    if (netChangeM3 < -threshold) return 'deficit';
    return 'balanced';
}

// ================================================================
// 10. IFR DESKTOP RESERVE - Hughes & Smakhtin (1996) South Africa
// Classe de manejo ecologico e alocacao de reserva ambiental
// ================================================================

/**
 * Calcula reserva ambiental por classe de manejo ecologico (EMC).
 * Baseado no metodo IFR Desktop de Hughes & Smakhtin (1996) - Africa do Sul.
 *
 * Alocacao: pristine=75%, slightly=60%, moderately=45%, heavily=25%, critically=10%
 *
 * @param {number} meanAnnualRunoffM3yr - Escoamento medio anual [m³/ano]
 * @param {string} catchmentType - 'pristine'|'slightly_modified'|'moderately_modified'|'heavily_modified'|'critically_modified'
 * @param {number} demandM3yr - Demanda total de agua [m³/ano]
 * @returns {{ envFlowM3yr: number, availableForUseM3yr: number, demandFulfilled: boolean,
 *             deficitM3yr: number, emc: string, reservePercent: number }}
 *
 * @reference Hughes, D.A. & Smakhtin, V.U. (1996). Daily flow time series patching or
 *   extension: a spatial interpolation approach based on flow duration curves.
 *   Hydrological Sciences Journal, 41(6):851-871.
 */
export function ifrDesktopReserve(
    meanAnnualRunoffM3yr: number,
    catchmentType: string,
    demandM3yr: number,
): {
    envFlowM3yr: number;
    availableForUseM3yr: number;
    demandFulfilled: boolean;
    deficitM3yr: number;
    emc: string;
    reservePercent: number;
} {
    if (typeof meanAnnualRunoffM3yr !== 'number' || meanAnnualRunoffM3yr < 0 || !isFinite(meanAnnualRunoffM3yr)) {
        throw new RangeError('meanAnnualRunoffM3yr deve ser numero finito nao-negativo');
    }
    if (!Object.prototype.hasOwnProperty.call(IFR_EMC_FRACTIONS, catchmentType)) {
        throw new RangeError(
            "catchmentType deve ser 'pristine', 'slightly_modified', 'moderately_modified', 'heavily_modified' ou 'critically_modified'",
        );
    }
    if (typeof demandM3yr !== 'number' || demandM3yr < 0 || !isFinite(demandM3yr)) {
        throw new RangeError('demandM3yr deve ser numero finito nao-negativo');
    }

    const fraction = (IFR_EMC_FRACTIONS as Record<string, number>)[catchmentType] as number;
    const envFlowM3yr = meanAnnualRunoffM3yr * fraction;
    const availableForUseM3yr = meanAnnualRunoffM3yr - envFlowM3yr;
    const demandFulfilled = demandM3yr <= availableForUseM3yr;
    const deficitM3yr = Math.max(0, demandM3yr - availableForUseM3yr);
    const reservePercent = fraction * 100;

    return {
        envFlowM3yr,
        availableForUseM3yr,
        demandFulfilled,
        deficitM3yr,
        emc: catchmentType,
        reservePercent,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecologicalFlowRequirementsMeta: AnalyticsModuleMeta = {
    name: 'ecologicalFlowRequirements',
    description: 'ecologicalFlowRequirements',
    category: 'analytics',
    familyTags: ['ecosystem'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
