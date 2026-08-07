// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Phase Observations Builder - RANDOM-REBUILD-V2 Phase C.6.
 *
 * Extracts observation generation helpers from randomModel.js while keeping
 * parameter families, ranges, and runtime tuning injected explicitly.
 */

// RANDOM-COV-001 F1 (RF-3) — anexa CAS às observações de contaminante para
// destravar o motor de risco CETESB sobre dados sintéticos. Substância única →
// CAS; agregados (TPH/BTEX/VOC) e parâmetros não-contaminantes → null.
import { casForParameterId } from './_casMapPure.js';
// RANDOM-COV-001 F1 (RF-4) — ancora a concentração-base do contaminante nas
// bandas regulatórias VR/VP/VI (em vez de min..max plano), via resolver de
// thresholds (CAS→globalThresholds) + sampler de banda por nível de contaminação.
import { resolveThresholdsForParameter } from './_thresholdResolverPure.js';
import { sampleConcentrationInBand, bandForContaminationLevel } from './_concentrationBandsPure.js';
// RANDOM-COV-001 (spec §8) — flag RANDOM_COV_V2 (default OFF no rollout):
// OFF → RF-3 (CAS) e RF-4 (bandas VR/VP/VI) desligados, comportamento pré-F1
// (cas=null, concentração-base no range plano min..max). Override de teste:
// runtime.randomCovV2 boolean explícito vence o CONFIG.
import { CONFIG } from '../../config.js';
import { resolveRandomCovV2Enabled } from './_randomCovFlagPure.js';

/** Resolve o flag RANDOM_COV_V2: runtime.randomCovV2 boolean vence o CONFIG. */
function resolveCovV2(runtime: any): boolean {
    return typeof runtime?.randomCovV2 === 'boolean' ? runtime.randomCovV2 : resolveRandomCovV2Enabled(CONFIG);
}

/** Reverte o multiplicador de contaminação para o nível (constants.contaminationMultiplier). */
function levelFromMult(mult: number): 'low' | 'medium' | 'high' {
    if (!(typeof mult === 'number') || mult <= 0.5) return 'low';
    if (mult <= 1.5) return 'medium';
    return 'high';
}

/**
 * Converte um valor em µg/L (unidade nativa do resolver de thresholds) para a
 * unidade de concentração do parâmetro. Cobre os casos de groundwater; retorna
 * null quando a unidade não é compatível (caller usa fallback range-based).
 */
function convertFromUgL(valueUgL: number, targetUnitId: string): number | null {
    if (targetUnitId === 'ug_L') return valueUgL;
    if (targetUnitId === 'mg_L') return valueUgL / 1000;
    return null; // matriz/unidade não-groundwater → sem ancoragem por banda
}

const CONTAMINANT_PARAMS = new Set([
    'benzene',
    'toluene',
    'ethylbenzene',
    'xylenes',
    'naphthalene',
    'tph',
    'btex',
    'voc',
    'bod',
    'cod',
    'tss',
]);

const CREDENTIAL_WEIGHTS = [
    { level: 'common', weight: 50 },
    { level: 'professional', weight: 25 },
    { level: 'pos_graduado', weight: 12 },
    { level: 'mestre', weight: 8 },
    { level: 'doutor', weight: 5 },
];
const CREDENTIAL_TOTAL_WEIGHT = CREDENTIAL_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);

function assertRuntime(name: string, runtimePairs: Array<[string, any]>): void {
    for (const [label, value] of runtimePairs) {
        if (typeof value !== 'function') {
            throw new Error(`${name} requires explicit runtime helper: ${label}`);
        }
    }
}

function formatObservationValue(value: number): number {
    if (value < 0.1) return Math.round(value * 10000) / 10000;
    if (value < 10) return Math.round(value * 100) / 100;
    return Math.round(value * 10) / 10;
}

