// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Decision Definitions - Environmental Strategy Options
// ADR: ADR-025

/* ================================================================
   DECISION DEFINITIONS — Catálogo de Decisões Estratégicas
   ================================================================

   Cada decisão representa uma estratégia ou ação que pode ser
   simulada e comparada contra o baseline.

   Estrutura:
   - id: identificador único
   - name: nome amigável
   - description: explicação do que a decisão faz
   - mods: modificações nos parâmetros base
   - tag: categoria (remediation, monitoring, strategy, etc.)
   ================================================================ */

/**
 * Definições de decisões ambientais.
 * @type {Array<Object>}
 */
import { safeSetItem } from '../../../utils/storage/storageMonitor.js';
export const ENVIRONMENTAL_DECISIONS = [
    // ================================================================
    // REMEDIAÇÃO ATIVA
    // ================================================================

    {
        id: 'pump_and_treat',
        name: 'Pump & Treat (P&T)',
        description: 'Sistema de bombeamento e tratamento ex-situ. Alto CAPEX, OPEX moderado.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.12,
            initialCost: 500000,
            remediationOpex: 15000,
            failureProbability: 0.003,
        },
        tag: 'remediation',
    },

    {
        id: 'prb_zero_valent',
        name: 'PRB — ZVI (Ferro Zero)',
        description: 'Barreira permeável reativa com ferro zero. Alto CAPEX, baixo OPEX.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.25,
            initialCost: 800000,
            remediationOpex: 5000,
            failureProbability: 0.002,
        },
        tag: 'remediation',
    },

    {
        id: 'air_sparging',
        name: 'Air Sparging + SVE',
        description: 'Sparging de ar e extração de vapor. Efetivo para BTEX.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.18,
            initialCost: 350000,
            remediationOpex: 12000,
            failureProbability: 0.004,
        },
        tag: 'remediation',
    },

    {
        id: 'biostimulation',
        name: 'Bioestimulação',
        description: 'Injeção de nutrientes para estimular biodegradação.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.08,
            naturalDecayRate: 0.02, // Aumenta decaimento natural
            initialCost: 200000,
            remediationOpex: 8000,
            failureProbability: 0.002,
        },
        tag: 'remediation',
    },

    {
        id: 'bioaugmentation',
        name: 'Bioaumentação',
        description: 'Injeção de microrganismos degradadores específicos.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.15,
            naturalDecayRate: 0.025,
            initialCost: 280000,
            remediationOpex: 10000,
            failureProbability: 0.003,
        },
        tag: 'remediation',
    },

    {
        id: 'electrokinetic',
        name: 'Remediação Eletrocinética',
        description: 'Para metais pesados em solo fino.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.2,
            initialCost: 600000,
            remediationOpex: 18000,
            failureProbability: 0.005,
        },
        tag: 'remediation',
    },

    {
        id: 'soil_vapor_extraction',
        name: 'Extração de Vapor (SVE)',
        description: 'SVE standalone para zona vadosa.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.1,
            initialCost: 250000,
            remediationOpex: 8000,
            failureProbability: 0.003,
        },
        tag: 'remediation',
    },

    {
        id: 'chemical_oxidation',
        name: 'Oxidação Química In Situ (ISCO)',
        description: 'Injeção de persulfato, permanganato ou peróxido.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.3,
            initialCost: 400000,
            remediationOpex: 15000, // Reaplicação periódica
            failureProbability: 0.004,
        },
        tag: 'remediation',
    },

    {
        id: 'chemical_reduction',
        name: 'Redução Química In Situ (ISCR)',
        description: 'Para solventes clorados.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.28,
            initialCost: 450000,
            remediationOpex: 12000,
            failureProbability: 0.003,
        },
        tag: 'remediation',
    },

    {
        id: 'thermal_desorption',
        name: 'Desorção Térmica',
        description: 'Tratamento térmico do solo (ex-situ).',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.95, // Muito efetivo
            initialCost: 1200000,
            remediationOpex: 30000,
            failureProbability: 0.001,
        },
        tag: 'remediation',
    },

    // ================================================================
    // MONITORAMENTO
    // ================================================================

    {
        id: 'dense_monitoring',
        name: 'Monitoramento Denso',
        description: 'Poços de monitoramento a cada 20m. Detecção precoce.',
        mods: {
            monitoringCost: 8000,
            failureProbability: 0.001, // Detecta problemas cedo
        },
        tag: 'monitoring',
    },

    {
        id: 'reduced_monitoring',
        name: 'Monitoramento Reduzido',
        description: 'Economia de 40% no monitoramento, mas maior risco.',
        mods: {
            monitoringCost: 3000,
            failureProbability: 0.006, // Maior risco de não detectar
        },
        tag: 'monitoring',
    },

    {
        id: 'smart_monitoring',
        name: 'Monitoramento Inteligente (IoT)',
        description: 'Sensores em tempo real + análise preditiva.',
        mods: {
            monitoringCost: 6000,
            failureProbability: 0.0015,
            initialCost: 150000, // Custo de instalação de sensores
        },
        tag: 'monitoring',
    },

    {
        id: 'passive_sampling',
        name: 'Amostragem Passiva',
        description: 'Difusores passivos, custo menor, integração temporal.',
        mods: {
            monitoringCost: 2500,
        },
        tag: 'monitoring',
    },

    // ================================================================
    // ESTRATÉGIAS COMBINADAS
    // ================================================================

    {
        id: 'mna_early',
        name: 'MNA com Delineamento Inicial',
        description: 'Atenuação natural após delineamento completo.',
        mods: {
            remediationActive: false,
            naturalDecayRate: 0.015,
            monitoringCost: 3500,
            initialCost: 200000, // Custo de delineamento
        },
        tag: 'strategy',
    },

    {
        id: 'source_removal_mna',
        name: 'Remoção da Fonte + MNA',
        description: 'Remove solo contaminado, MNA para pluma dissolvida.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.2,
            initialConcentration: 800, // Reduz concentração inicial
            initialCost: 600000,
            remediationOpex: 5000,
        },
        tag: 'strategy',
    },

    {
        id: 'phased_approach',
        name: 'Abordagem Faseada',
        description: 'Etapa 1: fonte. Etapa 2: pluma.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.22,
            initialCost: 900000, // Soma das fases
            remediationOpex: 10000,
            failureProbability: 0.002,
        },
        tag: 'strategy',
    },

    {
        id: 'full_founder', // Equivalente ao "founder" do seu exemplo
        name: 'All-In: Full Remediation',
        description: 'Máxima intervenção, máximo custo, máxima chance de sucesso.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.4,
            initialCost: 2000000,
            remediationOpex: 25000,
            monitoringCost: 8000,
            failureProbability: 0.001,
        },
        tag: 'strategy',
    },

    {
        id: 'safe_minimum',
        name: 'Mínimo Viável + Garantias',
        description: 'Intervenção mínima com contingências.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.05,
            initialCost: 100000,
            remediationOpex: 3000,
            emergencyCost: 500000, // Reserva para emergência
        },
        tag: 'strategy',
    },

    // ================================================================
    // CORTES DE CUSTO (trade-offs)
    // ================================================================

    {
        id: 'cut_15',
        name: 'Cortar 15% Custos Operacionais',
        description: 'Redução de frequência de análises e manutenção.',
        mods: {
            monitoringCost: 0.85,
            remediationOpex: 0.85,
            failureProbability: 1.3, // Multiplicador de risco
        },
        tag: 'financeiro',
    },

    {
        id: 'cut_25',
        name: 'Austeridade 25%',
        description: 'Modo econômico agressivo. Maior risco operacional.',
        mods: {
            monitoringCost: 0.75,
            remediationOpex: 0.75,
            failureProbability: 1.6,
        },
        tag: 'financeiro',
    },

    {
        id: 'accelerated_schedule',
        name: 'Cronograma Acelerado',
        description: 'Compactar timeline em 30%. Mais custo, menos tempo.',
        mods: {
            remediationEfficiency: 1.3, // 30% mais eficiente
            remediationOpex: 1.5,
            months: 84, // 7 anos em vez de 10
        },
        tag: 'financeiro',
    },

    // ================================================================
    // COMBOS
    // ================================================================

    {
        id: 'combo_executive',
        name: 'COMBO Executivo: P&T + IoT',
        description: 'Pump & Treat com monitoramento inteligente.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.15,
            initialCost: 650000,
            remediationOpex: 17000,
            monitoringCost: 6000,
            failureProbability: 0.001,
        },
        tag: 'combo',
    },

    {
        id: 'combo_founder',
        name: 'COMBO All-In: PRB + ISCO + IoT',
        description: 'Máxima tecnologia, máximo investimento.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.45,
            initialCost: 1400000,
            remediationOpex: 22000,
            monitoringCost: 6000,
            failureProbability: 0.0005,
        },
        tag: 'combo',
    },

    // ================================================================
    // MITIGAÇÃO CLIMÁTICA
    // Redução da pegada de carbono da remediação/operação
    // ================================================================

    {
        id: 'low_carbon_remediation',
        name: 'Remediação de Baixo Carbono',
        description: 'Fitorremediação, PRBs passivas, bioestimulação solar. Baixa pegada de carbono.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.06,
            initialCost: 180000,
            remediationOpex: 3000,
            climateStress: -0.05, // Benefício líquido de carbono
        },
        tag: 'mitigation',
    },

    {
        id: 'renewable_energy_remediation',
        name: 'Remediação com Energia Renovável',
        description: 'P&T ou SVE alimentados por painéis solares/eólica. Zero emissão operacional.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.12,
            initialCost: 600000,
            remediationOpex: 6000,
            climateStress: -0.03,
        },
        tag: 'mitigation',
    },

    {
        id: 'carbon_sequestration',
        name: 'Sequestro de Carbono no Solo',
        description: 'Biochar + compostagem em solo contaminado. Imobiliza contaminantes e sequestra CO2.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.1,
            naturalDecayRate: 0.018, // Biochar estimula atividade microbiana
            initialCost: 250000,
            remediationOpex: 7000,
            climateStress: -0.08,
        },
        tag: 'mitigation',
    },

    {
        id: 'methane_capture',
        name: 'Captura de Metano',
        description: 'Coleta e aproveitamento energético de CH4 de áreas anaeróbias contaminadas.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.05,
            initialCost: 350000,
            remediationOpex: 8000,
            climateStress: -0.1, // Redução significativa de GEE
            failureProbability: 0.003,
        },
        tag: 'mitigation',
    },

    // ================================================================
    // ADAPTAÇÃO CLIMÁTICA
    // Resiliência de infraestrutura a eventos extremos
    // ================================================================

    {
        id: 'flood_resilient_infra',
        name: 'Infraestrutura Resiliente a Enchentes',
        description: 'Poços elevados, encapsulamento impermeável, drenagem redundante.',
        mods: {
            initialCost: 400000,
            monitoringCost: 5500,
            failureProbability: 0.001,
            extremeEventFreq: 0.5, // Reduz impacto de eventos extremos pela metade
            emergencyCost: 100000,
        },
        tag: 'adaptation',
    },

    {
        id: 'climate_adaptive_design',
        name: 'Design Adaptativo ao Clima',
        description: 'Sistemas dimensionados para cenário futuro (RCP 4.5/8.5). Over-design preventivo.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.18,
            initialCost: 700000,
            remediationOpex: 14000,
            climateTrend: 0.0005, // Reduz tendência efetiva (sistema pré-adaptado)
            extremeEventFreq: 0.7,
            failureProbability: 0.001,
        },
        tag: 'adaptation',
    },

    {
        id: 'adaptive_monitoring',
        name: 'Monitoramento Adaptativo',
        description: 'IoT + gatilhos pluviométricos. Amostragem responsiva a eventos climáticos.',
        mods: {
            monitoringCost: 7000,
            initialCost: 200000,
            failureProbability: 0.0008,
            extremeEventFreq: 0.6, // Melhor preparação = menor impacto efetivo
        },
        tag: 'adaptation',
    },

    {
        id: 'green_infrastructure',
        name: 'Infraestrutura Verde (SbN)',
        description: 'Wetlands construídos, bioswales, fitorremediação. Soluções baseadas na natureza.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.07,
            naturalDecayRate: 0.02, // Processos naturais aprimorados
            initialCost: 300000,
            remediationOpex: 4000,
            climateStress: -0.06, // Sumidouro de carbono + regulação microclimática
            seasonalAmplitude: 0.02, // Hidrologia de wetland amortece sazonalidade
        },
        tag: 'adaptation',
    },

    // ================================================================
    // REDUÇÃO DE EMISSÕES GHG
    // Estratégias corporativas para cenários de projeção de emissões
    // ================================================================

    {
        id: 'ghg_renewable_ppa',
        name: 'PPA de Energia Renovável',
        description: 'Contrato de compra de energia renovável (eólica/solar). Elimina Scope 2.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.08,
            naturalDecayRate: 0.015, // Descarbonização acelerada
            initialCost: 300000,
            remediationOpex: 25000, // Prêmio renovável mensal
            emissionFactorUncertainty: 0.05, // EF conhecido (fonte dedicada)
        },
        tag: 'ghg_reduction',
    },

    {
        id: 'ghg_energy_efficiency',
        name: 'Eficiência Energética (ISO 50001)',
        description: 'Retrofit, automação, gestão energética. Reduz AD sem cortar produção.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.05,
            dispersionRate: 0.001, // Menor crescimento líquido de atividade
            initialCost: 500000,
            remediationOpex: 10000,
            activityDataUncertainty: 0.08, // Medição melhorada
        },
        tag: 'ghg_reduction',
    },

    {
        id: 'ghg_fleet_electrification',
        name: 'Eletrificação de Frota',
        description: 'Substituição progressiva de frota diesel/gasolina por elétrica.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.06,
            initialCost: 800000,
            remediationOpex: 5000, // OPEX menor (manutenção + energia)
            emissionFactorUncertainty: 0.1,
            implementationDelay: 6, // Lead time para aquisição + infraestrutura
        },
        tag: 'ghg_reduction',
    },

    {
        id: 'ghg_carbon_offset',
        name: 'Créditos de Carbono / Offsetting',
        description: 'Compra de créditos (REDD+, MDL, CBIO). Compensa emissões residuais.',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.15, // "Neutralização" mais rápida
            initialCost: 50000,
            remediationOpex: 30000, // Custo contínuo de créditos
            failureProbability: 0.006, // Risco de invalidação de créditos
        },
        tag: 'ghg_reduction',
    },
];

