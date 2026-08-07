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
 * River Health Assessment - avaliação integrada da saúde de rios.
 *
 * Referências acadêmicas:
 * - Plafkin, J.L. et al. (1989). Rapid Bioassessment Protocols for Use in Streams
 *   and Rivers. EPA/440/4-89/001. USEPA, Washington DC.
 * - Barbour, M.T. et al. (1999). Rapid Bioassessment Protocols for Use in Streams
 *   and Wadeable Rivers. EPA/841/B-99/002. USEPA, Washington DC.
 * - Streeter, H.W. & Phelps, E.B. (1925). A study of the pollution and natural
 *   purification of the Ohio River. USPHS Bulletin 146.
 */

interface BioticIndexResult { BI: number }
interface HabitatQualityResult { HQS: number }
interface ChemicalOxygenSagResult { DO_critical_mg_L: number; distance_critical_m: number }
interface RiverHealthResult { health: 'poor' | 'fair' | 'good' | 'very_good' | 'excellent' }

/**
 * Calcula o Índice Biótico EPT (Ephemeroptera–Plecoptera–Trichoptera).
 * BI = (EPT_taxa/total_taxa × 0.5 + EPT_abundance/100 × 0.5) × 10
 * Valores próximos de 10 indicam alta qualidade biótica.
 *
 * @param {number} EPT_taxa_count     Número de táxons EPT encontrados (≥ 0, inteiro).
 * @param {number} total_taxa         Total de táxons na amostra (> 0).
 * @param {number} EPT_abundance_pct  Abundância relativa EPT (0–100 %).
 * @returns {{ BI: number }} Índice Biótico EPT (0–10).
 */
export function computeBioticIndex(EPT_taxa_count: number, total_taxa: number, EPT_abundance_pct: number): BioticIndexResult {
    if (typeof EPT_taxa_count !== 'number' || typeof total_taxa !== 'number' || typeof EPT_abundance_pct !== 'number') {
        throw new TypeError('Todos os parâmetros devem ser numéricos');
    }
    if (EPT_taxa_count < 0) throw new RangeError('EPT_taxa_count não pode ser negativo');
    if (total_taxa <= 0) throw new RangeError('total_taxa deve ser positivo');
    if (EPT_taxa_count > total_taxa) {
        throw new RangeError('EPT_taxa_count não pode exceder total_taxa');
    }
    if (EPT_abundance_pct < 0 || EPT_abundance_pct > 100) {
        throw new RangeError('EPT_abundance_pct deve estar entre 0 e 100');
    }
    const taxaRatio = EPT_taxa_count / total_taxa;
    const BI = (taxaRatio * 0.5 + (EPT_abundance_pct / 100) * 0.5) * 10;
    return { BI };
}

/**
 * Calcula o Habitat Quality Score (HQS) como média ponderada igualitária de 5 critérios.
 * Cada critério varia de 0 a 20; HQS máximo = 100.
 *
 * @param {number} channel_modification Score de modificação do canal (0–20).
 * @param {number} bank_stability       Estabilidade das margens (0–20).
 * @param {number} riparian_veg         Cobertura de vegetação ripária (0–20).
 * @param {number} substrate_quality    Qualidade do substrato (0–20).
 * @param {number} instream_cover       Cobertura intra-canal (0–20).
 * @returns {{ HQS: number }} Habitat Quality Score (0–100).
 */
export function computeHabitatQualityScore(
    channel_modification: number,
    bank_stability: number,
    riparian_veg: number,
    substrate_quality: number,
    instream_cover: number,
): HabitatQualityResult {
    const params = { channel_modification, bank_stability, riparian_veg, substrate_quality, instream_cover };
    for (const [name, val] of Object.entries(params)) {
        if (typeof val !== 'number') {
            throw new TypeError(`${name} deve ser numérico`);
        }
        if (val < 0 || val > 20) {
            throw new RangeError(`${name} deve estar entre 0 e 20`);
        }
    }
    const HQS = channel_modification + bank_stability + riparian_veg + substrate_quality + instream_cover;
    return { HQS };
}

/**
 * Calcula a curva de sag de OD de Streeter-Phelps (1925).
 * D(t) = (kd×L0/(kr-kd)) × (exp(-kd×t) - exp(-kr×t)) + D0×exp(-kr×t)
 * tc = ln(kr/kd × (1 - D0×(kr-kd)/(kd×L0))) / (kr - kd)
 * distância crítica = velocity × tc × 86400 (s/dia)
 *
 * @param {number} DO_upstream_mg_L OD a montante (mg/L, 0–14).
 * @param {number} BOD_mg_L         DBO5 do efluente (mg/L > 0).
 * @param {number} velocity_m_s     Velocidade do fluxo (m/s > 0).
 * @param {number} depth_m          Profundidade média (m > 0).
 * @param {number} reaeration_coef  Coeficiente de reaeração kr (1/dia > 0).
 * @returns {{ DO_critical_mg_L: number, distance_critical_m: number }}
 */
