// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

type HomeGridEventTarget = {
    __ecbytsUiUpdateEvents?: unknown[];
    __perfRouteVitals?: unknown;
    __ecbytsWebVitalsFieldMonitor?: unknown;
    localStorage?: { getItem(key: string): string | null };
};

type PerfLike = {
    now: () => number;
};

function getWindowRef(): HomeGridEventTarget | null {
    return typeof window === 'undefined' ? null : (window as unknown as HomeGridEventTarget);
}

export function shouldRecordHomeGridPhase(windowRef: HomeGridEventTarget | null = getWindowRef()): boolean {
    if (!windowRef) return false;
    if (Array.isArray(windowRef.__ecbytsUiUpdateEvents)) return true;
    if (windowRef.__perfRouteVitals || windowRef.__ecbytsWebVitalsFieldMonitor) return true;
    try {
        return windowRef.localStorage?.getItem('ecbyts-perf-debug') === 'true';
    } catch (_e) {
        return false;
    }
}

export function recordHomeGridPhase(label: string, startTime: number, success: boolean, error: unknown = null, deps: any = {}) {
    const windowRef: HomeGridEventTarget | null = deps.windowRef ?? getWindowRef();
    if (!shouldRecordHomeGridPhase(windowRef)) return;
    const perf: PerfLike = deps.performanceRef ?? performance;
    const current = Array.isArray(windowRef?.__ecbytsUiUpdateEvents) ? windowRef.__ecbytsUiUpdateEvents : [];
    const entry = {
        label: `home-grid:${label}`,
        startTime: Math.round(startTime),
        duration: Math.round(perf.now() - startTime),
        success,
        error: error ? String((error as any)?.message || error).slice(0, 120) : '',
    };
    windowRef!.__ecbytsUiUpdateEvents = [...current, entry]
        .sort((a: any, b: any) => Number(b?.duration || 0) - Number(a?.duration || 0))
        .slice(0, 80);
}

export function runHomeGridPhase<T>(label: string, fn: () => T, deps: any = {}): T {
    const perf: PerfLike = deps.performanceRef ?? performance;
    const start = perf.now();
    try {
        const result = fn();
        recordHomeGridPhase(label, start, true, null, deps);
        return result;
    } catch (error) {
        recordHomeGridPhase(label, start, false, error, deps);
        throw error;
    }
}

export function buildHomeShellContextSignature(input: any = {}): string {
    const elements = Array.isArray(input.elements) ? input.elements : [];
    const campaigns = Array.isArray(input.campaigns) ? input.campaigns : [];
    const parts = [
        input.activeDomain || 'monitoring',
        input.activeObjectId || '',
        input.activeObjectType || '',
        input.activeScopeKind || '',
        input.activeOrgId || '',
        input.activeModelSource || '',
        input.activeModelId || '',
        input.activeModelLabel || '',
        input.activeLaneId || '',
        input.activeSnapshotId || '',
        input.treeFilter || '',
        input.actionsSideView || '',
        input.modelId || '',
        input.userId || '',
    ];
    parts.push(elements.map((element: any) => `${element?.id || ''}:${element?.family || ''}:${element?.name || ''}`).join(';'));
    parts.push(campaigns.map((campaign: any) => `${campaign?.id || ''}:${campaign?.name || ''}`).join(';'));
    return parts.join('|');
}

export function buildNavigatorTreeSignature(input: any = {}): string {
    const elements = Array.isArray(input.elements) ? input.elements : [];
    const campaigns = Array.isArray(input.campaigns) ? input.campaigns : [];
    const elementSig = elements
        .map((element: any) => `${element?.id || ''}:${element?.family || ''}:${element?.name || ''}:${(element?.observations || []).length}`)
        .join(';');
    const campaignSig = campaigns.map((campaign: any) => `${campaign?.id || ''}:${campaign?.name || ''}:${(campaign?.plannedReadings || []).length}`).join(';');
    return [input.activeModelId || '', input.activeModelLabel || '', input.activeSnapshotId || '', elementSig, campaignSig].join('|');
}
