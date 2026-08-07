// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Soil Remediation Cost Model / Modelo de Custo de Remediação de Solo
 *
 * Academic references:
 *   USEPA OSWER (2004). How to Evaluate Alternative Cleanup Technologies for
 *     Underground Storage Tank Sites. EPA 510-R-04-002. Chapter II–VI.
 *   CETESB (2001). Manual de Gerenciamento de Áreas Contaminadas (2ª ed.).
 *     Governo do Estado de São Paulo.
 *   Nyer, E.K. (1998). In Situ Treatment Technology. CRC Press.
 *     ISBN 978-1-56670-287-5
 *   Interstate Technology & Regulatory Council - ITRC (2002). Technical and
 *     Regulatory Guidance for Soil Vapor Extraction. ISBN 1-58383-013-X
 *
 * Zero dependências DOM/IDB/Three.js/fetch.
 * Custos em BRL (R$) por padrão; unidades explicitadas nos parâmetros.
 */

// ─── Technology unit cost constants (R$/m³) ──────────────────────────────────
// Baseado em CETESB 2001 + USEPA OSWER 2004 (convertido a BRL referência 2024)
const UNIT_COST: Record<string, number> = {
    excavation_disposal: 380, // Escavação + destinação a aterro Classe I
    bioventing: 95, // Bioventilação in situ
    sve: 130, // Extração de vapores do solo (SVE)
    prb: 210, // Barreira reativa permeável (PRB) por m³ de zona tratada
    monitored_natural_attenuation: 18, // Atenuação natural monitorada (apenas monitoramento)
};

// ─── Cost per technology ──────────────────────────────────────────────────────

interface RemediationCostResult {
    technology: string;
    unitCost: number;
    volumeM3: number;
    totalCost: number;
}

/**
 * Remediation cost by technology / Custo de remediação por tecnologia.
 *
 * Retorna o custo total estimado para uma tecnologia e volume dado.
 * Referência: USEPA OSWER 2004; CETESB 2001 cap. 5
 *
 * @param {string} technology  - Tecnologia: 'excavation_disposal' | 'bioventing' | 'sve' | 'prb' | 'monitored_natural_attenuation'
 * @param {number} volumeM3   - Volume de solo contaminado (m³)
 * @param {number|null} [unitCostOverride] - Custo unitário customizado (R$/m³); sobrescreve padrão
 * @returns {{ technology: string, unitCost: number, volumeM3: number, totalCost: number }}
 * @throws {TypeError}  se technology não for string válida ou volume inválido
 * @throws {RangeError} se volumeM3 <= 0
 */
export function remediationCostByTechnology(technology: string, volumeM3: number, unitCostOverride: number | null = null): RemediationCostResult {
    if (typeof technology !== 'string' || !Object.prototype.hasOwnProperty.call(UNIT_COST, technology))
        throw new TypeError(`technology must be one of: ${Object.keys(UNIT_COST).join(', ')}`);
    if (typeof volumeM3 !== 'number' || !isFinite(volumeM3)) throw new TypeError('volumeM3 must be a finite number');
    if (volumeM3 <= 0) throw new RangeError('volumeM3 must be > 0');

    const unitCost = unitCostOverride !== null ? unitCostOverride : UNIT_COST[technology]!;
    if (typeof unitCost !== 'number' || unitCost <= 0)
        throw new RangeError('unitCostOverride must be a positive number');

    const totalCost = unitCost * volumeM3;
    return { technology, unitCost, volumeM3, totalCost };
}

// ─── Multi-technology comparison ─────────────────────────────────────────────

interface ComparisonResult {
    technology: string;
    unitCost: number;
    totalCost: number;
    rank: number;
}

/**
 * Compare remediation technologies / Comparar tecnologias de remediação.
 *
 * Para um mesmo volume de solo, retorna ranking de custo entre tecnologias.
 * Referência: USEPA OSWER 2004, cap. VI - Cost Comparison Worksheet
 *
 * @param {number} volumeM3    - Volume contaminado a remediar (m³)
 * @param {string[]|null} [techs]   - Subset de tecnologias (padrão: todas)
 * @returns {Array<{technology:string, unitCost:number, totalCost:number, rank:number}>}
 * @throws {TypeError}  se volumeM3 inválido
 * @throws {RangeError} se volumeM3 <= 0
 */
