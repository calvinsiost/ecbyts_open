// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GOVERNANCE PANEL — Tab rendering for contracts, WBS, EVA
   Painel da aba Governanca — contratos, EAP, Valor Agregado

   SECOES:
   1. Contratos: lista de cards com resumo financeiro
   2. EAP / WBS: arvore com barras de progresso
   3. EVA Dashboard: grafico + indicadores SPI/CPI + desvios
   ================================================================ */
import { getContracts, getContract, getContractFinancialSummary, getEvidenceSummary, getInsuranceContracts, checkInsuranceExpiry, } from '../governance/contractManager.js';
import { getInstalledLibraries } from '../libraries/manager.js';
import { getWbsItems, getWbsTree, calculateEVA, calculateProjectEVA, detectDeviations, getWbsTemplates, generateSCurveData, generatePhysicalSCurveData, getSnapshotSeries, } from '../governance/wbsManager.js';
import { getProjects, getProjectProgress, getResources, getAllocations } from '../governance/projectManager.js';
import { getActiveLane } from '../cloud/manager.js';
import { getCostCenters, getCostCenter, getCostCenterTree, getAllocationsForSource, } from '../governance/costCenterManager.js';
import { renderEVAChart, renderSCurveChart, renderPhysicalSCurveChart, renderSPICPIGauge, renderDeviationTable, injectEVAStyles, } from '../governance/evaChart.js';
import { renderAccessControlSection } from '../handlers/auth.js';
import { t, applyTranslations } from '../i18n/translations.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { hydrateIcons } from './icons.js';
// Wave BBBB1 P1+P2 PoC: pure-logic extracted (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM)
import {
    formatCurrencyBRL as _pureFormatCurrencyBRL,
    resolveContractTypeLabel as _pureResolveContractTypeLabel,
    countProjectResources as _pureCountProjectResources,
    filterWbsLeaves as _pureFilterWbsLeaves,
} from './_governancePanelPure.js';
// ----------------------------------------------------------------
// MAIN RENDER
// ----------------------------------------------------------------
/**
 * Render the full governance tab.
 * Renderiza toda a aba de governanca.
 */
export function renderGovernanceTab() {
    const container = document.getElementById('governance-content');
    if (!container)
        return;
    injectEVAStyles();
    injectGovernanceStyles();
    let html = '';
    // Section 0: Access Control (autenticacao e permissoes)
    html += renderAccessControlSection();
    // Section 0.5: Projects (portfolio management)
    html += renderProjectsSection();
    // Section 1: Contracts
    html += renderContractsSection();
    // Section 2: WBS
    html += renderWBSSection();
    // Section 3: EVA Dashboard
    html += renderEVASection();
    // Section 4: Regulatory Calendar (G4 - ESG Governance)
    html += renderRegulatoryCalendarSection();
    html += renderDecisionLogSection();
    // Section 5: ESG Governance G5-G10 (Export, Share, Provenance, Retention)
    html += renderEsgGovernanceSection();
    // Section 6: Uncertainty Hub (policy, q2q, rules, optimization, evidence)
    html += renderUncertaintyHubSection();
    container.innerHTML = html;
    hydrateIcons(container);
    (applyTranslations as any)(container);
    // Render charts + hydrate async sections after DOM update
    requestAnimationFrame(() => {
        renderEVACharts();
        hydrateRegulatoryCalendar();
        hydrateDecisionLog(undefined as any);
        hydrateStakeholderShares();
        hydrateRetentionPolicies();
        hydrateProvenanceGraphPreview();
        hydrateUncertaintyHubGvBadge();
    });
}
// ----------------------------------------------------------------
// PROJECTS SECTION
// ----------------------------------------------------------------
function renderProjectsSection() {
    const projects = getProjects();
    const resources = getResources();
    const activeLane = getActiveLane();
    const laneName = activeLane?.name || 'Sessao local (sem raia ativa)';
    const laneScope = activeLane?.scope_key || 'local:session';

    const projectCards = projects.length === 0
        ? renderProjectsEmpty()
        : projects.map((project: any) => renderProjectCard(project)).join('');

    return `
        <div class="section ${window.sectionClass?.('gov-projects') ?? 'collapsed'}" data-section-id="gov-projects">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('projectsSection') || 'Projects'} (${projects.length})</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                ${renderProjectsActions(resources)}
                ${renderProjectsLaneHints(laneName, laneScope)}
                <div class="gov-actions" style="margin-bottom:12px;">
                    <button class="btn btn-sm btn-secondary" data-cc-action="cc-15a04d8a">
                        Restaurar ultimo snapshot da raia ativa
                    </button>
                </div>
                ${projectCards}
            </div>
        </div>`;
}

/**
 * Renderiza o cabeçalho de ações da seção de projetos.
 * @param {any[]} resources
 * @returns {string}
 */
function renderProjectsActions(resources: any[]): string {
    const teamButton = resources.length > 0
        ? `<button class="btn btn-sm btn-secondary" data-cc-action="cc-6432be6d">
                        + ${t('team') || 'Team'} (${resources.filter((r: any) => r.active).length})
                    </button>`
        : `<button class="btn btn-sm btn-secondary" data-cc-action="cc-6432be6d">
                        + ${t('team') || 'Team'}
                    </button>`;
    return `
        <div class="gov-actions">
            <button class="btn btn-sm btn-primary" data-cc-action="cc-8f342bd8">
                + ${t('newProject') || 'New Project'}
            </button>
            ${teamButton}
        </div>`;
}

/**
 * Renderiza as dicas de contexto da raia ativa.
 * @param {string} laneName
 * @param {string} laneScope
 * @returns {string}
 */
function renderProjectsLaneHints(laneName: string, laneScope: string): string {
    const materialized = String(laneScope).startsWith('cloud:materialized-specs:');
    const contextStyle = materialized ? 'color:var(--success,#34d399);' : '';
    const contextText = materialized ? 'Contexto materializado ativo.' : 'Contexto nao materializado ativo.';
    return `
        <div class="gov-hint" style="margin-bottom:10px;">
            <strong>Raia ativa atual:</strong> ${escapeHtml(laneName)}<br>
            <strong>Scope:</strong> <code>${escapeHtml(laneScope)}</code>
        </div>
        <div class="gov-hint" style="margin-bottom:12px;${contextStyle}">
            ${contextText}
        </div>`;
}

/**
 * Renderiza o estado vazio da lista de projetos.
 * @returns {string}
 */
function renderProjectsEmpty(): string {
    return `<div class="gov-empty">
        <div class="gov-empty-icon">&#9776;</div>
        ${t('noProjects') || 'No projects yet'}
    </div>`;
}

/**
 * Renderiza o card de um projeto.
 * @param {any} project
 * @returns {string}
 */
function renderProjectCard(project: any): string {
    const progress = getProjectProgress(project.id);
    const typeLabel = projectTypeLabel(project.type);
    const statusClass = projectStatusClass(project.status);
    const statusLabel = projectStatusLabel(project.status);
    const projectPhases = project.phases || [];

    return `
        <div class="element-card gov-card">
            <div class="element-card-header">
                <span class="gov-card-title">${escapeHtml(project.name)}</span>
                <span class="gov-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="gov-card-body">
                ${renderProjectCardInfo(project, typeLabel, projectPhases)}
                ${renderProjectProgressBar(progress)}
                <div class="gov-hint" style="margin-top:6px;">${progress}% ${t('completed') || 'concluido'} • ${projectPhases.length} ${t('phases') || 'fases'}</div>
            </div>
            ${renderProjectCardActions(project)}
        </div>`;
}

/**
 * Renderiza a linha de informações do card de projeto.
 * @param {any} project
 * @param {string} typeLabel
 * @param {any[]} projectPhases
 * @returns {string}
 */
function renderProjectCardInfo(project: any, typeLabel: string, projectPhases: any[]): string {
    const projectDates = project.dates || {};
    const dateRange = projectDates.startDate && projectDates.endDate
        ? `${projectDates.startDate} — ${projectDates.endDate}`
        : '';
    const projResCount = _getProjectResourceCount(project.id);
    const resourcesHint = projResCount > 0 ? ` | ${projResCount} ${t('resourcesLabel') || 'resources'}` : '';
    return `
        <div class="gov-card-info">
            <span class="gov-card-type">${typeLabel}</span>
            <span>${projectPhases.length} ${t('phases') || 'phases'}${resourcesHint}</span>
            ${dateRange ? `<span>${dateRange}</span>` : ''}
        </div>`;
}

/**
 * Renderiza a barra de progresso do card de projeto.
 * @param {number} progress
 * @returns {string}
 */
function renderProjectProgressBar(progress: number): string {
    return `
        <div class="wbs-progress-bar">
            <div class="wbs-progress-fill" style="width:${progress}%"></div>
            <span class="wbs-progress-label">${progress}%</span>
        </div>`;
}

/**
 * Renderiza as ações do card de projeto.
 * @param {any} project
 * @returns {string}
 */
function renderProjectCardActions(project: any): string {
    return `
        <div class="gov-card-actions">
            <button class="btn btn-sm btn-primary" data-cc-call-click="handleOpenProjectGantt|s:${encodeURIComponent(`${project.id}`)}" title="${t('schedule')}">
                ${t('schedule') || 'Schedule'}
            </button>
            <details class="gov-action-menu" style="position:relative;">
                <summary class="btn btn-sm btn-secondary">${t('more')}"</summary>
                <div class="gov-action-menu-list" style="position:absolute;right:0;top:calc(100% + 4px);z-index:3;display:flex;gap:6px;flex-wrap:wrap;padding:6px;border:1px solid var(--border-color,#2b3c56);background:var(--panel-bg,#091522);border-radius:8px;min-width:320px;justify-content:flex-end;">
                    <button class="btn btn-sm btn-secondary" data-cc-call-click="handleOpenProjectLoad|s:${encodeURIComponent(`${project.id}`)}" title="${t('load')}">
                        ${t('load') || 'Load'}
                    </button>
                    <button class="btn btn-sm btn-secondary" data-cc-call-click="handleOpenProjectTimesheet|s:${encodeURIComponent(`${project.id}`)}" title="${t('timesheetButton')}">
                        ${t('timesheetButton') || 'Timesheet'}
                    </button>
                    <button class="btn btn-sm btn-secondary" data-cc-call-click="handleEditProject|s:${encodeURIComponent(`${project.id}`)}">
                        ${t('edit') || 'Edit'}
                    </button>
                    <button class="btn btn-sm btn-danger" data-cc-call-click="handleRemoveProject|s:${encodeURIComponent(`${project.id}`)}">
                        ${t('remove') || 'Remove'}
                    </button>
                </div>
            </details>
        </div>`;
}

/**
 * Resolve o rótulo do tipo de projeto.
 * @param {string} type
 * @returns {string}
 */
function projectTypeLabel(type: string): string {
    const typeLabels: Record<string, string> = {
        remediation: t('projectTypeRemediation') || 'Remediation',
        monitoring: t('projectTypeMonitoring') || 'Monitoring',
        investigation: t('projectTypeInvestigation') || 'Investigation',
        decommissioning: t('projectTypeDecommissioning') || 'Decommissioning',
        custom: t('projectTypeCustom') || 'Custom',
    };
    return typeLabels[type] || type;
}

