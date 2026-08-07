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
   TIPOS DE ESTAMPAS (STAMP TYPES)
   ================================================================

   Define os tipos de estampas que podem ser aplicadas a ativos.
   Estampas sao metadados de governanca, contexto e reporte.

   CATEGORIAS:
   - governance: RT, responsavel legal, assinatura digital
   - context: campanha, coordenadas, area, periodo
   - reporting: GRI, ESG, H&S, ODS

   ================================================================ */

// ----------------------------------------------------------------
// CATEGORIAS DE ESTAMPAS
// ----------------------------------------------------------------

/**
 * Categorias principais de estampas.
 */
export const STAMP_CATEGORIES = {
    governance: {
        id: 'governance',
        name: 'Governanca',
        description: 'Responsabilidades e assinaturas',
        color: '#9C27B0', // Roxo
        icon: 'lock',
    },
    context: {
        id: 'context',
        name: 'Contexto',
        description: 'Localizacao, tempo e campanha',
        color: '#2196F3', // Azul
        icon: 'map-pin',
    },
    reporting: {
        id: 'reporting',
        name: 'Reporte',
        description: 'Indicadores e frameworks',
        color: '#4CAF50', // Verde
        icon: 'bar-chart',
    },
};

// ----------------------------------------------------------------
// TIPOS DE ESTAMPAS DE GOVERNANCA
// ----------------------------------------------------------------

export const GOVERNANCE_STAMP_TYPES = {
    responsible_technical: {
        id: 'responsible_technical',
        category: 'governance',
        name: 'Responsavel Tecnico',
        description: 'RT responsavel pelo ativo',
        icon: 'hardhat',
        schema: {
            name: { type: 'string', required: true, label: 'Nome' },
            role: { type: 'string', required: true, label: 'Cargo' },
            registration: { type: 'string', required: true, label: 'Registro (CREA/CRQ)' },
            validUntil: { type: 'date', required: false, label: 'Validade' },
        },
    },
    responsible_legal: {
        id: 'responsible_legal',
        category: 'governance',
        name: 'Responsavel Legal',
        description: 'Responsavel legal pela empresa',
        icon: 'user',
        schema: {
            name: { type: 'string', required: true, label: 'Nome' },
            cpf: { type: 'string', required: true, label: 'CPF' },
            role: { type: 'string', required: true, label: 'Cargo' },
        },
    },
    digital_signature: {
        id: 'digital_signature',
        category: 'governance',
        name: 'Assinatura Digital',
        description: 'Assinatura ECDSA do documento',
        icon: 'pen-sign',
        schema: {
            keyId: { type: 'string', required: true, label: 'ID da Chave' },
            signature: { type: 'string', required: true, label: 'Assinatura' },
            timestamp: { type: 'datetime', required: true, label: 'Data/Hora' },
            algorithm: { type: 'string', required: false, label: 'Algoritmo', default: 'ECDSA-P256' },
        },
    },
    approval: {
        id: 'approval',
        category: 'governance',
        name: 'Aprovacao',
        description: 'Status de aprovacao do ativo',
        icon: 'check-circle',
        schema: {
            status: {
                type: 'enum',
                required: true,
                label: 'Status',
                options: ['pending', 'approved', 'rejected', 'revision'],
            },
            approver: { type: 'string', required: true, label: 'Aprovador' },
            date: { type: 'date', required: true, label: 'Data' },
            comments: { type: 'text', required: false, label: 'Comentarios' },
        },
    },
    audit_status: {
        id: 'audit_status',
        category: 'governance',
        name: 'Status de Auditoria',
        description: 'Resultado de auditoria externa',
        icon: 'search',
        schema: {
            auditor: { type: 'string', required: true, label: 'Auditor' },
            result: {
                type: 'enum',
                required: true,
                label: 'Resultado',
                options: ['conforming', 'minor_nc', 'major_nc', 'observation'],
            },
            findings: { type: 'text', required: false, label: 'Constatacoes' },
            auditDate: { type: 'date', required: true, label: 'Data da Auditoria' },
        },
    },
};

