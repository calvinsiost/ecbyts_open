// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

function safeTranslate(translate: any, key: any, fallback: any): any {
    return translate?.(key) || fallback;
}

function safeEscape(escapeHtml: any, value: any): any {
    return escapeHtml?.(String(value ?? '')) ?? String(value ?? '');
}

/** @param {any} opts */
function buildFormulaControlHtml({ isTemplate, index, formulaOptions, selectedFormula, escapeHtml }: any): string {
    if (isTemplate) return '';
    if (!Array.isArray(formulaOptions) || formulaOptions.length <= 1) {
        return `<input data-field-meta="true" data-field-meta-key="auto-pos:eis:input:L2030" class="eis-custom-axis-formula is-readonly" type="text" readonly value="${safeEscape(escapeHtml, selectedFormula)}" />
                   <input type="hidden" value="${safeEscape(escapeHtml, selectedFormula)}" />`;
    }

    return `<select data-field-meta="true" data-field-meta-key="auto-pos:eis:select:L2032" class="eis-custom-axis-formula"
                        data-cc-call-change="handleEisCustomAxisEdit|j:${encodeURIComponent(String(index))}|s:formulaRef|v">
                        ${formulaOptions
                            .map(
                                (option: any) =>
                                    `<option value="${safeEscape(escapeHtml, option.id)}" ${option.id === selectedFormula ? 'selected' : ''}>
                                        ${safeEscape(escapeHtml, option.label || option.id)}
                                    </option>`,
                            )
                            .join('')}
                   </select>`;
}

/** @param {any} opts */
export function buildCustomModeSectionHtml({
    templates = [],
    customProfiles = [],
    activeProfileId = '',
    translate,
    escapeHtml,
}: any): string {
    const allProfiles = [...templates, ...customProfiles];
    const profileOptions = allProfiles
        .map(
            (profile: any) =>
                `<option value="${safeEscape(escapeHtml, profile.id)}" ${activeProfileId === profile.id ? 'selected' : ''}>${profile.isTemplate ? '&#128203; ' : ''}${safeEscape(escapeHtml, profile.name)}</option>`,
        )
        .join('');

    return `
    <div class="eis-custom-profiles">
        <div class="eis-custom-profile-bar">
            <select data-field-meta="true" data-field-meta-key="auto:eis-custom-profile-select" id="eis-custom-profile-select" data-cc-change="cc-75da2a18">
                <option value="">${safeTranslate(translate, 'eis.select_profile', '-- Select Profile --')}</option>
                ${profileOptions}
            </select>
            <button class="eis-custom-btn" data-cc-action="cc-1946d299" title="${safeTranslate(translate, 'eis.new_profile', 'New')}">Blank</button>
            <button class="eis-custom-btn" data-cc-action="cc-631d5cb1" title="Copy default EIS">Copy Default</button>
            <button class="eis-custom-btn" data-cc-action="cc-af573af1" title="Create editable copy from selected template">Edit Copy</button>
            <button class="eis-custom-btn" data-cc-action="cc-50b329b4" title="${safeTranslate(translate, 'eis.duplicate', 'Duplicate')}">&#x29C9;</button>
            <button class="eis-custom-btn danger" data-cc-action="cc-76516810" title="${safeTranslate(translate, 'eis.delete', 'Delete')}">&#x2715;</button>
            <button class="eis-custom-btn" data-cc-action="cc-f0f0a24c" title="${safeTranslate(translate, 'eis.export_ecbt', 'Save selected profile as .ecbt (Library or local)')}">&#128190;</button>
            <button class="eis-custom-btn" data-cc-action="cc-32b90d64" title="${safeTranslate(translate, 'eis.import_ecbt', 'Import .ecbt profile (Library or local)')}">&#8593;</button>
        </div>
    </div>
    <div id="eis-custom-editor"></div>`;
}

