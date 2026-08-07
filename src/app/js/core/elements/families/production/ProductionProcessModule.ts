// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PRODUCTION-AREA-001 — Sub-módulo da família 'production_area'.

   FASE 1 (este ciclo): painel que lê element.data.subtype e RENDERIZA
   as etapas (categorias) daquele subtipo a partir do catálogo
   data-driven (subtypes.ts). Sem subtipo, oferece a seleção entre
   Mineração e Petróleo. Prova que a família gera um elemento montável.
   Toda label passa por t() (i18n) — zero string hardcoded (RF-10);
   todo valor injetado em HTML é escapado (RNF Segurança).

   FASE 2 (futuro, requer validação Pixels-Over-DOM): campos numéricos
   editáveis por porta com autosave em element.data, aviso visível de
   balanço de massa (validateMassBalance), unidades configuráveis.

   Spec: docs/specs/features/SPEC_PRODUCTION_AREA_FAMILY.md (§5, §6.2)
   ================================================================ */

import { FamilyModule } from '../_base/FamilyModule.js';
import { t } from '../../../../utils/i18n/translations.js';
import { escapeHtml } from '../../../../utils/helpers/html.js';
import { getCategoriesForSubtype, listProductionSubtypes, getProductionSubtype } from './subtypes.js';
import { computeChainedStageResults } from './_productionBindingPure.js';
import type { ChainedStageResult } from './_productionBindingPure.js';
import { energyFactorResolver, getEnergyFactor } from '../../../analytics/energyFactors.js';
import type { ProductionCategory } from './productionSchema.js';

interface ProductionElementData {
    subtype?: string;
    /** Valores numéricos por porta-id preenchidos pelo usuário (ENERGY-SCENARIOS #2). */
    portValues?: Record<string, number>;
}

export class ProductionProcessModule extends FamilyModule {
    override _getFamilyId(): string {
        return 'production_area';
    }

    override async mount(container: HTMLElement, element: object, options: object = {}): Promise<void> {
        await super.mount(container, element, options);
        this._render();
    }

    override update(element: object): void {
        super.update(element);
        if (this._mounted) this._render();
    }

    private _render(): void {
        const container = this._container;
        if (!container) return;
        const data = ((this._element as { data?: ProductionElementData })?.data ?? {}) as ProductionElementData;
        const subtype = getProductionSubtype(data.subtype);

        const panel = document.createElement('div');
        panel.className = 'ecbt-fm-production_area';

        if (!subtype) {
            panel.appendChild(this._renderSubtypePicker());
        } else {
            panel.appendChild(this._renderCategories(subtype.id));
        }
        container.replaceChildren(panel);
    }

    /** Seleção entre Mineração e Petróleo quando não há subtipo (RF-7 / ERR_NO_SUBTYPE). */
    private _renderSubtypePicker(): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'pa-subtype-picker';

        const hint = document.createElement('p');
        hint.textContent = t('productionProcess.err.noSubtype');
        wrap.appendChild(hint);

