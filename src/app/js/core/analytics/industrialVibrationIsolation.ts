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
// Application: EHS & Mining - Industrial Vibration Isolation
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Vibration Isolation - Harris & Piersol / ISO 10816-1
 *
 * Módulo puro para análise de isolamento de vibrações industriais.
 * Calcula a transmissibilidade com amortecimento, frequência natural do
 * sistema isolador, amplitude de vibração em regime estacionário e eficiência
 * de isolamento conforme Harris & Piersol (2002) e ISO 10816-1:1995.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Harris, C. M. & Piersol, A. G. (Eds.) (2002).
 *     "Harris' Shock and Vibration Handbook." 5th ed.
 *     McGraw-Hill, New York. ISBN 978-0-07-137081-3.
 *     (Transmissibility eq. 3.34; natural frequency eq. 3.12)
 *   - ISO 10816-1:1995. "Mechanical vibration - Evaluation of machine vibration
 *     by measurements on non-rotating parts - Part 1: General guidelines."
 *     International Organization for Standardization, Geneva.
 *     (Vibration severity zones A/B/C/D, Table 1)
 *   - Rao, S. S. (2011). "Mechanical Vibrations." 5th ed.
 *     Pearson, Upper Saddle River. ISBN 978-0-13-212819-3.
 *     (Damped transmissibility derivation §3.6; steady-state amplitude §3.4)
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

// Aceleração gravitacional padrão (m/s²) - standard gravitational acceleration
const g = 9.80665;

/**
 * Calcula a transmissibilidade do sistema isolador de vibrações com amortecimento.
 * Calculates vibration isolator transmissibility with damping.
 *
 * T(r, ζ) = sqrt[(1 + (2ζr)²) / ((1 - r²)² + (2ζr)²)]
 * onde r = ω/ωₙ é a razão de frequências e ζ é o fator de amortecimento.
 * (Harris & Piersol 2002, eq. 3.34; Rao 2011, eq. 3.68)
 *
 * T < 1 indica isolamento efetivo (região r > √2).
 * T = 1 indica ausência de isolamento.
 * T > 1 indica amplificação (região de ressonância r ≈ 1).
 *
 * @param frequencyRatio - Razão de frequências r = ω/ωₙ (adimensional), r > 0
 * @param dampingRatio - Fator de amortecimento ζ (adimensional), 0 ≤ ζ ≤ 1
 * @throws {RangeError} se r ≤ 0 ou ζ fora de [0, 1]
 */
export function calcTransmissibilityRatio(
    frequencyRatio: number,
    dampingRatio: number,
): { transmissibility: number; frequencyRatio: number; dampingRatio: number; isIsolating: boolean } {
    if (!isFinite(frequencyRatio) || frequencyRatio <= 0) {
        throw new RangeError('Razão de frequências r deve ser positiva e finita.');
    }
    if (!isFinite(dampingRatio) || dampingRatio < 0 || dampingRatio > 1) {
        throw new RangeError('Fator de amortecimento ζ deve estar em [0, 1].');
    }

    const r = frequencyRatio;
    const zeta = dampingRatio;
    const r2 = r * r;
    const twoZetaR = 2 * zeta * r;

    // Transmissibilidade: numerador = 1 + (2ζr)², denominador = (1-r²)² + (2ζr)²
    const numerator = 1 + twoZetaR * twoZetaR;
    const denominator = (1 - r2) * (1 - r2) + twoZetaR * twoZetaR;
    const transmissibility = Math.sqrt(numerator / denominator);

    // Isolamento efetivo ocorre quando r > sqrt(2) e T < 1
    const isIsolating = transmissibility < 1.0;

    return { transmissibility, frequencyRatio: r, dampingRatio: zeta, isIsolating };
}

