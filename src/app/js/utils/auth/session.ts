// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   AUTH SESSION — Supabase Authentication
   Autenticacao via Supabase (email+senha, Google, GitHub, Microsoft)

   Fornece login com email/senha e OAuth via Supabase Auth.
   Supabase cuida da verificacao de email e autenticacao OAuth.

   METODOS:
   - Email + senha (com verificacao de email)
   - Google Sign-In (via OAuth redirect)
   - GitHub Sign-In (via OAuth redirect)
   - Microsoft Sign-In (via OAuth redirect)

   CONFIG:
   Supabase URL + publishable key importados de supabase-config.js
   (arquivo fora do Git, deployado via SSH)
   ================================================================ */
// supabase-js carregado via import() DINÂMICO dentro de initAuth() (não estático no
// topo): import estático de CDN https: quebra o ESM loader do Node (headless/testes) e
// é frágil em prod (CDN-as-module). O import dinâmico só dispara o fetch quando initAuth
// roda no browser (importmap resolve a URL); em headless o módulo carrega sem tocar o CDN.
const SUPABASE_JS_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.100.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../../supabase-config.js';
import { CONFIG } from '../../config.js';
import { EIS_CREDENTIAL_MULTIPLIERS } from '../../core/eis/eisCalculator.js';
import { logSecurityEvent } from '../helpers/securityLogger.js';
import { assertSupabaseOAuthConfigReady, buildOAuthSignInRequest } from './oauthGuard.js';
import type { EcbytsOAuthProvider } from './oauthGuard.js';
/**
 * @typedef {Record<string, any>} SupabaseClientLike
 * @typedef {Record<string, any>} SupabaseUserLike
 * @typedef {Record<string, any> & {
 *   id?: string,
 *   email?: string,
 *   displayName?: string,
 *   provider?: string,
 *   emailVerified?: boolean,
 *   timestamp?: number,
 *   userType?: string,
 *   professionalStatus?: string,
 *   subscriptionStatus?: string,
 *   credentialLevel?: string,
 *   credentialMultiplier?: number,
 *   tier?: string,
 *   activeOrg?: { id: string, name: string, orgRole?: string }
 * }} AuthSession
 */
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {any} */
let supabaseClient: any = null;
/** @type {any} */
let currentSession: any = null; // { id, email, displayName, provider, emailVerified, timestamp, userType, professionalStatus, subscriptionStatus, credentialLevel, credentialMultiplier, tier }
/** @type {any} */
let currentAccessToken: any = null;
let _buildingSession = false; // guard contra chamadas paralelas (onAuthStateChange + initAuth race)
/** @type {string|null} userId ja avaliado pelo gate de convite nesta pagina (evita re-checar em TOKEN_REFRESHED) */
let _inviteGateCheckedFor: any = null;
/** @type {string|null} userId ja avaliado pelo gate de aceite de Termos nesta pagina */
let _termsGateCheckedFor: any = null;
/**
 * TRAVA do gate de Termos: enquanto o modal estiver aberto para este userId, a
 * sessao NAO pode ser liberada. Sem esta trava, o proximo evento do Supabase
 * (TOKEN_REFRESHED/USER_UPDATED) chamaria buildSession de novo e repovoaria
 * currentSession pelas costas do gate — liberando o app sem aceite, que e
 * exatamente o buraco que este item fecha.
 * @type {string|null}
 */
let _termsGateBlockedUserId: any = null;
const AUTH_TIMEOUT_MS = 5000;
const PROFILE_TIMEOUT_MS = 5000;
// Mapeamento de rank numérico (view user_highest_credential) para nome de nível
const CREDENTIAL_RANK_TO_LEVEL = ['common', 'professional', 'pos_graduado', 'mestre', 'doutor'];
/**
 * @param {unknown} error
 * @returns {string}
 */
function _errorMessage(error: any) {
    return error && typeof error === 'object' && 'message' in error
        ? String(/** @type {{ message?: unknown }} */ (error).message)
        : String(error);
}
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize auth: create Supabase client, listen for auth changes.
 * Inicializa autenticacao: cria client Supabase e escuta mudancas.
 */
