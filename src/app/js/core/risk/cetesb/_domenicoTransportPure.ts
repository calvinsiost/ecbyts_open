// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Transporte Saturado Domenico 1987 — Manual CETESB §6.1 (V 4.00 mar/2026).
// Pure-logic, sem THREE/DOM/IDB.
//
// Equação 3D Domenico (steady-state) — atenuação da pluma da fonte ao
// ponto de exposição (PE), considerando difusão transversal/vertical e
// decaimento 1ª ordem opcional:
//
//   C(x,0,0)/C0 = exp[(x/(2·αx)) · (1 - sqrt(1 + 4·λ·αx/v))] ·
//                 erf(Sw / (4·sqrt(αy·x))) ·
//                 erf(Sd / (2·sqrt(αz·x)))
//
// Onde:
//   x   — distância da fonte ao PE (cm)
//   αx,αy,αz — dispersividades longitudinal/transversal/vertical (cm)
//   λ   — taxa de decaimento de 1ª ordem (1/s); 0 = sem decay (worst case)
//   v   — velocidade intersticial da água subterrânea (cm/s); requerido se λ>0
//   Sw  — largura da fonte (cm)
//   Sd  — espessura da fonte (cm)
//
// Para o caso CETESB default (worst case sem decay): λ=0, termo exp=1.
//
// Dispersividades default (scale-dependent, ASTM 2002 + Xu&Eckstein 1995):
//   αx = 0.1 · x          (10% da distância)
//   αy = αx / 3            (~33%)
//   αz = αx / 20           (~5%)
//
// SPEC: CETESB-RISK-001 RF-1.3 (_domenicoTransportPure)
// Ref: Domenico, P.A. (1987). Journal of Hydrology 91(1-2):49-58. DOI:10.1016/0022-1694(87)90127-2

import type { MfParams } from './mfDefaults.js';

export interface DomenicoOptions {
    /** x — distância da fonte ao ponto de exposição (cm). Obrigatório. */
    distance: number;
    /** Sw — largura da fonte (cm). Default: mf.Sw. */
    Sw?: number;
    /** Sd — espessura da fonte (cm). Default: mf.Sd. */
    Sd?: number;
    /** αx — dispersividade longitudinal (cm). Default: 0.1 · distance. */
    alphaX?: number;
    /** αy — dispersividade transversal (cm). Default: αx / 3. */
    alphaY?: number;
    /** αz — dispersividade vertical (cm). Default: αx / 20. */
    alphaZ?: number;
    /** λ — taxa de decaimento 1ª ordem (1/s). Default: 0 (worst case sem decay). */
    lambda?: number;
    /** v — velocidade intersticial (cm/s). Obrigatório se lambda > 0. */
    velocity?: number;
}

export interface DomenicoResult {
    /** Razão C(x)/C0 — atenuação na pluma (0..1). */
    readonly ratio: number;
    /** Componente longitudinal (decay + dispersão axial). */
    readonly longitudinalFactor: number;
    /** erf(Sw / 4√(αy·x)) — atenuação transversal. */
    readonly transverseFactor: number;
    /** erf(Sd / 2√(αz·x)) — atenuação vertical. */
    readonly verticalFactor: number;
    readonly detail: Readonly<{ x: number; alphaX: number; alphaY: number; alphaZ: number; lambda: number }>;
}

/**
 * Aproximação numérica de erf(z) usando Abramowitz & Stegun 7.1.26 (max error ~1.5e-7).
 */
function _erf(z: number): number {
    if (!Number.isFinite(z)) return 0;
    if (z === 0) return 0;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}

function _withDefaultFinite(value: number | undefined | null, fallback: number): number {
    return Number.isFinite(value) ? (value as number) : fallback;
}

function _fallbackDomenicoResult(): DomenicoResult {
    return Object.freeze({
        ratio: 1,
        longitudinalFactor: 1,
        transverseFactor: 1,
        verticalFactor: 1,
        detail: Object.freeze({ x: 0, alphaX: 0, alphaY: 0, alphaZ: 0, lambda: 0 }),
    });
}

function _normalizeDomenicoInputs(
    mf: Readonly<MfParams>,
    opts: DomenicoOptions,
): { x: number; Sw: number; Sd: number; alphaX: number; alphaY: number; alphaZ: number; lambda: number; velocity: number } {
    const x = opts.distance;
    const alphaX = _withDefaultFinite(opts.alphaX, 0.1 * x);
    return {
        x,
        Sw: _withDefaultFinite(opts.Sw, mf.Sw),
        Sd: _withDefaultFinite(opts.Sd, mf.Sd),
        alphaX,
        alphaY: _withDefaultFinite(opts.alphaY, alphaX / 3),
        alphaZ: _withDefaultFinite(opts.alphaZ, alphaX / 20),
        lambda: _withDefaultFinite(opts.lambda, 0),
        velocity: _withDefaultFinite(opts.velocity, 0),
    };
}

function _computeLongitudinalFactor(x: number, alphaX: number, lambda: number, velocity: number): number {
    if (lambda > 0 && velocity > 0 && alphaX > 0) {
        const inside = 1 + (4 * lambda * alphaX) / velocity;
        const expArg = (x / (2 * alphaX)) * (1 - Math.sqrt(inside));
        return Math.exp(expArg);
    }
    return 1;
}

function _computeTransverseFactor(Sw: number, alphaY: number, x: number): number {
    return alphaY > 0 ? _erf(Sw / (4 * Math.sqrt(alphaY * x))) : 1;
}

function _computeVerticalFactor(Sd: number, alphaZ: number, x: number): number {
    return alphaZ > 0 ? _erf(Sd / (2 * Math.sqrt(alphaZ * x))) : 1;
}

function _buildDomenicoResult(
    x: number,
    alphaX: number,
    alphaY: number,
    alphaZ: number,
    lambda: number,
    longitudinalFactor: number,
    transverseFactor: number,
    verticalFactor: number,
): DomenicoResult {
    const ratio = Math.max(0, Math.min(1, longitudinalFactor * transverseFactor * verticalFactor));
    return Object.freeze({
        ratio,
        longitudinalFactor,
        transverseFactor,
        verticalFactor,
        detail: Object.freeze({ x, alphaX, alphaY, alphaZ, lambda }),
    });
}

/**
 * Calcula atenuação Domenico 1987 da concentração da fonte ao ponto de exposição.
 *
 * Inputs inválidos (distance ≤ 0, dispersividades degeneradas) retornam ratio=1
 * (pluma não atenuada — conservador).
 */
export function computeDomenicoAttenuation(
    mf: Readonly<MfParams>,
    opts: DomenicoOptions,
): DomenicoResult {
    if (!mf || !opts || !Number.isFinite(opts.distance) || opts.distance <= 0) {
        return _fallbackDomenicoResult();
    }

    const { x, Sw, Sd, alphaX, alphaY, alphaZ, lambda, velocity } = _normalizeDomenicoInputs(mf, opts);

    const longitudinalFactor = _computeLongitudinalFactor(x, alphaX, lambda, velocity);
    const transverseFactor = _computeTransverseFactor(Sw, alphaY, x);
    const verticalFactor = _computeVerticalFactor(Sd, alphaZ, x);

    return _buildDomenicoResult(x, alphaX, alphaY, alphaZ, lambda, longitudinalFactor, transverseFactor, verticalFactor);
}

/** Helper: para uso em sanity checks numéricos. */
export const erf = _erf;

/** Source string para auditoria. */
export const DOMENICO_SOURCE = 'Manual CETESB §6.1 / Domenico 1987 (J Hydrol 91:49)' as const;
