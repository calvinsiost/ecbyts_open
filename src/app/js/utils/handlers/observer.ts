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
   OBSERVER HANDLERS — Public/authenticated data submission
   Acoes de observadores para envio de dados e comentarios

   Observadores sao usuarios com acesso limitado que podem:
   - Enviar observacoes (ficam pendentes de aprovacao)
   - Adicionar comentarios a elementos
   Administradores/editores podem aprovar ou rejeitar submissoes.

   FLUXO:
   1. Observador seleciona elemento
   2. Preenche formulario simplificado (parametro, valor, unidade)
   3. Observacao e salva com _status: 'pending'
   4. Admin ve indicador de pendentes e pode aprovar/rejeitar
   ================================================================ */
import * as _session from '../auth/session.js';
const getUserEmail = _session.getUserEmail || (() => null);
import { isObserver, canEditElement, isAccessControlActive } from '../auth/permissions.js';
import { getElementById, updateElement, getSelectedElement } from '../../core/elements/manager.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { updateElementDetails } from '../ui/lists.js';
// ----------------------------------------------------------------
// OBSERVATION SUBMISSION
// ----------------------------------------------------------------
/**
 * Submit an observation as observer.
 * Envia uma observacao como observador (fica pendente de aprovacao).
 *
 * @param {string} elementId - Target element ID
 * @param {ObservationData} data - Observation data { parameterId, value, unitId, date }
 */
function handleSubmitObserverObservation(elementId: any, data: any) {
    if (!isAccessControlActive()) return;
    const role = _checkObserverRole();
    if (!role) return;
    const element = getElementById(elementId);
    if (!element) {
        showToast(t('elementNotFound') || 'Element not found', 'error');
        return;
    }
    const observations = Array.isArray(element.data?.observations) ? [...element.data.observations] : [];
    observations.push({
        x: 0,
        y: 0,
        z: 0,
        date: data.date || new Date().toISOString().slice(0, 10),
        campaignId: null,
        parameterId: data.parameterId || null,
        value: data.value != null ? Number(data.value) : null,
        unitId: data.unitId || null,
        autoConvert: false,
        additionalReadings: [],
        variables: {},
        // Observer metadata
        _submittedBy: getUserEmail() || 'anonymous',
        _submittedAt: new Date().toISOString(),
        _status: 'pending',
        _approvedBy: null,
    });
    updateElement(elementId, {
        data: { ...element.data, observations },
    });
    showToast(t('observationSubmitted') || 'Observation submitted (pending approval)', 'success');
    updateElementDetails();
}
/**
 * Submit observation from the observer modal form.
 * Coleta dados do formulario e envia observacao.
 */
function handleSubmitObserverForm() {
    const element = getSelectedElement();
    if (!element) {
        showToast(t('selectElement') || 'Select an element first', 'error');
        return;
    }
    const parameterId = document.getElementById('observer-param')?.value || null;
    const value = document.getElementById('observer-value')?.value;
    const unitId = document.getElementById('observer-unit')?.value || null;
    const date = document.getElementById('observer-date')?.value || new Date().toISOString().slice(0, 10);
    if (!parameterId || value === '' || value == null) {
        showToast(t('fillRequired') || 'Fill in parameter and value', 'error');
        return;
    }
    handleSubmitObserverObservation(element.id, { parameterId, value, unitId, date });
    // Clear form
    const paramEl = document.getElementById('observer-param');
    const valueEl = document.getElementById('observer-value');
    if (paramEl) paramEl.value = '';
    if (valueEl) valueEl.value = '';
}
// ----------------------------------------------------------------
// COMMENT SUBMISSION
// ----------------------------------------------------------------
/**
 * Submit a comment as observer.
 * Adiciona um comentario ao elemento como observador.
 *
 * @param {string} elementId - Target element ID
 * @param {string} content - Comment text
 */
