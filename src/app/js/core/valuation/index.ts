// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION — Fase 2 (claude - executor)
// Fachada única consolidando 4 módulos pré-existentes:
//   - core/analytics/environmentalLiabilityValuation (IAS 37 / CPC 25)
//   - core/impact/impactEstimator (VAA, NPV ecosystem services, ocupacional)
//   - core/financial/projectValuation (CRF, VPL, VPLA)
//   - core/analytics/economics/costRollup (CAPEX/OPEX L1-L4)
//
// Princípio: ORQUESTRAÇÃO ADITIVA — não reimplementa, apenas delega + envelopa
// resultados em ValuationResult<T> com binding de proveniência TUPLAx.
//
// Os 4 módulos continuam exportando o que exportam; consumidores legacy
// (utils/ui/costAnalysis, etc) NÃO precisam migrar. A fachada é opt-in.
//
// NOT (anti-requisitos):
// - NÃO reimplementa matemática de CRF/VPL/IAS 37 — só orquestra
// - NÃO acopla a core/billing (custo ambiental ≠ custo de serviço)
// - NÃO modifica os 4 módulos delegados

import {
    deriveCostFromGranular,
    tryDeriveCostFromGranular,
    countValidRecords,
    ValuationProvenanceError,
} from './_deriveFromGranularPure.js';
import type { TuplaRecord } from './_deriveFromGranularPure.js';
import type { ValuationResult, ValuationMethod, TuplaRef } from './_types.js';
import {
    LIABILITY_KINDS,
    ASSET_KINDS,
    KNOWN_VALUATION_METHODS,
    isLiabilityKind,
    isAssetKind,
    isKnownValuationMethod,
} from './_types.js';

// ----------------------------------------------------------------------
// Re-exports — single entry point para consumidores
// ----------------------------------------------------------------------

export {
    // Pure derivation (RF4)
    deriveCostFromGranular,
    tryDeriveCostFromGranular,
    countValidRecords,
    ValuationProvenanceError,
    // Type catalogs
    LIABILITY_KINDS,
    ASSET_KINDS,
    KNOWN_VALUATION_METHODS,
    isLiabilityKind,
    isAssetKind,
    isKnownValuationMethod,
};

export type { TuplaRecord, ValuationResult, ValuationMethod, TuplaRef };

// ----------------------------------------------------------------------
// Fachada — wraps delegated module outputs into ValuationResult<T>
// ----------------------------------------------------------------------

/**
 * Envelopa resultado escalar com proveniência mínima.
 * Use quando você JÁ tem o valor (de um dos 4 módulos) e quer adicionar trilha.
 *
 * Caller é responsável por fornecer provenance: TuplaRef[] dos registros
 * granulares que sustentam o valor. Vazio é permitido mas DESACONSELHADO
 * (viola princípio §4.1 — integridade ascendente).
 */
export function wrapValuation(
    value: number,
    opts: {
        unit: string;
        method: ValuationMethod | string;
        source: string;
        provenance?: ReadonlyArray<TuplaRef>;
        uncertainty?: { min: number; expected: number; max: number };
        integrity?: { eis: number };
    },
): ValuationResult<number> {
    return {
        value,
        unit: opts.unit,
        provenance: opts.provenance ? Object.freeze([...opts.provenance]) : Object.freeze([]),
        method: opts.method,
        source: opts.source,
        ...(opts.uncertainty ? { uncertainty: opts.uncertainty } : {}),
        ...(opts.integrity ? { integrity: opts.integrity } : {}),
    };
}

/**
 * Estima passivo de remediação delegando a impactEstimator.
 * Wrapper opt-in — caller chama com TUPLAx records + parâmetros do solver.
 * Lazy-imports impactEstimator para evitar cycle / boot cost quando flag OFF.
 *
 * @returns ValuationResult com value=BRL, method='remediation-cost'
 */
