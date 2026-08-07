// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Cálculo de ILCR, HQ e CMA reversa — Manual CETESB §7.1.
// Pure-logic, fecha o motor Fase 1.
//
// Equações canônicas USEPA RAGS / Manual §7:
//
//   ILCR_via = LADDc · SF        (carcinogênico, por via)
//   HQ_via   = LADDn / RfD       (não-carcinogênico, por via)
//
//   ILCR_total = Σ ILCR_via      (soma sobre vias habilitadas)
//   HI_total   = Σ HQ_via         (Hazard Index)
//
//   CMA reversa: como dose ∝ concentração (linearidade da fórmula RAGS),
//     CMA_carc = target_ILCR / Σ (ILCR_via_unit)
//     CMA_nc   = target_HQ   / Σ (HQ_via_unit)
//     CMA = min(CMA_carc, CMA_nc)   ← mais restritiva
//
// Targets default:
//   ILCR_target = 1e-6 (USEPA) — alternativo CETESB DD 103/2007 = 1e-5
//   HQ_target   = 1.0 (RAGS)
//
// SPEC: CETESB-RISK-001 RF-1.3 (_riskCmaPure)

import type { FatToxEntry } from './fatTox.js';
import type { Pathway } from './_doseIngressPure.js';

/** Dose computada por via (vinda de `_doseIngressPure`) escalada para C=1. */
export interface UnitDoseByPathway {
    pathway: Pathway;
    /** LADD carcinogênico por unidade de concentração — null se não-carc. */
    LADDc_per_unit: number | null;
    /** LADD não-carcinogênico por unidade de concentração. */
    LADDn_per_unit: number;
    /** Rota: 'oral' (usa SFo/RfDo) ou 'inhalation' (SFi/RfDi). */
    route: 'oral' | 'inhalation';
}

export interface RiskAndCmaInputs {
    /** Concentração observada (mg/kg solo ou mg/L água ou mg/m³ ar). */
    observedConcentration: number;
    /** Doses por via, computadas a partir da concentração observada. */
    perPathway: ReadonlyArray<UnitDoseByPathway>;
    tox: Readonly<FatToxEntry>;
    /** Target ILCR (default 1e-6). */
    targetILCR?: number | undefined;
    /** Target HQ (default 1.0). */
    targetHQ?: number | undefined;
    /** Unidade da CMA retornada. */
    cmaUnit?: string;
}

export interface RiskAndCmaResult {
    /** Risco carcinogênico total observado. */
    readonly ILCR_total: number;
    /** Hazard Index total observado. */
    readonly HI_total: number;
    /** CMA carcinogênico (mesma unidade da concentração) — null se nenhuma via tem SF. */
    readonly CMA_carcinogenic: number | null;
    /** CMA não-carcinogênico. */
    readonly CMA_noncarcinogenic: number;
    /** CMA final = min(carc, non-carc) — mais restritiva. */
    readonly CMA: number;
    /** Unidade da CMA. */
    readonly CMA_unit: string;
    /** Via que limita a CMA (driver). */
    readonly limitingPathway: string;
    /** Contribuição relativa de cada via (0..1, soma=1). */
    readonly pathwaysContrib: Readonly<Record<string, number>>;
    /** Warnings de cálculo. */
    readonly warnings: ReadonlyArray<string>;
}

function _slopeFactor(tox: Readonly<FatToxEntry>, route: 'oral' | 'inhalation'): number | null {
    return route === 'oral' ? tox.SFo : tox.SFi;
}

function _rfd(tox: Readonly<FatToxEntry>, route: 'oral' | 'inhalation'): number | null {
    return route === 'oral' ? tox.RfDo : tox.RfDi;
}

/**
 * Calcula ILCR/HQ totais + CMA reversa.
 * Premissa de linearidade: dose ∝ concentração (RAGS Part A), válido p/ todas
 * as fórmulas usadas em `_doseIngressPure`.
 */
