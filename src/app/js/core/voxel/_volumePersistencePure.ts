// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VOLUME PERSISTENCE PURE — RF-8 da SPEC_VOXEL_PIPELINE.

   Export/import de volumes voxelados com carimbo de proveniência,
   variância e qualidade no payload. Versão de schema no payload.
   Migração de volumes antigos = NO_DATA em tudo (honesto — não
   inventa metadados que não existiam no formato legado).

   PUREZA: sem DOM, sem I/O, determinístico (exceto exportedAt
   que usa new Date().toISOString()).
   ================================================================ */

export const VOLUME_SCHEMA_VERSION = '1.0';
export const NO_DATA = 'NO_DATA';

export interface VolumeExportPayload {
    readonly schemaVersion: string;
    readonly exportedAt: string;
    readonly grid: { nx: number; ny: number; nz: number; resolution: number };
    readonly channel: { name: string; data: number[] };
    readonly provenance?: { source: string; method: string; timestamp: string } | typeof NO_DATA;
    readonly quality?: { mae: number; rmse: number; r2: number; n: number; method: string } | typeof NO_DATA;
    readonly variance?: { data: number[]; method: string; cutoff: number } | typeof NO_DATA;
    readonly surfaceStamps?: number[] | typeof NO_DATA;
}

export interface ExportVolumeParams {
    readonly grid: { nx: number; ny: number; nz: number; resolution: number };
    readonly channel: { name: string; data: number[] };
    readonly provenance?: { source: string; method: string; timestamp: string };
    readonly quality?: { mae: number; rmse: number; r2: number; n: number; method: string };
    readonly variance?: { data: number[]; method: string; cutoff: number };
    readonly surfaceStamps?: number[];
}

export interface ImportVolumeResult {
    readonly grid: { nx: number; ny: number; nz: number; resolution: number };
    readonly channel: { name: string; data: number[] };
    readonly provenance: { source: string; method: string; timestamp: string } | null;
    readonly quality: { mae: number; rmse: number; r2: number; n: number; method: string } | null;
    readonly variance: { data: number[]; method: string; cutoff: number } | null;
    readonly surfaceStamps: number[] | null;
}

export interface ValidationResult {
    readonly valid: boolean;
    readonly errors: string[];
}

export function exportVolume(params: ExportVolumeParams): VolumeExportPayload {
    return {
        schemaVersion: VOLUME_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        grid: { ...params.grid },
        channel: { name: params.channel.name, data: [...params.channel.data] },
        provenance: params.provenance ? { ...params.provenance } : NO_DATA,
        quality: params.quality ? { ...params.quality } : NO_DATA,
        variance: params.variance
            ? { data: [...params.variance.data], method: params.variance.method, cutoff: params.variance.cutoff }
            : NO_DATA,
        surfaceStamps: params.surfaceStamps ? [...params.surfaceStamps] : NO_DATA,
    };
}

export function importVolume(payload: VolumeExportPayload): ImportVolumeResult {
    if (payload.schemaVersion !== VOLUME_SCHEMA_VERSION) {
        throw new Error(
            `Unsupported schema version "${payload.schemaVersion}" (expected "${VOLUME_SCHEMA_VERSION}")`,
        );
    }
    return {
        grid: { ...payload.grid },
        channel: { name: payload.channel.name, data: [...payload.channel.data] },
        provenance: payload.provenance === NO_DATA || payload.provenance === undefined
            ? null
            : { ...payload.provenance },
        quality: payload.quality === NO_DATA || payload.quality === undefined
            ? null
            : { ...payload.quality },
        variance: payload.variance === NO_DATA || payload.variance === undefined
            ? null
            : { data: [...payload.variance.data], method: payload.variance.method, cutoff: payload.variance.cutoff },
        surfaceStamps: payload.surfaceStamps === NO_DATA || payload.surfaceStamps === undefined
            ? null
            : [...payload.surfaceStamps],
    };
}

export function migrateLegacyVolume(legacyData: {
    readonly grid: { nx: number; ny: number; nz: number; resolution: number };
    readonly channel: { name: string; data: number[] };
}): VolumeExportPayload {
    return {
        schemaVersion: VOLUME_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        grid: { ...legacyData.grid },
        channel: { name: legacyData.channel.name, data: [...legacyData.channel.data] },
        provenance: NO_DATA,
        quality: NO_DATA,
        variance: NO_DATA,
        surfaceStamps: NO_DATA,
    };
}

export function validatePayload(payload: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof payload !== 'object' || payload === null) {
        return { valid: false, errors: ['Payload must be a non-null object'] };
    }

    const p = payload as Record<string, unknown>;

    if (typeof p.schemaVersion !== 'string') {
        errors.push('Missing or invalid schemaVersion (must be string)');
    } else if (p.schemaVersion !== VOLUME_SCHEMA_VERSION) {
        errors.push(`Unsupported schemaVersion "${p.schemaVersion}"`);
    }

    if (typeof p.exportedAt !== 'string') {
        errors.push('Missing or invalid exportedAt (must be ISO string)');
    }

    if (typeof p.grid !== 'object' || p.grid === null) {
        errors.push('Missing or invalid grid');
    } else {
        const g = p.grid as Record<string, unknown>;
        for (const key of ['nx', 'ny', 'nz', 'resolution'] as const) {
            if (typeof g[key] !== 'number') {
                errors.push(`grid.${key} must be a number`);
            }
        }
    }

    if (typeof p.channel !== 'object' || p.channel === null) {
        errors.push('Missing or invalid channel');
    } else {
        const ch = p.channel as Record<string, unknown>;
        if (typeof ch.name !== 'string') {
            errors.push('channel.name must be a string');
        }
        if (!Array.isArray(ch.data)) {
            errors.push('channel.data must be an array');
        }
    }

    if (p.provenance !== undefined && p.provenance !== NO_DATA) {
        const prov = p.provenance as Record<string, unknown>;
        if (typeof prov !== 'object' || prov === null) {
            errors.push('provenance must be an object or NO_DATA');
        } else {
            for (const key of ['source', 'method', 'timestamp'] as const) {
                if (typeof prov[key] !== 'string') {
                    errors.push(`provenance.${key} must be a string`);
                }
            }
        }
    }

    if (p.quality !== undefined && p.quality !== NO_DATA) {
        const q = p.quality as Record<string, unknown>;
        if (typeof q !== 'object' || q === null) {
            errors.push('quality must be an object or NO_DATA');
        } else {
            for (const key of ['mae', 'rmse', 'r2', 'n'] as const) {
                if (typeof q[key] !== 'number') {
                    errors.push(`quality.${key} must be a number`);
                }
            }
            if (typeof q.method !== 'string') {
                errors.push('quality.method must be a string');
            }
        }
    }

    if (p.variance !== undefined && p.variance !== NO_DATA) {
        const v = p.variance as Record<string, unknown>;
        if (typeof v !== 'object' || v === null) {
            errors.push('variance must be an object or NO_DATA');
        } else {
            if (!Array.isArray(v.data)) {
                errors.push('variance.data must be an array');
            }
            if (typeof v.method !== 'string') {
                errors.push('variance.method must be a string');
            }
            if (typeof v.cutoff !== 'number') {
                errors.push('variance.cutoff must be a number');
            }
        }
    }

    if (p.surfaceStamps !== undefined && p.surfaceStamps !== NO_DATA) {
        if (!Array.isArray(p.surfaceStamps)) {
            errors.push('surfaceStamps must be an array or NO_DATA');
        }
    }

    return { valid: errors.length === 0, errors };
}
