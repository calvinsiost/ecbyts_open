// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Score panel — DOM wire.
 *
 * Opens a modal overlay with the three-block "Veredito da Área" dashboard
 * (SPEC §5). Reads the current state of `window.__ecbtScoreSnapshot` plus an
 * optional `window.__ecbtPhysicalSnapshot` and renders via the pure-logic
 * builder in `_ecbtScorePanelPure.ts`.
 *
 * Modal uses the `.ecbt-overlay` + `.ecbt-dialog` design tokens (CSS in
 * `app/css/ecbt-panel.css`). Close on ESC, click outside, or the close button.
 *
 * Exposed handlers (registered in `utils/handlers/index.ts`):
 *   - openEcbtScorePanel()  → opens the modal
 *   - closeEcbtScorePanel() → closes the modal
 */

import { buildEcbtScorePanelHtml } from './_ecbtScorePanelPure.js';
import type { EcbtHudSnapshotInput } from './_ecbtScoreHudPure.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { CONFIG } from '../../config.js';

interface PhysicalSnapshot {
    S?: number;
    R?: number;
    I?: number;
    kappa?: number;
    integrity3CTA?: number | null;
    veto?: boolean;
    vetoReason?: string | null;
    severityLabel?: string;
}

declare global {
    interface Window {
        __ecbtScoreSnapshot?: EcbtHudSnapshotInput | null;
        __ecbtPhysicalSnapshot?: PhysicalSnapshot | null;
        handleOpenEcbtScorePanel?: () => void;
        handleCloseEcbtScorePanel?: () => void;
    }
}

const OVERLAY_ID = 'ecbt-score-panel-overlay';
let _escHandler: ((e: KeyboardEvent) => void) | null = null;

// Calvin 2026-06-08 "nao aparece nnehum numero" — race: painel abre antes
// dos elementos carregarem. Listener re-renderiza quando modelo chega.
let _modelChangeHandler: (() => void) | null = null;
let _modelChangeDebounce: ReturnType<typeof setTimeout> | null = null;
const MODEL_EVENTS = [
    'ecbt:elementsBatchAdded',
    'elementsBatchAdded',
    'ecbt:elementAdded',
    'elementAdded',
    'ecbt:elementRemoved',
    'ecbt:elementsCleared',
    'ecbt:elementUpdated',
] as const;

function _defaultPhysical(): Required<PhysicalSnapshot> {
    return {
        S: 0,
        R: 0,
        I: 0,
        kappa: 1,
        integrity3CTA: null,
        veto: false,
        vetoReason: null,
        severityLabel: 'baixa',
    };
}

function _defaultMonetary(): EcbtHudSnapshotInput {
    return {
        amount: 0,
        currency: 'BRL',
        sign: 'zero',
        pct: null,
        pctLow: null,
        pctHigh: null,
        mode: 'absolute',
        denominatorKind: null,
        kappa: 1,
    };
}

function _translatePanel(root: HTMLElement): void {
    // Best-effort i18n pass. Uses window.translatePage if available, otherwise
    // applies window.t(key) per [data-i18n] node.
    const w = window as any;
    if (typeof w.translatePage === 'function') {
        try {
            w.translatePage(root);
            return;
        } catch (e: any) {
            console.debug('[ecbtScorePanel:i18n] translatePage failed, fallthrough', e?.message || e);
        }
    }
    const t = typeof w.t === 'function' ? w.t : null;
    if (!t) return;
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        try {
            const translated = t(key);
            if (translated && translated !== key) el.textContent = translated;
        } catch (e: any) {
            console.debug('[ecbtScorePanel:i18n] per-node t() failed', e?.message || e);
        }
    });
}

/**
 * F10 wire model state Calvin 2026-06-07 — quando snapshot ausente, computa
 * EIS canonical real a partir do modelo carregado (getAllElements + getAllCampaigns)
 * + sintetiza PhysicalSnapshot {S, κ, integrity3CTA, severityLabel}. Substitui
 * o default _defaultPhysical() zerado que causava "valores não aparecendo".
 *
 * Fail-safe: erro de import/cálculo → fallback _defaultPhysical (não trava UI).
 */
async function _computePhysicalFromModel(): Promise<PhysicalSnapshot | null> {
    try {
        const [{ getAllElements }, { getAllCampaigns }, canonical] = await Promise.all([
            import('../../core/elements/manager.js'),
            import('../../core/campaigns/manager.js'),
            import('../../core/eis/canonicalEngine.js'),
        ]);
        const elements = getAllElements();
        const campaigns = getAllCampaigns();
        if (!Array.isArray(elements) || elements.length === 0) return null;
        const result = canonical.executeCanonicalEis(elements, campaigns, {});
        const eis = Number(result?.eis || 0);
        const kappa = Math.max(0, Math.min(1, eis / 5));
        const S = Math.max(0, Math.min(1, 1 - kappa));
        const severityLabel = S >= 0.7 ? 'alta' : S >= 0.4 ? 'média' : 'baixa';
        return {
            S,
            R: 0,
            I: 0,
            kappa,
            integrity3CTA: eis,
            veto: result?.verdict === 'Critical Data',
            vetoReason: result?.verdict === 'Critical Data' ? 'EIS abaixo do limiar crítico' : null,
            severityLabel,
        };
    } catch (e: any) {
        console.debug('[ecbtScorePanel:wire] _computePhysicalFromModel failed', e?.message || e);
        return null;
    }
}

