// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PID DIAGRAM SYNC — Sincronizacao controlada entre P&ID e Pipeline Pack.

   Regras invariantes (anti-auto-sync):
   - Toda sincronizacao exige confirmacao humana explicita (requiresSyncConfirmation = true).
   - Mudancas semanticas nao alteram posicoes visuais do Pack.
   - Mudancas visuais nao alteram conteudo semantico das ligacoes.
   - Fontes PDF/imagem nunca recebem escrita de volta.

   Spec: docs/specs/features/SPEC_PIPELINE_PACK_CUSTOMIZATION_WORKBENCH.md §17.H
   ================================================================ */

import type {
    PipelinePackNode,
    PipelinePackSourceKind,
    PipelineProjectDataBinding,
} from './pipelinePack.js';
import type { PipelineProtocolVersionLedger } from './pipelineProtocol.js';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type PipelineSyncChangeKind = 'created' | 'removed' | 'renamed' | 'changed';

export interface PipelineSyncBindingDiff {
    kind: PipelineSyncChangeKind;
    bindingId: string;
    parameterId: string;
    label?: string;
    previousLabel?: string;
    changedFields?: string[];
}

export interface PipelineSyncNodeVisualChange {
    nodeId: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    color?: string;
}

export interface PipelineSyncDiff {
    sourceFormat: 'pid' | 'pipeline';
    targetFormat: 'pipeline' | 'pid';
    isWritable: boolean;
    bindingChanges: PipelineSyncBindingDiff[];
    visualChanges: PipelineSyncNodeVisualChange[];
    counts: {
        created: number;
        removed: number;
        renamed: number;
        changed: number;
        visualOnly: number;
    };
}

