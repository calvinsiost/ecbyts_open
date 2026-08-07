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
 * Environmental Regulatory Fine Schema - Schema de multas e sanções
 * administrativas por infrações ambientais.
 *
 * Modelo cobre o ciclo de vida da multa: lavratura, agravamento, defesa,
 * conversão em serviços ambientais, pagamento e cobrança executiva, conforme
 * o ordenamento brasileiro de Crimes Ambientais e regulamentação de
 * sanções administrativas.
 *
 * Referências regulatórias:
 *  - Brasil - Lei nº 9.605/1998 (Crimes Ambientais), arts. 70-76 (sanções
 *    administrativas) e arts. 29-69 (crimes ambientais).
 *  - Brasil - Decreto nº 6.514/2008 (regulamenta sanções administrativas),
 *    art. 9 (espécies de sanções), art. 11 (multa simples), art. 71
 *    (atenuantes/agravantes), art. 143 (conversão em serviços de
 *    preservação, melhoria e recuperação da qualidade do meio ambiente).
 *  - CONAMA - Resolução 237/1997 (licenciamento ambiental).
 *  - IBAMA - IN nº 10/2012, NUP de auto de infração (procedimento).
 *  - Decreto-Lei nº 9.760/1946 (cobrança da Dívida Ativa, Fazenda Pública).
 *  - Lei nº 6.830/1980 (execução fiscal).
 *
 * Valores BASE_FINE_BRL são referenciais do Decreto 6.514/2008 e devem
 * ser atualizados conforme atualização monetária e portarias específicas
 * por órgão (IBAMA, CETESB, SEMAD, ANA, ANP, ANM).
 *
 * Zero dependências DOM/IDB/Three.js/fetch. Pure-logic.
 * @module environmentalRegulatoryFineSchema
 */

/** Categorias canônicas de infração (Lei 9.605/1998 + Decreto 6.514/2008). */
export const INFRACTION_CATEGORY = Object.freeze({
    AGAINST_FAUNA: 'AGAINST_FAUNA',
    AGAINST_FLORA: 'AGAINST_FLORA',
    AGAINST_WATER: 'AGAINST_WATER',
    ATMOSPHERIC_POLLUTION: 'ATMOSPHERIC_POLLUTION',
    SOIL_CONTAMINATION: 'SOIL_CONTAMINATION',
    ADMINISTRATIVE: 'ADMINISTRATIVE',
    AGAINST_URBAN_PLANNING: 'AGAINST_URBAN_PLANNING',
    AGAINST_PROTECTED_AREA: 'AGAINST_PROTECTED_AREA',
});

/** Tipos de sanção (Decreto 6.514/2008 art. 9). */
export const SANCTION_TYPE = Object.freeze({
    WARNING: 'WARNING',
    FINE: 'FINE',
    ASSET_SEIZURE: 'ASSET_SEIZURE',
    ACTIVITY_SUSPENSION: 'ACTIVITY_SUSPENSION',
    ESTABLISHMENT_CLOSURE: 'ESTABLISHMENT_CLOSURE',
    RIGHTS_LOSS: 'RIGHTS_LOSS',
    RESTRICTIVE_OBLIGATION: 'RESTRICTIVE_OBLIGATION',
});

/** Status do ciclo de pagamento da multa. */
export const FINE_PAYMENT_STATUS = Object.freeze({
    PENDING: 'PENDING',
    PAID: 'PAID',
    IN_DEFENSE: 'IN_DEFENSE',
    REDUCED_BY_CONVERSION: 'REDUCED_BY_CONVERSION',
    ENFORCED: 'ENFORCED',
    WAIVED: 'WAIVED',
});

/** Agravantes canônicos (Decreto 6.514/2008 art. 11 §3 + jurisprudência). */
export const AGGRAVATING_FACTOR = Object.freeze({
    REPEAT_OFFENSE: 'REPEAT_OFFENSE',
    BAD_FAITH: 'BAD_FAITH',
    IRREVERSIBLE_DAMAGE: 'IRREVERSIBLE_DAMAGE',
    AGAINST_VULNERABLE_SPECIES: 'AGAINST_VULNERABLE_SPECIES',
    IN_PROTECTED_AREA: 'IN_PROTECTED_AREA',
});

