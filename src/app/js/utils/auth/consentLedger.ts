// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CONSENT LEDGER — pure-logic consent record schema + LGPD field-map
   enforcement. No DOM, no network: all browser-side persistence and
   the future Supabase sync live in callers / the documented stub.

   Why a dedicated module: the legal MVP (SPEC COMPLIANCE-LEGAL-001)
   needs a consent record that (a) is provable (timestamp + version +
   policyHash) and (b) is SHAPED so a future job can POST it verbatim
   to a `consent_ledger` Supabase table. Keeping the shape here (and
   testable) decouples the UI from the persistence layer.

   Portugues (leigo): este modulo cria o "comprovante" de que o
   usuario aceitou os Termos/Privacidade/Cookies, com data, versao do
   texto legal e um "selo" (hash) do conteudo. Tambem marca quais
   campos sao dados pessoais (LGPD) para nao vazarem por engano.
   ================================================================ */

/**
 * Versao corrente das politicas legais. Bumpar quando o texto de
 * Termos/Privacidade mudar materialmente: forca re-aceite no proximo
 * boot (apenas novos consentimentos — nunca retroativo silencioso).
 */
export const POLICY_VERSION = '1.0.0';

/** Categorias de consentimento que o ledger rastreia. */
export const CONSENT_SCOPES = Object.freeze(['terms', 'privacy', 'cookies_essential', 'cookies_preferences']);

/**
 * Categorias OPCIONAIS de consentimento (independentes do consentimento
 * legal obrigatório). Opt-in explícito: default SEMPRE OFF, nunca
 * pré-marcado (LGPD Art. 8 §4 / CDC — sem dark pattern), revogável a
 * qualquer momento (SPEC_HUMAN_USAGE_CAPTURE_OPT_IN F1).
 *
 * - improve_product: "Ajude a melhorar o produto" — captura anônima da
 *   FORMA da interação (nunca conteúdo digitado, nunca PII).
 */
export const OPTIONAL_CONSENT_SCOPES = Object.freeze(['improve_product']);

/**
 * Mapa LGPD de campos PII (Lei 13.709/2018). Cada entrada declara o
 * grau de sensibilidade e a base legal predominante. Usado pelo
 * enforcement helper para bloquear export/log de PII bruto.
 *
 * Portugues: lista de campos que sao "dado pessoal". Nada aqui pode
 * ir para log, telemetria ou export sem mascaramento.
 */
export const LGPD_FIELD_MAP = Object.freeze({
    email: { sensitivity: 'pii', legalBasis: 'contract' },
    full_name: { sensitivity: 'pii', legalBasis: 'contract' },
    name: { sensitivity: 'pii', legalBasis: 'contract' },
    phone: { sensitivity: 'pii', legalBasis: 'consent' },
    cpf: { sensitivity: 'sensitive', legalBasis: 'legal_obligation' },
    cnpj: { sensitivity: 'pii', legalBasis: 'contract' },
    address: { sensitivity: 'pii', legalBasis: 'consent' },
    geolocation: { sensitivity: 'sensitive', legalBasis: 'consent' },
    ip_address: { sensitivity: 'pii', legalBasis: 'legitimate_interest' },
    health_data: { sensitivity: 'sensitive', legalBasis: 'consent' },
    worker_id: { sensitivity: 'pii', legalBasis: 'contract' },
});

/**
 * Hash determinístico curto (djb2 → base36) de um texto de política.
 * Não é criptográfico — serve apenas para detectar mudança de versão
 * sem armazenar o texto inteiro no comprovante.
 *
 * @param {string} text Conteudo concatenado das politicas legais.
 * @returns {string} hash hex-ish curto e estavel.
 */
