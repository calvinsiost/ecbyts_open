// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   OWNER WORKS PANEL — MKT-OWNER-VERIFY-001 F2 (RF-3/RF-4/RF-9)

   Modal com duas abas:
   - "Minhas Obras" (produtor): licenças emitidas das próprias obras +
     verificador (cola manifest de uma cópia em circulação → veredito
     owner-side 4 estados via core/licensing/_verifyPure).
   - "Obras Adquiridas" (comprador): as próprias licenças + verificação
     de conformidade da própria cópia (veredito buyer-side 4 estados;
     `differs` é INFORMATIVO — customização local é legítima).

   Gate: CONFIG.FEATURES.MARKETPLACE_OWNER_VERIFY OU localStorage
   'ecbyts-owner-verify'==='1' (override de teste/rollout).
   Listeners via AbortController (regra PERF-MASTER S3.3).
   Dados via RLS (pml_author_read / pml_buyer_read) — o client NUNCA
   filtra segurança, apenas apresenta.
   ================================================================ */

import { CONFIG } from '../../config.js';
import { t } from '../i18n/translations.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';
import { getSupabaseClient, getCurrentUser } from '../auth/session.js';
import { canonicalManifestFingerprint } from '../../core/licensing/_licenseCorePure.js';
import { buildOwnerVerdict, buildBuyerVerdict } from '../../core/licensing/_verifyPure.js';
import { Z_INDEX } from './zIndex.js';
import { openBuyerPurchasesPanel } from './buyerPurchasesPanel.js';

let _controller: AbortController | null = null;

function _flagOn(): boolean {
    try {
        if ((CONFIG as any)?.FEATURES?.MARKETPLACE_OWNER_VERIFY) return true;
        return localStorage.getItem('ecbyts-owner-verify') === '1';
    } catch {
        return false;
    }
}

const _sha256Hex = async (s: string): Promise<string> => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const VERDICT_CLASS: Record<string, string> = {
    authentic_licensed: 'ok', compliant: 'ok',
    authentic_unlicensed: 'warn', differs_from_licensed: 'warn',
    tampered: 'bad', license_revoked: 'bad',
    not_derived: 'neutral', not_licensed: 'neutral',
};

