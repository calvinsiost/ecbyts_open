// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export function newIsoNow(): string {
    return new Date().toISOString();
}

export function getCurrentUserLabel(currentUser: any): string {
    return currentUser?.email || currentUser?.name || 'local-user';
}

export function defaultVerdictBands(verdicts: any): { auditReadyMin: any; managementReadyMin: any } {
    return {
        auditReadyMin: verdicts.AUDIT_READY.min,
        managementReadyMin: verdicts.MANAGEMENT_READY.min,
    };
}

export function createCustomProfile({
    id,
    name,
    basedOn = 'default',
    axes = [],
    actor = 'local-user',
    nowIso = newIsoNow(),
    verdictBands,
}: any): any {
    return {
        id,
        name,
        description: '',
        basedOn,
        ownerType: 'user',
        ownerId: actor,
        status: 'draft',
        version: 1,
        axes,
        veto: { enabled: false, minAxis: 2 },
        verdictBands,
        auditLog: [{ at: nowIso, by: actor, action: 'created', details: `Profile created from ${basedOn}` }],
        createdAt: nowIso,
        updatedAt: nowIso,
    };
}

export function pushCustomAudit(
    profile: any,
    action: any,
    details = '',
    { actor = 'local-user', nowIso = newIsoNow() }: any = {},
): void {
    if (!profile) return;
    profile.auditLog = Array.isArray(profile.auditLog) ? profile.auditLog : [];
    profile.auditLog.push({ at: nowIso, by: actor, action, details });
    if (profile.auditLog.length > 50) {
        profile.auditLog = profile.auditLog.slice(profile.auditLog.length - 50);
    }
}

export function buildDefaultAxesForCustomProfile({
    axes,
    axisMeta,
    translate,
    defaultWeights,
    extendedDefaultWeights,
    canonicalFormulaRefForAxis,
    canonicalAxes,
}: any): any {
    return axes.map((axis: any) => ({
        id: axis,
        name: translate(axisMeta[axis]?.key) || axisMeta[axis]?.fallback || axis,
        enabled: true,
        weight: defaultWeights[axis] || extendedDefaultWeights[axis] || 1,
        description: `Default EIS axis ${axis}`,
        formulaRef: canonicalAxes.includes(axis) ? canonicalFormulaRefForAxis(axis) : '',
    }));
}

export function markCustomDirty(
    profile: any,
    action: any,
    details = '',
    { actor = 'local-user', nowIso = newIsoNow() }: any = {},
): void {
    if (!profile || profile.isTemplate) return;
    profile.isDirty = true;
    profile.updatedAt = nowIso;
    if (action) pushCustomAudit(profile, action, details, { actor, nowIso });
}

export function getCustomVerdictFromBands(score: any, bands: any): string {
    const auditMin = Number(bands?.auditReadyMin);
    const mgmtMin = Number(bands?.managementReadyMin);
    const a = Number.isFinite(auditMin) ? auditMin : 4.5;
    const m = Number.isFinite(mgmtMin) ? mgmtMin : 3.5;
    if (score >= a) return 'Audit Ready';
    if (score >= m) return 'Management Ready';
    return 'Critical Data';
}

export function validatePublishProfile(
    profile: any,
    { canonicalAxes = [], normalizeAxisFormulaRef, validateAxisFormulaSelection }: any,
): string[] {
    if (!profile || !Array.isArray(profile.axes)) return ['Profile is invalid.'];
    const errors = [];
    const enabledAxes = profile.axes.filter((axis: any) => axis?.enabled !== false);
    if (enabledAxes.length < 2) errors.push('At least 2 enabled axes are required.');
    const totalWeight = enabledAxes.reduce(
        (sum: any, axis: any) => sum + Number((axis as any)?.weight || 0),
        0,
    );
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) errors.push('Weight sum must be greater than zero.');
    for (const axis of enabledAxes) {
        if (!axis?.name || !String(axis.name).trim()) {
            errors.push('All axes must have a non-empty name.');
            break;
        }
    }
    const auditMin = Number(profile?.verdictBands?.auditReadyMin);
    const mgmtMin = Number(profile?.verdictBands?.managementReadyMin);
    if (!Number.isFinite(auditMin) || !Number.isFinite(mgmtMin)) {
        errors.push('Verdict thresholds are invalid.');
    } else {
        if (!(auditMin > mgmtMin)) {
            errors.push('Audit Ready threshold must be greater than Management Ready threshold.');
        }
        if (mgmtMin < 0 || auditMin > 5) errors.push('Verdict thresholds must stay inside 0..5.');
    }
    for (const axis of enabledAxes) {
        if (!canonicalAxes.includes(axis?.id || '')) continue;
        const normalizedRef = normalizeAxisFormulaRef(axis.id, axis.formulaRef || '');
        const valid = validateAxisFormulaSelection(axis.id, normalizedRef);
        if (!valid.ok) {
            errors.push(`${axis?.name || axis?.id || 'axis'}: ${valid.error || 'invalid formula_ref'}`);
        }
    }
    return errors;
}

export function buildPublishGuardIssues(
    profile: any,
    { canonicalAxes = [], normalizeAxisFormulaRef, validateAxisFormulaSelection }: any,
): any[] {
    if (!profile || !Array.isArray(profile.axes)) return [{ message: 'Profile is invalid.', axisIndex: null }];
    const issues: any[] = [];
    const enabledAxes = profile.axes
        .map((axis: any, idx: any) => ({ axis, idx }))
        .filter(({ axis }: any) => axis?.enabled !== false);

    if (enabledAxes.length < 2) issues.push({ message: 'At least 2 enabled axes are required.', axisIndex: null });
    const totalWeight = enabledAxes.reduce(
        (sum: any, { axis }: any) => sum + Number(axis?.weight || 0),
        0,
    );
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
        issues.push({ message: 'Weight sum must be greater than zero.', axisIndex: null });
    }

    for (const { axis, idx } of enabledAxes) {
        if (!axis?.name || !String(axis.name).trim()) {
            issues.push({ message: 'All axes must have a non-empty name.', axisIndex: idx });
            break;
        }
        if (canonicalAxes.includes(axis?.id || '')) {
            const normalizedRef = normalizeAxisFormulaRef(axis.id, axis.formulaRef || '');
            const valid = validateAxisFormulaSelection(axis.id, normalizedRef);
            if (!valid.ok) {
                issues.push({
                    message: `${axis?.name || axis?.id || 'axis'}: ${valid.error || 'invalid formula_ref'}`,
                    axisIndex: idx,
                });
            }
        }
    }

    const auditMin = Number(profile?.verdictBands?.auditReadyMin);
    const mgmtMin = Number(profile?.verdictBands?.managementReadyMin);
    if (!Number.isFinite(auditMin) || !Number.isFinite(mgmtMin)) {
        issues.push({ message: 'Verdict thresholds are invalid.', axisIndex: null });
    } else {
        if (!(auditMin > mgmtMin)) {
            issues.push({
                message: 'Audit Ready threshold must be greater than Management Ready threshold.',
                axisIndex: null,
            });
        }
        if (mgmtMin < 0 || auditMin > 5) {
            issues.push({ message: 'Verdict thresholds must stay inside 0..5.', axisIndex: null });
        }
    }
    return issues;
}