/**
 * F13 wire monetary Calvin 2026-06-07 — "o modelo random tem ativos e passivos,
 * pq não estão sendo computados?". Causa: F10 só wireou physical; monetary
 * snapshot continuava _defaultMonetary() zerado. Fix: buildCostRollup() do
 * core/analytics/economics extrai costs[] de cada elemento (OPEX+CAPEX) →
 * computeEcbtScore({assets, liabilities, kappa, mode='absolute'}).
 *
 * Convenção:
 *  - Passivos ambientais = costs de remediação/monitoramento (negativo na economia)
 *  - Ativos = ainda não cadastrados no modelo random; usar 0 (Calvin cadastra futuro)
 *  - Mode 'absolute' = mostra V_net direto sem normalização por marketValue
 */

/**
 * ERP-DRE-001 §11.4 MI-3 — caminho contábil de partida dobrada para o PASSIVO.
 *
 * SÓ é chamado quando `CONFIG.FEATURES.ERP_DRE === true`. Passa o rollup de
 * custos pela cadeia ERP (costRollupToJournalEntries → buildLedger →
 * buildIncomeStatement('BR-DRE') → toFinancialEntries) e devolve o passivo
 * resultante, em vez do `capex + opex` do caminho legado. Também guarda a
 * `statement` em `window.__ecbtLastDreStatement` para a UI da DRE (MI-5) ler,
 * junto do ledger (re-projeção de padrão) e do D&A (reconciliação EBITDA).
 *
 * Defensivo: QUALQUER erro retorna `null` — o chamador então usa o passivo
 * legado, sem derrubar o Score (backward-compat total).
 *
 * @param rollup - Saída de `buildCostRollup()`.
 * @param currency - Moeda do rollup (propagada às entradas financeiras).
 * @returns `{ liability }` (passivo contábil ≥ 0) ou `null` no fallback.
 */
async function _computeErpLiabilityFromRollup(
    rollup: any,
    currency: string,
): Promise<{ liability: number } | null> {
    try {
        const [adapter, ledger, income, scoreAdapter, chart, erpState, financialScope] = await Promise.all([
            import('../../core/erp/_costEntryAdapterPure.js'),
            import('../../core/erp/_ledgerPure.js'),
            import('../../core/erp/_incomeStatementPure.js'),
            import('../../core/erp/_ecbtScoreAdapterPure.js'),
            import('../../core/erp/_chartOfAccountsPure.js'),
            import('../../core/erp/erpModelState.js'),
            import('../../core/ecbtScore/_financialScopePure.js'),
        ]);
        const accounts = (chart as any).defaultChartBR();
        const costEntries = (adapter as any).costRollupToJournalEntries(rollup, {
            basis: 'actual',
            accounts: { byCategory: {} },
        });
        if (!Array.isArray(costEntries) || costEntries.length === 0) return null;
        // DRE-COMPLETA (Calvin 2026-06-21): mescla os lançamentos de RECEITA/
        // tributos/financeiro/depreciação que o random gera (phase-governance →
        // _dreScenarioGeneratorPure) aos lançamentos de custo. Sem isso a DRE só
        // teria despesas (prejuízo).
        // PERSISTÊNCIA (Calvin 2026-06-21 "guardar na chave .ecbt sempre"): lê do
        // STORE persistível (erpModelState) — assim os lançamentos sobrevivem a
        // salvar/recarregar via chave. Fallback p/ window se o store estiver
        // vazio (compat com fluxos que ainda só publicam no global).
        const storeEntries: any[] = (() => {
            try {
                const e = (erpState as any).getErpEntries?.();
                return Array.isArray(e) ? e : [];
            } catch {
                return [];
            }
        })();
        const dreEntries: any[] = storeEntries.length > 0
            ? storeEntries
            : Array.isArray((window as any).__ecbtRandomDreEntries)
                ? (window as any).__ecbtRandomDreEntries
                : [];
        const entries = [...costEntries, ...dreEntries];
        // Janela ampla: as entradas datam '<fiscalYear>-12-31'; cobrir todo o range.
        const period = { start: '0000-01-01', end: '9999-12-31' };
        // 1ª passada: consolida custos + receita para obter o LAIR real e então
        // acrescentar o IR/CSLL (D.9) coerente (só quando há lucro).
        let ledgerMap = (ledger as any).buildLedger(entries, accounts, period);
        let statement = (income as any).buildIncomeStatement(ledgerMap, accounts, 'BR-DRE');
        try {
            const lairLine = statement?.lines?.find?.((l: any) => l?.key === 'lair');
            const lair = Number(lairLine?.amount) || 0;
            if (lair > 0) {
                const dreGen: any = await import('../../core/random/_dreScenarioGeneratorPure.js');
                const summary = (window as any).__ecbtRandomDreSummary;
                const fiscalYear = Number(summary?.fiscalYear) || new Date().getFullYear();
                const irEntry = dreGen.buildIrCsllEntry(lair, { fiscalYear, currency });
                if (irEntry) {
                    entries.push(irEntry);
                    ledgerMap = (ledger as any).buildLedger(entries, accounts, period);
                    statement = (income as any).buildIncomeStatement(ledgerMap, accounts, 'BR-DRE');
                }
            }
        } catch (irErr: any) {
            console.debug('[ecbtScorePanel:wire] IR/CSLL entry skipped', irErr?.message || irErr);
        }
        const scopedEntries = (financialScope as any).filterEcbtScopedJournalEntries(entries);
        if (!Array.isArray(scopedEntries) || scopedEntries.length === 0) return null;
        const scoreLedgerMap = (ledger as any).buildLedger(scopedEntries, accounts, period);
        const scoreStatement = (income as any).buildIncomeStatement(
            scoreLedgerMap,
            accounts,
            'BR-DRE',
        );
        const score = (scoreAdapter as any).toFinancialEntries(scoreStatement, {
            currency,
            ledger: scoreLedgerMap,
        });
        const liabilities: Array<{ value?: number }> = Array.isArray(score?.liabilities)
            ? score.liabilities
            : [];
        const liability = liabilities.reduce((s, e) => s + (Number(e?.value) || 0), 0);
        // Cache p/ a UI da DRE (MI-5). D&A = saldo da conta D.4 no período.
        const daBal = ledgerMap.get?.('D.4');
        (window as any).__ecbtLastDreStatement = statement;
        (window as any).__ecbtLastDreLedger = ledgerMap;
        (window as any).__ecbtLastDreDA = Number(daBal?.balance) || 0;
        return { liability };
    } catch (e: any) {
        console.debug('[ecbtScorePanel:wire] ERP liability path failed → legacy', e?.message || e);
        return null;
    }
}