// ----------------------------------------------------------------
// TIPOS DE ESTAMPAS DE CONTEXTO
// ----------------------------------------------------------------

export const CONTEXT_STAMP_TYPES = {
    environmental_classification: {
        id: 'environmental_classification',
        category: 'context',
        name: 'Passivo / Ativo Ambiental',
        description: 'Classifica o elemento como passivo ambiental (obrigacao) ou ativo ambiental (recurso)',
        icon: 'alert-triangle',
        schema: {
            type: { type: 'enum', required: true, label: 'Tipo', options: ['Passivo Ambiental', 'Ativo Ambiental'] },
            description: { type: 'text', required: false, label: 'Descricao / Justificativa' },
        },
    },
    campaign: {
        id: 'campaign',
        category: 'context',
        name: 'Campanha',
        description: 'Campanha de monitoramento associada',
        icon: 'clipboard',
        schema: {
            campaignId: { type: 'string', required: true, label: 'ID da Campanha' },
            name: { type: 'string', required: true, label: 'Nome' },
            date: { type: 'date', required: true, label: 'Data' },
            type: {
                type: 'enum',
                required: false,
                label: 'Tipo',
                options: ['routine', 'incident', 'baseline', 'closure'],
            },
        },
    },
    coordinates: {
        id: 'coordinates',
        category: 'context',
        name: 'Coordenadas',
        description: 'Geolocalizacao do ativo',
        icon: 'globe',
        schema: {
            lat: { type: 'number', required: true, label: 'Latitude' },
            lon: { type: 'number', required: true, label: 'Longitude' },
            utm_e: { type: 'number', required: false, label: 'UTM Leste' },
            utm_n: { type: 'number', required: false, label: 'UTM Norte' },
            zone: { type: 'string', required: false, label: 'Zona UTM' },
            datum: { type: 'string', required: false, label: 'Datum', default: 'SIRGAS2000' },
        },
    },
    project_area: {
        id: 'project_area',
        category: 'context',
        name: 'Area do Projeto',
        description: 'Hierarquia de areas',
        icon: 'factory',
        schema: {
            areaId: { type: 'string', required: true, label: 'ID da Area' },
            name: { type: 'string', required: true, label: 'Nome' },
            hierarchy: { type: 'string', required: false, label: 'Hierarquia' },
        },
    },
    temporal: {
        id: 'temporal',
        category: 'context',
        name: 'Periodo Temporal',
        description: 'Periodo de validade ou referencia',
        icon: 'clock',
        schema: {
            start: { type: 'date', required: true, label: 'Inicio' },
            end: { type: 'date', required: false, label: 'Fim' },
            frequency: {
                type: 'enum',
                required: false,
                label: 'Frequencia',
                options: ['daily', 'weekly', 'monthly', 'quarterly', 'annual'],
            },
        },
    },
    regulatory: {
        id: 'regulatory',
        category: 'context',
        name: 'Norma Aplicavel',
        description: 'Norma ou regulamento de referencia',
        icon: 'docs',
        schema: {
            norm: { type: 'string', required: true, label: 'Norma' },
            version: { type: 'string', required: false, label: 'Versao' },
            article: { type: 'string', required: false, label: 'Artigo/Secao' },
            jurisdiction: { type: 'string', required: false, label: 'Jurisdicao' },
        },
    },
    employee_id: {
        id: 'employee_id',
        category: 'context',
        name: 'Matricula',
        description: 'Identificacao de colaborador',
        icon: 'tag',
        schema: {
            registration: { type: 'string', required: true, label: 'Matricula' },
            department: { type: 'string', required: false, label: 'Departamento' },
            costCenter: { type: 'string', required: false, label: 'Centro de Custo' },
        },
    },
    specimen_tag: {
        id: 'specimen_tag',
        category: 'context',
        name: 'Tag de Especime',
        description: 'Identificacao de arvore ou animal',
        icon: 'tag',
        schema: {
            tagId: { type: 'string', required: true, label: 'ID do Tag' },
            tagType: {
                type: 'enum',
                required: false,
                label: 'Tipo',
                options: ['collar', 'ring', 'microchip', 'plate'],
            },
            installDate: { type: 'date', required: false, label: 'Data Instalacao' },
        },
    },
    monitoring_condition: {
        id: 'monitoring_condition',
        category: 'context',
        name: 'Condicionante de Monitoramento',
        description:
            'Categoria X da condicionante ambiental: tema + funcao + regime. ' +
            'Nao duplica a periodicidade (ver estampa temporal.frequency); regime aqui ' +
            'e sobre ter ou nao prazo-fim, nao sobre a cadencia.',
        icon: 'alert-triangle',
        schema: {
            theme: {
                type: 'enum',
                required: true,
                label: 'Tema',
                options: [
                    'agua',
                    'ar',
                    'ruido',
                    'fauna',
                    'flora',
                    'residuos_efluentes',
                    'solo',
                    'social',
                    'compensacao',
                ],
            },
            function: {
                type: 'enum',
                required: true,
                label: 'Funcao',
                options: ['preventiva', 'mitigadora', 'compensatoria'],
            },
            regime: {
                type: 'enum',
                required: true,
                label: 'Regime',
                options: ['prazo_fixo', 'continua'],
            },
            classification: {
                type: 'enum',
                required: true,
                label: 'Classificacao',
                options: ['passive'],
                default: 'passive',
            },
        },
    },
};

