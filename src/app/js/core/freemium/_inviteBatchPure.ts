// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   INVITE BATCH PURE — Convites em lote (modo turma/classroom)
   SPEC_INVITE_BATCH_CLASSROOM (INVITE-BATCH-001) — pure logic.

   Um codigo de turma e um platform_invite com max_uses > 1, tier
   'classroom' e prefixo reservado TURM. Formato: TURM + 4 chars do
   alfabeto sem ambiguos (8 chars no total — encaixa no input 4+4 da
   welcome screen e na coluna char(8) sem NENHUMA mudanca no fluxo
   do aluno; ver Registro de Implementacao na spec para o racional
   do desvio RF3 TURMA-+6 → TURM-+4).
   ================================================================ */

import { INVITE_ALPHABET, normalizeInviteCode } from '../auth/inviteCode.js';

/** Prefixo reservado que marca um codigo como convite de turma. */
export const BATCH_INVITE_PREFIX = 'TURM';
/** Comprimento total do codigo (igual ao convite individual). */
export const BATCH_CODE_LENGTH = 8;
/** Limites de usos por lote (RF1). */
export const BATCH_MAX_USES_MIN = 1;
export const BATCH_MAX_USES_MAX = 100;
/** Validade default em dias (RF1) e teto de validade. */
export const BATCH_DEFAULT_EXPIRES_DAYS = 14;
export const BATCH_EXPIRES_DAYS_MAX = 90;
/** Tamanho maximo do rotulo legivel do lote. */
export const BATCH_LABEL_MAX_LENGTH = 80;

export type BatchInviteState = 'active' | 'exhausted' | 'expired' | 'revoked';

export interface BatchParamsInput {
    label?: unknown;
    maxUses?: unknown;
    expiresDays?: unknown;
}

export interface BatchParamsResult {
    ok: boolean;
    errors: string[];
    normalized: { label: string; maxUses: number; expiresDays: number };
}

export interface BatchInviteRow {
    useCount?: unknown;
    maxUses?: unknown;
    /** ISO string ou epoch ms. */
    expiresAt?: unknown;
    /** ISO string ou epoch ms; null = nao revogado. */
    revokedAt?: unknown;
}

export interface BatchRedeemErrorVM {
    i18nKey: string;
    fallback: string;
    params: Record<string, string | number>;
}

/**
 * True se o codigo (apos normalizacao) e um convite de turma.
 * Aceita entrada com hifen/espacos/lowercase ("turm-ab23").
 */
export function isBatchInviteCode(raw: unknown): boolean {
    const code = normalizeInviteCode(raw);
    return code.length === BATCH_CODE_LENGTH && code.startsWith(BATCH_INVITE_PREFIX);
}

/**
 * Gera o sufixo aleatorio (4 chars do alfabeto sem ambiguos).
 * RNG injetavel ([0,1)) para testes deterministas; default Math.random.
 */
export function generateBatchCodeSuffix(rng: () => number = Math.random): string {
    const n = BATCH_CODE_LENGTH - BATCH_INVITE_PREFIX.length;
    let suffix = '';
    for (let i = 0; i < n; i++) {
        const idx = Math.min(INVITE_ALPHABET.length - 1, Math.floor(rng() * INVITE_ALPHABET.length));
        suffix += INVITE_ALPHABET[Math.max(0, idx)];
    }
    return suffix;
}

/** Monta um codigo de turma completo (TURM + sufixo). */
export function buildBatchCode(rng: () => number = Math.random): string {
    return BATCH_INVITE_PREFIX + generateBatchCodeSuffix(rng);
}

