-- =====================================================================
-- Fotos do aparelho na OS (riscos, tela trincada, estado na entrada)
--
-- Requer as migrações anteriores (usa conta_atual(), operador_pode() e assinatura_ativa()).
-- Pode ser executada de novo sem perder dados.
--
-- Os arquivos ficam no Storage, no bucket PRIVADO "fotos-os", em <conta>/<id_os>/<arquivo>.
-- O upload de arquivos não leva o cabeçalho com a permissão do funcionário (x-operador-token), então
-- as regras do Storage não conseguem conferir operador_pode(). Por isso:
--   1. o sistema RESERVA a foto pelo banco: reservar_foto_os() confere a permissão, a assinatura, se a
--      OS é da loja e o limite de fotos, registra em fotos_os e devolve o caminho do arquivo;
--   2. o Storage só aceita o arquivo num caminho reservado pela própria loja nos últimos 15 minutos;
--   3. para excluir, excluir_foto_os() apaga o registro (conferindo a permissão) e o Storage só deixa
--      apagar arquivos da loja que não têm mais registro.
-- Ver as fotos: qualquer login da loja (por links temporários gerados pelo Storage).
-- Ao excluir uma OS, os registros das fotos saem junto; o sistema apaga os arquivos em seguida.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Registro das fotos
-- ---------------------------------------------------------------------
create table if not exists public.fotos_os (
  id        uuid primary key default gen_random_uuid(),
  id_os     text not null,
  user_id   uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  caminho   text not null unique,
  criado_em timestamptz not null default now()
);
create index if not exists fotos_os_por_os on public.fotos_os (user_id, id_os);

alter table public.fotos_os enable row level security;
revoke all on public.fotos_os from anon, authenticated;
grant select on public.fotos_os to authenticated; -- gravar, só pelas funções abaixo

drop policy if exists "fotos: loja lê" on public.fotos_os;
create policy "fotos: loja lê" on public.fotos_os
  for select to authenticated
  using (user_id = public.conta_atual());

-- Máximo de fotos por OS (o sistema avisa antes; o banco garante)
create or replace function public.reservar_foto_os(p_id_os text, p_tipo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta   uuid := public.conta_atual();
  v_ext     text;
  v_caminho text;
begin
  if not (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')) then
    raise exception 'new row violates row-level security policy for table "fotos_os"' using errcode = '42501';
  end if;
  if not public.assinatura_ativa() then
    raise exception 'Assinatura vencida: renove o plano para enviar fotos.' using errcode = '42501';
  end if;
  if p_id_os is null or p_id_os !~ '^[A-Za-z0-9_-]{1,64}$' or not exists (
    select 1 from public.ordens_servico os where os.id_os::text = p_id_os and os.user_id::text = v_conta::text
  ) then
    raise exception 'Ordem de serviço não encontrada.';
  end if;
  if (select count(*) from public.fotos_os f where f.user_id = v_conta and f.id_os = p_id_os) >= 15 then
    raise exception 'Limite de 15 fotos por ordem de serviço.';
  end if;

  v_ext := case p_tipo when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if v_ext is null then
    raise exception 'Formato de imagem não aceito (use JPG, PNG ou WebP).';
  end if;

  v_caminho := v_conta::text || '/' || p_id_os || '/' || gen_random_uuid()::text || '.' || v_ext;
  insert into public.fotos_os (id_os, user_id, caminho) values (p_id_os, v_conta, v_caminho);
  return v_caminho;
end;
$$;

-- Exclui o registro (e cancela uma reserva cujo upload falhou); o arquivo é apagado pelo sistema depois
create or replace function public.excluir_foto_os(p_caminho text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')) then
    raise exception 'new row violates row-level security policy for table "fotos_os"' using errcode = '42501';
  end if;
  delete from public.fotos_os where caminho = p_caminho and user_id = public.conta_atual();
  if not found then
    raise exception 'Foto não encontrada.';
  end if;
end;
$$;

revoke all on function public.reservar_foto_os(text, text) from public, anon;
revoke all on function public.excluir_foto_os(text) from public, anon;
grant execute on function public.reservar_foto_os(text, text) to authenticated;
grant execute on function public.excluir_foto_os(text) to authenticated;

-- OS excluída: os registros das fotos saem junto (quem exclui a OS já passou pela permissão "Excluir OS")
create or replace function public.apagar_fotos_da_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.fotos_os where id_os = old.id_os::text and user_id::text = old.user_id::text;
  return old;
end;
$$;
revoke all on function public.apagar_fotos_da_os() from public, anon, authenticated;

drop trigger if exists apagar_fotos_da_os on public.ordens_servico;
create trigger apagar_fotos_da_os
  after delete on public.ordens_servico
  for each row execute function public.apagar_fotos_da_os();

-- ---------------------------------------------------------------------
-- Storage: bucket privado e regras dos arquivos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-os', 'fotos-os', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos-os: loja vê" on storage.objects;
drop policy if exists "fotos-os: envia reservada" on storage.objects;
drop policy if exists "fotos-os: apaga sem registro" on storage.objects;

create policy "fotos-os: loja vê" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-os' and (storage.foldername(name))[1] = public.conta_atual()::text);

create policy "fotos-os: envia reservada" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-os'
    and exists (
      select 1 from public.fotos_os f
       where f.caminho = name
         and f.user_id = public.conta_atual()
         and f.criado_em > now() - interval '15 minutes'
    )
  );

create policy "fotos-os: apaga sem registro" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos-os'
    and (storage.foldername(name))[1] = public.conta_atual()::text
    and not exists (select 1 from public.fotos_os f where f.caminho = name)
  );

notify pgrst, 'reload schema';
