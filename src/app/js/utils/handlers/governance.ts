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
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GOVERNANCE HANDLERS — User actions for contracts, WBS, EVA
   Acoes do usuario para contratos, EAP e Valor Agregado

   FUNCIONALIDADES:
   - CRUD de contratos e itens WBS
   - Aplicacao de templates WBS
   - Calculo e exibicao de EVA
   - Vinculacao de elementos a contratos
   ================================================================ */
import * as contractManagerModule from '../governance/contractManager.js';
import { getInstalledLibraries, isLibraryActive } from '../libraries/manager.js';
import * as wbsManagerModule from '../governance/wbsManager.js';
import { renderContractForm, renderWbsDataModal } from '../ui/governancePanel.js';
import { showToast } from '../ui/toast.js';
import { asyncPrompt } from '../ui/asyncDialogs.js';
import { t } from '../i18n/translations.js';
import { openModal, closeModal } from '../ui/modals.js';
import { createLogger } from '../helpers/logger.js';
import { canDo } from '../auth/permissions.js';
import { getCurrentSession } from '../auth/session.js';
import {
    resolveAndTrack,
    convertQualitativeUncertainty,
    evaluateUncertaintyDecisionRules,
    optimizeMonitoringPlan,
    buildUncertaintyEvidence,
    validateUncertaintyEvidence,
} from '../../core/uncertainty/index.js';
import {
    loadUncertaintyHubState,
    saveUncertaintyHubState,
    syncUncertaintyEcbtKeyOnline,
} from '../../core/uncertainty/hubStore.js';
import { generateKeySimple } from '../../core/io/export.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Governance');
/** @typedef {Record<string, any>} AnyRecord */
const window = globalThis.window;
const document = globalThis.document;
const Blob = globalThis.Blob;
const URL = globalThis.URL;
const {
    addContract,
    updateContract,
    removeContract,
    getContract,
    addParty,
    removeParty,
    addDisbursement,
    removeDisbursement,
    updateDisbursement,
    linkLibraryToDisbursement,
    unlinkLibraryFromDisbursement,
    syncLibraryEvidence,
    linkElement,
    unlinkElement,
    fileInsuranceClaim,
} = contractManagerModule;
const { addWbsItem, updateWbsItem, removeWbsItem, applyTemplate, saveSnapshot } = wbsManagerModule;
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let requestGovernanceUIRefreshRef: any = null;
let editingContractId: any = null;
let _uncertaintyHubCache: any = null;
function _canManageUncertaintyPolicies() {
    try {
        const session = getCurrentSession?.() || null;
        const roleGate = canDo('admin', 'governance');
        const tierGate = ['premium', 'pro', 'supporter'].includes(String(session?.tier || '').toLowerCase());
        const professionalGate = String(session?.professionalStatus || '').toLowerCase() === 'approved';
        return Boolean(roleGate || tierGate || professionalGate);
    } catch (e: any) {
        console.debug('[governance] permissionGate:', e?.message || e);
        return false;
    }
}
/**
 * Inject domain-scoped refresh callback reference.
 * @param {Function} fn
 */
export function setGovernanceRequestUIRefresh(fn: any) {
    requestGovernanceUIRefreshRef = fn;
}
function requestGovernanceUIRefresh(reason = 'governance.changed') {
    if (!requestGovernanceUIRefreshRef) return;
    for (const domain of [
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.REPORT,
    ]) {
        requestGovernanceUIRefreshRef(domain, reason);
    }
}
// ----------------------------------------------------------------
// CONTRACT HANDLERS
// ----------------------------------------------------------------
function handleAddContract() {
    const contract = addContract({
        name: t('newContract') || 'New Contract',
        type: 'custom',
        status: 'draft',
    });
    requestGovernanceUIRefresh();
    showToast(`${t('contractAdded')}: ${contract.name}`, 'success');
}
function handleEditContract(id: any) {
    editingContractId = id;
    renderContractForm(id);
    openModal('contract-modal');
}
function handleRemoveContract(id: any) {
    const contract = getContract(id);
    if (!contract) return;
    removeContract(id);
    requestGovernanceUIRefresh();
    showToast(`${t('contractRemoved')}`, 'info');
}
function handleSaveContract() {
    if (!editingContractId) return;
    const name = document.getElementById('contract-name')?.value || '';
    const type = document.getElementById('contract-type')?.value || 'custom';
    const status = document.getElementById('contract-status')?.value || 'draft';
    const totalValue = parseFloat(document.getElementById('contract-total-value')?.value) || 0;
    const currency = document.getElementById('contract-currency')?.value || 'BRL';
    const effectiveDate = document.getElementById('contract-effective-date')?.value || '';
    const expirationDate = document.getElementById('contract-expiration-date')?.value || '';
    const notes = document.getElementById('contract-notes')?.value || '';
    updateContract(editingContractId, {
        name,
        type,
        status,
        notes,
        financial: { totalValue, currency },
        dates: { effectiveDate, expirationDate },
    });
    closeModal('contract-modal');
    requestGovernanceUIRefresh();
    showToast(t('contractSaved'), 'success');
}
function handleAddContractParty(contractId: any) {
    addParty(contractId, {
        role: 'contractor',
        name: '',
        registry: '',
    });
    if (editingContractId === contractId) {
        renderContractForm(contractId);
    }
}
function handleRemoveContractParty(contractId: any, index: any) {
    removeParty(contractId, index);
    if (editingContractId === contractId) {
        renderContractForm(contractId);
    }
}
function handleUpdateContractParty(contractId: any, index: any, field: any, value: any) {
    const contract = getContract(contractId);
    if (!contract || !contract.parties[index]) return;
    contract.parties[index][field] = value;
}
function handleAddDisbursement(contractId: any) {
    addDisbursement(contractId, {
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        description: '',
        status: 'scheduled',
    });
    if (editingContractId === contractId) {
        renderContractForm(contractId);
    }
}
function handleRemoveDisbursement(contractId: any, disbursementId: any) {
    removeDisbursement(contractId, disbursementId);
    if (editingContractId === contractId) {
        renderContractForm(contractId);
    }
}
function handleUpdateDisbursementField(contractId: any, disbursementId: any, field: any, value: any) {
    updateDisbursement(contractId, disbursementId, { [field]: value });
}
function handleLinkLibraryToDisbursement(contractId: any, disbursementId: any, libraryId: any) {
    if (!libraryId) {
        unlinkLibraryFromDisbursement(contractId, disbursementId);
    } else {
        const libs = getInstalledLibraries();
        const lib = libs.find((l: any) => l.manifest.id === libraryId);
        if (!lib) return;
        linkLibraryToDisbursement(contractId, disbursementId, {
            libraryId: lib.manifest.id,
            libraryName: lib.manifest.name,
            evidenceStatus: isLibraryActive(libraryId) ? 'delivered' : 'pending',
        });
    }
    if (editingContractId === contractId) {
        renderContractForm(contractId);
    }
}
function handleLinkElementToContract(elementId: any, contractId: any) {
    linkElement(contractId, elementId);
    requestGovernanceUIRefresh();
}
function handleUnlinkElementFromContract(elementId: any, contractId: any) {
    unlinkElement(contractId, elementId);
    requestGovernanceUIRefresh();
}
// ----------------------------------------------------------------
// WBS HANDLERS
// ----------------------------------------------------------------
function handleAddWbsItem(parentId: any = null) {
    const item = addWbsItem({
        parentId,
        name: t('newTask') || 'New Task',
    });
    requestGovernanceUIRefresh();
    showToast(`${t('wbsItemAdded')}: ${item.code}`, 'success');
}
function handleEditWbsItem(id: any, field: any, value: any) {
    const parsed =
        field === 'percentComplete' || field === 'cost' || field === 'weight' ? parseFloat(value) || 0 : value;
    // Route to the correct nested object
    if (field === 'weight') {
        // Weight always maps to baseline (peso fisico)
        updateWbsItem(id, { baseline: { weight: parsed } });
    } else if (['cost', 'startDate', 'endDate'].includes(field)) {
        // Determine which sub-object based on prefix
        const prefix = document.querySelector(`[data-wbs-field-prefix="${id}"]`)?.value || 'actual';
        updateWbsItem(id, { [prefix]: { [field]: parsed } });
    } else if (field === 'percentComplete') {
        updateWbsItem(id, { actual: { percentComplete: parsed } });
    } else {
        updateWbsItem(id, { [field]: parsed });
    }
    requestGovernanceUIRefresh();
}
function handleRemoveWbsItem(id: any) {
    removeWbsItem(id);
    requestGovernanceUIRefresh();
    showToast(t('wbsItemRemoved'), 'info');
}
function handleApplyWbsTemplate(templateId: any) {
    const created = applyTemplate(templateId);
    requestGovernanceUIRefresh();
    showToast(`${t('templateApplied')}: ${created.length} items`, 'success');
}
// ----------------------------------------------------------------
// EVA HANDLERS
// ----------------------------------------------------------------
function handleCalculateEVA() {
    requestGovernanceUIRefresh();
    showToast(t('evaCalculated'), 'success');
}
function handleSaveSnapshot() {
    const snap = saveSnapshot(new Date(), 'manual');
    requestGovernanceUIRefresh();
    showToast(`${t('snapshotSaved')}: ${snap.snapshotDate}`, 'success');
}
// ----------------------------------------------------------------
// LIBRARY EVIDENCE SYNC
// Sincroniza evidenceStatus quando libraries mudam
// ----------------------------------------------------------------
function syncLibraryEvidenceOnNextPaint() {
    requestAnimationFrame(() => {
        try {
            syncLibraryEvidence(isLibraryActive);
        } catch (err: any) {
            log.debug('Library evidence sync deferred', err?.message);
        }
    });
}