/** @param {any} opts */
export function buildCustomEditorHtml({
    activeProfile,
    translate,
    escapeHtml,
    buildPublishGuardIssues,
    getFormulaUiState,
}: any): string {
    if (!activeProfile) {
        return `
                <div class="eis-custom-empty">
                    <p>${safeTranslate(translate, 'eis.no_profile', 'Select or create a profile to begin.')}</p>
                    <p class="eis-custom-quick-hint">${safeTranslate(translate, 'eis.custom_quick_hint', 'Use prebuilt formulas in Calculator and return to select for each axis.')}</p>
                    <div class="eis-custom-actions-row">
                        <button class="eis-custom-btn" data-cc-action="cc-1946d299">Blank</button>
                        <button class="eis-custom-btn" data-cc-action="cc-631d5cb1">Copy Default</button>
                        <button type="button" class="eis-custom-open-calculator" data-cc-action="cc-73a21a32">
                            ${safeTranslate(translate, 'eis.open_calculator_formulas', 'Open Calculator (Formulas)')}
                        </button>
                    </div>
                </div>`;
    }

    const isTemplate = activeProfile.isTemplate;
    const status = activeProfile.status || (isTemplate ? 'template' : 'draft');
    const version = Number(activeProfile.version || 1);
    const basedOn = activeProfile.basedOn || (isTemplate ? 'template' : 'default');
    const isDirty = !isTemplate && activeProfile.isDirty === true;
    const bandAudit = Number(activeProfile?.verdictBands?.auditReadyMin ?? 4.5);
    const bandMgmt = Number(activeProfile?.verdictBands?.managementReadyMin ?? 3.5);
    const vetoEnabled = !!activeProfile?.veto?.enabled;
    const vetoMin = Number(activeProfile?.veto?.minAxis ?? 2);
    const publishGuardIssues = !isTemplate ? buildPublishGuardIssues?.(activeProfile) || [] : [];
    const canPublish = !isTemplate && publishGuardIssues.length === 0;

    let html = `<div class="eis-custom-meta-row">
        <span class="eis-custom-pill">status: ${safeEscape(escapeHtml, status)}</span>
        <span class="eis-custom-pill">v${version}</span>
        <span class="eis-custom-pill">based_on: ${safeEscape(escapeHtml, String(basedOn))}</span>
        ${isDirty ? '<span class="eis-custom-pill dirty">not saved</span>' : ''}
    </div>`;

    html += `<div class="eis-custom-name-row">
        <input data-field-meta="true" data-field-meta-key="auto:eis-custom-profile-name" type="text" id="eis-custom-profile-name" value="${safeEscape(escapeHtml, activeProfile.name)}"
            ${isTemplate ? 'disabled' : ''}
            data-cc-change="cc-cc2aba0a"
            placeholder="${safeTranslate(translate, 'eis.profile_name', 'Profile name')}">
    </div>`;

    if (!isTemplate) {
        html += `<div class="eis-custom-rules-row">
            <label class="eis-custom-rule-item">
                <input data-field-meta="true" data-field-meta-key="auto-pos:eis:input:L1985" type="checkbox" ${vetoEnabled ? 'checked' : ''} data-cc-change="cc-f8916b33">
                Veto
            </label>
            <label class="eis-custom-rule-item">
                min axis
                <input data-field-meta="true" data-field-meta-key="auto:eis-custom-veto-min" id="eis-custom-veto-min" type="number" min="1" max="5" value="${vetoMin}" data-cc-change="cc-0aae7615">
            </label>
            <label class="eis-custom-rule-item">
                Audit >=
                <input data-field-meta="true" data-field-meta-key="auto:eis-custom-band-audit" id="eis-custom-band-audit" type="number" min="0" max="5" step="0.1" value="${bandAudit}" data-cc-change="cc-5c992f90">
            </label>
            <label class="eis-custom-rule-item">
                Mgmt >=
                <input data-field-meta="true" data-field-meta-key="auto:eis-custom-band-mgmt" id="eis-custom-band-mgmt" type="number" min="0" max="5" step="0.1" value="${bandMgmt}" data-cc-change="cc-38c5c75a">
            </label>
        </div>`;
        html += `<div class="eis-custom-quick-row">
            <button type="button" class="eis-custom-open-calculator"
                    data-cc-action="cc-7e91dc18">
                ${safeTranslate(translate, 'eis.open_calculator_formulas', 'Open Calculator (Formulas)')}
            </button>
            <span class="eis-custom-quick-hint">${safeTranslate(translate, 'eis.custom_quick_hint', 'Use prebuilt formulas in Calculator and return to select for each axis.')}</span>
        </div>`;
    }

    html += '<div class="eis-custom-axes">';
    for (let index = 0; index < activeProfile.axes.length; index++) {
        const axis = activeProfile.axes[index];
        const formulaUiState = getFormulaUiState?.(axis.id, axis.formulaRef || '') || {};
        const formulaOptions = Array.isArray(formulaUiState.options) ? formulaUiState.options : [];
        const selectedFormula = formulaUiState.selectedFormula || '';
        const formulaBoundsSummary = formulaUiState.boundsSummary || 'n/a';
        const formulaControlHtml = buildFormulaControlHtml({
            isTemplate,
            index,
            formulaOptions,
            selectedFormula,
            escapeHtml,
        });

        html += `
        <div class="eis-custom-axis-row" data-index="${index}">
            <div class="eis-custom-axis-header">
                <input data-field-meta="true" data-field-meta-key="auto-pos:eis:input:L2047" type="text" class="eis-custom-axis-name" value="${safeEscape(escapeHtml, axis.name)}"
                    ${isTemplate ? 'disabled' : ''}
                    data-cc-call-change="handleEisCustomAxisEdit|j:${encodeURIComponent(String(index))}|s:name|v"
                    placeholder="${safeTranslate(translate, 'eis.axis_name', 'Axis name')}">
                ${
                    !isTemplate
                        ? `<label class="eis-custom-toggle">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:eis:input:L2054" type="checkbox" ${axis.enabled !== false ? 'checked' : ''}
                        data-cc-call-change="handleEisCustomAxisEdit|j:${encodeURIComponent(String(index))}|s:enabled|cs">
                    <span>enabled</span>
                </label>`
                        : ''
                }
                <label class="eis-custom-weight-label">${safeTranslate(translate, 'eis.weight', 'w')}=
                    <input data-field-meta="true" data-field-meta-key="auto-pos:eis:input:L2061" type="number" class="eis-custom-axis-weight" min="1" max="5" value="${safeEscape(escapeHtml, axis.weight)}"
                        ${isTemplate ? 'disabled' : ''}
                        data-cc-call-change="handleEisCustomAxisEdit|j:${encodeURIComponent(String(index))}|s:weight|v">
                </label>
                ${!isTemplate ? `<button class="eis-custom-btn danger small" data-cc-call-click="handleEisCustomRemoveAxis|j:${encodeURIComponent(String(index))}">&#x2715;</button>` : ''}
            </div>
            ${axis.description ? `<div class="eis-custom-axis-desc">${safeEscape(escapeHtml, axis.description)}</div>` : ''}
            ${
                !isTemplate
                    ? `<div class="eis-custom-formula-row">
                <label>formula</label>
                ${formulaControlHtml}
                <button type="button" class="eis-custom-open-calculator" data-cc-action="cc-942249c5">${safeTranslate(translate, 'eis.open_calculator', 'Open Calculator')}</button>
                <span class="eis-custom-formula-bounds">bounds: ${safeEscape(escapeHtml, formulaBoundsSummary)}</span>
            </div>`
                    : ''
            }
            ${axis.benchmark ? `<div class="eis-custom-axis-benchmark">${safeTranslate(translate, 'eis.benchmark', 'Ref')}: ${safeEscape(escapeHtml, axis.benchmark.reference)} ${safeEscape(escapeHtml, axis.benchmark.unit)} (${safeEscape(escapeHtml, axis.benchmark.source)})</div>` : ''}
            <div class="eis-slider-control">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:eis:input:L2080" type="range" id="eis-custom-slider-${axis.id}" min="1" max="5" step="1" value="3"
                    class="eis-slider" ${axis.enabled === false ? 'disabled' : ''}
                    data-cc-call-input="handleEisCustomSliderInput|s:${encodeURIComponent(`${axis.id}`)}">
                <span class="eis-slider-value" id="eis-custom-value-${axis.id}">3</span>
            </div>
        </div>`;
    }
    html += '</div>';

    if (!isTemplate && activeProfile.axes.length < 12) {
        html += `<button class="eis-custom-btn add-axis" data-cc-action="cc-432813ee">+ ${safeTranslate(translate, 'eis.add_axis', 'Add Axis')}</button>`;
    }

    if (!isTemplate) {
        html += `<div class="eis-custom-guard ${canPublish ? 'ok' : 'blocked'}" id="eis-custom-publish-guard">
            <div class="eis-custom-guard-title">${canPublish ? 'Ready to publish' : 'Publish blocked'}</div>
            ${
                canPublish
                    ? '<div class="eis-custom-guard-ok">No blocking inconsistencies found.</div>'
                    : `<ul class="eis-custom-guard-list">${publishGuardIssues
                          .slice(0, 6)
                          .map((issue: any) => {
                              const axisIndex = Number.isInteger(issue.axisIndex) ? Number(issue.axisIndex) : null;
                              const fixButton =
                                  axisIndex != null
                                      ? `<button type="button" class="eis-custom-guard-fix" data-cc-call-click="handleEisFocusPublishIssue|j:${encodeURIComponent(String(axisIndex))}">Fix</button>`
                                      : '';
                              return `<li><span>${safeEscape(escapeHtml, issue.message)}</span>${fixButton}</li>`;
                          })
                          .join('')}</ul>`
            }
        </div>`;
        html += `<div class="eis-custom-actions-row">
            <button class="eis-custom-btn" data-cc-action="cc-82fa05e4">Compare baseline</button>
            <button id="eis-custom-publish-btn" class="eis-custom-btn" data-cc-action="cc-11619b2e" ${canPublish ? '' : 'disabled'} title="${canPublish ? 'Publish profile' : 'Fix issues before publishing'}">Publish</button>
            <button id="eis-custom-save-btn" class="eis-custom-btn save" data-cc-action="cc-e3569516">&#128190; ${safeTranslate(translate, 'eis.save', 'Save')}</button>
        </div>`;
    }

    html += `<div id="eis-custom-compare-panel"></div>`;
    return html;
}

/** @param {any} opts */
export function buildCustomComparePanelHtml({
    activeProfile,
    currentMode,
    lastCustomResult,
    baseline = 0,
    escapeHtml,
    forceShow = false,
}: any): string {
    if (!activeProfile || currentMode !== 'custom') return '';

    const customScore = Number(lastCustomResult?.eis || 0);
    const customVerdict = lastCustomResult?.verdict || '-';
    const delta = Number((customScore - baseline).toFixed(2));

    if (!forceShow && customScore <= 0 && baseline <= 0) return '';

    return `
        <div class="eis-custom-compare-box">
            <div class="eis-custom-compare-title">Custom vs Baseline</div>
            <div class="eis-custom-compare-grid">
                <span>Baseline (EIS)</span><b>${baseline.toFixed(2)}</b>
                <span>Custom</span><b>${customScore.toFixed(2)}</b>
                <span>Delta</span><b class="${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '+' : ''}${delta.toFixed(2)}</b>
                <span>Custom verdict</span><b>${safeEscape(escapeHtml, customVerdict)}</b>
            </div>
        </div>
    `;
}
