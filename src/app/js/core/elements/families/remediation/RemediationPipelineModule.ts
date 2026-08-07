// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
import { FamilyModule } from '../_base/FamilyModule.js';
import { getAllPipelines } from '../../../pipelines/index.js';
import { updateElement } from '../../manager.js';
import { showToast } from '../../../../utils/ui/toast.js';
import { t } from '../../../../utils/i18n/translations.js';
export default class RemediationPipelineModule extends (FamilyModule as any) {
    declare _container: any;
    declare _element: any;
    declare _listen: any;
    declare _mounted: any;
    _getFamilyId() {
        return 'remediation';
    }
    async mount(container: any, element: any, options: any = {}) {
        await super.mount(container, element, options);
        this._container.classList.add('ecbt-fm-remediation');
        this._render();
    }
    update(element: any) {
        super.update(element);
        if (this._mounted)
            this._render();
    }
    _render() {
        if (!this._container || !this._element)
            return;
        const pipelines = getAllPipelines();
        const selected = this._element?.data?.operationalPipelineId || '';
        const runtime = this._element?.data?.pipelineRuntime || {};
        const options = [
            `<option value="">${t('remediation.pipeline.none') || 'No pipeline linked'}</option>`,
            ... /** @type {any[]} */(pipelines).map((/** @type {any} */ p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${_escapeHtml(p.name || p.id)}</option>`),
        ].join('');
        this._container.innerHTML = `
            <div class="ecbt-fm-remediation__card">
                <div class="ecbt-fm-remediation__title">${t('remediation.pipeline.title') || 'Operational Pipeline'}</div>
                <div class="ecbt-fm-remediation__row">
                    <label>${t('remediation.pipeline.linked') || 'Linked pipeline'}</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:RemediationPipelineModule:select:L47" class="ecbt-fm-remediation__select" data-role="pipeline-select">${options}</select>
                </div>
                <div class="ecbt-fm-remediation__actions">
                    <button type="button" class="btn-secondary btn-sm" data-role="refresh-list">${t('remediation.pipeline.refresh') || 'Refresh list'}</button>
                    <button type="button" class="btn-secondary btn-sm" data-role="open-manager">${t('remediation.pipeline.openManager') || 'Open manager'}</button>
                    <button type="button" class="btn-secondary btn-sm" data-role="new-pipeline">${t('remediation.pipeline.new') || 'New pipeline'}</button>
                    <button type="button" class="btn-primary btn-sm" data-role="run-now">${t('remediation.pipeline.runNow') || 'Run now'}</button>
                </div>
                <div class="ecbt-fm-remediation__status">
                    <span><b>${t('remediation.pipeline.lastStatus') || 'Last status'}:</b> ${_escapeHtml(runtime.lastStatus || 'idle')}</span>
                    <span><b>${t('remediation.pipeline.lastRunAt') || 'Last run'}:</b> ${_escapeHtml(runtime.lastRunAt || '-')}</span>
                    <span><b>${t('remediation.pipeline.lastError') || 'Last error'}:</b> ${_escapeHtml(runtime.lastError || '-')}</span>
                </div>
            </div>
        `;
        const select = this._container.querySelector('[data-role="pipeline-select"]');
        const refreshBtn = this._container.querySelector('[data-role="refresh-list"]');
        const managerBtn = this._container.querySelector('[data-role="open-manager"]');
        const newBtn = this._container.querySelector('[data-role="new-pipeline"]');
        const runBtn = this._container.querySelector('[data-role="run-now"]');
        this._listen(select, 'change', (e: any) => {
            const pipelineId = e.target.value || null;
            this._updateData({ operationalPipelineId: pipelineId });
            showToast(t('remediation.pipeline.linkSaved') || 'Pipeline link updated.', 'success');
        });
        this._listen(refreshBtn, 'click', () => this._render());
        this._listen(managerBtn, 'click', () => window.handleOpenPipelineManager?.());
        this._listen(newBtn, 'click', () => window.handleNewPipeline?.());
        this._listen(runBtn, 'click', async () => {
            const pipelineId = (this._element?.data?.operationalPipelineId || '').trim();
            if (!pipelineId) {
                showToast(t('remediation.pipeline.selectFirst') || 'Select a pipeline first.', 'warning');
                return;
            }
            this._updateData({
                pipelineRuntime: {
                    ..._defaultRuntime(),
                    ...(this._element?.data?.pipelineRuntime || {}),
                    lastStatus: 'running',
                    lastRunAt: new Date().toISOString(),
                    lastError: null,
                },
            });
            try {
                const run = await (window.handleRunPipelineForElement?.(pipelineId, this._element.id) ??
                    window.handleRunPipeline?.(pipelineId));
                const status = run?.status || 'completed';
                this._updateData({
                    pipelineRuntime: {
                        ..._defaultRuntime(),
                        ...(this._element?.data?.pipelineRuntime || {}),
                        lastRunId: run?.runId || null,
                        lastStatus: status,
                        lastRunAt: new Date().toISOString(),
                        lastError: run?.error || null,
                    },
                });
            }
            catch (err: any) {
                this._updateData({
                    pipelineRuntime: {
                        ..._defaultRuntime(),
                        ...(this._element?.data?.pipelineRuntime || {}),
                        lastStatus: 'failed',
                        lastRunAt: new Date().toISOString(),
                        lastError: err?.message || 'unknown_error',
                    },
                });
                showToast((t('pipeline.run.failed') || 'Automation failed') + `: ${err?.message || 'unknown'}`, 'error');
            }
        });
    }
    _updateData(patch: any) {
        const current = this._element?.data || {};
        const nextData = {
            ...current,
            ...patch,
            pipelineRuntime: {
                ..._defaultRuntime(),
                ...(current.pipelineRuntime || {}),
                ...(patch.pipelineRuntime || {}),
            },
        };
        updateElement(this._element.id, { data: nextData });
        this._element = { ...this._element, data: nextData };
        this._render();
    }
    getStyles() {
        return `
.ecbt-fm-remediation__card { display:flex; flex-direction:column; gap:10px; padding:12px; }
.ecbt-fm-remediation__title { font-weight:600; }
.ecbt-fm-remediation__row { display:flex; flex-direction:column; gap:6px; }
.ecbt-fm-remediation__select { min-height:32px; border-radius:8px; border:1px solid var(--panel-border,#3a3a3a); background:var(--panel-bg,#1e1e1e); color:var(--text-color,#f5f5f5); padding:6px 8px; }
.ecbt-fm-remediation__actions { display:flex; flex-wrap:wrap; gap:8px; }
.ecbt-fm-remediation__status { display:flex; flex-direction:column; gap:4px; font-size:12px; opacity:.9; }
        `;
    }
}
function _defaultRuntime() {
    return {
        lastRunId: null,
        lastStatus: 'idle',
        lastRunAt: null,
        lastError: null,
    };
}
function _escapeHtml(str: any) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