/**
 * Retorna decisões por categoria.
 * @param {string} tag
 * @returns {Array<Object>}
 */
export function getDecisionsByTag(tag: any) {
    return ENVIRONMENTAL_DECISIONS.filter((d) => d.tag === tag);
}

/**
 * Retorna todas as tags únicas.
 * @returns {Array<string>}
 */
export function getAllTags() {
    return [...new Set(ENVIRONMENTAL_DECISIONS.map((d) => d.tag))];
}

/**
 * Retorna uma decisão por ID (built-in ou custom).
 * @param {string} id
 * @returns {any}
 */
export function getDecision(id: any) {
    return getAllDecisions().find((/** @type {any} */ d) => d.id === id);
}

// ================================================================
// CUSTOM DECISIONS - CRUD (localStorage)
// ================================================================

const CUSTOM_DECISIONS_KEY = 'ecbyts:customDecisions';

function _loadCustomDecisions() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_DECISIONS_KEY) || '[]');
    } catch {
        return [];
    }
}

/**
 * Retorna apenas as decisões customizadas pelo usuário.
 * @returns {any[]}
 */
export function getCustomDecisions() {
    return _loadCustomDecisions();
}

/**
 * Retorna todas as decisões (built-in + custom).
 * @returns {any[]}
 */
export function getAllDecisions() {
    return [...ENVIRONMENTAL_DECISIONS, ..._loadCustomDecisions().map((/** @type {any} */ d: any) => ({
        ...d,
        _custom: true
    }))];
}

/**
 * Cria ou atualiza uma decisão customizada.
 * @param {any} decision - { id, name, tag, mods, description? }
 * @returns {boolean} - true se salvo com sucesso
 */
export function upsertCustomDecision(decision: any) {
    if (!decision?.id || !decision?.name) throw new Error('id e name são obrigatórios');
    if (ENVIRONMENTAL_DECISIONS.some((/** @type {any} */ d) => d.id === decision.id))
        throw new Error(`ID "${decision.id}" já existe como decisão built-in`);
    const all = _loadCustomDecisions();
    const idx = all.findIndex((/** @type {any} */ d: any) => d.id === decision.id);
    if (idx >= 0) all[idx] = decision;
    else all.push(decision);
    try {
        return safeSetItem(CUSTOM_DECISIONS_KEY, JSON.stringify(all));
    } catch {
        return false;
    }
}

/**
 * Remove uma decisão customizada pelo ID.
 * @param {string} id
 */
export function deleteCustomDecision(id: any) {
    const all = _loadCustomDecisions().filter((/** @type {any} */ d: any) => d.id !== id);
    safeSetItem(CUSTOM_DECISIONS_KEY, JSON.stringify(all));
}
