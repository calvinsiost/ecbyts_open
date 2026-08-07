// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   HISTORY MANAGER — Undo/Redo via state snapshots
   Gerenciador de historico usando snapshots (mementos) do modelo.

   Cada acao significativa gera um snapshot que pode ser restaurado.
   Usa buildModel/applyModel do sistema de export/import existente.

   LIMITACOES:
   - Max 50 snapshots na memoria
   - Camera view nao e restaurada (navegacao e separada)
   - Apenas estado dos dados, nao estado da UI
   ================================================================ */
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';

const MAX_HISTORY = 50;
const SNAPSHOT_DELAY = 400; // ms de pausa antes de capturar snapshot (debounce)
let undoStack: any[] = [];
let redoStack: any[] = [];
let _buildModel: any = null;
let _applyModel: any = null;
let _requestUIRefresh: any = null;
let _isPaused = false;
let _restoreGeneration = 0; // Incrementa a cada restore para ignorar pushes atrasados
let _snapshotTimer: any = null;

/**
 * Initialize history with serialization functions.
 * @param options
 * @param options.buildModel - Serializes current state to JSON
 * @param options.applyModel - Restores state from JSON
 * @param options.requestUIRefresh - Refreshes UI domains after restore
 */
export function initHistory({
    buildModel,
    applyModel,
    requestUIRefresh,
}: {
    buildModel: Function;
    applyModel: Function;
    requestUIRefresh: Function;
}): void {
    _buildModel = buildModel;
    _applyModel = applyModel;
    _requestUIRefresh = requestUIRefresh || null;
    undoStack = [];
    redoStack = [];
    _isPaused = false;
    _restoreGeneration++;
    if (_snapshotTimer) {
        clearTimeout(_snapshotTimer);
        _snapshotTimer = null;
    }
    _barriers = null;
}
function requestHistoryUIRefresh(reason = 'history.restored'): void {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.HISTORY,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.TICKER,
        UI_INVALIDATION_DOMAINS.LIBRARIES,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}

/**
 * Capture current state as a snapshot (debounced).
 * Chamada apos cada mutacao significativa nos dados.
 * Usa debounce para evitar serializacao repetida em acoes rapidas.
 * Ignora chamadas durante/apos restore (undo/redo) usando generation counter.
 */
export function pushSnapshot(): void {
    if (_isPaused || !_buildModel) return;
    if (_snapshotTimer) clearTimeout(_snapshotTimer);
    _snapshotTimer = setTimeout(_captureSnapshot, SNAPSHOT_DELAY);
}

/**
 * Force IMEDIATA do snapshot debounced PENDENTE (se houver). NÃO força captura quando não
 * há timer pendente — o estado atual já está no topo do stack (do último push debounced
 * assentado). Force-capturar criaria um snapshot redundante; embora o dedup canônico
 * (`_canonicalSnapshotStr`) catch alguns casos, o re-capture pós-`applyModel`→
 * `importElements` NÃO é byte-idêntico ao snapshot armazenado (defaults adicionados por
 * `addElement`, etc.) → não deduplica → push → `redoStack = []` → `redo()` no-op
 * (causa-raiz TRUST-006). Garantir captura idempotente do estado pendente é suficiente
 * para o contrato (undo precisa do pós-mutação no topo; pre-mutação já está lá da ação
 * anterior assentada).
 */
export function flushSnapshot(): void {
    if (_snapshotTimer) {
        clearTimeout(_snapshotTimer);
        _snapshotTimer = null;
        _captureSnapshot();
    }
}

/**
 * Internal: ordena recursivamente keys de objetos + arrays-de-objetos-com-id (por id).
 * Garante representação determinística de estados logicamente idênticos, independente da
 * ordem de inserção do produtor. Necessário porque `applyModel` → `importElements`
 * (clearAllElements + addElement) NÃO re-serializa idêntico ao snapshot original
 * (ordem de elementos, ordem de keys, normalização de hierarquia variam por chamada).
 */
