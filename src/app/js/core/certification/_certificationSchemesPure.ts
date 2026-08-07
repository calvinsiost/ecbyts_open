// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * CERT-STAMPS-001 / RF-1 — catálogo curado de ESQUEMAS de certificação.
 * SPEC: docs/specs/features/SPEC_ENVIRONMENTAL_CERTIFICATION_STAMPS.md (§3, §8 RF-1).
 *
 * ─── O que este módulo é (e o que não é) ───
 * É a RÉGUA: descreve o esquema (ISO 14001, LEED, FSC…) — sua semântica
 * temporal, seu tipo de atestação, sua escala, sua verificabilidade. NÃO é o
 * TROFÉU: o certificado concreto de um ativo (nº, emissor, vigência, status)
 * vive na estampa `certification` (RF-2), que aponta para cá por `schemeUri`.
 *
 * ─── Por que `temporalModel` é o campo central (SPEC §3) ───
 * "Selo" não é um objeto só: são cinco arquétipos com semântica temporal
 * INCOMPATÍVEL. Uma tabela única com `valid_until NOT NULL` obriga a INVENTAR
 * data de validade para um terço deles — selos PBGHG e CDP são por ciclo de
 * divulgação e não expiram; ISO 14064 é declaração cujo escopo É um período.
 * Data inventada é pior que ausente: ela é indistinguível de data real.
 * Por isso {@link schemeExpires} deriva do arquétipo em vez de assumir vigência.
 *
 * ─── `schemeUri` é a chave — NUNCA o nome de exibição (SPEC §8 RF-1) ───
 * Nomes colidem no mundo real: EDGE (edificações, IFC) × EDGE (equidade de
 * gênero); ASI (Aluminium Stewardship Initiative) × ASI (Accreditation Services
 * International, a acreditadora do FSC). Chavear por sigla funde dois esquemas
 * distintos silenciosamente. A chave é a URI oficial do esquema.
 *
 * ─── `source` obrigatório, e honesto (precedente `_odsIndicatorMapPure.ts`) ───
 * Todo esquema carrega `source`, nunca ''. A regra herdada de
 * `_scenarioSectorRatePure.ts` (CFG-17) vale igual aqui: a fonte descreve o que
 * está DE FATO no registro. Quando o dado vem de fonte primária lida, a fonte
 * primária é citada; quando é curadoria do projeto ancorada na spec, o `source`
 * diz isso com todas as letras em vez de vestir uma norma que não foi conferida.
 *
 * ─── Ausência é dado, não null (SPEC §4.12, §4.13) ───
 * `registryUrl: null` combinado com `verifiability: 'no_public_registry'` é uma
 * AFIRMAÇÃO — EDGE e AQUA-HQE não têm registro público completo. Não é campo
 * por preencher. Um esquema desconhecido resolve para `null` em
 * {@link getCertificationScheme}, jamais para um esquema fabricado.
 *
 * Puro — ZERO DOM, ZERO IO, determinístico. Tudo congelado.
 */

// ────────────────────────────────────────────────────────────────────────
// Vocabulários
// ────────────────────────────────────────────────────────────────────────

/**
 * Os cinco arquétipos temporais da SPEC §3. Discriminador que permite
 * `validUntil` NULLABLE sem transformar um terço do catálogo em exceção.
 *
 * - `expiring`                   certificado com data de expiração (ISO 14001, FSC)
 * - `per_cycle`                  nota por ciclo de divulgação; não expira (PBGHG, CDP)
 * - `period_scoped`              declaração cujo escopo É o período (ISO 14064)
 * - `perpetual_until_superseded` vale até ser substituído/retirado
 */
export type TemporalModel = 'expiring' | 'per_cycle' | 'period_scoped' | 'perpetual_until_superseded';

/** Natureza da atestação (alinhado ao `attestationType` do UNTP DCC, SPEC §6). */
export type AttestationType =
    | 'certification'
    | 'verification_statement'
    | 'label'
    | 'disclosure_score'
    | 'validation_state'
    | 'due_diligence_statement';

