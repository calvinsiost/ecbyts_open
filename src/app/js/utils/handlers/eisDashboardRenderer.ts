// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

function safeEscape(escapeHtml: any, value: any) {
    return escapeHtml?.(String(value ?? '')) ?? String(value ?? '');
}

function safeTranslate(translate: any, key: any, fallback: any) {
    return translate?.(key) || fallback;
}

function getContributionRowStatus(score: any) {
    if (score < 3) {
        return {
            className: ' eis-contrib-warn',
            iconHtml: '<span class="eis-contrib-icon warn">!</span>',
        };
    }

    if (score >= 4) {
        return {
            className: ' eis-contrib-good',
            iconHtml: '<span class="eis-contrib-icon good">&#10003;</span>',
        };
    }

    return {
        className: '',
        iconHtml: '',
    };
}

export function buildAxisDetailBarsHtml({
    bars = [],
    scoreToColor,
    escapeHtml,
}: {
    bars?: any[];
    scoreToColor?: any;
    escapeHtml?: any;
}) {
    return bars
        .map((bar) => {
            const fillPct = Number(Math.min(100, Math.max(0, Number(bar?.value || 0) * 100)).toFixed(2));
            const fillColor = scoreToColor?.(fillPct / 20) || '';
            return `
            <div class="eis-axis-detail-bar">
                <span class="eis-axis-detail-bar-label">${safeEscape(escapeHtml, bar?.label || '')}</span>
                <div class="eis-axis-detail-bar-track">
                    <div class="eis-axis-detail-bar-fill" style="width:${fillPct}%;background:${fillColor}"></div>
                </div>
                <span class="eis-axis-detail-bar-value">${safeEscape(escapeHtml, bar?.display || '')}</span>
            </div>`;
        })
        .join('');
}

export function buildAxisProblemsHtml({
    problems = [],
    fixCount = 0,
    axis,
    translate,
    escapeHtml,
    maxShow = 15,
}: {
    problems?: any[];
    fixCount?: number;
    axis?: any;
    translate?: any;
    escapeHtml?: any;
    maxShow?: number;
}) {
    if (fixCount <= 0) return '';

    const shown = problems.slice(0, maxShow);
    const listHtml = shown
        .map((problem) => {
            const name = safeEscape(escapeHtml, problem?.elementName || problem?.elementId || '?');
            const parameterSuffix = problem?.parameterId ? ` / ${safeEscape(escapeHtml, problem.parameterId)}` : '';
            const fixLabel = safeEscape(escapeHtml, safeTranslate(translate, problem?.fixKey, problem?.fixKey || ''));
            // CC-S1 B3 artesanal: payload cc-call ternário (nome + args
            // URI-encoded) — era código inline com guard &&.
            const gotoPayload =
                axis === 'Cp' && problem?.campaignId
                    ? `_eisOpenDataEntry|s:${encodeURIComponent(String(problem?.campaignId ?? ''))}|s:${encodeURIComponent(String(problem?.elementId ?? ''))}`
                    : `_eisGoToElement|s:${encodeURIComponent(String(problem?.elementId ?? ''))}`;

            return `
                <div class="eis-problem-item">
                    <span class="eis-problem-element">${name}${parameterSuffix}</span>
                    <span class="eis-problem-field">${safeEscape(escapeHtml, problem?.current || '')}</span>
                    <span class="eis-problem-fix">${fixLabel}</span>
                    <button class="eis-problem-goto" data-cc-call-click="${gotoPayload}" title="${safeEscape(escapeHtml, safeTranslate(translate, 'eis.go_to_element', 'Go'))}">&#9654;</button>
                </div>`;
        })
        .join('');

    const showAllButton =
        fixCount > maxShow
            ? `<button class="eis-problems-show-all" data-cc-action="cc-d8ef13ed">${safeEscape(escapeHtml, safeTranslate(translate, 'eis.show_all', 'Show all'))} ${fixCount}</button>`
            : '';

    return `
            <div class="eis-problems-section">
                <div class="eis-problems-header">
                    <span class="eis-problems-count">${fixCount} ${safeEscape(escapeHtml, safeTranslate(translate, 'eis.issues_count', 'issues'))}</span>
                </div>
                <div class="eis-problems-list">${listHtml}</div>
                ${showAllButton}
            </div>`;
}

export function buildAxisDetailCardHtml({
    axis,
    label,
    score,
    scoreColor,
    desc = '',
    sourceHtml = '',
    barsHtml = '',
    whatIfHtml = '',
    problemsHtml = '',
    escapeHtml,
}: {
    axis?: any;
    label?: any;
    score?: any;
    scoreColor?: any;
    desc?: string;
    sourceHtml?: string;
    barsHtml?: string;
    whatIfHtml?: string;
    problemsHtml?: string;
    escapeHtml?: any;
}) {
    const displayScore = typeof score === 'number' && Number.isFinite(score) ? score.toFixed(1) : String(score ?? '');

    return `
    <div class="eis-axis-detail-card">
        <div class="eis-axis-detail-header">
            <span class="eis-axis-detail-abbr">${safeEscape(escapeHtml, axis)}</span>
            <span class="eis-axis-detail-name">${safeEscape(escapeHtml, label)}</span>
            <span class="eis-axis-detail-score" style="color:${scoreColor}">${safeEscape(escapeHtml, displayScore)}</span>
        </div>
        <div class="eis-axis-detail-desc">${safeEscape(escapeHtml, desc)}</div>
        <div class="eis-axis-detail-source">${sourceHtml}</div>
        ${barsHtml}
        ${whatIfHtml}
        ${problemsHtml}
    </div>`;
}

