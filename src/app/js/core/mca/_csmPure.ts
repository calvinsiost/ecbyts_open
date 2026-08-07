// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// MCA / Modelo Conceitual da Área (Conceptual Site Model — CSM) — núcleo pure-logic.
// Implementa SPEC_MCA_CONCEPTUAL_SITE_MODEL Fase A. DOM-free, IDB-free, sem Date.now
// interno (timestamps são injetados para testabilidade determinística).
//
// Framework: ASTM E1689-20 (fonte → caminho → receptor) + CETESB DD 038/2017 (MCA 1/MCA 2
// + nível de confiança A/B/C). Constrói o CSM a partir dos elementos do modelo, deriva a
// matriz de linkages fonte×caminho×receptor e classifica o nível de confiança.

export type SourceType = 'primary' | 'potential' | 'secondary';
export type ReceptorType = 'human' | 'ecological' | 'water_body' | 'supply_well';
export type Medium = 'soil' | 'groundwater' | 'surface_water' | 'sediment' | 'air';
export type LinkageStatus = 'complete' | 'potential' | 'incomplete';
export type Confidence = 'A' | 'B' | 'C';

export type CsmSource = { id: string; name: string; sourceType: SourceType; family: string; substances: string[] };
export type CsmReceptor = { id: string; name: string; receptorType: ReceptorType; family: string };
export type CsmPathway = { id: string; mechanism: string; medium: Medium };
export type CsmLinkage = { sourceId: string; pathwayId: string; receptorId: string; status: LinkageStatus };

export type Csm = {
    version: 1 | 2 | 3;
    sources: CsmSource[];
    pathways: CsmPathway[];
    receptors: CsmReceptor[];
    linkages: CsmLinkage[];
    confidence: Confidence;
    justification: string;
    createdAt: string;
};

/** Famílias de elementos que representam FONTES de contaminação (área-fonte). */
export const SOURCE_FAMILIES: Readonly<Record<string, SourceType>> = Object.freeze({
    emission_source: 'potential',
    tank: 'potential',
    effluent_point: 'potential',
    waste_stream: 'potential',
    pit: 'potential',
    dam: 'potential',
});

/** Famílias de elementos que representam RECEPTORES (bens a proteger). */
export const RECEPTOR_FAMILIES: Readonly<Record<string, ReceptorType>> = Object.freeze({
    well: 'supply_well',
    lake: 'water_body',
    river: 'water_body',
    spring: 'water_body',
    individual: 'human',
    habitat: 'ecological',
});

/** Conjunto canônico de caminhos por meio (ASTM E1689 — mecanismos de transporte). */
export const CANONICAL_PATHWAYS: readonly CsmPathway[] = Object.freeze([
    { id: 'pw-soil', mechanism: 'lixiviação/contato direto', medium: 'soil' },
    { id: 'pw-gw', mechanism: 'percolação/advecção-dispersão', medium: 'groundwater' },
    { id: 'pw-sw', mechanism: 'escoamento superficial', medium: 'surface_water' },
    { id: 'pw-sed', mechanism: 'deposição/sorção', medium: 'sediment' },
    { id: 'pw-air', mechanism: 'volatilização/emissão', medium: 'air' },
]);

const _esc = (s: unknown): string =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

/** Meios plausíveis de chegar a cada tipo de receptor (heurística determinística). */
const RECEPTOR_MEDIA: Readonly<Record<ReceptorType, Medium[]>> = Object.freeze({
    supply_well: ['groundwater'],
    water_body: ['surface_water', 'groundwater', 'sediment'],
    human: ['soil', 'groundwater', 'air'],
    ecological: ['soil', 'surface_water', 'sediment'],
});

/** Extrai as substâncias observadas em um elemento (parameter/parameterId das observações). */
function _substancesOf(el: any): string[] {
    const obs = Array.isArray(el?.observations) ? el.observations : [];
    const set = new Set<string>();
    for (const o of obs) {
        const s = o?.parameter || o?.parameterId;
        if (s) set.add(String(s));
    }
    return Array.from(set);
}

/**
 * Constrói um CSM a partir dos elementos do modelo. Auto-deriva fontes e receptores
 * pelas famílias; usa o conjunto canônico de caminhos; deriva os linkages.
 * @param now ISO string injetada (testabilidade); default '' (caller carimba).
 */