/**
 * Calcula a frequência natural do sistema isolador a partir da rigidez e massa suportada.
 * Calculates the natural frequency of the isolator system from stiffness and supported mass.
 *
 * ωₙ = sqrt(k / m)  [rad/s]
 * fₙ = ωₙ / (2π)   [Hz]
 *
 * Alternativamente, a partir da deflexão estática δ_st = mg/k:
 * fₙ = (1/2π) × sqrt(g / δ_st) - conveniente para sistemas mola-massa
 * (Harris & Piersol 2002, eq. 3.12; Rao 2011, eq. 2.17)
 *
 * @param stiffnessNm - Rigidez do isolador k (N/m), > 0
 * @param supportedMassKg - Massa suportada m (kg), > 0
 * @throws {RangeError} se stiffness ou mass não forem positivos e finitos
 */
export function calcNaturalFrequency(
    stiffnessNm: number,
    supportedMassKg: number,
): { naturalFreqHz: number; naturalFreqRad: number; staticDeflectionMm: number } {
    if (!isFinite(stiffnessNm) || stiffnessNm <= 0) {
        throw new RangeError('Rigidez do isolador k deve ser positiva e finita (N/m).');
    }
    if (!isFinite(supportedMassKg) || supportedMassKg <= 0) {
        throw new RangeError('Massa suportada m deve ser positiva e finita (kg).');
    }

    // Frequência angular natural: ωₙ = sqrt(k/m) [rad/s]
    const naturalFreqRad = Math.sqrt(stiffnessNm / supportedMassKg);
    // Frequência natural em Hz: fₙ = ωₙ / (2π)
    const naturalFreqHz = naturalFreqRad / (2 * Math.PI);
    // Deflexão estática: δ_st = mg/k [m] → convertida para mm
    const staticDeflectionMm = ((supportedMassKg * g) / stiffnessNm) * 1000;

    return { naturalFreqHz, naturalFreqRad, staticDeflectionMm };
}

/**
 * Calcula a amplitude de vibração em regime estacionário para excitação harmônica.
 * Calculates steady-state vibration amplitude for harmonic base excitation.
 *
 * Para excitação de base x_base(t) = X₀ sin(ωt), a amplitude da resposta da
 * massa em regime estacionário é:
 *   X = X₀ × T(r, ζ)
 * onde T é a transmissibilidade calculada por calcTransmissibilityRatio.
 *
 * Para excitação de força F₀ sin(ωt), a amplitude é:
 *   X = (F₀ / k) × DMF(r, ζ)
 * DMF = 1 / sqrt((1 - r²)² + (2ζr)²)  [fator de magnificação dinâmica]
 * (Rao 2011, §3.4, eq. 3.30; Harris & Piersol 2002, eq. 3.28)
 *
 * @param excitationAmplitudeMm - Amplitude de excitação X₀ ou F₀/k (mm)
 * @param frequencyRatio - Razão de frequências r = ω/ωₙ, r > 0
 * @param dampingRatio - Fator de amortecimento ζ, 0 ≤ ζ ≤ 1
 * @param excitationType - Tipo de excitação: 'base' ou 'force'
 * @throws {TypeError} se excitationType for inválido
 * @throws {RangeError} se amplitudeBase ≤ 0 ou parâmetros fora de faixa
 */
export function calcVibrationAmplitude(
    excitationAmplitudeMm: number,
    frequencyRatio: number,
    dampingRatio: number,
    excitationType: 'base' | 'force' = 'base',
): { responseAmplitudeMm: number; dmf: number; transmissibility: number } {
    if (!isFinite(excitationAmplitudeMm) || excitationAmplitudeMm <= 0) {
        throw new RangeError('Amplitude de excitação deve ser positiva e finita (mm).');
    }
    if (!['base', 'force'].includes(excitationType)) {
        throw new TypeError("Tipo de excitação deve ser 'base' ou 'force'.");
    }

    const r = frequencyRatio;
    const zeta = dampingRatio;

    // Valida r e ζ internamente via calcTransmissibilityRatio
    const { transmissibility } = calcTransmissibilityRatio(r, zeta);

    const r2 = r * r;
    const twoZetaR = 2 * zeta * r;
    // Fator de magnificação dinâmica DMF = 1 / sqrt((1-r²)² + (2ζr)²)
    const dmf = 1 / Math.sqrt((1 - r2) * (1 - r2) + twoZetaR * twoZetaR);

    let responseAmplitudeMm;
    if (excitationType === 'base') {
        // Excitação de base: X = X₀ × T
        responseAmplitudeMm = excitationAmplitudeMm * transmissibility;
    } else {
        // Excitação de força (F₀/k em mm): X = (F₀/k) × DMF
        responseAmplitudeMm = excitationAmplitudeMm * dmf;
    }

    return { responseAmplitudeMm, dmf, transmissibility };
}

