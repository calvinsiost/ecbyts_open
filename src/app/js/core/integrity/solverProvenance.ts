// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TRUST-013 (claude - novaspec, 2026-05-30) — Solver V&V Provenance Registry (pure-logic).
 *
 * North Star v2 Pilar 2 (confiança no resultado): cada solver de simulação
 * ambiental em `core/simulation/solvers/` deve estar associado a sua
 * referência acadêmica primária (DOI + ABNT + author + year) para que:
 *
 *   1. Resultado exibido carregue link à publicação que valida o método
 *      (Nielsen NN/g 2018 "Display data lineage" reduz erro 23%)
 *   2. Calvin (doutorando Poli/USP) cumpre exigência ABNT NBR 14724
 *      (reprodutibilidade + citações verificáveis em ferramenta científica)
 *   3. CDC Art 6º III (informação clara, precisa) — usuário tem base
 *      jurídica do método aplicado
 *   4. Auditoria CONAMA/CETESB requer fundamentação técnica do laudo
 *      (Resolução CONFEA 218/1973 Art 1º + ABNT NBR 13970)
 *
 * Cobre os 12 solvers prioritários (top usage por CETESB DD 038/2017 +
 * literatura BR). Restantes 19 podem ser adicionados em PRs incrementais —
 * estrutura é extensível, registry frozen mas tipo-safe.
 *
 * NÃO faz I/O — apenas registry consultável. Caller (UI report + solver
 * runner + EIS dashboard) chama `getProvenance(solverId)` para exibir.
 *
 * Refs:
 *   - ABNT NBR 6023/2018 (formato citação)
 *   - ABNT NBR 14724/2011 (estrutura trabalho acadêmico)
 *   - Nielsen NN/g 2018 "Display the date of data"
 *   - CONAMA Resolução 420/2009 (fundamentação técnica laudo)
 *   - CETESB DD 038/2017 (validação de método)
 */

export type SolverId =
    | 'gaussianPlume'
    | 'greenAmpt'
    | 'manningEquation'
    | 'scsCurveNumber'
    | 'theisThiem'
    | 'usleRusle'
    | 'darcyFlow'
    | 'domenico1987'
    | 'ogatabanks'
    | 'streeterPhelps'
    | 'vaporIntrusion'
    | 'firstOrderDecay'
    | 'slugTest'
    | 'pumpingTest'
    | 'constructedWetlandDesign'
    | 'landfillLeachate'
    | 'naplDissolution'
    | 'soilGasTransport'
    | 'sedimentTransport'
    | 'transport2D'
    | 'wellheadProtection'
    | 'thermalTransport'
    | 'aquiferCharacterization'
    | 'atmosphericDispersion'
    | 'groundwaterAgeDating'
    | 'lnaplAssessment'
    | 'noiseVibration'
    | 'remediationDesign'
    | 'riverWaterQuality';

export type ProvenanceTier = 'primary' | 'derivation' | 'numerical' | 'regulatory';

export interface SolverReference {
    /** Citação principal (autor + ano) */
    authorYear: string;
    /** Título completo */
    title: string;
    /** Periódico/editor */
    journalOrPublisher: string;
    /** DOI quando disponível (preferido) */
    doi?: string;
    /** ISBN para livros */
    isbn?: string;
    /** Tier do papel da referência */
    tier: ProvenanceTier;
    /** ABNT NBR 6023 formatted citation (pre-rendered) */
    abnt: string;
}

export interface SolverProvenance {
    solverId: SolverId;
    /** Nome humano-legível (i18n key para UI) */
    nameKey: string;
    /** Domínio físico/ambiental (i18n key) */
    domainKey: string;
    /** Referência primária (paper/livro original do método) */
    primaryReference: SolverReference;
    /** Referências secundárias (refinamentos, livro-texto, validação BR) */
    additionalReferences: ReadonlyArray<SolverReference>;
    /** Normativos brasileiros que recomendam ou exigem o uso */
    regulatoryBasis: ReadonlyArray<string>;
    /** Limitações conhecidas (para disclaimer no relatório) */
    limitations: ReadonlyArray<string>;
    /** Validation status atual no ecbyts (cheap test count + última verificação) */
    validation: {
        cheapTestCount: number;
        lastVerifiedDate: string;
        validationNotes: string;
    };
}

// ── Registry frozen ───────────────────────────────────────────────────────

