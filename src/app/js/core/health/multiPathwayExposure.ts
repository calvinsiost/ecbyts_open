// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 1 — Multi-Pathway Human Health Exposure and
   Risk Assessment (USEPA HHRA methodology)

   Referências acadêmicas (implementação independente):
     - USEPA (1989, 2011) "Risk Assessment Guidance for Superfund
       (RAGS) Part A" EPA/540/1-89/002
     - USEPA (2004) "Risk Assessment Guidance for Superfund Vol. I:
       Part E — Supplemental Guidance for Dermal Risk Assessment"
       EPA/540/R/99/005
     - USEPA (2011) "Exposure Factors Handbook" EPA/600/R-09/052F

   Vias de exposição implementadas:
     1. Ingestão incidental de solo (soil ingestion)
     2. Contato dérmico com solo contaminado (dermal contact)
     3. Inalação de ar contaminado / vapores (inhalation)
     4. Ingestão de água contaminada (water ingestion)

   Total ADD = ADD_ingestion + ADD_dermal + ADD_inhalation + ADD_water

   Lógica pura — sem DOM, sem IDB, sem Three.js.
   Importável no Node.js test runner sem configuração adicional.
   Todos os retornos públicos são Object.freeze().
   ================================================================ */

// ----------------------------------------------------------------
// Fator de conversão de unidades - mg → kg
// Cs em mg/kg × IR em mg/day ÷ 1e6 = mg/day de contaminante
// em seguida ÷ BW(kg) = mg/kg/day (ADD)
// ----------------------------------------------------------------
const MG_TO_KG = 1e-6;

// ----------------------------------------------------------------
// Dias por ano (calendário gregoriano)
// ----------------------------------------------------------------
const DAYS_PER_YEAR = 365;

// ----------------------------------------------------------------
// Perfis padrão de receptores - USEPA Exposure Factors Handbook
// (EPA/600/R-09/052F, Tables 3-1, 4-2, 6-1, 7-1, 8-2)
// AT_cancer: 70 anos × 365 dias (USEPA câncer: vida completa)
// AT_nc: mesmo que ED para não-carcinogênicos
// ----------------------------------------------------------------

/**
 * Perfis padrão de receptores USEPA para avaliação de exposição multi-via.
 *
 * Campos por perfil:
 *   BW          - peso corporal (kg)
 *   EF          - frequência de exposição (dias/ano)
 *   ED          - duração de exposição (anos)
 *   AT_cancer   - período de média para carcinogênicos (anos)
 *   AT_nc       - período de média para não-carcinogênicos (anos)
 *   IR_soil     - taxa de ingestão de solo (mg/dia)
 *   IR_water    - taxa de ingestão de água (L/dia)
 *   InhR        - taxa de inalação (m³/dia)
 *   SA          - área de superfície de pele exposta (cm²)
 *   AF          - fator de aderência de solo (mg/cm²/evento)
 */
export const DEFAULT_RECEPTOR_PROFILES: Readonly<{
    residential_adult: object;
    residential_child: object;
    worker_outdoor: object;
    worker_indoor: object;
}> = Object.freeze({
    residential_adult: Object.freeze({
        BW: 80,
        EF: 350,
        ED: 30,
        AT_cancer: 70,
        AT_nc: 30,
        IR_soil: 100,
        IR_water: 2.0,
        InhR: 20,
        SA: 1800,
        AF: 0.07,
    }),
    residential_child: Object.freeze({
        BW: 15,
        EF: 350,
        ED: 6,
        AT_cancer: 70,
        AT_nc: 6,
        IR_soil: 200,
        IR_water: 1.0,
        InhR: 8,
        SA: 1200,
        AF: 0.1,
    }),
    worker_outdoor: Object.freeze({
        BW: 80,
        EF: 225,
        ED: 25,
        AT_cancer: 70,
        AT_nc: 25,
        IR_soil: 50,
        IR_water: 0.5,
        InhR: 20,
        SA: 1200,
        AF: 0.12,
    }),
    worker_indoor: Object.freeze({
        BW: 80,
        EF: 250,
        ED: 25,
        AT_cancer: 70,
        AT_nc: 25,
        IR_soil: 50,
        IR_water: 0.5,
        InhR: 20,
        SA: 600,
        AF: 0.05,
    }),
});

// ----------------------------------------------------------------
// Helpers internos de validação
// ----------------------------------------------------------------

