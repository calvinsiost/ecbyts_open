// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Mine Haul Road Design
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mine Haul Road Design - Performance & Capacity Engineering
 *
 * Módulo puro implementando os cálculos de engenharia de estradas de mineração
 * para dimensionamento de frotas e capacidade de transporte. Inclui grade
 * efetivo (grade + resistência ao rolamento), fator de capacidade de carga,
 * resistência ao rolamento e classificação de condição da estrada.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Kaufman, W. W. & Ault, J. C. (1977). "Design of Surface Mine Haulage
 *     Roads - A Manual." Information Circular 8758. US Bureau of Mines.
 *     Washington, DC: USBM. (IC 8758 - metodologia grade + rolling resistance)
 *   - Caterpillar Inc. (2022). Caterpillar Performance Handbook, Edition 52.
 *     Peoria, IL: Caterpillar Inc. (rimpull, grade resistance factors, payload)
 *   - Thompson, R. J. & Visser, A. T. (2003). "Mine haul road maintenance
 *     management systems." Journal of the South African Institute of Mining
 *     and Metallurgy, 103(5), 303–312. ISSN: 2225-6253.
 *     (condição de estrada e classificação funcional)
 *   - Monenco Consultants Ltd. (1990). Open Pit Mine Planning and Design.
 *     ISBN: 978-0-87335-108-0 (grade de projeto e cálculos de rimpull)
 *
 * @module mineHaulRoadDesign
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
 * Resistência ao rolamento típica por tipo de superfície de estrada.
 * Expressa em kg/t (kgf por tonelada de GVW).
 * Fonte: Caterpillar Performance Handbook Ed. 52, Table 1-1.
 * 1 kg/t de rolling resistance ≈ 0.098 kPa ≈ 1% de grade equivalente.
 */
const SURFACE_ROLLING_RESISTANCE: Record<string, number> = {
    concrete: 20, // pavimento rígido excelente
    asphalt_good: 25, // asfalto em bom estado
    asphalt_fair: 35, // asfalto desgastado
    gravel_compacted: 40, // cascalho compactado e mantido
    gravel_loose: 60, // cascalho solto / mal mantido
    dirt_hard: 50, // terra dura
    dirt_soft: 80, // terra mole ou úmida
    ripped_rock: 100, // rocha fragmentada solta
    mud: 150, // lama — condição crítica
};

/**
 * Classificação de condição funcional de estrada (MHMS - Thompson & Visser 2003).
 * Score 0–100; quanto menor, pior.
 */
const ROAD_CONDITION_THRESHOLDS = [
    { min: 85, label: 'excellent', description: 'Nova ou recém-mantida, sem defeitos' },
    { min: 70, label: 'good', description: 'Pequenas irregularidades, alta produtividade' },
    { min: 50, label: 'fair', description: 'Defeitos moderados, redução de velocidade' },
    { min: 30, label: 'poor', description: 'Defeitos severos, manutenção urgente' },
    { min: 0, label: 'critical', description: 'Condição inaceitável, risco operacional e de segurança' },
];

/**
 * Calcula o Grade Efetivo (GE) de um segmento de estrada de mineração.
 *
 * O Grade Efetivo combina a declividade geométrica com a resistência ao
 * rolamento para expressar a resistência total ao movimento em percentagem
 * de grade equivalente:
 *   GE (%) = Grade (%) + Rolling Resistance Factor (%)
 *
 * onde RRF (%) = rolling_resistance_kg_t / 10
 * (cada 10 kg/t equivale a 1% de grade - Caterpillar PHB Ed. 52).
 *
 * Em descida, Grade é negativo; a potência máxima é limitada pelo GE total.
 *
 * @param grade_pct            - Declividade geométrica (%), positiva em subida
 * @param rolling_resistance_kg_t - Resistência ao rolamento (kg/t de GVW)
 * @param direction - 'uphill' (subida) ou 'downhill' (descida)
 * @returns Grade efetivo (%), componente geométrica e componente de rolamento (%)
 */
