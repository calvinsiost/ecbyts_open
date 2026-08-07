// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Painel MCA (Modelo Conceitual da Área) — Fase B.2 UI (SPEC_MCA_CONCEPTUAL_SITE_MODEL).
// Matriz fonte×caminho×receptor editável (clique cicla o status da via) + seletor de
// nível de confiança A/B/C + justificativa + inserir no relatório. Consome 100% a API
// pure de core/mca/_csmPure (cheap-tested) e a inserção de utils/report/_mcaInsert.
//
// Assumido por claude-otimizacao após claude-adm não engajar o handoff mca-b2 (North
// Star ship-ASAP). Modal via design tokens .ecbt-* (sem CSS novo de overlay).
import { t } from '../i18n/translations.js';
import { showToast } from './toast.js';
import { createLogger } from '../helpers/logger.js';
import {
    buildCsmFromElements,
    buildMcaEditableMatrixHtml,
    cycleLinkageStatus,
    overrideConfidence,
    snapshotCsm,
    coverageFromSources,
    CONFIDENCE_LEVELS,
    type Csm,
} from '../../core/mca/_csmPure.js';
import { escapeHtml } from '../helpers/html.js';
import { createDeepLinkShareButton } from '../sharing/_deepLinkShareButton.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

const log = createLogger('McaPanel');

let _overlay: HTMLElement | null = null;
let _csm: Csm | null = null;

function _close(): void {
    if (_overlay) {
        _overlay.remove();
        _overlay = null;
        // Sprint 3 (Calvin 2026-06-03): limpa ?tools=mca do address bar.
        clearDeepLinkUrl();
    }
    _csm = null;
}

/** Abre o painel MCA: constrói o CSM do modelo atual e renderiza a matriz editável. */
export async function openMcaPanel(): Promise<void> {
    try {
        const { getAllElements }: any = await import('../../core/elements/manager.js' as string);
        const els = (typeof getAllElements === 'function' && getAllElements()) || [];
        _csm = buildCsmFromElements(els, new Date().toISOString());
        if (_csm.sources.length === 0 && _csm.receptors.length === 0) {
            showToast(t('mca.empty') || 'Adicione fontes e/ou receptores ao modelo antes de gerar o MCA.', 'warning');
            _csm = null;
            return;
        }
        _renderOverlay();
    } catch (e: any) {
        log.error('open MCA panel failed:', e?.message || e);
        showToast(t('mca.failed') || 'Falha ao abrir o painel MCA.', 'error');
    }
}

function _confidenceButtons(): string {
    return CONFIDENCE_LEVELS.map(
        (lv) =>
            `<button type="button" class="mca-conf-btn${_csm?.confidence === lv ? ' active' : ''}" data-conf="${lv}" aria-pressed="${_csm?.confidence === lv}">${lv}</button>`,
    ).join('');
}