/** Exibicao legivel: "TURM-AB23" (mesmo split visual dos inputs 4+4). */
export function formatBatchCodeDisplay(raw: unknown): string {
    const code = normalizeInviteCode(raw);
    if (code.length !== BATCH_CODE_LENGTH) return code;
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function _toFiniteInt(value: unknown): number | null {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    return Math.trunc(n);
}

/**
 * Valida e normaliza os parametros de criacao de lote (RF1).
 * Nao clampa silenciosamente valores fora da faixa — reporta erro
 * (grammar global: ausencia/ambiguidade nao vira default inferido).
 */
export function validateBatchParams(input: BatchParamsInput = {}): BatchParamsResult {
    const errors: string[] = [];

    const rawLabel = input.label == null ? '' : String(input.label).trim();
    if (rawLabel.length > BATCH_LABEL_MAX_LENGTH) errors.push('label_too_long');
    const label = rawLabel.slice(0, BATCH_LABEL_MAX_LENGTH);

    let maxUses = BATCH_MAX_USES_MIN;
    if (input.maxUses == null) {
        errors.push('max_uses_required');
    } else {
        const n = _toFiniteInt(input.maxUses);
        if (n == null) errors.push('max_uses_not_a_number');
        else if (n < BATCH_MAX_USES_MIN || n > BATCH_MAX_USES_MAX) errors.push('max_uses_out_of_range');
        else maxUses = n;
    }

    let expiresDays = BATCH_DEFAULT_EXPIRES_DAYS;
    if (input.expiresDays != null) {
        const n = _toFiniteInt(input.expiresDays);
        if (n == null) errors.push('expires_days_not_a_number');
        else if (n < 1 || n > BATCH_EXPIRES_DAYS_MAX) errors.push('expires_days_out_of_range');
        else expiresDays = n;
    }

    return Object.freeze({
        ok: errors.length === 0,
        errors,
        normalized: Object.freeze({ label, maxUses, expiresDays }),
    });
}

function _toEpochMs(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const t = Date.parse(value);
        return Number.isFinite(t) ? t : null;
    }
    if (value instanceof Date) return value.getTime();
    return null;
}

/**
 * FSM de estado do lote. Precedencia canonica:
 * revoked > expired > exhausted > active.
 * Revogacao e acao explicita do admin e vence qualquer outro estado;
 * expiracao vence esgotamento (mensagem de prazo e mais acionavel).
 */
export function resolveBatchState(row: BatchInviteRow, nowMs: number = Date.now()): BatchInviteState {
    const revokedAt = _toEpochMs(row?.revokedAt);
    if (revokedAt != null && revokedAt <= nowMs) return 'revoked';

    const expiresAt = _toEpochMs(row?.expiresAt);
    if (expiresAt != null && expiresAt < nowMs) return 'expired';

    const useCount = _toFiniteInt(row?.useCount) ?? 0;
    // Ausente → default 1 uso (convite individual). Presente mas
    // malformado → fail-closed (0 usos = exhausted, nega resgate).
    const maxUses = row?.maxUses == null ? BATCH_MAX_USES_MIN : (_toFiniteInt(row.maxUses) ?? 0);
    if (useCount >= maxUses) return 'exhausted';

    return 'active';
}

/** Usos restantes (nunca negativo). */
export function remainingUses(row: BatchInviteRow): number {
    const useCount = _toFiniteInt(row?.useCount) ?? 0;
    const maxUses = _toFiniteInt(row?.maxUses) ?? 0;
    return Math.max(0, maxUses - useCount);
}

/**
 * View-model da mensagem de erro de resgate (RF5) — chave i18n +
 * params para t(key, params) ({{max}}, {{date}}). O caller formata
 * a data no locale corrente antes de exibir.
 */
export function buildBatchRedeemErrorVM(
    state: BatchInviteState,
    row: BatchInviteRow = {},
    formatDate: (epochMs: number) => string = (ms) => new Date(ms).toLocaleDateString(),
): BatchRedeemErrorVM | null {
    if (state === 'exhausted') {
        const max = _toFiniteInt(row?.maxUses) ?? 0;
        return Object.freeze({
            i18nKey: 'invite.classroomExhausted',
            fallback: `This class code reached its limit of ${max} uses — ask your instructor for a new one`,
            params: { max },
        });
    }
    if (state === 'expired') {
        const expiresAt = _toEpochMs(row?.expiresAt);
        const date = expiresAt != null ? formatDate(expiresAt) : '';
        return Object.freeze({
            i18nKey: 'invite.classroomExpired',
            fallback: `This class code expired on ${date} — ask your instructor for a new one`,
            params: { date },
        });
    }
    if (state === 'revoked') {
        return Object.freeze({
            i18nKey: 'invite.classroomRevoked',
            fallback: 'This class code was deactivated — ask your instructor for a new one',
            params: {},
        });
    }
    return null;
}

