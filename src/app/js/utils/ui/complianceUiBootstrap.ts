// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// COMPLIANCE-PRESET-001 — UI Bootstrap (wire fino, self-contained).
// Owner SPEC: claude - novaspec. Wire UI por claude - executor 2026-06-06.
//
// Calvin: "não vejo na tela local onde tenha onde visualizar os presets"
// → este módulo monta o banner persistente em pixels reais
// (position:fixed acima do statusbar) e abre seletor com 6 presets canônicos
// quando usuário clica em [Escolher preset ▼].
//
// Scope clean — NÃO importa complianceBanner.ts (claude - novaspec) para evitar
// dependência de layout #main-area/grid-rows. Banner próprio com inline style
// garante pixels visíveis (Pixels-Over-DOM).

import { CONFIG } from '../../config.js';
import { ComplianceManager } from '../../core/compliance/manager.js';
import { findCanonicalPreset } from '../../core/compliance/_canonicalPresetsCatalog.js';
import type { ModelComplianceState, PresetScope } from '../../core/compliance/_modelBindingsPure.js';
import { addBinding } from '../../core/compliance/_modelBindingsPure.js';
import { buildConformityIndicator } from '../../core/compliance/_conformityIndicatorPure.js';
import type { ConformityTone } from '../../core/compliance/_conformityIndicatorPure.js';
import {
    isHealthAndSafetyPreset,
    classifyLegalBasisAsHS,
    classifyReportTemplateAsHS,
} from '../../core/compliance/_healthSafetyClassifyPure.js';
import { openComplianceDetailsModal } from './complianceDetailsModal.js';
import type { DetailsModalInput, DetailsModalI18n } from '../../core/compliance/_detailsModalContentPure.js';
import type { CompliancePreset } from '../../core/compliance/_presetPure.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { asyncPrompt, asyncConfirm } from './asyncDialogs.js';
import { showToast } from './toast.js';

// ----------------------------------------------------------------
// SINGLETON
// ----------------------------------------------------------------

let _manager: ComplianceManager | null = null;
let _initialized = false;
const BANNER_ID = 'compliance-banner';
const PRESETS_SELECTOR_ID = 'compliance-presets-selector';

// PRESET-IN-CONSTELLATION (Calvin 2026-06-17): o módulo de preset deixou de ser
// uma faixa flutuante position:fixed acima do statusbar e passou a ser a aba
// "Preset" do painel inferior de constellation (decisão Calvin: "nova aba" +
// "some ao recolher"). O banner agora é montado DENTRO de
// #constellation-view-preset (a view da aba), em fluxo normal.
const PRESET_VIEW_ID = 'constellation-view-preset';

/**
 * Returns the global ComplianceManager (creates lazily). Local-only mode
 * (no Supabase fetcher — apenas presets canônicos seedados).
 */
export function getComplianceManager(): ComplianceManager {
    if (_manager) return _manager;
    _manager = new ComplianceManager({
        onStateChanged: (_state) => {
            _renderBanner(_state);
            _syncActivePresetExports(_state);
        },
    });
    return _manager;
}

/**
 * Calvin 2026-06-11: "o tile do hud deve refletir isso" — o violations HUD
 * (violationsHud.ts) lê window.__ecbtActivePresetId/__ecbtActivePresetChip,
 * mas até hoje NINGUÉM os exportava (tile sempre via "NO PRESET"). Sincroniza
 * a cada mudança de estado + invalida o cache de violations para recount.
 */
function _syncActivePresetExports(state: ModelComplianceState): void {
    try {
        if (typeof window === 'undefined') return;
        const bindings = state?.bindings || [];
        const primary = bindings.find((b) => b.scope === 'all') || bindings[0] || null;
        window.__ecbtActivePresetId = primary?.presetId || null;
        // Label curto p/ o footer do tile (id canônico é longo demais p/ 115px)
        if (primary) {
            const preset = findCanonicalPreset(primary.presetId);
            window.__ecbtActivePresetChip = preset ? _friendlyPresetMeta(preset).chipLabel : primary.presetId;
        } else {
            window.__ecbtActivePresetChip = null;
        }
        window.__ecbtViolations = undefined; // invalida cache — recount com o novo preset
        void import('./violationsHud.js')
            .then((m) => {
                m.invalidateViolationsHudCache?.();
                m.updateViolationsHud?.();
            })
            .catch((e: unknown) => console.debug('[compliance:hud-sync]', (e as Error)?.message || e));
    } catch (e) {
        console.debug('[compliance:hud-sync]', (e as Error)?.message || e);
    }
}

// ----------------------------------------------------------------
// I18N HELPERS (fallback PT-BR — i18n.t() opcional)
// ----------------------------------------------------------------

interface MaybeT {
    (key: string, fallback?: string): string;
}

function _t(key: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    const t: MaybeT | undefined = window.t || (window.translations && window.translations.t);
    if (typeof t === 'function') {
        try {
            const v = t(key, fallback);
            if (typeof v === 'string' && v !== key) return v;
        } catch (e) {
            console.debug('[compliance:i18n]', (e as Error)?.message || e);
        }
    }
    return fallback;
}

// B5 fix: Chromium em Windows headless não renderiza emoji bandeira.
// Usamos SVG inline com cores oficiais — funciona em qualquer fonte/SO.
function _flagSvgForJurisdiction(j: string | undefined): string {
    const code = (j || '').toUpperCase();
    const w = 20;
    const h = 14;
    const wrap = (inner: string): string =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 60 42" ` +
        `style="border-radius:2px;flex-shrink:0;vertical-align:middle">${inner}</svg>`;
    switch (code) {
        case 'BR':
            // Verde + losango amarelo + círculo azul (cores oficiais aproximadas)
            return wrap(
                '<rect width="60" height="42" fill="#009C3B"/>' +
                    '<polygon points="30,4 56,21 30,38 4,21" fill="#FFDF00"/>' +
                    '<circle cx="30" cy="21" r="9" fill="#002776"/>',
            );
        case 'US':
            return wrap(
                '<rect width="60" height="42" fill="#FFF"/>' +
                    '<g fill="#B22234"><rect y="0" width="60" height="3.2"/><rect y="6.5" width="60" height="3.2"/>' +
                    '<rect y="13" width="60" height="3.2"/><rect y="19.5" width="60" height="3.2"/>' +
                    '<rect y="26" width="60" height="3.2"/><rect y="32.5" width="60" height="3.2"/>' +
                    '<rect y="38.8" width="60" height="3.2"/></g>' +
                    '<rect width="24" height="22.4" fill="#3C3B6E"/>',
            );
        case 'EU':
            return wrap(
                '<rect width="60" height="42" fill="#003399"/>' +
                    '<circle cx="30" cy="21" r="10" fill="none" stroke="#FFCC00" stroke-width="1.2"/>',
            );
        case 'GLOBAL':
            return wrap(
                '<circle cx="30" cy="21" r="18" fill="#1d4ed8"/>' +
                    '<path d="M12 21 L48 21 M30 3 L30 39 M16 9 Q30 21 44 33 M16 33 Q30 21 44 9" ' +
                    'stroke="#fff" stroke-width="1.5" fill="none" opacity="0.7"/>',
            );
        default:
            return wrap('<rect width="60" height="42" fill="#6b7280"/><text x="30" y="27" text-anchor="middle" fill="#fff" font-size="20" font-weight="700">?</text>');
    }
}

function _escapeHtml(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
    );
}

// ----------------------------------------------------------------
// FRIENDLY META — descrições expressivas (Calvin: "nomes ainda parecem
// estar misturando ou simplificando as coisas"). Hardcoded por id canônico
// + fallback computed para presets remotos. Cobre escopo de aplicação,
// nome oficial completo, vigência e tipo de cobertura.
// ----------------------------------------------------------------

interface PresetFriendlyMeta {
    readonly displayName: string; // título card/banner — nome regulatório completo
    readonly tagline: string; // 1 linha "para que serve"
    readonly scopeNote: string; // a que matrizes/temas se aplica
    readonly chipLabel: string; // banner chip compacto
    readonly category: string; // categoria narrativa (Regulador / Framework / Pareto / etc)
}

function _friendlyPresetMeta(p: CompliancePreset): PresetFriendlyMeta {
    const id = p.id || '';
    const auth = p.publishedBy?.authority || '?';
    const ver = p.version || '?';
    const map: Record<string, PresetFriendlyMeta> = {
        'br-conama-420-ar4': {
            displayName: 'Resolução CONAMA nº 420/2009 — Solos Contaminados (Brasil)',
            tagline: 'Padrão federal brasileiro para qualidade do solo e gestão de áreas contaminadas',
            scopeNote: 'Aplica-se a: solo · águas subterrâneas · VRQ/VP/VI · classificação de áreas',
            chipLabel: 'CONAMA 420/2009 BR',
            category: 'Regulador oficial',
        },
        'global-ghg-protocol-corporate': {
            displayName: 'GHG Protocol — Corporate Accounting & Reporting Standard (Revised 2015)',
            tagline: 'Padrão corporativo de inventário de emissões de GEE — base de ~95% das empresas globais',
            scopeNote: 'Aplica-se a: emissões GHG escopos 1/2/3 · GWP AR5 · relatórios anuais ESG/CDP',
            chipLabel: 'GHG Protocol 2015',
            category: 'Framework corporativo internacional',
        },
        'global-pareto-most-restrictive-worldwide': {
            displayName: 'ecbyts Pareto — Envelope Mais Restritivo Mundial (2026)',
            tagline: 'Combinação conservadora dos thresholds mais rígidos de 5 jurisdições principais',
            scopeNote: 'min(CONAMA 420 · CETESB DD256 · EPA RCRA · EU CSRD/ESRS · ISSB S2)',
            chipLabel: 'Pareto Worldwide',
            category: '⭐ Pareto conservador (recomendado p/ exportação)',
        },
        'global-aspirational-net-zero-2050': {
            displayName: 'UNFCCC Paris Agreement Art. 4.1 — Net Zero 2050 / SBTi 1.5°C',
            tagline: 'Trajetória aspiracional alinhada Acordo de Paris e Science Based Targets',
            scopeNote: 'Aplica-se a: emissões GHG · GWP AR6 · meta -50% até 2030, net-zero 2050',
            chipLabel: 'Paris 1.5°C',
            category: 'Aspiracional Net Zero',
        },
        'global-sector-mining-icmm': {
            displayName: 'ICMM Performance Expectations 2024 + IBRAM Diretrizes Mineração BR',
            tagline: 'Padrão setorial mineração — governança, ambiental, social e direitos humanos',
            scopeNote: 'Aplica-se a: pit · tailings · water stewardship · GHG · biodiversidade · comunidades',
            chipLabel: 'ICMM 2024',
            category: 'Setorial — Mineração',
        },
        'global-legacy-kyoto-sar-1997': {
            displayName: 'Protocolo de Kyoto Art. 3 (1997) — IPCC SAR Working Group I',
            tagline: 'Baseline histórico pré-2013 para auditoria retroativa e comparabilidade temporal',
            scopeNote: 'Aplica-se a: GHG · GWP SAR (legacy) · vigência 1997-12-11 → 2012-12-31',
            chipLabel: 'Kyoto SAR 1997',
            category: 'Histórico / Stress test',
        },
        'global-acgih-tlv-bei-2024': {
            displayName: 'ACGIH TLV-TWA + BEI 2024 — Limites de Exposição Ocupacional (Global)',
            tagline: 'Referência mundial: Threshold Limit Values + Biological Exposure Indices ACGIH 2024',
            scopeNote: 'Aplica-se a: exposição ar respirável (TLV-TWA/STEL/Ceiling) + biomonitoramento (BEI sangue/urina)',
            chipLabel: 'ACGIH TLV/BEI 2024',
            category: '🩺 Saúde Ocupacional Global',
        },
        'br-nr7-pcmso-nr15-lt': {
            displayName: 'NR-7 PCMSO + NR-15 Limites de Tolerância + NR-9 PGR + PPP/INSS (Brasil)',
            tagline: 'Saúde ocupacional Brasil — obrigatório CLT — PCMSO, ASO, LT, PGR, PPP',
            scopeNote: 'Aplica-se a: insalubridade NR-15 · ASO admissional/periódico/demissional · PPP previdenciário · LTCAT',
            chipLabel: 'NR-7+15 PCMSO BR',
            category: '🩺 Saúde Ocupacional Brasil',
        },
    };
    const known = map[id];
    if (known) return known;
    // Fallback computed para presets fora do catálogo seed
    return {
        displayName: `${auth} ${ver}`,
        tagline: (p.legalBasis && p.legalBasis[0]) || id,
        scopeNote: `Jurisdição: ${p.publishedBy?.jurisdiction || '?'} · Nível: ${p.publishedBy?.level || '?'}`,
        chipLabel: `${auth} v${ver}`,
        category: p.publishedBy?.level || 'Outro',
    };
}

