// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Environmental Ecosystem Accounting Schema - ECBT
 *
 * Pure-logic factories and validators for ecosystem services natural capital
 * accounting. Esquema canônico para ativos ecossistêmicos, fluxos de serviços,
 * custos de restauração e balanço de capital natural líquido.
 *
 * Domain references (used as factual/normative basis only - no code copied):
 * - UN SEEA-EA 2021 (System of Environmental-Economic Accounting - Ecosystem Accounting)
 * - Costanza et al. 1997 / 2014 - Global ecosystem services valuation
 * - TEEB 2010 - The Economics of Ecosystems and Biodiversity
 * - CBD - Convention on Biological Diversity
 * - Embrapa / IBGE PNCS - Política Nacional de Contabilidade Socioambiental (Brasil)
 * - ABNT NBR ISO 14001 - Environmental management systems
 *
 * Constraints:
 * - Zero DOM, zero browser APIs, zero external imports
 * - All enums frozen via Object.freeze
 * - All record factories return Object.freeze
 */

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export const ECOSYSTEM_TYPE = Object.freeze({
    TROPICAL_FOREST: 'TROPICAL_FOREST',
    SAVANNA_CERRADO: 'SAVANNA_CERRADO',
    MANGROVE: 'MANGROVE',
    WETLAND: 'WETLAND',
    CORAL_REEF: 'CORAL_REEF',
    PASTURE: 'PASTURE',
    AGROFORESTRY: 'AGROFORESTRY',
    URBAN_GREEN: 'URBAN_GREEN',
    RIVER: 'RIVER',
    LAKE: 'LAKE',
});

export const SERVICE_FLOW_TYPE = Object.freeze({
    PROVISIONING: 'PROVISIONING',
    REGULATING: 'REGULATING',
    CULTURAL: 'CULTURAL',
    SUPPORTING: 'SUPPORTING',
});

export const CONDITION_CLASS = Object.freeze({
    PRISTINE: 'PRISTINE',
    GOOD: 'GOOD',
    MODERATE: 'MODERATE',
    DEGRADED: 'DEGRADED',
    CRITICAL: 'CRITICAL',
});

export const ACCOUNTING_PERIOD = Object.freeze({
    ANNUAL: 'ANNUAL',
    BIENNIAL: 'BIENNIAL',
    FIVE_YEAR: 'FIVE_YEAR',
});

export const ECO_ACCOUNT_ERROR = Object.freeze({
    INVALID_ECOSYSTEM: 'INVALID_ECOSYSTEM',
    INVALID_AREA: 'INVALID_AREA',
    INVALID_VALUE: 'INVALID_VALUE',
});

// -----------------------------------------------------------------------------
// Type definitions
// -----------------------------------------------------------------------------

type EcosystemTypeKey = keyof typeof ECOSYSTEM_TYPE;
type ConditionClassKey = keyof typeof CONDITION_CLASS;
type AccountingPeriodKey = keyof typeof ACCOUNTING_PERIOD;
type ServiceFlowTypeKey = keyof typeof SERVICE_FLOW_TYPE;

interface EcosystemAsset {
    assetId: string;
    type: EcosystemTypeKey;
    areaHa: number;
    condition: ConditionClassKey;
    period: AccountingPeriodKey;
    baseValueUSD: number;
}

interface EcosystemAccountSummary {
    totalAssets: number;
    totalAreaHa: number;
    totalBaseValueUSD: number;
    totalRestorationCostUSD: number;
    netEcosystemValueUSD: number;
    typeBreakdown: Readonly<{ [key: string]: number }>;
    conditionBreakdown: Readonly<{ [key: string]: number }>;
    criticalAssetsCount: number;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Ecosystem service value per hectare per year (USD/ha/yr).
 * @type {Readonly<Record<EcosystemTypeKey, number>>}
 */
export const SERVICE_VALUE_USD_HA_YR = Object.freeze({
    TROPICAL_FOREST: 5800,
    SAVANNA_CERRADO: 1300,
    MANGROVE: 9500,
    WETLAND: 4900,
    CORAL_REEF: 12000,
    PASTURE: 320,
    AGROFORESTRY: 2100,
    URBAN_GREEN: 1200,
    RIVER: 4200,
    LAKE: 3100,
});

/**
 * Service flow fractions of total ecosystem value. Soma = 1.0.
 * @type {Readonly<Record<ServiceFlowTypeKey, number>>}
 */
export const SERVICE_FRACTION = Object.freeze({
    PROVISIONING: 0.25,
    REGULATING: 0.4,
    CULTURAL: 0.2,
    SUPPORTING: 0.15,
});

/**
 * Condition multiplier applied to base service value.
 * @type {Readonly<Record<ConditionClassKey, number>>}
 */
export const CONDITION_VALUE_FACTOR = Object.freeze({
    PRISTINE: 1.0,
    GOOD: 0.8,
    MODERATE: 0.55,
    DEGRADED: 0.3,
    CRITICAL: 0.1,
});

/**
 * Restoration cost per hectare (USD/ha) for a fully-degraded baseline.
 * @type {Readonly<Record<EcosystemTypeKey, number>>}
 */
export const RESTORATION_COST_PER_HA_USD = Object.freeze({
    TROPICAL_FOREST: 2500,
    SAVANNA_CERRADO: 1200,
    MANGROVE: 3500,
    WETLAND: 1800,
    CORAL_REEF: 12000,
    PASTURE: 200,
    AGROFORESTRY: 1500,
    URBAN_GREEN: 800,
    RIVER: 1000,
    LAKE: 1500,
});

/** Identidade do módulo. */
export const ECOSYSTEM_ACCOUNT_META = Object.freeze({
    spec: 'ECOSYSTEM_ACCOUNTING_SCHEMA_001',
    deliveredAt: '2026-05-02',
    framework: 'SEEA-EA-2021/Costanza-2014/TEEB',
    types: Object.values(ECOSYSTEM_TYPE),
});

/** Erro tipado lançado pelo schema. */
export class EcosystemAccountError extends Error {
    code: string;
    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message || code);
        this.name = 'EcosystemAccountError';
        this.code = code;
    }
}

