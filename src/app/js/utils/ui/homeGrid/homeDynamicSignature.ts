// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export function buildHomeGridDynamicHash(input: any = {}) {
    const elements = Array.isArray(input.elements) ? input.elements : [];
    const campaigns = Array.isArray(input.campaigns) ? input.campaigns : [];
    return [
        input.cardsHash || '',
        input.modelId || '',
        input.userId || '',
        input.bootState || '',
        input.activeDomain || '',
        input.activeObjectId || '',
        input.activeObjectType || '',
        input.activeScopeKind || '',
        input.activeModelSource || '',
        input.activeModelId || '',
        input.activeLaneId || '',
        input.activeSnapshotId || '',
        input.treeFilter || '',
        elements
            .map((element: any) => `${element?.id || ''}:${element?.family || ''}:${element?.name || element?.label || ''}`)
            .join(';'),
        campaigns.map((campaign: any) => `${campaign?.id || ''}:${campaign?.name || ''}`).join(';'),
    ].join('|');
}
