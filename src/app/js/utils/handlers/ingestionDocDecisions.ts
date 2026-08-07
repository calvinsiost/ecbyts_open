// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

const DOC_PROFILE_STRATEGIES = ['replace', 'append', 'skip'];
const DOC_VISUAL_TYPES = new Set([
    'map',
    'plume_contour',
    'floor_plan',
    'lithologic_profile',
    'cross_section',
    'photo',
    'chart',
]);

export const DOC_VISUAL_FAMILIES = ['plume', 'blueprint', 'building', 'stratum', 'generic'];

export function buildDefaultDocDecisions(): Record<string, any> {
    return {
        matrixAmbiguityScope: 'page_table',
        matrixOverrides: {},
        lgpdStrategy: 'pseudonymize',
        profileConflictStrategy: 'append',
        saveInFiles: true,
        visualWizardEnabled: true,
        visualActions: {},
        // Legacy decision fields kept for backward-compatible state reads.
        nonDetectStrategy: 'flag_null',
        campaignFromDates: 'auto_campaigns',
        legislationPriority: 'all',
    };
}

export function ensureDocDecisions(docState: any): Record<string, any> {
    if (!docState || typeof docState !== 'object') return buildDefaultDocDecisions();
    const defaults = buildDefaultDocDecisions();
    const current = docState._decisions && typeof docState._decisions === 'object' ? docState._decisions : {};
    const merged = {
        ...defaults,
        ...current,
        matrixOverrides: { ...(defaults.matrixOverrides || {}), ...(current.matrixOverrides || {}) },
        visualActions: { ...(defaults.visualActions || {}), ...(current.visualActions || {}) },
    };
    if (!DOC_PROFILE_STRATEGIES.includes(merged.profileConflictStrategy)) {
        merged.profileConflictStrategy = defaults.profileConflictStrategy;
    }
    docState._decisions = merged;
    return merged;
}

export function getDocSuggestedFamilyFromAssetType(assetType: any): string {
    const type = String(assetType || '').toLowerCase();
    if (type === 'plume_contour') return 'plume';
    if (type === 'floor_plan' || type === 'map') return 'blueprint';
    if (type === 'lithologic_profile' || type === 'cross_section') return 'stratum';
    if (type === 'chart') return 'generic';
    if (type === 'photo') return 'building';
    return 'generic';
}

export function getDocVisualAssetLabel(assetType: any): string {
    const type = String(assetType || '').toLowerCase();
    if (type === 'plume_contour') return 'Pluma';
    if (type === 'floor_plan') return 'Planta';
    if (type === 'lithologic_profile') return 'Perfil litologico';
    if (type === 'cross_section') return 'Secao';
    if (type === 'map') return 'Mapa';
    if (type === 'photo') return 'Foto';
    if (type === 'chart') return 'Grafico';
    return type || 'Asset';
}

export function collectDocVisualAssets(docState: any): any[] {
    if (!docState || typeof docState !== 'object') return [];
    const assets = Array.isArray(docState.documentAssets) ? docState.documentAssets : [];
    const classifications = Array.isArray(docState.assetClassifications) ? docState.assetClassifications : [];
    const decisions = ensureDocDecisions(docState);
    const visualActions = decisions.visualActions || {};
    const out: any[] = [];

    for (let i = 0; i < Math.max(assets.length, classifications.length); i++) {
        const asset = assets[i] || {};
        const classification = classifications[i] || {};
        const assetType = String(classification.assetType || 'unknown').toLowerCase();
        if (!DOC_VISUAL_TYPES.has(assetType)) continue;

        const assetKey = `asset-${i}`;
        const suggestedFamily = DOC_VISUAL_FAMILIES.includes(classification.familyHint)
            ? classification.familyHint
            : getDocSuggestedFamilyFromAssetType(assetType);
        const current = visualActions[assetKey] || {};
        if (!visualActions[assetKey]) {
            visualActions[assetKey] = {
                createAsset: false,
                download: false,
                targetFamily: suggestedFamily,
            };
        } else if (!current.targetFamily) {
            current.targetFamily = suggestedFamily;
            visualActions[assetKey] = current;
        }

        out.push({
            assetKey,
            index: i,
            asset,
            classification,
            assetType,
            page: asset.page || 0,
            suggestedFamily,
            action: visualActions[assetKey],
        });
    }

    decisions.visualActions = visualActions;
    return out;
}

export function redactDocReadingSource(
    reading: any,
    piiDetection: any,
    redact: any = (value: any) => value,
): any {
    const redactLoose = (value: any): any => {
        if (typeof value === 'string') return redact(value, piiDetection);
        if (Array.isArray(value)) return value.map(redactLoose);
        if (value && typeof value === 'object') {
            const out: Record<string, any> = {};
            for (const [key, nested] of Object.entries(value)) out[key] = redactLoose(nested);
            return out;
        }
        return value;
    };
    const source = redactLoose(reading.source || {});
    return { ...reading, source };
}