        for (const st of listProductionSubtypes()) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pa-subtype-option';
            btn.dataset.subtype = st.id;
            btn.textContent = t(st.nameKey);
            wrap.appendChild(btn);
        }
        return wrap;
    }

    /** Mapa portId→valor preenchido (element.data.portValues), sempre um objeto. */
    private _portValues(): Record<string, number> {
        const data = ((this._element as { data?: ProductionElementData })?.data ?? {}) as ProductionElementData;
        if (!data.portValues || typeof data.portValues !== 'object') data.portValues = {};
        return data.portValues;
    }

    /** Persiste um valor de porta em element.data.portValues (autosave in-memory). */
    private _setPortValue(portId: string, value: number): void {
        const el = this._element as { data?: ProductionElementData };
        if (!el.data) el.data = {};
        if (!el.data.portValues) el.data.portValues = {};
        el.data.portValues[portId] = value;
    }

    /** Remove o override do usuário — a porta volta ao encadeamento/default. */
    private _clearPortValue(portId: string): void {
        const el = this._element as { data?: ProductionElementData };
        if (el.data?.portValues) delete el.data.portValues[portId];
    }

    /** Etapas ordenadas do subtipo montado (cache do render corrente). */
    private _cats: ProductionCategory[] = [];
    /** Bloco de resultados vivo por etapa (para a cascata de recálculo). */
    private _resultsByCat = new Map<string, HTMLElement>();
    /** Campos de entrada vivos por etapa/porta (para refletir valores encadeados). */
    private _fieldsByCat = new Map<string, Map<string, HTMLInputElement>>();

    /** Cadeia completa recalculada: entradas efetivas + resultados por etapa. */
    private _computeChain(): ChainedStageResult[] {
        return computeChainedStageResults(this._cats, this._portValues(), energyFactorResolver);
    }

    /** Render ordenado das etapas do subtipo: entradas editáveis + resultados (RF-7, #2). */
    private _renderCategories(subtypeId: string): HTMLElement {
        const list = document.createElement('div');
        list.className = 'pa-categories';
        list.setAttribute('role', 'list');

        this._cats = getCategoriesForSubtype(subtypeId);
        this._resultsByCat = new Map();
        this._fieldsByCat = new Map();

        const chain = this._computeChain();
        this._cats.forEach((cat, i) => {
            const stage = chain[i];
            if (!stage) return; // invariante: chain tem 1 resultado por categoria
            list.appendChild(this._renderCategory(cat, stage));
        });
        return list;
    }

    /**
     * Cascata (#auto-encadeamento): recalcula a cadeia inteira e atualiza os
     * blocos de resultados de TODAS as etapas + os campos de entrada cujo valor
     * vem do encadeamento (o campo em edição, com foco, nunca é sobrescrito).
     */
    private _refreshChain(): void {
        const chain = this._computeChain();
        this._cats.forEach((cat, i) => {
            const stage = chain[i];
            if (!stage) return; // invariante: chain tem 1 resultado por categoria
            const old = this._resultsByCat.get(cat.id);
            if (old) {
                const fresh = this._renderResults(cat, stage);
                old.replaceWith(fresh);
                this._resultsByCat.set(cat.id, fresh);
            }
            const fields = this._fieldsByCat.get(cat.id);
            if (!fields) return;
            for (const port of cat.inputs) {
                const field = fields.get(port.id);
                if (!field || document.activeElement === field) continue;
                field.value = String(this._fmtRaw(stage.effectiveInputs[port.id]));
            }
        });
    }

    /** Uma etapa: campos de entrada editáveis + bloco de resultados calculados. */
    private _renderCategory(cat: ProductionCategory, stage: ChainedStageResult): HTMLElement {
        const block = document.createElement('section');
        block.className = 'pa-category';
        block.setAttribute('role', 'group');
        block.setAttribute('aria-label', t(cat.nameKey));

        const title = document.createElement('h4');
        title.textContent = t(cat.nameKey);
        block.appendChild(title);

        // Entradas editáveis (valor exibido = efetivo: user > cadeia > default).
        const inputsWrap = document.createElement('div');
        inputsWrap.className = 'pa-inputs';
        const fields = new Map<string, HTMLInputElement>();
        this._fieldsByCat.set(cat.id, fields);
        for (const port of cat.inputs) {
            const row = document.createElement('label');
            row.className = 'pa-input-row';
            row.dataset.portId = port.id;

            const span = document.createElement('span');
            span.className = 'pa-port-label';
            span.textContent = `${t(port.nameKey)} (${escapeHtml(port.unit)})`;
            row.appendChild(span);

            const field = document.createElement('input');
            field.type = 'number';
            field.className = 'pa-input-field';
            field.min = '0';
            field.step = 'any';
            field.value = String(this._fmtRaw(stage.effectiveInputs[port.id]));
            field.dataset.portId = port.id;
            this._listen(field, 'input', () => {
                const raw = field.value.trim();
                const v = Number.parseFloat(raw);
                // Campo vazio remove o override — a porta volta ao encadeamento.
                if (raw === '' || !Number.isFinite(v)) this._clearPortValue(port.id);
                else this._setPortValue(port.id, v);
                // Cascata: editar aqui propaga para todas as etapas a jusante.
                this._refreshChain();
            });
            row.appendChild(field);
            fields.set(port.id, field);
            inputsWrap.appendChild(row);
        }
        block.appendChild(inputsWrap);

        // Resultados calculados (massa + energia por produto).
        const results = this._renderResults(cat, stage);
        this._resultsByCat.set(cat.id, results);
        block.appendChild(results);
        return block;
    }

    /** Bloco de RESULTADOS: massa e energia por produto + balanço de massa (#2/#3). */
    private _renderResults(cat: ProductionCategory, stage: ChainedStageResult): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'pa-results';
        void cat;

        const heading = document.createElement('div');
        heading.className = 'pa-results-head';
        heading.textContent = t('productionProcess.results');
        wrap.appendChild(heading);

        const ul = document.createElement('ul');
        ul.className = 'pa-outputs';
        for (const out of stage.outputs) {
            const li = document.createElement('li');
            li.dataset.portId = out.id;
            const mass = this._fmt(out.mass);
            let text = `${t(out.nameKey)}: ${mass} ${escapeHtml(out.unit)}`;
            if (typeof out.energyGJ === 'number' && out.energyGJ > 0) {
                text += ` · ${this._fmt(out.energyGJ)} GJ/d`;
                const factor = out.energyFactorId ? getEnergyFactor(out.energyFactorId) : null;
                if (factor) text += ` (PCS ${this._fmt(factor.hhvMJkg)} MJ/kg)`;
            }
            li.textContent = text;
            ul.appendChild(li);
        }
        wrap.appendChild(ul);

        if (stage.energyTotalGJ > 0) {
            const total = document.createElement('div');
            total.className = 'pa-energy-total';
            total.textContent = `${t('productionProcess.energyTotal')}: ${this._fmt(stage.energyTotalGJ)} GJ/d`;
            wrap.appendChild(total);
        }

        if (!stage.massBalance.ok) {
            const warn = document.createElement('div');
            warn.className = 'pa-warn';
            warn.setAttribute('role', 'alert');
            warn.textContent = t('productionProcess.warn.massBalance');
            wrap.appendChild(warn);
        }
        return wrap;
    }

    /** Valor numérico arredondado (2 casas) para campos de entrada. */
    private _fmtRaw(n: number | undefined): number {
        if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
        return Math.round(n * 100) / 100;
    }

    /** Formata número com até 2 casas, sem cauda de zeros (pt-BR agnóstico). */
    private _fmt(n: number): string {
        if (!Number.isFinite(n)) return '0';
        return String(Math.round(n * 100) / 100);
    }

    override getStyles(): string {
        return `
        .ecbt-fm-production_area { display: flex; flex-direction: column; gap: 12px; padding: 8px; }
        .ecbt-fm-production_area .pa-category { border: 1px solid var(--border, #2a2a2a); border-radius: 6px; padding: 8px 12px; }
        .ecbt-fm-production_area .pa-category h4 { margin: 0 0 6px; font-size: 0.9rem; }
        .ecbt-fm-production_area .pa-subtype-option { display: block; width: 100%; margin: 4px 0; padding: 8px; cursor: pointer; }
        .ecbt-fm-production_area ul { margin: 4px 0; padding-left: 18px; }
        .ecbt-fm-production_area .pa-input-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0; }
        .ecbt-fm-production_area .pa-input-field { width: 96px; max-width: 45%; padding: 3px 6px; }
        .ecbt-fm-production_area .pa-results { margin-top: 8px; padding-top: 6px; border-top: 1px dashed var(--border, #2a2a2a); }
        .ecbt-fm-production_area .pa-results-head { font-size: 0.75rem; text-transform: uppercase; opacity: 0.7; margin-bottom: 2px; }
        .ecbt-fm-production_area .pa-energy-total { margin-top: 4px; font-weight: 600; }
        .ecbt-fm-production_area .pa-warn { margin-top: 6px; color: var(--warn, #d98b00); font-size: 0.8rem; }
        `;
    }
}

export default ProductionProcessModule;