export async function initAuth() {
    try {
        assertSupabaseOAuthConfigReady(SUPABASE_URL, SUPABASE_KEY);
        // import dinâmico: só busca o supabase-js do CDN quando initAuth roda (browser).
        const { createClient } = await import(SUPABASE_JS_CDN as string);
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { detectSessionInUrl: true },
        });
        // Deduplicate concurrent getSession() calls to prevent BroadcastChannel lock
        // contention. Without this, simultaneous PostgREST queries during UI refresh
        // each try to acquire the auth lock, triggering "Lock not released within 5000ms"
        // warnings and cascading HEAD query failures.
        const _origGetSession = supabaseClient.auth.getSession.bind(supabaseClient.auth);
        /** @type {Promise<any>|null} */
        let _getSessionInFlight: any = null;
        supabaseClient.auth.getSession = () => {
            if (_getSessionInFlight)
                return _getSessionInFlight;
            _getSessionInFlight = _origGetSession().finally(() => {
                _getSessionInFlight = null;
            });
            return _getSessionInFlight;
        };
        // Listen for auth state changes (login, logout, token refresh).
        // buildSession faz query PostgREST que precisa do auth lock.
        // O callback onAuthStateChange roda com o lock retido - defer
        // buildSession e authChanged via setTimeout(0) para evitar deadlock
        // ("Lock was not released within 5000ms").
        supabaseClient.auth.onAuthStateChange(
        (event: any, session: any) => {
            setTimeout(async () => {
                currentAccessToken = session?.access_token || null;
                if (session?.user) {
                    await buildSession(session.user);
                    // INVITE-ONLY: gate aplicado ao callback OAuth (unico caminho
                    // de cadastro desde 2026-08-05). Roda 1x por usuario/pagina.
                    const kept = await _runInviteGateOnce(session.user);
                    // ToS: segundo porteiro — sem aceite de Termos a sessao nao
                    // e liberada (EARLY-ADOPTER-LAUNCH-READINESS#tos-oauth-consent).
                    if (kept) await _runTermsGateOnce(session.user);
                }
                else {
                    currentSession = null;
                    _inviteGateCheckedFor = null;
                    _termsGateCheckedFor = null;
                    _termsGateBlockedUserId = null;
                    import('../../core/metering/quota.js' as string)
                        .then((m) => m.clearMeteringState())
                        .catch((err) => logSecurityEvent('metering', 'warn', 'clearMeteringState failed', {
                        err: _errorMessage(err),
                    }));
                }
                window.dispatchEvent(new CustomEvent('authChanged'));
            }, 0);
        });
        // Check existing session (e.g. after OAuth redirect or page reload)
        // Timeout: não trava o init() se Supabase estiver lento/offline
        const sessionPromise = (supabaseClient.auth.getSession());
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), AUTH_TIMEOUT_MS));
        const result = (await Promise.race([sessionPromise, timeoutPromise]));
        if (result?.__timeout) {
            // Rede lenta: evita warning falso-positivo e aplica sessao quando terminar.
            sessionPromise
                .then(
            async ({ data }: any) => {
                currentAccessToken = data?.session?.access_token || null;
                if (data?.session?.user) {
                    await buildSession(data.session.user);
                    if (await _runInviteGateOnce(data.session.user)) {
                        await _runTermsGateOnce(data.session.user);
                    }
                    window.dispatchEvent(new CustomEvent('authChanged'));
                }
            })
                .catch(
            (e: any) => logSecurityEvent('auth', 'warn', 'delayed session restore failed', { err: _errorMessage(e) }));
        }
        else if (result?.data?.session?.user) {
            currentAccessToken = result.data.session.access_token || null;
            await buildSession(result.data.session.user);
            // INVITE-ONLY: caminho do retorno do OAuth (detectSessionInUrl) —
            // roda ANTES do startup gate, entao a sessao negada cai na parede
            // de convite do welcome screen.
            if (await _runInviteGateOnce(result.data.session.user)) {
                // ToS: mesmo caminho — este e o retorno do redirect OAuth, onde
                // o aceite de Termos precisa ser colhido no PRIMEIRO login.
                await _runTermsGateOnce(result.data.session.user);
            }
            window.dispatchEvent(new CustomEvent('authChanged'));
        }
        else {
            currentAccessToken = null;
        }
    }
    catch (e: any) {
        console.warn('[Auth] Supabase init failed:', _errorMessage(e));
    }
}
// ----------------------------------------------------------------
// LOGIN
// ----------------------------------------------------------------
/**
 * Login with email and password.
 * Faz login com email e senha via Supabase.
 *
 * @param {string} email
 * @param {string} password
 */
export async function loginWithEmail(email: any, password: any) {
    ensureSupabase();
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error)
        throw error;
    return data.user;
}
/**
 * Register new account with email and password.
 * Cria nova conta - Supabase envia email de confirmacao automaticamente.
 *
 * @param {string} email
 * @param {string} password
 */
export async function registerWithEmail(email: any, password: any) {
    ensureSupabase();
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error)
        throw error;
    return data.user;
}
/**
 * Login with Google via OAuth redirect.
 * Redireciona para Google - volta para ecbyts com sessao ativa.
 */
export async function loginGoogle() {
    await loginOAuthProvider('google');
}
/**
 * Login with GitHub via OAuth redirect.
 * Redireciona para GitHub - volta para ecbyts com sessao ativa.
 */
export async function loginGitHub() {
    await loginOAuthProvider('github');
}
/**
 * Login with Microsoft via OAuth redirect.
 * Redireciona para Microsoft - volta para ecbyts com sessao ativa.
 */
export async function loginMicrosoft() {
    await loginOAuthProvider('microsoft');
}
async function loginOAuthProvider(provider: EcbytsOAuthProvider) {
    ensureSupabase();
    const { error } = await supabaseClient.auth.signInWithOAuth(buildOAuthSignInRequest(provider, window.location));
    if (error)
        throw error;
}
/**
 * Send password reset email.
 * Envia email para redefinir senha.
 *
 * @param {string} email
 */
export async function sendPasswordReset(email: any) {
    ensureSupabase();
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
    });
    if (error)
        throw error;
}
// ----------------------------------------------------------------
// LOGOUT
// ----------------------------------------------------------------
/**
 * Logout current user.
 * Encerra a sessao do usuario atual.
 */
