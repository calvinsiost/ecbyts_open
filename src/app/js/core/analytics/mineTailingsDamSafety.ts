// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * mineTailingsDamSafety.js - Segurança de Barragens de Rejeitos de Mineração
 *
 * Implementa cálculos de análise de estabilidade e risco de barragens de rejeitos
 * conforme ABNT NBR 13028:2017, ICOLD Bulletin 121 (1996), e DNPM/ANM Portaria 70.389/2017
 * (revisada pela Política Nacional de Segurança de Barragens - PNSB, Lei 12.334/2010).
 *
 * Inclui: Fator de Segurança ao deslizamento (método de Bishop simplificado),
 * classificação de risco ANM, índice de dano potencial associado (DPA),
 * e verificação de freeboard mínimo.
 *
 * Referências / References:
 *   - ABNT NBR 13028:2017. Mineração - Elaboração e apresentação de projeto de disposição
 *     de resíduos em depósitos de resíduos sólidos industriais.
 *   - ICOLD Bulletin 121 (1996). Tailings Dams - Risk of Dangerous Occurrences.
 *   - Bishop, A.W. (1955). The use of the slip circle in the stability analysis of slopes.
 *     Géotechnique 5(1): 7–17. DOI:10.1680/geot.1955.5.1.7
 *   - ANM Portaria 70.389/2017. Cadastro Técnico de Barragens de Mineração.
 *   - PNSB - Lei Federal 12.334/2010 (Política Nacional de Segurança de Barragens).
 *   - DNPM Resolução Conjunta n. 4/2016. Critérios de classificação de barragens.
 */

'use strict';

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
 * Categorias de Dano Potencial Associado (DPA) conforme ANM/PNSB.
 * @private
 */
const DPA_SCORES: Record<string, number> = {
    // Existência de população à jusante
    sem_populacao: 0,
    populacao_eventual: 1,
    populacao_fixa: 3,
    area_urbana: 5,
    // Infraestrutura impactada
    sem_infraestrutura: 0,
    rodovia_local: 1,
    rodovia_federal: 2,
    ferrovia: 2,
    area_industrial: 2,
    // Impacto ambiental
    impacto_baixo: 0,
    impacto_medio: 1,
    impacto_alto: 3,
};

/**
 * Calcula o Fator de Segurança ao deslizamento pelo método de Bishop Simplificado
 * para talude de barragem de rejeitos.
 *
 * FS = [Σ (c' × b + (W − ub) × tan φ') / mα] / [Σ W × sin α]
 *
 * Para cálculo simplificado (fatia única ou média de fatias):
 * FS ≈ (c' × L_base + N' × tan φ') / T
 * onde N' = carga normal efetiva, T = força motriz tangencial.
 *
 * @param cohesion_kPa        - Coesão efetiva c' (kPa). Deve ser >= 0.
 * @param frictionAngle_deg   - Ângulo de atrito interno φ' (graus). [0, 45]
 * @param slopeAngle_deg      - Ângulo do talude β (graus). (0, 75]
 * @param sliceWeight_kN      - Peso da fatia crítica W (kN/m). Deve ser > 0.
 * @param poreWaterPressure_kPa - Pressão de água nos poros u (kPa). >= 0.
 * @param sliceBase_m         - Largura da base da fatia b (m). Deve ser > 0.
 * @returns
 *   - FS: Fator de Segurança (adimensional)
 *   - status: 'stable'|'marginal'|'unstable' conforme critérios ABNT NBR 13028
 * @throws {RangeError} Para inputs fora dos intervalos válidos.
 *
 * Ref: Bishop (1955) DOI:10.1680/geot.1955.5.1.7; ABNT NBR 13028:2017 Seção 6.3.
 */
