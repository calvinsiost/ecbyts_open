// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Rich Doc Ingestion — extrator pure-logic de metadados de cabeçalho/capa de relatório.
//
// Complementa os extractors existentes (proseParser.extractEntities/Regulations,
// regexAnchors.extractCASNumbers, coordinateExtractor, piiDetector) cobrindo
// a IDENTIDADE do relatório: cliente, local, documento, responsável técnico.
//
// Por que isso importa: tabelas extraídas (28/28 no fixture
// relatorio_redesenhado.pdf) só viram modelo amarrado a um lugar real quando
// associadas a CNPJ + município + protocolo + responsável. Sem isso, o usuário
// precisa preencher manualmente para cada PDF ingerido.
//
// Nenhum import de DOM/IDB/THREE — caller (UI/handler) decide o que persistir.
//
// PRIOR ART:
//   - src/app/js/core/ingestion/documents/proseParser.ts (extractEntities,
//     extractRegulations, extractSections — narrativa)
//   - src/app/js/core/ingestion/documents/regexAnchors.ts (extractCASNumbers,
//     detectDocumentLocale — químicos + idioma)
//   - src/app/js/core/ingestion/documents/piiDetector.ts (LGPD CNPJ/CPF)
//   - src/app/js/core/ingestion/documents/coordinateExtractor.ts (lat/long, UTM)
//
// SPEC: docs/specs/features/SPEC_RICH_DOC_INGESTION.md (entidade `report.metadata`)

// ===========================================================================
// Tipos
// ===========================================================================

export interface ClientInfo {
    readonly name: string | null;
    readonly cnpj: string | null;
    readonly nameConfidence: number; // 0..1
}

export interface LocationInfo {
    readonly city: string | null;
    readonly state: string | null; // UF (2 letras)
    readonly fullText: string | null; // ex: "Município01 / SP"
}

export interface DocumentInfo {
    readonly type: string | null; // "Relatório Técnico", "RAP", "RDP", etc.
    readonly title: string | null;
    readonly reference: string | null; // ex: "RT-2025-ID-0312"
    readonly revision: string | null; // ex: "00" / "1.0"
    readonly issuedAt: string | null; // "Março 2025" preservado verbatim
}

export interface ResponsibleInfo {
    readonly name: string | null;
    readonly registry: string | null; // "CREA-SP 123456" / "CRQ IV 12345"
    readonly company: string | null; // consultora
}

export interface CoordinatesInfo {
    readonly latitude: number | null; // graus decimais
    readonly longitude: number | null;
    readonly utmZone: number | null;
    readonly utmHemisphere: 'N' | 'S' | null;
    readonly utmEasting: number | null;
    readonly utmNorthing: number | null;
}

export interface ReportMetadata {
    readonly client: ClientInfo;
    readonly location: LocationInfo;
    readonly document: DocumentInfo;
    readonly responsible: ResponsibleInfo;
    readonly coordinates: CoordinatesInfo;
    readonly extractionWarnings: ReadonlyArray<string>;
}

// ===========================================================================
// Patterns
// ===========================================================================

// CNPJ formatado oficial: 00.000.000/0000-00
const CNPJ_REGEX = /\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/;

// Sufixos jurídicos brasileiros (Ltda, S.A., EIRELI, ME, EPP, S/S)
const LEGAL_SUFFIXES = ['Ltda.?', 'S\\.A\\.?', 'S/A', 'EIRELI', '\\bME\\b', '\\bEPP\\b', 'S/S'];

// Marcadores de empresa (curinga para razão social com "Indústria", "Comércio", etc.)
const COMPANY_MARKERS = [
    'Indústria',
    'Comércio',
    'Consultoria',
    'Engenharia',
    'Ambiental',
    'Serviços',
    'Participações',
    'Holding',
    'Mineração',
];

const RAZAO_SOCIAL_REGEX = new RegExp(
    `\\b([A-ZÁÉÍÓÚÂÊÔÃÕ][\\wáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ&.\\- ]{2,80})\\s+(?:${LEGAL_SUFFIXES.join('|')})\\b`,
    'g',
);

// Município / UF — duas letras maiúsculas após barra
const UF_LIST =
    'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
const CITY_UF_REGEX = new RegExp(
    `\\b([A-ZÁÉÍÓÚÂÊÔÃÕ][\\wáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]+(?:\\s[A-ZÁÉÍÓÚÂÊÔÃÕ\\wáéíóúâêôãõç]+){0,4})\\s*[\\/-]\\s*(${UF_LIST})\\b`,
);