export async function logout() {
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
    currentSession = null;
    currentAccessToken = null;
    _termsGateCheckedFor = null;
    _termsGateBlockedUserId = null;
    // Limpar estado do radar (heartbeats, cache)
    import('../../core/radar/manager.js' as string)
        .then((m) => m.clearRadarState())
        .catch((_e) => console.debug('[utils/auth/session:silent-catch]', _errorMessage(_e)));
    window.dispatchEvent(new CustomEvent('authChanged'));
}
// ----------------------------------------------------------------
// SESSION QUERIES
// ----------------------------------------------------------------
/**
 * Get current user session.
 * @returns {AuthSession|null}
 */
export function getCurrentUser() {
    return currentSession ? { ...currentSession } : null;
}
/** Alias for getCurrentUser — used by invite admin modal */
export const getCurrentSession = getCurrentUser;
/**
 * Get the cached Supabase access token for bearer-auth requests.
 * Evita auth.getSession() em hot paths quando so o token e necessario.
 *
 * @returns {string|null}
 */
export function getAccessToken() {
    return currentAccessToken || null;
}
// getSupabaseClient() já exportado mais abaixo (linha ~310) - não duplicar.
// Consumidores (hubStore.fetchAndRegisterSqlPolicies, etc.) importam de lá.
/**
 * TEST-ONLY: directly set the in-memory currentSession object.
 *
 * This bypasses the real Supabase auth flow for E2E specs that need to
 * exercise role-gated UI (admin modal, governance panel) without going
 * through OAuth or the password grant.
 *
 * Production code MUST NOT call this. The function is gated by a runtime
 * check on hostname - only localhost / 127.0.0.1 / *.vercel.app preview
 * deployments accept the override. Production hosts (ecbt.ai, ecbyts.com)
 * silently no-op + console.warn so accidental calls in prod are visible
 * but harmless.
 *
 * @param {Record<string, any>|null|undefined} sessionLike - { id, email, displayName, ... }
 * @returns {boolean} true if applied, false if blocked by env check
 */
export function _setCurrentSessionForTesting(sessionLike: any) {
    try {
        const host = (typeof location !== 'undefined' && location.hostname) || '';
        const isAllowed = host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '0.0.0.0' ||
            host.endsWith('.vercel.app') ||
            host.endsWith('.netlify.app');
        if (!isAllowed) {
            console.warn('[ecbyts:session] _setCurrentSessionForTesting blocked in production host:', host);
            return false;
        }
    }
    catch (e: any) {
        console.debug('[auth/session] hostCheck:', _errorMessage(e));
        /* allow if location is undefined (Node test runner) */
    }
    if (!sessionLike || typeof sessionLike !== 'object') {
        currentSession = null;
        currentAccessToken = null;
        return true;
    }
    currentSession = { ...sessionLike };
    if (typeof sessionLike.accessToken === 'string' && sessionLike.accessToken) {
        currentAccessToken = sessionLike.accessToken;
    }
    else {
        currentAccessToken = null;
    }
    return true;
}
/**
 * Check if user is logged in.
 * @returns {boolean}
 */
export function isLoggedIn() {
    return currentSession !== null;
}
/**
 * Get user email (or null).
 * @returns {string|null}
 */
export function getUserEmail() {
    return currentSession?.email || null;
}
// ----------------------------------------------------------------
// SUPABASE CLIENT ACCESS
// ----------------------------------------------------------------
/**
 * Get Supabase client for use by other modules (cloud save, etc.).
 * Retorna o client Supabase para uso por outros modulos.
 *
 * @returns {Object|null} Supabase client or null if not initialized
 */
export function getSupabaseClient() {
    return supabaseClient;
}
/**
 * Get a Supabase client scoped to the browser-facing api schema.
 * @param {any} client
 * @returns {any}
 */
