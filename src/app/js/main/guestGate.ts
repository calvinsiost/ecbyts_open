// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   GUEST GATE — Modo Convidado (ECBYTS-OPEN-LOCAL-001 F1)
   Decide se o app roda em Modo Convidado (sem backend) ou Online
   (Supabase). Reusa os reasonCodes de oauthGuard.ts ('placeholder-key',
   'placeholder-url', 'missing-url', 'missing-key') como fonte única de
   verdade da detecção de config placeholder/ausente.

   Consumidores:
   - main.ts             → initGuestMode() + mountGuestModeBanner() no boot
   - startup-gates.ts    → bypass do welcome/invite gate (RF1/A7)
   - utils/auth/inviteGate.ts → isInviteGateLocked() nunca tranca convidado
   - utils/telemetry/*, utils/errorReporting/reporter.ts → early return
   - módulos com fetch('/api/…') → guardBackendFetch() (RF1/A11)
   ================================================================ */

import { validateSupabaseOAuthConfig } from '../utils/auth/oauthGuard.js';
import { Z_INDEX } from '../utils/ui/zIndex.js';

export type GuestModeReason = 'placeholder' | 'missing' | 'ok';

export interface GuestModeStatus {
    isGuest: boolean;
    reason: GuestModeReason;
}

/** Mensagem ERR_GUEST_API (spec §5.3) — toast dos módulos de ação. */
export const GUEST_API_TOAST_MESSAGE = 'Este recurso precisa de backend — desligado no Modo Convidado.';

/** Texto do banner RF2 — sem instrução de configurar Supabase (decisão A6). */
export const GUEST_BANNER_TEXT =
    'Modo Convidado — rodando localmente sem backend. Login, sincronização e IA desligados.';

const GUEST_BANNER_ID = 'guest-mode-banner';
const TOAST_THROTTLE_MS = 4000;

/**
 * Pure decision: guest mode is on when the Supabase config is a
 * placeholder or missing. Real-looking configs (even with other
 * validation issues, e.g. short key) stay Online — those failures
 * belong to initAuth, not to the guest gate (UT-002).
 */
export function detectGuestMode(url: string, key: string): GuestModeStatus {
    const status = validateSupabaseOAuthConfig(url, key);
    const codes = new Set(status.reasonCodes);
    if (codes.has('placeholder-url') || codes.has('placeholder-key')) {
        return { isGuest: true, reason: 'placeholder' };
    }
    if (codes.has('missing-url') || codes.has('missing-key')) {
        return { isGuest: true, reason: 'missing' };
    }
    return { isGuest: false, reason: 'ok' };
}

interface GuestModeRuntimeState {
    status: GuestModeStatus;
    enabled: boolean;
}

let _runtime: GuestModeRuntimeState | null = null;
let _lastToastAt = 0;
let _toastOverride: ((message: string, type?: string) => void) | null = null;

/**
 * Boot-time initialization (main.ts, before any init sequence).
 * `enabled` mirrors CONFIG.FEATURES.GUEST_MODE — the rollback hatch
 * (§8.1): flag OFF preserva o comportamento privado mesmo com placeholder.
 */
export function initGuestMode(opts: { url: string; key: string; enabled?: boolean }): GuestModeStatus {
    const status = detectGuestMode(String(opts.url ?? ''), String(opts.key ?? ''));
    _runtime = { status, enabled: opts.enabled !== false };
    if (_runtime.enabled && status.isGuest) {
        console.info(`[guestGate] Modo Convidado ativo (reason=${status.reason}) — backend desligado.`);
    }
    return status;
}

/** True somente após initGuestMode() com flag ligada + config placeholder/ausente. */
export function isGuestMode(): boolean {
    return _runtime !== null && _runtime.enabled && _runtime.status.isGuest;
}

/** Estado detectado no boot (null antes de initGuestMode). */
export function getGuestModeStatus(): GuestModeStatus | null {
    return _runtime ? _runtime.status : null;
}

function _notifyBlockedAction(): void {
    const now = Date.now();
    if (now - _lastToastAt < TOAST_THROTTLE_MS) return;
    _lastToastAt = now;
    if (_toastOverride) {
        _toastOverride(GUEST_API_TOAST_MESSAGE, 'warning');
        return;
    }
    import('../utils/ui/toast.js' as string)
        .then(({ showToast }) => showToast(GUEST_API_TOAST_MESSAGE, 'warning'))
        .catch((e: any) => console.debug('[guestGate:toast]', e?.message || e));
}

/**
 * Gate único da superfície `/api/*` (RF1/A11). Consultar ANTES do fetch.
 *
 * @param context rótulo para o console (ex.: 'datastudio:collections')
 * @param kind 'boot' = skip silencioso (console.debug); 'action' = toast
 *             ERR_GUEST_API (throttled) + skip.
 * @returns true quando o fetch pode prosseguir (não-convidado).
 */
export function guardBackendFetch(context: string, kind: 'boot' | 'action' = 'action'): boolean {
    if (!isGuestMode()) return true;
    console.debug(`[guestGate] /api/* skipped (${kind}): ${context}`);
    if (kind === 'action') _notifyBlockedAction();
    return false;
}

/**
 * Badge persistente "Modo Convidado" (RF2): não-dismissable,
 * role="status" + aria-live="polite" (§9). Idempotente.
 * Fundo fixo #966c22 (== --warning light, 4.70:1 com texto branco) para
 * manter contraste AA nos dois temas.
 */
export function mountGuestModeBanner(
    documentRef: Document | null = typeof document !== 'undefined' ? document : null,
): HTMLElement | null {
    if (!isGuestMode() || !documentRef || !documentRef.body) return null;
    const existing = documentRef.getElementById(GUEST_BANNER_ID);
    if (existing) return existing as HTMLElement;
    const el = documentRef.createElement('div');
    el.id = GUEST_BANNER_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = GUEST_BANNER_TEXT;
    el.style.cssText = [
        'position:fixed',
        'left:12px',
        'bottom:12px',
        `z-index:${Z_INDEX.EXCEPTION_GUEST_MODE_BANNER}`,
        'max-width:min(92vw, 480px)',
        'padding:8px 14px',
        'border-radius:6px',
        'background:#966c22',
        'color:#ffffff',
        'font-size:13px',
        'line-height:1.4',
        'font-family:inherit',
        'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
        'pointer-events:none',
    ].join(';');
    documentRef.body.appendChild(el);
    return el;
}

/** Test-only: limpa o estado do módulo entre casos. */
export function _resetGuestModeForTests(): void {
    _runtime = null;
    _lastToastAt = 0;
    _toastOverride = null;
}

/** Test-only: injeta o toast para asserção sem DOM. */
export function _setGuestToastForTests(fn: ((message: string, type?: string) => void) | null): void {
    _toastOverride = fn;
}
