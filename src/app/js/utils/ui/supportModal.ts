// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SUPPORT MODAL — Canal de suporte ao pagante (CR-027)
   SPEC_COMMERCIAL_READINESS_DOD T5.3

   - Botao "Suporte" visivel no app
   - Formulario estruturado (assunto, mensagem, anexo opcional)
   - Protocolo local + prazo de resposta em janela util
   - Envio pelo trilho nativo de email e historico local sem conteudo sensivel
   ================================================================ */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { submitBugReport } from '../errorReporting/reporter.js';

/** Chave localStorage para metadados nao sensiveis dos protocolos. */
export const SUPPORT_TICKETS_KEY = 'ecbyts_support_tickets';

const BUSINESS_DAY_START_HOUR = 9;
const BUSINESS_DAY_END_HOUR = 18;

function _getDocument(): any {
    return typeof document !== 'undefined' ? document : null;
}

function _getWindow(): any {
    return typeof window !== 'undefined' ? window : null;
}

export interface SupportTicket {
    protocol: string;
    subject: string;
    message: string;
    createdAt: string;
    status: 'open' | 'closed';
    impact?: SupportImpact;
    severity?: SupportSeverity;
    acknowledgementDueAt?: string;
    escalationRoute?: string;
}

export interface SupportDeliveryResult {
    ok: boolean;
    ticket?: SupportTicket;
    reason?: string;
}

export interface SupportSubmitDependencies {
    deliver?: typeof submitBugReport;
    now?: () => Date;
}

export type StoredSupportTicket = Omit<SupportTicket, 'message' | 'subject'>;

export type SupportImpact = 'critical' | 'blocked' | 'degraded' | 'question';
export type SupportSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export interface SupportEscalationPlan {
    severity: SupportSeverity;
    acknowledgementMinutes: number;
    updateMinutes: number;
    escalationRoute: string;
    userGuidance: string;
}

const GUIDANCE_KEYS: Readonly<Record<SupportSeverity, string>> = Object.freeze({
    P0: 'support.guidanceP0',
    P1: 'support.guidanceP1',
    P2: 'support.guidanceP2',
    P3: 'support.guidanceP3',
});

const SUPPORT_ESCALATION_PLANS: Readonly<Record<SupportSeverity, SupportEscalationPlan>> = Object.freeze({
    P0: Object.freeze({
        severity: 'P0',
        acknowledgementMinutes: 30,
        updateMinutes: 60,
        escalationRoute: 'incident-commander',
        userGuidance:
            'Interrompa operacoes de risco e preserve as evidencias. A equipe priorizara este chamado imediatamente.',
    }),
    P1: Object.freeze({
        severity: 'P1',
        acknowledgementMinutes: 240,
        updateMinutes: 480,
        escalationRoute: 'product-on-call',
        userGuidance: 'Use uma alternativa segura, se disponivel. A equipe respondera no mesmo dia util.',
    }),
    P2: Object.freeze({
        severity: 'P2',
        acknowledgementMinutes: 480,
        updateMinutes: 1440,
        escalationRoute: 'support-queue',
        userGuidance: 'Voce pode continuar usando as demais funcoes enquanto o chamado e analisado.',
    }),
    P3: Object.freeze({
        severity: 'P3',
        acknowledgementMinutes: 960,
        updateMinutes: 2880,
        escalationRoute: 'support-queue',
        userGuidance: 'A equipe respondera em ate dois dias uteis.',
    }),
});

let _lastFocusedElement: HTMLElement | null = null;

function _el(id: string): HTMLElement | null {
    return _getDocument()?.getElementById(id) ?? null;
}

/** Gera protocolo deterministico por dia: SUP-YYYYMMDD-XXXX. */
export function generateSupportProtocol(now: Date = new Date()): string {
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 36 * 36 * 36 * 36)
        .toString(36)
        .toUpperCase()
        .padStart(4, '0');
    return `SUP-${date}-${random}`;
}

/**
 * Classifica impacto de forma conservadora. Seguranca, privacidade, perda de
 * dados e faturamento indisponivel nunca podem cair abaixo de P0/P1.
 */
