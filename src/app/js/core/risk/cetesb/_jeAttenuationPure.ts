// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Fator de Atenuação Johnson & Ettinger 1991 — Manual CETESB §6.1 (V 4.00 mar/2026).
// Pure-logic, sem THREE/DOM/IDB.
//
// O Manual usa por default α = 0.03 (USEPA 2015) como atenuação predefinida
// (vapor da fonte no solo → ar interno do prédio). Este módulo:
//
//   1. Expõe `getJeAttenuationFactor(mf)` → retorna o α predefinido CETESB (0.03)
//      que é o caminho canônico das planilhas oficiais.
//
//   2. Expõe `computeJeFromEquation(mf, sqi, opts)` → calcula α via equação
//      J&E 1991 completa (auditoria + comparação de sanidade vs CETESB default).
//
// Equação J&E 1991 difusiva (sem advecção, Q_soil ≈ 0):
//
//   α_diff = D_T_eff · A_b / ( ER · V_b · L_T + D_T_eff · A_b )
//
// Onde:
//   D_T_eff — difusão efetiva total do caminho (combinação ZNS + crack), cm²/s
//   A_b     — área das fundações, cm²
//   ER      — taxa de troca de ar do prédio, 1/s
//   V_b     — volume do prédio = A_b · L_b (pé direito), cm³
//   L_T     — espessura total do caminho (ZNS + fundação), cm
//
// Equação J&E 1991 completa (com Q_soil advectivo opcional):
//
//   α = (D_T_eff·A_b / (ER·V_b·L_T)) · exp(Q_soil·L_crack / (D_crk_eff·A_crk)) /
//       [ exp(...) + (D_T_eff·A_b / (ER·V_b·L_T)) · (exp(...) - 1 + D_T_eff·A_b / (Q_soil·L_T)) ]
//
// SPEC: CETESB-RISK-001 RF-1.3 (_jeAttenuationPure)
// Ref: Johnson, P.C. & Ettinger, R.A. (1991). Environ Sci Technol 25(8):1445-1452.

import type { MfParams } from './mfDefaults.js';
import type { FisQuiEntry } from './fisqui.js';
import { computeDiffusionCoeffs } from './_diffusionCoeffsPure.js';

export interface JeAttenuationResult {
    /** Fator de atenuação α (adimensional, 0 ≤ α ≤ 1). */
    readonly alpha: number;
    /** Método: 'cetesb_default' (0.03 USEPA 2015) ou 'je_equation' (calculado). */
    readonly method: 'cetesb_default' | 'je_equation';
    /** Detalhe do cálculo quando method='je_equation'. */
    readonly detail?: Readonly<{
        D_T_eff: number;
        A_b: number;
        ER: number;
        V_b: number;
        L_T: number;
        ratio: number;
    }>;
}

/**
 * Retorna o fator α PREDEFINIDO CETESB (Manual Anexo B α=0.03 USEPA 2015).
 * Este é o path canônico usado pelas planilhas oficiais.
 */
export function getJeAttenuationFactor(mf: Readonly<MfParams>): JeAttenuationResult {
    if (!mf || !Number.isFinite(mf.alpha)) {
        return Object.freeze({ alpha: 0, method: 'cetesb_default' as const });
    }
    return Object.freeze({
        alpha: Math.max(0, Math.min(1, mf.alpha)),
        method: 'cetesb_default' as const,
    });
}

export interface JeEquationOptions {
    /**
     * Fonte de vapor: 'subsurface_soil' (Lss profundidade) ou 'groundwater' (hv ZNS total).
     * Default: 'subsurface_soil'.
     */
    pathDepth?: 'subsurface_soil' | 'groundwater';
}

/**
 * Calcula α via equação J&E 1991 difusiva (sem advecção).
 * Para auditoria + sanity check vs α predefinido CETESB.
 *
 * Retorna α=0 se inputs inválidos ou Ds_eff=0 (substância não-volátil).
 */
export function computeJeFromEquation(
    mf: Readonly<MfParams>,
    sqi: Readonly<FisQuiEntry>,
    opts: JeEquationOptions = {},
): JeAttenuationResult {
    if (!mf || !sqi) {
        return Object.freeze({ alpha: 0, method: 'je_equation' as const });
    }
    const diff = computeDiffusionCoeffs(mf, sqi);
    if (diff.Ds_eff <= 0) {
        return Object.freeze({ alpha: 0, method: 'je_equation' as const });
    }

    const A_b = mf.Ab;
    const ER = mf.ER;
    const V_b = mf.Ab * mf.Lb; // volume do prédio (cm³)
    // L_T — caminho total da fonte ao ar interno
    const pathDepth = opts.pathDepth || 'subsurface_soil';
    const L_T = pathDepth === 'groundwater'
        ? mf.hv + mf.Lcrk            // ZNS completa + fundação
        : mf.Lss + mf.Lcrk;           // topo da fonte subsup + fundação

    if (A_b <= 0 || ER <= 0 || V_b <= 0 || L_T <= 0) {
        return Object.freeze({ alpha: 0, method: 'je_equation' as const });
    }

    // D_T_eff: combinação harmônica ZNS + crack (caminho em série)
    // Equação simplificada Manual: aproxima Ds_eff dominante; crack < ZNS
    // Para versão purista: 1/D_T = (Lss/Ds_eff) + (Lcrk/Dcrk_eff)
    const Ls_path = pathDepth === 'groundwater' ? mf.hv : mf.Lss;
    let D_T_eff: number;
    if (diff.Dcrk_eff > 0 && Ls_path > 0 && mf.Lcrk > 0) {
        // Resistência total = Ls/Ds + Lcrk/Dcrk
        const R_total = (Ls_path / diff.Ds_eff) + (mf.Lcrk / diff.Dcrk_eff);
        D_T_eff = L_T / R_total;
    } else {
        D_T_eff = diff.Ds_eff;
    }

    // J&E difusivo: α = D_T_eff·A_b / (ER·V_b·L_T + D_T_eff·A_b)
    const numerator = D_T_eff * A_b;
    const denominator = ER * V_b * L_T + numerator;

    if (denominator <= 0) {
        return Object.freeze({ alpha: 0, method: 'je_equation' as const });
    }

    const ratio = numerator / denominator;
    const alpha = Math.max(0, Math.min(1, ratio));

    return Object.freeze({
        alpha,
        method: 'je_equation' as const,
        detail: Object.freeze({ D_T_eff, A_b, ER, V_b, L_T, ratio }),
    });
}

/** Source string para auditoria. */
export const JE_SOURCE =
    'Manual CETESB §6.1 / Johnson & Ettinger 1991 (Environ Sci Technol 25:1445)' as const;