function _deepCanonicalize(value: any): any {
    if (Array.isArray(value)) {
        const items = value.map(_deepCanonicalize);
        if (items.length > 0 && items.every((it) => it && typeof it === 'object' && !Array.isArray(it) && 'id' in it)) {
            items.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
        }
        return items;
    }
    if (value && typeof value === 'object') {
        const sorted: any = {};
        for (const key of Object.keys(value).sort()) sorted[key] = _deepCanonicalize(value[key]);
        return sorted;
    }
    return value;
}

/**
 * Internal: serializa o snapshot de forma CANONICA (determinística) para dedup + storage.
 *
 * Dois ataques compostos contra a não-determinação do `buildModel`/`importElements`:
 * (1) Metadata volátil de export — `timestamp` (topo) e `exportedAt`/`generatedAt`
 *     (sub-exporters, ex.: costCenterManager.exportCostCenters) são injetados a cada
 *     chamada. Sem neutralizar, dois snapshots do MESMO estado lógico viram strings
 *     byte-distintas → o dedup (igualdade de string) NUNCA casa (causa-raiz TRUST-005).
 * (2) Ordem não-idempotente do round-trip — `applyModel`→`importElements` rebuilda
 *     elements em ordem possivelmente diferente; key-order de objetos pode variar. Sem
 *     canonicalização, o re-capture pós-restore difere do snapshot armazenado → push
 *     → `redoStack` LIMPO → redo no-op (TRUST-006).
 *
 * NÃO neutralizamos `modifiedAt`/`createdAt`/`updatedAt` — esses são dados de registro
 * (mudam só quando o registro muda, deterministicos por estado).
 */
function _canonicalSnapshotStr(snapshot: any): string {
    delete snapshot.view; // Camera position nao faz parte do undo
    delete snapshot.timestamp; // metadata de export (topo) — volátil por chamada
    const canonical = _deepCanonicalize(snapshot);
    return JSON.stringify(canonical).replace(/"(exportedAt|generatedAt)":"[^"]*"/g, '"$1":""');
}

/** Internal: serializa e armazena snapshot no undoStack. */
function _captureSnapshot(): void {
    _snapshotTimer = null;
    if (_isPaused || !_buildModel) return;

    const snapshot = _buildModel();
    const str = _canonicalSnapshotStr(snapshot);

    // Dedup: nao empilha snapshot IDENTICO ao topo. Sem isso, flushSnapshot() — inclusive
    // o chamado por undo()/redo() "para capturar estado pendente" — duplica o estado atual
    // quando ele ja esta no topo. Resultado: undo() faz pop de uma copia e restaura a OUTRA
    // copia (o proprio estado atual) em vez do anterior → "undo nao reverte" (bug Calvin
    // 2026-05-29). Tambem evitava o redoStack ser limpo a toa pelo flush do undo.
    if (undoStack.length && undoStack[undoStack.length - 1] === str) return;

    undoStack.push(str);

    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }

    // Nova acao invalida historico de redo
    redoStack = [];
}

/**
 * Undo: restore previous state.
 * @returns true if undo was performed
 */
export function undo(): boolean {
    // Captura estado pendente antes de desfazer
    flushSnapshot();
    if (undoStack.length < 2) return false;

    const current = undoStack.pop();
    redoStack.push(current);

    const previous = undoStack[undoStack.length - 1];
    restoreSnapshot(previous);
    return true;
}

/**
 * Redo: restore next state.
 * @returns true if redo was performed
 */
export function redo(): boolean {
    // Captura estado pendente antes de refazer
    flushSnapshot();
    if (redoStack.length === 0) return false;

    const next = redoStack.pop();
    undoStack.push(next);
    restoreSnapshot(next);
    return true;
}

