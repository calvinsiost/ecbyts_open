// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LMS SYNC ADAPTER (runtime) — LMS-INTERACTIVE-ASSESS-001 F7 / B2/B3
   ================================================================
   Sincroniza o estado offline-first do IDB para as tabelas Supabase
   (training_progress / training_certificates / training_audit_log). Best-effort
   e NÃO-bloqueante: se não houver client/usuário (offline ou deslogado), faz
   no-op — o IDB continua sendo a fonte local. Quando logado, o servidor vira o
   registro autoritativo (B2 audit trail) + guarda o payload_hash do certificado
   (B3 verificação).

   Os SHAPES dos rows vêm de core/training/_syncPayloadPure (puro, testado); o
   hash do certificado usa core/crypto/sha256 sobre o payload canônico
   (_certHashPure). Este arquivo é o glue de IO — o client Supabase é resolvido
   por lazy import (utils/auth/session) para não acoplar no load, e é INJETÁVEL
   via `deps` para testes.
   ================================================================ */

import { buildProgressUpsert, buildCertificateRow, buildAuditEntry } from '../../core/training/_syncPayloadPure.js';
import { canonicalizeCertPayload } from '../../core/training/_certHashPure.js';
import { sha256 } from '../../core/crypto/hashChain.js';

export interface SyncDeps {
    /** client Supabase injetado (testes); senão resolve via session. */
    readonly client?: any;
    /** userId injetado (testes); senão resolve via client.auth.getUser(). */
    readonly userId?: string | null;
}

/** Resolve {client,userId}. Lazy import do session p/ não acoplar no load/test. */
async function _resolve(deps: SyncDeps): Promise<{ client: any; userId: string } | null> {
    let client = deps.client;
    if (!client) {
        try {
            const m: any = await import('../auth/session.js' as string);
            client = m.getSupabaseClient?.();
        } catch {
            client = null;
        }
    }
    if (!client) return null; // offline / SDK ausente → IDB é a fonte
    let userId = deps.userId ?? null;
    if (!userId) {
        try {
            const { data } = await client.auth.getUser();
            userId = data?.user?.id ?? null;
        } catch {
            userId = null;
        }
    }
    if (!userId) return null; // deslogado → no-op
    return { client, userId };
}

/** Sincroniza o progresso de uma matrícula (upsert por user_id+training_id). */
export async function syncProgress(enrollment: any, deps: SyncDeps = {}): Promise<boolean> {
    const ctx = await _resolve(deps);
    if (!ctx) return false;
    const row = buildProgressUpsert(ctx.userId, enrollment);
    if (!row) return false;
    try {
        const { error } = await ctx.client.from('training_progress').upsert(row, { onConflict: 'user_id,training_id' });
        if (error) throw error;
        return true;
    } catch (e: any) {
        console.debug('[lmsSync:progress]', e?.message || e);
        return false;
    }
}

/** Registra/atualiza o certificado com o hash do payload canônico (B3). */
export async function syncCertificate(cert: any, deps: SyncDeps = {}): Promise<boolean> {
    const ctx = await _resolve(deps);
    if (!ctx) return false;
    let hash: string;
    try {
        hash = await sha256(canonicalizeCertPayload(cert?.payload ?? cert));
    } catch (e: any) {
        console.debug('[lmsSync:certHash]', e?.message || e);
        return false;
    }
    const row = buildCertificateRow(ctx.userId, cert, hash);
    if (!row) return false;
    try {
        // Append-only por design (sem policy nem GRANT de UPDATE): usar insert()
        // em vez de upsert(), pois ON CONFLICT DO UPDATE exigiria privilégio
        // UPDATE no plano do Postgres mesmo quando o conflito nunca ocorre — o
        // certificate_id já é único por emissão (timestamp embutido), então
        // conflito real não é esperado.
        const { error } = await ctx.client.from('training_certificates').insert(row);
        if (error) throw error;
        return true;
    } catch (e: any) {
        console.debug('[lmsSync:cert]', e?.message || e);
        return false;
    }
}

/** Anexa uma entrada à trilha de auditoria (append-only, B2). */
export async function appendAudit(input: any, deps: SyncDeps = {}): Promise<boolean> {
    const ctx = await _resolve(deps);
    if (!ctx) return false;
    const row = buildAuditEntry(ctx.userId, input);
    if (!row) return false;
    try {
        const { error } = await ctx.client.from('training_audit_log').insert(row);
        if (error) throw error;
        return true;
    } catch (e: any) {
        console.debug('[lmsSync:audit]', e?.message || e);
        return false;
    }
}
