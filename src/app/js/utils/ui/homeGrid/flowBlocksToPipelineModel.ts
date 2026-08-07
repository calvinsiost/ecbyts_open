/**
 * Escapa um valor para uso seguro dentro de um atributo HTML/SVG entre aspas
 * duplas (anti-XSS): `& " < >` viram entidades. Rótulos/statusText dos blocos
 * são controlados (i18n fixo), mas o escape é defesa em profundidade.
 */
function escAttr(v: string): string {
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Escolhe o bloco "atual" do stepper (espelha `pickStartNodeId`): o primeiro
 * `em_andamento`; na ausência, o primeiro `nao_iniciado`; senão, o 1º bloco.
 * Usado para marcar `aria-current="step"` (spec §4 — USWDS Step Indicator).
 */
function pickCurrentBlockId(blocks: ReadonlyArray<FlowBlock>): string | null {
    const inProgress = blocks.find((b) => b.state === 'em_andamento');
    if (inProgress) return inProgress.id;
    const notStarted = blocks.find((b) => b.state === 'nao_iniciado');
    return notStarted ? notStarted.id : (blocks[0]?.id ?? null);
}

/**
 * FS-6 (ACTIONS-FLOW-001) — acessibilidade do SVG do fluxograma.
 *
 * Para CADA nó `<g data-node-id>` injeta:
 * - `role="img"` + `aria-label="<label> — <statusText>"` (leitura de tela
 *   anuncia a etapa e seu estado — spec §4/micropasso FS-6);
 * - `aria-current="step"` no bloco atual (em_andamento; fallback nao_iniciado);
 * - em blocos clicáveis (com `handler`, ver FS-5): `tabindex="0"` (entram na
 *   ordem de foco do teclado, na sequência esquerda→direita do stepper) +
 *   `data-cc-call-keydown` + `data-cc-key="Enter"` (ativação por Enter via o
 *   mesmo delegate CSP-safe; handlers já whitelisted em FS-5). Assim o bloco
 *   é alcançável E ativável por teclado, não só por mouse.
 *
 * Contraste AA (tema escuro): a paleta navy+ciano foi escolhida em FS-3 para
 * AA; esta atividade NÃO altera cores (evita quebrar o baseline visual) — a
 * verificação de contraste fica documentada. CSP: NÃO emite `on*` inline.
 *
 * Puro (string → string), determinístico, sem DOM. Âncora `data-node-id="<id>"`
 * (sem o `>` final) para funcionar tanto antes quanto depois da injeção de
 * clique do FS-5 (que acrescenta `data-cc-call-click` no mesmo `<g>`).
 *
 * @param svg Markup SVG (já possivelmente enriquecido por `injectFlowBlockClicks`).
 * @param blocks Blocos do fluxograma.
 */
export function injectFlowBlockA11y(svg: string, blocks: ReadonlyArray<FlowBlock>): string {
    const currentId = pickCurrentBlockId(blocks);
    let out = svg;
    for (const b of blocks) {
        const needle = `data-node-id="${b.id}"`;
        if (!out.includes(needle)) continue;
        const attrs: string[] = [
            `role="img"`,
            `aria-label="${escAttr(b.label)} — ${escAttr(b.statusText)}"`,
        ];
        if (b.id === currentId) attrs.push(`aria-current="step"`);
        if (b.handler) {
            attrs.push(`tabindex="0"`);
            attrs.push(`data-cc-call-keydown="${b.handler}|s:${b.id}"`);
            attrs.push(`data-cc-key="Enter"`);
        }
        out = out.replace(needle, `data-node-id="${b.id}" ${attrs.join(' ')}`);
    }
    return out;
}// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * flowBlocksToPipelineModel.ts — Adaptador FS-3 (ACTIONS-FLOW-001).
 *
 * Converte os 5 `FlowBlock` do fluxograma de status da aba Actions
 * (INPUT → PROCESSAMENTO → VALIDAÇÃO → RELATÓRIO → COMUNICAÇÃO) num
 * `PipelineModel` consumível por `buildPipelineDiagramSvg`
 * (core/pipelines/_diagramSvgPure.ts), reusando o renderizador SVG nativo
 * já existente (NATIVE-PIPELINE-DIAGRAM-001) em vez de criar um novo.
 *
 * PURE LOGIC: sem DOM, sem rede, determinístico — cheap-testável.
 *
 * NOTA DE DESACOPLAMENTO: `FlowBlockState`/`FlowBlock` são definidos aqui de
 * forma LOCAL e compatível com o shape produzido por
 * `flowStatusHelpers.ts` (outro agente da mesma rodada, FS-1). Isso é
 * intencional para desacoplar os dois agentes; os tipos serão unificados
 * (import único) numa passada de consolidação posterior.
 */

import {
    buildPipelineDiagramSvg,
    type PipelineModel,
    type PositionedNode,
} from '../../../core/pipelines/_diagramSvgPure.js';
import type { DiagramEdgeInput } from '../../../core/pipelines/_diagramLayoutPure.js';

/** Estado fechado de um bloco do fluxograma (espelha FS-1 §3 da spec). */
export type FlowBlockState = 'nao_iniciado' | 'em_andamento' | 'concluido' | 'pendencia' | 'bloqueado';

/** Lacuna acionável associada a um bloco (compatível com `CompletenessGap`). */
export interface FlowBlockGap {
    readonly id: string;
    readonly msg: string;
    readonly handler?: string;
}

/** Bloco de status do fluxograma da aba Actions (shape espelhado de FS-1). */
export interface FlowBlock {
    readonly id: string;
    readonly label: string;
    readonly state: FlowBlockState;
    readonly statusText: string;
    readonly gaps?: ReadonlyArray<FlowBlockGap>;
    readonly handler?: string;
}

/** Paleta de cor por estado (spec §4 — navy+ciano, contraste AA no tema escuro). */
const STATE_COLOR: Record<FlowBlockState, string> = {
    concluido: '#22d3ee', // ciano/verde-ecbyts — etapa concluída
    em_andamento: '#0ea5e9', // navy vivo — foco proeminente (borda destacada no render)
    pendencia: '#f59e0b', // âmbar/alerta — concluído com gap acionável
    nao_iniciado: '#475569', // cinza esmaecido — ainda não alcançado
    bloqueado: '#334155', // cinza esmaecido (mais escuro) — etapa anterior não concluída
};

/** Largura/altura/posições fixas do stepper linear (5 blocos, previsíveis). */
const NODE_W = 160;
const NODE_H = 64;
const GAP_X = 96;
const MARGIN_X = 24;
const MARGIN_Y = 24;

/**
 * Resolve a cor do nó a partir do estado do bloco. Bloco sem estado
 * reconhecido cai em `nao_iniciado` (falso-verde-safe: nunca assume concluído).
 */
function colorForState(state: FlowBlockState): string {
    return STATE_COLOR[state] ?? STATE_COLOR.nao_iniciado;
}

/**
 * Escolhe o nó de foco do diagrama: o primeiro bloco `em_andamento`; na
 * ausência, o primeiro `nao_iniciado` (estado vazio / fluxo ainda não começou).
 */
function pickStartNodeId(blocks: ReadonlyArray<FlowBlock>): string | null {
    const inProgress = blocks.find((b) => b.state === 'em_andamento');
    if (inProgress) return inProgress.id;
    const notStarted = blocks.find((b) => b.state === 'nao_iniciado');
    return notStarted ? notStarted.id : (blocks[0]?.id ?? null);
}

/**
 * Converte os `FlowBlock[]` (5 etapas fixas do stepper) num `PipelineModel`
 * com posições x/y FIXAS (stepper linear, não precisa do auto-layout
 * `layoutPipeline` — as 5 posições são conhecidas e a ordem nunca muda).
 *
 * @param blocks Blocos do fluxograma, na ordem INPUT→...→COMUNICAÇÃO.
 */
export function flowBlocksToPipelineModel(blocks: ReadonlyArray<FlowBlock>): PipelineModel {
    const nodes: PositionedNode[] = blocks.map((b, i) => ({
        id: b.id,
        type: 'action',
        label: b.label,
        x: MARGIN_X + i * (NODE_W + GAP_X),
        y: MARGIN_Y,
        w: NODE_W,
        h: NODE_H,
        color: colorForState(b.state),
    }));

    const edges: DiagramEdgeInput[] = [];
    for (let i = 0; i < blocks.length - 1; i++) {
        const from = blocks[i];
        const to = blocks[i + 1];
        if (!from || !to) continue;
        edges.push({ from: from.id, to: to.id });
    }

    return Object.freeze({
        nodes: Object.freeze(nodes),
        edges: Object.freeze(edges),
        startNodeId: pickStartNodeId(blocks),
    });
}

/**
 * FS-5 (ACTIONS-FLOW-001) — cliques acionáveis CSP-safe por bloco.
 *
 * Para cada bloco com `handler` (derivado de `gap.handler` em FS-1 — ex.:
 * `handleOpenIngestionModal`/`handleAddCampaign`/`handleOpenSpatialModal`),
 * injeta `data-cc-call-click="<handler>|s:<blockId>"` no `<g data-node-id>`
 * correspondente do SVG. Blocos SEM handler (`bloqueado`, `em_andamento`
 * sem gap acionável, `concluido`) NÃO recebem o atributo → não avançam
 * (spec §6 FS-5: "bloqueado sem handler").
 *
 * Puro (string → string), determinístico, sem DOM. CSP-safe: NÃO emite
 * `on*` inline; o dispatch fica a cargo do delegate global
 * (`app/js/boot/cc-call-delegate.js` + whitelist `window.__ccCallAllow`).
 * Os 3 handlers de gap são whitelisted via `scripts/cc-call-extra-whitelist.json`
 * (merge do `ccc-001-cs1-b3-interp-sweep.mjs`), pois o nome é dinâmico
 * (vem de `block.handler`) e o sweep não o infere estaticamente.
 *
 * NOTA: `b.id` é um dos 5 tokens fixos do stepper (input…comunicacao),
 * sem caracteres especiais — coincide com o `data-node-id` escapado pelo
 * renderizador (`esc(id)`), então a âncora `data-node-id="<id>">` (o `>`
 * final do `<g>` de abertura) é única e segura.
 *
 * @param svg Markup SVG produzido por `buildPipelineDiagramSvg`.
 * @param blocks Blocos do fluxograma (com `handler` opcional por bloco).
 */
export function injectFlowBlockClicks(svg: string, blocks: ReadonlyArray<FlowBlock>): string {
    let out = svg;
    for (const b of blocks) {
        if (!b.handler) continue; // bloqueado / sem gap acionável → não avança
        const needle = `data-node-id="${b.id}"`;
        if (!out.includes(needle)) continue;
        const payload = `${b.handler}|s:${b.id}`;
        // cursor:pointer sinaliza o bloco acionável (RF-5 EVIDENCE-CONTRACT-001#5);
        // style attr é CSP-safe (style-src permite atributo, não é handler inline).
        out = out.replace(
            needle,
            `data-node-id="${b.id}" style="cursor:pointer" data-cc-call-click="${payload}"`,
        );
    }
    return out;
}

/**
 * Renderiza o SVG do fluxograma de status a partir dos blocos, no tema
 * `app-dark` (casa com o app). Fina casca sobre `flowBlocksToPipelineModel`
 * + `buildPipelineDiagramSvg` — sem DOM, string pura. Em seguida injeta os
 * cliques acionáveis CSP-safe (FS-5) nos blocos que têm `handler`.
 *
 * @param blocks Blocos do fluxograma (ver `flowBlocksToPipelineModel`).
 */
export function renderFlowDiagramSvg(blocks: ReadonlyArray<FlowBlock>): string {
    const model = flowBlocksToPipelineModel(blocks);
    const svg = buildPipelineDiagramSvg(model, { renderTheme: 'app-dark' });
    // FS-5 (cliques CSP-safe) e depois FS-6 (a11y) enriquecem o mesmo <g> do nó.
    return injectFlowBlockA11y(injectFlowBlockClicks(svg, blocks), blocks);
}