// -----------------------------------------------------------------------------
// Internal validators
// -----------------------------------------------------------------------------

/**
 * @param {unknown} v
 * @returns {v is string}
 */
function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/**
 * @param {unknown} v
 * @returns {v is number}
 */
function isPositiveFinite(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * @param {string} key
 * @returns {key is EcosystemTypeKey}
 */
function isEcosystemType(key: string): key is EcosystemTypeKey {
    return Object.prototype.hasOwnProperty.call(ECOSYSTEM_TYPE, key);
}

/**
 * @param {string} key
 * @returns {key is ConditionClassKey}
 */
function isConditionClass(key: string): key is ConditionClassKey {
    return Object.prototype.hasOwnProperty.call(CONDITION_CLASS, key);
}

/**
 * @param {string} key
 * @returns {key is AccountingPeriodKey}
 */
function isAccountingPeriod(key: string): key is AccountingPeriodKey {
    return Object.prototype.hasOwnProperty.call(ACCOUNTING_PERIOD, key);
}

/**
 * @param {string} key
 * @returns {key is ServiceFlowTypeKey}
 */
function isServiceFlowType(key: string): key is ServiceFlowTypeKey {
    return Object.prototype.hasOwnProperty.call(SERVICE_FLOW_TYPE, key);
}

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

/**
 * Cria registro frozen de ativo ecossistêmico com valor base computado.
 * @param {Object} input
 * @param {string} input.assetId
 * @param {string} input.type chave de ECOSYSTEM_TYPE
 * @param {number} input.areaHa área em hectares (>0)
 * @param {string} input.condition chave de CONDITION_CLASS
 * @param {string} [input.period] chave de ACCOUNTING_PERIOD (default ANNUAL)
 * @returns {Readonly<EcosystemAsset>}
 */
export function createEcosystemAsset({ assetId, type, areaHa, condition, period }: { assetId?: string; type?: string; areaHa?: number; condition?: string; period?: string }) {
    if (!isNonEmptyString(assetId)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_ECOSYSTEM, 'assetId obrigatório');
    }
    if (typeof type !== 'string' || !isEcosystemType(type)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_ECOSYSTEM, `type inválido: ${type}`);
    }
    if (!isPositiveFinite(areaHa)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_AREA, 'areaHa deve ser número finito > 0');
    }
    if (typeof condition !== 'string' || !isConditionClass(condition)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_ECOSYSTEM, `condition inválida: ${condition}`);
    }
    const usePeriodRaw = period || ACCOUNTING_PERIOD.ANNUAL;
    if (typeof usePeriodRaw !== 'string' || !isAccountingPeriod(usePeriodRaw)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_ECOSYSTEM, `period inválido: ${period}`);
    }
        const usePeriod: AccountingPeriodKey= usePeriodRaw;

    const baseValueUSD = SERVICE_VALUE_USD_HA_YR[type] * areaHa * CONDITION_VALUE_FACTOR[condition];

    return Object.freeze({
        assetId,
        type,
        areaHa,
        condition,
        period: usePeriod,
        baseValueUSD,
    });
}

/**
 * Calcula o valor monetário de um fluxo de serviço para o ativo.
 * @param {Readonly<EcosystemAsset>} asset
 * @param {string} flowType chave de SERVICE_FLOW_TYPE
 * @returns {number}
 */
