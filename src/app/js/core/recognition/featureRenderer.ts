// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   FEATURE RENDERER — Canvas 2D drawing for aerial recognition
   ================================================================

   Funções puras de renderização de features detectadas e
   marcadores de anotação no canvas de preview aéreo.

   Extraído de handlers/aerial.js para reduzir tamanho do módulo.

   ================================================================ */

interface ContourPoint {
    x: number;
    y: number;
}
interface DetectedFeature {
    family: string;
    label: string;
    confidence: number;
    contours?: Array<Array<ContourPoint>>;
    position?: { x: number; y: number; z: number };
    dimensions?: {
        footprint?: { width: number; length: number };
        dimensions?: { diameter?: number };
        shape?: { radiusX: number; radiusY: number };
        area?: number;
    };
}
interface Extent {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

// ----------------------------------------------------------------
// FEATURE OUTLINE - Contorno poligonal ou bounding box
// ----------------------------------------------------------------

/**
 * Draw a detected feature outline on the preview canvas.
 * Suporta contornos poligonais (color/ML) e bounding boxes (AI Vision).
 *
 * @param ctx - Canvas width
 * @param feature - Canvas height
 * @param extent - Se a feature está selecionada
 * @param cw - Total de features (para controle de labels)
 * @param ch - Mapa família→cor hex
 * @param selected - Mapa família→label (PT)
 */
export function drawFeatureOutline(
    ctx: CanvasRenderingContext2D,
    feature: DetectedFeature,
    extent: Extent,
    cw: number,
    ch: number,
    selected: boolean,
    totalFeatures: number,
    familyColors: Record<string, string>,
    familyLabels: Record<string, string>,
): void {
    const color = familyColors[feature.family] || '#fff';

    // Contour polygon path - real blob shapes from color/ML analysis
    if (feature.contours && feature.contours.length > 0) {
        ctx.save();
        ctx.lineJoin = 'round';

        // Outline: solid for selected, dashed for unselected
        ctx.strokeStyle = color;
        ctx.lineWidth = selected ? 2.5 : 1;
        ctx.globalAlpha = selected ? 0.9 : 0.3;
        if (!selected) ctx.setLineDash([4, 3]);

        for (const contour of feature.contours) {
            if (contour.length < 3) continue;
            ctx.beginPath();
            ctx.moveTo((contour[0] as ContourPoint).x * cw, (contour[0] as ContourPoint).y * ch);
            for (let i = 1; i < contour.length; i++) {
                ctx.lineTo((contour[i] as ContourPoint).x * cw, (contour[i] as ContourPoint).y * ch);
            }
            ctx.closePath();
            ctx.stroke();
        }

        // Semi-transparent fill - higher opacity than bounding boxes
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.globalAlpha = selected ? 0.35 : 0.1;
        for (const contour of feature.contours) {
            if (contour.length < 3) continue;
            ctx.beginPath();
            ctx.moveTo((contour[0] as ContourPoint).x * cw, (contour[0] as ContourPoint).y * ch);
            for (let i = 1; i < contour.length; i++) {
                ctx.lineTo((contour[i] as ContourPoint).x * cw, (contour[i] as ContourPoint).y * ch);
            }
            ctx.closePath();
            ctx.fill();
        }

        // Label at contour centroid
        const confPct = Math.round(feature.confidence * 100);
        const showLabel = selected && (totalFeatures <= 20 || confPct >= 50);
        if (showLabel) {
            let lx = 0,
                ly = 0,
                n = 0;
            for (const contour of feature.contours) {
                for (const pt of contour) {
                    lx += pt.x * cw;
                    ly += pt.y * ch;
                    n++;
                }
            }
            if (n > 0) {
                lx /= n;
                ly /= n;
            }

            ctx.globalAlpha = 0.95;
            const match = feature.label.match(/\d+$/);
            const num = match ? match[0] : '';
            const abbr = (familyLabels[feature.family] || feature.family).charAt(0).toUpperCase();
            const label = `${abbr}${num} ${confPct}%`;

            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            const labelW = ctx.measureText(label).width + 6;
            const labelY = ly - 5;

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            roundRect(ctx, lx - labelW / 2, labelY - 13, labelW, 14, 4);
            ctx.fill();

            ctx.fillStyle = color;
            ctx.fillText(label, lx, labelY);
        }

        ctx.restore();
        return;
    }

    // Fallback: bounding box/circle for features without contours (AI Vision)
    const ex = extent.maxX - extent.minX;
    const ez = extent.maxZ - extent.minZ;
    if (ex === 0 || ez === 0) return;
    if (!feature.position) return;

    const cx = ((feature.position.x - extent.minX) / ex) * cw;
    const cy = ((feature.position.z - extent.minZ) / ez) * ch;

    const dims = feature.dimensions || {};
    let pw: number;
    let ph: number;
    if (feature.family === 'building' && dims.footprint) {
        pw = Math.max(10, (dims.footprint.width / ex) * cw);
        ph = Math.max(10, (dims.footprint.length / ez) * ch);
    } else if (feature.family === 'tank' && dims.dimensions) {
        const d = dims.dimensions.diameter || 5;
        pw = ph = Math.max(10, (d / ex) * cw);
    } else if (feature.family === 'lake' && dims.shape) {
        pw = Math.max(10, ((dims.shape.radiusX * 2) / ex) * cw);
        ph = Math.max(10, ((dims.shape.radiusY * 2) / ez) * ch);
    } else if (feature.family === 'habitat' && dims.area) {
        const side = Math.sqrt(dims.area);
        pw = ph = Math.max(10, (side / ex) * cw);
    } else {
        pw = ph = 12;
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2.5 : 1;
    ctx.globalAlpha = selected ? 0.95 : 0.35;
    if (!selected) ctx.setLineDash([3, 3]);

    if (feature.family === 'tank') {
        ctx.beginPath();
        ctx.arc(cx, cy, pw / 2, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, 2);
        ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.globalAlpha = selected ? 0.12 : 0.04;
    if (feature.family === 'tank') {
        ctx.beginPath();
        ctx.arc(cx, cy, pw / 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
    }

    const confPct = Math.round(feature.confidence * 100);
    const showLabel = selected && (totalFeatures <= 20 || confPct >= 50);
    if (showLabel) {
        ctx.globalAlpha = 0.95;
        const match = feature.label.match(/\d+$/);
        const num = match ? match[0] : '';
        const abbr = (familyLabels[feature.family] || feature.family).charAt(0).toUpperCase();
        const label = `${abbr}${num} ${confPct}%`;

        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        const labelW = ctx.measureText(label).width + 6;
        const labelY = cy - ph / 2 - 3;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        roundRect(ctx, cx - labelW / 2, labelY - 13, labelW, 14, 4);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.fillText(label, cx, labelY);
    }

    ctx.restore();
}

// ----------------------------------------------------------------
// ROUNDED RECTANGLE - Canvas path helper
// ----------------------------------------------------------------

/**
 * Draw a rounded rectangle path on ctx.
 * @param ctx - Corner radius
 */
export function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ----------------------------------------------------------------
// ANNOTATION MARKER - Pin-style marker
// ----------------------------------------------------------------

/**
 * Draw a single annotation marker on the canvas.
 * Pin-style marker com circulo colorido e numero.
 * @param ctx - Pixel x on canvas
 * @param x - Pixel y on canvas
 * @param y - 1-based sequence number
 * @param family - Mapa família→cor hex
 */
export function drawAnnotationMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    family: string,
    index: number,
    familyColors: Record<string, string>,
): void {
    const radius = 12;
    const color = familyColors[family] || '#fff';

    ctx.save();

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    // Pin tail (small triangle pointing down)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + radius - 3);
    ctx.lineTo(x, y + radius + 6);
    ctx.lineTo(x + 5, y + radius - 3);
    ctx.fill();

    // Main circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Reset shadow for subsequent draws
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // White border ring
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner white ring (gives depth)
    ctx.beginPath();
    ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Index number
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index), x, y);

    ctx.restore();
}