// Evento: library instalada/desinstalada/ativada/desativada
window.addEventListener('librariesChanged', () => {
    syncLibraryEvidence(isLibraryActive);
    requestGovernanceUIRefresh();
});
// Startup sync (DA PF1): initLibraries() nao dispara librariesChanged
queueMicrotask(syncLibraryEvidenceOnNextPaint);
// ----------------------------------------------------------------
// WBS DATA MODAL - Consolidated S-Curve data editor
// ----------------------------------------------------------------
/**
 * Open WBS data table modal.
 * Abre modal com tabela editavel dos dados WBS folha.
 */
function handleOpenWbsDataModal() {
    renderWbsDataModal();
    openModal('wbs-data-modal-overlay');
}
/**
 * Close WBS data table modal.
 * Fecha modal de dados WBS.
 */
function handleCloseWbsDataModal() {
    closeModal('wbs-data-modal-overlay');
}
/**
 * Save all edits from WBS data modal.
 * Salva todas as edicoes do modal de dados WBS.
 */
function handleSaveWbsDataModal() {
    const rows = document.querySelectorAll('.wbs-data-table tbody tr');
    let count = 0;
    rows.forEach((row: any) => {
        const id = row.dataset.wbsId || '';
        if (!id) return;
        const updates = _collectWbsRowUpdates(row);
        updateWbsItem(id, updates);
        count++;
    });
    closeModal('wbs-data-modal-overlay');
    requestGovernanceUIRefresh();
    showToast(`${count} ${t('wbsDataSaved')}`, 'success');
}
/**
 * Collect updates from a single WBS data table row.
 * Coleta valores editados de uma linha da tabela WBS.
 * @param {HTMLElement} row
 * @returns {Object}
 */
function _collectWbsRowUpdates(row: any) {
    const updates: any = { baseline: {}, planned: {}, actual: {} };
    const inputs = row.querySelectorAll('input:not([readonly]), select');
    inputs.forEach((el: any) => {
        const field = el.dataset.field || '';
        const raw = el.value;
        if (!field) return;
        if (field.startsWith('baseline.')) {
            updates.baseline[field.split('.')[1]] = _parseWbsField(field.split('.')[1], raw);
        } else if (field.startsWith('planned.')) {
            updates.planned[field.split('.')[1]] = _parseWbsField(field.split('.')[1], raw);
        } else if (field.startsWith('actual.')) {
            updates.actual[field.split('.')[1]] = _parseWbsField(field.split('.')[1], raw);
        } else {
            updates[field] = raw;
        }
    });
    return updates;
}
/**
 * Parse a WBS field value to the correct type.
 * Converte valor string para numero quando necessario.
 * @param {string} key
 * @param {string} raw
 * @returns {number|string}
 */