export function computeRiskAndCma(input: RiskAndCmaInputs): RiskAndCmaResult {
    const warnings: string[] = [];
    const targetILCR = Number.isFinite(input.targetILCR) ? (input.targetILCR as number) : 1e-6;
    const targetHQ = Number.isFinite(input.targetHQ) ? (input.targetHQ as number) : 1.0;
    const cmaUnit = input.cmaUnit || 'mg/kg';

    if (!input || !input.tox || !Array.isArray(input.perPathway) || input.perPathway.length === 0) {
        return Object.freeze({
            ILCR_total: 0,
            HI_total: 0,
            CMA_carcinogenic: null,
            CMA_noncarcinogenic: Infinity,
            CMA: Infinity,
            CMA_unit: cmaUnit,
            limitingPathway: 'none',
            pathwaysContrib: Object.freeze({}),
            warnings: Object.freeze(['Sem vias de exposição habilitadas — CMA não restringida']),
        });
    }

    const C = input.observedConcentration > 0 ? input.observedConcentration : 1;
    let ILCR_total = 0;
    let HI_total = 0;
    let sumILCR_per_unit = 0;
    let sumHQ_per_unit = 0;
    const ilcrByPath: Record<string, number> = {};
    const hqByPath: Record<string, number> = {};
    let limitingHQ = { path: 'none', value: 0 };
    let limitingILCR = { path: 'none', value: 0 };

    for (const p of input.perPathway) {
        const SF = _slopeFactor(input.tox, p.route);
        const RfD = _rfd(input.tox, p.route);

        // Carcinogênico
        if (SF != null && p.LADDc_per_unit != null && p.LADDc_per_unit >= 0) {
            const ilcr_per_unit = p.LADDc_per_unit * SF;
            const ilcr_observed = ilcr_per_unit * C;
            ILCR_total += ilcr_observed;
            sumILCR_per_unit += ilcr_per_unit;
            ilcrByPath[p.pathway] = ilcr_observed;
            if (ilcr_per_unit > limitingILCR.value) {
                limitingILCR = { path: p.pathway, value: ilcr_per_unit };
            }
        }

        // Não-carcinogênico
        if (RfD != null && RfD > 0 && p.LADDn_per_unit >= 0) {
            const hq_per_unit = p.LADDn_per_unit / RfD;
            const hq_observed = hq_per_unit * C;
            HI_total += hq_observed;
            sumHQ_per_unit += hq_per_unit;
            hqByPath[p.pathway] = hq_observed;
            if (hq_per_unit > limitingHQ.value) {
                limitingHQ = { path: p.pathway, value: hq_per_unit };
            }
        } else if (RfD == null) {
            warnings.push(`Via ${p.pathway} (${p.route}): sem RfD na base — HQ não computado`);
        }
    }

    const CMA_carcinogenic = sumILCR_per_unit > 0 ? targetILCR / sumILCR_per_unit : null;
    const CMA_noncarcinogenic = sumHQ_per_unit > 0 ? targetHQ / sumHQ_per_unit : Infinity;

    let CMA: number;
    let limitingPathway: string;
    if (CMA_carcinogenic != null && CMA_carcinogenic < CMA_noncarcinogenic) {
        CMA = CMA_carcinogenic;
        limitingPathway = limitingILCR.path;
    } else {
        CMA = CMA_noncarcinogenic;
        limitingPathway = limitingHQ.path;
    }

    if (!Number.isFinite(CMA)) {
        warnings.push('CMA infinita — todas as vias com SF=0 e RfD=null');
    }

    // Contribuição relativa (combinada carc+nc)
    const totalCarc = sumILCR_per_unit;
    const totalNc = sumHQ_per_unit;
    const pathwaysContrib: Record<string, number> = {};
    if (totalCarc > 0 || totalNc > 0) {
        for (const p of input.perPathway) {
            // Captura local: o `!= null` no acesso inline não estreita a 2ª
            // leitura do Record (noUncheckedIndexedAccess).
            const ilcrVal = ilcrByPath[p.pathway];
            const ilcr_pu = ilcrVal != null ? ((ilcrVal / C) / Math.max(totalCarc, 1e-30)) : 0;
            const hqVal = hqByPath[p.pathway];
            const hq_pu = hqVal != null ? ((hqVal / C) / Math.max(totalNc, 1e-30)) : 0;
            // Média ponderada se ambos presentes; senão usa o que existir
            const ilcrW = totalCarc > 0 ? totalCarc : 0;
            const hqW = totalNc > 0 ? totalNc : 0;
            const totalW = ilcrW + hqW;
            pathwaysContrib[p.pathway] = totalW > 0 ? (ilcrW * ilcr_pu + hqW * hq_pu) / totalW : 0;
        }
    }

    return Object.freeze({
        ILCR_total,
        HI_total,
        CMA_carcinogenic,
        CMA_noncarcinogenic,
        CMA,
        CMA_unit: cmaUnit,
        limitingPathway,
        pathwaysContrib: Object.freeze(pathwaysContrib),
        warnings: Object.freeze(warnings),
    });
}

/** Helper: deriva UnitDoseByPathway a partir de DoseResult (escala para C=1). */
export function toUnitDose(
    doseResult: Readonly<{ LADDc: number | null; LADDn: number; detail: { pathway: string } }>,
    observedConcentration: number,
    route: 'oral' | 'inhalation',
): UnitDoseByPathway {
    const C = observedConcentration > 0 ? observedConcentration : 1;
    return {
        pathway: doseResult.detail.pathway as Pathway,
        LADDc_per_unit: doseResult.LADDc != null ? doseResult.LADDc / C : null,
        LADDn_per_unit: doseResult.LADDn / C,
        route,
    };
}

/** Source string. */
export const RISK_CMA_SOURCE =
    'USEPA RAGS Part A 1989 / Manual CETESB §7.1 / DD 103/2007/C/E (target ILCR 1e-6)' as const;