/**
 * Valida que todos os parâmetros necessários são números finitos positivos.
 * Lança TypeError com mensagem descritiva se falhar.
 *
 * @param params  objeto com campos a validar
 * @param requiredKeys  lista de chaves obrigatórias
 * @param fnName  nome da função chamadora (para mensagem de erro)
 */
function _requirePositiveNumbers(params: object, requiredKeys: string[], fnName: string): void {
    for (const key of requiredKeys) {
        const v = (params as Record<string, any>)[key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
            throw new TypeError(`${fnName}: parameter '${key}' must be a finite positive number, got ${v}`);
        }
    }
}

// ----------------------------------------------------------------
// 1. Via 1 - Ingestão Incidental de Solo
// ----------------------------------------------------------------

/**
 * Calcula a dose diária média (ADD) por ingestão incidental de solo.
 *
 * Fórmula RAGS Part A (USEPA 2011, Eq. 7-1):
 *   ADD = Cs × IR_soil × 1e-6 (kg/mg) × EF × ED / (BW × AT × 365)
 *
 * Unidade resultante: mg/kg-dia
 *
 * @throws {TypeError} se qualquer parâmetro não for número finito positivo
 */
export function computeSoilIngestionDose({
    Cs,
    IR_soil,
    EF,
    ED,
    BW,
    AT,
}: {
    Cs: number;
    IR_soil: number;
    EF: number;
    ED: number;
    BW: number;
    AT: number;
}): Readonly<{ add: number; unit: string; pathway: string }> {
    _requirePositiveNumbers(
        { Cs, IR_soil, EF, ED, BW, AT },
        ['Cs', 'IR_soil', 'EF', 'ED', 'BW', 'AT'],
        'computeSoilIngestionDose',
    );

    // ADD = Cs(mg/kg) × IR_soil(mg/day) × 1e-6(kg/mg) × EF(d/yr) × ED(yr)
    //       / ( BW(kg) × AT(yr) × 365(d/yr) )
    const add = (Cs * IR_soil * MG_TO_KG * EF * ED) / (BW * AT * DAYS_PER_YEAR);

    return Object.freeze({
        add,
        unit: 'mg/kg-day',
        pathway: 'soil_ingestion',
    });
}

// ----------------------------------------------------------------
// 2. Via 2 - Contato Dérmico com Solo Contaminado
// ----------------------------------------------------------------

/**
 * Calcula a ADD por contato dérmico com solo contaminado.
 *
 * Fórmula RAGS Part E (USEPA 2004, Eq. 3-1):
 *   ADD = Cs × SA × AF × ABS × 1e-6 (kg/mg) × EF × ED / (BW × AT × 365)
 *
 * Unidade resultante: mg/kg-dia
 *
 * @throws {TypeError} se parâmetros obrigatórios forem inválidos
 * @throws {RangeError} se ABS estiver fora de [0, 1]
 */
export function computeDermalContactDose({
    Cs,
    SA,
    AF,
    ABS,
    EF,
    ED,
    BW,
    AT,
}: {
    Cs: number;
    SA: number;
    AF: number;
    ABS: number;
    EF: number;
    ED: number;
    BW: number;
    AT: number;
}): Readonly<{ add: number; unit: string; pathway: string }> {
    _requirePositiveNumbers(
        { Cs, SA, AF, EF, ED, BW, AT },
        ['Cs', 'SA', 'AF', 'EF', 'ED', 'BW', 'AT'],
        'computeDermalContactDose',
    );

    if (typeof ABS !== 'number' || !Number.isFinite(ABS) || ABS < 0 || ABS > 1) {
        throw new RangeError(`computeDermalContactDose: ABS must be a finite number in [0, 1], got ${ABS}`);
    }

    // ADD = Cs(mg/kg) × SA(cm²) × AF(mg/cm²) × ABS(adim) × 1e-6(kg/mg)
    //       × EF(d/yr) × ED(yr) / ( BW(kg) × AT(yr) × 365(d/yr) )
    const add = (Cs * SA * AF * ABS * MG_TO_KG * EF * ED) / (BW * AT * DAYS_PER_YEAR);

    return Object.freeze({
        add,
        unit: 'mg/kg-day',
        pathway: 'dermal_contact',
    });
}

// ----------------------------------------------------------------
// 3. Via 3 - Inalação de Ar Contaminado
// ----------------------------------------------------------------

