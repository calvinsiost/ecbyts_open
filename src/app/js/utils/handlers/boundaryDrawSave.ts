// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   BOUNDARY DRAW SAVE HANDLER — SPEC-BOUNDARY-SAVE-001 (P1-17)

   Handler chamado após o usuário completar o desenho de um boundary.
   Detecta conflito (boundary existente no modelo ativo) e exibe
   diálogo assíncrono para escolha do usuário:
     - Criar novo modelo (padrão seguro)
     - Sobrescrever (requer segunda confirmação — ação destrutiva)

   Não usa confirm()/prompt() nativos — usa asyncConfirm/asyncPrompt
   de asyncDialogs.js.
   ================================================================ */
import { detectBoundaryConflict, buildModelWithNewBoundary, suggestBoundaryModelName, } from '../../core/elements/boundaryConflictResolver.js';
import { asyncConfirm, asyncPrompt } from '../ui/asyncDialogs.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
// TRUST-009 G3 adoption — valida topologia antes de salvar (self-intersect, degenerate, vertex count).
import { validatePolygonRing } from '../../core/boundary/polygonGeometry.js';
const log = createLogger('boundaryDrawSave');
// ──────────────────────────────────────────────────────────────────────
// Internal helpers - lazy-loaded managers to avoid circular deps
// ──────────────────────────────────────────────────────────────────────
/**
 * Retorna todos os elementos do modelo ativo.
 * Tenta window.getAllElements() primeiro (API bridge), depois import dinâmico.
 * @returns {Promise<Array<any>>}
 */
async function _getElements() {
    if (typeof window !== 'undefined' && typeof ((window).getAllElements) === 'function') {
        return (window).getAllElements();
    }
    const { getAllElements } = await import('../../core/elements/manager.js' as string);
    return getAllElements();
}
/**
 * Salva um boundary no modelo atual como novo elemento.
 * @param {Array<any>} polygon
 * @returns {Promise<void>}
 */
async function _saveBoundaryToCurrentModel(polygon: any) {
    if (typeof window !== 'undefined' && typeof ((window).handleAddElement) === 'function') {
        // Usa handler de alto nível para garantir que o refresh global seja chamado
        (window as any).handleAddElement("boundary", { polygon });
        return;
    }
    const mod = await import('../../core/elements/manager.js' as string);
    const addElement = mod.addElement;
    const id = `boundary-${Date.now()}`;
    addElement('boundary', id, 'Boundary', { polygon });
}
/**
 * Sobrescreve o boundary existente no modelo atual.
 * Remove o existente e adiciona o novo.
 * @param {Object} existingEl - elemento boundary existente
 * @param {Array<any>} polygon - novo polígono
 * @returns {Promise<void>}
 */
async function _overwriteExistingBoundary(existingEl: any, polygon: any) {
    const existing = (existingEl);
    const { removeElement, addElement } = await import('../../core/elements/manager.js' as string);
    if (existing?.id)
        removeElement(existing.id);
    const id = `boundary-${Date.now()}`;
    addElement('boundary', id, 'Boundary', { polygon });
}
/**
 * Persiste novo modelo clonado com boundary atualizado.
 * @param {Object} newModel
 * @returns {Promise<void>}
 */
async function _persistNewModel(newModel: any) {
    const m = (newModel);
    try {
        // Tenta usar o registry de modelos se disponível
        const { createModel } = await import('../../core/models/registry.js' as string);
        await createModel({ name: m.name, source: 'boundary_clone' });
    }
    catch (err: any) {
        // Fallback: apenas registra no log - o modelo foi construído na memória
        log.warn('_persistNewModel: registry not available, model lives in memory only:', err);
    }
}
// ──────────────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────────────
/**
 * Chamado após o usuário completar o desenho de um boundary.
 *
 * Fluxo:
 * 1. Carrega elementos do modelo ativo
 * 2. Detecta conflito (boundary existente)
 * 3. Sem conflito → salva silenciosamente
 * 4. Com conflito → diálogo de escolha:
 *    a) Criar novo → asyncPrompt para nome → buildModelWithNewBoundary → toast
 *    b) Sobrescrever → segundo asyncConfirm (ação destrutiva) → substitui
 *    c) Cancelar → descarta sem alterar modelo
 *
 * @param {Array<{x: number, y: number, z: number}>} polygon - pontos do boundary desenhado
 * @returns {Promise<void>}
 */
