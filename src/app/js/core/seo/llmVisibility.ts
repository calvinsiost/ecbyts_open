// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LLM VISIBILITY — SPEC_STRATEGY_LLM_VISIBILITY (STRATEGY-001)

   Pure helpers para Generative Engine Optimization (GEO):
   - Schema.org JSON-LD builders (Organization/SoftwareApplication/TechArticle) §Q3
   - robots.txt LLM crawler policies §Pilar 2.2
   - sitemap.xml generator
   - Visibility audit (checa presença de markup)

   IMPORTANTE: NUNCA incluir dados pessoais (nome, relationship, etc.) em
   source — Schema.org.founder deve ser injetado em build/deploy time.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Q3
// ──────────────────────────────────────────────────────────────────────

export const SCHEMA_CONTEXT = 'https://schema.org';

// Tipos Schema.org usados pelo ecbyts
export const SCHEMA_TYPES = Object.freeze([
    'Organization',
    'Person',
    'SoftwareApplication',
    'TechArticle',
    'WebSite',
    'FAQPage',
]);

// LLM crawlers que devem ter acesso permitido §Pilar 2.2
export const LLM_CRAWLERS = Object.freeze([
    'GPTBot', // OpenAI
    'ChatGPT-User', // OpenAI user-initiated
    'ClaudeBot', // Anthropic
    'Claude-Web', // Anthropic web
    'Google-Extended', // Google Gemini training
    'CCBot', // Common Crawl
    'PerplexityBot', // Perplexity
    'anthropic-ai', // Anthropic web crawler
    'Bytespider', // ByteDance
    'Amazonbot', // Amazon
]);

// Domínios de expertise declarados ao schema.org §Q2/Q3
export const KNOWN_ABOUT = Object.freeze([
    'Environmental Digital Twins',
    'Blockchain for Environmental Compliance',
    'Kriging Interpolation',
    'Occupational Health Monitoring',
    'Environmental Data Interpolation',
    'Remediation Site Modeling',
    'CONAMA Compliance Assessment',
    'EIS Environmental Integrity Score',
]);

// ──────────────────────────────────────────────────────────────────────
// Schema.org JSON-LD builders §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * @param opts
 * @returns JSON-LD Organization
 */
export function buildOrganizationSchema(opts: { url?: any; description?: any; founder?: any } = {}): any {
    const out: any = {
        '@context': SCHEMA_CONTEXT,
        '@type': 'Organization',
        name: 'ecbyts',
        url: opts.url || 'https://ecbyts.com',
        description: opts.description || 'Digital Twin platform for environmental and occupational data',
        knowsAbout: [...KNOWN_ABOUT],
    };
    if (opts.founder && typeof opts.founder === 'object') {
        out.founder = {
            '@type': 'Person',
            ...opts.founder, // injetado externamente — nunca hardcoded
        };
    }
    return out;
}

/**
 * @param opts
 * @returns JSON-LD SoftwareApplication
 */
export function buildSoftwareApplicationSchema(opts: { url?: any; version?: any; description?: any } = {}): any {
    return {
        '@context': SCHEMA_CONTEXT,
        '@type': 'SoftwareApplication',
        name: 'ecbyts',
        applicationCategory: 'ScientificApplication',
        applicationSubCategory: 'EnvironmentalSoftware',
        operatingSystem: 'Web Browser (Chrome 90+, Firefox 88+, Safari 14+)',
        url: opts.url || 'https://ecbyts.com',
        softwareVersion: opts.version || '0.0.0',
        description: opts.description || 'Browser-first 3D environmental digital twin',
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'BRL',
        },
    };
}

/**
 * @param meta
 * @returns
 */
export function buildTechArticleSchema(meta: {
    headline: any;
    url: any;
    datePublished?: any;
    author?: any;
    articleBody?: any;
    keywords?: any;
}): any | null {
    if (!meta || !meta.headline || !meta.url) return null;
    const out: any = {
        '@context': SCHEMA_CONTEXT,
        '@type': 'TechArticle',
        headline: meta.headline,
        url: meta.url,
        datePublished: meta.datePublished || new Date().toISOString(),
    };
    if (meta.author && typeof meta.author === 'object') {
        out.author = { '@type': 'Person', ...meta.author };
    }
    if (meta.articleBody) out.articleBody = meta.articleBody;
    if (meta.keywords) out.keywords = meta.keywords;
    return out;
}

/**
 * Valida shape mínimo de JSON-LD.
 * @param schema
 * @returns
 */
