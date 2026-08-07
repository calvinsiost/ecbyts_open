// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SPECIATION CHEMISTRY — Aquatic Chemical Equilibrium
   Especiacao quimica aquatica: sistema carbonato, Langelier, metais

   Implementa:
   - Sistema carbonato (pH-alcalinidade-DIC)
   - Indice de Langelier (saturacao de CaCO3)
   - Indice de Ryznar (variante empirica)
   - Particao de metais pesados (coeficiente Kd linear)
   - Fracao ionizada de acidos/bases fracos (Henderson-Hasselbalch)

   Referencias academicas:
   - Stumm, W. & Morgan, J.J. (1996). Aquatic Chemistry: Chemical
     Equilibria and Rates in Natural Waters (3rd ed.). Wiley-Interscience.
     ISBN 978-0-471-51185-4
   - Henderson, L.J. (1908). Concerning the relationship between the
     strength of acids and their capacity to preserve neutrality.
     Am. J. Physiol. 21(2):173-179. DOI: 10.1152/ajplegacy.1908.21.2.173
   - Hasselbalch, K.A. (1917). Die Berechnung der Wasserstoffzahl des
     Blutes aus der freien und gebundenen Kohlensaeure desselben, und die
     Sauerstoffbindung des Blutes als Funktion der Wasserstoffzahl.
     Biochem. Z. 78:112-144.
   - Schwarzenbach, R.P., Gschwend, P.M. & Imboden, D.M. (2003).
     Environmental Organic Chemistry (2nd ed.). Wiley. Cap. 8 (acid/base
     speciation). ISBN 978-0-471-35750-6
   - Langelier, W.F. (1936). The analytical control of anti-corrosion
     water treatment. J. AWWA 28(10):1500-1521.
     DOI: 10.1002/j.1551-8833.1936.tb13785.x
   - Davis, J.A. & Kent, D.B. (1990). Surface complexation modeling
     in aqueous geochemistry. Rev. Mineral. 23:177-260.
     DOI: 10.1515/9781501509636-010
   - USEPA (2005). Contaminated Sediment Remediation Guidance for
     Hazardous Waste Sites. EPA-540-R-05-012.
   ================================================================ */

// ---------------------------------------------------------------
// CONSTANTS
// Constantes termodinamicas do sistema carbonato a 25°C, I=0
// ---------------------------------------------------------------

/**
 * Constantes termodinamicas do sistema carbonato a 25°C e forca ionica zero.
 * Stumm & Morgan (1996), Tabelas 3.1 e 6.1.
 * @type {Readonly<{Ka1:number, Ka2:number, Kw:number, Ksp_calcite:number, Kh:number, pCO2_atm:number}>}
 */
export const CARBONATE_CONSTANTS: Readonly<{
    Ka1: number;
    Ka2: number;
    Kw: number;
    Ksp_calcite: number;
    Kh: number;
    pCO2_atm: number;
}> = Object.freeze({
    Ka1: 4.45e-7, // pKa1=6.352  H2CO3* → HCO3- + H+  a 25°C
    Ka2: 4.69e-11, // pKa2=10.329 HCO3-  → CO3²- + H+  a 25°C
    Kw: 1.01e-14, // produto ionico da agua a 25°C
    Ksp_calcite: 3.36e-9, // produto de solubilidade CaCO3 (calcita) a 25°C
    Kh: 3.4e-2, // constante de Henry CO2(aq) mol/(L·atm) a 25°C
    pCO2_atm: 4.2e-4, // CO2 atmosferico (2024) em atm
});

type SoilType = 'sand' | 'silt' | 'clay' | 'organic';

/**
 * Tabela de coeficientes de distribuicao (Kd) de referencia para metais em solos.
 * Valores em (mg metal/kg solido)/(mg metal/L agua).
 * Fonte: USEPA (2005) EPA-540-R-05-012, Apendice B.
 * @type {Readonly<Object>}
 */
