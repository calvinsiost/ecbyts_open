// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Generated from src/app/js/utils/startup/broadcastSyncInit.ts by TS-MIGRATION-001. Do not edit manually.
// broadcastSyncInit.js - extracted from main.js (ARCH-MONO-002 Phase 2)
// Cross-tab state sync wiring: outgoing broadcasts + incoming handlers.
import { CONFIG } from '../../config.js';
import { broadcastChange, onSyncMessage, setSuppressed } from '../storage/broadcastSync.js';
import { applyModel } from '../../core/io/import.js';
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
let _syncReloading = false;
let _lastSyncReloadTs = 0;
const SYNC_RELOAD_COOLDOWN_MS = 10000;
export function getLastSyncReloadTs() {
    return _lastSyncReloadTs;
}
export function getSyncReloadCooldownMs() {
    return SYNC_RELOAD_COOLDOWN_MS;
}
/**
 * Configure outgoing and incoming broadcast listeners.
 */
export function setupBroadcastListeners({
    hasPendingSave,
    requestUIRefresh,
}: {
    hasPendingSave: () => boolean;
    requestUIRefresh?: (domain?: string, reason?: string) => void;
}) {
    const refreshModelUI = typeof requestUIRefresh === 'function' ? requestUIRefresh : () => {};

    // --- OUTGOING ---
    window.addEventListener('themeChanged', (e: any) => {
        broadcastChange('ui:theme:changed', { preference: e.detail?.preference });
    });
    window.addEventListener('languageChanged', (e: any) => {
        broadcastChange('ui:language:changed', { lang: e.detail?.lang });
    });
    window.addEventListener('authChanged', () => {
        broadcastChange('auth:session:changed');
    });
    // --- INCOMING ---
    onSyncMessage('model:changed', async () => {
        if (_syncReloading) return;
        const hasLocalPendingChanges = !!hasPendingSave();
        if (CONFIG.FEATURES.FIRST_JOURNEY_TAB_CONFLICT_PROMPT && hasLocalPendingChanges) {
            // @allow-native-dialog: boot-time cross-tab reload confirm
            const shouldReload = window.confirm(
                t('syncConflictPrompt') ||
                    'Outra aba salvou o modelo. Carregar agora a versao da outra aba? (Cancelar = manter sua edicao local)',
            );
            if (!shouldReload) {
                showToast(t('syncConflictKeptLocal') || 'Edicao local mantida nesta aba', 'warning');
                return;
            }
        }
        _syncReloading = true;
        _lastSyncReloadTs = Date.now();
        setSuppressed(true);
        try {
            const { idbGet } = await import('../storage/idbStore.js' as string);
            const session = await idbGet('ecbyts-session');
            if (session) {
                await applyModel(session);
                refreshModelUI(UI_INVALIDATION_DOMAINS.MODEL, 'broadcast-sync:model-changed');
                showToast(t('syncModelUpdated') || 'Modelo atualizado por outra aba', 'info');
            }
        } catch (e: any) {
            console.warn('[BroadcastSync] Reload from IDB failed:', e?.message);
        } finally {
            setSuppressed(false);
            _syncReloading = false;
        }
    });
    onSyncMessage('ui:theme:changed', ({ payload }: any) => {
        if (!payload?.preference) return;
        setSuppressed(true);
        import('../theme/manager.js' as string)
            .then((m: any) => m.setThemePreference(payload.preference))
            .catch((e: any) => console.warn('[BroadcastSync] Theme sync failed:', e.message))
            .finally(() => setSuppressed(false));
    });
    onSyncMessage('ui:language:changed', ({ payload }: any) => {
        if (!payload?.lang) return;
        setSuppressed(true);
        import('../i18n/translations.js' as string)
            .then((m: any) => m.setLanguage(payload.lang))
            .catch((e: any) => console.warn('[BroadcastSync] Language sync failed:', e.message))
            .finally(() => setSuppressed(false));
    });
    onSyncMessage('auth:session:changed', () => {
        setSuppressed(true);
        import('../storage/syncQueue.js' as string)
            .then((sq: any) => {
                window.dispatchEvent(new CustomEvent('authChanged'));
                return sq.flushSyncQueue({ force: false });
            })
            .catch((_e: any) => console.debug('[broadcastSyncInit:silent-catch]', _e?.message || _e))
            .finally(() => setSuppressed(false));
    });
}
