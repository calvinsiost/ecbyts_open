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
 * @fileoverview Bowtie Risk Analysis - ISO 31010:2019 + IEC 61882 HAZOP
 *
 * Implements the Bowtie risk analysis method for structured visualization and
 * quantification of hazard scenarios. The Bowtie diagram maps threats (causes)
 * and consequences through a central hazardous event, with barriers (controls)
 * on both the prevention (left) and mitigation (right) sides.
 *
 * Barrier effectiveness is modelled using Probability of Failure on Demand (PFD)
 * following IEC 61511 (Safety Instrumented Systems) conventions.
 *
 * References:
 *   ISO 31010:2019. Risk Management - Risk Assessment Techniques. ISO.
 *   IEC 61882:2016. Hazard and Operability Studies (HAZOP Studies) - Application Guide. IEC.
 *   IEC 61511-1:2016. Functional Safety - Safety Instrumented Systems for the Process
 *     Industry Sector. IEC.
 *   Delvosalle, C. et al. (2006). ARAMIS project: A comprehensive methodology for
 *     the identification of reference accident scenarios. J. Hazardous Materials 130: 200–219.
 *     DOI: 10.1016/j.jhazmat.2005.07.007
 *   Lees, F. P. (1996). Loss Prevention in the Process Industries (2nd ed.).
 *     Butterworth-Heinemann. ISBN 978-0-7506-1547-7.
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

/**
 * Residual risk matrix (frequency × severity) → classification.
 * Frequency categories: catastrophic (≥1e-3/yr), critical (1e-5 to 1e-3), marginal (<1e-5).
 * Severity categories: catastrophic(4), critical(3), marginal(2), negligible(1).
 * Based on MIL-STD-882E and ICAO Safety Management.
 */
const RISK_MATRIX = {
    // [freq_category][severity_category]
    frequent: { 4: 'intolerable', 3: 'intolerable', 2: 'ALARP', 1: 'ALARP' },
    occasional: { 4: 'intolerable', 3: 'ALARP', 2: 'ALARP', 1: 'acceptable' },
    remote: { 4: 'ALARP', 3: 'ALARP', 2: 'acceptable', 1: 'acceptable' },
    improbable: { 4: 'ALARP', 3: 'acceptable', 2: 'acceptable', 1: 'acceptable' },
};

interface Barrier {
    id: string; // Unique barrier identifier
    name: string; // Human-readable name
    type: 'prevention' | 'mitigation'; // Left (prevention) or right (mitigation) side
    PFD: number; // Probability of Failure on Demand (0–1); e.g. 0.01 = SIL 2
    barrierType?: 'passive' | 'active' | 'procedural'; // Classification per Bowtie Pro
}

interface Threat {
    id: string; // Unique threat identifier
    description: string; // Threat description
    frequency: number; // Initiating event frequency (events/yr)
    barrierIds?: string[]; // Barrier IDs assigned to this threat path
}

interface Consequence {
    id: string; // Unique consequence identifier
    description: string; // Consequence description
    severity: number; // Severity score (1–4): 1=negligible, 4=catastrophic
    barrierIds?: string[]; // Barrier IDs assigned to this consequence path
}

/**
 * Builds a Bowtie risk model structure with critical path identification.
 *
 * @param threats          - List of threat scenarios (initiating causes)
 * @param barriers         - List of all barriers (prevention + mitigation)
 * @param consequences     - List of consequence scenarios
 */
export function buildBowTie(
    threats: Threat[],
    barriers: Barrier[],
    consequences: Consequence[],
): {
    threats: Threat[];
    barriers: Barrier[];
    consequences: Consequence[];
    criticalPath: { threatId: string; consequenceId: string; unmitigatedFreq: number }[];
    summary: {
        totalThreats: number;
        totalBarriers: number;
        preventionBarriers: number;
        mitigationBarriers: number;
    };
} {
    if (!Array.isArray(threats) || threats.length === 0) {
        throw new TypeError('threats must be a non-empty array');
    }
    if (!Array.isArray(barriers)) {
        throw new TypeError('barriers must be an array');
    }
    if (!Array.isArray(consequences) || consequences.length === 0) {
        throw new TypeError('consequences must be a non-empty array');
    }

    // Validate required fields
    threats.forEach((t, i) => {
        if (!t.id || typeof t.frequency !== 'number' || t.frequency < 0) {
            throw new RangeError(`threats[${i}]: id and non-negative frequency required`);
        }
    });
    barriers.forEach((b, i) => {
        if (!b.id || typeof b.PFD !== 'number' || b.PFD < 0 || b.PFD > 1) {
            throw new RangeError(`barriers[${i}]: id and PFD in [0,1] required`);
        }
    });
    consequences.forEach((c, i) => {
        if (!c.id || typeof c.severity !== 'number' || c.severity < 1 || c.severity > 4) {
            throw new RangeError(`consequences[${i}]: id and severity in [1,4] required`);
        }
    });

    const barrierMap = new Map(barriers.map((b) => [b.id, b]));

    // Identify critical paths: threat × consequence pairs with highest unmitigated risk
    const criticalPath = [];
    for (const threat of threats) {
        // Prevention barriers reduce threat frequency
        const preventionBIDs = (threat.barrierIds || []).filter((id) => {
            const b = barrierMap.get(id);
            return b && b.type === 'prevention';
        });
        const preventionReduction = preventionBIDs.reduce((acc, id) => {
            const b = barrierMap.get(id);
            return acc * (b ? b.PFD : 1);
        }, 1);
        const mitigatedFreq = threat.frequency * preventionReduction;

        for (const consequence of consequences) {
            // Mitigation barriers reduce consequence likelihood
            const mitigationBIDs = (consequence.barrierIds || []).filter((id) => {
                const b = barrierMap.get(id);
                return b && b.type === 'mitigation';
            });
            const mitigationReduction = mitigationBIDs.reduce((acc, id) => {
                const b = barrierMap.get(id);
                return acc * (b ? b.PFD : 1);
            }, 1);
            const unmitigatedFreq = mitigatedFreq * mitigationReduction;

            if (unmitigatedFreq > 1e-6) {
                // only include non-trivial paths
                criticalPath.push({
                    threatId: threat.id,
                    consequenceId: consequence.id,
                    unmitigatedFreq,
                });
            }
        }
    }

    // Sort by highest residual frequency
    criticalPath.sort((a, b) => b.unmitigatedFreq - a.unmitigatedFreq);

    const preventionBarriers = barriers.filter((b) => b.type === 'prevention').length;
    const mitigationBarriers = barriers.filter((b) => b.type === 'mitigation').length;

    return {
        threats,
        barriers,
        consequences,
        criticalPath: criticalPath.slice(0, 10), // top 10 critical paths
        summary: {
            totalThreats: threats.length,
            totalBarriers: barriers.length,
            preventionBarriers,
            mitigationBarriers,
        },
    };
}

