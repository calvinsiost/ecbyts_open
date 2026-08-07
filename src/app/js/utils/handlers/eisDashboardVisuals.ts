// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const DEFAULT_START_OFFSET = -HALF_PI;
const DEFAULT_GAP_ANGLE = 0.03;

// eslint-disable-next-line
function buildPolygonPoints({ centerX, centerY, radius, axisCount, startOffset, valueResolver }: any) {
    const step = TWO_PI / axisCount;
    const points = [];
    for (let index = 0; index < axisCount; index++) {
        const angle = startOffset + index * step;
        const distance = valueResolver(index);
        points.push({
            x: centerX + Math.cos(angle) * distance,
            y: centerY + Math.sin(angle) * distance,
        });
    }
    return points;
}

export function formatRingValue(value: any, digits = 1, fallback = '-') {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : fallback;
}

export function sanitizeVerdictLabel(verdictLabel: any, maxLength = 16) {
    const cleanVerdict = String(verdictLabel || '')
        .replace(/^[^\w]*/, '')
        .trim();
    if (!cleanVerdict) return '';
    if (cleanVerdict.length <= maxLength) return cleanVerdict;
    return `${cleanVerdict.substring(0, maxLength - 1)}~`;
}

export function computeRingChartLayout({
    width,
    height,
    scores = {},
    weights = {},
    axisOrder = null,
    eisScore = 0,
    verdictLabel = '',
    vetoed = false,
    scoreToColor,
    getVerdictColor,
}: any) {
    const axes: any[] = Array.isArray(axisOrder) && axisOrder.length ? axisOrder : Object.keys(scores);
    const totalWeight = axes.reduce((sum: number, axis: any) => sum + Number((weights as Record<string, any>)[axis] || 1), 0);
    if (!axes.length || !totalWeight) {
        return { hasData: false, axes: [], segments: [], radarGridRings: [], radarPolygon: [] };
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const innerRadius = 75;
    const outerRadius = 115;
    const referenceRadius = 121;
    const centerRadius = innerRadius - 4;
    const radarRadius = centerRadius - 12;
    const ringWidth = outerRadius - innerRadius;
    const thresholdRadii = [innerRadius + ringWidth * 0.7, innerRadius + ringWidth * 0.9];
    const availableArc = TWO_PI - DEFAULT_GAP_ANGLE * axes.length;
    const labelRadius = outerRadius + 14;
    const scoreRadius = (innerRadius + outerRadius) / 2;
    const centerColor = vetoed ? 'rgb(239,68,68)' : (scoreToColor?.(eisScore) ?? '');
    const cleanedVerdict = sanitizeVerdictLabel(verdictLabel);

    let angle = DEFAULT_START_OFFSET;
    const interactiveSegments: any[] = [];
    const segments = axes.map((axis: any) => {
        const weight = Number((weights as Record<string, any>)[axis] || 1);
        const score = Number((scores as Record<string, any>)[axis] || 0);
        const arcSpan = (weight / totalWeight) * availableArc;
        const startAngle = angle;
        const endAngle = angle + arcSpan;
        const midAngle = (startAngle + endAngle) / 2;
        const tickLength = 4;
        const thresholdTicks = thresholdRadii.map((radius) => ({
            x1: centerX + Math.cos(midAngle) * (radius - tickLength),
            y1: centerY + Math.sin(midAngle) * (radius - tickLength),
            x2: centerX + Math.cos(midAngle) * (radius + tickLength),
            y2: centerY + Math.sin(midAngle) * (radius + tickLength),
        }));
        const arcLength = arcSpan * scoreRadius;
        const scoreLabel =
            arcLength > 38
                ? {
                      x: centerX + Math.cos(midAngle) * scoreRadius,
                      y: centerY + Math.sin(midAngle) * scoreRadius,
                      text: formatRingValue(score, 1),
                  }
                : null;

        const segment = {
            axis,
            score,
            weight,
            startAngle,
            endAngle,
            midAngle,
            fillColor: scoreToColor?.(score) ?? '',
            verdictColor: getVerdictColor?.(score) ?? '',
            labelPoint: {
                x: centerX + Math.cos(midAngle) * labelRadius,
                y: centerY + Math.sin(midAngle) * labelRadius,
            },
            scoreLabel,
            thresholdTicks,
        };
        interactiveSegments.push({
            axis,
            startAngle,
            endAngle,
            innerR: innerRadius,
            outerR: outerRadius,
            cx: centerX,
            cy: centerY,
        });
        angle = endAngle + DEFAULT_GAP_ANGLE;
        return segment;
    });

    const radarGridRings =
        radarRadius > 15 && axes.length >= 3
            ? Array.from({ length: 5 }, (_, ringIndex) =>
                  buildPolygonPoints({
                      centerX,
                      centerY,
                      radius: radarRadius,
                      axisCount: axes.length,
                      startOffset: DEFAULT_START_OFFSET,
                      valueResolver: () => ((ringIndex + 1) / 5) * radarRadius,
                  }),
              )
            : [];

    const radarPolygon =
        radarRadius > 15 && axes.length >= 3
            ? buildPolygonPoints({
                  centerX,
                  centerY,
                  radius: radarRadius,
                  axisCount: axes.length,
                  startOffset: DEFAULT_START_OFFSET,
                  valueResolver: (index: any) => {
                      const axis = axes[index];
                      const score = Math.min(Number((scores as Record<string, any>)[axis] || 0), 5);
                      return (score / 5) * radarRadius;
                  },
              })
            : [];

    const ariaVerdict = cleanedVerdict ? ` ${cleanedVerdict}` : '';
    const ariaVeto = vetoed ? ' VETOED' : '';

    return {
        hasData: true,
        axes,
        centerX,
        centerY,
        innerRadius,
        outerRadius,
        referenceRadius,
        centerRadius,
        radarRadius,
        thresholdRadii,
        centerColor,
        cleanedVerdict,
        centerScoreText: formatRingValue(eisScore, 2),
        vetoBadgeText: vetoed ? 'VETOED' : '',
        ariaLabel: `EIS Ring Chart: ${formatRingValue(eisScore, 2, '0')}${ariaVerdict}${ariaVeto}`,
        radarGridRings,
        radarPolygon,
        segments,
        interactiveSegments,
    };
}

export function computeScaleStripState({ eisScore, markerColor, managementReadyMin, auditReadyMin }: any) {
    if (!Number.isFinite(eisScore)) {
        return { visible: false };
    }

    return {
        visible: true,
        leftPct: Number(Math.min(100, Math.max(0, (eisScore / 5) * 100)).toFixed(2)),
        markerColor,
        valueText: Number(eisScore).toFixed(2),
        managementPct: Number(((managementReadyMin / 5) * 100).toFixed(2)),
        auditPct: Number(((auditReadyMin / 5) * 100).toFixed(2)),
        managementReadyMin,
        auditReadyMin,
    };
}

export function buildScaleStripHtml({
    leftPct,
    markerColor,
    valueText,
    managementPct,
    auditPct,
    managementReadyMin,
    auditReadyMin,
}: any) {
    return `
        <div class="eis-scale-track">
            <div class="eis-scale-threshold" style="left:${managementPct}%">
                <span class="eis-scale-threshold-line"></span>
                <span class="eis-scale-threshold-label">${managementReadyMin}</span>
            </div>
            <div class="eis-scale-threshold" style="left:${auditPct}%">
                <span class="eis-scale-threshold-line"></span>
                <span class="eis-scale-threshold-label">${auditReadyMin}</span>
            </div>
            <div class="eis-scale-marker" style="left:${leftPct}%;color:${markerColor}">
                <span class="eis-scale-marker-arrow">&#9650;</span>
                <span class="eis-scale-marker-value" style="color:${markerColor}">${valueText}</span>
            </div>
        </div>
        <div class="eis-scale-labels">
            <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
        </div>
    `;
}
