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
// Application: EHS & Mining - Industrial Chemical Reactor Design
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Chemical Reactor Design - PFR & CSTR Conversion Analysis
 *
 * Modulo puro implementando calculos de projeto de reatores quimicos industriais
 * para reacoes de primeira ordem: conversao em PFR (Plug Flow Reactor) e CSTR
 * (Continuous Stirred-Tank Reactor), numero de Damkohler e classificacao de
 * desempenho. Zero dependencias de DOM, IDB, Three.js ou fetch.
 *
 * Referencias academicas:
 *   - Levenspiel, O. (1999). Chemical Reaction Engineering, 3rd ed.
 *     ISBN 978-0-471-25424-9. John Wiley & Sons. (PFR/CSTR design equations,
 *     Levenspiel plots, space time, Damkohler framework)
 *   - Fogler, H. S. (2020). Elements of Chemical Reaction Engineering, 6th ed.
 *     ISBN 978-0-13-548622-1. Pearson. (Mole balances, conversion-selectivity
 *     relationships, reactor sizing, interactive computer modules)
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
 * Validates that a value is a finite positive number.
 * Valida que o valor e um numero finito positivo.
 * @param value - Valor a validar
 * @param name  - Nome do parametro para mensagem de erro
 * @throws {TypeError}   Se nao for numero
 * @throws {RangeError}  Se nao for finito ou positivo
 */
function requirePositiveFinite(value: number, name: string): void {
    if (typeof value !== 'number') throw new TypeError(`${name} must be a number`);
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${value}`);
    }
}

// ---------------------------------------------------------------------------
// PFR - Plug Flow Reactor (Reator de Fluxo Pistonado)
// ---------------------------------------------------------------------------

/**
 * Calculates the fractional conversion in a Plug Flow Reactor (PFR)
 * for an irreversible first-order liquid-phase reaction (A → products).
 *
 * Calcula a conversao fracional em um PFR para reacao de primeira ordem
 * irreversivel em fase liquida (A → produtos).
 *
 * Modelo: X_PFR = 1 - exp(-Da)
 * onde Da = k * tau e o numero de Damkohler (Levenspiel 1999, eq. 5-14).
 *
 * @param k      - Constante de velocidade de reacao de 1a ordem (s⁻¹)
 * @param tau    - Tempo espacial = V/v0 (s); tempo de residencia medio
 * @returns      Conversao fracional X em [0, 1)
 *
 * @example
 * calcConversionPFR(0.1, 10) // => 0.6321...
 */
export function calcConversionPFR(k: number, tau: number): number {
    requirePositiveFinite(k, 'k');
    requirePositiveFinite(tau, 'tau');
    // Equacao de balanco de moles para PFR de primeira ordem (Fogler 2020, cap. 5)
    return 1 - Math.exp(-k * tau);
}

// ---------------------------------------------------------------------------
// CSTR - Continuous Stirred-Tank Reactor (Reator de Tanque Agitado Continuo)
// ---------------------------------------------------------------------------

/**
 * Calculates the fractional conversion in a CSTR for an irreversible
 * first-order liquid-phase reaction (A → products) at steady state.
 *
 * Calcula a conversao fracional em CSTR para reacao de primeira ordem
 * irreversivel em estado estacionario.
 *
 * Modelo: X_CSTR = Da / (1 + Da)
 * onde Da = k * tau (Levenspiel 1999, eq. 6-7).
 *
 * @param k      - Constante de velocidade de reacao de 1a ordem (s⁻¹)
 * @param tau    - Tempo espacial = V/v0 (s)
 * @returns      Conversao fracional X em (0, 1)
 *
 * @example
 * calcConversionCSTR(0.1, 10) // => 0.5
 */
export function calcConversionCSTR(k: number, tau: number): number {
    requirePositiveFinite(k, 'k');
    requirePositiveFinite(tau, 'tau');
    // Balanco de moles no estado estacionario para CSTR (Fogler 2020, cap. 2)
    const Da = k * tau;
    return Da / (1 + Da);
}

// ---------------------------------------------------------------------------
// Numero de Damkohler (Damkohler Number)
// ---------------------------------------------------------------------------

/**
 * Calculates the Damkohler number (Da) for a first-order reaction.
 * The Damkohler number is the ratio of the reaction rate to the
 * convective transport rate.
 *
 * Calcula o numero de Damkohler para reacao de primeira ordem.
 * Da < 0.1 → reacao controlada por transporte; Da > 10 → controlada por reacao.
 *
 * Da = k * tau  (Levenspiel 1999, cap. 5; Fogler 2020, cap. 5)
 *
 * @param k      - Constante de velocidade (s⁻¹)
 * @param tau    - Tempo espacial (s)
 * @returns      Numero de Damkohler adimensional (>0)
 *
 * @example
 * calcDamkohlerNumber(0.05, 20) // => 1.0
 */
export function calcDamkohlerNumber(k: number, tau: number): number {
    requirePositiveFinite(k, 'k');
    requirePositiveFinite(tau, 'tau');
    return k * tau;
}

// ---------------------------------------------------------------------------
// Classificacao de Desempenho do Reator
// ---------------------------------------------------------------------------

/**
 * Classifies reactor performance based on fractional conversion.
 * Provides design guidance for environmental engineering applications
 * (wastewater treatment, air stripping, soil remediation reactors).
 *
 * Classifica o desempenho do reator com base na conversao fracional.
 * Aplicavel a reatores de tratamento ambiental (aguas residuarias, air stripping,
 * reatores de remediacao de solo).
 *
 * Classificacao (Levenspiel 1999, Fogler 2020):
 *   - 'exceptional'  : X >= 0.99  (>99% remocao)
 *   - 'high'         : X >= 0.90  (90–99%)
 *   - 'moderate'     : X >= 0.70  (70–90%)
 *   - 'low'          : X >= 0.50  (50–70%)
 *   - 'poor'         : X <  0.50  (<50%)
 *
 * @param X - Conversao fracional [0, 1)
 * @returns
 *
 * @example
 * classifyReactorPerformance(0.95)
 * // => { grade: 'high', label: '90–99%', recommendation: 'Suitable for most environmental standards' }
 */
export function classifyReactorPerformance(X: number): { grade: string; label: string; recommendation: string } {
    if (typeof X !== 'number') throw new TypeError('X must be a number');
    if (!Number.isFinite(X) || X < 0 || X >= 1) {
        throw new RangeError(`Conversion X must be in [0, 1), got ${X}`);
    }

    // Limites baseados em padroes de tratamento ambiental (USEPA, CONAMA 430/2011)
    if (X >= 0.99) {
        return {
            grade: 'exceptional',
            label: '>= 99%',
            recommendation: 'Exceeds most regulatory discharge standards',
        };
    }
    if (X >= 0.9) {
        return {
            grade: 'high',
            label: '90-99%',
            recommendation: 'Suitable for most environmental standards',
        };
    }
    if (X >= 0.7) {
        return {
            grade: 'moderate',
            label: '70-90%',
            recommendation: 'May require polishing step or longer residence time',
        };
    }
    if (X >= 0.5) {
        return {
            grade: 'low',
            label: '50-70%',
            recommendation: 'Insufficient for most regulatory limits; redesign needed',
        };
    }
    return {
        grade: 'poor',
        label: '< 50%',
        recommendation: 'Major redesign required; consider series reactors or catalyst',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialChemicalReactorDesignMeta: AnalyticsModuleMeta = {
    name: 'industrialChemicalReactorDesign',
    description: 'Industrial Chemical Reactor Design',
    category: 'analytics',
    familyTags: ['industrial', 'chemical'],
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