export function computeServiceFlowValue(asset: Readonly<EcosystemAsset>, flowType: string): number {
    if (!asset || typeof asset.baseValueUSD !== 'number') {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_VALUE, 'asset inválido');
    }
    if (typeof flowType !== 'string' || !isServiceFlowType(flowType)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_VALUE, `flowType inválido: ${flowType}`);
    }
    return asset.baseValueUSD * SERVICE_FRACTION[flowType];
}

/**
 * Custo de restauração para devolver o ativo à condição PRISTINE.
 * @param {Readonly<EcosystemAsset>} asset
 * @returns {number}
 */
export function computeRestorationCost(asset: Readonly<EcosystemAsset>): number {
    if (!asset || !isPositiveFinite(asset.areaHa)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_VALUE, 'asset inválido para restauração');
    }
    if (typeof asset.condition !== 'string' || !isConditionClass(asset.condition)) {
        throw new EcosystemAccountError(
            ECO_ACCOUNT_ERROR.INVALID_ECOSYSTEM,
            `condition inválida em asset: ${asset.condition}`,
        );
    }
    if (typeof asset.type !== 'string' || !isEcosystemType(asset.type)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_ECOSYSTEM, `type inválido em asset: ${asset.type}`);
    }
    const factor = CONDITION_VALUE_FACTOR[asset.condition];
    const perHa = RESTORATION_COST_PER_HA_USD[asset.type];
    return asset.areaHa * perHa * (1 - factor);
}

/**
 * Valor líquido = baseValueUSD - custo de restauração.
 * @param {Readonly<EcosystemAsset>} asset
 * @returns {number}
 */
export function computeNetEcosystemValue(asset: Readonly<EcosystemAsset>): number {
    return asset.baseValueUSD - computeRestorationCost(asset);
}

/**
 * Avalia trajetória de condição entre dois pontos no tempo.
 * @param {string} currentCondition
 * @param {string} priorCondition
 * @returns {'IMPROVING'|'STABLE'|'DEGRADING'}
 */
export function assessConditionTrajectory(currentCondition: string, priorCondition: string): 'IMPROVING'|'STABLE'|'DEGRADING' {
    if (typeof currentCondition !== 'string' || !isConditionClass(currentCondition)) {
        throw new EcosystemAccountError(
            ECO_ACCOUNT_ERROR.INVALID_ECOSYSTEM,
            `currentCondition inválida: ${currentCondition}`,
        );
    }
    if (typeof priorCondition !== 'string' || !isConditionClass(priorCondition)) {
        throw new EcosystemAccountError(
            ECO_ACCOUNT_ERROR.INVALID_ECOSYSTEM,
            `priorCondition inválida: ${priorCondition}`,
        );
    }
    const current = CONDITION_VALUE_FACTOR[currentCondition];
    const prior = CONDITION_VALUE_FACTOR[priorCondition];
    if (current > prior) return 'IMPROVING';
    if (current < prior) return 'DEGRADING';
    return 'STABLE';
}

/**
 * Constrói relatório agregado frozen para portfólio de ativos ecossistêmicos.
 * @param {Array<Readonly<EcosystemAsset>>} assets
 * @returns {Readonly<EcosystemAccountSummary>}
 */
export function buildEcosystemAccount(assets: Array<Readonly<EcosystemAsset>>): Readonly<EcosystemAccountSummary> {
    if (!Array.isArray(assets)) {
        throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_VALUE, 'assets deve ser array');
    }
    let totalAreaHa = 0;
    let totalBaseValueUSD = 0;
    let totalRestorationCostUSD = 0;
    let netEcosystemValueUSD = 0;
    let criticalAssetsCount = 0;
        const typeBreakdown: {[key: string]: number}= {};
        const conditionBreakdown: {[key: string]: number}= {};

    for (const asset of assets) {
        if (!asset || typeof asset.baseValueUSD !== 'number') {
            throw new EcosystemAccountError(ECO_ACCOUNT_ERROR.INVALID_VALUE, 'asset inválido em portfólio');
        }
        totalAreaHa += asset.areaHa;
        totalBaseValueUSD += asset.baseValueUSD;
        const restCost = computeRestorationCost(asset);
        totalRestorationCostUSD += restCost;
        netEcosystemValueUSD += asset.baseValueUSD - restCost;

        if (asset.condition === CONDITION_CLASS.CRITICAL) criticalAssetsCount += 1;

        const typeKey = String(asset.type);
        typeBreakdown[typeKey] = (typeBreakdown[typeKey] || 0) + asset.areaHa;
        const condKey = String(asset.condition);
        conditionBreakdown[condKey] = (conditionBreakdown[condKey] || 0) + 1;
    }

    return Object.freeze({
        totalAssets: assets.length,
        totalAreaHa,
        totalBaseValueUSD,
        totalRestorationCostUSD,
        netEcosystemValueUSD,
        typeBreakdown: Object.freeze(typeBreakdown),
        conditionBreakdown: Object.freeze(conditionBreakdown),
        criticalAssetsCount,
    });
}
