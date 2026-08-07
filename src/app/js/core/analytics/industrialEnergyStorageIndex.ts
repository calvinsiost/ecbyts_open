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
 * Industrial Energy Storage Index - CAES + BESS + TES
 *
 * Métricas de desempenho para sistemas de armazenamento de energia industrial,
 * baseadas em relatórios IEA e literatura científica revisada por pares.
 *
 * Referências:
 *   IEA (2020). Energy Storage Tracking Report. International Energy Agency.
 *     https://www.iea.org/reports/energy-storage
 *   IRENA (2017). Electricity Storage and Renewables: Costs and Markets to 2030.
 *     International Renewable Energy Agency. ISBN 978-92-9260-038-9.
 *   Schmidt, O. et al. (2019). Projecting the Future Levelized Cost of Electricity
 *     Storage Technologies. Joule 3(1), 81-100.
 *     DOI:10.1016/j.joule.2018.12.008
 *
 * @module industrialEnergyStorageIndex
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

type StorageTechnology = 'pumped_hydro' | 'CAES' | 'BESS_LFP' | 'BESS_NMC' | 'flywheel' | 'TES';

/**
 * Calcula Round-Trip Efficiency (RTE) - razão entre energia descarregada
 * e energia carregada para um ciclo completo.
 *
 * RTE = (Edischarge / Echarge) × 100   [%]
 *
 * @param {number} chargeEnergy_kWh    - Energia inserida no ciclo de carga (kWh)
 * @param {number} dischargeEnergy_kWh - Energia extraída no ciclo de descarga (kWh)
 * @returns {{ RTE_pct: number }}
 */
export function calcRoundTripEfficiency(
    chargeEnergy_kWh: number,
    dischargeEnergy_kWh: number,
): { RTE_pct: number } {
    if (!Number.isFinite(chargeEnergy_kWh) || chargeEnergy_kWh <= 0) {
        throw new RangeError(`chargeEnergy_kWh deve ser > 0, recebido: ${chargeEnergy_kWh}`);
    }
    if (!Number.isFinite(dischargeEnergy_kWh) || dischargeEnergy_kWh < 0) {
        throw new RangeError(`dischargeEnergy_kWh deve ser >= 0, recebido: ${dischargeEnergy_kWh}`);
    }
    if (dischargeEnergy_kWh > chargeEnergy_kWh) {
        throw new RangeError('dischargeEnergy não pode ser maior que chargeEnergy (viola 1ª lei)');
    }
    const RTE_pct = (dischargeEnergy_kWh / chargeEnergy_kWh) * 100;
    return { RTE_pct };
}

/**
 * Calcula Energy Density (ED) - energia armazenada por unidade de volume.
 * Métrica crítica para comparação volumétrica entre tecnologias.
 *
 * ED = capacity_kWh / volume_m3   [kWh/m³]
 *
 * @param {number} capacity_kWh - Capacidade nominal do sistema (kWh)
 * @param {number} volume_m3    - Volume ocupado pelo sistema (m³)
 * @returns {{ ED_kWh_per_m3: number }}
 */
export function calcEnergyDensity(capacity_kWh: number, volume_m3: number): { ED_kWh_per_m3: number } {
    if (!Number.isFinite(capacity_kWh) || capacity_kWh <= 0) {
        throw new RangeError(`capacity_kWh deve ser > 0, recebido: ${capacity_kWh}`);
    }
    if (!Number.isFinite(volume_m3) || volume_m3 <= 0) {
        throw new RangeError(`volume_m3 deve ser > 0, recebido: ${volume_m3}`);
    }
    const ED_kWh_per_m3 = capacity_kWh / volume_m3;
    return { ED_kWh_per_m3 };
}

/**
 * Calcula Cycle Life Cost - custo de capital amortizado por kWh entregue
 * ao longo da vida útil do sistema.
 *
 * CLC = capex / (cycles × capacity_kWh)   [$/kWh/cycle]
 *
 * @param {number} capex        - Custo total de instalação ($)
 * @param {number} cycles       - Número total de ciclos de vida (ciclos)
 * @param {number} capacity_kWh - Capacidade útil por ciclo (kWh)
 * @returns {{ cycleCost_dollar_per_kWh_per_cycle: number }}
 */