// ----------------------------------------------------------------
// COMPONENTS — Calvin: "1 preset deve possibilitar eu colocar conama 420,
// limites de exposicao xpto, gwp abc, etc.. cada um deve ser uma marcacao
// no rodape diferente"
//
// Cada CompliancePreset agrega multiplos componentes regulatorios. Expomos
// como lista de chips no banner — 1 chip por norma/registry/template.
// ----------------------------------------------------------------

export type PresetComponentKind =
    | 'legal'           // Resolucao CONAMA 420/2009, Paris Art. 4.1, etc
    | 'gwp'             // GWP AR4 / 100y
    | 'emission-registry' // br-ipcc-2006, eu-mrv-2023
    | 'taxonomy'        // abnt-nbr-soil, EPA WQX
    | 'validation'      // br-conama-420-2009 perfil
    | 'report-template' // conama-420-soil-template
    | 'eis-weights'     // T=4 A=3 Cp=2 Ty=2 Cs=1 Cm=1
    | 'crs'             // EPSG:31983
    | 'retention'       // 1825 dias (5 anos)
    | 'currency'        // BRL, USD, EUR
    | 'lang'            // pt-BR
    | 'exposure-limit'  // TLV-TWA, BEI, PEL, REL, NR-15 LT (Calvin H&S)
    | 'health-protocol'; // PCMSO, ASO, PPP, vigilância médica (Calvin H&S)

export interface PresetComponent {
    readonly kind: PresetComponentKind;
    readonly label: string; // ex: "CONAMA 420/2009"
    readonly fullLabel: string; // ex: "Resolução CONAMA nº 420/2009 (federal Brasil)"
    readonly icon: string; // emoji/símbolo curto
    readonly color: string; // CSS hex
    readonly tooltip: string; // hover detalhado
}

const COMPONENT_STYLE: Record<PresetComponentKind, { icon: string; color: string; bg: string; border: string; label: string }> = {
    'legal':             { icon: '📜', color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.4)',  label: 'Norma legal' },
    'gwp':               { icon: '🌡',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.4)',  label: 'GWP (potencial aquecimento)' },
    'emission-registry': { icon: '🏭', color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.4)',  label: 'Registro de fatores de emissão' },
    'taxonomy':          { icon: '🗂',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.4)',  label: 'Taxonomia de campos' },
    'validation':        { icon: '✓',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.4)',  label: 'Perfil de validação' },
    'report-template':   { icon: '📄', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   border: 'rgba(6,182,212,0.4)',   label: 'Template de relatório' },
    'eis-weights':       { icon: '⚖',  color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.4)',  label: 'Pesos EIS' },
    'crs':               { icon: '🗺',  color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)',  border: 'rgba(14,165,233,0.4)',  label: 'Sistema de coordenadas' },
    'retention':         { icon: '🗓',  color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.4)',  label: 'Retenção audit' },
    'currency':          { icon: '$',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.4)',   label: 'Moeda' },
    'lang':              { icon: '🗣',  color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.4)', label: 'Idioma' },
    // Saúde Ocupacional — vermelho (criticidade exposição humana)
    'exposure-limit':    { icon: '⚠',  color: '#dc2626', bg: 'rgba(220,38,38,0.12)',   border: 'rgba(220,38,38,0.5)',   label: 'Limite de exposição ocupacional' },
    'health-protocol':   { icon: '🩺', color: '#e11d48', bg: 'rgba(225,29,72,0.12)',   border: 'rgba(225,29,72,0.5)',   label: 'Protocolo de saúde ocupacional' },
};

// Calvin H&S: detecta se preset é de saúde ocupacional via autoridade/legalBasis.
// Quando true, certas categorias mudam de tipo (legal→exposure-limit, template→health-protocol)
function _extractPresetComponents(p: CompliancePreset): ReadonlyArray<PresetComponent> {
    const out: PresetComponent[] = [];
    const style = (k: PresetComponentKind) => COMPONENT_STYLE[k];
    const isHS = isHealthAndSafetyPreset(p);

    // 1. Normas legais (legalBasis array — 1 chip por norma)
    if (Array.isArray(p.legalBasis)) {
        for (const basis of p.legalBasis) {
            const kind: PresetComponentKind = isHS ? classifyLegalBasisAsHS(basis) : 'legal';
            const s = style(kind);
            // Compactar: "Resolução CONAMA 420/2009" → "CONAMA 420/2009"
            const compact = basis
                .replace(/Resolução\s+/i, '')
                .replace(/Protocol\s+/i, 'Protocol ')
                .replace(/Agreement\s+/i, 'Agreement ')
                .replace(/^NR-?(\d+)\s+/i, 'NR-$1 ');
            out.push({
                kind,
                label: compact.length > 42 ? compact.slice(0, 40) + '…' : compact,
                fullLabel: basis,
                icon: s.icon,
                color: s.color,
                tooltip: `${s.label}: ${basis}`,
            });
        }
    }

    // 2. GWP
    if (p.ghgFactors) {
        const s = style('gwp');
        out.push({
            kind: 'gwp',
            label: `GWP ${p.ghgFactors.gwpVersion}/${p.ghgFactors.timeHorizon}y`,
            fullLabel: `Global Warming Potential ${p.ghgFactors.gwpVersion} · horizonte ${p.ghgFactors.timeHorizon} anos`,
            icon: s.icon,
            color: s.color,
            tooltip: `${s.label}: IPCC ${p.ghgFactors.gwpVersion}, horizonte ${p.ghgFactors.timeHorizon} anos`,
        });
    }

    // 3. Emission Registry
    if (p.emissionFactorsRegistry) {
        const s = style('emission-registry');
        out.push({
            kind: 'emission-registry',
            label: p.emissionFactorsRegistry,
            fullLabel: `Registry: ${p.emissionFactorsRegistry}`,
            icon: s.icon,
            color: s.color,
            tooltip: `${s.label}: ${p.emissionFactorsRegistry}`,
        });
    }

    // 4. Validation Profile
    if (p.validationProfileId) {
        const s = style('validation');
        out.push({
            kind: 'validation',
            label: p.validationProfileId,
            fullLabel: `Perfil de validação: ${p.validationProfileId}`,
            icon: s.icon,
            color: s.color,
            tooltip: `${s.label}: ${p.validationProfileId}`,
        });
    }

    // 5. Taxonomy
    if (p.taxonomyId) {
        const s = style('taxonomy');
        out.push({
            kind: 'taxonomy',
            label: p.taxonomyId,
            fullLabel: `Taxonomia de campos: ${p.taxonomyId}`,
            icon: s.icon,
            color: s.color,
            tooltip: `${s.label}: ${p.taxonomyId}`,
        });
    }

    // 6. Report Templates (1 chip por template — H&S marca como health-protocol)
    if (Array.isArray(p.reportTemplateIds)) {
        for (const tpl of p.reportTemplateIds) {
            const kind: PresetComponentKind = isHS ? classifyReportTemplateAsHS(tpl) : 'report-template';
            const s = style(kind);
            out.push({
                kind,
                label: tpl,
                fullLabel: `Template: ${tpl}`,
                icon: s.icon,
                color: s.color,
                tooltip: `${s.label}: ${tpl}`,
            });
        }
    }

    // 7. EIS Weights
    if (p.eisWeights) {
        const w = p.eisWeights;
        const s = style('eis-weights');
        out.push({
            kind: 'eis-weights',
            label: `EIS T${w.T}/A${w.A}/Cp${w.Cp}/Ty${w.Ty}/Cs${w.Cs}/Cm${w.Cm}`,
            fullLabel: `Pesos EIS — T=${w.T} A=${w.A} Cp=${w.Cp} Ty=${w.Ty} Cs=${w.Cs} Cm=${w.Cm} (soma=12)`,
            icon: s.icon,
            color: s.color,
            tooltip: `${s.label}: T=${w.T} A=${w.A} Cp=${w.Cp} Ty=${w.Ty} Cs=${w.Cs} Cm=${w.Cm}`,
        });
    }

    // 8. CRS
    if (p.spatialCrs) {
        const s = style('crs');
        out.push({
            kind: 'crs',
            label: p.spatialCrs,
            fullLabel: `Sistema de coordenadas: ${p.spatialCrs}`,
            icon: s.icon,
            color: s.color,
            tooltip: `${s.label}: ${p.spatialCrs}`,
        });
    }

    // 9. Retention
    if (typeof p.auditRetentionDays === 'number' && p.auditRetentionDays > 0) {
        const yrs = (p.auditRetentionDays / 365).toFixed(1);
        const s = style('retention');
        out.push({
            kind: 'retention',
            label: `audit ${yrs}y`,
            fullLabel: `Retenção de audit: ${p.auditRetentionDays} dias (${yrs} anos)`,
            icon: s.icon,
            color: s.color,
            tooltip: `${s.label}: ${p.auditRetentionDays} dias`,
        });
    }

    return Object.freeze(out);
}

// AR-2: no BANNER o estilo por kind vive em app/css/compliance-banner.css
// (.cb-component-chip + .cb-kind-<kind>) — contrato §5.1, sem style inline.
// Este helper permanece SOMENTE para os modais (seletor/gerenciador de
// bindings), fora do escopo do banner.
function _componentChipStyle(c: PresetComponent): string {
    const s = COMPONENT_STYLE[c.kind];
    return [
        'display: inline-flex',
        'align-items: center',
        'gap: 4px',
        'padding: 2px 8px',
        `background: ${s.bg}`,
        `border: 1px solid ${s.border}`,
        `color: ${s.color}`,
        'border-radius: 3px',
        'font-size: 11px',
        'font-weight: 500',
        'white-space: nowrap',
        'cursor: pointer',
        'font-family: inherit',
    ].join(';');
}

// ----------------------------------------------------------------
// PERMISSION GATE — placeholder até auth real integrar.
// Calvin: "mesmo que eu não tenha usuário com propriedades de edição"
// → UI mostra controles desabilitados com tooltip explicativo.
// ----------------------------------------------------------------

interface PermissionVerdict {
    readonly canWrite: boolean;
    readonly reason: string;
}

function _checkComplianceWritePermission(): PermissionVerdict {
    // Heurística: se window.currentUser existe + tem role 'compliance.write' OR 'admin'
    const user: { email?: string; roles?: unknown } | undefined =
        typeof window !== 'undefined' ? (window.window?.currentUser || window.currentUser) : undefined;
    if (!user || !user.email) {
        return { canWrite: false, reason: 'Edição requer login — faça login para gerenciar presets' };
    }
    const roles: string[] = Array.isArray(user.roles) ? user.roles : [];
    if (roles.includes('compliance.write') || roles.includes('admin')) {
        return { canWrite: true, reason: '' };
    }
    return {
        canWrite: false,
        reason: `Edição requer perfil "compliance.write" — usuário ${user.email} tem perfis: ${roles.join(', ') || '(nenhum)'}`,
    };
}

// ----------------------------------------------------------------
// VIOLATION OVERLAY — Calvin 2026-06-07: "toggle no rodapé do preset onde
// ele possa aplicar uma forma de visualizar os pontos que violaram
// diretamente na tela (label ou geometria)"
//
// MVP V7: heurística baseada em getAllElements() + bindings ativos.
// Side panel lateral lista elementos + label vermelho [⚠] sobreposto a
// qualquer DOM com [data-element-id]. Estado persiste em localStorage.
// ----------------------------------------------------------------

const VIOLATIONS_OVERLAY_ID = 'compliance-violations-overlay';
const VIOLATIONS_LABEL_CLASS = 'compliance-violation-label';
const VIOLATIONS_STORAGE_KEY = 'ecbyts-compliance-violations-toggle';

function _isViolationsToggleOn(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try { return localStorage.getItem(VIOLATIONS_STORAGE_KEY) === '1'; } catch { return false; }
}

function _setViolationsToggle(on: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(VIOLATIONS_STORAGE_KEY, on ? '1' : '0'); } catch (e: unknown) { console.debug('[compliance:violations-toggle] localStorage quota', (e as Error)?.message || e); }
}

/** Visão mínima do elemento lida pela heurística de violações (manager retorna Record<string, any>[]). */
interface ComplianceElementObservation {
    readonly parameterId?: unknown;
    readonly value?: unknown;
    readonly campaignId?: unknown;
}
interface ComplianceElement {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly family?: unknown;
    readonly data?: { observations?: unknown } | undefined;
    readonly observations?: unknown;
}

