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
// Application: EHS & Mining - Hydrogeochemical Analysis
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - Piper, A.M. (1944). A graphic procedure in the geochemical interpretation
//   of water-analyses. Trans. Am. Geophys. Union 25(6):914-928.
// - Stiff, H.A. (1951). The interpretation of chemical water analysis by
//   means of patterns. J. Pet. Technol. 3(10):15-17.
// - Hem, J.D. (1985). Study and Interpretation of the Chemical Characteristics
//   of Natural Water (3rd ed.). USGS Water-Supply Paper 2254.
// - Schoeller, H. (1962). Les eaux souterraines. Masson, Paris.
// - Chadha, D.K. (1999). A proposed new diagram for geochemical classification
//   of natural waters and interpretation of chemical data.
//   Hydrogeol. J. 7(5):431-439.
// - Davies, C.W. (1938). The calculation of absolute strengths of
//   electrolytes. J. Chem. Soc. 2093-2098.

// ---------------------------------------------------------------------------
// Pesos equivalentes (mg/meq) - Hem 1985 Tabela 1
// Peso equivalente = massa molar / valência
// ---------------------------------------------------------------------------

/**
 * Pesos equivalentes dos íons em mg/meq.
 * Fonte: Hem, J.D. (1985) USGS WSP-2254, Tabela 1.
 */
export const EQUIVALENT_WEIGHTS = Object.freeze({
    Ca: 20.04, // 40.08 / 2
    Mg: 12.15, // 24.31 / 2
    Na: 23.0, // 22.99 / 1
    K: 39.1, // 39.10 / 1
    HCO3: 61.02, // 61.02 / 1
    SO4: 48.03, // 96.06 / 2
    Cl: 35.45, // 35.45 / 1
    NO3: 62.0, // 62.00 / 1
    Fe: 18.62, // 55.85 / 3 (Fe³⁺ dominante em águas oxigenadas)
    Mn: 27.47, // 54.94 / 2
    CO3: 30.0, // 60.01 / 2
});

// ---------------------------------------------------------------------------
// Massas molares (g/mol) para conversão meq/L → mol/L
// ---------------------------------------------------------------------------
// eslint-disable-next-line
const MOLAR_MASSES = Object.freeze({
    Ca: 40.078,
    Mg: 24.305,
    Na: 22.99,
    K: 39.098,
    HCO3: 61.017,
    SO4: 96.062,
    Cl: 35.453,
    NO3: 62.004,
    Fe: 55.845,
    Mn: 54.938,
});

// Valências para força iônica
const VALENCES = Object.freeze({
    Ca: 2,
    Mg: 2,
    Na: 1,
    K: 1,
    HCO3: 1,
    SO4: 2,
    Cl: 1,
    NO3: 1,
    Fe: 3,
    Mn: 2,
});

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

/**
 * Retorna valor do íon ou 0 se ausente/NaN.
 * @param {Record<string, number|undefined|null>} ions
 * @param {string} number|undefined|null>
 * @returns {number}
 */
function ionVal(ions: Record<string, number|undefined|null>, key: string): number {
    const v = ions?.[key];
    if (v == null || !isFinite(v)) return 0;
    return Math.max(0, v); // concentrações não podem ser negativas
}

// ---------------------------------------------------------------------------
// 1. convertToMeqL
// ---------------------------------------------------------------------------

/**
 * Converte concentrações de íons de mg/L para meq/L.
 * Fórmula: meq/L = mg/L / peso_equivalente
 *
 * Fonte: Hem, J.D. (1985) USGS WSP-2254, p. 7.
 *
 * @param {Record<string, number>} ions_mgL - Concentrações em mg/L.
 *   Propriedades suportadas: Ca, Mg, Na, K, HCO3, SO4, Cl, NO3, Fe, Mn.
 *   Qualquer subconjunto é aceito; íons ausentes são ignorados.
 * @returns {Readonly<Record<string, number>>} Concentrações em meq/L (mesmo formato de entrada).
 *
 * @example
 * convertToMeqL({ Ca: 40.08, Na: 23.0 })
 * // => { Ca: 2.0, Na: 1.0 }
 */
