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
// Application: EHS & Mining / Sediment Quality Assessment
// Authorship: Calvin Stefan Iost

/* ================================================================
   SEDIMENT QUALITY ASSESSMENT — Pure scientific functions
   ================================================================

   Avaliacao da qualidade de sedimentos baseada em diretrizes internacionais
   e metodologias cientificas validadas.

   METODOLOGIAS:
   - NOAA SQG (ERL/ERM) + CCME ISQG (TEL/PEL) para comparacao com guias
   - Mean SQG-Quotient (Swartz 1999) para avaliacao de co-ocorrencia
   - Unidades de toxicidade em agua intersticial (Sprague 1970)
   - Particionamento de equilibrio (USEPA 1992, Di Toro 1991)
   - Correcao de bioacessibilidade (BARGE/RIVM)
   - Classificacao CONAMA 454/2012
   - Normalizacao por carbono organico (Di Toro 1991)
   - Fluxo de ressuspensao — Partheniades (1965)
   - Demanda de oxigenio do sedimento — USEPA (1985), Chapra (1997)
   - Volume de dragagem — diretrizes USEPA DMMO

   REFERENCIAS:
   - CCME (1999). Canadian sediment quality guidelines for the protection
     of aquatic life. Canadian Environmental Quality Guidelines.
   - NOAA (1999). Sediment Quality Guidelines developed for the National
     Status and Trends Program. NOAA Technical Memorandum NOS ORCA 52.
   - Swartz, R.C. (1999). Consensus sediment quality guidelines for
     polycyclic aromatic hydrocarbon mixtures. Environ. Toxicol. Chem.
   - Sprague, J.B. (1970). Measurement of pollutant toxicity to fish.
     Water Research, 4(1), 3-32. DOI: 10.1016/0043-1354(70)90018-7
   - USEPA (1992). Guidelines for deriving site-specific sediment quality
     criteria for the protection of benthic organisms. EPA/822/R-02/013.
   - Di Toro, D.M. et al. (1991). Technical basis for establishing
     sediment quality criteria for nonionic organic chemicals using
     equilibrium partitioning. Environ. Toxicol. Chem. 10, 1541-1583.
   - Partheniades, E. (1965). Erosion and deposition of cohesive soils.
     J. Hydraul. Div., 91(1), 105-139.
   - Bowie et al. (1985). Rates, constants, and kinetics formulations
     in surface water quality modeling, 2nd ed. EPA/600/3-85/040.
   - CONAMA (2012). Resolucao n. 454, de 01 de novembro de 2012.
     Estabelece as diretrizes gerais e os procedimentos referenciais
     para o gerenciamento do material a ser dragado.
   - USEPA DMMO. Dredging Material Management Office guidelines.

   ================================================================ */

'use strict';

// ----------------------------------------------------------------
// GUIDELINE TABLES - Freshwater (CCME 1999) TEL/PEL values
// Valores guia de qualidade de sedimentos de agua doce (mg/kg peso seco)
// ----------------------------------------------------------------

/**
 * CCME (1999) Canadian Sediment Quality Guidelines - Freshwater.
 * TEL = Threshold Effect Level (efeitos raros abaixo deste valor)
 * PEL = Probable Effect Level (efeitos provaveis acima deste valor)
 * Unidades: mg/kg peso seco (exceto Hg em mg/kg)
 */
export const FRESHWATER_SQG = Object.freeze({
    As: { TEL: 5.9, PEL: 17.0 },
    Cd: { TEL: 0.6, PEL: 3.5 },
    Cr: { TEL: 37.3, PEL: 90.0 },
    Cu: { TEL: 35.7, PEL: 197.0 },
    Hg: { TEL: 0.17, PEL: 0.486 },
    Ni: { TEL: 18.0, PEL: 35.9 },
    Pb: { TEL: 35.0, PEL: 91.3 },
    Zn: { TEL: 123.0, PEL: 315.0 },
    Benzo_a_pyrene: { TEL: 0.031, PEL: 0.782 },
    PCB_total: { TEL: 0.034, PEL: 0.277 },
    DDT_total: { TEL: 0.0017, PEL: 0.046 },
});

