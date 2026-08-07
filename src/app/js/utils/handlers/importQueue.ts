// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * importQueue.ts — IMPORT-UX-001 RF-4 (pure logic)
 *
 * Fila de importação multi-arquivo com processamento sequencial.
 * Módulo puro (sem DOM/browser) — testável via node --experimental-strip-types.
 * O wiring DOM (drag-and-drop, render) vive em ingestionDropzone.ts; este módulo
 * fornece a lógica de fila que aquele consome.
 */

export type ImportQueueStatus = 'pending' | 'processing' | 'done' | 'error';

export interface ImportQueueFile {
    name: string;
    size: number;
}

export interface ImportQueueItem {
    file: ImportQueueFile;
    status: ImportQueueStatus;
    progress: number;
    error: string | null;
}

export interface ImportQueueResult {
    file: ImportQueueFile;
    success: boolean;
    error: string | null;
}

export type ImportFileHandler = (
    file: ImportQueueFile,
    onProgress: (pct: number) => void,
) => Promise<void>;

export function createImportQueue(files: ImportQueueFile[]): ImportQueueItem[] {
    return files.map((file) => ({
        file,
        status: 'pending' as ImportQueueStatus,
        progress: 0,
        error: null,
    }));
}

export async function processQueue(
    queue: ImportQueueItem[],
    handler: ImportFileHandler,
): Promise<ImportQueueResult[]> {
    const results: ImportQueueResult[] = [];

    for (const item of queue) {
        if (item.status !== 'pending') continue;

        item.status = 'processing';
        item.progress = 0;
        item.error = null;

        try {
            await handler(item.file, (pct: number) => {
                item.progress = Math.max(0, Math.min(100, Math.round(pct)));
            });
            item.status = 'done';
            item.progress = 100;
            results.push({ file: item.file, success: true, error: null });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            item.status = 'error';
            item.error = msg;
            results.push({ file: item.file, success: false, error: msg });
        }
    }

    return results;
}

export function queueSummary(queue: readonly ImportQueueItem[]): {
    total: number;
    pending: number;
    processing: number;
    done: number;
    error: number;
    overallProgress: number;
} {
    const total = queue.length;
    let pending = 0;
    let processing = 0;
    let done = 0;
    let error = 0;
    let progressSum = 0;

    for (const item of queue) {
        if (item.status === 'pending') pending++;
        else if (item.status === 'processing') processing++;
        else if (item.status === 'done') done++;
        else if (item.status === 'error') error++;
        progressSum += item.progress;
    }

    return {
        total,
        pending,
        processing,
        done,
        error,
        overallProgress: total > 0 ? Math.round(progressSum / total) : 0,
    };
}

export function extractFilesFromDrop(
    dataTransferFiles: ArrayLike<{ name: string; size: number }>,
): ImportQueueFile[] {
    const out: ImportQueueFile[] = [];
    for (let i = 0; i < dataTransferFiles.length; i++) {
        const f = dataTransferFiles[i];
        if (!f) continue;
        out.push({ name: f.name, size: f.size });
    }
    return out;
}
