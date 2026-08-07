// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * FORMAT REGISTRY — Pluggable catalog of import/export file formats.
 *
 * Pure-logic central registry. Each format module calls `registerFormat`
 * at import time; the export/import UI consults the registry for the list
 * of supported options. No DOM, no I/O.
 *
 * Reference: docs/specs/features/SPEC_IO_PIPELINE.md
 */

export type ExportScope = 'elements' | 'observations' | 'campaigns' | 'scene' | 'full';

export type FormatExportFn = (model: unknown, options?: Record<string, unknown>) => Promise<Blob>;

export type FormatImportFn = (file: File | Blob, options?: Record<string, unknown>) => Promise<unknown>;

export interface FormatDescriptor {
    readonly id: string;
    readonly name: string;
    readonly extensions: readonly string[];
    readonly mimeType: string;
    readonly canExport: boolean;
    readonly canImport: boolean;
    readonly exportScopes?: readonly ExportScope[];
    readonly exportFn?: FormatExportFn;
    readonly importFn?: FormatImportFn;
    readonly needsOrigin?: boolean;
}

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------

const FORMAT_REGISTRY = new Map<string, FormatDescriptor>();

// ----------------------------------------------------------------
// API
// ----------------------------------------------------------------

/**
 * Register a format descriptor in the catalog. Idempotent — a second
 * call with the same id overwrites the previous entry.
 *
 * @throws {Error} if the descriptor lacks a non-empty `id`.
 */
export function registerFormat(descriptor: FormatDescriptor): void {
    if (!descriptor.id) {
        throw new Error('Format descriptor must have an id');
    }
    FORMAT_REGISTRY.set(descriptor.id, descriptor);
}

/**
 * Get a format descriptor by id, or `undefined` if not registered.
 */
export function getFormat(id: string): FormatDescriptor | undefined {
    return FORMAT_REGISTRY.get(id);
}

/**
 * List every registered format in insertion order.
 */
export function getAllFormats(): FormatDescriptor[] {
    return Array.from(FORMAT_REGISTRY.values());
}

/**
 * List formats that advertise export support.
 */
export function getExportFormats(): FormatDescriptor[] {
    return getAllFormats().filter((f) => f.canExport);
}

/**
 * List formats that advertise import support.
 */
export function getImportFormats(): FormatDescriptor[] {
    return getAllFormats().filter((f) => f.canImport);
}

/**
 * Detect a format from a filename's extension. Returns `undefined` if
 * the extension is not registered or the input has no extension.
 */
export function detectFormat(filename: string): FormatDescriptor | undefined {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex < 0) return undefined;
    const ext = filename.substring(dotIndex).toLowerCase();
    return getAllFormats().find((f) => f.extensions.includes(ext));
}
