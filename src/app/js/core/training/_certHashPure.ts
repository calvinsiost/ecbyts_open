// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CERT HASH (pure) — LMS-INTERACTIVE-ASSESS-001 F7 / B3
   ================================================================
   Blind-spot #3 (auditoria 2026-06-14): o certificado era "autocontido / emissão
   local" — sem registro central, sem hash, forjável. B3 ancora o certificado por
   um HASH ESTÁVEL do payload canônico (SHA-256 calculado em core/crypto, async);
   o servidor (training_certificates.payload_hash) guarda o hash; a verificação
   recomputa e compara.

   Este módulo é a parte PURA: canonicalização determinística do payload (mesma
   entrada → mesma string, independente da ordem das chaves) + o veredito de
   verificação (comparar hash armazenado vs recomputado). O SHA-256 em si fica no
   adapter (core/crypto/sha256), pois é assíncrono (Web Crypto).

   PURE: sem IO/DOM/THREE. Testável isoladamente.
   ================================================================ */

/**
 * Serialização canônica: JSON com chaves ordenadas recursivamente, para que o
 * hash seja ESTÁVEL independente da ordem de inserção das chaves. NaN/Infinity →
 * null (JSON não os representa); undefined em objeto é omitido; em array vira null.
 */
export function canonicalizeCertPayload(payload: unknown): string {
    return _canon(payload);
}

function _canon(v: unknown): string {
    if (v === null || v === undefined) return 'null';
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v as number) ? String(v) : 'null';
    if (t === 'boolean') return (v as boolean) ? 'true' : 'false';
    if (t === 'bigint') return JSON.stringify((v as bigint).toString());
    if (t === 'string') return JSON.stringify(v);
    if (t === 'function' || t === 'symbol') return 'null';
    if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : _canon(x))).join(',') + ']';
    // objeto: chaves ordenadas, undefined omitido
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + _canon(obj[k])).join(',') + '}';
}

export interface CertVerifyVerdict {
    readonly valid: boolean;
    readonly reason: 'match' | 'hash_mismatch' | 'missing_hash' | 'not_found';
    readonly message: string;
}

/**
 * Veredito da verificação do certificado: compara o hash armazenado no servidor
 * com o recomputado a partir do payload. `stored` ausente → not_found.
 */
export function certVerifyVerdict(
    storedHash: string | null | undefined,
    recomputedHash: string | null | undefined,
    opts: { found?: boolean } = {},
): CertVerifyVerdict {
    if (opts.found === false) {
        return Object.freeze({ valid: false, reason: 'not_found', message: 'Certificado não encontrado no registro.' });
    }
    if (!storedHash || !recomputedHash) {
        return Object.freeze({ valid: false, reason: 'missing_hash', message: 'Hash ausente — não foi possível verificar.' });
    }
    if (_constantTimeEqual(storedHash, recomputedHash)) {
        return Object.freeze({ valid: true, reason: 'match', message: 'Certificado válido — hash confere com o registro.' });
    }
    return Object.freeze({ valid: false, reason: 'hash_mismatch', message: 'Certificado inválido — o conteúdo não confere com o registro (adulterado).' });
}

/** Comparação byte-a-byte sem short-circuit (anti-timing-leak) p/ hashes hex. */
function _constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Campos seguros do certificado expostos na verificação pública (sem PII extra). */
export interface CertPublicView {
    readonly id: string;
    readonly trainingTitle: string;
    readonly score: number | null;
    readonly issuedAt: string;
    readonly valid: boolean;
}

/** Monta a visão pública (não vaza payload completo nem user_id). */
export function buildCertPublicView(
    cert: { id?: string; training_title?: string; score?: number; issued_at?: string } | null,
    verdict: CertVerifyVerdict,
): CertPublicView | null {
    if (!cert || !cert.id) return null;
    return Object.freeze({
        id: cert.id,
        trainingTitle: cert.training_title || '',
        score: Number.isFinite(cert.score) ? (cert.score as number) : null,
        issuedAt: cert.issued_at || '',
        valid: verdict.valid,
    });
}