// ----------------------------------------------------------------
// GUIDELINE TABLES - Marine (NOAA 1999) ERL/ERM values
// Valores guia de qualidade de sedimentos marinhos (mg/kg peso seco)
// ----------------------------------------------------------------

/**
 * NOAA (1999) Sediment Quality Guidelines - Marine/Estuarine.
 * ERL = Effects Range Low (efeitos biologicos raros abaixo deste valor)
 * ERM = Effects Range Median (efeitos biologicos frequentes acima deste valor)
 * Unidades: mg/kg peso seco
 */
export const MARINE_SQG = Object.freeze({
    As: { ERL: 8.2, ERM: 70.0 },
    Cd: { ERL: 1.2, ERM: 9.6 },
    Cr: { ERL: 81.0, ERM: 370.0 },
    Cu: { ERL: 34.0, ERM: 270.0 },
    Hg: { ERL: 0.15, ERM: 0.71 },
    Ni: { ERL: 20.9, ERM: 51.6 },
    Pb: { ERL: 46.7, ERM: 218.0 },
    Zn: { ERL: 150.0, ERM: 410.0 },
    Benzo_a_pyrene: { ERL: 0.43, ERM: 16.1 },
    PCB_total: { ERL: 0.023, ERM: 0.18 },
    DDT_total: { ERL: 0.001, ERM: 0.007 },
});

// ----------------------------------------------------------------
// FUNCTION 1 - sqgComparison
// Comparacao com guias de qualidade de sedimentos (NOAA / CCME / USEPA)
// ----------------------------------------------------------------

/**
 * Compare sediment concentration against NOAA SQG (marine) or CCME ISQG
 * (freshwater) threshold values.
 *
 * Compara concentracao medida com os valores guia da NOAA ou CCME para
 * avaliacao de risco ecologico.
 *
 * @param {string} compound - Compound name matching table key (e.g., 'As', 'Cu')
 * @param {number} concentrationMgKg - Measured concentration in mg/kg dry weight
 * @param {'freshwater'|'marine'} matrix - Environmental matrix
 * @returns {{
 *   compound: string,
 *   concentrationMgKg: number,
 *   lowerGuideline: number,
 *   upperGuideline: number,
 *   exceedanceLower: boolean,
 *   exceedanceUpper: boolean,
 *   category: 'clean'|'possible_effects'|'probable_effects'
 * }}
 */
export function sqgComparison(compound: string, concentrationMgKg: number, matrix: 'freshwater'|'marine'): { compound: string, concentrationMgKg: number, lowerGuideline: number, upperGuideline: number, exceedanceLower: boolean, exceedanceUpper: boolean, category: 'clean'|'possible_effects'|'probable_effects' } {
    if (matrix !== 'freshwater' && matrix !== 'marine') {
        throw new Error(`sqgComparison: matrix must be 'freshwater' or 'marine', got '${matrix}'`);
    }
    if (typeof concentrationMgKg !== 'number' || concentrationMgKg < 0) {
        throw new Error('sqgComparison: concentrationMgKg must be a non-negative number');
    }

    const table: Record<string, {TEL?: number, PEL?: number, ERL?: number, ERM?: number}> = matrix === 'freshwater' ? FRESHWATER_SQG : MARINE_SQG;
    const entry = table[compound];

    if (!entry) {
        throw new Error(`sqgComparison: compound '${compound}' not found in ${matrix} SQG table`);
    }

    // Freshwater uses TEL/PEL; marine uses ERL/ERM -- unified as lower/upper
    const lowerGuideline = ((matrix === 'freshwater' ? entry.TEL : entry.ERL)) as number;
    const upperGuideline = ((matrix === 'freshwater' ? entry.PEL : entry.ERM)) as number;

    const exceedanceLower = concentrationMgKg > lowerGuideline;
    const exceedanceUpper = concentrationMgKg > upperGuideline;

        let category: 'clean'|'possible_effects'|'probable_effects';
    if (!exceedanceLower) {
        category = 'clean';
    } else if (!exceedanceUpper) {
        category = 'possible_effects';
    } else {
        category = 'probable_effects';
    }

    return {
        compound,
        concentrationMgKg,
        lowerGuideline,
        upperGuideline,
        exceedanceLower,
        exceedanceUpper,
        category,
    };
}

