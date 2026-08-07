// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Captura TOP-DOWN ortográfica do viewport 3D para uso como basemap aerofotogramétrico
// em figuras de relatório (Fase 1.7 — RF-1.7c, spec SPEC_AI_REPORT_TEMPLATE_MARKETPLACE).
//
// Estratégia: salva NADA do estado original (renderer re-renderiza com a câmera original
// no fim — o loop de animação subsequente também reverte naturalmente); cria uma
// OrthographicCamera zenital centrada no centroide com extent = 2*radiusM*(1+padding);
// renderiza um frame (preserva overlays aerial/geo/pedo ativos); captura
// `renderer.domElement.toDataURL('image/jpeg', quality)`. Idempotente, recuperável,
// degradação graciosa (retorna null em qualquer falha — RF-1.7d).
//
// As partes puras (computeOrthoBounds, computeOrthoCameraPlacement) são cheap-testáveis;
// a integração com THREE+sceneOwner é browser-side.

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

export interface OrthoBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
    /** Half-extent em metros (raio coberto + padding). */
    halfM: number;
}

export interface CameraPlacement {
    position: { x: number; y: number; z: number };
    lookAt: { x: number; y: number; z: number };
    up: { x: number; y: number; z: number };
}

export interface CaptureTopDownOpts {
    centroidX: number;
    centroidZ: number;
    /** Raio em metros — typicamente o R_outer da figura (ex.: 1000). */
    radiusM: number;
    /** Margem extra fracional (default 0.1 = 10%). */
    padding?: number;
    /** Qualidade JPEG (0..1, default 0.7) — JPEG é mais compacto que PNG p/ basemap aéreo. */
    quality?: number;
    /** Altura da câmera ortográfica acima do plano y=0 (default 10000 m). */
    altitudeM?: number;
}

/**
 * Calcula os limites da câmera ortográfica (left/right/top/bottom) para um raio
 * em metros + padding. Pure.
 */
export function computeOrthoBounds(radiusM: number, padding: number = 0.1): OrthoBounds {
    const r = typeof radiusM === 'number' && radiusM > 0 ? radiusM : 0;
    const p = typeof padding === 'number' && padding >= 0 ? padding : 0.1;
    const halfM = r * (1 + p);
    return { left: -halfM, right: halfM, top: halfM, bottom: -halfM, halfM };
}

/**
 * Posiciona a câmera ortográfica zenital sobre o centroide. Convenção do ecbyts:
 * y é a vertical; norte é -z (para que `up.z = -1` deixe o norte "para cima" na imagem).
 * Pure.
 */
export function computeOrthoCameraPlacement(cx: number, cz: number, altitudeM: number = 10000): CameraPlacement {
    const x = toFiniteNumber(cx, 0);
    const z = toFiniteNumber(cz, 0);
    const y = typeof altitudeM === 'number' && altitudeM > 0 ? altitudeM : 10000;
    return {
        position: { x, y, z },
        lookAt: { x, y: 0, z },
        up: { x: 0, y: 0, z: -1 },
    };
}

/**
 * Captura um frame top-down do viewport ecbyts como data URL JPEG. Browser-only.
 * Retorna null em qualquer falha (degradação graciosa — RF-1.7d).
 */
export async function captureTopDownBasemap(opts: CaptureTopDownOpts): Promise<string | null> {
    try {
        if (!opts || typeof opts !== 'object') return null;
        const radiusM = typeof opts.radiusM === 'number' && opts.radiusM > 0 ? opts.radiusM : 0;
        if (!radiusM) return null;
        const padding = typeof opts.padding === 'number' ? opts.padding : 0.1;
        const quality = typeof opts.quality === 'number' ? Math.max(0, Math.min(1, opts.quality)) : 0.7;
        const altitude = typeof opts.altitudeM === 'number' && opts.altitudeM > 0 ? opts.altitudeM : 10000;
        const THREE: any = await import('three' as string);
        const ownerMod: any = await import('../../core/scene/lifecycleOwner.js' as string);
        const owner = ownerMod?.sceneOwner;
        const scene = owner?.getScene?.();
        const renderer = owner?.getRenderer?.();
        const camera = owner?.getCamera?.();
        if (!scene || !renderer || !camera || !THREE?.OrthographicCamera) return null;
        const { left, right, top, bottom } = computeOrthoBounds(radiusM, padding);
        const placement = computeOrthoCameraPlacement(opts.centroidX, opts.centroidZ, altitude);
        const ortho = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, altitude * 10);
        ortho.position.set(placement.position.x, placement.position.y, placement.position.z);
        ortho.up.set(placement.up.x, placement.up.y, placement.up.z);
        ortho.lookAt(placement.lookAt.x, placement.lookAt.y, placement.lookAt.z);
        ortho.updateProjectionMatrix();
        // Render top-down + capture
        renderer.render(scene, ortho);
        const canvas: HTMLCanvasElement | null = renderer?.domElement || null;
        if (!canvas || typeof canvas.toDataURL !== 'function') return null;
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        // Re-render com a câmera original — o loop de animação seguinte também reverte
        try {
            renderer.render(scene, camera);
        } catch (re: any) {
            console.debug('[captureTopDownBasemap:restore]', re?.message || re);
        }
        // Sanity: data URL JPEG válido
        if (typeof dataUrl !== 'string' || !/^data:image\/jpeg;base64,/.test(dataUrl)) return null;
        return dataUrl;
    } catch (e: any) {
        console.debug('[captureTopDownBasemap]', e?.message || e);
        return null;
    }
}
