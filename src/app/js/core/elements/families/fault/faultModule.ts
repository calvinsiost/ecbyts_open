// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Fault Family - Profile Module (SVG Side View)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   FAULT MODULE — Modulo plugavel para familia 'fault'.

   Renderiza visualizacao lateral (side view) de falha geologica
   mostrando angulo de mergulho (dip) e direcao de strike.

   Referencia: Structural geology conventions (right-hand rule).
   ================================================================ */

import { FamilyModule, SVG_NS } from '../_base/FamilyModule.js';

// ----------------------------------------------------------------
// CONSTANTS - Layout
// ----------------------------------------------------------------

/** Pixels por metro de profundidade */
const PX_PER_M = 4;

/** Margem interna do SVG */
const MARGIN = 20;

/** Cor padrao da falha */
const FAULT_COLOR = '#8B0000';

// ----------------------------------------------------------------
// FAULT MODULE CLASS
// ----------------------------------------------------------------

/**
 * Modulo de familia para falhas geologicas.
 * Renderiza perfil lateral com angulo de dip e deslocamento.
 *
 * @extends FamilyModule
 */
export class FaultModule extends FamilyModule {
    /** Override of FamilyModule base method. */
    override _getFamilyId(): string {
        return 'fault';
    }

    /** Override of FamilyModule base method. */
    override getStyles(): string {
        return `
            .ecbt-fm-fault { font-family: sans-serif; }
            .ecbt-fm-fault .fault-label { font-size: 11px; fill: #888; }
            .ecbt-fm-fault .fault-line { stroke: ${FAULT_COLOR}; stroke-width: 2; }
            .ecbt-fm-fault .fault-plane { fill: ${FAULT_COLOR}; opacity: 0.3; }
            .ecbt-fm-fault .dip-arc { fill: none; stroke: #666; stroke-width: 1; }
        `;
    }

    /**
     * Renderiza perfil lateral da falha mostrando dip angle.
     * Vista em corte transversal ao strike.
     *
     * @param element - Elemento da falha com dados
     * @returns SVG do perfil lateral
     */
    renderProfile(element: Record<string, any>): SVGElement {
        const data = element?.data || {};
        const dipAngle = data.dipAngle ?? 60;
        const depth = data.depth ?? 50;
        const _length = data.length ?? 100;

        const svgWidth = 300;
        const svgHeight = depth * PX_PER_M + MARGIN * 2;

        const svg = (document.createElementNS(SVG_NS, 'svg') as unknown) as SVGElement;
        svg.setAttribute('width', String(svgWidth));
        svg.setAttribute('height', String(svgHeight));
        svg.setAttribute('class', 'ecbt-fm-fault');

        // Superficie do terreno (linha horizontal)
        const surface = document.createElementNS(SVG_NS, 'line');
        surface.setAttribute('x1', String(MARGIN));
        surface.setAttribute('y1', String(MARGIN));
        surface.setAttribute('x2', String(svgWidth - MARGIN));
        surface.setAttribute('y2', String(MARGIN));
        surface.setAttribute('stroke', '#4a7c59');
        surface.setAttribute('stroke-width', '2');
        svg.appendChild(surface);

        // Plano da falha (linha inclinada pelo dip)
        const dipRad = (dipAngle * Math.PI) / 180;
        const startX = svgWidth / 2;
        const startY = MARGIN;
        const endX = startX + (depth * PX_PER_M) / Math.tan(dipRad);
        const endY = MARGIN + depth * PX_PER_M;

        const faultLine = document.createElementNS(SVG_NS, 'line');
        faultLine.setAttribute('x1', String(startX));
        faultLine.setAttribute('y1', String(startY));
        faultLine.setAttribute('x2', String(endX));
        faultLine.setAttribute('y2', String(endY));
        faultLine.setAttribute('class', 'fault-line');
        svg.appendChild(faultLine);

        // Arco indicando angulo de dip
        this._drawDipArc(svg, startX, startY, dipAngle);

        // Label do angulo
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(startX + 35));
        label.setAttribute('y', String(startY + 25));
        label.setAttribute('class', 'fault-label');
        label.textContent = `${dipAngle}\u00B0`;
        svg.appendChild(label);

        return svg;
    }

    /**
     * Desenha arco de angulo de dip no SVG.
     *
     * @param svg - Elemento SVG pai
     * @param cx - Centro X do arco
     * @param cy - Centro Y do arco
     * @param angleDeg - Angulo de dip em graus
     */
    _drawDipArc(svg: SVGElement, cx: number, cy: number, angleDeg: number): void {
        const r = 25;
        const startAngle = Math.PI / 2; // vertical (down)
        const endAngle = (angleDeg * Math.PI) / 180;

        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.sin(endAngle);
        const y2 = cy + r * Math.cos(endAngle);

        const largeArc = angleDeg > 180 ? 1 : 0;
        const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;

        const arc = document.createElementNS(SVG_NS, 'path');
        arc.setAttribute('d', d);
        arc.setAttribute('class', 'dip-arc');
        svg.appendChild(arc);
    }

    /** Override of FamilyModule base method. */
    override getDefaultData(): Record<string, any> {
        return {
            strikeAngle: 0,
            dipAngle: 60,
            length: 100,
            depth: 50,
        };
    }

    /** Override of FamilyModule base method. */
    override getSchema(): Record<string, any> {
        return {
            type: 'object',
            properties: {
                strikeAngle: { type: 'number', minimum: 0, maximum: 360 },
                dipAngle: { type: 'number', minimum: 0, maximum: 90 },
                length: { type: 'number', minimum: 1 },
                depth: { type: 'number', minimum: 1 },
                displacement: { type: 'number', minimum: 0 },
                fault_type: {
                    type: 'string',
                    enum: ['normal', 'reverse', 'strike_slip', 'oblique'],
                },
                activity_status: {
                    type: 'string',
                    enum: ['active', 'inactive', 'unknown'],
                },
            },
        };
    }
}
