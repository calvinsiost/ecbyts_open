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
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Mine Subsidence Prediction (NCB/Pöttgens)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mine Subsidence Model - Surface Movement Prediction
 *
 * Módulo puro implementando o modelo de subsidência de superfície do
 * National Coal Board (NCB) para mineração subterrânea, incluindo subsidência
 * máxima, fator de subsidência, deformação horizontal e raio de influência.
 * Aplicável a carvão, potássio, sal e outros minerais lavrados por câmaras
 * ou longwall. Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - National Coal Board (NCB) (1975). "Subsidence Engineers' Handbook."
 *     2nd ed. Mining Department, National Coal Board, London.
 *     (modelo empírico padrão Reino Unido - tabelas S/h e raio de influência)
 *   - Whittaker, B. N., & Reddish, D. J. (1989). "Subsidence - Occurrence,
 *     Prediction and Control." Elsevier, Amsterdam. ISBN: 978-0-444-87274-1
 *   - Pöttgens, J. J. E. (1985). "Bodenhebung durch ansteigendes Grubenwasser."
 *     In Proc. 3rd Int. Symp. on Land Subsidence, Venice, IAHS Publ. 151, 731–740.
 *   - Shu, C., & Bhattacharyya, A. K. (1990). "Some observations on subsidence
 *     in longwall mining." Mining Science and Technology 10(1), 1–14.
 *     DOI: 10.1016/0167-9031(90)90002-H
 */

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
 * Constante empírica NCB: tangente do ângulo de influência β ≈ 0.7071 (β = 35°)
 * Define o raio de influência R = h / tan(β) onde h é a profundidade de lavra.
 * Valor calibrado para carvão betuminoso britânico; ajustar para outras litologias.
 */
const TAN_BETA_NCB = 0.7071; // tan(35°) — ângulo de influência NCB padrão