export function convertToMeqL(ions_mgL: Record<string, number>): Readonly<Record<string, number>> {
    if (!ions_mgL || typeof ions_mgL !== 'object') {
        throw new TypeError('ions_mgL deve ser um objeto { ion: mg/L }');
    }
        const result: Record<string, number>= {};
    for (const [ion, ew] of Object.entries(EQUIVALENT_WEIGHTS)) {
        if (Object.prototype.hasOwnProperty.call(ions_mgL, ion)) {
            const conc = ions_mgL[ion];
            result[ion] = conc == null || !isFinite(conc) || conc < 0 ? 0 : conc / ew;
        }
    }
    return Object.freeze(result);
}

// ---------------------------------------------------------------------------
// 2. computeChargeBalance
// ---------------------------------------------------------------------------

/**
 * Calcula o erro de balanço de cargas iônicas (Charge Balance Error - CBE).
 *
 * Fórmula (Hem 1985, eq. 4):
 *   CBE(%) = 100 × (Σcátions − Σânions) / (Σcátions + Σânions)
 *
 * Cátions: Ca, Mg, Na, K, Fe, Mn
 * Ânions:  HCO3, SO4, Cl, NO3
 *
 * Aceitável: |CBE| ≤ 5% (padrão analítico)
 *            |CBE| ≤ 10% para amostras com TDS > 1000 mg/L (USGS policy)
 *
 * @param {Record<string, number|undefined|null>} ions_meqL - Concentrações em meq/L.
 * @param {number} [TDS_mgL=0] - TDS total em mg/L (para ajuste de threshold).
 * @returns {Readonly<{CBE_percent: number, sumCations: number, sumAnions: number, acceptable: boolean, TDS_threshold: number}>}
 */
export function computeChargeBalance(ions_meqL: Record<string, number|undefined|null>, TDS_mgL: number = 0): Readonly<{CBE_percent: number, sumCations: number, sumAnions: number, acceptable: boolean, TDS_threshold: number}> {
    if (!ions_meqL || typeof ions_meqL !== 'object') {
        throw new TypeError('ions_meqL deve ser um objeto { ion: meq/L }');
    }

    const sumCations =
        ionVal(ions_meqL, 'Ca') +
        ionVal(ions_meqL, 'Mg') +
        ionVal(ions_meqL, 'Na') +
        ionVal(ions_meqL, 'K') +
        ionVal(ions_meqL, 'Fe') +
        ionVal(ions_meqL, 'Mn');

    const sumAnions =
        ionVal(ions_meqL, 'HCO3') + ionVal(ions_meqL, 'SO4') + ionVal(ions_meqL, 'Cl') + ionVal(ions_meqL, 'NO3');

    const total = sumCations + sumAnions;
    // Evita divisão por zero em amostras sem íons
    const CBE_percent = total === 0 ? 0 : (100 * (sumCations - sumAnions)) / total;

    // Threshold conforme TDS (Hem 1985, p. 167)
    const TDS_threshold = TDS_mgL > 1000 ? 10 : 5;
    const acceptable = Math.abs(CBE_percent) <= TDS_threshold;

    return Object.freeze({ CBE_percent, sumCations, sumAnions, acceptable, TDS_threshold });
}

// ---------------------------------------------------------------------------
// 3. computePiperCoordinates
// ---------------------------------------------------------------------------

/**
 * Calcula coordenadas para o diagrama de Piper (Piper 1944).
 *
 * O diagrama de Piper consiste em dois triângulos equiláteros (cátions e ânions)
 * e um losango central que projeta ambos os triângulos. Cada ponto é expresso
 * como percentual do total meq/L da respectiva categoria.
 *
 * Triângulo de cátions (%meq):
 *   %Ca, %Mg, %(Na+K) - soma = 100%
 *
 * Triângulo de ânions (%meq):
 *   %HCO3, %SO4, %Cl - soma = 100%
 *   (NO3 incluído na somatória mas mapeado para Cl no contexto do diagrama)
 *
 * Losango central (coordenadas 0–100):
 *   xDiamond = %Cl_anion + %(Na+K)_cation / 2
 *   yDiamond = 100 − %HCO3_anion − xDiamond
 *   (Piper 1944, Fig. 1; implementação conforme Lloyd & Heathcote 1985)
 *
 * @param {Array<{id?: string|number, ions_meqL?: Record<string, number|undefined|null>}>} samples - Array de amostras.
 *   Cada elemento: { id, ions_meqL: { Ca, Mg, Na, K, HCO3, SO4, Cl, NO3? } }
 * @returns {ReadonlyArray<Readonly<{id: string|number|undefined, cationTriangle: Readonly<{Ca:number, Mg:number, NaK:number}>, anionTriangle: Readonly<{HCO3:number, SO4:number, Cl:number}>, diamond: Readonly<{x:number, y:number}>}>>}
 *   Array de { id, cationTriangle: {Ca, Mg, NaK}, anionTriangle: {HCO3, SO4, Cl}, diamond: {x, y} }
 */
