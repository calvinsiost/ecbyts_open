// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Scenario Definitions - Environmental Scenario Profiles
// ADR: ADR-025

/* ================================================================
   SCENARIO DEFINITIONS — Perfil de Cenários Ambientais
   ================================================================

   Cada cenário representa uma configuração típica de projeto
   ambiental para simulação Monte Carlo.

   Use cases:
   - Carregar configurações pré-definidas para simulação rápida
   - Comparar estratégias em contextos diferentes
   - Benchmarking entre tipos de projeto
   ================================================================ */

/**
 * Cenários ambientais pré-definidos.
 * @type {Object<string, Object>}
 */
import { safeSetItem } from '../../../utils/storage/storageMonitor.js';
export const SCENARIO_DEFINITIONS = {
    /**
     * Cenário: Pluma de BTEX em aquífero livre
     * Posto de gasolina, contaminação típica de hidrocarbonetos
     */
    btex_gas_station: {
        id: 'btex_gas_station',
        nameKey: 'scenarioBtexGasStation',
        name: 'Pluma BTEX — Posto de Gasolina',
        description: 'Contaminação por benzeno, tolueno, etilbenzeno e xilenos em aquífero livre',
        icon: 'fuel',
        color: '#ef4444',
        params: {
            initialConcentration: 5000, // µg/L (5x VI)
            threshold: 100, // VI de benzeno
            backgroundLevel: 0.5,
            initialRadius: 30, // metros
            naturalDecayRate: 0.008, // ~10% ao ano
            dispersionRate: 0.015,
            initialHealth: 60,
            months: 120,
            initialCost: 50000, // Investigação inicial
            monitoringCost: 3000, // mensal
            remediationOpex: 5000,
            failureProbability: 0.002,
            emergencyCost: 150000,
            budget: 800000,
        },
        tags: ['groundwater', 'hydrocarbons', 'light'],
    },

    /**
     * Cenário: Derramamento de óleo pesado
     * Óleo diesel/lubrificante, maior persistência
     */
    heavy_oil_spill: {
        id: 'heavy_oil_spill',
        nameKey: 'scenarioHeavyOilSpill',
        name: 'Derramamento Óleo Pesado',
        description: 'Derramamento de óleo diesel ou lubrificante com alta persistência',
        icon: 'droplet',
        color: '#78350f',
        params: {
            initialConcentration: 10000,
            threshold: 200,
            backgroundLevel: 1.0,
            initialRadius: 50,
            naturalDecayRate: 0.004, // Mais lento
            dispersionRate: 0.01,
            initialHealth: 45,
            months: 180, // 15 anos
            initialCost: 100000,
            monitoringCost: 4000,
            remediationOpex: 10000,
            failureProbability: 0.003,
            emergencyCost: 250000,
            budget: 1500000,
        },
        tags: ['groundwater', 'hydrocarbons', 'heavy'],
    },

    /**
     * Cenário: Solventes clorados (DNAPL)
     * TCE, PCE - mais difíceis de remediar
     */
    chlorinated_solvents: {
        id: 'chlorinated_solvents',
        nameKey: 'scenarioChlorinatedSolvents',
        name: 'Solventes Clorados (TCE/PCE)',
        description: 'Contaminação por solventes clorados, DNAPL de alta densidade',
        icon: 'flask',
        color: '#a855f7',
        params: {
            initialConcentration: 2000,
            threshold: 40, // VI de TCE
            backgroundLevel: 0.1,
            initialRadius: 25,
            naturalDecayRate: 0.003, // Muito lento naturalmente
            dispersionRate: 0.008,
            initialHealth: 35,
            months: 240, // 20 anos
            initialCost: 150000,
            monitoringCost: 5000,
            remediationOpex: 15000,
            failureProbability: 0.004,
            emergencyCost: 400000,
            budget: 2500000,
        },
        tags: ['groundwater', 'chlorinated', 'dnapl'],
    },

    /**
     * Cenário: Metais pesados em solo
     * Cromo, chumbo, cádmio
     */
    heavy_metals: {
        id: 'heavy_metals',
        nameKey: 'scenarioHeavyMetals',
        name: 'Metais Pesados no Solo',
        description: 'Contaminação por cromo hexavalente, chumbo e cádmio',
        icon: 'alert-triangle',
        color: '#eab308',
        params: {
            initialConcentration: 800, // mg/kg
            threshold: 60, // VI de Cr6+
            backgroundLevel: 5,
            initialRadius: 40,
            naturalDecayRate: 0.001, // Quase nenhum decaimento natural
            dispersionRate: 0.005,
            initialHealth: 40,
            months: 300, // 25 anos
            initialCost: 200000,
            monitoringCost: 3500,
            remediationOpex: 20000,
            failureProbability: 0.002,
            emergencyCost: 300000,
            budget: 3000000,
        },
        tags: ['soil', 'metals', 'immobile'],
    },

    /**
     * Cenário: Barragem de rejeitos (tailings)
     * Setor minerário, alto risco
     */
    tailings_dam: {
        id: 'tailings_dam',
        nameKey: 'scenarioTailingsDam',
        name: 'Barragem de Rejeitos',
        description: 'Área de influência de barragem de rejeitos mineiros',
        icon: 'mountain',
        color: '#64748b',
        params: {
            initialConcentration: 15000,
            threshold: 500,
            backgroundLevel: 10,
            initialRadius: 200,
            naturalDecayRate: 0.002,
            dispersionRate: 0.02,
            initialHealth: 30,
            months: 360, // 30 anos
            initialCost: 500000,
            monitoringCost: 8000,
            remediationOpex: 25000,
            failureProbability: 0.008, // Risco maior
            emergencyCost: 1000000,
            budget: 5000000,
        },
        tags: ['mining', 'tailings', 'high-risk'],
    },

    /**
     * Cenário: Área industrial abandonada (Brownfield)
     * Mista, múltiplas fontes
     */
    brownfield_site: {
        id: 'brownfield_site',
        nameKey: 'scenarioBrownfield',
        name: 'Área Industrial Abandonada',
        description: 'Brownfield com histórico industrial misto, múltiplos contaminantes',
        icon: 'factory',
        color: '#475569',
        params: {
            initialConcentration: 3000,
            threshold: 150,
            backgroundLevel: 2,
            initialRadius: 75,
            naturalDecayRate: 0.005,
            dispersionRate: 0.012,
            initialHealth: 50,
            months: 180,
            initialCost: 120000,
            monitoringCost: 4500,
            remediationOpex: 12000,
            failureProbability: 0.003,
            emergencyCost: 350000,
            budget: 1800000,
        },
        tags: ['mixed', 'brownfield', 'complex'],
    },

    /**
     * Cenário: Atenuação natural monitorada (MNA)
     * Baseline para comparação
     */
    monitored_natural_att: {
        id: 'monitored_natural_att',
        nameKey: 'scenarioMNA',
        name: 'Atenuação Natural Monitorada (MNA)',
        description: 'Cenário sem intervenção ativa, apenas monitoramento',
        icon: 'clock',
        color: '#22c55e',
        params: {
            initialConcentration: 2000,
            threshold: 100,
            backgroundLevel: 0.5,
            initialRadius: 40,
            naturalDecayRate: 0.012, // Biodeterioração ativa
            dispersionRate: 0.01,
            initialHealth: 65,
            months: 240,
            initialCost: 30000,
            monitoringCost: 2500,
            remediationOpex: 0, // Sem remediação ativa
            failureProbability: 0.001,
            emergencyCost: 100000,
            budget: 400000,
        },
        tags: ['mna', 'passive', 'low-cost'],
    },

    /**
     * Cenário: Emergência ambiental
     * Evento agudo, alto custo inicial
     */
    environmental_emergency: {
        id: 'environmental_emergency',
        nameKey: 'scenarioEmergency',
        name: 'Emergência Ambiental',
        description: 'Evento agudo requerindo resposta imediata e contencção',
        icon: 'alert-octagon',
        color: '#dc2626',
        params: {
            initialConcentration: 50000, // Muito alto
            threshold: 100,
            backgroundLevel: 0.5,
            initialRadius: 100,
            naturalDecayRate: 0.006,
            dispersionRate: 0.025,
            initialHealth: 15,
            months: 120,
            initialCost: 800000, // Alto custo de emergência
            monitoringCost: 6000,
            remediationOpex: 18000,
            failureProbability: 0.005,
            emergencyCost: 500000,
            budget: 2000000,
        },
        tags: ['emergency', 'acute', 'high-priority'],
    },
    // ================================================================
    // CENÁRIOS GHG CORPORATIVOS - Projeção de emissões
    // ================================================================

    /**
     * Cenário: GHG Indústria - Escopo 1 (combustão + processo)
     * Projeção de emissões diretas com incerteza IPCC Tier 2
     * Ref: GHG Protocol Corporate Standard, IPCC 2006 Guidelines
     */
    ghg_industrial_scope1: {
        id: 'ghg_industrial_scope1',
        nameKey: 'scenarioGhgIndustrialScope1',
        name: 'GHG Indústria — Escopo 1 (Combustão + Processo)',
        description: 'Emissões diretas: combustão fóssil e processos industriais. Tier 2 IPCC.',
        icon: 'factory',
        color: '#78716c',
        params: {
            initialConcentration: 50000, // 50k tCO2e/yr baseline
            threshold: 25000, // Meta: -50% (SBTi 1.5°C)
            backgroundLevel: 5000, // Piso: emissões de processo irredutíveis
            initialRadius: 1,
            naturalDecayRate: 0.003, // ~3.5%/yr descarbonização autônoma
            dispersionRate: 0.002, // ~2.4%/yr crescimento atividade
            initialHealth: 50,
            months: 120, // 10 anos
            initialCost: 200000, // Inventário + consultoria + verificação
            monitoringCost: 8000, // MRV mensal
            remediationOpex: 15000,
            failureProbability: 0.003, // Choque regulatório
            emergencyCost: 500000, // Multa/penalidade
            budget: 3000000,
            emissionFactorUncertainty: 0.15, // Tier 2 IPCC
            activityDataUncertainty: 0.1, // Medição direta
            gwpUncertainty: 0.05, // Baixo: mostly CO2
            carbonPrice: 50, // R$ 50/tCO2e (CBIO, mercado BR)
            carbonPriceGrowth: 0.005, // ~6%/yr
            carbonPriceVolatility: 0.15,
            discountRate: 0.005, // ~6%/yr (WACC referência BNDES)
            interimTarget: 35000, // -30% interim (2030)
            interimTargetMonth: 48, // 4 anos
        },
        tags: ['ghg', 'scope1', 'industry'],
    },

    /**
     * Cenário: GHG Energia - Escopo 2 (eletricidade)
     * Grid factor variável, PPA como mitigação principal
     * Ref: GHG Protocol Scope 2 Guidance, SIN dados
     */
    ghg_energy_scope2: {
        id: 'ghg_energy_scope2',
        nameKey: 'scenarioGhgEnergyScope2',
        name: 'GHG Energia — Escopo 2 (Eletricidade)',
        description: 'Emissões indiretas por consumo de eletricidade. Grid factor variável.',
        icon: 'zap',
        color: '#eab308',
        params: {
            initialConcentration: 15000, // 15k tCO2e/yr
            threshold: 3000, // Meta: -80% (PPA renovável)
            backgroundLevel: 500, // Grid residual + backup diesel
            initialRadius: 1,
            naturalDecayRate: 0.006, // Grid BR descarbonizando (~7%/yr)
            dispersionRate: 0.003, // Crescimento consumo energético
            initialHealth: 65,
            months: 120,
            initialCost: 100000, // Auditoria energética + PPA setup
            monitoringCost: 3000,
            remediationOpex: 25000, // PPA / certificados (I-REC)
            failureProbability: 0.002,
            emergencyCost: 200000,
            budget: 1500000,
            emissionFactorUncertainty: 0.25, // Grid factor varia com despacho
            activityDataUncertainty: 0.05, // kWh medido
            gwpUncertainty: 0.02, // Quase todo CO2
            carbonPrice: 50,
            carbonPriceGrowth: 0.005,
            carbonPriceVolatility: 0.15,
            discountRate: 0.005,
            interimTarget: 7500, // -50% interim
            interimTargetMonth: 48,
            implementationDelay: 6, // PPA leva ~6 meses
        },
        tags: ['ghg', 'scope2', 'energy'],
    },

    /**
     * Cenário: GHG Cadeia de Valor - Escopo 3
     * Alta incerteza, dados secundários, transformação lenta
     * Ref: GHG Protocol Scope 3 Standard, CDP
     */
    ghg_supply_chain_scope3: {
        id: 'ghg_supply_chain_scope3',
        nameKey: 'scenarioGhgSupplyChainScope3',
        name: 'GHG Cadeia de Valor — Escopo 3',
        description: 'Emissões da cadeia: transporte, matéria-prima, uso do produto. Alta incerteza.',
        icon: 'truck',
        color: '#6366f1',
        params: {
            initialConcentration: 200000, // 200k tCO2e/yr (tipicamente >> Scope 1+2)
            threshold: 100000, // Meta: -50%
            backgroundLevel: 30000, // Emissões estruturais da cadeia
            initialRadius: 1,
            naturalDecayRate: 0.002, // Lento: depende de terceiros
            dispersionRate: 0.004, // Crescimento da cadeia
            initialHealth: 40,
            months: 180, // 15 anos (transformação de cadeia é lenta)
            initialCost: 500000, // Mapeamento de cadeia + LCA
            monitoringCost: 12000, // CDP, questionários, verificação
            remediationOpex: 20000, // Engajamento de fornecedores
            failureProbability: 0.005, // Alta incerteza em cadeia
            emergencyCost: 800000, // Perda de cliente/regulação
            budget: 5000000,
            emissionFactorUncertainty: 0.4, // Tier 1, dados secundários
            activityDataUncertainty: 0.3, // Estimativas, proxies
            gwpUncertainty: 0.15, // Multi-gas (CH4+N2O na cadeia)
            carbonPrice: 50,
            carbonPriceGrowth: 0.008, // Pressão mais agressiva em cadeia
            carbonPriceVolatility: 0.2,
            discountRate: 0.005,
            interimTarget: 140000, // -30% interim
            interimTargetMonth: 60, // 5 anos
            implementationDelay: 12, // Engajamento de cadeia leva ~1 ano
        },
        tags: ['ghg', 'scope3', 'supply-chain'],
    },
};