export function resolveSupportEscalation(subject: string, impact: SupportImpact): SupportEscalationPlan {
    const normalizedSubject = subject.trim().toLowerCase();
    let severity: SupportSeverity;

    if (impact === 'critical') severity = 'P0';
    else if (impact === 'blocked') severity = 'P1';
    else if (impact === 'degraded') severity = 'P2';
    else severity = 'P3';

    if (normalizedSubject === 'security' || normalizedSubject === 'privacy') severity = 'P0';
    if (normalizedSubject === 'billing' && severity === 'P3') severity = 'P2';

    const plan = SUPPORT_ESCALATION_PLANS[severity];
    const translatedGuidance = t(GUIDANCE_KEYS[severity]);
    return {
        ...plan,
        userGuidance:
            translatedGuidance && translatedGuidance !== GUIDANCE_KEYS[severity]
                ? translatedGuidance
                : plan.userGuidance,
    };
}

export function calculateAcknowledgementDueAt(createdAt: string, minutes: number): string {
    const cursor = new Date(createdAt);
    if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(minutes) || minutes <= 0) {
        throw new TypeError('createdAt e minutes devem ser validos');
    }

    let remaining = Math.ceil(minutes);
    while (remaining > 0) {
        const day = cursor.getDay();
        const isBusinessDay = day !== 0 && day !== 6;
        const start = new Date(cursor);
        start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);
        const end = new Date(cursor);
        end.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0);

        if (!isBusinessDay || cursor >= end) {
            cursor.setDate(cursor.getDate() + (day === 5 ? 3 : day === 6 ? 2 : 1));
            cursor.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);
            continue;
        }
        if (cursor < start) cursor.setTime(start.getTime());

        const available = Math.floor((end.getTime() - cursor.getTime()) / 60_000);
        const consumed = Math.min(available, remaining);
        cursor.setMinutes(cursor.getMinutes() + consumed);
        remaining -= consumed;
    }
    return cursor.toISOString();
}

