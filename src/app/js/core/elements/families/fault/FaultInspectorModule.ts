// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   FAULT INSPECTOR MODULE — Strike/dip editor + well intersection viewer
   ================================================================
   P1-8 P6 — Painel de inspeção de falha geológica.

   Seções:
   1. Editor de parâmetros estruturais: strike [0-360°], dip [0-90°],
      tipo de falha, atividade sísmica, rejeito.
   2. Viewer de interseções: lista automática dos poços direcionais
      do modelo que cruzam o plano desta falha, com classificação
      de risco (high/medium/low) e recomendação técnica.

   Integração:
   - Salva em element.data: { strike, dip, strikeAngle, dipAngle,
     fault_type, activity_status, displacement }
   - Lê well.data.trajectory (CartesianStation[]) para interseções.
   - Usa buildIntersectionReport de faultIntersectionReport.js (P5 parte 2).

   Spec: docs/specs/features/SPEC_FAMILY_FAULT_WELLS_DIRECTIONAL.md §"Falhas"
   Ref: faultDirectional.js (validateFault), faultIntersectionReport.js (P5p2)
   ================================================================ */
import { FamilyModule } from '../_base/FamilyModule.js';
import { getElementById, getAllElements, updateElement } from '../../manager.js';
import { buildIntersectionReport } from '../../../../core/geology/faultIntersectionReport.js';
import { t } from '../../../../utils/i18n/translations.js';
import { showToast } from '../../../../utils/ui/toast.js';
import { escapeHtml } from '../../../../utils/helpers/html.js';
export default class FaultInspectorModule extends (FamilyModule as any) {
    _listen: any;
    _getFamilyId() {
        return 'fault-inspector';
    }
    getStyles() {
        return `
.fim-root { padding: 10px; font-size: 13px; }
.fim-editor { margin-bottom: 14px; }
.fim-editor h4, .fim-intersections h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted,#94a3b8); letter-spacing: 0.04em; }
.fim-field { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.fim-field label { flex: 0 0 160px; font-size: 12px; color: var(--text-secondary,#cbd5e1); }
.fim-field label small { display: block; font-size: 10px; color: var(--text-muted,#94a3b8); }
.fim-field input[type="number"], .fim-field select { width: 90px; background: var(--surface-2,#1e293b); border: 1px solid var(--border-color,#334155); border-radius: 4px; color: var(--text-primary,#f1f5f9); padding: 3px 6px; font-size: 12px; }
.fim-field input[type="number"]:focus, .fim-field select:focus { outline: 1px solid var(--accent,#3b82f6); }
.fim-unit { font-size: 11px; color: var(--text-muted,#94a3b8); }
.fim-save-btn { margin-top: 8px; }
.fim-intersections { border-top: 1px solid var(--border-color,#334155); padding-top: 10px; }
.fim-table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 4px 0; }
.fim-table th { background: var(--surface-2,#1e293b); padding: 3px 6px; text-align: left; font-weight: 600; }
.fim-table td { padding: 3px 6px; border-bottom: 1px solid var(--border-color,#334155); vertical-align: top; }
.fim-sev-high { color: #ef4444; font-weight: 600; }
.fim-sev-medium { color: #f59e0b; font-weight: 600; }
.fim-sev-low { color: #22c55e; font-weight: 600; }
.fim-summary { font-size: 11px; color: var(--text-muted,#94a3b8); margin: 4px 0 0; }
.fim-empty { color: var(--text-muted,#94a3b8); font-size: 12px; }
.fim-error { color: #f87171; font-size: 12px; }
`;
    }
    /**
     * @param {HTMLElement} container
     * @param {any} element
     * @param {any} [options]
     */
    async mount(container: any, element: any, options: any = {}) {
        await super.mount(container, element, options);
        this._render(container, element);
    }
    /**
     * @param {any} element
     */
    update(element: any) {
        super.update(element);
        const self = (this) as any;
        if (self._container)
            this._render(self._container, element);
    }
    unmount() {
        super.unmount();
    }
    // ── Rendering ─────────────────────────────────────────────────────────────
    /**
     * @param {HTMLElement} container
     * @param {any} element
     */
    _render(container: any, element: any) {
        const data = element?.data || {};
        const strike = data.strikeAngle ?? data.strike ?? 0;
        const dip = data.dipAngle ?? data.dip ?? 60;
        const faultType = data.fault_type || 'normal';
        const activity = data.activity_status || 'unknown';
        const displacement = Number.isFinite(data.displacement) ? data.displacement : '';
        container.innerHTML = `<div class="fim-root ecbt-fm-fault-inspector">
            <section class="fim-editor">
                <h4>${escapeHtml(t('faultInspector.editorTitle') || 'Parâmetros Estruturais')}</h4>

                <div class="fim-field">
                    <label>${escapeHtml(t('faultInspector.strike') || 'Strike')}
                        <small>0–359°, N clockwise</small>
                    </label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:FaultInspectorModule:input:L97" type="number" id="fim-strike-${element.id}" min="0" max="359" step="1" value="${escapeHtml(String(strike))}">
                    <span class="fim-unit">°</span>
                </div>

                <div class="fim-field">
                    <label>${escapeHtml(t('faultInspector.dip') || 'Dip (mergulho)')}
                        <small>0–90°</small>
                    </label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:FaultInspectorModule:input:L105" type="number" id="fim-dip-${element.id}" min="0" max="90" step="1" value="${escapeHtml(String(dip))}">
                    <span class="fim-unit">°</span>
                </div>

                <div class="fim-field">
                    <label>${escapeHtml(t('faultInspector.type') || 'Tipo de Falha')}</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:FaultInspectorModule:select:L111" id="fim-type-${element.id}">
                        <option value="normal" ${faultType === 'normal' ? 'selected' : ''}>${escapeHtml(t('faultInspector.typeNormal') || 'Normal')}</option>
                        <option value="reverse" ${faultType === 'reverse' ? 'selected' : ''}>${escapeHtml(t('faultInspector.typeReverse') || 'Reversa')}</option>
                        <option value="strike_slip" ${faultType === 'strike_slip' ? 'selected' : ''}>${escapeHtml(t('faultInspector.typeStrikeSlip') || 'Strike-slip')}</option>
                        <option value="oblique" ${faultType === 'oblique' ? 'selected' : ''}>${escapeHtml(t('faultInspector.typeOblique') || 'Oblíqua')}</option>
                    </select>
                </div>

                <div class="fim-field">
                    <label>${escapeHtml(t('faultInspector.activity') || 'Atividade')}</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:FaultInspectorModule:select:L121" id="fim-activity-${element.id}">
                        <option value="active" ${activity === 'active' ? 'selected' : ''}>${escapeHtml(t('faultInspector.activityActive') || 'Ativa')}</option>
                        <option value="inactive" ${activity === 'inactive' ? 'selected' : ''}>${escapeHtml(t('faultInspector.activityInactive') || 'Inativa')}</option>
                        <option value="unknown" ${activity === 'unknown' ? 'selected' : ''}>${escapeHtml(t('faultInspector.activityUnknown') || 'Indeterminada')}</option>
                    </select>
                </div>

                <div class="fim-field">
                    <label>${escapeHtml(t('faultInspector.displacement') || 'Rejeito')}
                        <small>${escapeHtml(t('faultInspector.displacementHint') || 'opcional')}</small>
                    </label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:FaultInspectorModule:input:L132" type="number" id="fim-disp-${element.id}" min="0" step="0.1" value="${escapeHtml(String(displacement))}" placeholder="—">
                    <span class="fim-unit">m</span>
                </div>

                <button class="btn btn-primary btn-sm fim-save-btn" id="fim-save-${element.id}">
                    ${escapeHtml(t('faultInspector.save') || 'Salvar parâmetros')}
                </button>
            </section>

            <section class="fim-intersections">
                <h4>${escapeHtml(t('faultInspector.intersectionsTitle') || 'Interseções com Poços')}</h4>
                <div id="fim-ix-body-${element.id}">
                    <p class="fim-empty">${escapeHtml(t('faultInspector.intersectionsLoading') || 'Calculando...')}</p>
                </div>
            </section>
        </div>`;
        this._bindEvents(container, element);
        // Compute intersections asynchronously (non-blocking)
        setTimeout(() => this._renderIntersections(container, element), 0);
    }
    // ── Events ────────────────────────────────────────────────────────────────
    /**
     * @param {HTMLElement} container
     * @param {any} element
     */
    _bindEvents(container: any, element: any) {
        const saveBtn = container.querySelector(`#fim-save-${element.id}`);
        (this as any)._listen(saveBtn, 'click', () => this._saveParams(container, element));
    }
    /**
     * @param {HTMLElement} container
     * @param {any} element
     */
    _saveParams(container: any, element: any) {
        const id = element.id;
        const strikeInput = (container.querySelector(`#fim-strike-${id}`)) as HTMLInputElement|null;
        const dipInput = (container.querySelector(`#fim-dip-${id}`)) as HTMLInputElement|null;
        const typeSelect = (container.querySelector(`#fim-type-${id}`)) as HTMLSelectElement|null;
        const actSelect = (container.querySelector(`#fim-activity-${id}`)) as HTMLSelectElement|null;
        const dispInput = (container.querySelector(`#fim-disp-${id}`)) as HTMLInputElement|null;
        const strike = parseFloat(strikeInput?.value || '');
        const dip = parseFloat(dipInput?.value || '');
        const faultType = typeSelect?.value || 'normal';
        const activity = actSelect?.value || 'unknown';
        const dispVal = dispInput?.value;
        const displacement = dispVal !== '' && dispVal !== undefined ? parseFloat(dispVal) : undefined;
        if (!Number.isFinite(strike) || strike < 0 || strike >= 360) {
            showToast(t('faultInspector.invalidStrike') || 'Strike inválido: deve ser 0–359°', 'error');
            return;
        }
        if (!Number.isFinite(dip) || dip < 0 || dip > 90) {
            showToast(t('faultInspector.invalidDip') || 'Dip inválido: deve ser 0–90°', 'error');
            return;
        }
        const el = getElementById(id);
        const newData: any = {
            ...(el?.data || element.data),
            // Store in both naming conventions for backwards compatibility
            strike,
            dip,
            strikeAngle: strike,
            dipAngle: dip,
            fault_type: faultType,
            activity_status: activity,
        };
        if (displacement !== undefined && Number.isFinite(displacement)) {
            newData.displacement = displacement;
        }
        updateElement(id, { data: newData });
        showToast(t('faultInspector.saved') || 'Parâmetros salvos', 'success');
        // Recompute intersections with updated fault parameters
        const updated = getElementById(id);
        this._renderIntersections(container, updated || { ...element, data: newData });
    }
    // ── Intersection Viewer ───────────────────────────────────────────────────
    /**
     * @param {HTMLElement} container
     * @param {any} fault
     */
    _renderIntersections(container: HTMLElement, fault: any) {
        const body = container.querySelector(`#fim-ix-body-${fault.id}`);
        if (!body)
            return;
        // Only consider wells that have a computed Cartesian trajectory
        const wells = getAllElements().filter((e: any) => e.family === 'well' && Array.isArray(e.data?.trajectory) && e.data.trajectory.length >= 2);
        if (wells.length === 0) {
            body.innerHTML = `<p class="fim-empty">${escapeHtml(t('faultInspector.noWells') || 'Nenhum poço direcional com survey importado no modelo.')}</p>`;
            return;
        }
        try {
            const report = buildIntersectionReport(wells, [fault]);
            if (!report.ok || report.intersections.length === 0) {
                body.innerHTML = `<p class="fim-empty">${escapeHtml(t('faultInspector.noIntersections') || 'Nenhuma interseção detectada entre este plano de falha e os poços do modelo.')}</p>`;
                return;
            }
            /** @type {Record<string, string>} */
            const SEV_ICONS: Record<string, string> = { high: '&#9632;', medium: '&#9650;', low: '&#9679;' };
            const rows = report.intersections
                .map((x: any) => {
                const icon = SEV_ICONS[x.severity] || '&#9679;';
                const sevClass = `fim-sev-${x.severity}`;
                return `<tr>
                    <td>${escapeHtml(x.wellName)}</td>
                    <td>${x.md.toFixed(1)}</td>
                    <td><span class="${sevClass}">${icon} ${escapeHtml(x.severity)}</span></td>
                    <td>${escapeHtml(x.category.replace(/_/g, ' '))}</td>
                </tr>`;
            })
                .join('');
            const total = report.summary.total;
            const totalLabel = t('faultInspector.intersectionTotal') || 'interseção(ões) detectada(s)';
            body.innerHTML = `
                <table class="fim-table">
                    <thead><tr>
                        <th>${escapeHtml(t('faultInspector.colWell') || 'Poço')}</th>
                        <th>${escapeHtml(t('faultInspector.colMd') || 'MD (m)')}</th>
                        <th>${escapeHtml(t('faultInspector.colRisk') || 'Risco')}</th>
                        <th>${escapeHtml(t('faultInspector.colCategory') || 'Categoria')}</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <p class="fim-summary">${total} ${escapeHtml(totalLabel)}</p>`;
        }
        catch (err: any) {
            console.warn('[FaultInspectorModule] Falha ao calcular interseções:', err);
            body.innerHTML = `<p class="fim-error">${escapeHtml(t('faultInspector.intersectionError') || 'Erro ao calcular interseções')}: ${escapeHtml(err?.message || String(err))}</p>`;
        }
    }
}