// ----------------------------------------------------------------
// FUNCTION 2 - meanSQGQuotient
// Quociente medio SQG (Swartz 1999) para avaliacao de co-ocorrencia
// ----------------------------------------------------------------

/**
 * Calculate mean SQG-Quotient for co-occurrence toxicity assessment.
 * Calcula o quociente medio SQG para avaliacao de co-ocorrencia de contaminantes.
 *
 * Reference: Swartz, R.C. (1999). Consensus sediment quality guidelines
 * for PAH mixtures. Environ. Toxicol. Chem. 18(4): 780-787.
 *
 * @param {Array<{compound: string, concentration: number, TEL: number, PEL: number}>} compounds
 * @returns {{
 *   meanSQGQ: number,
 *   nCompounds: number,
 *   exceedanceCount: number,
 *   ecologicalRisk: 'minimal'|'medium'|'high',
 *   compounds: Array<{compound: string, sqgQi: number, concentration: number}>
 * }}
 */
export function meanSQGQuotient(compounds: Array<{compound: string, concentration: number, TEL: number, PEL: number}>): { meanSQGQ: number, nCompounds: number, exceedanceCount: number, ecologicalRisk: 'minimal'|'medium'|'high', compounds: Array<{compound: string, sqgQi: number, concentration: number}> } {
    if (!Array.isArray(compounds) || compounds.length === 0) {
        throw new Error('meanSQGQuotient: compounds must be a non-empty array');
    }

    const details = compounds.map((c) => {
        const midpoint = (c.TEL + c.PEL) / 2;
        if (midpoint <= 0) {
            throw new Error(`meanSQGQuotient: invalid TEL/PEL for compound '${c.compound}'`);
        }
        const sqgQi = c.concentration / midpoint;
        return { compound: c.compound, sqgQi, concentration: c.concentration };
    });

    const sum = details.reduce((acc, d) => acc + d.sqgQi, 0);
    const meanSQGQ = sum / details.length;
    const exceedanceCount = details.filter((d) => d.sqgQi > 1).length;

        let ecologicalRisk: 'minimal'|'medium'|'high';
    if (meanSQGQ < 0.1) {
        ecologicalRisk = 'minimal';
    } else if (meanSQGQ < 1) {
        ecologicalRisk = 'medium';
    } else {
        ecologicalRisk = 'high';
    }

    return {
        meanSQGQ,
        nCompounds: compounds.length,
        exceedanceCount,
        ecologicalRisk,
        compounds: details,
    };
}

// ----------------------------------------------------------------
// FUNCTION 3 - toxicityUnitSediment
// Unidades de toxicidade em agua intersticial (Sprague 1970)
// ----------------------------------------------------------------

/**
 * Calculate summed Toxicity Units (TU) for pore water contaminants.
 * Calcula as unidades de toxicidade acumuladas para agua intersticial.
 *
 * Reference: Sprague, J.B. (1970). Measurement of pollutant toxicity
 * to fish. Water Research, 4(1), 3-32.
 *
 * @param {Array<{compound: string, porewaterConcentrationUgL: number, LC50UgL: number}>} contaminants
 * @returns {{
 *   sumTU: number,
 *   dominantContaminant: string,
 *   toxicityClass: 'none'|'low'|'moderate'|'high',
 *   breakdown: Array<{compound: string, TU: number, fraction: number}>
 * }}
 */
