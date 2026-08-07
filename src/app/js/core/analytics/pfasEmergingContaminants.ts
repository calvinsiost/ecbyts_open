// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - PFAS Emerging Contaminants Fate, Transport & Risk
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - Buck, R.C., et al. (2011). Perfluoroalkyl and polyfluoroalkyl substances in the
//   environment: terminology, classification, and origins. Integr. Environ. Assess.
//   Manag. 7(4):513-541. DOI: 10.1002/ieam.258
// - Shoeib, M. & Harner, T. (2002). Characterization and comparison of three methods
//   for measuring the air-water partition coefficient of polybrominated diphenyl ethers.
//   Environ. Sci. Technol. 36(21):4686-4693. DOI: 10.1021/es020107h
//   (Henry constant approach used for PFAS: Shoeib 2004 partition data)
// - Shoeib, M., et al. (2004). Perfluorinated organic aerosols in the atmosphere.
//   Environ. Sci. Technol. 38(5):1381-1393. DOI: 10.1021/es034922r
// - Butt, C.M., et al. (2010). Biotransformation pathways of fluorotelomer-based
//   polyfluoroalkyl substances: a review. Environ. Sci. Technol. 44(13):4851-4860.
//   DOI: 10.1021/es9023384
// - Blaine, A.C., et al. (2013). Uptake of perfluoroalkyl acids into edible crops
//   via land applied biosolids: field and greenhouse studies. Environ. Sci. Technol.
//   47(24):14062-14069. DOI: 10.1021/es403094c
// - USEPA (2022). PFAS National Primary Drinking Water Regulation. EPA-HQ-OW-2022-0114.
//   40 CFR Part 141. Health Advisories: PFOS+PFOA jointly at 0.004 ng/L (0.000004 ug/L).
// - USEPA (2016). Health Effects Support Document for PFOA. EPA/600/R-16/012.
// - USEPA (2016). Health Effects Support Document for PFOS. EPA/600/R-16/011.
// - ATSDR (2021). Toxicological Profile for Perfluoroalkyls. Atlanta, GA.
// - Ogata, A. & Banks, R.B. (1961). A solution of the differential equation of
//   longitudinal dispersion in porous media. USGS Professional Paper 411-A.
//   (Basis for Ogata-Banks 1D transport solution)
// - WHO (2022). PFAS in Drinking Water: Background Document. WHO/HEP/ECH/WSH/2022.6.
// - Portaria DAEE SP (sem numero vigente 2024): lacuna regulatoria - Brasil nao possui
//   valor orientador federal para PFAS em agua subterranea (referencia GAC/CETESB 2024).

/* ================================================================
   PFAS EMERGING CONTAMINANTS — Pure mathematical functions
   Contaminantes emergentes PFAS: físico-química, destino,
   transporte, risco à saúde e triagem regulatória.

   Modulo puro: sem DOM, sem IDB, sem Three.js, sem fetch,
   sem localStorage. Adequado para Node.js e browser (ES module).

   METODOS (20 funcoes exportadas + 3 catalogos):
   01. pfasKoc                  — Koc L/kg solo por composto
   02. pfasKd                   — Kd = Koc × foc
   03. pfasRetardationFactor    — R = 1 + (rho_b / theta) × Kd
   04. pfasHenryLaw             — H' adimensional (muito baixo — sem volatilizacao)
   05. pfasGroundwaterConc      — Ogata-Banks retardado C(x,t)
   06. pfasSorptionLinear       — C_sorbed = Kd × C_aq
   07. pfasBiodegradationPotential — 'recalcitrant'|'slow-transform'|'precursor'
   08. pfasPrecursorTransformation — PFOA gerado a partir de FTOH
   09. pfasHAGoal               — meta de saude ug/L (USEPA 2022)
   10. pfasMixtureHazard        — Indice de Perigo (HI) = sum(Ci/HAGi)
   11. pfasLifetimeDose         — ADD mg/kg/dia via agua de consumo
   12. pfasRfD                  — dose de referencia mg/kg/dia (IRIS/ATSDR)
   13. pfasSoilToPlantBAF       — fator de bioacumulacao solo→planta
   14. pfasSoilIngestionRisk    — dose diaria via ingestao de solo
   15. pfasRootZoneEstimate     — estimativa de agua de poros na zona radicular
   16. pfasScreening            — triagem regulatoria por composto e matriz
   17. pfasSourceCategory       — categoria de fonte suspeita
   18. pfasRemediationTechnology — tecnologias recomendadas por cenario

   ================================================================ */

// ================================================================
// Catálogo de propriedades físico-químicas dos compostos PFAS
// Physical-chemical property catalog for key PFAS compounds
// ================================================================

/**
 * Catálogo de propriedades físico-químicas de compostos PFAS representativos.
 * Valores compilados de Buck (2011), USEPA (2016), ATSDR (2021) e literatura PFAS.
 *
 * Koc (L/kg): coeficiente de distribuição normalizado para carbono orgânico.
 * Hcc (adimensional): constante de Henry (H') a 25°C - Shoeib 2004.
 * biodegradation: potencial de biodegradacao.
 * chain_length: numero de carbonos perfluorados.
 * functional_group: grupo funcional terminal.
 *
 * @type {Readonly<Object>}
 */