function _renderOverlay(): void {
    _close();
    if (!_csm) return;
    _overlay = document.createElement('div');
    _overlay.className = 'ecbt-overlay mca-panel-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', t('mca.panelTitle') || 'Painel do Modelo Conceitual da Área');
    // FC-02 RF5: ASTM E1689 data gaps (lacunas de dados) realçadas no header.
    // coverageFromSources retorna {observed, sources, gaps} — gaps = fontes
    // sem substâncias observadas. Útil para iteração do CSM.
    const cov = coverageFromSources(_csm.sources);
    const gapsLabel = (t('mca.dataGaps') || 'Lacunas de dados (ASTM E1689)');
    const gapsTitle = (t('mca.dataGapsHint')
        || 'Fontes sem substâncias observadas — coletar dados para fechar o ciclo iterativo do CSM');
    const versionLabel = `MCA${_csm.version || 1}`;
    _overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--lg mca-panel">
            <div class="mca-panel-header">
                <span class="mca-panel-title">${escapeHtml(t('mca.panelTitle') || 'Modelo Conceitual da Área (MCA)')} <span class="mca-panel-version-badge">${escapeHtml(versionLabel)}</span></span>
                <button type="button" class="mca-panel-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
            </div>
            <div class="mca-panel-coverage" title="${escapeHtml(gapsTitle)}">
                <span class="mca-panel-coverage-label">${escapeHtml(gapsLabel)}:</span>
                <span class="mca-panel-coverage-value${cov.gaps > 0 ? ' has-gaps' : ''}" aria-live="polite">
                    ${cov.gaps}/${cov.sources}
                </span>
                <span class="mca-panel-coverage-detail">
                    (${cov.observed} ${escapeHtml(t('mca.observed') || 'observada(s)')}, ${cov.gaps} ${escapeHtml(t('mca.dataGapShort') || 'sem dados')})
                </span>
            </div>
            <div class="mca-panel-conf">
                <span class="mca-panel-conf-label">${escapeHtml(t('mca.confidence') || 'Nível de confiança')}:</span>
                <span class="mca-conf-group">${_confidenceButtons()}</span>
            </div>
            <textarea class="mca-panel-justif" rows="2" placeholder="${escapeHtml(t('mca.justification') || 'Justificativa do nível de confiança')}">${escapeHtml(_csm.justification || '')}</textarea>
            <div class="mca-panel-matrix">${buildMcaEditableMatrixHtml(_csm)}</div>
            <details class="mca-panel-cma-section">
                <summary>${escapeHtml(t('mca.cmaSectionTitle') || 'CMA derivada por receptor (CETESB DD 103/2007)')}</summary>
                <div class="mca-panel-cma" aria-busy="true">${escapeHtml(t('mca.cmaLoading') || 'Computando CMAs...')}</div>
            </details>
            <div class="mca-panel-footer">
                <button type="button" class="btn btn-secondary mca-panel-cancel">${escapeHtml(t('cancel') || 'Cancelar')}</button>
                <button type="button" class="btn btn-secondary mca-panel-snapshot" title="${escapeHtml(t('mca.snapshotHint') || 'Versionar o CSM atual (MCA1 → MCA2 → MCA3)')}">
                    ${escapeHtml(t('mca.actionSnapshot') || 'Versionar (MCA1→MCA2)')}
                </button>
                <button type="button" class="btn btn-primary mca-panel-insert">${escapeHtml(t('mca.actionInsert') || 'Inserir no relatório')}</button>
            </div>
        </div>`;
    document.body.appendChild(_overlay);
    _attach();
    _renderCmaSection().catch((e: any) => log.debug('cma render failed:', e?.message || e));
    // Sprint 3 (Calvin 2026-06-03): URL = estado. Address bar reflete painel aberto.
    syncDeepLinkUrl('mca');

    // DEEP-LINK-TOOLS-001 Sprint 2 — botão Compartilhar via helper canônico.
    // Reusa createDeepLinkShareButton (DRY pattern de Tier-A, mesmo wire que
    // riskAssessmentPanel). Payload null → MCA abre com modelo atual do
    // receptor (state seeding fica para Sprint 3 se necessário).
    try {
        const footer = _overlay.querySelector('.mca-panel-footer');
        if (footer) {
            const shareButton = createDeepLinkShareButton({
                toolId: 'mca',
                getPayload: () => null,
                toast: showToast,
            });
            footer.appendChild(shareButton);
        }
    } catch (e: any) {
        log.debug('share button wire failed:', e?.message || e);
    }
}

/**
 * Renderiza a tabela CMA derivada (CETESB-RISK-001 RF-1.5) dentro do painel MCA.
 * Defensive: feature flag CETESB_RISK_ASSESSMENT + try/catch + observations vazias.
 */
async function _renderCmaSection(): Promise<void> {
    if (!_overlay) return;
    const target = _overlay.querySelector('.mca-panel-cma') as HTMLElement | null;
    if (!target) return;
    try {
        const win: any = typeof window !== 'undefined' ? window : null;
        const flag = win?.CONFIG?.FEATURES?.CETESB_RISK_ASSESSMENT;
        if (flag === false) {
            target.innerHTML = `<p class="mca-panel-cma-empty">${escapeHtml(t('mca.cmaDisabled') || 'Avaliação de risco CETESB desabilitada (feature flag CETESB_RISK_ASSESSMENT).')}</p>`;
            target.setAttribute('aria-busy', 'false');
            return;
        }
        const [{ getAllElements }, cmaMod]: any = await Promise.all([
            import('../../core/elements/manager.js' as string),
            import('../../core/risk/cetesb/_cmaTablePure.js' as string),
        ]);
        const elements: any[] = (typeof getAllElements === 'function' && getAllElements()) || [];
        // Flatten observações de todos os elementos
        const flatObs: Array<{ parameter: string; value: number; unit: string; matrix: string }> = [];
        for (const el of elements) {
            const obs: any[] = Array.isArray(el?.observations)
                ? el.observations
                : Array.isArray(el?.data?.observations)
                  ? el.data.observations
                  : [];
            for (const o of obs) {
                const v = o?.value != null ? o.value : o?.reading;
                if (!Number.isFinite(Number(v))) continue;
                flatObs.push({
                    parameter: String(o?.parameterId || o?.parameter || ''),
                    value: Number(v),
                    unit: String(o?.unit || ''),
                    matrix: String(o?.matrix || el?.data?.matrix || 'groundwater'),
                });
            }
        }
        if (flatObs.length === 0) {
            target.innerHTML = `<p class="mca-panel-cma-empty">${escapeHtml(t('mca.cmaNoObs') || 'Sem observações com valor numérico para computar CMA.')}</p>`;
            target.setAttribute('aria-busy', 'false');
            return;
        }
        const config: any = win?.CONFIG;
        const params: any[] = Array.isArray(config?.PARAMETERS) ? config.PARAMETERS : [];
        const casLookup = (name: string): string | null => {
            const p = params.find((x: any) => x?.id === name || x?.name === name || x?.label === name);
            return (p?.casNumber as string) || (p?.cas as string) || null;
        };
        const result = cmaMod.buildCmaTableFromObservations(flatObs, {
            scenario: 'RES_URB',
            casLookup,
            scenarioLabel: t('mca.cmaScenarioLabel') || 'Residente Urbano (criança — cenário mais protetivo)',
            now: new Date().toISOString(),
        });
        target.innerHTML = result.html;
        target.setAttribute('aria-busy', 'false');
        target.setAttribute('data-cma-rows', String(result.meta.totalSqis));
        target.setAttribute('data-cma-exceedances', String(result.meta.totalExceedances));
    } catch (e: any) {
        log.debug('cma section:', e?.message || e);
        target.innerHTML = `<p class="mca-panel-cma-error">${escapeHtml(t('mca.cmaFailed') || 'Falha ao computar CMAs (cálculo interno).')}</p>`;
        target.setAttribute('aria-busy', 'false');
    }
}

function _attach(): void {
    if (!_overlay) return;
    _overlay.querySelector('.mca-panel-close')?.addEventListener('click', _close);
    _overlay.querySelector('.mca-panel-cancel')?.addEventListener('click', _close);
    _overlay.addEventListener('click', (e: any) => {
        if (e.target === _overlay) _close();
    });
    // Confiança A/B/C
    _overlay.querySelectorAll('.mca-conf-btn').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            if (!_csm) return;
            const lv = btn.getAttribute('data-conf');
            const justif = (_overlay?.querySelector('.mca-panel-justif') as HTMLTextAreaElement | null)?.value || _csm.justification;
            _csm = overrideConfidence(_csm, lv, justif);
            _overlay?.querySelectorAll('.mca-conf-btn').forEach((b: any) => {
                const on = b.getAttribute('data-conf') === lv;
                b.classList.toggle('active', on);
                b.setAttribute('aria-pressed', String(on));
            });
        });
    });
    // Justificativa
    _overlay.querySelector('.mca-panel-justif')?.addEventListener('input', (e: any) => {
        if (_csm) _csm.justification = e.target.value;
    });
    // Células de status (cicla a via)
    _attachMatrixCells();
    // FC-02 RF4: versionar CSM (MCA1 → MCA2 → MCA3). Reusa pure-logic
    // snapshotCsm que clona deep o csm com nova version + createdAt.
    // Re-render incrementa version badge + toast confirma.
    _overlay.querySelector('.mca-panel-snapshot')?.addEventListener('click', () => {
        if (!_csm) return;
        const currentVersion = _csm.version || 1;
        if (currentVersion >= 3) {
            showToast(
                t('mca.snapshotMaxReached') || 'Versão máxima do MCA atingida (MCA3). Crie novo modelo para próxima iteração.',
                'warning',
            );
            return;
        }
        const nextVersion = (currentVersion + 1) as 1 | 2 | 3;
        _csm = snapshotCsm(_csm, nextVersion, new Date().toISOString());
        showToast(
            (t('mca.snapshotCreated') || 'Snapshot criado:') + ` MCA${currentVersion} → MCA${nextVersion}`,
            'success',
        );
        _renderOverlay();
    });
    // Inserir no relatório
    _overlay.querySelector('.mca-panel-insert')?.addEventListener('click', async () => {
        if (!_csm) return;
        const { insertCsmIntoReport }: any = await import('../report/_mcaInsert.js' as string);
        const ok = await insertCsmIntoReport(_csm);
        if (ok) _close();
    });
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            _close();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
}

function _attachMatrixCells(): void {
    _overlay?.querySelectorAll('.mca-status-cell').forEach((cell: any) => {
        cell.addEventListener('click', () => {
            if (!_csm) return;
            _csm = cycleLinkageStatus(_csm, cell.getAttribute('data-sid'), cell.getAttribute('data-pid'), cell.getAttribute('data-rid'));
            // Re-render só a matriz, preservando confiança + justificativa.
            const container = _overlay?.querySelector('.mca-panel-matrix');
            if (container) {
                container.innerHTML = buildMcaEditableMatrixHtml(_csm);
                _attachMatrixCells();
            }
        });
    });
}

if (typeof window !== 'undefined') {
    (window as any).openMcaPanel = openMcaPanel;
}