/**
 * Lista todos os cenários disponíveis.
 * @returns {Array<Object>}
 */
export function getAllScenarios() {
    return Object.values(SCENARIO_DEFINITIONS);
}

/**
 * Retorna um cenário por ID.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getScenario(id: any) {
    return (SCENARIO_DEFINITIONS as Record<string, any>)[id];
}

/**
 * Retorna parâmetros de um cenário (pronto para uso no engine).
 * @param {string} id
 * @returns {Object|null}
 */
export function getScenarioParams(id: any) {
    const scenario = (SCENARIO_DEFINITIONS as Record<string, any>)[id];
    return scenario ? { ...scenario.params } : null;
}

/**
 * Filtra cenários por tag.
 * @param {string} tag
 * @returns {Array<Object>}
 */
export function getScenariosByTag(tag: any) {
    return Object.values(SCENARIO_DEFINITIONS).filter((/** @type {any} */ s) => s.tags.includes(tag));
}

// ----------------------------------------------------------------
// CUSTOM SCENARIO MANAGER
// ----------------------------------------------------------------

const CUSTOM_SCENARIOS_KEY = 'ecbyts:customScenarios';
/** @type {any[] | null} */
let _customScenariosCache: any = null;

/** @returns {any[]} */
function _loadCustomScenarios() {
    if (_customScenariosCache !== null) return _customScenariosCache;
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_SCENARIOS_KEY) : null;
        _customScenariosCache = raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.debug('[scenarioDefs] loadCustomScenarios-parse:', (e as any)?.message || e);
        _customScenariosCache = [];
    }
    return /** @type {any[]} */ (_customScenariosCache);
}