export const METAL_KD_TABLE: Readonly<Record<string, Readonly<Record<SoilType, number>>>> = Object.freeze({
    Pb: Object.freeze({ sand: 50, silt: 500, clay: 2000, organic: 10000 }),
    Cd: Object.freeze({ sand: 10, silt: 100, clay: 500, organic: 5000 }),
    As: Object.freeze({ sand: 20, silt: 200, clay: 1000, organic: 2000 }),
    Cr: Object.freeze({ sand: 30, silt: 300, clay: 1500, organic: 3000 }),
    Zn: Object.freeze({ sand: 15, silt: 150, clay: 700, organic: 8000 }),
    Hg: Object.freeze({ sand: 1000, silt: 5000, clay: 50000, organic: 100000 }),
    Cu: Object.freeze({ sand: 30, silt: 250, clay: 1200, organic: 9000 }),
    Ni: Object.freeze({ sand: 10, silt: 100, clay: 500, organic: 4000 }),
});

// Entalpias padrao para correcao de temperatura (van't Hoff simplificado)
// Stumm & Morgan (1996), Apendice 3
const DH1_J_MOL = -7700; // deltaH Ka1 em J/mol
const DH2_J_MOL = 14900; // deltaH Ka2 em J/mol
const DHW_J_MOL = 55800; // deltaH Kw  em J/mol
const DH_KSP_J_MOL = -11800; // deltaH Ksp calcita em J/mol (estimativa Stumm & Morgan)
const R_GAS = 8.314; // constante dos gases em J/(mol·K)
const T25_K = 298.15; // temperatura de referencia em Kelvin

// Metais cujo Kd NAO e reduzido com pH alto (anions: As, Cr)
const ANIONIC_METALS = new Set(['As', 'Cr']);

// ---------------------------------------------------------------
// INTERNAL HELPERS - correcoes termodinamicas
// ---------------------------------------------------------------

/**
 * Corrige constante de equilibrio pela temperatura via equacao van't Hoff simplificada.
 * @param {number} K25  - Constante a 25°C
 * @param {number} dH   - Entalpia padrao em J/mol
 * @param {number} T_K  - Temperatura em Kelvin
 * @returns {number} Constante corrigida para temperatura T
 */
function correctK(K25: number, dH: number, T_K: number): number {
    return K25 * Math.exp((-dH / R_GAS) * (1 / T_K - 1 / T25_K));
}

/**
 * Calcula coeficiente de atividade ionica via equacao de Davies.
 * @param {number} z - Carga do ion
 * @param {number} I - Forca ionica em mol/L
 * @returns {number} Coeficiente de atividade (adimensional)
 */
function daviesActivityCoeff(z: number, I: number): number {
    if (I <= 0) return 1.0;
    let Iclamped = I;
    if (Iclamped >= 0.5) Iclamped = 0.499; // limite de validade do modelo
    const A = 0.509; // constante de Debye-Huckel a 25°C para agua
    const sqrtI = Math.sqrt(Iclamped);
    const logGamma = -A * z * z * (sqrtI / (1 + sqrtI) - 0.3 * Iclamped);
    return Math.pow(10, logGamma);
}

/**
 * Converte TDS (mg/L) para forca ionica aproximada.
 * @param {number} TDS_mgL - Solidos dissolvidos totais em mg/L
 * @returns {number} Forca ionica estimada em mol/L
 */
function tdsToIonicStrength(TDS_mgL: number): number {
    return TDS_mgL / 40000;
}

/**
 * Retorna as constantes de equilibrio corrigidas para temperatura.
 * @param {number} temperature_C - Temperatura em Celsius
 * @returns {{Ka1:number, Ka2:number, Kw:number, Ksp:number}}
 */
function getKsAtTemperature(temperature_C: number): { Ka1: number; Ka2: number; Kw: number; Ksp: number } {
    const T_K = temperature_C + 273.15;
    return {
        Ka1: correctK(CARBONATE_CONSTANTS.Ka1, DH1_J_MOL, T_K),
        Ka2: correctK(CARBONATE_CONSTANTS.Ka2, DH2_J_MOL, T_K),
        Kw: correctK(CARBONATE_CONSTANTS.Kw, DHW_J_MOL, T_K),
        Ksp: correctK(CARBONATE_CONSTANTS.Ksp_calcite, DH_KSP_J_MOL, T_K),
    };
}

// ---------------------------------------------------------------
// 1. computeCarbonateFractions
// ---------------------------------------------------------------

/**
 * Calcula as fracoes de especiacao do sistema carbonato a um dado pH.
 *
 * @param {number} pH - pH da solucao
 * @returns {Readonly<{alpha0:number, alpha1:number, alpha2:number, pH:number}>}
 * @throws {RangeError} Se pH estiver fora do intervalo [4, 12]
 */
