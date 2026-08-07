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
// Application: EHS & Mining - Environmental Justice & Equity Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Environmental Justice & Equity Assessment
 *
 * Módulo puro implementando métricas de justiça ambiental: índice de carga
 * ambiental (EBI) por média geométrica, impacto desproporcional, índice de
 * acesso a serviços e classificação de comunidades EJ por critérios EPA
 * EJScreen v2.2 (2023).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   EPA (2023) EJScreen: Environmental Justice Screening and Mapping Tool, Version 2.2.
 *     U.S. Environmental Protection Agency, Washington, DC.
 *   Bullard, R.D. (1994) Dumping in Dixie: Race, Class, and Environmental Quality.
 *     Westview Press, Boulder, CO.
 *   WHO (2010) A Conceptual Framework for Action on the Social Determinants of Health.
 *     World Health Organization, Geneva.
 *
 * @module environmentalJustice
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
 * Compute Environmental Burden Index (EBI) using the geometric mean of
 * three normalized components (pollution, vulnerability, demographic).
 * EBI = (P × V × D)^(1/3)
 *
 * @param {number} pollution_index - normalized pollution exposure (0–1)
 * @param {number} populationVulnerability - normalized vulnerability score (0–1)
 * @param {number} demographicScore - normalized demographic factor (0–1)
 * @returns {{ ebi: number, classification: 'low'|'moderate'|'high'|'critical' }}
 *
 * @throws {RangeError} if any component is outside [0, 1]
 */
export function computeEnvironmentalBurdenIndex(
    pollution_index: number,
    populationVulnerability: number,
    demographicScore: number,
): { ebi: number; classification: 'low' | 'moderate' | 'high' | 'critical' } {
    for (const [name, val] of [
        ['pollution_index', pollution_index],
        ['populationVulnerability', populationVulnerability],
        ['demographicScore', demographicScore],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || val < 0 || val > 1) {
            throw new RangeError(`${name} must be a number between 0 and 1`);
        }
    }

    // Média geométrica dos 3 componentes normalizados
    const ebi = Math.pow(pollution_index * populationVulnerability * demographicScore, 1 / 3);

    // Classificação EBI: low < 0.25 ≤ moderate < 0.5 ≤ high < 0.75 ≤ critical
    /** @type {'low'|'moderate'|'high'|'critical'} */
    let classification: 'low' | 'moderate' | 'high' | 'critical';
    if (ebi < 0.25) classification = 'low';
    else if (ebi < 0.5) classification = 'moderate';
    else if (ebi < 0.75) classification = 'high';
    else classification = 'critical';

    return { ebi, classification };
}

/**
 * Compute Disproportionate Impact ratio between a target group and the baseline.
 * DI = targetGroupExposure / baselineExposure
 * DI > 1.5 → impacto desproporcional; DI > 2.5 → severo
 *
 * @param {number} targetGroupExposure - exposure metric for the target group
 * @param {number} baselineExposure - exposure metric for the general population baseline
 * @returns {{ ratio: number, disproportionate: boolean, severity: 'none'|'moderate'|'severe' }}
 *
 * @throws {RangeError} if baselineExposure is non-positive or inputs are not numbers
 */
export function computeDisproportionateImpact(
    targetGroupExposure: number,
    baselineExposure: number,
): { ratio: number; disproportionate: boolean; severity: 'none' | 'moderate' | 'severe' } {
    if (typeof targetGroupExposure !== 'number' || targetGroupExposure < 0) {
        throw new RangeError('targetGroupExposure must be a non-negative number');
    }
    if (typeof baselineExposure !== 'number' || baselineExposure <= 0) {
        throw new RangeError('baselineExposure must be a positive number');
    }

    const ratio = targetGroupExposure / baselineExposure;
    const disproportionate = ratio > 1.5;

    /** @type {'none'|'moderate'|'severe'} */
    let severity: 'none' | 'moderate' | 'severe';
    if (ratio > 2.5) severity = 'severe';
    else if (ratio > 1.5) severity = 'moderate';
    else severity = 'none';

    return { ratio, disproportionate, severity };
}