/** @param {any[]} list */
function _saveCustomScenarios(list: any) {
    _customScenariosCache = list;
    try {
        if (typeof localStorage !== 'undefined') {
            return safeSetItem(CUSTOM_SCENARIOS_KEY, JSON.stringify(list));
        }
        return false;
    } catch (e) {
        console.debug('[scenarioDefs] saveCustomScenarios-quota:', (e as any)?.message || e);
        return false; // quota exceeded ou indisponível
    }
}

/**
 * Retorna todos os cenários customizados pelo usuário.
 * @returns {Array<Object>}
 */
export function getCustomScenarios() {
    return [..._loadCustomScenarios()];
}

/**
 * Retorna todos os perfis de cenário (builtin + custom).
 * @returns {Array<Object>}
 */
export function getAllScenarioProfiles() {
    const builtins = getAllScenarios().map((/** @type {any} */ s) => ({ ...s, _custom: false }));
    const customs = _loadCustomScenarios().map((/** @type {any} */ s: any) => ({
        ...s,
        _custom: true
    }));
    return [...builtins, ...customs];
}

/**
 * Cria ou atualiza um cenário customizado.
 * @param {any} profile - { id, name, description?, color?, tags?, params }
 * @returns {boolean} - true se salvo com sucesso (false = localStorage indisponível)
 * @throws {Error} se ID inválido ou colide com builtin
 */