function shuffleWithRuntime(items: any[], runtimeRandom: (scope: string) => number): any[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(runtimeRandom('model') * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

function randomCredentialLevel(runtimeRandom: (scope: string) => number): string {
    let roll = runtimeRandom('model') * CREDENTIAL_TOTAL_WEIGHT;
    for (const { level, weight } of CREDENTIAL_WEIGHTS) {
        roll -= weight;
        if (roll <= 0) return level;
    }
    return 'common';
}

function generateParameterValue(
    parameterId: string,
    runtime: any = {},
): { value: number; unitId: string } {
    const { parameterRanges, runtimeRandom, contaminationMult = 1.0 } = runtime;
    const range = parameterRanges?.[parameterId];
    if (!range) return { value: runtimeRandom('model') * 100, unitId: 'mg_L' };

    // RF-4: para contaminante de substância única com thresholds resolvíveis e
    // unidade de groundwater (ug_L/mg_L), ancora a concentração-base nas bandas
    // VR/VP/VI conforme o nível de contaminação — mais realista que min..max plano.
    // Qualquer outra mídia/unidade (solo mg_kg etc.) cai no fallback abaixo.
    // RANDOM-COV-001 spec §8: só com o flag RANDOM_COV_V2 ON (rollback OFF →
    // range plano, comportamento pré-F1).
    const thresholds = runtime.randomCovV2 === true ? resolveThresholdsForParameter(parameterId) : null;
    if (thresholds && (range.unitId === 'ug_L' || range.unitId === 'mg_L')) {
        const rng = () => runtimeRandom('model');
        const band = bandForContaminationLevel(levelFromMult(contaminationMult), rng);
        const valueUgL = sampleConcentrationInBand(thresholds, band, rng);
        const value = convertFromUgL(valueUgL, range.unitId);
        if (value !== null) return { value: formatObservationValue(value), unitId: range.unitId };
    }

    const isConcentration =
        range.unitId &&
        ![
            'pH',
            'celsius',
            'm',
            'mV',
            'percent',
            'score',
            'dBA',
            'per_1M_hh',
            'days_per_1M',
            'per_200k_hh',
            'count',
        ].includes(range.unitId);
    const multiplier = isConcentration ? contaminationMult : 1.0;
    const effectiveMax = range.max * multiplier;
    const value = range.min + runtimeRandom('model') * (effectiveMax - range.min);

    return { value: formatObservationValue(value), unitId: range.unitId };
}

export function createObservations(
    familyId: string,
    position: { x?: number; y?: number; z?: number },
    campaigns: any[],
    runtime: any = {},
): any[] {
    const {
        familyParameters,
        familyVariables,
        parameterRanges,
        runtimeRandom,
        generateId,
        buildObservationCost,
        densityMult = 1.0,
        includeCosts = true,
    } = runtime;
    assertRuntime('createObservations', [
        ['runtimeRandom', runtimeRandom],
        ['generateId', generateId],
        ['buildObservationCost', buildObservationCost],
    ]);

    const randomCovV2 = resolveCovV2(runtime);
    const observations: any[] = [];
    const parameters = familyParameters?.[familyId] || ['pH', 'temperature'];
    const maxParams = Math.max(1, Math.ceil(3 * densityMult));
    const numParams = 1 + Math.floor(runtimeRandom('model') * Math.min(maxParams, parameters.length));
    const selectedParams = shuffleWithRuntime([...parameters], runtimeRandom).slice(0, numParams);

    const baseValues: Record<string, { base: number; unitId: string }> = {};
    selectedParams.forEach((parameterId: string) => {
        const { value, unitId } = generateParameterValue(parameterId, {
            parameterRanges,
            runtimeRandom,
            contaminationMult: runtime.contaminationMult,
            randomCovV2,
        });
        baseValues[parameterId] = { base: value, unitId };
    });

    campaigns.forEach((campaign: any, campaignIndex: number) => {
        const progress = campaigns.length > 1 ? campaignIndex / (campaigns.length - 1) : 0;

        selectedParams.forEach((parameterId: string) => {
            const { base, unitId } = baseValues[parameterId] as { base: number; unitId: string };
            let value;
            if (CONTAMINANT_PARAMS.has(parameterId)) {
                const decay = 1 - progress * (0.3 + runtimeRandom('model') * 0.3);
                value = base * decay * (0.9 + runtimeRandom('model') * 0.2);
            } else {
                value = base * (0.85 + runtimeRandom('model') * 0.3);
            }

            const isPlanned = runtimeRandom('model') < 0.25;
            const dateStr = campaign.date.toISOString().slice(0, 10);
            const px = position.x || 0;
            const py = position.y || 0;
            const pz = position.z || 0;

            observations.push({
                id: generateId('obs'),
                showPlanning: isPlanned,
                plannedDate: isPlanned ? dateStr : null,
                plannedParameterId: isPlanned ? parameterId : null,
                plannedUnitId: isPlanned ? unitId : null,
                plannedX: isPlanned ? px : null,
                plannedY: isPlanned ? py : null,
                plannedZ: isPlanned ? pz : null,
                expectedValue: null,
                x: px,
                y: py,
                z: pz,
                date: dateStr,
                campaignId: campaign.id,
                parameterId,
                cas: randomCovV2 ? casForParameterId(parameterId) : null,
                value: formatObservationValue(value),
                unitId,
                autoConvert: false,
                qualFields: [],
                additionalReadings: [],
                postProcessing: [],
                variables: { ...(familyVariables?.[familyId] || {}) },
                credentialLevel: randomCredentialLevel(runtimeRandom),
                createdBy: null,
                cost: includeCosts ? buildObservationCost(parameterId) : null,
            });
        });
    });

    return observations;
}

function distanceAttenuation(
    wellPos: { x?: number; z?: number },
    plumeCenter: { x: number; z: number },
    avgRadius: number,
): number {
    const dx = (wellPos.x || 0) - plumeCenter.x;
    const dz = (wellPos.z || 0) - plumeCenter.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const attenuationFactor = 1.5;
    return Math.exp((-attenuationFactor * distance) / Math.max(avgRadius, 1));
}

export function createCorrelatedWellObservations(
    wellPos: { x?: number; y?: number; z?: number },
    plumeTimeline: any[],
    plumeCenter: { x: number; z: number },
    campaigns: any[],
    runtime: any = {},
): any[] {
    const {
        familyVariables,
        parameterRanges,
        runtimeRandom,
        generateId,
        buildObservationCost,
        includeCosts = true,
    } = runtime;
    assertRuntime('createCorrelatedWellObservations', [
        ['runtimeRandom', runtimeRandom],
        ['generateId', generateId],
        ['buildObservationCost', buildObservationCost],
    ]);

    const randomCovV2 = resolveCovV2(runtime);
    const observations: any[] = [];
    const baseHydro: {
        pH: number;
        conductivity: number;
        temperature: number;
        redox: number;
        water_level: number;
        [k: string]: number | undefined;
    } = {
        pH: 5.5 + runtimeRandom('model') * 3.0,
        conductivity: 200 + runtimeRandom('model') * 1500,
        temperature: 16 + runtimeRandom('model') * 8,
        redox: -200 + runtimeRandom('model') * 500,
        water_level: -12 + runtimeRandom('model') * 10,
    };
    const baseCont: Record<string, number> = {
        benzene: 0.5 + runtimeRandom('model') * 4.0,
        toluene: 50 + runtimeRandom('model') * 500,
        ethylbenzene: 20 + runtimeRandom('model') * 200,
        xylenes: 30 + runtimeRandom('model') * 350,
        naphthalene: 5 + runtimeRandom('model') * 40,
        tph: 10 + runtimeRandom('model') * 80,
        btex: 1 + runtimeRandom('model') * 40,
        voc: 0.5 + runtimeRandom('model') * 15,
    };
    const allParams = [
        'pH',
        'conductivity',
        'temperature',
        'redox',
        'water_level',
        'benzene',
        'toluene',
        'ethylbenzene',
        'xylenes',
        'naphthalene',
        'tph',
        'btex',
        'voc',
    ];

    campaigns.forEach((campaign, campaignIndex) => {
        const snapshot = plumeTimeline[campaignIndex];
        if (!snapshot) return;

        const avgRadius = (snapshot.shape.radiusX + snapshot.shape.radiusY) / 2;
        const attenuation = distanceAttenuation(wellPos, plumeCenter, avgRadius);

        allParams.forEach((parameterId) => {
            const range = parameterRanges?.[parameterId];
            if (!range) return;

            let value;
            if (CONTAMINANT_PARAMS.has(parameterId)) {
                value = (baseCont[parameterId] || 1) * attenuation;
                value *= 0.9 + runtimeRandom('model') * 0.2;
            } else if (parameterId === 'pH') {
                value = baseHydro.pH - attenuation * 1.5 * (0.9 + runtimeRandom('model') * 0.2);
            } else if (parameterId === 'redox') {
                value = baseHydro.redox - attenuation * 300 * (0.9 + runtimeRandom('model') * 0.2);
            } else if (parameterId === 'conductivity') {
                value = baseHydro.conductivity * (1 + attenuation * 0.8) * (0.9 + runtimeRandom('model') * 0.2);
            } else {
                value = (baseHydro[parameterId] || 10) * (0.9 + runtimeRandom('model') * 0.2);
            }

            value = Math.max(range.min, Math.min(range.max, value));

            const isPlanned = runtimeRandom('model') < 0.25;
            const dateStr = campaign.date.toISOString().slice(0, 10);
            const wx = wellPos.x || 0;
            const wy = wellPos.y || 0;
            const wz = wellPos.z || 0;

            observations.push({
                id: generateId('obs'),
                showPlanning: isPlanned,
                plannedDate: isPlanned ? dateStr : null,
                plannedParameterId: isPlanned ? parameterId : null,
                plannedUnitId: isPlanned ? range.unitId : null,
                plannedX: isPlanned ? wx : null,
                plannedY: isPlanned ? wy : null,
                plannedZ: isPlanned ? wz : null,
                expectedValue: null,
                x: wx,
                y: wy,
                z: wz,
                date: dateStr,
                campaignId: campaign.id,
                parameterId,
                cas: randomCovV2 ? casForParameterId(parameterId) : null,
                value: formatObservationValue(value),
                unitId: range.unitId,
                autoConvert: false,
                qualFields: [],
                additionalReadings: [],
                variables: { ...(familyVariables?.well || {}) },
                credentialLevel: randomCredentialLevel(runtimeRandom),
                createdBy: null,
                cost: includeCosts ? buildObservationCost(parameterId) : null,
            });
        });
    });

    return observations;
}

export function createCorrelatedPlumeObservations(
    plumeTimeline: any[],
    baseCenter: any,
    campaigns: any[],
    runtime: any = {},
): any[] {
    const {
        familyParameters,
        familyVariables,
        parameterRanges,
        runtimeRandom,
        generateId,
        buildObservationCost,
        includeCosts = true,
    } = runtime;
    assertRuntime('createCorrelatedPlumeObservations', [
        ['runtimeRandom', runtimeRandom],
        ['generateId', generateId],
        ['buildObservationCost', buildObservationCost],
    ]);

    void baseCenter;

    const randomCovV2 = resolveCovV2(runtime);
    const observations: any[] = [];
    const parameters = familyParameters?.plume || ['benzene', 'tph', 'btex', 'voc'];
    const baseValues: Record<string, any> = {};

    parameters.forEach((parameterId: any) => {
        const range = parameterRanges?.[parameterId];
        if (!range) return;
        baseValues[parameterId] = {
            base: range.max * (0.7 + runtimeRandom('model') * 0.25),
            unitId: range.unitId,
        };
    });

    campaigns.forEach((campaign: any, campaignIndex: any) => {
        const snapshot = plumeTimeline[campaignIndex];
        if (!snapshot) return;

        const baseVolume =
            plumeTimeline[0].shape.radiusX * plumeTimeline[0].shape.radiusY * plumeTimeline[0].shape.radiusZ;
        const currentVolume = snapshot.shape.radiusX * snapshot.shape.radiusY * snapshot.shape.radiusZ;
        const volumeRatio = baseVolume > 0 ? currentVolume / baseVolume : 1;

        parameters.forEach((parameterId: any) => {
            const entry = baseValues[parameterId];
            const range = parameterRanges?.[parameterId];
            if (!entry || !range) return;

            let value = entry.base * volumeRatio * (0.9 + runtimeRandom('model') * 0.2);
            value = Math.max(range.min, Math.min(range.max, value));

            const isPlanned = runtimeRandom('model') < 0.25;
            const dateStr = campaign.date.toISOString().slice(0, 10);

            observations.push({
                id: generateId('obs'),
                showPlanning: isPlanned,
                plannedDate: isPlanned ? dateStr : null,
                plannedParameterId: isPlanned ? parameterId : null,
                plannedUnitId: isPlanned ? entry.unitId : null,
                plannedX: isPlanned ? snapshot.center.x : null,
                plannedY: isPlanned ? snapshot.center.y : null,
                plannedZ: isPlanned ? snapshot.center.z : null,
                expectedValue: null,
                x: snapshot.center.x,
                y: snapshot.center.y,
                z: snapshot.center.z,
                date: dateStr,
                campaignId: campaign.id,
                parameterId,
                cas: randomCovV2 ? casForParameterId(parameterId) : null,
                value: formatObservationValue(value),
                unitId: entry.unitId,
                autoConvert: false,
                qualFields: [],
                additionalReadings: [],
                variables: { ...(familyVariables?.plume || {}) },
                credentialLevel: randomCredentialLevel(runtimeRandom),
                createdBy: null,
                cost: includeCosts ? buildObservationCost(parameterId) : null,
            });
        });
    });

    return observations;
}