export function getSupabaseApiClient(client: any = supabaseClient): any {
    return client && typeof client.schema === 'function' ? client.schema('api') : client;
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * Roda o gate de convite no maximo 1x por usuario/pagina.
 * onAuthStateChange dispara varias vezes (SIGNED_IN, TOKEN_REFRESHED,
 * USER_UPDATED); sem essa guarda o gate faria uma RPC por evento.
 *
 * @param {SupabaseUserLike} user - Supabase auth user object
 * @returns {Promise<boolean>} true = sessao mantida; false = sessao encerrada
 */
async function _runInviteGateOnce(user: any) {
    if (!user?.id || _inviteGateCheckedFor === user.id)
        return true;
    _inviteGateCheckedFor = user.id;
    const kept = await enforceInviteGateAfterAuth(user);
    if (!kept)
        _inviteGateCheckedFor = null; // sessao encerrada: proximo login reavalia
    return kept;
}
/**
 * Roda o gate de aceite de Termos no maximo 1x por usuario/pagina.
 * Mesmo motivo do gate de convite: onAuthStateChange dispara varias vezes.
 *
 * @param {SupabaseUserLike} user - Supabase auth user object
 * @returns {Promise<boolean>} true = sessao liberada; false = sessao retida
 */
async function _runTermsGateOnce(user: any) {
    if (!user?.id) return true;
    // Modal ja aberto para este usuario: a sessao segue retida ate a decisao.
    if (_termsGateBlockedUserId === user.id) return false;
    if (_termsGateCheckedFor === user.id) return true;
    _termsGateCheckedFor = user.id;
    const released = await enforceTermsGateAfterAuth(user);
    if (!released) _termsGateCheckedFor = null; // proxima avaliacao refaz
    return released;
}

/**
 * ToS GATE — aceite de Termos exigido em QUALQUER caminho de login, inclusive
 * OAuth (Google/GitHub/Microsoft), que e o unico caminho de cadastro desde a
 * remocao do login email/senha da UI (2026-08-05).
 *
 * O furo (risco G6-A2, aceito pelo Calvin junto com o deploy 2026-08-06): o
 * checkbox de termos e a escrita de profiles.terms_accepted_at/terms_version
 * viviam SO em handlers/auth.ts::handleRegisterEmail. Os handlers OAuth nao
 * capturavam consentimento nenhum — registro de aceite de ToS para usuario
 * novo = 0%.
 *
 * Decisao pura em core/auth/termsAcceptance.ts; aqui ficam os efeitos
 * (leitura do profile, modal, escrita do carimbo, signOut).
 *
 * NAO e o consentimento LGPD de telemetria/cookies (privacyNotice +
 * consentLedger) — aquele e opt-in por finalidade, local-first e revogavel.
 *
 * @param {SupabaseUserLike} user - usuario Supabase recem-autenticado
 * @returns {Promise<boolean>} true = sessao liberada; false = sessao retida
 */
export async function enforceTermsGateAfterAuth(user: any) {
    if (!user?.id) return true;
    try {
        const { decideTermsGate, mustShowTermsModal, buildTermsAcceptancePatch } = await import(
            '../../core/auth/termsAcceptance.js' as string
        );
        const profile = await _fetchTermsProfile(user.id);
        const decision = decideTermsGate({ hasUser: true, profile });
        if (!mustShowTermsModal(decision)) {
            if (decision.reason === 'profile-unavailable') {
                // Fail-open DELIBERADO com RASTRO (ver cabecalho do modulo puro):
                // derrubar a sessao por falha de infra trancaria todo mundo fora
                // do app. O proximo login reavalia.
                logSecurityEvent('auth', 'warn', 'terms gate skipped (profile unavailable)', {
                    userId: user.id,
                });
            }
            return true;
        }
        // Sessao RETIDA a partir daqui: nada de app antes do aceite.
        _termsGateBlockedUserId = user.id;
        currentSession = null;
        logSecurityEvent('auth', 'warn', 'terms acceptance required before session release', {
            userId: user.id,
            provider: user.app_metadata?.provider || 'unknown',
            reason: decision.reason,
        });
        // O modal NAO e aguardado aqui: initAuth roda dentro do boot com
        // timeout (main/boot-preflight.ts::withInitTimeout) e travar o boot
        // esperando um clique humano estouraria esse teto. A sessao fica
        // retida pela trava ate a decisao chegar.
        void _presentTermsGate(user, decision.requiredVersion, buildTermsAcceptancePatch);
        return false;
    }
    catch (e: any) {
        // Falha do proprio gate nao deve derrubar o boot; registra e segue.
        _termsGateBlockedUserId = null;
        logSecurityEvent('auth', 'warn', 'terms gate error', { err: _errorMessage(e) });
        return true;
    }
}

/**
 * Le as colunas de aceite de public.profiles. Uma tentativa + 1 retry:
 * 'nao consegui ler' NAO pode virar 'nunca aceitou' (mostraria o modal a
 * quem ja aceitou) nem o contrario.
 *
 * @param {string} userId
 * @returns {Promise<{terms_accepted_at?: string|null, terms_version?: string|null}|null>} null = indeterminado
 */
async function _fetchTermsProfile(userId: any) {
    if (!supabaseClient) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const query = supabaseClient
                .from('profiles')
                .select('terms_accepted_at, terms_version')
                .eq('id', userId)
                .maybeSingle(); // 406-safe: a linha pode ainda nao existir
            const timeout = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), PROFILE_TIMEOUT_MS));
            const res: any = await Promise.race([query, timeout]);
            if (res?.__timeout) continue;
            if (res?.error) continue;
            // Linha ausente (usuario novo, trigger de profile ainda nao rodou):
            // e um fato LIDO — significa "nunca aceitou", nao indeterminado.
            return res?.data ?? { terms_accepted_at: null, terms_version: null };
        }
        catch (e: any) {
            logSecurityEvent('auth', 'warn', 'terms profile read failed', { err: _errorMessage(e) });
        }
    }
    return null;
}

/**
 * Mostra o modal e resolve o destino da sessao.
 *  • aceite gravado  -> destrava, reconstroi a sessao e dispara authChanged;
 *  • recusa/Escape   -> signOut (fail-closed) + aviso.
 *
 * @param {SupabaseUserLike} user
 * @param {string} version
 * @param {(now?: Date, version?: string) => {terms_accepted_at: string, terms_version: string}} buildPatch
 */
async function _presentTermsGate(user: any, version: any, buildPatch: any) {
    try {
        const { showTermsAcceptanceModal } = await import('../ui/termsAcceptanceModal.js' as string);
        const outcome = await showTermsAcceptanceModal({
            version,
            persist: async (acceptedVersion: string) => _persistTermsAcceptance(user.id, buildPatch(new Date(), acceptedVersion)),
        });
        if (outcome === 'accepted') {
            _termsGateBlockedUserId = null;
            await buildSession(user);
            window.dispatchEvent(new CustomEvent('authChanged'));
            return;
        }
        // Recusou/fechou: sessao NAO liberada. Logout de verdade.
        _termsGateBlockedUserId = null;
        logSecurityEvent('auth', 'warn', 'terms acceptance declined — session ended', { userId: user.id });
        await logout();
        try {
            const [{ showToast }, { t }] = await Promise.all([
                import('../ui/toast.js' as string),
                import('../i18n/translations.js' as string),
            ]);
            showToast(
                t('terms.gateDeclinedToast') ||
                    'You have been signed out: accepting the Terms of Service and Privacy Policy is required to use ecbyts.',
                'error',
            );
        }
        catch (e: any) {
            console.warn('[Auth] terms decline message failed:', _errorMessage(e));
        }
    }
    catch (e: any) {
        // Nao conseguimos nem apresentar o modal: fail-closed, sem sessao.
        _termsGateBlockedUserId = null;
        logSecurityEvent('auth', 'error', 'terms gate presentation failed — signing out', {
            err: _errorMessage(e),
        });
        await logout();
    }
}

