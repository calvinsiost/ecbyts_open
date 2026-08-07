// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK -> CHAVE ECBT - kind portavel 'pipeline-pack'.

   Mantem o pacote customizavel exportavel/importavel sem conflitar com o
   kind historico 'pipeline', que continua focado no desenho nativo/BPMN.
   ================================================================ */

import { registerKind } from '../io/portableArtifacts.js';
import {
    migrateLegacyPipelinePreset,
    normalizePipelinePack,
    validatePipelinePack,
    type PipelineAssetBinding,
    type PipelinePack,
    type PipelinePackValidationResult,
} from './pipelinePack.js';
import {
    summarizePipelineDomainProfile,
    type PipelineDomainProfileSummary,
} from './pipelineDomainProfile.js';
import {
    PIPELINE_PROTOCOL_ID,
    buildPipelineProtocol,
    validatePipelineProtocol,
    type PipelineProtocolDocument,
    type PipelineProtocolValidationResult,
    type PipelineProtocolVersionLedger,
} from './pipelineProtocol.js';

export const PIPELINE_PACK_ARTIFACT_KIND = 'pipeline-pack';
export const PIPELINE_PACK_ARTIFACT_FORMAT = 'ecbyts.pipeline-pack.artifact';
export const PIPELINE_PACK_STORAGE_KEY = 'ecbyts-pipeline-packs';
const SCHEMA_VERSION = 1;
const ARTIFACT_PAYLOAD_VERSION = 2;

export interface PipelinePackArtifactValidationSnapshot {
    pipelinePack: {
        valid: boolean;
        score: number;
        errors: PipelinePackValidationResult['errors'];
        warnings: PipelinePackValidationResult['warnings'];
        checks: PipelinePackValidationResult['checks'];
    };
    pipelineProtocol: PipelineProtocolValidationResult;
}

export interface PipelinePackArtifactPayload extends PipelinePack {
    artifactFormat: typeof PIPELINE_PACK_ARTIFACT_FORMAT;
    artifactSchemaVersion: number;
    protocol: PipelineProtocolDocument;
    domainProfile: PipelineDomainProfileSummary;
    versionLedger: PipelineProtocolVersionLedger;
    validations: PipelinePackArtifactValidationSnapshot;
}

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

function _isFileNameKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return normalized === 'filename'
        || normalized === 'sourcefilename'
        || normalized.endsWith('filename');
}

function _isSensitivePathKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return normalized === 'localpath'
        || normalized === 'fullpath'
        || normalized === 'absolutepath'
        || normalized === 'nativepath'
        || normalized === 'sourcepath'
        || normalized === 'originalpath'
        // Authoring-only annotation used by assertPipelinePackExportable to allow
        // a local path through the export gate; it documents a local decision and
        // must not ship inside the portable .ecbt payload itself.
        || normalized === 'localpathexception';
}

function _looksLikeLocalPath(value: string): boolean {
    const text = value.trim();
    return /^(file:\/\/\/?|[a-zA-Z]:[\\/]|\\\\|\/(?:Users|home|var|tmp|private|Volumes|mnt)\/)/.test(text);
}

function _basename(value: string): string {
    const normalized = value.trim().replace(/^file:\/\/\/?/i, '');
    const parts = normalized.split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] || normalized;
}

function _sanitizePortableValue(value: unknown, key = ''): unknown {
    if (Array.isArray(value)) {
        return value
            .map((item) => _sanitizePortableValue(item))
            .filter((item) => item !== undefined);
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
            if (_isSensitivePathKey(entryKey)) continue;
            const sanitized = _sanitizePortableValue(entryValue, entryKey);
            if (sanitized !== undefined) out[entryKey] = sanitized;
        }
        return out;
    }
    if (typeof value === 'string') {
        const text = _nonEmpty(value);
        if (_isFileNameKey(key)) return _basename(text);
        if (_looksLikeLocalPath(text)) return undefined;
    }
    return value;
}

function _sanitizePipelinePackForArtifact(input: unknown): PipelinePack {
    const pack = normalizePipelinePack(input);
    return normalizePipelinePack(_sanitizePortableValue(pack));
}

/**
 * PIPELINE-PACK-CUSTOMIZATION-001#32 - export gate for portable asset references.
 *
 * An asset is exportable when it carries a reference that survives outside the
 * author's machine: a durable Files/Supabase identity (`fileId`/`storagePath`)
 * or an already-portable status (`missing`/`no-permission`/`pending-validation`,
 * which are pendencies, not silent local leaks). An asset whose ONLY reference
 * is a local filesystem path (`fileName` shaped like `C:\...`, `/Users/...`,
 * `file://...`) blocks export unless it carries a documented
 * `localPathException` justification.
 *
 * This does not silently strip the path (that already happens defensively in
 * `_sanitizePortableValue` for arbitrary node/target params) - it fails loud so
 * the author knows to upload the asset or record an exception, matching the
 * spec requirement "Bloquear export se nao houver referencia portavel e nem
 * excecao" (docs/specs/features/SPEC_PIPELINE_PACK_CUSTOMIZATION_WORKBENCH.md
 * secao 10.9).
 */
