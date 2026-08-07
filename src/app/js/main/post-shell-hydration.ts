// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { UI_INVALIDATION_DOMAINS } from './uiInvalidationRegistry.js';

const POST_SHELL_HYDRATION_INIT_DOMAINS = Object.freeze([
    UI_INVALIDATION_DOMAINS.STATUS,
    UI_INVALIDATION_DOMAINS.AUTH,
    UI_INVALIDATION_DOMAINS.HOME,
]);

const POST_SHELL_RANDOM_READY_DOMAINS = Object.freeze([
    UI_INVALIDATION_DOMAINS.STATUS,
    UI_INVALIDATION_DOMAINS.HOME,
]);

export interface PostShellHydrationContext {
    applySavedView: () => Promise<void>;
    documentRef: unknown;
    hydrateIcons: () => void;
    initCustomize: () => void;
    initHomeGrid: () => void;
    initHomeHeader?: () => void;
    initIconObserver: () => void;
    initSnapshotEngine: () => Promise<void>;
    loadedFromURL: boolean;
    localStorageRef: Storage;
    setBootPreparing: (preparing: boolean) => void;
    setCameraState: (state: unknown) => void;
    setHomePreparingRandom: (preparing: boolean) => void;
    showRandomBootState: boolean;
    translate: (key: string) => string | undefined;
    requestUIRefresh: (domain?: string, reason?: string) => void;
    updateLoading: (message: string, progress: number) => void;
}

function requestHydrationDomains(
    requestUIRefresh: (domain?: string, reason?: string) => void,
    domains: readonly string[],
    reason: string,
): void {
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}

export async function runPostShellHydrationSequence(
    {
        applySavedView,
        // eslint-disable-next-line
        documentRef,
        hydrateIcons,
        initCustomize,
        initHomeGrid,
        initHomeHeader,
        initIconObserver,
        initSnapshotEngine,
        loadedFromURL,
        localStorageRef,
        setBootPreparing,
        setCameraState,
        setHomePreparingRandom,
        showRandomBootState,
        translate,
        requestUIRefresh,
        updateLoading,
    }: PostShellHydrationContext,
): Promise<void> {
    updateLoading(translate('preparingInterface') || 'Preparing interface...', 90);
    hydrateIcons();
    initIconObserver();
    initCustomize();
    initHomeGrid();
    if (initHomeHeader) initHomeHeader();

    initSnapshotEngine().catch((_e: unknown) => console.debug('[main:silent-catch]', (_e as any)?.message || _e));

    requestHydrationDomains(requestUIRefresh, POST_SHELL_HYDRATION_INIT_DOMAINS, 'post-shell-hydration:init');
    await applySavedView();

    if (!loadedFromURL) {
        try {
            const raw = localStorageRef.getItem('ecbyts-camera-state');
            if (raw) setCameraState(JSON.parse(raw));
        } catch (e) {
            console.debug('[post-shell-hydration] cameraState:', (e as any)?.message || e);
            // corrupted state should not block boot
        }
    }

    if (showRandomBootState) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setHomePreparingRandom(false);
                setBootPreparing(false);
                requestHydrationDomains(
                    requestUIRefresh,
                    POST_SHELL_RANDOM_READY_DOMAINS,
                    'post-shell-hydration:random-ready',
                );
            });
        });
    }
}