export function buildImprovementListHtml({
    improvements = [],
    translate,
    escapeHtml,
}: {
    improvements?: any[];
    translate?: any;
    escapeHtml?: any;
}) {
    if (!improvements.length) return '';

    let html = `<div class="eis-improve-title">${safeEscape(escapeHtml, safeTranslate(translate, 'eis.improve_title', 'Priority Improvements'))}</div>`;

    improvements.forEach((improvement, index) => {
        html += `
        <div class="eis-improve-item" data-cc-call-click="_eisExpandAxis|s:${encodeURIComponent(`${improvement.axis}`)}">
            <span class="eis-improve-rank">${index + 1}</span>
            <span class="eis-improve-axis">${safeEscape(escapeHtml, improvement.axis)} &mdash; ${safeEscape(escapeHtml, improvement.label || improvement.axis)}</span>
            <span class="eis-improve-scores">${Number(improvement.currentScore || 0).toFixed(1)} &#9654; ${Number(improvement.targetScore || 0).toFixed(1)}</span>
            <span class="eis-improve-delta">+${Number(improvement.delta || 0).toFixed(2)}</span>
        </div>`;

        if (improvement.hint) {
            html += `<div class="eis-improve-hint">${safeEscape(escapeHtml, improvement.hint)}</div>`;
        }
    });

    return html;
}

export function buildContributionBarsHtml({
    axes = [],
    scores = {},
    weights = {},
    autoResults = {},
    autoEnabled = {},
    scoreToColor,
}: {
    axes?: any[];
    scores?: Record<string, any>;
    weights?: Record<string, any>;
    autoResults?: Record<string, any>;
    autoEnabled?: Record<string, any>;
    scoreToColor?: any;
}) {
    if (!axes.length) return '';

    const maxWeight = Math.max(...axes.map((axis) => Number(weights[axis] || 1)), 1);

    return axes
        .map((axis) => {
            const score = Number(scores[axis] || 0);
            const weight = Number(weights[axis] || 1);
            const fillPct = Number(Math.min(100, Math.max(0, (score / 5) * 100)).toFixed(2));
            const color = scoreToColor?.(score) || '';
            const rowHeight = Math.round(16 + (weight / maxWeight) * 10);
            const hasAuto = autoResults?.[axis] != null;
            const isAuto = !!autoEnabled?.[axis] && hasAuto;
            const status = getContributionRowStatus(score);

            return `
        <div class="eis-contrib-row${status.className}" data-axis="${axis}" style="height:${rowHeight}px">
            ${status.iconHtml}
            <span class="eis-contrib-label">${axis}</span>
            <span class="eis-contrib-weight">w${weight}</span>
            <div class="eis-contrib-track-wrap">
                <div class="eis-contrib-track">
                    <div class="eis-contrib-fill" data-axis="${axis}" style="width:${fillPct}%;background:${color}"></div>
                </div>
                <input data-field-meta="true" data-field-meta-key="auto-pos:eis:input:L3458" type="range" class="eis-contrib-slider" data-axis="${axis}"
                    min="1" max="5" step="1" value="${Math.round(score)}"
                    ${isAuto ? 'disabled' : ''}
                    data-cc-call-input="_eisBarSliderInput|s:${encodeURIComponent(`${axis}`)}|v"
                    onmousedown="window._eisBarDragStart()"
                    onmouseup="window._eisBarDragEnd()"
                    ontouchstart="window._eisBarDragStart()"
                    ontouchend="window._eisBarDragEnd()">
            </div>
            <span class="eis-contrib-score" data-axis="${axis}" style="color:${color}">${score.toFixed(1)}</span>
            ${hasAuto ? `<button class="eis-contrib-auto-btn ${isAuto ? 'on' : ''}" data-cc-call-click="_eisBarAutoToggle|s:${encodeURIComponent(`${axis}`)}">${isAuto ? 'A' : 'M'}</button>` : ''}
        </div>`;
        })
        .join('');
}

export function buildRingTooltipHtml({
    axis,
    label,
    score,
    scoreColor,
    sourceText,
    weight,
    totalWeight,
    pct,
    clickHint,
    escapeHtml,
}: any) {
    const displayScore = typeof score === 'number' && Number.isFinite(score) ? score.toFixed(1) : String(score ?? '');

    return (
        `<b>${safeEscape(escapeHtml, axis)} - ${safeEscape(escapeHtml, label)}</b><br>` +
        `Score: <b style="color:${scoreColor}">${safeEscape(escapeHtml, displayScore)}</b> (${safeEscape(escapeHtml, sourceText)})<br>` +
        `${safeEscape(escapeHtml, 'w')}=${safeEscape(escapeHtml, weight)}/${safeEscape(escapeHtml, totalWeight)} (${safeEscape(escapeHtml, pct)}%)<br>` +
        `<span class="eis-tip-hint">${safeEscape(escapeHtml, clickHint)}</span>`
    );
}