async function _computeMonetaryFromModel(kappa: number = 1): Promise<EcbtHudSnapshotInput | null> {
    try {
        const [
            { buildCostRollup },
            ecbtScore,
            naturalAssets,
            benchmarks,
            catalogLoader,
            { getAllElements },
        ] = await Promise.all([
            import('../../core/analytics/economics/costRollup.js'),
            import('../../core/ecbtScore/_ecbtScorePure.js'),
            import('../../core/ecbtScore/_naturalAssetsPure.js'),
            import('../../core/ecbtScore/_naturalAssetBenchmarksPure.js'),
            import('../../core/ecbtScore/_naturalAssetCatalogLoaderPure.js'),
            import('../../core/elements/manager.js'),
        ]);
        const rollup = buildCostRollup() as any;
        if (!rollup || typeof rollup !== 'object') return null;
        const capex = Number(rollup.totalCapex || 0);
        const opex = Number(rollup.totalOpex || 0);
        const currency = String(rollup.currency || 'BRL');
        // Caminho legado (flag OFF): passivo = capex + opex, 100% intacto.
        let totalLiability = capex + opex;
        // ERP-DRE-001 §11.4 MI-3 (flag ON): substitui SÓ a origem do passivo pela
        // cadeia contábil de partida dobrada. Ativos inalterados; erro → legado.
        if (CONFIG?.FEATURES?.ERP_DRE === true) {
            const erp = await _computeErpLiabilityFromRollup(rollup, currency);
            if (erp && Number.isFinite(erp.liability)) {
                totalLiability = erp.liability;
            }
        }

        // D1 Calvin 2026-06-08 — catálogo seed (benchmarks TEEB/ESVD/SEEA/Brasil)
        // + libraries ativas + user override (precedência canônica last-write-wins).
        // Fontes: .runtime/research/natural-asset-benchmarks-2026-06-08.md
        const elements = getAllElements() || [];
        const seedCatalog = (benchmarks as any).buildSeedCatalog({ tier: 'expected' });
        const libsMap = (window as any).__ecbtNaturalAssetCatalogLibraries;
        const libraries: Array<{ source: string; catalog: any }> = [];
        if (libsMap instanceof Map) {
            for (const [libId, cat] of libsMap.entries()) {
                libraries.push({ source: `Library: ${libId}`, catalog: cat });
            }
        }
        const userOverride = (window as any).__ecbtNaturalAssetCatalog;
        const merged = (catalogLoader as any).resolveEffectiveCatalog({
            seed: seedCatalog,
            libraries,
            userOverride: userOverride && typeof userOverride === 'object' ? userOverride : undefined,
        });
        const catalog = merged.catalog;
        const assetEntries = (naturalAssets as any).extractNaturalAssets(elements, catalog) as Array<{
            value: number; currency: string; uncertaintyFraction: number; label: string;
        }>;
        const assets = assetEntries.map((e) => ({
            value: e.value,
            currency: e.currency,
            uncertaintyFraction: e.uncertaintyFraction,
            label: e.label,
        }));
        const totalAssets = assets.reduce((s, a) => s + a.value, 0);

        if (totalLiability <= 0 && totalAssets <= 0) return null;
        // FIS-001 Fase 2 — Calvin 2026-06-08 "criar e implementar"
        // Lê multas do window.__ecbtFines (configurável via console/admin/library)
        // + EBITDA do window.__ecbtEbitdaBrl (capacidade econômica)
        // Wire opcional: ausente → comportamento idêntico ao anterior
        const finesInput = (window as any).__ecbtFines;
        const fines = Array.isArray(finesInput) ? finesInput : undefined;
        const ebitdaBrl = Number((window as any).__ecbtEbitdaBrl) || undefined;
        const revenueBrl = Number((window as any).__ecbtRevenueBrl) || undefined;
        // Calvin 2026-06-09 bug fix UI Pixels-Over-DOM: sem nowIso, FIS usa
        // default new Date(0).toISOString()=1970 → multas 2024+ fora da janela
        // 5y → FIS sempre 5.00 BOM. Bug confirmado via screenshot Playwright.
        const nowIso = new Date().toISOString();
        const result = (ecbtScore as any).computeEcbtScore({
            assets,
            liabilities: [{
                value: totalLiability,
                currency,
                uncertaintyFraction: 0.25,
                label: `OPEX (${opex.toFixed(0)}) + CAPEX (${capex.toFixed(0)})`,
            }],
            kappa,
            mode: 'absolute',
            fines,
            ebitdaBrl,
            revenueBrl,
            nowIso,
        });
        if (!result) return null;
        // Calvin 2026-06-08 fix — computeEcbtScore retorna `amount` (não `vNet`).
        // Antes lia `result.vNet` sempre undefined → fallback `-totalLiability` (sempre
        // negativo, ignorava ativos). Agora lê `amount` (sumAssets - sumLiabilities)
        // que é o vNet real do core (linha 202 de _ecbtScorePure.ts).
        const vNet = Number(result?.amount ?? result?.vNet ?? totalAssets - totalLiability);
        const sign: 'positive' | 'negative' | 'zero' = vNet > 0 ? 'positive' : vNet < 0 ? 'negative' : 'zero';
        // FIS-001 Fase 2 — propaga FineImpactScore para snapshot
        // Fase 3.5 (Calvin 2026-06-09) — também propaga fineImpactAudit completo
        // para renderizar barras M/A/S/R no card FIS (fisPanel.ts)
        const fineImpactScore = result?.fineImpactScore ?? null;
        const fineImpactAudit = result?.fineImpactAudit ?? null;
        const fineCount = result?.fineImpactAudit?.finesInWindow ?? 0;

        // CC-14 wire UI (CCC-001 Fase 7, Calvin "cc14 corrigir") — denominador
        // ESTÁVEL via cascata revenue→EBITDA→EV→asset_proxy. Substitui o modo
        // market_cap puro (volátil ±50%) pelo report com numerador e razão
        // SEPARADOS (CC v0.3 §6) + banda combinando GUM (±U numerador) e
        // volatilidade do denominador. Signals opcionais via window.__ecbt*Brl
        // (console/admin/library); ausentes → comportamento idêntico (absolute).
        let ratioFields: {
            pct: number | null; pctLow: number | null; pctHigh: number | null;
            mode: string; denominatorKind: string | null;
            stableBand?: 'positivo_robusto' | 'sinal_misto' | 'negativo_robusto' | null;
            denominatorRationale?: string | null;
        } = { pct: null, pctLow: null, pctHigh: null, mode: 'absolute', denominatorKind: null };
        try {
            const marketCapBrl = Number((window as any).__ecbtMarketCapBrl) || undefined;
            const totalDebtBrl = Number((window as any).__ecbtTotalDebtBrl) || undefined;
            const cashBrl = Number((window as any).__ecbtCashBrl) || undefined;
            const totalAssetsBrl = Number((window as any).__ecbtTotalAssetsBrl) || undefined;
            const hasDenominatorSignal = [revenueBrl, ebitdaBrl, marketCapBrl, totalAssetsBrl]
                .some((v) => Number.isFinite(v) && (v as number) > 0);
            if (hasDenominatorSignal) {
                const stable = await import('../../core/ecbtScore/_ecbtDenominatorStablePure.js');
                // Incerteza expandida do numerador a partir dos bounds GUM do VM
                const low = Number(result?.low);
                const high = Number(result?.high);
                const uExpanded = Number.isFinite(low) && Number.isFinite(high)
                    ? Math.abs(high - low) / 2
                    : 0;
                const report = (stable as any).computeStableEcbtReport(vNet, uExpanded, {
                    revenue: revenueBrl,
                    ebitda: ebitdaBrl,
                    marketCap: marketCapBrl,
                    totalDebt: totalDebtBrl,
                    cashAndEquivalents: cashBrl,
                    totalAssets: totalAssetsBrl,
                    currency,
                });
                // ratio é fração → painel formata pontos percentuais (×100)
                ratioFields = {
                    pct: report.ratio * 100,
                    pctLow: report.ratioLower * 100,
                    pctHigh: report.ratioUpper * 100,
                    mode: 'marketIntensity',
                    denominatorKind: report.denominator.kind,
                    stableBand: report.band,
                    denominatorRationale: report.denominator.rationale,
                };
            }
        } catch (e: any) {
            console.debug('[ecbtScorePanel:wire] stable denominator skipped', e?.message || e);
        }

        return Object.freeze({
            amount: vNet,
            currency,
            sign,
            pct: ratioFields.pct,
            pctLow: ratioFields.pctLow,
            pctHigh: ratioFields.pctHigh,
            mode: ratioFields.mode,
            denominatorKind: ratioFields.denominatorKind,
            stableBand: ratioFields.stableBand ?? null,
            denominatorRationale: ratioFields.denominatorRationale ?? null,
            kappa,
            fineImpactScore,
            fineImpactAudit,
            fineCount,
        });
    } catch (e: any) {
        console.debug('[ecbtScorePanel:wire] _computeMonetaryFromModel failed', e?.message || e);
        return null;
    }
}

