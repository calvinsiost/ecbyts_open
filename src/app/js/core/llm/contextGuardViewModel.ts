// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Privacy Context Guard View-Model — F3-prep pure-logic
// (SPEC_ECBY_PRIVACY_CONTEXT_GUARD)
//
// View-model puro consumido pela UI F3 (toggle + avatar Ecby + painel
// audit). CONSOME estados/redactions produzidos pelo F1 contextGuard.
// NÃO recalcula sanitization, NÃO muta state. Apenas organiza/decora
// para renderização.
//
// Princípios herdados (LGPD Art. 5):
// - Default privacy-first: guard ON é o estado canônico.
// - Não-só-cor: avatar state tem ícone + label + tone distintos.
// - Audit transparency: redactions são exibidas sem nunca o valor bruto.
// - Toggle confirmation: estado OFF requer confirmação explícita.

/** Estados do guard (alinhado a GUARD_POLICIES do F1). */
const GUARD_STATES = Object.freeze({
    ON: 'on', // toggle ativo (mode 'strict' ou 'balanced')
    OFF: 'off', // toggle desligado (mode 'open' — passthrough)
});

/** Token de avatar por estado — não-só-cor. */
const AVATAR_TOKENS = Object.freeze({
    on: {
        icon: '🛡',
        labelKey: 'ecby.guard.avatarAriaOn',
        tone: 'guard-protected',
        colorToken: 'color-guard-on',
    },
    off: {
        icon: '⚠',
        labelKey: 'ecby.guard.avatarAriaOff',
        tone: 'guard-open',
        colorToken: 'color-guard-off',
    },
});

/**
 * Resolve estado canônico do guard a partir do mode do F1.
 *
 * @param {string|null|undefined} mode 'strict' | 'balanced' | 'open' | null
 * @returns {'on'|'off'}
 */
export function resolveGuardState(mode: any) {
    if (mode === 'open') return GUARD_STATES.OFF;
    // default-on (privacy-first): qualquer outro valor / null / undefined → ON
    return GUARD_STATES.ON;
}

/**
 * View-model do avatar Ecby p/ um estado de guard.
 * Não-só-cor: icon + labelKey + tone + colorToken (CSS custom prop).
 *
 * @param {'on'|'off'} state
 * @returns {{icon:string, labelKey:string, tone:string, colorToken:string}}
 */
export function buildAvatarStateVM(state: any) {
    return (AVATAR_TOKENS as Record<string,any>)[state] || AVATAR_TOKENS.on;
}

/**
 * View-model do toggle UI (configurações do bot).
 *
 * Output:
 * ```
 * {
 *   state: 'on' | 'off',
 *   checked: boolean,         // input[type=checkbox] state
 *   disabled: boolean,        // true se flag global OFF
 *   labelKey: i18n,
 *   helpKey: i18n,
 *   confirmRequiredOnOff: true, // toggle OFF exige confirmação
 *   warningKey: string|null,  // i18n key se em OFF
 * }
 * ```
 *
 * @param {{currentMode?:string, featureFlagEnabled?:boolean}} input
 * @returns {Object}
 */
export function buildGuardToggleVM(input: any) {
    const i = input || {};
    const state = resolveGuardState(i.currentMode);
    const flagEnabled = i.featureFlagEnabled !== false;
    return {
        state,
        checked: state === GUARD_STATES.ON,
        disabled: !flagEnabled,
        labelKey: 'ecby.guard.toggleLabel',
        helpKey: 'ecby.guard.toggleHelp',
        confirmRequiredOnOff: true,
        warningKey: state === GUARD_STATES.OFF ? 'ecby.guard.offWarning' : null,
    };
}

/**
 * Sumariza redactions p/ exibição no painel audit (LGPD transparência).
 * Agrupa por tipo, conta ocorrências, NUNCA expõe valor bruto.
 *
 * @param {Array<{field:string, type:string}>} redactions Output de
 *   sanitizeModelContext.redactions (F1).
 * @returns {{
 *   totalRedactions: number,
 *   byType: Record<string, {count:number, badge:Object}>,
 *   recent: Array<{field:string, type:string, badge:Object}>,
 * }}
 */
export function buildAuditPanelVM(redactions: any) {
    const list = Array.isArray(redactions) ? redactions : [];
    const TYPE_BADGES = {
        identifier: { icon: '#', labelKey: 'ecby.guard.redact.identifier', tone: 'danger' },
        coordinate: { icon: '◎', labelKey: 'ecby.guard.redact.coordinate', tone: 'warn' },
        date: { icon: '⏱', labelKey: 'ecby.guard.redact.date', tone: 'muted' },
        numeric: { icon: '≈', labelKey: 'ecby.guard.redact.numeric', tone: 'info' },
    };
    const byType: any = {};
    for (const r of list) {
        if (!r || typeof r !== 'object') continue;
        const type = String(r.type || 'unknown');
        if (!byType[type]) {
            byType[type] = {
                count: 0,
                badge: (TYPE_BADGES as Record<string,any>)[type] || { icon: '?', labelKey: 'ecby.guard.redact.unknown', tone: 'muted' },
            };
        }
        byType[type].count += 1;
    }
    const recent = list.slice(-10).map((r: any) => ({
        field: (r && r.field) || '',
        type: (r && r.type) || 'unknown',
        badge: (TYPE_BADGES as Record<string,any>)[(r && r.type) || ""] || { icon: '?', labelKey: 'ecby.guard.redact.unknown', tone: 'muted' },
    }));
    return { totalRedactions: list.length, byType, recent };
}

/**
 * Pure transition validator p/ toggle action. Aplica regras:
 * - ON → OFF exige `confirmed:true`.
 * - OFF → ON sempre permitido (privacy-first).
 * - Flag desligada bloqueia qualquer transição.
 *
 * @param {{from:'on'|'off', to:'on'|'off', confirmed?:boolean, flagEnabled?:boolean}} input
 * @returns {{allowed:boolean, reasonKey:string|null}}
 */
export function validateGuardTransition(input: any) {
    const i = input || {};
    if (i.flagEnabled === false) {
        return { allowed: false, reasonKey: 'ecby.guard.transition.flagDisabled' };
    }
    if (i.from === i.to) {
        return { allowed: false, reasonKey: 'ecby.guard.transition.noop' };
    }
    if (i.from === GUARD_STATES.ON && i.to === GUARD_STATES.OFF) {
        if (i.confirmed !== true) {
            return { allowed: false, reasonKey: 'ecby.guard.transition.confirmRequired' };
        }
        return { allowed: true, reasonKey: null };
    }
    if (i.from === GUARD_STATES.OFF && i.to === GUARD_STATES.ON) {
        return { allowed: true, reasonKey: null };
    }
    return { allowed: false, reasonKey: 'ecby.guard.transition.invalid' };
}

/** Constantes públicas. */
export const GUARD_VIEW_STATES = GUARD_STATES;
export const GUARD_AVATAR_TOKENS = AVATAR_TOKENS;
