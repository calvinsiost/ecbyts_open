// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   DOCUMENT ASSESSOR — Auto-deteccao de tipo documental e mapeamento
   ================================================================

   Analisa texto de documentos ambientais (PDF/DOCX ingeridos) e
   detecta o tipo documental (EIA, CAD, laudo, etc.) usando keywords.
   Mapeia para familias ecbyts e sugere submodulos relevantes.

   V1: keyword/regex only — rapido, offline, sem LLM.
   V2 (futuro): LLM enhancement para contexto semantico.

   Referencia: SPEC_DOCUMENTATION_ASSESSMENT_AUTOCONFIG.md (ASSESS-001)
   ================================================================ */

// Logger leve - prefixo padronizado, sem dependencia de window/CONFIG.
// Em browser o handler wrapper usa createLogger; aqui, console direto.
const _P = '[DocumentAssessor]';
const log = {
    info: (...a: any[]) => console.debug(_P, ...a),
    warn: (...a: any[]) => console.warn(_P, ...a),
    error: (...a: any[]) => console.error(_P, ...a),
};

// --- Tipos documentais e seus padroes de deteccao ---
// Cada tipo tem keywords em PT e EN para deteccao bilingue.
const DOCUMENT_TYPES = {
    eia: {
        label: 'EIA/RIMA',
        keywords: [
            'estudo de impacto ambiental',
            'environmental impact assessment',
            'rima',
            'relatorio de impacto',
            'impact report',
            'eia',
            'estudo ambiental',
            'environmental study',
            'licenciamento ambiental',
            'environmental licensing',
        ],
        weight: 1.0,
    },
    cad: {
        label: 'CAD',
        keywords: [
            'cadastro de areas contaminadas',
            'contaminated areas registry',
            'area contaminada',
            'contaminated area',
            'passivo ambiental',
            'environmental liability',
            'investigacao confirmatoria',
            'confirmatory investigation',
            'avaliacao preliminar',
            'preliminary assessment',
        ],
        weight: 1.0,
    },
    lab_report: {
        label: 'Lab Report',
        keywords: [
            'laudo',
            'laudo analitico',
            'analytical report',
            'resultado analitico',
            'analytical result',
            'laboratorio',
            'laboratory',
            'certificado de analise',
            'certificate of analysis',
            'metodo analitico',
            'analytical method',
            'limite de deteccao',
            'detection limit',
        ],
        weight: 0.9,
    },
    monitoring_report: {
        label: 'Monitoring Report',
        keywords: [
            'relatorio de monitoramento',
            'monitoring report',
            'campanha de amostragem',
            'sampling campaign',
            'monitoramento ambiental',
            'environmental monitoring',
            'ponto de amostragem',
            'sampling point',
            'frequencia de monitoramento',
            'monitoring frequency',
        ],
        weight: 0.9,
    },
    remediation_plan: {
        label: 'Remediation Plan',
        keywords: [
            'plano de remediacao',
            'remediation plan',
            'plano de intervencao',
            'intervention plan',
            'sistema de remediacao',
            'remediation system',
            'bioremediacao',
            'bioremediation',
            'pump and treat',
            'extracao de vapores',
            'soil vapor extraction',
            'sve',
            'barreira reativa',
            'reactive barrier',
            'prb',
        ],
        weight: 1.0,
    },
    pgr: {
        label: 'PGR/PGRSS',
        keywords: [
            'plano de gerenciamento de residuos',
            'waste management plan',
            'pgrss',
            'pgr',
            'residuos solidos',
            'solid waste',
            'gerenciamento de residuos',
            'waste management',
            'classificacao de residuos',
            'waste classification',
        ],
        weight: 0.8,
    },
};

// --- Mapeamento tipo documental -> familias ---
const TYPE_TO_FAMILIES = {
    eia: ['boundary', 'well', 'plume', 'building', 'remediation'],
    cad: ['well', 'plume', 'tank', 'boundary'],
    lab_report: ['well'],
    monitoring_report: ['well', 'lake', 'river'],
    remediation_plan: ['remediation', 'well', 'plume'],
    pgr: ['boundary', 'building'],
};