/**
 * Calcula a ADD por inalação de ar contaminado ou vapores de solo.
 *
 * Fórmula RAGS Part A (USEPA 2011, Eq. 7-2):
 *   ADD = Cair × InhR × EF × ED / (BW × AT × 365)
 *
 * Nota: Cair já expresso em mg/m³, InhR em m³/dia - nenhuma conversão de massa adicional.
 * Unidade resultante: mg/kg-dia.
 *
 * @throws {TypeError} se qualquer parâmetro não for número finito positivo
 */
export function computeInhalationDose({
    Cair,
    InhR,
    EF,
    ED,
    BW,
    AT,
}: {
    Cair: number;
    InhR: number;
    EF: number;
    ED: number;
    BW: number;
    AT: number;
}): Readonly<{ add: number; unit: string; pathway: string }> {
    _requirePositiveNumbers(
        { Cair, InhR, EF, ED, BW, AT },
        ['Cair', 'InhR', 'EF', 'ED', 'BW', 'AT'],
        'computeInhalationDose',
    );

    // ADD = Cair(mg/m³) × InhR(m³/d) × EF(d/yr) × ED(yr)
    //       / ( BW(kg) × AT(yr) × 365(d/yr) )
    const add = (Cair * InhR * EF * ED) / (BW * AT * DAYS_PER_YEAR);

    return Object.freeze({
        add,
        unit: 'mg/kg-day',
        pathway: 'inhalation',
    });
}

// ----------------------------------------------------------------
// 4. Via 4 - Ingestão de Água Contaminada
// ----------------------------------------------------------------

/**
 * Calcula a ADD por ingestão de água subterrânea ou superficial contaminada.
 *
 * Fórmula RAGS Part A (USEPA 2011, Eq. 7-3):
 *   ADD = Cw × IR_water × EF × ED / (BW × AT × 365)
 *
 * Nota: Cw em mg/L, IR_water em L/dia - unidades se cancelam sem fator de conversão adicional.
 * Unidade resultante: mg/kg-dia.
 *
 * @throws {TypeError} se qualquer parâmetro não for número finito positivo
 */
export function computeWaterIngestionDose({
    Cw,
    IR_water,
    EF,
    ED,
    BW,
    AT,
}: {
    Cw: number;
    IR_water: number;
    EF: number;
    ED: number;
    BW: number;
    AT: number;
}): Readonly<{ add: number; unit: string; pathway: string }> {
    _requirePositiveNumbers(
        { Cw, IR_water, EF, ED, BW, AT },
        ['Cw', 'IR_water', 'EF', 'ED', 'BW', 'AT'],
        'computeWaterIngestionDose',
    );

    // ADD = Cw(mg/L) × IR_water(L/d) × EF(d/yr) × ED(yr)
    //       / ( BW(kg) × AT(yr) × 365(d/yr) )
    const add = (Cw * IR_water * EF * ED) / (BW * AT * DAYS_PER_YEAR);

    return Object.freeze({
        add,
        unit: 'mg/kg-day',
        pathway: 'water_ingestion',
    });
}

// ----------------------------------------------------------------
// 5. Dose total multi-via (soma das vias)
// ----------------------------------------------------------------

/**
 * Agrega doses de múltiplas vias em dose total acumulada.
 *
 * Total ADD = Σ(addᵢ) para todas as vias fornecidas.
 * Calcula a fração de cada via (add_via / totalAdd) para identificar a via dominante.
 *
 * @param pathwayDoses
 *   - array com resultados de computeSoilIngestionDose, computeDermalContactDose,
 *     computeInhalationDose e/ou computeWaterIngestionDose
 * @throws {TypeError} se pathwayDoses não for array não-vazio
 */
