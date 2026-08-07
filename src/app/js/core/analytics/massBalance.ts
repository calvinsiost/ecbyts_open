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
// Application: EHS & Mining -- Environmental Mass Balance
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - Freeze, R.A. & Cherry, J.A. (1979). Groundwater. Prentice Hall.
//   ISBN 978-0-13-365312-0. (Chapters 2, 9: hydrologic balance, contaminant transport)
// - ASTM E2640-08 (2008). Standard Guide for Developing Conceptual Site Models
//   for Contaminated Sites. ASTM International.
// - Wiedemeier, T.H., Rifai, H.S., Newell, C.J. & Wilson, J.T. (1999).
//   Natural Attenuation of Fuels and Chlorinated Solvents in the Subsurface.
//   John Wiley & Sons. ISBN 0-471-19749-1.
// - USEPA (1998). Technical Protocol for Evaluating Natural Attenuation of
//   Chlorinated Solvents in Ground Water. EPA/600/R-98/128.
// - USEPA (1996). Soil Screening Guidance: Technical Background Document.
//   EPA/540/R-95/128. (RBCA DAF methodology)

// ---------------------------------------------------------------------------
// Benchmarks de referencia exportados
// Reference benchmarks for mass balance calculations
// ---------------------------------------------------------------------------

/**
 * Parâmetros de referência para balanços de massa ambiental.
 * Reference values compiled from ASTM E2640, USEPA RBCA, and Wiedemeier 1999.
 *
 * @type {Readonly<Record<string, any>>}
 */
export const MASS_BALANCE_BENCHMARKS = Object.freeze({
    /** Erro de fechamento aceitável para balanço hídrico (%) — Freeze & Cherry 1979 */
    closure_acceptable_percent: 5,
    /** DAF conservador (sem diluição) */
    DAF_conservative: 1.0,
    /** DAF típico para solo (USEPA RBCA Tier 1) */
    DAF_typical_soil: 10,
    /** DAF residencial para água subterrânea (USEPA RBCA Tier 1) */
    DAF_groundwater_residential: 100,
    /** Processos de aceptores de elétrons — Wiedemeier 1999, Table 3-1 */
    electron_acceptors: Object.freeze({
        O2: 'aerobic',
        Fe3: 'iron-reduction',
        SO4: 'sulfate-reduction',
        CO2: 'methanogenesis',
    }),
});

// ---------------------------------------------------------------------------
// Estequiometria de aceptores de elétrons
// Stoichiometric ratios from Wiedemeier (1999) Table 3-1 and 3-2
// (kg acceptor consumed per kg contaminant degraded; CH4 in m³ STP per kg)
// ---------------------------------------------------------------------------

/**
 * Razões estequiométricas para biorremedição.
 * Todos os valores rastreáveis a Wiedemeier 1999 e USEPA EPA/600/R-98/128.
 *
 * @private
 * @type {Readonly<Record<string, Readonly<Record<string, { acceptorRatio: number, CH4: number }>>>>}
 */
const STOICHIOMETRY = Object.freeze({
    benzene: Object.freeze({
        aerobic: { acceptorRatio: 3.07, CH4: 0 }, // ThOD C6H6 + 7.5 O2
        iron_reduction: { acceptorRatio: 21.8, CH4: 0 }, // Fe(III) reduction
        sulfate_reduction: { acceptorRatio: 4.58, CH4: 0 }, // SO4²⁻ reduction
        methanogenesis: { acceptorRatio: 0, CH4: 0.97 }, // m³ CH4 per kg benzene STP
    }),
    toluene: Object.freeze({
        aerobic: { acceptorRatio: 3.13, CH4: 0 }, // C7H8 + 9 O2
        iron_reduction: { acceptorRatio: 22.3, CH4: 0 },
        sulfate_reduction: { acceptorRatio: 4.67, CH4: 0 },
        methanogenesis: { acceptorRatio: 0, CH4: 1.04 },
    }),
    TCE: Object.freeze({
        aerobic: { acceptorRatio: 0.58, CH4: 0 }, // C2HCl3 (cometabolic)
        iron_reduction: { acceptorRatio: 4.12, CH4: 0 },
        sulfate_reduction: { acceptorRatio: 0.87, CH4: 0 },
        methanogenesis: { acceptorRatio: 0, CH4: 0.16 },
    }),
    PCE: Object.freeze({
        aerobic: { acceptorRatio: 0.43, CH4: 0 }, // C2Cl4 (cometabolic)
        iron_reduction: { acceptorRatio: 3.09, CH4: 0 },
        sulfate_reduction: { acceptorRatio: 0.65, CH4: 0 },
        methanogenesis: { acceptorRatio: 0, CH4: 0.12 },
    }),
});

