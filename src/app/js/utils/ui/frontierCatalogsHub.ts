// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Frontier Catalogs Hub (claude - novaspec, 2026-06-02) — UI ENTRY POINT.
 *
 * Modal único que agrega os 6 catálogos de fronteira entregues hoje:
 *   - Analytics (FC-01) — 490 modelos de cálculo ambiental
 *   - Solvers (FC-03) — 6 solvers numéricos registered
 *   - Recognition (FC-04) — 4 estratégias vectorization
 *   - GeoML/Gaussian Process (FC-05) — 9 capabilities R&W 2006
 *   - Subsurface 3D (FC-06) — 11 capabilities wells/geology/voxel
 *   - MCA Panel (FC-02) — Modelo Conceitual da Área (separado, já tem botão MCA)
 *
 * Atende **CLAUDE.md "UI Visibility Rule"**: cada feature deve ser
 * alcançável pelo usuário via UI. Antes deste hub, os catálogos
 * existiam apenas como `window.open*Catalog()` invisíveis.
 *
 * Wired no _panelDiscoveryRegistry como `frontier_catalogs` para
 * aparecer automaticamente no Discovery panel.
 *
 * Refs:
 *   - Adapters: analyticsCatalog/solverCatalog/recognitionCatalog/
 *     geomlCatalog/subsurfaceCatalog
 *   - Abstração: SPEC_REGISTRY_CATALOG (commit b4318e98)
 */

import { createModal } from './modal.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { t } from '../i18n/translations.js';

/**
 * Definição de cada catálogo no hub. Cada entry tem:
 *   - id estável (testes podem grep)
 *   - label i18n key + fallback pt-BR
 *   - description curta para o card
 *   - openHandler (lazy-load do adapter)
 *   - count opcional (sumário "490 modelos") — cosmético
 */
export interface CatalogHubEntry {
    readonly id: string;
    readonly labelKey: string;
    readonly defaultLabel: string;
    readonly descriptionKey: string;
    readonly defaultDescription: string;
    readonly openHandler: () => Promise<void> | void;
    readonly countLabel?: string;
}

/**
 * Catálogos canônicos surfaceados pelo hub. Frozen para invariante.
 * Adicionar novo catálogo = adicionar entry aqui + cheap test verifica.
 */
export const HUB_CATALOG_ENTRIES: ReadonlyArray<CatalogHubEntry> = Object.freeze([
    Object.freeze({
        id: 'analytics',
        labelKey: 'hubCatalog.analytics.label',
        defaultLabel: 'Modelos analíticos',
        descriptionKey: 'hubCatalog.analytics.desc',
        defaultDescription: 'Catálogo navegável dos modelos de cálculo ambiental — busca, filtro por matriz, export CSV',
        countLabel: '490',
        openHandler: async () => {
            const mod = (await import('./analyticsCatalog.js' as any)) as any;
            if (typeof mod.openAnalyticsCatalog === 'function') await mod.openAnalyticsCatalog();
        },
    }),
    Object.freeze({
        id: 'solver',
        labelKey: 'hubCatalog.solver.label',
        defaultLabel: 'Solvers numéricos',
        descriptionKey: 'hubCatalog.solver.desc',
        defaultDescription: 'Catálogo dos solvers registered no executor — Gaussian Plume, SCS-CN, USLE/RUSLE, Theis-Thiem, Green-Ampt, Manning',
        countLabel: '6',
        openHandler: async () => {
            const mod = (await import('./solverCatalog.js' as any)) as any;
            if (typeof mod.openSolverCatalog === 'function') await mod.openSolverCatalog();
        },
    }),
    Object.freeze({
        id: 'recognition',
        labelKey: 'hubCatalog.recognition.label',
        defaultLabel: 'Reconhecimento de imagem',
        descriptionKey: 'hubCatalog.recognition.desc',
        defaultDescription: 'Estratégias de vectorização — vegetação (Watershed), edifícios (Canny), vias (Skeleton), água (Morphology)',
        countLabel: '4',
        openHandler: async () => {
            const mod = (await import('./recognitionCatalog.js' as any)) as any;
            if (typeof mod.openRecognitionCatalog === 'function') await mod.openRecognitionCatalog();
        },
    }),
    Object.freeze({
        id: 'geoml',
        labelKey: 'hubCatalog.geoml.label',
        defaultLabel: 'GeoML — Gaussian Process',
        descriptionKey: 'hubCatalog.geoml.desc',
        defaultDescription: 'Kernels (Matérn 3/2, RBF, Exponential) + fitGP/predictGP + LOO + MLE (Rasmussen & Williams 2006)',
        countLabel: '9',
        openHandler: async () => {
            const mod = (await import('./geomlCatalog.js' as any)) as any;
            if (typeof mod.openGeomlCatalog === 'function') await mod.openGeomlCatalog();
        },
    }),
    Object.freeze({
        id: 'subsurface',
        labelKey: 'hubCatalog.subsurface.label',
        defaultLabel: 'Subsuperfície 3D',
        descriptionKey: 'hubCatalog.subsurface.desc',
        defaultDescription: 'Wellbore MCM + estratos/litologia + voxels 3D (Sawaryn 2005 SPE, Bourgoyne)',
        countLabel: '11',
        openHandler: async () => {
            const mod = (await import('./subsurfaceCatalog.js' as any)) as any;
            if (typeof mod.openSubsurfaceCatalog === 'function') await mod.openSubsurfaceCatalog();
        },
    }),
    Object.freeze({
        id: 'sao',
        labelKey: 'hubCatalog.sao.label',
        defaultLabel: 'SAO — Matrizes ESH',
        descriptionKey: 'hubCatalog.sao.desc',
        defaultDescription: 'Matrizes ESH (Environment, Safety & Health) — 9 compartimentos + RAM 5×5 + Hierarchy of Controls (NIOSH/ISO 45001)',
        countLabel: '9+',
        openHandler: async () => {
            const mod = (await import('./saoCatalog.js' as any)) as any;
            if (typeof mod.openSaoCatalog === 'function') await mod.openSaoCatalog();
        },
    }),
    Object.freeze({
        id: 'dictionary',
        labelKey: 'hubCatalog.dictionary.label',
        defaultLabel: 'Dicionário ECBT',
        descriptionKey: 'hubCatalog.dictionary.desc',
        defaultDescription: 'Parâmetros (73) + Unidades (63) + Substâncias CAS (52) — contagem real auditada (plano §4.7 afirma 426; delta -238 documentado)',
        countLabel: '188',
        openHandler: async () => {
            const mod = (await import('./paramCatalog.js' as any)) as any;
            if (typeof mod.openParamCatalog === 'function') await mod.openParamCatalog();
        },
    }),
    Object.freeze({
        id: 'ecbtCrypto',
        labelKey: 'hubCatalog.ecbtCrypto.label',
        defaultLabel: 'Criptografia ECBT',
        descriptionKey: 'hubCatalog.ecbtCrypto.desc',
        defaultDescription: 'Chave ECBT criptografada por perfil radar (Tipo D, envelope JWE multi-recipient) — SPEC ECBT-CRYPT-001. AES-GCM 256 + ECDH P-256 + Web Crypto nativo.',
        countLabel: 'D',
        openHandler: async () => {
            const mod = (await import('./ecbtCryptoModals.js' as any)) as any;
            if (typeof mod.openEcbtCryptoInfoModal === 'function') await mod.openEcbtCryptoInfoModal();
        },
    }),
]);

