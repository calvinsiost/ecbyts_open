// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pure node-label collision helpers for Constellation metric sizing.
 */

export interface LabelSpec {
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    priority?: number;
}

export interface Label {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    priority: number;
}

export interface ResolverOptions {
    step?: number;
    maxAttempts?: number;
}

export interface GreedyResult {
    readonly label: Label;
    visible: boolean;
}

export const COLLISION_META = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.38',
    deliveredAt: '2026-05-02',
} as const;

export type CollisionMeta = (typeof COLLISION_META);

function validateSpec(spec: LabelSpec | null | undefined): asserts spec is LabelSpec {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createLabel: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createLabel: id required');
    }
}

function finiteOrZero(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function positiveOrZero(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function createLabel(spec: LabelSpec): Readonly<Label> {
    validateSpec(spec);

    const x = finiteOrZero(spec.x);
    const y = finiteOrZero(spec.y);
    const width = positiveOrZero(spec.width);
    const height = positiveOrZero(spec.height);
    const priority = finiteOrZero(spec.priority);

    return Object.freeze({ id: spec.id, x, y, width, height, priority });
}

export function intersects(a: Label | null | undefined, b: Label | null | undefined): boolean {
    if (!a || !b) return false;
    if (a.x + a.width <= b.x) return false;
    if (b.x + b.width <= a.x) return false;
    if (a.y + a.height <= b.y) return false;
    if (b.y + b.height <= a.y) return false;
    return true;
}

export function findCollisions(labels: ReadonlyArray<Label> | null | undefined): ReadonlyArray<Readonly<[Label, Label]>> {
    if (!Array.isArray(labels)) return Object.freeze([]);
    const pairs: Array<Readonly<[Label, Label]>> = [];
    for (let i = 0; i < labels.length; i++) {
        const a = labels[i];
        if (!a) continue;
        for (let j = i + 1; j < labels.length; j++) {
            const b = labels[j];
            if (b && intersects(a, b)) {
                pairs.push(Object.freeze([a, b]));
            }
        }
    }
    return Object.freeze(pairs);
}

export function resolveGreedy(labels: ReadonlyArray<Label> | null | undefined): ReadonlyArray<Readonly<GreedyResult>> {
    if (!Array.isArray(labels)) return Object.freeze([]);
    const sorted = labels.slice().sort((a, b) => b.priority - a.priority);
    const visible: Array<Label> = [];
    const out: Array<Readonly<GreedyResult>> = [];

    for (const label of sorted) {
        const collides = visible.some((item) => intersects(item, label));
        if (collides) {
            out.push(Object.freeze({ label, visible: false }));
        } else {
            visible.push(label);
            out.push(Object.freeze({ label, visible: true }));
        }
    }

    return Object.freeze(out);
}

export function resolveJitter(labels: ReadonlyArray<Label> | null | undefined, opts: ResolverOptions = {}): ReadonlyArray<Readonly<Label>> {
    if (!Array.isArray(labels)) return Object.freeze([]);

    const step = typeof opts.step === 'number' && Number.isFinite(opts.step) && opts.step > 0 ? opts.step : 4;
    const maxAttempts =
        typeof opts.maxAttempts === 'number' && Number.isInteger(opts.maxAttempts) && opts.maxAttempts > 0
            ? opts.maxAttempts
            : 10;
    const sorted = labels.slice().sort((a, b) => b.priority - a.priority);
    const placed: Array<Readonly<Label>> = [];

    for (const label of sorted) {
        let current: Label = { ...label };
        let attempts = 0;
        while (placed.some((item) => intersects(item, current)) && attempts < maxAttempts) {
            current = { ...current, y: current.y + step };
            attempts += 1;
        }
        placed.push(Object.freeze(current));
    }

    return Object.freeze(placed.map((item) => Object.freeze({ ...item })));
}

export function summarizeCollisions(labels: ReadonlyArray<Label> | null | undefined): Readonly<{ total: number, collisions: number, visible: number, hidden: number }> {
    const empty = Object.freeze({ total: 0, collisions: 0, visible: 0, hidden: 0 });
    if (!Array.isArray(labels)) return empty;

    const collisions = findCollisions(labels);
    const resolved = resolveGreedy(labels);
    const visible = resolved.filter((item) => item.visible).length;
    return Object.freeze({
        total: labels.length,
        collisions: collisions.length,
        visible,
        hidden: labels.length - visible,
    });
}

export const nodeLabelCollisionMeta = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.38',
    deliveredAt: '2026-05-02',
    exports: [
        'COLLISION_META',
        'createLabel',
        'intersects',
        'findCollisions',
        'resolveGreedy',
        'resolveJitter',
        'summarizeCollisions',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const;

export type NodeLabelCollisionMeta = (typeof nodeLabelCollisionMeta);