export function computePiperCoordinates(samples: Array<{id?: string|number, ions_meqL?: Record<string, number|undefined|null>}>): ReadonlyArray<Readonly<{id: string|number|undefined, cationTriangle: Readonly<{Ca:number, Mg:number, NaK:number}>, anionTriangle: Readonly<{HCO3:number, SO4:number, Cl:number}>, diamond: Readonly<{x:number, y:number}>}>> {
    if (!Array.isArray(samples)) {
        throw new TypeError('samples deve ser um array de objetos');
    }
    return Object.freeze(
        samples.map((sample) => {
            const { id, ions_meqL } = sample;
            const ions = ions_meqL || {};

            // --- Triângulo de cátions ---
            const ca = ionVal(ions, 'Ca');
            const mg = ionVal(ions, 'Mg');
            const naK = ionVal(ions, 'Na') + ionVal(ions, 'K');
            const sumCat = ca + mg + naK;

            let pctCa, pctMg, pctNaK;
            if (sumCat === 0) {
                pctCa = pctMg = pctNaK = 0;
            } else {
                pctCa = (100 * ca) / sumCat;
                pctMg = (100 * mg) / sumCat;
                pctNaK = (100 * naK) / sumCat;
            }

            // --- Triângulo de ânions ---
            const hco3 = ionVal(ions, 'HCO3');
            const so4 = ionVal(ions, 'SO4');
            // NO3 agrupado com Cl conforme convenção Piper (representa ânions monovalentes fortes)
            const cl = ionVal(ions, 'Cl') + ionVal(ions, 'NO3');
            const sumAn = hco3 + so4 + cl;

            let pctHco3, pctSo4, pctCl;
            if (sumAn === 0) {
                pctHco3 = pctSo4 = pctCl = 0;
            } else {
                pctHco3 = (100 * hco3) / sumAn;
                pctSo4 = (100 * so4) / sumAn;
                pctCl = (100 * cl) / sumAn;
            }

            // --- Losango central (Piper 1944) ---
            const xDiamond = pctCl + pctNaK / 2;
            const yDiamond = 100 - pctHco3 - xDiamond;

            return Object.freeze({
                id,
                cationTriangle: Object.freeze({ Ca: pctCa, Mg: pctMg, NaK: pctNaK }),
                anionTriangle: Object.freeze({ HCO3: pctHco3, SO4: pctSo4, Cl: pctCl }),
                diamond: Object.freeze({ x: xDiamond, y: yDiamond }),
            });
        }),
    );
}

// ---------------------------------------------------------------------------
// 4. classifyWaterType
// ---------------------------------------------------------------------------

/**
 * Classifica o tipo de água hidrogeoquímica baseado na posição no losango
 * do diagrama de Piper (Chadha 1999, simplificado).
 *
 * Geometria do losango Piper (Piper 1944, Fig. 1):
 *   O eixo x (horizontal) codifica: esquerda=Ca dominante (x≈0), direita=Na+K dominante (x≈100)
 *     xDiamond = %Cl_anion + %NaK_cation/2
 *   O eixo y (vertical, derivado): y = 100 - %HCO3 - x
 *     Quando %HCO3 é alto, y é baixo → vértice inferior = HCO3 puro
 *     Quando %SO4 é alto, y é alto → vértice superior = SO4+Cl puro
 *
 * Para classificação correta, o sinal de %HCO3 vs %SO4+Cl é:
 *   %HCO3 = 100 - y - x   (derivado da fórmula de y)
 *   isHco3: %HCO3 > 50  <=>  100 - y - x > 50  <=>  y + x < 50
 *
 * Tipos:
 *   Ca-HCO3  - Água doce típica de aquíferos calcários (bicarbonatos dominam)
 *   Na-HCO3  - Água de troca iônica Na-Ca (cátions sódicos + ânions bicarbonatados)
 *   Mixed    - Zona de transição / mistura de tipos
 *   Ca-SO4/Cl - Água com sulfatos ou cloretos e dureza cálcica
 *   Na-Cl    - Água salina / marinha
 *   Na-SO4   - Água sulfatada sódica (frequente em áreas áridas)
 *
 * Referência: Chadha, D.K. (1999). Hydrogeol. J. 7(5):431-439.
 *
 * @param {{x: number, y: number}} diamond - { x, y } coordenadas do losango (Piper 1944).
 *   x = %Cl_anion + %NaK_cation/2
 *   y = 100 - %HCO3 - x
 * @returns {Readonly<{type: string, description: string}>} { type, description }
 */