export function calcSlopeSafetyFactor(
    cohesion_kPa: number,
    frictionAngle_deg: number,
    slopeAngle_deg: number,
    sliceWeight_kN: number,
    poreWaterPressure_kPa: number,
    sliceBase_m: number,
): { FS: number; status: string } {
    if (!Number.isFinite(cohesion_kPa) || cohesion_kPa < 0)
        throw new RangeError(`cohesion_kPa deve ser >= 0; recebido: ${cohesion_kPa}`);
    if (!Number.isFinite(frictionAngle_deg) || frictionAngle_deg < 0 || frictionAngle_deg > 45)
        throw new RangeError(`frictionAngle_deg deve estar em [0, 45]; recebido: ${frictionAngle_deg}`);
    if (!Number.isFinite(slopeAngle_deg) || slopeAngle_deg <= 0 || slopeAngle_deg > 75)
        throw new RangeError(`slopeAngle_deg deve estar em (0, 75]; recebido: ${slopeAngle_deg}`);
    if (!Number.isFinite(sliceWeight_kN) || sliceWeight_kN <= 0)
        throw new RangeError(`sliceWeight_kN deve ser > 0; recebido: ${sliceWeight_kN}`);
    if (!Number.isFinite(poreWaterPressure_kPa) || poreWaterPressure_kPa < 0)
        throw new RangeError(`poreWaterPressure_kPa deve ser >= 0; recebido: ${poreWaterPressure_kPa}`);
    if (!Number.isFinite(sliceBase_m) || sliceBase_m <= 0)
        throw new RangeError(`sliceBase_m deve ser > 0; recebido: ${sliceBase_m}`);

    const beta = (slopeAngle_deg * Math.PI) / 180;
    const phi = (frictionAngle_deg * Math.PI) / 180;

    // Força normal efetiva na base da fatia: N' = W cos β − u × b
    const N_prime = sliceWeight_kN * Math.cos(beta) - poreWaterPressure_kPa * sliceBase_m;

    // Resistência ao cisalhamento na base: R = c' × b + N' × tan φ'
    const resistance = cohesion_kPa * sliceBase_m + Math.max(0, N_prime) * Math.tan(phi);

    // Força motriz: T = W × sin β
    const driving = sliceWeight_kN * Math.sin(beta);

    if (driving <= 0) return { FS: Infinity, status: 'stable' };

    const FS = resistance / driving;

    let status;
    if (FS >= 1.5)
        status = 'stable'; // ABNT NBR 13028 FS_min = 1.50 (operacional)
    else if (FS >= 1.3)
        status = 'marginal'; // FS_min = 1.30 (final de vida útil/inativo)
    else status = 'unstable';

    return { FS, status };
}

/**
 * Calcula o índice de Dano Potencial Associado (DPA) para classificação ANM.
 *
 * DPA = soma ponderada de subcritérios:
 *   população à jusante + infraestrutura crítica + impacto ambiental
 *
 * @param populationCategory - Categoria de população ('sem_populacao'|'populacao_eventual'|'populacao_fixa'|'area_urbana').
 * @param infrastructureCategory - Categoria de infraestrutura ('sem_infraestrutura'|'rodovia_local'|'rodovia_federal'|'ferrovia'|'area_industrial').
 * @param environmentalImpact - Impacto ambiental ('impacto_baixo'|'impacto_medio'|'impacto_alto').
 * @returns Índice e classe DPA.
 * @throws {TypeError} Para categorias desconhecidas.
 *
 * Ref: ANM Portaria 70.389/2017, Anexo II; DNPM Resolução Conjunta n. 4/2016.
 */
export function calcDamagePotentialIndex(
    populationCategory: string,
    infrastructureCategory: string,
    environmentalImpact: string,
): { dpaScore: number; dpaClass: 'baixo' | 'medio' | 'alto' } {
    for (const [name, val] of [
        ['populationCategory', populationCategory],
        ['infrastructureCategory', infrastructureCategory],
        ['environmentalImpact', environmentalImpact],
    ] as Array<[string, string]>) {
        if (!(val in DPA_SCORES)) {
            throw new TypeError(`${name} desconhecida: '${val}'. Válidas: ${Object.keys(DPA_SCORES).join(', ')}`);
        }
    }
    const dpaScore =
        DPA_SCORES[populationCategory]! + DPA_SCORES[infrastructureCategory]! + DPA_SCORES[environmentalImpact]!;

    let dpaClass: 'baixo' | 'medio' | 'alto';
    if (dpaScore <= 1) dpaClass = 'baixo';
    else if (dpaScore <= 4) dpaClass = 'medio';
    else dpaClass = 'alto';

    return { dpaScore, dpaClass };
}

