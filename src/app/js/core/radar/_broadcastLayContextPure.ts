// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   BROADCAST LAY CONTEXT — camada leiga da página pública (broadcast)
   FRIEND-SCORE-001 seção ui/broadcast (Calvin 2026-06-13 "a+b").

   Resolve as 2 dores 🔴 da pior seção do friendliness score:
   - P5-2 (learnability): o cidadão/regulador abre o broadcast e não
     entende NADA (jargão "famílias"/"seções"/contadores). Falta uma
     tradução leiga "o que é isto / a situação é segura?".
   - P3-7 (error): share_code expirado caía em mensagem genérica
     ("pode ter expirado" + "ir para ecbyts") — sem caminho acionável.

   Pure-logic: status de conformidade → tom + chave i18n da mensagem
   leiga. NÃO inventa status quando o dado é ausente (grammar global:
   'unknown' → orientação neutra "consulte o responsável"). As strings
   vivem no I18N autocontido de app/js/boot/broadcast-init.js.
   ================================================================ */

export type LaySafetyStatus = 'within' | 'monitoring' | 'exceeded' | 'unknown';
export type LayTone = 'green' | 'yellow' | 'red' | 'neutral';

export const LAY_SAFETY_STATUSES: ReadonlyArray<LaySafetyStatus> = Object.freeze([
    'within',
    'monitoring',
    'exceeded',
    'unknown',
]);

export interface LaySafetyVM {
    readonly status: LaySafetyStatus;
    readonly tone: LayTone;
    /** Chave i18n do rótulo curto (selo). */
    readonly labelKey: string;
    /** Chave i18n da explicação leiga (1-2 frases). */
    readonly explainKey: string;
}

const _TONE: Readonly<Record<LaySafetyStatus, LayTone>> = Object.freeze({
    within: 'green',
    monitoring: 'yellow',
    exceeded: 'red',
    unknown: 'neutral',
});

/**
 * Normaliza qualquer entrada para um LaySafetyStatus canônico. Aceita
 * sinônimos comuns; tudo que não casa vira 'unknown' (fail-safe — nunca
 * afirma segurança sem dado).
 */
export function normalizeLaySafetyStatus(raw: unknown): LaySafetyStatus {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === 'within' || s === 'ok' || s === 'compliant' || s === 'safe' || s === 'green') return 'within';
    if (s === 'monitoring' || s === 'prevention' || s === 'watch' || s === 'yellow') return 'monitoring';
    if (s === 'exceeded' || s === 'intervention' || s === 'violation' || s === 'unsafe' || s === 'red')
        return 'exceeded';
    return 'unknown';
}

/**
 * View-model leigo da situação ambiental (P5-2). tone + chaves i18n; o
 * caller resolve as strings no locale corrente.
 */
export function buildLaySafetyVM(rawStatus: unknown): LaySafetyVM {
    const status = normalizeLaySafetyStatus(rawStatus);
    return Object.freeze({
        status,
        tone: _TONE[status],
        labelKey: `lay.safety.${status}.label`,
        explainKey: `lay.safety.${status}.explain`,
    });
}

export interface LayActionVM {
    readonly titleKey: string;
    readonly hintKey: string;
    readonly ctaKey: string;
}

/**
 * Mensagem ACIONÁVEL para o share_code expirado (P3-7) — substitui a
 * tela-morta/mensagem genérica por um caminho claro ("peça um novo link").
 */
export function buildExpiredActionVM(): LayActionVM {
    return Object.freeze({
        titleKey: 'lay.expired.title',
        hintKey: 'lay.expired.hint',
        ctaKey: 'goToEcbyts',
    });
}

/** Mensagem acionável para share_code inexistente (P3-7 irmã). */
export function buildNotFoundActionVM(): LayActionVM {
    return Object.freeze({
        titleKey: 'lay.notFound.title',
        hintKey: 'lay.notFound.hint',
        ctaKey: 'goToEcbyts',
    });
}

/** Chave i18n do bloco "O que é isto?" (sempre exibido — contexto leigo). */
export const LAY_WHATIS_TITLE_KEY = 'lay.whatis.title';
export const LAY_WHATIS_BODY_KEY = 'lay.whatis.body';