/**
 * Resolve a classe CSS do status do projeto.
 * @param {string} status
 * @returns {string}
 */
function projectStatusClass(status: string): string {
    const statusClasses: Record<string, string> = {
        planning: 'gov-status-draft',
        active: 'gov-status-active',
        on_hold: 'gov-status-draft',
        completed: 'gov-status-completed',
        cancelled: 'gov-status-terminated',
    };
    return statusClasses[status] || 'gov-status-draft';
}

/**
 * Resolve o rótulo do status do projeto.
 * @param {string} status
 * @returns {string}
 */
function projectStatusLabel(status: string): string {
    const statusLabels: Record<string, string> = {
        planning: t('statusPlanning') || 'Planejamento',
        active: t('statusActive') || 'Ativo',
        on_hold: t('statusOnHold') || 'Em espera',
        completed: t('statusCompleted') || 'Concluido',
        cancelled: t('statusCancelled') || 'Cancelado',
    };
    return statusLabels[status] || t('statusUnknown') || 'Indefinido';
}
// ----------------------------------------------------------------
// CONTRACTS SECTION
// ----------------------------------------------------------------
let _contractFilter: any = 'all';
/**
 * Set contract filter (called from governance handler).
 * @param {'all'|'contracts'|'insurance'} filter
 */
export function setContractFilter( filter: any) {
    _contractFilter = filter;
}
function renderContractsSection() {
    // Lazy expiry check for insurance
    checkInsuranceExpiry();
    const allContracts = getContracts();
    const insuranceCount = getInsuranceContracts().length;
    const contractCount = allContracts.length - insuranceCount;
    const filtered = filterContractsByType(allContracts, _contractFilter);

    return `
        <div class="section ${window.sectionClass?.('gov-contracts') ?? 'collapsed'}" data-section-id="gov-contracts">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('contracts') || 'Contracts'} (${allContracts.length})</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                ${renderContractsFilterTabs(allContracts.length, contractCount, insuranceCount)}
                <div class="gov-actions">
                    <button class="btn btn-sm btn-primary" data-cc-action="cc-8c13e803">
                        + ${t('addContract') || 'Add Contract'}
                    </button>
                </div>
                ${renderContractsList(filtered)}
            </div>
        </div>`;
}

/**
 * Filtra a lista de contratos pelo tipo selecionado.
 * @param {any[]} allContracts
 * @param {any} filter
 * @returns {any[]}
 */
function filterContractsByType(allContracts: any[], filter: any): any[] {
    if (filter === 'insurance') {
        return allContracts.filter((c: any) => c.type === 'insurance');
    }
    if (filter === 'contracts') {
        return allContracts.filter((c: any) => c.type !== 'insurance');
    }
    return allContracts;
}

/**
 * Renderiza as abas de filtro de contratos.
 * @param {number} allCount
 * @param {number} contractCount
 * @param {number} insuranceCount
 * @returns {string}
 */
function renderContractsFilterTabs(allCount: number, contractCount: number, insuranceCount: number): string {
    const allClass = _contractFilter === 'all' ? 'btn-primary' : 'btn-ghost';
    const contractsClass = _contractFilter === 'contracts' ? 'btn-primary' : 'btn-ghost';
    const insuranceClass = _contractFilter === 'insurance' ? 'btn-primary' : 'btn-ghost';
    return `
        <div class="gov-filter-tabs">
            <button class="btn btn-xs ${allClass}" data-cc-action="cc-c5bf11f9">${t('allContracts') || 'All'} (${allCount})</button>
            <button class="btn btn-xs ${contractsClass}" data-cc-action="cc-194e0799">${t('contracts') || 'Contracts'} (${contractCount})</button>
            <button class="btn btn-xs ${insuranceClass}" data-cc-action="cc-cb45a02e">${t('insuranceContracts') || 'Insurance'} (${insuranceCount})</button>
        </div>`;
}

/**
 * Renderiza a lista filtrada de contratos ou estado vazio.
 * @param {any[]} filtered
 * @returns {string}
 */
function renderContractsList(filtered: any[]): string {
    if (filtered.length === 0) {
        return renderContractsEmpty();
    }
    return filtered.map((contract: any) => renderContractCard(contract)).join('');
}

/**
 * Renderiza a mensagem de estado vazio da lista de contratos.
 * @returns {string}
 */
function renderContractsEmpty(): string {
    const emptyMsg = _contractFilter === 'insurance'
        ? t('noInsurance') || 'No insurance policies'
        : t('noContracts') || 'No contracts yet';
    return `<div class="gov-empty">
        <div class="gov-empty-icon">&#9776;</div>
        ${emptyMsg}
    </div>`;
}
/**
 * @param {any} contract
 */
function renderContractCard( contract: any) {
    const summary = getContractFinancialSummary(contract.id);
    const statusClass = `gov-status-${contract.status}`;
    const statusLabel = contractStatusLabel(contract.status);
    const typeLabel = contractTypeLabel(contract.type);
    const dateRange = contractDateRange(contract.dates);
    const paidPct = calculatePaidPercentage(summary);

    return `
        <div class="element-card gov-card">
            <div class="element-card-header">
                <span class="gov-card-title">${escapeHtml(contract.name)}</span>
                <span class="gov-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="gov-card-body">
                <div class="gov-card-info">
                    <span class="gov-card-type">${typeLabel}</span>
                    <span>${contract.parties.length} ${t('parties') || 'parties'}</span>
                    ${dateRange ? `<span>${dateRange}</span>` : ''}
                </div>
                ${renderContractFinancial(summary, paidPct)}
                ${renderContractEvidence(contract.id)}
                ${renderContractInsuranceBlock(contract)}
            </div>
            ${renderContractActions(contract)}
        </div>`;
}

/**
 * Resolve o rótulo de status de contrato.
 * @param {string} status
 * @returns {string}
 */
function contractStatusLabel(status: string): string {
    const contractStatusLabelMap: Record<string, string> = {
        draft: t('statusDraft') || 'Rascunho',
        active: t('statusActive') || 'Ativo',
        completed: t('statusCompleted') || 'Concluido',
        terminated: t('statusTerminated') || 'Encerrado',
    };
    return contractStatusLabelMap[status] || t('statusUnknown') || 'Indefinido';
}

/**
 * Formata o intervalo de datas do contrato.
 * @param {any} dates
 * @returns {string}
 */
function contractDateRange(dates: any): string {
    return dates?.effectiveDate && dates?.expirationDate
        ? `${dates.effectiveDate} — ${dates.expirationDate}`
        : '';
}

/**
 * Calcula o percentual pago a partir do resumo financeiro.
 * @param {any} summary
 * @returns {number}
 */
function calculatePaidPercentage(summary: any): number {
    return summary && summary.totalValue > 0 ? Math.round((summary.totalPaid / summary.totalValue) * 100) : 0;
}

/**
 * Renderiza o bloco financeiro de um contrato.
 * @param {any} summary
 * @param {number} paidPct
 * @returns {string}
 */
function renderContractFinancial(summary: any, paidPct: number): string {
    if (!summary) return '';
    const overdue = summary.totalOverdue > 0
        ? `<span class="eva-negative">${t('overdue') || 'Overdue'}: ${formatCurrency(summary.totalOverdue)}</span>`
        : '';
    const barColor = paidPct >= 100 ? '#27ae60' : 'var(--accent, #3b6bff)';
    return `
        <div class="gov-card-financial">
            <span>${t('total') || 'Total'}: ${formatCurrency(summary.totalValue)}</span>
            <span>${t('paid') || 'Paid'}: ${formatCurrency(summary.totalPaid)}</span>
            ${overdue}
        </div>
        <div class="wbs-progress-bar">
            <div class="wbs-progress-fill" style="width:${paidPct}%;background:${barColor}"></div>
            <span class="wbs-progress-label">${paidPct}% ${t('paid') || 'paid'}</span>
        </div>`;
}

/**
 * Renderiza o indicador de evidências do contrato.
 * @param {string} contractId
 * @returns {string}
 */
function renderContractEvidence(contractId: string): string {
    const ev = getEvidenceSummary(contractId);
    return ev && ev.total > 0
        ? `<div class="gov-card-evidence">${ev.delivered}/${ev.total} ${t('evidencesDelivered') || 'evidences delivered'}</div>`
        : '';
}

/**
 * Renderiza o bloco de detalhes do seguro (quando aplicável).
 * @param {any} contract
 * @returns {string}
 */
function renderContractInsuranceBlock(contract: any): string {
    if (contract.type !== 'insurance' || !contract.insurance) return '';
    const ins = contract.insurance;
    const claimLabel = renderInsuranceClaimLabel(ins.claimStatus);
    const statusBadge = insuranceStatusBadge(contract.status);
    const statusLabel = insuranceStatusLabel(contract.status);
    return `
        <div class="gov-card-insurance">
            <span>${t('policyNumber') || 'Policy'}: <strong>${escapeHtml(ins.policyNumber)}</strong></span>
            <span class="ins-badge ${statusBadge}">${statusLabel}</span>
            <span>${t('coverage') || 'Coverage'}: ${formatCurrency(ins.coverageValueCents / 100)} / ${ins.coveragePeriodMonths} ${t('months') || 'months'}</span>
            ${claimLabel ? `<span>${claimLabel}</span>` : ''}
        </div>`;
}

/**
 * Formata o rótulo do status de sinistro.
 * @param {string} claimStatus
 * @returns {string}
 */
function renderInsuranceClaimLabel(claimStatus: string): string {
    if (claimStatus === 'none') return '';
    const key = 'claim' +
        claimStatus.charAt(0).toUpperCase() +
        claimStatus.slice(1).replace(/_\w/g, (m) => m.charAt(1).toUpperCase());
    return t(key) || claimStatus;
}

/**
 * Resolve a classe CSS do badge do seguro.
 * @param {string} status
 * @returns {string}
 */
function insuranceStatusBadge(status: string): string {
    if (status === 'active') return 'ins-badge--active';
    if (status === 'completed') return 'ins-badge--expired';
    return 'ins-badge--cancelled';
}

/**
 * Resolve o rótulo do badge do seguro.
 * @param {string} status
 * @returns {string}
 */
function insuranceStatusLabel(status: string): string {
    if (status === 'active') return t('insActive') || 'Active';
    if (status === 'completed') return t('insExpired') || 'Expired';
    return t('insCancelled') || 'Cancelled';
}

/**
 * Renderiza as ações do card de contrato.
 * @param {any} contract
 * @returns {string}
 */