// --- Submodulos recomendados por familia ---
const FAMILY_SUBMODULES = {
    well: ['well-profile'],
    remediation: ['remediation-operational-pipeline'],
};

// --- Parametros ambientais detectaveis ---
// Agrupados por categoria para deteccao eficiente.
const PARAMETER_PATTERNS = {
    btex: {
        label: 'BTEX',
        pattern: /\b(btex|benzeno|tolueno|etilbenzeno|xileno|benzene|toluene|ethylbenzene|xylene)\b/i,
    },
    metals: {
        label: 'Heavy Metals',
        pattern:
            /\b(metais pesados|heavy metals|chumbo|lead|cadmio|cadmium|mercurio|mercury|arsenio|arsenic|cromo|chromium|niquel|nickel|zinco|zinc)\b/i,
    },
    vocs: {
        label: 'VOCs',
        pattern:
            /\b(cov|voc|compostos organicos volateis|volatile organic compounds|tricloroetileno|tce|percloroetileno|pce|cloreto de vinila|vinyl chloride)\b/i,
    },
    pahs: {
        label: 'PAHs',
        pattern:
            /\b(pah|hpa|hidrocarbonetos policiclicos aromaticos|polycyclic aromatic hydrocarbons|naftaleno|naphthalene|benzo\[a\]pireno|benzo\(a\)pyrene)\b/i,
    },
    tph: {
        label: 'TPH',
        pattern:
            /\b(tph|hidrocarbonetos totais de petroleo|total petroleum hydrocarbons|diesel|gasolina|gasoline|querosene|kerosene)\b/i,
    },
    nutrients: {
        label: 'Nutrients',
        pattern:
            /\b(nitrogenio|nitrogen|fosforo|phosphorus|nitrato|nitrate|nitrito|nitrite|amonia|ammonia|fosfato|phosphate)\b/i,
    },
    microbiological: {
        label: 'Microbiological',
        pattern:
            /\b(coliformes|coliforms|e\.\s*coli|escherichia|enterococos|enterococci|contagem bacteriana|bacterial count)\b/i,
    },
    pesticides: {
        label: 'Pesticides',
        pattern:
            /\b(pesticida|pesticide|agrotóxico|herbicida|herbicide|inseticida|insecticide|fungicida|fungicide|organoclorado|organochlorine)\b/i,
    },
};

/**
 * Detecta o tipo de documento com base em keywords no texto.
 * Retorna o tipo com maior score de confianca.
 * @param {string} text - Texto do documento (plain text)
 * @returns {{ type: string, label: string, confidence: number }}
 */
export function detectDocumentType(text: string): { type: string, label: string, confidence: number } {
    if (!text || typeof text !== 'string') {
        return { type: 'unknown', label: 'Unknown', confidence: 0 };
    }

    const lower = text.toLowerCase();
    let bestType = 'unknown';
    let bestScore = 0;
    let bestLabel = 'Unknown';

    for (const [type, def] of Object.entries(DOCUMENT_TYPES)) {
        const hits = def.keywords.filter((kw) => lower.includes(kw)).length;
        const score = (hits / def.keywords.length) * def.weight;
        if (score > bestScore) {
            bestScore = score;
            bestType = type;
            bestLabel = def.label;
        }
    }

    // Confianca minima de 0.1 para considerar valido
    if (bestScore < 0.1) {
        return { type: 'unknown', label: 'Unknown', confidence: 0 };
    }

    const confidence = Math.min(bestScore * 2, 0.99);
    return { type: bestType, label: bestLabel, confidence: parseFloat(confidence.toFixed(2)) };
}

/**
 * Mapeia um tipo de documento para familias ecbyts relevantes.
 * @param {string} documentType - Tipo detectado (eia, cad, lab_report, etc.)
 * @returns {string[]} Lista de IDs de familias recomendadas
 */
export function mapToFamilies(documentType: string): string[] {
    return (TYPE_TO_FAMILIES as Record<string, any>)[documentType] || [];
}

