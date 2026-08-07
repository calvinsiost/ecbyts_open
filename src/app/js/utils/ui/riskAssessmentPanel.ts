// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CETESB-RISK-001 Fase 4 — painel dedicado de avaliação de risco.
//
// Tela dedicada onde o engenheiro ambiental escolhe SQI + cenário + concentrações
// e visualiza CMA + ILCR + HQ + via limitante calculados pelo motor `core/risk/cetesb`.
//
// REUTILIZA helpers canônicos UI (docs/ui-snippets.md):
//   - createModal({ size: 'lg', title, body, footer, ... }) → ecbt-dialog--lg
//   - createForm(fields, opts) + getFormData(form) — sem reinventar
//   - showToast(message, type) — feedback compliance status
//   - Z_INDEX.MODAL — z-index canônico (sem hardcoded zIndex)
//
// NÃO reinventa: modal frame, overlay backdrop, form fields, toast, z-index.
// CSS-class ownership: design-tokens.css cuida do dialog frame; classes próprias
// `.risk-panel-*` ficam restritas a layout interno.
//
// SPEC: CETESB-RISK-001 Sub-4.1.1 (painel canônico)
import { createModal } from './modal.js';
import { createForm, getFormData } from './forms.js';
import { showToast } from './toast.js';
import { Z_INDEX } from './zIndex.js';
import { createDebouncer } from './_debouncePure.js';
// eslint-disable-next-line
import { generateToolsUrl } from '../sharing/deepLinkGenerator.js';
import { createDeepLinkShareButton } from '../sharing/_deepLinkShareButton.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import {
    serializeRiskFormToTsv,
    parseRiskFormFromTsv,
    type RiskPanelClipboardState,
    type RiskPanelClipboardPatch,
} from '../../core/risk/cetesb/_riskPanelClipboardPure.js';

import {
    computeRiskAndCma,
    listScenarios,
    type RiskAssessmentInput,
    type RiskAssessmentResult,
    type ScenarioId,
    type Medium,
} from '../../core/risk/cetesb/index.js';

/** Estado interno do painel — mantido em closure (não global). */
interface PanelState {
    selectedCas: string;
    selectedScenario: ScenarioId;
    soilConc: number;
    groundwaterConc: number;
    airConc: number;
    lastResult: RiskAssessmentResult | null;
}

const DEFAULT_STATE: PanelState = Object.freeze({
    selectedCas: '71-43-2',
    selectedScenario: 'RES_URB' as ScenarioId,
    soilConc: 0,
    groundwaterConc: 0,
    airConc: 0,
    lastResult: null,
}) as PanelState;

/** SQIs canônicas (5 primeiras do catálogo ADR-A5). */
const SQI_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.freeze([
    { value: '71-43-2', label: 'Benzeno (71-43-2)' },
    { value: '108-88-3', label: 'Tolueno (108-88-3)' },
    { value: '7440-38-2', label: 'Arsênio (7440-38-2)' },
    { value: '7440-43-9', label: 'Cádmio (7440-43-9)' },
    { value: '50-32-8', label: 'Benzo(a)pireno (50-32-8)' },
]) as ReadonlyArray<{ value: string; label: string }>;

/** Mapa cenário → label legível. */
function scenarioLabel(id: ScenarioId): string {
    if (id === 'RES_URB') return 'Residencial Urbano';
    if (id === 'RES_RUR') return 'Residencial Rural';
    if (id === 'TRAB_COM_IND') return 'Trabalhador Comercial/Industrial';
    if (id === 'TRAB_OBRA_CIV') return 'Trabalhador em Obra Civil';
    return id;
}

