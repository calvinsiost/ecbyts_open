// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

function sumWeights(weights: any = {}): number {
    return Object.values(weights).reduce((sum: number, weight: any) => sum + Number(weight || 0), 0);
}

function resolveAxisLabel(axis: any, axisMeta: any, translate: any): any {
    const meta = axisMeta?.[axis];
    return meta ? translate?.(meta.key) || meta.fallback : axis;
}

export function buildVerdictDisplayState({
    result,
    lastUncertainty,
    getVerdictClass,
    getVerdictObject,
    renderUncertaintyBadge,
}: any): any {
    const source = result?.aggregationSource === 'sql' ? 'sql' : 'runtime';
    const verdictScore = Number(result?.eis);
    const verdictObj = getVerdictObject?.(verdictScore);

    return {
        badgeText: result?.verdict || '',
        badgeClassName: `eis-verdict-badge ${getVerdictClass?.(verdictScore) || ''}`.trim(),
        descText: verdictObj?.desc || '',
        sourceBadgeClassName: `eis-source-badge ${source}`,
        sourceBadgeText: source === 'sql' ? 'SQL Official' : 'Runtime Draft',
        vetoVisible: result?.vetoed === true,
        uncertaintyHtml:
            lastUncertainty && lastUncertainty.className
                ? renderUncertaintyBadge?.(lastUncertainty, { id: 'eis-uncertainty' }) || ''
                : '',
    };
}

export function buildRingTooltipModel(_params: any): any {
    const {
        axis,
        axisMeta,
        translate,
        adjustedScores = {},
        fallbackScores = {},
        weights = {},
        autoResult = null,
        isAuto = false,
        buildAutoTooltip,
        scoreToColor,
    } = _params;
    const label = resolveAxisLabel(axis, axisMeta, translate);
    const score = adjustedScores?.[axis] ?? fallbackScores?.[axis] ?? '?';
    const weight = Number(weights?.[axis] ?? 0);
    const totalWeight = sumWeights(weights);

    return {
        axis,
        label,
        score,
        scoreColor: scoreToColor?.(score) || '',
        weight,
        totalWeight,
        pct: totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0,
        sourceText:
            isAuto && autoResult
                ? buildAutoTooltip?.(axis, autoResult) || ''
                : translate?.('eis.source_manual') || 'Manual',
        clickHint: translate?.('eis.click_details') || 'Click for details',
    };
}

export function getAxisDetailBars(axis: any, autoResult: any = {}): any {
    switch (axis) {
        case 'T':
            return [
                {
                    label: 'Credential',
                    value: Math.min(1, (autoResult.aggregateMultiplier || 1) / 2),
                    display: `${(autoResult.aggregateMultiplier || 1).toFixed(2)}x`,
                },
                {
                    label: 'Traceability',
                    value: autoResult.tracedRatio || 0,
                    display: `${Math.round((autoResult.tracedRatio || 0) * 100)}%`,
                },
            ];
        case 'A':
            if (autoResult.method === 'sensor') {
                return [
                    {
                        label: 'Operational',
                        value: autoResult.validationRatio || 0,
                        display: `${autoResult.sensorsOperational || 0}/${autoResult.sensorsTotal || 0}`,
                    },
                ];
            }
            return [
                {
                    label: 'Valid obs',
                    value: autoResult.validationRatio || 0,
                    display: `${Math.round((autoResult.validationRatio || 0) * 100)}%`,
                },
            ];
        case 'Cp':
            return [
                {
                    label: 'Exec/Plan',
                    value: autoResult.ratio || 0,
                    display: `${autoResult.totalExecuted || 0}/${autoResult.totalPlanned || 0}`,
                },
            ];
        case 'Ty':
            return [
                {
                    label: 'Median age',
                    value: Math.max(0, 1 - (autoResult.medianAgeDays || 0) / 365),
                    display: `${(autoResult.medianAgeDays || 0).toFixed(0)}d`,
                },
            ];
        case 'Cs':
            return [
                {
                    label: 'SI units',
                    value: autoResult.ratio || 0,
                    display: `${autoResult.standardCount || 0}/${autoResult.totalCount || 0}`,
                },
            ];
        case 'Cm':
            return [
                {
                    label: 'Mapped',
                    value: autoResult.totalCount ? (autoResult.mappedCount || 0) / autoResult.totalCount : 0,
                    display: `${autoResult.mappedCount || 0}/${autoResult.totalCount || 0}`,
                },
            ];
        default:
            return [];
    }
}

export function buildAxisDetailViewModel(_params: any): any {
    const {
        axis,
        currentMode,
        axisMeta,
        translate,
        adjustedScores = {},
        fallbackScores = {},
        weights = {},
        autoResult = null,
        isAuto = false,
        scoreToColor,
        lastScores = null,
        credMultiplier = 1,
        computeImpactIfImproved,
        cachedAllObs = null,
        elements = [],
        campaignDetails = null,
        units,
        parameters,
        collectAxisProblems,
        buildAutoTooltip,
    } = _params;
    if (!axis || currentMode === 'custom') {
        return { clear: true };
    }

    const label = resolveAxisLabel(axis, axisMeta, translate);
    const desc = translate?.(`eis.axis_${axis}_desc`) || '';
    const score = adjustedScores?.[axis] ?? fallbackScores?.[axis] ?? 3;

    let whatIf = null;
    if (lastScores && typeof computeImpactIfImproved === 'function') {
        const impact = computeImpactIfImproved(lastScores, weights, axis, credMultiplier, currentMode);
        if (impact?.delta > 0) {
            whatIf = {
                targetScore: impact.targetScore,
                projectedEIS: impact.projectedEIS,
                delta: impact.delta,
            };
        }
    }

    let problems: any[] = [];
    let fixCount = 0;
    if (isAuto && cachedAllObs && typeof collectAxisProblems === 'function') {
        const result = collectAxisProblems(axis, cachedAllObs, elements, campaignDetails, units, parameters) || {};
        problems = Array.isArray(result.problems) ? result.problems : [];
        fixCount = Number(result.fixCount || 0);
    }

    return {
        clear: false,
        axis,
        label,
        desc,
        score,
        scoreColor: scoreToColor?.(score) || '',
        sourceKind: isAuto ? 'auto' : 'manual',
        sourceText:
            isAuto && autoResult
                ? buildAutoTooltip?.(axis, autoResult) || ''
                : `${translate?.('eis.source_manual') || 'Manual'}: ${typeof score === 'number' ? score.toFixed(1) : score}`,
        bars: isAuto && autoResult ? getAxisDetailBars(axis, autoResult) : [],
        whatIf,
        problems,
        fixCount,
        showAutoHint: !isAuto,
    };
}