export function upsertCustomScenario(profile: any) {
    if (!profile?.id || !/^[a-z0-9_]+$/.test(profile.id)) {
        throw new Error(`ID inválido: "${profile?.id}". Use letras minúsculas, números e underscores.`);
    }
    if ((SCENARIO_DEFINITIONS as Record<string, any>)[profile.id]) {
        throw new Error(`ID "${profile.id}" já é utilizado por um cenário builtin.`);
    }

    const list = _loadCustomScenarios();
    const idx = list.findIndex((/** @type {any} */ s: any) => s.id === profile.id);
    const entry = { ...profile, _custom: true };

    if (idx >= 0) {
        list[idx] = entry;
    } else {
        list.push(entry);
    }

    const saved = _saveCustomScenarios(list);

    try {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('customScenarioChanged', { detail: profile }));
        }
    } catch (e) {
        console.debug('[scenarioDefs] dispatchCustomScenarioChanged-upsert:', (e as any)?.message || e);
        // ambiente sem DOM (testes Node)
    }

    return saved;
}

/**
 * Remove um cenário customizado por ID.
 * @param {string} id
 */
export function deleteCustomScenario(id: any) {
    const list = _loadCustomScenarios();
    const newList = list.filter((/** @type {any} */ s: any) => s.id !== id);
    _saveCustomScenarios(newList);
    try {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('customScenarioChanged', { detail: { id, deleted: true } }));
        }
    } catch (e) {
        console.debug('[scenarioDefs] dispatchCustomScenarioChanged-delete:', (e as any)?.message || e);
        // ambiente sem DOM
    }
}

