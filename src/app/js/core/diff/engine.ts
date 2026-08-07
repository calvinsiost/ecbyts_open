// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DIFF ENGINE — Structural comparison and merge of project models
   Motor de diferenciacao estrutural e merge de modelos
   ================================================================ */

import {
    deepEqual,
    deepClone,
    buildIdMap,
    diffFlatObjects,
    describePath,
    type DiffChange,
} from './helpers.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface IdentifiedItem {
    readonly id: string;
    readonly [key: string]: unknown;
}

export type ProjectModel = Record<string, unknown>;

export interface DiffMetadata {
    readonly timestampA: unknown;
    readonly timestampB: unknown;
    readonly versionA: unknown;
    readonly versionB: unknown;
    readonly modelIdA: unknown;
    readonly modelIdB: unknown;
}

export interface ScalarSection {
    readonly changes: DiffChange[];
}

export interface ModifiedItem {
    readonly id: string;
    readonly name?: string;
    readonly changes: DiffChange[];
}

export interface CollectionSection {
    readonly added: Array<{ readonly id: string; readonly item: IdentifiedItem }>;
    readonly removed: Array<{ readonly id: string; readonly item: IdentifiedItem }>;
    readonly modified: ModifiedItem[];
}

export interface FamiliesSection {
    readonly added: Array<{ readonly id: string; readonly item: unknown }>;
    readonly removed: Array<{ readonly id: string; readonly item: unknown }>;
    readonly modified: Array<{ readonly id: string; readonly changes: DiffChange[] }>;
}

export type DiffSection = ScalarSection | CollectionSection | FamiliesSection;

export interface DependencyWarning {
    readonly type: string;
    readonly severity: string;
    readonly message: string;
    readonly [extra: string]: unknown;
}

export interface DiffStats {
    total: number;
    additions: number;
    removals: number;
    conflicts: number;
}

export interface DiffResult {
    metadata: DiffMetadata;
    sections: Record<string, DiffSection>;
    dependencies: DependencyWarning[];
    stats: DiffStats;
}

export type DecisionValue = 'A' | 'B' | { readonly custom: unknown };
export type DecisionMap = Record<string, DecisionValue | undefined>;

export interface DeltaEntry {
    readonly path: string;
    readonly action: string;
    readonly from?: unknown;
    readonly to?: unknown;
    readonly id?: string;
    readonly value?: unknown;
}

export interface MergeResult {
    readonly merged: ProjectModel;
    readonly delta: DeltaEntry[];
}

export interface DeltaSummary {
    readonly total: number;
    readonly accepted_A: number;
    readonly accepted_B: number;
    readonly custom: number;
    readonly rejected: number;
}

export interface FormattedDelta {
    readonly timestamp: string;
    readonly summary: DeltaSummary;
    readonly entries: ReadonlyArray<DeltaEntry & { readonly description: string }>;
}

// ----------------------------------------------------------------
// internal narrow helpers
// ----------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function asIdentifiedArray(value: unknown): IdentifiedItem[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is IdentifiedItem =>
        v !== null && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string',
    );
}

// ----------------------------------------------------------------
// DIFF MODELS
// ----------------------------------------------------------------

export function diffModels(modelA: ProjectModel | null | undefined, modelB: ProjectModel | null | undefined): DiffResult {
    const a = asRecord(modelA);
    const b = asRecord(modelB);
    const diff: DiffResult = {
        metadata: {
            timestampA: a.timestamp ?? null,
            timestampB: b.timestamp ?? null,
            versionA: a.ecbyts ?? null,
            versionB: b.ecbyts ?? null,
            modelIdA: a.modelId ?? null,
            modelIdB: b.modelId ?? null,
        },
        sections: {},
        dependencies: [],
        stats: { total: 0, additions: 0, removals: 0, conflicts: 0 },
    };

    // 1. Diff scalar sections
    diff.sections['project'] = diffScalarSection(asRecord(a.project), asRecord(b.project), 'project');
    diff.sections['coordinate'] = diffScalarSection(asRecord(a.coordinate), asRecord(b.coordinate), 'coordinate');

    // 2. Diff ID-indexed collections
    diff.sections['elements'] = diffCollection(asIdentifiedArray(a.elements), asIdentifiedArray(b.elements), 'elements');
    diff.sections['edges'] = diffCollection(asIdentifiedArray(a.edges), asIdentifiedArray(b.edges), 'edges');
    diff.sections['campaigns'] = diffCollection(asIdentifiedArray(a.campaigns), asIdentifiedArray(b.campaigns), 'campaigns');
    diff.sections['scenes'] = diffCollection(asIdentifiedArray(a.scenes), asIdentifiedArray(b.scenes), 'scenes');

    // 3. Diff families (object keyed by family ID)
    diff.sections['families'] = diffFamilies(asRecord(a.families), asRecord(b.families));

    // 4. Diff governance data if present
    if (a.contracts || b.contracts) {
        diff.sections['contracts'] = diffCollection(
            asIdentifiedArray(a.contracts),
            asIdentifiedArray(b.contracts),
            'contracts',
        );
    }
    if (a.wbs || b.wbs) {
        diff.sections['wbs'] = diffCollection(asIdentifiedArray(a.wbs), asIdentifiedArray(b.wbs), 'wbs');
    }

    // 5. Detect second-order dependencies
    diff.dependencies = detectDependencies(a, b, diff);

    // 6. Calculate stats
    computeStats(diff);

    return diff;
}