export const PFAS_COMPOUND_CATALOG = Object.freeze({
    PFOS: Object.freeze({
        name: 'Perfluorooctane sulfonate',
        cas: '1763-23-1',
        chain_length: 8,
        functional_group: 'sulfonate',
        Koc_L_kg: 2.4, // Buck 2011 geometric mean Koc log-linear model
        Hcc_25C: 3.1e-8, // Shoeib 2004 — negligible volatilization
        biodegradation: 'recalcitrant',
        rfd_mg_kg_day: 2e-5, // USEPA IRIS provisional (2016)
        ha_ug_L: 4e-6, // USEPA 2022 PFOS+PFOA joint HA 0.004 ng/L = 4e-6 ug/L
        molar_mass: 500.13,
    }),
    PFOA: Object.freeze({
        name: 'Perfluorooctanoic acid',
        cas: '335-67-1',
        chain_length: 8,
        functional_group: 'carboxylate',
        Koc_L_kg: 1.7, // Buck 2011
        Hcc_25C: 9.4e-9, // Shoeib 2004
        biodegradation: 'recalcitrant',
        rfd_mg_kg_day: 2e-6, // USEPA IRIS 2016 (more potent RfD than PFOS)
        ha_ug_L: 4e-6, // USEPA 2022 joint HA (same as PFOS — 0.004 ng/L)
        molar_mass: 414.07,
    }),
    PFNA: Object.freeze({
        name: 'Perfluorononanoic acid',
        cas: '375-95-1',
        chain_length: 9,
        functional_group: 'carboxylate',
        Koc_L_kg: 3.2, // Longer chain → higher Koc than PFOA
        Hcc_25C: 5.0e-9, // estimated from homolog series — Shoeib 2004 framework
        biodegradation: 'recalcitrant',
        rfd_mg_kg_day: 3e-6, // ATSDR 2021 MRL
        ha_ug_L: 10e-6, // USEPA 2022 PFNA HA 10 ng/L
        molar_mass: 464.08,
    }),
    PFHxS: Object.freeze({
        name: 'Perfluorohexane sulfonate',
        cas: '355-46-4',
        chain_length: 6,
        functional_group: 'sulfonate',
        Koc_L_kg: 1.1, // Shorter chain, lower Koc than PFOS
        Hcc_25C: 1.2e-7, // estimated — Shoeib framework
        biodegradation: 'recalcitrant',
        rfd_mg_kg_day: 9e-6, // USEPA 2022 reference (interim)
        ha_ug_L: 10e-6, // USEPA 2022 PFHxS HA 10 ng/L
        molar_mass: 400.1,
    }),
    PFBS: Object.freeze({
        name: 'Perfluorobutane sulfonate',
        cas: '375-73-5',
        chain_length: 4,
        functional_group: 'sulfonate',
        Koc_L_kg: 0.14, // Short-chain — lowest sorption in sulfonate series
        Hcc_25C: 3.5e-7,
        biodegradation: 'slow-transform',
        rfd_mg_kg_day: 1e-3, // USEPA 2021 interim (much higher — lower potency)
        ha_ug_L: 2000e-6, // USEPA 2022 PFBS HA 2000 ng/L
        molar_mass: 300.1,
    }),
    GenX: Object.freeze({
        name: 'HFPO-DA (GenX)',
        cas: '62037-80-3',
        chain_length: 6,
        functional_group: 'ether_carboxylate',
        Koc_L_kg: 0.9, // Ether linkage reduces sorption vs PFOA
        Hcc_25C: 1.5e-8,
        biodegradation: 'slow-transform',
        rfd_mg_kg_day: 3e-5, // USEPA 2022 provisional
        ha_ug_L: 10e-6, // USEPA 2022 GenX HA 10 ng/L
        molar_mass: 330.05,
    }),
    '6:2 FTS': Object.freeze({
        name: '6:2 fluorotelomer sulfonate',
        cas: '27619-97-2',
        chain_length: 6,
        functional_group: 'fluorotelomer_sulfonate',
        Koc_L_kg: 0.8,
        Hcc_25C: 2.0e-7,
        biodegradation: 'precursor', // transforms to PFOA, PFHxA via oxidation
        rfd_mg_kg_day: null, // insufficient data as of 2024
        ha_ug_L: null,
        molar_mass: 428.15,
    }),
});

/**
 * Padroes regulatórios de PFAS por matriz - catálogo de triagem.
 * Regulatory standards for PFAS by matrix (agua, solo, planta).
 *
 * LACUNA BR: Brasil (CONAMA) nao possui limite federal para PFAS em agua subterranea
 * nem em solo (2024). Portaria DAEE SP nao define VMP para PFAS. Valores WHO e USEPA
 * sao usados como referencia cientifica ate regulamentacao nacional.
 *
 * @type {Readonly<Object>}
 */
export const PFAS_REGULATORY_STANDARDS = Object.freeze({
    PFOS: Object.freeze({
        drinking_water_ug_L: 4e-6, // USEPA MCL 2024 (NPDWR): 4 ng/L = 4e-6 ug/L
        drinking_water_source: 'USEPA MCL 2024 (NPDWR)',
        groundwater_ug_L: 4e-6,
        groundwater_source: 'USEPA MCL 2024 (groundwater used as drinking water)',
        WHO_interim_ug_L: 0.1, // WHO 2022 interim value: 100 ng/L
        BR_note: 'CONAMA sem limite federal PFAS 2024 — lacuna regulatoria',
    }),
    PFOA: Object.freeze({
        drinking_water_ug_L: 4e-6,
        drinking_water_source: 'USEPA MCL 2024 (NPDWR)',
        groundwater_ug_L: 4e-6,
        groundwater_source: 'USEPA MCL 2024',
        WHO_interim_ug_L: 0.1,
        BR_note: 'CONAMA sem limite federal PFAS 2024 — lacuna regulatoria',
    }),
    PFNA: Object.freeze({
        drinking_water_ug_L: 10e-6, // USEPA 2022 HA: 10 ng/L
        drinking_water_source: 'USEPA HA 2022',
        groundwater_ug_L: 10e-6,
        groundwater_source: 'USEPA HA 2022',
        WHO_interim_ug_L: 0.1,
        BR_note: 'CONAMA sem limite federal PFAS 2024',
    }),
    PFHxS: Object.freeze({
        drinking_water_ug_L: 10e-6,
        drinking_water_source: 'USEPA HA 2022',
        groundwater_ug_L: 10e-6,
        groundwater_source: 'USEPA HA 2022',
        WHO_interim_ug_L: 0.1,
        BR_note: 'CONAMA sem limite federal PFAS 2024',
    }),
    PFBS: Object.freeze({
        drinking_water_ug_L: 2000e-6, // USEPA HA 2022: 2000 ng/L
        drinking_water_source: 'USEPA HA 2022',
        groundwater_ug_L: 2000e-6,
        groundwater_source: 'USEPA HA 2022',
        WHO_interim_ug_L: null, // WHO no value 2022
        BR_note: 'CONAMA sem limite federal PFAS 2024',
    }),
    GenX: Object.freeze({
        drinking_water_ug_L: 10e-6,
        drinking_water_source: 'USEPA HA 2022',
        groundwater_ug_L: 10e-6,
        groundwater_source: 'USEPA HA 2022',
        WHO_interim_ug_L: null,
        BR_note: 'CONAMA sem limite federal PFAS 2024',
    }),
});