/**
 * Duplica um cenário (builtin ou custom) como novo cenário customizado.
 * @param {string} id - ID do cenário origem
 * @returns {Object} - novo perfil salvo
 * @throws {Error} se cenário não encontrado
 */
export function duplicateScenario(id: any) {
    const all = getAllScenarioProfiles();
    const source = /** @type {any} */ (all.find((/** @type {any} */ s) => s.id === id));
    if (!source) throw new Error(`Cenário não encontrado: "${id}"`);

    // Suffix com timestamp para evitar colisão em chamadas múltiplas
    const baseId = id.replace(/_\d{6,}$/, ''); // remove sufixo de timestamp anterior
    const newId = `${baseId}_${Date.now().toString().slice(-6)}`.replace(/[^a-z0-9_]/g, '_');

    const copy = {
        ...source,
        id: newId,
        name: `${source.name} (cópia)`,
        _custom: true,
    };
    upsertCustomScenario(copy);
    return copy;
}

// ================================================================
// CLIMATE OVERLAYS - Modificadores climáticos independentes de cenário
// ================================================================
//
// Um overlay climático NÃO é um cenário standalone - é um modificador
// aplicado sobre QUALQUER cenário base via resolveScenarioParams().
//
// Estrutura:
//   adders:      somados ao valor base (params que o base não tem: ex. climateStress)
//   multipliers: multiplicam o valor existente no base (ex. dispersionRate × 1.5)
//
// Ref: IPCC AR6 WG1 + WGII - climate impacts on contaminated site management