interface ViolationEntry {
    readonly elementId: string;
    readonly elementName: string;
    readonly family: string;
    readonly severity: 'warn' | 'violation' | 'critical';
    readonly reason: string;
    readonly presetId: string;
    readonly presetLabel: string;
    // Calvin 2026-06-08 — pivot por composto/campanha
    readonly parameters?: ReadonlyArray<string>;
    readonly campaignIds?: ReadonlyArray<string>;
}

type ViolationPivot = 'element' | 'campaign' | 'parameter';
const VIOLATION_PIVOT_KEY = 'ecbyts-violations-pivot';
const VIOLATION_PIVOTS: ReadonlyArray<{ id: ViolationPivot; label: string; title: string }> = [
    { id: 'element', label: 'Por Elemento', title: 'Agrupar violações por poço/elemento' },
    { id: 'campaign', label: 'Por Campanha', title: 'Agrupar violações por campanha de coleta (data)' },
    { id: 'parameter', label: 'Por Composto', title: 'Agrupar violações por parâmetro químico (pH, ORP, Pb, etc)' },
];

function _readViolationPivot(): ViolationPivot {
    try {
        const v = localStorage.getItem(VIOLATION_PIVOT_KEY);
        if (v === 'element' || v === 'campaign' || v === 'parameter') return v;
    } catch (e: unknown) {
        console.debug('[violations:pivot:read]', (e as Error)?.message || e);
    }
    return 'element';
}

function _writeViolationPivot(p: ViolationPivot): void {
    try { localStorage.setItem(VIOLATION_PIVOT_KEY, p); } catch (e: unknown) {
        console.debug('[violations:pivot:write]', (e as Error)?.message || e);
    }
}

/**
 * MVP heurística: avalia elementos vs bindings ativos. Em V8+ substituir
 * por integração real com core/validation/engine e core/health/manager.
 */
/**
 * P1-7 R1/R2 (Calvin 2026-06-14): auto-cálculo da conformidade. Roda
 * _computeViolations() e atualiza o #cb-conformity-indicator com o resultado
 * factual. Honesto (anti-N): "N violações detectadas" / "Sem violações
 * detectadas" — nunca "Conforme" (heurística MVP ≠ veredito regulatório).
 */
async function _updateConformityIndicator(): Promise<void> {
    const el = document.getElementById('cb-conformity-indicator');
    if (!el) return;
    let count: number | null;
    try {
        const violations = await _computeViolations();
        count = Array.isArray(violations) ? violations.length : 0;
    } catch (e) {
        console.debug('[compliance:auto-calc]', (e as Error)?.message || e);
        count = null;
    }
    const current = document.getElementById('cb-conformity-indicator');
    if (!current) return; // banner re-renderizou enquanto calculava
    const hasPreset = getComplianceManager().getState().bindings.length > 0;
    const vm = buildConformityIndicator(hasPreset, count);
    const fallback =
        vm.state === 'clean'
            ? 'Sem violações detectadas'
            : vm.state === 'violations'
              ? `${vm.params.n} violações detectadas`
              : 'Conformidade: não calculada';
    let text = _t(vm.i18nKey, fallback);
    if (vm.state === 'violations') text = text.replace('{{n}}', String(vm.params.n));
    current.textContent = text;
    _applyConformityToneClass(current, vm.tone);
}

// AR-2 (HUD-UX-PAIN-DRAINAGE #1): cor do indicador via classes .cb-tone-* de
// app/css/compliance-banner.css (contrato §5.1) — sem style inline.
const CONFORMITY_TONE_CLASSES = ['cb-tone-green', 'cb-tone-red', 'cb-tone-muted', 'cb-tone-neutral'] as const;
function _applyConformityToneClass(el: HTMLElement, tone: ConformityTone): void {
    el.classList.remove(...CONFORMITY_TONE_CLASSES);
    el.classList.add(`cb-tone-${tone}`);
}

async function _computeViolations(): Promise<ReadonlyArray<ViolationEntry>> {
    const mgr = getComplianceManager();
    const bindings = mgr.getState().bindings;
    if (bindings.length === 0) return [];

    let elements: ComplianceElement[];
    try {
        const mod = await import('../../core/elements/manager.js');
        elements = typeof mod.getAllElements === 'function' ? (mod.getAllElements() as ComplianceElement[]) : [];
    } catch (e) {
        console.debug('[compliance:violations] failed loading elements', (e as Error)?.message);
        return [];
    }

    const out: ViolationEntry[] = [];
    for (const b of bindings) {
        const preset = mgr.getPresetSync(b.presetId);
        const friendly = preset ? _friendlyPresetMeta(preset) : null;
        const isHS = preset ? isHealthAndSafetyPreset(preset) : false;
        // Heurística: para cada elemento com observações, marca probabilidade de
        // violação baseada em family + obs count + parâmetros. MVP didático.
        for (const el of elements) {
            if (!el || typeof el !== 'object') continue;
            const elId = String(el.id || '');
            const elName = String(el.name || elId);
            const family = String(el.family || 'generic');
            // FIX bug original: observations vivem em el.data.observations[], não el.observations[]
            const data = el.data || {};
            const observations: ComplianceElementObservation[] = Array.isArray(data.observations)
                ? data.observations
                : Array.isArray(el.observations) ? el.observations : [];
            const obsCount = observations.length;
            // Heurística MVP: families relevantes ao binding
            const relevantToBinding =
                (isHS && (family === 'well' || family === 'sample' || family === 'sensor' || family === 'individual')) ||
                (!isHS && (family === 'plume' || family === 'well' || family === 'spring' || family === 'lake' || family === 'tank' || family === 'waste_stream'));
            if (!relevantToBinding) continue;

            // Avalia violações por parâmetro (MVP — apenas pH, ORP, alguns metais comuns)
            const paramViolations: string[] = [];
            const paramsViolated = new Set<string>();
            const campaignsViolated = new Set<string>();
            let maxSeverity: ViolationEntry['severity'] | null = null;
            for (const obs of observations) {
                if (!obs || typeof obs !== 'object') continue;
                const param = String(obs.parameterId || '').toLowerCase();
                const value = Number(obs.value);
                if (!Number.isFinite(value)) continue;
                const obsParamRaw = String(obs.parameterId || '');
                const obsCampaignId = String(obs.campaignId || '');
                const _trackViolation = () => {
                    if (obsParamRaw) paramsViolated.add(obsParamRaw);
                    if (obsCampaignId) campaignsViolated.add(obsCampaignId);
                };
                // Override original "paramViolations.push" para também marcar tracking
                const originalPush = paramViolations.push.bind(paramViolations);
                (paramViolations as { push: (...items: string[]) => number }).push = (...items: string[]) => {
                    _trackViolation();
                    return originalPush(...items);
                };
                // pH: CONAMA 420 VP 5.0–9.0 (água subterrânea)
                if (param === 'ph') {
                    if (value < 4.0 || value > 10.0) {
                        paramViolations.push(`pH ${value.toFixed(2)} (crítico — fora 4-10)`);
                        maxSeverity = 'critical';
                    } else if (value < 5.0 || value > 9.0) {
                        paramViolations.push(`pH ${value.toFixed(2)} (violação CONAMA VP 5-9)`);
                        if (maxSeverity !== 'critical') maxSeverity = 'violation';
                    } else if (value < 5.5 || value > 8.5) {
                        paramViolations.push(`pH ${value.toFixed(2)} (alerta — próximo limite)`);
                        if (!maxSeverity) maxSeverity = 'warn';
                    }
                }
                // ORP: <-200 redutor crítico / >500 oxidante extremo
                if (param === 'orp' || param === 'redox') {
                    if (value < -300 || value > 700) {
                        paramViolations.push(`ORP ${value.toFixed(0)} mV (crítico)`);
                        maxSeverity = 'critical';
                    } else if (value < -100 || value > 500) {
                        paramViolations.push(`ORP ${value.toFixed(0)} mV (violação)`);
                        if (maxSeverity !== 'critical') maxSeverity = 'violation';
                    }
                }
                // Metais comuns (chumbo, mercúrio, arsênio, cádmio) em µg/L
                const heavyMetalLimits: Record<string, number> = {
                    'pb': 10, 'lead': 10, 'chumbo': 10,
                    'hg': 1, 'mercury': 1, 'mercurio': 1,
                    'as': 10, 'arsenic': 10, 'arsenio': 10,
                    'cd': 5, 'cadmium': 5, 'cadmio': 5,
                };
                if (param in heavyMetalLimits) {
                    const limit = heavyMetalLimits[param]!;
                    if (value > limit * 10) {
                        paramViolations.push(`${param.toUpperCase()} ${value.toFixed(2)} µg/L (crítico — >10× limite ${limit})`);
                        maxSeverity = 'critical';
                    } else if (value > limit) {
                        paramViolations.push(`${param.toUpperCase()} ${value.toFixed(2)} µg/L (violação limite ${limit})`);
                        if (maxSeverity !== 'critical') maxSeverity = 'violation';
                    }
                }
            }

            // Se NÃO houve violação por parâmetro mas elemento tem muitas obs, gera ALERT
            // (heurística: ausência de violação não significa conformidade total — auditar)
            if (paramViolations.length === 0 && obsCount > 0) {
                if (obsCount >= 50) {
                    paramViolations.push(`${obsCount} obs sem violação detectada — auditar amostragem`);
                    maxSeverity = 'warn';
                } else {
                    // Skip: elementos com poucas obs e sem violação = ok
                    continue;
                }
            }

            if (!maxSeverity) continue;
            const reason = paramViolations.slice(0, 3).join(' · ') +
                (paramViolations.length > 3 ? ` (+${paramViolations.length - 3} outras)` : '');
            const prefix = isHS ? `Exposição vs ${friendly?.chipLabel || preset?.id}` : `${friendly?.chipLabel || preset?.id} [${b.scope}]`;
            out.push({
                elementId: elId,
                elementName: elName,
                family,
                severity: maxSeverity,
                reason: `${prefix} · ${reason}`,
                presetId: b.presetId,
                presetLabel: friendly?.chipLabel || b.presetId,
                parameters: Object.freeze([...paramsViolated]),
                campaignIds: Object.freeze([...campaignsViolated]),
            });
        }
    }
    // Ordena por severidade
    const order = { critical: 0, violation: 1, warn: 2 };
    return Object.freeze(
        [...out].sort((a, b) => order[a.severity] - order[b.severity]),
    );
}

// Calvin 2026-06-08 — helpers para pivot render (campaign/parameter)
function _groupViolations(
    violations: ReadonlyArray<ViolationEntry>,
    pivot: ViolationPivot,
): Map<string, ViolationEntry[]> {
    const groups = new Map<string, ViolationEntry[]>();
    for (const v of violations) {
        const keys = pivot === 'campaign'
            ? (v.campaignIds && v.campaignIds.length > 0 ? [...v.campaignIds] : ['(sem campanha)'])
            : (v.parameters && v.parameters.length > 0 ? [...v.parameters] : ['(sem parâmetro)']);
        for (const key of keys) {
            const existing = groups.get(key) || [];
            existing.push(v);
            groups.set(key, existing);
        }
    }
    return groups;
}

function _renderViolationRowByElement(doc: Document, v: ViolationEntry): HTMLElement {
    const sev = _severityStyle(v.severity);
    const row = doc.createElement('div');
    row.style.cssText = [
        'padding: 8px 10px', 'margin-bottom: 6px', 'border-radius: 4px',
        `border-left: 3px solid ${sev.bg}`, 'background: rgba(255,255,255,0.03)',
        'cursor: pointer', 'transition: background 0.15s',
    ].join(';');
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.06)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'rgba(255,255,255,0.03)'; });
    const sevBadge = `<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:${sev.bg};color:${sev.color};font-size:9px;font-weight:700;margin-right:4px">${sev.label}</span>`;
    row.innerHTML =
        `<div style="font-size:12px;font-weight:600;margin-bottom:3px">${sevBadge}${_escapeHtml(v.elementName)} <span style="opacity:0.5;font-weight:400">[${_escapeHtml(v.family)}]</span></div>` +
        `<div style="font-size:11px;opacity:0.75;line-height:1.4">${_escapeHtml(v.reason)}</div>` +
        `<div style="font-size:10px;opacity:0.5;margin-top:3px;font-family:monospace">${_escapeHtml(v.elementId)} · ${_escapeHtml(v.presetLabel)}</div>`;
    row.addEventListener('click', () => {
        if (typeof window !== 'undefined' && typeof window.handleSelectElement === 'function') {
            try { window.handleSelectElement(v.elementId); } catch (e: unknown) { console.debug('[violations:select]', (e as Error)?.message || e); }
        }
    });
    return row;
}

