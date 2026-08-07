// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-64 - File Upload State Machine (pure-logic)
// Modelo de uploads multiplos: fila, retry, validacao, progresso. Zero DOM/network.

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function freezeFile(f: any) {
    return Object.freeze({ ...f });
}

function freezeState(s: any) {
    return Object.freeze({
        files: s.files,
        concurrency: s.concurrency,
        maxRetries: s.maxRetries,
        acceptedTypes: Object.freeze([...s.acceptedTypes]),
        maxFileSize: s.maxFileSize,
    });
}

/**
 * Cria estado inicial de uploads.
 * @param opts
 * @param opts.concurrency
 * @param opts.maxRetries
 * @param opts.acceptedTypes
 * @param opts.maxFileSize
 */
export function createUploadState(
    opts: {
        concurrency?: number;
        maxRetries?: number;
        acceptedTypes?: string[];
        maxFileSize?: number;
    } = {},
) {
    const { concurrency = 3, maxRetries = 3, acceptedTypes = [], maxFileSize = Infinity } = opts;
    if (!Number.isFinite(concurrency) || concurrency < 1) {
        throw new Error('concurrency must be >= 1');
    }
    if (!Number.isFinite(maxRetries) || maxRetries < 0) {
        throw new Error('maxRetries must be >= 0');
    }
    return freezeState({
        files: new Map(),
        concurrency,
        maxRetries,
        acceptedTypes: [...acceptedTypes],
        maxFileSize,
    });
}

function cloneMap(map: any): Map<any, any> {
    return new Map(map);
}

function withFiles(state: any, files: any) {
    return freezeState({ ...state, files });
}

/**
 * Adiciona arquivo a fila. Valida tipo e tamanho. Throw em duplicado/invalido.
 */
export function enqueueFile(state: any, fileSpec: any, now = Date.now()) {
    const { id, name, size, type } = fileSpec;
    if (!id) throw new Error('id required');
    if (state.files.has(id)) throw new Error(`duplicate file id: ${id}`);
    if (typeof size !== 'number' || size < 0) throw new Error('invalid size');
    if (size > state.maxFileSize) {
        throw new Error(`file size ${size} exceeds maxFileSize ${state.maxFileSize}`);
    }
    if (state.acceptedTypes.length > 0 && !state.acceptedTypes.includes(type)) {
        throw new Error(`type "${type}" not in acceptedTypes`);
    }
    const file = freezeFile({
        id,
        name,
        size,
        type,
        status: 'queued',
        bytesUploaded: 0,
        totalBytes: size,
        retryCount: 0,
        error: null,
        queuedAt: now,
        startedAt: null,
        completedAt: null,
    });
    const files = cloneMap(state.files);
    files.set(id, file);
    return withFiles(state, files);
}

/**
 * Retorna numero de uploads atualmente em status 'uploading'.
 */
export function getUploadingCount(state: any) {
    let n = 0;
    for (const f of state.files.values()) if (f.status === 'uploading') n++;
    return n;
}

export function getQueuedCount(state: any) {
    let n = 0;
    for (const f of state.files.values()) if (f.status === 'queued') n++;
    return n;
}

export function getCompletedCount(state: any) {
    let n = 0;
    for (const f of state.files.values()) if (f.status === 'completed') n++;
    return n;
}

/**
 * Promove ate (concurrency - running) arquivos de queued para uploading.
 */
export function startNext(state: any, now = Date.now()): { state: object; startedIds: string[] } {
    const running = getUploadingCount(state);
    const slots = state.concurrency - running;
    if (slots <= 0) return { state, startedIds: [] };
    const files = cloneMap(state.files);
    const startedIds: string[] = [];
    // ordem de insercao do Map preserva ordem da fila
    for (const [id, f] of files) {
        if (startedIds.length >= slots) break;
        if (f.status === 'queued') {
            files.set(id, freezeFile({ ...f, status: 'uploading', startedAt: now }));
            startedIds.push(id);
        }
    }
    return { state: withFiles(state, files), startedIds };
}

/**
 * Atualiza bytesUploaded; clamp em totalBytes. Apenas para status 'uploading'.
 */
export function updateProgress(state: any, fileId: any, bytesUploaded: any) {
    const f = state.files.get(fileId);
    if (!f) throw new Error(`file not found: ${fileId}`);
    if (f.status !== 'uploading') {
        throw new Error(`cannot update progress on status "${f.status}"`);
    }
    if (typeof bytesUploaded !== 'number' || bytesUploaded < 0) {
        throw new Error('invalid bytesUploaded');
    }
    const clamped = Math.min(bytesUploaded, f.totalBytes);
    const files = cloneMap(state.files);
    files.set(fileId, freezeFile({ ...f, bytesUploaded: clamped }));
    return withFiles(state, files);
}

