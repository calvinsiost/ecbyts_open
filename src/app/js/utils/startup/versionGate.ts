// @ts-check
// Generated from src/app/js/utils/startup/versionGate.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   VERSION GATE — Deploy freshness detection + cache bust

   Lê meta tags injetadas em index.html (não fetch de JSON separado):

       <meta name="ecbyts-version"    content="0.2.1">
       <meta name="ecbyts-build-hash" content="<git sha>">

   Por que meta tags em vez de /version.json?
   - HTML é o único arquivo que o browser SEMPRE revalida como entry point
   - Bluehost (early adopter test env) tem LiteSpeed cache agressivo
     (max-age=604800, 1 semana) que ignora .htaccess para arquivos
     estáticos — mas HTML sempre passa
   - /version.json fetch pode ser cacheado por CDN/ISP invisível

   Fluxo:
   1. Lê hash atual das meta tags
   2. Compara com hash armazenado em localStorage
   3. Se diferente → limpa UI state (preserva auth/idioma/preferências
      críticas) → reload preservando query string
   4. Guardrail anti-loop: máx 2 tentativas por sessão

   Relacionado a:
   - docs/specs/_archived/SPEC_FORCE_UPDATE_STRATEGY.md (decisão B2)
   - .github/workflows/auto-version-bump.yml (injeção dos meta tags)
   - CLAUDE.md § Cache & Init Architecture
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
const log = createLogger('VersionGate');
/**
 * Chaves de LS preservadas no gate (whitelist EXPLÍCITA).
 *
 * 2026-04-11 (audit D5): adicionado suporte a registro dinâmico via
 * `registerPreserveKey()`. Módulos podem declarar suas próprias chaves
 * em vez de obrigar todo autor a editar este arquivo. A lista abaixo
 * é o core baseline; extensões vêm via _DYNAMIC_PRESERVE_KEYS.
 */
const PRESERVE_KEYS = new Set([
    'ecbyts-language',
    'ecbyts-theme',
    'ecbyts-tour-completed',
    'ecbyts-disclaimer-accepted',
    'ecbyts-welcome-shown',
    'ecbyts-version',
    'ecbyts-build-hash',
    // HUD-UX-PAIN-DRAIN-001 W4.3 (D10): consentimento legal LGPD — o version
    // gate apagava estas chaves a cada deploy (auto-version-bump roda por
    // push) e o modal de privacidade reaparecia para TODO usuário. Registro
    // de consentimento deve sobreviver a deploys; re-aceite só quando a
    // política muda de fato (policyHash/POLICY_VERSION em privacyNotice).
    'ecbyts-legal-consent',
    'ecbyts-cookie-consent',
    // Preferências de UI que valem preservar entre versões
    'ecbyts-default-view',
    'ecbyts-camera-state',
    // Configurações de IA/ML
    'ecbyts-api-keys',
    'ecbyts_user_constants',
    'ecbyts_custom_parameters',
    'ecbyts_custom_units',
    'ecbyts_user_agents',
    'ecbyts_active_agent',
    'ecbyts-viz-settings',
    // Data Studio UX continuity
    'ecbyts-ds-query-history',
]);
/**
 * Extensão dinâmica: módulos registram suas chaves via `registerPreserveKey()`.
 * Preenchido no boot antes do gate rodar. Cresce à medida que módulos novos
 * importam este arquivo e declaram suas chaves.
 */
const _DYNAMIC_PRESERVE_KEYS = new Set<string>();
/**
 * Metadata dos registros dinâmicos (para debug e auditoria).
 */
const _PRESERVE_KEY_METADATA = new Map<string, { reason: string; owner: string; registeredAt: number }>();
/**
 * Registra uma chave de localStorage para ser preservada durante version-gate cleanup.
 * Módulos devem chamar isto no top-level (durante module evaluation) ou no seu init,
 * ANTES que `checkAndApplyVersionGate()` execute.
 *
 * Exemplo:
 *     registerPreserveKey('ecbyts-newfeature-state', {
 *         reason: 'user preference for new feature X',
 *         owner: 'core/newfeature/manager.js',
 *     });
 *
 * @param key - LS key a preservar
 * @param meta - motivo e arquivo owner
 */
export function registerPreserveKey(key: string, meta: { reason?: string; owner?: string } = {}) {
    if (typeof key !== 'string' || !key) return;
    if (_DYNAMIC_PRESERVE_KEYS.has(key)) return; // idempotente
    _DYNAMIC_PRESERVE_KEYS.add(key);
    _PRESERVE_KEY_METADATA.set(key, {
        reason: meta.reason || '(no reason given)',
        owner: meta.owner || '(unknown)',
        registeredAt: Date.now(),
    });
}
/**
 * Retorna snapshot dos registros dinâmicos (debug/telemetry).
 */
