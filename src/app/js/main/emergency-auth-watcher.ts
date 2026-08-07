// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   EMERGENCY AUTH WATCHER — Phase 3
   Observa transicoes do supabaseHealth (online -> offline) e dispara
   o modal de login emergencial SOMENTE se o usuario tiver cache
   AES-GCM previo (i.e., ele e um trusted user que ja se autenticou
   pelo menos uma vez online).

   Tolerante a falha dos modulos das Fases 1+2: se supabaseHealth ou
   emergencyAuth nao estiverem disponiveis, watcher entra em no-op
   silencioso (init nao bloqueia boot).
   ================================================================ */

let _modalOpenedThisOutage = false;
let _wasOnline = false;
let _initialized = false;

type HealthSnapshot = {
    status: 'unknown' | 'online' | 'degraded' | 'offline';
};
type StatusChangeListener = (snapshot: HealthSnapshot) => void | Promise<void>;
type HealthModule = {
    onStatusChange?: (callback: StatusChangeListener) => () => void;
};
type EmergencyModule = {
    loadCache?: () => Promise<{ email?: string } | null>;
};

function errorMessage(err: unknown): string {
    return err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message) : String(err);
}

/**
 * Initialize the Emergency Auth watcher.
 * Registra listener no supabaseHealth para abrir o modal quando ficar offline.
 * Chamado durante o boot (boot-preflight.js).
 *
 * Idempotente: chamadas subsequentes sao no-op.
 */
export async function initEmergencyAuthWatcher(): Promise<void> {
    if (_initialized) return;
    _initialized = true;

    let healthMod: HealthModule;
    let emergencyMod: EmergencyModule;
    try {
        healthMod = await import('../utils/auth/supabaseHealth.js');
        emergencyMod = await import('../utils/auth/emergencyAuth.js');
    } catch (err) {
        // Fases 1+2 ainda nao mergeadas ou modulos ausentes — watcher entra em no-op.
        console.debug('[main/emergency-auth-watcher:phase-1-2-missing]', errorMessage(err));
        return;
    }

    const onStatusChange = healthMod?.onStatusChange;
    const loadCache = emergencyMod?.loadCache;
    if (typeof onStatusChange !== 'function' || typeof loadCache !== 'function') {
        console.debug('[main/emergency-auth-watcher:api-mismatch] supabaseHealth/emergencyAuth API not exported');
        return;
    }

    onStatusChange(async (snapshot: HealthSnapshot) => {
        const newStatus = snapshot.status;
        if (newStatus === 'online') {
            _wasOnline = true;
            _modalOpenedThisOutage = false;
            return;
        }
        if (newStatus !== 'offline') return;
        if (!_wasOnline) return;
        if (_modalOpenedThisOutage) return;

        // Only show modal if user has a trusted-bypass cache (i.e., they're allowlisted
        // and logged in at least once online).
        let cache: { email?: string } | null = null;
        try {
            cache = await loadCache();
        } catch (err) {
            console.debug('[main/emergency-auth-watcher:loadCache-failed]', errorMessage(err));
        }
        if (!cache) return;

        _modalOpenedThisOutage = true;
        try {
            const { openEmergencyLoginModal } = await import('../utils/ui/emergencyLoginModal.js');
            openEmergencyLoginModal(
                typeof cache.email === 'string' ? { prefilledEmail: cache.email } : undefined,
            );
        } catch (err) {
            console.error('[main/emergency-auth-watcher:modal-open-failed]', errorMessage(err));
            _modalOpenedThisOutage = false; // allow retry on next offline transition
        }
    });
}