export function toxicityUnitSediment(contaminants: Array<{compound: string, porewaterConcentrationUgL: number, LC50UgL: number}>): { sumTU: number, dominantContaminant: string, toxicityClass: 'none'|'low'|'moderate'|'high', breakdown: Array<{compound: string, TU: number, fraction: number}> } {
    if (!Array.isArray(contaminants) || contaminants.length === 0) {
        throw new Error('toxicityUnitSediment: contaminants must be a non-empty array');
    }

    const breakdown = contaminants.map((c) => {
        if (c.LC50UgL <= 0) {
            throw new Error(`toxicityUnitSediment: LC50 must be positive for compound '${c.compound}'`);
        }
        const TU = c.porewaterConcentrationUgL / c.LC50UgL;
        return { compound: c.compound, TU, porewaterConcentrationUgL: c.porewaterConcentrationUgL };
    });

    const sumTU = breakdown.reduce((acc, b) => acc + b.TU, 0);

    // Identify dominant contaminant (highest TU fraction)
    let dominantContaminant = (breakdown[0] as { compound: string, TU: number }).compound;
    let maxTU = (breakdown[0] as { compound: string, TU: number }).TU;
    for (let i = 1; i < breakdown.length; i++) {
        const bi = breakdown[i] as { compound: string, TU: number };
        if (bi.TU > maxTU) {
            maxTU = bi.TU;
            dominantContaminant = bi.compound;
        }
    }

    // Add fractional contribution
    const breakdownWithFraction = breakdown.map((b) => ({
        compound: b.compound,
        TU: b.TU,
        fraction: sumTU > 0 ? b.TU / sumTU : 0,
    }));

        let toxicityClass: 'none'|'low'|'moderate'|'high';
    if (sumTU < 0.1) {
        toxicityClass = 'none';
    } else if (sumTU < 1) {
        toxicityClass = 'low';
    } else if (sumTU < 10) {
        toxicityClass = 'moderate';
    } else {
        toxicityClass = 'high';
    }

    return {
        sumTU,
        dominantContaminant,
        toxicityClass,
        breakdown: breakdownWithFraction,
    };
}

// ----------------------------------------------------------------
// FUNCTION 4 - equilibriumPartitioning
// Teoria do particionamento de equilibrio (USEPA 1992, Di Toro 1991)
// ----------------------------------------------------------------

/**
 * Calculate pore water concentration using USEPA equilibrium partitioning
 * theory for organic contaminants in sediment.
 *
 * Calcula a concentracao na agua intersticial usando a teoria do
 * particionamento de equilibrio.
 *
 * Reference: USEPA (1992). Guidelines for deriving site-specific sediment
 * quality criteria. Di Toro et al. (1991). Environ. Toxicol. Chem. 10:1541.
 *
 * @param {number} totalSedimentConcentrationMgKg - Total sediment conc (mg/kg dry wt)
 * @param {number} koc - Organic carbon partition coefficient (L/kg OC)
 * @param {number} foc - Fraction of organic carbon (dimensionless, 0-1)
 * @param {number} [porewaterDensity=0.3] - Volumetric water content θ (L water/kg sediment)
 * @returns {{ porewaterMgL: number, Kd: number, bioavailableFraction: number }}
 */
export function equilibriumPartitioning(totalSedimentConcentrationMgKg: number, koc: number, foc: number, porewaterDensity: number = 0.3): { porewaterMgL: number, Kd: number, bioavailableFraction: number } {
    if (koc <= 0) throw new Error('equilibriumPartitioning: koc must be positive');
    if (foc <= 0 || foc > 1) throw new Error('equilibriumPartitioning: foc must be in (0, 1]');
    if (porewaterDensity <= 0) throw new Error('equilibriumPartitioning: porewaterDensity must be positive');

    // Kd = organic carbon normalized partition coefficient × fraction OC
    const Kd = koc * foc; // L/kg

    // Porewater concentration: C_pore = C_total / (Kd + theta)
    const porewaterMgL = totalSedimentConcentrationMgKg / (Kd + porewaterDensity);

    // Bioavailable fraction (fraction in dissolved phase)
    const bioavailableFraction = porewaterDensity / (Kd + porewaterDensity);

    return {
        porewaterMgL,
        Kd,
        bioavailableFraction,
    };
}