export function compareTechnologies(volumeM3: number, techs: string[] | null = null): ComparisonResult[] {
    if (typeof volumeM3 !== 'number' || !isFinite(volumeM3)) throw new TypeError('volumeM3 must be a finite number');
    if (volumeM3 <= 0) throw new RangeError('volumeM3 must be > 0');

    const selectedTechs = techs || Object.keys(UNIT_COST);
    const results = selectedTechs.map((tech) => {
        if (!Object.prototype.hasOwnProperty.call(UNIT_COST, tech)) throw new TypeError(`Unknown technology: ${tech}`);
        const unitCost = UNIT_COST[tech]!;
        return { technology: tech, unitCost, totalCost: unitCost * volumeM3 };
    });
    results.sort((a, b) => a.totalCost - b.totalCost);
    return results.map((r, i) => ({ ...r, rank: i + 1 }));
}

// ─── Cost-benefit index ───────────────────────────────────────────────────────

interface EnvironmentalCostBenefitResult {
    massRemovedKg: number;
    benefitPerKg: number;
    totalCost: number;
    totalBenefit: number;
    ica: number;
}

/**
 * Environmental cost-benefit index / Índice de custo-benefício ambiental.
 *
 * ICA = (massRemovedKg * benefitPerKg) / totalCost
 * Onde benefitPerKg representa o dano ambiental evitado por kg removido.
 * ICA > 1 indica que o benefício ambiental supera o custo direto de remediação.
 * Referência: Nyer 1998, cap. 1; ITRC 2002 sec. 5.4
 *
 * @param {number} massRemovedKg  - Massa de contaminante removida (kg)
 * @param {number} benefitPerKg   - Benefício monetário por kg removido (R$/kg)
 * @param {number} totalCost      - Custo total da remediação (R$)
 * @returns {{ massRemovedKg:number, benefitPerKg:number, totalCost:number, totalBenefit:number, ica:number }}
 * @throws {TypeError}  se algum parâmetro não for número finito
 * @throws {RangeError} se massRemovedKg <= 0, benefitPerKg <= 0 ou totalCost <= 0
 */
export function environmentalCostBenefitIndex(massRemovedKg: number, benefitPerKg: number, totalCost: number): EnvironmentalCostBenefitResult {
    for (const [name, val] of [
        ['massRemovedKg', massRemovedKg],
        ['benefitPerKg', benefitPerKg],
        ['totalCost', totalCost],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !isFinite(val)) throw new TypeError(`${name} must be a finite number`);
        if (val <= 0) throw new RangeError(`${name} must be > 0`);
    }
    const totalBenefit = massRemovedKg * benefitPerKg;
    const ica = totalBenefit / totalCost;
    return { massRemovedKg, benefitPerKg, totalCost, totalBenefit, ica };
}

// ─── Economic feasibility index ───────────────────────────────────────────────

interface EconomicFeasibilityResult {
    netGain: number;
    ive: number;
    viable: boolean;
}

/**
 * Economic feasibility index / Índice de viabilidade econômica da remediação.
 *
 * IVE = (propertyValueAfter - propertyValueBefore - remediationCost) / remediationCost
 * IVE > 0: remediação economicamente viável (valorização supera custo)
 * IVE < 0: não viável economicamente (perda líquida)
 * Referência: CETESB 2001, cap. 7 - Análise de Risco e Viabilidade
 *
 * @param {number} propertyValueBefore - Valor do imóvel antes da remediação (R$)
 * @param {number} propertyValueAfter  - Valor do imóvel após remediação (R$)
 * @param {number} remediationCost     - Custo total da remediação (R$)
 * @returns {{ netGain:number, ive:number, viable:boolean }}
 * @throws {TypeError}  se algum parâmetro não for número finito
 * @throws {RangeError} se remediationCost <= 0 ou valores de imóvel negativos
 */
export function economicFeasibilityIndex(propertyValueBefore: number, propertyValueAfter: number, remediationCost: number): EconomicFeasibilityResult {
    for (const [name, val] of [
        ['propertyValueBefore', propertyValueBefore],
        ['propertyValueAfter', propertyValueAfter],
        ['remediationCost', remediationCost],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !isFinite(val)) throw new TypeError(`${name} must be a finite number`);
    }
    if (propertyValueBefore < 0) throw new RangeError('propertyValueBefore must be >= 0');
    if (propertyValueAfter < 0) throw new RangeError('propertyValueAfter must be >= 0');
    if (remediationCost <= 0) throw new RangeError('remediationCost must be > 0');

    const netGain = propertyValueAfter - propertyValueBefore - remediationCost;
    const ive = netGain / remediationCost;
    return { netGain, ive, viable: ive > 0 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilRemediationCostModelMeta = {
    name: 'soilRemediationCostModel',
    description: 'soilRemediationCostModel',
    category: 'analytics',
    familyTags: ['soil', 'remediation', 'hydrocarbon'],
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