function _renderViolationGroup(
    doc: Document,
    groupKey: string,
    groupViolations: ViolationEntry[],
    pivot: ViolationPivot,
): HTMLElement {
    const container = doc.createElement('div');
    container.style.cssText = 'margin-bottom:10px;border:1px solid #1f2937;border-radius:6px;overflow:hidden;';
    const counts = groupViolations.reduce(
        (acc, v) => { acc[v.severity]++; return acc; },
        { critical: 0, violation: 0, warn: 0 },
    );
    const groupLabel = pivot === 'campaign'
        ? `📅 Campanha ${groupKey}`
        : `🧪 ${groupKey.toUpperCase()}`;
    const groupHeader = doc.createElement('div');
    groupHeader.style.cssText =
        'padding:8px 12px;background:rgba(30,64,175,0.18);border-bottom:1px solid #1f2937;' +
        'display:flex;justify-content:space-between;align-items:center;cursor:pointer;';
    groupHeader.innerHTML =
        `<div style="font-size:12px;font-weight:700">${_escapeHtml(groupLabel)} ` +
        `<span style="opacity:0.6;font-weight:400">(${groupViolations.length})</span></div>` +
        `<div style="font-size:10px;font-family:monospace">` +
        (counts.critical > 0 ? `<span style="color:#dc2626">🔴${counts.critical}</span> ` : '') +
        (counts.violation > 0 ? `<span style="color:#ea580c">🟠${counts.violation}</span> ` : '') +
        (counts.warn > 0 ? `<span style="color:#facc15">🟡${counts.warn}</span>` : '') +
        `</div>`;
    container.appendChild(groupHeader);

    const inner = doc.createElement('div');
    inner.style.cssText = 'padding:6px;';
    for (const v of groupViolations) {
        const row = doc.createElement('div');
        const sev = _severityStyle(v.severity);
        row.style.cssText = [
            'padding:6px 8px', 'margin-bottom:4px', 'border-radius:3px',
            `border-left:2px solid ${sev.bg}`, 'background:rgba(255,255,255,0.02)',
            'cursor:pointer', 'font-size:11px', 'line-height:1.4',
        ].join(';');
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.05)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'rgba(255,255,255,0.02)'; });
        const sevBadge = `<span style="display:inline-block;padding:0 4px;border-radius:2px;background:${sev.bg};color:${sev.color};font-size:8px;font-weight:700;margin-right:4px">${sev.label}</span>`;
        row.innerHTML =
            `<div>${sevBadge}<strong>${_escapeHtml(v.elementName)}</strong> ` +
            `<span style="opacity:0.5">[${_escapeHtml(v.family)}]</span></div>` +
            `<div style="opacity:0.65;font-size:10px;margin-top:2px">${_escapeHtml(v.reason)}</div>`;
        row.addEventListener('click', () => {
            if (typeof window !== 'undefined' && typeof window.handleSelectElement === 'function') {
                try { window.handleSelectElement(v.elementId); } catch (e: unknown) { console.debug('[violations:select]', (e as Error)?.message || e); }
            }
        });
        inner.appendChild(row);
    }
    container.appendChild(inner);

    // Toggle collapse on group header
    let collapsed = false;
    groupHeader.addEventListener('click', () => {
        collapsed = !collapsed;
        inner.style.display = collapsed ? 'none' : 'block';
    });

    return container;
}

function _severityStyle(s: ViolationEntry['severity']): { color: string; bg: string; border: string; icon: string; label: string } {
    switch (s) {
        case 'critical': return { color: '#fff', bg: '#dc2626', border: '#b91c1c', icon: '🔴', label: 'CRÍTICO' };
        case 'violation': return { color: '#fff', bg: '#ea580c', border: '#c2410c', icon: '🟠', label: 'VIOLAÇÃO' };
        case 'warn': return { color: '#0b1220', bg: '#facc15', border: '#eab308', icon: '🟡', label: 'ALERTA' };
    }
}

const VIOLATIONS_HALO_ATTR = 'data-compliance-violation-halo';

function _closeViolationsOverlay(): void {
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return;
    doc.getElementById(VIOLATIONS_OVERLAY_ID)?.remove();
    // FIX V10: restaurar position original dos hosts antes de remover labels
    doc.querySelectorAll('.' + VIOLATIONS_LABEL_CLASS).forEach((el) => {
        const host = el.parentElement;
        if (host && host.dataset.complianceLabelOriginalPosition !== undefined) {
            host.style.position = host.dataset.complianceLabelOriginalPosition;
            delete host.dataset.complianceLabelOriginalPosition;
        }
        el.remove();
    });
    // V12 Calvin: restaurar halo (box-shadow/outline) original das labels 3D
    doc.querySelectorAll(`[${VIOLATIONS_HALO_ATTR}]`).forEach((el) => {
        const h = el as HTMLElement;
        const orig = h.getAttribute(VIOLATIONS_HALO_ATTR) || '';
        const [origBoxShadow, origOutline, origBorderRadius] = orig.split('||');
        h.style.boxShadow = origBoxShadow || '';
        h.style.outline = origOutline || '';
        h.style.borderRadius = origBorderRadius || '';
        h.removeAttribute(VIOLATIONS_HALO_ATTR);
    });
}

async function _renderViolationsOverlay(): Promise<void> {
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return;
    _closeViolationsOverlay();
    const violations = await _computeViolations();

    // Side panel
    const panel = doc.createElement('div');
    panel.id = VIOLATIONS_OVERLAY_ID;
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', 'Painel de violações de conformidade');
    panel.style.cssText = [
        'position: fixed',
        'right: 8px',
        'top: 80px',
        'bottom: 100px',
        'width: 340px',
        'z-index: 17',
        'background: #0f172a',
        'color: #e5e7eb',
        'border: 1px solid #1f2937',
        'border-radius: 8px',
        'box-shadow: 0 8px 32px rgba(0,0,0,0.5)',
        'display: flex',
        'flex-direction: column',
        'font-family: inherit',
        'overflow: hidden',
    ].join(';');

    // Calvin 2026-06-08 "opção de fechar a tela sumiu" — 4 vias de fechar:
    // (A) header sticky com botão grande, (B) ✕ flutuante canto, (C) Fechar
    // no rodapé sticky, (D) tecla ESC.
    const header = doc.createElement('div');
    header.style.cssText = [
        'padding:12px 14px',
        'border-bottom:2px solid #dc2626',
        'background:linear-gradient(to bottom, rgba(220,38,38,0.18), rgba(220,38,38,0.06))',
        'display:flex',
        'justify-content:space-between',
        'align-items:center',
        'gap:8px',
        'flex-shrink:0',
        'position:sticky',
        'top:0',
        'z-index:5',
    ].join(';');
    const title = doc.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:13px;flex:1;min-width:0';
    title.innerHTML = `⚠ Violações de Conformidade <span style="opacity:0.6;font-weight:400">(${violations.length})</span>`;
    const closeX = doc.createElement('button');
    closeX.type = 'button';
    closeX.textContent = '✕ Fechar';
    closeX.title = 'Fechar painel (preserva toggle Violações ON — pode reabrir)';
    closeX.setAttribute('aria-label', 'Fechar painel de violações');
    closeX.style.cssText = [
        'background:#dc2626', 'color:#fff', 'border:0', 'border-radius:6px',
        'padding:6px 12px', 'font-size:12px', 'font-weight:700', 'cursor:pointer',
        'flex-shrink:0', 'transition:background 0.12s',
        'box-shadow:0 2px 6px rgba(0,0,0,0.3)',
    ].join(';');
    closeX.addEventListener('mouseenter', () => { closeX.style.background = '#ef4444'; });
    closeX.addEventListener('mouseleave', () => { closeX.style.background = '#dc2626'; });
    closeX.addEventListener('click', () => doc.getElementById(VIOLATIONS_OVERLAY_ID)?.remove());
    header.appendChild(title);
    header.appendChild(closeX);
    panel.appendChild(header);

    // (B) ✕ flutuante canto sup. direito — backup se header for sobreposto
    const floatClose = doc.createElement('button');
    floatClose.type = 'button';
    floatClose.textContent = '✕';
    floatClose.title = 'Fechar painel (botão flutuante)';
    floatClose.setAttribute('aria-label', 'Fechar painel (flutuante)');
    floatClose.style.cssText = [
        'position:absolute', 'top:-10px', 'right:-10px',
        'width:28px', 'height:28px', 'border-radius:50%',
        'background:#dc2626', 'color:#fff', 'border:2px solid #0f172a',
        'font-size:14px', 'font-weight:700', 'cursor:pointer',
        'box-shadow:0 4px 12px rgba(0,0,0,0.5)', 'z-index:20',
        'display:flex', 'align-items:center', 'justify-content:center',
        'padding:0', 'line-height:1',
    ].join(';');
    floatClose.addEventListener('click', () => doc.getElementById(VIOLATIONS_OVERLAY_ID)?.remove());
    panel.appendChild(floatClose);

    // (D) ESC fecha o painel (atalho global enquanto visível)
    const panelEscHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            const p = doc.getElementById(VIOLATIONS_OVERLAY_ID);
            if (p) {
                p.remove();
                doc.removeEventListener('keydown', panelEscHandler);
            }
        }
    };
    doc.addEventListener('keydown', panelEscHandler);

    const summary = doc.createElement('div');
    summary.style.cssText = 'padding: 8px 14px; font-size: 11px; background: rgba(220,38,38,0.06); border-bottom: 1px solid #1f2937;';
    const counts = violations.reduce(
        (acc, v) => { acc[v.severity]++; return acc; },
        { critical: 0, violation: 0, warn: 0 },
    );
    summary.innerHTML =
        `<span style="color:#dc2626">🔴 ${counts.critical} crítico</span> · ` +
        `<span style="color:#ea580c">🟠 ${counts.violation} violação</span> · ` +
        `<span style="color:#facc15">🟡 ${counts.warn} alerta</span>`;
    panel.appendChild(summary);

    // Calvin 2026-06-08 — Pivot toolbar (Elemento | Campanha | Composto)
    const currentPivot = _readViolationPivot();
    const pivotBar = doc.createElement('div');
    pivotBar.style.cssText =
        'display:flex;gap:4px;padding:6px 10px;background:rgba(255,255,255,0.02);' +
        'border-bottom:1px solid #1f2937;flex-shrink:0;';
    pivotBar.setAttribute('role', 'tablist');
    pivotBar.setAttribute('aria-label', 'Agrupar violações por');
    for (const pivot of VIOLATION_PIVOTS) {
        const isActive = pivot.id === currentPivot;
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.textContent = pivot.label;
        btn.title = pivot.title;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(isActive));
        btn.setAttribute('data-pivot-id', pivot.id);
        btn.style.cssText = [
            'flex:1',
            'padding:5px 8px',
            'font-size:11px',
            'font-weight:600',
            `background:${isActive ? '#1e40af' : 'rgba(255,255,255,0.04)'}`,
            `color:${isActive ? '#fff' : '#94a3b8'}`,
            'border:1px solid ' + (isActive ? '#1e40af' : '#1f2937'),
            'border-radius:4px',
            'cursor:pointer',
            'transition:all 0.12s',
        ].join(';');
        btn.addEventListener('click', () => {
            _writeViolationPivot(pivot.id);
            // Re-render simples — remove + recria
            doc.getElementById(VIOLATIONS_OVERLAY_ID)?.remove();
            void _renderViolationsOverlay();
        });
        pivotBar.appendChild(btn);
    }
    panel.appendChild(pivotBar);

    const list = doc.createElement('div');
    list.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';
    if (violations.length === 0) {
        const empty = doc.createElement('div');
        empty.style.cssText = 'padding: 30px 12px; text-align: center; opacity: 0.6; font-size: 12px; line-height: 1.5;';
        empty.innerHTML =
            'Nenhuma violação detectada. ✓<br><br>' +
            '<span style="opacity:0.6;font-size:11px">Heurística MVP: avalia elementos com observações vs presets ativos. Carregue um modelo com dados para ver alertas.</span>';
        list.appendChild(empty);
    } else {
        // Calvin 2026-06-08 — render conforme pivot ativo
        if (currentPivot === 'element') {
            // Renderização legacy — por elemento, ordenado por severidade
            for (const v of violations) {
                list.appendChild(_renderViolationRowByElement(doc, v));
            }
        } else {
            // Agrupar por campaign ou parameter
            const groups = _groupViolations(violations, currentPivot);
            const sortedGroups = [...groups.entries()].sort((a, b) => {
                // Group ordering: critical > violation > warn (pelo pior dentro do grupo)
                const sevOrder = { critical: 0, violation: 1, warn: 2 };
                const worstA = a[1].reduce((acc, x) => Math.min(acc, sevOrder[x.severity]), 99);
                const worstB = b[1].reduce((acc, x) => Math.min(acc, sevOrder[x.severity]), 99);
                if (worstA !== worstB) return worstA - worstB;
                return b[1].length - a[1].length;
            });
            for (const [groupKey, groupViolations] of sortedGroups) {
                list.appendChild(_renderViolationGroup(doc, groupKey, groupViolations, currentPivot));
            }
        }
    }
    panel.appendChild(list);

    // (C) Footer com botão Fechar grande — 3ª via, garantia visual total
    const footer = doc.createElement('div');
    footer.style.cssText = [
        'padding:8px 12px', 'border-top:1px solid #1f2937',
        'background:rgba(255,255,255,0.02)',
        'display:flex', 'justify-content:space-between', 'align-items:center',
        'gap:8px', 'flex-shrink:0', 'position:sticky', 'bottom:0',
    ].join(';');
    const footerInfo = doc.createElement('div');
    footerInfo.style.cssText = 'font-size:10px;opacity:0.55;line-height:1.5;flex:1;min-width:0';
    footerInfo.innerHTML =
        '<strong style="opacity:0.8">Atalho:</strong> tecla ' +
        '<kbd style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-family:monospace">ESC</kbd>' +
        ' também fecha';
    const footerClose = doc.createElement('button');
    footerClose.type = 'button';
    footerClose.textContent = 'Fechar painel';
    footerClose.title = 'Fechar painel de violações';
    footerClose.style.cssText = [
        'background:#1e40af', 'color:#fff', 'border:0', 'border-radius:5px',
        'padding:7px 14px', 'font-size:12px', 'font-weight:600', 'cursor:pointer',
        'flex-shrink:0', 'transition:background 0.12s',
    ].join(';');
    footerClose.addEventListener('mouseenter', () => { footerClose.style.background = '#2563eb'; });
    footerClose.addEventListener('mouseleave', () => { footerClose.style.background = '#1e40af'; });
    footerClose.addEventListener('click', () => doc.getElementById(VIOLATIONS_OVERLAY_ID)?.remove());
    footer.appendChild(footerInfo);
    footer.appendChild(footerClose);
    panel.appendChild(footer);

    doc.body.appendChild(panel);

    // V12 Calvin: tint halo das labels 3D dos violadores (vermelho/laranja/amarelo)
    // via box-shadow + outline — SEM tocar position (V10 guard).
    for (const v of violations) {
        const targets = doc.querySelectorAll(`[data-element-id="${CSS.escape(v.elementId)}"]`);
        targets.forEach((t) => {
            const host = t as HTMLElement;
            const computed = typeof getComputedStyle === 'function' ? getComputedStyle(host) : undefined;
            const isAbsolute = computed?.position === 'absolute' || computed?.position === 'fixed';
            const isIn3DCanvas = !!host.closest('#canvas-container');
            if ((isAbsolute || isIn3DCanvas) && !host.hasAttribute(VIOLATIONS_HALO_ATTR)) {
                // Preserva style original (boxShadow||outline||borderRadius)
                host.setAttribute(
                    VIOLATIONS_HALO_ATTR,
                    `${host.style.boxShadow || ''}||${host.style.outline || ''}||${host.style.borderRadius || ''}`,
                );
                const sev = _severityStyle(v.severity);
                // Halo: dupla camada de box-shadow (glow externo + interno)
                host.style.boxShadow = `0 0 12px 2px ${sev.bg}, 0 0 4px 1px ${sev.color}, inset 0 0 0 1px ${sev.color}`;
                host.style.outline = `1px solid ${sev.color}`;
                host.style.borderRadius = host.style.borderRadius || '4px';
            }
        });
    }

    // Labels DOM sobre elementos violadores (badge ⚠ — não-CSS2DRenderer apenas)
    //
    // FIX V10: PULAR qualquer host com position:absolute OU dentro de
    // #canvas-container (área 3D Three.js — tint halo já aplicado acima).
    for (const v of violations) {
        const targets = doc.querySelectorAll(`[data-element-id="${CSS.escape(v.elementId)}"]`);
        targets.forEach((t) => {
            const host = t as HTMLElement;
            const computed = typeof getComputedStyle === 'function' ? getComputedStyle(host) : undefined;
            const isAbsolute = computed?.position === 'absolute' || computed?.position === 'fixed';
            const isIn3DCanvas = !!host.closest('#canvas-container');
            if (isAbsolute || isIn3DCanvas) {
                // Skip badge ⚠: tint halo via box-shadow já cuida no loop anterior
                return;
            }
            const sev = _severityStyle(v.severity);
            const label = doc.createElement('span');
            label.className = VIOLATIONS_LABEL_CLASS;
            label.style.cssText = [
                'position: absolute',
                'top: -8px',
                'right: -8px',
                'z-index: 18',
                `background: ${sev.bg}`,
                `color: ${sev.color}`,
                'padding: 1px 6px',
                'border-radius: 10px',
                'font-size: 10px',
                'font-weight: 700',
                'pointer-events: none',
                'box-shadow: 0 2px 6px rgba(0,0,0,0.4)',
            ].join(';');
            label.textContent = '⚠';
            label.title = `${sev.label}: ${v.reason}`;
            // Preservar position original p/ restaurar no _closeViolationsOverlay
            host.dataset.complianceLabelOriginalPosition = host.style.position || '';
            if (!host.style.position || host.style.position === 'static') {
                host.style.position = 'relative';
            }
            host.appendChild(label);
        });
    }
}

