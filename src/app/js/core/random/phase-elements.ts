// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Phase Elements Builder - RANDOM-REBUILD-V2 Phase C.5/C.6.
 *
 * Extracts element creation blocks from randomModel.js while keeping local
 * helper dependencies explicit.
 */

import { createSiteElementsPhase as _createSiteElementsPhase } from './phase-site-elements.js';

/**
 * @param name
 * @param runtimePairs
 */
function assertRuntime(name: string, runtimePairs: Array<[string, any]>): void {
    for (const [label, value] of runtimePairs) {
        if (typeof value !== 'function') {
            throw new Error(`${name} requires explicit runtime helper: ${label}`);
        }
    }
}

/**
 * @param ctx
 * @param runtime
 */
export function createBuildingsPhase(ctx: any, runtime: any = {}): void {
    const { addElement, nextElementCounter, syntheticTerrainElevation, randomFn } = runtime;
    assertRuntime('createBuildingsPhase', [
        ['addElement', addElement],
        ['nextElementCounter', nextElementCounter],
        ['syntheticTerrainElevation', syntheticTerrainElevation],
        ['randomFn', randomFn],
    ]);

    const {
        include,
        opts,
        halfWidth,
        halfLength,
        industrialCenter,
        zoneSpread,
        inZone,
        extent,
        detectedFeatures,
        hMeta,
        randRange,
        randChoice,
        buildingPositions,
    } = ctx;

    if (!include.has('building')) return;

    const BUILDING_PRESETS = {
        industrial: {
            names: ['Galpão Industrial', 'Oficina', 'Área de Processo'],
            w: [20, 40],
            l: [25, 60],
            h: [6, 15],
        },
        commercial: {
            names: ['Escritório', 'Portaria', 'Centro Administrativo'],
            w: [10, 25],
            l: [15, 35],
            h: [4, 10],
        },
        residential: { names: ['Almoxarifado', 'Depósito', 'Guarita'], w: [8, 15], l: [10, 20], h: [3, 6] },
    };
    const presets: any = BUILDING_PRESETS;

    for (let i = 0; i < opts.buildings; i++) {
        const ec = nextElementCounter();
        const buildingType = i === 0 ? 'industrial' : randChoice(['industrial', 'commercial', 'residential']);
        const preset = presets[buildingType];
        const pos = inZone(industrialCenter, zoneSpread);
        const detectedBuilding = detectedFeatures.find(
            (feature: any) => feature.family === 'building' && feature.confidence > 0.6 && feature.dimensions,
        );
        const scaleX = extent.maxX - extent.minX;
        const scaleZ = extent.maxZ - extent.minZ;
        const width = detectedBuilding?.dimensions?.width
            ? Math.max(
                  preset.w[0],
                  Math.min(
                      preset.w[1] * 1.5,
                      detectedBuilding.dimensions.width * scaleX * (0.8 + randomFn('model') * 0.4),
                  ),
              )
            : randRange(preset.w[0], preset.w[1]);
        const length = detectedBuilding?.dimensions?.length
            ? Math.max(
                  preset.l[0],
                  Math.min(
                      preset.l[1] * 1.5,
                      detectedBuilding.dimensions.length * scaleZ * (0.8 + randomFn('model') * 0.4),
                  ),
              )
            : randRange(preset.l[0], preset.l[1]);
        const height = randRange(preset.h[0], preset.h[1]);
        const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);
        buildingPositions.push({ x: pos.x, z: pos.z, h: height, w: width, l: length });
        addElement(
            'building',
            `building-${ec}`,
            `${randChoice(preset.names)}`,
            {
                position: { x: pos.x, y: groundY, z: pos.z },
                footprint: { width, length },
                height,
                type: buildingType,
            },
            hMeta('building'),
        );
    }
}

/**
 * @param ctx
 * @param runtime
 */