export function computeCarbonateFractions(
    pH: number,
): Readonly<{ alpha0: number; alpha1: number; alpha2: number; pH: number }> {
    if (pH < 4 || pH > 12) {
        throw new RangeError(`pH ${pH} fora do intervalo valido [4, 12] para especiacao do carbonato`);
    }

    const { Ka1, Ka2 } = CARBONATE_CONSTANTS;
    const H = Math.pow(10, -pH);

    const D = H * H + H * Ka1 + Ka1 * Ka2;
    const alpha0 = (H * H) / D;
    const alpha1 = (H * Ka1) / D;
    const alpha2 = (Ka1 * Ka2) / D;

    return Object.freeze({ alpha0, alpha1, alpha2, pH });
}

// ---------------------------------------------------------------
// 2. computeCarbonateSystem
// ---------------------------------------------------------------

/**
 * Resolve o sistema carbonato aquatico dado exatamente 2 das 4 variaveis.
 *
 * @param {Object} inputs
 * @returns {Readonly<{pH:number, DIC:number, alkalinity:number, pCO2_eq:number,
 *           HCO3:number, CO3:number, H2CO3:number, OH:number, H:number,
 *           temperature_C:number, method:string}>}
 * @throws {RangeError} Se nao forem fornecidos exatamente 2 inputs
 */
export function computeCarbonateSystem(inputs: {
    pH?: number;
    DIC?: number;
    alkalinity?: number;
    pCO2?: number;
    temperature_C?: number;
}): Readonly<{
    pH: number;
    DIC: number;
    alkalinity: number;
    pCO2_eq: number;
    HCO3: number;
    CO3: number;
    H2CO3: number;
    OH: number;
    H: number;
    temperature_C: number;
    method: string;
}> {
    const { pH: pHin, DIC: DICin, alkalinity: alkin, pCO2: pCO2in, temperature_C = 25 } = inputs || {};

    const defined = [pHin, DICin, alkin, pCO2in].filter((v) => v !== undefined);
    if (defined.length !== 2) {
        throw new RangeError(`computeCarbonateSystem: exige exatamente 2 inputs definidos, recebeu ${defined.length}`);
    }

interface CarbonateSolution {
    pH: number;
    DIC: number;
    alkalinity: number;
    method: string;
}

function computePHDICCase(pHin: number, DICin: number, Ks: ReturnType<typeof getKsAtTemperature>): CarbonateSolution {
    const pH = pHin;
    const DIC = DICin;
    const H = Math.pow(10, -pH);
    const { Ka1, Ka2 } = Ks;
    const D = H * H + H * Ka1 + Ka1 * Ka2;
    const a1 = (H * Ka1) / D;
    const a2 = (Ka1 * Ka2) / D;
    const OH = Ks.Kw / H;
    const alkalinity = DIC * a1 + 2 * DIC * a2 + OH - H;
    return { pH, DIC, alkalinity, method: 'pH+DIC' };
}

function computePHAlkalinityCase(
    pHin: number,
    alkin: number,
    Ks: ReturnType<typeof getKsAtTemperature>,
): CarbonateSolution {
    const pH = pHin;
    const alkalinity = alkin;
    const H = Math.pow(10, -pH);
    const { Ka1, Ka2 } = Ks;
    const D = H * H + H * Ka1 + Ka1 * Ka2;
    const a1 = (H * Ka1) / D;
    const a2 = (Ka1 * Ka2) / D;
    const OH = Ks.Kw / H;
    const denom = a1 + 2 * a2;
    if (Math.abs(denom) < 1e-30) {
        throw new RangeError('pH resulta em denominador degenerado para DIC');
    }
    let DIC = (alkalinity - OH + H) / denom;
    if (DIC < 0) DIC = 0;
    return { pH, DIC, alkalinity, method: 'pH+alkalinity' };
}

function computePHPco2Case(
    pHin: number,
    pCO2in: number,
    Ks: ReturnType<typeof getKsAtTemperature>,
): CarbonateSolution {
    const pH = pHin;
    const H = Math.pow(10, -pH);
    const { Ka1, Ka2 } = Ks;
    const Kh = CARBONATE_CONSTANTS.Kh;
    const H2CO3 = Kh * pCO2in;
    const D = H * H + H * Ka1 + Ka1 * Ka2;
    const a0 = (H * H) / D;
    const DIC = H2CO3 / a0;
    const a1 = (H * Ka1) / D;
    const a2 = (Ka1 * Ka2) / D;
    const OH = Ks.Kw / H;
    const alkalinity = DIC * a1 + 2 * DIC * a2 + OH - H;
    return { pH, DIC, alkalinity, method: 'pH+pCO2' };
}

function computeDICAlkalinityCase(
    DICin: number,
    alkin: number,
    Ks: ReturnType<typeof getKsAtTemperature>,
): CarbonateSolution {
    const DIC = DICin;
    const alkalinity = alkin;
    const { Ka1, Ka2 } = Ks;

    const f = (trialPH: number): number => {
        const H = Math.pow(10, -trialPH);
        const D = H * H + H * Ka1 + Ka1 * Ka2;
        const a1 = (H * Ka1) / D;
        const a2 = (Ka1 * Ka2) / D;
        const OH = Ks.Kw / H;
        return DIC * (a1 + 2 * a2) + OH - H - alkalinity;
    };

    let lo = 5.0;
    let hi = 10.0;
    for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        const fmid = f(mid);
        if (Math.abs(fmid) < 1e-14 || hi - lo < 1e-9) {
            lo = mid;
            break;
        }
        if (f(lo) * fmid < 0) hi = mid;
        else lo = mid;
    }
    const pH = (lo + hi) / 2;
    return { pH, DIC, alkalinity, method: 'DIC+alkalinity' };
}