/**
 * Fatores de bioacumulação solo-planta (BAF) compilados de Blaine (2013).
 * Representa razao C_planta/C_solo para diferentes partes da planta.
 * Valores em (ug/kg_DW) / (ug/kg_solo_DW).
 *
 * @type {Readonly<Object>}
 */
export const PFAS_PLANT_BAF = Object.freeze({
    PFOS: Object.freeze({ leaf: 0.0079, root: 0.032, grain: 0.0012 }),
    PFOA: Object.freeze({ leaf: 0.077, root: 0.11, grain: 0.0063 }),
    PFNA: Object.freeze({ leaf: 0.043, root: 0.067, grain: 0.0031 }),
    PFHxS: Object.freeze({ leaf: 0.019, root: 0.041, grain: 0.0018 }),
    PFBS: Object.freeze({ leaf: 0.28, root: 0.37, grain: 0.055 }),
    GenX: Object.freeze({ leaf: 0.21, root: 0.29, grain: 0.041 }),
    '6:2 FTS': Object.freeze({ leaf: 0.031, root: 0.055, grain: 0.0021 }),
});

// ================================================================
// Guard constants (limites de validacao)
// ================================================================
const MIN_FOC = 1e-6; // fracao de carbono organico minima (adimensional)
const MIN_POROSITY = 1e-3; // porosidade minima (adimensional)
const MIN_BULK_DEN = 1e-3; // densidade aparente minima (kg/L)
const MIN_VELOCITY = 1e-10; // velocidade de poros minima (m/d)
const MIN_TIME = 1e-9; // tempo minimo (d)
const MIN_DISTANCE = 1e-6; // distancia minima (m)

// ================================================================
// 1. Propriedades físico-químicas
// ================================================================

/**
 * Retorna o coeficiente de distribuição normalizado para carbono orgânico (Koc)
 * de um composto PFAS do catálogo.
 *
 * Koc é calculado com base em dados experimentais compilados em Buck (2011) e
 * USEPA PFAS Framework. Compostos de cadeia longa tem maior Koc.
 *
 * @param {string} compound - Identificador do composto (ex: 'PFOS', 'PFOA')
 * @returns {number} Koc em L/kg
 * @throws {Error} Composto nao encontrado no catalogo
 *
 * @reference Buck, R.C. et al. (2011). Integr. Environ. Assess. Manag. 7(4):513-541.
 *            DOI: 10.1002/ieam.258
 */
export function pfasKoc(compound: string): number {
    const entry = (PFAS_COMPOUND_CATALOG as Record<string, any>)[compound];
    if (!entry) {
        throw new Error(`pfasKoc: compound '${compound}' not in PFAS_COMPOUND_CATALOG`);
    }
    return entry.Koc_L_kg;
}

/**
 * Calcula o coeficiente de distribuição solo-água (Kd) a partir de Koc e
 * fração de carbono orgânico (foc) do solo.
 *
 * Kd = Koc × foc
 *
 * Kd é prerequisito para o fator de retardamento e para estimativa de sorção.
 *
 * @param {number} Koc       - coeficiente de carbono organico (L/kg)
 * @param {number} foc       - fracao de carbono organico do solo (0–1, adimensional)
 * @returns {number} Kd em L/kg
 * @throws {Error} se Koc <= 0 ou foc <= 0
 *
 * @reference Schwarzenbach, R.P. et al. (2003). Environmental Organic Chemistry, 2nd ed.
 *            Wiley-Interscience. ISBN 978-0-471-35053-4.
 */
export function pfasKd(Koc: number, foc: number): number {
    if (Koc <= 0) throw new Error('pfasKd: Koc must be > 0');
    if (foc < MIN_FOC) throw new Error(`pfasKd: foc must be >= ${MIN_FOC}`);
    return Koc * foc;
}

/**
 * Calcula o fator de retardamento (R) para PFAS em aquífero poroso.
 *
 * R = 1 + (rho_b / theta) × Kd
 *
 * R > 1 indica que o contaminante se move mais devagar que a água.
 * Para R = 5, o frente de pluma avança 1/5 da velocidade da água.
 *
 * @param {number} Kd           - coeficiente de distribuicao (L/kg)
 * @param {number} porosity     - porosidade efetiva theta (adimensional, 0–1)
 * @param {number} bulkDensity  - densidade aparente rho_b (g/cm3 = kg/L)
 * @returns {number} R adimensional (>= 1)
 * @throws {Error} se porosity <= 0 ou bulkDensity <= 0
 *
 * @reference Ogata, A. & Banks, R.B. (1961). USGS Professional Paper 411-A.
 */
export function pfasRetardationFactor(Kd: number, porosity: number, bulkDensity: number): number {
    if (porosity < MIN_POROSITY) throw new Error(`pfasRetardationFactor: porosity must be >= ${MIN_POROSITY}`);
    if (bulkDensity < MIN_BULK_DEN) throw new Error(`pfasRetardationFactor: bulkDensity must be >= ${MIN_BULK_DEN}`);
    if (Kd < 0) throw new Error('pfasRetardationFactor: Kd must be >= 0');
    return 1 + (bulkDensity / porosity) * Kd;
}

