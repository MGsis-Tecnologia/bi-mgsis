import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { criaJob, encerraJobsOrfaos, limpaJobsAntigos } from "@/lib/server/importacao/jobs";
import { processaArquivo } from "@/lib/server/importacao/processa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** O upload de um arquivo grande pode demorar; o processamento não fica aqui. */
export const maxDuration = 3600;

/**
 * Recebe o arquivo e devolve o id do job — o processamento roda depois.
 *
 * O corpo é o arquivo **cru**, não `multipart/form-data`: `request.formData()`
 * carrega o upload inteiro na memória antes de entregar, o que com 245 MB
 * derruba o processo. Como stream, o arquivo vai direto para o disco e a RAM
 * não sente.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const filename = req.nextUrl.searchParams.get("filename")?.trim();
  if (!filename) {
    return NextResponse.json({ error: "Informe o nome do arquivo em ?filename=" }, { status: 400 });
  }
  // O nome vem do cliente e só é usado como rótulo e para escolher o parser
  // pela extensão — nunca como caminho. Ainda assim, nada de separadores.
  if (/[/\\]/.test(filename)) {
    return NextResponse.json({ error: "Nome de arquivo inválido" }, { status: 400 });
  }
  if (!req.body) {
    return NextResponse.json({ error: "Corpo vazio — envie o arquivo" }, { status: 400 });
  }

  const db = await getTenantPrisma(session);
  await encerraJobsOrfaos(db);
  await limpaJobsAntigos(db);

  const id = randomUUID();
  const pasta = join(tmpdir(), "bi-mgsis-importacao");
  await mkdir(pasta, { recursive: true });
  const caminho = join(pasta, `${id}.dados`);

  let bytes = 0;
  try {
    const origem = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
    origem.on("data", (c: Buffer) => {
      bytes += c.length;
    });
    await pipeline(origem, createWriteStream(caminho));
  } catch (err) {
    await unlink(caminho).catch(() => {});
    return NextResponse.json(
      { error: `Falha ao receber o arquivo: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  // Confere o que chegou contra o que o navegador disse que ia mandar.
  //
  // Um upload truncado é um CSV perfeitamente válido, só menor: o parser lê o
  // que veio, o job termina "concluído" e o número na tela parece razoável.
  // Foi o que aconteceu com um arquivo de 1,4 milhão de linhas cortado em
  // 10 MiB por um buffer no caminho — entraram 53.996 e ninguém viu.
  //
  // O `content-length` não é confiável para autorizar nada, mas para ESTA
  // comparação serve: quem o mandou foi o mesmo lado que mandou os bytes, e a
  // divergência entre os dois só acontece quando alguém no meio cortou.
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > 0 && bytes !== declarado) {
    await unlink(caminho).catch(() => {});
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      {
        error:
          `Arquivo truncado no caminho: chegaram ${mb(bytes)} MB dos ${mb(declarado)} MB enviados. ` +
          `Nada foi importado. Se houver proxy (nginx, Traefik) na frente, aumente o limite de ` +
          `corpo da requisição para esta rota.`,
      },
      { status: 400 }
    );
  }

  await criaJob(db, id, filename, bytes);

  // Deliberadamente sem await: a resposta sai agora e o trabalho continua no
  // processo. É isto que faz a importação não depender da aba ficar aberta —
  // fechar o navegador não interrompe nada. O progresso vai para o job.
  void processaArquivo(db, id, caminho, filename).catch((err) => {
    console.error(`[importacao] job ${id} falhou:`, err);
  });

  return NextResponse.json({ id, filename, bytes }, { status: 202 });
}