/* ================================================================
   RF7 — Auto-purge LGPD (pure-logic de elegibilidade)

   Should (spec §2 RF7): contas 'classroom' sem login por >=30d
   APOS a expiracao do lote -> fila gdpr-delete (reusa edge function).
   Esta camada decide DETERMINISTICAMENTE quais contas sao elegiveis;
   o enfileiramento real (RPC/edge function) e infra fora deste modulo.

   Minimizacao de dados (LGPD Art 6 III + Art 16): so contas que (a)
   sao tier 'classroom', (b) cujo lote ja expirou e (c) ficaram
   inativas pelo periodo de carencia desde a expiracao. Conta que
   NUNCA logou usa a propria expiracao como marco de inicio da
   carencia (nao ha login para contar a partir).
   ================================================================ */

/** Carencia padrao de inatividade pos-expiracao (RF7) em dias. */
export const CLASSROOM_PURGE_GRACE_DAYS = 30;
const _MS_PER_DAY = 86_400_000;

export interface ClassroomAccountRow {
    /** Tier da conta; so 'classroom' e elegivel a purge automatico. */
    tier?: unknown;
    /** Expiracao do lote de turma (ISO string | epoch ms | Date). */
    batchExpiresAt?: unknown;
    /** Ultimo login (ISO | epoch | Date); null/ausente = nunca logou. */
    lastLoginAt?: unknown;
    /** Marca explicita de classroom (RF2); reforca o gate de tier. */
    classroom?: unknown;
}

export interface PurgeEligibility {
    eligible: boolean;
    /** Razao quando NAO elegivel (auditavel); '' quando elegivel. */
    reason: '' | 'not_classroom' | 'no_expiry' | 'not_expired' | 'within_grace';
    /** Epoch ms a partir do qual a conta fica elegivel (null se sem expiry). */
    eligibleAtMs: number | null;
}

function _isClassroomTier(row: ClassroomAccountRow): boolean {
    return row?.tier === 'classroom' || row?.classroom === true;
}

/**
 * Avalia a elegibilidade de UMA conta classroom ao purge LGPD (RF7).
 * Determinista (clock injetado). Fail-closed: dados ausentes/invalidos
 * nunca produzem `eligible:true` (nao se apaga conta por engano).
 *
 * O marco de inicio da carencia e o MAIS RECENTE entre expiracao do
 * lote e ultimo login — uma conta que logou DEPOIS da expiracao reinicia
 * a contagem (atividade recente protege contra purge).
 */
export function evaluateClassroomPurge(
    row: ClassroomAccountRow,
    nowMs: number = Date.now(),
    graceDays: number = CLASSROOM_PURGE_GRACE_DAYS,
): PurgeEligibility {
    if (!_isClassroomTier(row)) {
        return Object.freeze({ eligible: false, reason: 'not_classroom', eligibleAtMs: null });
    }

    const expiresAt = _toEpochMs(row?.batchExpiresAt);
    if (expiresAt == null) {
        return Object.freeze({ eligible: false, reason: 'no_expiry', eligibleAtMs: null });
    }

    const grace = Number.isFinite(graceDays) && graceDays >= 0 ? graceDays : CLASSROOM_PURGE_GRACE_DAYS;
    const graceMs = grace * _MS_PER_DAY;

    if (expiresAt >= nowMs) {
        // Lote ainda nao expirou; nunca elegivel ainda.
        return Object.freeze({ eligible: false, reason: 'not_expired', eligibleAtMs: expiresAt + graceMs });
    }

    const lastLogin = _toEpochMs(row?.lastLoginAt);
    // Marco de carencia = max(expiracao, ultimo login). Login pos-expiracao
    // (atividade) empurra o marco para frente.
    const graceStart = lastLogin != null && lastLogin > expiresAt ? lastLogin : expiresAt;
    const eligibleAtMs = graceStart + graceMs;

    if (nowMs < eligibleAtMs) {
        return Object.freeze({ eligible: false, reason: 'within_grace', eligibleAtMs });
    }

    return Object.freeze({ eligible: true, reason: '', eligibleAtMs });
}

/** Atalho booleano de `evaluateClassroomPurge`. */
export function isClassroomAccountPurgeEligible(
    row: ClassroomAccountRow,
    nowMs: number = Date.now(),
    graceDays: number = CLASSROOM_PURGE_GRACE_DAYS,
): boolean {
    return evaluateClassroomPurge(row, nowMs, graceDays).eligible;
}

/**
 * Filtra um lote de contas, retornando apenas as elegiveis ao purge (RF7),
 * ordenadas por `eligibleAtMs` ascendente (mais antigas primeiro — ordem
 * justa de processamento da fila). Entrada nao-array -> [].
 */
