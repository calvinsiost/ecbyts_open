// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Generated from src/app/js/main/scene-bootstrap.ts by TS-MIGRATION-001. Do not edit manually.
import { loadTHREE } from '../core/three-lazy.js';
function runSafeSceneInit(name: string, fn: () => void) {
    try {
        fn();
    } catch (e: any) {
        console.error(`[ecbyts:sceneInit] ${name} failed:`, e?.message || e);
    }
}
export function registerSceneBootstrapSequence({ applyQualityTier, animate, documentRef, getCurrentQualityTier, getInterpolationGroup, getIssuesGroup, getPhotoMarkersGroup, getVoxelGroup, initCanvasContextMenu, initCompass, initConstellation, initContextMenu, initCursorProjector, initEditor, initGeoHud, initGizmo, initGlobe, initLabelRenderer, initLabels, initPicker, initPostProcessing, initScene, initSceneHud, markSceneReady, onSceneReady, rebindMeshesToScene, refreshPhotoMarkers, registerStrategies, restoreLabelDensity, setInterpolationGroup, setIssuesGroupRef, setPhotoMarkersGroup, setVoxelGroup, windowRef }: any) {
    initGeoHud();
    initSceneHud();
    onSceneReady(async () => {
        await loadTHREE();
        const container = documentRef.getElementById('canvas-container');
        initScene(container);
        markSceneReady();
        animate();
        runSafeSceneInit('interpolationGroup', () => setInterpolationGroup(getInterpolationGroup()));
        runSafeSceneInit('voxelGroup', () => setVoxelGroup(getVoxelGroup()));
        runSafeSceneInit('issuesGroup', () => setIssuesGroupRef(getIssuesGroup()));
        runSafeSceneInit('photoMarkersGroup', () => {
            setPhotoMarkersGroup(getPhotoMarkersGroup());
            refreshPhotoMarkers();
        });
        runSafeSceneInit('rebindMeshes', () => {
            const rebind = rebindMeshesToScene();
            if (rebind.attached > 0) {
                console.debug(`[ecbyts] Rebound ${rebind.attached} mesh(es) into scene group`);
            }
        });
        runSafeSceneInit('labelRenderer', () => initLabelRenderer(container));
        runSafeSceneInit('labels', () => initLabels());
        runSafeSceneInit('labelDensity', () => restoreLabelDensity());
        runSafeSceneInit('picker', () =>
            initPicker(container, {
                onSelect: (elementId: any) => windowRef.handleSelectElement(elementId),
                onDeselect: () => windowRef.handleSelectElement(null),
                onSelectLayer: (layerId: any) => windowRef.handleSelectLayer(layerId),
            }),
        );
        runSafeSceneInit('qualityTier', () => applyQualityTier(getCurrentQualityTier()));
        runSafeSceneInit('postProcessing', () => initPostProcessing());
        runSafeSceneInit('magnifier', () => {
            import('../utils/scene/magnifier.js' as string).then((m: any) => m.initMagnifier()).catch((e: any) => console.debug('[scene-bootstrap:lazy-magnifier:silent-catch]', e?.message || e));
        });
        runSafeSceneInit('editor', () => initEditor(container));
        runSafeSceneInit('gizmo', () => initGizmo());
        runSafeSceneInit('contextMenu', () => initContextMenu(container));
        runSafeSceneInit('canvasContextMenu', () => initCanvasContextMenu(container));
        runSafeSceneInit('strategies', registerStrategies);
        runSafeSceneInit('cursorProjector', () => initCursorProjector(container));
        runSafeSceneInit('compass', () => initCompass());
        runSafeSceneInit('globe', () => initGlobe());
        runSafeSceneInit('constellation', () =>
            initConstellation({
                onSelect: (elementId: any) => windowRef.handleSelectElement(elementId),
            }),
        );
        runSafeSceneInit('idleProcessor', () => {
            if (windowRef.localStorage.getItem('ecbyts-proactive-ai') !== '0') {
                import('../core/llm/idleAnalysisProcessor.js' as string)
                    .then(({ initIdleProcessor }: any) => initIdleProcessor())
                    .catch((e: any) => console.warn('[ecbyts] idle processor init failed:', e));
            }
        });
    });
}
