// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FIELD-META-EXT-001 — extended metadata sections.

   Three optional metadata sections attachable to any field carrying
   FIELD-META-001 base record:

   1. Calibração      — instrument provenance for analytical accuracy
                        (ISO/IEC 17025 alignment). Drives EIS Acurácia
                        bonus (+0.5 calibrated / 0 uncertain / −0.5 expired).
   2. Grupo de Dados  — radar profile/slice binding + access tier.
                        Enables broadcasting controls without coupling
                        radar/* into fieldMeta.
   3. Dados Adicionais — user-defined key/value entries (CRUD).
                         Free-form structured extension; immutable ops.

   All builders return frozen objects. Helpers (CRUD + status compute)
   are pure-functions; arrays are recreated immutably.
   ================================================================ */

type CalibrationStatus = 'calibrated' | 'expired' | 'uncertain' | 'unknown';
type AccessTier = 'public' | 'summary' | 'protected' | 'private';
type SharingScope = 'owner' | 'team' | 'org' | 'external';
type AdditionalDataType = 'string' | 'number' | 'boolean' | 'date';

interface AdditionalDataEntry {
    id: string;
    key: string;
    value: unknown;
    type: AdditionalDataType;
    addedAt: string;
    addedBy: string | null;
    pinned: boolean;
}

export const CALIBRATION_STATUSES = Object.freeze(['calibrated', 'expired', 'uncertain', 'unknown']);

export const ACCESS_TIERS = Object.freeze(['public', 'summary', 'protected', 'private']);
export const SHARING_SCOPES = Object.freeze(['owner', 'team', 'org', 'external']);
export const ADDITIONAL_DATA_TYPES = Object.freeze(['string', 'number', 'boolean', 'date']);

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/* ----------------------------------------------------------------
   1. Calibração
   ---------------------------------------------------------------- */

/**
 * Compute calibration status from last calibration date + interval.
 * Boundaries (inclusive on lower edge):
 *   daysSince < intervalDays                → 'calibrated'
 *   intervalDays ≤ daysSince ≤ intervalDays*1.2 → 'uncertain'
 *   daysSince > intervalDays*1.2            → 'expired'
 *   lastCalibrationDate is null             → 'unknown'
 *
 * @param params
 * @returns
 */
export function computeCalibrationStatus({
    lastCalibrationDate,
    intervalDays,
    now = Date.now(),
}: {
    lastCalibrationDate?: string | null;
    intervalDays?: number | undefined;
    now?: number | undefined;
} = {}): CalibrationStatus {
    if (!lastCalibrationDate) return 'unknown';
    const parsed = Date.parse(lastCalibrationDate);
    if (!Number.isFinite(parsed)) return 'unknown';
    const interval = Number(intervalDays);
    if (!Number.isFinite(interval) || interval <= 0) return 'unknown';
    const daysSince = (now - parsed) / MS_PER_DAY;
    if (daysSince < 0) return 'unknown'; // future calibration is invalid input
    if (daysSince < interval) return 'calibrated';
    if (daysSince <= interval * 1.2) return 'uncertain';
    return 'expired';
}

interface CalibrationMetaInput {
    instrumentId: string;
    instrumentModel?: string | null;
    serialNumber?: string | null;
    lastCalibrationDate?: string | null;
    nextCalibrationDue?: string | null;
    intervalDays?: number;
    accuracy?: number | null;
    uncertainty?: number | null;
    certificateNumber?: string | null;
    standard?: string | null;
    status?: CalibrationStatus;
    laboratory?: string | null;
    notes?: string | null;
    now?: number;
}

/**
 * Build a frozen Calibração metadata record.
 *
 * @param input
 */