export function validateSchema(schema: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!schema || typeof schema !== 'object') {
        return { valid: false, errors: ['not object'] };
    }
    if (schema['@context'] !== SCHEMA_CONTEXT) {
        errors.push(`@context must be ${SCHEMA_CONTEXT}`);
    }
    if (!schema['@type']) {
        errors.push('@type required');
    } else if (!SCHEMA_TYPES.includes(schema['@type'])) {
        errors.push(`@type must be one of: ${SCHEMA_TYPES.join(', ')}`);
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// robots.txt for LLM crawlers §Pilar 2.2
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói robots.txt permitindo todos os LLM crawlers.
 * @param crawlers
 * @returns
 */
export function buildRobotsTxt(crawlers: readonly string[] = LLM_CRAWLERS as readonly string[]): string {
    const list = Array.isArray(crawlers) && crawlers.length > 0 ? crawlers : LLM_CRAWLERS;
    const lines: string[] = [];
    for (const c of list) {
        if (typeof c !== 'string') continue;
        lines.push(`User-agent: ${c}`);
        lines.push('Allow: /');
        lines.push('');
    }
    // Default allow
    lines.push('User-agent: *');
    lines.push('Allow: /');
    lines.push('');
    lines.push('Sitemap: https://ecbyts.com/sitemap.xml');
    return lines.join('\n');
}

/**
 * Verifica quais LLM crawlers estão permitidos em um robots.txt existente.
 * @param robotsText
 * @returns
 */
export function auditRobotsTxt(robotsText: string): {
    allowed: Array<string>;
    blocked: Array<string>;
    missing: Array<string>;
} {
    const result: { allowed: string[]; blocked: string[]; missing: string[] } = {
        allowed: [],
        blocked: [],
        missing: [],
    };
    if (typeof robotsText !== 'string') {
        result.missing = [...LLM_CRAWLERS];
        return result;
    }
    for (const crawler of LLM_CRAWLERS) {
        const re = new RegExp(`User-agent:\\s*${crawler}`, 'i');
        if (!re.test(robotsText)) {
            result.missing.push(crawler);
            continue;
        }
        // Procura bloco depois do User-agent
        const blockRe = new RegExp(`User-agent:\\s*${crawler}[\\s\\S]*?(?=User-agent:|$)`, 'i');
        const block = robotsText.match(blockRe)?.[0] || '';
        if (/Disallow:\s*\//.test(block) && !/Allow:\s*\//.test(block)) {
            result.blocked.push(crawler);
        } else {
            result.allowed.push(crawler);
        }
    }
    return result;
}

// ──────────────────────────────────────────────────────────────────────
// Sitemap XML generator
// ──────────────────────────────────────────────────────────────────────

/**
 * @param urls
 * @returns sitemap.xml
 */
export function buildSitemapXml(
    urls: Array<{ loc: any; lastmod?: any; changefreq?: any; priority?: any }>
): string {
    if (!Array.isArray(urls)) urls = [];
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ];
    for (const u of urls) {
        if (!u || typeof u.loc !== 'string') continue;
        lines.push('  <url>');
        lines.push(`    <loc>${_escapeXml(u.loc)}</loc>`);
        if (u.lastmod) lines.push(`    <lastmod>${u.lastmod}</lastmod>`);
        if (u.changefreq) lines.push(`    <changefreq>${u.changefreq}</changefreq>`);
        if (Number.isFinite(u.priority)) {
            const p = Math.max(0, Math.min(1, u.priority));
            lines.push(`    <priority>${p.toFixed(1)}</priority>`);
        }
        lines.push('  </url>');
    }
    lines.push('</urlset>');
    return lines.join('\n');
}

function _escapeXml(str: any): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ──────────────────────────────────────────────────────────────────────
// Visibility audit
// ──────────────────────────────────────────────────────────────────────

/**
 * Checa presença de markup LLM-friendly numa HTML string.
 * @param html
 * @returns
 */
export function auditHtmlVisibility(html: string): {
    hasJsonLd: boolean;
    hasOrganization: boolean;
    hasSoftwareApp: boolean;
    hasTechArticle: boolean;
    hasSitemap: boolean;
    hasOgTags: boolean;
    score: number;
} {
    const out = {
        hasJsonLd: false,
        hasOrganization: false,
        hasSoftwareApp: false,
        hasTechArticle: false,
        hasSitemap: false,
        hasOgTags: false,
        score: 0,
    };
    if (typeof html !== 'string') return out;

    out.hasJsonLd = /<script[^>]*type=['"]application\/ld\+json['"]/i.test(html);
    out.hasOrganization = /"@type"\s*:\s*"Organization"/i.test(html);
    out.hasSoftwareApp = /"@type"\s*:\s*"SoftwareApplication"/i.test(html);
    out.hasTechArticle = /"@type"\s*:\s*"TechArticle"/i.test(html);
    out.hasSitemap = /sitemap\.xml/i.test(html);
    out.hasOgTags = /<meta\s+property=['"]og:/i.test(html);

    // Score 0..10
    let score = 0;
    if (out.hasJsonLd) score += 3;
    if (out.hasOrganization) score += 2;
    if (out.hasSoftwareApp) score += 2;
    if (out.hasTechArticle) score += 1;
    if (out.hasSitemap) score += 1;
    if (out.hasOgTags) score += 1;
    out.score = score;

    return out;
}