export async function estimateLiabilitySoil(opts: {
    records: ReadonlyArray<TuplaRecord>;
    estimatorParams: any;
    source?: string;
}): Promise<ValuationResult<number>> {
    const { estimateSoilRemediation } = await import('../impact/impactEstimator.js');
    const raw = estimateSoilRemediation(opts.estimatorParams);
    const refs = opts.records.map((r) => ({
        recordId: String(r.recordId),
        ponto: String(r.ponto),
        timestamp: String(r.timestamp),
        atributo: String(r.atributo),
    }));
    const rawValue: number = typeof raw === 'object' && raw && 'totalCost' in raw
        ? (raw as any).totalCost
        : typeof raw === 'number'
            ? raw
            : 0;
    return wrapValuation(rawValue, {
        unit: 'BRL',
        method: 'remediation-cost',
        source: opts.source || 'CONAMA 420 + CETESB DD 038/2017',
        provenance: refs,
    });
}

/**
 * Calcula provisão contábil IAS 37 delegando a environmentalLiabilityValuation.
 * Caller fornece o cenário; fachada envelopa em ValuationResult com binding.
 */
export async function computeAccountingProvisionWrapped(opts: {
    expectedCost: number;
    probability: number;
    discountRate?: number;
    yearsToSettle?: number;
    records?: ReadonlyArray<TuplaRecord>;
    source?: string;
}): Promise<ValuationResult<number>> {
    const { computeAccountingProvision } = await import(
        '../analytics/environmentalLiabilityValuation.js'
    );
    // FIX: computeAccountingProvision recebe 5 args POSICIONAIS (remediation,
    // damage, probability, discount, years) e retorna {provision_USD, npv_USD}
    // — NÃO objeto/`.value`. O wrapper anterior passava objeto (descartado por
    // `as any`) e extraía `.value` (inexistente) → resultado sempre 0.
    // opts.expectedCost mapeia para remediation_cost (damage = 0); npv_USD é a
    // provisão descontada (igual a provision_USD quando r ou n = 0).
    const provision = computeAccountingProvision(
        opts.expectedCost,
        0,
        opts.probability,
        opts.discountRate ?? 0,
        opts.yearsToSettle ?? 0,
    );
    const refs = (opts.records || []).map((r) => ({
        recordId: String(r.recordId),
        ponto: String(r.ponto),
        timestamp: String(r.timestamp),
        atributo: String(r.atributo),
    }));
    const rawValue: number = Number.isFinite(provision.npv_USD) ? provision.npv_USD : 0;
    return wrapValuation(rawValue, {
        unit: 'BRL',
        method: 'IAS37',
        source: opts.source || 'IAS 37 / CPC 25',
        provenance: refs,
    });
}

/**
 * Aggregador: dadas múltiplas valorações, soma valores + concatena provenance.
 * Útil para totalizar passivo+ativo de um modelo inteiro.
 */
export function aggregateValuations(
    results: ReadonlyArray<ValuationResult<number>>,
): ValuationResult<number> {
    if (results.length === 0) {
        return {
            value: 0,
            unit: 'BRL',
            provenance: Object.freeze([]),
            method: 'aggregate',
            source: 'aggregateValuations',
        };
    }
    let total = 0;
    const allRefs: TuplaRef[] = [];
    const sources = new Set<string>();
    const methods = new Set<string>();
    for (const r of results) {
        total += typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : 0;
        for (const ref of r.provenance) allRefs.push(ref);
        if (r.source) sources.add(r.source);
        if (r.method) methods.add(String(r.method));
    }
    return {
        value: total,
        unit: results[0]!.unit, // results.length===0 retornou acima
        provenance: Object.freeze(allRefs),
        method: `aggregate(${[...methods].join('+')})`,
        source: [...sources].join(' + '),
    };
}

/**
 * Metadata do módulo para introspecção.
 */
export const VALUATION_FACADE_META = Object.freeze({
    spec: 'COST_VALUATION_PROVENANCE_CONSOLIDATION',
    phase: 'F2-facade',
    delegated_modules: Object.freeze([
        'core/analytics/environmentalLiabilityValuation',
        'core/impact/impactEstimator',
        'core/financial/projectValuation',
        'core/analytics/economics/costRollup',
    ]),
    delivered_at: '2026-06-02',
});