// Protocolo / código de referência: 1-6 letras + dígitos com separadores
const REFERENCE_REGEX = /\bRef\.?\s*:?\s*([A-Z]{1,6}-?\d{2,5}(?:-[A-Z0-9]+)*)/i;

// Revisão: "Rev. 00" / "Revisão 1" / "Rev: 2.0"
const REVISION_REGEX = /\bRev(?:isão|\.?|:)?\s*(\d{1,3}(?:\.\d{1,3})?)/i;

// Datas verbatim — "Março 2025" / "03/2025" / "março/2025"
const MONTH_PT =
    'Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro';
const DATE_PT_TEXT_REGEX = new RegExp(`\\b(${MONTH_PT})\\s+(\\d{4})\\b`, 'i');
const DATE_PT_NUM_REGEX = /\b(0[1-9]|1[0-2])\s*\/\s*(\d{4})\b/;

// Tipos canônicos de relatório técnico ambiental
const REPORT_TYPE_PATTERNS = [
    { type: 'Relatório Técnico', pattern: /\bRELAT[ÓO]RIO\s+T[ÉE]CNICO\b/i },
    { type: 'Avaliação Preliminar (AP)', pattern: /\bAVALIA[ÇC][ÃA]O\s+PRELIMINAR\b/i },
    {
        type: 'Investigação Confirmatória (IC)',
        pattern: /\bINVESTIGA[ÇC][ÃA]O\s+CONFIRMAT[ÓO]RIA\b/i,
    },
    {
        type: 'Investigação Detalhada (ID)',
        pattern: /\bINVESTIGA[ÇC][ÃA]O\s+DETALHADA\b/i,
    },
    { type: 'Avaliação de Risco (AR)', pattern: /\bAVALIA[ÇC][ÃA]O\s+DE\s+RISCO\b/i },
    {
        type: 'Plano de Intervenção (PI)',
        pattern: /\bPLANO\s+DE\s+INTERVEN[ÇC][ÃA]O\b/i,
    },
    {
        type: 'Relatório de Andamento (RAR)',
        pattern: /\bRELAT[ÓO]RIO\s+DE\s+ANDAMENTO\b/i,
    },
    {
        type: 'Monitoramento Ambiental (PMA)',
        pattern: /\bMONITORAMENTO\s+AMBIENTAL\b/i,
    },
];

// CREA-UF / CRQ-Região
const REGISTRY_REGEX =
    /\b(CREA|CRQ|CAU)\s*[-:]?\s*([A-Z]{0,3})?\s*[-:]?\s*(\d{4,10})\b/i;

// Coordenadas geográficas decimais — usa lookbehind para não comer o `-`
const LATLONG_REGEX =
    /(?:^|[^\d.])(-?\d{1,2}[.,]\d{4,8})\s*[°,;\s]\s*(-?\d{1,3}[.,]\d{4,8})(?:[^\d]|$)/;

// UTM: "23K 123456 7654321" / "Zona 23K 123456 E 7654321 N"
const UTM_REGEX =
    /\b(?:Zona\s+)?(\d{1,2})\s*([KSNkns])\s+(\d{6,7})\s*[EeNn]?\s+(\d{7,8})\b/;

// ===========================================================================
// Helpers
// ===========================================================================

function safeMatch(text: string, regex: RegExp): RegExpMatchArray | null {
    if (!text || typeof text !== 'string') return null;
    try {
        return text.match(regex);
    } catch {
        return null;
    }
}