// ----------------------------------------------------------------
// BANNER RENDERING (self-contained, position:fixed)
// ----------------------------------------------------------------

// AR-2 (HUD-UX-PAIN-DRAINAGE #1): os estilos do banner (root .cb-in-view,
// botões .cb-btn--primary/--secondary com :hover/:active nativos — substitui o
// antigo _wireButtonHover — e chips .cb-chip-preset) vivem em
// app/css/compliance-banner.css, contrato SPEC_MODEL_BASELINE §5.1.
// PRESET-IN-CONSTELLATION (Calvin 2026-06-17): banner em fluxo normal DENTRO
// da aba Preset; padding-left 96px (CSS) reserva o slot do FAB ⌘K —
// evidência: tests/screenshots/preset-in-constellation-panel.png.
// Os helpers abaixo permanecem SOMENTE para os modais (seletor de presets /
// gerenciador de bindings), fora do escopo do banner (AR-2).

function _buttonStyle(primary: boolean): string {
    return [
        'padding: 4px 12px',
        'background: ' + (primary ? '#10b981' : 'transparent'),
        'color: ' + (primary ? '#0b1220' : '#e5e7eb'),
        'border: 1px solid ' + (primary ? '#10b981' : '#374151'),
        'border-radius: 4px',
        'font-size: 12px',
        'font-weight: ' + (primary ? '600' : '500'),
        'cursor: pointer',
        'font-family: inherit',
        'transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease',
    ].join(';');
}

// B4 fix (modais): hover/active state inline via listeners — CSS :hover não
// funciona sobre estilos inline dos modais. No banner isso virou CSS (AR-2).
function _wireButtonHover(btn: HTMLButtonElement, primary: boolean): void {
    const bgIdle = primary ? '#10b981' : 'transparent';
    const bgHover = primary ? '#34d399' : 'rgba(255,255,255,0.06)';
    const borderIdle = primary ? '#10b981' : '#374151';
    const borderHover = primary ? '#34d399' : '#6b7280';
    btn.addEventListener('mouseenter', () => {
        btn.style.background = bgHover;
        btn.style.borderColor = borderHover;
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.background = bgIdle;
        btn.style.borderColor = borderIdle;
        btn.style.transform = '';
    });
    btn.addEventListener('mousedown', () => {
        btn.style.transform = 'translateY(1px)';
    });
    btn.addEventListener('mouseup', () => {
        btn.style.transform = '';
    });
}

function _ensureBannerEl(): HTMLElement | null {
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return null;
    let el = doc.getElementById(BANNER_ID);
    // PRESET-IN-CONSTELLATION: o banner mora DENTRO de #constellation-view-preset
    // (a view da aba). Se já existe mas está fora da view (ex: faixa fixed legada
    // de uma versão anterior ainda no DOM, ou render antes da view existir),
    // re-ancora dentro da view assim que ela estiver disponível.
    const view = doc.getElementById(PRESET_VIEW_ID);
    if (el) {
        if (view && el.parentElement !== view) view.appendChild(el);
        return el;
    }
    el = doc.createElement('div');
    el.id = BANNER_ID;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', _t('compliance.banner.aria', 'Painel de conformidade'));
    el.classList.add('cb-in-view'); // AR-2: layout via classes CSS do contrato §5.1
    // Ancora na view da aba. Fallback ao body só se a view ainda não existe
    // (boot headless / DOM parcial em testes) — re-ancorado depois.
    (view || doc.body).appendChild(el);
    return el;
}

/**
 * PRESET-IN-CONSTELLATION (Calvin 2026-06-17): chamado por constellation.ts
 * quando a aba "Preset" é ativada. Garante que o módulo está montado dentro de
 * #constellation-view-preset e reflete o estado atual de bindings.
 */
export function renderComplianceIntoPresetView(): void {
    try {
        _renderBanner(getComplianceManager().getState());
    } catch (e) {
        console.debug('[compliance:preset-view]', (e as Error)?.message || e);
    }
}