/**
 * Verifica se o freeboard (borda livre) da barragem atende ao mínimo regulatório.
 *
 * Freeboard mínimo conforme ICOLD Bulletin 121 e ABNT NBR 13028:
 *   - Mínimo absoluto: 1.0 m (qualquer barragem)
 *   - Recomendado (H > 15 m): 1.5 m
 *   - Recomendado (H > 30 m): 2.0 m
 *
 * @param damHeight_m        - Altura da barragem H (m). Deve ser > 0.
 * @param waterLevel_m       - Cota do nível d'água (m). Deve ser >= 0.
 * @param crestElevation_m   - Cota da crista da barragem (m). Deve ser > waterLevel_m.
 * @throws {RangeError} Para inputs inválidos.
 *
 * Ref: ICOLD Bulletin 121 (1996) Section 4.2; ABNT NBR 13028:2017 Seção 5.4.
 */
export function checkFreeboardCompliance(
    damHeight_m: number,
    waterLevel_m: number,
    crestElevation_m: number,
): { freeboard_m: number; minimumRequired_m: number; compliant: boolean } {
    if (!Number.isFinite(damHeight_m) || damHeight_m <= 0)
        throw new RangeError(`damHeight_m deve ser > 0; recebido: ${damHeight_m}`);
    if (!Number.isFinite(waterLevel_m) || waterLevel_m < 0)
        throw new RangeError(`waterLevel_m deve ser >= 0; recebido: ${waterLevel_m}`);
    if (!Number.isFinite(crestElevation_m)) throw new RangeError(`crestElevation_m inválida: ${crestElevation_m}`);

    const freeboard_m = crestElevation_m - waterLevel_m;

    let minimumRequired_m;
    if (damHeight_m > 30) minimumRequired_m = 2.0;
    else if (damHeight_m > 15) minimumRequired_m = 1.5;
    else minimumRequired_m = 1.0;

    return {
        freeboard_m,
        minimumRequired_m,
        compliant: freeboard_m >= minimumRequired_m,
    };
}

/**
 * Classifica a barragem conforme a Política Nacional de Segurança de Barragens (PNSB).
 *
 * Categoria é determinada pelo pior critério entre FS, DPA e freeboard.
 *
 * @param FS              - Fator de Segurança calculado.
 * @param dpaClass - Classe de dano potencial.
 * @param freeboardCompliant - true se freeboard estiver em conformidade.
 * @param damHeight_m     - Altura da barragem (m).
 * @returns Categoria ANM (A=maior risco, D=menor risco).
 *
 * Ref: ANM Portaria 70.389/2017; Lei 12.334/2010 Art. 7; DNPM Resolução 4/2016.
 */
export function classifyDamRiskCategory(
    FS: number,
    dpaClass: 'baixo' | 'medio' | 'alto',
    freeboardCompliant: boolean,
    damHeight_m: number,
): 'A' | 'B' | 'C' | 'D' {
    if (!Number.isFinite(FS) || FS < 0) throw new RangeError(`FS inválido: ${FS}`);
    if (!['baixo', 'medio', 'alto'].includes(dpaClass)) throw new TypeError(`dpaClass inválida: ${dpaClass}`);
    if (!Number.isFinite(damHeight_m) || damHeight_m <= 0) throw new RangeError(`damHeight_m deve ser > 0`);

    // Critérios de categoria A (máximo risco)
    if (!freeboardCompliant && dpaClass === 'alto') return 'A';
    if (FS < 1.0) return 'A';
    if (dpaClass === 'alto' && damHeight_m > 30) return 'A';

    // Critérios de categoria B
    if (!freeboardCompliant || FS < 1.3) return 'B';
    if (dpaClass === 'alto') return 'B';
    if (dpaClass === 'medio' && damHeight_m > 15) return 'B';

    // Critérios de categoria C
    if (dpaClass === 'medio') return 'C';
    if (FS < 1.5) return 'C';

    // Demais casos: categoria D (menor risco)
    return 'D';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineTailingsDamSafetyMeta: AnalyticsModuleMeta = {
    name: 'mineTailingsDamSafety',
    description: 'mineTailingsDamSafety',
    category: 'analytics',
    familyTags: ['mining', 'risk'],
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
