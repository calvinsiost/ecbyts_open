// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Phase Structure Builder - RANDOM-REBUILD-V2 Phase C.5.
 *
 * Extracts the boundary/strata/blueprint creation block from randomModel.js
 * while keeping runtime dependencies explicit and the public API unchanged.
 */

interface PhaseRuntime {
    addElement?: (...args: any[]) => any;
    nextElementCounter?: () => number;
    generateObservations?: (...args: any[]) => any;
    config?: Record<string, any>;
    randInt?: (a: number, b: number) => number;
}

export function createBoundaryPhase(ctx: Record<string, any>, runtime: PhaseRuntime = {}): void {
    const { addElement, nextElementCounter, generateObservations, config, randInt } = runtime;

    if (
        typeof addElement !== 'function' ||
        typeof nextElementCounter !== 'function' ||
        typeof generateObservations !== 'function' ||
        typeof randInt !== 'function'
    ) {
        throw new Error('createBoundaryPhase requires explicit runtime helpers');
    }

    const {
        include,
        halfWidth,
        halfLength,
        overlayUrl,
        overlayFallbackUrls,
        rndLat,
        rndLon,
        opts,
        siteProjectId,
        campaigns,
        randRange,
        randChoice,
        utm,
        industrialCenter,
        monitoringCenter,
        zoneSpread,
        inZone,
        getSpatialParentId,
    } = ctx;

    if (include.has('boundary')) {
        const overlayOpacity = opts?.transparentVisuals === false ? 0.85 : 0.42;
        const boundaryEc = nextElementCounter();
        const boundaryMeta: Record<string, any> = {};
        const boundaryParentId = siteProjectId || null;
        if (boundaryParentId) boundaryMeta.hierarchy = { parentId: boundaryParentId, order: 0 };
        addElement(
            'boundary',
            `boundary-${boundaryEc}`,
            'Área de Estudo',
            {
                vertices: [
                    { x: -halfWidth, y: 0, z: -halfLength },
                    { x: halfWidth, y: 0, z: -halfLength },
                    { x: halfWidth, y: 0, z: halfLength },
                    { x: -halfWidth, y: 0, z: halfLength },
                ],
                type: 'study_area',
                overlayUrl,
                overlayFallbackUrls,
                overlayOpacity,
                sourceLat: rndLat,
                sourceLon: rndLon,
            },
            boundaryMeta,
        );
    }

    if (include.has('stratum') && config?.STRATA && config.STRATA.length > 0) {
        config.STRATA.forEach((stratum: any) => {
            addElement(
                'stratum',
                `stratum-${stratum.id}`,
                stratum.name,
                {
                    layer: { id: stratum.id, top: stratum.top, bottom: stratum.bottom },
                    color: stratum.color,
                    extent: { width: halfWidth * 2, depth: halfLength * 2 },
                },
                { hierarchy: { parentId: siteProjectId || null, order: 0 } },
            );
        });
    }

    if (include.has('blueprint')) {
        const numBlueprints = randInt(1, 2);
        const categories = ['industrial', 'urban', 'mixed', 'agricultural'];
        for (let i = 0; i < numBlueprints; i++) {
            const ec = nextElementCounter();
            const anchor = i % 2 === 0 ? industrialCenter : monitoringCenter;
            const pos = inZone(anchor, zoneSpread * 0.6);
            const width = randRange(35, 120);
            const length = randRange(25, 90);
            const blueprintPos = { x: pos.x, y: 0, z: pos.z };
            const parentId = getSpatialParentId();
            const blueprintMeta = parentId ? { hierarchy: { parentId, order: i + 1 } } : {};

            addElement(
                'blueprint',
                `blueprint-${ec}`,
                `Blueprint ${i + 1}`,
                {
                    category: randChoice(categories),
                    crs_source: `UTM-${utm.zone}${utm.hemisphere}`,
                    area_m2: Math.round(width * length * 10) / 10,
                    vertices: [
                        { x: pos.x - width / 2, z: pos.z - length / 2 },
                        { x: pos.x + width / 2, z: pos.z - length / 2 },
                        { x: pos.x + width / 2, z: pos.z + length / 2 },
                        { x: pos.x - width / 2, z: pos.z + length / 2 },
                    ],
                    observations: generateObservations('blueprint', blueprintPos, campaigns),
                },
                blueprintMeta,
            );
        }
    }
}