export function classifyWaterType(diamond: {x: number, y: number}): Readonly<{type: string, description: string}> {
    if (!diamond || typeof diamond.x !== 'number' || typeof diamond.y !== 'number') {
        throw new TypeError('diamond deve ser { x: number, y: number }');
    }
    const { x, y } = diamond;

    // Cátions: x < 50 → Ca+Mg dominam; x ≥ 50 → Na+K dominam
    const isCa = x < 50;

    // Ânions: reconstruir %HCO3 a partir da geometria Piper
    // yDiamond = 100 - %HCO3 - xDiamond  →  %HCO3 = 100 - y - x
    const pctHco3Approx = 100 - y - x;
    const isHco3 = pctHco3Approx > 50; // HCO3 domina ânions

    // Zona de mistura: sem dominância clara em NENHUM dos dois eixos simultaneamente.
    // Um eixo é considerado "sem dominância" quando a diferença para o ponto neutro (50%)
    // é < 15pp - limiar mais apertado para evitar falsos positivos quando um eixo domina.
    const cationAmbiguous = Math.abs(x - 50) < 15;
    const anionAmbiguous = Math.abs(pctHco3Approx - 50) < 15;
    const isMixed = cationAmbiguous && anionAmbiguous;

    if (isMixed) {
        return Object.freeze({
            type: 'Mixed',
            description: 'Água mista — sem íon dominante; transição geoquímica',
        });
    }

    if (isCa && isHco3) {
        return Object.freeze({
            type: 'Ca-HCO3',
            description: 'Água bicarbonatada cálcica — aquífero carbonático ou recarga recente',
        });
    }
    if (!isCa && isHco3) {
        return Object.freeze({
            type: 'Na-HCO3',
            description: 'Água bicarbonatada sódica — troca iônica Na-Ca em aquífero confinado',
        });
    }
    if (isCa && !isHco3) {
        return Object.freeze({
            type: 'Ca-SO4/Cl',
            description: 'Água sulfatada/cloretada cálcica — dissolução de gipsita ou intrusão salina',
        });
    }
    // !isCa && !isHco3: distinguir Na-Cl vs Na-SO4 pelo valor de x (Cl% implícito)
    if (x >= 65) {
        return Object.freeze({
            type: 'Na-Cl',
            description: 'Água cloretada sódica — salina/marinha ou influência antrópica',
        });
    }
    return Object.freeze({
        type: 'Na-SO4',
        description: 'Água sulfatada sódica — zona árida ou contaminação industrial',
    });
}

// ---------------------------------------------------------------------------
// 5. computeStiffCoordinates
// ---------------------------------------------------------------------------

/**
 * Calcula coordenadas para o diagrama de Stiff (Stiff 1951).
 *
 * O diagrama de Stiff representa a composição química da água em forma de
 * "asa" com quatro pares de linhas horizontais. Cátions são plotados à
 * esquerda (valores negativos) e ânions à direita (valores positivos).
 *
 * Estrutura padrão (Stiff 1951, Fig. 1):
 *   Linha 3 (y=3): Na+K  |  Cl
 *   Linha 2 (y=2): Ca    |  HCO3
 *   Linha 1 (y=1): Mg    |  SO4
 *   Linha 0 (y=0): Fe    |  CO3  (opcional - presente se Fe ou CO3 > 0)
 *
 * @param {Record<string, number|undefined|null>} ions_meqL - Concentrações em meq/L.
 *   Suporta: Ca, Mg, Na, K, HCO3, SO4, Cl, Fe, CO3.
 * @returns {Readonly<{lines: ReadonlyArray<Readonly<{y: number, leftValue: number, rightValue: number, leftLabel: string, rightLabel: string}>>}>} { lines }
 *
 * @example
 * computeStiffCoordinates({ Ca: 3.2, Mg: 1.5, Na: 2.1, K: 0.1, HCO3: 4.0, SO4: 1.8, Cl: 1.4 })
 */
