// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
//   [HAKANSON] Hakanson, L. (1980). An ecological risk index for aquatic pollution control -
//              a sedimentological approach. Water Research 14(8):975-1001.
//              DOI:10.1016/0043-1354(80)90143-8
//   [NEMEROW]  Nemerow, N.L. (1974). Scientific Stream Pollution Analysis.
//              Scripta Book Co., Washington DC. ISBN:978-0-8900-5101-2
//   [WRI016]   Hakanson (1980) in Water Resources Research - DOI:10.1029/WR016i004p00701
//              (companion note on hydrochemical contamination factors)
//   [HORTON]   Horton, R.K. (1965). An index number system for rating water quality.
//              J. Water Pollut. Control Fed. 37:300-306.

'use strict';

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

/**
 * Groundwater Contamination Index - pure-logic analytics module.
 *
 * Implementa indices quantitativos de contaminacao de agua subterranea baseados
 * em metodos consagrados da literatura hidrologica e ambiental.
 *
 * Zero dependencias de DOM, IDB, Three.js, fetch - roda em Node.js puro.
 *
 * Funcoes exportadas:
 *   1. computeContaminationFactor   - CF = measured / background (Hakanson 1980)
 *   2. computePollutionIndex        - PI = media dos CF_i (indice medio)
 *   3. computeNemerowIndex          - NI = sqrt((PI^2 + CF_max^2) / 2) (Nemerow 1974)
 *   4. classifyGroundwaterQuality   - classificacao NI em 5 categorias
 */

// ============================================================
// PRIVATE HELPERS
// ============================================================

/**
 * Valida que um valor e um numero finito positivo (> 0) ou >= 0.
 * @param v - Valor a validar
 * @param name - Nome do parametro (para mensagem de erro)
 * @param strictPositive - Se true, exige v > 0
 */
