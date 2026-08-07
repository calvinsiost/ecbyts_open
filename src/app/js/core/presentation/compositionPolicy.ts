// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Composition Policy - intra-frame positioning driven by metadata.
// Orchestrates caption + headline + CTA + proof blocks procedurally per step.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE_LAUNCH_VIDEO.md §9.3 (LV4b)


import { computeCaptionBox, getViewportProfile } from './captionLayout.js';

const BLOCK_PRIORITIES: Record<string, string[]> = {
    focus: ['headline', 'caption', 'proof', 'cta'],
    proof: ['proof', 'caption', 'headline', 'cta'],
    compare: ['headline', 'caption', 'proof', 'cta'],
    tour: ['caption', 'headline', 'proof', 'cta'],
    cta: ['cta', 'headline', 'caption', 'proof'],
};

const FRAME_CLIP_PRESETS = Object.freeze({
    center: { x: 0.14, y: 0.14, w: 0.72, h: 0.72 },
    'left-pane': { x: 0.04, y: 0.18, w: 0.62, h: 0.62 },
    'right-pane': { x: 0.34, y: 0.18, w: 0.62, h: 0.62 },
    top: { x: 0.16, y: 0.04, w: 0.68, h: 0.68 },
    bottom: { x: 0.16, y: 0.28, w: 0.68, h: 0.68 },
});

/**
 * Build a full frame composition plan for a step.
 * Returns positioned blocks (headline, caption, proof, cta) with z-order + warnings.
 *
 * @param step - sanitized step v1.1 (story/focus/layout/export fields)
 * @param viewport - 'mobile' | 'desktop' | 'clean_export'
 */
export function planComposition(
    step: any,
    viewport: string = 'desktop',
    options: any = {},
): { blocks: any[]; warnings: string[]; viewport: string; captionBox?: any; frameClip?: any } {
    const warnings: any[] = [];
    if (!step) return { blocks: [], warnings: ['NO_STEP'], viewport };

    const profile = getViewportProfile(viewport);
    const story = step.story || {};
    const intent = story.intent || 'tour';
    const priority = (BLOCK_PRIORITIES as Record<string, string[]>)[intent] || (BLOCK_PRIORITIES.tour as string[]);
    const layout = step.layout || { caption_zone: 'auto', caption_align: 'left' };
    const frameClip = computeFrameClip(step, viewport);
    frameClip.warnings.forEach((w) => warnings.push(`frameClip:${w}`));

    const captionBox = computeCaptionBox({
        viewport,
        hotspot: step.focus?.rect || null,
        captionAlign: layout.caption_align,
        captionZone: layout.caption_zone,
        playerControls: !!options.playerControls,
    });
    captionBox.warnings.forEach((w: any) => warnings.push(`caption:${w}`));

    const blocks = [];

    if (story.headline && priority.includes('headline') && intent !== 'cta') {
        blocks.push(_buildHeadlineBlock(step, viewport, profile, captionBox));
    }

    if (story.caption_short || story.caption_text) {
        blocks.push({
            type: 'caption',
            text: story.caption_short || story.caption_text,
            box: { x: captionBox.x, y: captionBox.y, w: captionBox.w, h: captionBox.h },
            align: captionBox.align,
            zone: captionBox.zone,
            fontScale: captionBox.fontScale,
            maxLines: captionBox.maxLines,
            zIndex: 20,
        });
    }

    if (story.claim_level === 'verified' && step.focus && intent !== 'cta') {
        blocks.push(_buildProofBlock(step, viewport, profile, captionBox));
    }

    if (intent === 'cta' && (story.headline || story.caption_text || story.caption_short)) {
        blocks.push(_buildCtaBlock(step, viewport, profile));
    }

    _detectCollisions(blocks, warnings);
    _detectLowerThirdRepeat(step, options.previousBlocks || [], warnings);

    return {
        viewport,
        blocks: _sortByZ(blocks),
        warnings,
        captionBox,
        frameClip,
    };
}

/**
 * Compute a normalized frame clip plan for a step.
 * Returned rect lives in the same normalized 0-1 frame space used by overlays.
 */