export async function handleBoundaryDrawComplete(polygon: any) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
        showToast('Boundary inválido — mínimo 3 pontos.', 'error');
        log.warn('handleBoundaryDrawComplete: polygon too short', polygon?.length);
        return;
    }
    // TRUST-009 G3: valida topologia antes de salvar. Self-intersect/degenerate rejeitados.
    // polygon é Array<{x, y, z}>; canônico espera {x, y} — droppa z.
    const ringForValidation = polygon.map((p: any) => ({ x: p.x, y: p.z ?? p.y ?? 0 }));
    const v = validatePolygonRing(ringForValidation);
    if (!v.valid) {
        const codes = v.errors.map((e: any) => e.code).join(', ');
        showToast(`Boundary inválido (${codes}). Redesenhe sem auto-intersecção e com ≥3 vértices.`, 'error');
        log.warn('handleBoundaryDrawComplete: topology invalid', codes);
        return;
    }
    let elements;
    try {
        elements = await _getElements();
    }
    catch (err: any) {
        log.error('handleBoundaryDrawComplete: failed to load elements', err);
        showToast('Erro ao verificar modelo. Tente novamente.', 'error');
        return;
    }
    const { hasConflict, existing } = detectBoundaryConflict(elements);
    if (!hasConflict) {
        // Caminho direto - sem boundary existente
        try {
            await _saveBoundaryToCurrentModel(polygon);
            showToast('Boundary salvo com sucesso.', 'success');
        }
        catch (err: any) {
            log.error('handleBoundaryDrawComplete: save failed', err);
            showToast('Erro ao salvar boundary.', 'error');
        }
        return;
    }
    // Boundary existente - perguntar ao usuário o que fazer
    const createNew = await asyncConfirm('Já existe um boundary neste modelo.\n\nCriar um novo modelo com o boundary atualizado (recomendado) ou sobrescrever o atual?', {
        confirmLabel: 'Criar novo modelo',
        cancelLabel: 'Sobrescrever atual',
        danger: false,
    });
    if (createNew) {
        // Usuário escolheu criar novo modelo
        const currentName = _getCurrentModelName();
        const suggestedName = suggestBoundaryModelName(currentName);
        const newName = await asyncPrompt('Nome para o novo modelo com boundary atualizado:', suggestedName, {
            confirmLabel: 'Criar',
            cancelLabel: 'Cancelar',
        });
        if (newName === null || (typeof newName === 'string' && newName.trim() === '')) {
            // Usuário cancelou o prompt de nome
            showToast('Criação de novo modelo cancelada.', 'info');
            return;
        }
        try {
            const baseModel = _buildBaseModelSnapshot(elements, currentName);
            const newModel = buildModelWithNewBoundary(baseModel, polygon, newName.trim());
            await _persistNewModel(newModel);
            showToast(`Novo modelo "${newModel.name}" criado com o boundary atualizado.`, 'success');
        }
        catch (err: any) {
            log.error('handleBoundaryDrawComplete: create_new failed', err);
            showToast('Erro ao criar novo modelo.', 'error');
        }
        return;
    }
    // Usuário escolheu sobrescrever - requer segunda confirmação (ação destrutiva)
    const confirmed = await asyncConfirm('&#9888; Sobrescrever o boundary atual é uma ação irreversível. O boundary anterior será perdido.\n\nContinuar?', {
        confirmLabel: 'Sobrescrever',
        cancelLabel: 'Cancelar',
        danger: true,
    });
    if (!confirmed) {
        showToast('Sobrescrita cancelada.', 'info');
        return;
    }
    try {
        await _overwriteExistingBoundary((existing), polygon);
        showToast('Boundary atualizado com sucesso.', 'success');
    }
    catch (err: any) {
        log.error('handleBoundaryDrawComplete: overwrite failed', err);
        showToast('Erro ao sobrescrever boundary.', 'error');
    }
}
// ──────────────────────────────────────────────────────────────────────
// Internal utilities
// ──────────────────────────────────────────────────────────────────────
/**
 * Obtém o nome do modelo ativo de forma resiliente.
 * @returns {string}
 */
function _getCurrentModelName() {
    if (typeof window !== 'undefined' && typeof ((window).getActiveModelName) === 'function') {
        return (window).getActiveModelName() || 'Modelo';
    }
    return 'Modelo';
}
/**
 * Monta snapshot do modelo base a partir dos elementos atuais.
 * Usado para gerar clone sem depender de acesso async ao registry.
 * @param {Array<any>} elements
 * @param {string} name
 * @returns {Object}
 */
function _buildBaseModelSnapshot(elements: any, name: any) {
    return {
        id: `base-${Date.now()}`,
        name: name || 'Modelo',
        elements: Array.isArray(elements) ? elements : [],
    };
}
