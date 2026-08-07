// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// IMPORT-UX-001 RF-9 — Healthcheck de serviços de ingestão.
// Sonda os serviços do pipeline de ingestão (extração pdfplumber, OCR
// traineddata, Web Worker) e retorna status honesto para exibir badge
// no modal de importação ANTES de o usuário iniciar o processamento.
//
// Build-free: sem entrada em ts-migration-map.json, sem mirror .js.
// Testes: node --experimental-strip-types --test tests/import-healthcheck.test.mjs

export interface ServiceHealthResult {
    service: string;
    status: 'healthy' | 'degraded' | 'down';
    latency: number;
}

export interface HealthcheckOptions {
    timeoutMs?: number;
    degradedThresholdMs?: number;
    fetchFn?: typeof fetch;
    baseUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEGRADED_THRESHOLD_MS = 2000;

const TRAINEDDATA_FILES = ['por.traineddata.gz', 'eng.traineddata.gz'];
const LOCAL_ASSET_BASE = './assets/tesseract/';
const CDN_FALLBACK_BASE = 'https://cdn.jsdelivr.net/npm/tesseract.js-data@5/';

async function probeUrl(
    url: string,
    fetchFn: typeof fetch,
    timeoutMs: number,
): Promise<{ ok: boolean; status: number; latency: number }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchFn(url, {
            method: 'HEAD',
            signal: controller.signal,
        });
        const latency = Date.now() - start;
        return { ok: res.ok, status: res.status, latency };
    } catch {
        return { ok: false, status: 0, latency: Date.now() - start };
    } finally {
        clearTimeout(timer);
    }
}

function classify(
    ok: boolean,
    status: number,
    latency: number,
    degradedThresholdMs: number,
): ServiceHealthResult['status'] {
    if (!ok && status === 0) return 'down';
    if (!ok) return 'degraded';
    if (latency >= degradedThresholdMs) return 'degraded';
    return 'healthy';
}

async function checkExtraction(
    fetchFn: typeof fetch,
    baseUrl: string,
    timeoutMs: number,
    degradedThresholdMs: number,
): Promise<ServiceHealthResult> {
    const url = `${baseUrl}/api/pdfplumber`;
    const { ok, status, latency } = await probeUrl(url, fetchFn, timeoutMs);
    return { service: 'extraction', status: classify(ok, status, latency, degradedThresholdMs), latency };
}

async function checkOcrAssets(
    fetchFn: typeof fetch,
    timeoutMs: number,
    degradedThresholdMs: number,
): Promise<ServiceHealthResult> {
    const start = Date.now();
    let anyOk = false;
    let allOk = true;
    let usedFallback = false;
    let worstLatency = 0;

    for (const file of TRAINEDDATA_FILES) {
        const local = await probeUrl(`${LOCAL_ASSET_BASE}${file}`, fetchFn, timeoutMs);
        if (local.ok) {
            anyOk = true;
            worstLatency = Math.max(worstLatency, local.latency);
            continue;
        }
        const cdn = await probeUrl(`${CDN_FALLBACK_BASE}${file}`, fetchFn, timeoutMs);
        if (cdn.ok) {
            anyOk = true;
            usedFallback = true;
            worstLatency = Math.max(worstLatency, cdn.latency);
        } else {
            allOk = false;
        }
    }

    const latency = Date.now() - start;
    if (!anyOk) return { service: 'ocr', status: 'down', latency };
    if (!allOk || usedFallback || worstLatency >= degradedThresholdMs) {
        return { service: 'ocr', status: 'degraded', latency };
    }
    return { service: 'ocr', status: 'healthy', latency };
}

function checkWorker(): ServiceHealthResult {
    const available = typeof Worker !== 'undefined';
    return {
        service: 'worker',
        status: available ? 'healthy' : 'down',
        latency: 0,
    };
}

export async function checkIngestionServices(
    opts?: HealthcheckOptions,
): Promise<ServiceHealthResult[]> {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const degradedThresholdMs = opts?.degradedThresholdMs ?? DEGRADED_THRESHOLD_MS;
    const fetchFn = opts?.fetchFn ?? globalThis.fetch;
    const baseUrl = opts?.baseUrl ?? '';

    const [extraction, ocr] = await Promise.all([
        checkExtraction(fetchFn, baseUrl, timeoutMs, degradedThresholdMs),
        checkOcrAssets(fetchFn, timeoutMs, degradedThresholdMs),
    ]);
    const worker = checkWorker();

    return [extraction, ocr, worker];
}
