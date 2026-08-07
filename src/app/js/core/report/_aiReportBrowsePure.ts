// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AI REPORT BROWSE — Pure view-model for F2.4 Community Templates tab

   Filters + sort + paginates marketplace rows fetched do Supabase.
   Pure: zero state, zero DOM, zero rede. Caller injeta rows + filter state.

   Used by aiReportBrowseModal (front-first com fixture até backend deploy).
   ================================================================ */

export interface MarketplaceTemplateRow {
    id: string;
    source_template_id: string;
    author_id: string;
    title: string;
    description: string;
    body_json: any;
    price_ecbt: number;
    royalty_pct: number;
    license: string;
    status: 'pending_review' | 'approved' | 'rejected' | 'archived';
    approved_at?: string;
    created_at: string;
    /** Optional aggregated fields (joins) */
    author_name?: string;
    install_count?: number;
    rating_avg?: number;
}

export interface BrowseFilters {
    /** 'all' | 'free' | 'paid' */
    pricing?: 'all' | 'free' | 'paid';
    /** License filter (subset of valid licenses; 'all' = no filter) */
    license?: 'all' | 'agpl-3.0' | 'cc-by-4.0' | 'proprietary';
    /** Free-text search (matches title + description case-insensitive) */
    query?: string;
    /** Sort key */
    sortBy?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'title_asc';
}

export interface BrowsePage {
    rows: MarketplaceTemplateRow[];
    totalMatching: number;
    totalRows: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

/**
 * Filter marketplace rows by user filter state.
 * Pure: only filters approved status (security: never expose pending/rejected).
 */
export function filterTemplates(
    rows: ReadonlyArray<MarketplaceTemplateRow> | null | undefined,
    filters: BrowseFilters = {}
): MarketplaceTemplateRow[] {
    const list = Array.isArray(rows) ? rows : [];
    let result = list.filter((r) => r && r.status === 'approved');

    if (filters.pricing === 'free') {
        result = result.filter((r) => Number(r.price_ecbt) === 0);
    } else if (filters.pricing === 'paid') {
        result = result.filter((r) => Number(r.price_ecbt) > 0);
    }

    if (filters.license && filters.license !== 'all') {
        result = result.filter((r) => r.license === filters.license);
    }

    if (typeof filters.query === 'string' && filters.query.trim().length > 0) {
        const q = filters.query.trim().toLowerCase();
        result = result.filter((r) => {
            const title = String(r.title || '').toLowerCase();
            const desc = String(r.description || '').toLowerCase();
            return title.includes(q) || desc.includes(q);
        });
    }

    return result;
}

/**
 * Sort filtered rows by sortBy key (deterministic).
 */
export function sortTemplates(
    rows: ReadonlyArray<MarketplaceTemplateRow>,
    sortBy: BrowseFilters['sortBy'] = 'newest'
): MarketplaceTemplateRow[] {
    const list = [...rows];
    switch (sortBy) {
        case 'oldest':
            return list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        case 'price_asc':
            return list.sort((a, b) => Number(a.price_ecbt) - Number(b.price_ecbt));
        case 'price_desc':
            return list.sort((a, b) => Number(b.price_ecbt) - Number(a.price_ecbt));
        case 'title_asc':
            return list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
        case 'newest':
        default:
            return list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
}

/**
 * Paginate filtered+sorted rows. Defaults page=0, pageSize=20.
 */
export function paginateTemplates(
    rows: ReadonlyArray<MarketplaceTemplateRow>,
    page: number = 0,
    pageSize: number = 20
): BrowsePage {
    const pageNum = Number(page);
    const sizeNum = Number(pageSize);
    const safePage = Number.isFinite(pageNum) ? Math.max(0, Math.floor(pageNum)) : 0;
    const safeSize = Number.isFinite(sizeNum) && sizeNum !== 0
        ? Math.max(1, Math.min(100, Math.floor(sizeNum)))
        : 20;
    // pageSize 0 → clamp to 1 (caller explicit; treats negatives as 1 too)
    const finalSize = sizeNum === 0 ? 1 : safeSize;
    const total = rows.length;
    const start = safePage * finalSize;
    const slice = rows.slice(start, start + finalSize);
    return {
        rows: slice,
        totalMatching: total,
        totalRows: total,
        page: safePage,
        pageSize: finalSize,
        hasMore: start + finalSize < total,
    };
}

/**
 * Full pipeline: filter → sort → paginate (one-shot).
 */
export function browseTemplates(
    allRows: ReadonlyArray<MarketplaceTemplateRow> | null | undefined,
    filters: BrowseFilters = {},
    page: number = 0,
    pageSize: number = 20
): BrowsePage {
    const filtered = filterTemplates(allRows, filters);
    const sorted = sortTemplates(filtered, filters.sortBy);
    const result = paginateTemplates(sorted, page, pageSize);
    return { ...result, totalRows: Array.isArray(allRows) ? allRows.length : 0 };
}

/**
 * Build demo fixture for front-first F2.4 testing (no backend required).
 */
export function buildDemoFixture(): MarketplaceTemplateRow[] {
    const now = '2026-05-31T00:00:00.000Z';
    return [
        {
            id: 'mp-001',
            source_template_id: 'tmpl-dd38',
            author_id: 'author-001',
            author_name: 'Eng. Ana Silva',
            title: 'Custom Report DD38 CETESB',
            description: 'Relatório técnico CETESB DD 038/2017 com placeholders dinâmicos para passivo ambiental.',
            body_json: { systemPrompt: 'You are a CETESB specialist...', userPromptTemplate: 'Generate {{siteName}} report' },
            price_ecbt: 150,
            royalty_pct: 70,
            license: 'agpl-3.0',
            status: 'approved',
            approved_at: now,
            created_at: '2026-05-29T00:00:00.000Z',
            install_count: 47,
            rating_avg: 4.8,
        },
        {
            id: 'mp-002',
            source_template_id: 'tmpl-conama420',
            author_id: 'author-002',
            author_name: 'Dr. Carlos Mendes',
            title: 'Parecer CONAMA 420 Águas Subterrâneas',
            description: 'Template livre para análise de excedência CONAMA 420 em águas subterrâneas, com tabelas auto-geradas.',
            body_json: { systemPrompt: 'CONAMA 420 expert...', userPromptTemplate: 'Analyze {{exceedanceTable}}' },
            price_ecbt: 0,
            royalty_pct: 0,
            license: 'cc-by-4.0',
            status: 'approved',
            approved_at: now,
            created_at: '2026-05-30T00:00:00.000Z',
            install_count: 132,
            rating_avg: 4.5,
        },
        {
            id: 'mp-003',
            source_template_id: 'tmpl-due-diligence',
            author_id: 'author-003',
            author_name: 'Consultora Verde Ltda',
            title: 'Due Diligence Ambiental M&A',
            description: 'Relatório executivo para due diligence ambiental em fusões/aquisições, com checklist BACEN.',
            body_json: { systemPrompt: 'M&A env consultant...', userPromptTemplate: '{{siteName}} {{eisScore}}' },
            price_ecbt: 500,
            royalty_pct: 80,
            license: 'proprietary',
            status: 'approved',
            approved_at: now,
            created_at: '2026-05-31T00:00:00.000Z',
            install_count: 12,
            rating_avg: 5.0,
        },
    ];
}
