// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   SEQUENCER HANDLERS — Thin wrappers for Storyboard + Timeline
   Expoe funcoes no window.* para uso no HTML e API bridge.
   Toda logica real fica em core/sequencer/.
   ================================================================ */
import {
    initSequencer,
    refreshItems,
    getItems,
    getKeyframes,
    getLanes,
    getPlayback,
    addKeyframe,
    removeKeyframe,
    moveKeyframe,
    moveKeyframeToLane,
    updateKeyframe,
    createLane,
    deleteLane,
    renameLane,
    setPlaybackSpeed,
    setPlaybackLoop,
} from '../../core/sequencer/manager.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getAllScenes } from '../scenes/manager.js';
import { play, pause, stop, seek, flyToItem } from '../../core/sequencer/engine.js';
import {
    initStoryboardUI,
    destroyStoryboardUI,
    render as renderStoryboard,
    refreshThumbnails,
} from '../../core/sequencer/renderer.js';
import {
    canGenerateVideo,
    generateTimelineVideo,
    cancelGeneration,
    getProgress,
} from '../../core/sequencer/videoBot.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Sequencer');
// ----------------------------------------------------------------
// PUBLIC HANDLERS
// ----------------------------------------------------------------
async function handleInitSequencer() {
    await initSequencer();
    initStoryboardUI();
}
function handleRefreshStoryboard() {
    // Aplica viewStart sintetico em cenas sem camera - mesma logica de _executeRandomModel
    try {
        const allScenes = getAllScenes();
        const boundary = (getAllElements()).find((/** @type {any} */ e) => e.family === 'boundary') as any;
        if (boundary?.data?.vertices) {
            const vs = (boundary.data.vertices) as any[];
            const cx = vs.reduce((/** @type {number} */ s, v: any) => s + (v.x || 0), 0) / vs.length;
            const cz = vs.reduce((/** @type {number} */ s, v: any) => s + (v.z || 0), 0) / vs.length;
            const span = Math.max(
                ...vs.map((/** @type {any} */ v) => Math.abs(v.x || 0)),
                ...vs.map((/** @type {any} */ v) => Math.abs(v.z || 0)),
            );
            const camDist = Math.max(span * 2, 10);
            const presets = [
                { camera: { x: camDist, y: camDist, z: camDist }, target: { x: cx, y: 0, z: cz } },
                { camera: { x: cx, y: camDist * 1.5, z: cz }, target: { x: cx, y: 0, z: cz } },
                { camera: { x: cx, y: camDist * 0.3, z: cz + camDist }, target: { x: cx, y: 0, z: cz } },
            ];
            allScenes.forEach((/** @type {any} */ scene, i: number) => {
                if (!scene.viewStart) scene.viewStart = presets[i % presets.length];
            });
        }
    } catch (err: any) {
        log.debug('Boundary camera presets unavailable', /** @type {any} */ (err)?.message);
    }
    refreshItems();
}
function handleStoryboardPlay() {
    play();
}
function handleStoryboardPause() {
    pause();
}
function handleStoryboardStop() {
    stop();
}
function handleStoryboardSeek(position: any) {
    seek(Math.max(0, Math.min(1, Number(position) || 0)));
}
function handleStoryboardFlyTo(itemId: any) {
    flyToItem(itemId);
}
function handleAddStoryboardKeyframe(itemId: any, options: any) {
    return addKeyframe(itemId, options);
}
function handleRemoveStoryboardKeyframe(keyframeId: any) {
    removeKeyframe(keyframeId);
}
function handleMoveStoryboardKeyframe(keyframeId: any, newPosition: any) {
    moveKeyframe(keyframeId, newPosition);
}
function handleUpdateStoryboardKeyframe(keyframeId: any, updates: any) {
    updateKeyframe(keyframeId, updates);
    renderStoryboard();
}
function handleRefreshStoryboardThumbnails() {
    refreshThumbnails();
}
function handleSetStoryboardSpeed(speed: any) {
    setPlaybackSpeed(speed);
    renderStoryboard();
}
function handleToggleStoryboardLoop() {
    const pb = getPlayback();
    setPlaybackLoop(!pb.loop);
    renderStoryboard();
}
function handleGetStoryboardState() {
    return {
        items: getItems(),
        keyframes: getKeyframes(),
        playback: getPlayback(),
    };
}
function handleDestroyStoryboard() {
    destroyStoryboardUI();
}
// ----------------------------------------------------------------
// LANE HANDLERS
// ----------------------------------------------------------------
function handleGetStoryboardLanes() {
    return getLanes();
}
function handleCreateStoryboardLane(name: any) {
    return createLane(name);
}
function handleDeleteStoryboardLane(laneId: any) {
    deleteLane(laneId);
    renderStoryboard();
}
function handleRenameStoryboardLane(laneId: any, name: any) {
    renameLane(laneId, name);
    renderStoryboard();
}
function handleMoveKeyframeToLane(keyframeId: any, laneId: any) {
    moveKeyframeToLane(keyframeId, laneId);
    renderStoryboard();
}
// ----------------------------------------------------------------
// VIDEO BOT HANDLERS
// ----------------------------------------------------------------
async function handleGenerateTimelineVideo(options: any) {
    const check = canGenerateVideo();
    if (!check.canGenerate) {
        const { showToast } = await import('../ui/toast.js' as string);
        showToast(check.reason || 'Video generation is not available.', 'warning');
        return null;
    }
    return generateTimelineVideo(options);
}
function handleCancelVideoGeneration() {
    cancelGeneration();
}
function handleGetVideoProgress() {
    return getProgress();
}
function handleCanGenerateVideo() {
    return canGenerateVideo();
}
// ----------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------
export const sequencerHandlers = {
    handleInitSequencer,
    handleRefreshStoryboard,
    handleStoryboardPlay,
    handleStoryboardPause,
    handleStoryboardStop,
    handleStoryboardSeek,
    handleStoryboardFlyTo,
    handleAddStoryboardKeyframe,
    handleRemoveStoryboardKeyframe,
    handleMoveStoryboardKeyframe,
    handleSetStoryboardSpeed,
    handleToggleStoryboardLoop,
    handleGetStoryboardState,
    handleDestroyStoryboard,
    handleGenerateTimelineVideo,
    handleCancelVideoGeneration,
    handleGetVideoProgress,
    handleCanGenerateVideo,
    handleUpdateStoryboardKeyframe,
    handleRefreshStoryboardThumbnails,
    handleGetStoryboardLanes,
    handleCreateStoryboardLane,
    handleDeleteStoryboardLane,
    handleRenameStoryboardLane,
    handleMoveKeyframeToLane,
};
