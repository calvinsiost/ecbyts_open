// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AI REPORT PUBLISH MODAL — F2 UI front-first (UX-First Mandatory)

   Modal "Publish Template to Marketplace" para SPEC_AI_REPORT_TEMPLATE_MARKETPLACE F2.

   Front-first stub: form preenche price/royalty/license. onConfirm callback
   chama console.log + showToast (substituir por RPC `publish_ai_report_template`
   em F2.3 quando backend estiver pronto).
   ================================================================ */

import { buildModalShell } from './modals.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';
import {
    validatePublishInput,
    type AIReportTemplate,
    type PublishInput,
    PUBLISH_COMMERCIAL_LIMITS,
} from '../../core/report/_aiReportPublishPure.js';

/**
 * Open publish modal for a given template.
 * @param template - callback fired on valid submit. Stub-friendly.
 */
export function openAIReportPublishModal(
    template: AIReportTemplate,
    onConfirm: (input: PublishInput) => void | Promise<void>
): void {
    const shell = buildModalShell({
        title: `Publicar Template no Marketplace — ${template.name}`,
        width: '560px',
        id: 'ai-report-publish-modal',
    });

    const html = `
        <div class="retention-modal-info">
            <div class="retention-modal-row">
                <span class="retention-modal-label">Template:</span>
                <span class="retention-modal-value">${escapeHtml(template.name)}</span>
            </div>
            <div class="retention-modal-row">
                <span class="retention-modal-label">Descrição:</span>
                <span class="retention-modal-value">${escapeHtml(template.description || '(sem descrição)')}</span>
            </div>
        </div>

        <hr class="retention-modal-sep" />

        <form class="retention-modal-form" id="ai-report-publish-form">
            <div class="retention-modal-field">
                <label for="ai-publish-price">Preço ($ECBT, 0 = grátis):</label>
                <input type="number" id="ai-publish-price" name="priceEcbt"
                    min="${PUBLISH_COMMERCIAL_LIMITS.minPriceEcbt}"
                    max="${PUBLISH_COMMERCIAL_LIMITS.maxPriceEcbt}"
                    value="0" required />
                <small>0 a ${PUBLISH_COMMERCIAL_LIMITS.maxPriceEcbt.toLocaleString('pt-BR')}</small>
            </div>

            <div class="retention-modal-field">
                <label for="ai-publish-royalty">Royalty para o autor (%):</label>
                <input type="number" id="ai-publish-royalty" name="royaltyPct"
                    min="0" max="100" value="70" step="5" required />
                <small>Padrão 70% (autor) / 30% (plataforma)</small>
            </div>

            <div class="retention-modal-field">
                <label for="ai-publish-license">Licença:</label>
                <select id="ai-publish-license" name="license">
                    <option value="agpl-3.0" selected>AGPL-3.0 (consistente com ECBT, redistribuição livre)</option>
                    <option value="cc-by-4.0">CC BY 4.0 (atribuição)</option>
                    <option value="proprietary">Proprietário (sem redistribuição)</option>
                </select>
            </div>

            <div class="retention-modal-actions">
                <button type="button" id="ai-publish-cancel-btn" class="btn-secondary">Cancelar</button>
                <button type="submit" class="btn-primary">Publicar para Revisão</button>
            </div>
        </form>
    `;

    shell.body.innerHTML = html;

    const form = shell.body.querySelector('#ai-report-publish-form') as HTMLFormElement | null;
    const cancelBtn = shell.body.querySelector('#ai-publish-cancel-btn') as HTMLButtonElement | null;

    cancelBtn?.addEventListener('click', () => shell.close());

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const priceInput = shell.body.querySelector('#ai-publish-price') as HTMLInputElement;
        const royaltyInput = shell.body.querySelector('#ai-publish-royalty') as HTMLInputElement;
        const licenseInput = shell.body.querySelector('#ai-publish-license') as HTMLSelectElement;

        const input: PublishInput = {
            template,
            priceEcbt: parseFloat(priceInput.value),
            royaltyPct: parseFloat(royaltyInput.value),
            license: licenseInput.value,
        };

        const result = validatePublishInput(input);
        if (!result.valid) {
            showToast(`Validação falhou: ${result.errors[0]}`, 'error');
            console.error('[ai-report-publish] validation errors:', result.errors);
            return;
        }
        if (result.warnings.length > 0) {
            console.warn('[ai-report-publish] warnings:', result.warnings);
        }

        try {
            await onConfirm(input);
            showToast(`Template "${template.name}" enviado para revisão`, 'success');
            shell.close();
        } catch (err: any) {
            console.error('[ai-report-publish-modal] onConfirm failed:', err);
            showToast(`Falha ao publicar: ${err?.message || err}`, 'error');
        }
    });

    document.body.appendChild(shell.overlay);
}

/**
 * Demo entry — abre modal com fixture sem backend.
 * Wire em `window.handleAIReportPublishDemo` para Calvin testar.
 */
export function handleAIReportPublishDemo(): void {
    const fixture: AIReportTemplate = {
        id: 'demo-template-001',
        name: 'Custom Report DD38 CETESB',
        description: 'Relatório técnico CETESB Decisão de Diretoria 038/2017 com placeholders dinâmicos',
        systemPrompt: 'Você é um consultor ambiental sênior especializado em DD 038/2017 CETESB. Use {{tone}} ao redigir.',
        userPromptTemplate: 'Gere relatório para site {{siteName}} com {{elementCount}} elementos e EIS {{eisScore}}.',
        requiredContext: ['siteName', 'elementCount', 'eisScore'],
        defaultTone: 'Technical',
        isCustom: true,
        published: false,
    };

    openAIReportPublishModal(fixture, async (input) => {
        console.log('[ai-report-publish-demo] STUB onConfirm — substituir por RPC em F2.3:', {
            templateId: input.template.id,
            priceEcbt: input.priceEcbt,
            royaltyPct: input.royaltyPct,
            license: input.license,
        });
        // Stub simula latência de rede
        await new Promise((resolve) => setTimeout(resolve, 400));
    });
}