// Calvin 2026-06-08 — detecta modelo vazio para mostrar empty state claro
// (em vez de "R$ 0" que parece bug ao usuário).
async function _detectModelEmpty(): Promise<{ isEmpty: boolean; elementCount: number }> {
    try {
        const { getAllElements } = (await import('../../core/elements/manager.js')) as any;
        const elements = getAllElements?.() || [];
        return { isEmpty: elements.length === 0, elementCount: elements.length };
    } catch (e: any) {
        console.debug('[ecbtScorePanel:emptyDetect] failed', e?.message || e);
        return { isEmpty: false, elementCount: -1 };
    }
}

/**
 * Detecta empty state SÍNCRONO (sem await) e injeta banner se necessário.
 * Usado tanto no 1º render quanto no callback async de re-render.
 */
function _maybeInjectEmptyStateBannerSync(body: HTMLElement): void {
    // Tenta acesso síncrono ao manager via window registry (fallback se já carregado)
    const w = window as any;
    let elementCount = -1;
    try {
        // Manager exporta getAllElements; se já carregado, está em w pelo importmap
        // (acesso síncrono via require não funciona em ESM browser — fallback async)
        const cached = w.__ecbtElementsCount;
        if (typeof cached === 'number') elementCount = cached;
    } catch (e: any) {
        console.debug('[ecbtScorePanel:emptyCheck]', e?.message || e);
    }
    // Se não temos count cached, kick async (não bloqueia)
    if (elementCount < 0) {
        _detectModelEmpty()
            .then(({ isEmpty, elementCount: c }) => {
                w.__ecbtElementsCount = c;
                if (isEmpty) _injectEmptyStateBanner(body, c);
                else body.querySelectorAll('.ecbt-empty-state-banner').forEach((n) => n.remove());
            })
            .catch((e: any) => console.debug('[ecbtScorePanel:emptyCheck:async]', e?.message || e));
        return;
    }
    if (elementCount === 0) _injectEmptyStateBanner(body, 0);
    else body.querySelectorAll('.ecbt-empty-state-banner').forEach((n) => n.remove());
}

