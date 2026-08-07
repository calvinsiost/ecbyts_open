// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 — USEPA RAGS Population Risk Model
   Lógica pura de avaliação de risco populacional segundo USEPA RAGS.

   Referências acadêmicas:
     - USEPA (1989, 2011) "Risk Assessment Guidance for Superfund (RAGS)
       Part A, Volume I: Human Health Evaluation Manual"
       EPA/540/1-89/002
     - USEPA (2011) "Exposure Factors Handbook"
       EPA/600/R-09/052F
     - USEPA (2009) "Risk Assessment Guidance for Superfund Volume I:
       Human Health Evaluation Manual (Part F, Supplemental Guidance for
       Inhalation Risk Assessment)"
       EPA-540-R-070-002

   Fórmulas:
     ADD  = (C × IR × EF × ED) / (BW × AT × 365)   [mg/kg-day]
     LADD = (C × IR × EF × ED) / (BW × 70 × 365)   [mg/kg-day]
     CR   = LADD × CSF                               [dimensionless]
     HQ   = ADD / RfD                                [dimensionless]
     HI   = Σ HQ_i                                   [dimensionless]
     MOE  = NOAEL / dose                             [dimensionless]

   Lógica pura — sem DOM, sem rede, sem Three.js.
   Todos os retornos são Object.freeze().
   ================================================================ */

// ----------------------------------------------------------------
// Constantes USEPA
// ----------------------------------------------------------------

/** Tempo de vida padrão USEPA para carcinógenos (anos) — RAGS Part A §6.2.1 */
const USEPA_LIFETIME_YEARS = 70;

/** Dias por ano (denominador de AT) — RAGS Part A Eq. 6-1 */
const DAYS_PER_YEAR = 365;

// ----------------------------------------------------------------
// Limites de classificação de risco de câncer (USEPA RAGS Part A §8.2)
// Faixa aceitável: 1×10⁻⁶ a 1×10⁻⁴ (risco individual de vida)
// ----------------------------------------------------------------
const CR_NEGLIGIBLE = 1e-6; // < 1 em 1.000.000 → negligível
const CR_CONCERN = 1e-4; // ≥ 1 em 10.000 → preocupação

// ----------------------------------------------------------------
// Limites de classificação de Hazard Quotient (USEPA RAGS §7.3)
// ----------------------------------------------------------------
const HQ_SAFE_UPPER = 0.1; // < 0.1 → safe
const HQ_LOW_UPPER = 1.0; // 0.1–1.0 → low concern

// ----------------------------------------------------------------
// Limite de adequacidade do MOE (EFSA Scientific Committee 2012)
// EFSA Journal 2012;10(10):2908 - MOE > 100 = adequate margin
// ----------------------------------------------------------------
const MOE_ADEQUATE_THRESHOLD = 100;

// ----------------------------------------------------------------
// Fatores de exposição padrão - USEPA adulto residente (Tabelas EFH 2011)
// ----------------------------------------------------------------

/**
 * Valores padrão de exposição para adulto (USEPA Exposure Factors Handbook 2011).
 * Utilizar como ponto de partida para populações sem dados site-específicos.
 *
 * Fonte: USEPA (2011) EPA/600/R-09/052F, Capítulos 3, 5, 6, 8 e RAGS 2011.
 */
export const DEFAULT_EXPOSURE_FACTORS: Readonly<object> = Object.freeze({
    soilIngestion: Object.freeze({
        ir: 100,
        unit: 'mg/day',
        source: 'USEPA EFH 2011 Table 5-1',
    }),
    waterIngestion: Object.freeze({
        ir: 2.0,
        unit: 'L/day',
        source: 'USEPA EFH 2011 Table 3-1',
    }),
    airInhalation: Object.freeze({
        ir: 20,
        unit: 'm3/day',
        source: 'USEPA EFH 2011 Table 6-1',
    }),
    bodyWeight: Object.freeze({
        bw: 80,
        unit: 'kg',
        source: 'USEPA EFH 2011 Table 8-1',
    }),
    exposureFrequency: Object.freeze({
        ef: 350,
        unit: 'days/year',
        source: 'USEPA RAGS 2011',
    }),
    exposureDuration: Object.freeze({
        ed: 30,
        unit: 'years',
        source: 'USEPA RAGS 2011 (industrial)',
    }),
});

