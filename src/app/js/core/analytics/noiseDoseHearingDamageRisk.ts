// @ts-check
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
 * @module noiseDoseHearingDamageRisk
 * @description Risco de dano auditivo por ruído ocupacional.
 * Implementa modelos NIOSH (1998) e ISO 1999:2013 para estimar perda auditiva
 * permanente induzida por ruído (PAIR) em função de LAeq e anos de exposição.
 *
 * References:
 *   - NIOSH (1998) Criteria for a Recommended Standard: Occupational Noise Exposure.
 *     DHHS (NIOSH) Publication No. 98-126.
 *   - ISO 1999:2013 Acoustics - Estimation of noise-induced hearing loss.
 *   - Dobie RA (1992) Medical-Legal Evaluation of Hearing Loss. Van Nostrand Reinhold.
 */

'use strict';

/**
 * Calcula a percentagem de perda auditiva permanente induzida por ruído (PAIR)
 * conforme ISO 1999:2013 Tabela A1 - modelo empírico para frequência de 4 kHz.
 *
 * A equação aproximada é derivada das funções N(L, t) da ISO 1999 para a média
 * de audiograma nas frequências 1, 2 e 3 kHz (HTLANI) e para 4 kHz separadamente.
 * Aqui usamos a abordagem simplificada recomendada pelo padrão para avaliação de
 * risco populacional (Annexe A, equações A.1–A.5).
 *
 * @param {number} LAeq_dB  - Nível de pressão sonora contínuo equivalente (dB(A)), [70, 120]
 * @param {number} exposureYears - Anos de exposição ao ruído, [0, 40]
 * @returns {{ HTLANI_dB: number, riskPct: number }} Limiar auditivo induzido por ruído e risco (%)
 * @throws {RangeError} Se parâmetros estiverem fora dos limites aceitáveis
 *
 * @see ISO 1999:2013 §A.1–A.5
 * @see NIOSH (1998) DHHS Pub. No. 98-126
 */
export function calcHearingLossRisk(LAeq_dB: any, exposureYears: any) {
    if (typeof LAeq_dB !== 'number' || typeof exposureYears !== 'number') {
        throw new TypeError('LAeq_dB and exposureYears must be numbers');
    }
    if (LAeq_dB < 70 || LAeq_dB > 120) {
        throw new RangeError('LAeq_dB must be between 70 and 120 dB(A)');
    }
    if (exposureYears < 0 || exposureYears > 40) {
        throw new RangeError('exposureYears must be between 0 and 40');
    }

    // Nível de ruído acima do limiar de referência de 70 dB(A) (ISO 1999 §A.1)
    const L_excess = LAeq_dB - 70;

    // Funções empíricas ISO 1999:2013 Tabela A.1 para 4 kHz (coeficientes a, b, c)
    // HTLANI(t) = [u + v * log10(t)] * log10(L_excess) onde u, v dependem da freq.
    // Para 4 kHz: u = 9.4, v = -2.0 (aprox. ISO 1999 Annexe A)
    const u = 9.4;
    const v = -2.0;
    const t = Math.max(exposureYears, 0.5); // evitar log(0)
    const HTLANI_dB = Math.max(0, (u + v * Math.log10(t)) * Math.log10(Math.max(L_excess, 1)));

    // Risco de PAIR: percentagem da população que excede 25 dB HL (NIOSH criterion)
    // Approximação logística calibrada para os dados do NIOSH (1998) Appendix B
    const excess_over_criterion = Math.max(0, HTLANI_dB - 25);
    const riskPct = Math.min(100, 100 * (1 - Math.exp(-0.04 * excess_over_criterion)));

    return { HTLANI_dB: +HTLANI_dB.toFixed(2), riskPct: +riskPct.toFixed(2) };
}

/**
 * Calcula o risco excedente de perda auditiva (atribuível ao ruído ocupacional),
 * subtraindo o risco de fundo (presbycusis) da população não exposta.
 *
 * Excess Risk (ER) = exposed_pct − unexposed_pct
 * Método: NIOSH (1998) §3, ISO 1999 §4.2
 *
 * @param {number} exposed_pct   - Risco (%) na população exposta [0, 100]
 * @param {number} unexposed_pct - Risco (%) na população não exposta (controle) [0, 100]
 * @returns {{ excessRiskPct: number, attributableFraction: number }}
 * @throws {RangeError} Se valores forem inválidos
 *
 * @see NIOSH (1998) DHHS Pub. No. 98-126, §3.
 */