/**
 * Calcula a subsidência máxima esperada na superfície acima de uma painel de lavra.
 * Subsidência máxima Smax = s * h quando a painel é "supercritical" (W/h >= 1.4),
 * ou reduzida pelo fator de subsidência quando subcritical.
 *
 * @param {number} miningHeight - Altura de extração (espessura da camada) em metros
 * @param {number} depth        - Profundidade de lavra h (m)
 * @param {number} panelWidth   - Largura da painel W (m)
 * @param {number} sMax_coeff   - Coeficiente de subsidência máxima s/m (adimensional, 0-1)
 *   Tipicamente 0.45–0.90 para carvão; menor para rochas mais rígidas
 * @returns {{ sMax: number, isSupercritical: boolean, wOverH: number }} Subsidência máxima (m)
 * @throws {RangeError} Se depth <= 0 ou sMax_coeff fora de [0, 1]
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcMaxSubsidence(
    miningHeight: number,
    depth: number,
    panelWidth: number,
    sMax_coeff: number,
): { sMax: number; isSupercritical: boolean; wOverH: number } {
    for (const [name, val] of [
        ['miningHeight', miningHeight],
        ['depth', depth],
        ['panelWidth', panelWidth],
        ['sMax_coeff', sMax_coeff],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
    }
    if (depth <= 0) throw new RangeError(`depth deve ser > 0; recebido: ${depth}`);
    if (miningHeight < 0) throw new RangeError(`miningHeight deve ser >= 0; recebido: ${miningHeight}`);
    if (sMax_coeff < 0 || sMax_coeff > 1) {
        throw new RangeError(`sMax_coeff deve estar em [0, 1]; recebido: ${sMax_coeff}`);
    }

    const wOverH = panelWidth / depth; // Razão W/h — critério supercritical NCB

    // Subsidência plena (supercritical): W/h >= 1.4 - toda a seção colapsa
    const isSupercritical = wOverH >= 1.4;

    // Fator de preenchimento para painéis subcritical: interpolação NCB tabela 4
    // Aproximação polinomial da Tabela 4 NCB (1975) para subcritical panels
    let fillFactor = 1.0;
    if (!isSupercritical) {
        // Factor cresce de 0 a 1 conforme W/h aumenta de 0 a 1.4
        fillFactor = Math.min(1.0, Math.pow(wOverH / 1.4, 0.8));
    }

    const sMax = sMax_coeff * miningHeight * fillFactor;
    return { sMax, isSupercritical, wOverH };
}

/**
 * Calcula o fator de subsidência S/h (subsidência / espessura de lavra)
 * para diferentes materiais de preenchimento ou geometrias.
 * Baseado nas tabelas NCB e no modelo de Whittaker & Reddish (1989).
 *
 * @param {number} measuredSubsidence - Subsidência medida em campo (m)
 * @param {number} miningHeight       - Altura de extração (m)
 * @returns {number} Fator de subsidência S/m (adimensional, 0-1)
 * @throws {RangeError} Se miningHeight <= 0 ou measuredSubsidence < 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcSubsidenceFactor(measuredSubsidence: number, miningHeight: number): number {
    if (typeof measuredSubsidence !== 'number' || !Number.isFinite(measuredSubsidence)) {
        throw new TypeError(`measuredSubsidence deve ser número finito; recebido: ${measuredSubsidence}`);
    }
    if (typeof miningHeight !== 'number' || !Number.isFinite(miningHeight)) {
        throw new TypeError(`miningHeight deve ser número finito; recebido: ${miningHeight}`);
    }
    if (miningHeight <= 0) throw new RangeError(`miningHeight deve ser > 0; recebido: ${miningHeight}`);
    if (measuredSubsidence < 0)
        throw new RangeError(`measuredSubsidence deve ser >= 0; recebido: ${measuredSubsidence}`);

    // Fator de subsidência: razão entre subsidência observada e espessura de lavra
    // Valores típicos NCB: 0.45–0.90 (carvão longwall sem preenchimento)
    return measuredSubsidence / miningHeight;
}

/**
 * Calcula a deformação horizontal máxima na superfície conforme modelo NCB.
 * A deformação horizontal εmax ocorre nos limites da painel e é proporcional
 * à curvatura máxima do perfil de subsidência.
 *
 * ε_max = S_max / (k * R)   onde k ≈ 1.4 (constante NCB) e R = raio de influência
 *
 * @param {number} sMax  - Subsidência máxima (m)
 * @param {number} depth - Profundidade de lavra h (m)
 * @param {number} [k=1.4] - Constante de curvatura NCB (adimensional)
 * @returns {{ strainMax: number, radius: number }} Deformação máxima (mm/m) e raio de influência (m)
 * @throws {RangeError} Se sMax < 0, depth <= 0 ou k <= 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcHorizontalStrain(
    sMax: number,
    depth: number,
    k: number = 1.4,
): { strainMax: number; radius: number } {
    for (const [name, val] of [
        ['sMax', sMax],
        ['depth', depth],
        ['k', k],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
    }
    if (sMax < 0) throw new RangeError(`sMax deve ser >= 0; recebido: ${sMax}`);
    if (depth <= 0) throw new RangeError(`depth deve ser > 0; recebido: ${depth}`);
    if (k <= 0) throw new RangeError(`k deve ser > 0; recebido: ${k}`);

    // Raio de influência R = h / tan(β) - distância horizontal de influência
    const radius = depth / TAN_BETA_NCB;

    // Deformação horizontal máxima: positiva = tração, negativa = compressão
    // Expressa em mm/m (milímetros por metro) = 10⁻³ adimensional
    const strainMax = (sMax / (k * radius)) * 1000; // mm/m

    return { strainMax, radius };
}

/**
 * Classifica o risco de subsidência com base na subsidência máxima e
 * nas categorias de dano estrutural do NCB (Categorias 0-5).
 *
 * @param {number} sMax         - Subsidência máxima esperada (m)
 * @param {number} strainMm_m   - Deformação horizontal máxima (mm/m)
 * @returns {{ category: number, risk: string, description: string }} Categoria NCB e risco
 * @throws {RangeError} Se sMax < 0 ou strainMm_m < 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function classifySubsidenceRisk(
    sMax: number,
    strainMm_m: number,
): { category: number; risk: string; description: string } {
    for (const [name, val] of [
        ['sMax', sMax],
        ['strainMm_m', strainMm_m],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
        if (val < 0) throw new RangeError(`${name} deve ser >= 0; recebido: ${val}`);
    }

    // Categorias de dano NCB (1975) Tabela 1 - baseadas em deformação horizontal
    // Deformação crítica para cada categoria (mm/m)
    if (strainMm_m < 0.5) {
        return { category: 0, risk: 'NEGLIGIBLE', description: 'Negligível — sem dano perceptível em estruturas' };
    } else if (strainMm_m < 1.0) {
        return { category: 1, risk: 'VERY_SLIGHT', description: 'Muito leve — trincas finas em acabamentos' };
    } else if (strainMm_m < 2.0) {
        return { category: 2, risk: 'SLIGHT', description: 'Leve — trincas em alvenaria; reparos simples' };
    } else if (strainMm_m < 3.0) {
        return {
            category: 3,
            risk: 'MODERATE',
            description: 'Moderado — janelas/portas difíceis; reparos necessários',
        };
    } else if (strainMm_m < 4.5) {
        return { category: 4, risk: 'SEVERE', description: 'Severo — dano estrutural significativo; vigas afetadas' };
    } else {
        return {
            category: 5,
            risk: 'VERY_SEVERE',
            description: 'Muito severo — instabilidade estrutural; demolição pode ser necessária',
        };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineSubsidenceModelMeta: AnalyticsModuleMeta = {
    name: 'mineSubsidenceModel',
    description: 'Mine Subsidence Prediction (NCB/Pöttgens)',
    category: 'analytics',
    familyTags: ['mining', 'landslide'],
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