function resolveCarbonateSolution(
    pHin: number | undefined,
    DICin: number | undefined,
    alkin: number | undefined,
    pCO2in: number | undefined,
    Ks: ReturnType<typeof getKsAtTemperature>,
): CarbonateSolution {
    if (pHin !== undefined && DICin !== undefined) {
        return computePHDICCase(pHin, DICin, Ks);
    }
    if (pHin !== undefined && alkin !== undefined) {
        return computePHAlkalinityCase(pHin, alkin, Ks);
    }
    if (pHin !== undefined && pCO2in !== undefined) {
        return computePHPco2Case(pHin, pCO2in, Ks);
    }
    if (DICin !== undefined && alkin !== undefined) {
        return computeDICAlkalinityCase(DICin, alkin, Ks);
    }
    throw new RangeError('computeCarbonateSystem: nenhum caso valido resolvido');
}

function finalizeCarbonateSpecies(
    solution: CarbonateSolution,
    Ks: ReturnType<typeof getKsAtTemperature>,
    temperature_C: number,
): Readonly<{
    pH: number;
    DIC: number;
    alkalinity: number;
    pCO2_eq: number;
    HCO3: number;
    CO3: number;
    H2CO3: number;
    OH: number;
    H: number;
    temperature_C: number;
    method: string;
}> {
    const { pH, DIC, alkalinity, method } = solution;
    const H = Math.pow(10, -pH);
    const { Ka1, Ka2 } = Ks;
    const D = H * H + H * Ka1 + Ka1 * Ka2;
    const a0 = (H * H) / D;
    const a1 = (H * Ka1) / D;
    const a2 = (Ka1 * Ka2) / D;
    const OH = Ks.Kw / H;
    const H2CO3_conc = DIC * a0;
    const HCO3_conc = DIC * a1;
    const CO3_conc = DIC * a2;
    const Kh = CARBONATE_CONSTANTS.Kh;
    const pCO2_eq = H2CO3_conc / (Kh > 0 ? Kh : 1);

    return Object.freeze({
        pH,
        DIC,
        alkalinity,
        pCO2_eq,
        HCO3: HCO3_conc,
        CO3: CO3_conc,
        H2CO3: H2CO3_conc,
        OH,
        H,
        temperature_C,
        method,
    });
}

    const Ks = getKsAtTemperature(temperature_C);
    const solution = resolveCarbonateSolution(pHin, DICin, alkin, pCO2in, Ks);
    return finalizeCarbonateSpecies(solution, Ks, temperature_C);
}

// ---------------------------------------------------------------
// 3. computeLangelierIndex
// ---------------------------------------------------------------

