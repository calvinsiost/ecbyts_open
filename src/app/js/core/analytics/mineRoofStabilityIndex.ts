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
 * Mine Roof Stability Index
 * Índice de estabilidade de teto de mina subterrânea - Barton Q-system (1974) e
 * Bieniawski RMR (1989).
 *
 * References / Referências:
 *   - Barton, N., Lien, R., Lunde, J. (1974). Engineering classification of rock masses
 *     for the design of tunnel support. Rock Mechanics, 6(4), 189–236.
 *     DOI: 10.1007/BF01239496
 *   - Bieniawski, Z.T. (1989). Engineering Rock Mass Classifications.
 *     Wiley-Interscience, New York. ISBN: 978-0-471-60172-2
 *
 * @module mineRoofStabilityIndex
 */

// ─── Barton Q-System ──────────────────────────────────────────────────────────

/**
 * Computes Barton Q-index for underground excavation stability.
 * Calcula o índice Q de Barton para estabilidade de escavações subterrâneas.
 *
 * Q = (RQD / Jn) * (Jr / Ja) * (Jw / SRF)
 *
 * @param {object} params
 * @param {number} params.RQD - Rock Quality Designation (%) [0–100]
 * @param {number} params.Jn  - Joint set number (Barton Table 2): 0.5–20
 * @param {number} params.Jr  - Joint roughness number (Barton Table 3): 0.5–4
 * @param {number} params.Ja  - Joint alteration number (Barton Table 4): 0.75–20
 * @param {number} params.Jw  - Joint water reduction factor (Barton Table 5): 0.05–1
 * @param {number} params.SRF - Stress reduction factor (Barton Table 6): 0.5–400
 * @returns {{ Q: number, classification: string, description: string }}
 * @throws {RangeError}
 */
export function bartonQ({ RQD, Jn, Jr, Ja, Jw, SRF }: { RQD: number; Jn: number; Jr: number; Ja: number; Jw: number; SRF: number }): { Q: number, classification: string, description: string } {
    if (RQD < 0 || RQD > 100) throw new RangeError(`RQD must be [0,100], got ${RQD}`);
    if (Jn <= 0) throw new RangeError(`Jn must be > 0, got ${Jn}`);
    if (Jr <= 0) throw new RangeError(`Jr must be > 0, got ${Jr}`);
    if (Ja <= 0) throw new RangeError(`Ja must be > 0, got ${Ja}`);
    if (Jw <= 0 || Jw > 1) throw new RangeError(`Jw must be in (0,1], got ${Jw}`);
    if (SRF <= 0) throw new RangeError(`SRF must be > 0, got ${SRF}`);

    const Q = (RQD / Jn) * (Jr / Ja) * (Jw / SRF);

    let classification, description;
    if (Q < 0.01) {
        classification = 'exceptionally_poor';
        description = 'Exceptionally poor — immediate heavy support required';
    } else if (Q < 0.1) {
        classification = 'extremely_poor';
        description = 'Extremely poor — systematic heavy support required';
    } else if (Q < 1) {
        classification = 'very_poor';
        description = 'Very poor — systematic support required';
    } else if (Q < 4) {
        classification = 'poor';
        description = 'Poor — rock bolts + shotcrete recommended';
    } else if (Q < 10) {
        classification = 'fair';
        description = 'Fair — spot bolting may suffice';
    } else if (Q < 40) {
        classification = 'good';
        description = 'Good — minimal support required';
    } else if (Q < 100) {
        classification = 'very_good';
        description = 'Very good — unsupported spans feasible';
    } else if (Q < 400) {
        classification = 'extremely_good';
        description = 'Extremely good — unsupported large spans feasible';
    } else {
        classification = 'exceptionally_good';
        description = 'Exceptionally good — no support needed';
    }

    return { Q, classification, description };
}

// ─── Bieniawski RMR ───────────────────────────────────────────────────────────

/**
 * Computes Bieniawski Rock Mass Rating (RMR89) and rock class.
 * Calcula o RMR de Bieniawski (1989) e classifica a classe de rocha.
 *
 * RMR = R1 + R2 + R3 + R4 + R5 + adjustment_joints
 *
 * @param {object} params
 * @param {number} params.R1  - UCS (MPa) rating [0–15]
 * @param {number} params.R2  - RQD (%) rating [3–20]
 * @param {number} params.R3  - Spacing of discontinuities rating [5–20]
 * @param {number} params.R4  - Condition of discontinuities rating [0–30]
 * @param {number} params.R5  - Groundwater rating [0–15]
 * @param {number} [params.adjustmentJoints=0] - Joint orientation adjustment [-12 to 0]
 * @returns {{ RMR: number, rockClass: string, description: string, standupTime: string }}
 * @throws {RangeError}
 */
