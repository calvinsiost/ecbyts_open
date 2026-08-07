// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Diff Viewer pure logic (Phase 4 partial)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S4
 *
 * Phase 4 partial (2026-04-30) - pure logic do diff viewer. UI panel
 * (modal com tree expansível) é Phase 5 (browser-required).
 *
 * Foco: gerar diff hierárquico legível para humano, agrupado por seção
 * (elements, campaigns, observations, metadata, scenes, edges) com
 * contadores estáveis e classificação de tipo de mudança.
 *
 * API:
 *   - buildHierarchicalDiff(before, after) - diff por seção
 *   - summarizeDiff(diff) - sumário textual
 *   - classifyChange(beforeVal, afterVal) - 'added' | 'removed' | 'modified'
 *   - groupChangesBySection(changes) - agrupa por section/key
 *   - formatDiffTreeText(diff) - render texto plano (sem HTML)
 *
 * Owner: Claude
 */

interface ArrayDiff {
    added: any[];
    removed: any[];
    modifiedIds: string[];
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
}

interface MetaDiff {
    addedKeys: string[];
    removedKeys: string[];
    modifiedKeys: string[];
}

interface HierarchicalDiff {
    sections: Record<string, ArrayDiff>;
    metadata: MetaDiff;
    totals: { added: number; removed: number; modified: number };
    summary: string;
}

const SECTIONS = ['elements', 'campaigns', 'observations', 'metadata', 'scenes', 'edges'];

/**
 * Classifica tipo de mudança entre 2 valores.
 * @param {*} beforeVal
 * @param {*} afterVal
 * @returns {'added'|'removed'|'modified'|'unchanged'}
 */
export function classifyChange(
    beforeVal: any,
    afterVal: any,
): 'added' | 'removed' | 'modified' | 'unchanged' {
    const beforeMissing = beforeVal === undefined;
    const afterMissing = afterVal === undefined;
    if (beforeMissing && !afterMissing) return 'added';
    if (!beforeMissing && afterMissing) return 'removed';
    if (beforeMissing && afterMissing) return 'unchanged';

    // Both present - compare
    if (beforeVal === afterVal) return 'unchanged';
    try {
        if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) return 'unchanged';
    } catch (e) {
        console.debug('[diffViewer] jsonStringify:', (e as any)?.message || e);
        // fall through
    }
    return 'modified';
}

/**
 * Diff de array por id (heurística para arrays de objetos com `id`).
 * Retorna `{ added: [items], removed: [items], modifiedIds: [ids] }`.
 *
 * @param {Array<any>} beforeArr
 * @param {Array<any>} afterArr
 * @returns {{ added: Array<any>, removed: Array<any>, modifiedIds: Array<string>, addedCount: number, removedCount: number, modifiedCount: number }}
 */
export function diffArrayById(beforeArr: any[], afterArr: any[]): ArrayDiff {
    const safeBefore = Array.isArray(beforeArr) ? beforeArr : [];
    const safeAfter = Array.isArray(afterArr) ? afterArr : [];

    const beforeMap = new Map<string, any>();
    for (const item of safeBefore) {
        if (item && item.id != null) beforeMap.set(String(item.id), item);
    }
    const afterMap = new Map<string, any>();
    for (const item of safeAfter) {
        if (item && item.id != null) afterMap.set(String(item.id), item);
    }

    const added: any[] = [];
    const removed: any[] = [];
    const modifiedIds: string[] = [];

    for (const [id, item] of afterMap) {
        if (!beforeMap.has(id)) {
            added.push(item);
        } else {
            const before = beforeMap.get(id);
            try {
                if (JSON.stringify(before) !== JSON.stringify(item)) {
                    modifiedIds.push(id);
                }
            } catch (e) {
                console.debug('[diffViewer] arrayJson:', (e as any)?.message || e);
                if (before !== item) modifiedIds.push(id);
            }
        }
    }
    for (const [id, item] of beforeMap) {
        if (!afterMap.has(id)) removed.push(item);
    }

    return {
        added,
        removed,
        modifiedIds,
        addedCount: added.length,
        removedCount: removed.length,
        modifiedCount: modifiedIds.length,
    };
}