/**
 * Abre o hub master. Renderiza cards (1 por catálogo) com label,
 * description, count badge e botão "Abrir". Reusa createModal M2.5.
 *
 * Exportado para wire em panel discovery + window global para
 * triggers manuais (ribbon, menu, atalho).
 */
export function openFrontierCatalogsHub(): void {
    const body = document.createElement('div');
    body.className = 'hub-catalog-root';
    const intro = document.createElement('p');
    intro.className = 'hub-catalog-intro';
    intro.textContent = (t ? t('hubCatalog.intro') : '')
        || 'Catálogos descobríveis das capacidades cientificas do ECBT. Clique para abrir cada catálogo (busca, filtro, export CSV).';
    body.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'hub-catalog-list';
    list.setAttribute('role', 'list');
    for (const entry of HUB_CATALOG_ENTRIES) {
        list.appendChild(_buildCard(entry));
    }
    body.appendChild(list);

    createModal({
        title: (t ? t('hubCatalog.title') : '') || 'Catálogos do ECBT',
        size: 'lg',
        body,
        closeOnEsc: true,
        closeOnBackdropClick: true,
        extraClass: 'hub-catalog-dialog',
        onClose: () => clearDeepLinkUrl(),
    });
    syncDeepLinkUrl('frontier-catalogs');
}

function _buildCard(entry: CatalogHubEntry): HTMLElement {
    const card = document.createElement('div');
    card.className = 'hub-catalog-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('data-catalog-id', entry.id);

    const head = document.createElement('div');
    head.className = 'hub-catalog-card-head';

    const label = document.createElement('div');
    label.className = 'hub-catalog-card-label';
    label.textContent = (t ? t(entry.labelKey) : '') || entry.defaultLabel;
    head.appendChild(label);

    if (entry.countLabel) {
        const count = document.createElement('span');
        count.className = 'hub-catalog-card-count';
        count.textContent = entry.countLabel;
        count.setAttribute('aria-label', `${entry.countLabel} entries`);
        head.appendChild(count);
    }
    card.appendChild(head);

    const desc = document.createElement('div');
    desc.className = 'hub-catalog-card-desc';
    desc.textContent = (t ? t(entry.descriptionKey) : '') || entry.defaultDescription;
    card.appendChild(desc);

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn btn-primary hub-catalog-card-action';
    openBtn.textContent = (t ? t('hubCatalog.open') : '') || 'Abrir catálogo';
    openBtn.addEventListener('click', async () => {
        try {
            await entry.openHandler();
        }
        catch (e: any) {
            console.debug('[hubCatalog] open handler failed', entry.id, e?.message || e);
        }
    });
    card.appendChild(openBtn);

    return card;
}

// Expose globally — ribbon/menu wire pode chamar diretamente
if (typeof window !== 'undefined') {
    (window as any).openFrontierCatalogsHub = openFrontierCatalogsHub;
}
