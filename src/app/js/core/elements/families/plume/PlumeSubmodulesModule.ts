// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
import { FamilyModule } from '../_base/FamilyModule.js';
import { t } from '../../../../utils/i18n/translations.js';
import { showToast } from '../../../../utils/ui/toast.js';
import { updateElement, rebuildElementMesh, getElementById } from '../../manager.js';
import { buildPlumeSubmoduleState, normalizePlumeMatrix, normalizePlumeShape, getAllowedPlumeShapes, isPlumeShapeCompatible, } from './state.js';
/** @param {string} shape */
function shapeLabel(shape: any) {
    switch (shape) {
        case 'ellipsoid':
            return 'Elipsoide';
        case 'lens':
            return 'Lente';
        case 'cone':
            return 'Cone';
        case 'gaussian':
            return 'Gaussiana';
        case 'patch':
            return 'Patch';
        default:
            return shape;
    }
}
/** @param {string} matrix */
function matrixLabel(matrix: any) {
    switch (matrix) {
        case 'subterranea':
            return 'Subterranea';
        case 'ar':
            return 'Ar';
        case 'agua_superficial':
            return 'Agua Superficial';
        case 'solo':
            return 'Solo';
        default:
            return matrix;
    }
}
export default class PlumeSubmodulesModule extends (FamilyModule as any) {
    _mounted: any;
    _state: any;
    _appliedState: any;
    _busy: boolean = false;
    _getFamilyId() {
        return 'plume';
    }
    /**
     * @param {any} container
     * @param {any} element
     * @param {any} [options]
     */
    async mount(container: any, element: any, options: any = {}) {
        await super.mount(container, element, options);
        this._state = buildPlumeSubmoduleState(element);
        this._appliedState = { ...this._state };
        this._busy = false;
        this._render();
    }
    /** @param {any} element */
    update(element: any) {
        super.update(element);
        if (!((this as any)._mounted))
            return;
        this._state = buildPlumeSubmoduleState(element);
        this._appliedState = { ...this._state };
        this._render();
    }
    getStyles() {
        return `
            .ecbt-fm-plume { display:flex; flex-direction:column; gap:12px; color:var(--text-primary,#e2e8f0); }
            .ecbt-fm-plume__grid { display:grid; gap:10px; grid-template-columns: 1fr 1fr; }
            .ecbt-fm-plume__block { border:1px solid var(--border-color,#1f324d); border-radius:8px; padding:10px; background:rgba(8,22,44,0.35); }
            .ecbt-fm-plume__label { font-size:12px; opacity:.9; margin-bottom:6px; display:block; }
            .ecbt-fm-plume select { width:100%; background:#0b223f; color:#e2e8f0; border:1px solid #2b4868; border-radius:6px; padding:6px 8px; }
            .ecbt-fm-plume__warn { border:1px solid #7a3f3f; background:rgba(120,30,30,.22); color:#fecaca; border-radius:8px; padding:8px; font-size:12px; }
            .ecbt-fm-plume__meta { display:flex; gap:10px; flex-wrap:wrap; font-size:12px; opacity:.85; }
            .ecbt-fm-plume__actions { display:flex; justify-content:flex-end; gap:8px; }
            .ecbt-fm-plume__btn { border:1px solid #2b4868; background:#10325a; color:#dbeafe; border-radius:6px; padding:7px 10px; cursor:pointer; }
            .ecbt-fm-plume__btn[disabled] { opacity:.5; cursor:not-allowed; }
            @media (max-width: 720px) {
                .ecbt-fm-plume__grid { grid-template-columns: 1fr; }
                .ecbt-fm-plume__actions { justify-content:stretch; }
                .ecbt-fm-plume__actions .ecbt-fm-plume__btn { flex:1; }
            }
        `;
    }
    _render() {
        const self = (this) as any;
        if (!self._container)
            return;
        self._container.classList.add('ecbt-fm-plume');
        const optionsMatrix = ['subterranea', 'ar', 'agua_superficial', 'solo']
            .map((m: any) => `<option value="${m}" ${this._state.matrix === m ? 'selected' : ''}>${matrixLabel(m)}</option>`)
            .join('');
        const allowed = getAllowedPlumeShapes(this._state.matrix);
        const optionsShape = allowed
            .map((/** @type {string} */ s) => `<option value="${s}" ${this._state.shape === s ? 'selected' : ''}>${shapeLabel(s)}</option>`)
            .join('');
        const compatible = isPlumeShapeCompatible(this._state.matrix, this._state.shape);
        const canApply = this._state.isDirty && compatible && !this._busy;
        const last = this._state.lastAppliedAt ? new Date(this._state.lastAppliedAt).toLocaleString() : '-';
        self._container.innerHTML = `
            <div class="ecbt-fm-plume__grid">
                <div class="ecbt-fm-plume__block">
                    <label class="ecbt-fm-plume__label">Matriz</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:PlumeSubmodulesModule:select:L110" data-role="matrix">${optionsMatrix}</select>
                </div>
                <div class="ecbt-fm-plume__block">
                    <label class="ecbt-fm-plume__label">Forma da Pluma</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:PlumeSubmodulesModule:select:L114" data-role="shape">${optionsShape}</select>
                </div>
            </div>
            ${compatible ? '' : `<div class="ecbt-fm-plume__warn">Forma nao suportada para matriz atual.</div>`}
            <div class="ecbt-fm-plume__meta">
                <span>Matriz ativa: <strong>${matrixLabel(this._state.matrix)}</strong></span>
                <span>Forma ativa: <strong>${shapeLabel(this._state.shape)}</strong></span>
                <span>Ultimo aplicar: <strong>${last}</strong></span>
            </div>
            <div class="ecbt-fm-plume__actions">
                <button class="ecbt-fm-plume__btn" data-role="restore" ${this._busy ? 'disabled' : ''}>Restaurar padrao</button>
                <button class="ecbt-fm-plume__btn" data-role="apply" ${canApply ? '' : 'disabled'}>
                    ${this._busy ? 'Aplicando...' : 'Aplicar'}
                </button>
            </div>
        `;
        const matrixEl = self._container.querySelector('[data-role="matrix"]');
        const shapeEl = self._container.querySelector('[data-role="shape"]');
        const restoreEl = self._container.querySelector('[data-role="restore"]');
        const applyEl = self._container.querySelector('[data-role="apply"]');
        self._listen(matrixEl, 'change', (ev: any) => {
            const matrix = normalizePlumeMatrix(ev.target.value);
            const previousShape = this._state.shape;
            const shape = normalizePlumeShape(matrix, this._state.shape);
            this._state = { ...this._state, matrix, shape, isDirty: true };
            window.dispatchEvent(new CustomEvent('plume:matrix:changed', { detail: { elementId: self._element?.id, matrix } }));
            if (shape !== previousShape) {
                window.dispatchEvent(new CustomEvent('plume:shape:changed', { detail: { elementId: self._element?.id, shape } }));
            }
            this._render();
        });
        self._listen(shapeEl, 'change', (ev: any) => {
            const shape = normalizePlumeShape(this._state.matrix, ev.target.value);
            this._state = { ...this._state, shape, isDirty: true };
            window.dispatchEvent(new CustomEvent('plume:shape:changed', { detail: { elementId: self._element?.id, shape } }));
            this._render();
        });
        self._listen(restoreEl, 'click', () => {
            this._state = {
                ...buildPlumeSubmoduleState({
                    data: { matrix: this._appliedState.matrix, plume: { shape: this._appliedState.shape } },
                }),
                isDirty: true,
                lastAppliedAt: this._state.lastAppliedAt,
            };
            this._render();
        });
        self._listen(applyEl, 'click', async () => {
            if (!canApply || this._busy)
                return;
            await this._apply();
        });
    }
    async _apply() {
        const self = (this) as any;
        const elementId = self._element?.id;
        if (!elementId)
            return;
        this._busy = true;
        this._render();
        window.dispatchEvent(new CustomEvent('plume:apply:requested', { detail: { elementId, ...this._state } }));
        try {
            const current = (getElementById(elementId)) as any;
            if (!current)
                throw new Error('Elemento de pluma nao encontrado');
            const nextData = {
                ...(current.data || {}),
                matrix: this._state.matrix,
                plume: {
                    ...(current.data?.plume || {}),
                    matrix: this._state.matrix,
                    shape: this._state.shape,
                    lastAppliedAt: Date.now(),
                },
                shapePreset: this._state.shape,
            };
            updateElement(elementId, { data: nextData });
            rebuildElementMesh(elementId);
            this._state = {
                ...this._state,
                isDirty: false,
                lastAppliedAt: nextData.plume.lastAppliedAt,
            };
            this._appliedState = { ...this._state };
            showToast(t('saved') || 'Pluma atualizada', 'success');
            window.dispatchEvent(new CustomEvent('plume:apply:succeeded', {
                detail: { elementId, matrix: this._state.matrix, shape: this._state.shape },
            }));
        }
        catch (err: any) {
            const e = (err) as any;
            showToast(e?.message || 'Falha ao aplicar pluma', 'error');
            window.dispatchEvent(new CustomEvent('plume:apply:failed', { detail: { elementId, reason: e?.message || 'unknown' } }));
        }
        finally {
            this._busy = false;
            this._render();
        }
    }
}
