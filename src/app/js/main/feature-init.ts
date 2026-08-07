// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export async function runFeatureInitSequence({
    withInitTimeout,
    initGroups,
    initReport,
    initFilterPresets,
    initTicker,
    initTickerBar,
    initGeoHud,
    initSceneHud,
    initCalculator,
    registerCalculatorBridge,
    getCalculatorItems,
    initConstants,
    initInterpolation,
    initVoxel,
    features,
    setMarkerRefreshCallback,
    refreshAllMarkers,
    loadIssues,
    documentRef,
    initBountyPanel,
    updateBountyBadge,
    initHudCards,
    initHudCardsPanel,
    initEquipmentHud,
    initEquipmentHudPanel,
    initVizSettings,
    initVizSettingsBar,
    initSymbology,
    initInspector,
    initInspectorPanel
}: any) {
    // BUG-018 fix (boot resiliência per-init): uma init que LANCE ou TRAVE não pode
    // mais derrubar toda a sequência (e, por tabela, tudo que vem DEPOIS no main.ts —
    // setupGlobalEventListeners, runFeaturePostEventsSequence E a init das abas /
    // TAB-MODEL-SWITCH na linha ~926). Cada init síncrona vai num try/catch isolado;
    // as assíncronas usam withInitTimeout (que já engole erro + timeout). Antes,
    // `await loadIssues()` SEM timeout podia travar o boot indefinidamente (await que
    // nunca resolve) e initX() síncronas podiam lançar — truncando o boot em silêncio.
    const safe = (label: string, fn: () => void) => {
        try {
            fn();
        } catch (e: any) {
            console.error(`[boot:init:${label}]`, e?.message || e);
        }
    };
    safe('Groups', initGroups);
    await withInitTimeout(() => initReport(), 'Report');
    safe('FilterPresets', initFilterPresets);
    safe('Ticker', initTicker);
    safe('TickerBar', initTickerBar);
    safe('GeoHud', initGeoHud);
    safe('SceneHud', initSceneHud);
    safe('Calculator', initCalculator);
    safe('CalculatorBridge', () => registerCalculatorBridge({ getCalculatorItems }));
    safe('Constants', initConstants);
    await withInitTimeout(() => initInterpolation(), 'Interpolation');
    await withInitTimeout(() => initVoxel(), 'Voxel');
    if (features.ISSUES_3D) {
        safe('MarkerCallback', () => setMarkerRefreshCallback(refreshAllMarkers));
        await withInitTimeout(() => loadIssues(), 'Issues'); // FIX: timeout (não trava o boot)
        safe('RefreshMarkers', () => refreshAllMarkers());
        safe('BountyPanel', () => {
            const bountyTab = documentRef?.getElementById('tab-bounty');
            if (bountyTab) initBountyPanel(bountyTab);
        });
        safe('BountyBadge', () => updateBountyBadge());
    }
    safe('HudCards', initHudCards);
    safe('HudCardsPanel', initHudCardsPanel);
    if (features.EQUIPMENT_HUD_V1) {
        safe('EquipmentHud', initEquipmentHud);
        safe('EquipmentHudPanel', initEquipmentHudPanel);
    }
    safe('VizSettings', initVizSettings);
    safe('VizSettingsBar', initVizSettingsBar);
    safe('Symbology', initSymbology);
    safe('Inspector', initInspector);
    safe('InspectorPanel', initInspectorPanel);
    import('../core/nn/panelRenderer.js')
        .then((mod) => mod.initMLPanel())
        .catch((_e) => console.debug('[main:silent-catch]', _e?.message || _e));
}

const FIELD_META_MIGRATION_IDLE_TIMEOUT_MS = 5000;
const FIELD_META_MIGRATION_BOOT_DEFER_MS = 30000;

export function scheduleFieldMetaLegacyMigration() {
    const runMigration = () => {
        import('../core/fieldMeta/migration.js')
            .then((mod) => mod.migrateLegacyFieldMetaFromBoot?.())
            .catch((e) => console.debug('[field-meta] migration skipped:', e?.message));
    };
    setTimeout(() => {
        const requestIdle = (globalThis as any).requestIdleCallback;
        if (typeof requestIdle === 'function') {
            requestIdle(runMigration, { timeout: FIELD_META_MIGRATION_IDLE_TIMEOUT_MS });
            return;
        }
        runMigration();
    }, FIELD_META_MIGRATION_BOOT_DEFER_MS);
}

export function runFeaturePostEventsSequence({
    initProjectAreas,
    initAreasTree,
    initAnalyticsModule,
    initUncertaintyHubPanel,
    initFormAccessibility
}: any) {
    // BUG-018 fix: isola cada init síncrona (esta sequência é chamada SEM await no
    // main.ts ~919, então um throw aqui propaga e truncaria a init das abas na ~926).
    const safe = (label: string, fn: () => void) => {
        try {
            fn();
        } catch (e: any) {
            console.error(`[boot:post:${label}]`, e?.message || e);
        }
    };
    safe('ProjectAreas', initProjectAreas);
    safe('AreasTree', initAreasTree);
    safe('AnalyticsModule', initAnalyticsModule);
    safe('UncertaintyHubPanel', initUncertaintyHubPanel);
    import('../utils/ui/fieldMetaPopover.js')
        .then((mod) => mod.installFieldMetaPopoverListener?.())
        .catch((e) => console.debug('[field-meta] popover listener skipped:', e?.message));
    safe('FieldMetaMigration', scheduleFieldMetaLegacyMigration);
    safe('FormAccessibility', initFormAccessibility);
    import('../utils/ui/mascotDraggable.js')
        .then((mod) => {
        const fab = (typeof document !== 'undefined') ? document.getElementById('ai-widget-fab') : null;
        if (fab && mod?.initMascotDraggable) mod.initMascotDraggable(fab);
    })
        .catch((e) => console.debug('[mascot-draggable] init skipped:', e?.message));
    import('../utils/ui/geoHudCardOrder.js')
        .then((mod) => {
        if (mod?.initGeoHudCardOrder) mod.initGeoHudCardOrder();
    })
        .catch((e) => console.debug('[geo-hud-card-order] init skipped:', e?.message));
    import('../core/crypto/aesVault.js')
        .then((v) => v.initVaultKey())
        .catch((e) => {
        import('../utils/helpers/securityLogger.js')
            .then((sl) => sl.logSecurityEvent('crypto', 'error', 'vault init failed', { err: e?.message }))
            .catch(() => console.error('[ecbyts:security:crypto] vault init failed:', e?.message));
    });
}
//# sourceMappingURL=feature-init.js.map