function renderContractActions(contract: any): string {
    const fileClaimButton = contract.type === 'insurance' &&
        contract.insurance?.claimStatus === 'none' &&
        contract.status === 'active'
        ? `<button class="btn btn-sm btn-warning" data-cc-call-click="handleFileInsuranceClaim|s:${encodeURIComponent(`${contract.id}`)}">${t('fileClaim') || 'File Claim'}</button>`
        : '';
    return `
        <div class="gov-card-actions">
            <button class="btn btn-sm btn-primary" data-cc-call-click="handleEditContract|s:${encodeURIComponent(`${contract.id}`)}">
                ${t('edit') || 'Edit'}
            </button>
            <details class="gov-action-menu" style="position:relative;">
                <summary class="btn btn-sm btn-secondary">${t('more') || 'Mais'}</summary>
                <div class="gov-action-menu-list" style="position:absolute;right:0;top:calc(100% + 4px);z-index:3;display:flex;gap:6px;flex-wrap:wrap;padding:6px;border:1px solid var(--border-color,#2b3c56);background:var(--panel-bg,#091522);border-radius:8px;min-width:260px;justify-content:flex-end;">
                    ${fileClaimButton}
                    <button class="btn btn-sm btn-danger" data-cc-call-click="handleRemoveContract|s:${encodeURIComponent(`${contract.id}`)}">
                        ${t('remove') || 'Remove'}
                    </button>
                </div>
            </details>
        </div>`;
}
// ----------------------------------------------------------------
// WBS SECTION
// ----------------------------------------------------------------
function renderWBSSection() {
    const items = getWbsItems();
    const tree = getWbsTree();
    const templates = getWbsTemplates();
    let html = `
        <div class="section ${window.sectionClass?.('gov-wbs') ?? 'collapsed'}" data-section-id="gov-wbs">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('wbs') || 'WBS / EAP'} (${items.length})</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <div class="gov-actions">
                    <button class="btn btn-sm btn-primary" data-cc-action="cc-6daaba18">
                        + ${t('addTask') || 'Add Task'}
                    </button>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:select:L450" class="form-input gov-template-select" data-cc-change="cc-21158092">
                        <option value="">${t('applyTemplate') || 'Apply Template...'}</option>
                        ${templates.map((tmpl: any) => `<option value="${tmpl.id}">${tmpl.name}</option>`).join('')}
                    </select>
                </div>`;
    if (tree.length === 0) {
        html += `<div class="gov-empty">
            <div class="gov-empty-icon">&#9776;</div>
            ${t('noWbsItems') || 'No WBS items — add tasks or apply a template'}
        </div>`;
    }
    else {
        html += '<div class="wbs-tree">';
        for (const node of tree) {
            html += renderWbsNode(node, 0);
        }
        html += '</div>';
    }
    html += `</div></div>`;
    return html;
}
/**
 * @param {any} node
 * @param {any} depth
 */
function renderWbsNode( node: any, depth: any) {
    const percent = node.actual?.percentComplete || 0;
    const statusClass = `eva-status-${node.status}`;
    const indent = depth * 1.2;
    const safeNodeId = (node.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');

    let html = `
        <div class="wbs-node" style="padding-left:${indent}rem">
            ${renderWbsNodeHeader(node, statusClass)}
            ${renderWbsProgressBar(percent)}
            ${renderWbsNodeFields(node, safeNodeId, percent)}
        </div>`;

    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            html += renderWbsNode(child, depth + 1);
        }
    }
    return html;
}

/**
 * Resolve o rótulo de status de um item WBS.
 * @param {any} node
 * @returns {string}
 */
function wbsStatusLabel(node: any): string {
    const wbsStatusLabels: Record<string, string> = {
        not_started: t('statusNotStarted') || 'Nao iniciado',
        in_progress: t('statusInProgress') || 'Em progresso',
        completed: t('statusCompleted') || 'Concluido',
        delayed: t('statusDelayed') || 'Atrasado',
    };
    return wbsStatusLabels[node.status] || String(node.status || '').replace('_', ' ');
}

/**
 * Renderiza o cabeçalho de um item WBS.
 * @param {any} node
 * @param {string} statusClass
 * @returns {string}
 */
function renderWbsNodeHeader(node: any, statusClass: string): string {
    return `
        <div class="wbs-node-header">
            <span class="wbs-code">${escapeHtml(node.code)}</span>
            <span class="wbs-name">${escapeHtml(node.name)}</span>
            <span class="eva-status-badge ${statusClass}">${escapeHtml(wbsStatusLabel(node))}</span>
            <details class="gov-action-menu" style="position:relative;margin-left:auto;">
                <summary class="btn btn-sm btn-secondary">${t('more') || 'Mais'}</summary>
                <div class="gov-action-menu-list" style="position:absolute;right:0;top:calc(100% + 4px);z-index:3;display:flex;gap:6px;flex-wrap:wrap;padding:6px;border:1px solid var(--border-color,#2b3c56);background:var(--panel-bg,#091522);border-radius:8px;min-width:160px;justify-content:flex-end;">
                    <button class="btn btn-sm btn-danger wbs-delete-btn" data-cc-call-click="handleRemoveWbsItem|s:${encodeURIComponent(`${node.id}`)}" title="${t('common.remove')}" aria-label="${t('common.remove')}"><span data-icon="x" data-icon-size="12px"></span></button>
                </div>
            </details>
        </div>`;
}

/**
 * Renderiza a barra de progresso de um item WBS.
 * @param {number} percent
 * @returns {string}
 */
function renderWbsProgressBar(percent: number): string {
    return `
        <div class="wbs-progress-bar">
            <div class="wbs-progress-fill" style="width:${percent}%"></div>
            <span class="wbs-progress-label">${percent}%</span>
        </div>`;
}

/**
 * Renderiza os campos editáveis de um item WBS.
 * @param {any} node
 * @param {string} safeNodeId
 * @param {number} percent
 * @returns {string}
 */
function renderWbsNodeFields(node: any, safeNodeId: string, percent: number): string {
    return `
        <div class="wbs-node-fields">
            <label for="wbs-complete-${safeNodeId}">${t('percentComplete')}":</label>
                <input data-field-meta="true" data-field-meta-key="auto-tpl:governancePanel:input:L505" type="number" id="wbs-complete-${safeNodeId}" min="0" max="100" value="${percent}" class="form-input wbs-field-input"
                    aria-label="${t('governancePanel.percentCompleteAria')}"
                    data-cc-call-change="handleEditWbsItem|s:${encodeURIComponent(`${node.id}`)}|s:percentComplete|v">
            <label for="wbs-cost-${safeNodeId}">${t('actualCost')}":</label>
                <input data-field-meta="true" data-field-meta-key="auto-tpl:governancePanel:input:L509" type="number" id="wbs-cost-${safeNodeId}" min="0" value="${node.actual?.cost || 0}" class="form-input wbs-field-input"
                    aria-label="${t('governancePanel.actualCostAria')}"
                    data-cc-call-change="handleEditWbsItem|s:${encodeURIComponent(`${node.id}`)}|s:cost|v">
            <label for="wbs-weight-${safeNodeId}">${t('baselineWeight') || 'Weight'}:</label>
                <input data-field-meta="true" data-field-meta-key="auto-tpl:governancePanel:input:L513" type="number" id="wbs-weight-${safeNodeId}" min="0" value="${node.baseline?.weight || 0}" class="form-input wbs-field-input"
                    aria-label="${t('governancePanel.baselineWeightAria')}"
                    data-cc-call-change="handleEditWbsItem|s:${encodeURIComponent(`${node.id}`)}|s:weight|v">

            <button class="btn btn-sm btn-secondary" data-cc-call-click="handleAddWbsItem|s:${encodeURIComponent(`${node.id}`)}">+ Sub</button>
        </div>`;
}
// ----------------------------------------------------------------
// EVA SECTION
// ----------------------------------------------------------------
function renderEVASection() {
    const snapCount = getSnapshotSeries().length;
    const snapLabel = snapCount === 0 ? 'No snapshots' : `${snapCount} snapshot${snapCount > 1 ? 's' : ''}`;
    return `
        <div class="section ${window.sectionClass?.('gov-eva') ?? 'collapsed'}" data-section-id="gov-eva">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('evaDashboard') || 'EVA Dashboard'}</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <div class="gov-actions">
                    <button class="btn btn-sm btn-primary" data-cc-action="cc-2c78f666">
                        ${t('calculateEVA') || 'Calculate EVA'}
                    </button>
                    <button class="btn btn-sm btn-secondary" id="eva-save-snapshot" data-cc-action="cc-f0880f31">
                        Save Status Date
                    </button>
                    <button class="btn btn-sm btn-secondary" data-cc-action="cc-35b03dbf">&#9881; ${t('viewData') || 'View Data'}</button>
                    <span id="eva-snapshot-count" class="gov-snapshot-count">${snapLabel}</span>
                </div>
                <div id="eva-gauges-container"></div>
                <div id="eva-chart-container"></div>
                <div id="eva-scurve-container"></div>
                <div id="eva-scurve-physical-container"></div>
                <div id="eva-deviations-container"></div>
            </div>
        </div>`;
}
function renderEVACharts() {
    const items = getWbsItems();
    if (items.length === 0)
        return;
    const projectEVA = calculateProjectEVA();
    const itemEvas = items
        .filter((w: any) => !w.parentId)
        .map((w: any) => calculateEVA(w.id))
        .filter(Boolean);
    const deviations = detectDeviations();
    const gaugeContainer = document.getElementById('eva-gauges-container');
    const chartContainer = document.getElementById('eva-chart-container');
    const devContainer = document.getElementById('eva-deviations-container');
    if (gaugeContainer)
        renderSPICPIGauge(gaugeContainer, projectEVA.SPI, projectEVA.CPI);
    if (chartContainer)
        renderEVAChart(chartContainer, projectEVA, itemEvas);
    const scurveContainer = document.getElementById('eva-scurve-container');
    if (scurveContainer) {
        const scurveData = generateSCurveData(new Date() as any);
        if (scurveData) {
            renderSCurveChart(scurveContainer, scurveData);
        }
        else {
            scurveContainer.innerHTML =
                '<div class="gov-scurve-empty">S-Curve requires WBS items with baseline dates and costs</div>';
        }
    }
    const physContainer = document.getElementById('eva-scurve-physical-container');
    if (physContainer) {
        const physData = generatePhysicalSCurveData(new Date() as any);
        if (physData) {
            renderPhysicalSCurveChart(physContainer, physData);
        }
        else {
            physContainer.innerHTML =
                '<div class="gov-scurve-empty">Physical S-Curve requires WBS items with baseline dates and weights</div>';
        }
    }
    // Update snapshot count
    const snapCountEl = document.getElementById('eva-snapshot-count');
    if (snapCountEl) {
        const sc = getSnapshotSeries().length;
        snapCountEl.textContent = t(`governancePanel.snapshots_${sc === 0 ? 'zero' : sc === 1 ? 'one' : 'other'}`, {
            count: sc,
        });
    }
    if (devContainer)
        renderDeviationTable(devContainer, deviations);
}
// ----------------------------------------------------------------
// CONTRACT FORM (MODAL)
// ----------------------------------------------------------------
/**
 * Render contract edit form inside the modal.
 * Renderiza formulario de edicao de contrato no modal.
 *
 * @param {string} contractId
 */
export function renderContractForm( contractId: any) {
    const contract = getContract(contractId);
    if (!contract)
        return;
    const container = document.getElementById('contract-form-content');
    if (!container)
        return;
    // Libraries instaladas para dropdown de evidencia (DA PC3: apenas instaladas)
    const installedLibs = getInstalledLibraries();
    container.innerHTML = [
        renderContractFormBasicFields(contract),
        renderContractFormInsuranceBlock(contract, contractId),
        renderContractFormPartiesSection(contract, contractId),
        renderContractFormDisbursementsSection(contract, contractId, installedLibs),
        renderContractFormNotes(contract),
    ].join('');
}

/**
 * Renderiza os campos básicos do formulário de contrato.
 * @param {any} contract
 * @returns {string}
 */
