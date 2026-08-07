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
 * Industrial Safety Risk Matrix (5×5)
 *
 * References:
 *   IEC 61511-1 (2016). Functional Safety - Safety Instrumented Systems for
 *     the Process Industry Sector. IEC, Geneva.
 *     doi:10.3403/30279028
 *   API RP 14C (2017). Analysis, Design, Installation, and Testing of Safety
 *     Systems for Offshore Production Facilities. API, Washington DC.
 *   MIL-STD-882E (2012). Standard Practice for System Safety.
 *     US Department of Defense, Washington DC.
 *   ABNT NBR 14280 (2001). Cadastro de Acidente do Trabalho.
 *
 * Zero DOM/IDB/fetch/Three.js dependencies - pure math module.
 * Módulo de matriz de risco de segurança industrial 5×5 - sem dependências de browser.
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

// ─── Risk Matrix 5×5 ────────────────────────────────────────────────────────
// Probability × Severity → Risk Level (I=Intolerable, II=High, III=Moderate, IV=Low)
// Probabilidade × Severidade → Nível de Risco (I=Intolerável, II=Alto, III=Moderado, IV=Baixo)

/**
 * 5×5 risk matrix lookup table (rows = probability 1–5, cols = severity 1–5).
 * Tabela de consulta da matriz de risco 5×5 (linhas = probabilidade, colunas = severidade).
 *
 * Probability scale / Escala de probabilidade:
 *   1 = Improbable (<1e-6/yr) / Improvável
 *   2 = Remote (1e-6 to 1e-5/yr) / Remoto
 *   3 = Occasional (1e-5 to 1e-4/yr) / Ocasional
 *   4 = Probable (1e-4 to 1e-3/yr) / Provável
 *   5 = Frequent (>1e-3/yr) / Frequente
 *
 * Severity scale / Escala de severidade:
 *   1 = Negligible (no injury, minor property damage) / Negligível
 *   2 = Marginal (minor injury, minor property) / Marginal
 *   3 = Critical (serious injury, major property) / Crítico
 *   4 = Catastrophic (fatality or permanent disability) / Catastrófico
 *   5 = Catastrophic+ (multiple fatalities) / Catastrófico+
 */
const RISK_MATRIX: Array<Array<'I' | 'II' | 'III' | 'IV'>> = [
    //  S=1   S=2   S=3   S=4   S=5
    ['IV', 'IV', 'III', 'III', 'II'], // P=1
    ['IV', 'III', 'III', 'II', 'I'], // P=2
    ['III', 'III', 'II', 'II', 'I'], // P=3
    ['III', 'II', 'II', 'I', 'I'], // P=4
    ['II', 'II', 'I', 'I', 'I'], // P=5
];

// ─── SIL requirements per risk level ────────────────────────────────────────
// Requisitos de SIL por nível de risco conforme IEC 61511

const SIL_REQUIREMENTS = {
    I: { sil: 3, description: 'SIL 3 — Risk Reduction Factor 1000–10000', inspectionFrequencyMonths: 3 },
    II: { sil: 2, description: 'SIL 2 — Risk Reduction Factor 100–1000', inspectionFrequencyMonths: 6 },
    III: { sil: 1, description: 'SIL 1 — Risk Reduction Factor 10–100', inspectionFrequencyMonths: 12 },
    IV: { sil: 0, description: 'No SIL required — standard good practice', inspectionFrequencyMonths: 24 },
};

// ─── Risk level lookup ───────────────────────────────────────────────────────

/**
 * Get risk level from probability and severity scores using the 5×5 risk matrix.
 * Obtém o nível de risco a partir dos scores de probabilidade e severidade.
 *
 * @param probability - Integer 1–5 (1=Improbable, 5=Frequent)
 * @param severity - Integer 1–5 (1=Negligible, 5=Catastrophic+)
 * @returns Risk level
 */
export function getRiskLevel(probability: number, severity: number): 'I' | 'II' | 'III' | 'IV' {
    if (!Number.isInteger(probability) || probability < 1 || probability > 5) {
        throw new RangeError('probability must be an integer between 1 and 5');
    }
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
        throw new RangeError('severity must be an integer between 1 and 5');
    }
    return RISK_MATRIX[probability - 1]![severity - 1]!;
}

// ─── Full risk assessment for a single hazard scenario ──────────────────────

/**
 * Full risk assessment for a single industrial hazard scenario.
 * Avaliação completa de risco para um cenário de perigo industrial.
 *
 * Returns risk level, SIL target, inspection frequency, and risk index.
 * Retorna o nível de risco, SIL alvo, frequência de inspeção e índice de risco.
 *
 * @param p
 */
