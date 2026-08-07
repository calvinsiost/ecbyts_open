// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Waste Composting Model - Degradation Rate, Mass Reduction and Maturity Assessment
 *
 * Módulo puro implementando modelos de compostagem de resíduos sólidos:
 * taxa de degradação combinada (C:N, umidade, temperatura), redução de massa
 * exponencial, índice de maturidade e classificação de qualidade conforme
 * Instrução Normativa MAPA 35/2006.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   Haug, R.T. (1993). The Practical Handbook of Compost Engineering.
 *     Lewis Publishers/CRC Press, Boca Raton, FL.
 *     ISBN: 9781566700276
 *   MAPA (2006). Instrução Normativa SDA nº 35, de 4 de julho de 2006.
 *     Ministério da Agricultura, Pecuária e Abastecimento - padrões de qualidade
 *     para fertilizantes orgânicos composto (Classes A, B e C).
 *   Bernal, M.P. et al. (2009). Composting of animal manures and chemical criteria
 *     for compost maturity assessment. A review. Bioresour. Technol. 100(22):5444–5453.
 *     DOI: 10.1016/j.biortech.2008.11.027
 *
 * @module wasteCompostingModel
 */

// Faixa ótima de C:N para compostagem (Haug 1993, cap. 3)
// Optimal C:N range for composting (Haug 1993, ch. 3)
const CN_OPT_LOW = 25;
const CN_OPT_HIGH = 35;

// Faixa ótima de umidade (% base úmida) - Haug (1993)
// Optimal moisture range (% wet basis)
const MOISTURE_OPT_LOW = 50;
const MOISTURE_OPT_HIGH = 60;

// Faixa ótima de temperatura termofílica (°C) - Bernal et al. (2009)
// Optimal thermophilic temperature range (°C)
const TEMP_OPT_LOW = 55;
const TEMP_OPT_HIGH = 65;

// Taxa de degradação de referência sob condições ótimas (dia⁻¹) - estimativa Haug (1993)
// Reference degradation rate under optimal conditions (day⁻¹)
const K_REF = 0.05;

interface ComputeCompostingRateResult { degradation_rate_per_day: number; }
interface ComputeMassReductionResult { final_mass_kg: number; reduction_pct: number; }
interface ComputeMaturityIndexResult { MI: number; maturity: 'immature' | 'active' | 'curing' | 'mature'; }
interface ClassifyCompostQualityResult { quality: 'class_A' | 'class_B' | 'class_C' | 'rejected'; }

/**
 * Compute composting degradation rate based on environmental conditions.
 * Calcula a taxa de degradação combinada levando em conta C:N, umidade e temperatura.
 *
 * Abordagem: cada fator é calculado como um índice de eficiência [0,1] e
 * a taxa total é k = k_ref × f_CN × f_moisture × f_temperature (Haug 1993).
 * Fatores: triangular peak (1.0 no ótimo, decrescente linearmente fora).
 *
 * @param {number} C_N_ratio     - Carbon-to-Nitrogen ratio (dimensionless); [5, 100]
 * @param {number} moisture_pct  - Moisture content (% wet basis); [0, 100]
 * @param {number} temperature_C - Pile temperature (°C); [0, 80]
 * @returns {{ degradation_rate_per_day: number }}
 * @throws {RangeError} se parâmetros fora dos intervalos aceitáveis
 */
function validateCompostingInputs(C_N_ratio: number, moisture_pct: number, temperature_C: number): void {
    if (typeof C_N_ratio !== 'number' || C_N_ratio < 5 || C_N_ratio > 100) {
        throw new RangeError('C_N_ratio must be in [5, 100]');
    }
    if (typeof moisture_pct !== 'number' || moisture_pct < 0 || moisture_pct > 100) {
        throw new RangeError('moisture_pct must be in [0, 100]');
    }
    if (typeof temperature_C !== 'number' || temperature_C < 0 || temperature_C > 80) {
        throw new RangeError('temperature_C must be in [0, 80]');
    }
}