function renderContractFormBasicFields(contract: any): string {
    return `
        <div class="form-group">
            <label class="form-label" for="contract-name">${t('contractName') || 'Name'}</label>
            <input data-field-meta="true" data-field-meta-key="auto:contract-name" type="text" id="contract-name" class="form-input" value="${escapeAttr(contract.name)}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label" for="contract-type">${t('type') || 'Type'}</label>
                <select data-field-meta="true" data-field-meta-key="auto:contract-type" id="contract-type" class="form-input">
                    ${contractTypeOption('remediation', 'Remediation', contract.type)}
                    ${contractTypeOption('monitoring', 'Monitoring', contract.type)}
                    ${contractTypeOption('investigation', 'Investigation', contract.type)}
                    ${contractTypeOption('insurance', t('insuranceContracts') || 'Insurance', contract.type)}
                    ${contractTypeOption('custom', 'Custom', contract.type)}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="contract-status">${t('status') || 'Status'}</label>
                <select data-field-meta="true" data-field-meta-key="auto:contract-status" id="contract-status" class="form-input">
                    ${contractStatusOption('draft', 'Draft', contract.status)}
                    ${contractStatusOption('active', 'Active', contract.status)}
                    ${contractStatusOption('completed', 'Completed', contract.status)}
                    ${contractStatusOption('terminated', 'Terminated', contract.status)}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label" for="contract-total-value">${t('totalValue') || 'Total Value'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:contract-total-value" type="number" id="contract-total-value" class="form-input" value="${contract.financial.totalValue}" min="0" step="100">
            </div>
            <div class="form-group">
                <label class="form-label" for="contract-currency">${t('currency') || 'Currency'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:contract-currency" type="text" id="contract-currency" class="form-input" value="${contract.financial.currency}" maxlength="3">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label" for="contract-effective-date">${t('effectiveDate') || 'Effective Date'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:contract-effective-date" type="date" id="contract-effective-date" class="form-input" value="${contract.dates.effectiveDate}">
            </div>
            <div class="form-group">
                <label class="form-label" for="contract-expiration-date">${t('expirationDate') || 'Expiration Date'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:contract-expiration-date" type="date" id="contract-expiration-date" class="form-input" value="${contract.dates.expirationDate}">
            </div>
        </div>`;
}

/**
 * Gera uma opção do select de tipo de contrato.
 * @param {string} value
 * @param {string} label
 * @param {string} selectedValue
 * @returns {string}
 */
function contractTypeOption(value: string, label: string, selectedValue: string): string {
    return `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${label}</option>`;
}

/**
 * Gera uma opção do select de status de contrato.
 * @param {string} value
 * @param {string} label
 * @param {string} selectedValue
 * @returns {string}
 */
function contractStatusOption(value: string, label: string, selectedValue: string): string {
    return `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${label}</option>`;
}

/**
 * Renderiza o bloco de detalhes do seguro no formulário.
 * @param {any} contract
 * @param {any} contractId
 * @returns {string}
 */
function renderContractFormInsuranceBlock(contract: any, contractId: any): string {
    if (contract.type !== 'insurance' || !contract.insurance) return '';
    const ins = contract.insurance;
    const fileClaimButton = ins.claimStatus === 'none' && contract.status === 'active'
        ? `
            <button class="btn btn-sm btn-warning" data-cc-call-click="handleFileInsuranceClaim|s:${encodeURIComponent(`${contractId}`)}">
                ${t('fileClaim') || 'File Claim'}
            </button>`
        : '';
    return `
        <!-- Insurance Details / Detalhes do Seguro -->
        <div class="gov-esg-subsection">
            <div class="gov-subsection-header">
                <span>${t('insuranceContracts') || 'Insurance'}</span>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${t('policyNumber') || 'Policy Number'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L692" type="text" class="form-input" value="${escapeAttr(ins.policyNumber)}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('envInsurance') || 'Category'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L696" type="text" class="form-input" value="${ins.category}" readonly>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${t('coverage') || 'Coverage'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L702" type="text" class="form-input" value="${(ins.coverageValueCents / 100).toFixed(2)}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('coveragePeriod') || 'Coverage Period'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L706" type="text" class="form-input" value="${ins.coveragePeriodMonths} ${t('months') || 'months'}" readonly>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${t('premium') || 'Premium'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L712" type="text" class="form-input" value="${(ins.premiumCents / 100).toFixed(2)}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">Claim Status</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L716" type="text" class="form-input" value="${ins.claimStatus}" readonly>
                </div>
            </div>
            ${fileClaimButton}
        </div>`;
}

/**
 * Renderiza a seção de partes do formulário de contrato.
 * @param {any} contract
 * @param {any} contractId
 * @returns {string}
 */
function renderContractFormPartiesSection(contract: any, contractId: any): string {
    return `
        <!-- Parties -->
        <div class="gov-esg-subsection">
            <div class="gov-subsection-header">
                <span>${t('parties') || 'Parties'} (${contract.parties.length})</span>
                <button class="btn btn-sm btn-secondary" data-cc-call-click="handleAddContractParty|s:${encodeURIComponent(`${contractId}`)}">+ Add</button>
            </div>
            ${contract.parties.map((party: any, i: number) => renderContractPartyRow(party, contractId, i)).join('')}
        </div>`;
}

/**
 * Renderiza uma linha de parte no formulário de contrato.
 * @param {any} party
 * @param {any} contractId
 * @param {number} index
 * @returns {string}
 */
function renderContractPartyRow(party: any, contractId: any, index: number): string {
    const encodedIndex = encodeURIComponent(String(index));
    const basePath = `handleUpdateContractParty|s:${encodeURIComponent(`${contractId}`)}|j:${encodedIndex}`;
    return `
        <div class="gov-party-row">
            <select data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:select:L741" class="form-input" data-cc-call-change="${basePath}|s:role|v">
                ${contractPartyRoleOption('contractor', 'Contractor', party.role)}
                ${contractPartyRoleOption('client', 'Client', party.role)}
                ${contractPartyRoleOption('regulator', 'Regulator', party.role)}
                ${contractPartyRoleOption('witness', 'Witness', party.role)}
            </select>
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L747" type="text" class="form-input" placeholder="${t('name')}" value="${escapeAttr(party.name)}"
                data-cc-call-change="${basePath}|s:name|v">
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L749" type="text" class="form-input" placeholder="${t('registry')}" value="${escapeAttr(party.registry)}"
                data-cc-call-change="${basePath}|s:registry|v">
            <button class="btn btn-sm btn-danger" data-cc-call-click="handleRemoveContractParty|s:${encodeURIComponent(`${contractId}`)}|j:${encodedIndex}" aria-label="${t('common.remove')}"><span data-icon="x" data-icon-size="12px"></span></button>
        </div>`;
}

/**
 * Gera uma opção de papel da parte.
 * @param {string} value
 * @param {string} label
 * @param {string} selectedValue
 * @returns {string}
 */
function contractPartyRoleOption(value: string, label: string, selectedValue: string): string {
    return `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${label}</option>`;
}

/**
 * Renderiza a seção de desembolsos do formulário de contrato.
 * @param {any} contract
 * @param {any} contractId
 * @param {any[]} installedLibs
 * @returns {string}
 */
function renderContractFormDisbursementsSection(contract: any, contractId: any, installedLibs: any[]): string {
    return `
        <!-- Disbursements / Desembolsos -->
        <div class="gov-esg-subsection">
            <div class="gov-subsection-header">
                <span>${t('disbursements')}" (${contract.financial.disbursements.length})</span>
                <button class="btn btn-sm btn-secondary" data-cc-call-click="handleAddDisbursement|s:${encodeURIComponent(`${contractId}`)}">+ ${t('addDisbursement')}"</button>
            </div>
            ${contract.financial.disbursements.map((d: any) => renderContractDisbursementCard(d, contractId, installedLibs)).join('')}
        </div>`;
}

/**
 * Renderiza o card de um desembolso no formulário de contrato.
 * @param {any} d
 * @param {any} contractId
 * @param {any[]} installedLibs
 * @returns {string}
 */
function renderContractDisbursementCard(d: any, contractId: any, installedLibs: any[]): string {
    const encodedContractId = encodeURIComponent(`${contractId}`);
    const encodedDisbursementId = encodeURIComponent(`${d.id}`);
    const basePath = `handleUpdateDisbursementField|s:${encodedContractId}|s:${encodedDisbursementId}`;
    return `
        <div class="gov-disbursement-card">
            <div class="gov-disbursement-row1">
                <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L769" type="date" class="form-input" value="${d.date}"
                    data-cc-call-change="${basePath}|s:date|v">
                <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L771" type="number" class="form-input" value="${d.amount}" min="0" step="100"
                    data-cc-call-change="${basePath}|s:amount|pfd:0">
                <select data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:select:L773" class="form-input"
                    data-cc-call-change="${basePath}|s:status|v">
                    ${disbursementStatusOption('scheduled', 'Scheduled', d.status)}
                    ${disbursementStatusOption('paid', 'Paid', d.status)}
                </select>
                <button class="btn btn-sm btn-danger" data-cc-call-click="handleRemoveDisbursement|s:${encodedContractId}|s:${encodedDisbursementId}" aria-label="Remove"><span data-icon="x" data-icon-size="12px"></span></button>
            </div>
            <div class="gov-disbursement-row2">
                <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L781" type="text" class="form-input" placeholder="${t('description')}" value="${escapeAttr(d.description)}"
                    data-cc-call-change="${basePath}|s:description|v">
                <select data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:select:L783" class="form-input gov-evidence-select"
                    data-cc-call-change="handleLinkLibraryToDisbursement|s:${encodedContractId}|s:${encodedDisbursementId}|v">
                    <option value="">${t('noLinkedLibrary')}"</option>
                    ${installedLibs.map((lib: any) => renderDisbursementLibraryOption(lib, d.linkedLibrary)).join('')}
                </select>
                ${renderDisbursementEvidenceBadge(d.linkedLibrary)}
            </div>
        </div>`;
}

/**
 * Gera uma opção de status de desembolso.
 * @param {string} value
 * @param {string} label
 * @param {string} selectedValue
 * @returns {string}
 */
function disbursementStatusOption(value: string, label: string, selectedValue: string): string {
    return `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${label}</option>`;
}

/**
 * Gera uma opção de library vinculada ao desembolso.
 * @param {any} lib
 * @param {any} linkedLibrary
 * @returns {string}
 */
function renderDisbursementLibraryOption(lib: any, linkedLibrary: any): string {
    const selected = linkedLibrary && linkedLibrary.libraryId === lib.manifest.id ? 'selected' : '';
    return `
        <option value="${escapeAttr(lib.manifest.id)}" ${selected}>
            ${escapeHtml(lib.manifest.name)}
        </option>`;
}

/**
 * Renderiza o badge de evidência do desembolso.
 * @param {any} linkedLibrary
 * @returns {string}
 */
function renderDisbursementEvidenceBadge(linkedLibrary: any): string {
    if (!linkedLibrary) return '';
    const label = linkedLibrary.evidenceStatus === 'delivered'
        ? t('evidenceDelivered') || 'Delivered'
        : t('evidencePending') || 'Pending';
    return `
        <span class="gov-evidence-badge gov-evidence-${linkedLibrary.evidenceStatus}">
            &#9679; ${label}
        </span>`;
}