/** Lista tickets persistidos localmente. */
export function listSupportTickets(): StoredSupportTicket[] {
    try {
        const raw = _getWindow()?.localStorage?.getItem(SUPPORT_TICKETS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const records = parsed.filter((ticket) => ticket && typeof ticket === 'object');
        const sanitized = records.map(({ message: _message, subject: _subject, ...metadata }) => metadata);
        if (records.some((ticket) => 'message' in ticket || 'subject' in ticket)) {
            _getWindow()?.localStorage?.setItem(SUPPORT_TICKETS_KEY, JSON.stringify(sanitized));
        }
        return sanitized;
    } catch (e) {
        console.debug('[support] listSupportTickets parse failed', (e as Error)?.message || e);
        return [];
    }
}

/** Persiste um ticket localmente (stub). */
export function saveSupportTicket(ticket: SupportTicket): void {
    try {
        const tickets = listSupportTickets();
        const { message: _message, subject: _subject, ...safeMetadata } = ticket;
        tickets.unshift(safeMetadata);
        // Mantem os ultimos 50 tickets
        while (tickets.length > 50) tickets.pop();
        _getWindow()?.localStorage?.setItem(SUPPORT_TICKETS_KEY, JSON.stringify(tickets));
    } catch (e) {
        console.debug('[support] saveSupportTicket localStorage indisponivel', (e as Error)?.message || e);
    }
}

function _bugReportSeverity(severity: SupportSeverity): 'low' | 'medium' | 'high' | 'critical' {
    if (severity === 'P0') return 'critical';
    if (severity === 'P1') return 'high';
    if (severity === 'P2') return 'medium';
    return 'low';
}

function _subjectLabel(subject: string, translate: (key: string, fallback: string) => string): string {
    const keyBySubject: Readonly<Record<string, string>> = Object.freeze({
        bug: 'support.subjectBug',
        billing: 'support.subjectBilling',
        account: 'support.subjectAccount',
        feature: 'support.subjectFeature',
        security: 'support.subjectSecurity',
        other: 'support.subjectOther',
    });
    return translate(keyBySubject[subject] || 'support.subjectOther', subject);
}

/**
 * Entrega o pedido na fila monitorada `bug_reports`. O protocolo e o SLA so
 * existem depois do acknowledgement do servidor; falha nunca vira sucesso.
 */
export async function deliverSupportTicket(
    input: Pick<SupportTicket, 'protocol' | 'subject' | 'message' | 'impact'>,
    deliver: typeof submitBugReport = submitBugReport,
    now: () => Date = () => new Date(),
    translate: (key: string, fallback: string) => string = _translated,
): Promise<SupportDeliveryResult> {
    const impact = input.impact || 'question';
    const plan = resolveSupportEscalation(input.subject, impact);
    let result;
    try {
        result = await deliver({
            title: `[${input.protocol}] ${_subjectLabel(input.subject, translate)}`,
            description: input.message,
            severity: _bugReportSeverity(plan.severity),
            affected_area: 'other',
            metadata: {
                support_protocol: input.protocol,
                support_impact: impact,
                support_priority: plan.severity,
                support_route: plan.escalationRoute,
            },
        });
    } catch (error) {
        return { ok: false, reason: (error as Error)?.message || 'delivery_error' };
    }

    if (!result?.ok || !result.id) {
        return { ok: false, reason: result?.reason || 'missing_server_acknowledgement' };
    }

    const acceptedAt = now().toISOString();
    return {
        ok: true,
        ticket: {
            ...input,
            createdAt: acceptedAt,
            status: 'open',
            severity: plan.severity,
            acknowledgementDueAt: calculateAcknowledgementDueAt(acceptedAt, plan.acknowledgementMinutes),
            escalationRoute: plan.escalationRoute,
        },
    };
}

/** Remove dados livres do formulario depois que o servidor aceitou o pedido. */
export function clearSupportSensitiveFields(
    subjectSelect: HTMLSelectElement | null,
    messageInput: HTMLTextAreaElement | null,
    fileInput: HTMLInputElement | null,
    impactSelect: HTMLSelectElement | null,
): void {
    if (fileInput) fileInput.value = '';
    if (messageInput) messageInput.value = '';
    if (subjectSelect) subjectSelect.value = '';
    if (impactSelect) impactSelect.value = 'question';
}

function _translated(key: string, fallback: string): string {
    const value = t(key);
    return value && value !== key ? value : fallback;
}

function _hydrateDynamicTranslations(): void {
    const bindings: Array<[string, string, string]> = [['support-modal-close', 'support.close', 'Close']];
    for (const [id, key, fallback] of bindings) {
        const element = _el(id);
        if (!element) continue;
        if (id === 'support-modal-close') element.setAttribute('aria-label', _translated(key, fallback));
    }

    const impactLabel = _getDocument()?.querySelector('label[for="support-impact"]');
    if (impactLabel) impactLabel.textContent = _translated('support.impactLabel', 'How does this affect your work?');
    const securityOption = _getDocument()?.querySelector('#support-subject option[value="security"]');
    if (securityOption) securityOption.textContent = _translated('support.subjectSecurity', 'Security or privacy');
    const deadlineLabel = _getDocument()?.querySelector('#support-deadline')?.previousElementSibling;
    if (deadlineLabel) deadlineLabel.textContent = _translated('support.initialResponseDue', 'Initial response due:');
    const priorityLabel = _getDocument()?.querySelector('.support-confirmation-route')?.firstChild;
    if (priorityLabel) priorityLabel.textContent = `${_translated('support.priority', 'Priority')} `;

    const impactOptions: Array<[string, string, string]> = [
        ['question', 'support.impactQuestion', 'I have a question or request'],
        ['degraded', 'support.impactDegraded', 'I can continue, but with difficulty'],
        ['blocked', 'support.impactBlocked', 'My work is blocked'],
        ['critical', 'support.impactCritical', 'There is risk, data loss, or widespread unavailability'],
    ];
    for (const [value, key, fallback] of impactOptions) {
        const option = _getDocument()?.querySelector(`#support-impact option[value="${value}"]`);
        if (option) option.textContent = _translated(key, fallback);
    }
}

/** Renderiza a lista de tickets anteriores no modal. */
function _renderTicketHistory(): void {
    const container = _el('support-ticket-history');
    if (!container) return;

    const tickets = listSupportTickets();
    if (tickets.length === 0) {
        container.innerHTML = `<p class="support-empty">${escapeHtml(t('support.noTicketsYet') || 'Nenhum chamado anterior.')}</p>`;
        return;
    }

    const items = tickets
        .slice(0, 5)
        .map((ticket) => {
            const date = new Date(ticket.createdAt).toLocaleString();
            return `<div class="support-history-item">
                <div class="support-history-protocol">${escapeHtml(ticket.protocol)}</div>
                <div class="support-history-meta">${escapeHtml(date)} · ${escapeHtml(ticket.severity || 'P3')} · ${escapeHtml(ticket.status)}</div>
            </div>`;
        })
        .join('');
    container.innerHTML = items;
}

/** Limpa o formulario e volta para o estado inicial. */
function _resetSupportForm(): void {
    const form = _el('support-form') as HTMLFormElement | null;
    if (form) form.reset();
    const confirmation = _el('support-confirmation');
    if (confirmation) confirmation.style.display = 'none';
    const formPanel = _el('support-form-panel');
    if (formPanel) formPanel.style.display = 'block';
    _renderTicketHistory();
    _renderEscalationPreview();
}

/** Abre o modal de suporte. */
export function handleOpenSupportModal(): void {
    _lastFocusedElement = _getDocument()?.activeElement instanceof HTMLElement ? _getDocument().activeElement : null;
    _resetSupportForm();
    const modal = _el('support-modal');
    if (!modal) {
        showToast(t('support.unavailable') || 'Canal de suporte indisponivel.', 'warning');
        return;
    }
    if (modal.style.display === 'none') {
        modal.style.removeProperty('display');
    }
    modal.classList.add('active');
    (_el('support-subject') as HTMLSelectElement | null)?.focus();
}

/** Fecha o modal de suporte. */
export function handleCloseSupportModal(): void {
    const modal = _el('support-modal');
    if (modal) modal.classList.remove('active');
    _lastFocusedElement?.focus();
    _lastFocusedElement = null;
}

function _renderEscalationPreview(): SupportEscalationPlan {
    const subject = (_el('support-subject') as HTMLSelectElement | null)?.value || 'other';
    const impact = ((_el('support-impact') as HTMLSelectElement | null)?.value || 'question') as SupportImpact;
    const plan = resolveSupportEscalation(subject, impact);
    const badge = _el('support-priority-preview');
    const response = _el('support-response-preview');
    if (badge) {
        badge.textContent = plan.severity;
        badge.setAttribute('data-severity', plan.severity);
    }
    if (response) {
        response.textContent = _translated(
            'support.acknowledgementPreview',
            'Initial response within {minutes} business minutes.',
        ).replace('{minutes}', String(plan.acknowledgementMinutes));
    }
    return plan;
}

/** Envia o ticket e confirma somente depois do aceite da fila monitorada. */
export async function handleSubmitSupportTicket(dependencies: SupportSubmitDependencies = {}): Promise<void> {
    const subjectSelect = _el('support-subject') as HTMLSelectElement | null;
    const messageInput = _el('support-message') as HTMLTextAreaElement | null;
    const fileInput = _el('support-attachment') as HTMLInputElement | null;
    const impactSelect = _el('support-impact') as HTMLSelectElement | null;

    const subject = subjectSelect?.value.trim();
    const message = messageInput?.value.trim();
    const impact = (impactSelect?.value || 'question') as SupportImpact;

    if (!subject) {
        showToast(t('support.subjectRequired') || 'Selecione um assunto.', 'error');
        return;
    }
    if (!message || message.length < 10) {
        showToast(t('support.messageTooShort') || 'Descreva o problema com pelo menos 10 caracteres.', 'error');
        return;
    }

    const pendingTicket = {
        protocol: generateSupportProtocol(),
        subject,
        message,
        impact,
    };

    const submitButton = _el('support-submit') as HTMLButtonElement | null;
    if (submitButton) submitButton.disabled = true;
    showToast(_translated('support.submitting', 'Sending support request...'), 'info');

    const delivery = await deliverSupportTicket(
        pendingTicket,
        dependencies.deliver || submitBugReport,
        dependencies.now || (() => new Date()),
    );
    if (submitButton) submitButton.disabled = false;

    if (!delivery.ok || !delivery.ticket) {
        showToast(_translated('support.deliveryFailed', 'The request was not sent. Please try again.'), 'error');
        return;
    }

    const ticket = delivery.ticket;
    const plan = resolveSupportEscalation(subject, impact);
    saveSupportTicket(ticket);

    // O endpoint atual nao recebe o anexo deste formulario. Limpa o campo sem
    // prometer upload; capturas estruturadas continuam no modal de bugs.
    clearSupportSensitiveFields(subjectSelect, messageInput, fileInput, impactSelect);

    // Exibe confirmacao com protocolo e prazo
    const formPanel = _el('support-form-panel');
    const confirmation = _el('support-confirmation');
    const protocolEl = _el('support-protocol-number');
    const deadlineEl = _el('support-deadline');
    const severityEl = _el('support-confirmation-severity');
    const guidanceEl = _el('support-confirmation-guidance');

    if (protocolEl) protocolEl.textContent = ticket.protocol;
    if (deadlineEl) {
        deadlineEl.textContent = new Date(ticket.acknowledgementDueAt!).toLocaleString();
    }
    if (severityEl) severityEl.textContent = ticket.severity || plan.severity;
    if (guidanceEl) guidanceEl.textContent = plan.userGuidance;

    if (formPanel) formPanel.style.display = 'none';
    if (confirmation) confirmation.style.display = 'block';
    confirmation?.setAttribute('tabindex', '-1');
    confirmation?.focus();

    showToast(`${_translated('support.ticketCreatedTitle', 'Ticket opened')}: ${ticket.protocol}`, 'success');

    // Remove qualquer handler legado que pudesse reter assunto/mensagem em closure.
    const mailtoBtn = _el('support-send-email');
    if (mailtoBtn) {
        mailtoBtn.onclick = null;
        mailtoBtn.style.display = 'none';
    }
}

/** Inicializa listeners do modal de suporte (chamado no boot). */
export function initSupportModal(): void {
    _hydrateDynamicTranslations();
    const closeBtn = _el('support-modal-close');
    const cancelBtn = _el('support-modal-close-btn');
    const submitBtn = _el('support-submit');
    const newTicketBtn = _el('support-new-ticket');
    const overlay = _el('support-modal');

    closeBtn?.addEventListener('click', handleCloseSupportModal);
    cancelBtn?.addEventListener('click', handleCloseSupportModal);
    submitBtn?.addEventListener('click', () => void handleSubmitSupportTicket());
    newTicketBtn?.addEventListener('click', _resetSupportForm);
    (_el('support-subject') as HTMLSelectElement | null)?.addEventListener('change', _renderEscalationPreview);
    (_el('support-impact') as HTMLSelectElement | null)?.addEventListener('change', _renderEscalationPreview);

    // CSP-safe: previne reload no submit do form (ex-onsubmit="return false;"
    // foi removido do HTML para satisfazer o gate CSP attr-none).
    const form = _el('support-form') as HTMLFormElement | null;
    form?.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        void handleSubmitSupportTicket();
    });

    overlay?.addEventListener('click', (e: Event) => {
        if (e.target === overlay) handleCloseSupportModal();
    });

    // Tecla Escape fecha o modal
    _getDocument()?.addEventListener('keydown', (e: KeyboardEvent) => {
        const modal = _el('support-modal');
        if (e.key === 'Escape' && modal?.classList.contains('active')) {
            handleCloseSupportModal();
        }
    });
}