export function buildCalibrationMeta(input: CalibrationMetaInput) {
    if (!input || typeof input !== 'object') {
        throw new Error('buildCalibrationMeta: input object required');
    }
    if (!input.instrumentId || typeof input.instrumentId !== 'string') {
        throw new Error('buildCalibrationMeta: instrumentId (non-empty string) is required');
    }
    const intervalDays =
        Number.isFinite(input.intervalDays) && Number(input.intervalDays) > 0 ? Number(input.intervalDays) : 365;
    const lastCalibrationDate = input.lastCalibrationDate ?? null;
    if (lastCalibrationDate !== null) {
        const parsed = Date.parse(lastCalibrationDate);
        if (!Number.isFinite(parsed)) {
            throw new Error('buildCalibrationMeta: lastCalibrationDate must be ISO 8601 or null');
        }
    }
    const nextCalibrationDue = input.nextCalibrationDue ?? null;
    if (nextCalibrationDue !== null) {
        const parsedDue = Date.parse(nextCalibrationDue);
        if (!Number.isFinite(parsedDue)) {
            throw new Error('buildCalibrationMeta: nextCalibrationDue must be ISO 8601 or null');
        }
    }
    let status = input.status;
    if (status && !CALIBRATION_STATUSES.includes(status)) {
        throw new Error(`buildCalibrationMeta: status must be one of ${CALIBRATION_STATUSES.join('|')}`);
    }
    if (!status) {
        status = computeCalibrationStatus({
            lastCalibrationDate,
            intervalDays,
            now: input.now,
        });
    }
    const accuracy = input.accuracy ?? null;
    if (accuracy !== null && !Number.isFinite(accuracy)) {
        throw new Error('buildCalibrationMeta: accuracy must be number or null');
    }
    const uncertainty = input.uncertainty ?? null;
    if (uncertainty !== null && !Number.isFinite(uncertainty)) {
        throw new Error('buildCalibrationMeta: uncertainty must be number or null');
    }
    return Object.freeze({
        instrumentId: input.instrumentId,
        instrumentModel: input.instrumentModel ?? null,
        serialNumber: input.serialNumber ?? null,
        lastCalibrationDate,
        nextCalibrationDue,
        intervalDays,
        accuracy,
        uncertainty,
        certificateNumber: input.certificateNumber ?? null,
        standard: input.standard ?? null,
        status,
        laboratory: input.laboratory ?? null,
        notes: input.notes ?? null,
    });
}

/* ----------------------------------------------------------------
   2. Grupo de Dados
   ---------------------------------------------------------------- */

interface DataGroupMetaInput {
    radarProfileId?: string | null;
    radarSliceId?: string | null;
    accessTier?: AccessTier;
    sharingScope?: SharingScope;
    groupLabel?: string | null;
    publishedToRadar?: boolean;
}

/**
 * Build a frozen Grupo de Dados metadata record. Binds field to a radar
 * profile/slice + declares access tier + sharing scope.
 *
 * @param input
 */
export function buildDataGroupMeta(input: DataGroupMetaInput = {}) {
    if (input && typeof input !== 'object') {
        throw new Error('buildDataGroupMeta: input must be object');
    }
    const accessTier = input.accessTier ?? 'private';
    if (!ACCESS_TIERS.includes(accessTier)) {
        throw new Error(`buildDataGroupMeta: accessTier must be one of ${ACCESS_TIERS.join('|')}`);
    }
    const sharingScope = input.sharingScope ?? 'owner';
    if (!SHARING_SCOPES.includes(sharingScope)) {
        throw new Error(`buildDataGroupMeta: sharingScope must be one of ${SHARING_SCOPES.join('|')}`);
    }
    const radarProfileId = input.radarProfileId ?? null;
    if (radarProfileId !== null && typeof radarProfileId !== 'string') {
        throw new Error('buildDataGroupMeta: radarProfileId must be string or null');
    }
    const radarSliceId = input.radarSliceId ?? null;
    if (radarSliceId !== null && typeof radarSliceId !== 'string') {
        throw new Error('buildDataGroupMeta: radarSliceId must be string or null');
    }
    return Object.freeze({
        radarProfileId,
        radarSliceId,
        accessTier,
        sharingScope,
        groupLabel: input.groupLabel ?? null,
        publishedToRadar: Boolean(input.publishedToRadar),
    });
}

/* ----------------------------------------------------------------
   3. Dados Adicionais (user-defined key/value entries)
   ---------------------------------------------------------------- */