/**
 * Sugere submodulos para cada familia listada.
 * @param {string[]} families - Lista de IDs de familias
 * @returns {{ family: string, submodules: string[] }[]}
 */
export function suggestSubmodules(families: string[]): { family: string, submodules: string[] }[] {
    if (!Array.isArray(families)) return [];
    return families
        .filter((f) => (FAMILY_SUBMODULES as Record<string, any>)[f])
        .map((f) => ({ family: f, submodules: [...(FAMILY_SUBMODULES as Record<string, any>)[f]] }));
}

/**
 * Extrai parametros ambientais mencionados no texto.
 * @param {string} text - Texto do documento
 * @returns {{ id: string, label: string }[]}
 */
export function extractKeyParameters(text: string): { id: string, label: string }[] {
    if (!text || typeof text !== 'string') return [];

    const found = [];
    for (const [id, def] of Object.entries(PARAMETER_PATTERNS)) {
        if (def.pattern.test(text)) {
            found.push({ id, label: def.label });
        }
    }
    return found;
}

/**
 * Analise completa de documento: tipo, familias, submodulos, parametros.
 * Ponto de entrada principal do assessor (V1).
 * @param {string} text - Texto do documento (extraido de PDF/DOCX)
 * @param {object} [_options] - Opcoes futuras (idioma, modo LLM, etc.)
 * @returns {{
 *   documentType: { type: string, label: string, confidence: number },
 *   recommendedFamilies: string[],
 *   recommendedSubmodules: { family: string, submodules: string[] }[],
 *   detectedParameters: { id: string, label: string }[]
 * }}
 */
export function assessDocument(text: string, _options: object = {}): { documentType: { type: string, label: string, confidence: number }, recommendedFamilies: string[], recommendedSubmodules: { family: string, submodules: string[] }[], detectedParameters: { id: string, label: string }[] } {
    log.info('Starting document assessment');

    const documentType = detectDocumentType(text);
    const recommendedFamilies = mapToFamilies(documentType.type);
    const recommendedSubmodules = suggestSubmodules(recommendedFamilies);
    const detectedParameters = extractKeyParameters(text);

    log.info(`Detected type: ${documentType.label} (${documentType.confidence})`);
    log.info(`Families: ${recommendedFamilies.join(', ') || 'none'}`);
    log.info(`Parameters: ${detectedParameters.map((p) => p.label).join(', ') || 'none'}`);

    return {
        documentType,
        recommendedFamilies,
        recommendedSubmodules,
        detectedParameters,
    };
}

// ================================================================
// V2 - DocumentAssessmentEngine (ASSESS-001)
// ================================================================

const LANGUAGE_MARKERS = {
    'pt-BR': {
        keywords: [
            'poço',
            'monitoramento',
            'piezômetro',
            'amostragem',
            'água subterrânea',
            'contaminação',
            'laudo',
            'relatório',
            'estudo de impacto ambiental',
            'plano de gerenciamento',
        ],
        weight: 1.0,
    },
    'en-US': {
        keywords: [
            'well',
            'monitoring',
            'piezometer',
            'sampling',
            'groundwater',
            'contamination',
            'report',
            'environmental impact assessment',
            'waste management plan',
        ],
        weight: 1.0,
    },
    es: {
        keywords: [
            'pozo',
            'monitoreo',
            'piezómetro',
            'muestreo',
            'agua subterránea',
            'contaminación',
            'informe',
            'estudio de impacto ambiental',
            'plan de gestión',
        ],
        weight: 1.0,
    },
};

const GAP_KEYWORDS = [
    { keyword: 'barragem', aliases: ['barragem', 'dam', 'presa'] },
    { keyword: 'torre de resfriamento', aliases: ['torre de resfriamento', 'cooling tower', 'torre de refrigeración'] },
    { keyword: 'linha de transmissão', aliases: ['linha de transmissão', 'transmission line', 'línea de transmisión'] },
    { keyword: 'poste', aliases: ['poste', 'pole', 'poste elétrico'] },
    { keyword: 'cercamento', aliases: ['cercamento', 'fence', 'cerco'] },
];

