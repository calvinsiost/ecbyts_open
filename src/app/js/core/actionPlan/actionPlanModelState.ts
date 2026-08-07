// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Plano de Ação — estado persistível na chave `.ecbt` (ACTION-PLAN-001 RF-9).
 *
 * ESPELHA `core/erp/erpModelState.ts` (Calvin "guardar na chave .ecbt sempre"):
 * store singleton em memória + `exportActionPlan()`/`importActionPlan(payload)`
 * puros o suficiente para round-trip, com sanitização **forward-compat** (payload
 * ausente/malformado = listas vazias, NUNCA quebra chave antiga).
 *
 * O wire em `io/export.ts` (`buildModel()` → `actionPlan: exportActionPlan()`) e
 * `io/import.ts` (`applyModel()` → `importActionPlan(model.actionPlan)`) é FASE 2
 * (junto da UI, para validar em pixels) — as funções já ficam prontas aqui.
 *
 * - A UI/gerador grava aqui via {@link setActions}/{@link setPlans}.
 * - O export (io/export) serializa via {@link exportActionPlan}.
 * - O import (io/import) restaura via {@link importActionPlan}.
 *
 * Sem DOM, sem I/O — só estado + cópia defensiva.
 */

import type { Action, Plan } from './_actionPlanPure.js';

/**
 * Versão do schema do payload `model.actionPlan` (forward-compat).
 * v1 → `actions` + `plans`.
 */
export const ACTION_PLAN_SCHEMA_VERSION = 1;

/** Formato serializado guardado em `model.actionPlan` dentro da chave .ecbt. */
export interface ActionPlanPayload {
    /** Versão do schema (para migrações futuras). */
    readonly schemaVersion: number;
    /** Ações cadastradas (vazio até criar/importar). */
    readonly actions: Action[];
    /** Planos/Programas agrupadores (RF-13; vazio até criar/importar). */
    readonly plans: Plan[];
}

/** Estado do módulo: ações (vazio até a UI/gerador criar ou importar). */
let actions: Action[] = [];

/** Estado do módulo: planos agrupadores (vazio até criar/importar). */
let plans: Plan[] = [];

/** Saneia um array de ações: descarta o que não é objeto com `id` textual. */
function sanitizeActions(raw: unknown): Action[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
        (a): a is Action =>
            !!a && typeof a === 'object' && typeof (a as Action).id === 'string',
    );
}

/** Saneia um array de planos: descarta o que não é objeto com `id` textual. */
function sanitizePlans(raw: unknown): Plan[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
        (p): p is Plan =>
            !!p && typeof p === 'object' && typeof (p as Plan).id === 'string',
    );
}

/**
 * Retorna as ações em memória. Devolve a referência viva (não mutar in-place).
 *
 * @returns As ações persistíveis (array vazio se nada criado/importado).
 */
export function getActions(): Action[] {
    return actions;
}

/**
 * Grava as ações no store, com cópia defensiva (não-array vira lista vazia).
 *
 * @param next - Ações a guardar.
 */
export function setActions(next: readonly Action[] | null | undefined): void {
    actions = Array.isArray(next) ? [...next] : [];
}

/** Limpa as ações (ex.: ao iniciar import de modelo novo). */
export function clearActions(): void {
    actions = [];
}

/**
 * Retorna os planos agrupadores em memória (RF-13). Referência viva.
 *
 * @returns Os planos persistíveis (vazio até criar/importar).
 */
export function getPlans(): Plan[] {
    return plans;
}

/**
 * Grava os planos no store, com cópia defensiva (não-array vira lista vazia).
 *
 * @param next - Planos a guardar.
 */
export function setPlans(next: readonly Plan[] | null | undefined): void {
    plans = Array.isArray(next) ? [...next] : [];
}

/** Limpa os planos. */
export function clearPlans(): void {
    plans = [];
}

/** Limpa ações E planos (reset total — ex.: abrir chave sem actionPlan). */
export function clearActionPlan(): void {
    clearActions();
    clearPlans();
}

/**
 * Exporta o estado do Plano de Ação para serialização na chave .ecbt (RF-9).
 * Pura: lê o store e retorna um payload com cópia defensiva.
 *
 * @returns Payload `{ schemaVersion, actions, plans }`.
 */
export function exportActionPlan(): ActionPlanPayload {
    return {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        actions: sanitizeActions(actions),
        plans: sanitizePlans(plans),
    };
}

/**
 * Importa o estado do Plano de Ação de um payload da chave .ecbt (RF-9).
 * Forward-compat: payload ausente/malformado (undefined/null/{}/não-array) deixa
 * os stores vazios — NÃO quebra chaves antigas sem `model.actionPlan`.
 *
 * @param payload - O objeto `model.actionPlan` da chave (pode ser undefined).
 */
export function importActionPlan(
    payload: { actions?: unknown; plans?: unknown } | null | undefined,
): void {
    setActions(payload ? sanitizeActions((payload as ActionPlanPayload).actions) : []);
    setPlans(payload ? sanitizePlans((payload as ActionPlanPayload).plans) : []);
}