// ----------------------------------------------------------------
// FUNCTION 5 - bioaccessibilityCorrection
// Correcao de bioacessibilidade (BARGE/RIVM)
// ----------------------------------------------------------------

/**
 * Apply bioaccessibility correction factor to total measured concentration.
 * Aplica fator de correcao de bioacessibilidade (BARGE/RIVM) a concentracao total.
 *
 * Reference: BARGE (Bioaccessibility Research Group of Europe);
 * RIVM Report 711701023/2001 (Hakanson & Jansson, 1983).
 *
 * @param {number} totalConcentrationMgKg - Total measured concentration (mg/kg)
 * @param {number} extractionEfficiency - Bioaccessible fraction (0-1, e.g., 0.3 for 30%)
 * @param {'soil'|'sediment'} matrix - Environmental matrix
 * @returns {{
 *   totalMgKg: number,
 *   bioaccessibleMgKg: number,
 *   extractionEfficiency: number,
 *   reductionFactor: number
 * }}
 */
export function bioaccessibilityCorrection(totalConcentrationMgKg: number, extractionEfficiency: number, matrix: 'soil'|'sediment'): { totalMgKg: number, bioaccessibleMgKg: number, extractionEfficiency: number, reductionFactor: number } {
    if (matrix !== 'soil' && matrix !== 'sediment') {
        throw new Error(`bioaccessibilityCorrection: matrix must be 'soil' or 'sediment', got '${matrix}'`);
    }
    if (extractionEfficiency < 0 || extractionEfficiency > 1) {
        throw new Error('bioaccessibilityCorrection: extractionEfficiency must be between 0 and 1');
    }
    if (totalConcentrationMgKg < 0) {
        throw new Error('bioaccessibilityCorrection: totalConcentrationMgKg must be non-negative');
    }

    const bioaccessibleMgKg = totalConcentrationMgKg * extractionEfficiency;
    const reductionFactor = 1 - extractionEfficiency;

    return {
        totalMgKg: totalConcentrationMgKg,
        bioaccessibleMgKg,
        extractionEfficiency,
        reductionFactor,
    };
}

// ----------------------------------------------------------------
// FUNCTION 6 - sedimentClassification
// Classificacao CONAMA 454/2012 (Resolucao Brasileira)
// ----------------------------------------------------------------

/**
 * Classify sediment according to CONAMA Resolution 454/2012 (Brazil).
 * Classifica o sedimento conforme a Resolucao CONAMA n. 454/2012.
 *
 * Reference: CONAMA (2012). Resolucao n. 454/2012 - Gerenciamento de
 * material a ser dragado em aguas sobh jurisdicao nacional.
 * Utiliza os mesmos valores TEL/PEL do CCME 1999 para agua doce.
 *
 * @param {Array<{compound: string, concentration: number}>} compounds
 * @param {'freshwater'|'marine'} matrix
 * @returns {{
 *   level1Count: number,
 *   level2Count: number,
 *   totalCompounds: number,
 *   classification: 'Nível 1'|'Nível 2'|'Acima Nível 2',
 *   conamaArticle: string
 * }}
 */