function normalizeNumberPt(s: string): number {
    // "12,3456" → 12.3456 ; mantém ponto se já decimal EN
    const t = s.trim().replace(/\./g, '_DOT_').replace(',', '.').replace(/_DOT_/g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}

// ===========================================================================
// Extractors individuais
// ===========================================================================

export function extractClient(text: string, warnings: string[]): ClientInfo {
    let name: string | null = null;
    let cnpj: string | null = null;
    let confidence = 0;

    const cnpjMatch = safeMatch(text, CNPJ_REGEX);
    if (cnpjMatch && cnpjMatch[1]) {
        cnpj = cnpjMatch[1];
        confidence += 0.35;
    }

    // Match razão social com sufixo legal — pega o primeiro distinto (geralmente o cliente)
    const allCandidates = Array.from(text.matchAll(RAZAO_SOCIAL_REGEX));
    if (allCandidates.length > 0) {
        const first = allCandidates[0]![0]!.trim();
        // Sanity: máximo 90 chars, mínimo 5
        if (first.length >= 5 && first.length <= 90) {
            name = first;
            confidence += 0.4;
        }
    }

    // Boost: se nenhum sufixo legal mas tem marker de empresa próximo a "Cliente:"/"Titularidade:"
    if (!name) {
        for (const marker of COMPANY_MARKERS) {
            const m = text.match(
                new RegExp(`\\b([A-ZÁÉÍÓÚÂÊÔÃÕ][\\wáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ.\\- ]{2,60}\\s${marker}[\\wáéíóúâêôãõç \\-]{0,40})`),
            );
            if (m && m[1]) {
                name = m[1].trim();
                confidence += 0.2;
                break;
            }
        }
    }

    if (name && cnpj) confidence = Math.min(1, confidence + 0.25);
    if (!name && !cnpj) warnings.push('client: nenhum CNPJ ou razão social identificado');

    return Object.freeze({
        name,
        cnpj,
        nameConfidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    });
}

export function extractLocation(text: string, warnings: string[]): LocationInfo {
    const m = safeMatch(text, CITY_UF_REGEX);
    if (!m || !m[1] || !m[2]) {
        warnings.push('location: padrão "Município / UF" não encontrado');
        return Object.freeze({ city: null, state: null, fullText: null });
    }
    const city = m[1].trim();
    const state = m[2].toUpperCase();
    const fullText = `${city} / ${state}`;
    return Object.freeze({ city, state, fullText });
}

export function extractDocument(text: string, warnings: string[]): DocumentInfo {
    let type: string | null = null;
    for (const { type: t, pattern } of REPORT_TYPE_PATTERNS) {
        if (pattern.test(text)) {
            type = t;
            break;
        }
    }

    // Título = trecho próximo ao tipo, capitalizado
    let title: string | null = null;
    if (type) {
        const m = text.match(/(?:RELAT[ÓO]RIO\s+T[ÉE]CNICO|AVALIA[ÇC][ÃA]O[A-Z\s]+|INVESTIGA[ÇC][ÃA]O[A-Z\s]+)\s*\n?\s*([A-ZÁÉÍÓÚÂÊÔÃÕ\s]{4,80})/i);
        if (m && m[1]) {
            const candidate = m[1].trim().replace(/\s+/g, ' ');
            if (candidate.length >= 4 && candidate.length <= 100) {
                title = candidate;
            }
        }
    }

    const refMatch = safeMatch(text, REFERENCE_REGEX);
    const reference = refMatch && refMatch[1] ? refMatch[1] : null;

    const revMatch = safeMatch(text, REVISION_REGEX);
    const revision = revMatch && revMatch[1] ? revMatch[1] : null;

    const dateTextMatch = safeMatch(text, DATE_PT_TEXT_REGEX);
    const dateNumMatch = !dateTextMatch ? safeMatch(text, DATE_PT_NUM_REGEX) : null;
    let issuedAt: string | null = null;
    if (dateTextMatch && dateTextMatch[0]) issuedAt = dateTextMatch[0].trim();
    else if (dateNumMatch && dateNumMatch[0]) issuedAt = dateNumMatch[0].trim();

    if (!type && !reference && !issuedAt) {
        warnings.push('document: nenhum tipo/referência/data identificado');
    }

    return Object.freeze({ type, title, reference, revision, issuedAt });
}

export function extractResponsible(text: string, warnings: string[]): ResponsibleInfo {
    const regMatch = safeMatch(text, REGISTRY_REGEX);
    let registry: string | null = null;
    if (regMatch) {
        const body = regMatch[1]!.toUpperCase();
        const uf = regMatch[2] ? `-${regMatch[2].toUpperCase()}` : '';
        registry = `${body}${uf} ${regMatch[3]}`.trim();
    }

    // Nome do responsável: heurística — linha precedida por "Resp." / "Responsável"
    let name: string | null = null;
    const respMatch = text.match(
        /(?:Respons[áa]vel(?:\s+T[ée]cnico)?|Eng[°ºo.]?\s*(?:Civil|Ambiental|Sanitarista|Qu[ií]mico)?)[:\s-]+([A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]+(?:\s+(?:de|da|do|dos|das|e\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]+){1,4})/,
    );
    if (respMatch && respMatch[1]) {
        const candidate = respMatch[1].trim();
        if (candidate.length >= 5 && candidate.length <= 80) name = candidate;
    }

    // Consultora: razão social diferente da do cliente, próxima a "Consultora" / "Por"
    let company: string | null = null;
    const consMatch = text.match(
        /(?:Consultora|Realizado por|Executado por|Elaborado por)\s*[:-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕ][\wáéíóúâêôãõç&.\- ]{4,80}\s+(?:Ltda\.?|S\.A\.?|S\/A|EIRELI))/,
    );
    if (consMatch && consMatch[1]) {
        company = consMatch[1].trim();
    }

    if (!name && !registry) {
        warnings.push('responsible: nenhum nome ou registro profissional identificado');
    }

    return Object.freeze({ name, registry, company });
}