export function completeUpload(state: any, fileId: any, now = Date.now()) {
    const f = state.files.get(fileId);
    if (!f) throw new Error(`file not found: ${fileId}`);
    if (f.status !== 'uploading') {
        throw new Error(`cannot complete from status "${f.status}"`);
    }
    const files = cloneMap(state.files);
    files.set(
        fileId,
        freezeFile({
            ...f,
            status: 'completed',
            bytesUploaded: f.totalBytes,
            completedAt: now,
        }),
    );
    return withFiles(state, files);
}

/**
 * Falha upload: incrementa retryCount; se < maxRetries volta a 'queued', senao 'failed'.
 */
export function failUpload(state: any, fileId: any, error: any, now = Date.now()) {
    const f = state.files.get(fileId);
    if (!f) throw new Error(`file not found: ${fileId}`);
    if (f.status !== 'uploading') {
        throw new Error(`cannot fail from status "${f.status}"`);
    }
    const retryCount = f.retryCount + 1;
    const willRetry = retryCount <= state.maxRetries;
    const files = cloneMap(state.files);
    files.set(
        fileId,
        freezeFile({
            ...f,
            status: willRetry ? 'queued' : 'failed',
            retryCount,
            error: error == null ? null : String(error),
            startedAt: willRetry ? null : f.startedAt,
            bytesUploaded: willRetry ? 0 : f.bytesUploaded,
            completedAt: willRetry ? null : now,
        }),
    );
    return withFiles(state, files);
}

export function pauseUpload(state: any, fileId: any) {
    const f = state.files.get(fileId);
    if (!f) throw new Error(`file not found: ${fileId}`);
    if (f.status !== 'uploading') {
        throw new Error(`cannot pause from status "${f.status}"`);
    }
    const files = cloneMap(state.files);
    files.set(fileId, freezeFile({ ...f, status: 'paused' }));
    return withFiles(state, files);
}

export function resumeUpload(state: any, fileId: any) {
    const f = state.files.get(fileId);
    if (!f) throw new Error(`file not found: ${fileId}`);
    if (f.status !== 'paused') {
        throw new Error(`cannot resume from status "${f.status}"`);
    }
    const files = cloneMap(state.files);
    files.set(fileId, freezeFile({ ...f, status: 'queued' }));
    return withFiles(state, files);
}

export function cancelUpload(state: any, fileId: any, now = Date.now()) {
    const f = state.files.get(fileId);
    if (!f) throw new Error(`file not found: ${fileId}`);
    if (TERMINAL.has(f.status)) {
        throw new Error(`cannot cancel terminal status "${f.status}"`);
    }
    const files = cloneMap(state.files);
    files.set(fileId, freezeFile({ ...f, status: 'cancelled', completedAt: now }));
    return withFiles(state, files);
}

export function removeUpload(state: any, fileId: any) {
    const f = state.files.get(fileId);
    if (!f) throw new Error(`file not found: ${fileId}`);
    if (!TERMINAL.has(f.status)) {
        throw new Error(`cannot remove non-terminal status "${f.status}"`);
    }
    const files = cloneMap(state.files);
    files.delete(fileId);
    return withFiles(state, files);
}

/**
 * Progresso geral em percent (0..100). Considera todos arquivos nao-cancelados.
 */
export function getOverallProgress(state: any) {
    let totalBytes = 0;
    let uploaded = 0;
    for (const f of state.files.values()) {
        if (f.status === 'cancelled') continue;
        totalBytes += f.totalBytes;
        uploaded += f.bytesUploaded;
    }
    if (totalBytes === 0) return 0;
    return (uploaded / totalBytes) * 100;
}

export function summarizeUploads(state: any) {
    let total = 0,
        queued = 0,
        uploading = 0,
        completed = 0,
        failed = 0,
        anyPaused = false;
    for (const f of state.files.values()) {
        total++;
        if (f.status === 'queued') queued++;
        else if (f.status === 'uploading') uploading++;
        else if (f.status === 'completed') completed++;
        else if (f.status === 'failed') failed++;
        else if (f.status === 'paused') anyPaused = true;
    }
    return {
        total,
        queued,
        uploading,
        completed,
        failed,
        percent: getOverallProgress(state),
        anyPaused,
    };
}
