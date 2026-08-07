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
// Application: EHS & Mining - Industrial Hazardous Waste Minimization
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Hazardous Waste Minimization (IWM)
 *
 * Módulo puro implementando índices de minimização de resíduos industriais
 * perigosos conforme metodologia US EPA (1992) e Diretiva Europeia 2008/98/EC.
 * Inclui índice de minimização, eficiência de recuperação, pontuação de hazard
 * por categoria e classificação de desempenho. Aplicável a auditorias de resíduos
 * industriais, relatórios ambientais e conformidade regulatória.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US EPA (1992). Facility Pollution Prevention Guide. EPA/600/R-92/088.
 *     Washington, DC: US EPA Office of Research and Development.
 *   - US EPA (1992). Guides to Pollution Prevention: Selected Hospital Waste
 *     Streams. EPA/625/7-90/009 (WM methodology, tracking indices).
 *   - European Parliament (2008). Waste Framework Directive 2008/98/EC on waste
 *     and repealing certain Directives. OJ L 312/3, 22.11.2008.
 *     (hierarquia de resíduos: prevenção > reutilização > reciclagem)
 *   - Waste Minimization National Plan (1994). US EPA 530-R-94-013.
 *
 * @module industrialHazardousWasteMinimization
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
 * Categorias de resíduo perigoso e seus pesos de hazard base.
 * Baseado nas classes RCRA (Resource Conservation and Recovery Act) e
 * Diretiva 2008/98/EC Anexo III.
 * Quanto maior o peso, maior o perigo intrínseco da categoria.
 */
const HAZARD_WEIGHTS = {
    corrosive: 1.0,
    flammable: 1.5,
    reactive: 2.0,
    toxic: 2.5,
    acutely_toxic: 3.5,
    carcinogenic: 4.0,
};

/**
 * Hierarquia de gestão de resíduos (EU WFD 2008/98/EC Art. 4).
 * Pontuação da pior (0) para a melhor (4) estratégia de gestão.
 */
const MANAGEMENT_SCORES = {
    disposal: 0, // aterro / incineração sem recuperação de energia
    incineration_energy: 1, // incineração com recuperação de energia
    recycling: 2, // reciclagem material
    reuse: 3, // reutilização
    prevention: 4, // prevenção / source reduction
};

/**
 * Calcula o Índice de Minimização de Resíduos (WMI) para um processo industrial.
 *
 * O WMI compara a geração atual com uma linha de base de referência, ponderado
 * pela produção. Um WMI de 1.0 indica ausência de melhora; WMI > 1.0 indica
 * piora; WMI < 1.0 indica minimização efetiva.
 *
 *   WMI = (W_atual / P_atual) / (W_base / P_base)
 *
 * Onde W = quantidade de resíduo gerado (kg) e P = produção (unidade).
 *
 * @param wasteGenerated_kg  - Resíduo gerado no período atual (kg), >= 0
 * @param production_units   - Produção no período atual (unidades), > 0
 * @param baseline_waste_kg  - Resíduo gerado no período base (kg), > 0
 * @param baseline_prod      - Produção no período base (unidades), > 0
 * @returns Índice WMI (adim.), resíduo específico atual e de linha de base (kg/unidade)
 */
export function calcWasteMinimizationIndex(
    wasteGenerated_kg: number,
    production_units: number,
    baseline_waste_kg: number,
    baseline_prod: number,
): { wmi: number; specific_waste_current: number; specific_waste_baseline: number } {
    if (typeof wasteGenerated_kg !== 'number' || wasteGenerated_kg < 0)
        throw new RangeError('wasteGenerated_kg must be >= 0');
    if (typeof production_units !== 'number' || production_units <= 0)
        throw new RangeError('production_units must be > 0');
    if (typeof baseline_waste_kg !== 'number' || baseline_waste_kg <= 0)
        throw new RangeError('baseline_waste_kg must be > 0');
    if (typeof baseline_prod !== 'number' || baseline_prod <= 0) throw new RangeError('baseline_prod must be > 0');

    const specific_current = wasteGenerated_kg / production_units;
    const specific_baseline = baseline_waste_kg / baseline_prod;
    const wmi = specific_current / specific_baseline;

    return {
        wmi,
        specific_waste_current: specific_current,
        specific_waste_baseline: specific_baseline,
    };
}

/**
 * Calcula a eficiência de recuperação de resíduos perigosos.
 *
 * A eficiência de recuperação (RE) quantifica a fração de resíduos gerados
 * que é desviada do descarte final por meio de reciclagem, reutilização ou
 * recuperação de energia:
 *   RE = W_recovered / W_generated
 *
 * @param wasteGenerated_kg  - Total gerado no período (kg), > 0
 * @param wasteRecovered_kg  - Total recuperado/reciclado (kg), >= 0
 * @param wasteReused_kg     - Total reutilizado (kg), >= 0
 * @returns Eficiência de recuperação (0–1), quantidade descartada e desviada (kg)
 */