function _injectEmptyStateBanner(body: HTMLElement, elementCount: number): void {
    // Remove banner anterior se houver
    body.querySelectorAll('.ecbt-empty-state-banner').forEach((n) => n.remove());
    const banner = document.createElement('div');
    banner.className = 'ecbt-empty-state-banner';
    banner.setAttribute('role', 'status');
    banner.style.cssText =
        'margin:12px 0;padding:14px 18px;border-radius:10px;background:rgba(250,180,80,0.10);' +
        'border:1px solid rgba(250,180,80,0.45);color:#f4c47a;font-size:14px;line-height:1.55;';
    // BOOT-ENTRY-UX-001 RF-D3 (#20): empty state com 3 funções
    // (status + ensina + ação "Carregar exemplo" que popula gêmeo digital demo).
    // NN/G Designing Empty States: status (o que aconteceu) + ensina (o que a
    // feature faz) + ação (como começar). O botão dispara generateRandomModel
    // que já existe e popula o mapa 3D com um cenário ambiental demo.
    if (elementCount === 0) {
        banner.innerHTML =
            '<strong>Sem modelo carregado.</strong> ' +
            'O ECBT Score calcula o balanço monetário entre ativos naturais e passivos ' +
            'ambientais do seu modelo 3D. O catálogo de benchmarks (TEEB/ESVD/SEEA/SNUC) ' +
            'já está ativo, aguardando elementos.' +
            '<div style="margin-top:10px;">' +
            '<button type="button" class="ecbt-empty-state-cta" ' +
            'data-action="empty-load-example" ' +
            'style="padding:6px 16px;border-radius:6px;border:1px solid rgba(120,200,120,0.5);' +
            'background:rgba(80,200,120,0.15);color:#7fd7a0;cursor:pointer;font-size:13px;' +
            'font-weight:600;">&#9654; Carregar exemplo</button>' +
            '</div>';
        // Wire the "Carregar exemplo" button to the existing demo generator.
        // generateRandomModel creates a full random environmental scenario
        // (families, elements, costs, campaigns) — the "gêmeo digital demo".
        const ctaBtn = banner.querySelector<HTMLButtonElement>('[data-action="empty-load-example"]');
        ctaBtn?.addEventListener('click', () => {
            const w = window as any;
            // Prefer the orchestrator entry (includes progress bar + aerial overlay)
            if (typeof w.handleHomeHeaderGenerate === 'function') {
                w.handleHomeHeaderGenerate();
            } else if (typeof w.generateRandomModel === 'function') {
                w.generateRandomModel({ source: 'ecbt-empty-state-cta' });
            } else if (typeof w.handleGenerateRandomModel === 'function') {
                w.handleGenerateRandomModel({ source: 'ecbt-empty-state-cta' });
            }
            // Model change events trigger panel re-render via _attachModelListeners.
        });
    } else {
        banner.innerHTML =
            '<strong>Modelo sem dimensão financeira ainda.</strong> ' +
            `${elementCount} elemento(s) carregado(s) mas nenhum tem custo (OPEX/CAPEX) nem geometria ` +
            'reconhecida (área, polígono, traçado). Adicione observações, dimensões ou custos ' +
            'para o ECBT Score calcular.';
    }
    body.appendChild(banner);
}