export function computeChemicalOxygenSag(DO_upstream_mg_L: number, BOD_mg_L: number, velocity_m_s: number, depth_m: number, reaeration_coef: number): ChemicalOxygenSagResult {
    if ([DO_upstream_mg_L, BOD_mg_L, velocity_m_s, depth_m, reaeration_coef].some((v) => typeof v !== 'number')) {
        throw new TypeError('Todos os parâmetros devem ser numéricos');
    }
    if (DO_upstream_mg_L < 0 || DO_upstream_mg_L > 14) {
        throw new RangeError('DO_upstream_mg_L deve estar entre 0 e 14 mg/L');
    }
    if (BOD_mg_L <= 0) throw new RangeError('BOD_mg_L deve ser positivo');
    if (velocity_m_s <= 0) throw new RangeError('velocity_m_s deve ser positivo');
    if (depth_m <= 0) throw new RangeError('depth_m deve ser positivo');
    if (reaeration_coef <= 0) throw new RangeError('reaeration_coef deve ser positivo');

    // Coeficiente de desoxigenação kd estimado por O'Connor-Dobbins: kd=3.93*U^0.5/H^1.5 → aqui fixo 0.3/d
    // Para fins gerais, kd = 0.3 /dia (valor típico de rios tropicais, calibrável externamente)
    const OD_saturacao = 9.0; // mg/L @ 20°C, nível do mar — simplificação
    const kd = 0.3; // taxa de desoxigenação (/dia)
    const kr = reaeration_coef;
    const L0 = BOD_mg_L;
    const D0 = OD_saturacao - DO_upstream_mg_L; // déficit inicial

    if (Math.abs(kr - kd) < 1e-9) {
        // Caso degenerado kr ≈ kd - usar aproximação linear
        const tc = (1 / kr) * (1 - D0 / (L0 + D0));
        const DO_critical = OD_saturacao - (D0 + kd * L0 * tc) * Math.exp(-kr * tc);
        return {
            DO_critical_mg_L: Math.max(0, DO_critical),
            distance_critical_m: velocity_m_s * tc * 86400,
        };
    }

    // Tempo até déficit crítico (dias)
    const inner = (kr / kd) * (1 - (D0 * (kr - kd)) / (kd * L0));
    const tc = inner > 0 ? Math.log(inner) / (kr - kd) : 0;

    // Déficit crítico DC e OD crítico
    const DC = ((kd * L0) / (kr - kd)) * (Math.exp(-kd * tc) - Math.exp(-kr * tc)) + D0 * Math.exp(-kr * tc);
    const DO_critical = OD_saturacao - DC;

    return {
        DO_critical_mg_L: Math.max(0, DO_critical),
        distance_critical_m: Math.max(0, velocity_m_s * Math.max(0, tc) * 86400),
    };
}

/**
 * Classifica a saúde do rio com base em BI, HQS e OD.
 * Score composto = (BI/10 × 0.4 + HQS/100 × 0.4 + DO_norm × 0.2)
 * DO normalizado: DO_norm = min(DO/8, 1) - 8 mg/L como referência de excelência.
 *
 * @param {number} BI      Índice Biótico EPT (0–10).
 * @param {number} HQS     Habitat Quality Score (0–100).
 * @param {number} DO_mg_L Oxigênio dissolvido (mg/L, 0–14).
 * @returns {{ health: 'poor'|'fair'|'good'|'very_good'|'excellent' }}
 */
export function classifyRiverHealth(BI: number, HQS: number, DO_mg_L: number): RiverHealthResult {
    if (typeof BI !== 'number' || typeof HQS !== 'number' || typeof DO_mg_L !== 'number') {
        throw new TypeError('BI, HQS e DO_mg_L devem ser numéricos');
    }
    if (BI < 0 || BI > 10) throw new RangeError('BI deve estar entre 0 e 10');
    if (HQS < 0 || HQS > 100) throw new RangeError('HQS deve estar entre 0 e 100');
    if (DO_mg_L < 0 || DO_mg_L > 14) throw new RangeError('DO_mg_L deve estar entre 0 e 14');

    const DO_norm = Math.min(DO_mg_L / 8, 1);
    const score = (BI / 10) * 0.4 + (HQS / 100) * 0.4 + DO_norm * 0.2;

    if (score >= 0.85) return { health: 'excellent' };
    if (score >= 0.7) return { health: 'very_good' };
    if (score >= 0.5) return { health: 'good' };
    if (score >= 0.3) return { health: 'fair' };
    return { health: 'poor' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverHealthAssessmentMeta = {
    name: 'riverHealthAssessment',
    description: 'riverHealthAssessment',
    category: 'analytics',
    familyTags: ['river'],
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
