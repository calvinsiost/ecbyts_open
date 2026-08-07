// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * consent.ts — Phase 2 TS source for simulation consent storage.
 * Promotes @typedef SimulationConsentRecord to exported interface.
 */

const CONSENT_KEY = 'ecbyts-sim-consents';

export interface SimulationConsentRecord {
    acceptedAt?: number;
    [key: string]: unknown;
}

function _readStore(): Record<string, SimulationConsentRecord> {
    try {
        const raw = localStorage.getItem(CONSENT_KEY) || '';
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, SimulationConsentRecord>) : {};
    } catch {
        return {};
    }
}

function _writeStore(data: Record<string, SimulationConsentRecord>): void {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(data));
}

function _consentId(modelId: string, version: string): string {
    return `${modelId}@${version || '1.0.0'}`;
}

export function hasSimulationConsent(modelId: string, version: string): boolean {
    const store = _readStore();
    return Boolean(store[_consentId(modelId, version)]?.acceptedAt);
}

export function recordSimulationConsent(
    modelId: string,
    version: string,
    extra: Record<string, unknown> = {},
): void {
    const store = _readStore();
    store[_consentId(modelId, version)] = {
        acceptedAt: Date.now(),
        ...extra,
    };
    _writeStore(store);
}

export function clearSimulationConsent(modelId: string, version: string): void {
    const store = _readStore();
    delete store[_consentId(modelId, version)];
    _writeStore(store);
}