function computeCNFactor(C_N_ratio: number): number {
    if (C_N_ratio >= CN_OPT_LOW && C_N_ratio <= CN_OPT_HIGH) return 1.0;
    if (C_N_ratio < CN_OPT_LOW) return Math.max(0, C_N_ratio / CN_OPT_LOW);
    // Alto C:N (>35) limita nitrogênio disponível para microrganismos
    return Math.max(0, 1 - (C_N_ratio - CN_OPT_HIGH) / (100 - CN_OPT_HIGH));
}

function computeMoistureFactor(moisture_pct: number): number {
    if (moisture_pct >= MOISTURE_OPT_LOW && moisture_pct <= MOISTURE_OPT_HIGH) return 1.0;
    if (moisture_pct < MOISTURE_OPT_LOW) return Math.max(0, (moisture_pct - 30) / (MOISTURE_OPT_LOW - 30));
    return Math.max(0, 1 - (moisture_pct - MOISTURE_OPT_HIGH) / (70 - MOISTURE_OPT_HIGH));
}

function computeTemperatureFactor(temperature_C: number): number {
    if (temperature_C >= TEMP_OPT_LOW && temperature_C <= TEMP_OPT_HIGH) return 1.0;
    if (temperature_C < TEMP_OPT_LOW) return Math.max(0, temperature_C / TEMP_OPT_LOW);
    // Acima de 65°C começa inativação microbiana
    return Math.max(0, 1 - (temperature_C - TEMP_OPT_HIGH) / (80 - TEMP_OPT_HIGH));
}

export function computeCompostingRate(C_N_ratio: number, moisture_pct: number, temperature_C: number): ComputeCompostingRateResult {
    validateCompostingInputs(C_N_ratio, moisture_pct, temperature_C);

    const f_CN = computeCNFactor(C_N_ratio);
    const f_moisture = computeMoistureFactor(moisture_pct);
    const f_temp = computeTemperatureFactor(temperature_C);

    // Taxa combinada (multiplicativa) - modelo Liebig adaptado à compostagem (Haug 1993)
    const degradation_rate_per_day = K_REF * f_CN * f_moisture * f_temp;

    return { degradation_rate_per_day };
}

/**
 * Compute mass reduction over time using first-order exponential decay.
 * Calcula a redução de massa ao longo do tempo por decaimento exponencial de primeira ordem.
 *
 * M(t) = M₀ × e^(-k × t)
 * Onde k é a taxa de degradação (dia⁻¹) e t é o tempo em dias.
 *
 * @param {number} initial_mass_kg     - Initial wet mass of compost pile (kg); > 0
 * @param {number} degradation_rate    - Degradation rate constant (day⁻¹); >= 0
 * @param {number} days                - Composting duration (days); >= 0
 * @returns {{ final_mass_kg: number, reduction_pct: number }}
 * @throws {RangeError} se parâmetros fora do intervalo válido
 */
export function computeMassReduction(initial_mass_kg: number, degradation_rate: number, days: number): ComputeMassReductionResult {
    if (typeof initial_mass_kg !== 'number' || initial_mass_kg <= 0) {
        throw new RangeError('initial_mass_kg must be a positive number');
    }
    if (typeof degradation_rate !== 'number' || degradation_rate < 0) {
        throw new RangeError('degradation_rate must be >= 0');
    }
    if (typeof days !== 'number' || days < 0) {
        throw new RangeError('days must be >= 0');
    }

    // Decaimento exponencial de primeira ordem: M(t) = M0 × exp(-k × t)
    const final_mass_kg = initial_mass_kg * Math.exp(-degradation_rate * days);
    const reduction_pct = ((initial_mass_kg - final_mass_kg) / initial_mass_kg) * 100;

    return { final_mass_kg, reduction_pct };
}