/**
 * Overlays climáticos pré-definidos.
 * @type {Array<Object>}
 */
export const CLIMATE_OVERLAYS = [
    /**
     * Overlay: Elevação do nível do mar
     * Zona costeira, lençol freático em ascensão progressiva.
     * Ref: IPCC AR6 WG1 - sea level rise 0.3–1.0 m até 2100
     */
    {
        id: 'co_sea_level_rise',
        name: 'Elevação do Nível do Mar',
        description: 'Zona costeira: lençol em ascensão remobiliza contaminantes e aumenta dispersão lateral',
        icon: 'waves',
        color: '#0ea5e9',
        tags: ['climate', 'coastal', 'sea-level'],
        adders: {
            climateStress: 0.15, // estresse moderado, progressivo
            climateTrend: 0.002, // piora gradual (ascensão contínua)
            extremeEventFreq: 0.3, // +30% eventos extremos costeiros
        },
        multipliers: {
            dispersionRate: 1.4, // maior mobilidade lateral
            failureProbability: 1.3, // maior risco de falha de infra
        },
    },

    /**
     * Overlay: Precipitação extrema / enchentes
     * Alta sazonalidade e picos de dispersão no período chuvoso (verão BR).
     * Ref: IPCC AR6 - precipitação extrema +7%/grau de aquecimento
     */
    {
        id: 'co_extreme_precipitation',
        name: 'Precipitação Extrema / Enchentes',
        description: 'Chuva intensa mobiliza contaminantes por erosão e escoamento; alta sazonalidade seca/chuvosa',
        icon: 'cloud-rain',
        color: '#3b82f6',
        tags: ['climate', 'flooding', 'precipitation'],
        adders: {
            climateStress: 0.25, // estresse alto
            seasonalAmplitude: 0.4, // forte sazonalidade seca/chuvosa (hemisfério sul)
            climateTrend: 0.003, // intensificação progressiva
            extremeEventFreq: 0.8, // soma ao base 1.0 → 1.8× eventos extremos
        },
        multipliers: {
            dispersionRate: 1.5, // dispersão acelerada por transporte superficial
            failureProbability: 1.8, // alto risco de colapso de infra
        },
    },

    /**
     * Overlay: Seca / estresse hídrico
     * Evapoconcentração, biodegradação inibida, gradiente hidráulico reduzido.
     * Ref: IPCC AR6 WGII - secas prolongadas inibem atenuação natural
     */
    {
        id: 'co_drought_stress',
        name: 'Seca / Estresse Hídrico',
        description: 'Seca prolongada concentra contaminantes por evapoconcentração e inibe biodegradação',
        icon: 'sun',
        color: '#d97706',
        tags: ['climate', 'drought', 'water-stress'],
        adders: {
            climateStress: 0.2, // estresse moderado-alto
            climateTrend: 0.0025, // piora progressiva
            extremeEventFreq: 0.2, // mais eventos de seca extrema
        },
        multipliers: {
            naturalDecayRate: 0.6, // seca reduz biodegradação em 40%
            dispersionRate: 0.7, // gradiente hidráulico reduzido
            failureProbability: 1.2, // risco moderadamente aumentado
        },
    },

    /**
     * Overlay: Aumento de temperatura
     * Efeito Q10 na cinética microbiana: biodegradação inicialmente mais rápida,
     * depois inibida por desidratação e volatilização de co-solventes.
     * Ref: IPCC AR6 - Q10 effect; USEPA 2021 - temperature effects on biodegradation
     */
    {
        id: 'co_temperature_increase',
        name: 'Aumento de Temperatura',
        description: 'Aquecimento altera cinética de biodegradação e volatilização; efeito Q10 e sazonalidade ampliada',
        icon: 'thermometer',
        color: '#ef4444',
        tags: ['climate', 'temperature', 'biodegradation'],
        adders: {
            climateStress: 0.12, // estresse moderado
            seasonalAmplitude: 0.15, // estações mais extremas
            climateTrend: 0.0015, // aquecimento progressivo moderado
            extremeEventFreq: 0.4, // mais ondas de calor extremas
        },
        multipliers: {
            naturalDecayRate: 1.2, // Q10: +20% biodegradação inicial (mas instável)
            failureProbability: 1.4, // volatilização e dano a selos/membranas
        },
    },

    /**
     * Overlay: Eventos climáticos compostos - worst-case RCP 8.5
     * Seca seguida de enchente + onda de calor: impactos desproporcionalmente piores.
     * Ref: IPCC AR6 WGII - compound events; Zscheischler et al. 2020
     */
    {
        id: 'co_compound_climate',
        name: 'Eventos Climáticos Compostos (RCP 8.5)',
        description: 'Múltiplos estressores simultâneos: seca seguida de enchente + calor extremo — cenário pessimista',
        icon: 'zap',
        color: '#dc2626',
        tags: ['climate', 'compound', 'high-risk'],
        adders: {
            climateStress: 0.35, // severo
            seasonalAmplitude: 0.5, // oscilação extrema entre estações
            climateTrend: 0.004, // piora agressiva (RCP 8.5: ~4°C até 2100)
            extremeEventFreq: 1.5, // soma ao base 1.0 → 2.5× eventos extremos
        },
        multipliers: {
            dispersionRate: 2.0, // dispersão massiva por enchentes compostas
            failureProbability: 2.5, // risco de colapso muito elevado
            naturalDecayRate: 0.8, // efeito líquido negativo
        },
    },
];

