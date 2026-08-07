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
 * Industrial Fire & Explosion Risk - Risco de incêndio e explosão industrial
 *
 * Implementa o índice de incêndio e explosão de Dow (Dow F&EI) conforme
 * o guia do AIChE (American Institute of Chemical Engineers), e classificação
 * de risco conforme NFPA 704.
 *
 * References / Referências:
 *   AIChE (1994). Dow's Fire & Explosion Index Hazard Classification Guide (7th ed.).
 *     American Institute of Chemical Engineers. ISBN 978-0-8169-0623-2
 *   NFPA (2023). NFPA 704: Standard System for the Identification of the Hazards
 *     of Materials for Emergency Response. National Fire Protection Association.
 *   Crowl, D.A. & Louvar, J.F. (2019). Chemical Process Safety (4th ed.).
 *     Pearson. ISBN 978-0-13-462699-6
 *   Lees, F.P. (2012). Loss Prevention in the Process Industries (4th ed., Vol. 2).
 *     Butterworth-Heinemann. ISBN 978-0-12-397189-0. §16 Dow Index.
 *
 * @module industrialFireExplosionRisk
 */

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

// ─── NFPA 704 classification ──────────────────────────────────────────────────

/**
 * NFPA 704 risk categories based on F&EI value.
 * Categorias de risco NFPA 704 baseadas no valor do F&EI.
 *
 * AIChE (1994), Table 2 - Degree of Hazard.
 */
const NFPA704_CATEGORIES: Array<{ maxFEI: number; label: string; description: string }> = [
    { maxFEI: 60, label: 'light', description: 'Light hazard / Risco leve' },
    { maxFEI: 96, label: 'moderate', description: 'Moderate hazard / Risco moderado' },
    { maxFEI: 127, label: 'heavy', description: 'Heavy hazard / Risco elevado' },
    { maxFEI: 158, label: 'severe', description: 'Severe hazard / Risco severo' },
    { maxFEI: Infinity, label: 'extreme', description: 'Extreme hazard / Risco extremo' },
];

/**
 * Classifies F&EI value into NFPA 704 hazard category.
 * Classifica o valor F&EI na categoria de risco NFPA 704.
 *
 * @param fei - Dow Fire & Explosion Index value
 */
function nfpa704Category(fei: number): { label: string; description: string } {
    if (typeof fei !== 'number' || !isFinite(fei) || fei < 0) {
        throw new RangeError(`fei must be a non-negative finite number, got ${fei}`);
    }
    for (const cat of NFPA704_CATEGORIES) {
        if (fei <= cat.maxFEI) return { label: cat.label, description: cat.description };
    }
    return { label: 'extreme', description: 'Extreme hazard / Risco extremo' };
}

// ─── Material Factor (MF) ─────────────────────────────────────────────────────

/**
 * Common material factors (MF) from AIChE Dow F&EI Guide (1994), Appendix A.
 * Fatores de material comuns do Guia F&EI do AIChE (1994), Apêndice A.
 *
 * MF = f(NF, NR) where NF = NFPA flammability rating, NR = reactivity rating.
 */
const MATERIAL_FACTORS: Record<string, number> = {
    // Combustíveis líquidos / Flammable liquids
    gasoline: 16,
    diesel: 10,
    crude_oil: 10,
    ethanol: 16,
    methanol: 16,
    toluene: 16,
    // Gases inflamáveis / Flammable gases
    natural_gas: 21,
    propane: 21,
    hydrogen: 21,
    acetylene: 24,
    // Sólidos combustíveis / Combustible solids
    coal_fine: 16,
    wood_dust: 16,
    // Substâncias reativas / Reactive substances
    ammonium_nitrate: 24,
    ethylene_oxide: 29,
};

/**
 * Returns the material factor for a known substance, or accepts a custom value.
 * Retorna o fator de material para substância conhecida ou aceita valor customizado.
 *
 * @param material - Substance name (key of MATERIAL_FACTORS) or numeric MF
 * @returns Material factor MF
 */
function getMaterialFactor(material: string | number): number {
    if (typeof material === 'number') {
        if (material < 1 || material > 40) {
            throw new RangeError(`Custom MF must be in [1, 40], got ${material}`);
        }
        return material;
    }
    const mf = MATERIAL_FACTORS[material];
    if (mf === undefined) {
        throw new TypeError(
            `Unknown material "${material}". Known: ${Object.keys(MATERIAL_FACTORS).join(', ')} or pass numeric MF.`,
        );
    }
    return mf;
}

// ─── General Process Hazards (F1) ────────────────────────────────────────────

