// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This module curates published reference values (calorific power,
// IPCC emission factors). Final scientific validation is the responsibility of
// the user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * @fileoverview Energy Factors Library — ENERGY-SCENARIOS-001 #3.
 *
 * Biblioteca de fatores energéticos em DADOS (não hardcode espalhado): poder
 * calorífico superior/inferior (PCS/PCI) por biomassa/combustível e fatores de
 * emissão IPCC de CO₂ por combustível fóssil — cada fator com FONTE e VIGÊNCIA.
 *
 * Consumível por:
 *  - a família `production_area` (subtipo `thermochemical`) via
 *    `EnergyFactorResolver` (converte massa→energia no painel do elemento);
 *  - as ~34 calculadoras energéticas de `core/analytics/` (mesma referência
 *    curada, uma única fonte de verdade em vez de constantes repetidas).
 *
 * Referências:
 * - IPCC (2006). Guidelines for National GHG Inventories, Vol. 2 (Energy),
 *   Ch. 1, Table 1.4 (default CO₂ emission factors, kg/TJ).
 * - EPE/Balanço Energético Nacional (BEN) — poderes caloríficos de referência.
 * - Literatura técnica sobre caroço de açaí (Euterpe oleracea) como biomassa
 *   energética lignocelulósica: PCS 18,2–21,1 MJ/kg (cru);
 *   ~33 MJ/kg (carbonizado/biochar).
 *
 * Zero DOM/IDB/Three.js/fetch. Pure data + pure helpers.
 * @module energyFactors
 */

/**
 * Categoria do portador de energia.
 */
export type EnergyFactorCategory = 'biomass' | 'biochar' | 'wood' | 'fossil-solid' | 'fossil-liquid' | 'fossil-gas';

/**
 * Um fator energético curado. Todo valor traz `source` e `validity` (vigência)
 * para rastreabilidade científica.
 */
export interface EnergyFactor {
    /** Id estável (ex.: 'acai-seed-raw'). */
    id: string;
    /** Chave i18n do nome (fallback = própria chave). */
    nameKey: string;
    /** Categoria do portador. */
    category: EnergyFactorCategory;
    /** Poder calorífico superior (PCS/HHV) em MJ/kg (valor de trabalho). */
    hhvMJkg: number;
    /** Faixa de literatura do PCS [min, max] em MJ/kg, quando aplicável. */
    hhvRangeMJkg?: readonly [number, number];
    /** Poder calorífico inferior (PCI/LHV) em MJ/kg, quando disponível. */
    lhvMJkg?: number;
    /**
     * Fator de emissão de CO₂ em kg CO₂/GJ (IPCC). Para biomassa é CO₂
     * BIOGÊNICO (líquido ~0 no inventário; informado para transparência).
     */
    co2FactorKgPerGJ?: number;
    /** true quando o carbono é biogênico (biomassa) — CO₂ líquido tratado como 0. */
    biogenic?: boolean;
    /** Fonte da referência (autor/norma). */
    source: string;
    /** Vigência do fator (ano/edição da fonte). */
    validity: string;
    /** Observações adicionais. */
    notes?: string;
}

/**
 * Registry canônico de fatores energéticos. Congelado (data-driven; ampliar =
 * adicionar uma chave). Indexado por id.
 */