/**
 * Internal: restore from snapshot string.
 * IMPORTANTE: o refresh de UI usa requestAnimationFrame internamente, e cada
 * update pode disparar outro refresh de UI. Cada rAF inclui pushSnapshot(),
 * que limparia o redoStack se executado. Usamos _restoreGeneration para
 * garantir que todos os pushSnapshot() disparados por esta restore sejam
 * ignorados, independente de quantos rAF cycles levem.
 */
async function restoreSnapshot(snapshotStr: any): Promise<void> {
    _isPaused = true;
    _restoreGeneration++;
    const gen = _restoreGeneration;
    if (_snapshotTimer) {
        clearTimeout(_snapshotTimer); // cancela captura debounced pendente (anti-race no restore)
        _snapshotTimer = null;
    }
    try {
        const snapshot = JSON.parse(snapshotStr);
        // AWAIT + CATCH: applyModel e async; sem await/catch uma rejeicao (ex.: validateModel
        // falhando num snapshot, ou erro assincrono) era SILENCIOSA → undo() "retornava true"
        // mas o estado nao revertia (bug Calvin 2026-05-29). Awaitar garante que o restore
        // complete antes do unpause, e o catch expõe falhas em vez de engolir.
        await _applyModel(snapshot);
        requestHistoryUIRefresh('history.snapshot-restored');
    } catch (e: any) {
        console.error('[history] restore falhou:', e?.message || e);
    } finally {
        // Unpause APÓS a cascade do restore assentar. 200ms era CURTO demais — o refresh
        // post-restore dispara handlers que chamam `pushSnapshot()` (debounce SNAPSHOT_DELAY=400ms),
        // e a captura subsequente limpa o `redoStack` (causa-raiz TRUST-006, instrumentação
        // 2026-05-29 confirmou capture pushed após restore-end). 1000ms = SNAPSHOT_DELAY × 2 +
        // margem cobre a cascade rAF + debounce. `pushSnapshot` durante a janela retorna cedo
        // (_isPaused=true) → não agenda timer → não há phantom capture pós-restore.
        setTimeout(() => {
            if (_restoreGeneration === gen) _isPaused = false;
        }, 1000);
    }
}

export function canUndo(): boolean {
    return undoStack.length >= 2;
}

export function canRedo(): boolean {
    return redoStack.length > 0;
}

/**
 * Push a named barrier snapshot (BS5).
 * Marca um ponto de restauracao nomeado no undoStack.
 * Util para operacoes compostas (merge, import) onde o usuario quer
 * "desfazer ate o ponto antes do import X" com um unico undo.
 *
 * @param label - nome legivel (ex: 'Before merge: pocossiagas.xlsx')
 */
export function pushSnapshotBarrier(label: string): void {
    if (!_buildModel) return;
    // Flush qualquer snapshot pendente antes de criar barreira
    flushSnapshot();
    const snapshot = _buildModel();
    const entry = _canonicalSnapshotStr(snapshot);
    // Marca como barreira adicionando metadata ao stack
    undoStack.push(entry);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    // Armazena label no indice para UI de undo
    if (!_barriers) _barriers = new Map();
    _barriers.set(undoStack.length - 1, label);
}

/** @returns Barrier label for the last undo target, if any */
export function getUndoBarrierLabel(): string | null {
    if (!_barriers || undoStack.length < 2) return null;
    return _barriers.get(undoStack.length - 2) || null;
}

let _barriers: any = null;

/** Clear all history stacks. */
export function clearHistory(): void {
    undoStack = [];
    redoStack = [];
    _barriers = null;
    // Reset estado de restore-quiet: sem isso, um `clearHistory` chamado DURANTE a janela
    // de unpause (1000ms pós-restore) deixa `_isPaused=true` indefinidamente, bloqueando
    // os pushes subsequentes. Vital para testes e para fluxos como model-load durante undo.
    _isPaused = false;
    _restoreGeneration++;
    if (_snapshotTimer) {
        clearTimeout(_snapshotTimer);
        _snapshotTimer = null;
    }
}