function diffScalarSection(a: Record<string, unknown>, b: Record<string, unknown>, sectionName: string): ScalarSection {
    const flatA: Record<string, unknown> = {};
    const flatB: Record<string, unknown> = {};
    const arrayChanges: DiffChange[] = [];

    for (const [key, val] of Object.entries(a)) {
        if (Array.isArray(val)) {
            if (!deepEqual(val, b[key])) {
                arrayChanges.push({
                    path: [sectionName, key],
                    type: 'modified',
                    valueA: val,
                    valueB: b[key] ?? undefined,
                });
            }
        } else {
            flatA[key] = val;
        }
    }
    for (const [key, val] of Object.entries(b)) {
        if (Array.isArray(val)) {
            if (!Object.prototype.hasOwnProperty.call(a, key)) {
                arrayChanges.push({
                    path: [sectionName, key],
                    type: 'added',
                    valueA: undefined,
                    valueB: val,
                });
            }
        } else {
            flatB[key] = val;
        }
    }

    const changes = diffFlatObjects(flatA, flatB, [sectionName]);
    return { changes: [...changes, ...arrayChanges] };
}

function diffCollection(arrayA: IdentifiedItem[], arrayB: IdentifiedItem[], sectionName: string): CollectionSection {
    const mapA = buildIdMap(arrayA);
    const mapB = buildIdMap(arrayB);

    const added: CollectionSection['added'] = [];
    const removed: CollectionSection['removed'] = [];
    const modified: ModifiedItem[] = [];

    for (const [id, itemA] of mapA) {
        if (!mapB.has(id)) {
            removed.push({ id: String(id), item: itemA as IdentifiedItem });
        }
    }

    for (const [id, itemB] of mapB) {
        if (!mapA.has(id)) {
            added.push({ id: String(id), item: itemB as IdentifiedItem });
        }
    }

    for (const [id, itemA] of mapA) {
        if (mapB.has(id)) {
            const itemB = mapB.get(id) as IdentifiedItem;
            if (!deepEqual(itemA, itemB)) {
                const changes = diffFlatObjects(
                    itemA as Record<string, unknown>,
                    itemB as Record<string, unknown>,
                    [sectionName, String(id)],
                );
                const itemName = (itemA as { name?: unknown }).name;
                const name = typeof itemName === 'string' ? itemName : String(id);
                modified.push({ id: String(id), name, changes });
            }
        }
    }

    return { added, removed, modified };
}

function diffFamilies(famA: Record<string, unknown>, famB: Record<string, unknown>): FamiliesSection {
    const added: FamiliesSection['added'] = [];
    const removed: FamiliesSection['removed'] = [];
    const modified: FamiliesSection['modified'] = [];

    const allKeys = new Set([...Object.keys(famA), ...Object.keys(famB)]);

    for (const key of allKeys) {
        const inA = Object.prototype.hasOwnProperty.call(famA, key);
        const inB = Object.prototype.hasOwnProperty.call(famB, key);

        if (inA && !inB) {
            removed.push({ id: key, item: famA[key] });
        } else if (!inA && inB) {
            added.push({ id: key, item: famB[key] });
        } else if (inA && inB && !deepEqual(famA[key], famB[key])) {
            const changes = diffFlatObjects(asRecord(famA[key]), asRecord(famB[key]), ['families', key]);
            modified.push({ id: key, changes });
        }
    }

    return { added, removed, modified };
}

// ----------------------------------------------------------------
// DEPENDENCY DETECTION
// ----------------------------------------------------------------