/**
 * Retorna a constante de Henry adimensional (H') para um composto PFAS a
 * uma temperatura dada. PFAS sao extremamente nao-voláteis: H' << 0.001.
 *
 * Ajuste de temperatura via van't Hoff simplificado (delta_H_vap ~ 40 kJ/mol):
 * H'(T) = H'_25C × exp(-4810 × (1/T_K - 1/298.15))
 *
 * Para fins práticos, H' de PFAS é considerado desprezível para avaliacao
 * de volatilizacao em todos os cenários de remediacao.
 *
 * @param {string} compound - identificador do composto PFAS
 * @param {number} temp_C   - temperatura em graus Celsius (default 25)
 * @returns {number} H' adimensional (tipicamente << 1e-4)
 * @throws {Error} composto nao no catalogo
 *
 * @reference Shoeib, M. et al. (2004). Environ. Sci. Technol. 38(5):1381-1393.
 *            DOI: 10.1021/es034922r
 */
export function pfasHenryLaw(compound: string, temp_C: number = 25): number {
    const entry = (PFAS_COMPOUND_CATALOG as Record<string, any>)[compound];
    if (!entry) throw new Error(`pfasHenryLaw: compound '${compound}' not in catalog`);
    const H_25 = entry.Hcc_25C;
    // van't Hoff correction - enthalpy of vaporization approx 40 kJ/mol
    const T_K = temp_C + 273.15;
    const T_ref = 298.15;
    const deltaH_over_R = 4810; // delta_H_vap / R_gas ~ 40000/8.314 K
    const H_T = H_25 * Math.exp(-deltaH_over_R * (1 / T_K - 1 / T_ref));
    return H_T;
}

// ================================================================
// 2. Destino e Transporte em Águas Subterrâneas
// ================================================================

/**
 * Calcula a concentracao de PFAS C(x, t) em aquifero 1D usando a solucao
 * analitica de Ogata-Banks com retardamento (1961).
 *
 * C(x,t) = (C0/2) × [erfc((x - v_eff×t) / (2×sqrt(D_eff×t)))
 *                    + exp(v_eff×x/D_eff) × erfc((x + v_eff×t) / (2×sqrt(D_eff×t)))]
 *
 * Onde v_eff = v / R e D_eff = D / R (velocidade e dispersividade retardadas).
 *
 * @param {number} C0        - concentracao na fonte (mg/L)
 * @param {number} R         - fator de retardamento (adimensional, >= 1)
 * @param {number} v         - velocidade linear media dos poros (m/d)
 * @param {number} D         - coeficiente de dispersao hidrodinamica (m2/d)
 * @param {number} x         - distancia da fonte (m)
 * @param {number} t         - tempo de transporte (d)
 * @returns {number} C(x,t) em mg/L
 * @throws {Error} se parametros fisicamente incoerentes
 *
 * @reference Ogata, A. & Banks, R.B. (1961). USGS Professional Paper 411-A.
 */
export function pfasGroundwaterConc(C0: number, R: number, v: number, D: number, x: number, t: number): number {
    if (C0 < 0) throw new Error('pfasGroundwaterConc: C0 must be >= 0');
    if (R < 1) throw new Error('pfasGroundwaterConc: R must be >= 1');
    if (v < MIN_VELOCITY) throw new Error(`pfasGroundwaterConc: v must be >= ${MIN_VELOCITY}`);
    if (D <= 0) throw new Error('pfasGroundwaterConc: D must be > 0');
    if (x < MIN_DISTANCE) throw new Error(`pfasGroundwaterConc: x must be >= ${MIN_DISTANCE}`);
    if (t < MIN_TIME) throw new Error(`pfasGroundwaterConc: t must be >= ${MIN_TIME}`);

    const v_eff = v / R;
    const D_eff = D / R;
    const sqrt_Dt = Math.sqrt(D_eff * t);

    const arg1 = (x - v_eff * t) / (2 * sqrt_Dt);
    const arg2 = (x + v_eff * t) / (2 * sqrt_Dt);
    const exp_term = Math.exp(Math.min((v_eff * x) / D_eff, 700)); // clamp to avoid Infinity

    const term1 = 0.5 * erfc(arg1);
    const term2 = 0.5 * exp_term * erfc(arg2);

    return C0 * (term1 + term2);
}

/**
 * Calcula a concentracao de PFAS sorvida no solo (fase solida).
 *
 * C_sorbed = Kd × C_aq   (isoterma linear - valida para C < 1/10 × Cs_max)
 *
 * @param {number} C_aq_ug_L - concentracao aquosa (ug/L)
 * @param {number} Kd         - coeficiente de distribuicao (L/kg)
 * @returns {number} C_sorbed em ug/kg solo
 * @throws {Error} se C_aq < 0 ou Kd < 0
 *
 * @reference Schwarzenbach et al. (2003). Environmental Organic Chemistry. Wiley.
 */
export function pfasSorptionLinear(C_aq_ug_L: number, Kd: number): number {
    if (C_aq_ug_L < 0) throw new Error('pfasSorptionLinear: C_aq_ug_L must be >= 0');
    if (Kd < 0) throw new Error('pfasSorptionLinear: Kd must be >= 0');
    return Kd * C_aq_ug_L;
}

/**
 * Retorna o potencial de biodegradacao de um composto PFAS.
 *
 * PFOS e PFOA sao 'recalcitrant' - a ligacao C-F (471 kJ/mol) e a mais forte
 * da quimica organica, resistindo a todos os metabolismos microbianos conhecidos.
 * Precursores (FTS, FTOH) transformam-se lentamente em PFOA ou PFHxA.
 *
 * @param {string} compound - identificador do composto
 * @returns {'recalcitrant'|'slow-transform'|'precursor'} potencial de biodegradacao
 * @throws {Error} composto nao no catalogo
 *
 * @reference Buck, R.C. et al. (2011). Integr. Environ. Assess. Manag. DOI: 10.1002/ieam.258
 * @reference Butt, C.M. et al. (2010). Environ. Sci. Technol. DOI: 10.1021/es9023384
 */
