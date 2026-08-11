-- ============================================================================
-- Usuário de leitura para o agente de ingestão
--
-- Roda no banco do ERP do cliente, como superusuário, UMA vez.
-- O agente usa este usuário para ler as seis views bi_* e enviar ao Analytics.
-- ============================================================================

-- 1. O papel. Sem CREATEDB, sem CREATEROLE, sem SUPERUSER — só login.
CREATE ROLE analytics LOGIN PASSWORD 'TROQUE_ESTA_SENHA';

-- 2. Conectar e enxergar o schema.
GRANT CONNECT ON DATABASE erp_do_cliente TO analytics;   -- ajuste o nome
GRANT USAGE   ON SCHEMA public           TO analytics;

-- 3. Só as seis views. Nenhuma tabela.
--
-- Isto basta, e é a parte que protege: uma view roda com o privilégio do DONO
-- dela, então quem tem SELECT na view NÃO precisa de SELECT nas tabelas de
-- baixo — e continua sem conseguir ler `pessoa`, `pedido`, `produto` ou
-- qualquer outra coisa do ERP.
--
-- (Vale enquanto as views não forem criadas com `security_invoker = true`,
--  que é PG15+ e vem desligado por padrão. Não ligue nestas views.)
GRANT SELECT ON
    bi_movimento,
    bi_orcamentos,
    bi_receber,
    bi_pagar,
    bi_caixa,
    bi_estoque
TO analytics;

-- 4. Garantia de que nada novo cai no colo dele por acidente: tabelas ou views
--    criadas depois NÃO ficam acessíveis sem um GRANT explícito. O PostgreSQL
--    já se comporta assim; a linha abaixo só torna a intenção explícita caso
--    alguém tenha mexido nos privilégios padrão.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM analytics;

-- ── Conferência ─────────────────────────────────────────────────────────────
-- Depois de rodar, entre COMO o analytics e confirme os dois lados:
--
--   \c erp_do_cliente analytics
--   SELECT count(*) FROM bi_movimento;   -- deve funcionar
--   SELECT count(*) FROM pedido;         -- deve dar "permission denied"
--
-- O segundo é o que prova que o usuário está contido.
