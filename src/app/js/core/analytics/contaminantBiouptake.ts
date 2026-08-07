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
 * Contaminant Biouptake - modelos de absorção de contaminantes por plantas.
 *
 * Referências acadêmicas:
 *   - Briggs, G.G., Bromilow, R.H., Evans, A.A. (1982). Relationships between
 *     lipophilicity and root uptake and translocation of non-ionised chemicals
 *     by barley. DOI:10.1111/j.1365-3180.1982.tb00476.x
 *   - Trapp, S. (2004). Plant uptake and transport models for neutral and
 *     ionic chemicals. Environmental Science & Pollution Research, 11(1), 33–39.
 *     DOI:10.1065/espr2003.08.169
 */

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
 * Calcula o Fator de Concentração na Raiz (RCF - Root Concentration Factor).
 * RCF = 0.82 + 0.03 × Kow × (lipid_pct / 100)
 * Modelo empírico de Briggs et al. (1982) para compostos não-ionizados.
 *
 * @param Kow - Coeficiente de partição octanol-água (adimensional, > 0).
 * @param lipid_pct - Teor de lipídios da raiz em % (0–100).
 * @returns Fator de concentração na raiz.
 * @throws {TypeError} Se parâmetros não forem números finitos.
 * @throws {RangeError} Se Kow ≤ 0 ou lipid_pct fora de [0, 100].
 */
export function computeRootConcentrationFactor(Kow: number, lipid_pct: number): { RCF: number } {
    if (typeof Kow !== 'number' || !isFinite(Kow)) {
        throw new TypeError('Kow deve ser um número finito');
    }
    if (typeof lipid_pct !== 'number' || !isFinite(lipid_pct)) {
        throw new TypeError('lipid_pct deve ser um número finito');
    }
    if (Kow <= 0) throw new RangeError('Kow deve ser positivo');
    if (lipid_pct < 0 || lipid_pct > 100) {
        throw new RangeError('lipid_pct deve estar entre 0 e 100');
    }
    // Equação de Briggs 1982 - fator 0.82 é a contribuição da água da raiz
    const RCF = 0.82 + 0.03 * Kow * (lipid_pct / 100);
    return { RCF };
}

/**
 * Calcula o Fator de Concentração na Corrente de Transpiração (TSCF).
 * TSCF = 0.784 × exp(-((log10(Kow) - 1.78)² / 2.44))
 * Modelo de Briggs et al. (1982) - curva gaussiana em log10(Kow).
 * Máximo próximo a Kow ≈ 60 (log10 ≈ 1.78), representando transporte ótimo.
 *
 * @param Kow - Coeficiente de partição octanol-água (adimensional, > 0).
 * @returns Fator de concentração na corrente de transpiração (0–1).
 * @throws {TypeError} Se Kow não for número finito.
 * @throws {RangeError} Se Kow ≤ 0.
 */
export function computeTranspirationStreamConcentrationFactor(Kow: number): { TSCF: number } {
    if (typeof Kow !== 'number' || !isFinite(Kow)) {
        throw new TypeError('Kow deve ser um número finito');
    }
    if (Kow <= 0) throw new RangeError('Kow deve ser positivo');

    const logKow = Math.log10(Kow);
    // Parâmetros ajustados empiricamente por Briggs para transporte xilema
    const TSCF = 0.784 * Math.exp(-((logKow - 1.78) ** 2) / 2.44);
    return { TSCF };
}

/**
 * Calcula o fluxo de absorção de contaminante pela raiz (planta inteira/dia).
 * flux (µg/d) = C_solo (mg/kg) × RCF × transpiração (L/d) × 1000 (conversão mg→µg)
 * Adaptado de Trapp (2004), DOI:10.1065/espr2003.08.169
 *
 * @param C_soil_mg_kg - Concentração no solo em mg/kg (ms). Deve ser ≥ 0.
 * @param RCF - Fator de concentração na raiz (adimensional, > 0).
 * @param transpiration_L_d - Taxa de transpiração da planta em L/dia (> 0).
 * @returns Fluxo de absorção em µg/dia.
 * @throws {TypeError} Se qualquer parâmetro não for número finito.
 * @throws {RangeError} Se C_soil_mg_kg < 0, RCF ≤ 0 ou transpiration_L_d ≤ 0.
 */
export function computePlantUptakeFlux(
    C_soil_mg_kg: number,
    RCF: number,
    transpiration_L_d: number,
): { flux_ug_d: number } {
    if (
        typeof C_soil_mg_kg !== 'number' ||
        !isFinite(C_soil_mg_kg) ||
        typeof RCF !== 'number' ||
        !isFinite(RCF) ||
        typeof transpiration_L_d !== 'number' ||
        !isFinite(transpiration_L_d)
    ) {
        throw new TypeError('Todos os parâmetros devem ser números finitos');
    }
    if (C_soil_mg_kg < 0) throw new RangeError('C_soil_mg_kg não pode ser negativo');
    if (RCF <= 0) throw new RangeError('RCF deve ser positivo');
    if (transpiration_L_d <= 0) throw new RangeError('transpiration_L_d deve ser positivo');

    // Fator 1000 converte mg para µg - unidade padrão de biomonitoramento
    const flux_ug_d = C_soil_mg_kg * RCF * transpiration_L_d * 1000;
    return { flux_ug_d };
}

/**
 * Classifica o potencial de bioabsorção com base no TSCF.
 * TSCF < 0.1  → negligible (absorção desprezível)
 * TSCF < 0.3  → low
 * TSCF < 0.7  → moderate
 * TSCF ≥ 0.7  → high (risco de fitocontaminação significativo)
 *
 * @param TSCF - Fator de concentração na corrente de transpiração (0–1).
 * @returns Potencial de bioabsorção.
 * @throws {TypeError} Se TSCF não for número finito.
 * @throws {RangeError} Se TSCF estiver fora de [0, 1].
 */
export function classifyBiouptakePotential(TSCF: number): { potential: string } {
    if (typeof TSCF !== 'number' || !isFinite(TSCF)) {
        throw new TypeError('TSCF deve ser um número finito');
    }
    if (TSCF < 0 || TSCF > 1) {
        throw new RangeError('TSCF deve estar entre 0 e 1');
    }
    if (TSCF < 0.1) return { potential: 'negligible' };
    if (TSCF < 0.3) return { potential: 'low' };
    if (TSCF < 0.7) return { potential: 'moderate' };
    return { potential: 'high' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const contaminantBiouptakeMeta: AnalyticsModuleMeta = {
    name: 'contaminantBiouptake',
    description: 'contaminantBiouptake',
    category: 'analytics',
    familyTags: ['contamination', 'bioaccumulation'],
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