export function sedimentClassification(compounds: Array<{compound: string, concentration: number}>, matrix: 'freshwater'|'marine'): { level1Count: number, level2Count: number, totalCompounds: number, classification: 'Nível 1'|'Nível 2'|'Acima Nível 2', conamaArticle: string } {
    if (!Array.isArray(compounds) || compounds.length === 0) {
        throw new Error('sedimentClassification: compounds must be a non-empty array');
    }
    if (matrix !== 'freshwater' && matrix !== 'marine') {
        throw new Error(`sedimentClassification: matrix must be 'freshwater' or 'marine'`);
    }

    const table: Record<string, {TEL?: number, PEL?: number, ERL?: number, ERM?: number}> = matrix === 'freshwater' ? FRESHWATER_SQG : MARINE_SQG;

    let level1Count = 0; // below TEL/ERL (Nivel 1 -- cleaner)
    let level2Count = 0; // between TEL/ERL and PEL/ERM (Nivel 2 -- intermediate)
    let aboveLevel2Count = 0; // above PEL/ERM

    for (const c of compounds) {
        const entry = table[c.compound];
        if (!entry) continue; // skip unknown compounds

        const lower = ((matrix === 'freshwater' ? entry.TEL : entry.ERL)) as number;
        const upper = ((matrix === 'freshwater' ? entry.PEL : entry.ERM)) as number;

        if (c.concentration <= lower) {
            level1Count++;
        } else if (c.concentration <= upper) {
            level2Count++;
        } else {
            aboveLevel2Count++;
        }
    }

        let classification: 'Nível 1'|'Nível 2'|'Acima Nível 2';
    if (aboveLevel2Count > 0) {
        classification = 'Acima Nível 2';
    } else if (level2Count > 0) {
        classification = 'Nível 2';
    } else {
        classification = 'Nível 1';
    }

    return {
        level1Count,
        level2Count,
        totalCompounds: compounds.length,
        classification,
        conamaArticle: '454/2012',
    };
}

// ----------------------------------------------------------------
// FUNCTION 7 - organicCarbonNormalization
// Normalizacao por carbono organico (Di Toro 1991)
// ----------------------------------------------------------------

/**
 * Normalize sediment concentration to a reference organic carbon content.
 * Normaliza a concentracao do sedimento para um teor padrao de carbono organico.
 *
 * Reference: Di Toro, D.M. et al. (1991). Technical basis for establishing
 * sediment quality criteria for nonionic organic chemicals using equilibrium
 * partitioning. Environ. Toxicol. Chem. 10(8), 1541-1583.
 *
 * @param {number} concentration - Measured sediment concentration (mg/kg)
 * @param {number} foc - Measured fraction of organic carbon (0-1)
 * @param {number} [referenceOC=0.01] - Reference OC fraction (default 1% = 0.01)
 * @returns {{
 *   rawConcentration: number,
 *   normalizedConcentration: number,
 *   foc: number,
 *   referenceOC: number,
 *   normalizationFactor: number
 * }}
 */
export function organicCarbonNormalization(concentration: number, foc: number, referenceOC: number = 0.01): { rawConcentration: number, normalizedConcentration: number, foc: number, referenceOC: number, normalizationFactor: number } {
    if (foc <= 0 || foc > 1) throw new Error('organicCarbonNormalization: foc must be in (0, 1]');
    if (referenceOC <= 0 || referenceOC > 1) {
        throw new Error('organicCarbonNormalization: referenceOC must be in (0, 1]');
    }
    if (concentration < 0) throw new Error('organicCarbonNormalization: concentration must be non-negative');

    // Normalize measured concentration to reference OC content
    // C_norm = C_raw × (foc / referenceOC)
    const normalizationFactor = foc / referenceOC;
    const normalizedConcentration = concentration * normalizationFactor;

    return {
        rawConcentration: concentration,
        normalizedConcentration,
        foc,
        referenceOC,
        normalizationFactor,
    };
}

// ----------------------------------------------------------------
// FUNCTION 8 - sedimentResuspensionFlux
// Fluxo de ressuspensao - formula de Partheniades (1965)
// ----------------------------------------------------------------

/**
 * Calculate cohesive sediment erosion flux using Partheniades (1965) formula.
 * Calcula o fluxo de erosao de sedimentos coesivos pela formula de Partheniades.
 *
 * Reference: Partheniades, E. (1965). Erosion and deposition of cohesive soils.
 * J. Hydraul. Div. ASCE, 91(HY1), 105-139.
 *
 * @param {number} bedShearStressPa - Applied bed shear stress τ (Pa)
 * @param {number} criticalShearStressPa - Critical shear stress τ_crit for erosion (Pa)
 * @param {number} erodibilityKgM2s - Erodibility coefficient M (kg/m²/s), typical 0.001-0.01
 * @param {number|null} [settlingVelocityMs=null] - Particle settling velocity (m/s), for deposition calc
 * @param {number|null} [suspendedSedimentKgM3=null] - Suspended sediment concentration (kg/m³)
 * @returns {{
 *   erosionFlux: number,
 *   depositionFlux: number|null,
 *   netFlux: number,
 *   erosionOccurring: boolean
 * }}
 */
