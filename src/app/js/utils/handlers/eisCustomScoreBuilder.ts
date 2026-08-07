// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

function cloneJson(value: any) {
    return JSON.parse(JSON.stringify(value));
}

function buildCustomId({ nowMs = () => Date.now() }: { nowMs?: () => number } = {}) {
    return `custom_${nowMs().toString(36)}`;
}

function upsertProfile(state: any, profile: any) {
    const profiles = Array.isArray(state.customProfiles) ? [...state.customProfiles] : [];
    const idx = profiles.findIndex((entry: any) => entry.id === profile.id);
    if (idx >= 0) profiles[idx] = profile;
    else profiles.push(profile);
    state.customProfiles = profiles;
}

export function selectCustomProfile(
    profileId: any,
    { state, templates = [], renderCustomEditor, recalculate }: any,
) {
    if (!profileId) {
        state.activeProfile = null;
        renderCustomEditor?.();
        recalculate?.();
        return false;
    }

    const allProfiles = [...templates, ...(Array.isArray(state.customProfiles) ? state.customProfiles : [])];
    const profile = allProfiles.find((entry) => entry.id === profileId);
    if (!profile) return false;

    state.activeProfile = cloneJson(profile);
    renderCustomEditor?.();
    recalculate?.();
    return true;
}

export function createBlankCustomProfile(
    {
        state,
        createProfile,
        buildDefaultAxes,
        saveCustomProfiles,
        renderCustomModeUI,
        recalculate,
        translate,
        nowMs,
    }: any,
) {
    const id = buildCustomId({ nowMs });
    const profile = createProfile({
        id,
        name: translate?.('eis.new_profile_name') || 'New Profile',
        basedOn: 'blank',
        axes: buildDefaultAxes(),
    });
    upsertProfile(state, profile);
    state.activeProfile = profile;
    saveCustomProfiles?.();
    renderCustomModeUI?.();
    recalculate?.();
    return profile;
}

export function copyDefaultCustomProfile(
    {
        state,
        createProfile,
        buildDefaultAxes,
        saveCustomProfiles,
        renderCustomModeUI,
        recalculate,
        translate,
        nowMs,
    }: any,
) {
    const id = buildCustomId({ nowMs });
    const profile = createProfile({
        id,
        name: translate?.('eis.default_10_axes_profile_name') || 'Default 10-axis Profile',
        basedOn: 'default',
        axes: buildDefaultAxes(),
    });
    upsertProfile(state, profile);
    state.activeProfile = profile;
    saveCustomProfiles?.();
    renderCustomModeUI?.();
    recalculate?.();
    return profile;
}

export function duplicateCustomProfile(
    { state, pushAudit, saveCustomProfiles, renderCustomModeUI, recalculate, nowIso, nowMs }: any,
) {
    if (!state.activeProfile) return null;

    const id = buildCustomId({ nowMs });
    const duplicate = cloneJson(state.activeProfile);
    duplicate.id = id;
    duplicate.name = `${duplicate.name} (copy)`;
    duplicate.isTemplate = false;
    duplicate.status = 'draft';
    duplicate.version = 1;
    duplicate.basedOn = state.activeProfile?.id || 'custom';
    duplicate.createdAt = nowIso();
    duplicate.updatedAt = nowIso();
    duplicate.auditLog = Array.isArray(state.activeProfile?.auditLog) ? [...state.activeProfile.auditLog] : [];
    pushAudit?.(duplicate, 'duplicated', `Duplicated from ${state.activeProfile?.id || 'unknown'}`);
    duplicate.axes.forEach((axis: any, index: number) => {
        axis.id = `${id}_${index}`;
    });

    upsertProfile(state, duplicate);
    state.activeProfile = duplicate;
    saveCustomProfiles?.();
    renderCustomModeUI?.();
    recalculate?.();
    return duplicate;
}