export function computeTotalMultiPathwayDose(
    pathwayDoses: Array<Readonly<{ add: number; unit: string; pathway: string }>>,
): Readonly<{
    totalAdd: number;
    pathways: string[];
    dominantPathway: string;
    fractions: Readonly<object>;
    unit: string;
}> {
    if (!Array.isArray(pathwayDoses) || pathwayDoses.length === 0) {
        throw new TypeError(
            'computeTotalMultiPathwayDose: pathwayDoses must be a non-empty array of pathway dose objects',
        );
    }

    // Valida que cada elemento possui add numérico e pathway string
    for (let i = 0; i < pathwayDoses.length; i++) {
        const d = pathwayDoses[i];
        if (!d || typeof d.add !== 'number' || !Number.isFinite(d.add) || typeof d.pathway !== 'string') {
            throw new TypeError(
                `computeTotalMultiPathwayDose: element at index ${i} must have numeric 'add' and string 'pathway'`,
            );
        }
    }

    // Soma total
    const totalAdd = pathwayDoses.reduce((sum, d) => sum + d.add, 0);

    const pathways = pathwayDoses.map((d) => d.pathway);

    // Frações por via (add_via / totalAdd); proteção contra divisão por zero
    const fractions: Record<string, number> = {};
    let dominantPathway = pathwayDoses[0]!.pathway;
    let maxFraction = 0;

    for (const d of pathwayDoses) {
        const fraction = totalAdd > 0 ? d.add / totalAdd : 0;
        fractions[d.pathway] = fraction;
        if (fraction > maxFraction) {
            maxFraction = fraction;
            dominantPathway = d.pathway;
        }
    }

    return Object.freeze({
        totalAdd,
        pathways: Object.freeze(pathways),
        dominantPathway,
        fractions: Object.freeze(fractions),
        unit: 'mg/kg-day',
    }) as any;
}

// ----------------------------------------------------------------
// 6. Risco multi-via - Cancer Risk e Hazard Quotient
// ----------------------------------------------------------------

/**
 * Valida que value é número finito não-negativo.
 * @throws {TypeError} se inválido
 */
function _validateNonNegativeFinite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new TypeError(`${name} must be a finite non-negative number, got ${value}`);
    }
    return value;
}

/**
 * Valida que value é número finito positivo.
 * @throws {TypeError} se inválido
 */
function _validatePositiveFinite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${name} must be a finite positive number, got ${value}`);
    }
    return value;
}

/**
 * Classifica risco carcinogênico segundo thresholds USEPA.
 */
function _classifyCarcinogenRisk(cr: number): string {
    if (cr < 1e-6) return 'negligible';
    if (cr < 1e-4) return 'acceptable';
    return 'concern';
}

/**
 * Classifica quociente de perigo não-cancerígeno segundo threshold USEPA.
 */
function _classifyNonCancerRisk(hq: number): string {
    return hq >= 1 ? 'concern' : 'safe';
}

/**
 * Calcula risco carcinogênico (CR) e quociente de perigo (HQ) a partir da dose total.
 *
 * Cancer Risk (CR):
 *   CR = totalAdd × CSF
 *   - CSF: Cancer Slope Factor (mg/kg-dia)⁻¹ - USEPA IRIS
 *   - Classificação: negligible (<1e-6), acceptable (1e-6 ≤ CR <1e-4), concern (≥1e-4)
 *
 * Hazard Quotient (HQ):
 *   HQ = totalAdd / RfD
 *   - RfD: Reference Dose (mg/kg-dia) - USEPA IRIS
 *   - Classificação: safe (HQ <1), concern (HQ ≥1)
 *
 * Se csf ou rfd forem null/undefined, os respectivos campos não são calculados.
 *
 * @throws {TypeError} se totalAdd não for número finito não-negativo
 */
export function computeMultiPathwayRisk({
    totalAdd,
    csf = null,
    rfd = null,
}: {
    totalAdd: number;
    csf: number | null;
    rfd: number | null;
}): Readonly<{
    cr: number | null;
    hq: number | null;
    classification: Readonly<{ carcinogen: string | null; noncancer: string | null }>;
}> {
    _validateNonNegativeFinite(totalAdd, 'computeMultiPathwayRisk: totalAdd');

    // Calcula CR somente se csf for fornecido e válido
    let cr: number | null = null;
    let carcinogenClass: string | null = null;

    if (csf !== null && csf !== undefined) {
        cr = totalAdd * _validatePositiveFinite(csf, 'computeMultiPathwayRisk: csf');
        carcinogenClass = _classifyCarcinogenRisk(cr);
    }

    // Calcula HQ somente se rfd for fornecido e válido
    let hq: number | null = null;
    let noncancerClass: string | null = null;

    if (rfd !== null && rfd !== undefined) {
        hq = totalAdd / _validatePositiveFinite(rfd, 'computeMultiPathwayRisk: rfd');
        noncancerClass = _classifyNonCancerRisk(hq);
    }

    return Object.freeze({
        cr,
        hq,
        classification: Object.freeze({
            carcinogen: carcinogenClass,
            noncancer: noncancerClass,
        }),
    });
}
