// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// micro_activity:acad:p2:evidencias-export:x02 — runner de capturas + composicao
// grid ffmpeg + manifest reproduzivel.
//
// Este modulo e PLANEJAMENTO PURO (sem DOM, sem I/O): gera o plano de capturas e
// o manifest do grid. A EXECUCAO da captura e PLUGGABLE e acontece no browser:
//   - Estrategia padrao: dom-to-image-more via automacao in-app (decisao Calvin
//     2026-06-17: captura no browser do proprio app; Playwright APENAS como
//     fallback declarado explicitamente).
//   - html2canvas NAO funciona no ecbyts (limitacao conhecida CL4) — nao usar.
// O grid e composto de forma reproduzivel via ffmpeg (filtro xstack com padding
// deterministico), descrito no manifest como um vetor de argumentos ffmpeg.

export type CaptureStrategyId = 'dom-to-image-more' | 'playwright-fallback';

export const DEFAULT_CAPTURE_STRATEGY: CaptureStrategyId = 'dom-to-image-more';

export interface CaptureViewport {
    width: number;
    height: number;
    deviceScaleFactor?: number;
}

export interface CaptureConfig {
    urls: readonly string[];
    viewport: CaptureViewport;
    outputDir: string;
}

export interface CapturePlan {
    index: number;
    url: string;
    slug: string;
    outputPath: string;
    viewport: CaptureViewport;
    strategy: CaptureStrategyId;
}

export interface GridCaptureInput {
    outputPath: string;
    width?: number;
    height?: number;
    viewport?: { width: number; height: number };
    url?: string;
}

export interface GridComposeOptions {
    outputPath?: string;
    columns?: number;
    cellWidth?: number;
    cellHeight?: number;
}

export interface GridManifestCell {
    index: number;
    column: number;
    row: number;
    inputPath: string | null;
    url?: string;
}

export interface GridManifest {
    version: 1;
    generatedBy: 'ecbyts-capture-runner';
    cellCount: number;
    columns: number;
    rows: number;
    totalCells: number;
    paddingCells: number;
    cellWidth: number;
    cellHeight: number;
    gridWidth: number;
    gridHeight: number;
    uniform: boolean;
    tile: string;
    inputs: readonly string[];
    cells: readonly GridManifestCell[];
    ffmpegArgs: readonly string[];
    outputPath: string;
}

function sanitizeSlug(value: string): string {
    const cleaned = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return cleaned || 'capture';
}

