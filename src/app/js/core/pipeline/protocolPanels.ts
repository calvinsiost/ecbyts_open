// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PROTOCOL PANELS - paineis de item, conector e decisao + assistente
   de dominio do protocolo unificado (PIPELINE-UNIFIED-PROTOCOL #12).

   Superficies de UI da SPEC_PIPELINE_UNIFIED_PROTOCOL.md:
   - Painel do item selecionado: fase, parte interessada, natureza de
     dados, origem, evidencias, parametros tecnicos e pendencias.
   - Painel de conector: tipo de fluxo, dado transportado, condicao,
     obrigatoriedade, rota de falha e pontos visuais preservados.
   - Painel de decisao: pergunta, criterios, rotas, entradas exigidas,
     aprovacao/reprovacao, nao aplicavel e retorno para retrabalho.
   - Assistente de dominio: escolher GAC/DD38, beneficiamento mineral
     ou perfil generico; depois sugere fases, raias, dados e checks.

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   Os renderers devolvem string escapada (XSS-safe) para o Workbench
   injetar via innerHTML de template estatico.
   ================================================================ */

import type {
    PipelineProtocolDocument,
    PipelineProtocolIssue,
} from '../pipelines/pipelineProtocol.js';
import {
    PROCESS_DOMAIN_PROFILES,
    getDomainProfile,
    type ProcessDomainProfile,
} from './processDomainProfile.js';

export interface ProtocolPanelTechnicalParameter {
    label: string;
    statusLabel: string;
}

export interface ProtocolItemPanel {
    found: boolean;
    elementId: string;
    kind: string;
    kindLabel: string;
    label: string;
    phaseLabel: string;
    stakeholderLabel: string;
    responsibleLabel: string;
    dataNatureLabel: string;
    originLabel: string;
    version: string;
    evidenceRefs: string[];
    technicalParameters: ProtocolPanelTechnicalParameter[];
    pending: string[];
}

export interface ProtocolConnectorPanel {
    found: boolean;
    connectorId: string;
    label: string;
    kindLabel: string;
    directionLabel: string;
    sourceLabel: string;
    targetLabel: string;
    requiredLabel: string;
    conditionLabel: string;
    dataLabel: string;
    failureBehaviorLabel: string;
    pointsLabel: string;
    evidenceRefs: string[];
    pending: string[];
}

export interface ProtocolDecisionRouteRow {
    routeId: string;
    label: string;
    routeKind: string;
    routeKindLabel: string;
    targetLabel: string;
    criteriaLabel: string;
}

export interface ProtocolDecisionPanel {
    found: boolean;
    gateId: string;
    question: string;
    statusLabel: string;
    routes: ProtocolDecisionRouteRow[];
    requiredInputs: string[];
    approvalRouteLabel: string;
    reworkRouteLabel: string;
    notApplicableRouteLabel: string;
    fallbackLabel: string;
    pending: string[];
}

export interface DomainAssistantOption {
    domainId: string;
    label: string;
    selected: boolean;
    regulations: string[];
    requiredFieldLabels: string[];
    validationRules: string[];
}

export interface DomainAssistantView {
    currentDomainId: string;
    currentLabel: string;
    confirmed: boolean;
    confirmationNote: string;
    options: DomainAssistantOption[];
}

export interface ProtocolItemPanelOptions {
    issues?: PipelineProtocolIssue[] | null;
    technicalParameters?: ProtocolPanelTechnicalParameter[] | null;
}

export interface ProtocolConnectorPanelOptions {
    issues?: PipelineProtocolIssue[] | null;
}

export interface ProtocolDecisionPanelOptions {
    issues?: PipelineProtocolIssue[] | null;
}

const GENERIC_DOMAIN_ID = 'generic';

const ELEMENT_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
    activity: 'Atividade',
    decision: 'Decisao',
    data: 'Dado',
    start: 'Inicio',
    end: 'Fim',
    unknown: 'Item do processo',
});

const CONNECTOR_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
    'control-flow': 'Fluxo de controle',
    'data-flow': 'Fluxo de dados',
    'data-association': 'Associacao de dados',
    reference: 'Referencia auxiliar',
    message: 'Troca de mensagem',
});

const CONNECTOR_DIRECTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
    forward: 'Avanco no processo',
    backward: 'Retorno no processo',
    undirected: 'Sem direcao',
});