/**
 * Calculates General Process Hazards Factor F1.
 * Calcula o Fator de Riscos Gerais de Processo F1.
 *
 * AIChE (1994), Table 3. F1 = 1.00 (base) + penalties for process conditions.
 * F1 está no intervalo [1.0, 8.0] tipicamente.
 *
 * @param penalties - Applicable penalty values / penalidades aplicáveis
 * @returns F1 factor
 */
function generalHazardsFactor(
    penalties: {
        exothermicReaction?: number;
        endothermicReaction?: number;
        materialHandling?: number;
        enclosedUnits?: number;
        accessOrDrainage?: number;
        explosivesMaterials?: number;
    } = {},
): number {
    if (typeof penalties !== 'object') throw new TypeError('penalties must be an object');
    const base = 1.0;
    const sum = Object.values(penalties).reduce((acc: number, v) => {
        if (typeof v !== 'number' || v < 0)
            throw new RangeError(`Each penalty must be a non-negative number, got ${v}`);
        return acc + v;
    }, 0);
    return base + sum;
}

// ─── Special Process Hazards (F2) ────────────────────────────────────────────

/**
 * Calculates Special Process Hazards Factor F2.
 * Calcula o Fator de Riscos Especiais de Processo F2.
 *
 * AIChE (1994), Table 4. F2 = 1.00 (base) + penalties.
 *
 * @param penalties
 * @returns F2 factor
 */
function specialHazardsFactor(
    penalties: {
        toxicMaterials?: number;
        subAtmosphericPressure?: number;
        nearFlammableLimits?: number;
        dustExplosion?: number;
        pressureDeviation?: number;
        lowTemperature?: number;
        quantityFlammable?: number;
        corrosion?: number;
        leakageJoints?: number;
        fireHeat?: number;
        rotatingEquipment?: number;
    } = {},
): number {
    if (typeof penalties !== 'object') throw new TypeError('penalties must be an object');
    const base = 1.0;
    const sum = Object.values(penalties).reduce((acc: number, v) => {
        if (typeof v !== 'number' || v < 0)
            throw new RangeError(`Each penalty must be a non-negative number, got ${v}`);
        return acc + v;
    }, 0);
    return base + sum;
}

// ─── Dow F&EI Calculation ─────────────────────────────────────────────────────

/**
 * Calculates the Dow Fire & Explosion Index (F&EI).
 * Calcula o Índice de Incêndio e Explosão de Dow (F&EI).
 *
 * F&EI = MF × F3  where F3 = F1 × F2 (Process Unit Hazard Factor)
 *
 * AIChE (1994), Chapter 2.
 *
 * @param MF - Material Factor / fator de material
 * @param F1 - General Process Hazards Factor / fator de riscos gerais
 * @param F2 - Special Process Hazards Factor / fator de riscos especiais
 */
function dowFEI(
    MF: number,
    F1: number,
    F2: number,
): {
    F3: number;
    FEI: number;
    category: string;
    description: string;
} {
    if (typeof MF !== 'number' || MF <= 0) throw new RangeError(`MF must be > 0, got ${MF}`);
    if (typeof F1 !== 'number' || F1 < 1) throw new RangeError(`F1 must be >= 1, got ${F1}`);
    if (typeof F2 !== 'number' || F2 < 1) throw new RangeError(`F2 must be >= 1, got ${F2}`);
    // F3 = Fator de Risco da Unidade de Processo = F1 × F2
    const F3 = F1 * F2;
    const FEI = MF * F3;
    const cat = nfpa704Category(FEI);
    return {
        F3,
        FEI,
        category: cat.label,
        description: cat.description,
    };
}

// ─── Damage radius ────────────────────────────────────────────────────────────

/**
 * Estimates the radius of exposure (damage zone) from the F&EI value.
 * Estima o raio de exposição (zona de dano) a partir do valor F&EI.
 *
 * AIChE (1994), Chapter 3, Eq. (1):
 *   Radius of Exposure (ft) = 0.84 * FEI^0.7853 × (inventory/4536)^(1/3)  [simplified]
 *
 * Simplified formula commonly used (Crowl & Louvar 2019, §12):
 *   R (m) = 0.256 * FEI  (linear approximation for FEI 60–180)
 *
 * For the full model with inventory mass:
 *   R (ft) = 0.84 × FEI^0.7853 × (W_lb)^(1/3) / 4536^(1/3)  → converted to meters
 *
 * @param FEI - Dow Fire & Explosion Index
 * @param inventoryKg - Inventory mass of flammable / massa do inventário inflamável (kg)
 */