/**
 * Classificação ISO de rótulo ambiental. `not_an_ecolabel` é uma AFIRMAÇÃO
 * (norma de sistema de gestão não é rótulo); `unclassified` declara que a
 * classificação não foi curada — os dois não podem ser confundidos, porque o
 * gate anti-greenwashing (RF-5) precisa distinguir autodeclaração (Tipo II) de
 * atestação de terceira parte.
 */
export type LabelType =
    | 'iso_14024_type_i'
    | 'iso_14021_type_ii'
    | 'iso_14025_type_iii'
    | 'not_an_ecolabel'
    | 'unclassified';

/** Como o nível/nota do esquema é agregado (SPEC §8 RF-1). */
export type LevelAggregation = 'threshold' | 'min_vector' | 'gated' | 'score' | 'none';

/** Sobre O QUE o esquema se pronuncia. Confundir escopo é o erro clássico (SPEC §4.6). */
export type ScaleDomain =
    | 'organisation'
    | 'site'
    | 'product'
    | 'building'
    | 'land_parcel'
    | 'shipment';

/**
 * Quão verificável é a alegação por máquina (SPEC §4.12). "Não verificável por
 * máquina" é um DADO do esquema, não uma falha do nosso registro.
 */
export type Verifiability =
    | 'machine_readable_registry'
    | 'public_registry'
    | 'registry_partial'
    | 'no_public_registry';

/** Uma ficha de esquema de certificação. Congelada. */
export interface CertificationScheme {
    /** CHAVE estável — URI oficial do esquema. Nunca a sigla (colide, SPEC §8 RF-1). */
    readonly schemeUri: string;
    /** Nome de exibição. NÃO é chave: pode colidir entre esquemas distintos. */
    readonly displayName: string;
    /** Versão/edição do esquema referida por esta ficha. */
    readonly schemeVersion: string;
    /** Arquétipo temporal (SPEC §3) — governa se `validUntil` faz sentido. */
    readonly temporalModel: TemporalModel;
    readonly attestationType: AttestationType;
    readonly labelType: LabelType;
    /** Sobre o que o esquema se pronuncia. Nunca vazio. */
    readonly scaleDomain: readonly ScaleDomain[];
    readonly levelAggregation: LevelAggregation;
    readonly verifiability: Verifiability;
    /** Registro público, ou `null` quando o esquema NÃO tem um (afirmação, SPEC §4.12). */
    readonly registryUrl: string | null;
    /** Quem mantém o esquema. */
    readonly authority: string;
    /** Alcance geográfico ('global', 'BR', 'EU', 'US'). */
    readonly jurisdiction: string;
    /** Procedência do que está nesta ficha. Nunca ''. */
    readonly source: string;
}

// ────────────────────────────────────────────────────────────────────────
// Fontes
// ────────────────────────────────────────────────────────────────────────

const SPEC = 'SPEC_ENVIRONMENTAL_CERTIFICATION_STAMPS.md';

/**
 * Curadoria do projeto: a ficha (arquétipo temporal, escala, agregação) foi
 * derivada da §3/§8 da spec e do documento público do próprio esquema, sem
 * conferência de fonte primária campo a campo. Declarado como curadoria em vez
 * de vestir uma norma não conferida.
 */
function curated(section: string, detail: string): string {
    return `Curadoria do projeto, versionada — ${SPEC} ${section}. ${detail}`;
}

/** Fonte primária lida na íntegra na pesquisa que originou a spec (§11). */
function primary(document: string, detail: string): string {
    return `${document} (fonte primária, ${SPEC} §11). ${detail}`;
}

// ────────────────────────────────────────────────────────────────────────
// Catálogo curado — seeds v1 (SPEC §8 RF-1)
// ────────────────────────────────────────────────────────────────────────

function scheme(entry: CertificationScheme): CertificationScheme {
    return Object.freeze({ ...entry, scaleDomain: Object.freeze([...entry.scaleDomain]) });
}