const FAMILY_MATCHERS = new Map([
    [
        'well',
        {
            keywords: [
                'poço',
                'monitoramento',
                'piezômetro',
                'amostragem',
                'água subterrânea',
                'well',
                'monitoring',
                'piezometer',
                'sampling',
                'groundwater',
                'pozo',
                'monitoreo',
                'piezómetro',
                'muestreo',
            ],
            patterns: [
                /poço\s+(de\s+)?monitoramento/gi,
                /piezômetro/gi,
                /\bpoço\b/gi,
                /\bwell\b/gi,
                /\bpiezometer/gi,
                /pozo\s+(de\s+)?monitoreo/gi,
                /piezómetro/gi,
            ],
            score: 0.95,
            submodule: 'well-profile',
        },
    ],
    [
        'tank',
        {
            keywords: [
                'tanque',
                'armazenamento',
                'diesel',
                'gasolina',
                'combustível',
                'tank',
                'storage',
                'kerosene',
                'tanque',
                'almacenamiento',
                'gasolina',
                'combustible',
            ],
            patterns: [
                /tanque\s+(de\s+)?(diesel|gasolina|armazenamento)/gi,
                /\btank\s+(of\s+)?(diesel|gasoline|storage)/gi,
                /tanque\s+(de\s+)?(almacenamiento|gasolina|diesel)/gi,
            ],
            score: 0.9,
            submodule: null,
        },
    ],
    [
        'plume',
        {
            keywords: [
                'pluma',
                'contaminação',
                'BTEX',
                'hidrocarboneto',
                'área impactada',
                'plume',
                'contamination',
                'hydrocarbon',
                'impacted area',
                'pluma',
                'contaminación',
                'hidrocarburo',
                'área impactada',
            ],
            patterns: [
                /pluma\s+(de\s+)?contaminação/gi,
                /\bBTEX\b/gi,
                /\bplume\b/gi,
                /\bcontamination\s+plume/gi,
                /pluma\s+(de\s+)?contaminación/gi,
            ],
            score: 0.88,
            submodule: null,
        },
    ],
    [
        'building',
        {
            keywords: [
                'edifício',
                'prédio',
                'sala',
                'galpão',
                'administração',
                'escritório',
                'building',
                'office',
                'warehouse',
                'edificio',
                'predio',
                'sala',
                'galpón',
                'administración',
                'oficina',
            ],
            patterns: [
                /edifício\s+(administrativo|industrial)/gi,
                /\bprédio\b/gi,
                /\bbuilding\b/gi,
                /\boffice\s+building/gi,
                /edificio\s+(administrativo|industrial)/gi,
                /\bpredio\b/gi,
            ],
            score: 0.85,
            submodule: null,
        },
    ],
    [
        'lake',
        {
            keywords: [
                'lago',
                'reservatório',
                "espelho d'água",
                'barragem de contenção',
                'lake',
                'reservoir',
                'lago',
                'reservorio',
                'espejo de agua',
            ],
            patterns: [
                /lago\s+(de\s+)?contenção/gi,
                /\breservatório\b/gi,
                /\blake\b/gi,
                /\breservoir\b/gi,
                /lago\s+(de\s+)?contención/gi,
                /\breservorio\b/gi,
            ],
            score: 0.9,
            submodule: null,
        },
    ],
    [
        'river',
        {
            keywords: [
                'rio',
                'córrego',
                'drenagem',
                "curso d'água",
                'ribeirão',
                'river',
                'stream',
                'drainage',
                'watercourse',
                'río',
                'arroyo',
                'drenaje',
                'curso de agua',
            ],
            patterns: [/rio\s+\w+/gi, /\bcórrego\b/gi, /\briver\b/gi, /\bstream\b/gi, /río\s+\w+/gi, /\barroyo\b/gi],
            score: 0.88,
            submodule: null,
        },
    ],
    [
        'spring',
        {
            keywords: [
                'nascente',
                "olho d'água",
                'fonte',
                "mina d'água",
                'spring',
                'water source',
                'manantial',
                'ojo de agua',
                'fuente',
            ],
            patterns: [
                /\bnascente\b/gi,
                /olho\s+d'água/gi,
                /\bspring\b/gi,
                /\bwater\s+spring/gi,
                /\bmanantial\b/gi,
                /ojo\s+de\s+agua/gi,
            ],
            score: 0.88,
            submodule: null,
        },
    ],
    [
        'boundary',
        {
            keywords: [
                'limite',
                'fronteira',
                ' perímetro',
                'área do terreno',
                'boundary',
                'perimeter',
                'property line',
                'límite',
                'frontera',
                'perímetro',
                'área del terreno',
            ],
            patterns: [
                /limite\s+(da\s+)?(propriedade|área)/gi,
                /\bperímetro\b/gi,
                /\bboundary\b/gi,
                /\bproperty\s+line/gi,
                /límite\s+(de\s+la\s+)?(propiedad|área)/gi,
                /\bperímetro\b/gi,
            ],
            score: 0.8,
            submodule: null,
        },
    ],
    [
        'waste_stream',
        {
            keywords: [
                'resíduo',
                'efluente',
                'lixo',
                'descarte',
                'resíduo sólido',
                'waste',
                'effluent',
                'solid waste',
                'residuo',
                'efluente',
                'basura',
                'descarte',
                'residuo sólido',
            ],
            patterns: [
                /resíduo\s+(sólido|líquido)/gi,
                /\befluente\b/gi,
                /\bwaste\s+(stream|solid)/gi,
                /\beffluent\b/gi,
                /residuo\s+(sólido|líquido)/gi,
                /\befluente\b/gi,
            ],
            score: 0.75,
            submodule: null,
        },
    ],
    [
        'remediation',
        {
            keywords: [
                'remediação',
                'tratamento',
                'SVE',
                'bioremediação',
                'pump and treat',
                'remediation',
                'treatment',
                'bioremediation',
                'remediación',
                'tratamiento',
                'bombeo y tratamiento',
            ],
            patterns: [
                /sistema\s+(de\s+)?remediação/gi,
                /\bbioremediação\b/gi,
                /pump\s+and\s+treat/gi,
                /\bremediation\s+system/gi,
                /\bbioremediation\b/gi,
                /sistema\s+(de\s+)?remediación/gi,
                /\bbioremediación\b/gi,
            ],
            score: 0.85,
            submodule: 'remediation-operational-pipeline',
        },
    ],
]);