// ---------------------------------------------------------------------------
// 1. Balanço hídrico (Thornthwaite)
// Hydrologic balance: P = ET + R + ΔS
// ---------------------------------------------------------------------------

/**
 * Calcula o balanço hídrico pelo método de Thornthwaite.
 * Computes the hydrologic water balance.
 *
 * P = ET + R + ΔS, onde o imbalance = P - ET - R - ΔS.
 * Erro de fechamento aceitável: < 5% da precipitação (Freeze & Cherry 1979, §2.2).
 *
 * @param {Object} params - Componentes do balanço hídrico (todos em mm/período)
 * @param {number} params.precipitation_mm  - Precipitação total P
 * @param {number} params.evapotranspiration_mm - Evapotranspiração real ET
 * @param {number} params.runoff_mm          - Escoamento superficial R
 * @param {number} params.storage_change_mm  - Variação de armazenamento ΔS (positivo = ganho)
 * @returns {Readonly<Object>} Resultado do balanço com imbalance e closure_percent
 * @throws {TypeError} Se algum parâmetro não for número finito
 */
export function computeHydrologicBalance(params: { precipitation_mm: number; evapotranspiration_mm: number; runoff_mm: number; storage_change_mm: number }): Readonly<Object> {
    const { precipitation_mm, evapotranspiration_mm, runoff_mm, storage_change_mm } = params;
    for (const [k, v] of Object.entries({ precipitation_mm, evapotranspiration_mm, runoff_mm, storage_change_mm })) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new TypeError(`computeHydrologicBalance: "${k}" must be a finite number, got ${v}`);
        }
    }

    const imbalance = precipitation_mm - evapotranspiration_mm - runoff_mm - storage_change_mm;
    // Evita divisão por zero quando P=0
    const closure_percent =
        precipitation_mm !== 0 ? Math.abs(imbalance / precipitation_mm) * 100 : imbalance === 0 ? 0 : NaN;

    return Object.freeze({
        precipitation: precipitation_mm,
        ET: evapotranspiration_mm,
        runoff: runoff_mm,
        deltaStorage: storage_change_mm,
        imbalance,
        closure_percent,
        balanced:
            Number.isFinite(closure_percent) && closure_percent < MASS_BALANCE_BENCHMARKS.closure_acceptable_percent,
    });
}

// ---------------------------------------------------------------------------
// 2. Balanço de massa de contaminante
// Contaminant mass balance in aquifer or vadose zone
// ---------------------------------------------------------------------------

/**
 * Calcula o balanço de massa de contaminante em aquífero ou zona vadosa.
 * Computes contaminant mass balance.
 *
 * Massa final = initialMass + sourceMass - degradedMass - elutedMass - volatilizedMass
 * Referência: Wiedemeier 1999, Chapter 5.
 *
 * @param {Object} params - Componentes de massa (todos em kg)
 * @param {number} params.initialMass_kg     - Massa inicial no sistema
 * @param {number} params.sourceMass_kg      - Massa adicionada pela fonte (0 se não há recarga)
 * @param {number} params.degradedMass_kg    - Massa degradada (biodegradação + abiotic)
 * @param {number} params.elutedMass_kg      - Massa removida por fluxo (solubilizada e transportada)
 * @param {number} params.volatilizedMass_kg - Massa volatilizada para zona não-saturada
 * @returns {Readonly<Object>} Resultado com finalMass, removalFraction e accountedFor_percent
 * @throws {TypeError} Se algum parâmetro não for número finito não-negativo
 */
export function computeContaminantMassBalance(params: { initialMass_kg: number; sourceMass_kg: number; degradedMass_kg: number; elutedMass_kg: number; volatilizedMass_kg: number }): Readonly<Object> {
    const { initialMass_kg, sourceMass_kg, degradedMass_kg, elutedMass_kg, volatilizedMass_kg } = params;
    for (const [k, v] of Object.entries({
        initialMass_kg,
        sourceMass_kg,
        degradedMass_kg,
        elutedMass_kg,
        volatilizedMass_kg,
    })) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
            throw new TypeError(`computeContaminantMassBalance: "${k}" must be a finite non-negative number, got ${v}`);
        }
    }

    const totalInput = initialMass_kg + sourceMass_kg;
    const massRemoved = degradedMass_kg + elutedMass_kg + volatilizedMass_kg;
    const finalMass = totalInput - massRemoved;

    const removalFraction = totalInput > 0 ? Math.min(1, Math.max(0, massRemoved / totalInput)) : 0;
    const accountedFor_percent = totalInput > 0 ? Math.min(100, (massRemoved / totalInput) * 100) : 0;

    return Object.freeze({
        finalMass,
        massRemoved,
        removalFraction,
        accountedFor_percent,
        method: 'mass-balance',
    });
}