export function sedimentResuspensionFlux(bedShearStressPa: number, criticalShearStressPa: number, erodibilityKgM2s: number, settlingVelocityMs: number|null = null, suspendedSedimentKgM3: number|null = null): { erosionFlux: number, depositionFlux: number|null, netFlux: number, erosionOccurring: boolean } {
    if (criticalShearStressPa <= 0) {
        throw new Error('sedimentResuspensionFlux: criticalShearStressPa must be positive');
    }
    if (erodibilityKgM2s < 0) {
        throw new Error('sedimentResuspensionFlux: erodibilityKgM2s must be non-negative');
    }

    // Partheniades erosion formula: E = M × (τ/τ_crit - 1) if τ > τ_crit, else 0
    const erosionOccurring = bedShearStressPa > criticalShearStressPa;
    const erosionFlux = erosionOccurring ? erodibilityKgM2s * (bedShearStressPa / criticalShearStressPa - 1) : 0;

    // Deposition flux: D = w_s × C (Krone 1962 deposition, complement of Partheniades)
    let depositionFlux = null;
    if (settlingVelocityMs !== null && suspendedSedimentKgM3 !== null) {
        depositionFlux = settlingVelocityMs * suspendedSedimentKgM3;
    }

    // Net flux: positive = erosion dominates, negative = deposition dominates
    const netFlux = depositionFlux !== null ? erosionFlux - depositionFlux : erosionFlux;

    return {
        erosionFlux,
        depositionFlux,
        netFlux,
        erosionOccurring,
    };
}

// ----------------------------------------------------------------
// FUNCTION 9 - sedimentOxygenDemand
// Demanda de oxigenio do sedimento (USEPA 1985, Chapra 1997)
// ----------------------------------------------------------------

/**
 * Calculate Sediment Oxygen Demand (SOD) with temperature correction.
 * Calcula a Demanda de Oxigenio do Sedimento (DQS) com correcao de temperatura.
 *
 * Temperature correction: SOD_T = SOD_20 × θ^(T-20)
 * where θ = 1.065 (Bowie et al. 1985, USEPA EPA/600/3-85/040)
 *
 * Reference: USEPA (1985). Rates, constants, and kinetics formulations
 * in surface water quality modeling (2nd ed.). EPA/600/3-85/040.
 * Chapra, S.C. (1997). Surface Water-Quality Modeling. McGraw-Hill.
 *
 * @param {number} sedimentArea_m2 - Sediment bed area (m²)
 * @param {number} temperature_C - Water temperature (°C)
 * @param {number} sod_g_m2_d - SOD at 20°C reference (g O₂/m²/day)
 * @param {number|null} [flowM3d=null] - Volumetric flow rate for DO depletion calc (m³/day)
 * @returns {{
 *   sodCorrectedGM2D: number,
 *   dailyDemandKgO2d: number,
 *   annualTonnesO2: number,
 *   temperature_C: number,
 *   deltaOmgL: number|null
 * }}
 */