// ----------------------------------------------------------------
// Validação interna de inputs positivos
// ----------------------------------------------------------------

/**
 * Verifica que todos os parâmetros fornecidos são números estritamente positivos.
 * Lança RangeError com mensagem descritiva no primeiro valor inválido.
 *
 * @param params  mapa nome → valor
 * @returns
 * @throws se qualquer valor for ≤ 0, NaN ou não-numérico
 */
function _assertPositive(params: Record<string, number>): void {
    for (const [name, value] of Object.entries(params)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            throw new RangeError(`populationRiskModel: "${name}" must be a positive finite number, got ${value}`);
        }
    }
}

// ----------------------------------------------------------------
// computeADD - Average Daily Dose (non-carcinogen)
// ----------------------------------------------------------------

/**
 * Compute Average Daily Dose (ADD) for non-carcinogens.
 * ADD = (C × IR × EF × ED) / (BW × AT × 365)
 *
 * Para não-carcinógenos: AT = ED (período de exposição = período de média).
 * Para carcinógenos com ADD: utilizar AT = 70 anos (usar computeLADD).
 *
 * Equação: USEPA RAGS Part A, Eq. 6-1 (1989/2011)
 *
 * @param params
 * @returns
 * @throws se qualquer parâmetro for ≤ 0
 */
export function computeADD({
    C,
    IR,
    EF,
    ED,
    BW,
    AT,
}: {
    C: number;
    IR: number;
    EF: number;
    ED: number;
    BW: number;
    AT: number;
}): Readonly<{ add: number; unit: string; params: Readonly<object> }> {
    _assertPositive({ C, IR, EF, ED, BW, AT });

    // ADD = (C × IR × EF × ED) / (BW × AT × 365)   [mg/kg-day]
    const add = (C * IR * EF * ED) / (BW * AT * DAYS_PER_YEAR);

    const frozenParams = Object.freeze({ C, IR, EF, ED, BW, AT });

    return Object.freeze({
        add,
        unit: 'mg/kg-day',
        params: frozenParams,
    });
}

// ----------------------------------------------------------------
// computeLADD - Lifetime Average Daily Dose (carcinogen)
// ----------------------------------------------------------------

/**
 * Compute Lifetime Average Daily Dose (LADD) for carcinogens.
 * LADD = (C × IR × EF × ED) / (BW × 70 × 365)
 *
 * O tempo de média de vida é fixado em 70 anos (padrão USEPA - RAGS Part A §6.2.1).
 * O menor ED em relação a AT=70 dilui a dose de forma correspondente.
 *
 * Equação: USEPA RAGS Part A, Eq. 6-2 (1989/2011)
 *
 * @param params
 * @returns
 * @throws se qualquer parâmetro for ≤ 0
 */
export function computeLADD({
    C,
    IR,
    EF,
    ED,
    BW,
}: {
    C: number;
    IR: number;
    EF: number;
    ED: number;
    BW: number;
}): Readonly<{ ladd: number; unit: string; params: Readonly<object> }> {
    _assertPositive({ C, IR, EF, ED, BW });

    // LADD = (C × IR × EF × ED) / (BW × 70 × 365)   [mg/kg-day]
    const ladd = (C * IR * EF * ED) / (BW * USEPA_LIFETIME_YEARS * DAYS_PER_YEAR);

    const frozenParams = Object.freeze({ C, IR, EF, ED, BW });

    return Object.freeze({
        ladd,
        unit: 'mg/kg-day',
        params: frozenParams,
    });
}

// ----------------------------------------------------------------
// computeExcessCancerRisk - Individual Lifetime Cancer Risk
// ----------------------------------------------------------------

/**
 * Compute excess individual lifetime cancer risk (CR) from LADD and cancer slope factor.
 * CR = LADD × CSF
 *
 * Classificação USEPA RAGS Part A §8.2:
 *   CR < 1×10⁻⁶  → 'negligible' (risco < 1 em 1.000.000)
 *   1×10⁻⁶ ≤ CR < 1×10⁻⁴ → 'acceptable' (faixa aceitável USEPA)
 *   CR ≥ 1×10⁻⁴  → 'concern' (requer investigação/ação)
 *
 * @param params
 * @returns
 * @throws se ladd ou csf forem ≤ 0
 */
