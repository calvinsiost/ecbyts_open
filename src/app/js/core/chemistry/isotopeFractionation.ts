// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   ISOTOPE FRACTIONATION — Compound-Specific Isotope Analysis (CSIA)
   Fracionamento isotopico para verificacao de atenuacao natural (MNA)

   Implementa:
   - Equacao de Rayleigh para delta 13C / delta 2H
   - Ajuste de fator de enriquecimento epsilon por regressao
   - AKIE (Apparent Kinetic Isotope Effect)
   - Mistura de end-members isotopicos
   - Estimativa de extensao de degradacao via Rayleigh inverso
   - Linha de campo dual-isotope (diagrama delta-delta)
   - Tabela de fatores de enriquecimento da literatura

   Este modulo e puro: sem DOM, sem IDB, sem Three.js.

   Referencias academicas:
   - Mariotti, A. et al. (1981). Experimental determination of nitrogen
     kinetic isotope fractionation. Geochim. Cosmochim. Acta 45:1068-1075.
     DOI: 10.1016/0016-7037(81)90129-0
   - Meckenstock, R.U. et al. (2004). Compound-specific isotope analysis
     of contaminant degradation. Crit. Rev. Environ. Sci. Technol.
     34(5):353-411. DOI: 10.1080/10643380490432300
   - Elsner, M. et al. (2005). Quantification of isotope fractionation in
     groundwater investigations. Environ. Sci. Technol. 39(18):6896-6916.
     DOI: 10.1021/es0504465
   - Hunkeler, D. et al. (2008). A Guide for Assessing Biodegradation and
     Source Identification of Organic Ground Water Contaminants using
     Compound Specific Isotope Analysis (CSIA).
     USEPA EPA 600/R-08/116.
   ================================================================ */

// ---------------------------------------------------------------
// LITERATURE ENRICHMENT FACTORS TABLE
// Tabela de fatores de enriquecimento (epsilon) medios da literatura
// para compostos organicos clorados e aromaticos comuns.
// Fonte: Meckenstock et al. (2004), Hunkeler et al. (2008)
// Unidades: per mil (‰). Valores negativos = fracionamento normal.
// ---------------------------------------------------------------

interface EnrichmentFactor {
    epsilon: number;
    uncertainty: number;
    compound: string;
    pathway: string;
    isotope: string;
}

/**
 * Fatores de enriquecimento isotopico de referencia para CSIA ambiental.
 * Epsilon negativo indica fracionamento normal (produto enriquece em isot. leve).
 * Incerteza = 1 desvio padrao da literatura consolidada.
 *
 * @type {Readonly<Object>}
 */
export const ISOTOPE_ENRICHMENT_FACTORS: Readonly<Record<string, Readonly<EnrichmentFactor>>> = Object.freeze({
    TCE_aerobic_13C: Object.freeze({
        epsilon: -1.5,
        uncertainty: 0.5,
        compound: 'TCE',
        pathway: 'aerobic',
        isotope: '13C',
    }),
    TCE_reductive_13C: Object.freeze({
        epsilon: -14,
        uncertainty: 3,
        compound: 'TCE',
        pathway: 'reductive',
        isotope: '13C',
    }),
    PCE_reductive_13C: Object.freeze({
        epsilon: -5.5,
        uncertainty: 1.5,
        compound: 'PCE',
        pathway: 'reductive',
        isotope: '13C',
    }),
    VC_reductive_13C: Object.freeze({
        epsilon: -22,
        uncertainty: 4,
        compound: 'VC',
        pathway: 'reductive',
        isotope: '13C',
    }),
    benzene_aerobic_13C: Object.freeze({
        epsilon: -1.8,
        uncertainty: 0.5,
        compound: 'benzene',
        pathway: 'aerobic',
        isotope: '13C',
    }),
    toluene_aerobic_13C: Object.freeze({
        epsilon: -1.9,
        uncertainty: 0.3,
        compound: 'toluene',
        pathway: 'aerobic',
        isotope: '13C',
    }),
    TCE_reductive_2H: Object.freeze({
        epsilon: -93,
        uncertainty: 20,
        compound: 'TCE',
        pathway: 'reductive',
        isotope: '2H',
    }),
    VC_reductive_2H: Object.freeze({
        epsilon: -120,
        uncertainty: 25,
        compound: 'VC',
        pathway: 'reductive',
        isotope: '2H',
    }),
    benzene_aerobic_2H: Object.freeze({
        epsilon: -29,
        uncertainty: 8,
        compound: 'benzene',
        pathway: 'aerobic',
        isotope: '2H',
    }),
    toluene_aerobic_2H: Object.freeze({
        epsilon: -35,
        uncertainty: 10,
        compound: 'toluene',
        pathway: 'aerobic',
        isotope: '2H',
    }),
});