function detectDependencies(modelA: Record<string, unknown>, modelB: Record<string, unknown>, diff: DiffResult): DependencyWarning[] {
    const warnings: DependencyWarning[] = [];

    const removedElementIds = new Set<string>();
    const elementsSection = diff.sections['elements'] as CollectionSection | undefined;
    if (elementsSection?.removed) {
        for (const item of elementsSection.removed) {
            removedElementIds.add(item.id);
        }
    }

    const allEdges: Array<Record<string, unknown>> = [
        ...asArray(modelA.edges),
        ...asArray(modelB.edges),
    ].map(asRecord);

    for (const edge of allEdges) {
        const sourceId = edge.sourceId;
        const targetId = edge.targetId;
        if (typeof sourceId === 'string' && removedElementIds.has(sourceId)) {
            warnings.push({
                type: 'orphan_edge',
                severity: 'warning',
                edgeId: edge.id,
                edgeType: edge.type,
                missingElementId: sourceId,
                role: 'source',
                message: `Edge "${String(edge.id)}" (${String(edge.type)}) references removed element "${sourceId}" as source`,
            });
        }
        if (typeof targetId === 'string' && removedElementIds.has(targetId)) {
            warnings.push({
                type: 'orphan_edge',
                severity: 'warning',
                edgeId: edge.id,
                edgeType: edge.type,
                missingElementId: targetId,
                role: 'target',
                message: `Edge "${String(edge.id)}" (${String(edge.type)}) references removed element "${targetId}" as target`,
            });
        }
    }

    const removedCampaignIds = new Set<string>();
    const campaignsSection = diff.sections['campaigns'] as CollectionSection | undefined;
    if (campaignsSection?.removed) {
        for (const item of campaignsSection.removed) {
            removedCampaignIds.add(item.id);
        }
    }

    if (removedCampaignIds.size > 0) {
        const allElements: Array<Record<string, unknown>> = [
            ...asArray(modelA.elements),
            ...asArray(modelB.elements),
        ].map(asRecord);
        for (const el of allElements) {
            const data = asRecord(el.data);
            const obs = asArray(data.observations).map(asRecord);
            for (const ob of obs) {
                const campaignId = ob.campaignId;
                if (typeof campaignId === 'string' && removedCampaignIds.has(campaignId)) {
                    warnings.push({
                        type: 'orphan_observation',
                        severity: 'warning',
                        elementId: el.id,
                        observationIndex: obs.indexOf(ob),
                        missingCampaignId: campaignId,
                        message: `Observation in "${String(el.id)}" references removed campaign "${campaignId}"`,
                    });
                }
            }
        }
    }

    return warnings;
}

// ----------------------------------------------------------------
// STATS
// ----------------------------------------------------------------

function computeStats(diff: DiffResult): void {
    let total = 0;
    let additions = 0;
    let removals = 0;
    let conflicts = 0;

    for (const section of Object.values(diff.sections)) {
        const scalar = section as Partial<ScalarSection>;
        if (Array.isArray(scalar.changes)) {
            total += scalar.changes.length;
            conflicts += scalar.changes.length;
        }
        const coll = section as Partial<CollectionSection>;
        if (Array.isArray(coll.added)) {
            total += coll.added.length;
            additions += coll.added.length;
        }
        if (Array.isArray(coll.removed)) {
            total += coll.removed.length;
            removals += coll.removed.length;
        }
        if (Array.isArray(coll.modified)) {
            for (const mod of coll.modified) {
                const count = Array.isArray(mod.changes) ? mod.changes.length : 1;
                total += count;
                conflicts += count;
            }
        }
    }

    diff.stats = { total, additions, removals, conflicts };
}

// ----------------------------------------------------------------
// MERGE MODELS
// ----------------------------------------------------------------

export function mergeModels(
    modelA: ProjectModel | null | undefined,
    modelB: ProjectModel | null | undefined,
    decisions: DecisionMap,
    diff: DiffResult,
): MergeResult {
    const merged = deepClone(asRecord(modelA)) as Record<string, unknown>;
    const delta: DeltaEntry[] = [];

    // 1. Merge scalar sections
    for (const sectionName of ['project', 'coordinate']) {
        const section = diff.sections[sectionName] as ScalarSection | undefined;
        if (!section?.changes) continue;

        for (const change of section.changes) {
            const key = change.path.join('.');
            const decision = decisions[key] ?? 'A';

            if (decision === 'B') {
                setNestedValue(merged, change.path, deepClone(change.valueB));
                delta.push({ path: key, action: 'accept_B', from: change.valueA, to: change.valueB });
            } else if (decision === 'A') {
                delta.push({ path: key, action: 'keep_A', value: change.valueA });
            } else if (typeof decision === 'object' && decision !== null && 'custom' in decision) {
                setNestedValue(merged, change.path, deepClone(decision.custom));
                delta.push({ path: key, action: 'custom', from: change.valueA, to: decision.custom });
            }
        }
    }

    // 2. Merge collections
    for (const sectionName of ['elements', 'edges', 'campaigns', 'scenes', 'contracts', 'wbs']) {
        const section = diff.sections[sectionName] as CollectionSection | undefined;
        if (!section) continue;

        mergeCollection(merged, sectionName, section, decisions, delta);
    }

    // 3. Merge families
    const familiesSection = diff.sections['families'] as FamiliesSection | undefined;
    if (familiesSection) {
        mergeFamilies(merged, familiesSection, decisions, delta);
    }

    // 4. Update metadata
    merged.timestamp = new Date().toISOString();

    return { merged, delta };
}