export function computeExcessCancerRisk({
    ladd,
    csf,
}: {
    ladd: number;
    csf: number;
}): Readonly<{ cr: number; classification: string; unit: string; ladd: number; csf: number }> {
    _assertPositive({ ladd, csf });

    const cr = ladd * csf;

    let classification;
    if (cr < CR_NEGLIGIBLE) {
        classification = 'negligible';
    } else if (cr < CR_CONCERN) {
        classification = 'acceptable';
    } else {
        classification = 'concern';
    }

    return Object.freeze({
        cr,
        classification,
        unit: 'dimensionless',
        ladd,
        csf,
    });
}

// ----------------------------------------------------------------
// computeHazardQuotient - Non-carcinogen risk
// ----------------------------------------------------------------

/**
 * Compute hazard quotient (HQ) for non-carcinogens.
 * HQ = ADD / RfD
 *
 * Classificação baseada em USEPA RAGS Part A §7.3:
 *   HQ < 0.1  → 'safe'    (10× abaixo da RfD; sem preocupação)
 *   0.1 ≤ HQ < 1.0 → 'low' (baixo potencial de efeito adverso)
 *   HQ ≥ 1.0  → 'concern' (excede dose de referência; avaliação necessária)
 *
 * @param params
 * @returns
 * @throws se add ou rfd forem ≤ 0
 */
export function computeHazardQuotient({
    add,
    rfd,
}: {
    add: number;
    rfd: number;
}): Readonly<{ hq: number; classification: string; add: number; rfd: number }> {
    _assertPositive({ add, rfd });

    const hq = add / rfd;

    let classification;
    if (hq < HQ_SAFE_UPPER) {
        classification = 'safe';
    } else if (hq < HQ_LOW_UPPER) {
        classification = 'low';
    } else {
        classification = 'concern';
    }

    return Object.freeze({
        hq,
        classification,
        add,
        rfd,
    });
}

// ----------------------------------------------------------------
// computeHazardIndex - Multi-contaminant non-carcinogen risk
// ----------------------------------------------------------------

/**
 * Compute hazard index (HI) by summing individual HQs for the same endpoint organ.
 * HI = Σ HQ_i   (USEPA RAGS Part A §7.3 - additive model for same endpoint)
 *
 * Classificação:
 *   HI < 1.0  → 'safe'    (abaixo do limiar de efeito cumulativo)
 *   HI ≥ 1.0  → 'concern' (potencial de efeito adverso cumulativo)
 *
 * @param hqValues  array de HQ por substância/via (mesmo endpoint alvo)
 * @returns
 * @throws se hqValues não for array
 */
export function computeHazardIndex(
    hqValues: number[],
): Readonly<{ hi: number; classification: string; n: number }> {
    if (!Array.isArray(hqValues)) {
        throw new TypeError('computeHazardIndex: hqValues must be an array of numbers');
    }

    const n = hqValues.length;
    const hi = n === 0 ? 0 : hqValues.reduce((sum, hq) => sum + Number(hq), 0);

    const classification = hi >= HQ_LOW_UPPER ? 'concern' : 'safe';

    return Object.freeze({
        hi,
        classification,
        n,
    });
}

// ----------------------------------------------------------------
// computeMarginOfExposure - Threshold vs. observed dose
// ----------------------------------------------------------------

/**
 * Compute margin of exposure (MOE) for a substance with a NOAEL endpoint.
 * MOE = NOAEL / dose
 *
 * Critério de adequacidade: EFSA Scientific Committee 2012 (EFSA Journal 10:2908)
 *   MOE > 100  → adequate (margem suficiente para proteção da saúde)
 *   MOE ≤ 100  → inadequate (ação/revisão de gerenciamento recomendada)
 *
 * O MOE é utilizado principalmente para substâncias genotóxicas (ex.: PAHs, aflatoxinas)
 * onde não se utiliza RfD / HQ.
 *
 * @param params
 * @returns
 * @throws se dose ou noael forem ≤ 0
 */
export function computeMarginOfExposure({
    dose,
    noael,
}: {
    dose: number;
    noael: number;
}): Readonly<{ moe: number; adequate: boolean; dose: number; noael: number }> {
    _assertPositive({ dose, noael });

    const moe = noael / dose;
    const adequate = moe > MOE_ADEQUATE_THRESHOLD;

    return Object.freeze({
        moe,
        adequate,
        dose,
        noael,
    });
}
