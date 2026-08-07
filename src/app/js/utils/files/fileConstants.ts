// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

export const FILE_BUCKET = 'user-files';
export const DOWNLOAD_URL_EXPIRES_SECONDS = 60 * 60;

export const FILE_SCOPE = Object.freeze({
    WORKSPACE: 'workspace',
    MODEL: 'model',
} as const);
export type FileScope = (typeof FILE_SCOPE)[keyof typeof FILE_SCOPE];

export const FILE_SOURCE = Object.freeze({
    IMPORT: 'import',
    AUTOMATION: 'automation',
    MANUAL: 'manual',
    API: 'api',
    PHOTOLOG: 'photolog',
} as const);
export type FileSource = (typeof FILE_SOURCE)[keyof typeof FILE_SOURCE];

export const FILE_STATUS = Object.freeze({
    PENDING_UPLOAD: 'pending_upload',
    ACTIVE: 'active',
    ORPHANED: 'orphaned',
    DELETED: 'deleted',
} as const);
export type FileStatus = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];

export const FILE_REGISTER_MODE = Object.freeze({
    STRICT: 'strict',
    BEST_EFFORT: 'best_effort',
} as const);
export type FileRegisterMode = (typeof FILE_REGISTER_MODE)[keyof typeof FILE_REGISTER_MODE];

export const FILE_PLAN_LIMITS = Object.freeze({
    free: { maxBytes: 50 * 1024 * 1024, maxFiles: 20 },
    pro: { maxBytes: 500 * 1024 * 1024, maxFiles: 200 },
} as const);

export const TEXT_EXTENSIONS = new Set<string>(['csv', 'geojson', 'json', 'txt', 'eco1']);
export const PREVIEW_EXTENSIONS = new Set<string>(['csv', 'xlsx', 'xls', 'dxf']);

export const ERROR_CODE = Object.freeze({
    NOT_AUTHENTICATED: 'files/not_authenticated',
    CLIENT_NOT_READY: 'files/client_not_ready',
    INVALID_FILE: 'files/invalid_file',
    QUOTA_EXCEEDED: 'files/quota_exceeded',
    REGISTER_FAILED: 'files/register_failed',
    UPLOAD_FAILED: 'files/upload_failed',
    FETCH_FAILED: 'files/fetch_failed',
    NOT_FOUND: 'files/not_found',
    ACCESS_DENIED: 'files/access_denied',
    CHECKSUM_MISMATCH: 'files/checksum_mismatch',
    PREVIEW_UNAVAILABLE: 'files/preview_unavailable',
    PARSE_FAILED: 'files/parse_failed',
} as const);
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export function getFileRegisterMode(): FileRegisterMode {
    const raw = localStorage.getItem('ecbyts-files-register-mode') || '';
    return raw === FILE_REGISTER_MODE.STRICT ? FILE_REGISTER_MODE.STRICT : FILE_REGISTER_MODE.BEST_EFFORT;
}

export function getPlanFromSubscription(subscriptionStatus: unknown): 'pro' | 'free' {
    return subscriptionStatus === 'active' ? 'pro' : 'free';
}