export function createPlumesPhase(ctx: any, runtime: any = {}): void {
    const {
        addElement,
        nextElementCounter,
        syntheticTerrainElevation,
        generatePlumeTimeline,
        generateCorrelatedPlumeObs,
        randomFn,
        familyParameters,
    } = runtime;
    assertRuntime('createPlumesPhase', [
        ['addElement', addElement],
        ['nextElementCounter', nextElementCounter],
        ['syntheticTerrainElevation', syntheticTerrainElevation],
        ['generatePlumeTimeline', generatePlumeTimeline],
        ['generateCorrelatedPlumeObs', generateCorrelatedPlumeObs],
        ['randomFn', randomFn],
    ]);

    const {
        include,
        opts,
        campaigns,
        numCampaigns,
        plumeDepths,
        halfWidth,
        halfLength,
        S,
        monitoringCenter,
        zoneSpread,
        inZone,
        hMeta,
        randRange,
        plumePositions,
        plumeData,
    } = ctx;

    if (!include.has('plume')) return;

    const PLUME_DEPTH_NAMES: any = { shallow: 'Rasa', middle: 'Intermediária', deep: 'Profunda' };
    for (let i = 0; i < opts.plumes; i++) {
        const depth = plumeDepths[i % plumeDepths.length];
        const ec = nextElementCounter();
        const pos = inZone(monitoringCenter, zoneSpread * 0.5);
        const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);
        const radiusX = randRange(3, 10) * S;
        const radiusY = randRange(2, 7) * S;
        const radiusZ = randRange(2, 8);
        const baseShape = { radiusX, radiusY, radiusZ };
        const baseCenter = { x: pos.x, y: groundY + depth.yCenter, z: pos.z };

        const plumeParams = familyParameters?.plume || [];
        const hasBTEX = plumeParams.some((param: any) =>
            ['benzene', 'toluene', 'ethylbenzene', 'xylenes', 'btex'].includes(param),
        );
        const hasMetals = plumeParams.some((param: any) => ['lead', 'chromium', 'arsenic', 'mercury'].includes(param));
        const shrinkFactor = hasMetals
            ? 0.05 + randomFn('model') * 0.1
            : hasBTEX
              ? 0.35 + randomFn('model') * 0.2
              : 0.2 + randomFn('model') * 0.15;
        const timeline = generatePlumeTimeline(baseShape, baseCenter, numCampaigns, shrinkFactor);
        const plumeId = `plume-${ec}`;

        plumePositions.push({ x: pos.x, z: pos.z, y: depth.yCenter, rx: radiusX, ry: radiusY });
        plumeData.push({ timeline, center: baseCenter, id: plumeId });

        addElement(
            'plume',
            plumeId,
            `Pluma ${PLUME_DEPTH_NAMES[depth.level]}`,
            {
                depth: { level: depth.level, top: depth.top, bottom: depth.bottom },
                shape: baseShape,
                center: baseCenter,
                shapeTimeline: timeline.map((snap: any, idx: any) => ({
                    campaignId: campaigns[idx].id,
                    date: campaigns[idx].date.toISOString().slice(0, 10),
                    shape: { ...snap.shape },
                    center: { ...snap.center },
                })),
                observations: generateCorrelatedPlumeObs(timeline, baseCenter, campaigns),
            },
            hMeta('plume'),
        );
    }
}

/**
 * @param ctx
 * @param runtime
 */
