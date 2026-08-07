// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS CONTENT SEED — Training Module LMS (SPEC_TRAINING_MODULE_LMS)

   Catálogo curado de cursos de onboarding (Won't Have da spec: UGC —
   conteúdo é estritamente da equipe ecbyts). Offline-first by design:
   o seed vive no bundle, então o módulo funciona SEM o backend
   (quarentenado em `legacy` schema 2026-05-29 por não ter consumers).
   O sync remoto Supabase é uma fase posterior; o seed é o catálogo
   canônico inicial que torna o módulo ALCANÇÁVEL e ÚTIL hoje.

   Shape `training_*` (training/lesson/question) — o mesmo que o
   quizEngine, o trainingPanel e a migration original usam. NÃO usa o
   `lms_*` da SPEC ..._COMPLETE (divergência de nomenclatura resolvida
   a favor da realidade do código — ver reativação da spec §Registro).

   Conteúdo de domínio em PT-BR (regulação CONAMA/CETESB é nacional);
   labels de UI são i18n EN/PT/ES separados no painel.
   ================================================================ */

export interface SeedLesson {
    readonly id: string;
    readonly title: string;
    /**
     * 'written' (markdown) | 'video' (YouTube embed) | 'quiz' (fixo) |
     * 'interactive' (guided tour no app real) |
     * 'model-quiz' (pergunta gerada dos ELEMENTOS REAIS do modelo, ex.: "quais
     *  poços destacados estão acima do VR?" — destaca no 3D e corrige por dados).
     */
    readonly type:
        | 'written'
        | 'video'
        | 'quiz'
        | 'interactive'
        | 'model-quiz'
        | 'classify' // LMS-INTERACTIVE-ASSESS-001 F1: classifica faixa VR/VP/VI de poço real
        | 'interpret' // LMS-INTERACTIVE-ASSESS-001 F1: interpreta tendência (Mann-Kendall) real
        | 'case' // LMS-INTERACTIVE-ASSESS-001 F3: Caso Ambiental Interativo (ações + rubrica)
        | 'order-investigation' // F4 RF-9: escolher a investigação mais adequada agora
        | 'remediation-decision' // F4 RF-10: escolher a técnica de remediação adequada
        | 'emergency' // F5 RF-11: ordenar ações de resposta a emergência (com veto crítico)
        | 'checklist'; // F5 RF-12: ordenar um procedimento de campo
    /** id do caso (lições 'case') — resolvido em _caseCatalogPure. */
    readonly caseId?: string;
    /** id do cenário de decisão (order-investigation/remediation-decision) — _decisionCatalogPure. */
    readonly decisionId?: string;
    /** id do exercício de ordenação (emergency/checklist) — _orderingCatalogPure. */
    readonly exerciseId?: string;
    readonly order: number;
    /** markdown para 'written'/'interactive' (intro); null para 'quiz'/'video' */
    readonly markdown?: string | null;
    /** URL/ID do YouTube para 'video' (parseado por _youtubeEmbedPure). */
    readonly videoUrl?: string;
    /** legenda curta sob o vídeo (opcional). */
    readonly caption?: string;
    /** B6 (WCAG 1.2.2): transcrição textual do vídeo (markdown). */
    readonly transcript?: string;
    /** B6: URL de faixa de legendas (.vtt) — opcional, futuro. */
    readonly captionsUrl?: string;
    /**
     * ID do guided tour (utils/tour) para lições 'interactive': ao iniciar, o
     * painel fecha e o usuário pratica MANIPULANDO o próprio ecbyts (clicando
     * nos elementos reais da tela). Ao concluir o tour, a lição é marcada.
     */
    readonly tourId?: string;
    /** estimativa de leitura/execução em minutos (UX) */
    readonly minutes: number;
}

export interface SeedTraining {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly status: 'published';
    readonly pricing_type: 'free';
    readonly difficulty: 'beginner' | 'intermediate' | 'advanced';
    readonly category: string;
    readonly provider: string;
    readonly estimated_hours: number;
    readonly content_types: readonly string[];
    /**
     * Monetização (F6 marketplace): curso pode ser ofertado/comprado no
     * Library Marketplace. Default = gratuito (is_paid omitido/false). Para
     * cursos pagos: is_paid=true + price_cents>0. O seed é gratuito.
     */
    readonly is_paid?: boolean;
    readonly price_cents?: number;
    readonly lessons: readonly SeedLesson[];
    /** quiz final (validação §Should Have) — consumido pelo quizEngine */
    readonly quiz: {
        readonly lessonId: string;
        readonly passing_score: number;
        readonly questions: readonly any[];
    };
}

