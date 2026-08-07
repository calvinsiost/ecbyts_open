// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PROTOCOL VERSION LEDGER - governanca de versoes do protocolo
   unificado (PIPELINE-UNIFIED-PROTOCOL #11).

   "Sem governanca de versoes: importacao/exportacao deve preservar
   versao e avisar quando migracao alterar semantica."
   (SPEC_PIPELINE_UNIFIED_PROTOCOL.md, blind spot "Sem governanca
   de versoes"; check minimo "exportacao .ecbt deve manter versao,
   perfil, validacoes e historico").

   O ledger e append-only: cada entrada ProtocolVersion registra uma
   versao com timestamp ISO 8601, autor, descricao de mudancas e hash
   de integridade (FNV-1a 32-bit). A exportacao .ecbt serializa
   ledger + documento num envelope binario com magic "ECBT" e versao
   de formato, e a importacao valida o envelope antes de devolver
   { history, doc }.

   Distincao: o `ProtocolVersionLedger` de pipelineProtocolDocument.ts
   e o snapshot de versao do documento (protocolVersion/packVersion/
   compatibilidade); este modulo guarda o HISTORICO append-only de
   versoes (ProtocolVersionHistory) e o transporte .ecbt.

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   ================================================================ */

export interface ProtocolVersion {
    version: string;
    timestamp: string;
    author: string;
    changes: string;
    hash: string;
}

export interface ProtocolVersionHistory {
    versions: ProtocolVersion[];
}

export interface EcbtImportResult {
    history: ProtocolVersionHistory;
    doc: Record<string, unknown>;
}

export const ECBT_FORMAT_VERSION = 1;

const ECBT_MAGIC = Object.freeze([0x45, 0x43, 0x42, 0x54] as const); // "ECBT"
const HEADER_LENGTH = ECBT_MAGIC.length + 1;

const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function trimText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidIsoTimestamp(value: string): boolean {
    return ISO_8601_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Compute a deterministic integrity hash (FNV-1a 32-bit, 8-char hex)
 * over the canonical fields of a version entry. Used to fill
 * ProtocolVersion.hash and to detect tampering in a stored ledger.
 *
 * @param {string} version - semantic version label (e.g. "1.2.0")
 * @param {string} timestamp - ISO 8601 timestamp with timezone
 * @param {string} author - author identifier
 * @param {string} changes - human-readable change description
 * @returns {string} 8-char lowercase hex hash
 */
export function computeVersionHash(version: string, timestamp: string, author: string, changes: string): string {
    const FNV_OFFSET_BASIS = 0x811c9dc5;
    const FNV_PRIME = 0x01000193;
    const input = `${version}\u0000${timestamp}\u0000${author}\u0000${changes}`;
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Create an empty, frozen version history.
 *
 * @returns {ProtocolVersionHistory} frozen history with zero versions
 */
export function createVersionHistory(): ProtocolVersionHistory {
    return Object.freeze({ versions: Object.freeze([]) as unknown as ProtocolVersion[] });
}

function normalizeEntry(entry: unknown): ProtocolVersion {
    if (!isPlainObject(entry)) {
        throw new TypeError('Entrada de versao precisa ser um objeto.');
    }
    const version = trimText(entry.version);
    if (!version) {
        throw new TypeError('Entrada de versao sem campo "version".');
    }
    const timestamp = trimText(entry.timestamp);
    if (!timestamp) {
        throw new TypeError('Entrada de versao sem campo "timestamp".');
    }
    if (!isValidIsoTimestamp(timestamp)) {
        throw new TypeError(`Timestamp invalido (esperado ISO 8601 com fuso): ${timestamp}`);
    }
    const author = trimText(entry.author);
    if (!author) {
        throw new TypeError('Entrada de versao sem campo "author".');
    }
    const changes = trimText(entry.changes);
    if (!changes) {
        throw new TypeError('Entrada de versao sem campo "changes".');
    }
    const hash = trimText(entry.hash);
    if (!hash) {
        throw new TypeError('Entrada de versao sem campo "hash".');
    }
    return Object.freeze({ version, timestamp, author, changes, hash });
}

function assertHistory(history: unknown): ProtocolVersion[] {
    if (!isPlainObject(history) || !Array.isArray(history.versions)) {
        throw new TypeError('Historico de versoes invalido (esperado { versions: [] }).');
    }
    return history.versions as ProtocolVersion[];
}

/**
 * Append a version entry to the ledger (append-only, immutable).
 * Validates required fields (version, timestamp ISO 8601, author,
 * changes, hash) and returns a NEW frozen history; the input history
 * is never mutated.
 *
 * @param {unknown} history - current ProtocolVersionHistory
 * @param {unknown} entry - candidate ProtocolVersion entry
 * @returns {ProtocolVersionHistory} new frozen history with entry appended
 * @throws {TypeError} when history or entry is invalid
 */
export function appendVersion(history: unknown, entry: unknown): ProtocolVersionHistory {
    const existing = assertHistory(history);
    const normalized = normalizeEntry(entry);
    const versions = Object.freeze([...existing, normalized]) as ProtocolVersion[];
    return Object.freeze({ versions });
}

/**
 * Return the most recent version entry, or null for an empty ledger.
 *
 * @param {unknown} history - ProtocolVersionHistory
 * @returns {ProtocolVersion | null} last entry or null
 */
export function latestVersion(history: unknown): ProtocolVersion | null {
    const versions = assertHistory(history);
    return versions.length > 0 ? (versions[versions.length - 1] ?? null) : null;
}

/**
 * Verify ledger integrity: every entry's stored hash must match the
 * recomputed FNV-1a hash of its canonical fields, and timestamps must
 * be non-decreasing along the append order.
 *
 * @param {unknown} history - ProtocolVersionHistory
 * @returns {{ valid: boolean; issues: string[] }} verdict + issue list
 */
export function verifyHistoryIntegrity(history: unknown): { valid: boolean; issues: string[] } {
    const versions = assertHistory(history);
    const issues: string[] = [];
    let previousTimestamp = '';
    versions.forEach((entry, index) => {
        const expected = computeVersionHash(entry.version, entry.timestamp, entry.author, entry.changes);
        if (entry.hash !== expected) {
            issues.push(`Entrada ${index} (versao ${entry.version}): hash divergente (esperado ${expected}, encontrado ${entry.hash}).`);
        }
        if (previousTimestamp && Date.parse(entry.timestamp) < Date.parse(previousTimestamp)) {
            issues.push(`Entrada ${index} (versao ${entry.version}): timestamp anterior ao da entrada precedente.`);
        }
        previousTimestamp = entry.timestamp;
    });
    return { valid: issues.length === 0, issues };
}

/**
 * Export ledger + protocol document to the .ecbt binary envelope.
 * Layout: 4-byte magic "ECBT" | 1-byte format version | UTF-8 JSON
 * payload { history, doc }. Pure and synchronous.
 *
 * @param {unknown} history - ProtocolVersionHistory to preserve
 * @param {unknown} doc - PipelineProtocolDocument (ou derivado)
 * @returns {ArrayBuffer} .ecbt envelope bytes
 * @throws {TypeError} when history or doc is invalid
 */
export function exportEcbt(history: unknown, doc: unknown): ArrayBuffer {
    const versions = assertHistory(history);
    if (!isPlainObject(doc)) {
        throw new TypeError('Documento de protocolo precisa ser um objeto.');
    }
    const payload = JSON.stringify({
        format: 'ecbt-pipeline-protocol',
        formatVersion: ECBT_FORMAT_VERSION,
        history: { versions },
        doc,
    });
    const body = new TextEncoder().encode(payload);
    const buffer = new ArrayBuffer(HEADER_LENGTH + body.byteLength);
    const view = new Uint8Array(buffer);
    ECBT_MAGIC.forEach((byte, index) => {
        view[index] = byte;
    });
    view[ECBT_MAGIC.length] = ECBT_FORMAT_VERSION;
    view.set(body, HEADER_LENGTH);
    return buffer;
}

/**
 * Import a .ecbt binary envelope back to { history, doc }. Validates
 * magic bytes, format version, JSON structure and the ledger shape
 * before returning frozen results.
 *
 * @param {ArrayBuffer | Uint8Array} buffer - .ecbt envelope bytes
 * @returns {EcbtImportResult} frozen { history, doc }
 * @throws {TypeError} on invalid/corrupted envelope
 */
export function importEcbt(buffer: unknown): EcbtImportResult {
    let bytes: Uint8Array;
    if (buffer instanceof Uint8Array) {
        bytes = buffer;
    } else if (buffer instanceof ArrayBuffer) {
        bytes = new Uint8Array(buffer);
    } else {
        throw new TypeError('Buffer .ecbt invalido (esperado ArrayBuffer ou Uint8Array).');
    }
    if (bytes.byteLength < HEADER_LENGTH) {
        throw new TypeError('Envelope .ecbt truncado (menor que o cabecalho).');
    }
    for (let i = 0; i < ECBT_MAGIC.length; i += 1) {
        if (bytes[i] !== ECBT_MAGIC[i]) {
            throw new TypeError('Envelope .ecbt com magic bytes invalidos.');
        }
    }
    const formatVersion = bytes[ECBT_MAGIC.length];
    if (formatVersion !== ECBT_FORMAT_VERSION) {
        throw new TypeError(`Versao de formato .ecbt nao suportada: ${formatVersion} (suportada: ${ECBT_FORMAT_VERSION}).`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER_LENGTH)));
    } catch {
        throw new TypeError('Envelope .ecbt com payload JSON corrompido.');
    }
    if (!isPlainObject(parsed)) {
        throw new TypeError('Payload .ecbt nao e um objeto.');
    }
    if (!isPlainObject(parsed.history) || !Array.isArray(parsed.history.versions)) {
        throw new TypeError('Payload .ecbt sem history.versions.');
    }
    if (!isPlainObject(parsed.doc)) {
        throw new TypeError('Payload .ecbt sem doc.');
    }

    const versions = Object.freeze(
        (parsed.history.versions as unknown[]).map((entry) => {
            if (!isPlainObject(entry)) {
                throw new TypeError('Payload .ecbt com entrada de versao invalida.');
            }
            return Object.freeze({
                version: trimText(entry.version),
                timestamp: trimText(entry.timestamp),
                author: trimText(entry.author),
                changes: trimText(entry.changes),
                hash: trimText(entry.hash),
            });
        }),
    ) as ProtocolVersion[];

    return Object.freeze({
        history: Object.freeze({ versions }) as ProtocolVersionHistory,
        doc: Object.freeze(parsed.doc) as Record<string, unknown>,
    });
}