interface LangelierParams {
    pH: number;
    Ca_mgL: number;
    alkalinity_mgL_CaCO3: number;
    TDS_mgL: number;
    temperature_C?: number;
}

/**
 * Calcula o Indice de Saturacao de Langelier (LSI).
 *
 * @param {Object} params
 * @returns {Readonly<{LSI:number, pHs:number,
 *           saturationState:'supersaturated'|'equilibrium'|'undersaturated',
 *           tendency:string}>}
 * @throws {RangeError} Se Ca_mgL <= 0 ou pH fora de [4, 12]
 */
export function computeLangelierIndex(params: LangelierParams): Readonly<{
    LSI: number;
    pHs: number;
    saturationState: 'supersaturated' | 'equilibrium' | 'undersaturated';
    tendency: string;
}> {
    const { pH, Ca_mgL, alkalinity_mgL_CaCO3, TDS_mgL, temperature_C = 25 } = params || {};

    if (pH < 4 || pH > 12) {
        throw new RangeError(`pH ${pH} fora do intervalo valido [4, 12]`);
    }
    if (!Ca_mgL || Ca_mgL <= 0) {
        throw new RangeError('Ca_mgL deve ser positivo para calcular o Indice de Langelier');
    }
    if (!alkalinity_mgL_CaCO3 || alkalinity_mgL_CaCO3 <= 0) {
        throw new RangeError('alkalinity_mgL_CaCO3 deve ser positivo');
    }

    const Ks = getKsAtTemperature(temperature_C);
    const I = tdsToIonicStrength(TDS_mgL || 0);

    // Coeficientes de atividade via Davies para ions divalentes (z=2) e monovalentes (z=1)
    const gamma2 = daviesActivityCoeff(2, I);
    const gamma1 = daviesActivityCoeff(1, I);

    // Ka2 e Ksp corrigidos para atividade
    const Ka2_corr = Ks.Ka2 * (gamma1 / gamma2);
    const Ksp_corr = Ks.Ksp / (gamma2 * gamma2);

    const pKa2_corr = -Math.log10(Ka2_corr);
    const pKsp_corr = -Math.log10(Ksp_corr);

    // Concentracoes em mol/L
    const Ca_molL = Ca_mgL / 1000 / 40.08;
    const alk_eqL = alkalinity_mgL_CaCO3 / 50000;

    const pCa = -Math.log10(Ca_molL);
    const pAlk = -Math.log10(alk_eqL);

    // pHs = pK2 - pKsp + pCa + pAlk  (Langelier, 1936)
    const pHs = pKa2_corr - pKsp_corr + pCa + pAlk;
    const LSI = pH - pHs;

    const saturationState: 'supersaturated' | 'equilibrium' | 'undersaturated' =
        LSI > 0.1 ? 'supersaturated' : LSI < -0.1 ? 'undersaturated' : 'equilibrium';
    const tendency =
        LSI > 0.1
            ? 'tende a depositar CaCO3 (incrustacao)'
            : LSI < -0.1
              ? 'tende a dissolver CaCO3 (corrosivo)'
              : 'agua em equilibrio com CaCO3';

    return Object.freeze({ LSI, pHs, saturationState, tendency });
}

// ---------------------------------------------------------------
// 4. computeRyznarIndex
// ---------------------------------------------------------------

/**
 * Calcula o Indice de Ryznar (RSI) - variante empirica do Langelier.
 *
 * @param {Object} params - Mesmos parametros que computeLangelierIndex
 * @returns {Readonly<{RSI:number, pHs:number,
 *           tendency:'scale'|'balanced'|'corrosive', severity:string}>}
 */
export function computeRyznarIndex(params: LangelierParams): Readonly<{
    RSI: number;
    pHs: number;
    tendency: 'scale' | 'balanced' | 'corrosive';
    severity: string;
}> {
    const li = computeLangelierIndex(params);
    const RSI = 2 * li.pHs - params.pH;

    const tendency: 'corrosive' | 'balanced' | 'scale' =
        RSI < 6 ? 'scale' : RSI > 8 ? 'corrosive' : 'balanced';
    const severity =
        RSI < 6
            ? RSI < 4
                ? 'severo (RSI < 4)'
                : 'moderado (4 ≤ RSI < 6)'
            : RSI > 8
              ? RSI > 10
                  ? 'severo (RSI > 10)'
                  : 'moderado (8 < RSI ≤ 10)'
              : 'balanceado (6 ≤ RSI ≤ 8)';

    return Object.freeze({ RSI, pHs: li.pHs, tendency, severity });
}