export function extractCoordinates(text: string, warnings: string[]): CoordinatesInfo {
    let latitude: number | null = null;
    let longitude: number | null = null;
    let utmZone: number | null = null;
    let utmHemisphere: 'N' | 'S' | null = null;
    let utmEasting: number | null = null;
    let utmNorthing: number | null = null;

    const ll = safeMatch(text, LATLONG_REGEX);
    if (ll && ll[1] && ll[2]) {
        const lat = normalizeNumberPt(ll[1]);
        const lng = normalizeNumberPt(ll[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            latitude = lat;
            longitude = lng;
        }
    }

    const utm = safeMatch(text, UTM_REGEX);
    if (utm && utm[1] && utm[3] && utm[4]) {
        const zone = parseInt(utm[1]!, 10);
        const hemi = utm[2]!.toUpperCase() as 'N' | 'S' | 'K';
        const easting = parseInt(utm[3]!, 10);
        const northing = parseInt(utm[4]!, 10);
        if (zone >= 1 && zone <= 60 && Number.isFinite(easting) && Number.isFinite(northing)) {
            utmZone = zone;
            // Letras MGRS: K-Q geralmente S; R-Z geralmente N. Heurística simples:
            // se norte 5e6 < northing < 10e6 → S; se 0 < northing < 9.4e6 → N. Fallback: hemi letter
            if (hemi === 'N' || hemi === 'S') utmHemisphere = hemi;
            else utmHemisphere = northing > 6_000_000 ? 'S' : 'N';
            utmEasting = easting;
            utmNorthing = northing;
        }
    }

    if (
        latitude === null &&
        longitude === null &&
        utmZone === null
    ) {
        warnings.push('coordinates: nenhuma coordenada geográfica/UTM identificada');
    }

    return Object.freeze({
        latitude,
        longitude,
        utmZone,
        utmHemisphere,
        utmEasting,
        utmNorthing,
    });
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Extrai metadados de cabeçalho/capa de um relatório técnico ambiental.
 * Nunca throws — campos não identificados ficam null e geram warnings.
 *
 * @param rawText texto bruto extraído do PDF (proseParser/pdfplumber)
 */
export function extractReportMetadata(rawText: unknown): ReportMetadata {
    if (typeof rawText !== 'string' || rawText.trim() === '') {
        return Object.freeze({
            client: Object.freeze({ name: null, cnpj: null, nameConfidence: 0 }),
            location: Object.freeze({ city: null, state: null, fullText: null }),
            document: Object.freeze({
                type: null,
                title: null,
                reference: null,
                revision: null,
                issuedAt: null,
            }),
            responsible: Object.freeze({ name: null, registry: null, company: null }),
            coordinates: Object.freeze({
                latitude: null,
                longitude: null,
                utmZone: null,
                utmHemisphere: null,
                utmEasting: null,
                utmNorthing: null,
            }),
            extractionWarnings: Object.freeze(['rawText vazio ou tipo inválido']),
        });
    }

    const warnings: string[] = [];
    const text = rawText.slice(0, 50_000); // limita a 50KB para regex performance

    const client = extractClient(text, warnings);
    const location = extractLocation(text, warnings);
    const document = extractDocument(text, warnings);
    const responsible = extractResponsible(text, warnings);
    const coordinates = extractCoordinates(text, warnings);

    return Object.freeze({
        client,
        location,
        document,
        responsible,
        coordinates,
        extractionWarnings: Object.freeze(warnings),
    });
}

/** Metadata pública para auditoria. */
export const REPORT_METADATA_EXTRACTOR_META = Object.freeze({
    extractedFields: Object.freeze([
        'client.name',
        'client.cnpj',
        'location.city',
        'location.state',
        'document.type',
        'document.title',
        'document.reference',
        'document.revision',
        'document.issuedAt',
        'responsible.name',
        'responsible.registry',
        'responsible.company',
        'coordinates.latitude',
        'coordinates.longitude',
        'coordinates.utmZone',
        'coordinates.utmEasting',
        'coordinates.utmNorthing',
    ]),
    reportTypeCount: REPORT_TYPE_PATTERNS.length,
    supportedUF: Object.freeze(UF_LIST.split('|')),
    maxTextSize: 50_000,
});