export function computeFrameClip(
    step: any,
    viewport: string = 'desktop',
): {
    viewport: string;
    requestedMode: string;
    mode: string;
    rect: { x: number; y: number; w: number; h: number };
    warnings: string[];
} {
    const warnings: any[] = [];
    if (!step) {
        return {
            viewport,
            requestedMode: 'full',
            mode: 'full',
            rect: { x: 0, y: 0, w: 1, h: 1 },
            warnings: ['NO_STEP'],
        };
    }

    const layout = step.layout || {};
    const requestedMode = layout.frame_clip_mode || 'auto';
    let mode = requestedMode;
    if (requestedMode === 'auto') {
        mode = step.focus?.rect ? 'focus' : 'full';
    }

    let rect: { x: number; y: number; w: number; h: number } | null;
    switch (mode) {
        case 'full':
            rect = { x: 0, y: 0, w: 1, h: 1 };
            break;
        case 'focus':
            rect = _buildFocusFrameClip(step.focus?.rect, warnings);
            break;
        case 'center':
        case 'left-pane':
        case 'right-pane':
        case 'top':
        case 'bottom':
            rect = (FRAME_CLIP_PRESETS as Record<string, any>)[mode];
            break;
        case 'custom':
            rect = layout.frame_clip_rect || null;
            if (!rect) {
                warnings.push('CUSTOM_RECT_MISSING');
                rect = FRAME_CLIP_PRESETS.center;
            }
            break;
        default:
            warnings.push(`UNKNOWN_MODE:${requestedMode}`);
            mode = step.focus?.rect ? 'focus' : 'full';
            rect = mode === 'focus' ? _buildFocusFrameClip(step.focus?.rect, warnings) : { x: 0, y: 0, w: 1, h: 1 };
            break;
    }

    const sanitized = _sanitizeFrameClipRect(rect, warnings);
    if (mode === 'focus' && step.focus?.rect && !_containsRect(sanitized, step.focus.rect)) {
        warnings.push('FOCUS_TRUNCATED');
    }

    return {
        viewport,
        requestedMode,
        mode,
        rect: sanitized,
        warnings,
    };
}

function _buildHeadlineBlock(step: any, viewport: any, profile: any, captionBox: any) {
    const story = step.story || {};
    const inLowerBand = captionBox.zone === 'lower-mid' || captionBox.zone === 'lower';
    // v14-fix (2026-04-19): quando caption está no topo, headline deve ir
    // para zona inferior (antes do proof badge), NÃO para o meio - meio
    // cobre area de prova em beats proof/compare (tabela, chart).
    let y;
    if (inLowerBand) {
        y = profile.safeTop + 0.06;
    } else if (captionBox.zone === 'top') {
        y = 0.66; // lower band segura para mobile sem encostar no safe bottom
    } else {
        y = 0.28; // legacy middle
    }
    return {
        type: 'headline',
        text: story.headline,
        box: { x: profile.safeHorizontal, y, w: 1 - profile.safeHorizontal * 2, h: 0.12 },
        align: captionBox.align,
        fontScale: profile.fontScale * 1.3,
        maxLines: 2,
        zIndex: 25,
    };
}

function _buildProofBlock(step: any, viewport: any, profile: any, _captionBox: any) {
    // Proof badge = watermark bottom-right, independent of caption zone.
    // Avoids collision with headline (which anchors relative to caption position).
    const badgeY = Math.min(0.79, 1 - profile.safeBottom - 0.09);
    return {
        type: 'proof',
        text: '[verified]',
        box: { x: 1 - profile.safeHorizontal - 0.16, y: badgeY, w: 0.14, h: 0.04 },
        align: 'right',
        fontScale: profile.fontScale * 0.7,
        maxLines: 1,
        zIndex: 15,
    };
}

function _buildCtaBlock(step: any, viewport: any, profile: any) {
    return {
        type: 'cta',
        text: step.story?.headline || step.story?.caption_short || step.story?.caption_text || '',
        box: { x: profile.safeHorizontal, y: 0.72, w: 1 - profile.safeHorizontal * 2, h: 0.12 },
        align: 'center',
        fontScale: profile.fontScale * 1.4,
        maxLines: 2,
        zIndex: 30,
    };
}

function _detectCollisions(blocks: any, warnings: any) {
    for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
            if (_rectsOverlap(blocks[i].box, blocks[j].box)) {
                warnings.push(`COLLISION:${blocks[i].type}<->${blocks[j].type}`);
            }
        }
    }
}

