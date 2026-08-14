-- ============================================================================
-- Exporta todas as views bi_* para CSV, um arquivo por view.
--
-- Cole no pgAdmin (Query Tool), ajuste a PASTA na primeira linha e execute.
-- Só isso. Cada CSV gerado aqui é aceito direto na tela de Importação, que
-- reconhece o leiaute pelas colunas — o nome do arquivo não importa.
--
-- ── Três coisas que precisam ser verdade ────────────────────────────────────
--
-- 1. **Os arquivos saem no disco do SERVIDOR de banco**, não no seu.
--    É a diferença entre `COPY` (roda no servidor) e o `\copy` do psql (roda
--    na sua máquina). Se o pgAdmin está conectado no servidor do cliente, é lá
--    que os CSV vão aparecer — traga-os depois com scp/WinSCP.
--
-- 2. **A pasta já tem que existir** e ser gravável pelo usuário do SISTEMA que
--    roda o Postgres — `postgres` no Linux, a conta do serviço no Windows.
--    Não é o seu usuário do banco.
--
-- 3. **Precisa de superusuário** (ou do papel pg_write_server_files). Com o
--    usuário `postgres` do pgAdmin, está resolvido. Se der "must be superuser
--    or a member of pg_write_server_files", veja a saída alternativa no fim.
--
-- Caminho: barra normal nos dois sistemas — '/tmp/bi' no Linux,
-- 'C:/bi' no Windows. Sem barra no fim.
-- ============================================================================

DO $exportar$
DECLARE
  -- ▼▼▼ EDITE AQUI ▼▼▼
  pasta   text := '/tmp/bi';   -- pasta de destino, já existente
  esquema text := 'public';    -- onde estão as views
  padrao  text := 'bi%';       -- LIKE no nome da view; '%' exporta todas
  -- ▲▲▲ EDITE AQUI ▲▲▲

  v       record;
  arquivo text;
  linhas  bigint;
  total   bigint := 0;
  vistas  int := 0;
BEGIN
  FOR v IN
    SELECT table_schema AS s, table_name AS n
      FROM information_schema.views
     WHERE table_schema = esquema
       AND table_name LIKE padrao
     ORDER BY table_name
  LOOP
    arquivo := pasta || '/' || v.n || '.csv';

    -- %I protege o nome da view e %L o caminho: sem isso, um nome com aspas
    -- ou maiúscula quebraria o comando montado.
    EXECUTE format(
      'COPY (SELECT * FROM %I.%I) TO %L WITH (FORMAT csv, HEADER, DELIMITER '';'', ENCODING ''UTF8'')',
      v.s, v.n, arquivo
    );

    GET DIAGNOSTICS linhas = ROW_COUNT;
    total  := total + linhas;
    vistas := vistas + 1;
    RAISE NOTICE '% -> % linha(s)', arquivo, linhas;
  END LOOP;

  IF vistas = 0 THEN
    RAISE NOTICE 'Nenhuma view casou com "%" no esquema "%". Confira o padrão.', padrao, esquema;
  ELSE
    RAISE NOTICE '--- % view(s), % linha(s) no total, em %', vistas, total, pasta;
  END IF;
END
$exportar$;

-- ============================================================================
-- SEM PERMISSÃO DE GRAVAR NO SERVIDOR?
--
-- Então o arquivo tem que sair pelo seu lado. Duas saídas, ambas sem psql:
--
-- A) Uma view por vez, pelo próprio pgAdmin:
--       SELECT * FROM bi_compras;
--    e no resultado: botão direito → "Copy with headers", ou o ícone de
--    download (Save results to file). O pgAdmin salva na SUA máquina.
--    Confira o separador em File → Preferences → Query Tool → Results grid
--    (CSV field separator) — a importação aceita ';' e ','.
--
-- B) Peça o papel ao DBA, uma vez só:
--       GRANT pg_write_server_files TO seu_usuario;
--    e o bloco acima passa a funcionar.
-- ============================================================================