/** Veredito conformidade — usa tolerâncias CONAMA 420 / CETESB DD 103/2007. */
function verdictFromResult(result: RiskAssessmentResult): {
    label: string;
    type: 'success' | 'warning' | 'error';
} {
    if (!Number.isFinite(result.ilcr) || !Number.isFinite(result.hq)) {
        return { label: 'Dados insuficientes', type: 'warning' };
    }
    const carcExceeds = result.ilcr > 1e-5;
    const noncarcExceeds = result.hq > 1.0;
    if (carcExceeds || noncarcExceeds) {
        return { label: 'Risco INACEITÁVEL — requer remediação', type: 'error' };
    }
    if (result.ilcr > 1e-6 || result.hq > 0.5) {
        return { label: 'Risco aceitável com monitoramento', type: 'warning' };
    }
    return { label: 'Risco aceitável', type: 'success' };
}

/** Renderiza resultados em painel inferior do modal. */
function renderResults(container: HTMLElement, result: RiskAssessmentResult): void {
    container.innerHTML = ''; // textContent-safe: nenhum dado user-supplied entra aqui
    const verdict = verdictFromResult(result);
    const wrapper = document.createElement('div');
    wrapper.className = 'risk-panel-results';

    const heading = document.createElement('h3');
    heading.textContent = 'Resultados — Avaliação de Risco';
    wrapper.appendChild(heading);

    const grid = document.createElement('dl');
    grid.className = 'risk-panel-result-grid';
    const items: Array<[string, string]> = [
        ['ILCR (risco câncer incremental)', result.ilcr.toExponential(2)],
        ['HQ (quociente de risco não-câncer)', result.hq.toFixed(3)],
        ['CMA (concentração máxima aceitável)', `${result.cma.toFixed(4)} ${result.cmaUnit}`],
        ['Via limitante', result.limitingPathway || '—'],
        ['Fonte', result.source],
    ];
    for (const [k, v] of items) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        grid.appendChild(dt);
        grid.appendChild(dd);
    }
    wrapper.appendChild(grid);

    const badge = document.createElement('div');
    badge.className = `risk-panel-verdict risk-panel-verdict--${verdict.type}`;
    badge.setAttribute('role', 'status');
    badge.textContent = verdict.label;
    wrapper.appendChild(badge);

    if (result.warnings.length > 0) {
        const warningsList = document.createElement('ul');
        warningsList.className = 'risk-panel-warnings';
        for (const w of result.warnings) {
            const li = document.createElement('li');
            li.textContent = w;
            warningsList.appendChild(li);
        }
        const warnHeading = document.createElement('h4');
        warnHeading.textContent = 'Avisos';
        wrapper.appendChild(warnHeading);
        wrapper.appendChild(warningsList);
    }

    container.appendChild(wrapper);
}

/** Constrói painel completo + retorna API de controle. */
/**
 * Payload aceito via deep-link `?tools=risk&payload=…`.
 * Shape compatível com validateRiskPayload no deepLinkRegistry.
 */
export interface RiskPanelPayload {
    sqi?: string;
    scenario?: ScenarioId;
    conc?: { soil?: number; groundwater?: number; air?: number };
}

/**
 * Monta o estado inicial do painel a partir de um payload de deep-link.
 */
function _buildInitialState(payload?: RiskPanelPayload | null): PanelState {
    return {
        ...DEFAULT_STATE,
        ...(payload?.sqi && { selectedCas: payload.sqi }),
        ...(payload?.scenario && { selectedScenario: payload.scenario }),
        ...(payload?.conc?.soil !== undefined && { soilConc: payload.conc.soil }),
        ...(payload?.conc?.groundwater !== undefined && { groundwaterConc: payload.conc.groundwater }),
        ...(payload?.conc?.air !== undefined && { airConc: payload.conc.air }),
        lastResult: null,
    };
}

/**
 * Monta a definição de campos do formulário a partir do estado atual.
 */