function makeId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `ad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validate one Dados Adicionais entry. Returns true iff entry has non-empty
 * key, valid type, and value matches the declared type.
 *
 * @param entry
 * @returns
 */
export function validateAdditionalDataEntry(entry: unknown): boolean {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, any>;
    if (!e.key || typeof e.key !== 'string' || !e.key.trim()) return false;
    if (!ADDITIONAL_DATA_TYPES.includes(e.type)) return false;
    if (e.value === undefined || e.value === null) return false;
    if (e.type === 'string') return typeof e.value === 'string';
    if (e.type === 'number') return typeof e.value === 'number' && Number.isFinite(e.value);
    if (e.type === 'boolean') return typeof e.value === 'boolean';
    if (e.type === 'date') {
        if (typeof e.value !== 'string') return false;
        return Number.isFinite(Date.parse(e.value));
    }
    return false;
}

interface AdditionalDataEntryInput {
    id?: string | undefined;
    key: string;
    value: unknown;
    type: AdditionalDataType;
    addedAt?: string | undefined;
    addedBy?: string | null | undefined;
    pinned?: boolean | undefined;
}

/**
 * Build a frozen Dados Adicionais array. Accepts an array of partial entry
 * descriptors; throws on the first invalid descriptor.
 *
 * @param entries
 */
export function buildAdditionalDataMeta(entries: AdditionalDataEntryInput[] = []) {
    if (!Array.isArray(entries)) {
        throw new Error('buildAdditionalDataMeta: entries must be array');
    }
    const result = entries.map((raw, idx) => {
        const entry = normalizeAdditionalDataEntry(raw);
        if (!validateAdditionalDataEntry(entry)) {
            throw new Error(`buildAdditionalDataMeta: entry[${idx}] is invalid`);
        }
        return entry;
    });
    return Object.freeze(result);
}

/**
 * @param raw
 */
function normalizeAdditionalDataEntry(raw: AdditionalDataEntryInput): Readonly<AdditionalDataEntry> {
    if (!raw || typeof raw !== 'object') {
        throw new Error('additional data entry must be object');
    }
    return Object.freeze({
        id: raw.id || makeId(),
        key: String(raw.key ?? '').trim(),
        value: raw.value,
        type: raw.type,
        addedAt: raw.addedAt || new Date().toISOString(),
        addedBy: raw.addedBy ?? null,
        pinned: Boolean(raw.pinned),
    });
}

/**
 * Append a new entry. Returns a new frozen array (immutable).
 * Throws on validation error.
 *
 * @param array
 * @param input
 */
export function addAdditionalDataEntry(
    array: ReadonlyArray<Record<string, any>>,
    input: { key: string; value: unknown; type: string; addedBy?: string | null; pinned?: boolean }
) {
    const base = Array.isArray(array) ? array : [];
    const entry = normalizeAdditionalDataEntry({
        key: input.key,
        value: input.value,
        type: input.type as AdditionalDataType,
        addedBy: input.addedBy ?? null,
        pinned: input.pinned,
    });
    if (!validateAdditionalDataEntry(entry)) {
        throw new Error('addAdditionalDataEntry: invalid entry');
    }
    return Object.freeze([...base, entry]);
}

/**
 * Remove entry by id. Returns a new frozen array. Idempotent (returns
 * a frozen copy even if id not found).
 *
 * @param array
 * @param any>>
 */
export function removeAdditionalDataEntry(array: ReadonlyArray<Record<string, any>>, id: string) {
    const base = Array.isArray(array) ? array : [];
    return Object.freeze(base.filter((e) => e?.id !== id));
}

/**
 * Patch a single entry by id. Returns a new frozen array. Throws if patch
 * results in invalid entry.
 *
 * @param array
 * @param id
 * @param patch
 */
export function updateAdditionalDataEntry(
    array: ReadonlyArray<Record<string, any>>,
    id: string,
    patch: Partial<{ key: string; value: unknown; type: string; pinned: boolean; addedBy: string | null }>
) {
    const base = Array.isArray(array) ? array : [];
    let touched = false;
    const next = base.map((entry) => {
        if (!entry || entry.id !== id) return entry;
        touched = true;
        const merged = normalizeAdditionalDataEntry({
            id: entry.id,
            key: patch.key ?? entry.key,
            value: patch.value !== undefined ? patch.value : entry.value,
            type: (patch.type ?? entry.type) as AdditionalDataType,
            addedAt: entry.addedAt,
            addedBy: patch.addedBy !== undefined ? patch.addedBy : entry.addedBy,
            pinned: patch.pinned !== undefined ? patch.pinned : entry.pinned,
        });
        if (!validateAdditionalDataEntry(merged)) {
            throw new Error(`updateAdditionalDataEntry: patch produced invalid entry for id ${id}`);
        }
        return merged;
    });
    if (!touched) return Object.freeze([...base]);
    return Object.freeze(next);
}
