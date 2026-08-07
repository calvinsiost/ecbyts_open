// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   GUIDED TASK PLAN - plano de tarefas guiado derivado do protocolo
   (PIPELINE-UNIFIED-PROTOCOL #9).

   "UX expoe estrutura tecnica: GuidedTaskPlan derivado do protocolo;
   campos avancados so aparecem quando um achado, perfil ou modo
   auditoria exigir." (SPEC_PIPELINE_UNIFIED_PROTOCOL.md, blind spot
   "UX expoe estrutura tecnica").

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   O renderer de HTML devolve string escapada (XSS-safe) para o
   Workbench injetar via innerHTML de template estatico.
   ================================================================ */

import type {
    PipelineProtocolDocument,
    PipelineProtocolIssue,
} from '../pipelines/pipelineProtocol.js';

export type GuidedTaskStepStatus = 'current' | 'pending' | 'done';

export interface GuidedTaskStep {
    id: string;
    label: string;
    status: GuidedTaskStepStatus;
    ownerItemId: string;
}

export interface GuidedSafeAutoFix {
    id: string;
    label: string;
    issueCode: string;
    ownerItemId: string;
}

export type GuidedAdvancedFieldReason = 'finding' | 'profile' | 'audit';

export interface GuidedAdvancedField {
    fieldId: string;
    label: string;
    reason: GuidedAdvancedFieldReason;
    ownerItemId: string;
}

export interface GuidedRequiredDecision {
    question: string;
    options: string[];
    ownerItemId: string;
}

export interface GuidedTaskPlan {
    currentStep: string;
    nextAction: string;
    requiredUserDecision: GuidedRequiredDecision | null;
    safeAutoFixes: GuidedSafeAutoFix[];
    advancedFields: GuidedAdvancedField[];
    steps: GuidedTaskStep[];
}

export interface GuidedTaskPlanOptions {
    auditMode?: boolean;
}

const GENERIC_PROFILE_ID = 'generic';
const READY_STEP_ID = 'step-ready';

/* Correcoes mecanicas que NAO alteram semantica do processo (carimbo de
   versao/migracao). Qualquer codigo fora desta lista exige decisao humana
   e nunca entra em safeAutoFixes. */
const SAFE_AUTO_FIX: Readonly<Record<string, string>> = Object.freeze({
    'version.ledger.required': 'Carimbar versao do protocolo e do pack automaticamente.',
    'version.migration.required': 'Registrar o identificador de migracao do pack.',
});

interface AdvancedFieldCatalogEntry {
    fieldId: string;
    label: string;
    scopes: ReadonlyArray<string>;
    codePrefixes: ReadonlyArray<string>;
    profileDriven: boolean;
}

const ADVANCED_FIELD_CATALOG: ReadonlyArray<AdvancedFieldCatalogEntry> = Object.freeze([
    {
        fieldId: 'connector.conditionRef',
        label: 'Condicao do conector (conditionRef)',
        scopes: ['connector'],
        codePrefixes: ['connector.'],
        profileDriven: false,
    },
    {
        fieldId: 'connector.failureBehavior',
        label: 'Rota de falha do conector (failureBehavior)',
        scopes: ['connector'],
        codePrefixes: ['connector.'],
        profileDriven: false,
    },
    {
        fieldId: 'gate.approvalRule',
        label: 'Regra de aprovacao/retrabalho da decisao',
        scopes: ['gate'],
        codePrefixes: ['decision.', 'gate.'],
        profileDriven: false,
    },
    {
        fieldId: 'data.technicalParameters',
        label: 'Parametros tecnicos do dominio (unidade, faixa-alvo, fonte)',
        scopes: ['data', 'activity'],
        codePrefixes: ['data.', 'activity.'],
        profileDriven: true,
    },
    {
        fieldId: 'provenance.evidenceRefs',
        label: 'Rastreabilidade por item (origem, evidencias, motivo da mudanca)',
        scopes: ['data', 'activity', 'connector', 'gate'],
        codePrefixes: ['data.evidence', 'activity.evidence'],
        profileDriven: false,
    },
    {
        fieldId: 'ledger.migrationId',
        label: 'Ledger de versoes (migrationId, changeSet, compatibilidade)',
        scopes: ['ledger'],
        codePrefixes: ['version.'],
        profileDriven: false,
    },
]);

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _sortedIssues(issues: PipelineProtocolIssue[] | null | undefined): PipelineProtocolIssue[] {
    if (!Array.isArray(issues)) return [];
    const weight = (issue: PipelineProtocolIssue) => (issue.severity === 'error' ? 0 : 1);
    return [...issues].sort((a, b) => weight(a) - weight(b));
}

