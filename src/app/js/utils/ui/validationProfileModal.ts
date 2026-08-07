// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining

import { listValidationProfiles, getActiveProfileIds } from '../../core/validation/profileEngine.js';
import { buildModalShell } from './modals.js';
import { showToast } from './toast.js';
import { asyncPrompt } from './asyncDialogs.js';

const ROOT_ID = 'validation-profile-modal-root';

/**
 * Abre modal de perfis de validacao.
 * / Open validation profile modal.
 */
export async function openValidationProfileModal(): Promise<void> {
    const root = _ensureRoot();
    const [profiles, activeIds] = await Promise.all([listValidationProfiles(), getActiveProfileIds()]);
    root.innerHTML = '';
    root.appendChild(_buildModal(profiles, activeIds));
}

/**
 * Fecha modal de perfis.
 * / Close validation profile modal.
 */
export function closeValidationProfileModal(): void {
    const root: any = document.getElementById(ROOT_ID);
    if (root) root.innerHTML = '';
}

/**
 * Re-renderiza modal se estiver aberto.
 * / Refresh modal if it is currently open.
 */
export async function refreshValidationProfileModal(): Promise<void> {
    const root: any = document.getElementById(ROOT_ID);
    if (!root || root.innerHTML.trim() === '') return;
    await openValidationProfileModal();
}

function _ensureRoot(): HTMLElement {
    let root: any = document.getElementById(ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        document.body.appendChild(root);
    }
    return root;
}