export function policyHash(text: any) {
    const s = typeof text === 'string' ? text : String(text ?? '');
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * Cria o registro canônico de consentimento. ESTE é o shape que a
 * migration `consent_ledger` (claude-adm) deve espelhar 1:1 — ver
 * docstring de `CONSENT_LEDGER_SCHEMA` abaixo.
 *
 * @param {{
 *   scopes: Record<string, boolean>,
 *   policyText: string,
 *   userId?: string | null,
 *   version?: string,
 *   now?: () => Date,
 * }} input
 * @returns {{
 *   schema_version: number,
 *   user_id: string | null,
 *   policy_version: string,
 *   policy_hash: string,
 *   scopes: Record<string, boolean>,
 *   accepted_at: string,
 *   synced: boolean,
 * }}
 */
export function buildConsentRecord(input: any) {
    if (!input || typeof input !== 'object') {
        throw new TypeError('buildConsentRecord: input object required');
    }
    const { scopes, policyText } = input;
    if (!scopes || typeof scopes !== 'object') {
        throw new TypeError('buildConsentRecord: scopes map required');
    }
    const clock = typeof input.now === 'function' ? input.now : () => new Date();
    /** @type {Record<string, boolean>} */
    const cleanScopes: Record<string, boolean> = {};
    for (const scope of [...CONSENT_SCOPES, ...OPTIONAL_CONSENT_SCOPES]) {
        // Opt-in estrito: só true EXPLÍCITO liga; ausência/qualquer outro
        // valor = false → escopos opcionais nascem SEMPRE OFF (default OFF).
        cleanScopes[scope] = scopes[scope] === true;
    }
    return {
        schema_version: 1,
        user_id: input.userId ?? null,
        policy_version: input.version || POLICY_VERSION,
        policy_hash: policyHash(policyText || ''),
        scopes: cleanScopes,
        accepted_at: clock().toISOString(),
        synced: false,
    };
}

/**
 * Decide se um consentimento previamente salvo ainda é válido para a
 * versão/política correntes. Re-aceite somente quando a versão OU o
 * hash divergem (texto mudou materialmente).
 *
 * @param {any} record Registro salvo (pode ser null).
 * @param {string} currentPolicyText Texto legal corrente.
 * @param {string} [currentVersion]
 * @returns {boolean} true = ainda válido; false = precisa re-aceite.
 */
export function isConsentValid(record: any, currentPolicyText: any, currentVersion = POLICY_VERSION) {
    if (!record || typeof record !== 'object') return false;
    if (record.policy_version !== currentVersion) return false;
    if (record.policy_hash !== policyHash(currentPolicyText || '')) return false;
    return record.scopes && record.scopes.terms === true && record.scopes.privacy === true;
}

/**
 * Lê o opt-in "Ajude a melhorar o produto" de um registro salvo.
 * Opt-in estrito: qualquer coisa diferente de `true` explícito = OFF
 * (registro ausente, legado sem o escopo, valor truthy não-booleano).
 *
 * @param {any} record Registro salvo (pode ser null / legado).
 * @returns {boolean} true somente com opt-in explícito.
 */
export function hasImproveProductConsent(record: any) {
    return !!(record && typeof record === 'object' && record.scopes && record.scopes.improve_product === true);
}

/**
 * Constrói o NOVO registro de consentimento ao ligar/desligar o opt-in
 * `improve_product`, preservando os demais escopos do registro anterior.
 * Ledger é append-only: revogar NÃO apaga histórico — gera um novo
 * registro com `improve_product: false` (a trilha anterior permanece).
 *
 * @param {any} prevRecord Registro atual (pode ser null — 1º opt-in).
 * @param {boolean} enabled Novo estado do opt-in.
 * @param {{ policyText: string, userId?: string | null, version?: string, now?: () => Date }} opts
 * @returns {ReturnType<typeof buildConsentRecord>} novo registro (append).
 */
export function applyImproveProductConsent(prevRecord: any, enabled: any, opts: any) {
    if (!opts || typeof opts !== 'object' || typeof opts.policyText !== 'string') {
        throw new TypeError('applyImproveProductConsent: opts.policyText required');
    }
    const prevScopes = prevRecord && typeof prevRecord === 'object' && prevRecord.scopes ? prevRecord.scopes : {};
    return buildConsentRecord({
        scopes: { ...prevScopes, improve_product: enabled === true },
        policyText: opts.policyText,
        userId: opts.userId ?? (prevRecord && typeof prevRecord === 'object' ? prevRecord.user_id : null) ?? null,
        version: opts.version,
        now: opts.now,
    });
}

/**
 * Verifica se um nome de campo é PII segundo o mapa LGPD.
 * @param {string} field
 * @returns {boolean}
 */
export function isPiiField(field: any) {
    return Object.prototype.hasOwnProperty.call(LGPD_FIELD_MAP, String(field));
}

/**
 * LGPD field-map enforcement: produz uma cópia rasa do objeto com
 * todos os campos PII mascarados, para uso seguro em logs/telemetria/
 * export não-autorizado. Não muta a entrada.
 *
 * Portugues: devolve o objeto "censurado" — campos pessoais viram
 * "[REDACTED]" para nunca vazarem em log/telemetria.
 *
 * @template {Record<string, any>} T
 * @param {T} obj
 * @param {{ mask?: string }} [opts]
 * @returns {Record<string, any>}
 */
export function enforceLgpdFieldMap(obj: any, opts: any = {}) {
    const mask = opts.mask || '[REDACTED]';
    if (!obj || typeof obj !== 'object') return {};
    /** @type {Record<string, any>} */
    const out: any = Array.isArray(obj) ? [] : {};
    for (const key of Object.keys(obj)) {
        out[key] = isPiiField(key) ? mask : obj[key];
    }
    return out;
}

/**
 * SCHEMA CONTRACT for claude-adm's `consent_ledger` migration.
 * (Documentation only — this module writes NO SQL and makes NO
 * Supabase call. The future sync stub below must POST exactly this.)
 *
 * Table `public.consent_ledger`:
 *   id            uuid PK default gen_random_uuid()
 *   user_id       uuid NULL references auth.users(id)  -- NULL = anon
 *   schema_version int  NOT NULL  -- == record.schema_version (1)
 *   policy_version text NOT NULL  -- == record.policy_version
 *   policy_hash    text NOT NULL  -- == record.policy_hash
 *   scopes         jsonb NOT NULL -- == record.scopes
 *   accepted_at    timestamptz NOT NULL -- == record.accepted_at
 *   created_at     timestamptz NOT NULL default now()
 * RLS: INSERT-only for the owning user; SELECT own rows; no UPDATE/
 *   DELETE (append-only audit, like the governance G1 trail).
 */
export const CONSENT_LEDGER_SCHEMA = Object.freeze({
    table: 'consent_ledger',
    appendOnly: true,
    columns: ['id', 'user_id', 'schema_version', 'policy_version', 'policy_hash', 'scopes', 'accepted_at', 'created_at'],
});

/**
 * SYNC STUB — documented placeholder. Intentionally does NOT call
 * Supabase (out of scope: claude-adm owns the migration + edge).
 * A future job will: read the unsynced local record, POST it to the
 * `consent_ledger` table, then set `synced: true` locally.
 *
 * @param {ReturnType<typeof buildConsentRecord>} _record
 * @returns {Promise<{ deferred: true, reason: string }>}
 */
export async function syncConsentRecord(_record: any) {
    // No-op by design. See CONSENT_LEDGER_SCHEMA. When the migration
    // lands, replace this body with a single authenticated POST.
    return {
        deferred: true,
        reason: 'consent_ledger migration not yet applied (claude-adm scope) — record kept local',
    };
}