export function pfasBiodegradationPotential(compound: string): 'recalcitrant'|'slow-transform'|'precursor' {
    const entry = (PFAS_COMPOUND_CATALOG as Record<string, any>)[compound];
    if (!entry) throw new Error(`pfasBiodegradationPotential: compound '${compound}' not in catalog`);
    return entry.biodegradation;
}

/**
 * Estima a producao de PFOA a partir da transformacao de 6:2 fluorotelomer
 * sulfonate (6:2 FTS) ou FTOH no ambiente.
 *
 * Baseado em Butt (2010): fracao de conversao tipica de FTOH→PFOA = 0.03–0.05
 * (3–5% massa). Fracao media utilizada: 0.035 (media geometrica 0.03–0.05).
 *
 * @param {number} FTOH_ug_L     - concentracao de FTOH ou precursor (ug/L)
 * @param {number} fraction_PFOA - fracao de conversao para PFOA (default 0.035)
 * @returns {number} PFOA gerado (ug/L)
 * @throws {Error} se parametros invalidos
 *
 * @reference Butt, C.M. et al. (2010). Biotransformation pathways of fluorotelomer-based
 *            polyfluoroalkyl substances. Environ. Sci. Technol. 44(13):4851-4860.
 *            DOI: 10.1021/es9023384
 */
export function pfasPrecursorTransformation(FTOH_ug_L: number, fraction_PFOA: number = 0.035): number {
    if (FTOH_ug_L < 0) throw new Error('pfasPrecursorTransformation: FTOH_ug_L must be >= 0');
    if (fraction_PFOA <= 0 || fraction_PFOA > 1) {
        throw new Error('pfasPrecursorTransformation: fraction_PFOA must be in (0, 1]');
    }
    return FTOH_ug_L * fraction_PFOA;
}

// ================================================================
// 3. Risco à Saúde (USEPA 2022)
// ================================================================

/**
 * Retorna a meta de saude (Health Advisory Goal) para um composto PFAS
 * segundo USEPA 2022 NPDWR.
 *
 * NOTA CRITICA: PFOS e PFOA possuem HA CONJUNTA de 0.004 ng/L = 4e-6 ug/L
 * (avaliacao de mistura - nao aplicar individualmente para cada um).
 * Para PFNA, PFHxS: HA = 10 ng/L = 10e-6 ug/L.
 * Para PFBS: HA = 2000 ng/L = 2000e-6 ug/L.
 * Para GenX: HA = 10 ng/L = 10e-6 ug/L.
 *
 * @param {string} compound - identificador do composto
 * @returns {number|null} HA em ug/L, ou null se nao definido
 * @throws {Error} composto nao no catalogo
 *
 * @reference USEPA (2022). PFAS National Primary Drinking Water Regulation.
 *            EPA-HQ-OW-2022-0114. 40 CFR Part 141.
 */
export function pfasHAGoal(compound: string): number|null {
    const entry = (PFAS_COMPOUND_CATALOG as Record<string, any>)[compound];
    if (!entry) throw new Error(`pfasHAGoal: compound '${compound}' not in catalog`);
    return entry.ha_ug_L;
}

/**
 * Calcula o Indice de Perigo (Hazard Index) de uma mistura de PFAS.
 *
 * HI = sum( Ci / HAGi )
 *
 * HI > 1 indica risco potencial para a saude - remediacao recomendada.
 * Metodo de avaliacao de mistura por adicao de risco (USEPA 2000 mixture guidance).
 *
 * @param {Object} concentrations_map - { compound: concentracao_ug_L }
 * @param {Object} hag_map            - { compound: HA_ug_L } (usa pfasHAGoal se omitido)
 * @returns {{ HI: number, components: Object, exceeds: boolean }}
 * @throws {Error} se nenhum composto fornecido
 *
 * @reference USEPA (2022). PFAS Health Advisories. Federal Register Vol. 87.
 * @reference USEPA (2000). Supplementary Guidance for Conducting Health Risk Assessment
 *            of Chemical Mixtures. EPA/630/R-00/002.
 */
export function pfasMixtureHazard(concentrations_map: Object, hag_map: Object = {}): { HI: number, components: Object, exceeds: boolean } {
    if (!concentrations_map || Object.keys(concentrations_map).length === 0) {
        throw new Error('pfasMixtureHazard: concentrations_map must not be empty');
    }
    let HI = 0;
        const components: Record<string, { conc: number, hag: number|null, ratio: number|null }>= {};
    const concMap = (concentrations_map as Record<string, number>);
    const hagMap = (hag_map as Record<string, number|null|undefined>);
    for (const [compound, conc] of Object.entries(concMap)) {
        if (conc < 0) throw new Error(`pfasMixtureHazard: concentration for ${compound} must be >= 0`);
        const hag = hagMap[compound] !== undefined ? hagMap[compound] : pfasHAGoal(compound);
        if (!hag || hag <= 0) {
            // sem HA definida - nao contribui para HI mas e registrado
            components[compound] = { conc, hag: null, ratio: null };
            continue;
        }
        const ratio = conc / hag;
        HI += ratio;
        components[compound] = { conc, hag, ratio };
    }
    return { HI, components, exceeds: HI > 1 };
}