/** Códigos de erro emitidos pelo schema. */
export const FINE_ERROR = Object.freeze({
    INVALID_INFRACTION: 'INVALID_INFRACTION',
    INVALID_AMOUNT: 'INVALID_AMOUNT',
    INVALID_STATUS: 'INVALID_STATUS',
});

/** Valor base por categoria em BRL (Decreto 6.514/2008, valores referenciais). */
export const BASE_FINE_BRL = Object.freeze({
    AGAINST_FAUNA: 5000,
    AGAINST_FLORA: 5000,
    AGAINST_WATER: 10000,
    ATMOSPHERIC_POLLUTION: 10000,
    SOIL_CONTAMINATION: 15000,
    ADMINISTRATIVE: 1500,
    AGAINST_URBAN_PLANNING: 8000,
    AGAINST_PROTECTED_AREA: 25000,
});

/** Multiplicadores de agravantes (multiplicativos, capeados por MAX). */
export const AGGRAVATING_MULTIPLIER = Object.freeze({
    REPEAT_OFFENSE: 2.0,
    BAD_FAITH: 1.5,
    IRREVERSIBLE_DAMAGE: 3.0,
    AGAINST_VULNERABLE_SPECIES: 2.5,
    IN_PROTECTED_AREA: 2.0,
});

/** Cap absoluto do multiplicador agregado de agravantes. */
export const MAX_AGGRAVATED_MULTIPLIER = 10.0;

/** Desconto na conversão em serviços ambientais (Decreto 6.514 art. 143). */
export const CONVERSION_DISCOUNT = 0.4;

/** Desconto por pagamento voluntário em até 30 dias. */
export const VOLUNTARY_PAYMENT_DISCOUNT = 0.3;

/** Penalidade adicional por hectare de área impactada (BRL/ha). */
export const AREA_PENALTY_BRL_PER_HA = 100;

/** Identidade do módulo. */
export const REGULATORY_FINE_META = Object.freeze({
    spec: 'REGULATORY_FINE_SCHEMA_001',
    deliveredAt: '2026-05-01',
    legalBasis: 'Lei 9.605/1998 + Decreto 6.514/2008',
    categories: Object.values(INFRACTION_CATEGORY),
});

/** Erro tipado lançado pelo schema. */
export class FineError extends Error {
    code: string;

    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message || code);
        this.name = 'FineError';
        this.code = code;
    }
}

/**
 * Verifica número finito não-negativo.
 * @param {unknown} v
 */