export function computeStiffCoordinates(ions_meqL: Record<string, number|undefined|null>): Readonly<{lines: ReadonlyArray<Readonly<{y: number, leftValue: number, rightValue: number, leftLabel: string, rightLabel: string}>>}> {
    if (!ions_meqL || typeof ions_meqL !== 'object') {
        throw new TypeError('ions_meqL deve ser um objeto { ion: meq/L }');
    }

    const naK = ionVal(ions_meqL, 'Na') + ionVal(ions_meqL, 'K');
    const ca = ionVal(ions_meqL, 'Ca');
    const mg = ionVal(ions_meqL, 'Mg');
    const fe = ionVal(ions_meqL, 'Fe');
    const cl = ionVal(ions_meqL, 'Cl');
    const hco3 = ionVal(ions_meqL, 'HCO3');
    const so4 = ionVal(ions_meqL, 'SO4');
    const co3 = ionVal(ions_meqL, 'CO3');

        const lines: Array<Readonly<{y: number, leftValue: number, rightValue: number, leftLabel: string, rightLabel: string}>>= [
        Object.freeze({ y: 3, leftValue: naK, rightValue: cl, leftLabel: 'Na+K', rightLabel: 'Cl' }),
        Object.freeze({ y: 2, leftValue: ca, rightValue: hco3, leftLabel: 'Ca', rightLabel: 'HCO3' }),
        Object.freeze({ y: 1, leftValue: mg, rightValue: so4, leftLabel: 'Mg', rightLabel: 'SO4' }),
    ];

    // Linha 0 (Fe / CO3) - inclusa apenas se algum valor > 0
    if (fe > 0 || co3 > 0) {
        lines.push(Object.freeze({ y: 0, leftValue: fe, rightValue: co3, leftLabel: 'Fe', rightLabel: 'CO3' }));
    }

    return Object.freeze({ lines: Object.freeze(lines) });
}

// ---------------------------------------------------------------------------
// 6. computeIonicStrength
// ---------------------------------------------------------------------------

/**
 * Calcula a força iônica I e o coeficiente de atividade γ via equação de Davies.
 *
 * Força iônica (Debye-Hückel):
 *   I = 0.5 × Σ(ci × zi²)    [mol/L]
 *
 * Coeficiente de atividade - equação de Davies (Davies 1938):
 *   log(γ) = -A × z² × (√I / (1 + √I) - 0.3 × I)
 *   onde A = 0.509 a 25°C
 *   Válida para I < 0.5 mol/L (acima disso, usar Pitzer)
 *
 * @param {Record<string, number|undefined|null>} ions_molL - Concentrações em mol/L.
 *   Suporta: Ca, Mg, Na, K, HCO3, SO4, Cl, NO3, Fe, Mn.
 * @returns {Readonly<{ionicStrength: number, unit: string, activityCoefficient: number, davisValid: boolean}>}
 *   { ionicStrength, unit: 'mol/L', activityCoefficient, davisValid }
 *   activityCoefficient: coef. médio ponderado por z² dos íons presentes
 *   davisValid: true se I < 0.5 mol/L (intervalo de validade da equação de Davies)
 */
export function computeIonicStrength(ions_molL: Record<string, number|undefined|null>): Readonly<{ionicStrength: number, unit: string, activityCoefficient: number, davisValid: boolean}> {
    if (!ions_molL || typeof ions_molL !== 'object') {
        throw new TypeError('ions_molL deve ser um objeto { ion: mol/L }');
    }

    const A = 0.509; // constante de Debye-Hückel a 25°C, água pura (Hem 1985, p. 54)

    let sumIon = 0; // Σ(ci × zi²)
    let sumZ2 = 0; // Σ(zi²) para ponderar γ médio
    let ionCount = 0;

    for (const [ion, valence] of Object.entries(VALENCES)) {
        if (!Object.prototype.hasOwnProperty.call(ions_molL, ion)) continue;
        const c = ions_molL[ion];
        if (c == null || !isFinite(c) || c < 0) continue;
        const z2 = valence * valence;
        sumIon += c * z2;
        sumZ2 += z2;
        ionCount++;
    }

    const ionicStrength = 0.5 * sumIon;
    const davisValid = ionicStrength < 0.5;

    // Coeficiente de atividade médio (usando z² médio ponderado)
    // Para água potável/subterrânea típica, z²_médio ≈ misto; usa valor representativo
    const zAvg2 = ionCount > 0 ? sumZ2 / ionCount : 1;
    const sqrtI = Math.sqrt(ionicStrength);
    // Equação de Davies: log(γ) = -A × z² × (√I/(1+√I) - 0.3I)
    const logGamma = -A * zAvg2 * (sqrtI / (1 + sqrtI) - 0.3 * ionicStrength);
    const activityCoefficient = Math.pow(10, logGamma);

    return Object.freeze({
        ionicStrength,
        unit: 'mol/L',
        activityCoefficient,
        davisValid,
    });
}

