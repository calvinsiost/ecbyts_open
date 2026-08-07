// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// ARCH-MONOLITH-ATOMIZATION-001 — pure-logic extraction from scene/magnifier.ts.
//
// O monolito utils/scene/magnifier.ts (572L) tinha o MESMO cálculo de geometria
// da lupa duplicado VERBATIM em duas funções (_captureMagnifiedRegion linhas
// 432-455 e _renderMagnifier linhas 527-560): o retângulo de scissor/viewport
// (em pixels do canvas WebGL) e o frustum ortográfico ampliado centrado no mouse.
// Esta é matemática PURA (sem THREE, sem DOM, sem render) — extraída para o
// monolito chamar uma única fonte de verdade. Comportamento idêntico provado
// por cheap test (tests/scene-magnifier-geometry-pure.test.mjs).
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler THREE.js / renderer / camera (caller injeta números crus)
// - NÃO ler module state (mouseX/overlayCenter etc. são passados por parâmetro)
// - NÃO mexer em scissor/viewport reais nem render (caller aplica o resultado)
// - NÃO emoji
//
// Extracted helpers:
//   - computeLensScissorRect    (px → retângulo GL bottom-up: sx, sy, sw, sh)
//   - computeMagnifiedFrustum   (NDC do mouse + frustum original + mag → novo frustum)
//   - computeLensCropRect       (scissor GL bottom-up → crop top-down p/ canvas 2D)

/**
 * Retângulo de scissor/viewport da lupa, em pixels do framebuffer WebGL.
 *
 * O sistema de coordenadas do GL tem origem no canto inferior-esquerdo
 * (bottom-up), por isso `sy` inverte a coordenada vertical do overlay
 * (que vem em CSS px top-down).
 *
 * @param {object} input
 * @param {number} input.lensSize        Lado da lupa em CSS px (quadrado).
 * @param {number} input.overlayCenterX  Centro do overlay em CSS px (top-down).
 * @param {number} input.overlayCenterY  Centro do overlay em CSS px (top-down).
 * @param {number} input.pixelRatio      renderer.getPixelRatio().
 * @param {number} input.glCanvasH       canvas.height (px do framebuffer).
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function computeLensScissorRect(input: {
    lensSize: number;
    overlayCenterX: number;
    overlayCenterY: number;
    pixelRatio: number;
    glCanvasH: number;
}): { sx: number; sy: number; sw: number; sh: number } {
    const { lensSize, overlayCenterX, overlayCenterY, pixelRatio, glCanvasH } = input;
    const half = (lensSize / 2) * pixelRatio;
    const px = overlayCenterX * pixelRatio;
    const py = overlayCenterY * pixelRatio;
    const sx = Math.round(px - half);
    const sy = Math.round(glCanvasH - py - half);
    const sw = Math.round(half * 2);
    const sh = sw;
    return { sx, sy, sw, sh };
}

/**
 * Frustum ortográfico ampliado, centrado no ponto do mouse.
 *
 * Para uma OrthographicCamera, left/right/top/bottom definem a região do
 * mundo visível (já escalada por zoom). Queremos mostrar 1/magnification
 * dessa região, centrada no ponto do mouse:
 *   1. NDC do mouse no viewport ORIGINAL (full canvas), -1..+1
 *   2. centro do mouse em world units, relativo ao centro da câmera
 *   3. novo frustum = 1/mag do tamanho, em torno desse centro
 *
 * @param {object} input
 * @param {number} input.mouseX         Posição do mouse em CSS px (top-down).
 * @param {number} input.mouseY         Posição do mouse em CSS px (top-down).
 * @param {number} input.canvasW        canvas.clientWidth (CSS px).
 * @param {number} input.canvasH        canvas.clientHeight (CSS px).
 * @param {number} input.left           cam.left original.
 * @param {number} input.right          cam.right original.
 * @param {number} input.top            cam.top original.
 * @param {number} input.bottom         cam.bottom original.
 * @param {number} input.magnification  Fator de ampliação (>0).
 * @returns {{ left: number, right: number, top: number, bottom: number }}
 */
export function computeMagnifiedFrustum(input: {
    mouseX: number;
    mouseY: number;
    canvasW: number;
    canvasH: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    magnification: number;
}): { left: number; right: number; top: number; bottom: number } {
    const { mouseX, mouseY, canvasW, canvasH, left, right, top, bottom, magnification } = input;
    const ndcX = (mouseX / canvasW) * 2 - 1;
    const ndcY = -(mouseY / canvasH) * 2 + 1;
    const visW = right - left;
    const visH = top - bottom;
    const mwx = (ndcX * visW) / 2;
    const mwy = (ndcY * visH) / 2;
    const halfW = visW / (2 * magnification);
    const halfH = visH / (2 * magnification);
    return {
        left: mwx - halfW,
        right: mwx + halfW,
        top: mwy + halfH,
        bottom: mwy - halfH,
    };
}

/**
 * Retângulo de crop para canvas 2D (top-down), a partir do scissor GL
 * (bottom-up). `toDataURL()` retorna a imagem top-to-bottom enquanto o GL
 * é bottom-to-top, daí o y-flip.
 *
 * @param {object} input
 * @param {number} input.sx         scissor x (GL).
 * @param {number} input.sy         scissor y (GL, bottom-up).
 * @param {number} input.sw         scissor width.
 * @param {number} input.sh         scissor height.
 * @param {number} input.glCanvasH  canvas.height (px do framebuffer).
 * @returns {{ cropX: number, cropY: number, cropW: number, cropH: number }}
 */
export function computeLensCropRect(input: {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    glCanvasH: number;
}): { cropX: number; cropY: number; cropW: number; cropH: number } {
    const { sx, sy, sw, sh, glCanvasH } = input;
    return {
        cropX: sx,
        cropY: glCanvasH - sy - sh, // y-flip GL→canvas2D
        cropW: sw,
        cropH: sh,
    };
}
