import { supabase } from './supabaseClient';
import { contaDoUsuario } from './contaLogin';
import { MENSAGEM_SEM_PERMISSAO, ehRecusaDePermissao } from './errosBanco';

// ==========================================
// Fotos do aparelho na OS (migração 20261102120000_fotos_os.sql).
// Os arquivos ficam no bucket privado "fotos-os" do Storage. O banco reserva cada foto (confere a
// permissão do funcionário) e o Storage só aceita o arquivo no caminho reservado.
// ==========================================

const BUCKET = 'fotos-os';
export const MAX_FOTOS_OS = 15;
// Lado maior da foto depois de comprimir: nítido para ver riscos e trincas, leve para o plano gratuito
const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.82;
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

export interface FotoOS {
  caminho: string;
  url: string;
  criadoEm: string;
}

function tratarErro(error: any, padrao: string): never {
  // PGRST202 / 42883: função não existe (migração não executada); bucket ausente no Storage
  if (error?.code === 'PGRST202' || error?.code === '42883' || /bucket not found/i.test(error?.message || '')) {
    throw new Error('As fotos ainda não foram ativadas no banco (falta executar a migração das fotos).');
  }
  if (ehRecusaDePermissao(error)) throw new Error(MENSAGEM_SEM_PERMISSAO);
  throw new Error(error?.message || padrao);
}

/** Reduz a foto para no máximo LADO_MAXIMO px em JPEG (fotos de celular passam de 4 MB para ~300 KB). */
async function comprimir(arquivo: File): Promise<Blob> {
  try {
    const imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(imagem.width * escala);
    canvas.height = Math.round(imagem.height * escala);
    canvas.getContext('2d')!.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    imagem.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE_JPEG));
    if (blob) return blob;
  } catch {
    /* navegador sem suporte ao formato: tenta enviar o original abaixo */
  }
  if (TIPOS_ACEITOS.includes(arquivo.type) && arquivo.size <= 5 * 1024 * 1024) return arquivo;
  throw new Error(`Não foi possível ler a imagem "${arquivo.name}". Use uma foto JPG ou PNG.`);
}

/** Envia uma foto para a OS: comprime, reserva o caminho no banco e sobe o arquivo. */
export async function enviarFotoOS(idOs: string, arquivo: File): Promise<void> {
  const imagem = await comprimir(arquivo);
  const { data: caminho, error } = await supabase.rpc('reservar_foto_os', { p_id_os: idOs, p_tipo: imagem.type });
  if (error) tratarErro(error, 'Não foi possível reservar a foto.');

  const { error: erroEnvio } = await supabase.storage
    .from(BUCKET)
    .upload(String(caminho), imagem, { contentType: imagem.type, upsert: false });
  if (erroEnvio) {
    // Desfaz a reserva para não ficar uma foto vazia na OS
    await supabase.rpc('excluir_foto_os', { p_caminho: caminho }).then(undefined, () => undefined);
    tratarErro(erroEnvio, 'Não foi possível enviar a foto.');
  }
}

/** Envia várias fotos em sequência; devolve quantas foram e as mensagens das que falharam. */
export async function enviarFotosOS(
  idOs: string,
  arquivos: File[],
  aoAvancar?: (feitas: number) => void
): Promise<{ enviadas: number; falhas: string[] }> {
  let enviadas = 0;
  const falhas: string[] = [];
  for (const [i, arquivo] of arquivos.entries()) {
    try {
      await enviarFotoOS(idOs, arquivo);
      enviadas++;
    } catch (e: any) {
      falhas.push(e.message);
    }
    aoAvancar?.(i + 1);
  }
  return { enviadas, falhas };
}

/** Fotos da OS com links temporários (1 hora) para exibir. */
export async function listarFotosOS(idOs: string): Promise<FotoOS[]> {
  const { data, error } = await supabase
    .from('fotos_os')
    .select('caminho, criado_em')
    .eq('id_os', idOs)
    .order('criado_em', { ascending: true });
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') return []; // migração ainda não executada
    tratarErro(error, 'Não foi possível carregar as fotos.');
  }
  if (!data?.length) return [];

  const { data: links, error: erroLinks } = await supabase.storage.from(BUCKET).createSignedUrls(
    data.map((f) => f.caminho),
    3600
  );
  if (erroLinks) tratarErro(erroLinks, 'Não foi possível carregar as fotos.');
  const porCaminho = new Map((links || []).filter((l) => l.signedUrl).map((l) => [l.path, l.signedUrl]));
  // Reserva sem arquivo (upload interrompido) não aparece
  return data
    .filter((f) => porCaminho.has(f.caminho))
    .map((f) => ({ caminho: f.caminho, url: porCaminho.get(f.caminho)!, criadoEm: f.criado_em }));
}

export async function excluirFotoOS(caminho: string): Promise<void> {
  const { error } = await supabase.rpc('excluir_foto_os', { p_caminho: caminho });
  if (error) tratarErro(error, 'Não foi possível excluir a foto.');
  // Sem o registro, o Storage deixa apagar o arquivo; se falhar, ele só ocupa espaço (não aparece mais)
  await supabase.storage.from(BUCKET).remove([caminho]).then(undefined, () => undefined);
}

/** Mudanças nas fotos feitas no "Editar OS", gravadas só ao salvar (Cancelar descarta). */
export interface AlteracoesFotos {
  novas: File[];
  removidas: string[]; // caminhos das fotos já gravadas
}
export const SEM_ALTERACOES_FOTOS: AlteracoesFotos = { novas: [], removidas: [] };

/** Grava as mudanças do "Editar OS": remove primeiro (libera espaço no limite) e depois envia as novas. */
export async function aplicarAlteracoesFotos(idOs: string, { novas, removidas }: AlteracoesFotos): Promise<string[]> {
  const falhas: string[] = [];
  for (const caminho of removidas) {
    await excluirFotoOS(caminho).catch((e) => falhas.push(e.message));
  }
  if (novas.length) falhas.push(...(await enviarFotosOS(idOs, novas)).falhas);
  return falhas;
}

/** Depois de excluir uma OS: apaga os arquivos que ficaram (os registros o banco já apagou). */
export async function apagarArquivosDaOS(idOs: string): Promise<void> {
  const conta = contaDoUsuario((await supabase.auth.getUser()).data?.user);
  if (!conta) return;
  const pasta = `${conta}/${idOs}`;
  const { data } = await supabase.storage.from(BUCKET).list(pasta, { limit: 100 });
  if (data?.length) await supabase.storage.from(BUCKET).remove(data.map((a) => `${pasta}/${a.name}`));
}