function isNonNegativeFinite(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Verifica número finito estritamente positivo.
 * @param {unknown} v
 */
function isPositiveFinite(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Matriz de transições válidas de status. PENDING e IN_DEFENSE são portas
 * de entrada para os estados terminais (PAID/REDUCED_BY_CONVERSION/ENFORCED/
 * WAIVED). Estados terminais não emitem novas transições - copy-on-write
 * cria um novo registro em todos os casos.
 */
const VALID_FINE_TRANSITIONS = Object.freeze({
    PENDING: Object.freeze(new Set(['PAID', 'IN_DEFENSE', 'REDUCED_BY_CONVERSION', 'ENFORCED', 'WAIVED'])),
    IN_DEFENSE: Object.freeze(new Set(['PAID', 'REDUCED_BY_CONVERSION', 'ENFORCED', 'WAIVED'])),
    PAID: Object.freeze(new Set([])),
    REDUCED_BY_CONVERSION: Object.freeze(new Set(['PAID', 'ENFORCED'])),
    ENFORCED: Object.freeze(new Set([])),
    WAIVED: Object.freeze(new Set([])),
});

/** Mapa evento → status alvo. */
const EVENT_TO_STATUS = Object.freeze({
    PAY: FINE_PAYMENT_STATUS.PAID,
    OPEN_DEFENSE: FINE_PAYMENT_STATUS.IN_DEFENSE,
    CONVERT: FINE_PAYMENT_STATUS.REDUCED_BY_CONVERSION,
    ENFORCE: FINE_PAYMENT_STATUS.ENFORCED,
    WAIVE: FINE_PAYMENT_STATUS.WAIVED,
});

interface StatusHistoryEntry {
    fromStatus: string;
    toStatus: string;
    event: string;
}

interface InfractionRecord {
    infractionId: string;
    category: string;
    description: string;
    infractedAt: number;
    aggravatingFactors: ReadonlyArray<string>;
    areaImpactedHa: number;
    baseFineBRL: number;
    aggravationMultiplier: number;
    areaPenaltyBRL: number;
    calculatedFineBRL: number;
    status: string;
    voluntaryDiscountApplied: boolean;
    conversionApplied: boolean;
    discountedFineBRL: number | null;
    convertedFineBRL: number | null;
    statusHistory: ReadonlyArray<Readonly<StatusHistoryEntry>>;
}

interface CreateInfractionInput {
    infractionId?: string;
    category?: string;
    description?: string;
    infractedAt?: number;
    aggravatingFactors?: Array<string>;
    areaImpactedHa?: number;
}

/**
 * Cria um registro frozen de infração ambiental + multa calculada.
 *
 * Multa final = baseFine × multiplicador agravado (cap MAX) + penalidade
 * por área impactada (areaImpactedHa × AREA_PENALTY_BRL_PER_HA).
 *
 * @param {CreateInfractionInput} [input]
 * @returns {Readonly<InfractionRecord>} frozen infraction record
 */
export function createInfraction({
    infractionId,
    category,
    description,
    infractedAt,
    aggravatingFactors = [],
    areaImpactedHa = 0,
}: CreateInfractionInput = {}): Readonly<InfractionRecord> {
    if (typeof infractionId !== 'string' || infractionId.trim().length === 0) {
        throw new FineError(FINE_ERROR.INVALID_INFRACTION, 'infractionId must be non-empty string');
    }
    if (!(Object.values(INFRACTION_CATEGORY) as string[]).includes(category as string)) {
        throw new FineError(FINE_ERROR.INVALID_INFRACTION, `unknown category: ${category}`);
    }
    if (typeof description !== 'string') {
        throw new FineError(FINE_ERROR.INVALID_INFRACTION, 'description must be string');
    }
    if (!isPositiveFinite(infractedAt)) {
        throw new FineError(FINE_ERROR.INVALID_INFRACTION, 'infractedAt must be positive epoch ms');
    }
    if (!Array.isArray(aggravatingFactors)) {
        throw new FineError(FINE_ERROR.INVALID_INFRACTION, 'aggravatingFactors must be array');
    }
    for (const f of aggravatingFactors) {
        if (!(Object.values(AGGRAVATING_FACTOR) as string[]).includes(f)) {
            throw new FineError(FINE_ERROR.INVALID_INFRACTION, `unknown aggravating factor: ${f}`);
        }
    }
    if (!isNonNegativeFinite(areaImpactedHa)) {
        throw new FineError(FINE_ERROR.INVALID_AMOUNT, 'areaImpactedHa must be >= 0');
    }

    const baseFineBRL = (BASE_FINE_BRL as Record<string, number>)[category as string] as number;
    let multiplier = 1.0;
    for (const f of aggravatingFactors) {
        multiplier *= (AGGRAVATING_MULTIPLIER as Record<string, number>)[f] as number;
    }
    const aggravationMultiplier = Math.min(MAX_AGGRAVATED_MULTIPLIER, multiplier);
    const areaPenaltyBRL = (areaImpactedHa as number) * AREA_PENALTY_BRL_PER_HA;
    const calculatedFineBRL = baseFineBRL * aggravationMultiplier + areaPenaltyBRL;

    return Object.freeze({
        infractionId,
        category,
        description,
        infractedAt,
        aggravatingFactors: Object.freeze([...aggravatingFactors]),
        areaImpactedHa,
        baseFineBRL,
        aggravationMultiplier,
        areaPenaltyBRL,
        calculatedFineBRL,
        status: FINE_PAYMENT_STATUS.PENDING,
        voluntaryDiscountApplied: false,
        conversionApplied: false,
        discountedFineBRL: null,
        convertedFineBRL: null,
        statusHistory: Object.freeze([]),
    } as InfractionRecord);
}

/**
 * Aplica desconto por pagamento voluntário (30%). Retorna NOVO registro
 * frozen - não muta original. Idempotente: aplicar duas vezes não acumula.
 *
 * @param {InfractionRecord} infraction
 * @returns {Readonly<InfractionRecord>} new frozen infraction
 */
export function applyVoluntaryPaymentDiscount(
    infraction: InfractionRecord,
): Readonly<InfractionRecord> {
    if (!infraction || typeof infraction !== 'object') {
        throw new FineError(FINE_ERROR.INVALID_INFRACTION, 'infraction must be object');
    }
    const record = infraction as InfractionRecord;
    if (!isNonNegativeFinite(record.calculatedFineBRL)) {
        throw new FineError(FINE_ERROR.INVALID_AMOUNT, 'calculatedFineBRL must be >= 0');
    }
    if (record.voluntaryDiscountApplied) {
        // Idempotent: returns a frozen clone unchanged.
        return Object.freeze({ ...record });
    }
    const discountedFineBRL = record.calculatedFineBRL * (1 - VOLUNTARY_PAYMENT_DISCOUNT);
    return Object.freeze({
        ...record,
        voluntaryDiscountApplied: true,
        discountedFineBRL,
    });
}

/**
 * Aplica desconto por conversão em serviços ambientais (40%, art. 143).
 * Retorna NOVO registro frozen. Idempotente.
 *
 * @param {InfractionRecord} infraction
 * @returns {Readonly<InfractionRecord>} new frozen infraction
 */
export function applyConversionDiscount(
    infraction: InfractionRecord,
): Readonly<InfractionRecord> {
    if (!infraction || typeof infraction !== 'object') {
        throw new FineError(FINE_ERROR.INVALID_INFRACTION, 'infraction must be object');
    }
    const record = infraction as InfractionRecord;
    if (!isNonNegativeFinite(record.calculatedFineBRL)) {
        throw new FineError(FINE_ERROR.INVALID_AMOUNT, 'calculatedFineBRL must be >= 0');
    }
    if (record.conversionApplied) {
        return Object.freeze({ ...record });
    }
    const convertedFineBRL = record.calculatedFineBRL * (1 - CONVERSION_DISCOUNT);
    return Object.freeze({
        ...record,
        conversionApplied: true,
        convertedFineBRL,
    });
}

/**
 * Transiciona status via evento. Copy-on-write: retorna NOVO registro frozen.
 * Eventos: PAY, OPEN_DEFENSE, CONVERT, ENFORCE, WAIVE.
 *
 * @param {InfractionRecord} infraction
 * @param {string} event evento canônico
 * @returns {Readonly<InfractionRecord>} new frozen infraction with updated status + history
 * @throws {FineError} INVALID_STATUS para transição inválida
 */
export function transitionFineStatus(
    infraction: InfractionRecord,
    event: string,
): Readonly<InfractionRecord> {
    if (!infraction || typeof infraction !== 'object') {
        throw new FineError(FINE_ERROR.INVALID_STATUS, 'infraction must be object');
    }
    const targetStatus = (EVENT_TO_STATUS as Record<string, string>)[event];
    if (!targetStatus) {
        throw new FineError(FINE_ERROR.INVALID_STATUS, `unknown event: ${event}`);
    }
    const fromStatus = infraction.status || FINE_PAYMENT_STATUS.PENDING;
    const allowed = (VALID_FINE_TRANSITIONS as Record<string, ReadonlySet<string>>)[fromStatus];
    if (!(allowed instanceof Set) || !allowed.has(targetStatus)) {
        throw new FineError(
            FINE_ERROR.INVALID_STATUS,
            `transition not allowed: ${fromStatus} → ${targetStatus} (event=${event})`,
        );
    }
    const historyEntry = Object.freeze({
        fromStatus,
        toStatus: targetStatus,
        event,
    });
    const prevHistory = Array.isArray(infraction.statusHistory) ? infraction.statusHistory : [];
    return Object.freeze({
        ...infraction,
        status: targetStatus,
        statusHistory: Object.freeze([...prevHistory, historyEntry]),
    } as InfractionRecord);
}

/**
 * Calcula idade da multa em dias (since infractedAt).
 *
 * @param {InfractionRecord} infraction
 * @param {number} [now]
 * @returns {number} dias inteiros
 */
export function computeAgePastDue(
    infraction: InfractionRecord,
    now: number = Date.now(),
): number {
    if (!infraction || typeof infraction !== 'object') return 0;
    if (!isPositiveFinite(infraction.infractedAt)) return 0;
    if (!isPositiveFinite(now)) return 0;
    const ms = now - infraction.infractedAt;
    if (ms <= 0) return 0;
    return Math.floor(ms / 86_400_000);
}

/**
 * Constrói portfolio agregado frozen sobre uma lista de infrações.
 * Inclui: totais, breakdown por status/categoria, infração mais antiga
 * pendente, contagem de reincidentes.
 *
 * @param {Array<InfractionRecord>} infractions
 * @param {number} [now]
 * @returns {Readonly<{totalInfractions: number, totalCalculatedFineBRL: number, totalCollectedBRL: number, pendingCount: number, statusBreakdown: Readonly<Record<string,number>>, categoryBreakdown: Readonly<Record<string,number>>, oldestPending: InfractionRecord|null, repeatOffendersCount: number}>} frozen portfolio
 */
export function buildFinePortfolio(
    infractions: Array<InfractionRecord>,
    now: number = Date.now(),
): Readonly<{
    totalInfractions: number;
    totalCalculatedFineBRL: number;
    totalCollectedBRL: number;
    pendingCount: number;
    statusBreakdown: Readonly<Record<string, number>>;
    categoryBreakdown: Readonly<Record<string, number>>;
    oldestPending: InfractionRecord | null;
    repeatOffendersCount: number;
}> {
    const safe = Array.isArray(infractions) ? infractions.filter((i) => i && typeof i === 'object') : [];

    let totalCalculatedFineBRL = 0;
    let totalCollectedBRL = 0;
    let pendingCount = 0;
    let repeatOffendersCount = 0;

    const statusBreakdown: Record<string, number> = {
        PENDING: 0,
        PAID: 0,
        IN_DEFENSE: 0,
        REDUCED_BY_CONVERSION: 0,
        ENFORCED: 0,
        WAIVED: 0,
    };
    const categoryBreakdown: Record<string, number> = {};
    for (const cat of Object.values(INFRACTION_CATEGORY)) {
        categoryBreakdown[cat] = 0;
    }

    let oldestPending: InfractionRecord | null = null;
    let oldestPendingAge = -1;

    for (const inf of safe) {
        if (isNonNegativeFinite(inf.calculatedFineBRL)) totalCalculatedFineBRL += inf.calculatedFineBRL;
        if (inf.status === FINE_PAYMENT_STATUS.PAID && isNonNegativeFinite(inf.calculatedFineBRL)) {
            totalCollectedBRL += inf.calculatedFineBRL;
        }
        if (inf.status === FINE_PAYMENT_STATUS.PENDING) {
            pendingCount += 1;
            const age = computeAgePastDue(inf, now);
            if (age > oldestPendingAge) {
                oldestPendingAge = age;
                oldestPending = inf;
            }
        }
        if (inf.status && statusBreakdown[inf.status] !== undefined) {
            statusBreakdown[inf.status] = (statusBreakdown[inf.status] ?? 0) + 1;
        }
        if (inf.category && categoryBreakdown[inf.category] !== undefined) {
            categoryBreakdown[inf.category] = (categoryBreakdown[inf.category] ?? 0) + 1;
        }
        if (
            Array.isArray(inf.aggravatingFactors) &&
            inf.aggravatingFactors.includes(AGGRAVATING_FACTOR.REPEAT_OFFENSE)
        ) {
            repeatOffendersCount += 1;
        }
    }

    return Object.freeze({
        totalInfractions: safe.length,
        totalCalculatedFineBRL,
        totalCollectedBRL,
        pendingCount,
        statusBreakdown: Object.freeze({ ...statusBreakdown }),
        categoryBreakdown: Object.freeze({ ...categoryBreakdown }),
        oldestPending,
        repeatOffendersCount,
    });
}