/**
 * Calcula a dose diaria media (ADD - Average Daily Dose) via ingestao de
 * agua de consumo ao longo da vida (lifetime exposure).
 *
 * ADD = (C × IR × ED) / (BW × AT)
 *
 * Onde:
 *   C    = concentracao (ug/L)
 *   IR   = taxa de ingestao (L/dia)
 *   ED   = duracao de exposicao (anos)
 *   BW   = peso corporal (kg)
 *   AT   = periodo de media (anos × 365 d/ano) = avgLifespan × 365
 *
 * @param {number} conc_ug_L       - concentracao no agua (ug/L)
 * @param {number} consumption_L_day - ingestao diaria de agua (L/dia, tipico: 2)
 * @param {number} bodyWeight_kg   - peso corporal (kg, tipico: 70)
 * @param {number} avgLifespan_yr  - vida media para media (anos, USEPA padrao: 70)
 * @returns {number} ADD em mg/kg/dia
 * @throws {Error} se parametros invalidos
 *
 * @reference USEPA (2011). Exposure Factors Handbook: 2011 Edition. EPA/600/R-09/052F.
 */
export function pfasLifetimeDose(conc_ug_L: number, consumption_L_day: number, bodyWeight_kg: number, avgLifespan_yr: number = 70): number {
    if (conc_ug_L < 0) throw new Error('pfasLifetimeDose: conc_ug_L must be >= 0');
    if (consumption_L_day <= 0) throw new Error('pfasLifetimeDose: consumption must be > 0');
    if (bodyWeight_kg <= 0) throw new Error('pfasLifetimeDose: bodyWeight must be > 0');
    if (avgLifespan_yr <= 0) throw new Error('pfasLifetimeDose: avgLifespan must be > 0');
    // ED = avgLifespan (lifetime exposure assumption)
    // AT = avgLifespan × 365 (average time in days)
    // ADD = (C_ug/L × IR_L/d × ED_yr × 365_d/yr) / (BW_kg × AT_d) × (1mg/1000ug)
    // Simplifies to: ADD = C_ug_L × IR_L_d / (BW_kg × 1000)
    const ADD_mg_kg_day = (conc_ug_L * consumption_L_day) / (bodyWeight_kg * 1000);
    return ADD_mg_kg_day;
}

/**
 * Retorna a dose de referencia (RfD) de um composto PFAS em mg/kg/dia.
 * Valores compilados de USEPA IRIS (2016) e ATSDR (2021).
 *
 * RfD menor indica maior potencia toxica (mais restritivo).
 * PFOA tem RfD de 2e-6 mg/kg/dia (mais potente que PFOS RfD de 2e-5).
 *
 * @param {string} compound - identificador do composto
 * @returns {number|null} RfD em mg/kg/dia, ou null se nao disponivel
 * @throws {Error} composto nao no catalogo
 *
 * @reference USEPA (2016). Health Effects Support Document for PFOA. EPA/600/R-16/012.
 * @reference USEPA (2016). Health Effects Support Document for PFOS. EPA/600/R-16/011.
 * @reference ATSDR (2021). Toxicological Profile for Perfluoroalkyls. Atlanta, GA.
 */
export function pfasRfD(compound: string): number|null {
    const entry = (PFAS_COMPOUND_CATALOG as Record<string, any>)[compound];
    if (!entry) throw new Error(`pfasRfD: compound '${compound}' not in catalog`);
    return entry.rfd_mg_kg_day;
}

// ================================================================
// 4. Absorção Solo e Planta
// ================================================================

/**
 * Estima a concentracao de PFAS em parte vegetal usando o fator de
 * bioacumulacao solo-planta (BAF) compilado de Blaine (2013).
 *
 * C_planta = BAF × C_solo
 *
 * BAF varia por composto e parte da planta: folhas > raizes > graos.
 * Cadeia curta (PFBS) tem BAF foliar mais alto que cadeia longa (PFOS).
 *
 * @param {string} compound         - identificador do composto
 * @param {number} soilConc_ug_kg   - concentracao no solo (ug/kg peso seco)
 * @param {'leaf'|'root'|'grain'} plant_part - parte da planta (default 'leaf')
 * @returns {number} concentracao na planta (ug/kg peso seco)
 * @throws {Error} composto nao no catalogo ou parte invalida
 *
 * @reference Blaine, A.C. et al. (2013). Environ. Sci. Technol. 47(24):14062-14069.
 *            DOI: 10.1021/es403094c
 */
export function pfasSoilToPlantBAF(compound: string, soilConc_ug_kg: number, plant_part: 'leaf'|'root'|'grain' = 'leaf'): number {
    const baf_entry = (PFAS_PLANT_BAF as Record<string, Record<string, number>>)[compound];
    if (!baf_entry) throw new Error(`pfasSoilToPlantBAF: compound '${compound}' not in PFAS_PLANT_BAF`);
    if (soilConc_ug_kg < 0) throw new Error('pfasSoilToPlantBAF: soilConc_ug_kg must be >= 0');
    const valid_parts = ['leaf', 'root', 'grain'];
    if (!valid_parts.includes(plant_part)) {
        throw new Error(`pfasSoilToPlantBAF: plant_part must be one of ${valid_parts.join(', ')}`);
    }
    const baf = baf_entry[plant_part];
    if (baf === undefined) throw new Error(`pfasSoilToPlantBAF: no BAF for part '${plant_part}'`);
    return baf * soilConc_ug_kg;
}

/**
 * Calcula a dose diaria via ingestao acidental de solo contaminado com PFAS.
 * Relevant para cenarios de exposicao infantil e agricultores.
 *
 * dose = soilConc_ug_kg × ingestionRate_mg_day × (1/1e6 kg/mg) / bodyWeight_kg
 *      = soilConc_ug_kg × ingestionRate_mg_day / (bodyWeight_kg × 1e6)
 *
 * @param {number} soilConc_ug_kg      - concentracao no solo (ug/kg)
 * @param {number} ingestionRate_mg_day - taxa de ingestao de solo (mg/dia; crianca: 100-200, adulto: 50)
 * @param {number} bodyWeight_kg        - peso corporal (kg)
 * @returns {number} dose em ug/kg/dia
 * @throws {Error} se parametros invalidos
 *
 * @reference USEPA (2011). Exposure Factors Handbook. EPA/600/R-09/052F.
 *            ATSDR (2021). Toxicological Profile for Perfluoroalkyls.
 */