function mergeCollection(
    merged: Record<string, unknown>,
    sectionName: string,
    section: CollectionSection,
    decisions: DecisionMap,
    delta: DeltaEntry[],
): void {
    if (!Array.isArray(merged[sectionName])) merged[sectionName] = [];
    const targetArr = merged[sectionName] as Array<Record<string, unknown>>;

    // Handle additions (items only in B)
    for (const item of section.added || []) {
        const key = `${sectionName}.${item.id}._add`;
        const decision = decisions[key] ?? 'B';

        if (decision === 'B') {
            targetArr.push(deepClone(item.item) as Record<string, unknown>);
            delta.push({ path: key, action: 'add_from_B', id: item.id });
        } else {
            delta.push({ path: key, action: 'reject_addition', id: item.id });
        }
    }

    // Handle removals (items only in A)
    for (const item of section.removed || []) {
        const key = `${sectionName}.${item.id}._remove`;
        const decision = decisions[key] ?? 'A';

        if (decision === 'B') {
            const idx = targetArr.findIndex((el) => el && (el as { id?: unknown }).id === item.id);
            if (idx !== -1) targetArr.splice(idx, 1);
            delta.push({ path: key, action: 'remove_accepted', id: item.id });
        } else {
            delta.push({ path: key, action: 'keep_not_removed', id: item.id });
        }
    }

    // Handle modifications
    for (const mod of section.modified || []) {
        const mergedItem = targetArr.find((el) => el && (el as { id?: unknown }).id === mod.id);
        if (!mergedItem) continue;

        for (const change of mod.changes || []) {
            const key = change.path.join('.');
            const decision = decisions[key] ?? 'A';

            if (decision === 'B') {
                setNestedValue(mergedItem, change.path.slice(2), deepClone(change.valueB));
                delta.push({ path: key, action: 'accept_B', from: change.valueA, to: change.valueB });
            } else if (typeof decision === 'object' && decision !== null && 'custom' in decision) {
                setNestedValue(mergedItem, change.path.slice(2), deepClone(decision.custom));
                delta.push({ path: key, action: 'custom', from: change.valueA, to: decision.custom });
            } else {
                delta.push({ path: key, action: 'keep_A', value: change.valueA });
            }
        }
    }
}

function mergeFamilies(
    merged: Record<string, unknown>,
    section: FamiliesSection,
    decisions: DecisionMap,
    delta: DeltaEntry[],
): void {
    if (!merged.families || typeof merged.families !== 'object') merged.families = {};
    const families = merged.families as Record<string, unknown>;

    for (const item of section.added || []) {
        const key = `families.${item.id}._add`;
        const decision = decisions[key] ?? 'B';
        if (decision === 'B') {
            families[item.id] = deepClone(item.item);
            delta.push({ path: key, action: 'add_from_B', id: item.id });
        }
    }

    for (const item of section.removed || []) {
        const key = `families.${item.id}._remove`;
        const decision = decisions[key] ?? 'A';
        if (decision === 'B') {
            delete families[item.id];
            delta.push({ path: key, action: 'remove_accepted', id: item.id });
        }
    }

    for (const mod of section.modified || []) {
        for (const change of mod.changes || []) {
            const key = change.path.join('.');
            const decision = decisions[key] ?? 'A';
            if (decision === 'B') {
                setNestedValue(families, change.path.slice(1), deepClone(change.valueB));
                delta.push({ path: key, action: 'accept_B', from: change.valueA, to: change.valueB });
            }
        }
    }
}

// ----------------------------------------------------------------
// BUILD DELTA LOG
// ----------------------------------------------------------------

export function buildDelta(delta: ReadonlyArray<DeltaEntry>): FormattedDelta {
    const summary: DeltaSummary = {
        total: delta.length,
        accepted_A: delta.filter((d) => d.action === 'keep_A' || d.action === 'keep_not_removed').length,
        accepted_B: delta.filter(
            (d) => d.action === 'accept_B' || d.action === 'add_from_B' || d.action === 'remove_accepted',
        ).length,
        custom: delta.filter((d) => d.action === 'custom').length,
        rejected: delta.filter((d) => d.action === 'reject_addition').length,
    };

    const entries = delta.map((d) => ({
        ...d,
        description: describePath(d.path.split('.')),
    }));

    return {
        timestamp: new Date().toISOString(),
        summary,
        entries,
    };
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function setNestedValue(obj: Record<string, unknown>, path: ReadonlyArray<string>, value: unknown): void {
    if (!path || path.length === 0) return;

    let current: Record<string, unknown> = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i] as string;
        const next = current[key];
        if (next == null || typeof next !== 'object' || Array.isArray(next)) {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }
    current[path[path.length - 1] as string] = value;
}