/**
 * Calculates overall barrier system effectiveness as combined PFD.
 *
 * For independent barriers in series (each must fail for the path to fail):
 * PFD_combined = ∏ PFD_i   (IEC 61511, independence assumption)
 *
 * @param barriers - Array of barriers to evaluate
 */
export function calcBarrierEffectiveness(barriers: Barrier[]): {
    overallPFD: number;
    overallRRF: number;
    SIL: number | null;
    independentCount: number;
} {
    if (!Array.isArray(barriers) || barriers.length === 0) {
        throw new TypeError('barriers must be a non-empty array');
    }

    const overallPFD = barriers.reduce((acc, b) => {
        if (typeof b.PFD !== 'number' || b.PFD < 0 || b.PFD > 1) {
            throw new RangeError(`Barrier ${b.id || '?'}: PFD must be in [0,1]`);
        }
        return acc * b.PFD;
    }, 1);

    const overallRRF = overallPFD === 0 ? Infinity : 1 / overallPFD;

    // IEC 61511 SIL assignment by RRF
    let SIL: number | null = null;
    if (overallRRF >= 10000) SIL = 4;
    else if (overallRRF >= 1000) SIL = 3;
    else if (overallRRF >= 100) SIL = 2;
    else if (overallRRF >= 10) SIL = 1;

    return {
        overallPFD,
        overallRRF,
        SIL,
        independentCount: barriers.length,
    };
}

/**
 * Calculates the mitigated (residual) hazard frequency after applying prevention barriers.
 *
 * f_mitigated = f_hazard × ∏ PFD_i   (for each prevention barrier i)
 *
 * @param hazardFreq      - Initiating event frequency (events/yr)
 * @param barriers        - Prevention barriers (only 'prevention' type used)
 */
export function calcRiskReduction(
    hazardFreq: number,
    barriers: Barrier[],
): { mitigatedFreq: number; riskReductionFactor: number; barrierCount: number } {
    if (typeof hazardFreq !== 'number' || hazardFreq < 0) {
        throw new RangeError('hazardFreq must be >= 0 (events/yr)');
    }
    if (!Array.isArray(barriers)) {
        throw new TypeError('barriers must be an array');
    }

    const prevBarriers = barriers.filter((b) => b.type === 'prevention');
    if (prevBarriers.length === 0) {
        return { mitigatedFreq: hazardFreq, riskReductionFactor: 1, barrierCount: 0 };
    }

    const { overallPFD } = calcBarrierEffectiveness(prevBarriers);
    const mitigatedFreq = hazardFreq * overallPFD;
    const riskReductionFactor = hazardFreq === 0 ? 1 : hazardFreq / mitigatedFreq;

    return {
        mitigatedFreq,
        riskReductionFactor,
        barrierCount: prevBarriers.length,
    };
}

/**
 * Classifies residual risk using a frequency × severity risk matrix.
 * Based on MIL-STD-882E and ISO 31010:2019 Table A.2.
 *
 * @param freq     - Residual hazard frequency (events/yr)
 * @param severity - Consequence severity: 1=negligible, 2=marginal, 3=critical, 4=catastrophic
 */
export function classifyResidualRisk(
    freq: number,
    severity: 1 | 2 | 3 | 4,
): 'acceptable' | 'ALARP' | 'intolerable' {
    if (typeof freq !== 'number' || freq < 0) {
        throw new RangeError('freq must be >= 0 (events/yr)');
    }
    if (![1, 2, 3, 4].includes(severity)) {
        throw new RangeError('severity must be 1, 2, 3, or 4');
    }

    let freqCategory;
    if (freq >= 1e-3) freqCategory = 'frequent';
    else if (freq >= 1e-5) freqCategory = 'occasional';
    else if (freq >= 1e-7) freqCategory = 'remote';
    else freqCategory = 'improbable';

    return (RISK_MATRIX as Record<string, Record<number, string>>)[freqCategory]![
        severity
    ] as 'acceptable' | 'ALARP' | 'intolerable';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialSafetyBowTieMeta: AnalyticsModuleMeta = {
    name: 'industrialSafetyBowTie',
    description: 'industrialSafetyBowTie',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