function _buildFormFields(state: PanelState, scenarioOptions: Array<{ value: string; label: string }>): any[] {
    return [
        {
            type: 'select',
            name: 'sqiCas',
            labelKey: 'risk.field.sqi',
            value: state.selectedCas,
            options: [...SQI_OPTIONS],
            required: true,
        },
        {
            type: 'select',
            name: 'scenario',
            labelKey: 'risk.field.scenario',
            value: state.selectedScenario,
            options: scenarioOptions,
            required: true,
        },
        {
            type: 'number',
            name: 'soilConc',
            labelKey: 'risk.field.soilConc',
            value: state.soilConc,
            placeholderKey: 'risk.field.soilConc.placeholder',
            min: 0,
        },
        {
            type: 'number',
            name: 'groundwaterConc',
            labelKey: 'risk.field.groundwaterConc',
            value: state.groundwaterConc,
            placeholderKey: 'risk.field.groundwaterConc.placeholder',
            min: 0,
        },
        {
            type: 'number',
            name: 'airConc',
            labelKey: 'risk.field.airConc',
            value: state.airConc,
            placeholderKey: 'risk.field.airConc.placeholder',
            min: 0,
        },
    ];
}

interface ParsedConcentrations {
    soil: number;
    groundwater: number;
    air: number;
}

/**
 * Extrai as concentrações do formulário.
 */
function _parseFormConcentrations(data: Record<string, string>): ParsedConcentrations {
    return {
        soil: Number(data.soilConc) || 0,
        groundwater: Number(data.groundwaterConc) || 0,
        air: Number(data.airConc) || 0,
    };
}

/**
 * Determina quais meios estão impactados a partir das concentrações.
 */
function _mediaImpactedFromConcentrations({ soil, groundwater, air }: ParsedConcentrations): Medium[] {
    const media: Medium[] = [];
    if (soil > 0) media.push('soil');
    if (groundwater > 0) media.push('groundwater');
    if (air > 0) media.push('air');
    return media;
}

/**
 * Executa o cálculo de risco, renderiza o resultado e dispara feedback.
 */