/**
 * Diff hierárquico estruturado por seção.
 *
 * @param {Record<string, any>} before
 * @param {Record<string, any>} any>
 * @returns {{
 *   sections: Record<string, ReturnType<typeof diffArrayById>>,
 *   metadata: { addedKeys: string[], removedKeys: string[], modifiedKeys: string[] },
 *   totals: { added: number, removed: number, modified: number },
 *   summary: string
 * }}
 */
export function buildHierarchicalDiff(
    before: Record<string, any>,
    after: Record<string, any>,
): HierarchicalDiff {
    const safeBefore = before && typeof before === 'object' && !Array.isArray(before) ? before : {};
    const safeAfter = after && typeof after === 'object' && !Array.isArray(after) ? after : {};

    const sections: Record<string, ArrayDiff> = {};
    let totalAdded = 0;
    let totalRemoved = 0;
    let totalModified = 0;

    // Array sections (id-keyed)
    for (const section of ['elements', 'campaigns', 'observations', 'scenes', 'edges']) {
        const sectionDiff = diffArrayById(safeBefore[section], safeAfter[section]);
        sections[section] = sectionDiff;
        totalAdded += sectionDiff.addedCount;
        totalRemoved += sectionDiff.removedCount;
        totalModified += sectionDiff.modifiedCount;
    }

    // Metadata (object key-by-key)
    const metaDiff: MetaDiff = { addedKeys: [], removedKeys: [], modifiedKeys: [] };
    const beforeMeta = safeBefore.metadata && typeof safeBefore.metadata === 'object' ? safeBefore.metadata : {};
    const afterMeta = safeAfter.metadata && typeof safeAfter.metadata === 'object' ? safeAfter.metadata : {};
    const allMetaKeys = new Set([...Object.keys(beforeMeta), ...Object.keys(afterMeta)]);
    for (const key of allMetaKeys) {
        const change = classifyChange(beforeMeta[key], afterMeta[key]);
        if (change === 'added') metaDiff.addedKeys.push(key);
        else if (change === 'removed') metaDiff.removedKeys.push(key);
        else if (change === 'modified') metaDiff.modifiedKeys.push(key);
    }
    totalAdded += metaDiff.addedKeys.length;
    totalRemoved += metaDiff.removedKeys.length;
    totalModified += metaDiff.modifiedKeys.length;

    const totals = { added: totalAdded, removed: totalRemoved, modified: totalModified };
    const summary = formatTotalsSummary(totals);

    return { sections, metadata: metaDiff, totals, summary };
}

/**
 * Formata totais em string curta legível.
 * @param {{added: number, removed: number, modified: number}} totals
 * @returns {string}
 */
export function formatTotalsSummary(totals: { added: number; removed: number; modified: number }): string {
    const parts = [];
    if (totals.added > 0) parts.push(`+${totals.added} added`);
    if (totals.removed > 0) parts.push(`-${totals.removed} removed`);
    if (totals.modified > 0) parts.push(`~${totals.modified} modified`);
    if (parts.length === 0) return 'no changes';
    return parts.join(', ');
}

/**
 * Sumário textual em uma única linha por seção.
 * @param {ReturnType<typeof buildHierarchicalDiff>} diff
 * @returns {string[]} array de linhas
 */
export function summarizeDiff(diff: HierarchicalDiff): string[] {
    if (!diff || typeof diff !== 'object') return [];
    const lines = [];

    for (const section of ['elements', 'campaigns', 'observations', 'scenes', 'edges']) {
        const s = diff.sections?.[section];
        if (!s) continue;
        if (s.addedCount + s.removedCount + s.modifiedCount === 0) continue;
        const parts = [];
        if (s.addedCount > 0) parts.push(`+${s.addedCount}`);
        if (s.removedCount > 0) parts.push(`-${s.removedCount}`);
        if (s.modifiedCount > 0) parts.push(`~${s.modifiedCount}`);
        lines.push(`${section}: ${parts.join(' ')}`);
    }

    if (diff.metadata) {
        const { addedKeys, removedKeys, modifiedKeys } = diff.metadata;
        if (addedKeys.length + removedKeys.length + modifiedKeys.length > 0) {
            const parts = [];
            if (addedKeys.length > 0) parts.push(`+${addedKeys.length}`);
            if (removedKeys.length > 0) parts.push(`-${removedKeys.length}`);
            if (modifiedKeys.length > 0) parts.push(`~${modifiedKeys.length}`);
            lines.push(`metadata: ${parts.join(' ')}`);
        }
    }

    if (lines.length === 0) lines.push('no changes');
    return lines;
}