export function getPreserveKeyRegistry() {
    return [..._PRESERVE_KEY_METADATA.entries()].map(([key, meta]) => ({ key, ...meta }));
}
/**
 * Verifica se uma chave deve ser preservada no cleanup - consulta tanto
 * a whitelist core quanto o registro dinâmico.
 * @param key
 */
function _shouldPreserve(key: string) {
    return PRESERVE_KEYS.has(key) || _DYNAMIC_PRESERVE_KEYS.has(key);
}
/** Chaves de UI state explicitamente limpas (layout velho pode esconder HUDs novos). */
const UI_STATE_KEYS_TO_WIPE = [
    'ecbyts-bars-layout',
    'ecbyts-panel-layout',
    'ecbyts-tab-layout',
    'ecbyts-customize',
    'ecbyts-nn-panel',
    'ecbyts-constellation-collapsed',
    'ecbyts-constellation-height',
    'ecbyts-random-families',
    'ecbyts-random-options',
];
/** Anti-loop: máx de tentativas de gate por sessão (1 bypass + 1 retry). */
const MAX_GATE_ATTEMPTS = 2;
// ── Meta tag reader ─────────────────────────────────────────────────────────
/**
 * Lê o build hash injetado no index.html pelo workflow auto-version-bump.
 */
export function getDeployedVersion() {
    if (typeof document === 'undefined') {
        return { version: 'unknown', buildHash: 'dev' };
    }
    const version = document.querySelector('meta[name="ecbyts-version"]')?.getAttribute('content') || 'unknown';
    const buildHash = document.querySelector('meta[name="ecbyts-build-hash"]')?.getAttribute('content') || 'dev';
    return { version, buildHash };
}
// ── Storage helpers ─────────────────────────────────────────────────────────
/**
 * Lê o hash armazenado localmente (última versão que o cliente viu).
 */
export function getStoredHash() {
    try {
        return localStorage.getItem('ecbyts-build-hash');
    } catch (e: any) {
        console.debug('[versionGate] readVersion:', e?.message || e);
        return null;
    }
}
function _incrementAttempts() {
    try {
        const current = parseInt(sessionStorage.getItem('ecbyts-gate-attempts') || '0', 10);
        const next = current + 1;
        sessionStorage.setItem('ecbyts-gate-attempts', String(next));
        return next;
    } catch (e: any) {
        console.debug('[versionGate] incrementAttempts:', e?.message || e);
        return 0;
    }
}
function _resetAttempts() {
    try {
        sessionStorage.removeItem('ecbyts-gate-attempts');
    } catch (e: any) {
        console.debug('[versionGate] resetAttempts:', e?.message || e);
        /* ignore */
    }
}
// ── Cache cleanup ────────────────────────────────────────────────────────────
/**
 * Limpa UI state + Cache Storage, preservando whitelist.
 * Usado pelo gate automático E pelo botão "Forçar atualização" manual.
 */
export async function clearStaleUiState() {
    let clearedCount = 0;
    let preservedCount = 0;
    // 1. Limpa chaves UI explícitas
    for (const key of UI_STATE_KEYS_TO_WIPE) {
        try {
            if (localStorage.getItem(key) !== null) {
                localStorage.removeItem(key);
                clearedCount++;
            }
        } catch (e: any) {
            console.debug('[versionGate] wipeUiKey:', key, e?.message || e);
            /* ignore */
        }
    }
    // 2. Varre todas ecbyts-*, limpa não-whitelisted (defesa em profundidade)
    //    NUNCA toca sb-* (Supabase auth) ou qualquer chave fora do namespace.
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) || '';
            if (k) keys.push(k);
        }
        for (const key of keys) {
            if (key.startsWith('sb-')) {
                preservedCount++;
                continue;
            }
            if (_shouldPreserve(key)) {
                preservedCount++;
                continue;
            }
            // Preserva chaves Category C (model data) - são limpas separadamente
            // via clearModelData() do storageMonitor. Aqui não mexemos.
            if (
                key.startsWith('ecbyts-gov-') ||
                key === 'ecbyts-audit-trail' ||
                key === 'ecbyts-decision-log' ||
                key === 'ecbyts-stakeholder-shares' ||
                key === 'ecbyts-retention-policies' ||
                key === 'ecbyts-purpose-snapshots'
            ) {
                preservedCount++;
                continue;
            }
        }
    } catch (e: any) {
        console.debug('[versionGate] scanNamespace:', e?.message || e);
        /* ignore */
    }
    // 3. Cache Storage API - limpa tudo
    if (typeof caches !== 'undefined') {
        try {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
        } catch (e: any) {
            console.debug('[versionGate] cacheStorageDelete:', e?.message || e);
            /* ignore */
        }
    }
    return { clearedCount, preservedCount };
}
// ── Main gate function ──────────────────────────────────────────────────────
/**
 * Main entry: lê meta tags, compara com LS, aplica gate se necessário.
 * Pode disparar location.href = ... (reload) - caller deve verificar
 * o valor retornado e abortar boot se { ran: true }.
 */
