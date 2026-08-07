// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Coeficientes de Difusão Efetiva — Manual CETESB §6.1.1 (V 4.00 mar/2026).
// Pure-logic, sem THREE/DOM/IDB. Aplicação: Johnson&Ettinger 1991 + Domenico 1987.
//
// Equações (Millington-Quirk 1961 — referenciado pelo Manual via ASTM E 2081-00):
//
//   Ds_eff (ZNS, zona não saturada) =
//       Da · (θas^(10/3) / θT²) + (Dw / H) · (θws^(10/3) / θT²)
//
//   Dw_eff (ZS, zona saturada/groundwater) =
//       Dw · (θws^(10/3) / θT²)
//
//   Dcrk_eff (fundação/laje, intrusão de vapor) =
//       Da · (θacrk^(10/3) / θT²) + (Dw / H) · (θwcrk^(10/3) / θT²)
//
// Onde:
//   Da     — coef. difusão no ar (FisQui, cm²/s)
//   Dw     — coef. difusão na água (FisQui, cm²/s)
//   H      — constante de Henry adimensional (FisQui)
//   θT     — porosidade total (MfParams)
//   θas/θws — conteúdos volumétricos de ar/água na ZNS (MfParams)
//   θacrk/θwcrk — conteúdos volumétricos de ar/água nas fundações (MfParams)
//
// SPEC: CETESB-RISK-001 RF-1.3 (_diffusionCoeffsPure)

import type { MfParams } from './mfDefaults.js';
import type { FisQuiEntry } from './fisqui.js';
import { toFiniteNumber } from '../../../utils/helpers/toFiniteNumber.js';

export interface DiffusionCoeffs {
    /** Ds_eff — coef. difusão efetiva ZNS (cm²/s) */
    readonly Ds_eff: number;
    /** Dw_eff — coef. difusão efetiva ZS / água sub (cm²/s) */
    readonly Dw_eff: number;
    /** Dcrk_eff — coef. difusão efetiva fundação/laje (cm²/s) */
    readonly Dcrk_eff: number;
}

/**
 * Calcula a Millington-Quirk reduction ratio θ^(10/3) / θT².
 * Para θ=0 retorna 0 (sem caminho); para θT=0 retorna 0 (degenerado).
 */
function _mqRatio(theta: number, thetaT: number): number {
    if (!Number.isFinite(theta) || !Number.isFinite(thetaT)) return 0;
    if (theta <= 0 || thetaT <= 0) return 0;
    return Math.pow(theta, 10 / 3) / Math.pow(thetaT, 2);
}

/**
 * Coeficientes de difusão efetiva para uma SQI + meio físico.
 *
 * Comportamento canônico:
 * - Substância inorgânica não-volátil (Da=0): Ds_eff=0, Dcrk_eff=0 (sem vapor).
 *   Dw_eff calculado para SQIs solúveis (mesmo metais — ainda há transporte aquoso).
 * - H=0: termo aquoso da equação ZNS/crack → 0 (anula divisão por zero).
 * - Resultado em cm²/s, sempre ≥0.
 */
export function computeDiffusionCoeffs(
    mf: Readonly<MfParams>,
    sqi: Readonly<FisQuiEntry>,
): DiffusionCoeffs {
    if (!mf || !sqi) {
        return Object.freeze({ Ds_eff: 0, Dw_eff: 0, Dcrk_eff: 0 });
    }

    const Da = toFiniteNumber(sqi.Da, 0);
    const Dw = toFiniteNumber(sqi.Dw, 0);
    const H = toFiniteNumber(sqi.H, 0);
    const thetaT = toFiniteNumber(mf.thetaT, 0);

    // ZNS — Millington-Quirk
    const mqAs = _mqRatio(mf.thetaAs, thetaT);
    const mqWs = _mqRatio(mf.thetaWs, thetaT);
    const Ds_eff_air = Da * mqAs;
    const Ds_eff_water = H > 0 ? (Dw / H) * mqWs : 0;
    const Ds_eff = Ds_eff_air + Ds_eff_water;

    // ZS — somente componente aquoso
    const Dw_eff = Dw * mqWs;

    // Fundação/laje — Millington-Quirk com θacrk/θwcrk
    const mqAcrk = _mqRatio(mf.thetaAcrk, thetaT);
    const mqWcrk = _mqRatio(mf.thetaWcrk, thetaT);
    const Dcrk_eff_air = Da * mqAcrk;
    const Dcrk_eff_water = H > 0 ? (Dw / H) * mqWcrk : 0;
    const Dcrk_eff = Dcrk_eff_air + Dcrk_eff_water;

    return Object.freeze({
        Ds_eff: Math.max(0, Ds_eff),
        Dw_eff: Math.max(0, Dw_eff),
        Dcrk_eff: Math.max(0, Dcrk_eff),
    });
}

/** Source string para auditoria. */
export const DIFFUSION_SOURCE =
    'Manual CETESB §6.1.1 / Millington-Quirk 1961 / ASTM E 2081-00 (2001)' as const;