export function createWellsPhase(ctx: any, runtime: any = {}): void {
    const {
        addElement,
        nextElementCounter,
        syntheticTerrainElevation,
        syntheticWaterTable,
        runtimeRandom,
        runtimeDate,
        scaleWellTiers,
        generateCorrelatedWellObs,
        generateObservations,
        randInt,
        GAC_ALL_PARAMS,
        TIER_INTERMEDIATE_PARAMS,
    } = runtime;
    assertRuntime('createWellsPhase', [
        ['addElement', addElement],
        ['nextElementCounter', nextElementCounter],
        ['syntheticTerrainElevation', syntheticTerrainElevation],
        ['syntheticWaterTable', syntheticWaterTable],
        ['runtimeRandom', runtimeRandom],
        ['runtimeDate', runtimeDate],
        ['scaleWellTiers', scaleWellTiers],
        ['generateCorrelatedWellObs', generateCorrelatedWellObs],
        ['generateObservations', generateObservations],
        ['randInt', randInt],
    ]);
    if (!Array.isArray(GAC_ALL_PARAMS) || !Array.isArray(TIER_INTERMEDIATE_PARAMS)) {
        throw new Error('createWellsPhase requires explicit parameter tier arrays');
    }

    const {
        include,
        opts,
        campaigns,
        halfWidth,
        halfLength,
        monitoringCenter,
        naturalCenter,
        zoneSpread,
        inZone,
        clamp,
        hMeta,
        detectedZones,
        randRange,
        randChoice,
        plumePositions,
        plumeData,
        wellPositions,
    } = ctx;

    if (!include.has('well')) return;

    const GEOLOGY_PATTERNS = {
        sedimentary: [
            { type: 'clay', pct: [0.05, 0.15] },
            { type: 'sandy_clay', pct: [0.1, 0.25] },
            { type: 'sand', pct: [0.2, 0.35] },
            { type: 'gravel', pct: [0.1, 0.2] },
            { type: 'rock', pct: [0.15, 0.3] },
        ],
        alluvial: [
            { type: 'clay', pct: [0.08, 0.18] },
            { type: 'sand', pct: [0.25, 0.4] },
            { type: 'gravel', pct: [0.15, 0.25] },
            { type: 'silty_sand', pct: [0.2, 0.35] },
        ],
        crystalline: [
            { type: 'clay', pct: [0.05, 0.12] },
            { type: 'silt', pct: [0.1, 0.2] },
            { type: 'rock', pct: [0.55, 0.75] },
        ],
    };
    const geologyPatterns: any = GEOLOGY_PATTERNS;
    const geoRoll = runtimeRandom('model');
    const siteGeology = geoRoll < 0.5 ? 'sedimentary' : geoRoll < 0.8 ? 'alluvial' : 'crystalline';
    const geoPattern = geologyPatterns[siteGeology];
    const geoWaves = geoPattern.map((_: any, index: number) => ({
        fx: 0.8 + index * 0.7,
        fz: 0.6 + index * 0.5,
        px: index * 2.1 + 0.5,
        pz: index * 1.4 + 1.1,
        amp: 0.15 + index * 0.05,
    }));

    /**
     * @param totalDepth
     * @param diameter
     * @param wx
     * @param wz
     */
    function generateWellProfile(totalDepth: number, diameter: number, wx: number, wz: number) {
        const moistures = ['dry', 'moist', 'saturated'];
        const nx = (wx || 0) / Math.max(halfWidth, 1);
        const nz = (wz || 0) / Math.max(halfLength, 1);

        const lithologic = [];
        let currentDepth = 0;
        for (let i = 0; i < geoPattern.length; i++) {
            const layer = geoPattern[i];
            const basePct = randRange(layer.pct[0], layer.pct[1]);
            const wave = geoWaves[i];
            const waveOffset =
                totalDepth *
                wave.amp *
                Math.sin(nx * Math.PI * wave.fx + wave.px) *
                Math.cos(nz * Math.PI * wave.fz + wave.pz);
            const thickness =
                i === geoPattern.length - 1
                    ? totalDepth - currentDepth
                    : Math.max(0.5, totalDepth * basePct + waveOffset);
            const to = Math.min(currentDepth + thickness, totalDepth);
            lithologic.push({
                from: Math.round(currentDepth * 10) / 10,
                to: Math.round(to * 10) / 10,
                soilType: layer.type,
                description: '',
                classification: 'ABGE',
                color: '',
                moisture: currentDepth > totalDepth * 0.4 ? 'saturated' : randChoice(moistures),
                observations: '',
            });
            currentDepth = to;
            if (currentDepth >= totalDepth) break;
        }

        const screenTop = Math.round(totalDepth * 0.4 * 10) / 10;
        const screenBottom = Math.round((totalDepth - 1) * 10) / 10;
        const sealBottom = Math.round(screenTop * 10) / 10;
        const elements = [
            { type: 'surface_completion', topDepth: 0, bottomDepth: 0.5, properties: {} },
            {
                type: 'cement_seal',
                topDepth: 0.5,
                bottomDepth: Math.round(Math.min(3, sealBottom) * 10) / 10,
                properties: {},
            },
            {
                type: 'bentonite_seal',
                topDepth: Math.round(Math.min(3, sealBottom) * 10) / 10,
                bottomDepth: sealBottom,
                properties: {},
            },
            { type: 'blank_casing', topDepth: 0, bottomDepth: screenTop, properties: {} },
            { type: 'screen', topDepth: screenTop, bottomDepth: screenBottom, properties: { slotSize: 0.5 } },
            { type: 'gravel_pack', topDepth: screenTop, bottomDepth: screenBottom, properties: {} },
            { type: 'sump', topDepth: screenBottom, bottomDepth: totalDepth, properties: {} },
        ];

        const wlDepth = Math.round(totalDepth * (0.4 + runtimeRandom('model') * 0.2) * 100) / 100;
        const vocCount = randInt(0, 4);
        const vocReadings = [];
        for (let i = 0; i < vocCount; i++) {
            vocReadings.push({
                depth: Math.round(runtimeRandom('model') * totalDepth * 10) / 10,
                value: Math.round(runtimeRandom('model') * 500 * 10) / 10,
            });
        }
        vocReadings.sort((a, b) => a.depth - b.depth);

        return {
            constructive: {
                totalDepth,
                drillingDepth: totalDepth,
                boreholeDiameter: 10,
                casingDiameter: diameter || 4,
                drillingMethod: randChoice(['hollow_stem_auger', 'rotary', 'percussion']),
                elements,
            },
            lithologic,
            waterLevel: { depth: wlDepth, date: runtimeDate().toISOString().split('T')[0] },
            vocReadings,
        };
    }

    const wellTiers = scaleWellTiers(opts.wells);
    let wellIndex = 0;

    /**
     * @param tierParams
     * @param wellPos
     * @param linkedPlumeIdx
     * @param wellDepth
     */
    function generateTieredWellObservations(
        tierParams: any,
        wellPos: { x: number; z: number },
        linkedPlumeIdx: number,
        wellDepth: number,
    ) {
        void tierParams;
        if (linkedPlumeIdx >= 0 && plumeData[linkedPlumeIdx]) {
            const plume = plumeData[linkedPlumeIdx];
            return generateCorrelatedWellObs(
                { x: wellPos.x, z: wellPos.z, y: -wellDepth / 2 },
                plume.timeline,
                plume.center,
                campaigns,
            );
        }
        return generateObservations('well', { x: wellPos.x, y: -wellDepth / 2, z: wellPos.z }, campaigns);
    }

    /**
     * @param distMin
     * @param distMax
     */
    function wellNearPlume(distMin: number, distMax: number) {
        if (plumePositions.length === 0) return inZone(monitoringCenter, zoneSpread);
        const plumeIndex = wellIndex % plumePositions.length;
        const plume = plumePositions[plumeIndex];
        const angle = randRange(0, Math.PI * 2);
        const distance = randRange(distMin, distMax) * Math.max(plume.rx, plume.ry);
        return {
            x: clamp(plume.x + Math.cos(angle) * distance, halfWidth),
            z: clamp(plume.z + Math.sin(angle) * distance, halfLength),
            linkedPlumeIdx: plumeIndex,
        };
    }

    const waterRef = detectedZones?.water || naturalCenter;
    /**
     * @param px
     * @param pz
     * @param tier
     */
    const wellDepthFromTerrain = (px: number, pz: number, tier: string) => {
        const groundY = syntheticTerrainElevation(px, pz, halfWidth, halfLength);
        const distW = Math.sqrt((px - waterRef.x) ** 2 + (pz - waterRef.z) ** 2);
        const wtY = syntheticWaterTable(groundY, distW);
        const wtDepth = groundY - wtY;
        const multiplier = tier === 'downstream' ? 2.5 : tier === 'intermediate' ? 1.8 : 1.2;
        return Math.max(10, wtDepth * multiplier + randRange(2, 8));
    };

    for (let i = 0; i < wellTiers.downstream; i++) {
        nextElementCounter();
        const wellId = `PM-${String(wellIndex + 1).padStart(2, '0')}`;
        const pos = wellNearPlume(0.2, 1.2);
        const wellDepth = wellDepthFromTerrain(pos.x, pos.z, 'downstream');
        const linkedIdx = (pos as any).linkedPlumeIdx ?? -1;
        const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);

        wellPositions.push({ x: pos.x, z: pos.z, depth: wellDepth, tier: 'downstream' });
        addElement(
            'well',
            wellId,
            wellId,
            {
                coordinates: { easting: pos.x, northing: pos.z, elevation: groundY },
                construction: { totalDepth: wellDepth, diameter: randChoice([2, 4, 6]) },
                tier: 'downstream',
                linkedPlumeId: linkedIdx >= 0 ? plumeData[linkedIdx].id : null,
                observations: generateTieredWellObservations(GAC_ALL_PARAMS, pos, linkedIdx, wellDepth),
                profile: generateWellProfile(wellDepth, randChoice([2, 4, 6]), pos.x, pos.z),
            },
            hMeta('well'),
        );
        wellIndex++;
    }

    for (let i = 0; i < wellTiers.intermediate; i++) {
        nextElementCounter();
        const wellId = `PM-${String(wellIndex + 1).padStart(2, '0')}`;
        const pos = wellNearPlume(0.8, 2.5);
        const wellDepth = wellDepthFromTerrain(pos.x, pos.z, 'intermediate');
        const linkedIdx = (pos as any).linkedPlumeIdx ?? -1;
        const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);

        wellPositions.push({ x: pos.x, z: pos.z, depth: wellDepth, tier: 'intermediate' });
        addElement(
            'well',
            wellId,
            wellId,
            {
                coordinates: { easting: pos.x, northing: pos.z, elevation: groundY },
                construction: { totalDepth: wellDepth, diameter: randChoice([2, 4]) },
                tier: 'intermediate',
                linkedPlumeId: linkedIdx >= 0 ? plumeData[linkedIdx].id : null,
                observations: generateTieredWellObservations(TIER_INTERMEDIATE_PARAMS, pos, linkedIdx, wellDepth),
                profile: generateWellProfile(wellDepth, randChoice([2, 4]), pos.x, pos.z),
            },
            hMeta('well'),
        );
        wellIndex++;
    }

    for (let i = 0; i < wellTiers.upstream; i++) {
        nextElementCounter();
        const wellId = `PM-${String(wellIndex + 1).padStart(2, '0')}`;
        const x = clamp(monitoringCenter.x + randRange(-zoneSpread, zoneSpread), halfWidth);
        const z = clamp(monitoringCenter.z - zoneSpread * randRange(1.0, 2.0), halfLength);
        const wellDepth = wellDepthFromTerrain(x, z, 'upstream');
        const groundY = syntheticTerrainElevation(x, z, halfWidth, halfLength);

        wellPositions.push({ x, z, depth: wellDepth, tier: 'upstream' });
        addElement(
            'well',
            wellId,
            wellId,
            {
                coordinates: { easting: x, northing: z, elevation: groundY },
                construction: { totalDepth: wellDepth, diameter: 2 },
                tier: 'upstream',
                linkedPlumeId: null,
                observations: generateObservations('well', { x, y: -wellDepth / 2, z }, campaigns),
                profile: generateWellProfile(wellDepth, 2, x, z),
            },
            hMeta('well'),
        );
        wellIndex++;
    }
}

/**
 * @param ctx
 * @param runtime
 */
export function createOtherElementsPhase(ctx: any, runtime: any = {}): any {
    return _createSiteElementsPhase(ctx, runtime);
}