function _renderInto(overlay: HTMLElement): void {
    const w = window as any;
    const monetary = (w.__ecbtScoreSnapshot ?? _defaultMonetary()) as EcbtHudSnapshotInput;
    const physicalIn = (w.__ecbtPhysicalSnapshot ?? null) as PhysicalSnapshot | null;
    const physical = { ..._defaultPhysical(), ...(physicalIn || {}) };

    const { html, ariaLabel } = buildEcbtScorePanelHtml({ physical, monetary });
    const body = overlay.querySelector<HTMLElement>('.ecbt-panel-body');
    if (!body) return;
    body.innerHTML = html;
    overlay.setAttribute('aria-label', ariaLabel);
    _translatePanel(body);
    // 1º pass: empty state check síncrono/async (kick async se cache miss)
    _maybeInjectEmptyStateBannerSync(body);

    // F10 + F13 — recomputa physical + monetary do modelo real (paralelo).
    // 1ª render instantânea com defaults; 2ª atualiza com valores reais.
    const hasExplicitPhysicalSnapshot = physicalIn !== null && typeof physicalIn === 'object';
    const physicalPromise = hasExplicitPhysicalSnapshot
        ? Promise.resolve(null)
        : _computePhysicalFromModel();
    physicalPromise.then(async (real) => {
        if (real) (window as any).__ecbtPhysicalSnapshot = real;
        // F13 wire monetary — passa kappa do physical (ou 1 default)
        const kappa = physicalIn?.kappa ?? real?.kappa ?? 1;
        const monetaryReal = await _computeMonetaryFromModel(kappa);
        if (monetaryReal) (window as any).__ecbtScoreSnapshot = monetaryReal;
        // Re-render se algum snapshot mudou OU detecta empty state
        const empty = await _detectModelEmpty();
        const stillOpen = document.getElementById(OVERLAY_ID);
        if (!stillOpen) return;
        const needsRender = real || monetaryReal;
        // Atualiza cache de elementCount (usado por _maybeInjectEmptyStateBannerSync)
        (window as any).__ecbtElementsCount = empty.elementCount;
        if (needsRender) {
            const physical2 = { ..._defaultPhysical(), ...(physicalIn || real || {}) };
            const monetary2 = (monetaryReal ?? monetary) as EcbtHudSnapshotInput;
            const { html: html2, ariaLabel: ariaLabel2 } = buildEcbtScorePanelHtml({ physical: physical2, monetary: monetary2 });
            const body2 = stillOpen.querySelector<HTMLElement>('.ecbt-panel-body');
            if (!body2) return;
            body2.innerHTML = html2;
            stillOpen.setAttribute('aria-label', ariaLabel2);
            _translatePanel(body2);
        }
        // Calvin 2026-06-08 — empty state visível quando modelo sem dados.
        // Banner aparece se: (a) sem elementos OU (b) modelo com elementos mas sem
        // financial signal (monetaryReal null indica que rollup não acumulou OPEX/CAPEX
        // e extractNaturalAssets não pegou geometry/área de nenhuma família).
        const body3 = stillOpen.querySelector<HTMLElement>('.ecbt-panel-body');
        if (!body3) return;
        if (empty.isEmpty || !monetaryReal) {
            _injectEmptyStateBanner(body3, empty.elementCount);
        } else {
            // Modelo populado → garantir banner removido
            body3.querySelectorAll('.ecbt-empty-state-banner').forEach((n) => n.remove());
        }
    }).catch((e: any) => console.warn('[ecbtScorePanel:wire] re-render failed', e?.message || e));
}