const SEEDS: readonly CertificationScheme[] = Object.freeze([
    // ─── Score de divulgação por ciclo — NÃO expiram (SPEC §3) ───
    scheme({
        schemeUri: 'https://www.fgv.br/programabrasileiroghgprotocol',
        displayName: 'Programa Brasileiro GHG Protocol (selos)',
        schemeVersion: 'FAQ v1.3',
        temporalModel: 'per_cycle',
        attestationType: 'disclosure_score',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['organisation'],
        levelAggregation: 'gated',
        verifiability: 'public_registry',
        registryUrl: 'https://registropublicodeemissoes.fgv.br/',
        authority: 'FGV EAESP / Centro de Estudos em Sustentabilidade',
        jurisdiction: 'BR',
        source: primary(
            'FGV PBGHG FAQ v1.3',
            'Selo por ciclo de inventário (org, ano) — não expira. Ouro = Escopo 1+2 completo E verificado por OVV acreditado pelo INMETRO (Escopo 3 opcional; sua ausência não torna o inventário incompleto). Verificador não acreditado ⇒ Prata, nunca Ouro (Q51) — daí levelAggregation gated. Selos proibidos em produtos (Q34), daí scaleDomain só organisation.',
        ),
    }),
    scheme({
        schemeUri: 'https://www.cdp.net/',
        displayName: 'CDP',
        schemeVersion: 'Full Corporate Scoring 2025',
        temporalModel: 'per_cycle',
        attestationType: 'disclosure_score',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['organisation'],
        levelAggregation: 'score',
        verifiability: 'public_registry',
        registryUrl: 'https://www.cdp.net/en/responses',
        authority: 'CDP Worldwide',
        jurisdiction: 'global',
        source: primary(
            'CDP Full Corporate Scoring 2025',
            'Nota por ciclo anual — não expira. Escala A até D− em oito faixas; NÃO existe F. Não-respondente recebe o status "Failure to respond", não uma nota — estado adverso publicado, não ausência de dado (spec §4.13).',
        ),
    }),

    // ─── Declaração de verificação: o escopo É o período — NÃO expira (SPEC §3) ───
    scheme({
        schemeUri: 'https://www.iso.org/standard/66453.html',
        displayName: 'ISO 14064-1 (inventário de GEE da organização)',
        schemeVersion: '2018',
        temporalModel: 'period_scoped',
        attestationType: 'verification_statement',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['organisation'],
        levelAggregation: 'none',
        verifiability: 'no_public_registry',
        registryUrl: null,
        authority: 'ISO/TC 207/SC 7',
        jurisdiction: 'global',
        source: curated(
            '§3',
            'Declaração de verificação cujo escopo é o período inventariado: não tem data de expiração a atribuir (o par subjectPeriodStart/End da estampa é que carrega a semântica). Sem registro público central de declarações.',
        ),
    }),
    scheme({
        schemeUri: 'https://www.iso.org/standard/66455.html',
        displayName: 'ISO 14064-3 (verificação e validação de declarações de GEE)',
        schemeVersion: '2019',
        temporalModel: 'period_scoped',
        attestationType: 'verification_statement',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['organisation', 'product'],
        levelAggregation: 'none',
        verifiability: 'no_public_registry',
        registryUrl: null,
        authority: 'ISO/TC 207/SC 7',
        jurisdiction: 'global',
        source: curated(
            '§3, §4.5',
            'Declaração de período, não expira. Atenção de versão: a ABNT NBR ISO 14064-3:2007 foi cancelada em 12/2024 e ainda aparece citada em fluxos vivos — versão morta citada por esquema vivo.',
        ),
    }),
    scheme({
        schemeUri: 'https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en',
        displayName: 'EUDR — Declaração de Diligência Devida (DDS)',
        schemeVersion: 'Reg. (UE) 2023/1115, adiado por Reg. (UE) 2025/2650',
        temporalModel: 'period_scoped',
        attestationType: 'due_diligence_statement',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['shipment', 'land_parcel'],
        levelAggregation: 'none',
        verifiability: 'no_public_registry',
        registryUrl: null,
        authority: 'Comissão Europeia',
        jurisdiction: 'EU',
        source: primary(
            'EUDR Reg. (UE) 2023/1115 Art. 2/9 + Reg. (UE) 2025/2650',
            'ADIADO: grandes/médias empresas a partir de 30/12/2026; micro/pequenas 30/06/2027. DDS cobre uma colocação no mercado — escopo é a operação, não um período de validade. Geolocalização EPSG:4326 [lon,lat] com >=6 decimais; Ponto <=4 ha, Polígono >4 ha; Area SEMPRE explícita (Area omitida num Ponto é lida pelo sistema da UE como afirmação de 4 ha, não como desconhecido).',
        ),
    }),

    // ─── Certificação acreditada — expira (SPEC §3) ───
    scheme({
        schemeUri: 'https://www.iso.org/standard/88578.html',
        displayName: 'ISO 14001 (sistema de gestão ambiental)',
        schemeVersion: '2026',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['organisation', 'site'],
        levelAggregation: 'threshold',
        verifiability: 'registry_partial',
        registryUrl: 'https://www.iafcertsearch.org/',
        authority: 'ISO/TC 207/SC 1 (certificação por OC acreditado, ISO/IEC 17021-1)',
        jurisdiction: 'global',
        source: curated(
            '§2, §4.5',
            'ISO 14001:2026 publicada em 15/04/2026; ABNT NBR em 08/07/2026 (lag nacional ~3 meses). Duas datas de transição, não uma: sem novos certificados :2015 após 30/10/2027 e :2015 inválidos em 30/04/2029. A ISO não certifica ninguém — quem certifica é o OC acreditado.',
        ),
    }),
    scheme({
        schemeUri: 'https://www.iso.org/standard/69426.html',
        displayName: 'ISO 50001 (sistema de gestão de energia)',
        schemeVersion: '2018',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['organisation', 'site'],
        levelAggregation: 'threshold',
        verifiability: 'registry_partial',
        registryUrl: 'https://www.iafcertsearch.org/',
        authority: 'ISO/TC 301 (certificação por OC acreditado, ISO/IEC 17021-1)',
        jurisdiction: 'global',
        source: curated('§8 RF-1', 'Certificação de sistema de gestão sob ISO/IEC 17021-1, com ciclo de recertificação — expira.'),
    }),
    scheme({
        schemeUri: 'https://fsc.org/en',
        displayName: 'FSC (Forest Stewardship Council)',
        schemeVersion: 'v1',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'iso_14024_type_i',
        scaleDomain: ['organisation', 'site', 'product'],
        levelAggregation: 'threshold',
        verifiability: 'registry_partial',
        registryUrl: 'https://info.fsc.org/',
        authority: 'Forest Stewardship Council (acreditação por ASI)',
        jurisdiction: 'global',
        source: curated(
            '§4.2, §4.11, §4.12',
            'Registro público em migração — daí registry_partial. Verbatim do FSC: certificado suspenso continua VÁLIDO, mas não ATIVO, e a suspensão pode atingir parte do escopo (origem do par status/isActive + statusScope da estampa). Desassociação de grupo encerra todos os certificados do grupo corporativo.',
        ),
    }),
    scheme({
        schemeUri: 'https://responsiblesoy.org/',
        displayName: 'RTRS (Round Table on Responsible Soy)',
        schemeVersion: 'Procedure V5.1',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'iso_14024_type_i',
        scaleDomain: ['organisation', 'site', 'product'],
        levelAggregation: 'threshold',
        verifiability: 'public_registry',
        registryUrl: 'https://responsiblesoy.org/certificacion',
        authority: 'Round Table on Responsible Soy Association',
        jurisdiction: 'global',
        source: primary('RTRS Procedure V5.1', 'Certificação com ciclo de recertificação — expira.'),
    }),
    scheme({
        schemeUri: 'https://bonsucro.com/',
        displayName: 'Bonsucro',
        schemeVersion: 'v1',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'iso_14024_type_i',
        scaleDomain: ['organisation', 'site', 'product'],
        levelAggregation: 'threshold',
        verifiability: 'public_registry',
        registryUrl: 'https://bonsucro.com/certification-bodies/',
        authority: 'Bonsucro',
        jurisdiction: 'global',
        source: curated(
            '§4.7',
            'Reusa o MESMO código de certificado na recertificação — o código não é chave primária estável; a chave é (esquema, código, início do ciclo).',
        ),
    }),
    scheme({
        schemeUri: 'https://www.rainforest-alliance.org/',
        displayName: 'Rainforest Alliance',
        schemeVersion: '2020',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'iso_14024_type_i',
        scaleDomain: ['organisation', 'site', 'product'],
        levelAggregation: 'threshold',
        verifiability: 'registry_partial',
        registryUrl: 'https://www.rainforest-alliance.org/resource-item/certificate-search/',
        authority: 'Rainforest Alliance',
        jurisdiction: 'global',
        source: curated(
            '§4.8, §4.12',
            'DOIS RELÓGIOS: certificado de 3 anos × licença de 1 ano — origem do par certificateExpiry/nextObligationDue da estampa. Registro exposto num dashboard Power BI, não em API — daí registry_partial.',
        ),
    }),
    scheme({
        schemeUri: 'https://aluminium-stewardship.org/',
        displayName: 'ASI (Aluminium Stewardship Initiative)',
        schemeVersion: 'v3',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'iso_14024_type_i',
        scaleDomain: ['organisation', 'site', 'product'],
        levelAggregation: 'threshold',
        verifiability: 'public_registry',
        registryUrl: 'https://aluminium-stewardship.org/asi-certification/asi-certifications/',
        authority: 'Aluminium Stewardship Initiative',
        jurisdiction: 'global',
        source: curated(
            '§8 RF-1',
            'COLISÃO DE SIGLA que motiva a chave por URI: "ASI" aqui é Aluminium Stewardship Initiative; "ASI" também é a Accreditation Services International, a acreditadora do FSC — organizações distintas, mesma sigla.',
        ),
    }),
    scheme({
        schemeUri: 'https://www.bcorporation.net/',
        displayName: 'B Corp',
        schemeVersion: 'v1',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['organisation'],
        levelAggregation: 'score',
        verifiability: 'public_registry',
        registryUrl: 'https://www.bcorporation.net/en-us/find-a-b-corp/',
        authority: 'B Lab',
        jurisdiction: 'global',
        source: curated(
            '§4.6, §4.8',
            'Certifica A EMPRESA, NUNCA um produto — daí scaleDomain só organisation (exibir sobre um elemento físico seria confusão de escopo). Certificado de 3 anos × obrigações nos anos 0/3/5 (dois relógios).',
        ),
    }),

    // ─── Rótulo/nota sobre um objeto — expira, prazo varia (SPEC §3) ───
    scheme({
        schemeUri: 'https://www.gov.br/inmetro/pt-br/assuntos/avaliacao-da-conformidade/programa-brasileiro-de-etiquetagem',
        displayName: 'ENCE / PBE Edificações',
        schemeVersion: 'Portaria Inmetro 309/2022',
        temporalModel: 'expiring',
        attestationType: 'label',
        labelType: 'iso_14024_type_i',
        scaleDomain: ['building'],
        levelAggregation: 'score',
        verifiability: 'public_registry',
        registryUrl: 'https://www.gov.br/inmetro/pt-br',
        authority: 'Inmetro',
        jurisdiction: 'BR',
        source: primary(
            'Portaria Inmetro 309/2022',
            'Etiqueta sobre um objeto (a edificação), com faixas de classificação — expira e se renova por nova avaliação.',
        ),
    }),
    scheme({
        schemeUri: 'https://www.gov.br/mme/pt-br/assuntos/secretarias/sntep/procel',
        displayName: 'Selo Procel',
        schemeVersion: 'v1',
        temporalModel: 'expiring',
        attestationType: 'label',
        labelType: 'iso_14024_type_i',
        scaleDomain: ['product', 'building'],
        levelAggregation: 'score',
        verifiability: 'public_registry',
        registryUrl: 'https://www.gov.br/mme/pt-br/assuntos/secretarias/sntep/procel',
        authority: 'Eletrobras / Procel',
        jurisdiction: 'BR',
        source: curated('§8 RF-1', 'Selo de eficiência energética sobre um objeto — vinculado ao PBE/Inmetro, renovável.'),
    }),
    scheme({
        schemeUri: 'https://c2ccertified.org/',
        displayName: 'Cradle to Cradle Certified',
        schemeVersion: 'v4.0/v4.1',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'iso_14025_type_iii',
        scaleDomain: ['product'],
        levelAggregation: 'min_vector',
        verifiability: 'public_registry',
        registryUrl: 'https://c2ccertified.org/products/registry',
        authority: 'Cradle to Cradle Products Innovation Institute',
        jurisdiction: 'global',
        source: primary(
            'Cradle to Cradle Certified v4.0/v4.1',
            'O nível global é o MÍNIMO sobre cinco subnotas de categoria — não uma média. Média mascararia a subnota fraca; daí levelAggregation min_vector e o levelVector jsonb na estampa.',
        ),
    }),
    scheme({
        schemeUri: 'https://www.usgbc.org/leed',
        displayName: 'LEED',
        schemeVersion: 'v4.1',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'unclassified',
        scaleDomain: ['building'],
        levelAggregation: 'score',
        verifiability: 'public_registry',
        registryUrl: 'https://www.usgbc.org/projects',
        authority: 'U.S. Green Building Council / GBCI',
        jurisdiction: 'global',
        source: curated(
            '§4.8',
            'DOIS RELÓGIOS no LEED O+M: certificação de 3 anos × alimentação de dados no Arc com cadência anual.',
        ),
    }),
    scheme({
        schemeUri: 'https://bregroup.com/products/breeam',
        displayName: 'BREEAM',
        schemeVersion: 'v6',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'unclassified',
        scaleDomain: ['building'],
        levelAggregation: 'score',
        verifiability: 'public_registry',
        registryUrl: 'https://tools.breeam.com/projects/explore/buildings.jsp',
        authority: 'BRE Global',
        jurisdiction: 'global',
        source: curated('§4.8', 'DOIS RELÓGIOS no BREEAM In-Use: certificado de 3 anos × renovação anual.'),
    }),
    scheme({
        schemeUri: 'https://www.vertecertify.com/aqua-hqe/',
        displayName: 'AQUA-HQE',
        schemeVersion: 'v1',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'unclassified',
        scaleDomain: ['building', 'organisation'],
        levelAggregation: 'score',
        verifiability: 'no_public_registry',
        registryUrl: null,
        authority: 'Fundação Vanzolini',
        jurisdiction: 'BR',
        source: curated(
            '§4.6, §4.12',
            'Sem registro público completo — registryUrl null é AFIRMAÇÃO, não campo por preencher. Confusão de escopo concreta: no referencial MG2 quem é certificada é a INCORPORADORA, não cada unidade autônoma.',
        ),
    }),
    scheme({
        schemeUri: 'https://edgebuildings.com/',
        displayName: 'EDGE (Excellence in Design for Greater Efficiencies)',
        schemeVersion: 'v3',
        temporalModel: 'expiring',
        attestationType: 'certification',
        labelType: 'unclassified',
        scaleDomain: ['building'],
        levelAggregation: 'score',
        verifiability: 'no_public_registry',
        registryUrl: null,
        authority: 'IFC / Banco Mundial',
        jurisdiction: 'global',
        source: curated(
            '§4.9, §4.12',
            'Validade DERIVADA de COMO o critério foi atingido: EDGE Zero Carbon vale 4 anos se atendido on-site e 2 anos se via offsets — validityYears não é constante do esquema. Sem registro público completo. COLISÃO DE SIGLA que motiva a chave por URI: EDGE aqui é o de edificações (IFC); há outro EDGE de equidade de gênero.',
        ),
    }),
    scheme({
        schemeUri: 'https://www.energystar.gov/',
        displayName: 'ENERGY STAR',
        schemeVersion: 'v1',
        temporalModel: 'expiring',
        attestationType: 'label',
        labelType: 'iso_14024_type_i',
        scaleDomain: ['product', 'building'],
        levelAggregation: 'score',
        verifiability: 'public_registry',
        registryUrl: 'https://www.energystar.gov/productfinder',
        authority: 'U.S. EPA',
        jurisdiction: 'US',
        source: curated(
            '§8 RF-1',
            'Rótulo de eficiência sobre um objeto; a certificação de edificação é revalidada periodicamente.',
        ),
    }),

    // ─── Máquina de estados de validação (SPEC §3) ───
    scheme({
        schemeUri: 'https://sciencebasedtargets.org/',
        displayName: 'SBTi (Science Based Targets initiative)',
        schemeVersion: 'Commitment and Target Statuses v1.1',
        temporalModel: 'expiring',
        attestationType: 'validation_state',
        labelType: 'not_an_ecolabel',
        scaleDomain: ['organisation'],
        levelAggregation: 'none',
        verifiability: 'public_registry',
        registryUrl: 'https://sciencebasedtargets.org/companies-taking-action',
        authority: 'Science Based Targets initiative',
        jurisdiction: 'global',
        source: primary(
            'SBTi Commitment and Target Statuses v1.1 (dez/2025)',
            'Máquina de estados com validade de 5 anos. Separa Expired (lapso), Withdrawn (saída voluntária) e Removed (SANÇÃO por alegação enganosa) — colapsar os três perde a diferença entre vencimento e fraude.',
        ),
    }),
]);