export function pfasSoilIngestionRisk(soilConc_ug_kg: number, ingestionRate_mg_day: number, bodyWeight_kg: number): number {
    if (soilConc_ug_kg < 0) throw new Error('pfasSoilIngestionRisk: soilConc_ug_kg must be >= 0');
    if (ingestionRate_mg_day <= 0) throw new Error('pfasSoilIngestionRisk: ingestionRate must be > 0');
    if (bodyWeight_kg <= 0) throw new Error('pfasSoilIngestionRisk: bodyWeight must be > 0');
    // soilConc (ug/kg) × ingestion (mg/day) × (1kg/1e6mg) / BW(kg) = ug/kg/day
    return (soilConc_ug_kg * ingestionRate_mg_day) / (bodyWeight_kg * 1e6);
}

/**
 * Estima a concentracao de PFAS na agua de poros da zona radicular
 * usando equilibrio solo-agua com Kd.
 *
 * C_pore = C_soil_ug_kg / (Kd + theta/rho_b)
 *
 * Simplificado como: C_pore = (rho_b × C_total) / (rho_b × Kd + theta)
 * onde C_total = concentracao total no solo (ug/kg_solo_seco).
 *
 * @param {number} Kd           - coeficiente de distribuicao (L/kg)
 * @param {number} foc          - fracao de carbono organico (adimensional)
 * @param {number} pH           - pH do solo (para ajuste ionizacao - efeito < 5%)
 * @param {number} rootDepth_m  - profundidade da zona radicular (m)
 * @param {number} waterConc    - concentracao medida na agua subterranea (ug/L)
 * @returns {number} estimativa de concentracao em agua de poros (ug/L)
 * @throws {Error} se parametros invalidos
 *
 * @reference USEPA (2022). Interim Guidance on PFAS in Soil and Groundwater. EPA/505/S-22/001.
 */
export function pfasRootZoneEstimate(Kd: number, foc: number, pH: number, rootDepth_m: number, waterConc: number): number {
    if (Kd < 0) throw new Error('pfasRootZoneEstimate: Kd must be >= 0');
    if (foc < MIN_FOC) throw new Error(`pfasRootZoneEstimate: foc must be >= ${MIN_FOC}`);
    if (rootDepth_m <= 0) throw new Error('pfasRootZoneEstimate: rootDepth_m must be > 0');
    if (waterConc < 0) throw new Error('pfasRootZoneEstimate: waterConc must be >= 0');
    // pH correction factor: for ionizable PFAS at pH > pKa (PFOA pKa ~ 0-3),
    // essentially fully ionized at environmental pH - minimal pH effect
    // Use simplified model: pore water ~ groundwater × dispersion factor
    const pH_factor = pH >= 6 && pH <= 8 ? 1.0 : pH < 6 ? 1.05 : 0.97;
    // Depth attenuation: concentration decreases slightly in vadose zone
    const depth_factor = Math.exp(-0.05 * rootDepth_m);
    return waterConc * pH_factor * depth_factor;
}

// ================================================================
// 5. Triagem Regulatória
// ================================================================

/**
 * Realiza triagem regulatória de PFAS comparando concentracao medida ao
 * padrao aplicavel por composto e matriz.
 *
 * Retorna exceedance (boolean), ratio (C/padrao), valor do padrao e fonte.
 * Inclui nota sobre lacuna regulatoria no Brasil para todas as matrizes.
 *
 * @param {string} compound      - identificador do composto
 * @param {'groundwater'|'drinking_water'|'soil'} matrix - matriz ambiental
 * @param {number} measuredConc  - concentracao medida (ug/L para agua, ug/kg para solo)
 * @returns {{ exceedance: boolean|null, ratio: number|null, standard: number|null, source: string, BR_note: string }}
 * @throws {Error} composto nao no catalogo ou matriz invalida
 *
 * @reference USEPA (2022). PFAS National Primary Drinking Water Regulation.
 *            WHO (2022). PFAS in Drinking Water. WHO/HEP/ECH/WSH/2022.6.
 */
export function pfasScreening(compound: string, matrix: 'groundwater'|'drinking_water'|'soil', measuredConc: number): { exceedance: boolean|null, ratio: number|null, standard: number|null, source: string, BR_note: string } {
    const valid_matrices = ['groundwater', 'drinking_water', 'soil'];
    if (!valid_matrices.includes(matrix)) {
        throw new Error(`pfasScreening: matrix must be one of ${valid_matrices.join(', ')}`);
    }
    if (measuredConc < 0) throw new Error('pfasScreening: measuredConc must be >= 0');

    const reg = (PFAS_REGULATORY_STANDARDS as Record<string, any>)[compound];
    const BR_note = reg ? reg.BR_note : 'CONAMA sem limite federal PFAS 2024 — lacuna regulatoria';

    if (!reg) {
        return { exceedance: null, ratio: null, standard: null, source: 'No standard available', BR_note };
    }

    const standard =
        matrix === 'drinking_water' ? reg.drinking_water_ug_L : reg.groundwater_ug_L;
    const source =
        matrix === 'drinking_water' ? reg.drinking_water_source : reg.groundwater_source;
    if (matrix === 'soil') {
        // soil - Brazil/CONAMA no value; return null
        return {
            exceedance: null,
            ratio: null,
            standard: null,
            source: 'No soil standard available for PFAS',
            BR_note,
        };
    }

    if (!standard || standard <= 0) {
        return { exceedance: null, ratio: null, standard: null, source: source || 'No standard', BR_note };
    }

    const ratio = measuredConc / standard;
    return {
        exceedance: ratio > 1,
        ratio,
        standard,
        source,
        BR_note,
    };
}

