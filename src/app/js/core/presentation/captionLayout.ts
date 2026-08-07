// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Caption Layout - procedural safe-area + focus-aware placement.
// Replaces hardcoded lower-third so desktop fullscreen stays readable.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE_LAUNCH_VIDEO.md §9.3 (LV4)

interface ViewportProfile {
    aspect: number;
    safeBottom: number;
    safeTop: number;
    safeHorizontal: number;
    maxLines: number;
    fontScale: number;
}

export const VIEWPORT_PROFILES: Readonly<Record<string, ViewportProfile>> = Object.freeze({
    mobile: { aspect: 9 / 16, safeBottom: 0.12, safeTop: 0.08, safeHorizontal: 0.05, maxLines: 3, fontScale: 1.0 },
    desktop: { aspect: 16 / 9, safeBottom: 0.18, safeTop: 0.08, safeHorizontal: 0.08, maxLines: 2, fontScale: 1.15 },
    clean_export: {
        aspect: 9 / 16,
        safeBottom: 0.14,
        safeTop: 0.08,
        safeHorizontal: 0.06,
        maxLines: 3,
        fontScale: 1.05,
    },
});

const CAPTION_HEIGHT_ESTIMATE: Record<string, number> = { mobile: 0.14, desktop: 0.12, clean_export: 0.14 };
const FOCUS_BUFFER = 0.04;

/**
 * Resolve an effective viewport profile, optionally overriding defaults.
 *
 * @param viewport - 'mobile' | 'desktop' | 'clean_export'
 */
export function getViewportProfile(
    viewport: string,
    overrides: Partial<ViewportProfile> = {}
): ViewportProfile & { viewport: string } {
    const base = VIEWPORT_PROFILES[viewport] || VIEWPORT_PROFILES.desktop;
    return { viewport, ...(base as ViewportProfile), ...overrides };
}

interface Hotspot {
    x?: number;
    y: number;
    w?: number;
    h: number;
}

/**
 * Compute caption bounding box (normalized 0-1 coords) given focus + viewport + player controls.
 *
 * Rules:
 * - Place opposite to focus on Y axis (focus bottom → caption top; focus top → caption bottom).
 * - Never inside safe-area margins.
 * - If focus and lower band collide, caption goes to upper-mid.
 * - If playerControls is true, reserve extra bottom margin (UI player overlay).
 * - If hotspot is center-horizontal, caption centers; if left, caption goes right; if right, caption goes left.
 */
export function computeCaptionBox(input: {
    viewport?: string | undefined;
    hotspot?: Hotspot | null | undefined;
    playerControls?: boolean | undefined;
    captionAlign?: string | undefined;
    captionZone?: string | undefined;
}): {
    x: number;
    y: number;
    w: number;
    h: number;
    align: string;
    zone: string;
    warnings: string[];
    fontScale: number;
    maxLines: number;
} {
    const viewport = input.viewport || 'desktop';
    const profile = getViewportProfile(viewport);
    const warnings: string[] = [];
    const playerControls = !!input.playerControls;
    const captionAlign = input.captionAlign || 'left';
    const requestedZone = input.captionZone || 'auto';

    const safeBottom = profile.safeBottom + (playerControls ? 0.06 : 0);
    const safeTop = profile.safeTop;
    const safeH = profile.safeHorizontal;
    const captionH = CAPTION_HEIGHT_ESTIMATE[viewport] || 0.12;

    let zone = requestedZone;
    if (requestedZone === 'auto') {
        zone = _pickZone(input.hotspot, safeBottom, safeTop, captionH);
    }

    const y = _yForZone(zone, safeBottom, safeTop, captionH);
    const { x, w } = _xForAlign(captionAlign, safeH, input.hotspot);

    if (input.hotspot) {
        const captionTop = y;
        const captionBottom = y + captionH;
        const fTop = input.hotspot.y;
        const fBottom = input.hotspot.y + (input.hotspot.h || 0);
        if (!(captionBottom < fTop - FOCUS_BUFFER || captionTop > fBottom + FOCUS_BUFFER)) {
            warnings.push('CAPTION_OVERLAPS_FOCUS');
        }
    }

    if (y + captionH > 1 - profile.safeBottom) warnings.push('CAPTION_UNSAFE_BOTTOM');
    if (y < profile.safeTop) warnings.push('CAPTION_UNSAFE_TOP');

    return {
        x,
        y,
        w,
        h: captionH,
        align: captionAlign,
        zone,
        warnings,
        fontScale: profile.fontScale,
        maxLines: profile.maxLines,
    };
}