// ---------------------------------------------------------------------------
// 3. Modelo de mistura - 2 componentes
// Two-component mixing model (conservative tracer)
// ---------------------------------------------------------------------------

/**
 * Modelo de mistura de dois componentes usando traçador conservativo.
 * Two-component end-member mixing analysis (EMMA).
 *
 * f1 = (Cmix - C2) / (C1 - C2)    [Freeze & Cherry 1979, eq. 7.5]
 * f2 = 1 - f1
 *
 * @param {Object} endMember1 - End-member 1 com concentração do traçador e analito
 * @param {number} endMember1.C1    - Concentração do traçador em EM1 (qualquer unidade)
 * @param {number} endMember1.conc1 - Concentração do analito de interesse em EM1
 * @param {Object} endMember2 - End-member 2
 * @param {number} endMember2.C2    - Concentração do traçador em EM2
 * @param {number} endMember2.conc2 - Concentração do analito de interesse em EM2
 * @param {Object} tracer - Valores observados na mistura
 * @param {number} tracer.Cmix - Concentração do traçador na mistura
 * @returns {Readonly<Object>} Frações de mistura f1, f2 e concentração prevista
 * @throws {RangeError} Se C1 === C2 (end-members indistinguíveis pelo traçador)
 * @throws {TypeError} Se parâmetros não forem números finitos
 */
export function mixingModel2Component(endMember1: { C1: number; conc1: number }, endMember2: { C2: number; conc2: number }, tracer: { Cmix: number }): Readonly<Object> {
    const { C1, conc1 = 0 } = endMember1;
    const { C2, conc2 = 0 } = endMember2;
    const { Cmix } = tracer;

    for (const [k, v] of Object.entries({ C1, C2, Cmix, conc1, conc2 })) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new TypeError(`mixingModel2Component: "${k}" must be a finite number, got ${v}`);
        }
    }

    if (Math.abs(C1 - C2) < Number.EPSILON * Math.max(Math.abs(C1), Math.abs(C2), 1)) {
        throw new RangeError(
            `mixingModel2Component: end-members are indistinguishable by tracer (C1=${C1}, C2=${C2}). ` +
                'Choose a tracer with greater contrast between end-members.',
        );
    }

    const f1 = (Cmix - C2) / (C1 - C2);
    const f2 = 1 - f1;
    const C_mixed = f1 * conc1 + f2 * conc2;
    const tracer_predicted = f1 * C1 + f2 * C2;
    const residual =
        Math.abs(Cmix) > Number.EPSILON
            ? Math.abs(tracer_predicted - Cmix) / Math.abs(Cmix)
            : Math.abs(tracer_predicted - Cmix);

    return Object.freeze({ f1, f2, C_mixed, tracer_predicted, residual });
}

// ---------------------------------------------------------------------------
// 4. Modelo de mistura - 3 componentes
// Three-component mixing model (two tracers, linear system 3×3)
// ---------------------------------------------------------------------------

/**
 * Modelo de mistura de três componentes usando dois traçadores conservativos.
 * Three-component EMMA - resolução do sistema linear 3×3 por substituição.
 *
 * Sistema:
 *   f1 + f2 + f3 = 1                        (closure)
 *   f1*t1_1 + f2*t1_2 + f3*t1_3 = t1_mix   (traçador 1)
 *   f1*t2_1 + f2*t2_2 + f3*t2_3 = t2_mix   (traçador 2)
 *
 * Referência: Christophersen & Hooper (1992) Water Resources Research 28(10).
 *
 * @param {Array<{id:string, t1:number, t2:number}>} endMembers - 3 end-members com 2 traçadores cada
 * @param {{t1_mix:number, t2_mix:number}} tracers - Valores observados na mistura
 * @returns {Readonly<Object>} Frações de mistura e end-members
 * @throws {TypeError} Se parâmetros forem inválidos
 * @throws {RangeError} Se sistema for singular (end-members colineares no espaço traçador)
 */