// ---------------------------------------------------------------------------
// 7. computeSchoellerIndex
// ---------------------------------------------------------------------------

/**
 * Calcula os valores log10(meq/L) para o diagrama de Schoeller (Schoeller 1962).
 *
 * O diagrama de Schoeller (semi-log) permite comparar múltiplas amostras
 * de água em escala logarítmica para identificar padrões geoquímicos,
 * mistura de fontes e evolução hidroquímica.
 *
 * Íons representados no eixo X (ordem convencional Schoeller):
 *   Na+K, Ca, Mg, Cl, SO4, HCO3
 *
 * @param {Array<{id?: string|number, ions_meqL?: Record<string, number|undefined|null>}>} samples - Array de { id, ions_meqL: { ... } }
 * @returns {ReadonlyArray<Readonly<{id: string|number|undefined, logValues: Readonly<{NaK:number, Ca:number, Mg:number, Cl:number, SO4:number, HCO3:number}>}>>}
 *   Array de { id, logValues: { NaK, Ca, Mg, Cl, SO4, HCO3 } }
 *   Valores = log10(meq/L); íons com 0 meq/L retornam -Infinity (log10(0))
 *   Caller deve tratar -Infinity como ausente/abaixo do limite de detecção
 */
export function computeSchoellerIndex(samples: Array<{id?: string|number, ions_meqL?: Record<string, number|undefined|null>}>): ReadonlyArray<Readonly<{id: string|number|undefined, logValues: Readonly<{NaK:number, Ca:number, Mg:number, Cl:number, SO4:number, HCO3:number}>}>> {
    if (!Array.isArray(samples)) {
        throw new TypeError('samples deve ser um array de objetos');
    }
    return Object.freeze(
        samples.map((sample) => {
            const { id, ions_meqL } = sample;
            const ions = ions_meqL || {};

            const naK = ionVal(ions, 'Na') + ionVal(ions, 'K');
            const ca = ionVal(ions, 'Ca');
            const mg = ionVal(ions, 'Mg');
            const cl = ionVal(ions, 'Cl');
            const so4 = ionVal(ions, 'SO4');
            const hco3 = ionVal(ions, 'HCO3');

            return Object.freeze({
                id,
                logValues: Object.freeze({
                    NaK: naK > 0 ? Math.log10(naK) : -Infinity,
                    Ca: ca > 0 ? Math.log10(ca) : -Infinity,
                    Mg: mg > 0 ? Math.log10(mg) : -Infinity,
                    Cl: cl > 0 ? Math.log10(cl) : -Infinity,
                    SO4: so4 > 0 ? Math.log10(so4) : -Infinity,
                    HCO3: hco3 > 0 ? Math.log10(hco3) : -Infinity,
                }),
            });
        }),
    );
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const hydrogeochemistryMeta = {
    name: 'hydrogeochemistry',
    description: 'Hydrogeochemical Analysis',
    category: 'analytics',
    familyTags: ['geochemistry'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // CONNECTOR populated 2026-06-02 — Análise hidrogeoquímica (Piper, charge balance, ion ratios)
    // Reference: Hem (1985) USGS Water-Supply Paper 2254
    inputSchema: {
        type: 'object',
        properties: {
            ions_mgL: { type: 'object', description: 'Concentrações iônicas (Ca, Mg, Na, K, HCO3, SO4, Cl)', additionalProperties: { type: 'number' } },
            TDS_mgL: { type: 'number', default: 0, description: 'Total Dissolved Solids' },
        },
        required: ['ions_mgL'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            ions_meqL: { type: 'object', description: 'Concentrações convertidas para meq/L' },
            chargeBalance: { type: 'object', properties: { CBE_percent: { type: 'number' }, acceptable: { type: 'boolean' } } },
            piperCoords: { type: 'object', description: 'Coordenadas triângulos catíon/ânion + diamante' },
        },
        required: ['ions_meqL'],
    },
};
