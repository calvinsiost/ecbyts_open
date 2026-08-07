// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 (embedded-inspector slice) — derivadores do inspetor
 * embutido (seleção + chips de família + atalho "abrir no modelo"). claude - re-arq
 * 2026-06-20.
 *
 * EN: The read-only / stateless inspector helpers extracted from the homeGrid
 *     monolith. Behaviour is BYTE-identical to the legacy inline
 *     `_getEmbeddedInspectorSelection` / `_renderInspectorFamilyChips` /
 *     `_openActionsSelectionInModel`.
 *
 *     - getEmbeddedInspectorSelection: reads element/campaign/edge selection via an
 *       injected context (getters only, no setters) + a pure observations reader.
 *     - renderInspectorFamilyChips: pure given the familyCounts arg + a label fn.
 *     - openActionsSelectionInModel: stateless side-effect (reads selection, calls
 *       window globals) — no module `let` touched.
 *
 *     The stateful `_wireEmbeddedInspectorEvents` STAYS in homeGrid.ts: it mutates
 *     `_actionsSideView` and calls render fns / the shell controller, so moving it
 *     would inflate fan-out (a coupled context with setters) — out of scope for
 *     this slice. These 3 helpers are the cohesive, low-coupling sub-cluster.
 *
 * PT (leigo): junta as funcinhas do inspetor que SÓ LEEM a seleção atual e montam
 *     os "chips" de família / o atalho de abrir no modelo. Nada muda estado aqui —
 *     a fiação de cliques (que troca de aba) continua no homeGrid. Idêntico ao antigo.
 */
import { escapeHtml } from '../../helpers/html.js';

/**
 * Contexto injetado com as dependências de leitura do inspetor (getters only).
 * Equivale a ler as deps externas do homeGrid sem acoplá-las (sem setters).
 */
export interface EmbeddedInspectorContext {
    readonly getSelectedElement: () => any;
    readonly safeGetElements: () => any[];
    readonly safeGetCampaigns: () => any[];
    readonly getConnectedEdges: (id: string) => any[];
    readonly getElementObservations: (element: any) => any[];
}

export function getEmbeddedInspectorSelection(ctx: EmbeddedInspectorContext) {
    const selected = ctx.getSelectedElement();
    const elements = ctx.safeGetElements();
    const campaigns = ctx.safeGetCampaigns();
    const selectedEdges = selected?.id ? ctx.getConnectedEdges(selected.id) : [];
    const familyCounts = Array.from(
        elements.reduce((acc: any, element: any) => {
            const key = String(element?.family || 'generic');
            acc.set(key, (acc.get(key) || 0) + 1);
            return acc;
        }, new Map()),
    )
        .sort((left: any, right: any) => right[1] - left[1])
        .slice(0, 4);
    const selectedCampaigns = selected
        ? campaigns
              .filter((campaign: any) =>
                  (campaign?.plannedReadings || []).some(
                      /** @param {any} getObjectTypeLabel */ (reading: any) => String(reading?.elementId || '') === selected.id,
                  ),
              )
              .map((campaign: any) => campaign?.name || campaign?.id)
        : [];
    const selectedObservations = selected ? ctx.getElementObservations(selected) : [];
    return {
        selected,
        elements,
        campaigns,
        familyCounts,
        selectedCampaigns,
        selectedObservations,
        selectedEdges,
    };
}

/**
 * @param {any[]} getObjectTypeLabel
 * @param {(family: any) => any} getObjectTypeLabel
 */
export function renderInspectorFamilyChips(familyCounts: any, getObjectTypeLabel: (family: any) => any) {
    if (!familyCounts.length) {
        return '<span class="actions-shell-inspector-empty">Sem familias materializadas.</span>';
    }
    return familyCounts
        .map(
            ([family, count]: any) =>
                `<span class="actions-shell-inspector-chip">${escapeHtml(getObjectTypeLabel(family))} · ${count}</span>`,
        )
        .join('');
}

export function openActionsSelectionInModel(ctx: EmbeddedInspectorContext) {
    const selected = ctx.getSelectedElement();
    if (!selected?.id) return;
    (window as any).switchGroup?.('model', { skipAuthGate: true });
    window.setTimeout(() => {
        window.focusElementInViewport?.(selected.id);
    }, 260);
}
