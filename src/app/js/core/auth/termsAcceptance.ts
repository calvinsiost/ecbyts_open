// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   TERMS ACCEPTANCE — decisão PURA do aceite de Termos pós-login
   ================================================================
   Contexto (EARLY-ADOPTER-LAUNCH-READINESS#tos-oauth-consent, risco
   G6-A2 do deploy OAuth-only aceito pelo Calvin em 2026-08-06):

   o checkbox de termos e a escrita de `profiles.terms_accepted_at` /
   `profiles.terms_version` viviam SOMENTE no caminho de cadastro por
   email/senha (handlers/auth.ts::handleRegisterEmail), que saiu da UI
   em 2026-08-05. Os handlers OAuth (handleLoginGoogle/GitHub/Microsoft)
   nunca capturaram consentimento nenhum — com OAuth como única via de
   cadastro, o registro de aceite de ToS para usuários novos é 0%.

   Este módulo é a decisão pura (sem DOM, sem rede, sem storage) usada
   por utils/auth/session.ts::enforceTermsGateAfterAuth. Os efeitos
   (leitura do profile, modal, escrita do carimbo, signOut) ficam lá.

   NÃO CONFUNDIR com o consentimento LGPD de telemetria/cookies
   (utils/ui/privacyNotice.ts + utils/auth/consentLedger.ts + EA-56
   `public.consent_ledger`). Aquele é opt-in por FINALIDADE de
   tratamento de dados, é local-first e revogável; este é o aceite do
   contrato (Termos de Uso + Política de Privacidade), vive na conta e
   é pré-condição para a sessão existir.

   REGRA DE OURO: o fato que LIBERA é o carimbo no SERVIDOR
   (`public.profiles`, RLS `auth.uid() = id`). Nada em localStorage /
   sessionStorage / IndexedDB conta como aceite — o registro precisa
   sobreviver a troca de dispositivo e a limpeza de browser, que é
   justamente o que uma prova de consentimento tem que fazer.

   FAIL-OPEN DELIBERADO em `profile-unavailable`: se o perfil não pôde
   ser lido (PostgREST fora, timeout de rede), a decisão é 'allow' com
   rastro (o caller registra logSecurityEvent). Derrubar a sessão por
   falha de infra trancaria TODOS os usuários fora do app — o mesmo
   trade-off já assumido, medido e documentado no gate de convite
   (core/auth/inviteEnforcement.ts, reason 'status-unavailable'). O
   próximo login reavalia. O que NÃO é fail-open: recusa do usuário e
   falha de ESCRITA do carimbo — ambas mantêm a sessão fechada.
   ================================================================ */

/** Versão do contrato (Termos de Uso + Política de Privacidade) exigida. */
export const TERMS_VERSION = '1.0';

export type TermsGateAction = 'allow' | 'require';

export type TermsGateReason =
    /** Sem sessão autenticada — nada a decidir. */
    | 'no-user'
    /** Perfil não pôde ser lido (rede/PostgREST) — indeterminado, fail-open. */
    | 'profile-unavailable'
    /** Carimbo presente e na versão exigida. */
    | 'already-accepted'
    /** Nunca aceitou (conta OAuth nova, ou conta antiga sem carimbo). */
    | 'never-accepted'
    /** Carimbo existe mas o valor não é uma data utilizável. */
    | 'invalid-stamp'
    /** Aceitou uma versão diferente da exigida — precisa reaceitar. */
    | 'version-outdated';

/** Colunas de aceite lidas de `public.profiles`. */
export interface TermsProfileRecord {
    terms_accepted_at?: string | null;
    terms_version?: string | null;
}

export interface TermsGateInput {
    /** Há sessão autenticada? (sem sessão não há nada a decidir) */
    hasUser: boolean;
    /**
     * Linha de `profiles` com as colunas de aceite. `null`/`undefined` =
     * INDETERMINADO (falha de leitura) — diferente de uma linha lida com
     * as colunas vazias, que significa "nunca aceitou".
     */
    profile?: TermsProfileRecord | null;
    /** Versão exigida; default TERMS_VERSION. */
    requiredVersion?: string;
}

export interface TermsGateDecision {
    action: TermsGateAction;
    reason: TermsGateReason;
    /** Versão que o modal deve apresentar e gravar. */
    requiredVersion: string;
}

/**
 * Um carimbo só conta se for uma data real. String vazia, 'null',
 * lixo e datas impossíveis não são prova de nada.
 */
export function isValidAcceptanceStamp(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const raw = value.trim();
    if (!raw) return false;
    const ms = Date.parse(raw);
    return Number.isFinite(ms);
}

function normalizeVersion(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Decide se a sessão recém-autenticada pode ser liberada ou se o modal
 * de aceite precisa aparecer ANTES.
 *
 * - 'allow'   → o caller libera a sessão.
 * - 'require' → o caller NÃO libera a sessão: mostra o modal, grava o
 *   carimbo no aceite e só então libera; recusa ⇒ signOut.
 */
export function decideTermsGate(input: TermsGateInput): TermsGateDecision {
    const requiredVersion = normalizeVersion(input.requiredVersion) || TERMS_VERSION;
    if (!input.hasUser) return { action: 'allow', reason: 'no-user', requiredVersion };

    const profile = input.profile ?? null;
    if (!profile || typeof profile !== 'object') {
        return { action: 'allow', reason: 'profile-unavailable', requiredVersion };
    }

    const stamp = profile.terms_accepted_at;
    if (stamp == null || (typeof stamp === 'string' && !stamp.trim())) {
        return { action: 'require', reason: 'never-accepted', requiredVersion };
    }
    if (!isValidAcceptanceStamp(stamp)) {
        return { action: 'require', reason: 'invalid-stamp', requiredVersion };
    }
    if (normalizeVersion(profile.terms_version) !== requiredVersion) {
        // Carimbo sem versão (linha legada) ou de outra versão: não é prova
        // de aceite DESTE contrato. Um modal a mais, uma vez.
        return { action: 'require', reason: 'version-outdated', requiredVersion };
    }
    return { action: 'allow', reason: 'already-accepted', requiredVersion };
}

/** true quando a decisão obriga o caller a segurar a sessão e mostrar o modal. */
export function mustShowTermsModal(decision: TermsGateDecision | null | undefined): boolean {
    return decision?.action === 'require';
}

/**
 * Patch a gravar em `public.profiles` no aceite. O timestamp é ISO-8601
 * UTC — mesmo formato do caminho email/senha removido, para que a coluna
 * siga homogênea entre carimbos antigos e novos.
 */
export function buildTermsAcceptancePatch(
    now: Date = new Date(),
    version: string = TERMS_VERSION,
): { terms_accepted_at: string; terms_version: string } {
    const stamp = Number.isFinite(now?.getTime?.()) ? now : new Date();
    return {
        terms_accepted_at: stamp.toISOString(),
        terms_version: normalizeVersion(version) || TERMS_VERSION,
    };
}
