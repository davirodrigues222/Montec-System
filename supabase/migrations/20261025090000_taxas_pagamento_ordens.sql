-- =====================================================================
-- Taxas de pagamento por Ordem de Serviço
--
-- ordens_servico já guarda o valor bruto (valor_total), o valor líquido (valor_liquido)
-- e a forma de pagamento em texto (forma_pagamento). Esta migração acrescenta, sem
-- renomear nem alterar nenhuma coluna existente:
--   valor_taxas           valor retido pela maquininha/operadora (R$) = bruto - líquido
--   modalidade_pagamento  DEBITO | CREDITO_VISTA | CREDITO_PARCELADO | PIX | DINHEIRO | MISTO | OUTRO
-- e preenche as duas colunas nas ordens já cadastradas.
--
-- Pode ser executada mais de uma vez (só preenche o que ainda estiver vazio).
-- Execute no SQL Editor do Supabase.
-- =====================================================================

alter table public.ordens_servico add column if not exists valor_taxas numeric(12, 2);
alter table public.ordens_servico add column if not exists modalidade_pagamento text;

-- 1. Taxas das ordens antigas: soma das taxas gravadas em cada pagamento (checklist_entrada.__pagamentos);
--    sem esse detalhe, usa a diferença entre bruto e líquido.
update public.ordens_servico os
   set valor_taxas = coalesce(
         (
           select round(sum(
                    case when (p ->> 'valorTaxa') ~ '^-?[0-9]+(\.[0-9]+)?$'
                         then (p ->> 'valorTaxa')::numeric
                         else 0 end
                  ), 2)
             from jsonb_array_elements(
                    case when jsonb_typeof(os.checklist_entrada::jsonb -> '__pagamentos') = 'array'
                         then os.checklist_entrada::jsonb -> '__pagamentos'
                         else '[]'::jsonb end
                  ) as p
         ),
         greatest(coalesce(os.valor_total, 0) - coalesce(os.valor_liquido, os.valor_total, 0), 0)
       )
 where os.valor_taxas is null;

-- 2. Modalidade das ordens antigas, a partir do texto da forma de pagamento
update public.ordens_servico
   set modalidade_pagamento = case
         when forma_pagamento like '%+%' then 'MISTO'
         when lower(forma_pagamento) like '%pix%' then 'PIX'
         when lower(forma_pagamento) like '%dinheiro%' then 'DINHEIRO'
         when lower(forma_pagamento) like '%débito%' or lower(forma_pagamento) like '%debito%' then 'DEBITO'
         when lower(forma_pagamento) like '%crédito%' or lower(forma_pagamento) like '%credito%' then
           case when coalesce(parcelas, 1) > 1 then 'CREDITO_PARCELADO' else 'CREDITO_VISTA' end
         else 'OUTRO'
       end
 where modalidade_pagamento is null;

comment on column public.ordens_servico.valor_taxas is 'Valor retido pela maquininha/operadora (R$): valor_total - valor_liquido';
comment on column public.ordens_servico.modalidade_pagamento is 'DEBITO | CREDITO_VISTA | CREDITO_PARCELADO | PIX | DINHEIRO | MISTO | OUTRO';