export async function checkAndApplyVersionGate() {
    const { version, buildHash } = getDeployedVersion();
    // Dev local: BUILD_HASH === 'dev' - pula gate completamente
    if (buildHash === 'dev' || buildHash === 'unknown') {
        log.debug('Skipping gate in dev mode (hash=%s)', buildHash);
        _resetAttempts();
        return { ran: false, reason: 'dev-mode' };
    }
    // REVERT of Fix #4 (2026-04-11): the original localhost short-circuit
    // here was a misdiagnosis. The "reload loop" it was trying to prevent
    // (stored=A → B → C) was NOT a loop - it was Version Gate correctly
    // catching up to 3 commits that landed in quick succession. Each reload
    // was for a DIFFERENT build hash. The symptom disappears naturally
    // once the dev stops pushing.
    //
    // The consequence of the short-circuit was MUCH worse: localhost
    // browsers stayed stuck on old cached code forever, because they never
    // reloaded to pick up new commits. Calvin saw this as "all my fixes
    // don't apply" even though they were pushed - the browser was still
    // running old bytes.
    //
    // Accept the 1-2 reloads on localhost per build change. The existing
    // MAX_GATE_ATTEMPTS guardrail below (sessionStorage counter) protects
    // against pathological loops. Localhost should reload to new code just
    // like production.
    // Guardrail anti-loop: se já tentou >= MAX nesta sessão, para
    const attempts = parseInt(
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ecbyts-gate-attempts')) || '0',
        10,
    );
    if (attempts >= MAX_GATE_ATTEMPTS) {
        log.error(
            'Gate attempts exhausted (%d/%d) — forcing skip. Check that meta tags are updated correctly in production.',
            attempts,
            MAX_GATE_ATTEMPTS,
        );
        return { ran: false, reason: 'max-attempts' };
    }
    const storedHash = getStoredHash();
    // Primeira visita: salva e segue
    if (!storedHash) {
        try {
            localStorage.setItem('ecbyts-build-hash', buildHash);
            localStorage.setItem('ecbyts-version', version);
        } catch (e: any) {
            console.debug('[versionGate] firstVisitWrite:', e?.message || e);
            /* ignore */
        }
        _resetAttempts();
        log.info('First visit: stored hash=%s version=%s', buildHash, version);
        return { ran: false, reason: 'first-visit', version, hash: buildHash };
    }
    // Mesma versão: skip
    if (storedHash === buildHash) {
        _resetAttempts();
        return { ran: false, reason: 'same-hash' };
    }
    // Hash diferente - deploy novo detectado
    log.warn('Build mismatch detected: stored=%s → deployed=%s. Applying version gate.', storedHash, buildHash);
    _incrementAttempts();
    // Clean up UI state + cache storage
    const result = await clearStaleUiState();
    log.info('Cleared %d UI keys, preserved %d keys', result.clearedCount, result.preservedCount);
    // Clear Category C IDB via storageMonitor (import dinâmico para evitar ciclo)
    try {
        const { clearModelData } = await import('../storage/storageMonitor.js');
        await clearModelData();
        log.info('Cleared model data (IDB Category C)');
    } catch (err: any) {
        log.error('Failed to clear model data', err);
    }
    // Persiste novo hash ANTES do reload (previne loop se reload bate no cache)
    try {
        localStorage.setItem('ecbyts-build-hash', buildHash);
        localStorage.setItem('ecbyts-version', version);
    } catch (e: any) {
        console.debug('[versionGate] persistNewHash:', e?.message || e);
        /* ignore */
    }
    // CRITICAL: before triggering reload, clear the global init state guard.
    // The _dispatchInit() guard in main.js uses `window.__ecbytsInitState.dispatched`
    // to block duplicate bootstrap calls. If the browser does a "soft" navigation
    // (same pathname, only query param change), some state may persist across
    // the new page load and block init() from running, leaving the UI stuck on
    // "Initializing..." forever. Defensive: explicitly reset the guard.
    try {
        if (typeof window !== 'undefined' && window.__ecbytsInitState) {
            window.__ecbytsInitState.dispatched = false;
            window.__ecbytsInitState.running = false;
        }
    } catch (e: any) {
        console.debug('[versionGate] resetInitGuard:', e?.message || e);
        /* ignore */
    }
    // BOOT-ENTRY-UX-001 RF-B (cosmético): antes o overlay era escurecido
    // (opacity=0.5), fazendo o logo "meio sumir" de forma estranha logo antes
    // do reload pós-deploy. Como o reload em si é INTENCIONAL (one-shot pós-
    // deploy, protegido por MAX_GATE_ATTEMPTS), a percepção correta é um splash
    // CONTÍNUO: mantemos o overlay 100% visível (opacity=1) e trocamos o texto
    // de status para "Atualizando..." — o usuário vê o splash cheio informando
    // que está atualizando, não um logo piscando meio-apagado. NÃO desabilita
    // pointerEvents aqui (o overlay continua cobrindo a tela até o reload).
    try {
        if (typeof document !== 'undefined') {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.style.pointerEvents = 'none';
                overlay.style.opacity = '1';
            }
            const status = document.getElementById('loading-status');
            if (status) {
                status.textContent = 'Atualizando...';
            }
        }
    } catch (e: any) {
        console.debug('[versionGate] updateOverlayGate:', e?.message || e);
        /* ignore */
    }
    // Reload preservando query string (ex: ?share=ss-abc123 de G8 stakeholder links).
    // Use location.replace() instead of location.href assignment to force a
    // fresh navigation without adding to history (cleaner UX on back button)
    // and to guarantee a hard reload even when the URL differs only in query.
    if (typeof window !== 'undefined' && window.location) {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('_v', buildHash);
            // replace() forces navigation and doesn't leave the old URL in
            // history. On same-pathname-different-query this still triggers
            // a full reload in all major browsers.
            window.location.replace(url.toString());
        } catch (e: any) {
            console.debug('[versionGate] urlReplace:', e?.message || e);
            // Fallback if URL API fails - location.reload() forces full reload
            window.location.reload();
        }
    }
    return { ran: true, reason: 'hash-mismatch', version, hash: buildHash };
}
// ── Self-service force update (botão manual) ────────────────────────────────
/**
 * Limpa LS + IDB + cache storage e recarrega. Usado pelo botão
 * "Forçar atualização" no menu de configurações. Não depende do gate.
 *
 * Preserva auth (sb-*), idioma, tema, preferências críticas. Limpa o resto.
 */
