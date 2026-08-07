// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * industrialFireAndExplosion.js
 * Risco de explosão de pó combustível - NFPA 652 (2019) + EN 14460 + Kst.
 *
 * Implementa:
 *   - Classificação de severidade por índice Kst (lei cúbica)
 *   - Estimativa de energia mínima de ignição (MIE) por tipo de pó
 *   - Índice de deflagração dP/dt_max pela lei cúbica de Bartknecht
 *   - Classificação de risco de explosão St0–St3
 *
 * References:
 *   [1] NFPA 652 (2019) Standard on the Fundamentals of Combustible Dust.
 *   [2] EN 14034-1:2004 Determination of explosion characteristics - Pmax.
 *   [3] EN 14034-2:2006 Determination of explosion characteristics - Kst.
 *   [4] Bartknecht, W. (1993) Explosions: Course, Prevention, Protection.
 *       Springer-Verlag, Berlin. ISBN: 3-540-57216-3
 *   [5] Eckhoff, R.K. (2003) Dust Explosions in the Process Industries, 3rd ed.
 *       Gulf Professional Publishing. ISBN: 0-7506-7602-7
 *
 * @module core/analytics/industrialFireAndExplosion
 */

'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

// ---------------------------------------------------------------------------
// Minimum Ignition Energy (MIE) look-up table - mJ
// Values from Bartknecht (1993) Tab. 2.4 + Eckhoff (2003) App. A.
// ---------------------------------------------------------------------------
const MIE_TABLE = {
    flour_wheat: 100,
    sugar: 30,
    starch_corn: 40,
    coal: 60,
    wood_dust: 40,
    polyethylene: 10,
    polypropylene: 30,
    nylon: 750,
    aluminum: 10,
    magnesium: 1,
    iron: 120,
    pvc: 1100, // >1000 mJ — not easily ignitible (Bartknecht 1993)
};

// ---------------------------------------------------------------------------
// Kst classification thresholds (bar·m/s) - NFPA 652 Table 4.1, EN 14034-2
// ---------------------------------------------------------------------------
const KST_CLASSES = [
    { label: 'St0', max: 0 }, // not explosible
    { label: 'St1', max: 200 }, // weak
    { label: 'St2', max: 300 }, // strong
    { label: 'St3', max: Infinity }, // very strong
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calcula o índice de severidade de explosão a partir de Kst e Pmax.
 * Severity Index SI = Kst × Pmax (adimensional composto - Bartknecht 1993 §3.2).
 *
 * Kst classes: St0 (0), St1 (1-200), St2 (201-300), St3 (>300) bar·m/s.
 *
 * @param Kst      - índice de explosão (bar·m/s), >= 0
 * @param Pmax_bar - pressão máxima de explosão (bar), > 0
 * @returns
 */
export function calcExplosionSeverity(
    Kst: number,
    Pmax_bar: number,
): { severityIndex: number; stClass: string } {
    if (typeof Kst !== 'number' || Kst < 0) {
        throw new RangeError('Kst must be a non-negative number (bar·m/s)');
    }
    if (typeof Pmax_bar !== 'number' || Pmax_bar <= 0) {
        throw new RangeError('Pmax_bar must be a positive number');
    }
    const severityIndex = Kst * Pmax_bar;
    const stClass = _classifyKst(Kst);
    return { severityIndex, stClass };
}

/**
 * Estima a Energia Mínima de Ignição (MIE) por tipo de pó.
 *
 * @param dustType - tipo de pó (ver lista interna)
 * @returns
 */
export function calcMinimumIgnitionEnergy(dustType: string): { mie_mJ: number; dustType: string } {
    if (typeof dustType !== 'string' || !dustType.trim()) {
        throw new TypeError('dustType must be a non-empty string');
    }
    const key = dustType.toLowerCase().replace(/\s+/g, '_');
    const mie_mJ = (MIE_TABLE as Record<string, number>)[key];
    if (mie_mJ === undefined) {
        throw new RangeError(`Unknown dustType: "${dustType}". Accepted: ${Object.keys(MIE_TABLE).join(', ')}`);
    }
    return { mie_mJ, dustType: key };
}

/**
 * Calcula a taxa máxima de ascensão de pressão pela lei cúbica de Bartknecht.
 * (dP/dt)_max = Kst / V^(1/3)   [Bartknecht 1993 eq. 3.7]
 *
 * Nota: a lei cúbica pressupõe V >= 0.04 m³ (escala laboratorial mínima ASTM E1226).
 *
 * @param Kst      - índice Kst (bar·m/s), > 0
 * @param volume_m3 - volume do vaso (m³), > 0
 * @returns
 */
export function calcDeflagrationIndex(
    Kst: number,
    volume_m3: number,
): { deflagrationIndex_bar_s: number } {
    if (typeof Kst !== 'number' || Kst < 0) {
        throw new RangeError('Kst must be a non-negative number');
    }
    if (typeof volume_m3 !== 'number' || volume_m3 <= 0) {
        throw new RangeError('volume_m3 must be a positive number');
    }
    if (volume_m3 < 0.04) {
        throw new RangeError('volume_m3 must be >= 0.04 m³ (minimum ASTM E1226 scale)');
    }
    const deflagrationIndex_bar_s = Kst / Math.cbrt(volume_m3);
    return { deflagrationIndex_bar_s };
}

/**
 * Classifica o risco de explosão de pó combinando Kst e concentração.
 * Concentração explosiva: 20–6000 g/m³ (NFPA 652 §5).
 * Sem explosibilidade (St0) se Kst=0 ou concentração fora do intervalo.
 *
 * @param Kst                    - índice Kst (bar·m/s), >= 0
 * @param dustConcentration_g_m3 - concentração de pó (g/m³), >= 0
 * @returns
 */
export function classifyDustExplosionRisk(
    Kst: number,
    dustConcentration_g_m3: number,
): 'no_risk' | 'St1' | 'St2' | 'St3' {
    if (typeof Kst !== 'number' || Kst < 0) {
        throw new RangeError('Kst must be a non-negative number');
    }
    if (typeof dustConcentration_g_m3 !== 'number' || dustConcentration_g_m3 < 0) {
        throw new RangeError('dustConcentration_g_m3 must be a non-negative number');
    }
    const inExplosiveRange = dustConcentration_g_m3 >= 20 && dustConcentration_g_m3 <= 6000;
    if (Kst === 0 || !inExplosiveRange) return 'no_risk';
    const stClass = _classifyKst(Kst);
    return stClass === 'St0' ? 'no_risk' : stClass;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Classifica Kst em St0–St3 per NFPA 652 / EN 14034-2.
 * @param Kst
 * @returns
 */
function _classifyKst(Kst: number): 'St0' | 'St1' | 'St2' | 'St3' {
    for (const cls of KST_CLASSES) {
        if (Kst <= cls.max) return cls.label as 'St0' | 'St1' | 'St2' | 'St3';
    }
    return 'St3';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialFireAndExplosionMeta: AnalyticsModuleMeta = {
    name: 'industrialFireAndExplosion',
    description: 'industrialFireAndExplosion',
    category: 'analytics',
    familyTags: ['industrial', 'fire'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