/**
 * Detecta idioma do texto com base em markers regionais.
 * @param {string} text
 * @returns {{ locale: string, confidence: number }}
 */
export function detectLanguage(text: string): { locale: string, confidence: number } {
    if (!text || typeof text !== 'string') {
        return { locale: 'en-US', confidence: 0 };
    }
    const lower = text.toLowerCase();
    let bestLocale = 'en-US';
    let bestScore = 0;

    for (const [locale, def] of Object.entries(LANGUAGE_MARKERS)) {
        const hits = def.keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
        const score = (hits / def.keywords.length) * def.weight;
        if (score > bestScore) {
            bestScore = score;
            bestLocale = locale;
        }
    }

    return { locale: bestLocale, confidence: parseFloat(Math.min(bestScore * 3, 0.99).toFixed(2)) };
}

/**
 * Detecta menções a elementos/famílias não mapeadas no sistema.
 * @param {string} text
 * @returns {{ keyword: string, count: number, reason: string }[]}
 */
export function detectGaps(text: string): { keyword: string, count: number, reason: string }[] {
    if (!text || typeof text !== 'string') return [];
    const lower = text.toLowerCase();
    const gaps = [];

    for (const gap of GAP_KEYWORDS) {
        let totalCount = 0;
        for (const alias of gap.aliases) {
            const matches = lower.match(new RegExp(`\\b${alias}\\b`, 'gi'));
            if (matches) totalCount += matches.length;
        }
        if (totalCount > 2) {
            gaps.push({ keyword: gap.keyword, count: totalCount, reason: 'Família não existe no sistema' });
        }
    }

    return gaps;
}

