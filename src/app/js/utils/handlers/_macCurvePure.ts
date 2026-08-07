// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave DDDD1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free MAC curve math from utils/handlers/macCurve.js
// (1602 LOC). Pure: zero document/window/state refs. Deterministic given inputs.

/**
 * Linear interpolation green→yellow→red baseado em ratio [0..1].
 * Pure: math determinístico via Math.round + linear scaling.
 *
 * @param {number} ratio - Posição normalizada [0..1]
 * @returns {string} Cor rgba string
 */
export function interpolateColorGreenRed( ratio: any) {
    const r = clamp01(ratio);
    let cr, cg, cb;
    if (r < 0.5) {
        const t2 = r * 2;
        cr = Math.round(39 + (241 - 39) * t2);
        cg = Math.round(174 + (196 - 174) * t2);
        cb = Math.round(96 + (15 - 96) * t2);
    } else {
        const t2 = (r - 0.5) * 2;
        cr = Math.round(241 + (231 - 241) * t2);
        cg = Math.round(196 + (76 - 196) * t2);
        cb = Math.round(15 + (60 - 15) * t2);
    }
    return `rgba(${cr},${cg},${cb},0.75)`;
}

/**
 * Determine cor staircase para um step do MAC curve.
 * Verde = receita (unitCost < 0), amarelo = único, gradiente = múltiplos.
 *
 * @param {number} idx - Posição na lista ordenada
 * @param {number} total - Total de medidas
 * @param {number} unitCost - Custo unitário
 * @returns {string} Cor rgba
 */
export function resolveStaircaseColor( idx: any, total: any, unitCost: any) {
    if (!Number.isFinite(unitCost)) return 'rgba(241,196,15,0.75)';
    if (unitCost < 0) return 'rgba(39,174,96,0.75)';
    if (total <= 1) return 'rgba(241,196,15,0.75)';
    const ratio = total > 1 ? idx / (total - 1) : 0;
    return interpolateColorGreenRed(ratio);
}

/**
 * Prepara dados staircase (separa zero-abatement + sort por unitCost +
 * computes cumStart/cumEnd posições X cumulativas).
 * Pure: input array de medidas → output array enriquecido.
 *
 * @param {Array<{_cost:number, _abatement:number}>} resolved
 * @returns {{stairData:Array<any>, zeroAbat:Array<any>}}
 */
export function prepareStaircaseData( resolved: any) {
    if (!Array.isArray(resolved)) return { stairData: [], zeroAbat: [] };
    const zeroAbat = [];
    const valid = [];
    for (const m of resolved) {
        if (!m || m._abatement === 0) {
            if (m) zeroAbat.push(m);
            continue;
        }
        const abatAbs = Math.abs(m._abatement);
        if (abatAbs === 0) {
            zeroAbat.push(m);
            continue;
        }
        const unitCost = m._cost / abatAbs;
        valid.push({ ...m, unitCost, abatAbs });
    }
    valid.sort((a: any, b: any) => a.unitCost - b.unitCost);
    let cumX = 0;
    const stairData = [];
    const len = valid.length;
    for (let i = 0; i < len; i++) {
        const m = valid[i];
        const cumStart = cumX;
        const cumEnd = cumX + m.abatAbs;
        const color = resolveStaircaseColor(i, len, m.unitCost);
        stairData.push({ ...m, cumStart, cumEnd, color, index: i + 1 });
        cumX = cumEnd;
    }
    return { stairData, zeroAbat };
}

/**
 * Compute totals from resolved measures (totalCost + totalAbatement).
 *
 * @param {Array<{_cost:number, _abatement:number, enabled?:boolean}>} resolved
 * @returns {{totalCost:number, totalAbatement:number, enabledCount:number}}
 */
export function computeTotals( resolved: any) {
    if (!Array.isArray(resolved)) {
        return { totalCost: 0, totalAbatement: 0, enabledCount: 0 };
    }
    let totalCost = 0;
    let totalAbatement = 0;
    let enabledCount = 0;
    for (const m of resolved) {
        if (!m || m.enabled === false) continue;
        const c = Number(m._cost);
        const a = Number(m._abatement);
        if (Number.isFinite(c)) totalCost += c;
        if (Number.isFinite(a)) totalAbatement += a;
        enabledCount += 1;
    }
    return { totalCost, totalAbatement, enabledCount };
}

/**
 * Compute weighted average abatement cost.
 *
 * @param {number} totalCost
 * @param {number} totalAbatement
 * @returns {number} weighted unit cost or 0 if abatement=0
 */
export function computeWeightedAvgCost(totalCost: any, totalAbatement: any) {
    if (!Number.isFinite(totalCost) || !Number.isFinite(totalAbatement)) return 0;
    if (totalAbatement === 0) return 0;
    return totalCost / totalAbatement;
}

function clamp01(n: any) {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}