/**
 * Grava o carimbo de aceite em public.profiles (RLS: auth.uid() = id).
 * Mesmas colunas do caminho email/senha removido — nenhum ledger paralelo.
 *
 * @param {string} userId
 * @param {{terms_accepted_at: string, terms_version: string}} patch
 * @returns {Promise<boolean>} true SO quando o carimbo chegou ao banco
 */
async function _persistTermsAcceptance(userId: any, patch: any) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .update(patch)
            .eq('id', userId)
            .select('terms_accepted_at')
            .maybeSingle();
        if (error) {
            logSecurityEvent('auth', 'error', 'terms acceptance write failed', {
                userId,
                err: error.message || String(error),
            });
            return false;
        }
        if (data?.terms_accepted_at) return true;
        // `data` nulo = o UPDATE nao alcancou nenhuma linha. Normalmente o
        // trigger on_auth_user_created ja criou o profile, mas se ele falhou o
        // usuario ficaria sem NENHUMA forma de aceitar (trancado fora do app).
        // Upsert pela mesma policy que ja existe ("Users insert own profile",
        // WITH CHECK auth.uid() = id) — nada de tabela nova.
        const { data: seeded, error: seedError } = await supabaseClient
            .from('profiles')
            .upsert({ id: userId, ...patch }, { onConflict: 'id' })
            .select('terms_accepted_at')
            .maybeSingle();
        if (seedError || !seeded?.terms_accepted_at) {
            logSecurityEvent('auth', 'error', 'terms acceptance write matched no profile row', {
                userId,
                err: seedError?.message || 'no row returned',
            });
            return false;
        }
        return true;
    }
    catch (e: any) {
        logSecurityEvent('auth', 'error', 'terms acceptance write error', { err: _errorMessage(e) });
        return false;
    }
}

/**
 * Build currentSession from Supabase user + profile data.
 * Constroi a sessao atual a partir do usuario Supabase e perfil no banco.
 *
 * @param {SupabaseUserLike} user - Supabase auth user object
 */
