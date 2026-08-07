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

/* ================================================================
   AGENT HANDLERS — UI handlers for agent management
   ================================================================

   Controla o modal de biblioteca de agentes IA:
   criar, editar, excluir, selecionar, exportar e importar agentes.

   ================================================================ */

import {
    getAllAgents,
    getAgentById,
    saveUserAgent,
    deleteUserAgent,
    getActiveAgent,
    setActiveAgent,
    exportAgent,
    importAgent,
} from '../../core/llm/agents.js';
import { openModal } from '../ui/modals.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { getIcon } from '../ui/icons.js';
import { escapeHtml } from '../helpers/html.js';
import { asyncConfirm } from '../ui/asyncDialogs.js';
import { createLogger } from '../helpers/logger.js';

const log = createLogger('Agents');

// ================================================================
// AGENT LIBRARY MODAL
// ================================================================

/**
 * Open the agents library modal.
 * Abre o modal da biblioteca de agentes.
 */
export function openAgentsModal(): void {
    refreshAgentList();
    showAgentList();
    openModal('agents-modal');
}

/**
 * Show agent list view, hide editor.
 */
function showAgentList(): void {
    const list = document.getElementById('agents-list-view');
    const editor = document.getElementById('agents-editor-view');
    if (list) list.style.display = '';
    if (editor) editor.style.display = 'none';
}

/**
 * Show agent editor view, hide list.
 */
function showAgentEditor(): void {
    const list = document.getElementById('agents-list-view');
    const editor = document.getElementById('agents-editor-view');
    if (list) list.style.display = 'none';
    if (editor) editor.style.display = '';
}

// ================================================================
// AGENT CRUD HANDLERS
// ================================================================

/**
 * Open editor to create a new agent.
 */
export function handleCreateAgent(): void {
    // Clear form
    const nameInput = document.getElementById('agent-edit-name') as HTMLInputElement | null;
    const descInput = document.getElementById('agent-edit-description') as HTMLInputElement | null;
    const promptInput = document.getElementById('agent-edit-prompt') as HTMLInputElement | null;
    const idInput = document.getElementById('agent-edit-id') as HTMLInputElement | null;
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (promptInput) promptInput.value = '';
    if (idInput) idInput.value = '';
    showAgentEditor();
}

/**
 * Open editor with existing agent data.
 */
export function handleEditAgent(agentId: string): void {
    const agent: any = getAgentById(agentId);
    if (!agent || agent.isSystem) return;
    const nameInput = document.getElementById('agent-edit-name') as HTMLInputElement | null;
    const descInput = document.getElementById('agent-edit-description') as HTMLInputElement | null;
    const promptInput = document.getElementById('agent-edit-prompt') as HTMLInputElement | null;
    const idInput = document.getElementById('agent-edit-id') as HTMLInputElement | null;
    if (nameInput) nameInput.value = agent.name || '';
    if (descInput) descInput.value = agent.description || '';
    if (promptInput) promptInput.value = agent.systemPromptAddition || '';
    if (idInput) idInput.value = agent.id || '';
    showAgentEditor();
}

/**
 * Save agent from editor form.
 */
export function handleSaveAgent(): void {
    const name = (document.getElementById('agent-edit-name') as HTMLInputElement | null)?.value?.trim();
    const description = (
        document.getElementById('agent-edit-description') as HTMLInputElement | null
    )?.value?.trim();
    const prompt = (document.getElementById('agent-edit-prompt') as HTMLInputElement | null)?.value?.trim();
    const id = (document.getElementById('agent-edit-id') as HTMLInputElement | null)?.value?.trim();
    if (!name) {
        showToast(t('agentName') + ' required', 'error');
        return;
    }
    const agent = {
        id: id || undefined,
        name: name,
        description: description || '',
        systemPromptAddition: prompt || '',
        icon: 'user',
    };
    saveUserAgent(agent);
    showToast(t('agentSaved') || 'Agent saved', 'success');
    refreshAgentList();
    showAgentList();
}

/**
 * Cancel editing and return to list.
 */
export function handleCancelEditAgent(): void {
    showAgentList();
}

/**
 * Delete a user agent.
 */