export function buildCsmFromElements(elements: unknown[], now = ''): Csm {
    const els = Array.isArray(elements) ? elements : [];
    const sources: CsmSource[] = [];
    const receptors: CsmReceptor[] = [];
    for (const el of els as any[]) {
        const family = String(el?.family || '');
        const id = String(el?.id || '');
        if (!id) continue;
        if (family in SOURCE_FAMILIES) {
            sources.push({
                id,
                name: String(el?.name || family),
                sourceType: SOURCE_FAMILIES[family] as SourceType,
                family,
                substances: _substancesOf(el),
            });
        } else if (family in RECEPTOR_FAMILIES) {
            receptors.push({ id, name: String(el?.name || family), receptorType: RECEPTOR_FAMILIES[family] as ReceptorType, family });
        }
    }
    const pathways = CANONICAL_PATHWAYS.map((p) => ({ ...p }));
    const linkages = deriveLinkages(sources, pathways, receptors);
    const conf = computeConfidence({ sources, receptors, linkages } as any, coverageFromSources(sources));
    return {
        version: 1,
        sources,
        pathways,
        receptors,
        linkages,
        confidence: conf.level,
        justification: conf.rationale,
        createdAt: now,
    };
}

/** Deriva métricas de cobertura a partir das fontes (proxy de completude de dados). */
export function coverageFromSources(sources: CsmSource[]): { observed: number; sources: number; gaps: number } {
    const arr = Array.isArray(sources) ? sources : [];
    const observed = arr.filter((s) => s.substances.length > 0).length;
    return { observed, sources: arr.length, gaps: arr.length - observed };
}

/**
 * Gera os linkages candidatos fonte×caminho×receptor. Um linkage existe quando o meio
 * do caminho é plausível para o tipo de receptor. Status:
 *  - 'complete'   → a fonte tem substâncias observadas (contaminação caracterizada);
 *  - 'potential'  → fonte sem substâncias observadas ainda (via potencialmente completa);
 */
export function deriveLinkages(sources: CsmSource[], pathways: CsmPathway[], receptors: CsmReceptor[]): CsmLinkage[] {
    const ss = Array.isArray(sources) ? sources : [];
    const pp = Array.isArray(pathways) ? pathways : [];
    const rr = Array.isArray(receptors) ? receptors : [];
    const out: CsmLinkage[] = [];
    for (const s of ss) {
        for (const r of rr) {
            const media = RECEPTOR_MEDIA[r.receptorType] || [];
            for (const p of pp) {
                if (!media.includes(p.medium)) continue;
                out.push({
                    sourceId: s.id,
                    pathwayId: p.id,
                    receptorId: r.id,
                    status: s.substances.length > 0 ? 'complete' : 'potential',
                });
            }
        }
    }
    return out;
}

/**
 * Classifica o nível de confiança do MCA (A/B/C) por proxy de completude.
 * Regra (CETESB DD 038/2017 item p): A=alto, B=médio, C=baixo.
 */
export function computeConfidence(
    _csm: Pick<Csm, 'sources' | 'receptors' | 'linkages'>,
    coverage: { observed: number; sources: number; gaps: number },
): { level: Confidence; rationale: string } {
    const { observed = 0, sources = 0, gaps = 0 } = coverage || ({} as any);
    if (sources === 0) {
        return { level: 'C', rationale: 'Nenhuma área-fonte caracterizada — confiança baixa; requer Avaliação Preliminar.' };
    }
    if (observed === 0) {
        return { level: 'C', rationale: `${sources} fonte(s) identificada(s), porém sem substâncias observadas — alta incerteza.` };
    }
    if (gaps === 0 && observed >= sources) {
        return { level: 'A', rationale: `Todas as ${sources} fonte(s) com substâncias observadas — baixa incerteza.` };
    }
    return {
        level: 'B',
        rationale: `${observed}/${sources} fonte(s) com substâncias observadas; ${gaps} lacuna(s) — incerteza moderada.`,
    };
}

/** Override manual do nível de confiança pelo Responsável Técnico (justificativa obrigatória). */
export function overrideConfidence(csm: Csm, level: Confidence, justification: string): Csm {
    const lvl: Confidence = level === 'A' || level === 'B' || level === 'C' ? level : csm.confidence;
    return { ...csm, confidence: lvl, justification: String(justification || csm.justification) };
}

const LINKAGE_STATUSES: readonly LinkageStatus[] = Object.freeze(['complete', 'potential', 'incomplete']);

/**
 * Define o status de um linkage específico (edição manual pelo RT na matriz). Retorna
 * um novo CSM imutável; no-op se o linkage não existir ou o status for inválido.
 */
export function setLinkageStatus(
    csm: Csm,
    sourceId: string,
    pathwayId: string,
    receptorId: string,
    status: LinkageStatus,
): Csm {
    if (!LINKAGE_STATUSES.includes(status)) return csm;
    const linkages = csm.linkages.map((l) =>
        l.sourceId === sourceId && l.pathwayId === pathwayId && l.receptorId === receptorId ? { ...l, status } : { ...l },
    );
    return { ...csm, linkages };
}