async function buildSession(user: any) {
    if (_buildingSession)
        return;
    _buildingSession = true;
    try {
        return await _buildSessionInner(user);
    }
    finally {
        _buildingSession = false;
    }
}
/** @param {SupabaseUserLike} user */
async function _buildSessionInner(user: any) {
    // TRAVA do gate de Termos: o Supabase reemite SIGNED_IN/TOKEN_REFRESHED
    // enquanto o modal esta aberto. Sem esta guarda, o rebuild repovoaria
    // currentSession e liberaria o app sem aceite.
    if (_termsGateBlockedUserId && _termsGateBlockedUserId === user?.id) {
        currentSession = null;
        return;
    }
    const provider = user.app_metadata?.provider || 'email';
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';
    currentSession = {
        id: user.id,
        email: user.email,
        displayName,
        provider,
        emailVerified: user.email_confirmed_at != null,
        timestamp: Date.now(),
        userType: 'common',
        professionalStatus: 'none',
        subscriptionStatus: 'inactive',
        credentialLevel: 'common',
        credentialMultiplier: 1.0,
    };
    // Load profile data from public.profiles
    // Timeout: não trava init() se PostgREST estiver lento
    try {
        const profilePromise = supabaseClient
            .from('profiles')
            .select('user_type, professional_status, subscription_status, display_name, tier')
            .eq('id', user.id)
            .maybeSingle(); // 406-safe: row may not exist for new users
        const profileTimeout = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), PROFILE_TIMEOUT_MS));
        const profileResult = (await Promise.race([profilePromise, profileTimeout]));
        /** @param {Record<string, any>|null|undefined} profile */
        const applyProfile = (profile: any) => {
            if (!profile || currentSession?.id !== user.id)
                return;
            currentSession.userType = profile.user_type || 'common';
            currentSession.professionalStatus = profile.professional_status || 'none';
            currentSession.subscriptionStatus = profile.subscription_status || 'inactive';
            currentSession.tier = profile.tier || 'free';
            if (profile.display_name) {
                currentSession.displayName = profile.display_name;
            }
        };
        if (profileResult?.__timeout) {
            // Rede lenta: aplica assim que vier, sem warning.
            profilePromise
                .then(({ data: profile }: any) => {
                applyProfile(profile);
                if (profile)
                    window.dispatchEvent(new CustomEvent('authChanged'));
            })
                .catch(
            (e: any) => logSecurityEvent('auth', 'warn', 'delayed profile load failed', { err: _errorMessage(e) }));
        }
        else {
            applyProfile(profileResult?.data);
        }
    }
    catch (e: any) {
        // Profile may not exist yet (trigger creates it async), or timeout
        console.warn('[Auth] Could not load profile:', _errorMessage(e));
    }
    // Load highest approved academic/professional credential for EIS multiplier
    // Carrega a credencial mais alta aprovada para o multiplicador EIS
    // Timeout: evita travar o init() se a view user_highest_credential estiver lenta
    try {
        const credPromise = supabaseClient
            .from('user_highest_credential')
            .select('credential_rank')
            .eq('user_id', user.id)
            .maybeSingle();
        const credTimeout = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), PROFILE_TIMEOUT_MS));
        const credResult = (await Promise.race([credPromise, credTimeout]));
        if (credResult?.__timeout) {
            currentSession.credentialLevel = 'common';
            currentSession.credentialMultiplier = 1.0;
        }
        else {
            const rank = credResult?.data?.credential_rank ?? 0;
            const level = CREDENTIAL_RANK_TO_LEVEL[rank] || 'common';
            currentSession.credentialLevel = level;
            currentSession.credentialMultiplier = EIS_CREDENTIAL_MULTIPLIERS[level] ?? 1.0;
        }
    }
    catch (_err: any) {
        // View pode não ter resultado para usuarios sem credenciais (normal)
        currentSession.credentialLevel = 'common';
        currentSession.credentialMultiplier = 1.0;
    }
    // Pre-aquece cache de uso freemium (dynamic import evita dependencia circular)
    import('../../core/metering/quota.js' as string)
        .then((m) => m.initMeteringCache())
        .catch((e) => console.warn('[metering] initMeteringCache:', _errorMessage(e)));
    // Auth Fase 4 - Carrega organizacoes do usuario (gated por ENABLE_ORGS)
    if (CONFIG.ENABLE_ORGS) {
        try {
            const { loadUserOrgs, setActiveOrg, acceptInvite } = await import('./organizations.js' as string);
            // Process pending org invite (from ?org_invite=TOKEN)
            const pendingToken = sessionStorage.getItem('ecbyts-pending-org-invite') || '';
            if (pendingToken) {
                sessionStorage.removeItem('ecbyts-pending-org-invite');
                try {
                    const result = (await acceptInvite(pendingToken));
                    import('../../utils/ui/toast.js' as string).then(({ showToast: st }) => st(`${result.orgName ? 'Voce entrou na ' + result.orgName + '!' : 'Convite aceito!'}`, 'success'));
                }
                catch (e: any) {
                    console.warn('[orgs] Failed to accept invite:', _errorMessage(e));
                }
            }
            const orgs = await loadUserOrgs();
            if (orgs.length > 0) {
                const savedOrgId = sessionStorage.getItem('ecbyts-active-org') || '';
                const org = orgs.find((o: any) => o.id === savedOrgId) ?? orgs[0];
                await setActiveOrg(org.id);
                currentSession.activeOrg = { id: org.id, name: org.name, orgRole: org.orgRole };
            }
        }
        catch (e: any) {
            console.warn('[orgs] Failed to load user orgs:', _errorMessage(e));
        }
    }
    // Chaves LLM nao sao restauradas automaticamente no bootstrap.
    // O unlock deve ser explicito para evitar decifrar segredo em toda sessao.
}
/**
 * Refresh profile data from Supabase (after external update).
 * Recarrega dados do perfil do banco (apos mudanca externa).
 */
export async function refreshProfile() {
    if (!currentSession?.id || !supabaseClient)
        return;
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('user_type, professional_status, subscription_status, display_name, tier')
            .eq('id', currentSession.id)
            .maybeSingle(); // 406-safe: row may not exist for new users
        if (profile) {
            currentSession.userType = profile.user_type || 'common';
            currentSession.professionalStatus = profile.professional_status || 'none';
            currentSession.subscriptionStatus = profile.subscription_status || 'inactive';
            currentSession.tier = profile.tier || 'free';
            if (profile.display_name) {
                currentSession.displayName = profile.display_name;
            }
        }
        // Refresh credential level after profile update
        try {
            const { data: credData } = await supabaseClient
                .from('user_highest_credential')
                .select('credential_rank')
                .eq('user_id', currentSession.id)
                .maybeSingle();
            const rank = credData?.credential_rank ?? 0;
            const level = CREDENTIAL_RANK_TO_LEVEL[rank] || 'common';
            currentSession.credentialLevel = level;
            currentSession.credentialMultiplier = EIS_CREDENTIAL_MULTIPLIERS[level] ?? 1.0;
        }
        catch (e: any) {
            logSecurityEvent('auth', 'warn', 'credential load skipped', { err: _errorMessage(e) });
        }
        window.dispatchEvent(new CustomEvent('authChanged'));
    }
    catch (e: any) {
        console.warn('[Auth] Could not refresh profile:', _errorMessage(e));
    }
}
/**
 * Ensure Supabase client is initialized. Throws if not.
 * Garante que Supabase esta inicializado.
 */
function ensureSupabase() {
    assertSupabaseOAuthConfigReady(SUPABASE_URL, SUPABASE_KEY);
    if (!supabaseClient) {
        throw new Error('Supabase not initialized. Check supabase-config.js.');
    }
}
// ----------------------------------------------------------------
// INVITE-ONLY - Validacao e claim de codigos de convite
// ----------------------------------------------------------------
/** Alfabeto base32 sem caracteres ambiguos (0, 1, O, I) */
const _INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ234567';
/**
 * Generate a random 8-char base32 invite code.
 * Gera codigo de convite legivel sem 0/1/O/I.
 * @returns {string} e.g. "ABCD2EFG"
 */