/**
 * Compute compost maturity index (MI) from process parameters.
 * Calcula o índice de maturidade (MI) do composto a partir de parâmetros do processo.
 *
 * MI = clamp(dias/60 × f_temp × f_CN, 0, 1)
 * onde f_temp = temp > 40 ? 1 : temp/40
 *      f_CN   = CN < 30 ? 1 : 30/CN
 * Categorias: immature (<0.25), active (0.25–0.5), curing (0.5–0.8), mature (>0.8)
 *
 * @param {number} temperature_C  - Current pile temperature (°C); [0, 80]
 * @param {number} days_elapsed   - Days since composting started; >= 0
 * @param {number} C_N_ratio      - Current C:N ratio; [5, 100]
 * @returns {{ MI: number, maturity: 'immature'|'active'|'curing'|'mature' }}
 * @throws {RangeError} se parâmetros fora do intervalo válido
 */
export function computeMaturityIndex(temperature_C: number, days_elapsed: number, C_N_ratio: number): ComputeMaturityIndexResult {
    if (typeof temperature_C !== 'number' || temperature_C < 0 || temperature_C > 80) {
        throw new RangeError('temperature_C must be in [0, 80]');
    }
    if (typeof days_elapsed !== 'number' || days_elapsed < 0) {
        throw new RangeError('days_elapsed must be >= 0');
    }
    if (typeof C_N_ratio !== 'number' || C_N_ratio < 5 || C_N_ratio > 100) {
        throw new RangeError('C_N_ratio must be in [5, 100]');
    }

    // Fator de temperatura - acima de 40°C considera-se termofílico ativo (f=1)
    const f_temp = temperature_C > 40 ? 1.0 : temperature_C / 40;

    // Fator C:N - relação ≤30 indica boa disponibilidade de nitrogênio (f=1)
    const f_CN = C_N_ratio <= 30 ? 1.0 : 30 / C_N_ratio;

    // MI combinado: maturidade aumenta linearmente com o tempo (referência: 60 dias)
    const raw_MI = (days_elapsed / 60) * f_temp * f_CN;
    const MI = Math.min(1, Math.max(0, raw_MI));

    let maturity: 'immature' | 'active' | 'curing' | 'mature';
    if (MI > 0.8) maturity = 'mature';
    else if (MI > 0.5) maturity = 'curing';
    else if (MI > 0.25) maturity = 'active';
    else maturity = 'immature';

    return { MI, maturity };
}

/**
 * Classify compost quality according to MAPA IN 35/2006 (adapted).
 * Classifica a qualidade do composto conforme IN MAPA 35/2006 (adaptado).
 *
 * Regras (simplificadas):
 *   class_A   : MI > 0.8 e heavy_metals_index <= 0.5 (baixo risco)
 *   class_B   : MI > 0.5 e heavy_metals_index <= 1.0
 *   class_C   : MI > 0.25 e heavy_metals_index <= 2.0
 *   rejected  : MI <= 0.25 ou heavy_metals_index > 2.0 (imaturo ou contaminado)
 *
 * @param {number} MI                 - Maturity Index [0, 1]
 * @param {number} heavy_metals_index - Relative heavy metals contamination index [0, 10]
 * @returns {{ quality: 'class_A'|'class_B'|'class_C'|'rejected' }}
 * @throws {RangeError} se parâmetros fora do intervalo válido
 */
export function classifyCompostQuality(MI: number, heavy_metals_index: number): ClassifyCompostQualityResult {
    if (typeof MI !== 'number' || MI < 0 || MI > 1) {
        throw new RangeError('MI must be in [0, 1]');
    }
    if (typeof heavy_metals_index !== 'number' || heavy_metals_index < 0) {
        throw new RangeError('heavy_metals_index must be >= 0');
    }

    let quality: 'class_A' | 'class_B' | 'class_C' | 'rejected';
    if (MI > 0.8 && heavy_metals_index <= 0.5) {
        quality = 'class_A';
    } else if (MI > 0.5 && heavy_metals_index <= 1.0) {
        quality = 'class_B';
    } else if (MI > 0.25 && heavy_metals_index <= 2.0) {
        quality = 'class_C';
    } else {
        quality = 'rejected';
    }

    return { quality };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wasteCompostingModelMeta = {
    name: 'wasteCompostingModel',
    description: 'wasteCompostingModel',
    category: 'analytics',
    familyTags: ['waste'],
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