function _renderBanner(state: ModelComplianceState): void {
    const el = _ensureBannerEl();
    if (!el) return;
    const mgr = getComplianceManager();

    // Empty state: prompt para escolher preset
    if (state.bindings.length === 0) {
        const msg = _t(
            'compliance.banner.empty',
            'Nenhum preset de conformidade ativo — escolha um padrão regulatório/framework',
        );
        const btn = _t('compliance.banner.choose', 'Escolher preset ▼');
        // HUD-UX-PAIN-DRAIN-001 W4.2 (D05): o AVISO inteiro também é clicável
        // (abre o mesmo seletor) — antes só o botão à direita respondia e o
        // usuário clicava no texto sem efeito.
        el.innerHTML =
            `<span class="cb-empty-msg" role="button" tabindex="0" ` +
                `title="${_escapeHtml(btn)}">` +
                `⚠ ${_escapeHtml(msg)}</span>` +
            `<button type="button" class="cb-details cb-btn cb-btn--primary">${_escapeHtml(btn)}</button>`;
        const btnEl = el.querySelector('.cb-details') as HTMLButtonElement | null;
        if (btnEl) btnEl.addEventListener('click', _onBannerDetailsClick);
        const msgEl = el.querySelector('.cb-empty-msg') as HTMLElement | null;
        if (msgEl) {
            msgEl.addEventListener('click', _onBannerDetailsClick);
            msgEl.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    _onBannerDetailsClick();
                }
            });
        }
        return;
    }

    // Active state: render grupos (1 grupo por binding) com N chips por preset.
    // Cada componente do preset (norma legal, GWP, taxonomia, etc) vira 1 chip
    // separado no rodapé — Calvin "cada um deve ser uma marcação no rodapé diferente".
    const groups: string[] = [];
    for (const b of state.bindings) {
        const p = mgr.getPresetSync(b.presetId);
        if (!p) continue;
        const flagSvg = _flagSvgForJurisdiction(p.publishedBy?.jurisdiction);
        const friendly = _friendlyPresetMeta(p);
        const components = _extractPresetComponents(p);
        const scopeTag = b.scope && b.scope !== 'all'
            ? `<em class="cb-scope-tag">[${_escapeHtml(b.scope)}]</em>`
            : '';
        const headerChip =
            `<button type="button" class="cb-chip-preset" data-preset-id="${_escapeHtml(p.id)}" data-scope="${_escapeHtml(b.scope)}" ` +
                `title="${_escapeHtml(friendly.displayName)} · click p/ gerenciar">` +
                `<span aria-hidden="true" class="cb-chip-flag">${flagSvg}</span>` +
                `<span>${_escapeHtml(friendly.chipLabel)} ${scopeTag}</span>` +
                `</button>`;
        const chipHtml = (c: ReturnType<typeof _extractPresetComponents>[number]): string =>
            `<button type="button" class="cb-component-chip cb-kind-${_escapeHtml(c.kind)}" ` +
                `data-preset-id="${_escapeHtml(p.id)}" data-scope="${_escapeHtml(b.scope)}" ` +
                `data-kind="${_escapeHtml(c.kind)}" ` +
                `title="${_escapeHtml(c.tooltip)}">` +
                `<span class="cb-comp-icon">${_escapeHtml(c.icon)}</span>` +
                `<span>${_escapeHtml(c.label)}</span>` +
                `</button>`;
        // HUD-UX 2026-06-11 (Calvin: "tem muita coisa na parte inferior ao
        // mesmo tempo") — só os 2 primeiros chips informativos ficam inline;
        // o resto colapsa num "+N" expansível (padrão flyout §5.1 da spec).
        const COMPONENT_CHIPS_INLINE_MAX = 2;
        const inlineChips = components.slice(0, COMPONENT_CHIPS_INLINE_MAX);
        const overflowChips = components.slice(COMPONENT_CHIPS_INLINE_MAX);
        const overflowTitle = _t('compliance.banner.moreChips', 'Mostrar demais componentes do preset');
        const componentChips =
            inlineChips.map(chipHtml).join('') +
            (overflowChips.length > 0
                ? `<button type="button" class="cb-chip-overflow" aria-expanded="false" ` +
                      `title="${_escapeHtml(overflowTitle)}">` +
                      `+${overflowChips.length}</button>` +
                  `<span class="cb-overflow-group">` +
                      overflowChips.map(chipHtml).join('') +
                  `</span>`
                : '');
        const sep = `<span class="cb-group-sep">┃</span>`;
        groups.push(
            `<div class="cb-group">` +
                headerChip +
                componentChips +
                `</div>` +
                (state.bindings.length > 1 ? sep : ''),
        );
    }
    // P1-7 R1/R2 (Calvin 2026-06-14 "auto calcular"): com preset ativo, o
    // banner calcula a conformidade automaticamente. Render inicial com o
    // estado (sem-preset / calculando) e _updateConformityIndicator() async
    // preenche o resultado factual (N violações detectadas / sem violações).
    const hasPreset = state.bindings.length > 0;
    const initialVm = buildConformityIndicator(hasPreset, hasPreset ? null : 0);
    const initialText = hasPreset
        ? _t(initialVm.i18nKey, 'Calculando conformidade…')
        : _t('compliance.banner.indicator.notCalculated', 'Conformidade: não calculada');
    const indicator =
        `<span class="cb-indicator-dot">·</span>` +
        `<span id="cb-conformity-indicator" class="cb-conformity cb-tone-${initialVm.tone}">` +
        _escapeHtml(initialText) +
        `</span>`;
    const btn = _t('compliance.banner.details', 'Detalhes ▼');
    const manageBtn = _t('compliance.banner.manage', '⚙ Gerenciar');
    // Calvin V7: toggle "Visualizar violações na tela".
    // Claude-Omni 2026-06-17 (finding auditoria visual #3): rótulo era "Violações: ON/OFF"
    // — ambíguo, parecia ligar/desligar AS violações (contradizia "23 violações detectadas"
    // na statusbar). É só o REALCE VISUAL na cena. Rótulo agora reflete o title real.
    const violationsOn = _isViolationsToggleOn();
    const viewLabel = violationsOn ? '⚠ Realçar violações: ON' : '⚠ Realçar violações: OFF';
    // UI-STD 2026-06-11: amarelo canônico da paleta HUD (#eab308 =
    // HUD_TONE_COLORS.yellow) no toggle — estados/hover via CSS
    // (.cb-violations-toggle[.cb-on]) em compliance-banner.css (AR-2).
    el.innerHTML =
        `<div class="cb-chips-row">${groups.join('')}${indicator}</div>` +
        `<button type="button" class="cb-violations-toggle${violationsOn ? ' cb-on' : ''}" title="Marcar elementos que violam os presets ativos diretamente na tela">${_escapeHtml(viewLabel)}</button>` +
        `<button type="button" class="cb-manage cb-btn cb-btn--secondary">${_escapeHtml(manageBtn)}</button>` +
        `<button type="button" class="cb-details cb-btn cb-btn--secondary">${_escapeHtml(btn)}</button>`;

    // P1-7 R1/R2: dispara o auto-cálculo (preenche #cb-conformity-indicator).
    if (hasPreset) void _updateConformityIndicator();

    // Click no chip preset → abre Gerenciador do binding
    el.querySelectorAll('.cb-chip-preset').forEach((chipEl) => {
        const c = chipEl as HTMLElement;
        c.addEventListener('click', () => {
            const pid = c.getAttribute('data-preset-id') || '';
            const scope = c.getAttribute('data-scope') || 'all';
            openComplianceBindingsManagerModal(pid, scope);
        });
    });

    // Click em chip de componente → abre Gerenciador focado nesse binding
    // (componentes mostram tooltip via title; click leva ao mesmo destino)
    el.querySelectorAll('.cb-component-chip').forEach((chipEl) => {
        const c = chipEl as HTMLElement;
        c.addEventListener('click', () => {
            const pid = c.getAttribute('data-preset-id') || '';
            const scope = c.getAttribute('data-scope') || 'all';
            openComplianceBindingsManagerModal(pid, scope);
        });
    });

    // "+N" → expande/colapsa os chips informativos extras (densidade inferior)
    el.querySelectorAll('.cb-chip-overflow').forEach((btnNode) => {
        const b = btnNode as HTMLButtonElement;
        b.addEventListener('click', () => {
            const group = b.nextElementSibling as HTMLElement | null;
            if (!group || !group.classList.contains('cb-overflow-group')) return;
            const open = group.classList.toggle('cb-open'); // AR-2: via classe CSS
            b.setAttribute('aria-expanded', String(open));
        });
    });

    const detailsEl = el.querySelector('.cb-details') as HTMLButtonElement | null;
    if (detailsEl) detailsEl.addEventListener('click', _onBannerDetailsClick);
    const manageEl = el.querySelector('.cb-manage') as HTMLButtonElement | null;
    if (manageEl) manageEl.addEventListener('click', () => openComplianceBindingsManagerModal());
    // V7: toggle violações ON/OFF (Calvin pedido visualizar pontos violadores)
    const viewToggleEl = el.querySelector('.cb-violations-toggle') as HTMLButtonElement | null;
    if (viewToggleEl) {
        viewToggleEl.addEventListener('click', () => {
            const newState = !_isViolationsToggleOn();
            _setViolationsToggle(newState);
            if (newState) {
                void _renderViolationsOverlay();
            } else {
                _closeViolationsOverlay();
            }
            _renderBanner(getComplianceManager().getState()); // re-render p/ refletir label novo
        });
        // hover state — amarelo canônico (UI-STD 2026-06-11) via CSS :hover (AR-2)
    }

    // Se toggle estava ON antes do re-render, restaurar overlay
    if (_isViolationsToggleOn() && typeof document !== 'undefined' && !document.getElementById(VIOLATIONS_OVERLAY_ID)) {
        void _renderViolationsOverlay();
    }
}

// ----------------------------------------------------------------
// SELETOR DE PRESETS
// ----------------------------------------------------------------

// B1+B2 fix: pure-logic `fmtTemplate` em _detailsModalContentPure.ts substitui
// SOMENTE { presetId, authority } no titleTemplate e { version, jurisdiction }
// no subtitleTemplate. Templates com {name} ou {authority} (no subtítulo) NÃO
// são substituídos. Solução: nosso wire recebe `preset` e pré-resolve as strings
// usando interpolação de TS template literals — bypass do fmtTemplate.
function _buildI18nForModal(preset: CompliancePreset): DetailsModalI18n {
    const authority = preset.publishedBy?.authority || '?';
    const jurisdiction = preset.publishedBy?.jurisdiction || '?';
    const version = preset.version || '?';
    const prefix = _t('compliance.details.titlePrefix', 'Preset');
    return Object.freeze({
        // Pré-resolvido: sem {tokens} restantes. fmtTemplate vira no-op.
        titleTemplate: `${prefix}: ${authority} ${version}`,
        subtitleTemplate: `${authority} · ${jurisdiction} · v${version}`,
        sectionIdentity: _t('compliance.details.section.identity', 'Identidade'),
        sectionLegalBasis: _t('compliance.details.section.legal', 'Base legal'),
        sectionComponents: _t('compliance.details.section.components', 'Componentes técnicos'),
        sectionIntegrity: _t('compliance.details.section.integrity', 'Integridade'),
        labelAuthority: _t('compliance.details.label.authority', 'Autoridade'),
        labelJurisdiction: _t('compliance.details.label.jurisdiction', 'Jurisdição'),
        labelLevel: _t('compliance.details.label.level', 'Nível'),
        labelEffective: _t('compliance.details.label.effective', 'Vigência'),
        labelGwp: _t('compliance.details.label.gwp', 'GWP (IPCC)'),
        labelHorizon: _t('compliance.details.label.horizon', 'Horizonte (anos)'),
        labelEisWeights: _t('compliance.details.label.eis', 'Pesos EIS (T/A/Cp/Ty/Cs/Cm)'),
        labelContentHash: _t('compliance.details.label.hash', 'Content hash'),
        labelVersion: _t('compliance.details.label.version', 'Versão'),
        actionChangePreset: _t('compliance.details.action.change', 'Trocar preset'),
        actionExportJson: _t('compliance.details.action.export', 'Exportar JSON'),
        actionViewLegal: _t('compliance.details.action.legal', 'Ver legislação'),
        actionClose: _t('compliance.details.action.close', 'Fechar'),
        effectiveUntil: _t('compliance.details.until', 'até {date}'),
        effectiveOpenEnded: _t('compliance.details.open', 'em vigor'),
    });
}

function _closePresetsSelector(): void {
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return;
    const existing = doc.getElementById(PRESETS_SELECTOR_ID);
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
        clearDeepLinkUrl();
    }
}

/**
 * Abre seletor inline com 6 presets canônicos.
 */
