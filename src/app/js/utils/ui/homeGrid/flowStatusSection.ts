// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * flowStatusSection.ts - Render da secao "onde estamos no fluxo" (stepper de
 * 5 blocos) no topo da aba Actions.
 *
 * ACTIONS-FLOW-001 FS-4 (claude-adm 2026-07-02).
 *
 * EN: DOM-coupled render section, mirrors the structural pattern of
 *     `homeSuggested.ts` (renderHomeSuggested): a thin function that takes a
 *     target container + injected deps, computes state via a pure helper
 *     (`computeFlowStatus`), and writes markup into the container via
 *     `innerHTML`. Here the "markup" is the native SVG string produced by
 *     `renderFlowDiagramSvg` (flowBlocksToPipelineModel.ts), which already
 *     wraps `buildPipelineDiagramSvg` (NATIVE-PIPELINE-DIAGRAM-001). No new
 *     rendering logic is introduced — this file only wires the two pure
 *     modules (FS-1 + FS-3) to the DOM, same division of responsibility used
 *     across homeGrid/* section modules (ARCH-SPLIT-HOMEGRID-001).
 *
 * PT (leigo): desenha o fluxograma de 5 blocos ("onde estamos") dentro do
 *     elemento recebido. Calcula o estado dos blocos com a mesma função pura
 *     já usada (computeFlowStatus), converte para SVG com o adaptador que já
 *     existe (renderFlowDiagramSvg) e injeta o SVG no container. Não inventa
 *     lógica nova de render — só liga as duas peças já prontas ao DOM, do
 *     mesmo jeito que as outras seções da home (ex.: homeSuggested.ts) fazem.
 */

import { computeFlowStatus, type FlowStatusDeps } from './flowStatusHelpers.js';
import { renderFlowDiagramSvg } from './flowBlocksToPipelineModel.js';

/** Dependencias injetadas para `renderFlowStatusSection` (repassadas a `computeFlowStatus`). */
export type FlowStatusSectionDeps = FlowStatusDeps;

/**
 * Renderiza a secao de status do fluxo (5 blocos + conectores, SVG nativo)
 * dentro de `container`. Idempotente: cada chamada recalcula o estado a
 * partir de `deps` e substitui o conteudo anterior (re-render seguro quando
 * o modelo muda — spec §5.7).
 *
 * @param container Elemento-alvo da secao (topo do `#home-container`).
 * @param deps Dependencias repassadas a `computeFlowStatus` (ver `FlowStatusDeps`).
 */
export function renderFlowStatusSection(
    container: HTMLElement | null,
    deps: FlowStatusSectionDeps = {},
): void {
    if (!container) return;

    const { blocks } = computeFlowStatus(deps);
    const svg = renderFlowDiagramSvg(blocks);

    container.innerHTML = svg;
}
