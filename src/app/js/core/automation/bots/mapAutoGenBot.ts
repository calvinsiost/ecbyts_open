// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Map Auto-Generator Bot - Generates interpolation layers after data import.
 *
 * Reacts to 'data_imported' events. Checks if imported data contains
 * water levels (potentiometric map) or concentration data (contamination plume),
 * and auto-generates the corresponding interpolation layer.
 *
 * @module core/automation/bots/mapAutoGenBot
 */
import { createLogger } from '../../../utils/helpers/logger.js';
const log = createLogger('mapAutoGenBot');
export const mapAutoGenBot = {
    name: 'Map Generator',
    description: 'Gera mapas automaticamente apos importacao de dados',
    defaultConfig: {
        autoGenPotentiometric: true,
        autoGenContamination: true,
        minPoints: 4,
        addHiddenLayer: true,
        method: 'kriging',
    },
    /**
     * @param {string} observations
     * @param {{elements?: any[], observations?: any[], campaignId?: any}} payload - { elements, observations, campaignId }
     * @param {{autoGenPotentiometric?: boolean, autoGenContamination?: boolean, minPoints?: number, addHiddenLayer?: boolean, method?: string}} config
     */
    onEvent: async (eventType: any, payload: any, config: any) => {
        if (eventType !== 'data_imported')
            return;
        const { elements, observations } = payload;
        if (!elements || !Array.isArray(elements))
            return;
        const results = [];
        const minPoints = config.minPoints ?? 4;
        // Check for water level data -> potentiometric map
        if (config.autoGenPotentiometric) {
            const generated = await _tryGenerateLayer(
                'potentiometric',
                elements,
                observations,
                minPoints,
                config,
            );
            if (generated) results.push(generated);
        }
        // Check for concentration data -> contamination plume
        if (config.autoGenContamination) {
            const generated = await _tryGenerateLayer(
                'contamination',
                elements,
                observations,
                minPoints,
                config,
            );
            if (generated) results.push(generated);
        }
        if (results.length > 0) {
            await _showGeneratedMapsToast(results);
        }
        return results.length > 0
            ? { action: 'maps_generated', maps: results }
            : { action: 'no_maps', reason: 'insufficient data' };
    },
};
/**
 * Extract water level measurement points from elements/observations.
 * @param {Array<any>} observations
 * @param {Array<any>} [observations]
 * @returns {Array<{x: number, z: number, value: number}>}
 */
function _extractWaterLevelPoints(elements: any, observations: any) {
    const points = [];
    const wells = (elements || []).filter((el: any) => el.family === 'well');
    for (const well of wells) {
        const pos = well.data?.position || well.position;
        if (!pos)
            continue;
        // Check observations for hydraulic head / water level
        const obs = (observations || []).filter((o: any) => o.elementId === well.id);
        const waterObs = obs.find((o: any) => o.parameterId === 'hydraulic_head' ||
            o.parameterId === 'water_level' ||
            o.parameterId === 'nivel_agua' ||
            o.parameterId === 'NA');
        if (waterObs && typeof waterObs.value === 'number' && Number.isFinite(waterObs.value)) {
            points.push({ x: pos.x, z: pos.z, value: waterObs.value });
        }
    }
    return points;
}
/**
 * Extract concentration measurement points for contamination mapping.
 * @param {Array<any>} elements
 * @param {Array<any>} [observations]
 * @returns {Array<{x: number, z: number, value: number, parameterId: string}>}
 */
function _extractConcentrationPoints(elements: any, observations: any) {
    const points = [];
    const wells = (elements || []).filter((el: any) => el.family === 'well');
    // Concentration parameters (common environmental monitoring)
    const concParams = new Set([
        'benzene',
        'toluene',
        'ethylbenzene',
        'xylenes',
        'btex',
        'tph',
        'mtbe',
        'lead',
        'arsenic',
        'mercury',
        'cadmium',
        'benzeno',
        'tolueno',
        'xilenos',
        'chumbo',
        'arsenio',
    ]);
    for (const well of wells) {
        const pos = well.data?.position || well.position;
        if (!pos)
            continue;
        const obs = (observations || []).filter((o: any) => o.elementId === well.id);
        const concObs = obs.find((o: any) => concParams.has(o.parameterId?.toLowerCase()));
        if (concObs && typeof concObs.value === 'number' && Number.isFinite(concObs.value)) {
            points.push({
                x: pos.x,
                z: pos.z,
                value: concObs.value,
                parameterId: concObs.parameterId,
            });
        }
    }
    return points;
}

/**
 * @param {'potentiometric' | 'contamination'} type
 * @param {Array<any>} elements
 * @param {Array<any>} [observations]
 * @param {number} minPoints
 * @param {{method?: string, addHiddenLayer?: boolean}} config
 * @returns {Promise<{type: string, layerId: any, pointCount: number}|null>}
 */
async function _tryGenerateLayer(
    type: 'potentiometric' | 'contamination',
    elements: any,
    observations: any,
    minPoints: number,
    config: any,
) {
    const points =
        type === 'potentiometric'
            ? _extractWaterLevelPoints(elements, observations)
            : _extractConcentrationPoints(elements, observations);
    if (points.length < minPoints) return null;
    return _generateLayer(type, points, config);
}

async function _showGeneratedMapsToast(results: any[]) {
    try {
        const { showToast } = await import('../../../utils/ui/toast.js' as string);
        const names = results.map((r: any) => r.type).join(', ');
        showToast(`Mapas gerados: ${names}`, 'success');
    }
    catch ( /** @type {any} */e) {
        console.debug('[mapAutoGenBot] toast:', (e as any)?.message || e);
        /* toast unavailable */
    }
}

/**
 * Generate an interpolation layer using the interpolation manager.
 * @param {string} type - 'potentiometric' | 'contamination'
 * @param {Array<{x: number, z: number, value: number}>} points
 * @param {{method?: string, addHiddenLayer?: boolean}} config
 * @returns {Promise<{type: string, layerId: any, pointCount: number}|null>}
 */
async function _generateLayer(type: any, points: any, config: any) {
    try {
        const { addLayer } = await import('../../interpolation/manager.js' as string);
        const layerConfig = {
            type: type === 'potentiometric' ? 'water_table' : 'contamination',
            method: config.method || 'kriging',
            points,
            visible: !config.addHiddenLayer,
            name: type === 'potentiometric' ? 'Potenciometrico - Auto' : 'Contaminacao - Auto',
            _source: 'map_auto_gen_bot',
        };
        const layerId = addLayer(layerConfig);
        log.info(`Layer generated: ${type} (${points.length} points, id=${layerId})`);
        return { type, layerId, pointCount: points.length };
    }
    catch (err: any) {
        log.error(`Failed to generate ${type} layer:`, err);
        return null;
    }
}
