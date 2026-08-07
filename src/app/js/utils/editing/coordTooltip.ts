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
   COORD TOOLTIP — Inline coordinate display during drag
   ================================================================

   Mostra tooltip flutuante com coordenadas XYZ junto ao cursor
   durante operações de drag em handles de edição.

   - Posição: 20px abaixo e 15px à direita do cursor
   - Flip automático perto das bordas do canvas
   - pointer-events: none para não interferir com handles
   - Omite Y se ~0 (terreno plano, caso mais comum)

   ================================================================ */

// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------

let _tooltip: HTMLDivElement | null = null;
let _container: HTMLElement | null = null;

// ----------------------------------------------------------------
// INICIALIZAÇÃO LAZY
// ----------------------------------------------------------------

/**
 * Cria o elemento DOM do tooltip na primeira chamada.
 * @private
 */
function _ensureTooltip(): void {
    if (_tooltip) return;

    _container = document.getElementById('canvas-container');
    if (!_container) return;

    _tooltip = document.createElement('div');
    _tooltip.className = 'edit-coord-tooltip';
    _tooltip.style.display = 'none';
    _container.appendChild(_tooltip);
}

// ----------------------------------------------------------------
// API PÚBLICA
// ----------------------------------------------------------------

export interface WorldPosition {
    x: number;
    y: number;
    z: number;
}

/**
 * Mostra tooltip com coordenadas na posição do mouse.
 *
 * @param clientX - Mouse clientX (event.clientX)
 * @param clientY - Mouse clientY (event.clientY)
 * @param worldPos - Posicao 3D no mundo (THREE.Vector3 shape)
 */
export function showCoordTooltip(
    clientX: number,
    clientY: number,
    worldPos: WorldPosition,
): void {
    _ensureTooltip();
    if (!_tooltip || !_container) return;

    // Formata coordenadas - omite Y se próximo de zero
    const x = worldPos.x.toFixed(2);
    const z = worldPos.z.toFixed(2);
    const showY = Math.abs(worldPos.y) > 0.1;

    _tooltip.textContent = showY ? `X: ${x}  Y: ${worldPos.y.toFixed(2)}  Z: ${z}` : `X: ${x}  Z: ${z}`;

    // Calcula posição relativa ao container
    const rect = _container.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    // Offset padrão: 15px à direita, 20px abaixo
    let left = relX + 15;
    let top = relY + 20;

    // Flip se perto da borda - evita recorte
    const tooltipW = _tooltip.offsetWidth || 120;
    const tooltipH = _tooltip.offsetHeight || 24;

    if (left + tooltipW > rect.width - 8) {
        left = relX - tooltipW - 10;
    }
    if (top + tooltipH > rect.height - 8) {
        top = relY - tooltipH - 10;
    }

    _tooltip.style.left = `${left}px`;
    _tooltip.style.top = `${top}px`;
    _tooltip.style.display = '';
}

/**
 * Esconde o tooltip.
 */
export function hideCoordTooltip(): void {
    if (_tooltip) _tooltip.style.display = 'none';
}

/**
 * Remove o tooltip do DOM. Chamar ao destruir o editor.
 */
export function disposeCoordTooltip(): void {
    if (_tooltip) {
        _tooltip.remove();
        _tooltip = null;
    }
    _container = null;
}