/** Índice por `schemeUri`. Congelado. */
const BY_URI: Readonly<Record<string, CertificationScheme>> = Object.freeze(
    SEEDS.reduce<Record<string, CertificationScheme>>((acc, entry) => {
        acc[entry.schemeUri] = entry;
        return acc;
    }, {}),
);

/**
 * Catálogo curado de esquemas de certificação, indexado pela URI do esquema.
 * Congelado.
 */
export const CERTIFICATION_SCHEMES = BY_URI;

/**
 * Versão do catálogo curado — trilha de auditoria de qualquer mudança de
 * curadoria (mesmo papel de `ODS_INDICATOR_MAP_VERSION`). Default 1.
 */
export const CERTIFICATION_SCHEMES_VERSION = 1;

// ────────────────────────────────────────────────────────────────────────
// Consultas
// ────────────────────────────────────────────────────────────────────────

/**
 * Ficha do esquema pela URI. Esquema desconhecido resolve para `null` — nunca
 * para um esquema fabricado.
 * @param schemeUri URI do esquema (a chave; não a sigla).
 */
export function getCertificationScheme(schemeUri: string): CertificationScheme | null {
    if (typeof schemeUri !== 'string' || schemeUri === '') return null;
    return BY_URI[schemeUri] ?? null;
}