export function assessHazardScenario({
    scenarioId,
    probability,
    severity,
    exposureHours = 2000,
}: {
    scenarioId: string;
    probability: number;
    severity: number;
    exposureHours?: number;
}): {
    scenarioId: string;
    riskLevel: string;
    sil: number;
    silDescription: string;
    inspectionFrequencyMonths: number;
    riskIndex: number;
} {
    if (typeof scenarioId !== 'string' || !scenarioId.trim()) {
        throw new TypeError('scenarioId must be a non-empty string');
    }
    if (typeof exposureHours !== 'number' || exposureHours < 0) {
        throw new RangeError('exposureHours must be >= 0');
    }

    const riskLevel = getRiskLevel(probability, severity);
    const { sil, description: silDescription, inspectionFrequencyMonths } = SIL_REQUIREMENTS[riskLevel];

    // Risk index: composite numeric score for ranking (0–100 scale)
    // Índice de risco: score numérico composto para ordenação (escala 0–100)
    const riskIndex = Math.round(((probability * severity) / 25) * (1 + exposureHours / 8760) * 50);

    return {
        scenarioId: scenarioId.trim(),
        riskLevel,
        sil,
        silDescription,
        inspectionFrequencyMonths,
        riskIndex: Math.min(100, riskIndex),
    };
}

// ─── Batch assessment and ranking ───────────────────────────────────────────

/**
 * Assess multiple hazard scenarios and return ranked by risk index (descending).
 * Avalia múltiplos cenários de perigo e retorna ordenados por índice de risco (decrescente).
 *
 * @param scenarios
 * @returns Sorted assessment results
 */
export function assessProcessRisk(
    scenarios: Array<{ scenarioId: string; probability: number; severity: number; exposureHours?: number }>,
): Array<ReturnType<typeof assessHazardScenario>> {
    if (!Array.isArray(scenarios) || scenarios.length === 0) {
        throw new TypeError('scenarios must be a non-empty array');
    }

    const results = scenarios.map((s) => assessHazardScenario(s));

    // Ordena por risco: nível I > II > III > IV, depois por riskIndex descendente
    // Sort by risk level: I > II > III > IV, then by riskIndex descending
    const levelOrder: Record<string, number> = { I: 4, II: 3, III: 2, IV: 1 };
    results.sort((a, b) => {
        const lvDiff = (levelOrder[b.riskLevel] || 0) - (levelOrder[a.riskLevel] || 0);
        return lvDiff !== 0 ? lvDiff : b.riskIndex - a.riskIndex;
    });

    return results;
}

// ─── Composite process risk index ───────────────────────────────────────────

/**
 * Calculate a single composite risk index for a whole process unit.
 * Calcula um único índice de risco composto para uma unidade de processo.
 *
 * Composite = weighted RMS of individual risk indices.
 * Composto = RMS ponderado dos índices de risco individuais.
 *
 * @param riskIndices - Array of individual risk indices (0–100)
 */
export function calcCompositeProcessRisk(
    riskIndices: number[],
): { compositeRiskIndex: number; processRiskClass: string } {
    if (!Array.isArray(riskIndices) || riskIndices.length === 0) {
        throw new TypeError('riskIndices must be a non-empty array');
    }
    for (const r of riskIndices) {
        if (typeof r !== 'number' || r < 0 || r > 100) {
            throw new RangeError('Each riskIndex must be between 0 and 100');
        }
    }

    const rms = Math.sqrt(riskIndices.reduce((s, r) => s + r * r, 0) / riskIndices.length);
    const compositeRiskIndex = Math.round(Math.min(100, rms));

    return { compositeRiskIndex, processRiskClass: classifyProcessRisk(compositeRiskIndex) };
}

/**
 * Classify process risk composite index.
 * Classifica o índice de risco composto do processo.
 * @param index 0–100
 */
export function classifyProcessRisk(index: number): string {
    if (typeof index !== 'number' || index < 0 || index > 100) {
        throw new RangeError('index must be between 0 and 100');
    }
    if (index >= 75) return 'intolerable';
    if (index >= 50) return 'high';
    if (index >= 25) return 'moderate';
    return 'low';
}

export { RISK_MATRIX, SIL_REQUIREMENTS };

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialSafetyRiskMatrixMeta: AnalyticsModuleMeta = {
    name: 'industrialSafetyRiskMatrix',
    description: 'industrialSafetyRiskMatrix',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
