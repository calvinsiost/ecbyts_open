// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION — Fase 1 (claude - executor)
// Tipos canônicos + taxonomias frozen para fachada de valoração.
//
// Plano doutorado §iv: "valoração apoiada na proveniência granular dos registros".
// Cada saída de valoração DEVE carregar TuplaRef[] dos registros TUPLAx-fonte.

/**
 * Referência a um registro TUPLAx granular (Ponto/Timestamp/Atributo/Leitura/Unidade).
 * Identidade canônica para auditoria: recordId + ponto + timestamp + atributo
 * é único no domínio de observações.
 */
export interface TuplaRef {
    /** UUID/id estável da observação. */
    recordId: string;
    /** Ponto de coleta (well/sensor/sample ID). */
    ponto: string;
    /** Timestamp ISO-8601 da coleta. */
    timestamp: string;
    /** Atributo medido (pH, benzeno, vazão, etc). */
    atributo: string;
}

/**
 * Resultado de qualquer cálculo de valoração ambiental/ocupacional.
 * Genérico em T para suportar valor escalar (number) ou multi-dimensional.
 */
export interface ValuationResult<T = number> {
    value: T;
    /** Unidade canônica: BRL, BRL/ano, BRL/m³, etc. */
    unit: string;
    /** Registros TUPLAx que sustentam o valor — NUNCA vazio para resultados válidos. */
    provenance: ReadonlyArray<TuplaRef>;
    /** Método/norma de cálculo (string-tag para audit trail). */
    method: ValuationMethod | string;
    /** Fonte normativa (DOI/ISBN/lei/norma técnica). */
    source: string;
    /** Faixa de incerteza GUM Tier-1 (opcional Fase 3). */
    uncertainty?: { min: number; expected: number; max: number };
    /** Contexto de integridade EIS (opcional Fase 3). */
    integrity?: { eis: number };
}

/**
 * Método de valoração — alinhado às fontes normativas no ADR §A3.
 * Mantido como union string para extensibilidade sem alterar tipo.
 */
export type ValuationMethod =
    | 'IAS37' // IAS 37 / CPC 25 — provisão contábil
    | 'VAA' // Valorização de Ativo Ambiental (terra)
    | 'ecosystem-npv' // Costanza 1997 + Natural Capital Protocol 2016
    | 'remediation-cost' // Custo de remediação ABNT/CETESB
    | 'health-cost' // Saúde ocupacional (DALY/QALY × CPI)
    | 'crf-vpla' // CRF/VPLA matemática financeira clássica
    | 'psa-lei14119' // Pagamento por Serviços Ambientais (Lei 14.119/2021)
    | 'pnma-poluidor-pagador'; // PNMA art. 4º VII

/**
 * Taxonomia de passivos — categorias mutuamente excludentes.
 * Cada entrada tem fonte normativa documentada no ADR.
 */
export type LiabilityKind =
    | 'remediation-soil'
    | 'remediation-water'
    | 'remediation-air'
    | 'occupational-health'
    | 'radiological'
    | 'geotechnical';

/**
 * Taxonomia de ativos ambientais — categorias mutuamente excludentes.
 */
export type AssetKind =
    | 'valued-land' // VAA — terra valorizada por remediação
    | 'ecosystem-services' // Costanza + Natural Capital Protocol
    | 'environmental-credit'; // Crédito ambiental / EIC

/**
 * Catálogo frozen de LiabilityKind para iteração + validação.
 * Adição requer ADR update.
 */
export const LIABILITY_KINDS: ReadonlyArray<LiabilityKind> = Object.freeze([
    'remediation-soil',
    'remediation-water',
    'remediation-air',
    'occupational-health',
    'radiological',
    'geotechnical',
]);

/**
 * Catálogo frozen de AssetKind para iteração + validação.
 */
export const ASSET_KINDS: ReadonlyArray<AssetKind> = Object.freeze([
    'valued-land',
    'ecosystem-services',
    'environmental-credit',
]);

/**
 * Catálogo frozen de ValuationMethod conhecidos.
 * Strings arbitrárias são aceitas em runtime para extensibilidade.
 */
export const KNOWN_VALUATION_METHODS: ReadonlyArray<ValuationMethod> = Object.freeze([
    'IAS37',
    'VAA',
    'ecosystem-npv',
    'remediation-cost',
    'health-cost',
    'crf-vpla',
    'psa-lei14119',
    'pnma-poluidor-pagador',
]);

/**
 * Verifica se um valor é LiabilityKind válido (type guard).
 */
export function isLiabilityKind(value: unknown): value is LiabilityKind {
    return typeof value === 'string' && (LIABILITY_KINDS as ReadonlyArray<string>).includes(value);
}

/**
 * Verifica se um valor é AssetKind válido (type guard).
 */
export function isAssetKind(value: unknown): value is AssetKind {
    return typeof value === 'string' && (ASSET_KINDS as ReadonlyArray<string>).includes(value);
}

/**
 * Verifica se um método é conhecido (não-bloqueante; strings arbitrárias passam runtime).
 */
export function isKnownValuationMethod(value: unknown): value is ValuationMethod {
    return typeof value === 'string' && (KNOWN_VALUATION_METHODS as ReadonlyArray<string>).includes(value);
}

/**
 * Anti-overlap invariante: LiabilityKind e AssetKind não compartilham strings.
 * Função para testes.
 */
export function hasOverlapBetweenLiabilityAndAsset(): boolean {
    const setL = new Set<string>(LIABILITY_KINDS);
    for (const a of ASSET_KINDS) if (setL.has(a)) return true;
    return false;
}