function handleSubmitObserverComment(elementId: any, content: any) {
    if (!isAccessControlActive()) return;
    const role = _checkObserverRole();
    if (!role) return;
    if (!content || !content.trim()) {
        showToast(t('emptyComment') || 'Comment cannot be empty', 'error');
        return;
    }
    const element = getElementById(elementId);
    if (!element) return;
    const messages = Array.isArray(element.messages) ? [...element.messages] : [];
    messages.push({
        role: 'observer',
        content: content.trim(),
        timestamp: new Date().toISOString(),
        author: getUserEmail() || 'anonymous',
    });
    updateElement(elementId, { messages });
    showToast(t('commentSubmitted') || 'Comment submitted', 'success');
    updateElementDetails();
}
/**
 * Submit comment from the observer form.
 */
function handleSubmitObserverCommentForm() {
    const element = getSelectedElement();
    if (!element) {
        showToast(t('selectElement') || 'Select an element first', 'error');
        return;
    }
    const input = document.getElementById('observer-comment');
    if (!input) return;
    handleSubmitObserverComment(element.id, input.value);
    input.value = '';
}
// ----------------------------------------------------------------
// APPROVAL / REJECTION
// ----------------------------------------------------------------
/**
 * Approve a pending observation.
 * Aprova uma observacao pendente (somente admin/editor).
 *
 * @param {string} elementId
 * @param {number} obsIndex
 */
function handleApproveObservation(elementId: any, obsIndex: any) {
    if (!canEditElement(elementId)) {
        showToast(t('permissionDenied') || 'Permission denied', 'error');
        return;
    }
    const element = getElementById(elementId);
    if (!element) return;
    const observations = Array.isArray(element.data?.observations) ? [...element.data.observations] : [];
    if (observations[obsIndex]?._status === 'pending') {
        observations[obsIndex] = {
            ...observations[obsIndex],
            _status: 'approved',
            _approvedBy: getUserEmail() || null,
        };
        updateElement(elementId, {
            data: { ...element.data, observations },
        });
        showToast(t('observationApproved') || 'Observation approved', 'success');
        updateElementDetails();
    }
}
/**
 * Reject a pending observation.
 * Rejeita uma observacao pendente (somente admin/editor).
 *
 * @param {string} elementId
 * @param {number} obsIndex
 */
function handleRejectObservation(elementId: any, obsIndex: any) {
    if (!canEditElement(elementId)) {
        showToast(t('permissionDenied') || 'Permission denied', 'error');
        return;
    }
    const element = getElementById(elementId);
    if (!element) return;
    const observations = Array.isArray(element.data?.observations) ? [...element.data.observations] : [];
    if (observations[obsIndex]?._status === 'pending') {
        observations[obsIndex] = {
            ...observations[obsIndex],
            _status: 'rejected',
            _approvedBy: getUserEmail() || null,
        };
        updateElement(elementId, {
            data: { ...element.data, observations },
        });
        showToast(t('observationRejected') || 'Observation rejected', 'info');
        updateElementDetails();
    }
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * Check if current user has observer (or higher) role.
 * @returns {boolean}
 */
function _checkObserverRole() {
    if (isObserver()) return true;
    // Editors and admins can also submit directly
    const email = getUserEmail();
    if (email) return true;
    showToast(t('observerNotEnabled') || 'Observer mode not enabled', 'error');
    return false;
}
/**
 * Count pending observations for an element.
 * Conta observacoes pendentes de aprovacao.
 *
 * @param {string} elementId
 * @returns {number}
 */
export function countPendingObservations(elementId: any) {
    const element = getElementById(elementId);
    if (!element?.data?.observations) return 0;
    return element.data.observations.filter((o: any) => o._status === 'pending').length;
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const observerHandlers = {
    handleSubmitObserverObservation,
    handleSubmitObserverForm,
    handleSubmitObserverComment,
    handleSubmitObserverCommentForm,
    handleApproveObservation,
    handleRejectObservation,
};