export function bieniawskiRMR({ R1, R2, R3, R4, R5, adjustmentJoints = 0 }: { R1: number; R2: number; R3: number; R4: number; R5: number; adjustmentJoints?: number }): { RMR: number, rockClass: string, description: string, standupTime: string } {
    if (R1 < 0 || R1 > 15) throw new RangeError(`R1 (UCS rating) must be [0,15], got ${R1}`);
    if (R2 < 0 || R2 > 20) throw new RangeError(`R2 (RQD rating) must be [0,20], got ${R2}`);
    if (R3 < 0 || R3 > 20) throw new RangeError(`R3 (spacing rating) must be [0,20], got ${R3}`);
    if (R4 < 0 || R4 > 30) throw new RangeError(`R4 (discontinuity rating) must be [0,30], got ${R4}`);
    if (R5 < 0 || R5 > 15) throw new RangeError(`R5 (groundwater rating) must be [0,15], got ${R5}`);
    if (adjustmentJoints < -12 || adjustmentJoints > 0) {
        throw new RangeError(`adjustmentJoints must be [-12,0], got ${adjustmentJoints}`);
    }

    const RMR = R1 + R2 + R3 + R4 + R5 + adjustmentJoints;

    let rockClass, description, standupTime;
    if (RMR >= 81) {
        rockClass = 'I';
        description = 'Very good rock';
        standupTime = '> 10 years for 15 m span';
    } else if (RMR >= 61) {
        rockClass = 'II';
        description = 'Good rock';
        standupTime = '6 months for 8 m span';
    } else if (RMR >= 41) {
        rockClass = 'III';
        description = 'Fair rock';
        standupTime = '1 week for 5 m span';
    } else if (RMR >= 21) {
        rockClass = 'IV';
        description = 'Poor rock';
        standupTime = '10 hours for 2.5 m span';
    } else {
        rockClass = 'V';
        description = 'Very poor rock';
        standupTime = '30 minutes for 1 m span';
    }

    return { RMR, rockClass, description, standupTime };
}

// ─── Support Recommendation ───────────────────────────────────────────────────

/**
 * Provides support recommendation based on Q-index for a given excavation span.
 * Recomendação de suporte com base no Q de Barton e abertura da escavação.
 *
 * Equivalent Dimension De = span / ESR (Excavation Support Ratio)
 * From Grimstad & Barton (1993) support chart.
 *
 * @param {object} params
 * @param {number} params.Q    - Barton Q value
 * @param {number} params.span - Excavation span or wall height (m)
 * @param {number} [params.ESR=1.0] - Excavation Support Ratio (Barton 1974 Table 7)
 *   Typical values: temporary mine openings=3–5, permanent mines=1.6, tunnels=1.0
 * @returns {{ De: number, boltSpacing_m: number, shotcreteThickness_mm: number, category: string }}
 * @throws {RangeError}
 */
export function supportRecommendation({ Q, span, ESR = 1.0 }: { Q: number; span: number; ESR?: number }): { De: number, boltSpacing_m: number, shotcreteThickness_mm: number, category: string } {
    if (Q <= 0) throw new RangeError(`Q must be > 0, got ${Q}`);
    if (span <= 0) throw new RangeError(`span must be > 0, got ${span}`);
    if (ESR <= 0) throw new RangeError(`ESR must be > 0, got ${ESR}`);

    const De = span / ESR;

    // Bolt spacing e shotcrete estimados da tabela Grimstad & Barton 1993
    // Valores interpolados em função de log10(Q) e De
    let boltSpacing_m, shotcreteThickness_mm, category;

    if (Q >= 40) {
        boltSpacing_m = 2.5;
        shotcreteThickness_mm = 0;
        category = 'unsupported_or_spot_bolting';
    } else if (Q >= 10) {
        boltSpacing_m = 2.0;
        shotcreteThickness_mm = 40;
        category = 'spot_bolting_with_shotcrete';
    } else if (Q >= 4) {
        boltSpacing_m = 1.7;
        shotcreteThickness_mm = 50;
        category = 'systematic_bolting';
    } else if (Q >= 1) {
        boltSpacing_m = 1.5;
        shotcreteThickness_mm = 90;
        category = 'systematic_bolting_shotcrete';
    } else if (Q >= 0.1) {
        boltSpacing_m = 1.2;
        shotcreteThickness_mm = 150;
        category = 'reinforced_ribs_of_shotcrete';
    } else {
        boltSpacing_m = 1.0;
        shotcreteThickness_mm = 200;
        category = 'cast_concrete_lining';
    }

    return { De, boltSpacing_m, shotcreteThickness_mm, category };
}

// ─── Combined Stability Score ──────────────────────────────────────────────────

/**
 * Combined stability assessment merging Q and RMR into a normalized score [0,1].
 * Avaliação combinada de estabilidade integrando Q e RMR.
 *
 * Uses empirical relationship: RMR ≈ 9 * ln(Q) + 44 (Bieniawski 1976).
 * Combined score normalizes both indices to [0,1] for comparison.
 *
 * @param {number} Q   - Barton Q (must be > 0)
 * @param {number} RMR - Bieniawski RMR (0–100)
 * @returns {{ combinedScore: number, predictedRMR_from_Q: number, discrepancy: number }}
 * @throws {RangeError}
 */
export function combinedStabilityScore(Q: number, RMR: number): { combinedScore: number, predictedRMR_from_Q: number, discrepancy: number } {
    if (Q <= 0) throw new RangeError(`Q must be > 0, got ${Q}`);
    if (RMR < 0 || RMR > 100) throw new RangeError(`RMR must be [0,100], got ${RMR}`);

    // Bieniawski (1976) empirical correlation
    const predictedRMR_from_Q = 9 * Math.log(Q) + 44;

    // Score normalizado: Q em escala log, RMR em escala linear
    const qScore = Math.min(1, Math.max(0, (Math.log10(Q) + 3) / 5.6)); // Q de 0.001 a ~400
    const rmrScore = RMR / 100;
    const combinedScore = (qScore + rmrScore) / 2;
    const discrepancy = Math.abs(predictedRMR_from_Q - RMR);

    return { combinedScore, predictedRMR_from_Q, discrepancy };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const mineRoofStabilityIndexMeta: AnalyticsModuleMeta = {
    name: 'mineRoofStabilityIndex',
    description: 'mineRoofStabilityIndex',
    category: 'analytics',
    familyTags: ['mining'],
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
