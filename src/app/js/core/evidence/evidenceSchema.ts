// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   EVIDENCE SCHEMA PURE — .evidence.json parse/validate/version
   ================================================================

   Schema canônico para arquivos .evidence.json (evidências de
   captura visual / export acadêmico). Fail-loud: qualquer desvio
   do schema lança erro com mensagem descritiva.

   Versionamento: campo schemaVersion (integer, current = 1).
   Migration path: migrateEvidence(records, fromVersion) aplica
   transforms sequenciais até CURRENT_SCHEMA_VERSION.
   ================================================================ */

export const CURRENT_SCHEMA_VERSION = 1;

export interface EvidenceRecord {
    id: string;
    type: string;
    timestamp: string;
    source: string;
    hash: string;
    metadata: Record<string, unknown>;
}

export interface EvidenceFile {
    schemaVersion: number;
    records: EvidenceRecord[];
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

const REQUIRED_FIELDS: (keyof EvidenceRecord)[] = ['id', 'type', 'timestamp', 'source', 'hash', 'metadata'];

function assertString(value: unknown, field: string, index: number): void {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`records[${index}].${field}: expected non-empty string, got ${JSON.stringify(value)}`);
    }
}

function parseRecord(raw: unknown, index: number): EvidenceRecord {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error(`records[${index}]: expected object, got ${Array.isArray(raw) ? 'array' : typeof raw}`);
    }
    const obj = raw as Record<string, unknown>;
    for (const field of REQUIRED_FIELDS) {
        if (!(field in obj)) {
            throw new Error(`records[${index}]: missing required field "${field}"`);
        }
    }
    assertString(obj.id, 'id', index);
    assertString(obj.type, 'type', index);
    assertString(obj.timestamp, 'timestamp', index);
    assertString(obj.source, 'source', index);
    assertString(obj.hash, 'hash', index);
    if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
        throw new Error(`records[${index}].metadata: expected plain object, got ${Array.isArray(obj.metadata) ? 'array' : typeof obj.metadata}`);
    }
    return {
        id: obj.id as string,
        type: obj.type as string,
        timestamp: obj.timestamp as string,
        source: obj.source as string,
        hash: obj.hash as string,
        metadata: obj.metadata as Record<string, unknown>,
    };
}

export function parseEvidenceJson(json: string): EvidenceRecord[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        throw new Error(`Invalid JSON: ${(e as Error).message}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Root: expected object with "schemaVersion" and "records", got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
    }
    const root = parsed as Record<string, unknown>;
    if (!('schemaVersion' in root)) {
        throw new Error('Root: missing required field "schemaVersion"');
    }
    if (typeof root.schemaVersion !== 'number' || !Number.isInteger(root.schemaVersion) || root.schemaVersion < 1) {
        throw new Error(`Root.schemaVersion: expected positive integer, got ${JSON.stringify(root.schemaVersion)}`);
    }
    if (!('records' in root)) {
        throw new Error('Root: missing required field "records"');
    }
    if (!Array.isArray(root.records)) {
        throw new Error(`Root.records: expected array, got ${typeof root.records}`);
    }
    const version = root.schemaVersion as number;
    let records = (root.records as unknown[]).map((r, i) => parseRecord(r, i));
    if (version < CURRENT_SCHEMA_VERSION) {
        records = migrateEvidence(records, version);
    }
    if (version > CURRENT_SCHEMA_VERSION) {
        throw new Error(`Root.schemaVersion: unsupported version ${version} (current: ${CURRENT_SCHEMA_VERSION})`);
    }
    return records;
}

export function validateEvidenceSchema(records: unknown): ValidationResult {
    const errors: string[] = [];
    if (!Array.isArray(records)) {
        return { valid: false, errors: [`Expected array of records, got ${typeof records}`] };
    }
    for (let i = 0; i < records.length; i++) {
        const raw = records[i];
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            errors.push(`records[${i}]: expected object, got ${Array.isArray(raw) ? 'array' : typeof raw}`);
            continue;
        }
        const obj = raw as Record<string, unknown>;
        for (const field of REQUIRED_FIELDS) {
            if (!(field in obj)) {
                errors.push(`records[${i}]: missing required field "${field}"`);
            }
        }
        for (const field of ['id', 'type', 'timestamp', 'source', 'hash'] as const) {
            if (field in obj && (typeof obj[field] !== 'string' || (obj[field] as string).length === 0)) {
                errors.push(`records[${i}].${field}: expected non-empty string, got ${JSON.stringify(obj[field])}`);
            }
        }
        if ('metadata' in obj) {
            const md = obj.metadata;
            if (typeof md !== 'object' || md === null || Array.isArray(md)) {
                errors.push(`records[${i}].metadata: expected plain object, got ${Array.isArray(md) ? 'array' : typeof md}`);
            }
        }
    }
    return { valid: errors.length === 0, errors };
}

export function migrateEvidence(records: EvidenceRecord[], fromVersion: number): EvidenceRecord[] {
    if (fromVersion < 1) {
        throw new Error(`Cannot migrate from version ${fromVersion}: minimum supported source version is 1`);
    }
    let result = records;
    for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
        result = applyMigration(result, v);
    }
    return result;
}

function applyMigration(records: EvidenceRecord[], fromVersion: number): EvidenceRecord[] {
    switch (fromVersion) {
        default:
            throw new Error(`No migration path from version ${fromVersion}`);
    }
}