// ---------------------------------------------------------------
// EXPECTED DUAL-ISOTOPE SLOPES (Lambda) POR MECANISMO DE DEGRADACAO
// Referencia: Elsner et al. (2005) Tabela 2 e Figura 3.
// Lambda = Delta(delta-2H) / Delta(delta-13C) = epsilon_2H / epsilon_13C
// ---------------------------------------------------------------

interface LambdaRange {
    lambda_min: number;
    lambda_max: number;
    description: string;
}

/**
 * Faixas de slope lambda esperadas no diagrama delta-delta por mecanismo.
 * Lambda = epsilon_2H / epsilon_13C (adimensional, razao de fracionamentos).
 * Elsner et al. (2005) Environ. Sci. Technol. 39(18):6896-6916.
 *
 * @type {any}
 */
export const DUAL_ISOTOPE_LAMBDA_RANGES: Readonly<Record<string, Readonly<LambdaRange>>> = Object.freeze({
    aerobic: Object.freeze({ lambda_min: 2, lambda_max: 4, description: 'aerobic biodegradation' }),
    anaerobic: Object.freeze({ lambda_min: 5, lambda_max: 20, description: 'anaerobic biodegradation' }),
    abiotic: Object.freeze({ lambda_min: 1, lambda_max: 2, description: 'abiotic transformation' }),
});

// ---------------------------------------------------------------
// HELPER - regressao linear simples com forcagem na origem
// Regressao sem intercepto: y = b*x, minimiza sum((y - b*x)^2)
// Solucao analitica: b = sum(x*y) / sum(x*x)
// ---------------------------------------------------------------

/**
 * Regressao linear sem intercepto (forced through origin).
 * Calcula slope b em y = b*x, soma de quadrados dos residuos, R^2.
 * @param {number[]} xArr - Variavel independente
 * @param {number[]} yArr - Variavel dependente
 * @returns {{ slope: number, r2: number, n: number }}
 */
