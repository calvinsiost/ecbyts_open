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
   SPRITE BILLBOARD FACTORY
   ================================================================

   Cria sprites billboard (sempre virados para a camera) com
   glow radial e forma central customizavel.

   Usado por: intangible (losango) e generic (circulo).
   Extensivel para novas familias billboard.

   ================================================================ */

import { createTHREEProxy } from '../three-lazy.js';
const T: any = createTHREEProxy();
import { parseColor } from './meshHelpers.js';

/**
 * Cria sprite billboard com glow radial e forma central parametrizada.
 *
 * @param data - Dados do elemento (position)
 * @param element - Elemento completo (com color)
 * @param opts - Opcoes de configuracao
 * @returns Sprite billboard
 */
export function createSpriteBillboard(data: object, element: object, opts: object): any {
    const o = opts as any;
    const { defaultColor, glowMidStop = 0.5, drawShape, baseScale = 5, defaultY = 3 } = o;

    const baseColor = parseColor((element as any)?.color) || defaultColor;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const cx = 64,
        cy = 64;

    // Glow radial (halo suave - cor do elemento com fade)
    const hex = '#' + (baseColor & 0xffffff).toString(16).padStart(6, '0');
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
    grad.addColorStop(0, hex);
    grad.addColorStop(glowMidStop, hex + '88');
    grad.addColorStop(1, hex + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Forma central customizada (losango, circulo, etc.)
    if (drawShape) {
        drawShape(ctx, cx, cy);
    }

    const texture = new T.CanvasTexture(canvas);
    const material = new T.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false, // Evita que fog esconda billboards
    });

    const sprite = new T.Sprite(material);
    sprite.scale.set(baseScale, baseScale, 1);
    const d = data as any;
    sprite.position.set(d.position?.x || 0, d.position?.y || defaultY, d.position?.z || 0);

    // Escala adaptativa: mantem tamanho visual constante independente do zoom
    // Intangiveis nao tem dimensao fisica - tamanho na tela deve ser estavel
    sprite.onBeforeRender = function (
        this: any,
        _renderer: any,
        _scene: any,
        camera: any,
    ) {
        const s = baseScale / (camera.zoom || 1);
        this.scale.set(s, s, 1);
    };

    return sprite;
}
