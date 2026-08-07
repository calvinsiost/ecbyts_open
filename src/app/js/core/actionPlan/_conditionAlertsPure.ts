// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Alertas de vencimento de condicionantes ambientais — núcleo PURO
 * (ENV-CONDITIONS-001 A9, §5 itens 5/13, §6).
 *
 * v1 é DELIBERADAMENTE só uma função pura + o chamador decide o que fazer com
 * o resultado (badge na UI RF-12/A13) — NÃO há scheduler/cron aqui (§12 NOT).
 *
 * Reusa {@link isOverdue} e {@link hasExpiredEvidence} de `_actionPlanPure.ts`
 * em vez de reimplementar a regra de atraso/evidência vencida (evita 2 fontes
 * de verdade divergentes para o mesmo cálculo).
 *
 * Datas são sempre LOCAIS (§5.12): `today` chega como parâmetro `YYYY-MM-DD`
 * calculado pelo CHAMADOR — esta função nunca lê `Date.now()`/`new Date()`
 * internamente, então não há risco de off-by-one por fuso (o parse de
 * `YYYY-MM-DD` com `new Date(y, m-1, d)` abaixo é local por construção).
 */

import { hasExpiredEvidence, isOverdue, type Action } from './_actionPlanPure.js';

/**
 * Resultado de {@link dueConditionAlerts}: 3 listas (podem se sobrepor — uma
 * `Action` overdue com evidência também vencida aparece nas duas).
 */
export interface ConditionAlerts {
    overdue: Action[];
    dueSoon: Action[];
    evidenceExpired: Action[];
}

/** Texto de data (`YYYY-MM-DD`) não-vazio? */
function isDateString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length >= 10;
}

/**
 * Condicionante aplicável? (RF-12, A3 — §5 item 3): ausência do campo conta
 * como aplicável (não quebra Actions criadas antes do campo existir).
 */
function isApplicable(action: Action): boolean {
    return action.applicability === undefined || action.applicability === 'aplicavel';
}

/**
 * Converte `YYYY-MM-DD` em `Date` LOCAL (nunca UTC — §5.12). Construir com
 * `new Date(y, m-1, d)` usa o fuso local do runtime, ao contrário de
 * `new Date('YYYY-MM-DD')` (que o motor JS trata como UTC meia-noite e pode
 * "voltar" um dia em fusos negativos como o do Brasil).
 *
 * @param dateStr - Data em `YYYY-MM-DD`.
 * @returns `Date` local à meia-noite, ou `undefined` se inválida.
 */
function parseLocalDate(dateStr: string): Date | undefined {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (!m) return undefined;
    const [, y, mo, d] = m as unknown as [string, string, string, string];
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? undefined : dt;
}

/**
 * `dateStr` está dentro da janela `[today, today+windowDays]` (inclusive nas
 * duas pontas) E ainda não é passado? Usada só para `dueSoon` (§5 item 13 —
 * `windowDays` é parametrizável pelo CHAMADOR, esta função não decide o
 * valor: 120d renovação de LO, 30d relatório mensal, etc. — dias corridos).
 */
function isWithinWindow(dateStr: string, today: string, windowDays: number): boolean {
    const target = parseLocalDate(dateStr);
    const base = parseLocalDate(today);
    if (!target || !base || !Number.isFinite(windowDays) || windowDays < 0) return false;
    const limit = new Date(base.getFullYear(), base.getMonth(), base.getDate() + windowDays);
    return target.getTime() >= base.getTime() && target.getTime() <= limit.getTime();
}

/**
 * Classifica condicionantes (`Action` com `originType='permitCondition'` ou
 * qualquer `Action`, o filtro de origem fica a critério do chamador) em 3
 * alertas de vencimento (ENV-CONDITIONS-001 A9):
 *
 *  - `overdue`: {@link isOverdue} (reusa a regra real — inclui A7: contínua
 *    sem `agencyDeadline` nunca entra aqui por ausência de data).
 *  - `dueSoon`: `agencyDeadline` dentro de `[today, today+windowDays]`, mas
 *    ainda NÃO vencida (não duplica quem já está em `overdue`).
 *  - `evidenceExpired`: {@link hasExpiredEvidence} — evidência mais recente
 *    com `validUntil` no passado, mesmo sem `agencyDeadline` vencido (§5
 *    item 4). Se a Action nunca teve `evidence[]`/`validUntil` (campo ainda
 *    não populado por quem cria a evidência), simplesmente não entra na
 *    lista — não quebra por campo ausente.
 *
 * Condicionantes com `applicability !== 'aplicavel'` (quando o campo existe)
 * são excluídas de TODAS as listas (§5 item 3 — NA sai do denominador, mas
 * nunca é deletada do array de origem, só não gera alerta).
 *
 * @param actions - Lista de ações/condicionantes.
 * @param today - "Hoje" em `YYYY-MM-DD`, LOCAL (§5.12) — calculado pelo chamador.
 * @param windowDays - Janela de "a vencer", em dias corridos (parametrizável — §5.13).
 * @returns `{ overdue, dueSoon, evidenceExpired }` (listas podem se sobrepor entre si).
 */
export function dueConditionAlerts(actions: Action[], today: string, windowDays: number): ConditionAlerts {
    const list = Array.isArray(actions) ? actions : [];
    const result: ConditionAlerts = { overdue: [], dueSoon: [], evidenceExpired: [] };
    if (!isDateString(today)) return result;

    for (const action of list) {
        if (!action || !isApplicable(action)) continue;

        const late = isOverdue(action, today);
        if (late) result.overdue.push(action);

        if (!late && isDateString(action.agencyDeadline) && isWithinWindow(action.agencyDeadline, today, windowDays)) {
            result.dueSoon.push(action);
        }

        if (hasExpiredEvidence(action, today)) result.evidenceExpired.push(action);
    }

    return result;
}