function _pickZone(
    hotspot: Hotspot | null | undefined,
    _safeBottom: number,
    _safeTop: number,
    _captionH: number
): string {
    if (!hotspot) return 'lower-mid';
    const hCenter = hotspot.y + (hotspot.h || 0) / 2;
    const frameMid = 0.5;
    const hotspotInLowerBand = hotspot.y > 0.55;
    if (hotspotInLowerBand) return 'top';
    if (hCenter < frameMid) return 'lower-mid';
    return 'top';
}

function _yForZone(zone: string, safeBottom: number, safeTop: number, captionH: number): number {
    switch (zone) {
        case 'top':
            return safeTop + 0.04;
        case 'middle':
            return 0.5 - captionH / 2;
        case 'lower-mid':
            return 1 - safeBottom - captionH - 0.04;
        case 'lower':
            return 1 - safeBottom - captionH;
        default:
            return 1 - safeBottom - captionH - 0.04;
    }
}

function _xForAlign(
    align: string,
    safeH: number,
    _hotspot: Hotspot | null | undefined
): { x: number; w: number } {
    const width = 1 - safeH * 2;
    switch (align) {
        case 'center':
            return { x: safeH, w: width };
        case 'right':
            return { x: safeH + width * 0.4, w: width * 0.6 };
        case 'left':
        default:
            return { x: safeH, w: width * 0.6 };
    }
}

/**
 * Determine if a step's caption configuration stays inside safe area when rendered.
 *
 * @param step - sanitized step (v1.1 schema)
 */
export function validateCaptionSafety(
    step: { layout?: { caption_zone?: string; caption_align?: string }; focus?: { rect?: Hotspot | null } } | null | undefined,
    viewport: string = 'desktop'
): { ok: boolean; violations: string[]; box?: ReturnType<typeof computeCaptionBox> } {
    if (!step) return { ok: false, violations: ['NO_STEP'] };
    const layout = step.layout || { caption_zone: 'auto', caption_align: 'left' };
    const box = computeCaptionBox({
        viewport,
        hotspot: step.focus?.rect || null,
        captionAlign: layout.caption_align,
        captionZone: layout.caption_zone,
        playerControls: true,
    });
    const violations = box.warnings.filter((w) => w.startsWith('CAPTION_UNSAFE'));
    return { ok: violations.length === 0, violations, box };
}

/**
 * Estimate how many lines a caption will break into given a max width (characters).
 * Uses average char width heuristic; good enough for pre-export warnings.
 */
export function estimateLineCount(text: string, charsPerLine: number = 40): number {
    if (!text) return 0;
    const words = String(text).split(/\s+/);
    let lines = 1;
    let current = 0;
    for (const w of words) {
        if (current + w.length + 1 > charsPerLine) {
            lines += 1;
            current = w.length;
        } else {
            current += w.length + 1;
        }
    }
    return lines;
}

/**
 * Check whether caption text fits the viewport's max-lines budget.
 */
export function checkCaptionFit(
    text: string,
    viewport: string = 'desktop',
    charsPerLine: number = 40
): { fits: boolean; lines: number; max: number } {
    const profile = getViewportProfile(viewport);
    const lines = estimateLineCount(text, charsPerLine);
    return { fits: lines <= profile.maxLines, lines, max: profile.maxLines };
}