export interface PipelinePackExportBlockedAsset {
    assetId: string;
    label: string;
    fileName: string;
    reason: string;
}

export class PipelinePackExportBlockedError extends Error {
    readonly code = 'pipeline-pack.export.local-path-blocked';
    readonly blockedAssets: readonly PipelinePackExportBlockedAsset[];

    constructor(blockedAssets: readonly PipelinePackExportBlockedAsset[]) {
        const summary = blockedAssets
            .map((item) => `${item.assetId} (${item.fileName || item.label}): ${item.reason}`)
            .join('; ');
        super(
            `Pipeline Pack export blocked: ${blockedAssets.length} asset(s) only reference a local file path ` +
                `with no portable Files/Supabase reference and no documented exception - ${summary}`,
        );
        this.name = 'PipelinePackExportBlockedError';
        this.blockedAssets = blockedAssets;
    }
}

function _hasPortableAssetReference(asset: PipelineAssetBinding): boolean {
    const record = asset as unknown as Record<string, unknown>;
    if (_nonEmpty(record.fileId)) return true;
    if (_nonEmpty(asset.storagePath) && !_looksLikeLocalPath(_nonEmpty(asset.storagePath))) return true;
    return false;
}

function _assetOnlyHasLocalPath(asset: PipelineAssetBinding): string {
    const record = asset as unknown as Record<string, unknown>;
    const candidates = [asset.fileName, asset.storagePath, record.localPath, record.sourcePath, record.path]
        .map((value) => _nonEmpty(value))
        .filter(Boolean);
    return candidates.find((value) => _looksLikeLocalPath(value)) || '';
}

function _findExportBlockedAssets(pack: PipelinePack): PipelinePackExportBlockedAsset[] {
    const blocked: PipelinePackExportBlockedAsset[] = [];
    for (const asset of pack.assets || []) {
        if (_hasPortableAssetReference(asset)) continue;
        if (_nonEmpty(asset.localPathException)) continue;
        const localPath = _assetOnlyHasLocalPath(asset);
        if (!localPath) continue;
        blocked.push({
            assetId: asset.id,
            label: asset.label,
            fileName: localPath,
            reason: 'local filesystem path with no Files/Supabase reference and no localPathException',
        });
    }
    return blocked;
}

/**
 * Throws PipelinePackExportBlockedError when the pack has assets that only
 * reference a local filesystem path with no portable reference and no
 * documented exception. Safe to call before building the artifact payload.
 */
export function assertPipelinePackExportable(input: unknown): PipelinePack {
    const pack = normalizePipelinePack(input);
    const blocked = _findExportBlockedAssets(pack);
    if (blocked.length > 0) {
        throw new PipelinePackExportBlockedError(blocked);
    }
    return pack;
}

function _packInputFromArtifact(artifact: unknown): unknown {
    const raw = _asObject(artifact);
    const nestedPack = _asObject(raw.pack);
    if (Object.keys(nestedPack).length > 0) return nestedPack;
    return artifact;
}

function _packValidationSnapshot(pack: PipelinePack): PipelinePackArtifactValidationSnapshot['pipelinePack'] {
    const validation = validatePipelinePack(pack);
    return {
        valid: validation.valid,
        score: validation.score,
        errors: validation.errors,
        warnings: validation.warnings,
        checks: validation.checks,
    };
}

function _buildArtifactContext(pack: PipelinePack): Omit<PipelinePackArtifactPayload,
    keyof PipelinePack | 'artifactFormat' | 'artifactSchemaVersion'> {
    const protocol = buildPipelineProtocol(pack);
    return {
        protocol,
        domainProfile: summarizePipelineDomainProfile(pack),
        versionLedger: protocol.versionLedger,
        validations: {
            pipelinePack: _packValidationSnapshot(pack),
            pipelineProtocol: validatePipelineProtocol(protocol),
        },
    };
}

function _hasProtocolDocument(value: unknown): value is PipelineProtocolDocument {
    return _asObject(value).protocolId === PIPELINE_PROTOCOL_ID;
}

function _readArtifactContext(
    rawArtifact: Record<string, unknown>,
    pack: PipelinePack,
): Omit<PipelinePackArtifactPayload, keyof PipelinePack | 'artifactFormat' | 'artifactSchemaVersion'> {
    const generated = _buildArtifactContext(pack);
    const protocol = _hasProtocolDocument(rawArtifact.protocol)
        ? rawArtifact.protocol as PipelineProtocolDocument
        : generated.protocol;
    const rawVersionLedger = _asObject(rawArtifact.versionLedger);
    const protocolVersionLedger = _asObject(protocol.versionLedger);
    const context = {
        protocol,
        domainProfile: Object.keys(_asObject(rawArtifact.domainProfile)).length > 0
            ? rawArtifact.domainProfile as PipelineDomainProfileSummary
            : generated.domainProfile,
        versionLedger: Object.keys(rawVersionLedger).length > 0
            ? rawArtifact.versionLedger as PipelineProtocolVersionLedger
            : Object.keys(protocolVersionLedger).length > 0
                ? protocol.versionLedger
                : generated.versionLedger,
        validations: Object.keys(_asObject(rawArtifact.validations)).length > 0
            ? rawArtifact.validations as PipelinePackArtifactValidationSnapshot
            : generated.validations,
    };
    return _sanitizePortableValue(context) as Omit<PipelinePackArtifactPayload,
        keyof PipelinePack | 'artifactFormat' | 'artifactSchemaVersion'>;
}