export function calcCycleLifeCost(
    capex: number,
    cycles: number,
    capacity_kWh: number,
): { cycleCost_dollar_per_kWh_per_cycle: number } {
    if (!Number.isFinite(capex) || capex <= 0) {
        throw new RangeError(`capex deve ser > 0, recebido: ${capex}`);
    }
    if (!Number.isFinite(cycles) || cycles <= 0) {
        throw new RangeError(`cycles deve ser > 0, recebido: ${cycles}`);
    }
    if (!Number.isFinite(capacity_kWh) || capacity_kWh <= 0) {
        throw new RangeError(`capacity_kWh deve ser > 0, recebido: ${capacity_kWh}`);
    }
    const cycleCost_dollar_per_kWh_per_cycle = capex / (cycles * capacity_kWh);
    return { cycleCost_dollar_per_kWh_per_cycle };
}

/**
 * Classifica a tecnologia de armazenamento por faixas típicas de RTE,
 * ED e ciclos de vida (Schmidt et al. 2019, IEA 2020).
 *
 * Faixas de referência (valores medianos da literatura):
 *   pumped_hydro : RTE 75-82%, ED 0.5-2, cycleLife >20000
 *   CAES         : RTE 50-70%, ED 3-6,   cycleLife >10000
 *   BESS_LFP     : RTE 90-96%, ED 250-450, cycleLife >4000
 *   BESS_NMC     : RTE 90-96%, ED 400-700, cycleLife 1000-4000
 *   flywheel     : RTE 85-95%, ED 20-80, cycleLife >100000
 *   TES          : RTE 40-60%, ED 50-250, cycleLife >10000
 *
 * A classificação é probabilística por pontuação de similaridade às faixas.
 *
 * @param {number} RTE       - Round-trip efficiency (%)
 * @param {number} ED        - Energy density (kWh/m³)
 * @param {number} cycleLife - Ciclos totais esperados
 * @returns {'pumped_hydro'|'CAES'|'BESS_LFP'|'BESS_NMC'|'flywheel'|'TES'}
 */
export function classifyStorageTechnology(RTE: number, ED: number, cycleLife: number): StorageTechnology {
    if (!Number.isFinite(RTE) || RTE <= 0 || RTE > 100) {
        throw new RangeError(`RTE deve estar em (0, 100], recebido: ${RTE}`);
    }
    if (!Number.isFinite(ED) || ED <= 0) {
        throw new RangeError(`ED deve ser > 0, recebido: ${ED}`);
    }
    if (!Number.isFinite(cycleLife) || cycleLife <= 0) {
        throw new RangeError(`cycleLife deve ser > 0, recebido: ${cycleLife}`);
    }

    /**
     * Perfis: [rteMin, rteMax, edMin, edMax, cycleMin]
     * @type {ReadonlyArray<['pumped_hydro'|'CAES'|'BESS_LFP'|'BESS_NMC'|'flywheel'|'TES', [number, number, number, number, number]]>}
     */
    const profiles: ReadonlyArray<[StorageTechnology, [number, number, number, number, number]]> = [
        ['pumped_hydro', [75, 82, 0.5, 2, 20000]],
        ['CAES', [50, 70, 3, 6, 10000]],
        ['BESS_LFP', [90, 96, 250, 450, 4000]],
        ['BESS_NMC', [90, 96, 400, 700, 1000]],
        ['flywheel', [85, 95, 20, 80, 100000]],
        ['TES', [40, 60, 50, 250, 10000]],
    ];

    /** @type {'pumped_hydro'|'CAES'|'BESS_LFP'|'BESS_NMC'|'flywheel'|'TES'} */
    let best: StorageTechnology = 'pumped_hydro';
    let bestScore = -Infinity;

    for (const [tech, [rMin, rMax, eMin, eMax, cMin]] of profiles) {
        // Pontuação: quantos critérios estão dentro da faixa (0-3)
        const rteScore = RTE >= rMin && RTE <= rMax ? 1 : 0;
        const edScore = ED >= eMin && ED <= eMax ? 1 : 0;
        const clScore = cycleLife >= cMin ? 1 : 0;
        const score = rteScore + edScore + clScore;
        if (score > bestScore) {
            bestScore = score;
            best = tech;
        }
    }
    return best;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialEnergyStorageIndexMeta: AnalyticsModuleMeta = {
    name: 'industrialEnergyStorageIndex',
    description: 'industrialEnergyStorageIndex',
    category: 'analytics',
    familyTags: ['industrial', 'energy'],
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
