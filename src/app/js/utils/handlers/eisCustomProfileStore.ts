// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

function toVerdictBands(
    verdictBands: any,
    fallback = { managementReadyMin: 3.5, auditReadyMin: 4.5 },
): { managementReadyMin: number; auditReadyMin: number } {
    const managementReadyMin = Number(verdictBands?.managementReadyMin ?? fallback.managementReadyMin);
    const auditReadyMin = Number(verdictBands?.auditReadyMin ?? fallback.auditReadyMin);
    return {
        managementReadyMin: toFiniteNumber(managementReadyMin, 3.5),
        auditReadyMin: toFiniteNumber(auditReadyMin, 4.5),
    };
}

function toVerdictBandsPayload(verdictBands: any): Array<{ label: string; min: number; max: number }> {
    const bands = toVerdictBands(verdictBands);
    return [
        {
            label: 'Critical Data',
            min: 0,
            max: Number(bands.managementReadyMin - 0.01),
        },
        {
            label: 'Management Ready',
            min: Number(bands.managementReadyMin),
            max: Number(bands.auditReadyMin - 0.01),
        },
        {
            label: 'Audit Ready',
            min: Number(bands.auditReadyMin),
            max: 5,
        },
    ];
}

function toAxisPayload(axis: any): { key: any; enabled: boolean; weight: number; formula_ref: any } {
    return {
        key: axis?.id || axis?.key || '',
        enabled: axis?.enabled !== false,
        weight: Number(axis?.weight || 1),
        formula_ref: axis?.formulaRef || axis?.formula_ref || null,
    };
}

function buildTemplatePayload(
    profile: any,
    {
        currentUserLabel,
        includeCreatedBy = false,
    }: { currentUserLabel: any; includeCreatedBy?: boolean },
): Record<string, any> {
    const body: Record<string, any> = {
        name: profile?.name,
        description: profile?.description || '',
        status: profile?.status || 'draft',
        axes: Array.isArray(profile?.axes) ? profile.axes.map(toAxisPayload) : [],
        veto: profile?.veto || { enabled: false, rules: [] },
        verdict_bands: toVerdictBandsPayload(profile?.verdictBands),
        updated_by: currentUserLabel,
    };

    if (includeCreatedBy) {
        body.based_on = profile?.basedOn || 'default';
        body.owner_type = profile?.ownerType || 'user';
        body.owner_id = profile?.ownerId || currentUserLabel;
        body.created_by = currentUserLabel;
    }

    return body;
}

async function readSuccessPayload(response: any): Promise<any> {
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    return payload?.success ? payload.data : null;
}

export function normalizeStoredCustomProfiles(
    parsed: any,
    { defaultVerdictBands }: { defaultVerdictBands?: any },
): any[] {
    const fallbackBands = defaultVerdictBands?.() || { managementReadyMin: 3.5, auditReadyMin: 4.5 };
    return Array.isArray(parsed)
        ? parsed.map((profile) => ({
              ...profile,
              status: profile?.status || 'draft',
              version: Number(profile?.version || 1),
              basedOn: profile?.basedOn || 'custom',
              veto: profile?.veto || { enabled: false, minAxis: 2 },
              verdictBands: profile?.verdictBands || fallbackBands,
              isDirty: false,
              axes: Array.isArray(profile?.axes)
                  ? profile.axes.map((axis: any) => ({
                        ...axis,
                        enabled: axis?.enabled !== false,
                        formulaRef: axis?.formulaRef || '',
                    }))
                  : [],
              auditLog: Array.isArray(profile?.auditLog) ? profile.auditLog : [],
          }))
        : [];
}

export function mapApiTemplateRowsToProfiles(
    rows: any,
    { currentUserLabel, defaultVerdictBands }: { currentUserLabel: any; defaultVerdictBands?: any },
): any[] {
    const fallbackBands = defaultVerdictBands?.() || { managementReadyMin: 3.5, auditReadyMin: 4.5 };
    return (Array.isArray(rows) ? rows : []).map((row) => ({
        id: `api_${row.id}`,
        apiId: row.id,
        name: row.name,
        description: row.description || '',
        isTemplate: false,
        status: row.status || 'draft',
        version: Number(row.version || 1),
        basedOn: row.based_on || 'default',
        ownerType: row.owner_type || 'user',
        ownerId: row.owner_id || currentUserLabel,
        isDirty: false,
        veto: row.veto || { enabled: false, minAxis: 2, rules: [] },
        verdictBands: {
            managementReadyMin:
                Number(
                    (row.verdict_bands || []).find((band: any) =>
                        String(band.label || '')
                            .toLowerCase()
                            .includes('management'),
                    )?.min,
                ) || fallbackBands.managementReadyMin,
            auditReadyMin:
                Number(
                    (row.verdict_bands || []).find((band: any) =>
                        String(band.label || '')
                            .toLowerCase()
                            .includes('audit'),
                    )?.min,
                ) || fallbackBands.auditReadyMin,
        },
        axes: Array.isArray(row.axes)
            ? row.axes.map((axis: any) => ({
                  id: axis.key,
                  key: axis.key,
                  name: axis.key,
                  enabled: axis.enabled !== false,
                  weight: Number(axis.weight || 1),
                  formulaRef: axis.formula_ref || null,
                  description: '',
              }))
            : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        auditLog: [],
    }));
}

export async function fetchTemplateRows({
    apiUrl,
    currentUserLabel,
    fetchImpl = globalThis.fetch,
}: {
    apiUrl: string;
    currentUserLabel: any;
    fetchImpl?: any;
}): Promise<any> {
    try {
        const ownerId = encodeURIComponent(currentUserLabel);
        const response = await fetchImpl(`${apiUrl}?owner_id=${ownerId}&owner_type=user`, {
            credentials: 'same-origin',
        });
        return await readSuccessPayload(response);
    } catch {
        return null;
    }
}

export async function createTemplate(
    profile: any,
    {
        apiUrl,
        currentUserLabel,
        fetchImpl = globalThis.fetch,
    }: { apiUrl: string; currentUserLabel: any; fetchImpl?: any },
): Promise<any> {
    try {
        const response = await fetchImpl(apiUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildTemplatePayload(profile, { currentUserLabel, includeCreatedBy: true })),
        });
        return await readSuccessPayload(response);
    } catch {
        return null;
    }
}

export async function updateTemplate(
    profile: any,
    {
        apiUrl,
        currentUserLabel,
        fetchImpl = globalThis.fetch,
    }: { apiUrl: string; currentUserLabel: any; fetchImpl?: any },
): Promise<any> {
    if (!profile?.apiId) return null;
    try {
        const response = await fetchImpl(`${apiUrl}/${encodeURIComponent(profile.apiId)}`, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildTemplatePayload(profile, { currentUserLabel })),
        });
        return await readSuccessPayload(response);
    } catch {
        return null;
    }
}

export async function publishTemplate(
    profile: any,
    {
        apiUrl,
        currentUserLabel,
        fetchImpl = globalThis.fetch,
    }: { apiUrl: string; currentUserLabel: any; fetchImpl?: any },
): Promise<any> {
    if (!profile?.apiId) return null;
    try {
        const response = await fetchImpl(`${apiUrl}/${encodeURIComponent(profile.apiId)}/publish`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updated_by: currentUserLabel }),
        });
        return await readSuccessPayload(response);
    } catch {
        return null;
    }
}