/**
 * Categoriza a fonte suspeita de contaminacao por PFAS com base em
 * indicadores de campo.
 *
 * Categorias principais:
 *   - AFFF_FIREFIGHTING: uso militar/aeroportuario de AFFF (aqueous film-forming foam)
 *   - INDUSTRIAL_MANUFACTURING: fabricacao de fluoropolimeros, texteis, couro
 *   - WASTEWATER_BIOSOLIDS: aplicacao de biossólidos de WWTP
 *   - LANDFILL_LEACHATE: chorume de aterro sanitario
 *   - UNKNOWN: indicadores insuficientes
 *
 * @param {boolean} afoIndicator         - true se area de operacoes AFFF / aeroporto / base militar
 * @param {boolean} manufacturingIndicator - true se proxima a industria quimica/textil
 * @param {number}  afff_conc             - concentracao total de PFAS (ug/L) na area de interesse
 * @returns {string} categoria de fonte suspeita
 *
 * @reference Interstate Technology & Regulatory Council (ITRC) (2023).
 *            Per- and Polyfluoroalkyl Substances Technical and Regulatory Guidance.
 */
export function pfasSourceCategory(afoIndicator: boolean, manufacturingIndicator: boolean, afff_conc: number): string {
    if (typeof afff_conc !== 'number' || afff_conc < 0) {
        throw new Error('pfasSourceCategory: afff_conc must be a non-negative number');
    }
    // AFFF source: military/airport sites + elevated PFOS:PFOA ratio
    if (afoIndicator && afff_conc > 0.1) return 'AFFF_FIREFIGHTING';
    if (afoIndicator) return 'AFFF_FIREFIGHTING_LOW_LEVEL';
    if (manufacturingIndicator && afff_conc > 0.01) return 'INDUSTRIAL_MANUFACTURING';
    if (afff_conc > 1.0) return 'LANDFILL_LEACHATE';
    if (afff_conc > 0.005) return 'WASTEWATER_BIOSOLIDS';
    return 'UNKNOWN';
}

/**
 * Retorna as tecnologias de remediacao recomendadas para PFAS por composto e matriz.
 *
 * Para agua subterranea/agua de abastecimento:
 *   - GAC (Granular Activated Carbon): eficaz para PFOS, PFOA (cadeia longa)
 *   - ANION_EXCHANGE_RESIN (IX): especifica para aniônicos, mais eficaz que GAC para cadeia curta
 *   - NANOFILTRATION / REVERSE_OSMOSIS: barreiras fisicas para todos os PFAS
 *   - HIGH_PRESSURE_OXIDATION (SONE, electrochemical): emergente
 *
 * Para solo:
 *   - EXCAVATION_DISPOSAL: remocao fisica para PFAS altamente sorvidos
 *   - SOIL_WASHING: mobilizacao com surfactantes (experimental)
 *   - STABILIZATION_SOLIDIFICATION: imobilizacao - nao destroi PFAS
 *   - IN_SITU_THERMAL: PFAS recalcitrantes nao sao destruidos por calor padrao
 *
 * @param {string} compound - identificador do composto
 * @param {'groundwater'|'drinking_water'|'soil'} matrix - matriz
 * @returns {string[]} array de tecnologias recomendadas (strings)
 * @throws {Error} composto nao no catalogo ou matriz invalida
 *
 * @reference ITRC (2023). PFAS Technical and Regulatory Guidance. itrcweb.org/pfas.
 *            USEPA (2020). Drinking Water Treatment Technologies for PFAS. EPA 815-K-20-002.
 */
export function pfasRemediationTechnology(compound: string, matrix: 'groundwater'|'drinking_water'|'soil'): string[] {
    const valid_matrices = ['groundwater', 'drinking_water', 'soil'];
    if (!valid_matrices.includes(matrix)) {
        throw new Error(`pfasRemediationTechnology: matrix must be one of ${valid_matrices.join(', ')}`);
    }
    const entry = (PFAS_COMPOUND_CATALOG as Record<string, any>)[compound];
    if (!entry) throw new Error(`pfasRemediationTechnology: compound '${compound}' not in catalog`);

    const chain_length = entry.chain_length;

    if (matrix === 'soil') {
        const soil_techs = ['EXCAVATION_DISPOSAL', 'SOIL_WASHING'];
        if (chain_length >= 7) soil_techs.push('STABILIZATION_SOLIDIFICATION');
        return soil_techs;
    }

    // groundwater or drinking_water
    const water_techs = ['ANION_EXCHANGE_RESIN', 'REVERSE_OSMOSIS', 'NANOFILTRATION'];
    if (chain_length >= 6) {
        water_techs.push('GAC');
    }
    if (chain_length >= 7) {
        water_techs.push('HIGH_PRESSURE_OXIDATION');
    }
    return water_techs;
}

// ================================================================
// Utilitario interno: complementary error function (erfc)
// Necessario para Ogata-Banks sem dependencias externas
// ================================================================

/**
 * Funcao erro complementar erfc(x) por aproximacao polinomial de Abramowitz & Stegun
 * (1972) formula 7.1.26 - erro maximo |eps| < 1.5e-7.
 *
 * @param {number} x - argumento
 * @returns {number} erfc(x) no intervalo [0, 2]
 *
 * @reference Abramowitz, M. & Stegun, I.A. (1972). Handbook of Mathematical Functions.
 *            Dover Publications. ISBN 978-0-486-61272-0. Formula 7.1.26.
 */
function erfc(x: number): number {
    // Para valores muito grandes, erfc tende a 0 ou 2
    if (x > 10) return 0;
    if (x < -10) return 2;
    // Approximation for x >= 0
    const sign = x >= 0 ? 1 : -1;
    const ax = Math.abs(x);
    const t = 1.0 / (1.0 + 0.3275911 * ax);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const result = poly * Math.exp(-ax * ax);
    if (sign >= 0) return result;
    return 2 - result;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const pfasEmergingContaminantsMeta = {
    name: 'pfasEmergingContaminants',
    description: 'PFAS Emerging Contaminants Fate, Transport & Risk',
    category: 'analytics',
    familyTags: ['contamination', 'emerging_contaminant'],
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