/**
 * Renderiza o campo de notas do formulário de contrato.
 * @param {any} contract
 * @returns {string}
 */
function renderContractFormNotes(contract: any): string {
    return `
        <div class="form-group">
            <label class="form-label" for="contract-notes">${t('notes') || 'Notes'}</label>
            <textarea data-field-meta="true" data-field-meta-key="auto:contract-notes" id="contract-notes" class="form-input" rows="3">${escapeHtml(contract.notes)}</textarea>
        </div>`;
}
// ----------------------------------------------------------------
// REGULATORY CALENDAR SECTION (G4)
// ----------------------------------------------------------------
/**
 * Render the regulatory calendar section with obligations sorted by urgency.
 * Uses async state - the DOM is updated via hydrateRegulatoryCalendar() after mount.
 */
export function renderRegulatoryCalendarSection() {
    return `
        <div class="section ${window.sectionClass?.('gov-regcal') ?? 'collapsed'}" data-section-id="gov-regcal">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('regulatoryCalendar') || 'Calendario Regulatorio'} <span id="reg-cal-count" class="gov-badge">0</span></span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <div class="gov-actions">
                    <button class="btn btn-sm btn-primary" data-cc-action="cc-108ed46a">
                        + ${t('newObligation') || 'Nova Obrigacao'}
                    </button>
                    <button class="btn btn-sm btn-secondary" data-cc-action="cc-b77a5d96">
                        &#8635; ${t('refresh') || 'Atualizar'}
                    </button>
                </div>
                <div id="regulatory-calendar-summary" class="reg-cal-summary"></div>
                <div id="regulatory-calendar-list" class="reg-cal-list">
                    <div class="gov-empty">
                        <div class="gov-empty-icon">&#9632;</div>
                        ${t('loadingObligations') || 'Carregando obrigacoes...'}
                    </div>
                </div>
            </div>
        </div>
    `;
}
/**
 * Hydrate the regulatory calendar list with live data from the handler.
 * Call after renderGovernanceTab() inserts the HTML.
 */
export async function hydrateRegulatoryCalendar() {
    const listEl = document.getElementById('regulatory-calendar-list');
    const summaryEl = document.getElementById('regulatory-calendar-summary');
    const countEl = document.getElementById('reg-cal-count');
    if (!listEl)
        return;
    try {
        const data: any = await (window as any).handleGetRegulatoryCalendar?.();
        if (!data) {
            listEl.innerHTML = `<div class="gov-empty">${t('governancePanel.calendarUnavailable')}</div>`;
            return;
        }
        const { obligations, summary } = data;
        if (countEl)
            countEl.textContent = String(summary.total);
        if (summaryEl)
            summaryEl.innerHTML = renderRegulatorySummary(summary);
        if (obligations.length === 0) {
            listEl.innerHTML = renderRegulatoryEmpty();
            return;
        }
        listEl.innerHTML = obligations.map((o: any) => renderObligationRow(o)).join('');
    }
    catch (err: any) {
        listEl.innerHTML = `<div class="gov-empty">Error: ${escapeHtml(err.message)}</div>`;
    }
}

/**
 * Renderiza a grade resumida do calendário regulatório.
 * @param {AnyRecord} summary
 * @returns {string}
 */
function renderRegulatorySummary(summary: any): string {
    return `
        <div class="reg-cal-summary-grid">
            <div class="reg-cal-stat ${summary.overdue > 0 ? 'critical' : ''}">
                <span class="reg-cal-stat-value">${summary.overdue}</span>
                <span class="reg-cal-stat-label">${t('overdue') || 'Vencidas'}</span>
            </div>
            <div class="reg-cal-stat ${summary.critical > 0 ? 'critical' : ''}">
                <span class="reg-cal-stat-value">${summary.critical}</span>
                <span class="reg-cal-stat-label">${t('critical') || 'Criticas'}</span>
            </div>
            <div class="reg-cal-stat ${summary.urgent > 0 ? 'urgent' : ''}">
                <span class="reg-cal-stat-value">${summary.urgent}</span>
                <span class="reg-cal-stat-label">${t('urgent') || 'Urgentes'}</span>
            </div>
            <div class="reg-cal-stat ${summary.attention > 0 ? 'attention' : ''}">
                <span class="reg-cal-stat-value">${summary.attention}</span>
                <span class="reg-cal-stat-label">${t('attention') || 'Atencao'}</span>
            </div>
            <div class="reg-cal-stat ok">
                <span class="reg-cal-stat-value">${summary.ok}</span>
                <span class="reg-cal-stat-label">OK</span>
            </div>
        </div>`;
}

/**
 * Renderiza a mensagem de estado vazio do calendário regulatório.
 * @returns {string}
 */
function renderRegulatoryEmpty(): string {
    return `<div class="gov-empty">
        <div class="gov-empty-icon">&#9632;</div>
        ${t('noObligations') || 'Nenhuma obrigacao cadastrada'}
    </div>`;
}
/**
 * @param {any} obligation
 */
function renderObligationRow( obligation: any) {
    const { urgency } = obligation;
    const dueFormatted = new Date(obligation.dueDate).toLocaleDateString('pt-BR');
    return `
        <div class="reg-cal-item" data-urgency="${urgency.level}" style="border-left-color: ${urgency.color};">
            <div class="reg-cal-item-main">
                <div class="reg-cal-item-title">
                    ${escapeHtml(obligation.title)}
                    ${obligation.regulator ? `<span class="reg-cal-regulator">${escapeHtml(obligation.regulator)}</span>` : ''}
                </div>
                <div class="reg-cal-item-meta">
                    <span class="reg-cal-due">${dueFormatted}</span>
                    <span class="reg-cal-urgency" style="color: ${urgency.color};">${escapeHtml(urgency.label)}</span>
                    ${obligation.referenceDoc ? `<span class="reg-cal-ref">${escapeHtml(obligation.referenceDoc)}</span>` : ''}
                </div>
            </div>
            <div class="reg-cal-item-actions">
                <button class="btn btn-sm btn-secondary" data-cc-call-click="handleCompleteRegulatoryObligationAndRefresh|s:${encodeURIComponent(`${escapeAttr(obligation.id)}`)}" title="${t('markCompleted') || 'Marcar como completa'}">
                    &#10003;
                </button>
                <button class="btn btn-sm btn-danger" data-cc-call-click="handleRemoveRegulatoryObligationAndRefresh|s:${encodeURIComponent(`${escapeAttr(obligation.id)}`)}" title="${t('remove') || 'Remover'}">
                    &times;
                </button>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// DECISION LOG SECTION (G6)
// ----------------------------------------------------------------
/**
 * Render the decision log section showing recent technical/regulatory decisions.
 * Uses async state - the DOM is updated via hydrateDecisionLog() after mount.
 */
export function renderDecisionLogSection() {
    return `
        <div class="section ${window.sectionClass?.('gov-decisionlog') ?? 'collapsed'}" data-section-id="gov-decisionlog">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('governance.decision.title') || 'Log de Decisões'} <span id="decision-log-count" class="gov-badge">0</span></span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <div class="gov-actions">
                    <button class="btn btn-sm btn-primary" data-cc-action="cc-cff9694c">
                        + ${t('governance.decision.new') || 'Nova Decisão'}
                    </button>
                    <button class="btn btn-sm btn-secondary" data-cc-action="cc-2f8f175c">
                        &#8635; ${t('refresh') || 'Atualizar'}
                    </button>
                    <select id="decision-log-filter" class="decision-log-filter" data-cc-change="cc-5ca82d71">
                        <option value="">${t('governance.decision.allCategories') || 'Todas categorias'}</option>
                        <option value="technical">${t('governance.decision.categoryTechnical') || 'Técnica'}</option>
                        <option value="regulatory">${t('governance.decision.categoryRegulatory') || 'Regulatória'}</option>
                        <option value="financial">${t('governance.decision.categoryFinancial') || 'Financeira'}</option>
                        <option value="operational">${t('governance.decision.categoryOperational') || 'Operacional'}</option>
                    </select>
                </div>
                <div id="decision-log-summary" class="decision-log-summary"></div>
                <div id="decision-log-list" class="decision-log-list">
                    <div class="gov-empty">
                        <div class="gov-empty-icon">&#9632;</div>
                        ${t('governance.decision.loading') || 'Carregando decisões…'}
                    </div>
                </div>
            </div>
        </div>
    `;
}
/**
 * Hydrate the decision log list with live data from the handler.
 * @param {string} [category] - Optional category filter
 */
export async function hydrateDecisionLog( category: any) {
    const listEl = document.getElementById('decision-log-list');
    const summaryEl = document.getElementById('decision-log-summary');
    const countEl = document.getElementById('decision-log-count');
    if (!listEl)
        return;
    try {
        const data: any = await (window as any).handleGetDecisionLog?.(category);
        if (!data) {
            listEl.innerHTML = '<div class="gov-empty">Decision log unavailable</div>';
            return;
        }
        const { decisions, stats } = data;
        if (countEl)
            countEl.textContent = String(stats.total);
        if (summaryEl)
            summaryEl.innerHTML = category ? '' : renderDecisionSummary(stats);
        if (decisions.length === 0) {
            listEl.innerHTML = renderDecisionEmpty(category);
            return;
        }
        const sorted = [...decisions].reverse();
        listEl.innerHTML = sorted.map((d: any) => renderDecisionRow(d)).join('');
    }
    catch (err: any) {
        listEl.innerHTML = `<div class="gov-empty">Error: ${escapeHtml(err.message)}</div>`;
    }
}

/**
 * Renderiza a grade resumida do log de decisões.
 * @param {AnyRecord} stats
 * @returns {string}
 */
function renderDecisionSummary(stats: any): string {
    return `
        <div class="decision-log-stats">
            <div class="decision-log-stat technical">
                <span class="decision-log-stat-value">${stats.byCategory.technical || 0}</span>
                <span class="decision-log-stat-label">${t('governance.decision.categoryTechnical') || 'Técnica'}</span>
            </div>
            <div class="decision-log-stat regulatory">
                <span class="decision-log-stat-value">${stats.byCategory.regulatory || 0}</span>
                <span class="decision-log-stat-label">${t('governance.decision.categoryRegulatory') || 'Regulatória'}</span>
            </div>
            <div class="decision-log-stat financial">
                <span class="decision-log-stat-value">${stats.byCategory.financial || 0}</span>
                <span class="decision-log-stat-label">${t('governance.decision.categoryFinancial') || 'Financeira'}</span>
            </div>
            <div class="decision-log-stat operational">
                <span class="decision-log-stat-value">${stats.byCategory.operational || 0}</span>
                <span class="decision-log-stat-label">${t('governance.decision.categoryOperational') || 'Operacional'}</span>
            </div>
        </div>`;
}

/**
 * Renderiza a mensagem de estado vazio do log de decisões.
 * @param {string|null} category
 * @returns {string}
 */
function renderDecisionEmpty(category: any): string {
    const msg = category
        ? t('governance.decision.noneInCategory') || 'Nenhuma decisão nesta categoria'
        : t('governance.decision.none') || 'Nenhuma decisão registrada';
    return `<div class="gov-empty">
        <div class="gov-empty-icon">&#9632;</div>
        ${msg}
        <div class="gov-empty-hint">${t('governance.decision.hint') || 'Use "Nova Decisão" para registrar rationale de escolhas técnicas'}</div>
    </div>`;
}
/**
 * @param {any} decision
 */
function renderDecisionRow( decision: any) {
    const date = new Date(decision.timestamp).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const categoryLabel = ({
        technical: t('governance.decision.categoryTechnical') || 'Técnica',
        regulatory: t('governance.decision.categoryRegulatory') || 'Regulatória',
        financial: t('governance.decision.categoryFinancial') || 'Financeira',
        operational: t('governance.decision.categoryOperational') || 'Operacional',
    } as any)[decision.category] || decision.category;
    const rationalePreview = decision.rationale.length > 160 ? decision.rationale.slice(0, 160) + '…' : decision.rationale;
    const altsHtml = decision.alternativesConsidered
        ? `<div class="decision-log-alts"><strong>${t('governance.decision.alternatives') || 'Alternativas'}:</strong> ${escapeHtml(decision.alternativesConsidered)}</div>`
        : '';
    const refHtml = decision.refContext
        ? `<span class="decision-log-ref" title="${escapeAttr(decision.refContext.type + ': ' + decision.refContext.id)}">&#128279; ${escapeHtml(decision.refContext.label || decision.refContext.id)}</span>`
        : '';
    return `
        <div class="decision-log-item" data-category="${escapeAttr(decision.category)}">
            <div class="decision-log-item-header">
                <span class="decision-log-category decision-log-category-${escapeAttr(decision.category)}">${escapeHtml(categoryLabel)}</span>
                <span class="decision-log-date">${date}</span>
                <span class="decision-log-actor">${escapeHtml(decision.actor)}</span>
            </div>
            <div class="decision-log-item-title">${escapeHtml(decision.title)}</div>
            <div class="decision-log-rationale">${escapeHtml(rationalePreview)}</div>
            ${altsHtml}
            ${refHtml}
        </div>
    `;
}
// ----------------------------------------------------------------
// COST CENTERS SECTION
// ----------------------------------------------------------------
function renderCostCentersSection() {
    const ccs = getCostCenters();
    const tree = getCostCenterTree();
    const currentFY = new Date().getFullYear();
    const typeLabels = {
        production: t('costCenterTypeProduction') || 'Production',
        administrative: t('costCenterTypeAdministrative') || 'Administrative',
        support: t('costCenterTypeSupport') || 'Support',
        project: t('costCenterTypeProject') || 'Project',
        custom: t('costCenterTypeCustom') || 'Custom',
    };
    let html = `
        <div class="section ${window.sectionClass?.('gov-costcenters') ?? 'collapsed'}" data-section-id="gov-costcenters">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('costCenters') || 'Cost Centers'} (${ccs.length})</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <div class="gov-actions">
                    <button class="btn btn-sm btn-primary" data-cc-action="cc-107b7049">
                        + ${t('newCostCenter') || 'New Cost Center'}
                    </button>
                </div>`;
    if (ccs.length === 0) {
        html += `<div class="gov-empty">
            <div class="gov-empty-icon">&#9632;</div>
            ${t('noCostCenters') || 'No cost centers yet'}
        </div>`;
    }
    else {
        html += _renderCCTree(tree, typeLabels, currentFY, 0);
    }
    html += `</div></div>`;
    return html;
}
export { renderCostCentersSection };
/**
 * Bind event listeners for CC tree edit/remove buttons (data-* pattern).
 * Deve ser chamado apos inserir o HTML de renderCostCentersSection no DOM.
 * @param {HTMLElement} container
 */