export function mixingModel3Component(endMembers: Array<{id:string, t1:number, t2:number}>, tracers: {t1_mix:number, t2_mix:number}): Readonly<Object> {
    if (!Array.isArray(endMembers) || endMembers.length !== 3) {
        throw new TypeError('mixingModel3Component: endMembers must be an array of exactly 3 objects');
    }
    const { t1_mix, t2_mix } = tracers;
    for (const [k, v] of Object.entries({ t1_mix, t2_mix })) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new TypeError(`mixingModel3Component: tracers.${k} must be a finite number, got ${v}`);
        }
    }
    for (let i = 0; i < 3; i++) {
        const em = (endMembers[i] as Record<string, any>);
        for (const prop of ['t1', 't2']) {
            if (typeof em[prop] !== 'number' || !Number.isFinite(em[prop])) {
                throw new TypeError(`mixingModel3Component: endMembers[${i}].${prop} must be a finite number`);
            }
        }
    }

    // Destrói o sistema 3×3:
    // Linha 0: f1 + f2 + f3 = 1
    // Linha 1: t1_1*f1 + t1_2*f2 + t1_3*f3 = t1_mix
    // Linha 2: t2_1*f1 + t2_2*f2 + t2_3*f3 = t2_mix
    //
    // Substituição: f3 = 1 - f1 - f2
    // → (t1_1 - t1_3)*f1 + (t1_2 - t1_3)*f2 = t1_mix - t1_3
    // → (t2_1 - t2_3)*f1 + (t2_2 - t2_3)*f2 = t2_mix - t2_3

    const [em1, em2, em3] = endMembers as [
        { id: string; t1: number; t2: number },
        { id: string; t1: number; t2: number },
        { id: string; t1: number; t2: number },
    ];
    const a11 = em1.t1 - em3.t1;
    const a12 = em2.t1 - em3.t1;
    const b1 = t1_mix - em3.t1;
    const a21 = em1.t2 - em3.t2;
    const a22 = em2.t2 - em3.t2;
    const b2 = t2_mix - em3.t2;

    // Determinante da submatriz 2×2
    const det = a11 * a22 - a12 * a21;

    if (Math.abs(det) < 1e-12 * Math.max(Math.abs(a11), Math.abs(a12), Math.abs(a21), Math.abs(a22), 1)) {
        throw new RangeError(
            'mixingModel3Component: system is singular — end-members are collinear in tracer space. ' +
                'Choose tracers that better differentiate the three sources.',
        );
    }

    const f1 = (b1 * a22 - b2 * a12) / det;
    const f2 = (a11 * b2 - a21 * b1) / det;
    const f3 = 1 - f1 - f2;

    return Object.freeze({
        f: Object.freeze([f1, f2, f3]),
        endMembers: Object.freeze([...endMembers]),
        method: '3-component-mixing',
    });
}

// ---------------------------------------------------------------------------
// 5. Fator de diluição-atenuação (DAF)
// Dilution-Attenuation Factor - USEPA RBCA simplified + ASTM E2640
// ---------------------------------------------------------------------------

/**
 * Calcula o Fator de Diluição-Atenuação (DAF) pelo método RBCA simplificado.
 * Computes the Dilution-Attenuation Factor.
 *
 * Fórmula USEPA RBCA (USEPA 1996, EPA/540/R-95/128, eq. B-2):
 *   DAF = 1 + (thickness_aquifer × dispersivity_y) / (thickness_source × width_source/2)
 *
 * O DAF representa a razão entre concentração na fonte e concentração no ponto receptor
 * após diluição por mistura com água subterrânea não-contaminada.
 * Referência: ASTM E2640-08, §6.4.
 *
 * @param {Object} params - Parâmetros do modelo
 * @param {number} params.thickness_aquifer - Espessura do aquífero saturado (m)
 * @param {number} params.thickness_source  - Espessura da zona fonte (m)
 * @param {number} params.width_source      - Largura da zona fonte perpendicular ao fluxo (m)
 * @param {number} params.dispersivity_y    - Dispersividade transversal horizontal αy (m)
 * @param {number} [params.distance]        - Distância da fonte ao receptor (m) - reservado para extensão futura
 * @returns {Readonly<Object>} DAF e concentração relativa diluída
 * @throws {TypeError} Se parâmetros obrigatórios não forem números finitos positivos
 */