export const ENERGY_FACTORS: Readonly<Record<string, EnergyFactor>> = Object.freeze({
    /**
     * Caroço de açaí CRU (Euterpe oleracea) — biomassa energética da várzea.
     * PCS 18,2–21,1 MJ/kg (valores de referência de literatura).
     */
    'acai-seed-raw': {
        id: 'acai-seed-raw',
        nameKey: 'energyFactor.acaiSeedRaw',
        category: 'biomass',
        hhvMJkg: 19.6,
        hhvRangeMJkg: [18.2, 21.1],
        lhvMJkg: 17.9,
        co2FactorKgPerGJ: 100, // IPCC solid biomass ~100 kg CO2/GJ (biogênico → líquido 0)
        biogenic: true,
        source: 'Literatura técnica caroço de açaí (biomassa lignocelulósica)',
        validity: '2026',
        notes: 'CO₂ biogênico: contabilização líquida = 0 no inventário GEE.',
    },

    /**
     * Caroço de açaí CARBONIZADO (biochar/carvão de açaí) — pós-pirólise.
     * PCS ~33 MJ/kg (densificação energética por carbonização).
     */
    'acai-seed-carbonized': {
        id: 'acai-seed-carbonized',
        nameKey: 'energyFactor.acaiSeedCarbonized',
        category: 'biochar',
        hhvMJkg: 33.0,
        hhvRangeMJkg: [30.0, 33.0],
        lhvMJkg: 32.0,
        co2FactorKgPerGJ: 100,
        biogenic: true,
        source: 'Literatura técnica carbonização de caroço de açaí',
        validity: '2026',
        notes: 'Biochar de açaí; carbono biogênico.',
    },

    /**
     * Lenha (madeira seca ao ar) — biomassa florestal de referência.
     * PCS ~18,5 MJ/kg (base seca).
     */
    firewood: {
        id: 'firewood',
        nameKey: 'energyFactor.firewood',
        category: 'wood',
        hhvMJkg: 18.5,
        hhvRangeMJkg: [15.0, 19.0],
        lhvMJkg: 15.6,
        co2FactorKgPerGJ: 112, // IPCC wood/wood waste = 112 000 kg CO2/TJ (biogênico)
        biogenic: true,
        source: 'IPCC 2006 Vol.2 Tab.1.4 (wood/wood waste) + BEN/EPE (PCS lenha)',
        validity: 'IPCC 2006 / BEN 2023',
        notes: 'CO₂ biogênico.',
    },

    /**
     * Carvão mineral (betuminoso) — combustível fóssil sólido de referência.
     * PCS ~26 MJ/kg; fator de emissão IPCC 94,6 kg CO₂/GJ.
     */
    'coal-mineral': {
        id: 'coal-mineral',
        nameKey: 'energyFactor.coalMineral',
        category: 'fossil-solid',
        hhvMJkg: 26.0,
        hhvRangeMJkg: [24.0, 30.0],
        lhvMJkg: 25.0,
        co2FactorKgPerGJ: 94.6, // IPCC 2006 "other bituminous coal" 94 600 kg CO2/TJ
        biogenic: false,
        source: 'IPCC 2006 Vol.2 Tab.1.4 (other bituminous coal)',
        validity: 'IPCC 2006',
        notes: 'Fóssil: CO₂ contabilizado integralmente.',
    },

    /**
     * Óleo combustível (fuel oil) — fóssil líquido de referência.
     * PCS ~42,8 MJ/kg; fator IPCC 77,4 kg CO₂/GJ.
     */
    'fuel-oil': {
        id: 'fuel-oil',
        nameKey: 'energyFactor.fuelOil',
        category: 'fossil-liquid',
        hhvMJkg: 42.8,
        lhvMJkg: 40.4,
        co2FactorKgPerGJ: 77.4, // IPCC residual fuel oil 77 400 kg CO2/TJ
        biogenic: false,
        source: 'IPCC 2006 Vol.2 Tab.1.4 (residual fuel oil)',
        validity: 'IPCC 2006',
    },

    /**
     * Gás natural — fóssil gasoso de referência.
     * PCS ~50 MJ/kg; fator IPCC 56,1 kg CO₂/GJ.
     */
    'natural-gas': {
        id: 'natural-gas',
        nameKey: 'energyFactor.naturalGas',
        category: 'fossil-gas',
        hhvMJkg: 50.0,
        lhvMJkg: 48.0,
        co2FactorKgPerGJ: 56.1, // IPCC natural gas 56 100 kg CO2/TJ
        biogenic: false,
        source: 'IPCC 2006 Vol.2 Tab.1.4 (natural gas)',
        validity: 'IPCC 2006',
    },
});

/**
 * Lista todos os fatores (cópia rasa para iteração segura).
 */
export function listEnergyFactors(): EnergyFactor[] {
    return Object.values(ENERGY_FACTORS);
}

/**
 * Resolve um fator por id, ou null (fallback seguro).
 */
export function getEnergyFactor(id: string | null | undefined): EnergyFactor | null {
    if (!id || typeof id !== 'string') return null;
    return ENERGY_FACTORS[id] ?? null;
}

/**
 * Energia (MJ) a partir de massa (kg) e do fator, base 'hhv' (PCS) ou 'lhv' (PCI).
 * Retorna 0 para entradas inválidas (defensivo).
 *
 * @param massKg - massa em quilogramas
 * @param id     - id do fator energético
 * @param basis  - 'hhv' (PCS, default) ou 'lhv' (PCI)
 */
export function energyFromMass(massKg: number, id: string, basis: 'hhv' | 'lhv' = 'hhv'): number {
    const f = getEnergyFactor(id);
    if (!f || !Number.isFinite(massKg) || massKg <= 0) return 0;
    const mj = basis === 'lhv' && Number.isFinite(f.lhvMJkg as number) ? (f.lhvMJkg as number) : f.hhvMJkg;
    if (!Number.isFinite(mj)) return 0;
    const out = massKg * mj;
    return out > 0 ? out : 0;
}

/**
 * Emissão de CO₂ (kg) a partir da energia (GJ) e do fator. Para biomassa
 * (biogênico) devolve 0 líquido salvo `includeBiogenic=true`.
 *
 * @param energyGJ - energia em GJ
 * @param id       - id do fator energético
 * @param includeBiogenic - contabiliza CO₂ biogênico (default false)
 */
export function co2FromEnergy(energyGJ: number, id: string, includeBiogenic: boolean = false): number {
    const f = getEnergyFactor(id);
    if (!f || !Number.isFinite(energyGJ) || energyGJ <= 0) return 0;
    if (f.biogenic && !includeBiogenic) return 0;
    const ef = f.co2FactorKgPerGJ;
    if (!Number.isFinite(ef as number)) return 0;
    return energyGJ * (ef as number);
}

/**
 * Adaptador para o `EnergyFactorResolver` da família production_area:
 * devolve só o subconjunto { hhvMJkg } (injeção de dependência).
 */
export function energyFactorResolver(id: string): { hhvMJkg: number } | null {
    const f = getEnergyFactor(id);
    return f ? { hhvMJkg: f.hhvMJkg } : null;
}