export async function forceUpdate() {
    log.warn('forceUpdate: manual cache flush triggered by user');
    // Reset anti-loop para permitir que o gate rode de novo no reload
    _resetAttempts();
    await clearStaleUiState();
    try {
        const { clearModelData } = await import('../storage/storageMonitor.js');
        await clearModelData();
    } catch (err: any) {
        log.error('Failed to clear model data during forceUpdate', err);
    }
    // Remove hash para forçar "primeira visita" no próximo boot
    try {
        localStorage.removeItem('ecbyts-build-hash');
    } catch (e: any) {
        console.debug('[versionGate] removeStoredHash:', e?.message || e);
        /* ignore */
    }
    // Reset init guard + overlay before reload (same reasoning as
    // checkAndApplyVersionGate reload - prevents stuck "Initializing...")
    try {
        if (typeof window !== 'undefined' && window.__ecbytsInitState) {
            window.__ecbytsInitState.dispatched = false;
            window.__ecbytsInitState.running = false;
        }
        if (typeof document !== 'undefined') {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.style.pointerEvents = 'none';
                overlay.style.opacity = '0.5';
            }
        }
    } catch (e: any) {
        console.debug('[versionGate] dimOverlayForce:', e?.message || e);
        /* ignore */
    }
    if (typeof window !== 'undefined' && window.location) {
        // Query string fresca para bust de cache
        const url = new URL(window.location.href);
        url.searchParams.set('_force', Date.now().toString());
        window.location.replace(url.toString());
    }
}
// ── Expose on window for test + manual recovery ─────────────────────────────
if (typeof window !== 'undefined') {
    window.__ecbytsVersionGate = {
        check: checkAndApplyVersionGate,
        force: forceUpdate,
        info: getDeployedVersion,
    };
}
//# sourceMappingURL=versionGate.js.map
//# sourceMappingURL=versionGate.js.map
