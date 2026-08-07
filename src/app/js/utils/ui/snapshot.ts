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
   SNAPSHOT — Captura de screenshot do canvas 3D como PNG
   Permite ao usuario exportar uma imagem limpa da cena 3D.
   ================================================================ */

import { sceneOwner } from '../../core/scene/lifecycleOwner.js';
import { showToast } from './toast.js';

/**
 * Captura o canvas WebGL e faz download como PNG.
 * Tira um screenshot limpo da cena 3D atual.
 *
 * 2026-04-11 (SPEC_SCENE_LIFECYCLE §M4): agora usa sceneOwner.captureFrame()
 * que faz await rAF → render sync → toDataURL no mesmo tick.
 * Isso garante frame consistente - eliminando o bug "a tela muda ao clicar
 * Captura" que expunha dessincronia entre estado JS e buffer WebGL.
 */
export async function captureSnapshot(): Promise<void> {
    // REF-SWEEPS-001#capture-sem-feedback-no-workspace: feedback síncrono no
    // caminho COM cena montada. Antes o handler rodava (download acontecia) mas
    // o usuário não via NENHUM efeito observável em 3s — clique parecia morto.
    // Agora há toast imediato ("Capturando…") + confirmação após o download.
    showToast('Capturando snapshot…', 'info');
    try {
        const dataUrl: string = await sceneOwner.captureFrame();
        const ts: string = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `ecbyts-snapshot-${ts}.png`;
        const a: HTMLAnchorElement = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`Snapshot salvo: ${filename}`, 'success');
    } catch (err: any) {
        console.error('[ecbyts:snapshot] captureFrame failed:', err?.message || err);
        // capture_before_init = cena 3D ainda não foi aberta/inicializada
        // (estado IDLE). Dá feedback acionável ao usuário em vez de falhar
        // em silêncio quando o botão "Captura" do menu Mais é clicado cedo.
        const msg =
            err?.code === 'capture_before_init'
                ? 'Abra a visualização 3D antes de capturar um snapshot.'
                : 'Não foi possível capturar o snapshot da cena.';
        showToast(msg, 'warning');
    }
}