export async function handleDeleteAgent(agentId: string): Promise<void> {
    const agent: any = getAgentById(agentId);
    if (!agent || agent.isSystem) return;
    if (!(await asyncConfirm(`${t('deleteAgent') || 'Delete agent'}: "${agent.name}"?`))) return;
    deleteUserAgent(agentId);
    showToast(t('agentDeleted') || 'Agent deleted', 'success');
    refreshAgentList();
    updateChatAgentBadge();
}

/**
 * Select an agent as active.
 */
export function handleSelectAgent(agentId: string): void {
    setActiveAgent(agentId);
    showToast(t('agentActivated') || 'Agent activated', 'success');
    refreshAgentList();
    updateChatAgentBadge();
}

// ================================================================
// EXPORT / IMPORT HANDLERS
// ================================================================

/**
 * Export an agent as JSON file download.
 */
export function handleExportAgent(agentId: string): void {
    const json = exportAgent(agentId);
    if (!json) return;
    const agent: any = getAgentById(agentId);
    if (!agent) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-${(agent.name || 'custom').toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('agentExported') || 'Agent exported', 'success');
}

/**
 * Import agent from file input.
 */
export function handleImportAgent(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target?.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            importAgent(text);
            showToast(t('agentImported') || 'Agent imported', 'success');
            refreshAgentList();
        } catch (err: any) {
            log.error('Agent import failed', err?.message);
            showToast(err?.message || 'Error', 'error');
        }
    };
    input.click();
}

// ================================================================
// UI RENDERING
// ================================================================

/**
 * Refresh the agent list in the modal.
 */
function refreshAgentList(): void {
    const container = document.getElementById('agents-list');
    if (!container) return;
    const agents: any[] = getAllAgents();
    const activeId = getActiveAgent();
    container.innerHTML = agents
        .map((a: any) => {
            const isActive = a.id === activeId;
            const badgeClass = a.isSystem ? 'system' : '';
            const badgeText = a.isSystem ? t('systemAgent') || 'System' : t('userAgent') || 'Custom';
            return `<div class="agent-card ${isActive ? 'active' : ''}">
            <div class="agent-card-header">
                <strong>${escapeHtml(a.name)}</strong>
                <span class="agent-badge ${badgeClass}">${badgeText}</span>
            </div>
            <p>${escapeHtml(a.description || '')}</p>
            <div class="agent-card-actions">
                <button class="btn btn-primary" data-cc-call-click="handleSelectAgent|s:${encodeURIComponent(`${a.id}`)}"
                    ${isActive ? 'disabled' : ''}>
                    ${isActive ? getIcon('check', { size: '12px' }) : t('selectAgent') || 'Select'}
                </button>
                ${!a.isSystem ? `<button class="btn btn-secondary" data-cc-call-click="handleEditAgent|s:${encodeURIComponent(`${a.id}`)}">${t('edit') || 'Edit'}</button>` : ''}
                ${!a.isSystem ? `<button class="btn btn-secondary" data-cc-call-click="handleDeleteAgent|s:${encodeURIComponent(`${a.id}`)}">${t('delete') || 'Delete'}</button>` : ''}
                <button class="btn btn-secondary" data-cc-call-click="handleExportAgent|s:${encodeURIComponent(`${a.id}`)}" title="${t('exportAgent') || 'Export'}">${getIcon('download', { size: '14px' })}</button>
            </div>
        </div>`;
        })
        .join('');
}

/**
 * Update the agent name badge in the chat panel header.
 */
function updateChatAgentBadge(): void {
    const badge = document.getElementById('llm-agent-badge');
    if (!badge) return;
    const activeId = getActiveAgent();
    if (!activeId || activeId === 'default') {
        badge.style.display = 'none';
        return;
    }
    const agent: any = getAgentById(activeId);
    if (agent) {
        badge.textContent = agent.name || '';
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

// ================================================================
// EXPORTED HANDLER OBJECT
// ================================================================

export const agentHandlers = {
    openAgentsModal,
    handleCreateAgent,
    handleEditAgent,
    handleSaveAgent,
    handleCancelEditAgent,
    handleDeleteAgent,
    handleSelectAgent,
    handleExportAgent,
    handleImportAgent,
};