export function selectPurgeEligibleAccounts<T extends ClassroomAccountRow>(
    accounts: readonly T[],
    nowMs: number = Date.now(),
    graceDays: number = CLASSROOM_PURGE_GRACE_DAYS,
): T[] {
    if (!Array.isArray(accounts)) return [];
    return accounts
        .map((row) => ({ row, ev: evaluateClassroomPurge(row, nowMs, graceDays) }))
        .filter((x) => x.ev.eligible)
        .sort((a, b) => (a.ev.eligibleAtMs ?? 0) - (b.ev.eligibleAtMs ?? 0))
        .map((x) => x.row);
}

/* ================================================================
   RF8 — Painel do professor (pure-logic da projecao do roster)

   Should (spec §2 RF8 + §5): o professor ve a lista de quem entrou
   pelo SEU codigo — "so nomes". Esta camada projeta as redemptions
   cruas numa lista deduplicada, ordenada e MINIMIZADA (LGPD Art 16):
   email/ids internos NAO saem na projecao exibivel — apenas nome de
   exibicao + quando entrou.
   ================================================================ */

export interface RedemptionRow {
    /** Id do usuario que resgatou (chave de dedup; NAO exibido). */
    userId?: unknown;
    /** Nome de exibicao do aluno. */
    displayName?: unknown;
    /** Email — NUNCA propagado para a projecao (minimizacao LGPD). */
    email?: unknown;
    /** Momento do resgate (ISO | epoch | Date). */
    redeemedAt?: unknown;
}

export interface RosterEntry {
    /** Nome de exibicao ja saneado (string sempre). */
    displayName: string;
    /** Epoch ms do resgate, ou null se desconhecido. */
    redeemedAtMs: number | null;
}

export interface ClassroomRoster {
    entries: RosterEntry[];
    /** Numero de alunos distintos (== entries.length). */
    count: number;
}

/** Fallback de nome quando a redemption nao traz displayName. */
export const ROSTER_ANONYMOUS_NAME = 'Aluno';

function _sanitizeName(value: unknown): string {
    if (value == null) return ROSTER_ANONYMOUS_NAME;
    const s = String(value).trim();
    return s === '' ? ROSTER_ANONYMOUS_NAME : s;
}

/**
 * Projeta as redemptions de um lote no roster do professor (RF8).
 * - Dedup por userId (retry de signup nao duplica linha); redemptions
 *   sem userId sao mantidas individualmente (nao ha como agrupar).
 * - Em duplicata, mantem o resgate MAIS ANTIGO (primeira entrada real).
 * - Minimizacao LGPD: email e userId NUNCA aparecem na saida — so nome
 *   de exibicao + timestamp.
 * - Ordena por redeemedAtMs ascendente (ordem de entrada); nulos por ultimo.
 */
export function buildClassroomRoster(redemptions: readonly RedemptionRow[]): ClassroomRoster {
    if (!Array.isArray(redemptions)) {
        return Object.freeze({ entries: [], count: 0 }) as ClassroomRoster;
    }

    const byUser = new Map<string, RosterEntry>();
    const anon: RosterEntry[] = [];

    for (const r of redemptions) {
        const entry: RosterEntry = Object.freeze({
            displayName: _sanitizeName(r?.displayName),
            redeemedAtMs: _toEpochMs(r?.redeemedAt),
        });
        const uid = r?.userId == null ? '' : String(r.userId).trim();
        if (uid === '') {
            anon.push(entry);
            continue;
        }
        const prev = byUser.get(uid);
        if (prev == null) {
            byUser.set(uid, entry);
        } else {
            // Mantem o resgate MAIS ANTIGO (timestamp menor). Quando o
            // anterior nao tem timestamp, ele permanece (ordem de chegada
            // desempata); so substitui se o novo for estritamente mais antigo.
            const prevMs = prev.redeemedAtMs;
            const curMs = entry.redeemedAtMs;
            const replace = prevMs != null && curMs != null && curMs < prevMs;
            if (replace) byUser.set(uid, entry);
        }
    }

    const entries = [...byUser.values(), ...anon].sort((x, y) => {
        const a = x.redeemedAtMs;
        const b = y.redeemedAtMs;
        if (a == null && b == null) return 0;
        if (a == null) return 1; // nulos por ultimo
        if (b == null) return -1;
        return a - b;
    });

    return Object.freeze({ entries, count: entries.length }) as ClassroomRoster;
}