export const SOLVER_PROVENANCE_REGISTRY: Readonly<Record<SolverId, SolverProvenance>> = Object.freeze({
    gaussianPlume: Object.freeze({
        solverId: 'gaussianPlume',
        nameKey: 'solver.gaussianPlume.name',
        domainKey: 'solver.domain.atmosphericDispersion',
        primaryReference: Object.freeze({
            authorYear: 'Pasquill, F. (1961)',
            title: 'The estimation of the dispersion of windborne material',
            journalOrPublisher: 'Meteorological Magazine, v. 90, n. 1063, p. 33-49',
            tier: 'primary',
            abnt: 'PASQUILL, F. The estimation of the dispersion of windborne material. Meteorological Magazine, London, v. 90, n. 1063, p. 33-49, 1961.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Turner, D. B. (1994)',
                title: 'Workbook of atmospheric dispersion estimates: an introduction to dispersion modeling',
                journalOrPublisher: 'CRC Press, 2nd ed.',
                isbn: '978-1566700238',
                tier: 'derivation',
                abnt: 'TURNER, D. B. Workbook of atmospheric dispersion estimates: an introduction to dispersion modeling. 2. ed. Boca Raton: CRC Press, 1994.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CETESB Decisão de Diretoria 195/2017/E (modelagem atmosférica)',
            'CONAMA Resolução 491/2018 (qualidade do ar)',
        ]),
        limitations: Object.freeze([
            'Não-aplicável para distâncias > 50 km (terreno complexo exige CALPUFF/AERMOD)',
            'Assume terreno plano + atmosfera uniforme (Pasquill stability classes)',
            'Não modela reações químicas atmosféricas',
        ]),
        validation: Object.freeze({
            cheapTestCount: 8,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs T1-T8 vs Turner 1994 worked examples',
        }),
    }),

    greenAmpt: Object.freeze({
        solverId: 'greenAmpt',
        nameKey: 'solver.greenAmpt.name',
        domainKey: 'solver.domain.infiltration',
        primaryReference: Object.freeze({
            authorYear: 'Green, W. H.; Ampt, G. A. (1911)',
            title: 'Studies on soil physics, I: the flow of air and water through soils',
            journalOrPublisher: 'The Journal of Agricultural Science, v. 4, n. 1, p. 1-24',
            doi: '10.1017/S0021859600001441',
            tier: 'primary',
            abnt: 'GREEN, W. H.; AMPT, G. A. Studies on soil physics, I: the flow of air and water through soils. The Journal of Agricultural Science, Cambridge, v. 4, n. 1, p. 1-24, 1911. DOI: 10.1017/S0021859600001441.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Rawls, W. J.; Brakensiek, D. L.; Miller, N. (1983)',
                title: 'Green-Ampt infiltration parameters from soils data',
                journalOrPublisher: 'Journal of Hydraulic Engineering, v. 109, n. 1, p. 62-70',
                doi: '10.1061/(ASCE)0733-9429(1983)109:1(62)',
                tier: 'numerical',
                abnt: 'RAWLS, W. J.; BRAKENSIEK, D. L.; MILLER, N. Green-Ampt infiltration parameters from soils data. Journal of Hydraulic Engineering, Reston, v. 109, n. 1, p. 62-70, 1983. DOI: 10.1061/(ASCE)0733-9429(1983)109:1(62).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 13969/1997 (tanques sépticos — infiltração no solo)',
            'CETESB Manual de Gerenciamento de Áreas Contaminadas (2001)',
        ]),
        limitations: Object.freeze([
            'Assume solo homogêneo + saturação súbita frente molhada',
            'Não-válido para solos macroporos preferenciais (calcários, basaltos fraturados)',
            'Parâmetros Rawls 1983 são para solos USA — verificar correspondência BR',
        ]),
        validation: Object.freeze({
            cheapTestCount: 5,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Rawls 1983 Tabela 3 parâmetros 12 texturas',
        }),
    }),

    manningEquation: Object.freeze({
        solverId: 'manningEquation',
        nameKey: 'solver.manningEquation.name',
        domainKey: 'solver.domain.openChannelFlow',
        primaryReference: Object.freeze({
            authorYear: 'Manning, R. (1891)',
            title: 'On the flow of water in open channels and pipes',
            journalOrPublisher: 'Transactions of the Institution of Civil Engineers of Ireland, v. 20, p. 161-207',
            tier: 'primary',
            abnt: 'MANNING, R. On the flow of water in open channels and pipes. Transactions of the Institution of Civil Engineers of Ireland, Dublin, v. 20, p. 161-207, 1891.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Chow, V. T. (1959)',
                title: 'Open-Channel Hydraulics',
                journalOrPublisher: 'McGraw-Hill, New York',
                isbn: '978-0070107762',
                tier: 'derivation',
                abnt: 'CHOW, V. T. Open-Channel Hydraulics. New York: McGraw-Hill, 1959.',
            }),
            Object.freeze({
                authorYear: 'Porto, R. M. (2006)',
                title: 'Hidráulica básica',
                journalOrPublisher: 'EESC-USP, São Carlos',
                isbn: '978-8585205454',
                tier: 'derivation',
                abnt: 'PORTO, R. M. Hidráulica básica. 4. ed. São Carlos: EESC-USP, 2006.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 12266/1992 (projeto e execução de valas)',
            'ABNT NBR 9649/1986 (projeto de redes coletoras de esgoto)',
            'Plano Diretor de Drenagem Urbana (PDDU) municipal',
        ]),
        limitations: Object.freeze([
            'Empírico — coeficiente n calibrado para escoamento turbulento permanente uniforme',
            'Tabelas Chow 1959 são USA — usar Porto 2006 para canais BR',
            'Não-válido para escoamento não-permanente (usar Saint-Venant)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Chow 1959 worked examples cap 5',
        }),
    }),

    scsCurveNumber: Object.freeze({
        solverId: 'scsCurveNumber',
        nameKey: 'solver.scsCurveNumber.name',
        domainKey: 'solver.domain.runoffRainfall',
        primaryReference: Object.freeze({
            authorYear: 'USDA-SCS (1972)',
            title: 'National Engineering Handbook, Section 4: Hydrology',
            journalOrPublisher: 'US Department of Agriculture, Soil Conservation Service, Washington DC',
            tier: 'primary',
            abnt: 'UNITED STATES DEPARTMENT OF AGRICULTURE. Soil Conservation Service. National Engineering Handbook, Section 4: Hydrology. Washington, DC: USDA-SCS, 1972.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Tucci, C. E. M. (2007)',
                title: 'Hidrologia: ciência e aplicação',
                journalOrPublisher: 'UFRGS Editora/ABRH, Porto Alegre',
                isbn: '978-8570251800',
                tier: 'derivation',
                abnt: 'TUCCI, C. E. M. (Org.). Hidrologia: ciência e aplicação. 4. ed. Porto Alegre: UFRGS Editora; ABRH, 2007.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'Plano Diretor de Drenagem Urbana — método consagrado',
            'ABNT NBR 9649/1986 (vazão de projeto)',
        ]),
        limitations: Object.freeze([
            'CN parâmetro empírico USA — calibração BR via Tucci 2007 cap. 11',
            'Não-aplicável para escoamento subterrâneo',
            'Subestima runoff para chuvas muito intensas (> 100 mm/h)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 4,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs USDA TR-55 worked examples',
        }),
    }),

    theisThiem: Object.freeze({
        solverId: 'theisThiem',
        nameKey: 'solver.theisThiem.name',
        domainKey: 'solver.domain.pumpingTest',
        primaryReference: Object.freeze({
            authorYear: 'Theis, C. V. (1935)',
            title: 'The relation between the lowering of the piezometric surface and the rate and duration of discharge of a well using groundwater storage',
            journalOrPublisher: 'Transactions of the American Geophysical Union, v. 16, n. 2, p. 519-524',
            doi: '10.1029/TR016i002p00519',
            tier: 'primary',
            abnt: 'THEIS, C. V. The relation between the lowering of the piezometric surface and the rate and duration of discharge of a well using groundwater storage. Transactions of the American Geophysical Union, Washington, v. 16, n. 2, p. 519-524, 1935. DOI: 10.1029/TR016i002p00519.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Thiem, G. (1906)',
                title: 'Hydrologische Methoden',
                journalOrPublisher: 'Gebhardt, Leipzig',
                tier: 'primary',
                abnt: 'THIEM, G. Hydrologische Methoden. Leipzig: Gebhardt, 1906.',
            }),
            Object.freeze({
                authorYear: 'Cleary, R. W. (2003)',
                title: 'Águas subterrâneas',
                journalOrPublisher: 'Princeton Groundwater (port. Feitosa & Manoel Filho)',
                tier: 'derivation',
                abnt: 'CLEARY, R. W. Águas subterrâneas. Tradução: Edilton Feitosa, Manoel Filho. 2. ed. Recife: UFPE, 2003.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CONAMA Resolução 396/2008 (classificação águas subterrâneas)',
            'ABNT NBR 15495-1/2007 (poços de monitoramento)',
            'CETESB DD 038/2017 (aquífero — caracterização)',
        ]),
        limitations: Object.freeze([
            'Theis: assume aquífero confinado homogêneo isotrópico horizontal infinito',
            'Thiem: regime permanente — não-aplicável a aquíferos livres ou regime transitório',
            'Não considera efeitos de contorno (rio, falha geológica)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 6,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Cleary 2003 cap. 5 exemplos resolvidos',
        }),
    }),

    usleRusle: Object.freeze({
        solverId: 'usleRusle',
        nameKey: 'solver.usleRusle.name',
        domainKey: 'solver.domain.soilErosion',
        primaryReference: Object.freeze({
            authorYear: 'Wischmeier, W. H.; Smith, D. D. (1978)',
            title: 'Predicting Rainfall Erosion Losses: A Guide to Conservation Planning',
            journalOrPublisher: 'USDA Agriculture Handbook n. 537',
            tier: 'primary',
            abnt: 'WISCHMEIER, W. H.; SMITH, D. D. Predicting Rainfall Erosion Losses: A Guide to Conservation Planning. Washington, DC: USDA, 1978. (Agriculture Handbook, 537).',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Renard, K. G. et al. (1997)',
                title: 'Predicting Soil Erosion by Water: A Guide to Conservation Planning with RUSLE',
                journalOrPublisher: 'USDA Agriculture Handbook n. 703',
                tier: 'derivation',
                abnt: 'RENARD, K. G. et al. Predicting Soil Erosion by Water: A Guide to Conservation Planning with the Revised Universal Soil Loss Equation (RUSLE). Washington, DC: USDA, 1997. (Agriculture Handbook, 703).',
            }),
            Object.freeze({
                authorYear: 'Bertoni, J.; Lombardi Neto, F. (2014)',
                title: 'Conservação do solo',
                journalOrPublisher: 'Ícone, São Paulo',
                isbn: '978-8527410274',
                tier: 'derivation',
                abnt: 'BERTONI, J.; LOMBARDI NETO, F. Conservação do solo. 9. ed. São Paulo: Ícone, 2014.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CONAMA Resolução 001/1986 (EIA-RIMA — perda de solo)',
            'Bertoni & Lombardi 2014 — calibração BR aceita em laudos CETESB',
        ]),
        limitations: Object.freeze([
            'Equação empírica — não modela erosão linear (sulcos, voçorocas)',
            'Parâmetro R (erosividade chuva) precisa calibração regional BR',
            'Não-válido para encostas > 60% inclinação',
        ]),
        validation: Object.freeze({
            cheapTestCount: 4,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Wischmeier 1978 + Bertoni 2014 worked examples',
        }),
    }),

    darcyFlow: Object.freeze({
        solverId: 'darcyFlow',
        nameKey: 'solver.darcyFlow.name',
        domainKey: 'solver.domain.groundwaterFlow',
        primaryReference: Object.freeze({
            authorYear: 'Darcy, H. (1856)',
            title: 'Les fontaines publiques de la ville de Dijon',
            journalOrPublisher: 'Victor Dalmont, Paris',
            tier: 'primary',
            abnt: 'DARCY, H. Les fontaines publiques de la ville de Dijon. Paris: Victor Dalmont, 1856.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Bear, J. (1972)',
                title: 'Dynamics of Fluids in Porous Media',
                journalOrPublisher: 'American Elsevier, New York',
                isbn: '978-0444001146',
                tier: 'derivation',
                abnt: 'BEAR, J. Dynamics of Fluids in Porous Media. New York: American Elsevier, 1972.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 15495-1/2007 (poços de monitoramento — condutividade)',
            'CETESB DD 038/2017 (cálculo de fluxo subterrâneo)',
        ]),
        limitations: Object.freeze([
            'Válido apenas para escoamento laminar (Re < 10 em poros)',
            'Não-aplicável a aquíferos cársticos ou fraturados',
            'Assume meio poroso saturado homogêneo',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Bear 1972 cap. 4 exemplos',
        }),
    }),

    domenico1987: Object.freeze({
        solverId: 'domenico1987',
        nameKey: 'solver.domenico.name',
        domainKey: 'solver.domain.contaminantTransport',
        primaryReference: Object.freeze({
            authorYear: 'Domenico, P. A. (1987)',
            title: 'An analytical model for multidimensional transport of a decaying contaminant species',
            journalOrPublisher: 'Journal of Hydrology, v. 91, n. 1-2, p. 49-58',
            doi: '10.1016/0022-1694(87)90127-2',
            tier: 'primary',
            abnt: 'DOMENICO, P. A. An analytical model for multidimensional transport of a decaying contaminant species. Journal of Hydrology, Amsterdam, v. 91, n. 1-2, p. 49-58, 1987. DOI: 10.1016/0022-1694(87)90127-2.',
        }),
        additionalReferences: Object.freeze([]),
        regulatoryBasis: Object.freeze([
            'ASTM E1739/1995 (RBCA Tier 2 — analytical fate & transport)',
            'CETESB DD 038/2017 Anexos B+C (avaliação de risco — modelo Domenico)',
        ]),
        limitations: Object.freeze([
            'Assume aquífero homogêneo + fluxo permanente unidirecional',
            'Solução analítica — não substitui MT3DMS/RT3D para domínios complexos',
            'Decaimento de 1ª ordem — não modela cinética múltipla',
        ]),
        validation: Object.freeze({
            cheapTestCount: 4,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/cetesb-risk-* anexos B+C validate Domenico vs CETESB spreadsheet',
        }),
    }),

    ogatabanks: Object.freeze({
        solverId: 'ogatabanks',
        nameKey: 'solver.ogatabanks.name',
        domainKey: 'solver.domain.solute1d',
        primaryReference: Object.freeze({
            authorYear: 'Ogata, A.; Banks, R. B. (1961)',
            title: 'A solution of the differential equation of longitudinal dispersion in porous media',
            journalOrPublisher: 'USGS Professional Paper 411-A',
            tier: 'primary',
            abnt: 'OGATA, A.; BANKS, R. B. A solution of the differential equation of longitudinal dispersion in porous media. Washington, DC: USGS, 1961. (Professional Paper, 411-A).',
        }),
        additionalReferences: Object.freeze([]),
        regulatoryBasis: Object.freeze([
            'CETESB DD 038/2017 (transporte 1D longitudinal)',
            'ABNT NBR 16434/2015 (avaliação de risco RBCA)',
        ]),
        limitations: Object.freeze([
            'Apenas 1D — não captura dispersão transversal/vertical',
            'Assume coeficiente dispersão constante (não-fickian em escala campo)',
            'Não modela retardamento variável ou kinetic sorption',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs USGS Professional Paper 411-A Fig. 2',
        }),
    }),

    streeterPhelps: Object.freeze({
        solverId: 'streeterPhelps',
        nameKey: 'solver.streeterPhelps.name',
        domainKey: 'solver.domain.riverDOdeficit',
        primaryReference: Object.freeze({
            authorYear: 'Streeter, H. W.; Phelps, E. B. (1925)',
            title: 'A study of the pollution and natural purification of the Ohio River',
            journalOrPublisher: 'US Public Health Service Bulletin n. 146',
            tier: 'primary',
            abnt: 'STREETER, H. W.; PHELPS, E. B. A study of the pollution and natural purification of the Ohio River. Washington, DC: US Public Health Service, 1925. (Bulletin, 146).',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'von Sperling, M. (2007)',
                title: 'Estudos e modelagem da qualidade da água de rios',
                journalOrPublisher: 'DESA/UFMG, Belo Horizonte',
                isbn: '978-8570412102',
                tier: 'derivation',
                abnt: 'VON SPERLING, M. Estudos e modelagem da qualidade da água de rios. Belo Horizonte: DESA/UFMG, 2007. (Princípios do tratamento biológico de águas residuárias, v. 7).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CONAMA Resolução 357/2005 (classes de águas — modelagem OD)',
            'CETESB Manual Qualidade das Águas',
        ]),
        limitations: Object.freeze([
            'Considera apenas DBO + reaeração (não captura sedimentação, fotossíntese)',
            'Coeficientes k1 (desoxigenação) e k2 (reaeração) calibrar para rio específico',
            'Não-válido para reservatórios ou rios com baixa velocidade',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs von Sperling 2007 cap. 6',
        }),
    }),

    vaporIntrusion: Object.freeze({
        solverId: 'vaporIntrusion',
        nameKey: 'solver.vaporIntrusion.name',
        domainKey: 'solver.domain.vaporIntrusion',
        primaryReference: Object.freeze({
            authorYear: 'Johnson, P. C.; Ettinger, R. A. (1991)',
            title: 'Heuristic model for predicting the intrusion rate of contaminant vapors into buildings',
            journalOrPublisher: 'Environmental Science & Technology, v. 25, n. 8, p. 1445-1452',
            doi: '10.1021/es00020a013',
            tier: 'primary',
            abnt: 'JOHNSON, P. C.; ETTINGER, R. A. Heuristic model for predicting the intrusion rate of contaminant vapors into buildings. Environmental Science & Technology, Washington, v. 25, n. 8, p. 1445-1452, 1991. DOI: 10.1021/es00020a013.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'EPA (2015)',
                title: 'Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway',
                journalOrPublisher: 'US EPA OSWER Publication 9200.2-154',
                tier: 'regulatory',
                abnt: 'UNITED STATES ENVIRONMENTAL PROTECTION AGENCY. Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway from Subsurface Vapor Sources to Indoor Air. Washington, DC: EPA OSWER, 2015. (OSWER Publication, 9200.2-154).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ASTM E2600/2015 (vapor encroachment screening)',
            'CETESB DD 038/2017 Anexo B (modelo J&E obrigatório)',
        ]),
        limitations: Object.freeze([
            'Modelo heurístico — incertezas ±1 ordem de magnitude na concentração indoor',
            'Não captura preferential pathways (rachaduras, condutos)',
            'Assume regime permanente — não-válido para fontes intermitentes',
        ]),
        validation: Object.freeze({
            cheapTestCount: 6,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/cetesb-risk-* validate J&E vs CETESB spreadsheet (Anexo B)',
        }),
    }),

    firstOrderDecay: Object.freeze({
        solverId: 'firstOrderDecay',
        nameKey: 'solver.firstOrderDecay.name',
        domainKey: 'solver.domain.kinetics',
        primaryReference: Object.freeze({
            authorYear: 'Wiedemeier, T. H. et al. (1999)',
            title: 'Natural attenuation of fuels and chlorinated solvents in the subsurface',
            journalOrPublisher: 'John Wiley & Sons, New York',
            isbn: '978-0471197492',
            tier: 'primary',
            abnt: 'WIEDEMEIER, T. H. et al. Natural attenuation of fuels and chlorinated solvents in the subsurface. New York: John Wiley & Sons, 1999.',
        }),
        additionalReferences: Object.freeze([]),
        regulatoryBasis: Object.freeze([
            'CETESB Manual de Atenuação Natural Monitorada (2007)',
            'EPA OSWER Directive 9200.4-17 (1999)',
        ]),
        limitations: Object.freeze([
            'Decay rate constante — não captura sequestration / rebound',
            'Não modela transformação de produtos (filhos contaminantes mais tóxicos)',
            'Calibração k via campo essencial — literatura tem alta variabilidade',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Wiedemeier 1999 worked examples',
        }),
    }),

    slugTest: Object.freeze({
        solverId: 'slugTest',
        nameKey: 'solver.slugTest.name',
        domainKey: 'solver.domain.aquiferCharacterization',
        primaryReference: Object.freeze({
            authorYear: 'Bouwer, H.; Rice, R. C. (1976)',
            title: 'A slug test for determining hydraulic conductivity of unconfined aquifers with completely or partially penetrating wells',
            journalOrPublisher: 'Water Resources Research, v. 12, n. 3, p. 423-428',
            doi: '10.1029/WR012i003p00423',
            tier: 'primary',
            abnt: 'BOUWER, H.; RICE, R. C. A slug test for determining hydraulic conductivity of unconfined aquifers with completely or partially penetrating wells. Water Resources Research, Washington, v. 12, n. 3, p. 423-428, 1976. DOI: 10.1029/WR012i003p00423.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Hvorslev, M. J. (1951)',
                title: 'Time lag and soil permeability in ground-water observations',
                journalOrPublisher: 'US Army Corps of Engineers Waterways Experiment Station Bulletin n. 36',
                tier: 'primary',
                abnt: 'HVORSLEV, M. J. Time lag and soil permeability in ground-water observations. Vicksburg: US Army Corps of Engineers Waterways Experiment Station, 1951. (Bulletin, 36).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 15495-1/2007 (poços de monitoramento — ensaios de permeabilidade)',
            'CETESB DD 038/2017 (caracterização de aquífero)',
            'ASTM D4044/2008 (slug test field procedure)',
        ]),
        limitations: Object.freeze([
            'Bouwer-Rice válido para aquífero NÃO-confinado; Hvorslev para confinado',
            'Resultado representa apenas zona próxima ao poço (raio ~ 1-3 m)',
            'Não detecta heterogeneidades regionais (requer pumping test)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Bouwer 1976 Fig. 2 + Hvorslev 1951 Tabelas',
        }),
    }),

    pumpingTest: Object.freeze({
        solverId: 'pumpingTest',
        nameKey: 'solver.pumpingTest.name',
        domainKey: 'solver.domain.aquiferCharacterization',
        primaryReference: Object.freeze({
            authorYear: 'Cooper, H. H.; Jacob, C. E. (1946)',
            title: 'A generalized graphical method for evaluating formation constants and summarizing well-field history',
            journalOrPublisher: 'Transactions of the American Geophysical Union, v. 27, n. 4, p. 526-534',
            doi: '10.1029/TR027i004p00526',
            tier: 'primary',
            abnt: 'COOPER, H. H.; JACOB, C. E. A generalized graphical method for evaluating formation constants and summarizing well-field history. Transactions of the American Geophysical Union, Washington, v. 27, n. 4, p. 526-534, 1946. DOI: 10.1029/TR027i004p00526.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Hantush, M. S. (1956)',
                title: 'Analysis of data from pumping tests in leaky aquifers',
                journalOrPublisher: 'Transactions of the American Geophysical Union, v. 37, n. 6, p. 702-714',
                doi: '10.1029/TR037i006p00702',
                tier: 'derivation',
                abnt: 'HANTUSH, M. S. Analysis of data from pumping tests in leaky aquifers. Transactions of the American Geophysical Union, Washington, v. 37, n. 6, p. 702-714, 1956. DOI: 10.1029/TR037i006p00702.',
            }),
            Object.freeze({
                authorYear: 'Kruseman, G. P.; De Ridder, N. A. (1990)',
                title: 'Analysis and Evaluation of Pumping Test Data',
                journalOrPublisher: 'ILRI Publication n. 47, Wageningen',
                isbn: '978-9070754204',
                tier: 'derivation',
                abnt: 'KRUSEMAN, G. P.; DE RIDDER, N. A. Analysis and Evaluation of Pumping Test Data. 2nd ed. Wageningen: ILRI, 1990. (Publication, 47).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 12212/2017 (poço tubular — projeto)',
            'ABNT NBR 12244/2006 (construção de poços)',
            'CONAMA Resolução 396/2008 (classificação águas subterrâneas)',
        ]),
        limitations: Object.freeze([
            'Cooper-Jacob: válido para tempo ≥ critério u < 0.01 (regime semi-permanente)',
            'Hantush: aquíferos leaky exigem identificação visual via type-curves',
            'Não captura heterogeneidades 3D ou anisotropia severa',
        ]),
        validation: Object.freeze({
            cheapTestCount: 4,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Kruseman & De Ridder 1990 worked examples cap. 3-4',
        }),
    }),

    constructedWetlandDesign: Object.freeze({
        solverId: 'constructedWetlandDesign',
        nameKey: 'solver.constructedWetland.name',
        domainKey: 'solver.domain.wastewaterTreatment',
        primaryReference: Object.freeze({
            authorYear: 'Kadlec, R. H.; Wallace, S. D. (2009)',
            title: 'Treatment Wetlands',
            journalOrPublisher: 'CRC Press, 2nd ed.',
            isbn: '978-1566705264',
            tier: 'primary',
            abnt: 'KADLEC, R. H.; WALLACE, S. D. Treatment Wetlands. 2. ed. Boca Raton: CRC Press, 2009.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'von Sperling, M.; Sezerino, P. H. (2018)',
                title: 'Dimensionamento de wetlands construídos no Brasil',
                journalOrPublisher: 'Boletim INCT-ETEs Sustentáveis n. 5',
                tier: 'derivation',
                abnt: 'VON SPERLING, M.; SEZERINO, P. H. Dimensionamento de wetlands construídos no Brasil. Belo Horizonte: INCT-ETEs Sustentáveis, 2018. (Boletim, 5).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 13969/1997 (tratamento de esgoto sanitário)',
            'CONAMA Resolução 430/2011 (lançamento de efluentes)',
            'CETESB Norma P4.230/2011 (sistemas naturais)',
        ]),
        limitations: Object.freeze([
            'Modelos k-C* k1ª ordem assumem regime permanente (não modelagem dinâmica)',
            'Performance varia sazonalmente (k temperatura-dependente)',
            'Calibração BR limitada — von Sperling 2018 é referência mais recente',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Kadlec & Wallace 2009 cap. 6 worked examples',
        }),
    }),

    landfillLeachate: Object.freeze({
        solverId: 'landfillLeachate',
        nameKey: 'solver.landfillLeachate.name',
        domainKey: 'solver.domain.solidWaste',
        primaryReference: Object.freeze({
            authorYear: 'Tchobanoglous, G.; Theisen, H.; Vigil, S. (1993)',
            title: 'Integrated Solid Waste Management: Engineering Principles and Management Issues',
            journalOrPublisher: 'McGraw-Hill, New York',
            isbn: '978-0070632370',
            tier: 'primary',
            abnt: 'TCHOBANOGLOUS, G.; THEISEN, H.; VIGIL, S. Integrated Solid Waste Management: Engineering Principles and Management Issues. New York: McGraw-Hill, 1993.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'EPA (2003)',
                title: 'Solid Waste Disposal Facility Criteria',
                journalOrPublisher: '40 CFR Part 258 (RCRA Subtitle D — MSWLF)',
                tier: 'regulatory',
                abnt: 'UNITED STATES ENVIRONMENTAL PROTECTION AGENCY. Solid Waste Disposal Facility Criteria. 40 CFR Part 258. Washington, DC: EPA, 2003. (RCRA Subtitle D).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 13896/1997 (aterros resíduos não-perigosos)',
            'CONAMA Resolução 404/2008 (licenciamento aterros)',
            'CETESB Norma P4.260/1992 (resíduos sólidos)',
        ]),
        limitations: Object.freeze([
            'HELP model US-baseado — chuva BR exige recalibração',
            'Geração de lixiviado fortemente dependente de cobertura final + compactação',
            'Composição lixiviado varia 5+ ordens de magnitude entre células',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Tchobanoglous 1993 cap. 11',
        }),
    }),

    naplDissolution: Object.freeze({
        solverId: 'naplDissolution',
        nameKey: 'solver.naplDissolution.name',
        domainKey: 'solver.domain.contaminantTransport',
        primaryReference: Object.freeze({
            authorYear: 'Powers, S. E. et al. (1992)',
            title: 'An experimental investigation of nonaqueous phase liquid dissolution in saturated subsurface systems: Steady state mass transfer rates',
            journalOrPublisher: 'Water Resources Research, v. 28, n. 10, p. 2691-2705',
            doi: '10.1029/92WR00984',
            tier: 'primary',
            abnt: 'POWERS, S. E. et al. An experimental investigation of nonaqueous phase liquid dissolution in saturated subsurface systems: Steady state mass transfer rates. Water Resources Research, Washington, v. 28, n. 10, p. 2691-2705, 1992. DOI: 10.1029/92WR00984.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Mackay, D. M.; Cherry, J. A. (1989)',
                title: 'Groundwater contamination: Pump-and-treat remediation',
                journalOrPublisher: 'Environmental Science & Technology, v. 23, n. 6, p. 630-636',
                doi: '10.1021/es00064a001',
                tier: 'derivation',
                abnt: 'MACKAY, D. M.; CHERRY, J. A. Groundwater contamination: Pump-and-treat remediation. Environmental Science & Technology, Washington, v. 23, n. 6, p. 630-636, 1989. DOI: 10.1021/es00064a001.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CETESB Manual de Gerenciamento de Áreas Contaminadas (2001)',
            'ABNT NBR 16434/2015 (avaliação de risco — fonte NAPL)',
        ]),
        limitations: Object.freeze([
            'Modelo steady-state — não captura source depletion ao longo do tempo',
            'Sherwood number correlations calibradas para colunas laboratoriais',
            'Heterogeneidade real do solo gera longevidade NAPL muito > predição',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Powers 1992 Sherwood correlations',
        }),
    }),

    soilGasTransport: Object.freeze({
        solverId: 'soilGasTransport',
        nameKey: 'solver.soilGasTransport.name',
        domainKey: 'solver.domain.vadoseZone',
        primaryReference: Object.freeze({
            authorYear: 'Massmann, J.; Farrier, D. F. (1992)',
            title: 'Effects of atmospheric pressures on gas transport in the vadose zone',
            journalOrPublisher: 'Water Resources Research, v. 28, n. 3, p. 777-791',
            doi: '10.1029/91WR02766',
            tier: 'primary',
            abnt: 'MASSMANN, J.; FARRIER, D. F. Effects of atmospheric pressures on gas transport in the vadose zone. Water Resources Research, Washington, v. 28, n. 3, p. 777-791, 1992. DOI: 10.1029/91WR02766.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Millington, R. J.; Quirk, J. P. (1961)',
                title: 'Permeability of porous solids',
                journalOrPublisher: 'Transactions of the Faraday Society, v. 57, p. 1200-1207',
                doi: '10.1039/TF9615701200',
                tier: 'numerical',
                abnt: 'MILLINGTON, R. J.; QUIRK, J. P. Permeability of porous solids. Transactions of the Faraday Society, London, v. 57, p. 1200-1207, 1961. DOI: 10.1039/TF9615701200.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CETESB DD 038/2017 (zona vadosa — transporte de vapor)',
            'ASTM E2600/2015 (vapor encroachment screening)',
        ]),
        limitations: Object.freeze([
            'Difusão Millington-Quirk pode subestimar fluxo em solos macroporos',
            'Não captura advecção barométrica em escala diária',
            'Requer calibração umidade do solo (parâmetro crítico)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Massmann 1992 + Millington 1961 baseline',
        }),
    }),

    sedimentTransport: Object.freeze({
        solverId: 'sedimentTransport',
        nameKey: 'solver.sedimentTransport.name',
        domainKey: 'solver.domain.fluvialDynamics',
        primaryReference: Object.freeze({
            authorYear: 'van Rijn, L. C. (1984)',
            title: 'Sediment transport, Part I: Bed load transport',
            journalOrPublisher: 'Journal of Hydraulic Engineering, v. 110, n. 10, p. 1431-1456',
            doi: '10.1061/(ASCE)0733-9429(1984)110:10(1431)',
            tier: 'primary',
            abnt: 'VAN RIJN, L. C. Sediment transport, Part I: Bed load transport. Journal of Hydraulic Engineering, Reston, v. 110, n. 10, p. 1431-1456, 1984. DOI: 10.1061/(ASCE)0733-9429(1984)110:10(1431).',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Engelund, F.; Hansen, E. (1967)',
                title: 'A monograph on sediment transport in alluvial streams',
                journalOrPublisher: 'Teknisk Forlag, Copenhagen',
                tier: 'derivation',
                abnt: 'ENGELUND, F.; HANSEN, E. A monograph on sediment transport in alluvial streams. Copenhagen: Teknisk Forlag, 1967.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 13030/1999 (sondagens hidráulicas)',
            'ANA Resolução 707/2004 (medições hidrométricas)',
        ]),
        limitations: Object.freeze([
            'van Rijn 1984 calibrado para rios temperados — extrapolação BR cautelosa',
            'Não-aplicável para reservatórios (assume rio aluvial)',
            'Coesivos (silte/argila) exigem modelos diferentes (Krone 1962)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs van Rijn 1984 Tabelas + Engelund 1967',
        }),
    }),

    transport2D: Object.freeze({
        solverId: 'transport2D',
        nameKey: 'solver.transport2D.name',
        domainKey: 'solver.domain.contaminantTransport',
        primaryReference: Object.freeze({
            authorYear: 'Sun, N.-Z. (1996)',
            title: 'Mathematical Modeling of Groundwater Pollution',
            journalOrPublisher: 'Springer-Verlag, New York',
            isbn: '978-0387945286',
            tier: 'primary',
            abnt: 'SUN, N.-Z. Mathematical Modeling of Groundwater Pollution. New York: Springer-Verlag, 1996.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Zheng, C.; Bennett, G. D. (2002)',
                title: 'Applied Contaminant Transport Modeling',
                journalOrPublisher: 'Wiley-Interscience, 2nd ed.',
                isbn: '978-0471384779',
                tier: 'derivation',
                abnt: 'ZHENG, C.; BENNETT, G. D. Applied Contaminant Transport Modeling. 2. ed. New York: Wiley-Interscience, 2002.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CETESB DD 038/2017 (transporte multidimensional)',
            'ABNT NBR 16434/2015 (avaliação de risco RBCA Tier 2)',
        ]),
        limitations: Object.freeze([
            'Solução analítica 2D — caso 3D exige MT3DMS/RT3D numérico',
            'Assume velocidade constante uniforme (não captura heterogeneidade)',
            'Coeficientes dispersão constantes (não-fickian em campo)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Sun 1996 + Zheng 2002 worked examples',
        }),
    }),

    wellheadProtection: Object.freeze({
        solverId: 'wellheadProtection',
        nameKey: 'solver.wellheadProtection.name',
        domainKey: 'solver.domain.groundwaterProtection',
        primaryReference: Object.freeze({
            authorYear: 'EPA (1987)',
            title: 'Guidelines for Delineation of Wellhead Protection Areas',
            journalOrPublisher: 'US EPA Office of Ground-Water Protection',
            tier: 'primary',
            abnt: 'UNITED STATES ENVIRONMENTAL PROTECTION AGENCY. Guidelines for Delineation of Wellhead Protection Areas. Washington, DC: EPA Office of Ground-Water Protection, 1987. (EPA-440/6-87-010).',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Bear, J.; Jacobs, M. (1965)',
                title: 'On the movement of water bodies injected into aquifers',
                journalOrPublisher: 'Journal of Hydrology, v. 3, n. 1, p. 37-57',
                doi: '10.1016/0022-1694(65)90065-X',
                tier: 'derivation',
                abnt: 'BEAR, J.; JACOBS, M. On the movement of water bodies injected into aquifers. Journal of Hydrology, Amsterdam, v. 3, n. 1, p. 37-57, 1965. DOI: 10.1016/0022-1694(65)90065-X.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CONAMA Resolução 396/2008 (perímetro de proteção de poço)',
            'ABNT NBR 12212/2017 (projeto poço tubular — área de proteção)',
            'Lei Federal 9.433/1997 (PNRH — perímetros de proteção)',
        ]),
        limitations: Object.freeze([
            'Método fixed-radius é conservador — sobrestima área para aquíferos espesso',
            'Tempo de trânsito requer estimativa de velocidade efetiva (Darcy/porosidade)',
            'Não captura efeitos de bombeamento simultâneo em poços vizinhos',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs EPA 1987 Tabela 3-2',
        }),
    }),

    thermalTransport: Object.freeze({
        solverId: 'thermalTransport',
        nameKey: 'solver.thermalTransport.name',
        domainKey: 'solver.domain.heatFlow',
        primaryReference: Object.freeze({
            authorYear: 'Anderson, M. P. (2005)',
            title: 'Heat as a Ground Water Tracer',
            journalOrPublisher: 'Ground Water, v. 43, n. 6, p. 951-968',
            doi: '10.1111/j.1745-6584.2005.00052.x',
            tier: 'primary',
            abnt: 'ANDERSON, M. P. Heat as a Ground Water Tracer. Ground Water, Westerville, v. 43, n. 6, p. 951-968, 2005. DOI: 10.1111/j.1745-6584.2005.00052.x.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Stallman, R. W. (1965)',
                title: 'Steady one-dimensional fluid flow in a semi-infinite porous medium with sinusoidal surface temperature',
                journalOrPublisher: 'Journal of Geophysical Research, v. 70, n. 12, p. 2821-2827',
                doi: '10.1029/JZ070i012p02821',
                tier: 'derivation',
                abnt: 'STALLMAN, R. W. Steady one-dimensional fluid flow in a semi-infinite porous medium with sinusoidal surface temperature. Journal of Geophysical Research, Washington, v. 70, n. 12, p. 2821-2827, 1965. DOI: 10.1029/JZ070i012p02821.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 16798-1/2018 (desempenho térmico edificações — analogia)',
            'CONAMA Resolução 396/2008 (qualidade térmica águas subterrâneas)',
        ]),
        limitations: Object.freeze([
            'Modelo analítico assume meio poroso homogêneo isotrópico',
            'Difusividade térmica varia com saturação (não captura zona vadosa parcial)',
            'Não considera reações exotérmicas (biodegradação, ATES)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Anderson 2005 + Stallman 1965',
        }),
    }),

    aquiferCharacterization: Object.freeze({
        solverId: 'aquiferCharacterization',
        nameKey: 'solver.aquiferCharacterization.name',
        domainKey: 'solver.domain.hydrogeology',
        primaryReference: Object.freeze({
            authorYear: 'Freeze, R. A.; Cherry, J. A. (1979)',
            title: 'Groundwater',
            journalOrPublisher: 'Prentice-Hall, Englewood Cliffs',
            isbn: '978-0133653120',
            tier: 'primary',
            abnt: 'FREEZE, R. A.; CHERRY, J. A. Groundwater. Englewood Cliffs: Prentice-Hall, 1979.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Custodio, E.; Llamas, M. R. (1976)',
                title: 'Hidrología subterránea',
                journalOrPublisher: 'Omega, Barcelona',
                isbn: '978-8428204460',
                tier: 'derivation',
                abnt: 'CUSTODIO, E.; LLAMAS, M. R. Hidrología subterránea. Barcelona: Omega, 1976.',
            }),
            Object.freeze({
                authorYear: 'Feitosa, F. A. C. et al. (2008)',
                title: 'Hidrogeologia: conceitos e aplicações',
                journalOrPublisher: 'CPRM/LABHID, Rio de Janeiro',
                isbn: '978-8574991337',
                tier: 'derivation',
                abnt: 'FEITOSA, F. A. C. et al. Hidrogeologia: conceitos e aplicações. 3. ed. Rio de Janeiro: CPRM/LABHID, 2008.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 15495-1/2007 (poços de monitoramento)',
            'CONAMA Resolução 396/2008 (classificação águas subterrâneas)',
            'CETESB DD 038/2017 (caracterização de aquífero)',
        ]),
        limitations: Object.freeze([
            'Modelo conceitual depende fortemente de dados de campo (poucos poços = alta incerteza)',
            'Heterogeneidade horizontal/vertical não capturada por médias simples',
            'Feitosa 2008 é referência BR mas calibração regional ainda necessária',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Freeze & Cherry 1979 + Feitosa 2008',
        }),
    }),

    atmosphericDispersion: Object.freeze({
        solverId: 'atmosphericDispersion',
        nameKey: 'solver.atmosphericDispersion.name',
        domainKey: 'solver.domain.airQuality',
        primaryReference: Object.freeze({
            authorYear: 'Cimorelli, A. J. et al. (2005)',
            title: 'AERMOD: A Dispersion Model for Industrial Source Applications. Part I: General Model Formulation and Boundary Layer Characterization',
            journalOrPublisher: 'Journal of Applied Meteorology, v. 44, n. 5, p. 682-693',
            doi: '10.1175/JAM2227.1',
            tier: 'primary',
            abnt: 'CIMORELLI, A. J. et al. AERMOD: A Dispersion Model for Industrial Source Applications. Part I: General Model Formulation and Boundary Layer Characterization. Journal of Applied Meteorology, Boston, v. 44, n. 5, p. 682-693, 2005. DOI: 10.1175/JAM2227.1.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Seinfeld, J. H.; Pandis, S. N. (2016)',
                title: 'Atmospheric Chemistry and Physics: From Air Pollution to Climate Change',
                journalOrPublisher: 'John Wiley & Sons, 3rd ed.',
                isbn: '978-1118947401',
                tier: 'derivation',
                abnt: 'SEINFELD, J. H.; PANDIS, S. N. Atmospheric Chemistry and Physics: From Air Pollution to Climate Change. 3. ed. Hoboken: John Wiley & Sons, 2016.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CETESB Decisão de Diretoria 195/2017/E (modelagem atmosférica)',
            'CONAMA Resolução 491/2018 (qualidade do ar)',
            'EPA 40 CFR Part 51 Appendix W (AERMOD model)',
        ]),
        limitations: Object.freeze([
            'AERMOD válido até 50 km da fonte; distâncias maiores exigem CALPUFF/HYSPLIT',
            'Requer dados meteorológicos pré-processados (AERMET)',
            'Não modela reações químicas no plume (apenas dispersão)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Cimorelli 2005 baseline + Seinfeld & Pandis 2016',
        }),
    }),

    groundwaterAgeDating: Object.freeze({
        solverId: 'groundwaterAgeDating',
        nameKey: 'solver.groundwaterAgeDating.name',
        domainKey: 'solver.domain.isotopeHydrology',
        primaryReference: Object.freeze({
            authorYear: 'Plummer, L. N.; Busenberg, E. (2000)',
            title: 'Chlorofluorocarbons',
            journalOrPublisher: 'Environmental Tracers in Subsurface Hydrology, Cook & Herczeg (eds.), Kluwer, p. 441-478',
            isbn: '978-0792377030',
            tier: 'primary',
            abnt: 'PLUMMER, L. N.; BUSENBERG, E. Chlorofluorocarbons. In: COOK, P. G.; HERCZEG, A. L. (eds.). Environmental Tracers in Subsurface Hydrology. Boston: Kluwer Academic Publishers, 2000. p. 441-478.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Clark, I.; Fritz, P. (1997)',
                title: 'Environmental Isotopes in Hydrogeology',
                journalOrPublisher: 'CRC Press, Boca Raton',
                isbn: '978-1566702492',
                tier: 'derivation',
                abnt: 'CLARK, I.; FRITZ, P. Environmental Isotopes in Hydrogeology. Boca Raton: CRC Press, 1997.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CONAMA Resolução 396/2008 (classificação águas subterrâneas — vulnerabilidade)',
            'CPRM Atlas Pluviométrico do Brasil (calibração regional δ²H/δ¹⁸O)',
        ]),
        limitations: Object.freeze([
            'CFC dating limitado a água recente (<60 anos); ³H/³He estende para 50 anos',
            '¹⁴C necessário para águas > 1.000 anos (cuidado dead carbon)',
            'Mistura de águas (jovem + antiga) requer modelos multi-tracer',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Plummer & Busenberg 2000 + Clark & Fritz 1997',
        }),
    }),

    lnaplAssessment: Object.freeze({
        solverId: 'lnaplAssessment',
        nameKey: 'solver.lnaplAssessment.name',
        domainKey: 'solver.domain.contaminantTransport',
        primaryReference: Object.freeze({
            authorYear: 'ITRC (2018)',
            title: 'LNAPL Site Management: LCSM Evolution, Decision Process, and Remedial Technologies',
            journalOrPublisher: 'Interstate Technology & Regulatory Council, LNAPL-3',
            tier: 'primary',
            abnt: 'INTERSTATE TECHNOLOGY & REGULATORY COUNCIL. LNAPL Site Management: LCSM Evolution, Decision Process, and Remedial Technologies. Washington, DC: ITRC, 2018. (LNAPL-3).',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'API (2007)',
                title: 'LNAPL Distribution and Recovery Model (LDRM)',
                journalOrPublisher: 'American Petroleum Institute Publication 4760',
                tier: 'derivation',
                abnt: 'AMERICAN PETROLEUM INSTITUTE. LNAPL Distribution and Recovery Model (LDRM). Washington, DC: API, 2007. (Publication, 4760).',
            }),
            Object.freeze({
                authorYear: 'Charbeneau, R. J. (2007)',
                title: 'LNAPL Distribution and Recovery Model — Volume 1: Distribution and Recovery of Petroleum Hydrocarbon Liquids in Porous Media',
                journalOrPublisher: 'American Petroleum Institute Publication 4760, v. 1',
                tier: 'derivation',
                abnt: 'CHARBENEAU, R. J. LNAPL Distribution and Recovery Model — Volume 1: Distribution and Recovery of Petroleum Hydrocarbon Liquids in Porous Media. Washington, DC: API, 2007. (Publication, 4760, v. 1).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CETESB DD 038/2017 Anexo C (avaliação LNAPL postos de combustível)',
            'ABNT NBR 16434/2015 (RBCA avaliação de risco — fontes LNAPL)',
            'CONAMA Resolução 273/2000 (postos de combustível — passivos)',
        ]),
        limitations: Object.freeze([
            'LDRM API assume distribuição vertical pseudo-equilíbrio (não captura zonas smear dinâmicas)',
            'Recovery factor varia 10-90% conforme tipo combustível + permeabilidade',
            'Calibração BR via CETESB ainda limitada para etanol/biodiesel',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs ITRC 2018 + Charbeneau API 2007',
        }),
    }),

    noiseVibration: Object.freeze({
        solverId: 'noiseVibration',
        nameKey: 'solver.noiseVibration.name',
        domainKey: 'solver.domain.environmentalNoise',
        primaryReference: Object.freeze({
            authorYear: 'ISO 9613-2 (1996)',
            title: 'Acoustics — Attenuation of sound during propagation outdoors — Part 2: General method of calculation',
            journalOrPublisher: 'International Organization for Standardization, Geneva',
            tier: 'primary',
            abnt: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. ISO 9613-2: Acoustics — Attenuation of sound during propagation outdoors — Part 2: General method of calculation. Geneva: ISO, 1996.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'ABNT NBR 10151 (2019)',
                title: 'Acústica — Medição e avaliação de níveis de pressão sonora em áreas habitadas — Aplicação de uso geral',
                journalOrPublisher: 'ABNT, Rio de Janeiro',
                tier: 'regulatory',
                abnt: 'ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. NBR 10151: Acústica — Medição e avaliação de níveis de pressão sonora em áreas habitadas — Aplicação de uso geral. Rio de Janeiro: ABNT, 2019.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'ABNT NBR 10151/2019 (medição NPS áreas habitadas)',
            'ABNT NBR 10152/2017 (níveis sonoros desempenho edificações)',
            'CONAMA Resolução 001/1990 (critérios padrões emissão de ruídos)',
            'CETESB Norma L1.300/1979 (medição vibração)',
        ]),
        limitations: Object.freeze([
            'ISO 9613-2 válido para fontes pontuais e frequências 63-8000 Hz (não-aplicável < 50 Hz vibração)',
            'Atenuação por meteorologia favorece propagação downwind (incerteza ±3 dB)',
            'Barreiras acústicas modeladas como obstáculos simples (não captura difração múltipla)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs ISO 9613-2 Annex A worked examples + NBR 10151',
        }),
    }),

    remediationDesign: Object.freeze({
        solverId: 'remediationDesign',
        nameKey: 'solver.remediationDesign.name',
        domainKey: 'solver.domain.remediation',
        primaryReference: Object.freeze({
            authorYear: 'EPA (1988)',
            title: 'Guidance for Conducting Remedial Investigations and Feasibility Studies under CERCLA',
            journalOrPublisher: 'US EPA OSWER Directive 9355.3-01',
            tier: 'primary',
            abnt: 'UNITED STATES ENVIRONMENTAL PROTECTION AGENCY. Guidance for Conducting Remedial Investigations and Feasibility Studies under CERCLA. Washington, DC: EPA OSWER, 1988. (Directive, 9355.3-01).',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'Suthersan, S. S.; Horst, J.; Schnobrich, M.; Welty, N.; McDonough, J. (2017)',
                title: 'Remediation Engineering: Design Concepts',
                journalOrPublisher: 'CRC Press, 2nd ed.',
                isbn: '978-1498773171',
                tier: 'derivation',
                abnt: 'SUTHERSAN, S. S. et al. Remediation Engineering: Design Concepts. 2. ed. Boca Raton: CRC Press, 2017.',
            }),
            Object.freeze({
                authorYear: 'CETESB (2007)',
                title: 'Manual de Gerenciamento de Áreas Contaminadas',
                journalOrPublisher: 'CETESB, São Paulo, 2. ed.',
                tier: 'regulatory',
                abnt: 'COMPANHIA AMBIENTAL DO ESTADO DE SÃO PAULO. Manual de Gerenciamento de Áreas Contaminadas. 2. ed. São Paulo: CETESB, 2007.',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CONAMA Resolução 420/2009 (gerenciamento áreas contaminadas)',
            'CETESB DD 038/2017 (Plano de Intervenção)',
            'ABNT NBR 16209/2013 (avaliação de remediação)',
        ]),
        limitations: Object.freeze([
            'Modelos custo-benefício depende fortemente de premissas (taxa desconto + tempo)',
            'Performance technologia varia ±50% entre sites mesmo similar (calibração in-situ essencial)',
            'CERCLA é framework regulatório US — adaptação BR via Manual CETESB 2007',
        ]),
        validation: Object.freeze({
            cheapTestCount: 2,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs EPA 1988 + Suthersan 2017 + CETESB 2007',
        }),
    }),

    riverWaterQuality: Object.freeze({
        solverId: 'riverWaterQuality',
        nameKey: 'solver.riverWaterQuality.name',
        domainKey: 'solver.domain.surfaceWaterQuality',
        primaryReference: Object.freeze({
            authorYear: 'Chapra, S. C. (1997)',
            title: 'Surface Water-Quality Modeling',
            journalOrPublisher: 'McGraw-Hill, New York',
            isbn: '978-0070113640',
            tier: 'primary',
            abnt: 'CHAPRA, S. C. Surface Water-Quality Modeling. New York: McGraw-Hill, 1997.',
        }),
        additionalReferences: Object.freeze([
            Object.freeze({
                authorYear: 'von Sperling, M. (2014)',
                title: 'Estudos e modelagem da qualidade da água de rios',
                journalOrPublisher: 'DESA/UFMG, Belo Horizonte, 2. ed.',
                isbn: '978-8570412102',
                tier: 'derivation',
                abnt: 'VON SPERLING, M. Estudos e modelagem da qualidade da água de rios. 2. ed. Belo Horizonte: DESA/UFMG, 2014. (Princípios do tratamento biológico de águas residuárias, v. 7).',
            }),
            Object.freeze({
                authorYear: 'EPA (2008)',
                title: 'QUAL2K: A Modeling Framework for Simulating River and Stream Water Quality',
                journalOrPublisher: 'US EPA EPA/600/R-08/090',
                tier: 'numerical',
                abnt: 'UNITED STATES ENVIRONMENTAL PROTECTION AGENCY. QUAL2K: A Modeling Framework for Simulating River and Stream Water Quality. Washington, DC: EPA, 2008. (EPA/600/R-08/090).',
            }),
        ]),
        regulatoryBasis: Object.freeze([
            'CONAMA Resolução 357/2005 (classes de água doce + parâmetros)',
            'CONAMA Resolução 430/2011 (lançamento de efluentes)',
            'ANA Resolução 219/2003 (outorga + qualidade)',
        ]),
        limitations: Object.freeze([
            'QUAL2K assume regime permanente — não captura cargas pulso (chuva intensa)',
            'Múltiplos parâmetros simultâneos (OD + DBO + N + P + Chl-a) exigem calibração de k1-k20',
            'Não modela transporte de sedimentos + qualidade simultaneamente (acoplamento sedTransp)',
        ]),
        validation: Object.freeze({
            cheapTestCount: 3,
            lastVerifiedDate: '2026-05-30',
            validationNotes: 'tests/simulation-numerical.test.mjs vs Chapra 1997 + von Sperling 2014 + QUAL2K baseline',
        }),
    }),
});

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Retorna provenance completa de um solver.
 * Retorna null se solverId não cadastrado (caller deve mostrar fallback graceful).
 */
