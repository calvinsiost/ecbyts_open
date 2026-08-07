// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Security Event Logger - ecbyts
 *
 * Logging padronizado para eventos de seguranca.
 * Strip automatico de campos sensiveis (passwords, tokens, keys).
 *
 * @module utils/helpers/securityLogger
 */

type SecurityCategory = 'auth' | 'crypto' | 'storage' | 'metering' | 'sandbox';
type SecuritySeverity = 'warn' | 'error';

// Fragmentos sensiveis — match por INCLUSAO e CASE-INSENSITIVE (audit 0045 — a
// blacklist anterior era exata/case-sensitive, deixando vazar variacoes como
// 'pwd', 'auth_token', 'credential', 'apikey', 'Password' ou 'userPassword').
// Tudo em minusculo: a comparacao lowercaseia a chave antes de testar inclusao.
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
    'pwd',
    'password',
    'secret',
    'token', // cobre token, accessToken, refreshToken, sessionToken, auth_token
    'auth_token',
    'credential',
    'apikey',
    'api_key',
    'authorization',
    'cookie',
    'privatekey',
    'enc_key',
    'jwt',
    'bearer',
    'auth',
];

/**
 * Decide se uma chave deve ser mascarada: lowercaseia e testa inclusao de
 * qualquer fragmento sensivel (case-insensitive, substring match).
 *
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase();
    return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Sanitiza recursivamente um valor, mascarando qualquer chave sensivel em
 * QUALQUER nivel de aninhamento (audit 0045 — a versao anterior so mascarava o
 * nivel 1, vazando ex. { user: { password: '...' } }). Cobre objetos e arrays,
 * com guarda de profundidade e protecao contra referencia circular.
 *
 * @param {unknown} value
 * @param {number} [depth=0]
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
function sanitizeDeep(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
    if (depth > 6) return '[truncated]';
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value as object)) return '[circular]';
    seen.add(value as object);

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeDeep(item, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    // try/catch: protege contra protótipos malformados (ex. Object.create(null)
    // com getters que lançam, ou Proxy hostil) — o logger NUNCA deve derrubar o
    // fluxo principal nem mascarar o evento de segurança original (audit 0045).
    try {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = isSensitiveKey(k) ? '***' : sanitizeDeep(v, depth + 1, seen);
        }
    } catch {
        return '[unserializable]';
    }
    return out;
}

/**
 * Loga evento de seguranca com sanitizacao automatica de dados sensiveis.
 *
 * @param {SecurityCategory} category
 * @param {SecuritySeverity} severity
 * @param {string} message - Descricao do evento (sem dados sensiveis)
 * @param {Record<string, unknown>} [context={}] - Contexto adicional (campos sensiveis mascarados)
 */
export function logSecurityEvent(
    category: SecurityCategory,
    severity: SecuritySeverity,
    message: string,
    context: Record<string, unknown> = {},
): void {
    // Sanitizacao RECURSIVA: mascara chaves sensiveis em qualquer profundidade.
    const safeContext = sanitizeDeep(context) as Record<string, unknown>;

    const prefix = `[ecbyts:security:${category}]`;
    const fn = severity === 'error' ? console.error : console.warn;

    if (Object.keys(safeContext).length > 0) {
        fn(prefix, message, safeContext);
    } else {
        fn(prefix, message);
    }
}