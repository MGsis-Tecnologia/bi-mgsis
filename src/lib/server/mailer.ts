import nodemailer from "nodemailer";
import { getCatalogPrisma } from "./catalog-db";
import { encryptSecret, decryptSecret } from "./crypto";

// A conta SMTP é ÚNICA para todo o sistema e vive no catalog
// (SystemSmtpConfig), não no banco de cada empresa. Por isso nenhuma função
// aqui recebe um PrismaClient: antes recebiam, e cada chamador acabava
// passando o banco do próprio tenant — o convite de usuário de uma empresa
// tentava usar um SMTP que só o master havia preenchido, e falhava.

export interface SmtpConfigInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Se omitida/vazia, mantém a senha já salva. */
  password?: string;
  fromName: string;
  fromEmail: string;
}

export interface SmtpConfigSafe {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  hasPassword: boolean;
  updatedAt: string;
}

/** Config sem o segredo — o único formato que pode voltar para o client. */
export async function getSmtpConfigSafe(): Promise<SmtpConfigSafe | null> {
  const catalog = await getCatalogPrisma();
  const row = await catalog.systemSmtpConfig.findUnique({ where: { id: 1 } });
  if (!row || !row.host) return null;
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    user: row.user,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    hasPassword: !!row.passwordEnc,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveSmtpConfig(input: SmtpConfigInput): Promise<void> {
  const catalog = await getCatalogPrisma();
  const existing = await catalog.systemSmtpConfig.findUnique({ where: { id: 1 } });

  const passwordEnc = input.password
    ? encryptSecret(input.password)
    : existing?.passwordEnc ?? "";

  await catalog.systemSmtpConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      host: input.host,
      port: input.port,
      secure: input.secure,
      user: input.user,
      passwordEnc,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
    },
    update: {
      host: input.host,
      port: input.port,
      secure: input.secure,
      user: input.user,
      passwordEnc,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
    },
  });
}

async function getTransporter() {
  const catalog = await getCatalogPrisma();
  const row = await catalog.systemSmtpConfig.findUnique({ where: { id: 1 } });
  if (!row || !row.host || !row.passwordEnc) {
    throw new Error(
      "Conta SMTP do sistema não configurada. O master precisa preenchê-la em Configurações > E-mail."
    );
  }

  return {
    transporter: nodemailer.createTransport({
      host: row.host,
      port: row.port,
      secure: row.secure,
      auth: { user: row.user, pass: decryptSecret(row.passwordEnc) },
    }),
    from: `"${row.fromName}" <${row.fromEmail}>`,
  };
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { transporter, from } = await getTransporter();
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
}

export async function sendTestEmail(to: string): Promise<void> {
  await sendMail({
    to,
    subject: "MGSIS Analytics — e-mail de teste",
    html: `<p>Este é um e-mail de teste da configuração SMTP do MGSIS Analytics.</p>
           <p>Se você recebeu esta mensagem, o envio está funcionando corretamente.</p>
           <p style="color:#888;font-size:12px">Enviado em ${new Date().toLocaleString("pt-BR")}</p>`,
  });
}