const FAILURE_BEHAVIOR_LABELS: Readonly<Record<string, string>> = Object.freeze({
    block: 'Bloqueia o fluxo ate resolver',
    warn: 'Avisa e permite seguir',
    rework: 'Retorna para retrabalho',
    skip: 'Pula a etapa',
    'human-decision': 'Espera decisao humana',
});

const ROUTE_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
    approval: 'Aprovacao',
    rework: 'Retrabalho',
    'not-applicable': 'Nao aplicavel',
    'manual-review': 'Revisao humana',
    neutral: 'Neutra',
});

const GATE_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
    ready: 'Pronta',
    'needs-inputs': 'Faltam criterios',
    'needs-branches': 'Faltam caminhos',
    unmapped: 'Sem modulo equivalente',
});

const DOMAIN_OPTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
    'gac-dd38': 'GAC/DD38 - areas contaminadas',
    'mineral-processing': 'Beneficiamento mineral',
    generic: 'Processo generico',
});

const REQUIRED_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
    phase: 'Fases do processo',
    stakeholder: 'Partes interessadas (raias)',
    'data-nature': 'Natureza dos dados',
    'technical-responsible': 'Responsavel tecnico',
    evidence: 'Evidencias rastreaveis',
    'technical-classification': 'Classificacao tecnica',
    'ore-type': 'Tipo de minerio',
    'granulometry-p80': 'Granulometria/P80 alvo',
    recovery: 'Recuperacao metalurgica',
    'mass-balance': 'Balanco de massa',
    'tailings-route': 'Rota de rejeitos',
    'water-energy': 'Agua e energia',
});

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

/* Contrato do Workbench: jargao tecnico de modelagem ("Gate") nunca aparece
   em texto visivel — a UI fala "decisao condicional" (mesma regra que barra
   "foreground" nos textos da auditoria visual). As regras dos perfis de
   dominio vem do nucleo com o termo BPMN; aqui traduzimos para a UI. */
function _friendlyRule(value: unknown): string {
    return _text(value).replace(/\b[Gg]ates?\b/g, (match) => {
        const plural = match.toLowerCase().endsWith('s');
        const base = plural ? 'decisoes condicionais' : 'decisao condicional';
        return match[0] === 'G' ? base.charAt(0).toUpperCase() + base.slice(1) : base;
    });
}

function _asArray<T>(value: T[] | null | undefined): T[] {
    return Array.isArray(value) ? value : [];
}

function _labelFor(map: Readonly<Record<string, string>>, key: unknown, fallback: string): string {
    const text = _text(key);
    return map[text] || fallback;
}

function _refLabel(refs: ReadonlyArray<{ id: string; label: string }>, id: unknown): string {
    const text = _text(id);
    if (!text) return '';
    const found = refs.find((ref) => ref.id === text);
    return found?.label || text;
}

function _dataNatureLabel(doc: PipelineProtocolDocument, id: unknown): string {
    return _refLabel(_asArray(doc.dataNatures), id);
}

function _elementLabel(doc: PipelineProtocolDocument, id: unknown): string {
    const text = _text(id);
    if (!text) return '';
    const element = _asArray(doc.elements).find((item) => item.id === text || item.sourceNodeId === text);
    return element?.label || text;
}

function _pendingFor(issues: PipelineProtocolIssue[] | null | undefined, ownerItemId: string): string[] {
    const owner = _text(ownerItemId);
    if (!owner) return [];
    return _asArray(issues)
        .filter((issue) => _text(issue.ownerItemId) === owner || _text(issue.targetId) === owner)
        .map((issue) => _text(issue.userMessage) || _text(issue.message))
        .filter(Boolean);
}

/**
 * Build the selected-item panel: phase, stakeholder, data nature, origin,
 * evidence, technical parameters and pendings of one protocol element.
 *
 * @param {PipelineProtocolDocument | null} doc protocol document
 * @param {string} elementId selected element (or source node) id
 * @param {ProtocolItemPanelOptions} [options] validation issues + technical parameter rows bound to the element
 * @returns {ProtocolItemPanel} view model for the item panel
 */