export interface PipelineSyncMeta {
    timestamp: string;
    appliedBy: string;
    sourceFileName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const VISUAL_ONLY_SOURCE_KINDS: ReadonlySet<string> = new Set(['pdf', 'image']);
const SEMANTIC_BINDING_FIELDS: ReadonlyArray<keyof PipelineProjectDataBinding> = [
    'parameterId', 'label', 'value', 'unit', 'basis', 'valueKind', 'observationLink',
];

function _bindingKey(b: PipelineProjectDataBinding): string {
    return b.parameterId;
}

function _diffedSemanticFields(
    prev: PipelineProjectDataBinding,
    next: PipelineProjectDataBinding,
): string[] {
    return SEMANTIC_BINDING_FIELDS.filter((field) => {
        const pv = prev[field];
        const nv = next[field];
        return JSON.stringify(pv) !== JSON.stringify(nv);
    }) as string[];
}

// ── 1169 — diff P&ID → Pipeline ──────────────────────────────────────────────

/** Compara candidatos novos do P&ID com ligacoes existentes do Pack.
 *  Identifica itens criados, removidos, renomeados (mesmo param, id diferente)
 *  e alterados (mesmo param, valor/label mudou). */
export function diffPidToPipeline(
    newCandidates: PipelineProjectDataBinding[],
    existingBindings: PipelineProjectDataBinding[],
): PipelineSyncDiff {
    const existingByParam = new Map(existingBindings.map((b) => [_bindingKey(b), b]));
    const newByParam = new Map(newCandidates.map((b) => [_bindingKey(b), b]));

    const bindingChanges: PipelineSyncBindingDiff[] = [];

    for (const [paramId, incoming] of newByParam) {
        const existing = existingByParam.get(paramId);
        if (!existing) {
            bindingChanges.push({
                kind: 'created',
                bindingId: incoming.id,
                parameterId: paramId,
                label: incoming.label,
            });
        } else if (existing.id !== incoming.id && existing.parameterId === incoming.parameterId) {
            bindingChanges.push({
                kind: 'renamed',
                bindingId: incoming.id,
                parameterId: paramId,
                label: incoming.label,
                previousLabel: existing.label,
            });
        } else {
            const changedFields = _diffedSemanticFields(existing, incoming);
            if (changedFields.length > 0) {
                bindingChanges.push({
                    kind: 'changed',
                    bindingId: existing.id,
                    parameterId: paramId,
                    label: incoming.label,
                    previousLabel: existing.label,
                    changedFields,
                });
            }
        }
    }

    for (const [paramId, existing] of existingByParam) {
        if (!newByParam.has(paramId)) {
            bindingChanges.push({
                kind: 'removed',
                bindingId: existing.id,
                parameterId: paramId,
                previousLabel: existing.label,
            });
        }
    }

    const counts = {
        created: bindingChanges.filter((c) => c.kind === 'created').length,
        removed: bindingChanges.filter((c) => c.kind === 'removed').length,
        renamed: bindingChanges.filter((c) => c.kind === 'renamed').length,
        changed: bindingChanges.filter((c) => c.kind === 'changed').length,
        visualOnly: 0,
    };

    return {
        sourceFormat: 'pid',
        targetFormat: 'pipeline',
        isWritable: true,
        bindingChanges,
        visualChanges: [],
        counts,
    };
}

// ── 1170 — diff Pipeline → P&ID (apenas fontes graváveis) ────────────────────

/** Retorna true para formatos que permitem escrita de volta (exceto PDF/imagem). */
export function isWritablePidFormat(sourceKind: PipelinePackSourceKind | string): boolean {
    return !VISUAL_ONLY_SOURCE_KINDS.has(sourceKind);
}

/** Compara ligacoes do Pack com candidatos do P&ID no sentido inverso.
 *  Retorna null quando a fonte nao suporta escrita de volta (PDF/imagem). */
export function diffPipelineToPid(
    packBindings: PipelineProjectDataBinding[],
    pidSummary: { candidates: PipelineProjectDataBinding[]; sourceKind?: string },
): PipelineSyncDiff | null {
    const sourceKind = pidSummary.sourceKind ?? 'unknown';
    if (!isWritablePidFormat(sourceKind)) return null;

    const reverseDiff = diffPidToPipeline(packBindings, pidSummary.candidates);
    return {
        ...reverseDiff,
        sourceFormat: 'pipeline',
        targetFormat: 'pid',
    };
}

// ── 1171 — guard: bloquear sync automatico sem confirmacao humana ─────────────

/** Qualquer diff de sincronizacao exige confirmacao humana explicita.
 *  Esta funcao sempre retorna true — nunca sincronize automaticamente. */
export function requiresSyncConfirmation(_diff: PipelineSyncDiff): true {
    return true;
}

// ── 1172 — aplicar sync preservando layout (mudancas semanticas apenas) ───────

/** Aplica apenas mudancas semanticas (valor, rotulo, parametro, observacao)
 *  das ligacoes de dados, sem alterar posicoes ou layout visual do Pack. */
export function applyPidSyncPreservingLayout(
    existingBindings: PipelineProjectDataBinding[],
    diff: PipelineSyncDiff,
    incomingCandidates: PipelineProjectDataBinding[],
): PipelineProjectDataBinding[] {
    const incomingByParam = new Map(incomingCandidates.map((b) => [b.parameterId, b]));
    const result: PipelineProjectDataBinding[] = [];

    for (const existing of existingBindings) {
        const change = diff.bindingChanges.find((c) => c.parameterId === existing.parameterId);
        if (!change || change.kind === 'removed') continue;

        const incoming = incomingByParam.get(existing.parameterId);
        if (!incoming) {
            result.push(existing);
            continue;
        }

        result.push({
            ...existing,
            label: incoming.label,
            value: incoming.value,
            ...(incoming.unit !== undefined ? { unit: incoming.unit } : existing.unit !== undefined ? { unit: existing.unit } : {}),
            ...(incoming.basis !== undefined ? { basis: incoming.basis } : existing.basis !== undefined ? { basis: existing.basis } : {}),
            ...(incoming.valueKind !== undefined ? { valueKind: incoming.valueKind } : existing.valueKind !== undefined ? { valueKind: existing.valueKind } : {}),
            ...(incoming.observationLink !== undefined ? { observationLink: incoming.observationLink } : existing.observationLink !== undefined ? { observationLink: existing.observationLink } : {}),
        });
    }

    for (const change of diff.bindingChanges) {
        if (change.kind !== 'created') continue;
        const incoming = incomingByParam.get(change.parameterId);
        if (incoming) result.push(incoming);
    }

    return result;
}

// ── 1173 — aplicar sync preservando semantica (mudancas visuais apenas) ───────

/** Aplica apenas mudancas de posicao/visual (x, y, w, h, color) nos nos do Pack,
 *  sem alterar rotulos, tipos nem qualquer conteudo semantico. */
export function applyPidSyncPreservingSemantics(
    nodes: PipelinePackNode[],
    diff: PipelineSyncDiff,
): PipelinePackNode[] {
    const visualByNodeId = new Map(diff.visualChanges.map((vc) => [vc.nodeId, vc]));
    return nodes.map((node) => {
        const vc = visualByNodeId.get(node.id);
        if (!vc) return node;
        return {
            ...node,
            ...(vc.x !== undefined && { x: vc.x }),
            ...(vc.y !== undefined && { y: vc.y }),
            ...(vc.w !== undefined && { w: vc.w }),
            ...(vc.h !== undefined && { h: vc.h }),
            ...(vc.color !== undefined && { color: vc.color }),
        };
    });
}

// ── 1174 — registrar sincronizacao no ledger de versoes ───────────────────────

/** Acrescenta uma entrada de sincronizacao ao changeSet do ledger.
 *  Retorna novo ledger imutavel sem modificar o original. */
export function recordSyncInVersionLedger(
    ledger: PipelineProtocolVersionLedger,
    diff: PipelineSyncDiff,
    meta: PipelineSyncMeta,
): PipelineProtocolVersionLedger {
    const { counts } = diff;
    const parts: string[] = [`[sync:${meta.timestamp}]`];
    if (counts.created) parts.push(`+${counts.created} criado(s)`);
    if (counts.removed) parts.push(`-${counts.removed} removido(s)`);
    if (counts.renamed) parts.push(`~${counts.renamed} renomeado(s)`);
    if (counts.changed) parts.push(`~${counts.changed} alterado(s)`);
    if (meta.sourceFileName) parts.push(`fonte: ${meta.sourceFileName}`);
    parts.push(`por: ${meta.appliedBy}`);

    return {
        ...ledger,
        changeSet: [...ledger.changeSet, parts.join(' ')],
    };
}

// ── 1175 — fallback seguro para PDF/imagem (somente leitura) ─────────────────

/** Retorna true quando a fonte e PDF ou imagem — sem escrita de volta possivel.
 *  Deve ser verificado antes de qualquer tentativa de sincronizacao de volta. */
export function isSafeVisualFallback(sourceKind: PipelinePackSourceKind | string): boolean {
    return VISUAL_ONLY_SOURCE_KINDS.has(sourceKind);
}
