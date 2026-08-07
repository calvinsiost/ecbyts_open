// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

function resolveDevicePixelRatio(rawValue: any): number {
    const value = Number(rawValue);
    return Number.isFinite(value) && value > 0 ? value : 1;
}

export function setupHiDPICanvas(
    canvas: any,
    devicePixelRatio: any = resolveDevicePixelRatio(
        (globalThis as any)?.window?.devicePixelRatio ?? (globalThis as any)?.devicePixelRatio ?? 1,
    ),
): { ctx: any; W: number; H: number } {
    const ctx = canvas.getContext('2d');
    const dpr = resolveDevicePixelRatio(devicePixelRatio);
    const logicalW = Number(canvas.dataset.logicalW || canvas.width || 0);
    const logicalH = Number(canvas.dataset.logicalH || canvas.height || 0);

    if (canvas.dataset.scaled !== '1' || canvas.dataset.dpr !== String(dpr)) {
        canvas.dataset.logicalW = String(logicalW);
        canvas.dataset.logicalH = String(logicalH);
        canvas.width = Math.round(logicalW * dpr);
        canvas.height = Math.round(logicalH * dpr);
        canvas.style.width = `${logicalW}px`;
        canvas.style.height = `${logicalH}px`;

        if (typeof ctx.setTransform === 'function') {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else {
            ctx.scale(dpr, dpr);
        }

        canvas.dataset.scaled = '1';
        canvas.dataset.dpr = String(dpr);
    }

    return {
        ctx,
        W: logicalW,
        H: logicalH,
    };
}

export function getCanvasPointerPosition(canvas: any, event: any): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const logicalW = Number(canvas.dataset.logicalW || canvas.width || 0);
    const logicalH = Number(canvas.dataset.logicalH || canvas.height || 0);
    const scaleX = rect.width > 0 ? logicalW / rect.width : 1;
    const scaleY = rect.height > 0 ? logicalH / rect.height : 1;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
    };
}

export function hitTestRingSegment(
    segments: any = [],
    mouseX: any,
    mouseY: any,
    tolerance = 0.01,
): { axis: any; segment: any } | null {
    for (let index = segments.length - 1; index >= 0; index--) {
        const segment = segments[index];
        const dx = mouseX - segment.cx;
        const dy = mouseY - segment.cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < segment.innerR || distance > segment.outerR) continue;

        let angle = Math.atan2(dy, dx);
        while (angle < segment.startAngle - tolerance) angle += Math.PI * 2;
        while (angle > segment.startAngle + Math.PI * 2 + tolerance) angle -= Math.PI * 2;

        if (angle >= segment.startAngle - tolerance && angle <= segment.endAngle + tolerance) {
            return { axis: segment.axis, segment };
        }
    }

    return null;
}

export function toggleExpandedAxis(currentAxis: any, clickedAxis: any): any {
    return currentAxis === clickedAxis ? null : clickedAxis;
}

export function applyAlphaToRgb(color: any, alpha: any): string {
    const match = String(color || '').match(/rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i);
    if (!match) return String(color || '');

    const [, r, g, b] = match;
    return `rgba(${r},${g},${b},${alpha})`;
}

export function traceClosedPolygonPath(ctx: any, points: any = []): boolean {
    if (!Array.isArray(points) || points.length === 0) return false;

    ctx.beginPath();
    for (let index = 0; index <= points.length; index++) {
        const point = points[index % points.length];
        if (index === 0) {
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
        }
    }
    ctx.closePath();
    return true;
}