/** Todos os esquemas curados, em ordem estável de catálogo. Congelado. */
export function listCertificationSchemes(): readonly CertificationScheme[] {
    return SEEDS;
}

/** Esquemas de um dado arquétipo temporal. */
export function listSchemesByTemporalModel(model: TemporalModel): readonly CertificationScheme[] {
    return Object.freeze(SEEDS.filter((entry) => entry.temporalModel === model));
}

/**
 * Se uma vigência (`validUntil`) é semanticamente aplicável a este esquema.
 *
 * É a pergunta que a SPEC §3 existe para responder: só `expiring` tem data de
 * expiração. Para `per_cycle` e `period_scoped` uma data de validade teria de
 * ser INVENTADA — e data inventada é indistinguível de data real, o que é pior
 * que a ausência. Deriva do arquétipo; nunca assume vigência por default.
 */
export function schemeExpires(scheme: CertificationScheme | null): boolean {
    return scheme?.temporalModel === 'expiring';
}

/**
 * Se o esquema tem registro público que uma máquina possa consultar.
 * "Não verificável por máquina" é um dado do esquema (SPEC §4.12), não uma
 * falha do nosso registro — por isso é consultável em vez de silencioso.
 */
export function schemeIsMachineVerifiable(scheme: CertificationScheme | null): boolean {
    return scheme?.verifiability === 'machine_readable_registry';
}

/**
 * Se o esquema se pronuncia sobre a escala informada. Guarda contra a confusão
 * de escopo da SPEC §4.6 — exibir selo de organização sobre um elemento físico
 * como se fosse dele (B Corp certifica a empresa, nunca um produto).
 */
export function schemeCoversScale(scheme: CertificationScheme | null, scale: ScaleDomain): boolean {
    return scheme ? scheme.scaleDomain.includes(scale) : false;
}