function _executeRiskCalculation(
    input: RiskAssessmentInput,
    state: PanelState,
    resultsContainer: HTMLElement,
    showFeedbackToast: boolean,
): void {
    try {
        const result = computeRiskAndCma(input);
        state.lastResult = result;
        renderResults(resultsContainer, result);
        if (showFeedbackToast) {
            const verdict = verdictFromResult(result);
            showToast(`CMA calculada: ${verdict.label}`, verdict.type);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (showFeedbackToast) showToast(`Erro no cálculo: ${msg}`, 'error');
    }
}

/**
 * Captura o estado atual do formulário para serialização (Excel / clipboard).
 */
function _captureClipboardState(form: HTMLFormElement, state: PanelState): RiskPanelClipboardState {
    const data = getFormData(form) as Record<string, string>;
    return Object.freeze({
        selectedCas: data.sqiCas || state.selectedCas,
        selectedScenario: (data.scenario || state.selectedScenario) as ScenarioId,
        soilConc: Number(data.soilConc) || 0,
        groundwaterConc: Number(data.groundwaterConc) || 0,
        airConc: Number(data.airConc) || 0,
    }) as RiskPanelClipboardState;
}

/**
 * Aplica um patch no DOM do formulário sem perder valores não-tocados.
 */
function _applyPatchToForm(form: HTMLFormElement, patch: RiskPanelClipboardPatch): number {
    let applied = 0;
    const setField = (name: string, value: string): void => {
        const el = form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        applied++;
    };
    if (patch.selectedCas) setField('sqiCas', patch.selectedCas);
    if (patch.selectedScenario) setField('scenario', patch.selectedScenario);
    if (typeof patch.soilConc === 'number') setField('soilConc', String(patch.soilConc));
    if (typeof patch.groundwaterConc === 'number') setField('groundwaterConc', String(patch.groundwaterConc));
    if (typeof patch.airConc === 'number') setField('airConc', String(patch.airConc));
    return applied;
}

/**
 * Monta o payload de compartilhamento a partir do estado + formulário.
 */
function _buildSharePayload(form: HTMLFormElement, state: PanelState): RiskPanelPayload {
    const data = getFormData(form) as Record<string, string>;
    return {
        sqi: data.sqiCas || state.selectedCas,
        scenario: (data.scenario || state.selectedScenario) as ScenarioId,
        conc: {
            soil: Number(data.soilConc) || 0,
            groundwater: Number(data.groundwaterConc) || 0,
            air: Number(data.airConc) || 0,
        },
    };
}

/**
 * Monta o payload de deep-link a partir do estado atual (sync na abertura).
 */
function _buildCurrentPayload(state: PanelState): RiskPanelPayload {
    return {
        sqi: state.selectedCas,
        scenario: state.selectedScenario,
        conc: {
            soil: Number(state.soilConc) || 0,
            groundwater: Number(state.groundwaterConc) || 0,
            air: Number(state.airConc) || 0,
        },
    };
}

export function openRiskAssessmentPanel(payload?: RiskPanelPayload | null): { close: () => void } {
    // DEEP-LINK-TOOLS-001 Sub-F3: pré-preenche estado a partir do payload do deep-link.
    const state: PanelState = _buildInitialState(payload);

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'risk-panel-body';

    const scenarioOptions = listScenarios().map((s) => ({
        value: s.id,
        label: scenarioLabel(s.id),
    }));

    const form = createForm(_buildFormFields(state, scenarioOptions), {});

    bodyContainer.appendChild(form);

    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'risk-panel-results-container';
    resultsContainer.setAttribute('aria-live', 'polite');
    bodyContainer.appendChild(resultsContainer);

    // Função core de cálculo — chamada tanto pelo botão manual quanto pelo debouncer live.
    // showFeedbackToast=false durante recálculo automático (evitar toast spam ao digitar).
    const runComputation = (showFeedbackToast: boolean): void => {
        const data = getFormData(form) as Record<string, string>;
        const sqiCas = data.sqiCas || state.selectedCas;
        const scenario = (data.scenario || state.selectedScenario) as ScenarioId;
        const { soil, groundwater, air } = _parseFormConcentrations(data);

        if (soil <= 0 && groundwater <= 0 && air <= 0) {
            if (showFeedbackToast) showToast('Informe ao menos uma concentração maior que zero', 'warning');
            return;
        }

        const mediaImpacted = _mediaImpactedFromConcentrations({ soil, groundwater, air });
        const input: RiskAssessmentInput = { sqiCas, scenario, mediaImpacted, concentrations: { soil, groundwater, air } };
        _executeRiskCalculation(input, state, resultsContainer, showFeedbackToast);
    };

    // Debouncer canônico — 250ms UX padrão; recálculo silencioso ao mudar inputs.
    const debouncedRecompute = createDebouncer(() => runComputation(false), 250);

    // Listener live: qualquer mudança em input/select dispara debouncer
    form.addEventListener('input', () => debouncedRecompute.trigger());
    form.addEventListener('change', () => debouncedRecompute.trigger());

    // Footer com botão de ação manual (toast de feedback completo)
    const footer = document.createElement('div');
    footer.className = 'risk-panel-footer';

    const calcButton = document.createElement('button');
    calcButton.type = 'button';
    calcButton.className = 'ecbt-btn ecbt-btn--primary';
    calcButton.textContent = 'Calcular CMA';
    calcButton.addEventListener('click', () => {
        debouncedRecompute.cancel(); // cancela debounce pendente — manual tem prioridade
        runComputation(true);
    });
    footer.appendChild(calcButton);

    // UI-B Phase 2 — clipboard interop helpers (Excel ↔ ecbyts).
    const captureCurrentState = (): RiskPanelClipboardState => _captureClipboardState(form, state);
    const applyPatchToForm = (patch: RiskPanelClipboardPatch): number => _applyPatchToForm(form, patch);

    // Botão Copy → Excel
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'ecbt-btn ecbt-btn--secondary';
    copyButton.setAttribute('title', 'Copia formulário em formato TSV (cola direto em Excel/Sheets — Ctrl+V)');
    copyButton.textContent = 'Copiar para Excel';
    copyButton.addEventListener('click', async () => {
        try {
            const tsv = serializeRiskFormToTsv(captureCurrentState());
            if (!tsv) {
                showToast('Nada para copiar', 'warning');
                return;
            }
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(tsv);
                showToast('Formulário copiado em formato TSV (Ctrl+V no Excel)', 'success');
            } else {
                showToast('Clipboard API indisponível neste navegador', 'error');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            showToast(`Erro ao copiar: ${msg}`, 'error');
        }
    });
    footer.appendChild(copyButton);

    // Botão Paste from Excel (lê clipboard programaticamente)
    const pasteButton = document.createElement('button');
    pasteButton.type = 'button';
    pasteButton.className = 'ecbt-btn ecbt-btn--secondary';
    pasteButton.setAttribute('title', 'Lê o clipboard (TSV do Excel) e aplica nos campos');
    pasteButton.textContent = 'Colar do Excel';
    pasteButton.addEventListener('click', async () => {
        try {
            if (!navigator.clipboard?.readText) {
                showToast('Clipboard API indisponível — use Ctrl+V em uma célula', 'warning');
                return;
            }
            const text = await navigator.clipboard.readText();
            const result = parseRiskFormFromTsv(text);
            if (!result.ok) {
                const reason = result.warnings[0] || 'layout não reconhecido';
                showToast(`Não foi possível interpretar o TSV: ${reason}`, 'warning');
                return;
            }
            const applied = applyPatchToForm(result.patch);
            const warns = result.warnings.length > 0 ? ` (${result.warnings.length} avisos)` : '';
            showToast(`${applied} campo(s) aplicado(s) do Excel${warns}`, 'success');
            debouncedRecompute.trigger();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            showToast(`Erro ao colar: ${msg}`, 'error');
        }
    });
    footer.appendChild(pasteButton);

    // Listener Ctrl+V no bodyContainer — só intercepta se NÃO estiver em input/select/textarea
    // (default browser paste em <input> continua funcionando para texto simples).
    bodyContainer.addEventListener('paste', (ev: ClipboardEvent) => {
        const target = ev.target as HTMLElement | null;
        if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return; // default
        const text = ev.clipboardData?.getData('text/plain');
        if (!text || !text.includes('\t')) return; // não é TSV
        ev.preventDefault();
        const result = parseRiskFormFromTsv(text);
        if (!result.ok) {
            showToast(`TSV não reconhecido: ${result.warnings[0] || 'layout inválido'}`, 'warning');
            return;
        }
        const applied = applyPatchToForm(result.patch);
        showToast(`${applied} campo(s) preenchido(s) via Ctrl+V`, 'success');
        debouncedRecompute.trigger();
    });

    // DEEP-LINK-TOOLS-001 Sprint 1 F3.3 — botão Compartilhar via helper canônico.
    // Reusa createDeepLinkShareButton para DRY entre painéis Tier-A.
    const shareButton = createDeepLinkShareButton({
        toolId: 'risk',
        getPayload: () => _buildSharePayload(form, state),
        toast: showToast,
    });
    footer.appendChild(shareButton);

    const modal = createModal({
        title: 'Avaliação de Risco — CETESB',
        size: 'lg',
        body: bodyContainer,
        footer,
        extraClass: 'risk-panel-modal',
    });

    // Z-index canônico — modal.js já aplica overlay padrão; reforçamos com
    // ASYNC_DIALOG (9000) que é o slot oficial de modais confirm/prompt no
    // mapa canônico (vide CLAUDE.md z-index map + zIndex.ts comments).
    if (modal.overlay && Z_INDEX && typeof Z_INDEX.ASYNC_DIALOG === 'number') {
        modal.overlay.style.zIndex = String(Z_INDEX.ASYNC_DIALOG);
    }

    // Sprint 3 (Calvin 2026-06-03): URL = estado em tempo real. Sync ao abrir
    // com payload de estado atual; clear no close (wrap modal.close).
    syncDeepLinkUrl('risk', _buildCurrentPayload(state));

    const originalClose = modal.close;
    const wrappedClose = (): void => {
        clearDeepLinkUrl();
        originalClose();
    };

    return { close: wrappedClose };
}

/** Handler para registrar em window.* — chamado pelo botão ribbon. */
export function handleOpenRiskAssessmentPanel(): void {
    openRiskAssessmentPanel();
}