// ---------------------------------------------------------------
// 5. computeMetalPartitioning
// ---------------------------------------------------------------

interface MetalPartitioningParams {
    metalName: string;
    Ctotal_mgkg: number;
    soilType: SoilType;
    pH?: number;
    foc?: number;
    rho_bulk?: number;
    theta?: number;
}

/**
 * Calcula a particao metal-solido-solucao via coeficiente Kd linear.
 *
 * @param {Object} params
 * @returns {Readonly<{Kd:number, Caq_mgL:number, Cs_mgkg:number,
 *           mobileFraction:number, method:string, metalName:string}>}
 * @throws {RangeError} Se metal ou soilType invalidos, ou Ctotal <= 0
 */
export function computeMetalPartitioning(params: MetalPartitioningParams): Readonly<{
    Kd: number;
    Caq_mgL: number;
    Cs_mgkg: number;
    mobileFraction: number;
    method: string;
    metalName: string;
}> {
    const { metalName, Ctotal_mgkg, soilType, pH, foc, rho_bulk = 1.5, theta = 0.35 } = params || {};

    const metalRow = METAL_KD_TABLE[metalName];
    if (!metalRow) {
        throw new RangeError(`Metal "${metalName}" nao reconhecido. Use: ${Object.keys(METAL_KD_TABLE).join(', ')}`);
    }
    const validSoilTypes: SoilType[] = ['sand', 'silt', 'clay', 'organic'];
    if (!validSoilTypes.includes(soilType)) {
        throw new RangeError(`soilType "${soilType}" invalido. Use: ${validSoilTypes.join(', ')}`);
    }
    if (!Ctotal_mgkg || Ctotal_mgkg <= 0) {
        throw new RangeError('Ctotal_mgkg deve ser positivo');
    }

    // Kd base do tipo de solo (L/kg)
    let Kd = metalRow[soilType];

    // Fator pH para metais cationicos (nao As, Cr que sao anioniacs)
    if (pH !== undefined && !ANIONIC_METALS.has(metalName)) {
        // pH alto reduz solubilidade → aumenta Kd por precipitacao
        const pHfactor = Math.exp(0.5 * Math.max(0, pH - 7));
        Kd = Kd * pHfactor;
    }

    // Fator carbono organico: Koc empirico (Davis & Kent, 1990)
    const KOC_METALS: Record<string, number> = {
        Pb: 100000,
        Cd: 50000,
        As: 20000,
        Cr: 30000,
        Zn: 80000,
        Hg: 1000000,
        Cu: 90000,
        Ni: 40000,
    };
    if (foc !== undefined && foc > 0) {
        const Kd_org = (KOC_METALS[metalName] ?? 0) * foc;
        if (Kd_org > Kd) Kd = Kd_org;
    }

    // Formulacao padrao USEPA:
    // Ctotal [mg/kg] = Caq [mg/L] * (theta/rho_bulk) + Caq * Kd
    //                = Caq * (theta/rho_bulk + Kd)
    // Logo: Caq = Ctotal / (theta/rho_bulk + Kd)
    const Caq_mgL = Ctotal_mgkg / (theta / rho_bulk + Kd);
    const Cs_mgkg = Kd * Caq_mgL;
    const Caq_total = Caq_mgL * (theta / rho_bulk); // mg/kg equivalente aquoso
    const mobileFraction = Caq_total / (Caq_total + Cs_mgkg);

    return Object.freeze({
        Kd,
        Caq_mgL,
        Cs_mgkg,
        mobileFraction,
        method: 'linear-kd',
        metalName,
    });
}

// ---------------------------------------------------------------
// HENDERSON-HASSELBALCH — Acid/base speciation
// Fracao ionizada de acidos e bases fracos em funcao do pH
// ---------------------------------------------------------------

export type IonizableType = 'acid' | 'base';

