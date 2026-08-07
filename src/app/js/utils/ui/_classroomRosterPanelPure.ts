// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CLASSROOM ROSTER PANEL — PURE VIEW-MODEL (RF8, INVITE-BATCH-001)

   Projeta o roster do professor (buildClassroomRoster) + o estado do
   lote (resolveBatchState) num view-model pronto para renderizar:
   entradas com status, contadores (aceitos/pendentes) e badge de
   estado como pares {i18nKey, fallback} — o caller resolve t(key)
   com fallback. Determinístico (clock injetado), zero DOM/rede.

   Minimização LGPD herdada da projeção: email/userId nunca chegam
   aqui (buildClassroomRoster já os descarta).
   ================================================================ */

import {
    buildClassroomRoster,
    resolveBatchState,
    remainingUses,
    formatBatchCodeDisplay,
} from '../../core/freemium/_inviteBatchPure.js';
import type { BatchInviteRow, BatchInviteState, RedemptionRow } from '../../core/freemium/_inviteBatchPure.js';

export interface I18nPair {
    i18nKey: string;
    fallback: string;
}

export type RosterEntryStatus = 'accepted';

export interface RosterEntryVM {
    displayName: string;
    /** Epoch ms do resgate ou null (caller formata no locale corrente). */
    redeemedAtMs: number | null;
    status: RosterEntryStatus;
    statusLabel: I18nPair;
}

export interface RosterCountersVM {
    /** Alunos distintos que entraram pelo código. */
    accepted: number;
    /** Vagas ainda abertas (0 quando lote não está ativo ou é desconhecido). */
    pending: number;
    /** Capacidade total do lote (maxUses) ou null se desconhecida. */
    capacity: number | null;
}

export interface ClassroomRosterVM {
    /** Código formatado para exibição ("TURM-AB23"). */
    codeDisplay: string;
    state: BatchInviteState;
    stateLabel: I18nPair;
    counters: RosterCountersVM;
    entries: RosterEntryVM[];
    /** true quando ninguém entrou ainda. */
    empty: boolean;
}

const _STATE_LABEL: Record<BatchInviteState, I18nPair> = Object.freeze({
    active: Object.freeze({ i18nKey: 'invite.codeAvailable', fallback: 'Available' }),
    exhausted: Object.freeze({ i18nKey: 'invite.codeUsed', fallback: 'Used' }),
    expired: Object.freeze({ i18nKey: 'invite.codeExpired', fallback: 'Expired' }),
    revoked: Object.freeze({ i18nKey: 'invite.rosterStatusRevoked', fallback: 'Cancelled' }),
});

const _ENTRY_ACCEPTED_LABEL: I18nPair = Object.freeze({
    i18nKey: 'invite.rosterStatusAccepted',
    fallback: 'Joined',
});

function _toFiniteInt(value: unknown): number | null {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    return Math.trunc(n);
}

/**
 * Monta o view-model do painel do professor (RF8).
 *
 * @param code        Código do lote (qualquer formato aceito pelo normalize).
 * @param batch       Linha do lote (useCount/maxUses/expiresAt/revokedAt) ou
 *                    null quando os metadados não estão disponíveis
 *                    (degradação graciosa: contadores viram desconhecidos).
 * @param redemptions Redemptions cruas do seam (dedup/minimização na pure).
 * @param nowMs       Clock injetável (testes deterministas).
 */
export function buildClassroomRosterVM(
    code: unknown,
    batch: BatchInviteRow | null,
    redemptions: readonly RedemptionRow[],
    nowMs: number = Date.now(),
): ClassroomRosterVM {
    const roster = buildClassroomRoster(redemptions);

    const state: BatchInviteState = batch == null ? 'active' : resolveBatchState(batch, nowMs);
    const capacity = batch == null ? null : _toFiniteInt(batch.maxUses);
    // Pendentes = vagas restantes, mas só enquanto o lote está ATIVO —
    // lote expirado/revogado/esgotado não tem vaga "pendente" de verdade.
    const pending = batch != null && state === 'active' ? remainingUses(batch) : 0;

    const entries: RosterEntryVM[] = roster.entries.map((e) =>
        Object.freeze({
            displayName: e.displayName,
            redeemedAtMs: e.redeemedAtMs,
            status: 'accepted' as const,
            statusLabel: _ENTRY_ACCEPTED_LABEL,
        }),
    );

    return Object.freeze({
        codeDisplay: formatBatchCodeDisplay(code),
        state,
        stateLabel: _STATE_LABEL[state],
        counters: Object.freeze({ accepted: roster.count, pending, capacity }),
        entries,
        empty: entries.length === 0,
    });
}

/**
 * Mapeia linhas cruas vindas do seam supabase (snake_case) para o shape
 * RedemptionRow da pure. Entrada não-array → [] (degradação graciosa).
 */
export function mapSeamRowsToRedemptions(rows: unknown): RedemptionRow[] {
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => ({
        userId: r?.user_id ?? r?.userId,
        displayName: r?.display_name ?? r?.displayName,
        redeemedAt: r?.redeemed_at ?? r?.redeemedAt,
    }));
}