/**
 * Classifica a eficiência de isolamento de vibrações e o nível de severidade ISO 10816-1.
 * Classifies vibration isolation efficiency and ISO 10816-1 severity level.
 *
 * Eficiência de isolamento (%) = (1 - T) × 100, válida apenas quando T < 1.
 * Severidade ISO 10816-1 baseada em velocidade RMS de vibração (mm/s):
 *   Zona A: v ≤ 2.3 mm/s  - nova máquina, aceitável para operação
 *   Zona B: 2.3 < v ≤ 4.5 - aceitável para operação contínua
 *   Zona C: 4.5 < v ≤ 11.2 - alerta; operar por prazo limitado
 *   Zona D: v > 11.2        - perigoso; risco de dano
 * (ISO 10816-1:1995, Tabela 1 - Grupo 2: máquinas de médio porte)
 *
 * @param transmissibility - Transmissibilidade T (adimensional), > 0
 * @param vibrationVelocityRms - Velocidade RMS de vibração medida (mm/s), ≥ 0
 * @throws {RangeError} se transmissibility ≤ 0 ou vibrationVelocityRms < 0
 */
export function classifyIsolationEfficiency(
    transmissibility: number,
    vibrationVelocityRms: number,
): { isolationEfficiencyPct: number; isoZone: string; isoDescription: string; overallRating: string } {
    if (!isFinite(transmissibility) || transmissibility <= 0) {
        throw new RangeError('Transmissibilidade deve ser positiva e finita.');
    }
    if (!isFinite(vibrationVelocityRms) || vibrationVelocityRms < 0) {
        throw new RangeError('Velocidade RMS de vibração deve ser ≥ 0 mm/s.');
    }

    // Eficiência de isolamento - positiva apenas quando T < 1
    const isolationEfficiencyPct = (1 - transmissibility) * 100;

    // Classificação de severidade ISO 10816-1:1995, Tabela 1 (Grupo 2, 15–75 kW)
    let isoZone, isoDescription;
    const v = vibrationVelocityRms;
    if (v <= 2.3) {
        isoZone = 'A';
        isoDescription = 'Zona A — Novo; velocidade ≤ 2.3 mm/s. Operação normal irrestrita.';
    } else if (v <= 4.5) {
        isoZone = 'B';
        isoDescription = 'Zona B — Aceitável; 2.3 < v ≤ 4.5 mm/s. Operação contínua permitida.';
    } else if (v <= 11.2) {
        isoZone = 'C';
        isoDescription = 'Zona C — Alerta; 4.5 < v ≤ 11.2 mm/s. Operar por prazo limitado.';
    } else {
        isoZone = 'D';
        isoDescription = 'Zona D — Perigoso; v > 11.2 mm/s. Risco de dano; parada imediata.';
    }

    // Avaliação geral combinando eficiência de isolamento e zona ISO
    let overallRating;
    if (isolationEfficiencyPct >= 90 && isoZone <= 'B') {
        overallRating = 'EXCELENTE';
    } else if (isolationEfficiencyPct >= 70 && isoZone <= 'C') {
        overallRating = 'BOM';
    } else if (isolationEfficiencyPct >= 50 || isoZone === 'C') {
        overallRating = 'MARGINAL';
    } else {
        overallRating = 'INSUFICIENTE';
    }

    return { isolationEfficiencyPct, isoZone, isoDescription, overallRating };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialVibrationIsolationMeta: AnalyticsModuleMeta = {
    name: 'industrialVibrationIsolation',
    description: 'Industrial Vibration Isolation',
    category: 'analytics',
    familyTags: ['industrial'],
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
