// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.5

/* ================================================================
   SHAPEFILE WORKER — Parsing de Shapefile fora do main thread
   ================================================================

   Web Worker (classic, NAO ES module) responsavel por parsear
   ArrayBuffers de .zip/.shp via shpjs sem bloquear o main thread.

   Protocolo:
     - Inbound:  { buffer: ArrayBuffer, requestId: string }
     - Outbound: { requestId, ok: true, result } | { requestId, ok: false, error }

   shpjs carregado via importScripts (CDN classico). Se a politica CSP
   do browser bloquear cross-origin importScripts, o caller faz fallback
   para o main thread automaticamente.

   ================================================================ */

const SHPJS_CDN = 'https://unpkg.com/shpjs@4.0.4/dist/shp.min.js' as const;

export interface ShapefileWorkerScope {
    addEventListener: (type: 'message', listener: (event: MessageEvent) => void | Promise<void>) => void;
    importScripts: (...urls: string[]) => void;
    postMessage: (message: unknown) => void;
    shp?: (buffer: ArrayBuffer) => unknown | Promise<unknown>;
}

const workerSelf = self as unknown as ShapefileWorkerScope;

workerSelf.addEventListener('message', async (e: MessageEvent) => {
    const data = e.data || {};
    const buffer: ArrayBuffer = data.buffer;
    const requestId: string = data.requestId;

    try {
        if (!workerSelf.shp) {
            // importScripts e sincrono — bloqueia o Worker (nao o main thread)
            // ate o script carregar. Lanca em caso de falha de rede ou CSP.
            workerSelf.importScripts(SHPJS_CDN);
        }
        if (typeof workerSelf.shp !== 'function') {
            throw new Error('shpjs nao carregou no Worker (self.shp ausente)');
        }
        const result = await workerSelf.shp!(buffer);
        workerSelf.postMessage({ requestId: requestId, ok: true, result: result });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        workerSelf.postMessage({ requestId: requestId, ok: false, error: msg });
    }
});