// ----------------------------------------------------------------
// TIPOS DE ESTAMPAS DE REPORTE
// ----------------------------------------------------------------

export const REPORTING_STAMP_TYPES = {
    gri: {
        id: 'gri',
        category: 'reporting',
        name: 'GRI',
        description: 'Indicador Global Reporting Initiative',
        icon: 'bar-chart',
        schema: {
            standard: { type: 'string', required: true, label: 'Padrao (ex: GRI 303)' },
            disclosure: { type: 'string', required: true, label: 'Divulgacao (ex: 303-1)' },
            topic: { type: 'string', required: false, label: 'Topico' },
        },
    },
    esg_category: {
        id: 'esg_category',
        category: 'reporting',
        name: 'Categoria ESG',
        description: 'Classificacao ESG',
        icon: 'tree',
        schema: {
            pillar: { type: 'enum', required: true, label: 'Pilar', options: ['E', 'S', 'G'] },
            category: { type: 'string', required: true, label: 'Categoria' },
            subcategory: { type: 'string', required: false, label: 'Subcategoria' },
        },
    },
    hs_metric: {
        id: 'hs_metric',
        category: 'reporting',
        name: 'Metrica H&S',
        description: 'Metrica de Saude e Seguranca',
        icon: 'shield',
        schema: {
            metricType: {
                type: 'enum',
                required: true,
                label: 'Tipo',
                options: ['frequency', 'severity', 'ltir', 'trir', 'near_miss'],
            },
            calculation: { type: 'string', required: false, label: 'Metodo de Calculo' },
            baseline: { type: 'number', required: false, label: 'Baseline' },
            target: { type: 'number', required: false, label: 'Meta' },
        },
    },
    sdg: {
        id: 'sdg',
        category: 'reporting',
        name: 'ODS',
        description: 'Objetivo de Desenvolvimento Sustentavel',
        icon: 'target',
        schema: {
            goal: { type: 'number', required: true, label: 'ODS (1-17)', min: 1, max: 17 },
            target: { type: 'string', required: false, label: 'Meta' },
            indicator: { type: 'string', required: false, label: 'Indicador' },
        },
    },
    benchmark: {
        id: 'benchmark',
        category: 'reporting',
        name: 'Benchmark',
        description: 'Comparativo com referencia externa',
        icon: 'bar-chart',
        schema: {
            source: { type: 'string', required: true, label: 'Fonte' },
            value: { type: 'number', required: true, label: 'Valor' },
            percentile: { type: 'number', required: false, label: 'Percentil', min: 0, max: 100 },
            year: { type: 'number', required: false, label: 'Ano' },
        },
    },
    biodiversity: {
        id: 'biodiversity',
        category: 'reporting',
        name: 'Biodiversidade',
        description: 'Indicador de biodiversidade',
        icon: 'tree',
        schema: {
            iucnStatus: {
                type: 'enum',
                required: false,
                label: 'Status IUCN',
                options: ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD', 'NE'],
            },
            endemism: { type: 'boolean', required: false, label: 'Endemica' },
            protectedStatus: { type: 'boolean', required: false, label: 'Protegida' },
            cites: { type: 'enum', required: false, label: 'CITES', options: ['I', 'II', 'III', 'none'] },
        },
    },
    // ────────────────────────────────────────────────────────────────
    // CERT-STAMPS-001 RF-2 — certificacao de terceira parte
    // SPEC: docs/specs/features/SPEC_ENVIRONMENTAL_CERTIFICATION_STAMPS.md §8 RF-2
    //
    // Ancorar aqui (e nao numa entidade nova) ganha de graca: validacao de
    // schema, CRUD, findByStamp, export/import .ecbt, painel de UI e expiresAt.
    // O ESQUEMA (a regua: ISO 14001, LEED...) vive no catalogo do RF-1
    // (core/certification/_certificationSchemesPure.ts); aqui fica o CERTIFICADO
    // concreto do ativo (o trofeu), ligado por schemeUri.
    //
    // Tres pontos que quase todo mundo erra, e que o campo minimo abaixo separa:
    //
    //  1. verifiedBy e DISTINTO de issuedBy. O selo Ouro do PBGHG depende
    //     exatamente disso — quem emite o selo nao e quem verifica o inventario.
    //  2. verifierAccreditedBy + accreditationStatus e um TERCEIRO campo, nao um
    //     detalhe do verificador: verificador nao acreditado pelo INMETRO da
    //     Prata, nunca Ouro. E a acreditacao e MUTAVEL (escopos podem ser
    //     cancelados a qualquer tempo) — o papel nunca e autoritativo.
    //  3. status e isActive sao ORTOGONAIS. Verbatim do FSC: um certificado
    //     suspenso continua VALIDO, mas nao ATIVO — e a suspensao pode atingir
    //     "all or part of" o escopo (dai statusScope). Um booleano isValid nao
    //     expressa isso, e colapsar os status perderia a diferenca entre
    //     vencimento (expired) e sancao por alegacao enganosa (removed).
    //
    // validUntil e OPCIONAL de proposito: dos 22 esquemas do catalogo, 5 nao
    // expiram (PBGHG e CDP sao por ciclo; ISO 14064 e EUDR tem o periodo como
    // escopo). Exigir data aqui obrigaria a INVENTAR vigencia — e data
    // inventada e indistinguivel de data real.
    // ────────────────────────────────────────────────────────────────
    certification: {
        id: 'certification',
        category: 'reporting',
        name: 'Certificacao',
        description: 'Certificado, rotulo ou declaracao de terceira parte sobre o ativo',
        icon: 'shield',
        schema: {
            // ─── Esquema (liga ao catalogo do RF-1) ───
            schemeUri: { type: 'string', required: true, label: 'URI do esquema' },
            schemeVersion: { type: 'string', required: false, label: 'Versao do esquema' },
            // ─── Identificadores. Nao obrigatorios: nota por ciclo (PBGHG/CDP)
            //     nao tem numero de certificado; a licenca e o segundo relogio. ───
            certificateId: { type: 'string', required: false, label: 'No do certificado' },
            licenceId: { type: 'string', required: false, label: 'No da licenca' },
            // ─── Quem emitiu x quem verificou x quem acreditou o verificador ───
            issuedBy: { type: 'string', required: true, label: 'Emissor (organismo certificador)' },
            verifiedBy: { type: 'string', required: false, label: 'Verificador (distinto do emissor)' },
            verifierAccreditedBy: { type: 'string', required: false, label: 'Acreditador do verificador' },
            accreditationStatus: {
                type: 'enum',
                required: false,
                label: 'Status da acreditacao',
                options: ['accredited', 'not_accredited', 'suspended', 'withdrawn', 'unknown'],
            },
            assessorLevel: {
                type: 'enum',
                required: false,
                label: 'Nivel do avaliador',
                options: ['first_party', 'second_party', 'third_party'],
            },
            attestationType: {
                type: 'enum',
                required: false,
                label: 'Tipo de atestacao',
                options: [
                    'certification',
                    'verification_statement',
                    'label',
                    'disclosure_score',
                    'validation_state',
                    'due_diligence_statement',
                ],
            },
            // ─── Sujeito e escopo. Confundir escopo e o erro classico:
            //     B Corp certifica a EMPRESA, nunca o produto. ───
            subjectType: {
                type: 'enum',
                required: true,
                label: 'Tipo de sujeito',
                options: ['organisation', 'site', 'product', 'building', 'land_parcel', 'shipment'],
            },
            subjectId: { type: 'string', required: false, label: 'Identificador do sujeito' },
            scopeStatement: { type: 'text', required: false, label: 'Declaracao de escopo' },
            scopeSites: { type: 'array', itemType: 'string', required: false, label: 'Sites no escopo' },
            // ─── Temporalidade. validUntil NULLABLE (ver nota acima). ───
            validFrom: { type: 'date', required: false, label: 'Valido desde' },
            validUntil: { type: 'date', required: false, label: 'Valido ate (vazio = nao expira)' },
            subjectPeriodStart: { type: 'date', required: false, label: 'Inicio do periodo declarado' },
            subjectPeriodEnd: { type: 'date', required: false, label: 'Fim do periodo declarado' },
            issuedAt: { type: 'date', required: false, label: 'Data de emissao' },
            publishedAt: { type: 'date', required: false, label: 'Data de publicacao' },
            auditDate: { type: 'date', required: false, label: 'Data da auditoria' },
            // ─── Estado. status e isActive sao ortogonais (ver nota acima). ───
            status: {
                type: 'enum',
                required: true,
                label: 'Status',
                options: [
                    'granted',
                    'maintained',
                    'renewed',
                    'suspended',
                    'restored',
                    'withdrawn',
                    'expired',
                    'removed',
                ],
            },
            isActive: { type: 'boolean', required: true, label: 'Ativo' },
            statusScope: {
                type: 'enum',
                required: false,
                label: 'Abrangencia do status',
                options: ['full', 'partial'],
            },
            // ─── Nivel/nota. levelVector guarda as subnotas porque o C2C agrega
            //     por MINIMO — uma media mascararia a subnota fraca. ───
            levelCode: { type: 'string', required: false, label: 'Codigo do nivel' },
            levelRank: { type: 'number', required: false, label: 'Posicao do nivel' },
            levelVector: { type: 'object', required: false, label: 'Subnotas por categoria' },
            // ─── Cadeia de custodia (ISO 22095). book_and_claim liga o atributo
            //     ADMINISTRATIVAMENTE, nao fisicamente — colorir a cena 3D por
            //     ele seria afirmacao factualmente errada sobre aquele objeto. ───
            cocModel: {
                type: 'enum',
                required: false,
                label: 'Modelo de cadeia de custodia',
                options: [
                    'identity_preserved',
                    'segregated',
                    'controlled_blending',
                    'mass_balance',
                    'book_and_claim',
                    'not_applicable',
                ],
            },
            // ─── Prova ───
            evidenceUrl: { type: 'string', required: false, label: 'URL da evidencia' },
            evidenceHash: { type: 'string', required: false, label: 'Hash da evidencia' },
            verifyUrl: { type: 'string', required: false, label: 'URL de verificacao no registro' },
            // ─── Sucessao: recertificacao/suspensao/revogacao = NOVA estampa,
            //     a anterior permanece (trilha append-only, RF-3). ───
            supersedes: { type: 'string', required: false, label: 'Substitui a estampa' },
            supersededBy: { type: 'string', required: false, label: 'Substituida pela estampa' },
            // ─── Bitemporal: registros do PBGHG sao retroativamente
            //     retificaveis; sem tempo de transacao nao se responde
            //     "o que exibiamos em marco?". ───
            recordValidFrom: { type: 'datetime', required: false, label: 'Registro valido desde' },
            recordValidTo: { type: 'datetime', required: false, label: 'Registro valido ate' },
        },
    },
};