/**
 * Renderiza diff como texto plano (não HTML - usável em CLI/log).
 *
 * Formato:
 *   ## elements (+2 -1 ~3)
 *   + el-new-1
 *   + el-new-2
 *   - el-removed
 *   ~ el-mod-1
 *
 * @param {ReturnType<typeof buildHierarchicalDiff>} diff
 * @param {{ maxItemsPerSection?: number }} [options] - corta após N items por seção (default 10)
 * @returns {string}
 */
export function formatDiffTreeText(
    diff: HierarchicalDiff,
    options: { maxItemsPerSection?: number } = {},
): string {
    const maxItems = Number.isInteger(options.maxItemsPerSection)
        ? (options.maxItemsPerSection as number)
        : 10;
    if (!diff || typeof diff !== 'object') return '(invalid diff)';

    const lines = [];
    lines.push(
        `# Diff Summary: ${diff.summary || formatTotalsSummary(diff.totals || { added: 0, removed: 0, modified: 0 })}`,
    );
    lines.push('');

    for (const section of ['elements', 'campaigns', 'observations', 'scenes', 'edges']) {
        const s = diff.sections?.[section];
        if (!s) continue;
        if (s.addedCount + s.removedCount + s.modifiedCount === 0) continue;

        lines.push(`## ${section} (+${s.addedCount} -${s.removedCount} ~${s.modifiedCount})`);
        // Added items
        for (let i = 0; i < Math.min(s.added.length, maxItems); i++) {
            const item = s.added[i];
            lines.push(`+ ${item?.id || '(no-id)'}`);
        }
        if (s.added.length > maxItems) lines.push(`+ ... (+${s.added.length - maxItems} more)`);
        // Removed items
        for (let i = 0; i < Math.min(s.removed.length, maxItems); i++) {
            const item = s.removed[i];
            lines.push(`- ${item?.id || '(no-id)'}`);
        }
        if (s.removed.length > maxItems) lines.push(`- ... (-${s.removed.length - maxItems} more)`);
        // Modified ids
        for (let i = 0; i < Math.min(s.modifiedIds.length, maxItems); i++) {
            lines.push(`~ ${s.modifiedIds[i]}`);
        }
        if (s.modifiedIds.length > maxItems) lines.push(`~ ... (~${s.modifiedIds.length - maxItems} more)`);
        lines.push('');
    }

    if (diff.metadata) {
        const m = diff.metadata;
        const total = m.addedKeys.length + m.removedKeys.length + m.modifiedKeys.length;
        if (total > 0) {
            lines.push(`## metadata (+${m.addedKeys.length} -${m.removedKeys.length} ~${m.modifiedKeys.length})`);
            for (const k of m.addedKeys.slice(0, maxItems)) lines.push(`+ ${k}`);
            for (const k of m.removedKeys.slice(0, maxItems)) lines.push(`- ${k}`);
            for (const k of m.modifiedKeys.slice(0, maxItems)) lines.push(`~ ${k}`);
        }
    }

    return lines.join('\n').trim();
}

/**
 * Module identity export.
 */
export const ecbtDiffViewerMeta = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES',
    phase: '4-partial',
    deliveredAt: '2026-04-30',
    exports: [
        'classifyChange',
        'diffArrayById',
        'buildHierarchicalDiff',
        'summarizeDiff',
        'formatDiffTreeText',
        'formatTotalsSummary',
    ],
    sections: SECTIONS,
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
};