// ----------------------------------------------------------------
// OVERLAY ACCESSORS
// ----------------------------------------------------------------

/**
 * Retorna todos os overlays (builtin + custom).
 * @returns {Array<Object>}
 */
export function getAllOverlays() {
    return [...CLIMATE_OVERLAYS, ..._loadCustomOverlays()];
}

/**
 * Retorna um overlay por ID.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getOverlay(id: any) {
    if (!id) return undefined;
    return getAllOverlays().find((/** @type {any} */ o) => o.id === id);
}

// ----------------------------------------------------------------
// RESOLVE - Merge cenário base + overlay
// ----------------------------------------------------------------

/**
 * Retorna parâmetros merged de cenário base + overlay climático.
 * Sem overlay: retorna cópia dos params base (backward-compatible).
 *
 * Regras de merge:
 *   overlay.adders      → param = (base ?? 0) + adder
 *   overlay.multipliers → param = base * multiplier (se base != null)
 *
 * @param {string} baseId - ID do cenário base
 * @param {string|null} [overlayId=null] - ID do overlay climático
 * @returns {Object|null}
 */
export function resolveScenarioParams(baseId: any, overlayId = null) {
    const base = getScenarioParams(baseId);
    if (!base) return null;
    if (!overlayId) return base;

    const overlay = getOverlay(overlayId);
    if (!overlay) return base;

    /** @type {Record<string, any>} */
    const merged = { ...base };
    const ov = /** @type {any} */ (overlay);

    // Adders: soma ao valor base (params climáticos geralmente ausentes no base)
    for (const [k, v] of (Object.entries(ov.adders || {}) as [string, number][])) {
        merged[k] = (merged[k] ?? 0) + v;
    }

    // Multipliers: multiplica o valor que já existe no base
    for (const [k, v] of (Object.entries(ov.multipliers || {}) as [string, number][])) {
        if (merged[k] != null) merged[k] *= v;
    }

    return merged;
}