export function buildProtocolItemPanel(
    doc: PipelineProtocolDocument | null | undefined,
    elementId: unknown,
    options: ProtocolItemPanelOptions = {},
): ProtocolItemPanel {
    const id = _text(elementId);
    const element = _asArray(doc?.elements).find((item) => item.id === id || item.sourceNodeId === id);
    if (!doc || !element) {
        return {
            found: false,
            elementId: id,
            kind: '',
            kindLabel: '',
            label: '',
            phaseLabel: '',
            stakeholderLabel: '',
            responsibleLabel: '',
            dataNatureLabel: '',
            originLabel: '',
            version: '',
            evidenceRefs: [],
            technicalParameters: [],
            pending: [],
        };
    }
    return {
        found: true,
        elementId: element.id,
        kind: element.kind,
        kindLabel: _labelFor(ELEMENT_KIND_LABELS, element.kind, 'Item do processo'),
        label: _text(element.label),
        phaseLabel: _refLabel(_asArray(doc.phases), element.phaseId),
        stakeholderLabel: _refLabel(_asArray(doc.stakeholders), element.stakeholderId),
        responsibleLabel: _refLabel(_asArray(doc.stakeholders), element.responsiblePartyId),
        dataNatureLabel: _dataNatureLabel(doc, element.dataNatureId),
        originLabel: _text(element.originRef),
        version: _text(element.version),
        evidenceRefs: _asArray(element.evidenceRefs).map(_text).filter(Boolean),
        technicalParameters: _asArray(options.technicalParameters).map((row) => ({
            label: _text(row?.label),
            statusLabel: _text(row?.statusLabel),
        })).filter((row) => row.label),
        pending: _pendingFor(options.issues, element.id),
    };
}

/**
 * Build the connector panel: flow kind, transported data, condition,
 * requiredness, failure route and preserved visual points.
 *
 * @param {PipelineProtocolDocument | null} doc protocol document
 * @param {string} connectorId selected connector id
 * @param {ProtocolConnectorPanelOptions} [options] validation issues
 * @returns {ProtocolConnectorPanel} view model for the connector panel
 */
export function buildProtocolConnectorPanel(
    doc: PipelineProtocolDocument | null | undefined,
    connectorId: unknown,
    options: ProtocolConnectorPanelOptions = {},
): ProtocolConnectorPanel {
    const id = _text(connectorId);
    const connector = _asArray(doc?.connectors).find((item) => item.id === id);
    if (!doc || !connector) {
        return {
            found: false,
            connectorId: id,
            label: '',
            kindLabel: '',
            directionLabel: '',
            sourceLabel: '',
            targetLabel: '',
            requiredLabel: '',
            conditionLabel: '',
            dataLabel: '',
            failureBehaviorLabel: '',
            pointsLabel: '',
            evidenceRefs: [],
            pending: [],
        };
    }
    const dataNatureLabel = _dataNatureLabel(doc, connector.dataNatureId);
    const dataRefLabels = _asArray(connector.dataRefs).map((ref) => _elementLabel(doc, ref)).filter(Boolean);
    const dataLabel = dataNatureLabel && dataRefLabels.length
        ? `${dataNatureLabel}: ${dataRefLabels.join(', ')}`
        : dataNatureLabel || dataRefLabels.join(', ');
    const conditionRef = _text(connector.conditionRef);
    const conditionLabel = conditionRef
        ? `Depende da decisao "${_elementLabel(doc, conditionRef)}"`
        : '';
    const pointCount = _asArray(connector.points).length;
    return {
        found: true,
        connectorId: connector.id,
        label: _text(connector.label) || `${_elementLabel(doc, connector.sourceId)} -> ${_elementLabel(doc, connector.targetId)}`,
        kindLabel: _labelFor(CONNECTOR_KIND_LABELS, connector.kind, _text(connector.kind) || 'Fluxo'),
        directionLabel: _labelFor(CONNECTOR_DIRECTION_LABELS, connector.direction, _text(connector.direction)),
        sourceLabel: _elementLabel(doc, connector.sourceId),
        targetLabel: _elementLabel(doc, connector.targetId),
        requiredLabel: connector.required ? 'Obrigatorio' : 'Opcional',
        conditionLabel,
        dataLabel,
        failureBehaviorLabel: _labelFor(FAILURE_BEHAVIOR_LABELS, connector.failureBehavior, _text(connector.failureBehavior)),
        pointsLabel: pointCount > 0
            ? `${pointCount} ponto(s) visual(is) preservado(s) do desenho original`
            : 'Sem pontos visuais proprios (rota reta)',
        evidenceRefs: _asArray(connector.evidenceRefs).map(_text).filter(Boolean),
        pending: _pendingFor(options.issues, connector.id),
    };
}

