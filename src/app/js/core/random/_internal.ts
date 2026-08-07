// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
import { buildObservationCost } from '../ingestion/documents/costCatalog.js';
import { generateId } from '../../utils/helpers/id.js';
import { pick, randInt } from '../elements/randomHelpers.js';
import { runtimeDate, runtimeNow, runtimeRandom } from './runtime.js';
import { createObservations as _createObservations, createCorrelatedWellObservations as _createCorrelatedWellObservations, createCorrelatedPlumeObservations as _createCorrelatedPlumeObservations, } from './phase-observations.js';
import { PARAMETER_RANGES, FAMILY_PARAMETERS, FAMILY_VARIABLES } from './model-catalog.js';
export function createObservationHelperSet({ contaminationMult = 1.0, densityMult = 1.0, includeCosts = true } = {}) {
    const observationRuntime = {
        familyParameters: FAMILY_PARAMETERS,
        familyVariables: FAMILY_VARIABLES,
        parameterRanges: PARAMETER_RANGES,
        runtimeRandom,
        generateId,
        buildObservationCost,
        contaminationMult,
        densityMult,
        includeCosts,
    };
    return {
        generateObservations: (familyId: any, position: any, campaigns: any) => _createObservations(familyId, position, campaigns, observationRuntime),
        generateCorrelatedWellObs: (wellPos: any, plumeTimeline: any, plumeCenter: any, campaigns: any) => _createCorrelatedWellObservations(wellPos, plumeTimeline, plumeCenter, campaigns, observationRuntime),
        generateCorrelatedPlumeObs: (plumeTimeline: any, baseCenter: any, campaigns: any) => _createCorrelatedPlumeObservations(plumeTimeline, baseCenter, campaigns, observationRuntime),
    };
}
export function generatePlumeTimeline(baseShape: any, baseCenter: any, numSteps: any, shrinkFactor: any) {
    const timeline = [];
    for (let i = 0; i < numSteps; i++) {
        const progress = numSteps > 1 ? i / (numSteps - 1) : 0;
        const scale = 1 - progress * shrinkFactor;
        const jitter = () => 0.95 + runtimeRandom('model') * 0.1;
        timeline.push({
            shape: {
                radiusX: baseShape.radiusX * scale * jitter(),
                radiusY: baseShape.radiusY * scale * jitter(),
                radiusZ: baseShape.radiusZ * scale * jitter(),
            },
            center: {
                x: baseCenter.x + (runtimeRandom('model') - 0.5) * 2,
                y: baseCenter.y,
                z: baseCenter.z + (runtimeRandom('model') - 0.5) * 2,
            },
        });
    }
    return timeline;
}
export function computeZoneCentroids(features: any) {
    if (!features || features.length === 0)
        return null;
    const groups: { building: any[]; water: any[]; vegetation: any[]; soil: any[] } = { building: [], water: [], vegetation: [], soil: [] };
    for (const feature of features) {
        if (['building', 'tank'].includes(feature.family))
            groups.building.push(feature);
        else if (['lake', 'river'].includes(feature.family))
            groups.water.push(feature);
        else if (feature.family === 'habitat')
            groups.vegetation.push(feature);
        else
            groups.soil.push(feature);
    }
    const total = features.length;
    const populated = Object.values(groups).filter((group) => group.length > 0).length;
    const maxPct = Math.max(...Object.values(groups).map((group) => group.length)) / total;
    if (populated < 3 || maxPct > 0.7)
        return null;
    const centroid = (entries: any) => {
        if (entries.length === 0)
            return null;
        let sx = 0;
        let sz = 0;
        let sw = 0;
        for (const feature of entries) {
            const weight = feature.confidence ?? 0.5;
            sx += feature.position.x * weight;
            sz += feature.position.z * weight;
            sw += weight;
        }
        return { x: sx / sw, z: sz / sw };
    };
    return {
        industrial: centroid(groups.building),
        water: centroid(groups.water),
        natural: centroid(groups.vegetation),
        monitoring: centroid(groups.soil),
    };
}
export function buildRandomUncertaintyPack() {
    const matrix = pick(['groundwater', 'soil', 'surface_water']);
    const q2qLabel = pick(['low', 'medium', 'high']);
    const exceedance = Number((0.25 + runtimeRandom('model') * 0.5).toFixed(2));
    const coverage = 0.95;
    const k = 2;
    const mcSamples = 2000;
    const candidates = [
        `well-${randInt(1, 9)},0.8,0.3,0.2,${randInt(30, 50)}`,
        `well-${randInt(10, 19)},0.6,0.2,0.3,${randInt(25, 40)}`,
        `well-${randInt(20, 29)},0.4,0.15,0.5,${randInt(15, 25)}`,
    ].join('\n');
    const action = exceedance >= 0.8 ? 'block' : exceedance >= 0.6 ? 'warn' : 'allow';
    const nowIso = runtimeDate().toISOString();
    return {
        schemaVersion: 'uncertainty-hub-pack.v1',
        policyDraft: {
            workspace_id: null,
            matrix,
            project_id: null,
            coverage,
            k_default: k,
            monte_carlo_samples: mcSamples,
        },
        q2qInput: { label: q2qLabel, runType: 'exploratory' },
        decisionInput: { exceedanceProb: exceedance, runType: 'exploratory' },
        optimizationInput: {
            seed: 42 + randInt(1, 999),
            budget: 100,
            candidatesRaw: candidates,
        },
        rules: [
            {
                id: 'warn-1',
                metric: 'exceedanceProb',
                operator: '>=',
                threshold: 0.6,
                severity: 'warn',
                required: true,
            },
            {
                id: 'block-1',
                metric: 'exceedanceProb',
                operator: '>=',
                threshold: 0.8,
                severity: 'block',
                required: true,
            },
        ],
        resultsHistory: [
            {
                at: runtimeDate(runtimeNow() - 3600 * 1000).toISOString(),
                action,
                exceedance: Number((exceedance * 0.9).toFixed(2)),
                selectedCount: 2,
                uRel: 0.18,
            },
            { at: nowIso, action, exceedance, selectedCount: 3, uRel: 0.2 },
        ],
        lastResults: {
            policy: { source: 'workspace_default', matrix, coverage, k_default: k },
            q2q: { label: q2qLabel, mapped: { relDefault: 0.2 } },
            decision: { action, threshold: 0.6 },
            optimization: {
                selected: [
                    { id: `well-${randInt(1, 9)}`, infoGain: 0.8, residualRisk: 0.2, normalizedCost: 0.3 },
                    { id: `well-${randInt(10, 19)}`, infoGain: 0.6, residualRisk: 0.3, normalizedCost: 0.2 },
                ],
            },
            propagation: {
                policy_source: 'workspace_default',
                q2q_label: q2qLabel,
                q2q_u_rel: 0.2,
                exceedance_input: exceedance,
                rule_action: action,
            },
            sensitivity: {
                topDrivers: [
                    { id: `well-${randInt(1, 9)}`, score: 0.3 },
                    { id: `well-${randInt(10, 19)}`, score: 0.1 },
                    { id: `well-${randInt(20, 29)}`, score: -0.3 },
                ],
            },
            diff: { decisionActionChanged: false, decision: { before: action, after: action }, selectedCountDelta: 1 },
            executedAt: nowIso,
        },
        policyHistory: [
            {
                revisionId: `pol-rev-${runtimeNow() - 86400 * 1000}`,
                savedAt: runtimeDate(runtimeNow() - 86400 * 1000).toISOString(),
                savedBy: 'random-seed',
                note: 'Policy inicial (gerada pelo random model)',
                policyDraft: { matrix, coverage, k_default: k, monte_carlo_samples: mcSamples },
            },
        ],
        ecbt: { key: null, savedAt: null },
        seededFromRandomModel: true,
    };
}
export function createDefaultElements(addElement: any) {
    addElement('plume', 'plume-shallow', 'Shallow Plume', {
        depth: { level: 'shallow', top: 0, bottom: -15 },
        shape: { radiusX: 18, radiusY: 14, radiusZ: 5 },
        center: { x: 0, y: -7.5, z: 0 },
    });
    addElement('plume', 'plume-middle', 'Middle Plume', {
        depth: { level: 'middle', top: -15, bottom: -40 },
        shape: { radiusX: 14, radiusY: 11, radiusZ: 8 },
        center: { x: 0, y: -27.5, z: 0 },
    });
    addElement('plume', 'plume-deep', 'Deep Plume', {
        depth: { level: 'deep', top: -40, bottom: -80 },
        shape: { radiusX: 10, radiusY: 8, radiusZ: 12 },
        center: { x: 0, y: -60, z: 0 },
    });
    const wells = [
        { id: 'PM-01', x: 15, z: 10 },
        { id: 'PM-02', x: -12, z: 15 },
        { id: 'PM-03', x: 5, z: -18 },
    ];
    wells.forEach((well) => {
        addElement('well', well.id, well.id, {
            coordinates: { easting: well.x, northing: well.z, elevation: 0 },
            construction: { totalDepth: 50, diameter: 4 },
            profile: buildSimpleWellProfile(50, 4),
        });
    });
}
function buildSimpleWellProfile(totalDepth: any, diameter: any) {
    const lithologic = [
        { from: 0, to: 5, soilType: 'clay', description: 'Argila superficial' },
        { from: 5, to: 20, soilType: 'fine_sand', description: 'Areia fina' },
        { from: 20, to: totalDepth, soilType: 'rock', description: 'Rocha' },
    ];
    const screenTop = Math.round(totalDepth * 0.4 * 10) / 10;
    const screenBottom = Math.round((totalDepth - 1) * 10) / 10;
    const elements = [
        { type: 'surface_completion', topDepth: 0, bottomDepth: 0.5 },
        { type: 'cement_seal', topDepth: 0.5, bottomDepth: 3 },
        { type: 'blank_casing', topDepth: 0, bottomDepth: screenTop },
        { type: 'screen', topDepth: screenTop, bottomDepth: screenBottom, properties: { slotSize: 0.5 } },
        { type: 'gravel_pack', topDepth: screenTop, bottomDepth: screenBottom },
        { type: 'sump', topDepth: screenBottom, bottomDepth: totalDepth },
    ];
    return {
        constructive: {
            totalDepth,
            drillingDepth: totalDepth,
            boreholeDiameter: 10,
            casingDiameter: diameter,
            drillingMethod: 'hollow_stem_auger',
            elements,
        },
        lithologic,
    };
}
//# sourceMappingURL=_internal.js.map