export function calcRecoveryEfficiency(
    wasteGenerated_kg: number,
    wasteRecovered_kg: number,
    wasteReused_kg = 0,
): { recovery_efficiency: number; disposed_kg: number; diverted_kg: number } {
    if (typeof wasteGenerated_kg !== 'number' || wasteGenerated_kg <= 0)
        throw new RangeError('wasteGenerated_kg must be > 0');
    if (typeof wasteRecovered_kg !== 'number' || wasteRecovered_kg < 0)
        throw new RangeError('wasteRecovered_kg must be >= 0');
    if (typeof wasteReused_kg !== 'number' || wasteReused_kg < 0) throw new RangeError('wasteReused_kg must be >= 0');

    const diverted = wasteRecovered_kg + wasteReused_kg;

    if (diverted > wasteGenerated_kg) throw new RangeError('recovered + reused cannot exceed generated');

    const re = diverted / wasteGenerated_kg;
    const disposed = wasteGenerated_kg - diverted;

    return {
        recovery_efficiency: re,
        disposed_kg: disposed,
        diverted_kg: diverted,
    };
}

/**
 * Calcula o Hazard Score composto de um fluxo de resíduos perigosos.
 *
 * O score integra categoria de perigo, quantidade gerada e estratégia de gestão.
 * Fórmula:
 *   HS = hazard_weight * quantity_kg * (1 - management_score / 4)
 *
 * A penalidade por gestão inadequada é máxima para descarte (0) e zero para
 * prevenção (4 = highest score in hierarchy).
 *
 * @param quantity_kg          - Quantidade de resíduo (kg), >= 0
 * @param hazard_category      - Categoria: corrosive|flammable|reactive|toxic|acutely_toxic|carcinogenic
 * @param management_strategy  - Estratégia: disposal|incineration_energy|recycling|reuse|prevention
 * @returns Score de hazard composto, peso de hazard e penalidade de gestão
 */
export function calcHazardScore(
    quantity_kg: number,
    hazard_category: string,
    management_strategy: string,
): { hazard_score: number; hazard_weight: number; management_penalty: number } {
    if (typeof quantity_kg !== 'number' || quantity_kg < 0) throw new RangeError('quantity_kg must be >= 0');
    if (!(hazard_category in HAZARD_WEIGHTS))
        throw new TypeError(`hazard_category must be one of: ${Object.keys(HAZARD_WEIGHTS).join(', ')}`);
    if (!(management_strategy in MANAGEMENT_SCORES))
        throw new TypeError(`management_strategy must be one of: ${Object.keys(MANAGEMENT_SCORES).join(', ')}`);

    const hw = (HAZARD_WEIGHTS as Record<string, number>)[hazard_category]!;
    const ms = (MANAGEMENT_SCORES as Record<string, number>)[management_strategy]!;
    const management_penalty = 1 - ms / 4; // 1.0 (pior) a 0.0 (melhor)
    const hazard_score = hw * quantity_kg * management_penalty;

    return { hazard_score, hazard_weight: hw, management_penalty };
}

/**
 * Classifica o desempenho de minimização de resíduos perigosos.
 *
 * Escala de desempenho baseada no WMI e eficiência de recuperação combinados,
 * em 5 níveis (0 = crítico, 4 = excelente), conforme EPA/625/7-90/009.
 *
 * Nível | WMI          | RE       | Descrição
 *   4   | < 0.5        | >= 0.80  | Excelente - grande redução + alta recuperação
 *   3   | 0.5–0.79     | >= 0.60  | Bom - redução significativa
 *   2   | 0.80–0.99    | >= 0.40  | Regular - melhora marginal
 *   1   | 1.00–1.19    | >= 0.20  | Abaixo da meta - estagnado ou leve piora
 *   0   | >= 1.20      | < 0.20   | Crítico - piora ou ausência de controle
 *
 * @param wmi                 - Índice de minimização (adim.), > 0
 * @param recovery_efficiency - Eficiência de recuperação (0–1)
 * @returns Nível (0–4), rótulo e descrição
 */
export function classifyWasteMinimizationPerformance(
    wmi: number,
    recovery_efficiency: number,
): { level: number; label: string; description: string } {
    if (typeof wmi !== 'number' || wmi <= 0) throw new RangeError('wmi must be > 0');
    if (typeof recovery_efficiency !== 'number' || recovery_efficiency < 0 || recovery_efficiency > 1)
        throw new RangeError('recovery_efficiency must be in [0, 1]');

    const tiers: Array<{ level: number; label: string; description: string; maxWmi: number; minRe: number }> = [
        { level: 4, label: 'excellent', description: 'Grande redução + alta recuperação', maxWmi: 0.5, minRe: 0.8 },
        { level: 3, label: 'good', description: 'Redução significativa de resíduos', maxWmi: 0.8, minRe: 0.6 },
        { level: 2, label: 'fair', description: 'Melhora marginal em andamento', maxWmi: 1.0, minRe: 0.4 },
        {
            level: 1,
            label: 'below_target',
            description: 'Abaixo da meta — ação corretiva necessária',
            maxWmi: 1.2,
            minRe: 0.2,
        },
    ];

    for (const t of tiers) {
        if (wmi < t.maxWmi && recovery_efficiency >= t.minRe) {
            return { level: t.level, label: t.label, description: t.description };
        }
    }

    return { level: 0, label: 'critical', description: 'Situação crítica — piora ou ausência de controle' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialHazardousWasteMinimizationMeta: AnalyticsModuleMeta = {
    name: 'industrialHazardousWasteMinimization',
    description: 'Industrial Hazardous Waste Minimization',
    category: 'analytics',
    familyTags: ['industrial', 'waste', 'risk'],
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