function _parseWbsField(key: any, raw: any) {
    if (['cost', 'weight', 'percentComplete'].includes(key)) {
        return parseFloat(raw) || 0;
    }
    return raw;
}
// ----------------------------------------------------------------
// INSURANCE HANDLERS - Acoes de seguro
// ----------------------------------------------------------------
async function handleFileInsuranceClaimAction(contractId: any) {
    const notes = await asyncPrompt(t('governance.fileClaim'), '', {
        placeholder: t('governance.fileClaimPlaceholder'),
        confirmLabel: t('submit') || 'Registrar',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (notes == null) return;
    const result = fileInsuranceClaim(contractId, notes);
    if (result) {
        showToast(t('insClaimRegistered'), 'success');
        requestGovernanceUIRefresh();
    } else {
        showToast(t('governance.cannotFileClaim'), 'error');
    }
}
function handleContractFilter(filter: any) {
    // Delegate to governance panel - set filter and re-render
    import('../ui/governancePanel.js' as string)
        .then((mod: any) => {
            if (mod.setContractFilter) mod.setContractFilter(filter);
            requestGovernanceUIRefresh();
        })
        .catch((err: any) => console.warn('[handlers/governance] import governancePanel failed:', err));
}
// ----------------------------------------------------------------
// GOVERNANCE CORE HANDLERS (G0-G3)
// Audit trail, observation lock, compliance dashboard
// ----------------------------------------------------------------
async function handleOpenGovernanceDashboard() {
    try {
        const { getComplianceStatus } = await import('../../core/governance/complianceDashboard.js' as string);
        const { getAllElements } = await import('../../core/elements/manager.js' as string);
        const elements = getAllElements();
        const status = getComplianceStatus(elements);
        log.info('Compliance status:', status.verdict, `rate=${status.complianceRate}`);
        showToast(
            `${t('governance.compliance')}: ${status.compliant}/${status.totalElements} (${Math.round(status.complianceRate * 100)}%)`,
            status.verdict === 'compliant' ? 'success' : status.verdict === 'attention' ? 'warning' : 'info',
        );
        return status;
    } catch (err: any) {
        log.error('Failed to open governance dashboard', err);
        showToast(t('governance.noData'), 'warning');
    }
}
async function handleGetAuditLog(filters: any) {
    try {
        const { getAuditLog } = await import('../../core/governance/auditTrail.js' as string);
        const entries = await getAuditLog(filters || {});
        if (entries.length === 0) {
            showToast(t('governance.auditLogEmpty'), 'info');
        }
        return entries;
    } catch (err: any) {
        log.error('Failed to get audit log', err);
        return [];
    }
}
async function handleLockObservation(obsId: any, reason: any) {
    try {
        const { lockObservation } = await import('../../core/governance/observationLock.js' as string);
        const { logAction } = await import('../../core/governance/auditTrail.js' as string);
        const record = await lockObservation(obsId, reason || 'validated');
        await logAction(record.lockedBy, 'observation.lock', obsId, { reason: record.reason });
        showToast(t('governance.observationLockedSuccess'), 'success');
        requestGovernanceUIRefresh();
        return record;
    } catch (err: any) {
        log.error('Failed to lock observation', err);
        showToast(err.message, 'error');
    }
}
// ── G4 - Regulatory Calendar ─────────────────────────────────────────────────
/**
 * Add a regulatory obligation to the calendar.
 * @param {Object} obligation - { title, dueDate, type?, regulator?, description?, ... }
 */
async function handleAddRegulatoryObligation(obligation: any) {
    try {
        const { addObligation } = await import('../../core/governance/regulatoryCalendar.js' as string);
        const { logAction } = await import('../../core/governance/auditTrail.js' as string);
        const entry = await addObligation(obligation);
        await logAction('system', 'regulatory.add', entry.id, {
            title: entry.title,
            dueDate: entry.dueDate,
        });
        showToast(`${t('governance.obligationAdded')}: ${entry.title}`, 'success');
        requestGovernanceUIRefresh();
        return entry;
    } catch (err: any) {
        log.error('Failed to add regulatory obligation', err);
        showToast(err.message, 'error');
    }
}
/**
 * Mark a regulatory obligation as completed.
 * @param {string} id
 */
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrappers "ação + rehidrata o
 * calendário" usados pelos botões do painel (era promise chain inline).
 */
async function handleCompleteRegulatoryObligationAndRefresh(id: any) {
    await handleCompleteRegulatoryObligation(id);
    (window as any).hydrateRegulatoryCalendar?.();
}
async function handleRemoveRegulatoryObligationAndRefresh(id: any) {
    await handleRemoveRegulatoryObligation(id);
    (window as any).hydrateRegulatoryCalendar?.();
}

async function handleCompleteRegulatoryObligation(id: any) {
    try {
        const { completeObligation } = await import('../../core/governance/regulatoryCalendar.js' as string);
        const { logAction } = await import('../../core/governance/auditTrail.js' as string);
        const entry = await completeObligation(id);
        if (!entry) {
            showToast(t('governance.obligationNotFound'), 'warning');
            return null;
        }
        await logAction('system', 'regulatory.complete', id, { title: entry.title });
        showToast(`${t('governance.obligationCompleted')}: ${entry.title}`, 'success');
        requestGovernanceUIRefresh();
        return entry;
    } catch (err: any) {
        log.error('Failed to complete regulatory obligation', err);
        showToast(err.message, 'error');
    }
}
/**
 * Remove a regulatory obligation from the calendar (hard delete).
 * @param {string} id
 */
async function handleRemoveRegulatoryObligation(id: any) {
    try {
        const { removeObligation } = await import('../../core/governance/regulatoryCalendar.js' as string);
        const { logAction } = await import('../../core/governance/auditTrail.js' as string);
        const removed = await removeObligation(id);
        if (removed) {
            await logAction('system', 'regulatory.remove', id, {});
            showToast(t('governance.obligationRemoved'), 'success');
            requestGovernanceUIRefresh();
        }
        return removed;
    } catch (err: any) {
        log.error('Failed to remove regulatory obligation', err);
        showToast(err.message, 'error');
    }
}
/**
 * Open a 4-step wizard to add a new regulatory obligation.
 * Uses asyncPrompt (app's gold-standard dialog) instead of native prompt().
 * Future: dedicated modal with date picker + regulator autocomplete + form validation.
 */
async function handleOpenRegulatoryObligationModal() {
    const defaultDueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const title = await asyncPrompt(t('governance.enterObligationTitle'), '', {
        placeholder: t('governance.enterObligationTitlePlaceholder'),
        confirmLabel: t('next') || 'Próximo',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (!title || !title.trim()) return;
    const dueDate = await asyncPrompt(
        t('governance.enterDueDate') || 'Data de vencimento (YYYY-MM-DD)',
        defaultDueDate,
        {
            placeholder: 'YYYY-MM-DD',
            confirmLabel: t('next') || 'Próximo',
            cancelLabel: t('cancel') || 'Cancelar',
        },
    );
    if (!dueDate) return;
    // Validação leve de formato - evita inserir data inválida no calendário
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
        showToast(t('governance.invalidDueDate') || 'Data inválida. Use o formato YYYY-MM-DD.', 'warning');
        return;
    }
    const regulator = await asyncPrompt(t('governance.enterRegulator') || 'Órgão regulador (opcional)', '', {
        placeholder: t('governance.regulatorsPlaceholder'),
        confirmLabel: t('next') || 'Próximo',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (regulator === null) return; // usuário cancelou
    const type = await asyncPrompt(
        t('governance.enterType') || 'Tipo (license | report | renewal | inspection | other)',
        'license',
        {
            placeholder: 'license',
            confirmLabel: t('create') || 'Criar',
            cancelLabel: t('cancel') || 'Cancelar',
        },
    );
    if (type === null) return; // usuário cancelou
    await handleAddRegulatoryObligation({
        title: title.trim(),
        dueDate: dueDate.trim(),
        regulator: regulator.trim(),
        type: type.trim() || 'other',
    });
    // Refresh the UI panel if it's mounted
    if (typeof window !== 'undefined' && typeof window.hydrateRegulatoryCalendar === 'function') {
        await window.hydrateRegulatoryCalendar();
    }
}
/**
 * Refresh the regulatory calendar panel by re-rendering obligations.
 */
async function handleRefreshRegulatoryCalendar() {
    if (typeof window !== 'undefined' && typeof window.hydrateRegulatoryCalendar === 'function') {
        await window.hydrateRegulatoryCalendar();
        showToast(t('calendarRefreshed') || 'Calendario atualizado', 'success');
    }
}
/**
 * Get active obligations with urgency levels for dashboard display.
 */
async function handleGetRegulatoryCalendar() {
    try {
        const { getActiveWithUrgency, getCalendarSummary } = await import(
            '../../core/governance/regulatoryCalendar.js' as string
        );
        const [obligations, summary] = await Promise.all([getActiveWithUrgency(), getCalendarSummary()]);
        if (summary.overdue > 0) {
            showToast(`${summary.overdue} ${t('governance.overdue') || 'obrigacao(oes) vencida(s)'}`, 'error');
        } else if (summary.critical > 0) {
            showToast(`${summary.critical} ${t('governance.critical') || 'obrigacao(oes) critica(s)'}`, 'warning');
        }
        return { obligations, summary };
    } catch (err: any) {
        log.error('Failed to get regulatory calendar', err);
        return {
            obligations: [],
            summary: { total: 0, overdue: 0, critical: 0, urgent: 0, attention: 0, ok: 0 },
        };
    }
}
// ── G6 - Decision Log ───────────────────────────────────────────────────────
/**
 * Log a technical/regulatory/financial decision with rationale.
 * Direct API - preferred when called programmatically (e.g., from pipelines).
 * @param {Object} decision - { actor, category, title, rationale, ... }
 */
async function handleLogDecision(decision: any) {
    try {
        const { logDecision } = await import('../../core/governance/decisionLog.js' as string);
        const entry = await logDecision(decision);
        showToast(`${t('governance.decision.logged') || 'Decisão registrada'}: ${entry.title}`, 'success');
        if (typeof window !== 'undefined' && typeof window.hydrateDecisionLog === 'function') {
            await window.hydrateDecisionLog();
        }
        return entry;
    } catch (err: any) {
        log.error('Failed to log decision', err);
        showToast(err.message || 'Falha ao registrar decisão', 'error');
    }
}
/**
 * Open a wizard modal to log a new decision.
 * Uses asyncPrompt (gold standard) for a 3-step input flow.
 */
async function handleOpenDecisionLogModal() {
    const { DECISION_CATEGORIES } = await import('../../core/governance/decisionLog.js' as string);
    const categoriesLabel = t('governance.decision.categoriesHelp') || `Categoria (${DECISION_CATEGORIES.join(' | ')})`;
    const category = await asyncPrompt(categoriesLabel, 'technical', {
        placeholder: DECISION_CATEGORIES.join(', '),
        confirmLabel: t('next') || 'Próximo',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (!category) return;
    if (!DECISION_CATEGORIES.includes(category.trim())) {
        showToast(
            `${t('governance.decision.invalidCategory') || 'Categoria inválida'}: ${DECISION_CATEGORIES.join(', ')}`,
            'warning',
        );
        return;
    }
    const title = await asyncPrompt(t('governance.decision.enterTitle') || 'Título da decisão (resumo curto)', '', {
        placeholder:
            t('governance.decision.titlePlaceholder') || 'Ex: Usar kriging ordinário em vez de IDW para plumas BTEX',
        confirmLabel: t('next') || 'Próximo',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (!title || !title.trim()) return;
    const rationale = await asyncPrompt(
        t('governance.decision.enterRationale') || 'Justificativa técnica/legal (mínimo 20 caracteres)',
        '',
        {
            placeholder:
                t('governance.decision.rationalePlaceholder') ||
                'Ex: Kriging preserva anisotropia espacial e variograma empírico mostra…',
            confirmLabel: t('next') || 'Próximo',
            cancelLabel: t('cancel') || 'Cancelar',
        },
    );
    if (rationale === null) return;
    const alternativesConsidered =
        (await asyncPrompt(t('governance.decision.enterAlternatives') || 'Alternativas consideradas (opcional)', '', {
            placeholder:
                t('governance.decision.alternativesPlaceholder') ||
                'Ex: IDW (descartado por não preservar correlação), RBF (bom mas anisotrópico)',
            confirmLabel: t('submit') || 'Registrar',
            cancelLabel: t('cancel') || 'Cancelar',
        })) || '';
    // Resolve actor from session (fallback to 'anonymous')
    let actor = 'anonymous';
    try {
        const { currentSession } = await import('../auth/session.js' as string);
        actor = currentSession?.user?.email || 'anonymous';
    } catch (e: any) {
        console.debug('[governance] resolveActorDecisionLog:', e?.message || e);
        // session module unavailable - acceptable, fallback to anonymous
    }
    await handleLogDecision({
        actor,
        category: category.trim(),
        title: title.trim(),
        rationale: rationale.trim(),
        alternativesConsidered: alternativesConsidered.trim(),
    });
}
/**
 * Fetch decisions for dashboard display, with optional category filter.
 * @param {string} [category] - Filter by category
 */
async function handleGetDecisionLog(category: any) {
    try {
        const { getDecisions, getDecisionStats } = await import('../../core/governance/decisionLog.js' as string);
        const filters = category ? { category } : {};
        const [decisions, stats] = await Promise.all([getDecisions(filters), getDecisionStats()]);
        return { decisions, stats };
    } catch (err: any) {
        log.error('Failed to get decision log', err);
        return {
            decisions: [],
            stats: { total: 0, byCategory: {}, firstEntry: null, lastEntry: null },
        };
    }
}
/**
 * Refresh the decision log section in governance panel.
 */
async function handleRefreshDecisionLog() {
    if (typeof window !== 'undefined' && typeof window.hydrateDecisionLog === 'function') {
        await window.hydrateDecisionLog();
        showToast(t('governance.decision.refreshed') || 'Log de decisões atualizado', 'success');
    }
}
// ── G5 - ESG Export (GRI/ISSB) ──────────────────────────────────────────────
/**
 * Export the current model with ESG headers (GRI 303/304/306 + IFRS S1).
 * Writes a CSV file via Blob download.
 */
async function handleExportEsgCsv() {
    try {
        const { generateEsgCsv } = await import('../../core/governance/esgExport.js' as string);
        const { getAllElements } = await import('../../core/elements/manager.js' as string);
        const elements = getAllElements();
        if (!elements || elements.length === 0) {
            showToast(t('governance.esg.noElements') || 'Nenhum elemento no modelo', 'warning');
            return;
        }
        // Optional EIS score - best effort, works without it
        let eisScore: any = null;
        try {
            const { computeEIS } = await import('../../core/eis/eisCalculator.js' as string);
            const result = computeEIS({ elements });
            eisScore = result && typeof result.score === 'number' ? result.score : null;
        } catch (e: any) {
            console.debug('[governance] esgEisOptional:', e?.message || e);
            // EIS unavailable - continue without it
        }
        const csv = generateEsgCsv({ elements }, { eisScore });
        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ecbyts-esg-export-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(
            `${t('governance.esg.csvExported') || 'Export ESG CSV gerado'}: ${elements.length} elementos`,
            'success',
        );
    } catch (err: any) {
        log.error('ESG CSV export failed', err);
        showToast(err.message || 'Falha no export ESG', 'error');
    }
}
/**
 * Generate an ISSB-assisted DOCX template (preview as HTML in toast,
 * download as .docx if the report DOCX exporter is available, otherwise
 * fallback to .html).
 */
async function handleExportIssbTemplate() {
    try {
        const { buildIssbDocxTemplate, sectionsToHtml } = await import('../../core/governance/esgExport.js' as string);
        const { getAllElements } = await import('../../core/elements/manager.js' as string);
        const elements = getAllElements();
        // Gather metrics (best effort)
        const metrics: any = {};
        try {
            const { computeEIS } = await import('../../core/eis/eisCalculator.js' as string);
            const eis = computeEIS({ elements });
            if (eis && typeof eis.score === 'number') metrics.eisScore = eis.score;
        } catch (e: any) {
            console.debug('[governance] issbEisMetric:', e?.message || e);
            // no-op
        }
        try {
            const { getAllEntries } = await import('../../core/governance/auditTrail.js' as string);
            const entries = await getAllEntries();
            metrics.auditEntryCount = Array.isArray(entries) ? entries.length : 0;
        } catch (e: any) {
            console.debug('[governance] issbAuditMetric:', e?.message || e);
            // no-op
        }
        try {
            const { getDecisionStats } = await import('../../core/governance/decisionLog.js' as string);
            const stats = await getDecisionStats();
            metrics.decisionCount = stats && typeof stats.total === 'number' ? stats.total : 0;
        } catch (e: any) {
            console.debug('[governance] issbDecisionMetric:', e?.message || e);
            // no-op
        }
        const sections = buildIssbDocxTemplate({ elements, campaigns: [] }, metrics);
        const html = sectionsToHtml(sections);
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ISSB Template</title><style>body{font-family:sans-serif;max-width:800px;margin:2em auto;padding:1em}h2{border-bottom:1px solid #ccc;padding-bottom:4px}</style></head><body><h1>ISSB-Assisted Export</h1>${html}</body></html>`;
        const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ecbyts-issb-template-${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(
            `${t('governance.esg.templateGenerated') || 'Template ISSB gerado'}: ${sections.length} seções`,
            'success',
        );
    } catch (err: any) {
        log.error('ISSB template export failed', err);
        showToast(err.message || 'Falha na geração do template ISSB', 'error');
    }
}
// ── G8 - Stakeholder Share ──────────────────────────────────────────────────
/**
 * Open a wizard to create a new stakeholder share code.
 * Uses asyncPrompt (no native dialogs).
 */
async function handleCreateStakeholderShare() {
    try {
        const { createShare, buildShareUrl } = await import('../../core/governance/stakeholderShare.js' as string);
        const role = await asyncPrompt(
            t('governance.share.enterRole') || 'Papel do stakeholder (viewer | regulator | auditor)',
            'regulator',
            {
                placeholder: 'viewer, regulator, auditor',
                confirmLabel: t('next') || 'Próximo',
                cancelLabel: t('cancel') || 'Cancelar',
            },
        );
        if (!role) return;
        const normalizedRole = role.trim().toLowerCase();
        if (!['viewer', 'regulator', 'auditor'].includes(normalizedRole)) {
            showToast(
                t('governance.share.invalidRole') || 'Papel inválido. Use viewer, regulator ou auditor.',
                'warning',
            );
            return;
        }
        const label = await asyncPrompt(
            t('governance.share.enterLabel') || 'Label (descrição do destinatário, opcional)',
            '',
            {
                placeholder: t('governance.contactPlaceholder'),
                confirmLabel: t('next') || 'Próximo',
                cancelLabel: t('cancel') || 'Cancelar',
            },
        );
        const ttlStr = await asyncPrompt(t('governance.share.enterTtl') || 'Validade em dias', '30', {
            placeholder: '30',
            confirmLabel: t('submit') || 'Criar',
            cancelLabel: t('cancel') || 'Cancelar',
        });
        const ttlDays = parseInt(String(ttlStr || ''), 10);
        if (!Number.isFinite(ttlDays) || ttlDays < 1) {
            showToast(t('governance.share.invalidTtl') || 'Validade deve ser >= 1 dia', 'warning');
            return;
        }
        // Resolve createdBy from session
        let createdBy = 'anonymous';
        try {
            const { currentSession } = await import('../auth/session.js' as string);
            createdBy = currentSession?.user?.email || 'anonymous';
        } catch (e: any) {
            console.debug('[governance] resolveActorShare:', e?.message || e);
            // session unavailable
        }
        // Get current model id (best effort) or use a placeholder
        const modelId = (typeof window !== 'undefined' && window.currentModelId) || 'local-model';
        const record = await createShare({
            modelId,
            role: normalizedRole,
            createdBy,
            ttlDays,
            label: label || '',
        });
        const url = buildShareUrl(record.id);
        log.info('Share created: %s -> %s', record.id, url);
        showToast(`${t('governance.share.created') || 'Share criado'}: ${url}`, 'success', 8000);
        if (typeof window !== 'undefined' && typeof window.hydrateStakeholderShares === 'function') {
            await window.hydrateStakeholderShares();
        }
        return record;
    } catch (err: any) {
        log.error('Failed to create share', err);
        showToast(err.message || 'Falha ao criar share', 'error');
    }
}
/**
 * Revoke a stakeholder share by id.
 * @param {string} shareId
 */
async function handleRevokeStakeholderShare(shareId: any) {
    try {
        const { revokeShare } = await import('../../core/governance/stakeholderShare.js' as string);
        const record = await revokeShare(shareId);
        if (!record) {
            showToast(t('governance.share.notFound') || 'Share não encontrado', 'warning');
            return;
        }
        showToast(t('governance.share.revoked') || 'Share revogado', 'info');
        if (typeof window !== 'undefined' && typeof window.hydrateStakeholderShares === 'function') {
            await window.hydrateStakeholderShares();
        }
    } catch (err: any) {
        log.error('Failed to revoke share', err);
        showToast(err.message || 'Falha ao revogar share', 'error');
    }
}
/**
 * List all active shares for the current model.
 * @returns {Promise<any[]>}
 */
async function handleListStakeholderShares() {
    try {
        const { listSharesForModel } = await import('../../core/governance/stakeholderShare.js' as string);
        const modelId = (typeof window !== 'undefined' && window.currentModelId) || 'local-model';
        return await listSharesForModel(modelId);
    } catch (err: any) {
        log.error('Failed to list shares', err);
        return [];
    }
}
// ── G9 - Provenance Graph ───────────────────────────────────────────────────
/**
 * Build and return the provenance graph for the current model.
 * @returns {Promise<Object>} { nodes, edges }
 */
async function handleBuildProvenanceGraph() {
    try {
        const [{ buildGraph }, auditMod, decisionMod, elementsMod] = await Promise.all([
            import('../../core/governance/provenanceGraph.js' as string),
            import('../../core/governance/auditTrail.js' as string),
            import('../../core/governance/decisionLog.js' as string),
            import('../../core/elements/manager.js' as string),
        ]);
        let auditEntries: any[] = [];
        let decisions: any[] = [];
        let elements: any[] = [];
        try {
            auditEntries = (await auditMod.getAllEntries()) || [];
        } catch (e: any) {
            console.debug('[governance] provenanceAuditLoad:', e?.message || e);
            // empty log acceptable
        }
        try {
            decisions = (await decisionMod.getAllDecisions()) || [];
        } catch (e: any) {
            console.debug('[governance] provenanceDecisionsLoad:', e?.message || e);
            // empty log acceptable
        }
        try {
            elements = elementsMod.getAllElements() || [];
        } catch (e: any) {
            console.debug('[governance] provenanceElementsLoad:', e?.message || e);
            // empty model acceptable
        }
        const graph = buildGraph({ auditEntries, decisions, elements });
        return graph;
    } catch (err: any) {
        log.error('Failed to build provenance graph', err);
        return { nodes: [], edges: [] };
    }
}
async function handleRenderProvenanceGraph() {
    try {
        const [graph, { renderGraphSvg }] = await Promise.all([
            handleBuildProvenanceGraph(),
            import('../../core/governance/provenanceGraph.js' as string),
        ]);
        const container = document.getElementById('provenance-graph-container');
        if (!container) return;
        container.innerHTML = renderGraphSvg(graph, { width: 600, height: 320 });
        const countEl = document.getElementById('provenance-graph-count');
        if (countEl) countEl.textContent = `${graph.nodes.length}n / ${graph.edges.length}e`;
    } catch (err: any) {
        log.error('Failed to render provenance graph', err);
    }
}
// ── G10 - Retention Policy ──────────────────────────────────────────────────
/**
 * Update a retention policy via asyncPrompt wizard.
 * @param {string} dataType
 */
async function handleSetRetentionPolicy(dataType: any) {
    try {
        const { setPolicy, DATA_TYPES } = await import('../../core/governance/retentionPolicy.js' as string);
        if (!DATA_TYPES.includes(dataType)) {
            showToast(
                `${t('governance.retention.invalidType') || 'Tipo inválido'}: ${DATA_TYPES.join(', ')}`,
                'warning',
            );
            return;
        }
        const daysStr = await asyncPrompt(
            `${t('governance.retention.enterDays') || 'Dias de retenção'} (${dataType})`,
            '90',
            {
                placeholder: t('governance.daysPlaceholder'),
                confirmLabel: t('next') || 'Próximo',
                cancelLabel: t('cancel') || 'Cancelar',
            },
        );
        if (daysStr === null) return;
        const retentionDays = parseInt(daysStr, 10);
        if (!Number.isFinite(retentionDays) || (retentionDays !== -1 && retentionDays < 1)) {
            showToast(t('governance.retention.invalidDays') || 'Dias deve ser -1 (indefinido) ou >= 1', 'warning');
            return;
        }
        const rationale = await asyncPrompt(t('governance.retention.enterRationale') || 'Justificativa', '', {
            placeholder: t('governance.retention.rationalePlaceholder') || 'Ex: LGPD Art. 16',
            confirmLabel: t('submit') || 'Salvar',
            cancelLabel: t('cancel') || 'Cancelar',
        });
        let updatedBy = 'anonymous';
        try {
            const { currentSession } = await import('../auth/session.js' as string);
            updatedBy = currentSession?.user?.email || 'anonymous';
        } catch (e: any) {
            console.debug('[governance] resolveActorRetention:', e?.message || e);
            // noop
        }
        const entry = await setPolicy({
            dataType,
            retentionDays,
            rationale: rationale || '',
            updatedBy,
        });
        showToast(
            `${t('governance.retention.updated') || 'Política atualizada'}: ${entry.dataType} = ${entry.retentionDays === -1 ? '∞' : entry.retentionDays + 'd'}`,
            'success',
        );
        if (typeof window !== 'undefined' && typeof window.hydrateRetentionPolicies === 'function') {
            await window.hydrateRetentionPolicies();
        }
    } catch (err: any) {
        log.error('Failed to set retention policy', err);
        showToast(err.message || 'Falha ao atualizar política', 'error');
    }
}
/**
 * Run retention cleanup (dry-run by default). Asks for confirmation before
 * applying real deletions.
 * @param {boolean} [dryRun=true]
 */
async function handleRunRetentionCleanup(dryRun: any = true) {
    try {
        const { runRetentionCleanup } = await import('../../core/governance/retentionPolicy.js' as string);
        // Loaders: IDB-backed modules that expose reads
        const loaders = {
            audit_trail: async () => {
                try {
                    const { getAllEntries } = await import('../../core/governance/auditTrail.js' as string);
                    return (await getAllEntries()) || [];
                } catch (e: any) {
                    console.debug('[governance] retentionLoadAuditTrail:', e?.message || e);
                    return [];
                }
            },
            decision_log: async () => {
                try {
                    const { getAllDecisions } = await import('../../core/governance/decisionLog.js' as string);
                    return (await getAllDecisions()) || [];
                } catch (e: any) {
                    console.debug('[governance] retentionLoadDecisionLog:', e?.message || e);
                    return [];
                }
            },
            stakeholder_shares: async () => {
                try {
                    const { listSharesForModel } = await import('../../core/governance/stakeholderShare.js' as string);
                    const modelId = (typeof window !== 'undefined' && window.currentModelId) || 'local-model';
                    return await listSharesForModel(modelId);
                } catch (e: any) {
                    console.debug('[governance] retentionLoadShares:', e?.message || e);
                    return [];
                }
            },
            error_reports: async () => [],
            model_snapshots: async () => [],
            obligation_archive: async () => [],
        };
        const result = await runRetentionCleanup({ loaders, dryRun });
        const summary = Object.entries(result)
            .map(([type, r]: [string, any]) => `${type}: ${r.toDelete} del, ${r.toKeep} keep`)
            .join(' | ');
        showToast(
            `${dryRun ? t('governance.retention.dryRun') || 'Dry run' : t('governance.retention.applied') || 'Aplicado'}: ${summary}`,
            dryRun ? 'info' : 'success',
            { duration: 8000 },
        );
        return result;
    } catch (err: any) {
        log.error('Retention cleanup failed', err);
        showToast(err.message || 'Falha na limpeza de retenção', 'error');
    }
}
async function handleGetRetentionPolicies() {
    try {
        const { getAllPolicies } = await import('../../core/governance/retentionPolicy.js' as string);
        return await getAllPolicies();
    } catch (err: any) {
        log.error('Failed to get retention policies', err);
        return [];
    }
}
// ----------------------------------------------------------------
// UNCERTAINTY HUB (UI + ECBT/IDB persistence)
// ----------------------------------------------------------------
async function handleGetUncertaintyHubState() {
    if (_uncertaintyHubCache) return _uncertaintyHubCache;
    _uncertaintyHubCache = await loadUncertaintyHubState();
    return _uncertaintyHubCache;
}
async function handleSaveUncertaintyHubState(nextState: any = null) {
    const base = await handleGetUncertaintyHubState();
    const merged = nextState && typeof nextState === 'object' ? { ...base, ...nextState } : base;
    await saveUncertaintyHubState(merged);
    _uncertaintyHubCache = merged;
    return merged;
}
async function handleRunUncertaintyHubEvaluation(payload: any = {}) {
    const state = await handleGetUncertaintyHubState();
    const merged = {
        ...state,
        ...payload,
    };
    const policyCandidates = [merged.policyDraft].filter(Boolean);
    // UNC-001 P2: emite telemetria + detecta drift SQL vs runtime
    const resolved = resolveAndTrack(policyCandidates, merged.policyDraft || {});
    const q2q = convertQualitativeUncertainty(merged.q2qInput || {}, {
        runType: merged.q2qInput?.runType || 'exploratory',
    });
    const q2qAny: any = q2q;
    const decision = evaluateUncertaintyDecisionRules(
        Array.isArray(merged.rules) ? merged.rules : [],
        { exceedanceProb: Number(merged.decisionInput?.exceedanceProb) },
        { runType: merged.decisionInput?.runType || 'exploratory' },
    );
    const candidatesRaw = String(merged.optimizationInput?.candidatesRaw || '')
        .split('\n')
        .map((line: any) => line.trim())
        .filter(Boolean)
        .map((line: any) => {
            const [id, infoGain, normalizedCost, residualRisk, cost] = line.split(',');
            return {
                id: String(id || '').trim(),
                infoGain: Number(infoGain),
                normalizedCost: Number(normalizedCost),
                residualRisk: Number(residualRisk),
                cost: Number(cost),
            };
        })
        .filter((c: any) => c.id);
    const optimization = optimizeMonitoringPlan({
        seed: Number(merged.optimizationInput?.seed),
        constraints: { budget: Number(merged.optimizationInput?.budget) },
        candidates: candidatesRaw,
    });
    const prev = state?.lastResults || null;
    const result = {
        policy: resolved,
        q2q,
        decision,
        optimization,
        propagation: {
            policy_source: resolved?.source || null,
            q2q_label: q2qAny?.label || q2qAny?.mapped ? merged.q2qInput?.label || null : null,
            q2q_u_rel: q2qAny?.mapped?.relDefault ?? null,
            exceedance_input: Number(merged.decisionInput?.exceedanceProb),
            rule_action: decision?.action || 'allow',
        },
        sensitivity: _computeSensitivity(optimization),
        diff: _computeResultDiff(prev, {
            policy: resolved,
            decision,
            optimization,
        }),
        executedAt: new Date().toISOString(),
    };
    // 2026-04-12: preserve compact history for sparkline trend in AN panel.
    // Keep only lightweight snapshot (action + exceedance + selectedCount) to
    // avoid bloating IDB with full optimization payloads.
    const prevHistory = Array.isArray(state?.resultsHistory) ? state.resultsHistory : [];
    const historyEntry = {
        at: result.executedAt,
        action: result?.decision?.action || result?.propagation?.rule_action || null,
        exceedance: Number(merged.decisionInput?.exceedanceProb) || 0,
        selectedCount: Array.isArray(result?.optimization?.selected) ? result.optimization.selected.length : 0,
        uRel: result?.propagation?.q2q_u_rel ?? null,
    };
    const resultsHistory = [...prevHistory, historyEntry].slice(-30);
    await handleSaveUncertaintyHubState({ ...merged, lastResults: result, resultsHistory });
    return result;
}
function _computeSensitivity(optimization: any) {
    const selected = Array.isArray(optimization?.selected) ? optimization.selected : [];
    const ranked = selected
        .map((c: any) => {
            const info = Number(c?.infoGain || 0);
            const risk = Number(c?.residualRisk || 0);
            const cost = Number(c?.normalizedCost || 0);
            return {
                id: c?.id || 'unknown',
                score: Number((info - risk - cost).toFixed(4)),
            };
        })
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);
    return { topDrivers: ranked };
}
function _computeResultDiff(prev: any, current: any) {
    const prevAction = prev?.decision?.action || null;
    const currAction = current?.decision?.action || null;
    const prevSelected = Array.isArray(prev?.optimization?.selected) ? prev.optimization.selected.length : 0;
    const currSelected = Array.isArray(current?.optimization?.selected) ? current.optimization.selected.length : 0;
    return {
        decisionActionChanged: prevAction !== currAction,
        decision: { before: prevAction, after: currAction },
        selectedCountDelta: currSelected - prevSelected,
    };
}
async function handleSyncUncertaintyHubEcbtKey() {
    const state = await handleGetUncertaintyHubState();
    const ecbtKey = await generateKeySimple();
    const online = await syncUncertaintyEcbtKeyOnline(ecbtKey);
    const savedAt = new Date().toISOString();
    await handleSaveUncertaintyHubState({
        ...state,
        ecbt: {
            key: ecbtKey,
            savedAt,
            online,
        },
    });
    showToast(
        online?.ok
            ? 'Uncertainty Hub sincronizado (ECBT key + IDB).'
            : `ECBT key salvo localmente (IDB). Online: ${online?.reason || 'indisponivel'}`,
        online?.ok ? 'success' : 'warning',
    );
    return { ok: true, online };
}
async function handleExportUncertaintyEvidence() {
    const state = await handleGetUncertaintyHubState();
    const evidence = buildUncertaintyEvidence(state, {
        method: 'GUM+TypeB',
        nd_method: state?.policyDraft?.nd_method || 'auto',
        policy_version: '1.0.0',
    });
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uncertainty-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Uncertainty evidence exportado.', 'success');
    return evidence;
}
async function handleImportUncertaintyEvidence(rawText: any) {
    let parsed;
    try {
        parsed = JSON.parse(String(rawText || ''));
    } catch (e: any) {
        console.debug('[governance] parseEvidenceJson:', e?.message || e);
        return { ok: false, reason: 'invalid_json' };
    }
    const valid = validateUncertaintyEvidence(parsed);
    if (!valid.ok) return valid;
    const state = await handleGetUncertaintyHubState();
    await handleSaveUncertaintyHubState({
        ...state,
        lastImportedEvidence: parsed,
    });
    showToast('Uncertainty evidence importado.', 'success');
    return { ok: true, evidence: parsed };
}
async function handleSaveUncertaintyPolicyRevision(meta: any = {}) {
    if (!_canManageUncertaintyPolicies()) {
        showToast('Sem permissão para salvar revisões de policy.', 'warning');
        return { ok: false, reason: 'forbidden' };
    }
    const state = await handleGetUncertaintyHubState();
    const history = Array.isArray(state?.policyHistory) ? [...state.policyHistory] : [];
    const revision = {
        revisionId: `pol-rev-${Date.now()}`,
        savedAt: new Date().toISOString(),
        savedBy: meta?.savedBy || 'local-user',
        note: meta?.note || '',
        policyDraft: { ...(state?.policyDraft || {}) },
    };
    history.unshift(revision);
    await handleSaveUncertaintyHubState({
        ...state,
        policyHistory: history.slice(0, 50),
    });
    return { ok: true, revision };
}
async function handleListUncertaintyPolicyHistory() {
    const state = await handleGetUncertaintyHubState();
    return Array.isArray(state?.policyHistory) ? state.policyHistory : [];
}
async function handleRollbackUncertaintyPolicyRevision(revisionId: any) {
    if (!_canManageUncertaintyPolicies()) {
        showToast('Sem permissão para rollback de policy.', 'warning');
        return { ok: false, reason: 'forbidden' };
    }
    const state = await handleGetUncertaintyHubState();
    const history = Array.isArray(state?.policyHistory) ? state.policyHistory : [];
    const found = history.find((r: any) => r.revisionId === revisionId);
    if (!found) return { ok: false, reason: 'not_found' };
    await handleSaveUncertaintyHubState({
        ...state,
        policyDraft: { ...(found.policyDraft || {}) },
        policyRollback: {
            revisionId,
            rolledBackAt: new Date().toISOString(),
        },
    });
    return { ok: true, revision: found };
}
function handleCanManageUncertaintyPolicies() {
    return _canManageUncertaintyPolicies();
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const governanceHandlers = {
    handleAddContract,
    handleEditContract,
    handleRemoveContract,
    handleSaveContract,
    handleAddContractParty,
    handleRemoveContractParty,
    handleUpdateContractParty,
    handleAddDisbursement,
    handleRemoveDisbursement,
    handleUpdateDisbursementField,
    handleLinkLibraryToDisbursement,
    handleLinkElementToContract,
    handleUnlinkElementFromContract,
    handleAddWbsItem,
    handleEditWbsItem,
    handleRemoveWbsItem,
    handleApplyWbsTemplate,
    handleCalculateEVA,
    handleSaveSnapshot,
    handleOpenWbsDataModal,
    handleCloseWbsDataModal,
    handleSaveWbsDataModal,
    handleFileInsuranceClaim: handleFileInsuranceClaimAction,
    handleContractFilter,
    handleOpenGovernanceDashboard,
    handleGetAuditLog,
    handleLockObservation,
    // G4 - Regulatory Calendar
    handleAddRegulatoryObligation,
    handleCompleteRegulatoryObligation,
    handleCompleteRegulatoryObligationAndRefresh,
    handleRemoveRegulatoryObligation,
    handleRemoveRegulatoryObligationAndRefresh,
    handleGetRegulatoryCalendar,
    handleOpenRegulatoryObligationModal,
    handleRefreshRegulatoryCalendar,
    // G6 - Decision Log
    handleLogDecision,
    handleOpenDecisionLogModal,
    handleGetDecisionLog,
    handleRefreshDecisionLog,
    // G5 - ESG Export (GRI/ISSB)
    handleExportEsgCsv,
    handleExportIssbTemplate,
    // G8 - Stakeholder Share
    handleCreateStakeholderShare,
    handleRevokeStakeholderShare,
    handleListStakeholderShares,
    // G9 - Provenance Graph
    handleBuildProvenanceGraph,
    handleRenderProvenanceGraph,
    // G10 - Retention Policy
    handleSetRetentionPolicy,
    handleRunRetentionCleanup,
    handleGetRetentionPolicies,
    handleGetUncertaintyHubState,
    handleSaveUncertaintyHubState,
    handleRunUncertaintyHubEvaluation,
    handleSyncUncertaintyHubEcbtKey,
    handleExportUncertaintyEvidence,
    handleImportUncertaintyEvidence,
    handleSaveUncertaintyPolicyRevision,
    handleListUncertaintyPolicyHistory,
    handleRollbackUncertaintyPolicyRevision,
    handleCanManageUncertaintyPolicies,
};
