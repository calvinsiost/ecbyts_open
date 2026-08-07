// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (utils/scenes/manager).
//
// Aplicação direta da recomendação #8 do scripts/refactor-opportunities.mjs:
// utils/scenes/manager.ts tem fan-in 14 no maior SCC + é target de top cut
// 'utils/scenes/manager → utils/scene/controls' (score 86). Extrair pure CRUD
// + normalizeScene libera carve-out para callers (sequencer, export, import)
// sem trazer side-effects de IDB/_persist.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler module state (scenes[] — caller passa array)
// - NÃO chamar getCameraState — caller injeta state via captureViewStart/End
// - NÃO persistir (_persist é side-effect — caller chama após mutação)
// - NÃO ler IDB (initScenes side-effect fica no manager)
// - NÃO emoji
//
// Extracted helpers:
//   - SceneLike / CameraStateLike / SceneCounter (types canonical)
//   - SCENE_DEFAULT_FIELDS                  (frozen shape sem id/name)
//   - normalizeSceneShape(scene, fallbackId, fallbackName)
//   - createSceneId(counter)                pure ID generator (returns {id, next})
//   - addSceneToArray(scenes, scene)        pure (returns new array)
//   - updateSceneInArray(scenes, id, updates)  pure (returns {array, updated})
//   - removeSceneFromArray(scenes, id)      pure (returns {array, removed})
//   - serializeScenesArray(scenes)          pure deep copy for export
//   - importScenesArray(imported, fallback) pure normalization
//   - isValidSceneShape(value)              type-guard

export interface CameraStateLike {
    camera: { x: number; y: number; z: number; zoom: number };
    target: { x: number; y: number; z: number };
}

export interface SceneLike {
    id: string;
    name: string;
    viewStart: CameraStateLike | null;
    viewEnd: CameraStateLike | null;
    campaignsStart: string[];
    campaignsEnd: string[];
    elementVisibility: Record<string, boolean>;
    [key: string]: unknown;
}

/**
 * Frozen default fields for a Scene (sem id/name — caller injeta).
 * Matches normalizeScene body @ scenes/manager.ts:46-56.
 */
export const SCENE_DEFAULT_FIELDS: Readonly<Omit<SceneLike, 'id' | 'name'>> = Object.freeze({
    viewStart: null,
    viewEnd: null,
    campaignsStart: [] as string[],
    campaignsEnd: [] as string[],
    elementVisibility: {} as Record<string, boolean>,
});

/**
 * Normalize scene shape — guarantees fields exist with proper types.
 * Caller passa fallbackId/fallbackName quando scene não traz id/name próprio.
 *
 * Matches normalizeScene @ scenes/manager.ts:46-56 (mas pure — sem createId
 * side-effect; caller decide o id via createSceneId abaixo).
 */
export function normalizeSceneShape(
    scene: Partial<SceneLike> | null | undefined,
    fallbackId: string,
    fallbackName: string,
): SceneLike {
    const s = scene || {};
    return {
        id: typeof s.id === 'string' && s.id.length > 0 ? s.id : fallbackId,
        name: typeof s.name === 'string' && s.name.length > 0 ? s.name : fallbackName,
        viewStart: s.viewStart || null,
        viewEnd: s.viewEnd || null,
        campaignsStart: Array.isArray(s.campaignsStart) ? s.campaignsStart.slice() : [],
        campaignsEnd: Array.isArray(s.campaignsEnd) ? s.campaignsEnd.slice() : [],
        elementVisibility:
            s.elementVisibility && typeof s.elementVisibility === 'object'
                ? { ...s.elementVisibility }
                : {},
    };
}

/**
 * Pure ID generator — returns next id and updated counter.
 * Caller passa current counter, recebe {id, nextCounter}.
 *
 * Matches createId @ scenes/manager.ts:42-45 (mas pure).
 */