export function editSelectedCustomTemplate(
    { state, pushAudit, saveCustomProfiles, renderCustomModeUI, recalculate, nowIso, nowMs }: any,
) {
    if (!state.activeProfile) return null;
    if (!state.activeProfile.isTemplate) {
        return duplicateCustomProfile({
            state,
            pushAudit,
            saveCustomProfiles,
            renderCustomModeUI,
            recalculate,
            nowIso,
            nowMs,
        });
    }

    const id = buildCustomId({ nowMs });
    const duplicate = cloneJson(state.activeProfile);
    duplicate.id = id;
    duplicate.name = `${duplicate.name} (editable)`;
    duplicate.isTemplate = false;
    duplicate.status = 'draft';
    duplicate.version = 1;
    duplicate.apiId = null;
    duplicate.basedOn = state.activeProfile?.id || 'template';
    duplicate.isDirty = true;
    duplicate.createdAt = nowIso();
    duplicate.updatedAt = nowIso();
    duplicate.axes = Array.isArray(duplicate.axes)
        ? duplicate.axes.map((axis: any, index: number) => ({
              ...axis,
              id: `${id}_${index}`,
              enabled: axis?.enabled !== false,
              formulaRef: axis?.formulaRef || '',
          }))
        : [];
    duplicate.auditLog = Array.isArray(state.activeProfile?.auditLog) ? [...state.activeProfile.auditLog] : [];
    pushAudit?.(duplicate, 'editable-copy', `Created from template ${state.activeProfile?.id || 'unknown'}`);

    upsertProfile(state, duplicate);
    state.activeProfile = duplicate;
    saveCustomProfiles?.();
    renderCustomModeUI?.();
    recalculate?.();
    return duplicate;
}

export function deleteCustomProfile(
    { state, saveCustomProfiles, renderCustomModeUI, recalculate, apiDelete }: any,
) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;

    const apiId = state.activeProfile.apiId;
    state.customProfiles = (Array.isArray(state.customProfiles) ? state.customProfiles : []).filter(
        (entry: any) => entry.id !== state.activeProfile.id,
    );
    state.activeProfile = null;
    saveCustomProfiles?.();
    renderCustomModeUI?.();
    recalculate?.();

    if (apiId) {
        Promise.resolve(apiDelete?.(apiId)).catch((e) => console.debug('[eis-score:apiDelete]', e?.message || e));
    }
    return true;
}

export function setCustomVetoEnabled(
    { state, enabled, markDirty, renderCustomEditor, recalculate }: any,
) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;
    state.activeProfile.veto = state.activeProfile.veto || { enabled: false, minAxis: 2 };
    state.activeProfile.veto.enabled = !!enabled;
    markDirty?.('veto-updated', `enabled=${!!enabled}`);
    renderCustomEditor?.();
    recalculate?.();
    return true;
}

export function setCustomVetoMin({ state, value, markDirty, renderCustomEditor, recalculate }: any) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;
    const normalized = Math.max(1, Math.min(5, Number(value || 2)));
    state.activeProfile.veto = state.activeProfile.veto || { enabled: false, minAxis: 2 };
    state.activeProfile.veto.minAxis = normalized;
    markDirty?.('veto-threshold', `minAxis=${normalized}`);
    renderCustomEditor?.();
    recalculate?.();
    return true;
}

export function setCustomBands(
    { state, kind, value, defaultVerdictBands, markDirty, renderCustomEditor, recalculate }: any,
) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;
    const normalized = Math.max(0, Math.min(5, Number(value || 0)));
    state.activeProfile.verdictBands = state.activeProfile.verdictBands || defaultVerdictBands();
    if (kind === 'audit') state.activeProfile.verdictBands.auditReadyMin = normalized;
    else state.activeProfile.verdictBands.managementReadyMin = normalized;
    markDirty?.('bands-updated', `${kind}=${normalized}`);
    renderCustomEditor?.();
    recalculate?.();
    return true;
}

