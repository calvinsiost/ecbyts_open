// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * MAC Curve → core/financial compat bridge (ENV-VAL-001 Phase 4)
 *
 * Wraps the canonical pure functions from core/financial/projectValuation.js
 * with the mutation-based interface expected by macCurve.js internal helpers.
 *
 * Before Phase 4, macCurve.js duplicated the VPL/VPLA math inline.
 * This bridge eliminates that duplication while preserving the exact output
 * shape (_vpl, _vpla, _crf, cost, abatement) that _renderMACChart reads.
 *
 * Cashflow format conversion:
 *   macCurve:  { capex, opex, revenue, reduction } per period
 *   canonical: { flow: capex+opex+revenue, reduction }
 */

import { computeProjectValuation, computeProjectValuationVariable } from '../../core/financial/projectValuation.js';

/**
 * Converte fluxo no formato macCurve para o formato canônico.
 */
function _toCanonicalFlow(cf: {
    capex?: number;
    opex?: number;
    revenue?: number;
    reduction?: number;
}): { flow: number; reduction: number } {
    return {
        flow: (Number(cf?.capex) || 0) + (Number(cf?.opex) || 0) + (Number(cf?.revenue) || 0),
        reduction: Number(cf?.reduction) || 0,
    };
}

/**
 * Calcula e aplica valuation ao objeto measure `m` (mutação in-place).
 *
 * Substitui diretamente `_recalcProject` e `_recalcProjectVariable` em
 * macCurve.js - a lógica de despacho (variableMode) é preservada aqui.
 *
 * Campos gravados em `m`:
 *   m._vpl     - VPL total (pode ser negativo)
 *   m._vpla    - VPLA = VPL × CRF (custo anualizado)
 *   m._crf     - Capital Recovery Factor calculado
 *   m.cost     - |VPLA| (sempre positivo - usado no eixo Y da MAC Curve)
 *   m.abatement - redução ambiental por período (eixo X da MAC Curve)
 *
 * @param m - Measure do MAC Curve (variableMode, cashflows, capex, opex, revenue, periods, discountRate, reductionPerPeriod)
 */
export function applyProjectValuation(m: Record<string, any>): void {
    if (m.variableMode && Array.isArray(m.cashflows)) {
        const cashflows = m.cashflows.map(_toCanonicalFlow);
        const result = computeProjectValuationVariable({
            cashflows,
            discountRate: m.discountRate,
        });
        m._vpl = result.vpl;
        m._vpla = result.vpla;
        m._crf = result.crf;
        m.cost = Math.abs(result.vpla);
        m.abatement = result.avgReduction;
    } else {
        const result = computeProjectValuation({
            capex: m.capex,
            opex: m.opex,
            revenue: m.revenue,
            periods: m.periods,
            discountRate: m.discountRate,
        });
        m._vpl = result.vpl;
        m._vpla = result.vpla;
        m._crf = result.crf;
        m.cost = Math.abs(result.vpla);
        m.abatement = m.reductionPerPeriod || 0;
    }
}
