// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { markBootPhase } from './boot-phase.js';
import { isGuestMode } from './guestGate.js';

export async function runStartupGatesSequence(
{ loadedFromURL, initConfig, applyModel, showToast, waitForAuth, forceDismissWelcomeOverlays, stopLoadingTips, documentRef, windowRef, localStorageRef, sessionStorageRef, historyRef, locationRef, features }: any) {
    const LANE_ACTIVATION_TIMEOUT_MS = 10_000;
    const withLaneTimeout = <T>(promise: Promise<T>, label: string): Promise<T | null> => Promise.race([
        promise,
        new Promise<null>((resolve) => setTimeout(() => {
            console.warn(`[LaneActivation] ${label} timed out after ${LANE_ACTIVATION_TIMEOUT_MS}ms — skipping lane restore`);
            resolve(null);
        }, LANE_ACTIVATION_TIMEOUT_MS)),
    ]);
    const pendingLaneStorageKey = 'ecbyts-pending-lane-scope';
    const setPendingLaneScope = (scopeKey: string) => {
        try {
            localStorageRef.setItem(pendingLaneStorageKey, scopeKey);
        }
        catch {
            console.debug('[LaneActivation] localStorage pending write failed');
        }
        try {
            sessionStorageRef.setItem(pendingLaneStorageKey, scopeKey);
        }
        catch {
            console.debug('[LaneActivation] sessionStorage pending write failed');
        }
    };
    const readPendingLaneScope = () => {
        try {
            const fromLocal = (localStorageRef.getItem(pendingLaneStorageKey) || '').trim();
            if (fromLocal)
                return fromLocal;
        }
        catch {
            console.debug('[LaneActivation] localStorage pending read failed');
        }
        try {
            return (sessionStorageRef.getItem(pendingLaneStorageKey) || '').trim();
        }
        catch {
            console.debug('[LaneActivation] sessionStorage pending read failed');
        }
        return '';
    };
    const clearPendingLaneScope = () => {
        try {
            localStorageRef.removeItem(pendingLaneStorageKey);
        }
        catch {
            console.debug('[LaneActivation] localStorage pending clear failed');
        }
        try {
            sessionStorageRef.removeItem(pendingLaneStorageKey);
        }
        catch {
            console.debug('[LaneActivation] sessionStorage pending clear failed');
        }
    };
    const queueNextFrame = (callback: () => void) => {
        const raf = windowRef.requestAnimationFrame || globalThis.requestAnimationFrame;
        if (typeof raf === 'function') {
            raf.call(windowRef, callback);
            return;
        }
        queueMicrotask(callback);
    };
    const startTourWhenHandlerReady = () => {
        const MAX_TOUR_START_FRAMES = 120;
        let frameCount = 0;
        const tick = () => {
            if (windowRef.handleStartTour) {
                windowRef.handleStartTour();
                return;
            }
            frameCount += 1;
            if (frameCount < MAX_TOUR_START_FRAMES) {
                queueNextFrame(tick);
                return;
            }
            console.warn('[Welcome] Tour handler not ready after startup frames.');
        };
        queueNextFrame(tick);
    };
    async function activateLaneScopeIfPossible(scopeKey: string) {
        if (!scopeKey)
            return false;
        const { getCurrentUser } = await import('../utils/auth/session.js' as string);
        if (!getCurrentUser())
            return false;
        const { loadAutosaveLanes, setActiveLaneByScope, listAutosaveSnapshots, loadAutosaveSnapshot, loadModelFromCloud, } = await import('../utils/cloud/manager.js' as string);
        // T10.1: fase granular — loadAutosaveLanes é rede/IDB sem teto próprio.
        markBootPhase(windowRef, 'gate:autosave-lanes');
        await loadAutosaveLanes();
        const switched = await setActiveLaneByScope(scopeKey);
        if (!switched)
            return false;
        try {
            const snaps = await listAutosaveSnapshots({ scopeKey, limit: 1 });
            const latest = Array.isArray(snaps) && snaps.length ? snaps[0] : null;
            if (latest?.id) {
                const snapshot = await loadAutosaveSnapshot(latest.id);
                if (snapshot?.snapshot_data)
                    await applyModel(snapshot.snapshot_data);
            }
            else if (String(scopeKey).startsWith('cloud:materialized-specs:')) {
                const modelId = String(scopeKey).slice('cloud:materialized-specs:'.length).trim();
                if (modelId) {
                    const modelData = await loadModelFromCloud(modelId);
                    if (modelData && typeof modelData === 'object')
                        await applyModel(modelData);
                }
            }
        }
        catch ( /** @type {any} */snapErr) {
            console.warn('[LaneActivation] snapshot load failed:', (snapErr as any)?.message || snapErr);
        }
        return true;
    }
    try {
        const qsLane = new URLSearchParams(locationRef.search);
        const activateLaneScope = (qsLane.get('activate_lane_scope') || '').trim();
        if (activateLaneScope) {
            const switched = await withLaneTimeout(activateLaneScopeIfPossible(activateLaneScope), 'activate_lane_scope');
            if (switched === true) {
                showToast('Raia de materialização ativada e estado restaurado.', 'success');
                clearPendingLaneScope();
            }
            else {
                setPendingLaneScope(activateLaneScope);
                showToast('Sessão necessária. A raia será ativada automaticamente após login.', 'warning');
            }
            qsLane.delete('activate_lane_scope');
            const cleanLaneUrl = `${locationRef.pathname}${qsLane.toString() ? `?${qsLane.toString()}` : ''}${locationRef.hash || ''}`;
            historyRef.replaceState({}, '', cleanLaneUrl);
        }
        else {
            const pendingScope = readPendingLaneScope();
            if (pendingScope) {
                const switched = await withLaneTimeout(activateLaneScopeIfPossible(pendingScope), 'pending-lane');
                if (switched === true) {
                    clearPendingLaneScope();
                    showToast('Raia pendente ativada após autenticação.', 'success');
                }
            }
        }
    }
    catch ( /** @type {any} */laneErr) {
        console.warn('[LaneActivation] failed:', (laneErr as any)?.message || laneErr);
    }
    {
        const qs = new URLSearchParams(locationRef.search);
        if (qs.has('_r')) {
            qs.delete('_r');
            const clean = `${locationRef.pathname}${qs.toString() ? `?${qs.toString()}` : ''}${locationRef.hash || ''}`;
            historyRef.replaceState({}, '', clean);
        }
    }
    const inviteRaw = new URLSearchParams(locationRef.search).get('invite') || null;
    const inviteParam = inviteRaw
        ? inviteRaw
            .replace(/[^A-Z0-9-]/gi, '')
            .toUpperCase()
            .substring(0, 32)
        : null;
    if (inviteParam) {
        sessionStorageRef.setItem('ecbyts-invite-code', inviteParam);
    }
    // ECBYTS-OPEN-LOCAL-001 F1 (RF1/A7): em Modo Convidado os DOIS gates de
    // welcome (invite wall e first-visit) resolvem IMEDIATO — sem parede de
    // convite, sem 'gate:welcome-wait', sem esperar o watchdog de 45s (F0 §1.4).
    const guestMode = isGuestMode();
    if (guestMode) {
        console.debug('[Welcome] Guest mode: invite/welcome gates bypassed.');
    }
    if (features.INVITE_ONLY && !guestMode) {
        const { getCurrentUser } = await import('../utils/auth/session.js' as string);
        const isLocalE2EHost = ['localhost', '127.0.0.1'].includes(locationRef.hostname);
        const localToolsDeepLink = String(new URLSearchParams(locationRef.search).get('tools') || '').trim();
        const localToolsDeepLinkBypass = isLocalE2EHost
            && /^[a-z0-9._-]{2,80}$/i.test(localToolsDeepLink);
        if (localToolsDeepLinkBypass) {
            console.debug('[Welcome] Local tools deep-link bypass invite gate:', localToolsDeepLink);
        }
        const e2eBypass = isLocalE2EHost &&
            (windowRef.__e2e_bypass_invite__ === true ||
                localToolsDeepLinkBypass ||
                (typeof localStorageRef !== 'undefined' && localStorageRef.getItem('__e2e_bypass_invite__') === '1') ||
                (typeof sessionStorageRef !== 'undefined' &&
                    sessionStorageRef.getItem('__e2e_bypass_invite__') === '1'));
        if (!getCurrentUser() && !e2eBypass) {
            const loadingEl = documentRef.getElementById('loading-overlay');
            if (loadingEl)
                loadingEl.style.display = 'none';
            try {
                const { showWelcomeScreen } = await import('../utils/ui/welcomeScreen.js' as string);
                // T10.1: fase própria de espera-do-usuário (SEM timeout — decisão
                // legítima de UX, não travamento) para o watchdog distinguir de stall real.
                markBootPhase(windowRef, 'gate:welcome-wait');
                const chosenMode = await showWelcomeScreen({ prefillCode: inviteParam });
                if (chosenMode === 'invite-accepted') {
                    const authModal = documentRef.getElementById('auth-modal');
                    if (authModal) {
                        const closeBtn = authModal.querySelector('.auth-card-close');
                        if (closeBtn)
                            closeBtn.style.display = 'none';
                        authModal.classList.add('active');
                    }
                    // T10.1: espera de usuário (login) — sem timeout, fase própria.
                    markBootPhase(windowRef, 'gate:auth-wait');
                    await waitForAuth();
                    if (authModal) {
                        authModal.classList.remove('active');
                        const closeBtn = authModal.querySelector('.auth-card-close');
                        if (closeBtn)
                            closeBtn.style.display = '';
                    }
                    initConfig.mode = 'blank';
                }
            }
            catch ( /** @type {any} */e) {
                console.warn('[Welcome] Invite gate error:', (e as any)?.message);
            }
            finally {
                forceDismissWelcomeOverlays();
                // BOOT-ENTRY-UX-001 RF-1 (bug A): NÃO restaurar o display do overlay para o
                // valor default aqui. O splash foi escondido p/ mostrar welcome/auth; reexibi-lo
                // faz o logo "piscar de volta" antes de o postboot removê-lo. O overlay é
                // revelado/removido EXCLUSIVAMENTE por _finishLoadingOverlay (random-postboot.ts).
                // Se o boot abortar logo abaixo (invite gate locked), o overlay é removido lá.
            }
            const { isInviteGateLocked } = await import('../utils/auth/inviteGate.js' as string);
            if (isInviteGateLocked()) {
                console.warn('[Init] Invite gate: user not authenticated. Halting init.');
                const overlay = documentRef.getElementById('loading-overlay');
                if (overlay)
                    overlay.remove();
                stopLoadingTips();
                return { aborted: true };
            }
        }
    }
    if (!loadedFromURL && !guestMode) {
        const welcomeShown = !!localStorageRef.getItem('ecbyts-first-visit') ||
            localStorageRef.getItem('ecbyts-welcome-shown') === 'true';
        if (!welcomeShown) {
            const loadingEl = documentRef.getElementById('loading-overlay');
            if (loadingEl)
                loadingEl.style.display = 'none';
            try {
                const { showWelcomeScreen } = await import('../utils/ui/welcomeScreen.js' as string);
                // T10.1: fase própria de espera-do-usuário (SEM timeout).
                markBootPhase(windowRef, 'gate:welcome-wait');
                const chosenMode = await showWelcomeScreen({ prefillCode: inviteParam });
                if (chosenMode === 'tour') {
                    initConfig.mode = 'random';
                    startTourWhenHandlerReady();
                }
                else if (chosenMode) {
                    initConfig.mode = chosenMode;
                }
            }
            catch ( /** @type {any} */e) {
                console.warn('[Welcome] Failed to show welcome screen:', (e as any)?.message);
            }
            finally {
                forceDismissWelcomeOverlays();
                // BOOT-ENTRY-UX-001 RF-1 (bug A): NÃO restaurar o display do overlay para o
                // valor default. O boot prossegue direto ao postboot, que é o ÚNICO a revelar/
                // remover o #loading-overlay (_finishLoadingOverlay). Reexibi-lo aqui faz o
                // splash "piscar de volta" — o defeito que o Calvin viu.
            }
        }
    }
    return { aborted: false };
}