/**
 * Build the decision panel: question, criteria per route, required inputs,
 * approval/rework/not-applicable routes and the rework fallback.
 *
 * @param {PipelineProtocolDocument | null} doc protocol document
 * @param {string} gateId gate node id
 * @param {ProtocolDecisionPanelOptions} [options] validation issues
 * @returns {ProtocolDecisionPanel} view model for the decision panel
 */
export function buildProtocolDecisionPanel(
    doc: PipelineProtocolDocument | null | undefined,
    gateId: unknown,
    options: ProtocolDecisionPanelOptions = {},
): ProtocolDecisionPanel {
    const id = _text(gateId);
    const gate = _asArray(doc?.gates).find((item) => item.nodeId === id);
    if (!doc || !gate) {
        return {
            found: false,
            gateId: id,
            question: '',
            statusLabel: '',
            routes: [],
            requiredInputs: [],
            approvalRouteLabel: '',
            reworkRouteLabel: '',
            notApplicableRouteLabel: '',
            fallbackLabel: '',
            pending: [],
        };
    }
    const decision = _asArray(doc.decisions).find((item) => item.nodeId === gate.nodeId);
    const routes: ProtocolDecisionRouteRow[] = _asArray(gate.conditionalRoutes).map((route) => ({
        routeId: route.id,
        label: _text(route.label),
        routeKind: route.routeKind,
        routeKindLabel: _labelFor(ROUTE_KIND_LABELS, route.routeKind, route.routeKind),
        targetLabel: _elementLabel(doc, route.targetElementId),
        criteriaLabel: _text(route.conditionRef)
            ? `Criterio vinculado a decisao "${_elementLabel(doc, route.conditionRef)}"`
            : _text(route.evidenceRefs?.[0]) || 'Criterio informal (sem referencia explicita)',
    }));
    const routeOfKind = (kind: string) => routes.find((route) => route.routeKind === kind);
    const approval = routeOfKind('approval');
    const rework = routeOfKind('rework');
    const notApplicable = routeOfKind('not-applicable');
    return {
        found: true,
        gateId: gate.nodeId,
        question: _text(gate.label),
        statusLabel: _labelFor(GATE_STATUS_LABELS, gate.status, _text(gate.status)),
        routes,
        requiredInputs: _asArray(decision?.requiredInputs).map(_text).filter(Boolean),
        approvalRouteLabel: approval ? `${approval.label} -> ${approval.targetLabel}` : 'Sem rota de aprovacao definida',
        reworkRouteLabel: rework ? `${rework.label} -> ${rework.targetLabel}` : 'Sem retorno para retrabalho definido',
        notApplicableRouteLabel: notApplicable ? notApplicable.label : 'Sem rota de nao aplicavel definida',
        fallbackLabel: rework
            ? `Retorna para "${rework.targetLabel}" quando a decisao nao avanca`
            : 'Sem plano B explicito (a spec exige fallback em decisao com mais de uma saida)',
        pending: [
            ..._asArray(decision?.pending).map(_text).filter(Boolean),
            ..._pendingFor(options.issues, gate.nodeId),
        ],
    };
}

/**
 * Build the domain assistant: the three domain profiles (GAC/DD38,
 * mineral processing, generic) with what each one suggests (phases,
 * lanes, data and checks). A pack without a chosen profile falls back
 * to generic, and publishing requires a chosen/confirmed profile.
 *
 * @param {PipelineProtocolDocument | null} doc protocol document
 * @returns {DomainAssistantView} view model for the domain assistant
 */