export function compareCustomWithBaseline({ renderComparePanel }: any) {
    renderComparePanel?.(true);
    return true;
}

export function renameCustomProfile({ state, name, markDirty, renderCustomEditor }: any) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;
    state.activeProfile.name = name;
    markDirty?.('renamed', `name=${name}`);
    renderCustomEditor?.();
    return true;
}

export function editCustomAxis(
    {
        state,
        index,
        prop,
        value,
        validateAxisFormulaSelection,
        showToast,
        markDirty,
        renderCustomEditor,
        recalculate,
    }: any,
) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;
    const axis = state.activeProfile.axes?.[index];
    if (!axis) return false;

    if (prop === 'weight') {
        axis.weight = Math.max(1, Math.min(5, parseInt(value, 10) || 1));
    } else if (prop === 'enabled') {
        axis.enabled = String(value) === 'true';
    } else if (prop === 'formulaRef') {
        const valid = validateAxisFormulaSelection(axis.id, value);
        if (!valid.ok) {
            showToast?.(valid.error || 'Invalid formula_ref', 'warning');
            renderCustomEditor?.();
            return false;
        }
        axis.formulaRef = valid.formulaRef;
    } else {
        axis[prop] = value;
    }

    markDirty?.('axis-edited', `${prop} @${axis.id}`);
    if (prop === 'enabled' || prop === 'formulaRef') renderCustomEditor?.();
    recalculate?.();
    return true;
}

export function addCustomAxis(
    { state, translate, markDirty, renderCustomEditor, recalculate, nowMs }: any,
) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;
    if (state.activeProfile.axes.length >= 12) return false;

    const id = `${state.activeProfile.id}_${nowMs().toString(36)}`;
    const nextIndex = state.activeProfile.axes.length + 1;
    state.activeProfile.axes.push({
        id,
        name: `${translate?.('eis.axis') || 'Axis'} ${nextIndex}`,
        enabled: true,
        weight: 1,
        description: '',
        formulaRef: '',
    });
    markDirty?.('axis-added', `axis=${id}`);
    renderCustomEditor?.();
    recalculate?.();
    return true;
}

export function removeCustomAxis({ state, index, markDirty, renderCustomEditor, recalculate }: any) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;
    if (state.activeProfile.axes.length <= 2) return false;

    state.activeProfile.axes.splice(index, 1);
    markDirty?.('axis-removed', `index=${index}`);
    renderCustomEditor?.();
    recalculate?.();
    return true;
}

export function focusCustomPublishIssue(
    axisIndex: any,
    { documentRef = globalThis.document }: any = {},
) {
    const row = documentRef?.querySelector?.(`.eis-custom-axis-row[data-index="${Number(axisIndex)}"]`);
    if (!row) return false;
    row.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const focusTarget = row.querySelector?.(
        '.eis-custom-axis-formula, .eis-custom-axis-weight, .eis-custom-axis-name',
    ) as any;
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    return true;
}

export function updateCustomSliderValue(
    axisId: any,
    { documentRef = globalThis.document, recalculate, updateStatusBadge }: any,
) {
    const slider = documentRef?.getElementById?.(`eis-custom-slider-${axisId}`) as any;
    const valueEl = documentRef?.getElementById?.(`eis-custom-value-${axisId}`);
    if (slider && valueEl) valueEl.textContent = slider.value;
    recalculate?.();
    updateStatusBadge?.();
    return Boolean(slider && valueEl);
}