function damageRadius(FEI: number, inventoryKg = 5000): { radius_m: number; area_m2: number } {
    if (typeof FEI !== 'number' || FEI < 0) throw new RangeError(`FEI must be >= 0, got ${FEI}`);
    if (typeof inventoryKg !== 'number' || inventoryKg <= 0) {
        throw new RangeError(`inventoryKg must be > 0, got ${inventoryKg}`);
    }
    // Conversão: 1 kg = 2.20462 lb; 4536 lb = 2058 kg (referência AIChE)
    const W_lb = inventoryKg * 2.20462;
    const R_ft = 0.84 * Math.pow(FEI, 0.7853) * Math.pow(W_lb / 4536, 1 / 3);
    const radius_m = R_ft * 0.3048; // pés → metros
    return {
        radius_m,
        area_m2: Math.PI * radius_m * radius_m,
    };
}

// ─── Probable Maximum Loss (PML) ─────────────────────────────────────────────

/**
 * Estimates Probable Maximum Loss (PML) from F&EI and exposure area replacement cost.
 * Estima a Perda Máxima Provável (PML) a partir do F&EI e custo de reposição na área exposta.
 *
 * AIChE (1994), Chapter 4. PML = Damage Factor × Replacement Value of Exposed Area.
 *
 * Damage Factor is derived empirically from F&EI (AIChE 1994, Fig. 3):
 *   FEI ≤  60: DF ≈ 0.05
 *   FEI ≤  96: DF ≈ 0.10
 *   FEI ≤ 127: DF ≈ 0.20
 *   FEI ≤ 158: DF ≈ 0.40
 *   FEI > 158: DF ≈ 0.70
 *
 * @param FEI - Dow Fire & Explosion Index
 * @param replacementValueUSD - Replacement cost of equipment in damage zone (USD)
 */
function probableMaximumLoss(
    FEI: number,
    replacementValueUSD: number,
): { damage_factor: number; pml_usd: number } {
    if (typeof FEI !== 'number' || FEI < 0) throw new RangeError(`FEI must be >= 0, got ${FEI}`);
    if (typeof replacementValueUSD !== 'number' || replacementValueUSD < 0) {
        throw new RangeError(`replacementValueUSD must be >= 0, got ${replacementValueUSD}`);
    }
    let damageFactor;
    if (FEI <= 60) damageFactor = 0.05;
    else if (FEI <= 96) damageFactor = 0.1;
    else if (FEI <= 127) damageFactor = 0.2;
    else if (FEI <= 158) damageFactor = 0.4;
    else damageFactor = 0.7;

    return {
        damage_factor: damageFactor,
        pml_usd: damageFactor * replacementValueUSD,
    };
}

/**
 * Complete Dow F&EI risk assessment for an industrial unit.
 * Avaliação completa de risco F&EI de Dow para uma unidade industrial.
 *
 * @param params
 */
function assessRisk({
    material,
    generalPenalties = {},
    specialPenalties = {},
    inventoryKg = 5000,
    replacementValueUSD = null,
}: {
    material: string | number;
    generalPenalties?: object;
    specialPenalties?: object;
    inventoryKg?: number;
    replacementValueUSD?: number | null;
}): {
    MF: number;
    F1: number;
    F2: number;
    F3: number;
    FEI: number;
    category: string;
    description: string;
    radius_m: number;
    area_m2: number;
    damage_factor: number | null;
    pml_usd: number | null;
} {
    const MF = getMaterialFactor(material);
    const F1 = generalHazardsFactor(generalPenalties);
    const F2 = specialHazardsFactor(specialPenalties);
    const { F3, FEI, category, description } = dowFEI(MF, F1, F2);
    const { radius_m, area_m2 } = damageRadius(FEI, inventoryKg);
    const pmlResult =
        replacementValueUSD !== null
            ? probableMaximumLoss(FEI, replacementValueUSD)
            : { damage_factor: null, pml_usd: null };

    return {
        MF,
        F1,
        F2,
        F3,
        FEI,
        category,
        description,
        radius_m,
        area_m2,
        damage_factor: pmlResult.damage_factor,
        pml_usd: pmlResult.pml_usd,
    };
}

export {
    NFPA704_CATEGORIES,
    MATERIAL_FACTORS,
    nfpa704Category,
    getMaterialFactor,
    generalHazardsFactor,
    specialHazardsFactor,
    dowFEI,
    damageRadius,
    probableMaximumLoss,
    assessRisk,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialFireExplosionRiskMeta: AnalyticsModuleMeta = {
    name: 'industrialFireExplosionRisk',
    description: 'industrialFireExplosionRisk',
    category: 'analytics',
    familyTags: ['industrial', 'risk', 'fire'],
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