export function slugifyUrl(url: string): string {
    let basis = url;
    try {
        const parsed = new URL(url);
        const hash = parsed.hash.replace(/^#\/?/, '/');
        basis = `${parsed.host}${parsed.pathname}${hash}`;
    } catch {
        basis = url;
    }
    return sanitizeSlug(basis);
}

function normalizeDir(dir: string): string {
    return dir.trim().replace(/\/+$/g, '');
}

function pad2(index: number): string {
    return String(index).padStart(2, '0');
}

export function planCaptures(config: CaptureConfig): CapturePlan[] {
    if (!config || typeof config !== 'object') {
        throw new TypeError('captureConfig: config deve ser um objeto.');
    }
    const { urls, viewport, outputDir } = config;
    if (!Array.isArray(urls) || urls.length === 0) {
        throw new TypeError('captureConfig: urls deve ser um array nao vazio.');
    }
    if (typeof outputDir !== 'string' || outputDir.trim().length === 0) {
        throw new TypeError('captureConfig: outputDir deve ser uma string nao vazia.');
    }
    if (!viewport || typeof viewport !== 'object') {
        throw new TypeError('captureConfig: viewport deve ser um objeto.');
    }
    if (!Number.isInteger(viewport.width) || viewport.width <= 0) {
        throw new TypeError('captureConfig: viewport.width deve ser um inteiro positivo.');
    }
    if (!Number.isInteger(viewport.height) || viewport.height <= 0) {
        throw new TypeError('captureConfig: viewport.height deve ser um inteiro positivo.');
    }
    if (
        viewport.deviceScaleFactor !== undefined &&
        !(typeof viewport.deviceScaleFactor === 'number' && viewport.deviceScaleFactor > 0)
    ) {
        throw new TypeError('captureConfig: viewport.deviceScaleFactor deve ser um numero positivo.');
    }

    const dir = normalizeDir(outputDir);
    const plans: CapturePlan[] = [];
    urls.forEach((url, index) => {
        if (typeof url !== 'string' || url.trim().length === 0) {
            throw new TypeError(`captureConfig: urls[${index}] deve ser uma string nao vazia.`);
        }
        try {
            // Valida URL absoluta; rotas hash do app (ex.: https://host/#/inspector) sao aceitas.
            // eslint-disable-next-line no-new
            new URL(url);
        } catch {
            throw new TypeError(`captureConfig: urls[${index}] nao e uma URL absoluta valida: ${url}`);
        }
        const slug = slugifyUrl(url);
        const fileName = `${pad2(index)}-${slug}.png`;
        plans.push(
            Object.freeze({
                index,
                url,
                slug,
                outputPath: dir ? `${dir}/${fileName}` : fileName,
                viewport: Object.freeze({ ...viewport }),
                strategy: DEFAULT_CAPTURE_STRATEGY,
            }),
        );
    });
    return plans;
}

function autoColumns(cellCount: number): number {
    return Math.max(1, Math.ceil(Math.sqrt(cellCount)));
}

function defaultGridOutputPath(firstInput: string): string {
    const idx = firstInput.lastIndexOf('/');
    if (idx === -1) return 'grid.png';
    return `${firstInput.slice(0, idx)}/grid.png`;
}

function buildXstackFilter(
    fileCount: number,
    totalCells: number,
    columns: number,
    rows: number,
    uniform: boolean,
    cellWidth: number,
    cellHeight: number,
): string {
    const parts: string[] = [];
    const labels: string[] = [];
    if (!uniform) {
        for (let i = 0; i < fileCount; i++) {
            parts.push(`[${i}:v]scale=${cellWidth}:${cellHeight}[s${i}]`);
            labels.push(`[s${i}]`);
        }
    } else {
        for (let i = 0; i < fileCount; i++) labels.push(`[${i}:v]`);
    }
    for (let i = fileCount; i < totalCells; i++) {
        labels.push(`[${i}:v]`);
    }
    parts.push(`${labels.join('')}xstack=inputs=${totalCells}:grid=${columns}x${rows}`);
    return parts.join(';');
}

interface FfmpegArgOptions {
    inputs: string[];
    paddingCells: number;
    totalCells: number;
    columns: number;
    rows: number;
    uniform: boolean;
    cellWidth: number;
    cellHeight: number;
    outputPath: string;
}

function buildFfmpegArgs(opts: FfmpegArgOptions): string[] {
    const args: string[] = ['-y'];
    for (const input of opts.inputs) {
        args.push('-i', input);
    }
    for (let p = 0; p < opts.paddingCells; p++) {
        args.push('-f', 'lavfi', '-i', `color=c=black:s=${opts.cellWidth}x${opts.cellHeight}`);
    }
    args.push(
        '-filter_complex',
        buildXstackFilter(
            opts.inputs.length,
            opts.totalCells,
            opts.columns,
            opts.rows,
            opts.uniform,
            opts.cellWidth,
            opts.cellHeight,
        ),
    );
    args.push('-frames:v', '1');
    args.push(opts.outputPath);
    return args;
}

export function composeGridManifest(
    captures: readonly GridCaptureInput[],
    options: GridComposeOptions = {},
): GridManifest {
    if (!Array.isArray(captures) || captures.length === 0) {
        throw new TypeError('gridManifest: captures deve ser um array nao vazio.');
    }
    const resolved = captures.map((capture, index) => {
        if (!capture || typeof capture !== 'object') {
            throw new TypeError(`gridManifest: captures[${index}] deve ser um objeto.`);
        }
        const width = capture.width ?? capture.viewport?.width;
        const height = capture.height ?? capture.viewport?.height;
        if (typeof capture.outputPath !== 'string' || capture.outputPath.trim().length === 0) {
            throw new TypeError(`gridManifest: captures[${index}].outputPath deve ser uma string nao vazia.`);
        }
        if (!Number.isInteger(width) || (width as number) <= 0) {
            throw new TypeError(`gridManifest: captures[${index}] requer largura inteira positiva.`);
        }
        if (!Number.isInteger(height) || (height as number) <= 0) {
            throw new TypeError(`gridManifest: captures[${index}] requer altura inteira positiva.`);
        }
        return { outputPath: capture.outputPath, width: width as number, height: height as number, url: capture.url };
    });

    const cellCount = resolved.length;
    const columns = options.columns ?? autoColumns(cellCount);
    if (!Number.isInteger(columns) || columns <= 0) {
        throw new TypeError('gridManifest: options.columns deve ser um inteiro positivo.');
    }
    const rows = Math.ceil(cellCount / columns);
    const totalCells = columns * rows;
    const paddingCells = totalCells - cellCount;

    const cellWidth = options.cellWidth ?? Math.max(...resolved.map((c) => c.width));
    const cellHeight = options.cellHeight ?? Math.max(...resolved.map((c) => c.height));
    if (!Number.isInteger(cellWidth) || cellWidth <= 0) {
        throw new TypeError('gridManifest: cellWidth deve ser um inteiro positivo.');
    }
    if (!Number.isInteger(cellHeight) || cellHeight <= 0) {
        throw new TypeError('gridManifest: cellHeight deve ser um inteiro positivo.');
    }

    const uniform = resolved.every((c) => c.width === cellWidth && c.height === cellHeight);
    const inputs = resolved.map((c) => c.outputPath);

    const cells: GridManifestCell[] = [];
    for (let i = 0; i < totalCells; i++) {
        const source = i < cellCount ? resolved[i] : null;
        cells.push(
            Object.freeze({
                index: i,
                column: i % columns,
                row: Math.floor(i / columns),
                inputPath: source ? source.outputPath : null,
                url: source?.url,
            }),
        );
    }

    const outputPath = options.outputPath ?? defaultGridOutputPath(inputs[0]);
    const ffmpegArgs = buildFfmpegArgs({
        inputs,
        paddingCells,
        totalCells,
        columns,
        rows,
        uniform,
        cellWidth,
        cellHeight,
        outputPath,
    });

    return Object.freeze({
        version: 1,
        generatedBy: 'ecbyts-capture-runner',
        cellCount,
        columns,
        rows,
        totalCells,
        paddingCells,
        cellWidth,
        cellHeight,
        gridWidth: columns * cellWidth,
        gridHeight: rows * cellHeight,
        uniform,
        tile: `${columns}x${rows}`,
        inputs: Object.freeze([...inputs]),
        cells: Object.freeze(cells),
        ffmpegArgs: Object.freeze(ffmpegArgs),
        outputPath,
    });
}