export function buildDomainAssistant(doc: PipelineProtocolDocument | null | undefined): DomainAssistantView {
    const profile = getDomainProfile(doc?.domainProfileId);
    const confirmed = profile.domain !== GENERIC_DOMAIN_ID;
    const options: DomainAssistantOption[] = Object.values(PROCESS_DOMAIN_PROFILES)
        .map((candidate: ProcessDomainProfile) => ({
            domainId: candidate.domain,
            label: _labelFor(DOMAIN_OPTION_LABELS, candidate.domain, candidate.domain),
            selected: candidate.domain === profile.domain,
            regulations: candidate.regulations.map(_friendlyRule),
            requiredFieldLabels: candidate.requiredFields.map((field) => REQUIRED_FIELD_LABELS[field] || field),
            validationRules: candidate.validationRules.map(_friendlyRule),
        }));
    return {
        currentDomainId: profile.domain,
        currentLabel: _labelFor(DOMAIN_OPTION_LABELS, profile.domain, profile.domain),
        confirmed,
        confirmationNote: confirmed
            ? `Perfil "${_labelFor(DOMAIN_OPTION_LABELS, profile.domain, profile.domain)}" guia fases, raias, dados e checks deste processo.`
            : 'Este processo caiu no perfil generico. Escolha GAC/DD38 ou beneficiamento mineral — ou confirme o generico — antes de publicar.',
        options,
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

function _rowHtml(label: string, value: string, dataAttr: string): string {
    const text = _text(value) || 'Nao informado';
    return `<div class="pipeline-protocol-panel-row" ${dataAttr}>
              <span>${_esc(label)}</span><small>${_esc(text)}</small>
            </div>`;
}

function _pendingListHtml(pending: string[]): string {
    if (!pending.length) return '<p class="pipeline-protocol-panel-ok">Nenhuma pendencia aberta neste item.</p>';
    return `<ul class="pipeline-protocol-panel-pending">${pending.map((item) => `<li>${_esc(item)}</li>`).join('')}</ul>`;
}

/**
 * Render the selected-item panel as an escaped HTML section.
 *
 * @param {ProtocolItemPanel} panel panel built by buildProtocolItemPanel
 * @returns {string} HTML section (all dynamic text escaped)
 */
export function renderProtocolItemPanelHtml(panel: ProtocolItemPanel): string {
    if (!panel?.found) {
        return `<section class="pipeline-protocol-item-panel" data-pipeline-protocol-item-panel="true"
             data-pipeline-protocol-item-found="false">
          <h4>Painel do item</h4>
          <p class="pipeline-protocol-panel-muted">Selecione um item do processo para ver fase, parte interessada, dados e pendencias.</p>
        </section>`;
    }
    const parameterRows = panel.technicalParameters.length
        ? panel.technicalParameters.map((row) => `
              <li data-pipeline-protocol-item-parameter="true"><span>${_esc(row.label)}</span> <small>${_esc(row.statusLabel || 'sem status')}</small></li>`).join('')
        : '<li>Nenhum parametro tecnico vinculado a este item.</li>';
    const evidenceRows = panel.evidenceRefs.length
        ? panel.evidenceRefs.map((ref) => `<li data-pipeline-protocol-item-evidence="true">${_esc(ref)}</li>`).join('')
        : '<li>Sem evidencia vinculada.</li>';
    return `<section class="pipeline-protocol-item-panel" data-pipeline-protocol-item-panel="true"
             data-pipeline-protocol-item-found="true"
             data-pipeline-protocol-item-id="${_esc(panel.elementId)}"
             data-pipeline-protocol-item-kind="${_esc(panel.kind)}">
          <h4>Painel do item: ${_esc(panel.label)}</h4>
          ${_rowHtml('Tipo', panel.kindLabel, 'data-pipeline-protocol-item-kind-label="true"')}
          ${_rowHtml('Fase', panel.phaseLabel, 'data-pipeline-protocol-item-phase="true"')}
          ${_rowHtml('Parte interessada', panel.stakeholderLabel, 'data-pipeline-protocol-item-stakeholder="true"')}
          ${_rowHtml('Responsavel', panel.responsibleLabel, 'data-pipeline-protocol-item-responsible="true"')}
          ${_rowHtml('Natureza dos dados', panel.dataNatureLabel, 'data-pipeline-protocol-item-data-nature="true"')}
          ${_rowHtml('Origem', panel.originLabel, 'data-pipeline-protocol-item-origin="true"')}
          ${_rowHtml('Versao do item', panel.version, 'data-pipeline-protocol-item-version="true"')}
          <div class="pipeline-protocol-panel-block">
            <span>Evidencias</span>
            <ul data-pipeline-protocol-item-evidences="true">${evidenceRows}</ul>
          </div>
          <div class="pipeline-protocol-panel-block">
            <span>Parametros tecnicos</span>
            <ul data-pipeline-protocol-item-parameters="true">${parameterRows}</ul>
          </div>
          <div class="pipeline-protocol-panel-block" data-pipeline-protocol-item-pending="true">
            <span>Pendencias do item</span>
            ${_pendingListHtml(panel.pending)}
          </div>
        </section>`;
}

/**
 * Render the connector panel as an escaped HTML section.
 *
 * @param {ProtocolConnectorPanel} panel panel built by buildProtocolConnectorPanel
 * @returns {string} HTML section (all dynamic text escaped)
 */
export function renderProtocolConnectorPanelHtml(panel: ProtocolConnectorPanel): string {
    if (!panel?.found) {
        return `<section class="pipeline-protocol-connector-panel" data-pipeline-protocol-connector-panel="true"
             data-pipeline-protocol-connector-found="false">
          <h4>Painel do conector</h4>
          <p class="pipeline-protocol-panel-muted">Selecione um conector para ver tipo de fluxo, dado transportado, condicao e rota de falha.</p>
        </section>`;
    }
    return `<section class="pipeline-protocol-connector-panel" data-pipeline-protocol-connector-panel="true"
             data-pipeline-protocol-connector-found="true"
             data-pipeline-protocol-connector-id="${_esc(panel.connectorId)}">
          <h4>Painel do conector: ${_esc(panel.label)}</h4>
          ${_rowHtml('Tipo de fluxo', panel.kindLabel, 'data-pipeline-protocol-connector-kind="true"')}
          ${_rowHtml('Sentido', panel.directionLabel, 'data-pipeline-protocol-connector-direction="true"')}
          ${_rowHtml('Origem', panel.sourceLabel, 'data-pipeline-protocol-connector-source="true"')}
          ${_rowHtml('Destino', panel.targetLabel, 'data-pipeline-protocol-connector-target="true"')}
          ${_rowHtml('Obrigatoriedade', panel.requiredLabel, 'data-pipeline-protocol-connector-required="true"')}
          ${_rowHtml('Dado transportado', panel.dataLabel, 'data-pipeline-protocol-connector-data="true"')}
          ${_rowHtml('Condicao', panel.conditionLabel, 'data-pipeline-protocol-connector-condition="true"')}
          ${_rowHtml('Rota de falha', panel.failureBehaviorLabel, 'data-pipeline-protocol-connector-failure="true"')}
          ${_rowHtml('Pontos visuais', panel.pointsLabel, 'data-pipeline-protocol-connector-points="true"')}
          <div class="pipeline-protocol-panel-block" data-pipeline-protocol-connector-pending="true">
            <span>Pendencias do conector</span>
            ${_pendingListHtml(panel.pending)}
          </div>
        </section>`;
}

/**
 * Render the decision panel as an escaped HTML section.
 *
 * @param {ProtocolDecisionPanel} panel panel built by buildProtocolDecisionPanel
 * @returns {string} HTML section (all dynamic text escaped)
 */
export function renderProtocolDecisionPanelHtml(panel: ProtocolDecisionPanel): string {
    if (!panel?.found) {
        return `<section class="pipeline-protocol-decision-panel" data-pipeline-protocol-decision-panel="true"
             data-pipeline-protocol-decision-found="false">
          <h4>Painel da decisao</h4>
          <p class="pipeline-protocol-panel-muted">Este processo nao tem decisao condicional para detalhar.</p>
        </section>`;
    }
    const routeRows = panel.routes.length
        ? panel.routes.map((route) => `
              <li data-pipeline-protocol-decision-route="${_esc(route.routeId)}"
                  data-pipeline-protocol-decision-route-kind="${_esc(route.routeKind)}">
                <span>${_esc(route.routeKindLabel)}: ${_esc(route.label)}</span>
                <small>${_esc(route.criteriaLabel)} - leva para "${_esc(route.targetLabel)}"</small>
              </li>`).join('')
        : '<li>Nenhuma rota condicional mapeada.</li>';
    const inputRows = panel.requiredInputs.length
        ? panel.requiredInputs.map((input) => `<li data-pipeline-protocol-decision-input="true">${_esc(input)}</li>`).join('')
        : '<li>Nenhuma entrada obrigatoria declarada.</li>';
    return `<section class="pipeline-protocol-decision-panel" data-pipeline-protocol-decision-panel="true"
             data-pipeline-protocol-decision-found="true"
             data-pipeline-protocol-decision-id="${_esc(panel.gateId)}">
          <h4>Painel da decisao</h4>
          ${_rowHtml('Pergunta', panel.question, 'data-pipeline-protocol-decision-question="true"')}
          ${_rowHtml('Situacao', panel.statusLabel, 'data-pipeline-protocol-decision-status="true"')}
          <div class="pipeline-protocol-panel-block">
            <span>Rotas e criterios</span>
            <ul data-pipeline-protocol-decision-routes="true">${routeRows}</ul>
          </div>
          <div class="pipeline-protocol-panel-block">
            <span>Entradas exigidas</span>
            <ul data-pipeline-protocol-decision-inputs="true">${inputRows}</ul>
          </div>
          ${_rowHtml('Aprovacao', panel.approvalRouteLabel, 'data-pipeline-protocol-decision-approval="true"')}
          ${_rowHtml('Reprovacao/retrabalho', panel.reworkRouteLabel, 'data-pipeline-protocol-decision-rework="true"')}
          ${_rowHtml('Nao aplicavel', panel.notApplicableRouteLabel, 'data-pipeline-protocol-decision-not-applicable="true"')}
          ${_rowHtml('Plano B', panel.fallbackLabel, 'data-pipeline-protocol-decision-fallback="true"')}
          <div class="pipeline-protocol-panel-block" data-pipeline-protocol-decision-pending="true">
            <span>Pendencias da decisao</span>
            ${_pendingListHtml(panel.pending)}
          </div>
        </section>`;
}

/**
 * Render the domain assistant as an escaped HTML section. Each profile
 * option is a clickable button (data-pipeline-protocol-domain-option) so
 * the UI layer can apply the chosen profile; the selected one lists the
 * suggested phases, lanes, data and checks.
 *
 * @param {DomainAssistantView} view view built by buildDomainAssistant
 * @returns {string} HTML section (all dynamic text escaped)
 */
export function renderDomainAssistantHtml(view: DomainAssistantView): string {
    const safeOptions = _asArray(view?.options);
    const optionButtons = safeOptions.map((option) => `
            <button type="button" class="pipeline-protocol-domain-option"
                    data-pipeline-protocol-domain-option="${_esc(option.domainId)}"
                    data-pipeline-protocol-domain-selected="${_esc(option.selected ? 'true' : 'false')}"
                    aria-pressed="${_esc(option.selected ? 'true' : 'false')}">
              <span>${_esc(option.label)}</span>
            </button>`).join('');
    const selected = safeOptions.find((option) => option.selected);
    const suggestionBlocks = selected
        ? `
          <div class="pipeline-protocol-panel-block" data-pipeline-protocol-domain-suggestions="true">
            <span>O que este perfil sugere preencher</span>
            <ul>${selected.requiredFieldLabels.map((label) => `<li data-pipeline-protocol-domain-suggestion="true">${_esc(label)}</li>`).join('')}</ul>
          </div>
          <div class="pipeline-protocol-panel-block" data-pipeline-protocol-domain-checks="true">
            <span>Checks do perfil</span>
            <ul>${selected.validationRules.map((rule) => `<li data-pipeline-protocol-domain-check="true">${_esc(rule)}</li>`).join('')}</ul>
          </div>
          <div class="pipeline-protocol-panel-block" data-pipeline-protocol-domain-regulations="true">
            <span>Base normativa</span>
            <ul>${selected.regulations.length
                ? selected.regulations.map((rule) => `<li data-pipeline-protocol-domain-regulation="true">${_esc(rule)}</li>`).join('')
                : '<li>Sem base normativa propria (perfil generico).</li>'}</ul>
          </div>`
        : '';
    return `<section class="pipeline-protocol-domain-assistant" data-pipeline-protocol-domain-assistant="true"
             data-pipeline-protocol-domain-current="${_esc(view?.currentDomainId || '')}"
             data-pipeline-protocol-domain-confirmed="${_esc(view?.confirmed ? 'true' : 'false')}">
          <h4>Assistente de dominio</h4>
          <p class="pipeline-protocol-panel-note" data-pipeline-protocol-domain-note="true">${_esc(view?.confirmationNote || '')}</p>
          <div class="pipeline-protocol-domain-options" role="group" aria-label="Escolher perfil de dominio">${optionButtons}
          </div>
          ${suggestionBlocks}
        </section>`;
}
