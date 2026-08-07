// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/utils/handlers/libraries.js in ARCH-MONO-001 Phase 7a.
//
// Market v2 i18n message catalog + category/mode/visibility option lists.
// Pure data consumed by libraries.js handler render functions.

export const MARKET_MESSAGE_MAP = {
    eco1_key_required: 'Informe a chave ECBT para continuar.',
    title_and_description_required: 'Preencha titulo e descricao para continuar.',
    payload_too_large: 'Os dados tecnicos estao muito grandes. Reduza e tente novamente.',
    invalid_payload_json: 'Os dados tecnicos estao em formato invalido. Revise o JSON.',
    main_file_required: 'Preencha os dados obrigatorios do arquivo principal.',
    fixed_price_required: 'Informe um preco fixo valido para continuar.',
    access_list_required: 'Informe ao menos um usuario permitido para visibilidade restrita.',
    institution_pct_requires_institution: 'Escolha uma instituicao para usar percentual de apoio.',
    institution_pct_out_of_range: 'O percentual de apoio deve ficar entre 1 e 50.',
    consent_required: 'Marque o consentimento para publicar o anuncio.',
    search_failed: 'Nao foi possivel carregar os anuncios agora.',
    notifications_error: 'Nao foi possivel carregar as notificacoes agora.',
    dashboard_error: 'Nao foi possivel carregar o painel agora.',
    buy_failed: 'Nao foi possivel concluir a compra agora.',
    credit_generate_failed: 'Nao foi possivel gerar creditos EIC agora.',
    credit_retire_failed: 'Nao foi possivel retirar creditos EIC agora.',
    credit_bronze_not_listable: 'EIC-Bronze e para uso interno e nao pode ser listado no marketplace.',
    credit_split_must_sum_100: 'Split de creditos invalido: contratante + contratado deve somar 100%.',
    credit_split_contractor_invalid: 'Percentual do contratante invalido para split de creditos.',
    credit_split_contracted_invalid: 'Percentual do contratado invalido para split de creditos.',
    credit_agreement_required: 'Nenhum credit_agreement ativo encontrado para gerar creditos EIC.',
    credit_delta_below_threshold: 'Delta EIS abaixo do minimo (0.10). Nenhum credito gerado.',
    credit_deficit_state: 'Scope em deficit state. Novos mints bloqueados ate recuperar EIS.',
    rfq_failed: 'Nao foi possivel enviar a proposta agora.',
    publish_failed: 'Nao foi possivel publicar o anuncio agora.',
    listing_create_failed: 'Nao foi possivel criar o anuncio agora.',
    notification_update_failed: 'Nao foi possivel atualizar a notificacao agora.',
    moderation_failed: 'Nao foi possivel registrar a moderacao agora.',
    resolve_dispute_failed: 'Nao foi possivel resolver a disputa agora.',
    review_requires_paid_relation: 'A avaliacao so fica disponivel apos pagamento.',
    review_already_submitted: 'Voce ja enviou avaliacao para esta relacao.',
    review_submit_failed: 'Nao foi possivel enviar a avaliacao agora.',
    webhook_replay_failed: 'Nao foi possivel reenviar o webhook agora.',
    renew_failed: 'Nao foi possivel renovar o anuncio agora.',
    invalid_library_file: 'Arquivo de biblioteca invalido.',
    install_failed: 'Nao foi possivel instalar a biblioteca.',
    uninstall_failed: 'Nao foi possivel remover a biblioteca.',
    activate_failed: 'Nao foi possivel ativar a biblioteca.',
    deactivate_failed: 'Nao foi possivel desativar a biblioteca.',
    Failed_to_fetch: 'Nao foi possivel conectar ao servidor. Tente novamente.',
} as const;

export type MarketMessageKey = keyof typeof MARKET_MESSAGE_MAP;

export interface MarketOption {
    readonly value: string;
    readonly label: string;
}

export const MARKET_CATEGORY_OPTIONS = [
    { value: 'project', label: 'Projetos ambientais' },
    { value: 'waste', label: 'Residuos' },
    { value: 'credit', label: 'Creditos EIC' },
    { value: 'carbon_credit', label: 'Creditos de carbono' },
    { value: 'environmental_valuation', label: 'Valoracao ambiental' },
    { value: 'library_data', label: 'Dados de biblioteca' },
] as const satisfies readonly MarketOption[];

export const MARKET_MODE_OPTIONS = [
    { value: 'fixed', label: 'Preco fixo' },
    { value: 'rfq', label: 'Receber propostas' },
    { value: 'both', label: 'Preco fixo + propostas' },
] as const satisfies readonly MarketOption[];

export const MARKET_VISIBILITY_LABELS = {
    public: 'Publico para todos',
    restricted: 'Somente usuarios autorizados',
} as const;

export type MarketVisibilityKey = keyof typeof MARKET_VISIBILITY_LABELS;