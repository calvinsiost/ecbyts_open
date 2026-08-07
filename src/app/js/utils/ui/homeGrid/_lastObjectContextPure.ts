// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — lógica PURA do (de)serialize do "último contexto de
 * objeto" da home (workspace/domain/objeto selecionado). claude (refactor) 2026-06-20.
 *
 * EN: Pure build + coerce for the persisted last-object-context payload. No DOM,
 *     no localStorage, no globals. Mirrors the legacy inline pair in homeGrid.ts:
 *       - `buildLastObjectContext(state)` → the exact object that
 *         `_persistLastObjectContext` JSON.stringifies (same key order/names);
 *       - `coerceLastObjectContext(parsed, current)` → the field-by-field
 *         restore from `_restoreLastObjectContext`: for each of the 10 fields,
 *         take `parsed.<field>` ONLY when it is a string, otherwise keep the
 *         `current` value (the live module fallback). Non-object `parsed` →
 *         returns `current` unchanged (mirror of the `typeof !== 'object'` guard).
 *     The barrel keeps the localStorage read/write, the JSON parse/stringify, the
 *     try/catch I/O and the "skip restore if already populated" early-return —
 *     feeding the parsed object + the live fallbacks in. Behaviour identical.
 *
 * PT (leigo): cuida, sem mexer na tela nem no armazenamento, de empacotar e
 *     desempacotar a "última seleção" da tela inicial (qual modelo, domínio e
 *     objeto estavam ativos). Ao restaurar, só aceita cada campo se ele veio como
 *     texto; senão mantém o valor atual — evita corromper o estado com lixo salvo.
 *     É exatamente o mesmo cálculo que estava embutido no homeGrid — agora isolado
 *     e testável.
 *
 * Pure: entradas → saída determinística, sem efeitos colaterais. Cheap tests:
 * tests/ui/homeGrid/last-object-context.test.mjs.
 */

/** The 10-field last-object-context state (all string slots). */
export interface LastObjectContext {
    scopeKind: string;
    orgId: string;
    modelSource: string;
    modelId: string;
    modelLabel: string;
    laneId: string;
    snapshotId: string;
    domainId: string;
    objectId: string;
    objectType: string;
}

/** Live module state read by the barrel when building the persist payload. */
export interface LastObjectContextSource {
    readonly scopeKind: string;
    readonly orgId: string;
    readonly modelSource: string;
    readonly modelId: string;
    readonly modelLabel: string;
    readonly laneId: string;
    readonly snapshotId: string;
    readonly domainId: string;
    readonly objectId: string;
    readonly objectType: string;
}

/**
 * Build the plain payload persisted to localStorage. Mirrors the object literal
 * inside `_persistLastObjectContext` EXACTLY (same keys, same order).
 */
export function buildLastObjectContext(state: LastObjectContextSource): LastObjectContext {
    return {
        scopeKind: state.scopeKind,
        orgId: state.orgId,
        modelSource: state.modelSource,
        modelId: state.modelId,
        modelLabel: state.modelLabel,
        laneId: state.laneId,
        snapshotId: state.snapshotId,
        domainId: state.domainId,
        objectId: state.objectId,
        objectType: state.objectType,
    };
}

function pickString(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}

/**
 * Coerce a parsed localStorage payload into a restored context, keeping the live
 * `current` fallback for any field that is not a string in `parsed`.
 *
 * Byte-identical to the per-field assignment in `_restoreLastObjectContext`.
 * Note the field-name mapping: the persisted `domainId` key restores `domainId`
 * (the barrel assigns it to `_activeDomain`); kept here under `domainId`.
 *
 * @param parsed  the JSON.parse output (any shape, possibly null/non-object)
 * @param current the live module fallbacks (one per field)
 */
export function coerceLastObjectContext(parsed: unknown, current: LastObjectContext): LastObjectContext {
    if (!parsed || typeof parsed !== 'object') return current;
    const p = parsed as Record<string, unknown>;
    return {
        scopeKind: pickString(p.scopeKind, current.scopeKind),
        orgId: pickString(p.orgId, current.orgId),
        modelSource: pickString(p.modelSource, current.modelSource),
        modelId: pickString(p.modelId, current.modelId),
        modelLabel: pickString(p.modelLabel, current.modelLabel),
        laneId: pickString(p.laneId, current.laneId),
        snapshotId: pickString(p.snapshotId, current.snapshotId),
        domainId: pickString(p.domainId, current.domainId),
        objectId: pickString(p.objectId, current.objectId),
        objectType: pickString(p.objectType, current.objectType),
    };
}