/**
 * Compute Access Index to environmental services.
 * AI = (1/distance × transportScore × income_ratio)^(1/3); clamped to [0, 1]
 * income_ratio = incomeLevel_pct_median / 100
 *
 * @param {number} facilityDistance_km - distance to nearest environmental service facility (km)
 * @param {number} transportScore - normalized transport accessibility score (0–1)
 * @param {number} incomeLevel_pct_median - household income as % of area median (e.g. 80 = 80%)
 * @returns {{ accessIndex: number }}
 *
 * @throws {RangeError} if facilityDistance_km ≤ 0 or transportScore or incomeLevel out of range
 */
export function computeAccessIndex(
    facilityDistance_km: number,
    transportScore: number,
    incomeLevel_pct_median: number,
): { accessIndex: number } {
    if (typeof facilityDistance_km !== 'number' || facilityDistance_km <= 0) {
        throw new RangeError('facilityDistance_km must be a positive number');
    }
    if (typeof transportScore !== 'number' || transportScore < 0 || transportScore > 1) {
        throw new RangeError('transportScore must be between 0 and 1');
    }
    if (typeof incomeLevel_pct_median !== 'number' || incomeLevel_pct_median < 0) {
        throw new RangeError('incomeLevel_pct_median must be a non-negative number');
    }

    const incomeRatio = incomeLevel_pct_median / 100;
    // Índice de acesso: média geométrica de (1/distância × acesso transporte × razão de renda)
    const raw = Math.pow((1 / facilityDistance_km) * transportScore * incomeRatio, 1 / 3);
    // Clamp em [0, 1] - valores práticos: distâncias < 1 km com bom transporte e renda = ~1
    const accessIndex = Math.min(1, Math.max(0, raw));

    return { accessIndex };
}

/**
 * Classify whether a community qualifies as an EJ (Environmental Justice) community
 * using EPA EJScreen v2.2 (2023) trigger criteria.
 *
 * Critérios de disparo (qualquer um basta):
 *   - EBI > 0.5
 *   - minority > 0.5 (> 50% população minoritária)
 *   - poverty > 0.2 (> 20% abaixo da linha de pobreza)
 *   - linguisticIsolation > 0.1 (> 10% com isolamento linguístico)
 *
 * Score = média dos indicadores que disparam o critério.
 *
 * @param {number} ebi - Environmental Burden Index (0–1)
 * @param {number} minorityPct - fraction of minority population (0–1)
 * @param {number} povertyPct - fraction in poverty (0–1)
 * @param {number} linguisticIsolation_pct - fraction with linguistic isolation (0–1)
 * @returns {{ isEJCommunity: boolean, triggers: string[], score: number }}
 *
 * @throws {RangeError} if any input is outside [0, 1]
 */
export function classifyEJCommunity(
    ebi: number,
    minorityPct: number,
    povertyPct: number,
    linguisticIsolation_pct: number,
): { isEJCommunity: boolean; triggers: string[]; score: number } {
    for (const [name, val] of [
        ['ebi', ebi],
        ['minorityPct', minorityPct],
        ['povertyPct', povertyPct],
        ['linguisticIsolation_pct', linguisticIsolation_pct],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || val < 0 || val > 1) {
            throw new RangeError(`${name} must be a number between 0 and 1`);
        }
    }

    const triggers: string[] = [];
    const values: number[] = [];

    if (ebi > 0.5) {
        triggers.push('high_environmental_burden');
        values.push(ebi);
    }
    if (minorityPct > 0.5) {
        triggers.push('high_minority_population');
        values.push(minorityPct);
    }
    if (povertyPct > 0.2) {
        triggers.push('high_poverty_rate');
        values.push(povertyPct);
    }
    if (linguisticIsolation_pct > 0.1) {
        triggers.push('linguistic_isolation');
        values.push(linguisticIsolation_pct);
    }

    const isEJCommunity = triggers.length > 0;
    const score = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    return { isEJCommunity, triggers, score };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalJusticeMeta: AnalyticsModuleMeta = {
    name: 'environmentalJustice',
    description: 'Environmental Justice & Equity Assessment',
    category: 'analytics',
    familyTags: ['environmental'],
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