/** Cicla o status de um linkage (complete → potential → incomplete → complete) — UX de toggle. */
export function cycleLinkageStatus(csm: Csm, sourceId: string, pathwayId: string, receptorId: string): Csm {
    const current = csm.linkages.find(
        (l) => l.sourceId === sourceId && l.pathwayId === pathwayId && l.receptorId === receptorId,
    );
    if (!current) return csm;
    const idx = LINKAGE_STATUSES.indexOf(current.status);
    const next = LINKAGE_STATUSES[(idx + 1) % LINKAGE_STATUSES.length] as LinkageStatus;
    return setLinkageStatus(csm, sourceId, pathwayId, receptorId, next);
}

/** Congela um snapshot do CSM numa versão (MCA 1 / MCA 2 / MCA 3). */
export function snapshotCsm(csm: Csm, version: 1 | 2 | 3, now = ''): Csm {
    return {
        ...csm,
        version,
        sources: csm.sources.map((s) => ({ ...s, substances: [...s.substances] })),
        pathways: csm.pathways.map((p) => ({ ...p })),
        receptors: csm.receptors.map((r) => ({ ...r })),
        linkages: csm.linkages.map((l) => ({ ...l })),
        createdAt: now || csm.createdAt,
    };
}

const MEDIUM_LABEL: Record<Medium, string> = {
    soil: 'Solo',
    groundwater: 'Água subterrânea',
    surface_water: 'Água superficial',
    sediment: 'Sedimento',
    air: 'Ar',
};
export const STATUS_LABEL: Record<LinkageStatus, string> = {
    complete: 'Completa',
    potential: 'Potencial',
    incomplete: 'Incompleta',
};
export const CONFIDENCE_LEVELS: readonly Confidence[] = Object.freeze(['A', 'B', 'C']);

/** Monta a seção HTML do MCA (texto + matriz de linkages) para o relatório CETESB. */
export function buildMcaSectionHtml(csm: Csm): string {
    if (!csm) return '<p>Modelo Conceitual não disponível.</p>';
    const completes = csm.linkages.filter((l) => l.status === 'complete').length;
    const srcNames = new Map(csm.sources.map((s) => [s.id, s.name]));
    const rcpNames = new Map(csm.receptors.map((r) => [r.id, r.name]));
    const pwLabel = new Map(csm.pathways.map((p) => [p.id, MEDIUM_LABEL[p.medium] || p.medium]));
    const rows = csm.linkages
        .map(
            (l) =>
                `<tr class="mca-link-${l.status}"><td>${_esc(srcNames.get(l.sourceId) || l.sourceId)}</td>` +
                `<td>${_esc(pwLabel.get(l.pathwayId) || l.pathwayId)}</td>` +
                `<td>${_esc(rcpNames.get(l.receptorId) || l.receptorId)}</td>` +
                `<td>${_esc(STATUS_LABEL[l.status])}</td></tr>`,
        )
        .join('');
    const matrix = csm.linkages.length
        ? `<table class="report-data-table mca-linkage-table"><thead><tr>` +
          `<th>Fonte</th><th>Caminho (meio)</th><th>Receptor</th><th>Via de exposição</th>` +
          `</tr></thead><tbody>${rows}</tbody></table>`
        : '<p>Nenhuma via fonte→caminho→receptor identificada.</p>';
    return (
        `<h2>Modelo Conceitual da Área (MCA ${csm.version})</h2>` +
        `<p><strong>Fontes:</strong> ${csm.sources.length} · <strong>Receptores:</strong> ${csm.receptors.length} · ` +
        `<strong>Vias completas:</strong> ${completes} · <strong>Nível de confiança:</strong> ${_esc(csm.confidence)}</p>` +
        `<p>${_esc(csm.justification)}</p>` +
        matrix
    );
}

/**
 * Matriz HTML EDITÁVEL de linkages para o painel MCA (Fase B.2). Cada célula de status
 * é um <button data-sid/data-pid/data-rid> que o painel cicla via cycleLinkageStatus.
 * Pure (string escapada); a interatividade fica no glue (utils/ui/mcaPanel).
 */
