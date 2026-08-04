-- CreateTable
CREATE TABLE "system_smtp_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "user" TEXT NOT NULL DEFAULT '',
    "password_enc" TEXT NOT NULL DEFAULT '',
    "from_name" TEXT NOT NULL DEFAULT 'MGSIS Analytics',
    "from_email" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_smtp_config_pkey" PRIMARY KEY ("id")
);

-- Aproveita a conta SMTP que já estava configurada no banco de tenant, pra o
-- master não precisar redigitar host/usuário/senha depois do upgrade.
-- A senha continua criptografada com a mesma SETTINGS_ENCRYPTION_KEY, então
-- copiar o texto cifrado basta.
--
-- Condicional porque `smtp_config` é tabela do schema de TENANT: ela só existe
-- aqui quando o catalog divide a database com o tenant (o padrão, já que
-- CATALOG_DATABASE_URL cai em DATABASE_URL). Com catalog em database própria a
-- tabela não existe e o bloco simplesmente não roda.
DO $$
BEGIN
  IF to_regclass('public.smtp_config') IS NOT NULL THEN
    INSERT INTO "system_smtp_config" (
      "id", "host", "port", "secure", "user", "password_enc",
      "from_name", "from_email", "updated_at"
    )
    SELECT 1, "host", "port", "secure", "user", "password_enc",
           "from_name", "from_email", "updated_at"
    FROM "smtp_config"
    WHERE "id" = 1 AND "host" <> ''
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