export function saveCustomProfile(
    {
        state,
        defaultVerdictBands,
        nowIso,
        pushAudit,
        saveCustomProfiles,
        trackEvent,
        renderComparePanel,
        renderCustomEditor,
        apiCreateTemplate,
        apiUpdateTemplate,
    }: any,
) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;

    state.activeProfile.status = state.activeProfile.status || 'draft';
    state.activeProfile.version = Number(state.activeProfile.version || 1);
    state.activeProfile.basedOn = state.activeProfile.basedOn || 'custom';
    state.activeProfile.verdictBands = state.activeProfile.verdictBands || defaultVerdictBands();
    state.activeProfile.veto = state.activeProfile.veto || { enabled: false, minAxis: 2 };
    state.activeProfile.updatedAt = nowIso();
    state.activeProfile.isDirty = false;
    pushAudit?.(state.activeProfile, 'saved', 'Profile saved');
    upsertProfile(state, cloneJson(state.activeProfile));
    saveCustomProfiles?.();
    trackEvent?.('eis_custom_saved', {
        mode: 'custom',
        profileId: state.activeProfile?.id || null,
    });
    renderComparePanel?.();
    renderCustomEditor?.();

    const profileSnapshot = cloneJson(state.activeProfile);
    const op = profileSnapshot.apiId ? apiUpdateTemplate?.(profileSnapshot) : apiCreateTemplate?.(profileSnapshot);
    Promise.resolve(op)
        .then((row) => {
            if (!row || !state.activeProfile || state.activeProfile.id !== profileSnapshot.id) return;
            state.activeProfile.apiId = row.id;
            const profiles = Array.isArray(state.customProfiles) ? [...state.customProfiles] : [];
            const idx = profiles.findIndex((entry) => entry.id === state.activeProfile.id);
            if (idx >= 0) {
                profiles[idx].apiId = row.id;
                profiles[idx].status = row.status || profiles[idx].status;
                profiles[idx].version = Number(row.version || profiles[idx].version || 1);
                state.customProfiles = profiles;
            }
            saveCustomProfiles?.();
        })
        .catch((e) => console.debug('[eis-score:publish]', e?.message || e));

    return true;
}

export function publishCustomProfile(
    {
        state,
        validatePublishProfile,
        translate,
        showToast,
        nowIso,
        pushAudit,
        trackEvent,
        saveProfile,
        apiPublishTemplate,
        saveCustomProfiles,
        renderCustomModeUI,
    }: any,
) {
    if (!state.activeProfile || state.activeProfile.isTemplate) return false;
    const errors = validatePublishProfile(state.activeProfile);
    if (errors.length) {
        showToast?.(
            `${translate?.('eis.cannotPublishProfile') || 'Nao e possivel publicar perfil:'}\n• ${errors.join('\n• ')}`,
            'error',
            6000,
        );
        return false;
    }

    state.activeProfile.status = 'published';
    state.activeProfile.version = Number(state.activeProfile.version || 1) + 1;
    state.activeProfile.updatedAt = nowIso();
    state.activeProfile.isDirty = false;
    pushAudit?.(state.activeProfile, 'published', `version=${state.activeProfile.version}`);
    trackEvent?.('eis_custom_published', {
        mode: 'custom',
        profileId: state.activeProfile?.id || null,
    });
    saveProfile?.();

    Promise.resolve(apiPublishTemplate?.(state.activeProfile))
        .then((row) => {
            if (!row || !state.activeProfile) return;
            state.activeProfile.status = row.status || 'published';
            state.activeProfile.version = Number(row.version || state.activeProfile.version);
            state.activeProfile.apiId = row.id || state.activeProfile.apiId;
            const profiles = Array.isArray(state.customProfiles) ? [...state.customProfiles] : [];
            const idx = profiles.findIndex((entry) => entry.id === state.activeProfile.id);
            if (idx >= 0) {
                profiles[idx].status = state.activeProfile.status;
                profiles[idx].version = state.activeProfile.version;
                profiles[idx].apiId = state.activeProfile.apiId;
                state.customProfiles = profiles;
            }
            saveCustomProfiles?.();
            renderCustomModeUI?.();
        })
        .catch((e) => console.debug('[eis-score:adopt]', e?.message || e));

    renderCustomModeUI?.();
    return true;
}
