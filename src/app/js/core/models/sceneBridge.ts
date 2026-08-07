// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   MULTI-MODEL TABS Phase 4 — sceneOwner bridge (MVP)

   Escuta evento 'model:switched' dispatchado por handleSwitchModel
   e orquestra a troca de modelo na cena 3D.

   Implementação Phase 4 MVP: window.location.reload() preservando o
   activeId no IDB (já setado pelo registry.switchActive antes do
   dispatch do evento). Managers que lêem IDB na inicialização vão
   pegar o novo modelo.

   Phase 4 completo (futuro): dispose sceneOwner → reload managers
   sem full reload (reconfig closures). Requer research para cada
   manager que mantém state em memória.

   Feature flag aware: só ativa se CONFIG.FEATURES.MULTI_MODEL on.
   ================================================================ */
import { CONFIG } from '../../config.js';
let _bridgeInitialized = false;
/**
 * Inicializa o bridge (idempotente). Chama automaticamente no import se
 * feature flag on e em ambiente browser. Pode ser chamada manualmente em
 * tests ou lazy load scenarios.
 * @returns {{active: boolean}}
 */
export function initSceneBridge() {
    if (_bridgeInitialized)
        return { active: true };
    if (typeof window === 'undefined')
        return { active: false };
    if (!CONFIG?.FEATURES?.MULTI_MODEL)
        return { active: false };
    window.addEventListener('model:switched', _handleModelSwitched);
    window.addEventListener('model:created', _handleModelCreated);
    _bridgeInitialized = true;
    return { active: true };
}
async function _handleModelSwitched(event: any) {
    const id = event?.detail?.id;
    if (!id)
        return;
    console.debug('[sceneBridge] model:switched →', id, '(reload pending)');
    try {
        // Tenta mostrar loading overlay se disponível
        const overlayMod: any = await import("../../utils/ui/loadingOverlay.js" as string).catch(() => null);
        overlayMod?.showLoadingOverlay?.('Carregando modelo...');
    }
    catch (e: any) {
        console.debug('[sceneBridge] showOverlay:', e?.message || e);
    }
    // MVP: full reload. Phase 4 completo precisa reconfig sem reload.
    setTimeout(() => {
        try {
            window.location.reload();
        }
        catch (err: any) {
            console.warn('[sceneBridge] reload failed:', err?.message);
        }
    }, 150);
}
async function _handleModelCreated(event: any) {
    const id = event?.detail?.id;
    if (!id)
        return;
    console.debug('[sceneBridge] model:created →', id);
    // Criação também dispara switchActive, que dispara model:switched.
    // Nenhuma ação adicional aqui por enquanto.
}
/**
 * Teardown (para testes + cleanup manual).
 */
export function destroySceneBridge() {
    if (!_bridgeInitialized)
        return;
    if (typeof window !== 'undefined') {
        window.removeEventListener('model:switched', _handleModelSwitched);
        window.removeEventListener('model:created', _handleModelCreated);
    }
    _bridgeInitialized = false;
}
export function isBridgeActive() {
    return _bridgeInitialized;
}
// Auto-init lazy (idempotente)
if (typeof window !== 'undefined') {
    // Aguarda próximo tick para garantir CONFIG carregado
    queueMicrotask(() => {
        initSceneBridge();
    });
}