/**
 * Resolve conflitos entre recomendações de famílias.
 * Desduplica e prioriza famílias com maior confiança.
 * @param {Array<{familyId: string, confidence: number}>} recommendations
 * @returns {Array<{familyId: string, confidence: number}>}
 */
export function resolveConflicts(recommendations: Array<{familyId: string, confidence: number}>): Array<{familyId: string, confidence: number}> {
    if (!Array.isArray(recommendations)) return [];
    const map = new Map();
    for (const rec of recommendations) {
        const existing = map.get(rec.familyId);
        if (!existing || rec.confidence > existing.confidence) {
            map.set(rec.familyId, rec);
        }
    }
    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Engine de análise de documentos por família (V2).
 */
export class DocumentAssessmentEngine {
    familyMatchers: typeof FAMILY_MATCHERS;
    constructor() {
        this.familyMatchers = FAMILY_MATCHERS;
    }

    /**
     * Analisa texto e retorna recomendações de famílias, gaps e idioma.
     * @param {string} text
     * @returns {{
     *   documentType: { type: string, label: string, confidence: number },
     *   language: { locale: string, confidence: number },
     *   recommendations: { familyId: string, confidence: number, instances: number, contexts: string[], submodule: string|null }[],
     *   gaps: { keyword: string, count: number, reason: string }[],
     *   detectedParameters: { id: string, label: string }[]
     * }}
     */
    analyzeDocument(text: any) {
        const documentType = detectDocumentType(text);
        const language = detectLanguage(text);
        const detectedParameters = extractKeyParameters(text);
                const recommendations: any[]= [];

        if (text && typeof text === 'string') {
            const lower = text.toLowerCase();

            for (const [familyId, matcher] of this.familyMatchers) {
                const matches = this._findMatches(lower, text, matcher);
                if (matches.count > 0) {
                    recommendations.push({
                        familyId,
                        confidence: Math.min(matches.score * matcher.score, 0.99),
                        instances: matches.count,
                        contexts: matches.contexts.slice(0, 3),
                        submodule: matcher.submodule || null,
                    });
                }
            }
        }

        const resolved = resolveConflicts(recommendations);
        const gaps = detectGaps(text);

        return {
            documentType,
            language,
            recommendations: (resolved as any),
            gaps,
            detectedParameters,
        };
    }

    _findMatches(lower: any, originalText: any, matcher: any) {
        let count = 0;
        const contexts = [];

        // Keyword hits
        for (const kw of matcher.keywords) {
            const regex = new RegExp(`\\b${kw}\\b`, 'gi');
            const hits = (lower.match(regex) || []).length;
            count += hits;
        }

        // Pattern hits
        for (const pattern of matcher.patterns) {
            const hits = (originalText.match(pattern) || []).length;
            count += hits;
        }

        // Extract contexts (up to 3)
        const sentences = originalText.split(/[.!?\n]+/).filter((s: any) => s.trim().length > 10);
        for (const sentence of sentences) {
            const sentLower = sentence.toLowerCase();
            const hasKeyword = matcher.keywords.some((kw: any) => sentLower.includes(kw.toLowerCase()));
            const hasPattern = matcher.patterns.some((p: any) => p.test(sentence));
            if ((hasKeyword || hasPattern) && contexts.length < 3) {
                contexts.push(sentence.trim().replace(/\s+/g, ' '));
            }
            if (contexts.length >= 3) break;
        }

        const keywordScore = Math.min(count / 3, 1.0);
        const patternScore =
            matcher.patterns.length > 0
                ? Math.min(
                      matcher.patterns.filter((p: any) => p.test(originalText)).length /
                          Math.max(matcher.patterns.length * 0.5, 1),
                      1.0,
                  )
                : 0.5;
        const score = Math.max(keywordScore, patternScore);

        return { count, score, contexts };
    }
}

/**
 * Ponto de entrada V2 para assessment.
 * @param {string} text
 * @param {object} [_options]
 */
export function assessDocumentV2(text: string, _options: object = {}) {
    const engine = new DocumentAssessmentEngine();
    return engine.analyzeDocument(text);
}