const ONBOARDING_CONFORMIDADE: SeedTraining = Object.freeze({
    id: 'onboarding-conformidade-ambiental',
    title: 'Onboarding de Conformidade Ambiental',
    description:
        'Trilha introdutória ao uso do ecbyts para análise de conformidade: ' +
        'modelo digital ambiental por campanha, limites CONAMA 420 (VP/VI/VR) e ' +
        'valores de referência CETESB. Conclui com quiz e certificado.',
    status: 'published',
    pricing_type: 'free',
    difficulty: 'beginner',
    category: 'compliance',
    provider: 'ecbyts',
    estimated_hours: 1,
    content_types: Object.freeze(['video', 'written', 'interactive', 'quiz']),
    lessons: Object.freeze([
        Object.freeze({
            id: 'lesson-welcome-video',
            title: 'Entenda o propósito do ecbyts em 3 minutos',
            type: 'video',
            order: 1,
            minutes: 3,
            videoUrl: '/assets/videos/ecbyts-productpresentation001.mp4',
            caption: 'Apresentação do produto ecbyts — modelo digital ambiental, campanhas, CONAMA 420 e avaliações.',
            transcript:
                '## Transcrição\n\n' +
                'Bem-vindo ao ecbyts. Esta apresentação mostra como criar um modelo digital ' +
                'ambiental por campanha, comparar medições com os limites CONAMA 420 ' +
                '(VR/VP/VI) e os valores de referência CETESB, e concluir com avaliações ' +
                'práticas sobre os dados do seu modelo.',
            markdown: null,
        }),
        Object.freeze({
            id: 'lesson-digital-model',
            title: 'Entenda seu sítio como modelo digital por campanha',
            type: 'written',
            order: 2,
            minutes: 8,
            markdown:
                '## O que é o modelo digital por campanha\n\n' +
                'O ecbyts cria um **modelo digital** de um sítio ambiental: um conjunto ' +
                'estruturado de elementos (poços, plumas, corpos d’água) com observações ' +
                'datadas por **campanha** de amostragem. Não é um "gêmeo" em tempo real — ' +
                'cada campanha é um instantâneo auditável, encadeado por proveniência assinada.\n\n' +
                '### Por que isso importa para conformidade\n\n' +
                '- Cada observação carrega **valor + unidade + incerteza** e a fonte.\n' +
                '- O encadeamento criptográfico torna a trilha de cálculo **auditável**.\n' +
                '- A comparação com limites regulatórios é reprodutível e citável.\n',
        }),
        Object.freeze({
            id: 'lesson-conama-420',
            title: 'Reconheça VR, VP e VI num laudo real',
            type: 'written',
            order: 3,
            minutes: 10,
            markdown:
                '## Limites da Resolução CONAMA 420\n\n' +
                'A Resolução CONAMA 420 define níveis de referência para solo e água ' +
                'subterrânea:\n\n' +
                '- **VR (Valor de Referência):** concentração natural de fundo (background).\n' +
                '- **VP (Valor de Prevenção):** acima dele, monitoramento é exigido.\n' +
                '- **VI (Valor de Intervenção):** acima dele, há risco — remediação exigida.\n\n' +
                'No ecbyts, cada parâmetro medido é comparado automaticamente contra ' +
                'VP/VI/VR da matriz aplicável, e a área é classificada conforme o resultado.\n',
        }),
        Object.freeze({
            id: 'lesson-cetesb-vr',
            title: 'Aplique os valores CETESB ao seu sítio',
            type: 'written',
            order: 4,
            minutes: 9,
            markdown:
                '## Valores CETESB (São Paulo)\n\n' +
                'A CETESB publica valores orientadores (DD-256/2016 e correlatas) usados ' +
                'como referência de limpeza no estado de São Paulo. Quando aplicável, eles ' +
                'complementam ou substituem os limites federais.\n\n' +
                '### CMA — Concentração Máxima Aceitável\n\n' +
                'Para áreas com avaliação de risco, a **CMA** é um limite específico do ' +
                'sítio derivado das campanhas — não um valor de tabela. O ecbyts mantém ' +
                'VP/VI/VR/CMA como entradas atômicas e autocontidas (`ThresholdEntry`).\n',
        }),
        Object.freeze({
            id: 'lesson-practice-add-element',
            title: 'Adicione seu 1º poço no app real',
            type: 'interactive',
            order: 5,
            minutes: 4,
            tourId: 'add-first-element',
            markdown:
                '## Pratique no próprio ecbyts\n\n' +
                'Agora você vai **manipular o app real**: um guia passo a passo aparece ' +
                'sobre a tela e mostra como adicionar seu primeiro elemento (um poço de ' +
                'monitoramento) clicando nos controles reais.\n\n' +
                '- O painel de treinamento fecha para liberar a tela.\n' +
                '- Siga o guia clicando nos elementos destacados.\n' +
                '- Ao concluir o guia, esta lição é marcada automaticamente.\n',
        }),
        Object.freeze({
            id: 'lesson-model-quiz',
            title: 'Encontre os poços acima do VR no seu modelo',
            type: 'model-quiz',
            order: 6,
            minutes: 4,
            markdown: null,
        }),
        Object.freeze({
            id: 'lesson-classify',
            title: 'Classifique a faixa regulatória de um poço',
            type: 'classify',
            order: 7,
            minutes: 4,
            markdown: null,
        }),
        Object.freeze({
            id: 'lesson-interpret',
            title: 'Interprete a tendência temporal (Mann-Kendall)',
            type: 'interpret',
            order: 8,
            minutes: 4,
            markdown: null,
        }),
        Object.freeze({
            id: 'lesson-case-btex',
            title: 'Resolva o caso: vazamento de BTEX num posto',
            type: 'case',
            caseId: 'case-posto-btex',
            order: 9,
            minutes: 10,
            markdown: null,
        }),
        Object.freeze({
            id: 'lesson-quiz',
            title: 'Comprove o que aprendeu e emita seu certificado',
            type: 'quiz',
            order: 10,
            minutes: 5,
            markdown: null,
        }),
    ]),
    quiz: Object.freeze({
        lessonId: 'lesson-quiz',
        passing_score: 70,
        questions: Object.freeze([
            Object.freeze({
                id: 'q-vi',
                type: 'multiple_choice_single',
                text: 'Acima de qual valor a CONAMA 420 exige remediação (risco identificado)?',
                options: Object.freeze([
                    Object.freeze({ id: 'a', text: 'VR — Valor de Referência' }),
                    Object.freeze({ id: 'b', text: 'VP — Valor de Prevenção' }),
                    Object.freeze({ id: 'c', text: 'VI — Valor de Intervenção' }),
                ]),
                correctOptionIds: Object.freeze(['c']),
            }),
            Object.freeze({
                id: 'q-vr',
                type: 'true_false',
                text: 'O VR (Valor de Referência) representa a concentração natural de fundo do solo.',
                correctAnswer: true,
            }),
            Object.freeze({
                id: 'q-cma',
                type: 'true_false',
                text: 'A CMA é um valor fixo de tabela, igual para qualquer sítio.',
                correctAnswer: false,
            }),
        ]),
    }),
});

