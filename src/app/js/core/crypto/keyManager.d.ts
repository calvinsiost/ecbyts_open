// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export interface StoredKeyRecord {
    id: string;
    name: string;
    publicKey: JsonWebKey;
    privateKey?: JsonWebKey | null;
    privateKeyWrapped?: string;
    createdAt: string;
    imported?: boolean;
    importedFrom?: string;
    hasPrivateKey?: boolean;
    vaultVersion?: number;
}

export interface PublicKeyExport {
    keyId: string;
    name: string;
    publicKey: JsonWebKey;
    exportedAt?: string;
}

export interface KeySummary {
    id: string;
    name: string;
    createdAt: string;
    imported: boolean;
    hasPrivateKey: boolean;
    vaultVersion: number;
}

export interface KeyImportSummary {
    keyId: string;
    name: string;
    createdAt: string;
}

export function generateKeyPair(name?: string): Promise<KeyImportSummary & { publicKey: JsonWebKey }>;
export function getKeyPair(keyId: string): Promise<StoredKeyRecord | null>;
export function getPrivateKey(keyId: string): Promise<CryptoKey>;
export function listKeys(): Promise<KeySummary[]>;
export function hasKeys(): Promise<boolean>;
export function getDefaultKey(): Promise<KeySummary | null>;
export function exportPublicKey(keyId: string): Promise<PublicKeyExport>;
export function exportPublicKeyAsString(keyId: string): Promise<string>;
export function importPublicKey(publicKeyData: PublicKeyExport | string): Promise<KeyImportSummary>;
export function renameKey(keyId: string, newName: string): Promise<void>;
export function deleteKey(keyId: string): Promise<void>;
export function clearAllKeys(): Promise<void>;
export function isSupported(): boolean;
export function formatKeyId(keyId?: string | null): string | null | undefined;
