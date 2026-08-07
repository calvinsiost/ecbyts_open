// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RETENTION EXTEND MODAL — UI for SPEC_READINGS_METADATA_RETENTION F5 (UI badge + modal)

   Front-first development (AGENTS.md § UX-First Development):
   Esta é a UI ENTREGUE PRIMEIRO. Backend (RPC extend_observation_retention)
   ainda é stub via console.log + showToast — substituir por chamada real em F4.

   Flow:
   1. handleShowRetentionDemo() abre modal com fixture (demonstrável sem backend)
   2. openRetentionExtendModal(policy, onConfirm) — wire real para inspector em F5.5
   3. Submit chama onConfirm({new_ttl_days, reason}) — caller decide RPC vs stub
   ================================================================ */

import { buildModalShell } from './modals.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';
import {
    type RetentionPolicy,
    type RetentionCategory,
    // eslint-disable-next-line
    TTL_DEFAULTS_DAYS,
    daysUntilExpiry,
    createDemoPolicy,
} from '../../core/retention/_retentionPolicyPure.js';

const CATEGORY_LABELS: Readonly<Record<RetentionCategory, string>> = Object.freeze({
    phase1_desk_review: 'Phase 1 — Desk Review',
    phase2_confirmatory: 'Phase 2 — Confirmatory Investigation',
    phase3_monitoring: 'Phase 3 — Monitoring (pós-fechamento)',
    occupational_health: 'Occupational Health (biomarcadores)',
    one_off_qa_qc: 'One-off QA/QC (calibração)',
    other: 'Outros',
});

function _daysToYearsLabel(days: number): string {
    if (days >= 365) {
        const years = Math.round((days / 365) * 10) / 10;
        return `${days} dias (~${years} anos)`;
    }
    return `${days} dias`;
}

/**
 * Open the retention extend modal for a given observation/policy.
 *
 * @param policy - current retention policy
 * @param observationId - ID of observation (for caller's RPC)
 * @param onConfirm - callback fired when user submits valid form
 *   Stub-friendly: caller pode passar console.log para frontend-first
 */
export function openRetentionExtendModal(
    policy: RetentionPolicy,
    observationId: string,
    onConfirm: (input: { observationId: string; newTtlDays: number; reason: string }) => void | Promise<void>
): void {
    const shell = buildModalShell({
        title: 'Estender Retenção de Leitura',
        width: '560px',
        id: 'retention-extend-modal',
    });

    const nowIso = new Date().toISOString();
    const remaining = daysUntilExpiry(policy, nowIso);
    const remainingLabel = remaining === null
        ? 'desconhecido'
        : remaining < 0
            ? `EXPIRADO há ${-remaining} dias`
            : `${remaining} dias`;

    const html = `
        <div class="retention-modal-info">
            <div class="retention-modal-row">
                <span class="retention-modal-label">Categoria atual:</span>
                <span class="retention-modal-value">${escapeHtml(CATEGORY_LABELS[policy.category] || policy.category)}</span>
            </div>
            <div class="retention-modal-row">
                <span class="retention-modal-label">TTL atual:</span>
                <span class="retention-modal-value">${escapeHtml(_daysToYearsLabel(policy.ttl_days))}</span>
            </div>
            <div class="retention-modal-row">
                <span class="retention-modal-label">Expira em:</span>
                <span class="retention-modal-value">${escapeHtml(remainingLabel)}</span>
            </div>
            <div class="retention-modal-row">
                <span class="retention-modal-label">Data de expiração:</span>
                <span class="retention-modal-value">${escapeHtml(new Date(policy.expires_at).toLocaleDateString('pt-BR'))}</span>
            </div>
        </div>

        <hr class="retention-modal-sep" />

        <form class="retention-modal-form" id="retention-extend-form">
            <div class="retention-modal-field">
                <label for="retention-new-ttl">Novo TTL (dias):</label>
                <input type="number" id="retention-new-ttl" name="newTtlDays"
                    min="1" max="36500" value="${policy.ttl_days}"
                    required aria-describedby="retention-ttl-hint" />
                <small id="retention-ttl-hint">Entre 1 e 36500 dias (100 anos máx)</small>
            </div>

            <div class="retention-modal-field">
                <label for="retention-reason">Justificativa (obrigatória):</label>
                <textarea id="retention-reason" name="reason"
                    rows="3" required minlength="10"
                    placeholder="Ex.: monitoramento em curso na campanha X até 2030..."></textarea>
                <small>Mínimo 10 caracteres</small>
            </div>

            <div class="retention-modal-actions">
                <button type="button" id="retention-cancel-btn" class="btn-secondary">Cancelar</button>
                <button type="submit" class="btn-primary">Confirmar Extensão</button>
            </div>
        </form>
    `;

    shell.body.innerHTML = html;

    const form = shell.body.querySelector('#retention-extend-form') as HTMLFormElement | null;
    const cancelBtn = shell.body.querySelector('#retention-cancel-btn') as HTMLButtonElement | null;

    cancelBtn?.addEventListener('click', () => shell.close());

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ttlInput = shell.body.querySelector('#retention-new-ttl') as HTMLInputElement;
        const reasonInput = shell.body.querySelector('#retention-reason') as HTMLTextAreaElement;
        const newTtlDays = parseInt(ttlInput.value, 10);
        const reason = reasonInput.value.trim();

        if (!Number.isFinite(newTtlDays) || newTtlDays <= 0 || newTtlDays > 36500) {
            showToast('TTL deve ser entre 1 e 36500 dias', 'error');
            return;
        }
        if (reason.length < 10) {
            showToast('Justificativa precisa ter pelo menos 10 caracteres', 'error');
            return;
        }

        try {
            await onConfirm({ observationId, newTtlDays, reason });
            showToast(`Retenção estendida para ${newTtlDays} dias`, 'success');
            shell.close();
        } catch (err: any) {
            console.error('[retention-extend-modal] onConfirm failed:', err);
            showToast(`Falha ao estender: ${err?.message || err}`, 'error');
        }
    });

    document.body.appendChild(shell.overlay);
}

/**
 * Demo entry point — abre o modal com fixture sem backend.
 * Wire em handler `window.handleShowRetentionDemo` para Calvin poder clicar
 * e ver o modal funcionando antes de F4 (RPCs) estar pronto.
 *
 * Stub backend: console.log + showToast no submit (frontend-first).
 */
export function handleShowRetentionDemo(): void {
    const fixture = createDemoPolicy(12); // expira em 12 dias (near-expiry)
    openRetentionExtendModal(fixture, 'demo-obs-001', async ({ observationId, newTtlDays, reason }) => {
        console.log('[retention-demo] STUB onConfirm — substituir por RPC em F4:', {
            observationId,
            newTtlDays,
            reason,
        });
        // Stub simula latência de rede
        await new Promise((resolve) => setTimeout(resolve, 300));
    });
}