export function openCompliancePresetsSelector(): void {
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return;
    _closePresetsSelector();
    const mgr = getComplianceManager();
    const presets = mgr.listCanonicalPresets();

    const overlay = doc.createElement('div');
    overlay.id = PRESETS_SELECTOR_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', _t('compliance.presets.aria', 'Lista de presets de conformidade'));
    overlay.style.cssText = [
        'position: fixed',
        'inset: 0',
        'background: rgba(0, 0, 0, 0.65)',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'z-index: 9100',
        'font-family: inherit',
    ].join(';');

    const dialog = doc.createElement('div');
    dialog.style.cssText = [
        'background: #0f172a',
        'color: #e5e7eb',
        'border: 1px solid #1f2937',
        'border-radius: 8px',
        'padding: 24px',
        'width: min(720px, 92vw)',
        'max-height: 80vh',
        'overflow-y: auto',
        'box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5)',
    ].join(';');

    const title = doc.createElement('h2');
    title.style.cssText = 'margin: 0 0 8px 0; font-size: 18px; font-weight: 600;';
    title.textContent = _t('compliance.presets.title', 'Presets de conformidade disponíveis');
    dialog.appendChild(title);

    const subtitle = doc.createElement('p');
    subtitle.style.cssText = 'margin: 0 0 16px 0; opacity: 0.7; font-size: 13px; line-height: 1.5;';
    subtitle.textContent = _t(
        'compliance.presets.subtitle',
        'Selecione um padrão regulatório/framework. O preset rege thresholds, GWP, EIS, taxonomia e retenção do modelo.',
    );
    dialog.appendChild(subtitle);

    // Calvin "multi-bind" (gap G1+G2 audit): scope picker antes dos cards.
    // Default 'all' preserva comportamento atual. Picker fora de 'all' usa
    // bypass _addPresetAsAdditionalBinding para evitar perda do binding 'all'.
    const scopeRow = doc.createElement('div');
    scopeRow.style.cssText = 'display: flex; gap: 10px; align-items: center; margin: 0 0 14px 0; padding: 10px 12px; background: rgba(59,130,246,0.06); border: 1px solid #1e3a8a; border-radius: 6px;';
    const scopeLabel = doc.createElement('label');
    scopeLabel.style.cssText = 'font-size: 12px; font-weight: 600; color: #93c5fd; flex-shrink: 0;';
    scopeLabel.setAttribute('for', 'compliance-scope-picker');
    scopeLabel.textContent = 'Aplicar a:';
    const scopeSelect = doc.createElement('select');
    scopeSelect.id = 'compliance-scope-picker';
    scopeSelect.style.cssText = 'flex: 1; padding: 5px 8px; background: #0f172a; color: #e5e7eb; border: 1px solid #374151; border-radius: 4px; font-size: 12px; font-family: inherit; cursor: pointer;';
    const scopeOptions: Array<{ value: PresetScope; label: string }> = [
        { value: 'all', label: 'Todos os componentes (default)' },
        { value: 'soil', label: 'Solo (CONAMA 420 VRQ/VP/VI)' },
        { value: 'groundwater', label: 'Águas subterrâneas' },
        { value: 'surface-water', label: 'Águas superficiais' },
        { value: 'air', label: 'Ar atmosférico' },
        { value: 'ghg', label: 'Emissões GEE (GHG escopos 1/2/3)' },
        { value: 'border-tax', label: 'Imposto carbono fronteira (CBAM)' },
        { value: 'risk-assessment', label: 'Análise de risco (RBCA)' },
        { value: 'monetary', label: 'Valoração monetária (passivo/ativo)' },
    ];
    for (const opt of scopeOptions) {
        const o = doc.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        scopeSelect.appendChild(o);
    }
    const scopeHint = doc.createElement('span');
    scopeHint.style.cssText = 'font-size: 11px; opacity: 0.65; flex-shrink: 0;';
    scopeHint.textContent = 'multi-bind';
    scopeRow.appendChild(scopeLabel);
    scopeRow.appendChild(scopeSelect);
    scopeRow.appendChild(scopeHint);
    dialog.appendChild(scopeRow);

    const list = doc.createElement('div');
    list.style.cssText = 'display: grid; gap: 10px; grid-template-columns: 1fr;';

    for (const p of presets) {
        const card = doc.createElement('button');
        card.type = 'button';
        card.className = 'compliance-preset-card';
        card.setAttribute('data-preset-id', p.id);
        card.style.cssText = [
            'text-align: left',
            'padding: 14px 16px',
            'border: 1px solid #1f2937',
            'border-radius: 6px',
            'background: rgba(16, 185, 129, 0.06)',
            'color: #e5e7eb',
            'cursor: pointer',
            'font-family: inherit',
            'display: flex',
            'align-items: center',
            'gap: 14px',
            'transition: background 0.15s, border-color 0.15s',
        ].join(';');

        card.addEventListener('mouseenter', () => {
            card.style.background = 'rgba(16, 185, 129, 0.14)';
            card.style.borderColor = '#10b981';
        });
        card.addEventListener('mouseleave', () => {
            card.style.background = 'rgba(16, 185, 129, 0.06)';
            card.style.borderColor = '#1f2937';
        });

        // B5: SVG inline em card do seletor (escala 2x = 40x28 para legibilidade)
        const flag = doc.createElement('span');
        flag.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;transform:scale(2);transform-origin:center;width:40px;height:28px;justify-content:center';
        flag.innerHTML = _flagSvgForJurisdiction(p.publishedBy?.jurisdiction);

        // Calvin: descritivos expressivos (não simplificar nomes regulatórios)
        const friendly = _friendlyPresetMeta(p);

        const meta = doc.createElement('div');
        meta.style.cssText = 'flex: 1; min-width: 0;';

        const categoryTag = doc.createElement('div');
        categoryTag.style.cssText =
            'font-size: 10px; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; color: #10b981; font-weight: 600;';
        categoryTag.textContent = friendly.category;

        const name = doc.createElement('div');
        name.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 4px; line-height: 1.35;';
        name.textContent = friendly.displayName;

        const tagline = doc.createElement('div');
        tagline.style.cssText = 'font-size: 12px; opacity: 0.85; line-height: 1.4; margin-bottom: 4px;';
        tagline.textContent = friendly.tagline;

        const scopeNote = doc.createElement('div');
        scopeNote.style.cssText = 'font-size: 11px; opacity: 0.65; line-height: 1.4; margin-bottom: 4px;';
        scopeNote.textContent = friendly.scopeNote;

        const ghg = doc.createElement('div');
        ghg.style.cssText = 'font-size: 10px; opacity: 0.55; margin-top: 4px; font-family: monospace;';
        const gwp = p.ghgFactors?.gwpVersion || '?';
        const horizon = p.ghgFactors?.timeHorizon || '?';
        const retainYrs = p.auditRetentionDays ? Math.round(p.auditRetentionDays / 365) + 'y' : '?';
        ghg.textContent = `${p.id}  ·  GWP ${gwp}/${horizon}y  ·  audit ${retainYrs}  ·  ${p.publishedBy?.level || '?'}`;

        meta.appendChild(categoryTag);
        meta.appendChild(name);
        meta.appendChild(tagline);
        meta.appendChild(scopeNote);
        meta.appendChild(ghg);

        card.appendChild(flag);
        card.appendChild(meta);

        card.addEventListener('click', () => {
            const chosenScope = (scopeSelect.value || 'all') as PresetScope;
            // Multi-bind: se user pickou scope específico e já existe binding,
            // usar bypass que preserva os bindings existentes.
            const currentBindings = mgr.getState().bindings;
            const hasExistingBindings = currentBindings.length > 0;
            const isMultiBindAttempt = chosenScope !== 'all' && hasExistingBindings;
            if (isMultiBindAttempt) {
                void _addPresetAsAdditionalBinding(p.id, chosenScope).then((r) => {
                    if (r.ok) {
                        _closePresetsSelector();
                    } else {
                        console.debug('[compliance:multi-bind]', r.reason);
                    }
                });
            } else {
                void mgr
                    .selectPreset({ presetId: p.id, scope: chosenScope, reason: 'user_selection' })
                    .then((r) => {
                        if (r.changed) {
                            _closePresetsSelector();
                        } else if (r.error) {
                            console.debug('[compliance:select]', r.error);
                        }
                    })
                    .catch((e) => console.debug('[compliance:select]', (e as Error)?.message || e));
            }
        });

        list.appendChild(card);
    }

    dialog.appendChild(list);

    const footer = doc.createElement('div');
    footer.style.cssText = 'margin-top: 22px; display: flex; justify-content: flex-end;';
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = _t('compliance.presets.close', 'Fechar');
    closeBtn.style.cssText = _buttonStyle(false);
    closeBtn.addEventListener('click', _closePresetsSelector);
    _wireButtonHover(closeBtn, false); // B4: hover state Fechar
    footer.appendChild(closeBtn);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);

    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) _closePresetsSelector();
    });

    doc.body.appendChild(overlay);
    syncDeepLinkUrl('compliance-presets');
}

// ----------------------------------------------------------------
// BINDINGS MANAGER MODAL — Calvin: "como faço para editar (ou ao menos
// visualizar um local de edição)". Mostra lista de bindings ativos +
// controles [Editar scope] [Remover] [+ Adicionar] desabilitados quando
// usuário sem perfil compliance.write — com tooltip explicativo.
// ----------------------------------------------------------------

const BINDINGS_MANAGER_ID = 'compliance-bindings-manager';

function _closeBindingsManager(): void {
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return;
    const existing = doc.getElementById(BINDINGS_MANAGER_ID);
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
        clearDeepLinkUrl();
    }
}

export function openComplianceBindingsManagerModal(highlightPresetId?: string, highlightScope?: string): void {
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return;
    _closeBindingsManager();
    const mgr = getComplianceManager();
    const state = mgr.getState();
    const perm = _checkComplianceWritePermission();

    const overlay = doc.createElement('div');
    overlay.id = BINDINGS_MANAGER_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', _t('compliance.bindings.aria', 'Gerenciador de bindings de conformidade'));
    overlay.style.cssText = [
        'position: fixed', 'inset: 0', 'background: rgba(0, 0, 0, 0.65)',
        'display: flex', 'align-items: center', 'justify-content: center',
        'z-index: 9100', 'font-family: inherit',
    ].join(';');

    const dialog = doc.createElement('div');
    dialog.style.cssText = [
        'background: #0f172a', 'color: #e5e7eb', 'border: 1px solid #1f2937',
        'border-radius: 8px', 'padding: 24px', 'width: min(720px, 92vw)',
        'max-height: 85vh', 'overflow-y: auto', 'box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5)',
    ].join(';');

    const title = doc.createElement('h2');
    title.style.cssText = 'margin: 0 0 8px 0; font-size: 18px; font-weight: 700;';
    title.textContent = _t('compliance.bindings.title', 'Gerenciar Presets de Conformidade');
    dialog.appendChild(title);

    const subtitle = doc.createElement('p');
    subtitle.style.cssText = 'margin: 0 0 16px 0; opacity: 0.7; font-size: 12px; line-height: 1.5;';
    subtitle.textContent = _t(
        'compliance.bindings.subtitle',
        'Cada binding associa um preset a um escopo (matriz/tema). O modelo pode ter múltiplos bindings simultâneos.',
    );
    dialog.appendChild(subtitle);

    // Banner de permissão (sempre visível — informa estado de write)
    const permBanner = doc.createElement('div');
    permBanner.style.cssText = [
        'padding: 10px 14px', 'border-radius: 6px', 'margin-bottom: 18px',
        'font-size: 12px', 'line-height: 1.5',
        perm.canWrite
            ? 'background: rgba(16,185,129,0.1); border: 1px solid #10b981; color: #34d399'
            : 'background: rgba(245,158,11,0.1); border: 1px solid #f59e0b; color: #fbbf24',
    ].join(';');
    permBanner.innerHTML = perm.canWrite
        ? `<strong>✓ Edição habilitada</strong> — você tem permissão compliance.write`
        : `<strong>🔒 Modo somente leitura</strong> — ${_escapeHtml(perm.reason)}`;
    dialog.appendChild(permBanner);

    // Lista de bindings ativos
    const listTitle = doc.createElement('h3');
    listTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #10b981;';
    listTitle.textContent = `Bindings ativos (${state.bindings.length})`;
    dialog.appendChild(listTitle);

    if (state.bindings.length === 0) {
        const empty = doc.createElement('div');
        empty.style.cssText = 'padding: 30px; text-align: center; opacity: 0.6; font-size: 13px; border: 1px dashed #374151; border-radius: 6px;';
        empty.textContent = 'Nenhum binding ativo. Click [+ Adicionar preset] abaixo para começar.';
        dialog.appendChild(empty);
    } else {
        const list = doc.createElement('div');
        list.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
        state.bindings.forEach((b) => {
            const p = mgr.getPresetSync(b.presetId);
            const friendly = p ? _friendlyPresetMeta(p) : null;
            const row = doc.createElement('div');
            const isHighlighted = highlightPresetId === b.presetId && (!highlightScope || highlightScope === b.scope);
            row.style.cssText = [
                'display: flex', 'gap: 14px', 'padding: 14px 16px', 'border-radius: 6px',
                'background: rgba(16, 185, 129, 0.04)',
                'border: 1px solid ' + (isHighlighted ? '#10b981' : '#1f2937'),
                'align-items: flex-start',
            ].join(';');

            const flagWrap = doc.createElement('span');
            flagWrap.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;transform:scale(1.5);transform-origin:left;width:30px;height:21px';
            flagWrap.innerHTML = p ? _flagSvgForJurisdiction(p.publishedBy?.jurisdiction) : '';
            row.appendChild(flagWrap);

            const info = doc.createElement('div');
            info.style.cssText = 'flex: 1; min-width: 0;';
            const heading = doc.createElement('div');
            heading.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 3px; line-height: 1.3;';
            heading.textContent = friendly ? friendly.displayName : b.presetId;
            const metaLine = doc.createElement('div');
            metaLine.style.cssText = 'font-size: 11px; opacity: 0.75; line-height: 1.4; font-family: monospace;';
            metaLine.textContent = `escopo: ${b.scope}  ·  ativado: ${b.activatedAt.slice(0, 10)}  ·  por: ${b.activatedBy}`;
            const friendlyLine = doc.createElement('div');
            friendlyLine.style.cssText = 'font-size: 11px; opacity: 0.6; margin-top: 3px;';
            friendlyLine.textContent = friendly ? friendly.scopeNote : '';
            info.appendChild(heading);
            info.appendChild(metaLine);
            if (friendly) info.appendChild(friendlyLine);

            // Calvin: componentes do preset como chips coloridos (1 por norma/registry)
            if (p) {
                const components = _extractPresetComponents(p);
                if (components.length > 0) {
                    const compsRow = doc.createElement('div');
                    compsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;';
                    components.forEach((c) => {
                        const chip = doc.createElement('span');
                        chip.style.cssText = _componentChipStyle(c) + ';cursor:default';
                        chip.title = c.tooltip;
                        chip.innerHTML =
                            `<span style="font-size:10px;line-height:1">${_escapeHtml(c.icon)}</span>` +
                            `<span>${_escapeHtml(c.label)}</span>`;
                        compsRow.appendChild(chip);
                    });
                    info.appendChild(compsRow);
                }
            }
            row.appendChild(info);

            // Botões de edição (disabled se sem perm)
            const actions = doc.createElement('div');
            actions.style.cssText = 'display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;';
            const editBtn = doc.createElement('button');
            editBtn.type = 'button';
            editBtn.textContent = '✏ Editar scope';
            editBtn.disabled = !perm.canWrite;
            editBtn.title = perm.canWrite ? 'Editar este binding' : perm.reason;
            editBtn.style.cssText = _buttonStyle(false) + ';font-size:11px;padding:4px 10px';
            if (!perm.canWrite) editBtn.style.opacity = '0.4';
            const removeBtn = doc.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = '🗑 Remover';
            removeBtn.disabled = !perm.canWrite;
            removeBtn.title = perm.canWrite ? 'Remover este binding' : perm.reason;
            removeBtn.style.cssText = _buttonStyle(false) + ';font-size:11px;padding:4px 10px;color:#f87171;border-color:#991b1b';
            if (!perm.canWrite) removeBtn.style.opacity = '0.4';
            if (perm.canWrite) {
                _wireButtonHover(editBtn, false);
                _wireButtonHover(removeBtn, false);
                // Editar scope: prompt async simples com 9 opções
                editBtn.addEventListener('click', () => {
                    void (async () => {
                        const newScope = await asyncPrompt(
                            `Editar escopo de "${friendly?.displayName || b.presetId}"\n\n` +
                                'Opções válidas: all, soil, groundwater, surface-water, air, ghg, border-tax, risk-assessment, monetary\n\n' +
                                `Escopo atual: ${b.scope}`,
                            b.scope,
                        );
                        if (!newScope || newScope === b.scope) return;
                        const valid: PresetScope[] = ['all', 'soil', 'groundwater', 'surface-water', 'air', 'ghg', 'border-tax', 'risk-assessment', 'monetary'];
                        if (!valid.includes(newScope as PresetScope)) {
                            showToast(`Escopo inválido: "${newScope}". Use uma das opções listadas.`, 'warning');
                            return;
                        }
                        // Remove binding atual + adiciona com novo scope (preserva semântica)
                        await mgr.removeBindingByScope(b.presetId, b.scope, 'user_edit_scope');
                        const r = await _addPresetAsAdditionalBinding(b.presetId, newScope as PresetScope);
                        if (r.ok) openComplianceBindingsManagerModal();
                    })();
                });
                removeBtn.addEventListener('click', () => {
                    void (async () => {
                        const confirmRemove = await asyncConfirm(
                            `Remover binding "${friendly?.displayName || b.presetId}" (escopo: ${b.scope})?`,
                            { danger: true },
                        );
                        if (!confirmRemove) return;
                        await mgr.removeBindingByScope(b.presetId, b.scope, 'user_remove');
                        openComplianceBindingsManagerModal(); // refresh
                    })();
                });
            }
            actions.appendChild(editBtn);
            actions.appendChild(removeBtn);
            row.appendChild(actions);

            list.appendChild(row);
        });
        dialog.appendChild(list);
    }

    // Footer com [+ Adicionar preset] + [Fechar]
    const footer = doc.createElement('div');
    footer.style.cssText = 'margin-top: 22px; display: flex; justify-content: space-between; gap: 8px; align-items: center; padding-top: 16px; border-top: 1px solid #1f2937;';
    const addBtn = doc.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+ Adicionar outro preset';
    addBtn.disabled = !perm.canWrite;
    addBtn.title = perm.canWrite ? 'Abre seletor para adicionar novo binding' : perm.reason;
    addBtn.style.cssText = _buttonStyle(true) + ';font-size:12px';
    if (!perm.canWrite) addBtn.style.opacity = '0.4';
    if (perm.canWrite) {
        addBtn.addEventListener('click', () => {
            _closeBindingsManager();
            openCompliancePresetsSelector();
        });
        _wireButtonHover(addBtn, true);
    }
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = _t('compliance.bindings.close', 'Fechar');
    closeBtn.style.cssText = _buttonStyle(false);
    closeBtn.addEventListener('click', _closeBindingsManager);
    _wireButtonHover(closeBtn, false);
    footer.appendChild(addBtn);
    footer.appendChild(closeBtn);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) _closeBindingsManager();
    });
    doc.body.appendChild(overlay);
    syncDeepLinkUrl('compliance-bindings');

    // Expor para console + testes
    if (typeof window !== 'undefined' && typeof window.handleOpenComplianceBindingsManager !== 'function') {
        window.handleOpenComplianceBindingsManager = openComplianceBindingsManagerModal;
    }
}