function _forcedOriginRegression(xArr: number[], yArr: number[]): { slope: number; r2: number; n: number } {
    const n = xArr.length;
    let sumXY = 0,
        sumXX = 0,
        sumYY = 0,
        sumY = 0;
    for (let i = 0; i < n; i++) {
        const xi = xArr[i] ?? 0;
        const yi = yArr[i] ?? 0;
        sumXY += xi * yi;
        sumXX += xi * xi;
        sumYY += yi * yi;
        sumY += yi;
    }
    void sumYY;
    const slope = sumXY / sumXX;
    const yMean = sumY / n;
    let ssTot = 0,
        ssRes = 0;
    for (let i = 0; i < n; i++) {
        const xi = xArr[i] ?? 0;
        const yi = yArr[i] ?? 0;
        const pred = slope * xi;
        ssTot += (yi - yMean) ** 2;
        ssRes += (yi - pred) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
    return { slope, r2, n };
}

// ---------------------------------------------------------------
// HELPER - regressao linear simples (com intercepto)
// Calcula slope, intercepto e R^2.
// ---------------------------------------------------------------

/**
 * Regressao linear simples com intercepto.
 * y = a + b*x
 * @param {number[]} xArr - Variavel independente
 * @param {number[]} yArr - Variavel dependente
 * @returns {{ slope: number, intercept: number, r2: number, n: number }}
 */
function _linearRegression(
    xArr: number[],
    yArr: number[],
): { slope: number; intercept: number; r2: number; n: number } {
    const n = xArr.length;
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const xi = xArr[i] ?? 0;
        const yi = yArr[i] ?? 0;
        sumX += xi;
        sumY += yi;
        sumXY += xi * yi;
        sumX2 += xi * xi;
    }
    const xMean = sumX / n;
    const yMean = sumY / n;
    const denom = sumX2 - n * xMean * xMean;
    const slope = denom !== 0 ? (sumXY - n * xMean * yMean) / denom : 0;
    const intercept = yMean - slope * xMean;
    let ssTot = 0,
        ssRes = 0;
    for (let i = 0; i < n; i++) {
        const xi = xArr[i] ?? 0;
        const yi = yArr[i] ?? 0;
        const pred = intercept + slope * xi;
        ssTot += (yi - yMean) ** 2;
        ssRes += (yi - pred) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
    return { slope, intercept, r2, n };
}

// ---------------------------------------------------------------
// 1. computeRayleighFractionation
// Calcula perfil de delta isotopico ao longo da degradacao.
// Equacao de Rayleigh: Mariotti et al. (1981), Eq. 2
// ---------------------------------------------------------------

/**
 * Calcula a evolucao do valor delta isotopico ao longo da degradacao
 * usando a equacao de Rayleigh (Mariotti et al., 1981).
 *
 * Forma exata:   delta_t = (delta_0 + 1000) * f^(alpha - 1) - 1000
 *                onde alpha = 1 + epsilon/1000
 * Forma linear:  delta_t ≈ delta_0 + epsilon * ln(f)   (aprox. para |epsilon| << 1000)
 *
 * @param {{ delta0: number, epsilon_permil: number, fValues: number[] }} params
 * @returns {Readonly<{ delta: number[], f: number[], delta0: number,
 *   epsilon_permil: number, method: string }>}
 * @throws {TypeError} se parametros forem invalidos ou fValues vazio
 */
export function computeRayleighFractionation({
    delta0,
    epsilon_permil,
    fValues,
}: {
    delta0: number;
    epsilon_permil: number;
    fValues: number[];
}): Readonly<{ delta: number[]; f: number[]; delta0: number; epsilon_permil: number; method: string }> {
    if (!Number.isFinite(delta0)) throw new TypeError('delta0 must be a finite number');
    if (!Number.isFinite(epsilon_permil)) throw new TypeError('epsilon_permil must be a finite number');
    if (!Array.isArray(fValues) || fValues.length === 0) {
        throw new TypeError('fValues must be a non-empty array');
    }
    for (const f of fValues) {
        if (!Number.isFinite(f) || f < 0) {
            throw new TypeError('Each f value must be a finite non-negative number');
        }
    }

    const alpha = 1 + epsilon_permil / 1000;
    const delta = fValues.map((f) => {
        if (f === 0) {
            // Limite matematico: substrato quasi-esgotado.
            return (delta0 + 1000) * Math.pow(1e-15, alpha - 1) - 1000;
        }
        // Equacao de Rayleigh exata (Mariotti et al., 1981, Eq. 2)
        return (delta0 + 1000) * Math.pow(f, alpha - 1) - 1000;
    });

    return Object.freeze({
        delta: Object.freeze(delta) as unknown as number[],
        f: Object.freeze([...fValues]) as unknown as number[],
        delta0,
        epsilon_permil,
        method: 'rayleigh',
    });
}

// ---------------------------------------------------------------
// 2. fitRayleighFromData
// Ajusta epsilon a partir de dados observados (f, delta).
// Dois metodos: linearizacao simples e linearizacao logaritmica.
// ---------------------------------------------------------------

/**
 * Estima o fator de enriquecimento epsilon a partir de dados observados.
 * Usa dois metodos complementares (Elsner et al., 2005):
 *
 * @param {number[]} fData     - fracao restante C(t)/C(0) para cada observacao
 * @param {number[]} deltaData - valor isotopico observado (‰) para cada f
 * @returns {Readonly<{ epsilon_linear: number, epsilon_log: number,
 *   r2_linear: number, r2_log: number, n: number, method: string }>}
 * @throws {TypeError} se arrays forem invalidos ou incompativeis
 */
export function fitRayleighFromData(
    fData: number[],
    deltaData: number[],
): Readonly<{
    epsilon_linear: number;
    epsilon_log: number;
    r2_linear: number;
    r2_log: number;
    n: number;
    method: string;
}> {
    if (!Array.isArray(fData) || !Array.isArray(deltaData)) {
        throw new TypeError('fData and deltaData must be arrays');
    }
    if (fData.length !== deltaData.length) {
        throw new TypeError('fData and deltaData must have the same length');
    }
    if (fData.length < 2) {
        throw new TypeError('At least 2 data points are required for regression');
    }
    for (let i = 0; i < fData.length; i++) {
        const fi = fData[i];
        const di = deltaData[i];
        if (fi === undefined || !Number.isFinite(fi) || fi <= 0) {
            throw new TypeError(`fData[${i}] must be a finite positive number`);
        }
        if (di === undefined || !Number.isFinite(di)) {
            throw new TypeError(`deltaData[${i}] must be a finite number`);
        }
    }

    // Usa o primeiro ponto com maior f (menos degradado) como referencia delta_0
    const maxFIdx = fData.reduce((best, f, i) => (f > (fData[best] ?? -Infinity) ? i : best), 0);
    const delta0 = deltaData[maxFIdx] ?? 0;

    // Metodo linear: regressao de (delta_t - delta_0) sobre ln(f), sem intercepto
    const lnF = fData.map((f) => Math.log(f));
    const yLinear = deltaData.map((d) => d - delta0);
    const resLinear = _forcedOriginRegression(lnF, yLinear);

    // Metodo log: regressao de ln((delta_t+1000)/(delta_0+1000)) sobre ln(f), sem intercepto
    const yLog = deltaData.map((d) => Math.log((d + 1000) / (delta0 + 1000)));
    const resLog = _forcedOriginRegression(lnF, yLog);

    return Object.freeze({
        epsilon_linear: resLinear.slope, // ‰
        epsilon_log: resLog.slope * 1000, // converte de alpha-1 para ‰
        r2_linear: resLinear.r2,
        r2_log: resLog.r2,
        n: fData.length,
        method: 'rayleigh-fit',
    });
}

// ---------------------------------------------------------------
// 3. computeAKIE
// Apparent Kinetic Isotope Effect a partir de epsilon_bulk e n.
// Elsner et al. (2005) Eq. 3.
// ---------------------------------------------------------------

/**
 * Calcula o AKIE (Apparent Kinetic Isotope Effect) a partir do
 * fator de enriquecimento bulk e do numero de posicoes reativas.
 *
 * AKIE = 1 / (1 + epsilon_bulk/1000)^n     (Elsner et al., 2005, Eq. 3)
 *
 * @param {{ epsilon_bulk: number, n: number, isotope: string }} params
 * @returns {Readonly<{ AKIE: number, epsilon_bulk: number, n: number,
 *   isotope: string, interpretation: string }>}
 * @throws {TypeError} se parametros forem invalidos
 * @throws {RangeError} se n for zero ou negativo
 */
export function computeAKIE({
    epsilon_bulk,
    n,
    isotope,
}: {
    epsilon_bulk: number;
    n: number;
    isotope: string;
}): Readonly<{ AKIE: number; epsilon_bulk: number; n: number; isotope: string; interpretation: string }> {
    if (!Number.isFinite(epsilon_bulk)) throw new TypeError('epsilon_bulk must be a finite number');
    if (!Number.isFinite(n)) throw new TypeError('n must be a finite number');
    if (n <= 0) throw new RangeError('n (reactive positions) must be > 0');
    if (typeof isotope !== 'string' || !isotope) {
        throw new TypeError('isotope must be a non-empty string (e.g. "13C", "2H", "37Cl")');
    }

    // alpha = 1 + epsilon/1000 = fractionation factor
    // AKIE = 1 / alpha^n = (1 + epsilon/1000)^(-n)
    const alpha = 1 + epsilon_bulk / 1000;
    const AKIE = Math.pow(alpha, -n);

    // Limiar de primary KIE depende do isótopo (Elsner et al., 2005)
    let primaryThreshold = 1.01; // default 13C / 37Cl
    if (isotope === '2H' || isotope === 'D') primaryThreshold = 1.05;

    const interpretation = AKIE >= primaryThreshold ? 'primary' : 'secondary';

    return Object.freeze({
        AKIE,
        epsilon_bulk,
        n,
        isotope,
        interpretation,
    });
}

// ---------------------------------------------------------------
// 4. computeIsotopicMixing
// Mistura de dois end-members isotopicos (modelo linear).
// Hunkeler et al. (2008), Secao 3.3.
// ---------------------------------------------------------------

/**
 * Calcula valores isotopicos e concentracoes de uma mistura de dois
 * end-members (Hunkeler et al., 2008, Secao 3.3).
 *
 * delta_mix = f * delta_1 + (1-f) * delta_2
 * C_mix     = f * C_1    + (1-f) * C_2
 *
 * @param {{ delta1: number, C1: number, delta2: number, C2: number }} endMembers
 * @param {number[]} fractions - array de f ∈ [0, 1] (fracao do end-member 1)
 * @returns {Readonly<{ delta_mix: number[], C_mix: number[], fractions: number[] }>}
 * @throws {TypeError} se parametros forem invalidos
 */
export function computeIsotopicMixing(
    {
        delta1,
        C1,
        delta2,
        C2,
    }: {
        delta1: number;
        C1: number;
        delta2: number;
        C2: number;
    },
    fractions: number[],
): Readonly<{ delta_mix: number[]; C_mix: number[]; fractions: number[] }> {
    if (!Number.isFinite(delta1)) throw new TypeError('delta1 must be a finite number');
    if (!Number.isFinite(delta2)) throw new TypeError('delta2 must be a finite number');
    if (!Number.isFinite(C1) || C1 < 0) throw new TypeError('C1 must be a finite non-negative number');
    if (!Number.isFinite(C2) || C2 < 0) throw new TypeError('C2 must be a finite non-negative number');
    if (!Array.isArray(fractions) || fractions.length === 0) {
        throw new TypeError('fractions must be a non-empty array');
    }
    for (const f of fractions) {
        if (!Number.isFinite(f) || f < 0 || f > 1) {
            throw new TypeError('Each fraction must be a finite number in [0, 1]');
        }
    }

    const delta_mix = fractions.map((f) => f * delta1 + (1 - f) * delta2);
    const C_mix = fractions.map((f) => f * C1 + (1 - f) * C2);

    return Object.freeze({
        delta_mix: Object.freeze(delta_mix) as unknown as number[],
        C_mix: Object.freeze(C_mix) as unknown as number[],
        fractions: Object.freeze([...fractions]) as unknown as number[],
    });
}

// ---------------------------------------------------------------
// 5. estimateDegradationExtent
// Estima fracao de degradacao a partir de delta observado.
// Inversao da equacao de Rayleigh (Elsner et al., 2005).
// ---------------------------------------------------------------

/**
 * Estima a extensao de degradacao (fracao restante f) a partir de
 * um valor isotopico observado, usando a inversao da equacao de Rayleigh.
 *
 * @param {{ delta_source: number, delta_sample: number, epsilon_permil: number }} params
 * @returns {Readonly<{ f: number, degradationFraction: number,
 *   delta_source: number, delta_sample: number,
 *   epsilon_permil: number, method: string }>}
 * @throws {TypeError} se parametros forem invalidos
 * @throws {RangeError} se epsilon_permil for zero
 */
export function estimateDegradationExtent({
    delta_source,
    delta_sample,
    epsilon_permil,
}: {
    delta_source: number;
    delta_sample: number;
    epsilon_permil: number;
}): Readonly<{
    f: number;
    degradationFraction: number;
    delta_source: number;
    delta_sample: number;
    epsilon_permil: number;
    method: string;
}> {
    if (!Number.isFinite(delta_source)) throw new TypeError('delta_source must be a finite number');
    if (!Number.isFinite(delta_sample)) throw new TypeError('delta_sample must be a finite number');
    if (!Number.isFinite(epsilon_permil)) throw new TypeError('epsilon_permil must be a finite number');
    if (epsilon_permil === 0) throw new RangeError('epsilon_permil must not be zero');

    // Inversao exata da equacao de Rayleigh
    const f = Math.pow((delta_sample + 1000) / (delta_source + 1000), 1000 / epsilon_permil);

    return Object.freeze({
        f: Math.max(0, Math.min(1, f)), // clamp [0,1] por estabilidade numerica
        degradationFraction: Math.max(0, Math.min(1, 1 - f)),
        delta_source,
        delta_sample,
        epsilon_permil,
        method: 'rayleigh-inverse',
    });
}

// ---------------------------------------------------------------
// 6. computeDualIsotopeTrend
// Slope lambda no diagrama delta-13C vs delta-2H.
// Elsner et al. (2005) Figura 3 e Tabela 2.
// ---------------------------------------------------------------

/**
 * Calcula o slope lambda (linha de campo) no diagrama dual-isotope
 * (delta-2H vs delta-13C) e compara com mecanismos de degradacao.
 *
 * Lambda_teorico = epsilon_2H / epsilon_13C  (Elsner et al., 2005)
 *
 * @param {number[]} data13C     - valores observados de delta-13C (‰)
 * @param {number[]} data2H      - valores observados de delta-2H (‰)
 * @param {number}   epsilon13C  - fator de enriquecimento para 13C (‰)
 * @param {number}   epsilon2H   - fator de enriquecimento para 2H (‰)
 * @returns {Readonly<{ slope_theoretical: number, slope_observed: number,
 *   intercept_observed: number, r2: number, n: number,
 *   mechanism_likelihood: string, method: string }>}
 * @throws {TypeError} se parametros forem invalidos
 * @throws {RangeError} se epsilon13C for zero ou arrays tiverem <2 pontos
 */
export function computeDualIsotopeTrend(
    data13C: number[],
    data2H: number[],
    epsilon13C: number,
    epsilon2H: number,
): Readonly<{
    slope_theoretical: number;
    slope_observed: number;
    intercept_observed: number;
    r2: number;
    n: number;
    mechanism_likelihood: string;
    method: string;
}> {
    if (!Array.isArray(data13C) || !Array.isArray(data2H)) {
        throw new TypeError('data13C and data2H must be arrays');
    }
    if (data13C.length !== data2H.length) {
        throw new TypeError('data13C and data2H must have the same length');
    }
    if (data13C.length < 2) {
        throw new RangeError('At least 2 data points are required');
    }
    if (!Number.isFinite(epsilon13C)) throw new TypeError('epsilon13C must be a finite number');
    if (!Number.isFinite(epsilon2H)) throw new TypeError('epsilon2H must be a finite number');
    if (epsilon13C === 0) throw new RangeError('epsilon13C must not be zero');

    for (let i = 0; i < data13C.length; i++) {
        const a = data13C[i];
        const b = data2H[i];
        if (a === undefined || !Number.isFinite(a)) throw new TypeError(`data13C[${i}] must be finite`);
        if (b === undefined || !Number.isFinite(b)) throw new TypeError(`data2H[${i}] must be finite`);
    }

    // Slope teorico (razao dos fatores de enriquecimento)
    const slope_theoretical = epsilon2H / epsilon13C;

    // Regressao linear dos dados observados: delta-2H = a + b * delta-13C
    const reg = _linearRegression(data13C, data2H);

    // Classifica mecanismo mais provavel com base no slope observado
    let mechanism_likelihood = 'undetermined';
    const lambda = reg.slope;
    const abiotic = DUAL_ISOTOPE_LAMBDA_RANGES.abiotic;
    const aerobic = DUAL_ISOTOPE_LAMBDA_RANGES.aerobic;
    const anaerobic = DUAL_ISOTOPE_LAMBDA_RANGES.anaerobic;
    if (abiotic && lambda >= abiotic.lambda_min && lambda <= abiotic.lambda_max) {
        mechanism_likelihood = 'abiotic';
    } else if (aerobic && lambda >= aerobic.lambda_min && lambda <= aerobic.lambda_max) {
        mechanism_likelihood = 'aerobic';
    } else if (anaerobic && lambda >= anaerobic.lambda_min && lambda <= anaerobic.lambda_max) {
        mechanism_likelihood = 'anaerobic';
    } else if (anaerobic && lambda > anaerobic.lambda_max) {
        mechanism_likelihood = 'strongly_anaerobic';
    }

    return Object.freeze({
        slope_theoretical,
        slope_observed: reg.slope,
        intercept_observed: reg.intercept,
        r2: reg.r2,
        n: reg.n,
        mechanism_likelihood,
        method: 'dual-isotope-trend',
    });
}