function _generateBase32Code() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += (_INVITE_ALPHABET as Record<number,any>)[bytes[i]! % _INVITE_ALPHABET.length];
    }
    return code;
}
/**
 * Validate an invite code against Supabase.
 * Verifica se o codigo existe, nao expirou e nao esgotou usos.
 * @param {string} code - 8-char code (case-insensitive)
 * @returns {Promise<{valid: boolean, tier?: string, error?: string}>}
 */
export async function validateInviteCode(code: any) {
    ensureSupabase();
    const normalized = (code || '').replace(/[-\s]/g, '').toUpperCase().slice(0, 8);
    if (normalized.length !== 8)
        return { valid: false, error: 'invalid' };
    try {
        const { data, error } = await getSupabaseApiClient().rpc('validate_platform_invite', {
            p_code: normalized,
        });
        if (error || !data)
            return { valid: false, error: 'invalid' };
        const result = Array.isArray(data) ? data[0] : data;
        return {
            valid: result?.valid === true,
            tier: result?.tier,
            error: result?.error,
        };
    }
    catch (e: any) {
        console.error('[Auth] validateInviteCode error:', _errorMessage(e));
        return { valid: false, error: 'network' };
    }
}
/**
 * Claim an invite code after successful signup.
 * Atomico: use_count incrementa apenas se < max_uses.
 * @param {string} code - 8-char code
 * @param {string} userId - auth.users.id do novo usuario
 * @returns {Promise<boolean>} true se claim bem-sucedido
 */
export async function claimInviteCode(code: any, userId: any) {
    ensureSupabase();
    const normalized = (code || '').replace(/[-\s]/g, '').toUpperCase().slice(0, 8);
    try {
        // Atomico: WHERE use_count < max_uses garante que claim concorrente nao excede
        const { data, error } = await getSupabaseApiClient().rpc('claim_invite', {
            p_code: normalized,
            p_user_id: userId,
        });
        if (error)
            return false;
        return !!data;
    }
    catch (e: any) {
        console.error('[Auth] claimInviteCode error:', _errorMessage(e));
        return false;
    }
}
/**
 * Server-truth do gate de convite via api.invite_gate_status()
 * (migration 20260806120000).
 *
 * A RPC deriva TUDO de auth.uid() e nao aceita parametro de usuario, logo o
 * cliente nao pode forjar "ja reivindicado"/"sou admin"/"sou conta antiga".
 *
 * Por que NAO ler api.platform_invites.claimed_by direto (tentativa anterior):
 * api.claim_invite grava `claimed_by = coalesce(claimed_by, p_user_id)`, entao
 * em convite multi-uso (max_uses > 1, ex. convite de sala) apenas o PRIMEIRO
 * reivindicante aparece em claimed_by. Filtrar por claimed_by expulsaria o 2o
 * aluno legitimo. A autoridade e identity.invite_redemptions, que a RLS nao
 * expoe ao cliente — dai a RPC SECURITY DEFINER.
 *
 * @returns {Promise<any|null>} status bruto, ou null se indeterminado (rede/RPC ausente)
 */
export async function fetchInviteGateStatus() {
    if (!supabaseClient) return null;
    try {
        const { data, error } = await getSupabaseApiClient().rpc('invite_gate_status');
        if (error) {
            console.warn('[Auth] invite_gate_status error:', error.message || error);
            return null;
        }
        return data ?? null;
    }
    catch (e: any) {
        console.warn('[Auth] invite_gate_status error:', _errorMessage(e));
        return null;
    }
}
/**
 * INVITE-ONLY — gate de convite aplicado a QUALQUER caminho de login,
 * inclusive OAuth (Google/GitHub/Microsoft), que e o unico caminho de
 * cadastro desde a remocao do login email/senha da UI (2026-08-05).
 *
 * Antes deste gate, o claim do convite so acontecia em
 * handlers/auth.ts::_processInviteAfterSignup (caminho email). Entrar por
 * OAuth nao consumia convite: use_count nunca subia, claimed_by ficava NULL
 * e um unico codigo vazado dava acesso ilimitado ao beta fechado.
 *
 * Decisao pura em core/auth/inviteEnforcement.ts; aqui ficam os efeitos
 * (RPC de claim, signOut, mensagem). Os fatos que LIBERAM vem do servidor
 * (api.invite_gate_status); o unico input local e o codigo pendente, que so
 * serve para TENTAR um claim validado pelo servidor.
 *
 * @param {SupabaseUserLike} user - usuario Supabase recem-autenticado
 * @returns {Promise<boolean>} true = sessao mantida; false = sessao encerrada
 */