function _stepId(issue: PipelineProtocolIssue, index: number): string {
    const code = _text(issue.code) || 'issue';
    const owner = _text(issue.ownerItemId) || 'pipeline-protocol';
    return `step-${index + 1}-${code}-${owner}`;
}

function _buildSteps(issues: PipelineProtocolIssue[]): GuidedTaskStep[] {
    if (issues.length === 0) {
        return [{
            id: READY_STEP_ID,
            label: 'Processo pronto para publicar.',
            status: 'current',
            ownerItemId: 'pipeline-protocol',
        }];
    }
    return issues.map((issue, index) => ({
        id: _stepId(issue, index),
        label: _text(issue.userMessage) || _text(issue.message) || 'Pendencia sem descricao.',
        status: index === 0 ? 'current' : 'pending',
        ownerItemId: _text(issue.ownerItemId) || 'pipeline-protocol',
    }));
}

function _buildNextAction(issues: PipelineProtocolIssue[]): string {
    if (issues.length === 0) {
        return 'Nenhuma pendencia: o processo pode ser publicado.';
    }
    const first = issues[0];
    if (!first) {
        return 'Nenhuma pendencia: o processo pode ser publicado.';
    }
    const message = _text(first.userMessage) || _text(first.message);
    const fix = _text(first.suggestedFix);
    return fix ? `${message} ${fix}` : message;
}

function _buildRequiredDecision(
    doc: PipelineProtocolDocument | null | undefined,
    issues: PipelineProtocolIssue[],
): GuidedRequiredDecision | null {
    const profileId = _text(doc?.domainProfileId);
    if (!profileId || profileId === GENERIC_PROFILE_ID) {
        return {
            question: 'Escolha o perfil de dominio antes de publicar (GAC/DD38, beneficiamento mineral ou generico confirmado).',
            options: ['gac-dd38', 'mine-beneficiation', 'generic-confirmado'],
            ownerItemId: 'pipeline-protocol',
        };
    }
    const gateIssue = issues.find((issue) => issue.scope === 'gate' && issue.severity === 'error');
    if (gateIssue) {
        return {
            question: _text(gateIssue.userMessage) || 'Decisao condicional sem criterio por rota.',
            options: ['definir-rota', 'marcar-nao-aplicavel'],
            ownerItemId: _text(gateIssue.ownerItemId) || 'pipeline-protocol',
        };
    }
    return null;
}

function _buildSafeAutoFixes(issues: PipelineProtocolIssue[]): GuidedSafeAutoFix[] {
    const fixes: GuidedSafeAutoFix[] = [];
    const seen = new Set<string>();
    for (const issue of issues) {
        const code = _text(issue.code);
        const label = SAFE_AUTO_FIX[code];
        if (!label || seen.has(code)) continue;
        seen.add(code);
        fixes.push({
            id: `autofix-${code}`,
            label,
            issueCode: code,
            ownerItemId: _text(issue.ownerItemId) || 'pipeline-protocol',
        });
    }
    return fixes;
}

function _issueMatchesField(issue: PipelineProtocolIssue, entry: AdvancedFieldCatalogEntry): boolean {
    const code = _text(issue.code);
    if (entry.codePrefixes.some((prefix) => code.startsWith(prefix))) return true;
    return entry.scopes.includes(_text(issue.scope));
}

function _buildAdvancedFields(
    doc: PipelineProtocolDocument | null | undefined,
    issues: PipelineProtocolIssue[],
    options: GuidedTaskPlanOptions,
): GuidedAdvancedField[] {
    const profileId = _text(doc?.domainProfileId);
    const profileDemands = Boolean(profileId) && profileId !== GENERIC_PROFILE_ID;
    const auditMode = options.auditMode === true;
    const fields: GuidedAdvancedField[] = [];

    for (const entry of ADVANCED_FIELD_CATALOG) {
        const finding = issues.find((issue) => _issueMatchesField(issue, entry));
        if (finding) {
            fields.push({
                fieldId: entry.fieldId,
                label: entry.label,
                reason: 'finding',
                ownerItemId: _text(finding.ownerItemId) || 'pipeline-protocol',
            });
            continue;
        }
        if (profileDemands && entry.profileDriven) {
            fields.push({
                fieldId: entry.fieldId,
                label: entry.label,
                reason: 'profile',
                ownerItemId: profileId,
            });
            continue;
        }
        if (auditMode) {
            fields.push({
                fieldId: entry.fieldId,
                label: entry.label,
                reason: 'audit',
                ownerItemId: 'pipeline-protocol',
            });
        }
    }
    return fields;
}