// ----------------------------------------------------------------
// EVENTS WIRING
// ----------------------------------------------------------------

function _onBannerDetailsClick(): void {
    const mgr = getComplianceManager();
    const state = mgr.getState();
    // Empty → abre seletor (Calvin "não vejo onde visualizar")
    if (state.bindings.length === 0) {
        openCompliancePresetsSelector();
        return;
    }
    // Active → mostra Detalhes do primeiro binding
    const first = state.bindings[0];
    if (!first) {
        openCompliancePresetsSelector();
        return;
    }
    const preset = mgr.getPresetSync(first.presetId);
    if (!preset) {
        openCompliancePresetsSelector();
        return;
    }
    const input: DetailsModalInput = Object.freeze({
        preset,
        i18n: _buildI18nForModal(preset),
        canChangePreset: true,
        canExportJson: true,
    });
    openComplianceDetailsModal(input);
}

function _onChangePreset(): void {
    // P3 UX fix: fechar Detalhes modal antes de abrir Seletor (evita empilhamento)
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (doc) doc.getElementById('compliance-details-modal')?.remove();
    openCompliancePresetsSelector();
}

// ----------------------------------------------------------------
// MULTI-BIND BYPASS — manager.selectPreset(scope=X) apaga binding 'all'
// existente (semantica 'all captures everything' em _modelBindingsPure
// linha 186). Para multi-bind real (Calvin "selecionar 2+"), usamos
// addBinding direto + onStateChanged sintetico, sem audit log.
// Trade-off documentado: audit incompleto mas multi-bind funciona.
// ----------------------------------------------------------------

async function _addPresetAsAdditionalBinding(presetId: string, scope: PresetScope): Promise<{ ok: boolean; reason?: string }> {
    const mgr = getComplianceManager();
    const state = mgr.getState();
    const preset = mgr.getPresetSync(presetId);
    if (!preset) return { ok: false, reason: 'preset_not_found' };
    const userId = 'anonymous'; // TODO integrar auth.session.currentUser
    const nowIso = new Date().toISOString();
    const result = addBinding(state, {
        presetId,
        scope,
        contentHashSnapshot: preset.contentHash,
        activatedAt: nowIso,
        activatedBy: userId,
    });
    if (!result.changed) return { ok: false, reason: result.error || 'add_failed' };
    // Bypass manager state via restoreState — schemaVersion 2 (não 'version')
    try {
        const snapshot = {
            schemaVersion: 2 as const,
            bindings: result.state.bindings.map((b) => ({
                presetId: b.presetId,
                scope: b.scope,
                contentHashSnapshot: b.contentHashSnapshot,
                activatedAt: b.activatedAt,
                activatedBy: b.activatedBy,
            })),
        };
        const r = mgr.restoreState(snapshot);
        if (r && r.state) {
            return { ok: true };
        }
        return { ok: false, reason: 'restore_returned_no_state' };
    } catch (e) {
        console.debug('[compliance:multi-bind]', (e as Error)?.message || e);
        return { ok: false, reason: 'restore_failed' };
    }
}

// ----------------------------------------------------------------
// DEV TOGGLE — habilita permissão local p/ testar Editar/Remover sem auth real.
// Calvin: "ao menos visualizar um local de edição mesmo que eu não tenha
// usuário com propriedades de edição" — toggle permite alternar entre os 2
// estados em runtime (console: __enableComplianceWrite() / __disableComplianceWrite()).
// ----------------------------------------------------------------

function _installDevToggle(): void {
    if (typeof window === 'undefined') return;
    if (typeof window.__enableComplianceWrite !== 'function') {
        window.__enableComplianceWrite = () => {
            window.currentUser = {
                email: 'dev@local',
                roles: ['compliance.write', 'admin'],
            };
            console.info('[compliance:dev] permissão compliance.write ATIVADA — recarregue modal Gerenciar');
            // Re-render banner para refletir estado novo
            _renderBanner(getComplianceManager().getState());
        };
        window.__disableComplianceWrite = () => {
            delete window.currentUser;
            console.info('[compliance:dev] permissão compliance.write desativada');
            _renderBanner(getComplianceManager().getState());
        };
    }
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Inicializa o wire UI compliance. Chamado uma vez após DOM ready
 * (em main.ts após runPostShellActivationSequence). Idempotente.
 */
/**
 * Rollback hatch da feature COMPLIANCE-PRESET-001 (spec §8).
 *
 * Lê `CONFIG.FEATURES.COMPLIANCE_PRESET_ENABLED`. Checagem defensiva: só
 * desliga com o `=== false` explícito — se `CONFIG.FEATURES` não existir
 * (boot parcial / ambiente de teste), trata como ligada (default da spec §15
 * D4-rev: preset mais restritivo sempre ligado por default). Mesmo precedente
 * de `isCourseAuthoringEnabled()` / `isPptxImportSupported()` (ADR A6).
 *
 * @returns false apenas quando a flag é explicitamente `false`.
 */
export function isCompliancePresetEnabled(): boolean {
    return CONFIG.FEATURES?.COMPLIANCE_PRESET_ENABLED !== false;
}

export function initComplianceUi(): void {
    if (_initialized) return;
    // Rollback hatch EFETIVO (spec §8): flag false ⇒ no-op silencioso. O módulo
    // não monta, não seleciona o preset default e não registra listeners; os
    // cálculos do app seguem com defaults (zero regressão, N5).
    if (!isCompliancePresetEnabled()) {
        console.debug('[compliance:init] disabled via CONFIG.FEATURES.COMPLIANCE_PRESET_ENABLED=false — no-op');
        return;
    }
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return;
    _initialized = true;

    // Garante manager criado (efeito colateral: registra onStateChanged)
    const mgr = getComplianceManager();

    // Calvin 2026-06-11: "deixar o preset mais restritivo sempre ligado por
    // default" — modelo sem binding herda o Pareto worldwide (fail-safe
    // conservador: nunca avaliar sem framework). Import .ecbt com estado
    // próprio substitui via restoreState; troca manual continua livre.
    if (mgr.getState().bindings.length === 0) {
        void mgr
            .selectPreset({
                presetId: 'global-pareto-most-restrictive-worldwide',
                scope: 'all',
                reason: 'default_most_restrictive_boot',
            })
            .catch((e) => console.debug('[compliance:default-preset]', (e as Error)?.message || e));
    }

    // Dev toggle p/ habilitar permissão local sem auth real
    _installDevToggle();

    // Listeners
    doc.addEventListener('compliance:details-action-change-preset', _onChangePreset);

    // PRESET-IN-CONSTELLATION (Calvin 2026-06-17): render inicial monta o módulo
    // DENTRO de #constellation-view-preset (a view da aba Preset), escondida por
    // display:none até o usuário ativar a aba. Não há mais faixa flutuante.
    _renderBanner(mgr.getState());

    // Expõe handler global para descoberta via menu/console
    if (typeof window !== 'undefined') {
        if (typeof window.handleOpenCompliancePresets !== 'function') {
            window.handleOpenCompliancePresets = openCompliancePresetsSelector;
        }
    }
}

/**
 * HUD-REFRESH 2026-06-11 (Calvin "botão de refresh todos os huds"): re-render
 * manual do banner a partir do estado atual — usado por hudRefresh.ts.
 */
export function refreshComplianceBanner(): void {
    try {
        const state = getComplianceManager().getState();
        _renderBanner(state);
        _syncActivePresetExports(state);
    } catch (e) {
        console.debug('[compliance:refresh]', (e as Error)?.message || e);
    }
}

/**
 * Teardown — usado em tests e em refresh do app.
 */
export function disposeComplianceUi(): void {
    const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
    if (!doc) return;
    doc.removeEventListener('compliance:details-action-change-preset', _onChangePreset);
    const banner = doc.getElementById(BANNER_ID);
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    _closePresetsSelector();
    _initialized = false;
    _manager = null;
}