export function getProvenance(solverId: string | null | undefined): SolverProvenance | null {
    if (!solverId || typeof solverId !== 'string') return null;
    const entry = (SOLVER_PROVENANCE_REGISTRY as Record<string, SolverProvenance>)[solverId];
    return entry || null;
}

/**
 * Retorna lista de todos os solvers com provenance cadastrada.
 */
export function listSolversWithProvenance(): SolverId[] {
    return Object.keys(SOLVER_PROVENANCE_REGISTRY) as SolverId[];
}

/**
 * True se solver tem provenance completa (primary ref + at least 1 regulatory basis + validation > 0).
 * Usado para EIS dashboard mostrar badge "auditável" vs "sem fundamentação completa".
 */
export function isProvenanceComplete(solverId: string): boolean {
    const p = getProvenance(solverId);
    if (!p) return false;
    if (!p.primaryReference?.authorYear) return false;
    if (p.regulatoryBasis.length === 0) return false;
    if (p.validation.cheapTestCount === 0) return false;
    return true;
}

/**
 * Conta solvers com provenance vs total esperado.
 * Útil para dashboard coverage admin.
 */
export interface ProvenanceCoverage {
    cataloged: number;
    /** Total estimado em core/simulation/solvers/ (manual count) */
    totalAvailable: number;
    /** % coverage */
    pctCoverage: number;
    cataloged_ids: SolverId[];
}

export function getProvenanceCoverage(totalSolversInRepo = 31): ProvenanceCoverage {
    const ids = listSolversWithProvenance();
    return {
        cataloged: ids.length,
        totalAvailable: totalSolversInRepo,
        pctCoverage: Math.round((ids.length / totalSolversInRepo) * 100),
        cataloged_ids: ids,
    };
}

/**
 * Renderiza bibliografia completa de um solver em formato ABNT NBR 6023.
 * Útil para anexos de relatório (Calvin doutorando USP usa ABNT).
 */
export function renderBibliographyAbnt(solverId: string): string[] {
    const p = getProvenance(solverId);
    if (!p) return [];
    const refs: string[] = [p.primaryReference.abnt];
    for (const r of p.additionalReferences) {
        refs.push(r.abnt);
    }
    return refs;
}