export function createSceneId(counter: number): { id: string; nextCounter: number } {
    const safe = Number.isFinite(counter) && counter >= 0 ? Math.floor(counter) : 0;
    const next = safe + 1;
    return { id: `scene-${next}`, nextCounter: next };
}

/**
 * Pure add: returns new array with scene appended.
 * Matches addScene mutation @ scenes/manager.ts:69-74 (pure version).
 */
export function addSceneToArray(scenes: ReadonlyArray<SceneLike>, scene: SceneLike): SceneLike[] {
    return scenes.concat([scene]);
}

/**
 * Pure update: returns {array, updated} or {array, updated: null} se não encontrar.
 * Garante que arrays/objetos sejam normalizados após merge (compat updateScene).
 *
 * Matches updateScene mutation @ scenes/manager.ts:75-84 (pure version).
 */
export function updateSceneInArray(
    scenes: ReadonlyArray<SceneLike>,
    id: string,
    updates: Partial<SceneLike>,
): { array: SceneLike[]; updated: SceneLike | null } {
    let found: SceneLike | null = null;
    const array = scenes.map((scene) => {
        if (scene.id !== id) return scene;
        const merged: SceneLike = { ...scene, ...updates };
        // Re-normalize arrays/objetos como updateScene faz @ linhas 79-81
        merged.campaignsStart = Array.isArray(merged.campaignsStart) ? merged.campaignsStart : [];
        merged.campaignsEnd = Array.isArray(merged.campaignsEnd) ? merged.campaignsEnd : [];
        merged.elementVisibility = merged.elementVisibility || {};
        found = merged;
        return merged;
    });
    return { array, updated: found };
}

/**
 * Pure remove: returns {array, removed: boolean}.
 * Matches removeScene mutation @ scenes/manager.ts:85-91 (pure version).
 */
export function removeSceneFromArray(
    scenes: ReadonlyArray<SceneLike>,
    id: string,
): { array: SceneLike[]; removed: boolean } {
    const idx = scenes.findIndex((scene) => scene.id === id);
    if (idx === -1) return { array: scenes.slice(), removed: false };
    const array = scenes.slice();
    array.splice(idx, 1);
    return { array, removed: true };
}

/**
 * Pure deep copy for export (cada scene clonada).
 * Matches exportScenes @ scenes/manager.ts:110-112.
 */
export function serializeScenesArray(scenes: ReadonlyArray<SceneLike>): SceneLike[] {
    return scenes.map((scene) => ({
        ...scene,
        campaignsStart: Array.isArray(scene.campaignsStart) ? scene.campaignsStart.slice() : [],
        campaignsEnd: Array.isArray(scene.campaignsEnd) ? scene.campaignsEnd.slice() : [],
        elementVisibility:
            scene.elementVisibility && typeof scene.elementVisibility === 'object'
                ? { ...scene.elementVisibility }
                : {},
    }));
}

/**
 * Pure import: normalize array of imported scenes.
 * Não-array → returns { array: [], counter: 0 } (matches importScenes invalid-input).
 * Array → normaliza cada scene, atualiza counter para length.
 *
 * Matches importScenes @ scenes/manager.ts:113-123 (pure version).
 */
export function importScenesArray(
    imported: unknown,
    nameTemplate: (index: number) => string = (i) => `Cena ${i + 1}`,
): { array: SceneLike[]; counter: number } {
    if (!Array.isArray(imported)) {
        return { array: [], counter: 0 };
    }
    let counter = 0;
    const array = imported.map((raw: any) => {
        counter += 1;
        return normalizeSceneShape(raw, `scene-${counter}`, nameTemplate(counter - 1));
    });
    return { array, counter };
}

/**
 * Type-guard for SceneLike shape (boundary validation).
 * Aceita scenes vindas de IDB / ECBT import / API.
 */
export function isValidSceneShape(value: unknown): value is SceneLike {
    if (!value || typeof value !== 'object') return false;
    const s = value as SceneLike;
    if (typeof s.id !== 'string' || s.id.length === 0) return false;
    if (typeof s.name !== 'string') return false;
    return true;
}
