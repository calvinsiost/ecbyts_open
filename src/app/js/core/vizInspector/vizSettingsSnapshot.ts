// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * vizSettingsSnapshot.js - Snapshot imutavel + diff de vizSettings
 *
 * Cria snapshots versionados de configuracoes de visualizacao e compara
 * dois snapshots retornando as chaves alteradas (semantica git-like).
 */

export interface VizSettingsSnapshot {
    id: string;
    label: string;
    settings: Record<string, unknown>;
    createdAt: number;
}

export interface SnapshotWithSettings {
    settings: Record<string, unknown>;
}

/**
 * Cria snapshot imutavel de vizSettings.
 * @param {Object} settings - objeto de configuracoes atual
 * @param {string} [unknown>] - rotulo opcional para identificacao humana
 * @returns {{ id: string, label: string, settings: Object, createdAt: number }}
 */
export function createSnapshot(
    settings: Record<string, unknown>,
    label: string = '',
): VizSettingsSnapshot {
    if (settings === null || typeof settings !== 'object') {
        throw new TypeError('createSnapshot: settings deve ser um objeto');
    }
    return {
        id: crypto.randomUUID(),
        label: String(label),
        settings: JSON.parse(JSON.stringify(settings)), // deep clone — imutavel
        createdAt: Date.now(),
    };
}

/**
 * Compara dois snapshots e retorna lista de chaves cujos valores diferem.
 * Inclui chaves presentes em apenas um dos snapshots (adicionadas/removidas).
 * @param {{ settings: Record<string, any> }} snapshotA
 * @param {{ settings: Record<string, any> }} snapshotB
 * @returns {string[]} array de chaves alteradas
 */
export function diffSnapshots(
    snapshotA: SnapshotWithSettings,
    snapshotB: SnapshotWithSettings,
): string[] {
    const keys = new Set([...Object.keys(snapshotA.settings), ...Object.keys(snapshotB.settings)]);
    const changed: string[] = [];
    for (const key of keys) {
        const a = JSON.stringify(snapshotA.settings[key]);
        const b = JSON.stringify(snapshotB.settings[key]);
        if (a !== b) changed.push(key);
    }
    return changed;
}

/**
 * Retorna true se os dois snapshots possuem settings identicos (diff vazio).
 * @param {{ settings: Record<string, any> }} snapshotA
 * @param {{ settings: Record<string, any> }} snapshotB
 * @returns {boolean}
 */
export function snapshotsAreEqual(
    snapshotA: SnapshotWithSettings,
    snapshotB: SnapshotWithSettings,
): boolean {
    return diffSnapshots(snapshotA, snapshotB).length === 0;
}