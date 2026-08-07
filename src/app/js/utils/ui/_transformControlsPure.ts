// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// ARCH-MONOLITH-ATOMIZATION-001 — Pure-logic extraction (UI_REUSE_PLAYBOOK P3 renderer).
//
// Strategy: extract the transform-controls HTML builder from utils/ui/lists.ts
// (#6+ monolito). It is a pure presentational function: element object → HTML
// string, with the icon renderer injected (no document/window/module-state refs).
//
// Read from canonical .ts source (not derived .js) per
// memory/feedback_read_ts_canonical_not_js_derived.md (2026-05-27).
//
// Spec NOT:
// - NÃO ler DOM (recebe element; retorna string)
// - NÃO ler i18n / icons direto (getIcon injetado via deps)
// - NÃO mutar estado de módulo
// - Comportamento IDÊNTICO ao inline original (zero-diff de markup)

/** Renderer de ícone injetado (assinatura de utils/ui/icons.ts getIcon). */
export type IconRenderer = (name: string, opts?: { size?: string; class?: string }) => string;

/** Dependências injetadas no builder puro. */
export interface TransformControlsDeps {
    getIcon: IconRenderer;
}

/**
 * Renderiza os controles de posição, escala, rotação e cor de um elemento.
 *
 * Pure: deriva todo o markup do objeto `element` + `deps.getIcon`. Não acessa
 * DOM, i18n nem estado de módulo. Markup idêntico ao bloco inline original que
 * vivia em `lists.ts` (`renderTransformControls`).
 *
 * @param {any} element - Elemento selecionado
 * @param {TransformControlsDeps} deps - Dependências (getIcon)
 * @returns {string} HTML
 */
export function renderTransformControls(element: any, deps: TransformControlsDeps): string {
    const getIcon = deps.getIcon;
    const pos = element.data?.center || element.data?.position || { x: 0, y: 0, z: 0 };
    const scl = element.data?.scale || { x: 1, y: 1, z: 1 };
    const rot = element.data?.rotation || { x: 0, y: 0, z: 0 };
    const color = element.color || '#3b6bff';
    const id = element.id;
    return `
        <div class="transform-controls">
            <div class="transform-section">
                <label class="transform-label">${getIcon('move', { size: '12px' })} Posição</label>
                <div class="transform-row">
                    <label class="axis-label">X</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:position:x" type="number" class="transform-input" step="0.1" value="${pos.x || 0}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:position|t|j:0">
                    <label class="axis-label">Cota</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:position:y" type="number" class="transform-input ty" step="0.1" value="${pos.y || 0}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:position|t|j:0">
                    <label class="axis-label">Y</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:position:z" type="number" class="transform-input tz" step="0.1" value="${pos.z || 0}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:position|t|j:0">
                </div>
            </div>
            <div class="transform-section">
                <label class="transform-label">${getIcon('maximize', { size: '12px' })} Escala</label>
                <div class="transform-row">
                    <label class="axis-label">X</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:scale:x" type="number" class="transform-input" step="0.1" min="0.01" value="${scl.x || 1}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:scale|t|j:1">
                    <label class="axis-label">Y</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:scale:y" type="number" class="transform-input sy" step="0.1" min="0.01" value="${scl.y || 1}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:scale|t|j:1">
                    <label class="axis-label">Z</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:scale:z" type="number" class="transform-input sz" step="0.1" min="0.01" value="${scl.z || 1}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:scale|t|j:1">
                </div>
            </div>
            <div class="transform-section">
                <label class="transform-label">${getIcon('rotate', { size: '12px' })} Rotação (°)</label>
                <div class="transform-row">
                    <label class="axis-label">X</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:rotation:x" type="number" class="transform-input" step="1" value="${rot.x || 0}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:rotation|t|j:0">
                    <label class="axis-label">Y</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:rotation:y" type="number" class="transform-input ry" step="1" value="${rot.y || 0}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:rotation|t|j:0">
                    <label class="axis-label">Z</label>
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:rotation:z" type="number" class="transform-input rz" step="1" value="${rot.z || 0}"
                           data-cc-call-input="handleElementTransformXYZ|s:${encodeURIComponent(`${id}`)}|s:rotation|t|j:0">
                </div>
            </div>
            <div class="transform-section">
                <label class="transform-label">${getIcon('palette', { size: '12px' })} Cor</label>
                <div class="transform-row">
                    <input type="color" class="transform-color" value="${color}"
                           data-cc-call-input="handleElementTransform|s:${encodeURIComponent(`${id}`)}|s:color|v">
                    <input data-field-meta="true" data-field-meta-key="element:${id}:transform:color" type="text" class="transform-input transform-color-hex" value="${color}" placeholder="#3b6bff"
                           data-cc-call-input="handleElementTransformColor|s:${encodeURIComponent(`${id}`)}|t">
                </div>
            </div>
        </div>
    `;
}
