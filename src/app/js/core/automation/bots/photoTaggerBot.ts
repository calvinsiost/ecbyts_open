// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Photo Tagger Bot - Auto-tags photos with AI vision and links to nearest element.
 *
 * Reacts to 'photo_added' events. Uses LLM vision to identify objects in the
 * photo, suggests tags, and optionally links to the nearest matching element
 * based on GPS proximity.
 *
 * @module core/automation/bots/photoTaggerBot
 */
import { createLogger } from '../../../utils/helpers/logger.js';
const log = createLogger('photoTaggerBot');
/** Batch queue — photos are processed in batch every BATCH_INTERVAL_MS */
/** @type {any[]} */
const _queue: any[] = [];
/** @type {any} */
let _batchTimer: any = null;
const BATCH_INTERVAL_MS = 10000; // 10s batch window
export const photoTaggerBot = {
    name: 'Photo Tagger',
    description: 'Analisa fotos e sugere tags automaticamente via IA',
    defaultConfig: {
        minConfidence: 0.8,
        autoLinkElements: true,
        batchMode: true,
        tags: ['well', 'tank', 'building', 'sampling', 'spill', 'equipment', 'remediation'],
    },
    onActivate() {
        log.info('Photo Tagger activated');
    },
    onDeactivate() {
        if (_batchTimer) {
            clearTimeout(_batchTimer);
            _batchTimer = null;
        }
        _queue.length = 0;
        log.info('Photo Tagger deactivated');
    },
    /**
     * @param {string} config
     * @param {any} config - { photoId, imageData (base64), gps: {lat, lon}, elementId }
     * @param {any} config
     */
    onEvent: async (eventType: any, payload: any, config: any) => {
        if (eventType !== 'photo_added')
            return;
        const { photoId, imageData } = payload;
        if (!photoId || !imageData)
            return;
        if (config.batchMode) {
            _queue.push({ ...payload, config });
            _scheduleBatch();
            return { action: 'queued', photoId };
        }
        return _processPhoto(payload, config);
    },
};
function _scheduleBatch() {
    if (_batchTimer)
        return;
    _batchTimer = setTimeout(async () => {
        _batchTimer = null;
        const batch = _queue.splice(0, _queue.length);
        for (const item of batch) {
            await _processPhoto(item, item.config);
        }
    }, BATCH_INTERVAL_MS);
}
/**
 * Process a single photo - analyze with LLM vision and apply tags.
 * @param {any} config
 * @param {any} config
 */
async function _processPhoto(payload: any, config: any) {
    const { photoId, imageData, gps } = payload;
    try {
        const analysis = await _analyzeImage(imageData, config);
        if (!analysis || analysis.confidence < config.minConfidence) {
            log.info(`Photo ${photoId}: confidence ${analysis?.confidence || 0} below threshold`);
            return { action: 'skipped', photoId, confidence: analysis?.confidence };
        }
        // Find nearest element if GPS available
        let linkedElementId = null;
        if (config.autoLinkElements && gps) {
            linkedElementId = await _findNearestElement(gps, analysis.tags);
        }
        // Apply tags via photolog
        try {
            const { updatePhotoMeta } = await import('../../photolog/manager.js' as string);
            if (typeof updatePhotoMeta === 'function') {
                updatePhotoMeta(photoId, {
                    aiTags: analysis.tags,
                    aiConfidence: analysis.confidence,
                    aiLinkedElementId: linkedElementId,
                });
            }
        }
        catch {
            log.warn(`Could not update photo ${photoId} metadata`);
        }
        const { showToast } = await import('../../../utils/ui/toast.js' as string);
        const tagStr = analysis.tags.slice(0, 3).join(', ');
        showToast(`Foto analisada: ${tagStr}`, 'info');
        log.info(`Photo ${photoId} tagged: ${analysis.tags.join(', ')}`);
        return { action: 'tagged', photoId, tags: analysis.tags, linkedElementId };
    }
    catch (err: any) {
        log.error(`Error processing photo ${photoId}:`, err);
        return { action: 'error', photoId, error: /** @type {any} */ (err)?.message };
    }
}
/**
 * Analyze image using LLM vision API.
 * @param {string} imageData - base64 data URL
 * @param {any} config
 * @returns {Promise<{tags: string[], confidence: number}>}
 */
async function _analyzeImage(imageData: any, config: any) {
    try {
        const { sendMessage } = await import('../../llm/client.js' as string);
        const prompt = `Analyze this environmental monitoring photo. Identify objects from: ${config.tags.join(', ')}.
Reply ONLY with JSON: {"tags": ["tag1"], "confidence": 0.85}`;
        const response = await sendMessage('You are an environmental site photo analyzer. Reply only with JSON.', prompt, {
            image: imageData,
            temperature: 0.2,
            maxTokens: 200,
        });
        const content = typeof response === 'string' ? response : response?.content;
        if (!content)
            return { tags: [], confidence: 0 };
        // Parse JSON from response (handle markdown fences)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            return { tags: [], confidence: 0 };
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        };
    }
    catch (err: any) {
        log.warn('Vision analysis failed:', /** @type {any} */ (err)?.message);
        return { tags: [], confidence: 0 };
    }
}
/**
 * Find the nearest element by GPS coordinates and tag compatibility.
 * @param {{lat: number, lon: number}} gps
 * @param {string[]} gps
 * @returns {Promise<string|null>} element ID or null
 */
async function _findNearestElement(gps: any, tags: any) {
    try {
        const { getAllElements } = await import('../../elements/manager.js' as string);
        const elements = getAllElements();
        // Map tags to compatible families
        /** @type {Record<string, string[]>} */
        const familyMap = {
            well: ['well'],
            tank: ['tank'],
            building: ['building'],
            equipment: ['remediation'],
            remediation: ['remediation'],
            sampling: ['well'],
        };
        const families = new Set(tags.flatMap((t: any) => (familyMap as Record<string,any>)[t] || []));
        if (families.size === 0)
            return null;
        const candidates = elements.filter((el: any) => families.has(el.family));
        let nearest = null;
        let minDist = 50; // max 50m radius
        for (const el of candidates) {
            const pos = el.data?.position || el.position;
            if (!pos)
                continue;
            const dx = (gps.lon || 0) - (pos.x || 0);
            const dz = (gps.lat || 0) - (pos.z || 0);
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                nearest = el;
            }
        }
        return nearest?.id || null;
    }
    catch {
        return null;
    }
}