export function bindCostCenterTreeListeners( container: any) {
    if (!container)
        return;
    container.querySelectorAll('.cc-edit-btn').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            if (window.handleEditCostCenter)
                window.handleEditCostCenter(btn.dataset.ccId);
        });
    });
    container.querySelectorAll('.cc-remove-btn').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            if (window.handleRemoveCostCenter)
                window.handleRemoveCostCenter(btn.dataset.ccId);
        });
    });
}
/**
 * @param {any} nodes
 * @param {any} typeLabels
 * @param {any} currentFY
 * @param {any} depth
 */
function _renderCCTree( nodes: any, typeLabels: any, currentFY: any, depth: any) {
    let html = '';
    for (const node of nodes) {
        html += renderCCNode(node, typeLabels, currentFY, depth);
        if (node.children?.length > 0) {
            html += _renderCCTree(node.children, typeLabels, currentFY, depth + 1);
        }
    }
    return html;
}

/**
 * Renderiza um nó da árvore de centros de custo.
 * @param {any} node
 * @param {any} typeLabels
 * @param {number} currentFY
 * @param {number} depth
 * @returns {string}
 */
function renderCCNode(node: any, typeLabels: any, currentFY: number, depth: number): string {
    const indent = depth * 20;
    const typeLabel = (typeLabels as any)[node.type] || node.type;
    const budget = node.budgets?.find((b: any) => b.fiscalYear === currentFY);
    const budgetTotal = budget?.budgetTotal || 0;
    const inactiveClass = node.active ? '' : ' gov-card-inactive';
    const inactiveBadge = !node.active
        ? `<span class="gov-status-badge gov-status-terminated gov-cc-inactive-badge">${t('inactive') || 'Inactive'}</span>`
        : '';
    const responsible = node.responsiblePerson
        ? `<div class="gov-cc-detail">${t('costCenterResponsible') || 'Responsible'}: ${escapeHtml(node.responsiblePerson)}</div>`
        : '';
    const budgetLine = budgetTotal > 0
        ? `<div class="gov-cc-detail">${t('costCenterBudget') || 'Budget'} ${currentFY}: ${budgetTotal.toLocaleString()}</div>`
        : '';
    return `
        <div class="gov-card${inactiveClass}">
            <div class="gov-card-header" style="padding-left:${indent + 8}px">
                <div>
                    <strong>${escapeHtml(node.code || '-')}</strong>
                    <span class="gov-cc-name">${escapeHtml(node.name)}</span>
                    <span class="gov-status-badge gov-status-active gov-cc-type-badge">${escapeHtml(typeLabel)}</span>
                    ${inactiveBadge}
                </div>
                <div class="gov-card-actions">
                    <button class="btn btn-sm cc-edit-btn" data-cc-id="${escapeAttr(node.id)}" title="${t('editCostCenter') || 'Edit'}">&#9998;</button>
                    <button class="btn btn-sm btn-danger cc-remove-btn" data-cc-id="${escapeAttr(node.id)}" title="${t('removeCostCenter') || 'Remove'}">&#10005;</button>
                </div>
            </div>
            <div class="gov-card-body" style="padding-left:${indent + 8}px">
                ${responsible}
                ${budgetLine}
            </div>
        </div>`;
}
/**
 * Render cost center edit form inside modal.
 * @param {string} ccId
 */
export function renderCostCenterForm( ccId: any) {
    const cc = getCostCenter(ccId);
    if (!cc)
        return;
    const allCCs = getCostCenters().filter((c: any) => c.id !== ccId);
    const container = document.getElementById('cost-center-form');
    if (!container)
        return;
    const parentOpts = buildCostCenterParentOptions(allCCs, cc.parentId);
    const budgetRows = buildCostCenterBudgetRows(cc.budgets, ccId);

    container.innerHTML = [
        renderCostCenterBasicFields(cc),
        renderCostCenterParentField(parentOpts),
        renderCostCenterActiveField(cc.active),
        renderCostCenterBudgetField(budgetRows, ccId),
        renderCostCenterFormFooter(),
    ].join('');

    bindCostCenterFormEvents(container, ccId);
}

/**
 * Gera as opções do select de centro de custo pai.
 * @param {any[]} allCCs
 * @param {string|null} parentId
 * @returns {string}
 */
function buildCostCenterParentOptions(allCCs: any[], parentId: any): string {
    return allCCs
        .map((c: any) => `<option value="${c.id}" ${c.id === parentId ? 'selected' : ''}>${escapeHtml(c.code || '-')} - ${escapeHtml(c.name)}</option>`)
        .join('');
}

/**
 * Gera as linhas de orçamento do centro de custo.
 * @param {any[]} budgets
 * @param {any} ccId
 * @returns {string}
 */
function buildCostCenterBudgetRows(budgets: any[], ccId: any): string {
    return budgets.map((b: any) => `
        <div class="cc-budget-row">
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1226" class="cc-budget-fy input-sm" type="number" value="${b.fiscalYear}" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1227" class="cc-budget-capex input-sm" type="number" value="${b.budgetCapex || 0}" placeholder="CAPEX" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1228" class="cc-budget-opex input-sm" type="number" value="${b.budgetOpex || 0}" placeholder="OPEX" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1229" class="cc-budget-total input-sm" type="number" value="${b.budgetTotal || 0}" placeholder="Total" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1230" class="cc-budget-notes input-sm" type="text" value="${escapeAttr(b.notes || '')}" placeholder="${t('notes') || 'Notes'}" />
            <button class="btn btn-sm btn-danger cc-remove-budget-btn" data-cc-id="${escapeAttr(ccId)}" data-fy="${b.fiscalYear}">&#10005;</button>
        </div>
    `).join('');
}

/**
 * Renderiza os campos básicos do formulário de centro de custo.
 * @param {any} cc
 * @returns {string}
 */
function renderCostCenterBasicFields(cc: any): string {
    return `
        <div class="form-group">
            <label>${t('costCenterCode') || 'Code'}</label>
            <input data-field-meta="true" data-field-meta-key="auto:cc-code" id="cc-code" class="input" type="text" value="${escapeAttr(cc.code)}" />
        </div>
        <div class="form-group">
            <label>${t('costCenterName') || 'Name'}</label>
            <input data-field-meta="true" data-field-meta-key="auto:cc-name" id="cc-name" class="input" type="text" value="${escapeAttr(cc.name)}" />
        </div>
        <div class="form-group">
            <label>${t('costCenterType') || 'Type'}</label>
            <select data-field-meta="true" data-field-meta-key="auto:cc-type" id="cc-type" class="input">
                ${costCenterTypeOption('production', t('costCenterTypeProduction') || 'Production', cc.type)}
                ${costCenterTypeOption('administrative', t('costCenterTypeAdministrative') || 'Administrative', cc.type)}
                ${costCenterTypeOption('support', t('costCenterTypeSupport') || 'Support', cc.type)}
                ${costCenterTypeOption('project', t('costCenterTypeProject') || 'Project', cc.type)}
                ${costCenterTypeOption('custom', t('costCenterTypeCustom') || 'Custom', cc.type)}
            </select>
        </div>
        <div class="form-group">
            <label>${t('costCenterResponsible') || 'Responsible'}</label>
            <input data-field-meta="true" data-field-meta-key="auto:cc-responsible" id="cc-responsible" class="input" type="text" value="${escapeAttr(cc.responsiblePerson)}" />
        </div>`;
}

/**
 * Gera uma opção do select de tipo de centro de custo.
 * @param {string} value
 * @param {string} label
 * @param {string} selectedValue
 * @returns {string}
 */
function costCenterTypeOption(value: string, label: string, selectedValue: string): string {
    return `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${label}</option>`;
}

/**
 * Renderiza o campo de seleção do centro de custo pai.
 * @param {string} parentOpts
 * @returns {string}
 */