// Calvin 2026-06-08 — listener re-render quando modelo carrega após abrir painel
function _attachModelListeners(_overlay: HTMLElement): void {
    if (_modelChangeHandler) _detachModelListeners();
    _modelChangeHandler = () => {
        if (_modelChangeDebounce) clearTimeout(_modelChangeDebounce);
        _modelChangeDebounce = setTimeout(() => {
            const still = document.getElementById(OVERLAY_ID);
            if (still) _renderInto(still);
        }, 250);
    };
    for (const evt of MODEL_EVENTS) {
        window.addEventListener(evt, _modelChangeHandler);
    }
}

function _detachModelListeners(): void {
    if (_modelChangeHandler) {
        for (const evt of MODEL_EVENTS) {
            window.removeEventListener(evt, _modelChangeHandler);
        }
        _modelChangeHandler = null;
    }
    if (_modelChangeDebounce) {
        clearTimeout(_modelChangeDebounce);
        _modelChangeDebounce = null;
    }
}

/**
 * ERP-DRE-001 §11.4 MI-5 — abre/fecha o painel da DRE dentro do modal do Score.
 *
 * Lê a `statement` cacheada por MI-3 em `window.__ecbtLastDreStatement` e a
 * renderiza via `utils/ui/erp/statementReport.renderStatementReport`. Quando
 * ainda não há statement (modelo sem custos ou Score não recalculado), mostra
 * uma mensagem de estado-vazio em vez de tabela em branco. Só é alcançável com
 * `CONFIG.FEATURES.ERP_DRE === true` (o trigger não é injetado de outra forma).
 */
async function _toggleDrePanel(overlay: HTMLElement): Promise<void> {
    const host = overlay.querySelector<HTMLElement>('.ecbt-panel-dre');
    if (!host) return;
    // Toggle: se já visível, esconde.
    if (!host.hidden) {
        host.hidden = true;
        return;
    }
    host.hidden = false;
    const w = window as any;
    const statement = w.__ecbtLastDreStatement;
    if (!statement || !Array.isArray(statement.lines)) {
        const msg =
            'A DRE aparece quando o ECBT Score é calculado com custos (OPEX/CAPEX) ' +
            'no modelo, ou lance manualmente uma receita/custo abaixo. Você também pode ' +
            'cadastrar parceiros/produtos/centros de custo e editar o plano de contas.';
        host.innerHTML =
            '<div class="erp-dre-empty" role="status">' +
            '<strong>Demonstração do Resultado (DRE)</strong><br>' +
            msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
            '<div class="erp-dre-empty-actions">' +
            '<button type="button" class="erp-dre-btn" data-erp-empty="entry">Novo lançamento</button>' +
            '<button type="button" class="erp-dre-btn" data-erp-empty="registries">Cadastros</button>' +
            '<button type="button" class="erp-dre-btn" data-erp-empty="chart">Plano de contas</button>' +
            '</div></div>';
        // Wire the empty-state management triggers (lazy-import the modals).
        host.querySelectorAll<HTMLButtonElement>('[data-erp-empty]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const kind = btn.getAttribute('data-erp-empty');
                try {
                    if (kind === 'entry') {
                        const m = await import('./erp/journalEditor.js');
                        await m.openJournalEditor();
                    } else if (kind === 'registries') {
                        const m = await import('./erp/erpRegistries.js');
                        await m.openErpRegistries();
                    } else {
                        const m = await import('./erp/chartEditor.js');
                        await m.openChartEditor();
                    }
                } catch (e: any) {
                    console.warn('[ecbtScorePanel:dre] empty-state modal failed', e?.message || e);
                }
            });
        });
        return;
    }
    const { renderStatementReport } = await import('./erp/statementReport.js');
    renderStatementReport(host, statement, {
        currency: String(statement?.currency || (w.__ecbtScoreSnapshot?.currency ?? 'BRL')),
        locale: 'pt-BR',
        depreciationAmortization: Number(w.__ecbtLastDreDA) || 0,
        ledger: w.__ecbtLastDreLedger,
    });
}

