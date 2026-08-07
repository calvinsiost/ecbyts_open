// Worker-context globals para arquivos rodando em DedicatedWorkerGlobalScope.
// Audit W68 risky-import 2026-05-14: documentWorker.js (mammoth via importScripts).

/// <reference lib="webworker" />

interface MammothModule {
    convertToHtml(
        input: { arrayBuffer: ArrayBuffer },
        options?: unknown,
    ): Promise<{ value: string; messages: unknown[] }>;
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}

declare const mammoth: MammothModule;

// Exporta para evitar tratamento como script global ambient.
export {};