/**
 * Derive a guided task plan from the protocol document and its validation
 * issues. Errors come before warnings; the first open issue becomes the
 * current step. Advanced fields stay hidden unless a finding, a non-generic
 * domain profile, or audit mode demands them.
 *
 * @param {PipelineProtocolDocument | null} doc protocol document (optional)
 * @param {PipelineProtocolIssue[]} issues validation issues from validatePipelineProtocol
 * @param {GuidedTaskPlanOptions} [options] auditMode forces all advanced fields visible
 * @returns {GuidedTaskPlan} guided plan for the UX layer
 */
export function deriveGuidedTaskPlan(
    doc: PipelineProtocolDocument | null | undefined,
    issues: PipelineProtocolIssue[] | null | undefined,
    options: GuidedTaskPlanOptions = {},
): GuidedTaskPlan {
    const sorted = _sortedIssues(issues);
    const steps = _buildSteps(sorted);
    return {
        currentStep: steps[0]?.id ?? READY_STEP_ID,
        nextAction: _buildNextAction(sorted),
        requiredUserDecision: _buildRequiredDecision(doc, sorted),
        safeAutoFixes: _buildSafeAutoFixes(sorted),
        advancedFields: _buildAdvancedFields(doc, sorted, options),
        steps,
    };
}

function _esc(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const STEP_STATUS_LABEL: Record<GuidedTaskStepStatus, string> = {
    current: 'passo atual',
    pending: 'pendente',
    done: 'feito',
};

/**
 * Render the guided plan as an escaped HTML section for the Pipeline Pack
 * Workbench. The advanced-fields <details> block only exists in the output
 * when the plan carries advanced fields (finding, profile or audit mode) —
   hidden by default, per the protocol rule.
 *
 * @param {GuidedTaskPlan} plan plan derived by deriveGuidedTaskPlan
 * @returns {string} HTML section (all dynamic text escaped)
 */
export function renderGuidedTaskPlanHtml(plan: GuidedTaskPlan): string {
    const safePlan = plan || ({} as GuidedTaskPlan);
    const steps = Array.isArray(safePlan.steps) ? safePlan.steps : [];
    const stepRows = steps.map((step) => `
            <li data-pipeline-guided-step="${_esc(step.id)}"
                data-pipeline-guided-step-status="${_esc(step.status)}"
                data-pipeline-guided-owner="${_esc(step.ownerItemId)}">
              <span>${_esc(step.label)}</span>
              <small>${_esc(STEP_STATUS_LABEL[step.status] || 'pendente')}</small>
            </li>`).join('');

    const decision = safePlan.requiredUserDecision;
    const decisionBlock = decision
        ? `<div class="pipeline-guided-plan-decision" data-pipeline-guided-decision="${_esc(decision.ownerItemId)}">
              <span>${_esc(decision.question)}</span>
              <small>Opcoes: ${_esc(decision.options.join(' | '))}</small>
            </div>`
        : '';

    const autoFixes = Array.isArray(safePlan.safeAutoFixes) ? safePlan.safeAutoFixes : [];
    const autoFixBlock = autoFixes.length
        ? `<ul class="pipeline-guided-plan-autofixes">${autoFixes.map((fix) => `
            <li data-pipeline-guided-autofix="${_esc(fix.issueCode)}">${_esc(fix.label)}</li>`).join('')}
          </ul>`
        : '';

    const advanced = Array.isArray(safePlan.advancedFields) ? safePlan.advancedFields : [];
    const advancedBlock = advanced.length
        ? `<details class="pipeline-guided-plan-advanced" data-pipeline-guided-advanced="true">
            <summary>Campos avancados (${_esc(advanced.length)})</summary>
            <ul>${advanced.map((field) => `
              <li data-pipeline-guided-advanced-field="${_esc(field.fieldId)}"
                  data-pipeline-guided-advanced-reason="${_esc(field.reason)}">${_esc(field.label)}</li>`).join('')}
            </ul>
          </details>`
        : '';

    return `<section class="pipeline-guided-plan"
             data-pipeline-guided-plan="true"
             data-pipeline-guided-current-step="${_esc(safePlan.currentStep || '')}">
          <h4>Plano guiado</h4>
          <p class="pipeline-guided-plan-next" data-pipeline-guided-next-action="true">${_esc(safePlan.nextAction || '')}</p>
          <ul class="pipeline-guided-plan-steps">${stepRows}
          </ul>
          ${decisionBlock}
          ${autoFixBlock}
          ${advancedBlock}
        </section>`;
}