function _rectsOverlap(a: any, b: any) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function _detectLowerThirdRepeat(step: any, previousBlocks: any, warnings: any) {
    if (!Array.isArray(previousBlocks) || previousBlocks.length < 2) return;
    const currentCaption = previousBlocks[previousBlocks.length - 1]?.find?.((b: any) => b.type === 'caption');
    const prevCaption = previousBlocks[previousBlocks.length - 2]?.find?.((b: any) => b.type === 'caption');
    if (currentCaption && prevCaption) {
        if (Math.abs((currentCaption.y || 0) - (prevCaption.y || 0)) < 0.05) {
            warnings.push('LOWER_THIRD_REPEAT');
        }
    }
}

function _sortByZ(blocks: any) {
    return blocks.slice().sort((a: any, b: any) => ((a as any).zIndex || 0) - ((b as any).zIndex || 0));
}

function _buildFocusFrameClip(focusRect: any, warnings: any) {
    if (!focusRect) {
        warnings.push('FOCUS_RECT_MISSING');
        return FRAME_CLIP_PRESETS.center;
    }
    const cx = focusRect.x + focusRect.w / 2;
    const cy = focusRect.y + focusRect.h / 2;
    const size = _clamp(Math.max(focusRect.w || 0.3, focusRect.h || 0.3) + 0.14, 0.42, 0.94);
    return _centerRect(cx, cy, size, size);
}

function _centerRect(cx: any, cy: any, w: any, h: any) {
    return {
        x: cx - w / 2,
        y: cy - h / 2,
        w,
        h,
    };
}

function _sanitizeFrameClipRect(rect: any, warnings: any) {
    if (!rect || typeof rect !== 'object') {
        warnings.push('RECT_INVALID');
        return { x: 0, y: 0, w: 1, h: 1 };
    }
    let w = _clamp(Number(rect.w) || 1, 0.08, 1);
    let h = _clamp(Number(rect.h) || 1, 0.08, 1);
    let x = Number(rect.x) || 0;
    let y = Number(rect.y) || 0;
    if (x < 0 || y < 0 || x + w > 1 || y + h > 1) warnings.push('RECT_CLAMPED');
    x = _clamp(x, 0, Math.max(0, 1 - w));
    y = _clamp(y, 0, Math.max(0, 1 - h));
    w = _clamp(w, 0.08, 1 - x);
    h = _clamp(h, 0.08, 1 - y);
    return { x, y, w, h };
}

function _containsRect(outer: any, inner: any) {
    if (!outer || !inner) return false;
    return (
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.w <= outer.x + outer.w &&
        inner.y + inner.h <= outer.y + outer.h
    );
}

function _clamp(value: any, min: any, max: any) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

/**
 * Audit a sequence of steps for composition genericness (repeating lower-third, collision runs).
 */
export function auditCompositionSequence(
    steps: Array<object>,
    viewport: string = 'desktop',
): { warnings: Array<{ index: number; code: string }>; sequenceHealth: number } {
    const warnings: any[] = [];
    if (!Array.isArray(steps) || steps.length === 0) {
        return { warnings: [{ index: -1, code: 'NO_STEPS' }], sequenceHealth: 0 };
    }

    const previousCaptionZones: any[] = [];
    let repeatLowerThird = 0;

    steps.forEach((s, i) => {
        const plan = planComposition(s, viewport);
        plan.warnings.forEach((w) => warnings.push({ index: i, code: w }));
        const captionBlock = plan.blocks.find((b) => b.type === 'caption');
        const zone = captionBlock?.zone || plan.captionBox?.zone || 'unknown';
        previousCaptionZones.push(zone);
        if (previousCaptionZones.length >= 3) {
            const last3 = previousCaptionZones.slice(-3);
            if (last3.every((z) => z === last3[0] && (z === 'lower' || z === 'lower-mid'))) {
                repeatLowerThird += 1;
                warnings.push({ index: i, code: 'SEQUENCE_LOWER_THIRD_REPEAT' });
            }
        }
    });

    const collisionCount = warnings.filter((w) => w.code?.startsWith('COLLISION')).length;
    const sequenceHealth = Math.max(0, 1 - (repeatLowerThird * 0.2 + collisionCount * 0.1));

    return { warnings, sequenceHealth };
}