export function computeDilutionAttenuationFactor(params: { thickness_aquifer: number; thickness_source: number; width_source: number; dispersivity_y: number; distance?: number }): Readonly<Object> {
    const { thickness_aquifer, thickness_source, width_source, dispersivity_y } = params;
    for (const [k, v] of Object.entries({ thickness_aquifer, thickness_source, width_source, dispersivity_y })) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
            throw new TypeError(`computeDilutionAttenuationFactor: "${k}" must be a positive finite number, got ${v}`);
        }
    }

    // USEPA RBCA simplified DAF (eq. B-2, EPA/540/R-95/128)
    const DAF = 1 + (thickness_aquifer * dispersivity_y) / (thickness_source * (width_source / 2));

    return Object.freeze({
        DAF,
        inputConcentration_rel: 1,
        dilutedConcentration_rel: 1 / DAF,
        method: 'RBCA-simplified',
    });
}

// ---------------------------------------------------------------------------
// 6. Balanço de aceptores de elétrons para biorremedição
// Electron acceptor balance for bioremediation
// ---------------------------------------------------------------------------

/**
 * Calcula o consumo de aceptores de elétrons para biorremedição.
 * Computes electron acceptor consumption for biodegradation.
 *
 * Razões estequiométricas de Wiedemeier et al. (1999) Tabelas 3-1 e 3-2
 * e USEPA EPA/600/R-98/128 Apêndice B.
 *
 * @param {Object} params - Parâmetros da biorremedição
 * @param {'benzene'|'toluene'|'TCE'|'PCE'} params.contaminant - Contaminante
 * @param {number} params.mass_kg - Massa de contaminante degradada (kg)
 * @param {'aerobic'|'iron_reduction'|'sulfate_reduction'|'methanogenesis'} params.pathway - Via metabólica
 * @returns {Readonly<Object>} Aceptor consumido (kg) e CH4 produzido (m³ STP)
 * @throws {TypeError} Se parâmetros forem inválidos
 * @throws {RangeError} Se contaminante ou via metabólica não forem suportados
 */
export function computeElectronAcceptorBalance(params: { contaminant: 'benzene'|'toluene'|'TCE'|'PCE'; mass_kg: number; pathway: 'aerobic'|'iron_reduction'|'sulfate_reduction'|'methanogenesis' }): Readonly<Object> {
    const { contaminant, mass_kg, pathway } = params;

    if (typeof mass_kg !== 'number' || !Number.isFinite(mass_kg) || mass_kg < 0) {
        throw new TypeError(
            `computeElectronAcceptorBalance: mass_kg must be a finite non-negative number, got ${mass_kg}`,
        );
    }

    const contaminantData = STOICHIOMETRY[contaminant];
    if (!contaminantData) {
        throw new RangeError(
            `computeElectronAcceptorBalance: unsupported contaminant "${contaminant}". ` +
                `Supported: ${Object.keys(STOICHIOMETRY).join(', ')}`,
        );
    }

    const pathwayData = contaminantData[pathway];
    if (!pathwayData) {
        throw new RangeError(
            `computeElectronAcceptorBalance: unsupported pathway "${pathway}" for "${contaminant}". ` +
                `Supported: ${Object.keys(contaminantData).join(', ')}`,
        );
    }

    const { acceptorRatio, CH4: ch4Ratio } = pathwayData;
    const acceptorConsumed_kg = acceptorRatio * mass_kg;
    const CH4_produced_m3 = ch4Ratio * mass_kg;

    return Object.freeze({
        contaminant,
        pathway,
        acceptorConsumed_kg,
        CH4_produced_m3,
        stoichiometricRatio: acceptorRatio > 0 ? acceptorRatio : ch4Ratio,
    });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const massBalanceMeta = {
    name: 'massBalance',
    description: 'Environmental Mass Balance',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // CONNECTOR populated 2026-06-02 — Balanço de massa hidrológico ou de contaminante
    // Reference: Bear (1972) Dynamics of Fluids in Porous Media
    inputSchema: {
        type: 'object',
        properties: {
            mode: { type: 'string', enum: ['hydrologic', 'contaminant', 'mixing2c'], default: 'hydrologic' },
            params: { type: 'object', description: 'Parâmetros específicos do modo (mm/kg/concentração)' },
        },
        required: ['mode', 'params'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            balance: { type: 'number', description: 'Resíduo do balanço (entrada-saída-acumulação)' },
            closureError_percent: { type: 'number' },
            acceptable: { type: 'boolean', description: 'Closure error dentro do benchmark' },
        },
        required: ['balance', 'closureError_percent'],
    },
};
