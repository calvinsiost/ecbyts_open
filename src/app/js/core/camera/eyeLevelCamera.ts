// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Eye-Level Camera + AI Ethical Marking - Item 9.57
 *
 * Pure module providing:
 *   1. Camera preset computation for human-height viewpoint (~1.70m)
 *   2. Mandatory ethical metadata for any AI-generated / AI-enhanced
 *      image (watermark payload + EXIF/XMP-style metadata block)
 *
 * UI integration (Three.js camera.position.set + AI pipeline call +
 * watermark render) is a thin view over these functions.
 *
 * The ethical marking enforces transparency per spec §Q2: users viewing
 * an image must be able to tell instantly that it was synthesized or
 * modified by AI. Metadata is MANDATORY and validated - pipelines that
 * try to save AI images without it fail fast.
 *
 * Reference: docs/IMPLEMENTATION_ROADMAP.md §9.57
 */

// ============================================================================
// Eye-level camera defaults
// ============================================================================

/**
 * Human standing eye height in meters. Slightly under Brazilian average
 * (~1.72m male / ~1.60m female) to bias conservative - most people see
 * scene from this height or slightly higher.
 */
export const EYE_LEVEL_HEIGHT_M = 1.7;

/**
 * Default field of view in degrees for eye-level walk-through cameras.
 * 50° matches a 35mm lens on full frame, which is the perceptual
 * equivalent of human foveal vision.
 */
export const EYE_LEVEL_FOV_DEG = 50;

/**
 * Near and far clipping planes for eye-level view. Near 0.1m allows
 * close objects; far 500m covers realistic walking range.
 */
export const EYE_LEVEL_NEAR = 0.1;
export const EYE_LEVEL_FAR = 500;

/**
 * Build a Three.js-compatible camera preset for eye-level view at a
 * given ground point + facing direction. Returns a plain data object
 * (no Three.js dependency) that UI layer converts to camera.position /
 * camera.lookAt / camera.fov / camera.updateProjectionMatrix().
 *
 * @param {Object} params
 * @param {{x: number, y: number, z: number}} params.groundPoint
 *        Point on the terrain surface where the viewer stands (y = ground height)
 * @param {{x: number, y: number, z: number}} [params.lookAt]
 *        Optional target point - if omitted, camera faces +x direction
 * @param {number} [params.eyeHeightM=1.7] - Override default eye height
 * @param {number} [params.fovDeg=50]
 * @param {'meters'|'feet'} [params.units='meters']
 * @returns {Object} preset { position, target, fov, near, far, up }
 */
export function computeEyeLevelPreset(params: { groundPoint: {x: number, y: number, z: number}; lookAt?: {x: number, y: number, z: number}; eyeHeightM?: number; fovDeg?: number; units?: 'meters'|'feet' }): Object {
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'params_required' };
    }
    const { groundPoint, lookAt, eyeHeightM, fovDeg, units } = params;

    if (!groundPoint || typeof groundPoint.x !== 'number' || typeof groundPoint.z !== 'number') {
        return { ok: false, reason: 'invalid_groundPoint' };
    }

    const groundY = typeof groundPoint.y === 'number' ? groundPoint.y : 0;
    const eyeH = Number(eyeHeightM ?? EYE_LEVEL_HEIGHT_M);
    if (!Number.isFinite(eyeH) || eyeH <= 0) {
        return { ok: false, reason: 'invalid_eye_height' };
    }

    // Convert feet to meters if needed, then validate the meters range
    const eyeM = units === 'feet' ? eyeH * 0.3048 : eyeH;
    if (eyeM < 0.5 || eyeM > 3.0) {
        return { ok: false, reason: 'invalid_eye_height' };
    }

    const position = {
        x: groundPoint.x,
        y: groundY + eyeM,
        z: groundPoint.z,
    };

    // Default target: 10m ahead on +x direction
    let target;
    if (lookAt && typeof lookAt.x === 'number') {
        target = { x: lookAt.x, y: lookAt.y ?? position.y, z: lookAt.z ?? lookAt.z };
    } else {
        target = { x: position.x + 10, y: position.y, z: position.z };
    }

    const fov = Number(fovDeg ?? EYE_LEVEL_FOV_DEG);
    if (!Number.isFinite(fov) || fov < 20 || fov > 120) {
        return { ok: false, reason: 'invalid_fov' };
    }

    return {
        ok: true,
        position: Object.freeze(position),
        target: Object.freeze(target),
        fov,
        near: EYE_LEVEL_NEAR,
        far: EYE_LEVEL_FAR,
        up: Object.freeze({ x: 0, y: 1, z: 0 }),
        eyeHeightM: eyeM,
    };
}

// ============================================================================
// AI Ethical Marking
// ============================================================================

/**
 * Valid AI marking tags that must be embedded in every AI-generated or
 * AI-enhanced image. Used as a structured enum for the metadata type
 * field. Visual watermark text is derived from this.
 */
export const AI_MARKING_TYPES = Object.freeze({
    FULLY_SYNTHETIC: 'fully_synthetic', // 100% generated, no base image
    PHOTOREALISTIC_FROM_3D: 'photorealistic_from_3d', // AI upscale of a 3D render
    ENHANCED: 'enhanced', // AI cleanup/lighting/color
    INPAINT: 'inpaint', // AI fill of masked region
    UPSCALE: 'upscale', // Resolution increase only
});

export const AI_MARKING_TAGS = Object.freeze(Object.values(AI_MARKING_TYPES));