const DECISAO_RESPOSTA_CAMPO: SeedTraining = Object.freeze({
    id: 'decisao-resposta-campo',
    title: 'Decisão e Resposta em Campo',
    description:
        'Trilha intermediária de raciocínio prático: escolher a investigação certa, ' +
        'decidir a técnica de remediação adequada, responder a uma emergência na ordem ' +
        'correta e executar um procedimento de campo. Avaliação por decisão, não por ' +
        'memorização — drills curtos que alimentam suas competências e badges.',
    status: 'published',
    pricing_type: 'free',
    difficulty: 'intermediate',
    category: 'operations',
    provider: 'ecbyts',
    estimated_hours: 1,
    content_types: Object.freeze(['order-investigation', 'remediation-decision', 'emergency', 'checklist']),
    lessons: Object.freeze([
        Object.freeze({
            id: 'lesson-order-investigation',
            title: 'Escolha a investigação certa para o momento',
            type: 'order-investigation',
            decisionId: 'dec-invest-btex',
            order: 1,
            minutes: 4,
            markdown: null,
        }),
        Object.freeze({
            id: 'lesson-remediation-decision',
            title: 'Decida a técnica de remediação adequada',
            type: 'remediation-decision',
            decisionId: 'dec-remediate-btex',
            order: 2,
            minutes: 5,
            markdown: null,
        }),
        Object.freeze({
            id: 'lesson-emergency',
            title: 'Responda ao vazamento na ordem certa',
            type: 'emergency',
            exerciseId: 'order-emergency-fuel-spill',
            order: 3,
            minutes: 5,
            markdown: null,
        }),
        Object.freeze({
            id: 'lesson-checklist',
            title: 'Execute a purga e amostragem de poço sem erros',
            type: 'checklist',
            exerciseId: 'order-checklist-well-purge',
            order: 4,
            minutes: 5,
            markdown: null,
        }),
    ]),
    quiz: Object.freeze({
        lessonId: '',
        passing_score: 70,
        questions: Object.freeze([]),
    }),
});

/** Catálogo seed canônico (frozen). */
export const TRAINING_CATALOG_SEED: readonly SeedTraining[] = Object.freeze([
    ONBOARDING_CONFORMIDADE,
    DECISAO_RESPOSTA_CAMPO,
]);

/** Retorna o catálogo seed (cópia rasa segura para consumo). */
export function getCatalogSeed(): readonly SeedTraining[] {
    return TRAINING_CATALOG_SEED;
}

/** Busca um training do seed por id. */
export function getTrainingById(id: string): SeedTraining | null {
    return TRAINING_CATALOG_SEED.find((tr) => tr.id === id) || null;
}

/** Lições (ordenadas) de um training. */
export function getLessonsForTraining(id: string): readonly SeedLesson[] {
    const tr = getTrainingById(id);
    if (!tr) return [];
    return [...tr.lessons].sort((a, b) => a.order - b.order);
}

/** ids de lição (ordenados) — base para computeLessonProgress. */
export function listLessonIds(id: string): readonly string[] {
    return getLessonsForTraining(id).map((l) => l.id);
}

/** Quiz de um training (ou null). */
export function getQuizForTraining(id: string): SeedTraining['quiz'] | null {
    return getTrainingById(id)?.quiz || null;
}