export function calcRoadGrade(
    grade_pct: number,
    rolling_resistance_kg_t: number,
    direction = 'uphill',
): { effective_grade_pct: number; grade_pct: number; rr_pct: number } {
    if (typeof grade_pct !== 'number') throw new TypeError('grade_pct must be a number (%)');
    if (Math.abs(grade_pct) > 30) throw new RangeError('grade_pct magnitude must be <= 30% for mining roads');
    if (typeof rolling_resistance_kg_t !== 'number' || rolling_resistance_kg_t < 0)
        throw new RangeError('rolling_resistance_kg_t must be >= 0');
    if (direction !== 'uphill' && direction !== 'downhill')
        throw new TypeError("direction must be 'uphill' or 'downhill'");

    const rr_pct = rolling_resistance_kg_t / 10; // conversão kg/t → %
    const geom = direction === 'downhill' ? -Math.abs(grade_pct) : Math.abs(grade_pct);
    const effective_grade_pct = geom + rr_pct;

    return { effective_grade_pct, grade_pct: geom, rr_pct };
}

/**
 * Calcula o Fator de Capacidade de Carga (PCF) com base no grade efetivo.
 *
 * O PCF representa a fração da capacidade nominal de carga que um caminhão
 * pode transportar em função do grade efetivo, conforme curvas de rimpull do
 * Caterpillar Performance Handbook. Modelo simplificado:
 *
 *   GE <= 0%   : PCF = 1.0 (capacidade total, em nível ou descida)
 *   0 < GE <= 8%: PCF = 1.0 - 0.04 * GE  (redução linear de 4%/% de grade)
 *   8 < GE <= 15%: PCF = 0.68 - 0.025 * (GE - 8) (queda mais acentuada)
 *   GE > 15%   : PCF = max(0.18, 0.505 - 0.021 * GE) (faixa crítica)
 *
 * @param effective_grade_pct - Grade efetivo (%), pode ser negativo
 * @param gvw_tonnes    - Peso bruto do veículo carregado (t)
 * @param tare_tonnes   - Tara do veículo vazio (t)
 * @returns Fator de capacidade (0–1), carga útil real (t) e grade efetivo de entrada
 */
export function calcPayloadCapacityFactor(
    effective_grade_pct: number,
    gvw_tonnes = 200,
    tare_tonnes = 100,
): { pcf: number; payload_tonnes: number; effective_grade_pct: number } {
    if (typeof effective_grade_pct !== 'number') throw new TypeError('effective_grade_pct must be a number (%)');
    if (typeof gvw_tonnes !== 'number' || gvw_tonnes <= 0) throw new RangeError('gvw_tonnes must be > 0');
    if (typeof tare_tonnes !== 'number' || tare_tonnes <= 0) throw new RangeError('tare_tonnes must be > 0');
    if (tare_tonnes >= gvw_tonnes) throw new RangeError('tare_tonnes must be < gvw_tonnes');

    const ge = effective_grade_pct;
    let pcf;

    if (ge <= 0) {
        pcf = 1.0;
    } else if (ge <= 8) {
        pcf = 1.0 - 0.04 * ge;
    } else if (ge <= 15) {
        pcf = 0.68 - 0.025 * (ge - 8);
    } else {
        pcf = Math.max(0.18, 0.505 - 0.021 * ge);
    }

    const nominal_payload = gvw_tonnes - tare_tonnes;
    const payload_tonnes = pcf * nominal_payload;

    return { pcf, payload_tonnes, effective_grade_pct: ge };
}

/**
 * Calcula a resistência ao rolamento de uma estrada de mineração.
 *
 * A resistência ao rolamento pode ser estimada por tipo de superfície (tabela
 * Caterpillar) ou por penetração do pneu (medida de campo):
 *   RR = 0.6 * penetration_cm * 10  [kg/t]  (Kaufman & Ault 1977, IC 8758)
 *
 * Se penetration_cm for fornecido, prevalece sobre surface_type.
 *
 * @param surface_type - Tipo de superfície (ver tabela)
 * @param penetration_cm - Penetração do pneu medida em campo (cm)
 * @returns Resistência ao rolamento (kg/t e % de grade), fonte do dado
 */
