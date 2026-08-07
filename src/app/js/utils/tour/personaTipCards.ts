// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * personaTipCards.js - SH-1 of SPEC_FIRST_TIME_USER_JOURNEY (UX-5)
 *
 * Pure-logic data module + selector for D1+1 contextual tip cards by persona.
 * Cards são exibidos no segundo dia (24h+ após first-visit) - um por sessão,
 * sem repetir até esgotar o pool da persona.
 *
 * No DOM, no localStorage access, no side-effects - caller injeta state.
 * Mantém o módulo testável via Node cheap tests sem browser.
 *
 * Spec: docs/specs/features/SPEC_FIRST_TIME_USER_JOURNEY.md §2.2 SH-1
 */

interface TipCard {
    id: string;
    titleKey: string;
    bodyKey: string;
    ctaKey?: string;
    ctaAction?: string;
}

/**
 * Catálogo canônico de tip cards por persona.
 * i18n keys (não strings hardcoded) - UI resolve via translate().
 */
export const TIP_CARDS: Readonly<Record<string, Array<TipCard>>> = Object.freeze({
    engineer: [
        {
            id: 'eng-sim-gaussian',
            titleKey: 'tip.eng.gaussian.title',
            bodyKey: 'tip.eng.gaussian.body',
            ctaKey: 'tip.eng.gaussian.cta',
            ctaAction: 'openSimulationLab',
        },
        {
            id: 'eng-kriging',
            titleKey: 'tip.eng.kriging.title',
            bodyKey: 'tip.eng.kriging.body',
            ctaKey: 'tip.eng.kriging.cta',
            ctaAction: 'openInterpolationPanel',
        },
        {
            id: 'eng-eis',
            titleKey: 'tip.eng.eis.title',
            bodyKey: 'tip.eng.eis.body',
            ctaKey: 'tip.eng.eis.cta',
            ctaAction: 'openEisDashboard',
        },
    ],
    regulator: [
        {
            id: 'reg-compliance',
            titleKey: 'tip.reg.compliance.title',
            bodyKey: 'tip.reg.compliance.body',
            ctaKey: 'tip.reg.compliance.cta',
            ctaAction: 'openComplianceDashboard',
        },
        {
            id: 'reg-thresholds',
            titleKey: 'tip.reg.thresholds.title',
            bodyKey: 'tip.reg.thresholds.body',
            ctaKey: 'tip.reg.thresholds.cta',
            ctaAction: 'openValidationProfiles',
        },
        {
            id: 'reg-audit',
            titleKey: 'tip.reg.audit.title',
            bodyKey: 'tip.reg.audit.body',
            ctaKey: 'tip.reg.audit.cta',
            ctaAction: 'openAuditTrail',
        },
    ],
    consultant: [
        {
            id: 'con-reports',
            titleKey: 'tip.con.reports.title',
            bodyKey: 'tip.con.reports.body',
            ctaKey: 'tip.con.reports.cta',
            ctaAction: 'openReportEditor',
        },
        {
            id: 'con-multisite',
            titleKey: 'tip.con.multisite.title',
            bodyKey: 'tip.con.multisite.body',
            ctaKey: 'tip.con.multisite.cta',
            ctaAction: 'openProjectRegistry',
        },
        {
            id: 'con-export',
            titleKey: 'tip.con.export.title',
            bodyKey: 'tip.con.export.body',
            ctaKey: 'tip.con.export.cta',
            ctaAction: 'openExportTemplates',
        },
    ],
});

const VALID_PERSONAS = Object.freeze(['engineer', 'regulator', 'consultant']);

/**
 * Valida persona string contra valores permitidos.
 */
export function isValidPersona(persona: unknown): boolean {
    return typeof persona === 'string' && VALID_PERSONAS.includes(persona);
}

/**
 * Seleciona o próximo tip card a exibir para a persona dada.
 *
 * Regras:
 * - Persona inválida ou null → retorna null (sem tip)
 * - Filtra cards já mostrados (shownIds)
 * - Se todos foram exibidos → retorna null (esgotado, não repete)
 * - Determinístico via índice (firstUnshown) - mesma entrada = mesma saída
 *
 * @param persona - engineer | regulator | consultant | null
 * @param shownIds - IDs já exibidos (de localStorage['ecbyts-tip-cards-shown'])
 */
export function pickNextTipCard(persona: string | null, shownIds: string[] = []): TipCard | null {
    if (!isValidPersona(persona)) return null;
    const pool = (TIP_CARDS as any)[persona as string];
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const shownSet = new Set(Array.isArray(shownIds) ? shownIds : []);
    for (const card of pool) {
        if (!shownSet.has(card.id)) return { ...card };
    }
    return null;
}

/**
 * Determina se passou tempo suficiente desde a primeira visita para exibir tip.
 * Spec §2.2 SH-1: D1+1 = 24h+ após first-visit timestamp.
 *
 * @param firstVisitISO - ISO date string de localStorage['ecbyts-first-visit']
 * @param nowMs - injetável para testes
 * @param minDelayMs - default 24h
 */
export function isEligibleForTipCard(
    firstVisitISO: string | null,
    nowMs: number = Date.now(),
    minDelayMs: number = 24 * 60 * 60 * 1000,
): boolean {
    if (typeof firstVisitISO !== 'string' || !firstVisitISO) return false;
    const t = Date.parse(firstVisitISO);
    if (Number.isNaN(t)) return false;
    return nowMs - t >= minDelayMs;
}

/**
 * Conta total de tip cards disponíveis para a persona (útil para UI "1 de 3").
 */
export function getTipCardCount(persona: string | null): number {
    if (!isValidPersona(persona)) return 0;
    return (TIP_CARDS as any)[persona as string].length;
}