/**
 * Build a validated metadata payload for an AI-processed image. This
 * is the canonical representation that gets embedded in:
 *   - EXIF/XMP (for DNG, JPEG, PNG via tEXt chunk)
 *   - SQL audit row (ai_image_metadata table)
 *   - Watermark visual overlay
 *   - Report citation block
 *
 * Required fields: type, modelName, modelVersion, promptHash, sourceHash.
 * Rejection is strict - pipelines cannot save without all fields.
 *
 * @param {Record<string, any>} input
 * @returns {{ok: true, metadata: Object} | {ok: false, field: string, reason: string}}
 */
export function buildAiMarkingMetadata(input: Record<string, any>): {ok: true, metadata: Object} | {ok: false, field: string, reason: string} {
    if (!input || typeof input !== 'object') {
        return { ok: false, field: (null as unknown as string), reason: 'input_not_object' };
    }

    // 1. Type - must be in enum
    if (!AI_MARKING_TAGS.includes(input.type)) {
        return { ok: false, field: 'type', reason: 'not_in_enum' };
    }

    // 2. Model identification
    if (typeof input.modelName !== 'string' || input.modelName.length < 2) {
        return { ok: false, field: 'modelName', reason: 'invalid_name' };
    }
    if (typeof input.modelVersion !== 'string' || input.modelVersion.length === 0) {
        return { ok: false, field: 'modelVersion', reason: 'invalid_version' };
    }

    // 3. Prompt hash (SHA-256 hex or 'none' for upscale-only)
    if (
        typeof input.promptHash !== 'string' ||
        (!/^[0-9a-f]{64}$/i.test(input.promptHash) && input.promptHash !== 'none')
    ) {
        return { ok: false, field: 'promptHash', reason: 'invalid_hash' };
    }

    // 4. Source hash - except for FULLY_SYNTHETIC where there's no base
    if (input.type !== AI_MARKING_TYPES.FULLY_SYNTHETIC) {
        if (typeof input.sourceHash !== 'string' || !/^[0-9a-f]{64}$/i.test(input.sourceHash)) {
            return { ok: false, field: 'sourceHash', reason: 'invalid_hash' };
        }
    }

    // 5. Creator identification
    if (typeof input.creatorUserId !== 'string' || input.creatorUserId.length === 0) {
        return { ok: false, field: 'creatorUserId', reason: 'missing' };
    }

    // Build canonical metadata
    const metadata = Object.freeze({
        type: input.type,
        modelName: input.modelName,
        modelVersion: input.modelVersion,
        promptHash: input.promptHash.toLowerCase(),
        sourceHash: input.sourceHash ? input.sourceHash.toLowerCase() : null,
        creatorUserId: input.creatorUserId,
        createdAt: input.createdAt || new Date().toISOString(),
        disclaimer: buildDisclaimerText(input.type),
        watermarkText: buildWatermarkText(input.type),
        // Optional context
        modelId: input.modelId || null,
        notes: input.notes || null,
    });

    return { ok: true, metadata };
}

/**
 * Build the human-readable disclaimer text for a given AI marking type.
 * This text is embedded in reports and image metadata for citation.
 */
export function buildDisclaimerText(type: any) {
    const map = {
        [AI_MARKING_TYPES.FULLY_SYNTHETIC]:
            'Imagem gerada integralmente por inteligência artificial. Não corresponde a fotografia real do local.',
        [AI_MARKING_TYPES.PHOTOREALISTIC_FROM_3D]:
            'Renderização fotorrealista produzida por IA a partir de modelo 3D. Ilustração — não substitui fotografia do local.',
        [AI_MARKING_TYPES.ENHANCED]:
            'Imagem original com ajustes de iluminação/cor aplicados por IA. Conteúdo semântico preservado.',
        [AI_MARKING_TYPES.INPAINT]: 'Imagem com região(ões) preenchidas por IA. Verificar metadados para área afetada.',
        [AI_MARKING_TYPES.UPSCALE]: 'Imagem com resolução aumentada por IA. Conteúdo semântico preservado.',
    };
    return (map as Record<string, any>)[type] || 'Imagem processada por inteligência artificial.';
}

/**
 * Build the watermark overlay text (short, for visual display on the
 * image corner). Must fit ~30 chars.
 */
export function buildWatermarkText(type: any) {
    const map = {
        [AI_MARKING_TYPES.FULLY_SYNTHETIC]: 'IA · 100% sintético',
        [AI_MARKING_TYPES.PHOTOREALISTIC_FROM_3D]: 'IA · render fotorrealista',
        [AI_MARKING_TYPES.ENHANCED]: 'IA · aprimorado',
        [AI_MARKING_TYPES.INPAINT]: 'IA · inpaint',
        [AI_MARKING_TYPES.UPSCALE]: 'IA · upscale',
    };
    return (map as Record<string, any>)[type] || 'IA · processado';
}

/**
 * Verify that an image export pipeline has attached valid AI marking
 * metadata before saving. Use as a guard in the save/export path.
 *
 * @param {Record<string, any>} exportPayload
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function assertAiMarkingPresent(exportPayload: Record<string, any>): {ok: true} | {ok: false, reason: string} {
    if (!exportPayload || typeof exportPayload !== 'object') {
        return { ok: false, reason: 'payload_invalid' };
    }
    if (exportPayload.aiProcessed !== true) {
        // Not AI-processed → no marking required
        return { ok: true };
    }
    const check = buildAiMarkingMetadata(exportPayload.aiMarking || {});
    if (!check.ok) {
        return { ok: false, reason: `ai_marking_invalid:${check.reason}` };
    }
    return { ok: true };
}