export function calcRollingResistance(
    surface_type = 'gravel_compacted',
    penetration_cm: number | null = null,
): { rr_kg_t: number; rr_pct: number; source: string } {
    if (penetration_cm !== null) {
        if (typeof penetration_cm !== 'number' || penetration_cm < 0)
            throw new RangeError('penetration_cm must be >= 0 if provided');
        // Kaufman & Ault (1977) IC 8758: RR(kg/t) = 6 × penetração(cm)
        const rr_kg_t = 6 * penetration_cm;
        return { rr_kg_t, rr_pct: rr_kg_t / 10, source: 'kaufman_ault_ic8758_field' };
    }

    if (!(surface_type in SURFACE_ROLLING_RESISTANCE))
        throw new TypeError(`surface_type must be one of: ${Object.keys(SURFACE_ROLLING_RESISTANCE).join(', ')}`);

    const rr_kg_t = SURFACE_ROLLING_RESISTANCE[surface_type]!;
    return { rr_kg_t, rr_pct: rr_kg_t / 10, source: 'caterpillar_phb_ed52_table' };
}

function validateConditionInputs(
    condition_score: number,
    iri_m_km: number | null,
    rut_depth_mm: number | null,
): void {
    if (typeof condition_score !== 'number' || condition_score < 0 || condition_score > 100)
        throw new RangeError('condition_score must be in [0, 100]');
    if (iri_m_km !== null && (typeof iri_m_km !== 'number' || iri_m_km < 0))
        throw new RangeError('iri_m_km must be >= 0 if provided');
    if (rut_depth_mm !== null && (typeof rut_depth_mm !== 'number' || rut_depth_mm < 0))
        throw new RangeError('rut_depth_mm must be >= 0 if provided');
}

function adjustConditionScore(condition_score: number, iri_m_km: number | null, rut_depth_mm: number | null): number {
    let adjusted_score = condition_score;
    if (iri_m_km !== null && iri_m_km > 12) {
        // IRI > 12 m/km penaliza 10 pontos (pista muito rugosa - Thompson & Visser 2003)
        adjusted_score = Math.max(0, adjusted_score - 10);
    }
    if (rut_depth_mm !== null && rut_depth_mm > 100) {
        // Afundamento > 100 mm penaliza 15 pontos (risco de capotamento)
        adjusted_score = Math.max(0, adjusted_score - 15);
    }
    return adjusted_score;
}

function resolveUrgency(label: string): string {
    const urgency_map: Record<string, string> = {
        excellent: 'scheduled', // manutenção preventiva programada
        good: 'monitor', // monitorar e corrigir pequenos defeitos
        fair: 'within_30d', // intervenção em até 30 dias
        poor: 'immediate', // intervenção imediata
        critical: 'stop_traffic', // interdição para reparo de emergência
    };
    return urgency_map[label] || 'immediate';
}

/**
 * Classifica a condição funcional de uma estrada de mineração.
 *
 * Utiliza o sistema de pontuação MHMS (Mine Haul Road Maintenance Management
 * System) proposto por Thompson & Visser (2003), com score de 0 a 100 baseado
 * em parâmetros mensuráveis de campo: IRI, afundamento de trilha, poeira,
 * drenagem e largura de via. Esta função recebe o score composto já calculado.
 *
 * @param condition_score      - Score de condição (0–100)
 * @param iri_m_km      - International Roughness Index (m/km), opcional
 * @param rut_depth_mm  - Profundidade de afundamento (mm), opcional
 * @returns Rótulo de condição, descrição, score e urgência de manutenção
 */
export function classifyHaulRoadCondition(
    condition_score: number,
    iri_m_km: number | null = null,
    rut_depth_mm: number | null = null,
): { label: string; description: string; score: number; maintenance_urgency: string } {
    validateConditionInputs(condition_score, iri_m_km, rut_depth_mm);

    const adjusted_score = adjustConditionScore(condition_score, iri_m_km, rut_depth_mm);

    const tier: { label: string; description: string } =
        ROAD_CONDITION_THRESHOLDS.find((t) => adjusted_score >= t.min) ||
        ROAD_CONDITION_THRESHOLDS[ROAD_CONDITION_THRESHOLDS.length - 1]!;

    return {
        label: tier.label,
        description: tier.description,
        score: adjusted_score,
        maintenance_urgency: resolveUrgency(tier.label),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineHaulRoadDesignMeta: AnalyticsModuleMeta = {
    name: 'mineHaulRoadDesign',
    description: 'Mine Haul Road Design',
    category: 'analytics',
    familyTags: ['mining'],
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