export async function enforceInviteGateAfterAuth(user: any) {
    const features: any = CONFIG.FEATURES;
    if (!features?.INVITE_ONLY || !user?.id) return true;
    try {
        const { decideInviteEnforcement, parseGateStatus, resolveClaimOutcome, mustSignOut } = await import('../../core/auth/inviteEnforcement.js' as string);
        const host = (typeof location !== 'undefined' && location.hostname) || '';
        const isLocalhost = host === 'localhost' || host === '127.0.0.1';
        // Mesma convencao dos outros gates (startup-gates, welcomeScreen,
        // inviteGate): window OU localStorage OU sessionStorage, so em localhost.
        const localhostBypass = isLocalhost &&
            ((typeof window !== 'undefined' && (window as any).__e2e_bypass_invite__ === true) ||
                (typeof localStorage !== 'undefined' && localStorage.getItem('__e2e_bypass_invite__') === '1') ||
                (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('__e2e_bypass_invite__') === '1'));
        const storedCode = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ecbyts-invite-code')) ||
            (typeof localStorage !== 'undefined' && localStorage.getItem('ecbyts-pending-invite')) ||
            null;
        const serverStatus = parseGateStatus(await fetchInviteGateStatus());
        if (!serverStatus) {
            // Indeterminado (rede/PostgREST fora, ou RPC ainda nao deployada):
            // nao expulsa ninguem com base em falha de infra — o gate de boot
            // (startup-gates) segue exigindo sessao e o proximo login reavalia.
            logSecurityEvent('auth', 'warn', 'invite gate skipped (status unavailable)', { userId: user.id });
        }
        let decision = decideInviteEnforcement({
            inviteOnly: true,
            hasUser: true,
            serverStatus,
            storedCode,
            localhostBypass,
        });
        if (decision.action === 'claim' && decision.code) {
            const ok = await claimInviteCode(decision.code, user.id);
            if (ok) {
                try {
                    sessionStorage.removeItem('ecbyts-invite-code');
                    localStorage.removeItem('ecbyts-pending-invite');
                }
                catch (e: any) {
                    console.debug('[auth/session] invite storage cleanup:', _errorMessage(e));
                }
                // Paridade com o fluxo antigo de email: novo usuario recebe 3 convites.
                generateUserInvites(user.id).catch((e: any) => console.debug('[auth/session] generateUserInvites:', _errorMessage(e)));
            }
            decision = resolveClaimOutcome(ok);
        }
        if (!mustSignOut(decision)) return true;
        logSecurityEvent('auth', 'warn', 'invite gate denied session', {
            userId: user.id,
            provider: user.app_metadata?.provider || 'unknown',
            reason: decision.reason,
        });
        await logout();
        try {
            const [{ showToast }, { t }] = await Promise.all([
                import('../ui/toast.js' as string),
                import('../i18n/translations.js' as string),
            ]);
            showToast(t('invite.requiredToRegister') ||
                'ecbyts is in closed beta: access is by invite only. Enter a valid invite code to continue.', 'error');
        }
        catch (e: any) {
            console.warn('[Auth] invite gate message failed:', _errorMessage(e));
        }
        return false;
    }
    catch (e: any) {
        // Falha do proprio gate nao deve derrubar o boot; registra e segue.
        logSecurityEvent('auth', 'warn', 'invite gate error', { err: _errorMessage(e) });
        return true;
    }
}
/**
 * Generate 3 invite codes for a newly registered user.
 * Pula se usuario ja tem >= 3 convites.
 * @param {string} userId - auth.users.id
 * @returns {Promise<string[]>} Array de codigos gerados
 */
export async function generateUserInvites(userId: any) {
    ensureSupabase();
    try {
        const api = getSupabaseApiClient();
        // Verificar se ja tem convites
        const { count } = await api
            .from('platform_invites')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', userId);
        if (count >= 3)
            return [];
        const codes = [];
        const toGenerate = 3 - (count || 0);
        for (let i = 0; i < toGenerate; i++) {
            const { data, error } = await api.rpc('create_platform_invite', {
                p_tier: 'early_adopter',
                p_source: 'chain',
                p_note: null,
            });
            if (!error && data?.code) {
                codes.push(String(data.code).trim());
            }
        }
        return codes;
    }
    catch (e: any) {
        console.error('[Auth] generateUserInvites error:', _errorMessage(e));
        return [];
    }
}
/**
 * Fetch invite codes owned by the current user.
 * Retorna convites criados pelo usuario autenticado.
 * @returns {Promise<Array<{code, tier, use_count, max_uses, expires_at, claimed_by}>>}
 */
export async function getUserInvites() {
    ensureSupabase();
    const user = await getCurrentUser();
    if (!user)
        return [];
    try {
        const { data, error } = await getSupabaseApiClient()
            .from('platform_invites')
            .select('code, tier, use_count, max_uses, expires_at, claimed_by, created_at')
            .eq('created_by', user.id)
            .order('created_at', { ascending: false });
        return error ? [] : data || [];
    }
    catch (e: any) {
        console.error('[Auth] getUserInvites error:', _errorMessage(e));
        return [];
    }
}
/**
 * Submit waitlist registration (anon, no auth required).
 * Insere na tabela waitlist via anon RLS.
 * @param {{name: string, email: string, company?: string, reason?: string}} data
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function submitWaitlist(data: any) {
    ensureSupabase();
    try {
        const { error } = await supabaseClient.from('waitlist').insert({
            name: (data.name || '').trim(),
            email: (data.email || '').trim().toLowerCase(),
            company: (data.company || '').trim() || null,
            reason: (data.reason || '').trim() || null,
            source: 'website',
        });
        if (error) {
            if (error.code === '23505')
                return { success: false, error: 'duplicate' };
            return { success: false, error: 'server' };
        }
        return { success: true };
    }
    catch (e: any) {
        console.error('[Auth] submitWaitlist error:', _errorMessage(e));
        return { success: false, error: 'network' };
    }
}