export function openEcbtScorePanel(): void {
    syncDeepLinkUrl('ecbt-score');
    let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
    if (overlay) {
        // Re-render with current state (snapshot may have changed).
        _renderInto(overlay);
        overlay.classList.remove('ecbt-panel-hidden');
        return;
    }
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'ecbt-overlay ecbt-panel-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    // ERP-DRE-001 §11.4 MI-5 — trigger da DRE visível SÓ com a flag ON (UX-First).
    const dreEnabled = CONFIG?.FEATURES?.ERP_DRE === true;
    const dreButton = dreEnabled
        ? `<button type="button" class="ecbt-panel-dre-trigger" data-action="open-dre" data-i18n="erpDre.openButton" title="Demonstração do Resultado (DRE)">DRE</button>`
        : '';
    // SCENARIOS-IMPACT-001 — trigger "Cenários" visível SÓ com a flag ON (UX-First,
    // mesmo precedente do trigger DRE). Off = botão não injetado (rollback hatch).
    const scenariosEnabled = CONFIG?.FEATURES?.SCENARIOS === true;
    const scenariosButton = scenariosEnabled
        ? `<button type="button" class="ecbt-panel-scenarios-trigger" data-action="open-scenarios" data-i18n="scenarios.openButton" title="Comparador de cenários (What-If)">Cenários</button>`
        : '';
    overlay.innerHTML = `
<div class="ecbt-dialog ecbt-dialog--xl ecbt-panel-dialog" role="document">
    <header class="ecbt-panel-header">
        <h2 data-i18n="ecbtScore.title">ECBT Score</h2>
        <span class="ecbt-panel-subtitle" data-i18n="ecbtScore.subtitle">Veredito monetário do balanço ativos/passivos</span>
        ${dreButton}
        ${scenariosButton}
        <button type="button" class="ecbt-panel-audit-trail" data-action="open-audit-trail" data-i18n="ecbt.audit_trail.button_open" title="Trilha auditável">Auditar cálculo</button>
        <button type="button" class="ecbt-panel-close" aria-label="Close" data-action="close-ecbt-panel">×</button>
    </header>
    <div class="ecbt-panel-body"></div>
    ${dreEnabled ? '<div class="ecbt-panel-dre" hidden></div>' : ''}
</div>`;
    document.body.appendChild(overlay);
    _renderInto(overlay);

    // Wire DRE trigger (MI-5). Lazy-imports the renderer só quando clicado.
    if (dreEnabled) {
        const dreBtn = overlay.querySelector<HTMLButtonElement>('[data-action="open-dre"]');
        dreBtn?.addEventListener('click', () => {
            _toggleDrePanel(overlay as HTMLElement).catch((e: any) =>
                console.warn('[ecbtScorePanel:dre] open failed', e?.message || e),
            );
        });
    }

    // Wire Cenários trigger (SCENARIOS-IMPACT-001). Lazy-import só quando clicado.
    if (scenariosEnabled) {
        const scnBtn = overlay.querySelector<HTMLButtonElement>('[data-action="open-scenarios"]');
        scnBtn?.addEventListener('click', async () => {
            try {
                const m = await import('./scenarios/scenarioComparatorPanel.js');
                m.openScenarioComparatorPanel();
            } catch (e: any) {
                console.warn('[ecbtScorePanel:scenarios] open failed', e?.message || e);
            }
        });
    }

    // Wire close: button + outside-click + ESC.
    const closeBtn = overlay.querySelector<HTMLButtonElement>('[data-action="close-ecbt-panel"]');
    closeBtn?.addEventListener('click', closeEcbtScorePanel);

    // Wire audit trail button (F7 — SPEC_ECBT_SCORE_AUDIT_TRAIL).
    const auditBtn = overlay.querySelector<HTMLButtonElement>('[data-action="open-audit-trail"]');
    auditBtn?.addEventListener('click', async () => {
        try {
            const [adapter, exporter] = await Promise.all([
                import('./ecbtAuditTrailPanel.js'),
                import('./ecbtAuditTrailExporter.js'),
            ]);
            // Auto-install listeners (idempotent) p/ Export XLSX + Markdown botões
            exporter.installEcbtAuditTrailExportListeners();
            // F8 — fecha o painel ECBT Score antes de abrir o audit trail (libera espaço/foco)
            closeEcbtScorePanel();
            // Fallback demo mode — modelo atual virá do model state em integração futura
            await adapter.openEcbtAuditTrailPanelFromPayload();
        } catch (err) {
            console.warn('[ecbt-score-panel] falha ao abrir audit trail:', (err as Error)?.message ?? err);
        }
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeEcbtScorePanel();
    });
    _escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeEcbtScorePanel();
    };
    document.addEventListener('keydown', _escHandler);

    // Calvin 2026-06-08 — re-renderiza quando modelo muda (corrige "nao aparece nnehum numero"
    // race condition: painel aberto antes de elementos chegarem ao manager).
    _attachModelListeners(overlay);

    // Focus management — close button keeps tab inside the modal trivially.
    setTimeout(() => closeBtn?.focus(), 0);
}

export function closeEcbtScorePanel(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    clearDeepLinkUrl();
    overlay.remove();
    if (_escHandler) {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
    }
    _detachModelListeners();
}

/**
 * Push the current physical block snapshot. Used by future F2 wire (when EIS
 * canonicalEngine starts emitting ⟨S, κ, veto⟩) to keep the panel current.
 */
export function setEcbtPhysicalSnapshot(snap: PhysicalSnapshot | null): void {
    (window as any).__ecbtPhysicalSnapshot = snap;
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) _renderInto(overlay);
}

// Window handlers (UI Visibility Rule: panel reachable via clickable trigger).
if (typeof window !== 'undefined') {
    (window as any).handleOpenEcbtScorePanel = openEcbtScorePanel;
    (window as any).handleCloseEcbtScorePanel = closeEcbtScorePanel;
}