export function sedimentOxygenDemand(sedimentArea_m2: number, temperature_C: number, sod_g_m2_d: number, flowM3d: number|null = null): { sodCorrectedGM2D: number, dailyDemandKgO2d: number, annualTonnesO2: number, temperature_C: number, deltaOmgL: number|null } {
    if (sedimentArea_m2 <= 0) throw new Error('sedimentOxygenDemand: sedimentArea_m2 must be positive');
    if (sod_g_m2_d <= 0) throw new Error('sedimentOxygenDemand: sod_g_m2_d must be positive');

    // Temperature correction (Bowie et al. 1985): theta = 1.065
    const THETA = 1.065;
    const sodCorrectedGM2D = sod_g_m2_d * Math.pow(THETA, temperature_C - 20);

    // Total daily oxygen demand
    const dailyDemandG = sodCorrectedGM2D * sedimentArea_m2;
    const dailyDemandKgO2d = dailyDemandG / 1000;

    // Annual oxygen demand
    const annualTonnesO2 = (dailyDemandKgO2d * 365) / 1000;

    // DO depletion in water column (if flow is given)
    let deltaOmgL = null;
    if (flowM3d !== null && flowM3d > 0) {
        // deltaO [mg/L] = dailyDemandG / (flowM3d [m³/d] × 1000 [L/m³])
        deltaOmgL = dailyDemandG / (flowM3d * 1000);
    }

    return {
        sodCorrectedGM2D,
        dailyDemandKgO2d,
        annualTonnesO2,
        temperature_C,
        deltaOmgL,
    };
}

// ----------------------------------------------------------------
// FUNCTION 10 - dredgingVolume
// Volume de dragagem (diretrizes USEPA DMMO)
// ----------------------------------------------------------------

/**
 * Calculate dredging volumes, masses, and disposal requirements per USEPA DMMO.
 * Calcula volumes de dragagem, massas e requisitos de confinamento conforme USEPA DMMO.
 *
 * Reference: USEPA Dredging Material Management Office (DMMO) guidelines.
 * US Army Corps of Engineers (USACE) dredging cost estimates.
 *
 * @param {number} areaM2 - Contaminated bed area (m²)
 * @param {number} contaminatedDepthM - Thickness of contaminated sediment layer (m)
 * @param {number} bulkDensity - Wet bulk density of sediment (t/m³, typical 1.3-1.8)
 * @param {number} [overdredgeM=0.15] - Overdredge allowance (m), USACE typically 0.15 m
 * @returns {{
 *   designVolumeM3: number,
 *   wetMassTonnes: number,
 *   dryMassTonnes: number,
 *   disposalVolumeM3: number,
 *   costEstimateUSD: number
 * }}
 */
export function dredgingVolume(areaM2: number, contaminatedDepthM: number, bulkDensity: number, overdredgeM: number = 0.15): { designVolumeM3: number, wetMassTonnes: number, dryMassTonnes: number, disposalVolumeM3: number, costEstimateUSD: number } {
    if (areaM2 <= 0) throw new Error('dredgingVolume: areaM2 must be positive');
    if (contaminatedDepthM <= 0) throw new Error('dredgingVolume: contaminatedDepthM must be positive');
    if (bulkDensity <= 0) throw new Error('dredgingVolume: bulkDensity must be positive');
    if (overdredgeM < 0) throw new Error('dredgingVolume: overdredgeM must be non-negative');

    // Design volume: area × (contaminated depth + overdredge allowance)
    const designVolumeM3 = areaM2 * (contaminatedDepthM + overdredgeM);

    // Wet mass: volume × wet bulk density
    const wetMassTonnes = designVolumeM3 * bulkDensity;

    // Dry mass (assuming 70% water content by mass): dry = wet × 0.3
    const dryMassTonnes = wetMassTonnes * 0.3;

    // Disposal cell volume: design volume × 1.30 expansion factor (swell factor)
    const disposalVolumeM3 = designVolumeM3 * 1.3;

    // Rough cost estimate: $65/m³ (USACE 2023 unit cost approximation)
    const costEstimateUSD = designVolumeM3 * 65;

    return {
        designVolumeM3,
        wetMassTonnes,
        dryMassTonnes,
        disposalVolumeM3,
        costEstimateUSD,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const sedimentQualityAssessmentMeta = {
    name: 'sedimentQualityAssessment',
    description: 'sedimentQualityAssessment',
    category: 'analytics',
    familyTags: ['sediment'],
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