function renderCostCenterParentField(parentOpts: string): string {
    return `
        <div class="form-group">
            <label>${t('costCenterParent') || 'Parent'}</label>
            <select data-field-meta="true" data-field-meta-key="auto:cc-parent" id="cc-parent" class="input">
                <option value="">(${t('none') || 'None'})</option>
                ${parentOpts}
            </select>
        </div>`;
}

/**
 * Renderiza o campo de ativação do centro de custo.
 * @param {boolean} active
 * @returns {string}
 */
function renderCostCenterActiveField(active: boolean): string {
    return `
        <div class="form-group">
            <label><input data-field-meta="true" data-field-meta-key="auto:cc-active" id="cc-active" type="checkbox" ${active ? 'checked' : ''} /> ${t('active') || 'Active'}</label>
        </div>`;
}

/**
 * Renderiza a seção de orçamento do formulário de centro de custo.
 * @param {string} budgetRows
 * @param {any} ccId
 * @returns {string}
 */
function renderCostCenterBudgetField(budgetRows: string, ccId: any): string {
    return `
        <div class="form-group">
            <label>${t('costCenterBudget') || 'Budget'}</label>
            ${budgetRows || `<div class="gov-no-budgets">${t('noBudgets') || 'No budgets'}</div>`}
            <button class="btn btn-sm btn-secondary cc-add-budget-btn" data-cc-id="${escapeAttr(ccId)}">
                + ${t('addBudget') || 'Add Budget'}
            </button>
        </div>`;
}

/**
 * Renderiza o rodapé do formulário de centro de custo.
 * @returns {string}
 */
function renderCostCenterFormFooter(): string {
    return `
        <div class="gov-form-footer">
            <button class="btn btn-primary" id="cc-save-btn">
                ${t('save') || 'Save'}
            </button>
        </div>`;
}

/**
 * Liga os listeners dos botões do formulário de centro de custo.
 * @param {HTMLElement} container
 * @param {any} ccId
 */
function bindCostCenterFormEvents(container: HTMLElement, ccId: any): void {
    container.querySelector('#cc-save-btn')?.addEventListener('click', () => {
        if (window.handleSaveCostCenterBudget)
            window.handleSaveCostCenterBudget();
        if (window.handleSaveCostCenter)
            window.handleSaveCostCenter();
    });
    container.querySelectorAll('.cc-remove-budget-btn').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            if (window.handleRemoveCostCenterBudget) {
                window.handleRemoveCostCenterBudget(btn.dataset.ccId, Number(btn.dataset.fy));
            }
        });
    });
    container.querySelector('.cc-add-budget-btn')?.addEventListener('click', () => {
        if (window.handleAddCostCenterBudget)
            window.handleAddCostCenterBudget(ccId);
    });
}
/**
 * Render cost allocation form inside modal.
 * @param {string} sourceType
 * @param {string} sourceId
 */