function _assertFiniteNonNegative(v: number, name: string, strictPositive: boolean = false): void {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got: ${v}`);
    }
    if (strictPositive && v <= 0) {
        throw new RangeError(`${name} must be > 0, got: ${v}`);
    }
    if (!strictPositive && v < 0) {
        throw new RangeError(`${name} must be >= 0, got: ${v}`);
    }
}

// ============================================================
// 1. CONTAMINATION FACTOR (CF) - Hakanson (1980)
// ============================================================

/**
 * Calcula o fator de contaminacao (CF) de um poluente na agua subterranea.
 *
 * CF = C_measured / C_background
 *
 * Onde C_background e a concentracao de referencia (pre-contaminacao ou geoquimica
 * natural) e C_measured e a concentracao observada no ponto amostrado.
 * Valores CF > 1 indicam contribuicao antropica. CF = 1 indica condicoes naturais.
 *
 * @param measured - Concentracao medida no ponto amostrado (qualquer unidade consistente), > 0
 * @param background - Concentracao de referencia / background geoquimico, > 0
 * @reference Hakanson 1980 Water Research 14:975. DOI:10.1016/0043-1354(80)90143-8
 */
export function computeContaminationFactor(
    measured: number,
    background: number,
): Readonly<{ CF: number; ratio_class: 'background' | 'low' | 'moderate' | 'high' | 'very_high' }> {
    _assertFiniteNonNegative(measured, 'measured', true);
    _assertFiniteNonNegative(background, 'background', true);

    const CF = measured / background;

    // Classificacao qualitativa baseada em Hakanson (1980) e pratica regulatoria
    let ratio_class: 'background' | 'low' | 'moderate' | 'high' | 'very_high';
    if (CF <= 1.0) ratio_class = 'background';
    else if (CF <= 3.0) ratio_class = 'low';
    else if (CF <= 6.0) ratio_class = 'moderate';
    else if (CF <= 9.0) ratio_class = 'high';
    else ratio_class = 'very_high';

    return Object.freeze({ CF, ratio_class });
}

// ============================================================
// 2. POLLUTION INDEX (PI) - media dos CF_i
// ============================================================

/**
 * Calcula o Indice de Poluicao (PI) como media aritmetica dos fatores de
 * contaminacao de multiplos poluentes no mesmo ponto amostrado.
 *
 * PI = (1/n) * sum(CF_i)
 *
 * Representa o nivel medio de contaminacao de um aquifero levando em conta
 * todos os poluentes avaliados. Usado como entrada para indices compostos.
 *
 * @param CFs - Array de fatores CF para cada poluente, todos > 0
 * @reference Hakanson 1980 Water Research 14:975; Horton 1965 J. WPCF 37:300
 */
export function computePollutionIndex(
    CFs: number[],
): Readonly<{ PI: number; n: number; CF_min: number; CF_max: number }> {
    if (!Array.isArray(CFs) || CFs.length === 0) {
        throw new TypeError('CFs must be a non-empty array');
    }
    for (let i = 0; i < CFs.length; i++) {
        _assertFiniteNonNegative(CFs[i]!, `CFs[${i}]`, true);
    }

    const n = CFs.length;
    let sum = 0;
    let CF_min = Infinity;
    let CF_max = -Infinity;

    for (const cf of CFs) {
        sum += cf;
        if (cf < CF_min) CF_min = cf;
        if (cf > CF_max) CF_max = cf;
    }

    const PI = sum / n;

    return Object.freeze({ PI, n, CF_min, CF_max });
}

// ============================================================
// 3. NEMEROW INDEX (NI) - Nemerow (1974)
// ============================================================

/**
 * Calcula o Indice de Nemerow (NI) para avaliacao integrada da qualidade
 * da agua subterranea, incorporando o valor maximo do CF para enfatizar
 * o poluente mais critico.
 *
 * NI = sqrt((PI^2 + CF_max^2) / 2)
 *
 * O metodo de Nemerow penaliza a presenca de um poluente altamente elevado,
 * mesmo quando a media geral e moderada. Amplamente utilizado em avaliacao
 * de qualidade de agua subterranea na China e America do Sul.
 *
 * @param CFs - Array de fatores CF para cada poluente, todos > 0
 * @param CF_max - Maximo CF entre todos os poluentes (deve ser >= max(CFs)), > 0
 * @reference Nemerow 1974 Scientific Stream Pollution Analysis
 */
export function computeNemerowIndex(
    CFs: number[],
    CF_max: number,
): Readonly<{ NI: number; PI: number; CF_max: number }> {
    if (!Array.isArray(CFs) || CFs.length === 0) {
        throw new TypeError('CFs must be a non-empty array');
    }
    for (let i = 0; i < CFs.length; i++) {
        _assertFiniteNonNegative(CFs[i]!, `CFs[${i}]`, true);
    }
    _assertFiniteNonNegative(CF_max, 'CF_max', true);

    const { PI } = computePollutionIndex(CFs);
    const NI = Math.sqrt((PI * PI + CF_max * CF_max) / 2);

    return Object.freeze({ NI, PI, CF_max });
}

// ============================================================
// 4. GROUNDWATER QUALITY CLASSIFICATION - baseada em NI
// ============================================================

/**
 * Classifica a qualidade da agua subterranea a partir do Indice de Nemerow (NI).
 *
 * Categorias:
 *   NI < 1   → 'clean'      - agua de qualidade natural, sem influencia antropica
 *   NI < 2   → 'slightly'   - levemente contaminada, uso com monitoramento
 *   NI < 3   → 'moderately' - moderadamente contaminada, restricoes de uso
 *   NI < 5   → 'heavily'    - fortemente contaminada, requer remediacao
 *   NI >= 5  → 'extremely'  - extremamente contaminada, risco sanitario grave
 *
 * @param NI - Indice de Nemerow calculado por computeNemerowIndex, >= 0
 * @reference Nemerow 1974; adaptado por Li et al. (2018) Sci. Total Environ. 630:900-910.
 *            DOI:10.1016/j.scitotenv.2018.02.262
 */
export function classifyGroundwaterQuality(
    NI: number,
): Readonly<{
    quality: 'clean' | 'slightly' | 'moderately' | 'heavily' | 'extremely';
    NI: number;
    action_required: boolean;
}> {
    _assertFiniteNonNegative(NI, 'NI');

    let quality: 'clean' | 'slightly' | 'moderately' | 'heavily' | 'extremely';
    if (NI < 1) quality = 'clean';
    else if (NI < 2) quality = 'slightly';
    else if (NI < 3) quality = 'moderately';
    else if (NI < 5) quality = 'heavily';
    else quality = 'extremely';

    const action_required = NI >= 2;

    return Object.freeze({ quality, NI, action_required });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const groundwaterContaminationIndexMeta: AnalyticsModuleMeta = {
    name: 'groundwaterContaminationIndex',
    description: 'groundwaterContaminationIndex',
    category: 'analytics',
    familyTags: ['groundwater', 'water'],
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
