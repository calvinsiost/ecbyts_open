// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only

/**
 * playbackFrameClip.ts — Phase 2 TS source for playback frame clip transform helpers.
 */

export interface PlaybackFrameClipRect {
    x?: unknown;
    y?: unknown;
    w?: unknown;
    h?: unknown;
}

export interface PlaybackFrameClip {
    mode?: string;
    rect?: PlaybackFrameClipRect | null;
}

export interface NormalizedRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

function _clamp(value: unknown, min: number, max: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

export function normalizeFrameClipRect(frameClip: PlaybackFrameClip | null | undefined): NormalizedRect {
    const rect = frameClip?.rect;
    if (!rect || typeof rect !== 'object') {
        return { x: 0, y: 0, w: 1, h: 1 };
    }
    const w = _clamp(rect.w, 0.08, 1);
    const h = _clamp(rect.h, 0.08, 1);
    const x = _clamp(rect.x, 0, Math.max(0, 1 - w));
    const y = _clamp(rect.y, 0, Math.max(0, 1 - h));
    return { x, y, w, h };
}

export function shouldApplyPlaybackFrameClip(frameClip: PlaybackFrameClip | null | undefined): boolean {
    if (!frameClip) return false;
    if (frameClip.mode === 'full') return false;
    const rect = normalizeFrameClipRect(frameClip);
    return !(rect.x === 0 && rect.y === 0 && rect.w === 1 && rect.h === 1);
}

export interface PlaybackViewportTransform {
    rect: NormalizedRect;
    scale: number;
    translateX: number;
    translateY: number;
    transform: string;
}

export function computePlaybackViewportTransform(
    frameClip: PlaybackFrameClip | null | undefined,
    viewportWidth: unknown,
    viewportHeight: unknown,
): PlaybackViewportTransform {
    const width = Math.max(1, Number(viewportWidth) || 1);
    const height = Math.max(1, Number(viewportHeight) || 1);
    const rect = normalizeFrameClipRect(frameClip);
    const scale = Math.max(1 / rect.w, 1 / rect.h);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;

    const desiredX = width / 2 - centerX * scaledWidth;
    const desiredY = height / 2 - centerY * scaledHeight;
    const minX = width - scaledWidth;
    const minY = height - scaledHeight;
    const translateX = _clamp(desiredX, minX, 0);
    const translateY = _clamp(desiredY, minY, 0);

    return {
        rect,
        scale,
        translateX,
        translateY,
        transform: `translate(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px) scale(${scale.toFixed(6)})`,
    };
}