// ----------------------------------------------------------------
// CUSTOM OVERLAYS MANAGER
// ----------------------------------------------------------------

const CUSTOM_OVERLAYS_KEY = 'ecbyts:customOverlays';
/** @type {any[] | null} */
let _customOverlaysCache: any = null;

/** @returns {any[]} */
function _loadCustomOverlays() {
    if (_customOverlaysCache !== null) return _customOverlaysCache;
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_OVERLAYS_KEY) : null;
        _customOverlaysCache = raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.debug('[scenarioDefs] loadCustomOverlays-parse:', (e as any)?.message || e);
        _customOverlaysCache = [];
    }
    return /** @type {any[]} */ (_customOverlaysCache);
}

/** @param {any[]} list */
function _saveCustomOverlays(list: any) {
    _customOverlaysCache = list;
    try {
        if (typeof localStorage !== 'undefined') {
            return safeSetItem(CUSTOM_OVERLAYS_KEY, JSON.stringify(list));
        }
        return false;
    } catch (e) {
        console.debug('[scenarioDefs] saveCustomOverlays-quota:', (e as any)?.message || e);
        return false;
    }
}

/**
 * Retorna todos os overlays customizados.
 * @returns {Array<Object>}
 */
export function getCustomOverlays() {
    return [..._loadCustomOverlays()];
}

/**
 * Cria ou atualiza um overlay customizado.
 * @param {any} profile - { id, name, description?, color?, tags?, adders?, multipliers? }
 * @returns {boolean}
 * @throws {Error} se ID inválido ou colide com builtin
 */
export function upsertCustomOverlay(profile: any) {
    if (!profile?.id || !/^[a-z0-9_]+$/.test(profile.id)) {
        throw new Error(`ID inválido: "${profile?.id}". Use letras minúsculas, números e underscores.`);
    }
    if (CLIMATE_OVERLAYS.find((/** @type {any} */ o) => o.id === profile.id)) {
        throw new Error(`ID "${profile.id}" já é utilizado por um overlay builtin.`);
    }

    const list = _loadCustomOverlays();
    const idx = list.findIndex((/** @type {any} */ o: any) => o.id === profile.id);
    const entry = { ...profile, _custom: true };

    if (idx >= 0) {
        list[idx] = entry;
    } else {
        list.push(entry);
    }

    const saved = _saveCustomOverlays(list);

    try {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('customOverlayChanged', { detail: profile }));
        }
    } catch (e) {
        console.debug('[scenarioDefs] dispatchCustomOverlayChanged-upsert:', (e as any)?.message || e);
        // ambiente sem DOM (testes Node)
    }

    return saved;
}

/**
 * Remove um overlay customizado por ID.
 * @param {string} id
 */
export function deleteCustomOverlay(id: any) {
    const list = _loadCustomOverlays();
    _saveCustomOverlays(list.filter((/** @type {any} */ o: any) => o.id !== id));
    try {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('customOverlayChanged', { detail: { id, deleted: true } }));
        }
    } catch (e) {
        console.debug('[scenarioDefs] dispatchCustomOverlayChanged-delete:', (e as any)?.message || e);
        // ambiente sem DOM
    }
}
