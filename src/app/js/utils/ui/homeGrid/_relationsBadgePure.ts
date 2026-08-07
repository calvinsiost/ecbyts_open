// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RELATIONS CRITICAL BADGE — VM pure-logic do badge "N críticas"
   RELATIONS-UX-001 F1 (R5: badge acionável). Calvin 2026-06-14.

   O badge de violações de intervenção do painel Relações era um <span>
   passivo. A pesquisa (Toptal/Smashing) diz: alerta deve ser acionável —
   clicar → drill-down para a lista. Este módulo decide o ViewModel do badge
   (acionável ou não, rótulo, aria-label) sem tocar o DOM. O caller (renderer)
   monta <button> + bind do clique → handleOpenViolationsPanel (já existe).

   Pure: sem DOM, sem rede. Determinístico, frozen.
   ================================================================ */

export interface CriticalBadgeCounts {
    /** Violações de intervenção (críticas — vermelho reservado). */
    readonly intervention: number;
    /** Violações de prevenção (atenção). */
    readonly prevention: number;
}

export interface CriticalBadgeVM {
    /** Há algo a mostrar? (intervenção OU prevenção > 0) */
    readonly visible: boolean;
    /** O badge de intervenção é clicável? (flag on ∧ intervention>0) */
    readonly actionable: boolean;
    /** Contagem de intervenção (críticas). */
    readonly interventionCount: number;
    readonly preventionCount: number;
    /** Chave i18n do rótulo do badge crítico (interpola {{n}}). */
    readonly labelKey: string;
    /** Chave i18n do aria-label (drill-down explícito quando acionável). */
    readonly ariaKey: string;
    /** Tag semântica recomendada ao renderer: 'button' (acionável) ou 'span'. */
    readonly tag: 'button' | 'span';
}

/**
 * Constrói o ViewModel do badge de violações. Quando `actionable` (feature
 * flag on) e há intervenção, o badge vira um <button> com aria-label de
 * drill-down ("clique para ver"); caso contrário, mantém o <span> passivo
 * (comportamento atual — zero regressão com a flag off).
 */
export function buildCriticalBadgeVM(
    counts: CriticalBadgeCounts,
    opts: { readonly featureOn?: boolean } = {},
): CriticalBadgeVM {
    const intervention = _nonNegInt(counts?.intervention);
    const prevention = _nonNegInt(counts?.prevention);
    const featureOn = opts.featureOn === true;
    const actionable = featureOn && intervention > 0;
    return Object.freeze({
        visible: intervention > 0 || prevention > 0,
        actionable,
        interventionCount: intervention,
        preventionCount: prevention,
        labelKey: 'relationsPanel.criticalBadge',
        ariaKey: actionable ? 'relationsPanel.criticalBadgeAria' : 'relationsPanel.criticalBadge',
        tag: actionable ? 'button' : 'span',
    });
}

function _nonNegInt(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