export interface FractionIonizedParams {
    /** pKa do par acido/base conjugado (adimensional). */
    pKa: number;
    /** pH do meio aquoso (adimensional, 0-14 em condicoes ambientais). */
    pH: number;
    /**
     * Tipo de especie:
     * - 'acid': acido fraco HA ⇌ A⁻ + H⁺ (ex.: fenois, acidos carboxilicos,
     *   PFOA). A forma IONIZADA (A⁻) domina quando pH > pKa.
     * - 'base': base fraca B + H⁺ ⇌ BH⁺ (ex.: anilinas, aminas). A forma
     *   IONIZADA (BH⁺) domina quando pH < pKa.
     */
    type: IonizableType;
}

export interface FractionIonizedResult {
    /** Fracao da especie na forma IONIZADA (carregada), 0..1. */
    fractionIonized: number;
    /** Fracao da especie na forma NEUTRA (nao dissociada), 0..1. */
    fractionNeutral: number;
    /** Razao [forma basica]/[forma acida] = 10^(pH - pKa) (Henderson-Hasselbalch). */
    ratioBaseToAcid: number;
    pKa: number;
    pH: number;
    type: IonizableType;
    method: 'henderson-hasselbalch';
}

/**
 * Calcula a fracao ionizada de um acido ou base fraco monoprotico em funcao
 * do pH, pela equacao de Henderson-Hasselbalch.
 *
 * A equacao de Henderson (1908) / Hasselbalch (1917) relaciona o pH ao
 * equilibrio de dissociacao:
 *
 *     pH = pKa + log10([base]/[acido])
 *
 * de onde a razao das formas e [base]/[acido] = 10^(pH - pKa).
 *
 * Para um ACIDO fraco (HA ⇌ A⁻ + H⁺), a forma ionizada e A⁻:
 *
 *     alpha_ionizada = 1 / (1 + 10^(pKa - pH))
 *
 * Para uma BASE fraca (B + H⁺ ⇌ BH⁺), a forma ionizada e BH⁺:
 *
 *     alpha_ionizada = 1 / (1 + 10^(pH - pKa))
 *
 * A especiacao acido/base controla a mobilidade, sorcao e biodisponibilidade
 * de contaminantes ionizaveis (fenois, acidos carboxilicos, PFAS, anilinas,
 * farmacos): a forma neutra particiona mais para a fase organica/solida,
 * enquanto a forma ionizada permanece mais movel na agua
 * (Schwarzenbach et al., 2003, Cap. 8).
 *
 * Funcao PURA (sem DOM, sem estado global).
 *
 * @param {FractionIonizedParams} params
 * @returns {Readonly<FractionIonizedResult>}
 * @throws {RangeError} Se pKa ou pH nao forem finitos, ou type invalido.
 *
 * @example
 * // Acido com pKa = pH → 50% ionizado
 * computeFractionIonized({ pKa: 7, pH: 7, type: 'acid' }).fractionIonized; // 0.5
 */
export function computeFractionIonized(params: FractionIonizedParams): Readonly<FractionIonizedResult> {
    const { pKa, pH, type } = params || ({} as FractionIonizedParams);

    if (!Number.isFinite(pKa)) {
        throw new RangeError(`computeFractionIonized: pKa deve ser finito, obtido ${pKa}`);
    }
    if (!Number.isFinite(pH)) {
        throw new RangeError(`computeFractionIonized: pH deve ser finito, obtido ${pH}`);
    }
    if (type !== 'acid' && type !== 'base') {
        throw new RangeError(`computeFractionIonized: type deve ser 'acid' ou 'base', obtido "${type}"`);
    }

    // Razao [base conjugada]/[acido conjugado] (forma generica de H-H).
    const ratioBaseToAcid = Math.pow(10, pH - pKa);

    let fractionIonized: number;
    if (type === 'acid') {
        // Acido: ionizado = A⁻ (forma basica). alpha = 1 / (1 + 10^(pKa-pH))
        fractionIonized = 1 / (1 + Math.pow(10, pKa - pH));
    } else {
        // Base: ionizado = BH⁺ (forma acida). alpha = 1 / (1 + 10^(pH-pKa))
        fractionIonized = 1 / (1 + Math.pow(10, pH - pKa));
    }

    const fractionNeutral = 1 - fractionIonized;

    return Object.freeze({
        fractionIonized,
        fractionNeutral,
        ratioBaseToAcid,
        pKa,
        pH,
        type,
        method: 'henderson-hasselbalch' as const,
    });
}