// ----------------------------------------------------------------
// AGREGACAO DE TODOS OS TIPOS
// ----------------------------------------------------------------

/**
 * Todos os tipos de estampas indexados por ID.
 */
export const STAMP_TYPES = {
    ...GOVERNANCE_STAMP_TYPES,
    ...CONTEXT_STAMP_TYPES,
    ...REPORTING_STAMP_TYPES,
};

/**
 * Obtem tipo de estampa por ID.
 * @param typeId - ID do tipo
 */
export function getStampType(typeId: string): Record<string, any> | null {
    return (STAMP_TYPES as Record<string, any>)[typeId] || null;
}

/**
 * Obtem tipos de estampa por categoria.
 * @param category - governance|context|reporting
 */
export function getStampTypesByCategory(category: string): Record<string, any>[] {
    return Object.values(STAMP_TYPES).filter((t: any) => t.category === category);
}

/**
 * Valida valor de estampa contra schema.
 * @param typeId - ID do tipo
 * @param value - Valor a validar
 */
export function validateStampValue(
    typeId: string,
    value: Record<string, any>,
): { valid: boolean; errors: string[] } {
    const stampType = getStampType(typeId);
    if (!stampType) {
        return { valid: false, errors: [`Tipo de estampa desconhecido: ${typeId}`] };
    }

    const errors: string[] = [];
    const schema = (stampType as any).schema;
    const valueRecord = value as Record<string, any>;

    for (const [field, rules] of Object.entries(schema) as Array<[string, any]>) {
        const fieldValue = valueRecord[field];

        // Verificar campo obrigatorio
        if (rules.required && (fieldValue === undefined || fieldValue === null || fieldValue === '')) {
            errors.push(`Campo obrigatorio: ${rules.label || field}`);
            continue;
        }

        // Pular validacao se campo vazio e nao obrigatorio
        if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
            continue;
        }

        // Validar tipo
        switch (rules.type) {
            case 'string':
            case 'text':
                if (typeof fieldValue !== 'string') {
                    errors.push(`${rules.label || field} deve ser texto`);
                }
                break;
            case 'number':
                if (typeof fieldValue !== 'number' || isNaN(fieldValue)) {
                    errors.push(`${rules.label || field} deve ser numero`);
                } else {
                    if (rules.min !== undefined && fieldValue < rules.min) {
                        errors.push(`${rules.label || field} deve ser >= ${rules.min}`);
                    }
                    if (rules.max !== undefined && fieldValue > rules.max) {
                        errors.push(`${rules.label || field} deve ser <= ${rules.max}`);
                    }
                }
                break;
            case 'boolean':
                if (typeof fieldValue !== 'boolean') {
                    errors.push(`${rules.label || field} deve ser booleano`);
                }
                break;
            case 'enum':
                if (!rules.options.includes(fieldValue)) {
                    errors.push(`${rules.label || field} deve ser um de: ${rules.options.join(', ')}`);
                }
                break;
            case 'date':
            case 'datetime':
                if (isNaN(Date.parse(fieldValue))) {
                    errors.push(`${rules.label || field} deve ser data valida`);
                }
                break;
            // CERT-STAMPS-001 RF-2: a estampa de certificacao tem campos que nao
            // sao escalares — scopeSites[] (a suspensao pode atingir PARTE do
            // escopo) e levelVector (o C2C agrega por MINIMO sobre 5 subnotas).
            // Sem estes dois ramos o switch caía no vazio e o campo passava sem
            // validacao nenhuma, que e pior que recusar: parece validado.
            case 'array':
                if (!Array.isArray(fieldValue)) {
                    errors.push(`${rules.label || field} deve ser lista`);
                } else if (rules.itemType === 'string' && fieldValue.some((item: any) => typeof item !== 'string')) {
                    errors.push(`${rules.label || field} deve conter apenas texto`);
                }
                break;
            case 'object':
                if (typeof fieldValue !== 'object' || fieldValue === null || Array.isArray(fieldValue)) {
                    errors.push(`${rules.label || field} deve ser objeto`);
                }
                break;
        }
    }

    return { valid: errors.length === 0, errors };
}
