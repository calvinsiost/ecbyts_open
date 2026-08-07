// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PACK VERSION HISTORY - historico de versoes de pipeline packs
   (PIPELINE-UNIFIED-PROTOCOL #13 / RF13).

   Compara versoes do pack (fonte, protocolo e variantes) e gera
   log de changelog ordenado por versao descendente.

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   ================================================================ */

export interface VersionEntry {
    readonly version: number;
    readonly timestamp: string;
    readonly author: string;
    readonly changes: ReadonlyArray<string>;
}

export interface VersionDiff {
    readonly added: ReadonlyArray<string>;
    readonly removed: ReadonlyArray<string>;
    readonly unchanged: ReadonlyArray<string>;
}

export function diffVersions(a: VersionEntry, b: VersionEntry): VersionDiff {
    const setA = new Set(a.changes);
    const setB = new Set(b.changes);

    const added = b.changes.filter((c) => !setA.has(c));
    const removed = a.changes.filter((c) => !setB.has(c));
    const unchanged = a.changes.filter((c) => setB.has(c));

    return { added, removed, unchanged };
}

export function buildHistoryLog(entries: ReadonlyArray<VersionEntry>): string {
    const sorted = [...entries].sort((x, y) => y.version - x.version);

    return sorted
        .map((entry) => {
            const date = entry.timestamp.slice(0, 10);
            const lines = entry.changes.map((c) => `- ${c}`).join('\n');
            return `## v${entry.version} — ${date} (autor: ${entry.author})\n${lines}`;
        })
        .join('\n\n');
}