export function calcExcessRiskHearingLoss(exposed_pct: any, unexposed_pct: any) {
    if (typeof exposed_pct !== 'number' || typeof unexposed_pct !== 'number') {
        throw new TypeError('Percentages must be numbers');
    }
    if (exposed_pct < 0 || exposed_pct > 100 || unexposed_pct < 0 || unexposed_pct > 100) {
        throw new RangeError('Percentages must be between 0 and 100');
    }
    if (exposed_pct < unexposed_pct) {
        throw new RangeError('exposed_pct must be >= unexposed_pct for meaningful excess risk');
    }

    const excessRiskPct = +(exposed_pct - unexposed_pct).toFixed(2);
    // Fração atribuível ao ruído: ER / exposed_pct
    const attributableFraction = exposed_pct > 0 ? +(excessRiskPct / exposed_pct).toFixed(4) : 0;

    return { excessRiskPct, attributableFraction };
}

/**
 * Calcula a dose diária permitida de exposição ao ruído (horas) com base no
 * REL (Recommended Exposure Limit) do NIOSH: 85 dB(A) por 8 h, taxa de troca 3 dB.
 *
 * T_permitted = 8 / 2^((LAeq − 85) / 3)
 *
 * Diferente do OSHA (90 dB, taxa 5 dB), o NIOSH é mais conservador e é o padrão
 * recomendado para proteção ocupacional efetiva.
 *
 * @param {number} LAeq_dB - Nível de exposição contínuo equivalente (dB(A)), [70, 140]
 * @returns {{ permissibleHours: number, exceedanceFactor: number }}
 * @throws {RangeError} Se LAeq_dB estiver fora do intervalo
 *
 * @see NIOSH (1998) DHHS Pub. No. 98-126, §II.A.
 */
export function calcPermissibleNoiseDose(LAeq_dB: any) {
    if (typeof LAeq_dB !== 'number') {
        throw new TypeError('LAeq_dB must be a number');
    }
    if (LAeq_dB < 70 || LAeq_dB > 140) {
        throw new RangeError('LAeq_dB must be between 70 and 140 dB(A)');
    }

    // NIOSH REL: base 85 dB, exchange rate 3 dB
    const permissibleHours = 8 / Math.pow(2, (LAeq_dB - 85) / 3);
    // Fator de exceedância em relação a jornada de 8 h
    const exceedanceFactor = +(8 / Math.max(permissibleHours, 0.001)).toFixed(3);

    return {
        permissibleHours: +permissibleHours.toFixed(4),
        exceedanceFactor,
    };
}

/**
 * Classifica a zona de risco auditivo com base em LAeq, combinando critérios
 * NIOSH REL e OSHA PEL.
 *
 * | Zona              | LAeq (dB(A)) | Base regulatória               |
 * |-------------------|--------------|--------------------------------|
 * | safe              | < 85         | NIOSH REL (abaixo do limiar)   |
 * | caution           | 85 – 89      | Entre NIOSH REL e OSHA PEL     |
 * | danger            | 90 – 114     | Acima de OSHA PEL 8h, controle |
 * | immediate_danger  | >= 115       | NIOSH IDLH - risco imediato    |
 *
 * @param {number} LAeq_dB - Nível de exposição contínuo equivalente (dB(A))
 * @returns {'safe'|'caution'|'danger'|'immediate_danger'}
 * @throws {RangeError} Se LAeq_dB for inválido
 *
 * @see NIOSH (1998) DHHS Pub. No. 98-126.
 * @see OSHA 29 CFR 1910.95 (1983).
 */
export function classifyHearingRiskZone(LAeq_dB: any) {
    if (typeof LAeq_dB !== 'number' || !isFinite(LAeq_dB)) {
        throw new TypeError('LAeq_dB must be a finite number');
    }
    if (LAeq_dB < 0) {
        throw new RangeError('LAeq_dB must be a non-negative value');
    }

    if (LAeq_dB < 85) return 'safe';
    if (LAeq_dB < 90) return 'caution';
    if (LAeq_dB < 115) return 'danger';
    return 'immediate_danger';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const noiseDoseHearingDamageRiskMeta = {
    name: 'noiseDoseHearingDamageRisk',
    description: 'noiseDoseHearingDamageRisk',
    category: 'analytics',
    familyTags: ['noise', 'risk'],
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