/** Abre o painel (gate de flag + sessão). */
export async function openOwnerWorksPanel() {
    if (!_flagOn()) {
        showToast(t('owner.works.flagOff') || 'Recurso em rollout — em breve.', 'info');
        return;
    }
    const userId = getCurrentUser?.()?.id || null;
    if (!userId) {
        showToast(t('owner.works.loginRequired') || 'Entre na sua conta para ver licenças.', 'warning');
        return;
    }
    closeOwnerWorksPanel();
    _controller = new AbortController();
    const { signal } = _controller;

    const overlay = document.createElement('div');
    overlay.className = 'ecbt-overlay';
    overlay.id = 'owner-works-overlay';
    overlay.style.zIndex = String(Z_INDEX.ASYNC_DIALOG);
    overlay.innerHTML = `
      <div class="ecbt-dialog ecbt-dialog--lg oworks-dialog" role="dialog" aria-modal="true"
           aria-labelledby="oworks-title">
        <div class="oworks-header">
          <h2 id="oworks-title">${escapeHtml(t('owner.works.title') || 'Licenças de Modelos Pagos')}</h2>
          <button class="oworks-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
        </div>
        <div class="oworks-tabs" role="tablist" aria-label="${escapeHtml(t('owner.works.title') || 'Licenças de Modelos Pagos')}">
          <button class="oworks-tab active" data-tab="owner" role="tab" id="oworks-tab-owner"
            aria-selected="true" aria-controls="oworks-pane-owner" tabindex="0">
            ${escapeHtml(t('owner.works.tabOwner') || 'Minhas Obras')}</button>
          <button class="oworks-tab" data-tab="buyer" role="tab" id="oworks-tab-buyer"
            aria-selected="false" aria-controls="oworks-pane-buyer" tabindex="-1">
            ${escapeHtml(t('owner.works.tabBuyer') || 'Obras Adquiridas')}</button>
        </div>
        <div class="oworks-body">
          <div class="oworks-pane" id="oworks-pane-owner" data-pane="owner" role="tabpanel" aria-labelledby="oworks-tab-owner">
            <p class="oworks-hint">${escapeHtml(t('owner.works.ownerHint') ||
                'Licenças emitidas das suas obras. Cole o manifest de uma cópia em circulação para verificar a origem.')}</p>
            <div class="oworks-list" id="oworks-owner-list" aria-live="polite" role="list"></div>
            <textarea id="oworks-owner-input" class="oworks-input" rows="4"
              aria-label="${escapeHtml(t('owner.works.pasteManifest') || 'Cole aqui o manifest JSON da cópia…')}"
              placeholder="${escapeHtml(t('owner.works.pasteManifest') || 'Cole aqui o manifest JSON da cópia…')}"></textarea>
            <button id="oworks-owner-verify" class="btn btn-primary"
              aria-label="${escapeHtml(t('owner.works.verify') || 'Verificar origem')}">
              ${escapeHtml(t('owner.works.verify') || 'Verificar origem')}</button>
            <div id="oworks-owner-verdict" class="oworks-verdict" aria-live="polite"></div>
          </div>
          <div class="oworks-pane" id="oworks-pane-buyer" data-pane="buyer" role="tabpanel" aria-labelledby="oworks-tab-buyer" hidden>
            <p class="oworks-hint">${escapeHtml(t('owner.works.buyerHint') ||
                'Suas licenças. Cole o manifest da sua cópia para conferir a conformidade — customização local é legítima.')}</p>
            <button id="oworks-open-purchases" class="btn"
              aria-label="${escapeHtml(t('buyer.purchases.title') || 'Minhas Compras')}">
              ${escapeHtml(t('buyer.purchases.openFromWorks') || 'Minhas compras e disputas')}</button>
            <div class="oworks-list" id="oworks-buyer-list" aria-live="polite" role="list"></div>
            <textarea id="oworks-buyer-input" class="oworks-input" rows="4"
              aria-label="${escapeHtml(t('owner.works.pasteManifest') || 'Cole aqui o manifest JSON da cópia…')}"
              placeholder="${escapeHtml(t('owner.works.pasteManifest') || 'Cole aqui o manifest JSON da cópia…')}"></textarea>
            <button id="oworks-buyer-verify" class="btn btn-primary"
              aria-label="${escapeHtml(t('owner.works.checkCompliance') || 'Verificar conformidade')}">
              ${escapeHtml(t('owner.works.checkCompliance') || 'Verificar conformidade')}</button>
            <div id="oworks-buyer-verdict" class="oworks-verdict" aria-live="polite"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.oworks-close')?.addEventListener('click', closeOwnerWorksPanel, { signal });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOwnerWorksPanel(); }, { signal });
    document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape') closeOwnerWorksPanel(); }, { signal });
    const _tabs = Array.from(overlay.querySelectorAll('.oworks-tab')) as HTMLElement[];
    _tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => _switchTab(overlay, tab.dataset.tab || 'owner'), { signal });
        // Navegação por seta (ARIA APG tablist) — teclado é requisito WCAG 2.1.1.
        tab.addEventListener('keydown', (e: Event) => {
            const ke = e as KeyboardEvent;
            let next = -1;
            if (ke.key === 'ArrowRight' || ke.key === 'ArrowDown') next = (i + 1) % _tabs.length;
            else if (ke.key === 'ArrowLeft' || ke.key === 'ArrowUp') next = (i - 1 + _tabs.length) % _tabs.length;
            const target = next >= 0 ? _tabs[next] : undefined;
            if (!target) return;
            ke.preventDefault();
            _switchTab(overlay, target.dataset.tab || 'owner');
            target.focus();
        }, { signal });
    });

    const data = await _loadData(userId);
    _renderLists(overlay, data, userId);

    // T2.3 — atalho para o painel Minhas Compras (disputa/aceite do comprador)
    overlay.querySelector('#oworks-open-purchases')?.addEventListener('click', () => {
        closeOwnerWorksPanel();
        void openBuyerPurchasesPanel();
    }, { signal });

    overlay.querySelector('#oworks-owner-verify')?.addEventListener('click', () => _verifyOwner(overlay, data), { signal });
    overlay.querySelector('#oworks-buyer-verify')?.addEventListener('click', () => _verifyBuyer(overlay, data, userId), { signal });
    // RF-5 — botão "Questionar uso" é criado dinamicamente dentro do veredito
    // (innerHTML re-renderizado a cada verificação); delegação no container
    // fixo do painel evita perder o listener a cada _renderVerdict.
    overlay.querySelector('#oworks-owner-verdict')?.addEventListener(
        'click',
        (e: Event) => {
            const btn = (e.target as HTMLElement)?.closest('.oworks-dispute-btn') as HTMLButtonElement | null;
            if (!btn) return;
            const out = overlay.querySelector('#oworks-owner-verdict') as any;
            const verdictPayload = out?._lastVerdictPayload;
            if (!verdictPayload) return;
            void _openDispute(overlay, btn.dataset.verdictKind || verdictPayload.kind, verdictPayload, btn.dataset.assetId || '');
        },
        { signal },
    );
}

export function closeOwnerWorksPanel() {
    _controller?.abort();
    _controller = null;
    document.getElementById('owner-works-overlay')?.remove();
}

function _switchTab(overlay: HTMLElement, tab: string) {
    overlay.querySelectorAll('.oworks-tab').forEach((b) => {
        const active = (b as HTMLElement).dataset.tab === tab;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
        b.setAttribute('tabindex', active ? '0' : '-1'); // roving tabindex (ARIA APG)
    });
    overlay.querySelectorAll('.oworks-pane').forEach((p) => {
        (p as HTMLElement).hidden = (p as HTMLElement).dataset.pane !== tab;
    });
}

async function _loadData(userId: string) {
    const out: any = { licenses: [], myWorks: [], releases: [] };
    try {
        const client: any = getSupabaseClient();
        if (!client) return out;
        // RLS devolve linhas onde sou autor OU comprador
        const { data: lic } = await client.from('paid_model_licenses').select('*').order('issued_at', { ascending: false }).limit(200);
        out.licenses = Array.isArray(lic) ? lic : [];
        const { data: works } = await client.from('libraries').select('id, name, version, manifest').eq('creator_id', userId).limit(100);
        out.myWorks = Array.isArray(works) ? works : [];
        for (const w of out.myWorks) {
            try {
                out.releases.push({
                    assetId: w.id, version: w.version,
                    fingerprint: await canonicalManifestFingerprint(w.manifest, _sha256Hex),
                    name: w.name,
                });
            } catch (e: any) {
                console.debug('[ownerWorks] release fingerprint:', e?.message || e);
            }
        }
    } catch (e: any) {
        console.debug('[ownerWorks] load:', e?.message || e);
    }
    return out;
}

function _licenseRow(l: any): string {
    const status = l.revoked_at
        ? `<span class="oworks-badge bad">${escapeHtml(t('owner.works.revoked') || 'revogada')}</span>`
        : `<span class="oworks-badge ok">${escapeHtml(t('owner.works.active') || 'ativa')}</span>`;
    return `<div class="oworks-row">
        <code>${escapeHtml(String(l.buyer_pseudonym || ''))}</code>
        <span>${escapeHtml(String(l.issued_at || '').slice(0, 10))}</span>
        ${status}
      </div>`;
}

function _renderLists(overlay: HTMLElement, data: any, userId: string) {
    const ownerLic = data.licenses.filter((l: any) => l.author_id === userId);
    const buyerLic = data.licenses.filter((l: any) => l.buyer_id === userId);
    const ownerEl = overlay.querySelector('#oworks-owner-list');
    const buyerEl = overlay.querySelector('#oworks-buyer-list');
    if (ownerEl) {
        ownerEl.innerHTML = ownerLic.length
            ? ownerLic.map(_licenseRow).join('')
            : `<p class="oworks-empty">${escapeHtml(t('owner.works.noneIssued') || 'Nenhuma licença emitida ainda.')}</p>`;
    }
    if (buyerEl) {
        buyerEl.innerHTML = buyerLic.length
            ? buyerLic.map(_licenseRow).join('')
            : `<p class="oworks-empty">${escapeHtml(t('owner.works.noneOwned') || 'Você ainda não adquiriu modelos pagos.')}</p>`;
    }
}

async function _fingerprintFromTextarea(overlay: HTMLElement, sel: string): Promise<string | null> {
    const raw = (overlay.querySelector(sel) as HTMLTextAreaElement)?.value?.trim();
    if (!raw) return null;
    try {
        return await canonicalManifestFingerprint(JSON.parse(raw), _sha256Hex);
    } catch {
        return null;
    }
}

/** RF-5 — vereditos que habilitam "Questionar uso" (âmbar/vermelho, lado do produtor). */
const DISPUTABLE_VERDICT_KINDS = new Set(['authentic_unlicensed', 'tampered']);

function _renderVerdict(el: Element | null, kind: string, title: string, reason: string, disputeCtx?: { assetId: string } | null) {
    if (!el) return;
    const cls = VERDICT_CLASS[kind] || 'neutral';
    const disputeBtn =
        disputeCtx && DISPUTABLE_VERDICT_KINDS.has(kind)
            ? `<button type="button" class="oworks-dispute-btn" data-verdict-kind="${escapeHtml(kind)}" data-asset-id="${escapeHtml(disputeCtx.assetId)}">
                 ${escapeHtml(t('owner.works.disputeAction') || 'Questionar uso')}
               </button>`
            : '';
    el.innerHTML = `<div class="oworks-verdict-card ${cls}" data-verdict="${escapeHtml(kind)}">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(reason)}</p>
        ${disputeBtn}
      </div>`;
}

/**
 * RF-5 — abre um questionamento formal: grava license_disputes (append-only,
 * veredito congelado em jsonb, RLS ld_author_insert já permite) + notifica
 * os admins via RPC SECURITY DEFINER (produtor comum não pode inserir
 * notificação para outro usuário — RLS notifications é user_id=auth.uid()).
 */
async function _openDispute(overlay: HTMLElement, verdictKind: string, verdictPayload: any, assetId: string) {
    const client: any = getSupabaseClient();
    const userId = getCurrentUser?.()?.id || null;
    if (!client || !userId) {
        showToast(t('owner.works.disputeError') || 'Não foi possível abrir o questionamento.', 'error');
        return;
    }
    try {
        const { data: dispute, error: insertErr } = await client
            .from('license_disputes')
            .insert({
                asset_id: assetId,
                author_id: userId,
                verdict_frozen: verdictPayload,
            })
            .select('dispute_id')
            .single();
        if (insertErr || !dispute) throw insertErr || new Error('insert_failed');
        await client.rpc('notify_admins_license_dispute', {
            p_dispute_id: dispute.dispute_id,
            p_asset_id: assetId,
            p_verdict_kind: verdictKind,
        });
        showToast(t('owner.works.disputeOpened') || 'Questionamento registrado. O admin foi notificado.', 'success');
        const btn = overlay.querySelector(`.oworks-dispute-btn[data-asset-id="${CSS.escape(assetId)}"]`) as HTMLButtonElement | null;
        if (btn) {
            btn.disabled = true;
            btn.textContent = t('owner.works.disputeOpened') || 'Questionamento registrado';
        }
    } catch (e: any) {
        console.debug('[ownerWorks] openDispute:', e?.message || e);
        showToast(t('owner.works.disputeError') || 'Não foi possível abrir o questionamento.', 'error');
    }
}

async function _verifyOwner(overlay: HTMLElement, data: any) {
    const out = overlay.querySelector('#oworks-owner-verdict');
    const fp = await _fingerprintFromTextarea(overlay, '#oworks-owner-input');
    if (!fp) {
        _renderVerdict(out, 'neutral', t('owner.works.invalidInput') || 'Entrada inválida', t('owner.works.pasteValidJson') || 'Cole um manifest JSON válido.');
        return;
    }
    const v = buildOwnerVerdict({ copyFingerprint: fp, integrityOk: true, ownerReleases: data.releases, licenses: data.licenses });
    const titles: Record<string, string> = {
        authentic_licensed: t('owner.works.vLicensed') || 'Autêntica e licenciada',
        authentic_unlicensed: t('owner.works.vUnlicensed') || 'Autêntica, SEM licença ativa',
        tampered: t('owner.works.vTampered') || 'Adulterada',
        not_derived: t('owner.works.vNotDerived') || 'Não deriva das suas obras',
    };
    const extra = v.kind === 'authentic_licensed' ? ` — ${v.licensedTo} (${String(v.issuedAt).slice(0, 10)})` : '';
    const assetId = v.assetId || data.releases[0]?.assetId || null;
    _renderVerdict(out, v.kind, titles[v.kind] || v.kind, v.reason + extra, assetId ? { assetId } : null);
    if (out) (out as any)._lastVerdictPayload = v;
}

async function _verifyBuyer(overlay: HTMLElement, data: any, userId: string) {
    const out = overlay.querySelector('#oworks-buyer-verdict');
    const fp = await _fingerprintFromTextarea(overlay, '#oworks-buyer-input');
    if (!fp) {
        _renderVerdict(out, 'neutral', t('owner.works.invalidInput') || 'Entrada inválida', t('owner.works.pasteValidJson') || 'Cole um manifest JSON válido.');
        return;
    }
    const my = data.licenses.filter((l: any) => l.buyer_id === userId);
    // verifica contra a obra da licença mais recente que casa por fingerprint;
    // sem match exato, usa a obra da licença mais recente (differs informativo)
    const exact = my.find((l: any) => l.key_fingerprint === fp);
    const assetId = exact?.asset_id || my[0]?.asset_id || 'unknown';
    const v = buildBuyerVerdict({ localFingerprint: fp, assetId, myLicenses: my });
    const titles: Record<string, string> = {
        compliant: t('owner.works.vCompliant') || 'Em conformidade',
        differs_from_licensed: t('owner.works.vDiffers') || 'Difere do licenciado (informativo)',
        license_revoked: t('owner.works.vRevoked') || 'Licença revogada',
        not_licensed: t('owner.works.vNotLicensed') || 'Sem licença para esta obra',
    };
    _renderVerdict(out, v.kind, titles[v.kind] || v.kind, v.reason);
}

/** Registra handlers window.* (chamado no main.ts). */
export function registerOwnerWorksHandlers() {
    (window as any).openOwnerWorksPanel = openOwnerWorksPanel;
    (window as any).closeOwnerWorksPanel = closeOwnerWorksPanel;
}
