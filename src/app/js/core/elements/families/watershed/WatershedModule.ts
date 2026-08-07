// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WatershedModule — Sub-módulo da família 'watershed' (WATERSHED-FAMILY-001).

   F1 (este ciclo): painel read-only que, quando o elemento já carrega terreno
   + ponto de exutório, mostra o RESUMO da bacia (nº de células, área, talvegue)
   calculado pela amarração pure-logic (_watershedBindingPure → core/hydrology).

   F2 (futuro, requer validação Pixels-Over-DOM): seleção interativa do exutório
   no mapa, render 3D da máscara da bacia + talvegue, exportação.
   ================================================================ */

import { FamilyModule } from '../_base/FamilyModule.js';
import { computeWatershedForElement, summarizeWatershed } from './_watershedBindingPure.js';

interface WatershedElementData {
    terrain?: { width: number; height: number; elevation: number[] | Float64Array };
    pourX?: number;
    pourY?: number;
    cellSize?: number;
}

export class WatershedModule extends FamilyModule {
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
        const data = ((this._element as { data?: WatershedElementData })?.data ?? {}) as WatershedElementData;
        const panel = document.createElement('div');
        panel.className = 'watershed-module';

        if (!data.terrain || typeof data.pourX !== 'number' || typeof data.pourY !== 'number') {
            const hint = document.createElement('p');
            hint.textContent =
                'Carregue um terreno (DEM) e defina o ponto de exutório para delinear a bacia.';
            panel.appendChild(hint);
        } else {
            try {
                const computed = computeWatershedForElement({
                    terrain: data.terrain,
                    pourX: data.pourX,
                    pourY: data.pourY,
                    cellSize: data.cellSize ?? 1,
                });
                const summary = document.createElement('p');
                summary.textContent = summarizeWatershed(computed, data.cellSize ?? 1);
                panel.appendChild(summary);
            } catch (e) {
                const err = document.createElement('p');
                err.textContent = 'Não foi possível delinear a bacia com os dados atuais.';
                panel.appendChild(err);
                console.debug('[watershed:render]', (e as Error)?.message || e);
            }
        }
        container.replaceChildren(panel);
    }
}

export default WatershedModule;