export function buildMcaEditableMatrixHtml(csm: Csm): string {
    if (!csm || !csm.linkages.length) return '<p class="mca-empty">Nenhuma via fonte→caminho→receptor identificada.</p>';
    const srcNames = new Map(csm.sources.map((s) => [s.id, s.name]));
    const rcpNames = new Map(csm.receptors.map((r) => [r.id, r.name]));
    const pwLabel = new Map(csm.pathways.map((p) => [p.id, MEDIUM_LABEL[p.medium] || p.medium]));
    const rows = csm.linkages
        .map(
            (l) =>
                `<tr class="mca-link-${l.status}">` +
                `<td>${_esc(srcNames.get(l.sourceId) || l.sourceId)}</td>` +
                `<td>${_esc(pwLabel.get(l.pathwayId) || l.pathwayId)}</td>` +
                `<td>${_esc(rcpNames.get(l.receptorId) || l.receptorId)}</td>` +
                `<td><button type="button" class="mca-status-cell mca-status-${l.status}" ` +
                `data-sid="${_esc(l.sourceId)}" data-pid="${_esc(l.pathwayId)}" data-rid="${_esc(l.receptorId)}">${_esc(STATUS_LABEL[l.status])}</button></td>` +
                `</tr>`,
        )
        .join('');
    return (
        `<table class="report-data-table mca-linkage-table"><thead><tr>` +
        `<th>Fonte</th><th>Caminho (meio)</th><th>Receptor</th><th>Via (clique p/ alternar)</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>`
    );
}

function _trunc(s: string, n = 22): string {
    const str = String(s || '');
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/**
 * Monta um diagrama SVG fonte→receptor (CSM pathway diagram, ASTM E1689). Fontes à
 * esquerda, receptores à direita; linhas coloridas por status da via (vermelho=completa,
 * âmbar tracejada=potencial). Pure (string), embutível como figura via data:image/svg+xml.
 */
export function buildCsmDiagramSvg(csm: Csm, opts: { width?: number } = {}): string {
    if (!csm || (csm.sources.length === 0 && csm.receptors.length === 0)) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="60"><text x="160" y="34" text-anchor="middle" font-family="sans-serif" font-size="12">MCA vazio</text></svg>';
    }
    const W = opts.width || 680;
    const boxW = 150;
    const boxH = 38;
    const rowH = 56;
    const padTop = 70;
    const rows = Math.max(csm.sources.length, csm.receptors.length, 1);
    const H = padTop + rows * rowH + 24;
    const srcX = 20;
    const rcpX = W - boxW - 20;
    const colY = (i: number) => padTop + i * rowH + 6;

    // Pares fonte→receptor únicos (status pior + meios).
    const pairs = new Map<string, { complete: boolean }>();
    for (const l of csm.linkages) {
        const key = `${l.sourceId}|${l.receptorId}`;
        const e = pairs.get(key) || { complete: false };
        if (l.status === 'complete') e.complete = true;
        pairs.set(key, e);
    }
    const srcIdx = new Map(csm.sources.map((s, i) => [s.id, i]));
    const rcpIdx = new Map(csm.receptors.map((r, i) => [r.id, i]));

    let lines = '';
    for (const [key, e] of pairs) {
        const [sid, rid] = key.split('|');
        const si = srcIdx.get(sid as string);
        const ri = rcpIdx.get(rid as string);
        if (si === undefined || ri === undefined) continue;
        const y1 = colY(si) + boxH / 2;
        const y2 = colY(ri) + boxH / 2;
        const color = e.complete ? '#ef4444' : '#f59e0b';
        const dash = e.complete ? '' : ' stroke-dasharray="5,3"';
        lines += `<line x1="${srcX + boxW}" y1="${y1}" x2="${rcpX}" y2="${y2}" stroke="${color}" stroke-width="2"${dash} />`;
    }
    const srcBoxes = csm.sources
        .map(
            (s, i) =>
                `<rect x="${srcX}" y="${colY(i)}" width="${boxW}" height="${boxH}" rx="4" fill="#fde2e2" stroke="#c0392b"/>` +
                `<text x="${srcX + boxW / 2}" y="${colY(i) + boxH / 2 + 4}" text-anchor="middle" font-size="11">${_esc(_trunc(s.name))}</text>`,
        )
        .join('');
    const rcpBoxes = csm.receptors
        .map(
            (r, i) =>
                `<rect x="${rcpX}" y="${colY(i)}" width="${boxW}" height="${boxH}" rx="4" fill="#e2f0fd" stroke="#2980b9"/>` +
                `<text x="${rcpX + boxW / 2}" y="${colY(i) + boxH / 2 + 4}" text-anchor="middle" font-size="11">${_esc(_trunc(r.name))}</text>`,
        )
        .join('');
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">` +
        `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
        `<text x="${W / 2}" y="24" text-anchor="middle" font-size="14" font-weight="600">Modelo Conceitual da Área (MCA ${csm.version}) — Confiança ${_esc(csm.confidence)}</text>` +
        `<text x="${srcX}" y="52" font-size="11" font-weight="600" fill="#c0392b">FONTES</text>` +
        `<text x="${rcpX}" y="52" font-size="11" font-weight="600" fill="#2980b9">RECEPTORES</text>` +
        `${lines}${srcBoxes}${rcpBoxes}</svg>`
    );
}