function _withArtifactContext(
    pack: PipelinePack,
    context: Omit<PipelinePackArtifactPayload, keyof PipelinePack | 'artifactFormat' | 'artifactSchemaVersion'>,
): PipelinePackArtifactPayload {
    return {
        artifactFormat: PIPELINE_PACK_ARTIFACT_FORMAT,
        artifactSchemaVersion: ARTIFACT_PAYLOAD_VERSION,
        ...pack,
        protocol: context.protocol,
        domainProfile: context.domainProfile,
        versionLedger: context.versionLedger,
        validations: context.validations,
    };
}

export function validatePipelinePackArtifact(payload: unknown): { valid: boolean; errors: string[] } {
    const pack = pipelinePackFromArtifact(payload);
    const result = validatePipelinePack(pack);
    const protocolValidation = validatePipelineProtocol(pack.protocol || pack);
    const errors = result.errors
        .map((issue) => `${issue.code}: ${issue.message}`)
        .concat(protocolValidation.issues
            .filter((issue) => issue.severity === 'error')
            .map((issue) => `protocol.${issue.code}: ${issue.message}`));
    return {
        valid: errors.length === 0,
        errors,
    };
}

export interface PipelinePackExportBlocker {
    /** Frase pronta para a tela, sem termo tecnico. */
    userMessage: string;
    /** O que o usuario deve fazer para destravar. */
    suggestedFix: string;
    /** Codigo cru — para log/diagnostico, NUNCA para a tela. */
    technicalCode: string;
    /** Item do processo que originou o impedimento. */
    ownerItemId: string;
}

/**
 * Antecipa o que impediria a exportacao e devolve o motivo em linguagem de
 * processo. A tela chama isto ANTES de gerar a chave: sem esta antecipacao o
 * unico retorno ao usuario era a mensagem crua do encoder (com "payload",
 * "conditionRef" e afins) depois da falha.
 */
export function explainPipelinePackExportBlockers(input: unknown): {
    ok: boolean;
    blockers: PipelinePackExportBlocker[];
} {
    const pack = normalizePipelinePack(input);
    const protocolValidation = validatePipelineProtocol(buildPipelineProtocol(pack));
    const blockers = protocolValidation.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => ({
            userMessage: issue.userMessage || issue.message,
            suggestedFix: issue.suggestedFix,
            technicalCode: issue.technicalCode || issue.code,
            ownerItemId: issue.ownerItemId,
        }));
    return { ok: blockers.length === 0, blockers };
}

export function pipelinePackToArtifact(payload: unknown): PipelinePackArtifactPayload {
    const rawPack = _packInputFromArtifact(payload);
    assertPipelinePackExportable(rawPack);
    const pack = _sanitizePipelinePackForArtifact(rawPack);
    const context = _readArtifactContext(_asObject(payload), pack);
    return _withArtifactContext(pack, context);
}

export function pipelinePackFromArtifact(artifact: unknown): PipelinePackArtifactPayload {
    const raw = _asObject(artifact);
    const migration = migrateLegacyPipelinePreset(_packInputFromArtifact(artifact));
    const pack = _sanitizePipelinePackForArtifact(migration.pack);
    const context = _readArtifactContext(raw, pack);
    return _withArtifactContext(pack, context);
}

function _readStoredPacks(): Record<string, PipelinePack> {
    try {
        const storage = globalThis.localStorage;
        if (!storage) return {};
        const raw = storage.getItem(PIPELINE_PACK_STORAGE_KEY) || '';
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, PipelinePack>
            : {};
    } catch {
        return {};
    }
}

export async function applyPipelinePackImport(obj: unknown): Promise<boolean> {
    try {
        const storage = globalThis.localStorage;
        if (!storage) return false;
        const pack = pipelinePackFromArtifact(obj);
        const validation = validatePipelinePackArtifact(pack);
        if (validation.errors.some((issue) => issue.startsWith('asset.extension.blocked:'))) return false;
        const packs = _readStoredPacks();
        packs[pack.id] = pack;
        storage.setItem(PIPELINE_PACK_STORAGE_KEY, JSON.stringify(packs));
        return true;
    } catch {
        return false;
    }
}

let _registered = false;

export function registerPipelinePackArtifactKind(): void {
    if (_registered) return;
    registerKind({
        kind: PIPELINE_PACK_ARTIFACT_KIND,
        schemaVersion: SCHEMA_VERSION,
        validate: validatePipelinePackArtifact,
        toArtifact: pipelinePackToArtifact,
        fromArtifact: pipelinePackFromArtifact,
        applyImport: applyPipelinePackImport,
    });
    _registered = true;
}