function _buildModal(profiles: any[], activeIds: any[]): HTMLElement {
    const activeSet = new Set(activeIds);
    const { overlay, body, footer } = buildModalShell({
        title: 'Validation Profiles',
        width: '820px',
        onClose: closeValidationProfileModal,
    }) as { overlay: HTMLElement; body: HTMLElement; footer: HTMLElement };
    const intro = document.createElement('p');
    intro.style.margin = '0 0 10px';
    intro.style.color = 'var(--neutral-300)';
    intro.textContent = 'Select active profiles and run validation on current observations.';
    body.appendChild(intro);
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid var(--neutral-700);">Active</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid var(--neutral-700);">Profile</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid var(--neutral-700);">Version</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid var(--neutral-700);">Jurisdiction</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid var(--neutral-700);">Actions</th>
          </tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');
    for (const profile of profiles) {
        const tr = document.createElement('tr');
        const tdActive = document.createElement('td');
        tdActive.style.padding = '8px';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.id = `vp-active-${profile.id}`;
        check.setAttribute('aria-label', `Toggle profile ${profile.name}`);
        check.checked = activeSet.has(profile.id);
        check.dataset.profileId = profile.id;
        tdActive.appendChild(check);
        const tdName = document.createElement('td');
        tdName.style.padding = '8px';
        tdName.textContent = profile.name;
        const tdVersion = document.createElement('td');
        tdVersion.style.padding = '8px';
        tdVersion.textContent = profile.version || '1.0';
        const tdJur = document.createElement('td');
        tdJur.style.padding = '8px';
        tdJur.textContent = profile.jurisdiction || '—';
        const tdActions = document.createElement('td');
        tdActions.style.padding = '8px';
        tdActions.style.textAlign = 'right';
        const runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'btn btn-secondary btn-sm';
        runBtn.textContent = 'Run';
        runBtn.onclick = () => (window as any).handleRunValidationProfile?.(profile.id);
        tdActions.appendChild(runBtn);
        // Export do perfil como chave .ecbt portável (P1-10 kind validation_profile).
        const ecbtBtn = document.createElement('button');
        ecbtBtn.type = 'button';
        ecbtBtn.className = 'btn btn-secondary btn-sm';
        ecbtBtn.style.marginLeft = '6px';
        ecbtBtn.textContent = '.ecbt';
        ecbtBtn.title = 'Exportar perfil como chave .ecbt (Library ecbyts ou dispositivo local)';
        ecbtBtn.onclick = async () => (await import('../handlers/validationProfilePortable.js')).exportValidationProfileEcbt(profile.id);
        tdActions.appendChild(ecbtBtn);
        if (!['cetesb-dd256', 'conama-420'].includes(profile.id)) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-danger btn-sm';
            delBtn.style.marginLeft = '6px';
            delBtn.textContent = 'Delete';
            delBtn.onclick = () => (window as any).handleDeleteValidationProfile?.(profile.id);
            tdActions.appendChild(delBtn);
        }
        tr.appendChild(tdActive);
        tr.appendChild(tdName);
        tr.appendChild(tdVersion);
        tr.appendChild(tdJur);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.gap = '8px';
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn-secondary';
    createBtn.textContent = 'New Profile (JSON)';
    createBtn.onclick = _createProfileFromPrompt;
    const exportCsvBtn = document.createElement('button');
    exportCsvBtn.type = 'button';
    exportCsvBtn.className = 'btn btn-secondary';
    exportCsvBtn.textContent = 'Export CSV';
    exportCsvBtn.onclick = () => (window as any).handleExportValidationResultsCSV?.();
    const domainBtn = document.createElement('button');
    domainBtn.type = 'button';
    domainBtn.className = 'btn btn-secondary';
    domainBtn.textContent = 'Domain Validators';
    domainBtn.title = 'Create custom validation domains with user-defined rules';
    domainBtn.onclick = () => {
        closeValidationProfileModal();
        (window as any).handleOpenDomainEditor?.();
    };
    const importEcbtBtn = document.createElement('button');
    importEcbtBtn.type = 'button';
    importEcbtBtn.className = 'btn btn-secondary';
    importEcbtBtn.textContent = 'Import .ecbt';
    importEcbtBtn.title = 'Importar perfil de validação de uma chave .ecbt (Library ecbyts ou dispositivo local)';
    importEcbtBtn.onclick = async () => {
        await (await import('../handlers/validationProfilePortable.js')).importValidationProfileEcbt();
        await refreshValidationProfileModal();
    };
    left.appendChild(domainBtn);
    left.appendChild(createBtn);
    left.appendChild(exportCsvBtn);
    left.appendChild(importEcbtBtn);
    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';
    const saveActiveBtn = document.createElement('button');
    saveActiveBtn.type = 'button';
    saveActiveBtn.className = 'btn btn-secondary';
    saveActiveBtn.textContent = 'Save Active';
    saveActiveBtn.onclick = () => {
        const ids = [...tbody.querySelectorAll('input[type="checkbox"]:checked')].map(
            (el: any) => el.dataset.profileId,
        );
        (window as any).handleSetActiveValidationProfiles?.(ids);
    };
    const runActiveBtn = document.createElement('button');
    runActiveBtn.type = 'button';
    runActiveBtn.className = 'btn btn-primary';
    runActiveBtn.textContent = 'Run Active';
    runActiveBtn.onclick = async () => {
        const ids = [...tbody.querySelectorAll('input[type="checkbox"]:checked')].map(
            (el: any) => el.dataset.profileId,
        );
        await (window as any).handleSetActiveValidationProfiles?.(ids);
        for (const id of ids) {
            await (window as any).handleRunValidationProfile?.(id);
        }
    };
    right.appendChild(saveActiveBtn);
    right.appendChild(runActiveBtn);
    footer.style.justifyContent = 'space-between';
    footer.appendChild(left);
    footer.appendChild(right);
    return overlay;
}

async function _createProfileFromPrompt(): Promise<void> {
    const sample = `{
  "id": "site-custom-profile",
  "name": "Site Custom",
  "version": "1.0",
  "jurisdiction": "BR",
  "matrices": ["groundwater"],
  "rules": [
    {
      "ruleId": "site-001",
      "type": "threshold",
      "parameterId": "benzene",
      "matrix": "groundwater",
      "thresholds": [{ "type": "vi", "value": 5, "unit": "ug_L", "severity": "intervention" }]
    }
  ]
}`;
    const raw = await asyncPrompt('Cole o JSON do perfil de validação', sample, {
        placeholder: '{ "name": "...", "rules": [...] }',
        confirmLabel: 'Criar perfil',
        cancelLabel: 'Cancelar',
    });
    if (!raw) return;
    try {
        await (window as any).handleCreateValidationProfile?.(raw);
    } catch (e: any) {
        showToast(e?.message || 'Failed to create profile', 'error');
    }
}