export function renderCostAllocationForm( sourceType: any, sourceId: any) {
    const allCCs = getCostCenters();
    const existing = getAllocationsForSource(sourceType, sourceId);
    const container = document.getElementById('cost-allocation-form');
    if (!container)
        return;
    const rows = existing
        .map((a: any) => {
        const ccOpts = allCCs
            .map((cc: any) => `<option value="${cc.id}" ${cc.id === a.costCenterId ? 'selected' : ''}>${escapeHtml(cc.code || '-')} - ${escapeHtml(cc.name)}</option>`)
            .join('');
        return `
            <div class="ca-alloc-row">
                <select data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:select:L1322" class="ca-cc-select input-sm">${ccOpts}</select>
                <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1323" class="ca-pct-input input-sm" type="number" min="0" max="100" value="${a.percentage}" />
                <span class="ca-alloc-pct-label">%</span>
                <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1325" class="ca-notes-input input-sm" type="text" value="${escapeAttr(a.notes || '')}" placeholder="${t('notes') || 'Notes'}" />
                <button class="btn btn-sm btn-danger" data-cc-action="cc-48a69edd">&#10005;</button>
            </div>
        `;
    })
        .join('');
    const ccSelectHtml = allCCs
        .map((cc: any) => `<option value="${cc.id}">${escapeHtml(cc.code || '-')} - ${escapeHtml(cc.name)}</option>`)
        .join('');
    container.innerHTML = `
        <input type="hidden" id="ca-source-type" value="${sourceType}" />
        <input type="hidden" id="ca-source-id" value="${sourceId}" />
        <div id="ca-rows">${rows}</div>
        <button class="btn btn-sm btn-secondary gov-add-alloc-bar" id="ca-add-row-btn">
            + ${t('addAllocation') || 'Add Allocation'}
        </button>
        <div class="gov-form-footer">
            <button class="btn btn-primary" data-cc-action="cc-8f030d3a">
                ${t('save') || 'Save'}
            </button>
        </div>
    `;
    // Bind add-row via JS (evita inline script complexo)
    document.getElementById('ca-add-row-btn')?.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'ca-alloc-row';
        row.innerHTML = `
            <select data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:select:L1355" class="ca-cc-select input-sm">${ccSelectHtml}</select>
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1356" class="ca-pct-input input-sm" type="number" min="0" max="100" value="0" />
            <span class="ca-alloc-pct-label">%</span>
            <input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1358" class="ca-notes-input input-sm" type="text" placeholder="${t('notes') || 'Notes'}" />
            <button class="btn btn-sm btn-danger" data-cc-action="cc-48a69edd">&#10005;</button>
        `;
        document.getElementById('ca-rows')?.appendChild(row);
    });
}
// ----------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------
/** @deprecated Styles moved to app/css/governance.css — loaded via <link> tag */
function injectGovernanceStyles() {
    // no-op: CSS now loaded from governance.css
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * @param {any} value
 */
export function formatCurrency( value: any) {
    return _pureFormatCurrencyBRL(value);
}
/**
 * @param {any} projectId
 */
function _getProjectResourceCount( projectId: any) {
    return _pureCountProjectResources(getAllocations(), projectId);
}
/**
 * @param {any} type
 */
function contractTypeLabel( type: any) {
    return _pureResolveContractTypeLabel(type, t);
}
// ----------------------------------------------------------------
// WBS DATA MODAL - Tabela editavel consolidada para Curva S
// ----------------------------------------------------------------
/**
 * Render the WBS data table modal.
 * Renderiza modal com tabela editavel dos itens folha da EAP.
 */
export function renderWbsDataModal() {
    const content = document.getElementById('wbs-data-modal-content');
    if (!content)
        return;
    const items = getWbsItems();
    const leaves = _pureFilterWbsLeaves(items);
    content.innerHTML = `
        <div class="wbs-data-modal-header">
            <h3 id="wbs-data-modal-title">${escapeHtml(t('wbsDataTitle') || 'WBS Data — S-Curve Inputs')}</h3>
            <button class="btn btn-sm" data-cc-action="cc-4e65cbb5">&times;</button>
        </div>
        <div class="wbs-data-modal-body">
            ${leaves.length === 0
        ? '<p class="wbs-data-empty">' +
            escapeHtml(t('wbsDataEmpty') || 'No leaf WBS items found.') +
            '</p>'
        : _buildWbsDataTable(leaves)}
        </div>
        <div class="wbs-data-modal-footer">
            <button class="btn btn-sm btn-secondary" data-cc-action="cc-4e65cbb5">${escapeHtml(t('cancel') || 'Cancel')}</button>
            <button class="btn btn-sm btn-primary" data-cc-action="cc-f7f53e6e">${escapeHtml(t('save') || 'Save')}</button>
        </div>`;
}
/**
 * Build WBS data table HTML.
 * Constroi tabela HTML com headers e linhas de itens folha.
 * @param {Array<any>} leaves
 * @returns {string}
 */
function _buildWbsDataTable( leaves: any) {
    const headers = [
        'Code',
        'Name',
        'B.Cost',
        'B.Start',
        'B.End',
        'B.Weight',
        'P.Cost',
        'P.Start',
        'P.End',
        'A.Cost',
        'A.Start',
        'A.End',
        '% Done',
        'Status',
    ];
    const ths = headers.map((h: any) => `<th>${escapeHtml(h)}</th>`).join('');
    const rows = leaves.map((item: any) => _buildWbsDataRow(item)).join('');
    return `<table class="wbs-data-table" role="grid">
        <thead><tr>${ths}</tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}
/**
 * Build a single WBS data row.
 * Constroi uma linha editavel para um item WBS folha.
 * @param {any} item
 * @returns {string}
 */
function _buildWbsDataRow( item: any) {
    /**
     * @param {any} field
     * @param {any} value
     * @param {any} extra
     */
    const num = (field: any, value: any, extra: any = '') => `<input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1475" type="number" data-field="${escapeAttr(field)}" value="${escapeAttr(String(value || 0))}" ${extra}>`;
    /**
     * @param {any} field
     * @param {any} value
     */
    const date = (field: any, value: any) => `<input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1477" type="date" data-field="${escapeAttr(field)}" value="${escapeAttr(value || '')}">`;
    const statuses = ['not_started', 'in_progress', 'completed', 'delayed'];
    const sel = `<select data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:select:L1480" data-field="status">${statuses
        .map((s: any) => `<option value="${escapeAttr(s)}" ${item.status === s ? 'selected' : ''}>${escapeHtml(s.replace(/_/g, ' '))}</option>`)
        .join('')}</select>`;
    return `<tr data-wbs-id="${escapeAttr(item.id)}">
        <td><input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1488" type="text" data-field="code" value="${escapeAttr(item.code)}" readonly tabindex="-1"></td>
        <td><input data-field-meta="true" data-field-meta-key="auto-pos:governancePanel:input:L1489" type="text" data-field="name" value="${escapeAttr(item.name)}"></td>
        <td>${num('baseline.cost', item.baseline?.cost, 'step="100"')}</td>
        <td>${date('baseline.startDate', item.baseline?.startDate)}</td>
        <td>${date('baseline.endDate', item.baseline?.endDate)}</td>
        <td>${num('baseline.weight', item.baseline?.weight, 'step="1"')}</td>
        <td>${num('planned.cost', item.planned?.cost, 'step="100"')}</td>
        <td>${date('planned.startDate', item.planned?.startDate)}</td>
        <td>${date('planned.endDate', item.planned?.endDate)}</td>
        <td>${num('actual.cost', item.actual?.cost, 'step="100"')}</td>
        <td>${date('actual.startDate', item.actual?.startDate)}</td>
        <td>${date('actual.endDate', item.actual?.endDate)}</td>
        <td>${num('actual.percentComplete', item.actual?.percentComplete, 'min="0" max="100" step="1"')}</td>
        <td>${sel}</td>
    </tr>`;
}
// ----------------------------------------------------------------
// ESG GOVERNANCE SECTION (G5-G10: Export, Share, Provenance, Retention)
// ----------------------------------------------------------------
/**
 * Render the consolidated ESG Governance section with 4 subsections:
 * G5 (ESG Export), G8 (Stakeholder Share), G9 (Provenance Graph),
 * G10 (Retention Policies).
 */
export function renderEsgGovernanceSection() {
    return `
        <div class="section ${window.sectionClass?.('gov-esg') ?? 'collapsed'}" data-section-id="gov-esg">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('governance.esg.title') || 'ESG Governance (G5-G10)'}</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                ${renderEsgExportSubsection()}
                ${renderStakeholderShareSubsection()}
                ${renderProvenanceGraphSubsection()}
                ${renderRetentionPolicySubsection()}
            </div>
        </div>
    `;
}

/**
 * Renderiza a subseção G5 — ESG Export.
 * @returns {string}
 */
function renderEsgExportSubsection(): string {
    return `
        <!-- G5: ESG Export -->
        <div class="gov-esg-subsection">
            <h4 class="gov-esg-subsection-title">${t('governance.esg.exportTitle') || 'G5 — ESG Export (GRI/ISSB)'}</h4>
            <div class="gov-actions">
                <button class="btn btn-sm btn-primary" data-cc-action="cc-fb4e7090">
                    &#8681; ${t('governance.esg.exportCsv') || 'Export CSV (ESG headers)'}
                </button>
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-4a52afac">
                    &#128196; ${t('governance.esg.exportTemplate') || 'Template ISSB (assistido)'}
                </button>
            </div>
            <div class="gov-hint">${t('governance.esg.exportHint') || 'CSV com vocabulário GRI 303/304/306 + template DOCX IFRS S1.'}</div>
        </div>`;
}

/**
 * Renderiza a subseção G8 — Stakeholder Share.
 * @returns {string}
 */
function renderStakeholderShareSubsection(): string {
    return `
        <!-- G8: Stakeholder Share -->
        <div class="gov-esg-subsection">
            <h4 class="gov-esg-subsection-title">${t('governance.share.title') || 'G8 — Stakeholder Share'} <span id="stakeholder-share-count" class="gov-badge">0</span></h4>
            <div class="gov-actions">
                <button class="btn btn-sm btn-primary" data-cc-action="cc-33f4e5bc">
                    + ${t('governance.share.new') || 'Novo Share'}
                </button>
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-b80316c0">
                    &#8635; ${t('refresh') || 'Atualizar'}
                </button>
            </div>
            <div id="stakeholder-share-list" class="gov-list">
                <div class="gov-empty gov-empty-compact">${t('governance.share.loading') || 'Carregando shares…'}</div>
            </div>
        </div>`;
}

/**
 * Renderiza a subseção G9 — Provenance Graph.
 * @returns {string}
 */
function renderProvenanceGraphSubsection(): string {
    return `
        <!-- G9: Provenance Graph -->
        <div class="gov-esg-subsection">
            <h4 class="gov-esg-subsection-title">${t('governance.provenance.title') || 'G9 — Provenance Graph'} <span id="provenance-graph-count" class="gov-badge">0n / 0e</span></h4>
            <div class="gov-actions">
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-e030b037">
                    &#8635; ${t('governance.provenance.rebuild') || 'Reconstruir'}
                </button>
            </div>
            <div id="provenance-graph-container" class="gov-graph-container">
                <div class="gov-empty gov-empty-compact">${t('governance.provenance.loading') || 'Carregando grafo…'}</div>
            </div>
        </div>`;
}

/**
 * Renderiza a subseção G10 — Retention Policies.
 * @returns {string}
 */
function renderRetentionPolicySubsection(): string {
    return `
        <!-- G10: Retention Policy -->
        <div class="gov-esg-subsection">
            <h4 class="gov-esg-subsection-title">${t('governance.retention.title') || 'G10 — Retention Policies'}</h4>
            <div class="gov-actions">
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-bfef5776">
                    &#9654; ${t('governance.retention.dryRunBtn') || 'Dry Run'}
                </button>
            </div>
            <div id="retention-policies-list" class="gov-list">
                <div class="gov-empty gov-empty-compact">${t('governance.retention.loading') || 'Carregando políticas…'}</div>
            </div>
        </div>`;
}
export function renderUncertaintyHubSection() {
    // 2026-04-12: Full Uncertainty Hub moved to Analyses tab (utils/ui/uncertaintyHubPanel.js).
    // This section is a read-only status badge + deep link, for compliance discoverability.
    return `
        <div class="section ${window.sectionClass?.('gov-uncertainty') ?? 'collapsed'}" data-section-id="gov-uncertainty">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>Uncertainty Hub</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <div class="unc-hub-gv-badge" id="unc-hub-gv-badge">
                    <div class="unc-hub-gv-badge-status">
                        <span class="unc-hub-gv-badge-dot" id="unc-hub-gv-badge-dot" aria-hidden="true">&#9898;</span>
                        <span>
                            <strong id="unc-hub-gv-badge-label">Sem dados</strong>
                            <span style="color: var(--text-secondary); display: block; font-size: 10px;" id="unc-hub-gv-badge-scope">escopo: —</span>
                        </span>
                    </div>
                    <button class="unc-hub-gv-badge-link" type="button"
                        data-cc-action="cc-921e6f7a">
                        Abrir em Análises &rarr;
                    </button>
                </div>
                <div style="font-size: 11px; color: var(--text-secondary); padding: 0 2px;">
                    Editor de policy, propagação, sensibilidade e timeline de auditoria
                    agora vivem em <strong>Análises &rsaquo; Uncertainty Hub</strong>.
                </div>
            </div>
        </div>
    `;
}
/**
 * Hydrate the read-only badge in Governance. Shows class + scope linking to AN.
 * Called from renderGovernanceTab() after sections render.
 */
export async function hydrateUncertaintyHubGvBadge() {
    const badge = document.getElementById('unc-hub-gv-badge');
    if (!badge || typeof window.handleGetUncertaintyHubState !== 'function')
        return;
    try {
        const state = await window.handleGetUncertaintyHubState();
        const last = state?.lastResults || null;
        const action = last?.decision?.action || last?.propagation?.rule_action || null;
        const { dot, label } = resolveUncertaintyBadge(action);
        (document.getElementById('unc-hub-gv-badge-dot') as any).innerHTML = dot;
        (document.getElementById('unc-hub-gv-badge-label') as any).textContent = label;
        updateUncertaintyBadgeScope(state);
    }
    catch (err: any) {
        console.error('[gov:unc-badge] hydrate failed:', err);
    }
}

/**
 * Resolve o indicador visual e rótulo do badge de Uncertainty Hub.
 * @param {string|null} action
 * @returns {{ dot: string, label: string }}
 */
function resolveUncertaintyBadge(action: any): { dot: string; label: string } {
    if (action === 'block') {
        return { dot: '&#128308;', label: 'CRÍTICO — publicação bloqueada' };
    }
    if (action === 'warn') {
        return { dot: '&#128993;', label: 'ATENÇÃO — revisar drivers' };
    }
    if (action) {
        return { dot: '&#128994;', label: 'ACEITÁVEL' };
    }
    return { dot: '&#9898;', label: 'Sem dados' };
}

/**
 * Atualiza a linha de escopo do badge de Uncertainty Hub.
 * @param {any} state
 */
function updateUncertaintyBadgeScope(state: any): void {
    const matrix = state?.policyDraft?.matrix || 'n/a';
    const project = state?.policyDraft?.project_id || '(workspace default)';
    (document.getElementById('unc-hub-gv-badge-scope') as any).textContent =
        `escopo: matriz ${matrix} · projeto ${project}`;
}
// Compatibility shim: hydrateUncertaintyHub() was previously the full-panel
// hydrator for the Governance tab. Since 2026-04-12 the full UI lives in
// Analyses (utils/ui/uncertaintyHubPanel.js). This function now hydrates
// only the read-only badge in Governance.
export async function hydrateUncertaintyHub() {
    return hydrateUncertaintyHubGvBadge();
}
/**
 * Hydrate the stakeholder share list.
 */
export async function hydrateStakeholderShares() {
    const listEl = document.getElementById('stakeholder-share-list');
    const countEl = document.getElementById('stakeholder-share-count');
    if (!listEl)
        return;
    try {
        const shares = await window.handleListStakeholderShares?.();
        if (!Array.isArray(shares)) {
            listEl.innerHTML = '<div class="gov-empty gov-empty-compact">Unavailable</div>';
            return;
        }
        if (countEl)
            countEl.textContent = String(shares.length);
        if (shares.length === 0) {
            listEl.innerHTML = `<div class="gov-empty gov-empty-compact">${t('governance.share.none') || 'Nenhum share ativo'}</div>`;
            return;
        }
        listEl.innerHTML = shares
            .map((s: any) => {
            const expiredClass = new Date(s.expiresAt).getTime() < Date.now() ? 'expired' : '';
            const revokedClass = s.revoked ? 'revoked' : '';
            const label = s.label || `(${s.role})`;
            const expDate = new Date(s.expiresAt).toLocaleDateString('pt-BR');
            return `
                    <div class="gov-share-item ${expiredClass} ${revokedClass}">
                        <div class="gov-share-id">${escapeHtml(s.id)}</div>
                        <div class="gov-share-meta">
                            <span class="gov-share-role">${escapeHtml(s.role)}</span>
                            <span class="gov-share-label">${escapeHtml(label)}</span>
                            <span class="gov-share-exp">${expDate}</span>
                        </div>
                        ${!s.revoked
                ? `<button class="btn btn-sm btn-danger" data-cc-call-click="handleRevokeStakeholderShare|s:${encodeURIComponent(`${escapeAttr(s.id)}`)}" title="${t('governance.share.revoke') || 'Revogar'}">&times;</button>`
                : `<span class="gov-share-revoked-label">${t('governance.share.revokedLabel') || 'revogado'}</span>`}
                    </div>
                `;
        })
            .join('');
    }
    catch (err: any) {
        listEl.innerHTML = `<div class="gov-empty gov-empty-compact">Error: ${escapeHtml(err.message)}</div>`;
    }
}
/**
 * Hydrate the retention policies list.
 */
export async function hydrateRetentionPolicies() {
    const listEl = document.getElementById('retention-policies-list');
    if (!listEl)
        return;
    try {
        const policies = await window.handleGetRetentionPolicies?.();
        if (!Array.isArray(policies) || policies.length === 0) {
            listEl.innerHTML = `<div class="gov-empty gov-empty-compact">${t('governance.retention.none') || 'Nenhuma política'}</div>`;
            return;
        }
        listEl.innerHTML = policies
            .map((p: any) => {
            const daysLabel = p.retentionDays === -1 ? '∞' : `${p.retentionDays}d`;
            return `
                    <div class="gov-retention-item">
                        <div class="gov-retention-type">${escapeHtml(p.dataType)}</div>
                        <div class="gov-retention-days">${daysLabel}</div>
                        <button class="btn btn-sm btn-secondary" data-cc-call-click="handleSetRetentionPolicy|s:${encodeURIComponent(`${escapeAttr(p.dataType)}`)}" title="${t('edit') || 'Editar'}">
                            ${t('edit') || 'Editar'}
                        </button>
                    </div>
                `;
        })
            .join('');
    }
    catch (err: any) {
        listEl.innerHTML = `<div class="gov-empty gov-empty-compact">Error: ${escapeHtml(err.message)}</div>`;
    }
}
/**
 * Hydrate the provenance graph preview (lazy - only if section is visible).
 */
export async function hydrateProvenanceGraphPreview() {
    const container = document.getElementById('provenance-graph-container');
    if (!container)
        return;
    if (typeof window.handleRenderProvenanceGraph === 'function') {
        await window.handleRenderProvenanceGraph();
    }
}
