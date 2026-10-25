import React from 'react';
import type { FormatoImpressao } from '../../services/api';
import { Campo, Secao, Toggle, inputCls } from '../../components/cadastros/ui';
import { mascaraCpfCnpj, mascaraTelefone } from '../../utils/formatadores';
import { type PropsAba, cardCls } from './tipos';

const FORMATOS: { id: FormatoImpressao; titulo: string; descricao: string }[] = [
  { id: 'A4', titulo: 'Folha A4 padrão', descricao: '1 via por folha, layout completo.' },
  { id: 'A4_DUAS_VIAS', titulo: 'Folha A4 com 2 vias', descricao: 'Via da loja e via do cliente na mesma folha, com linha de recorte.' },
  { id: 'TERMICA_80', titulo: 'Bobina térmica 80 mm', descricao: 'Layout estreito em uma coluna para impressora de cupom.' },
];

export const AbaDadosLoja: React.FC<PropsAba> = ({ config, alterar }) => (
  <div className="space-y-6">
    <div className={cardCls}>
      <div>
        <h3 className="text-sm font-bold text-white">Dados cadastrais</h3>
        <p className="text-xs text-zinc-400 mt-0.5">
          Impressos no cabeçalho e no rodapé do comprovante de entrada e da certidão de garantia. Ao salvar a loja principal
          em Cadastros › Lojas, o nome, o CNPJ, o telefone e o endereço de lá substituem os daqui.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Campo label="Nome fantasia da assistência" obrigatorio className="md:col-span-3">
          <input
            value={config.nomeLoja}
            onChange={(e) => alterar({ nomeLoja: e.target.value })}
            autoComplete="organization"
            className={inputCls()}
          />
        </Campo>
        <Campo label="Subtítulo / especialidade" className="md:col-span-3">
          <input
            value={config.subtitulo}
            onChange={(e) => alterar({ subtitulo: e.target.value })}
            placeholder="Ex: Microeletrônica e reparos Apple / Android"
            className={inputCls()}
          />
        </Campo>
        <Campo label="CNPJ / CPF" className="md:col-span-2">
          <input
            value={config.cnpj}
            onChange={(e) => alterar({ cnpj: mascaraCpfCnpj(e.target.value) })}
            inputMode="numeric"
            autoComplete="off"
            className={inputCls()}
          />
        </Campo>
        <Campo label="Inscrição estadual / municipal" dica="Opcional." className="md:col-span-2">
          <input
            value={config.inscricaoEstadual}
            onChange={(e) => alterar({ inscricaoEstadual: e.target.value })}
            autoComplete="off"
            className={inputCls()}
          />
        </Campo>
        <Campo label="Telefone / WhatsApp comercial" className="md:col-span-2">
          <input
            value={config.telefone}
            onChange={(e) => alterar({ telefone: mascaraTelefone(e.target.value) })}
            inputMode="tel"
            autoComplete="work tel"
            className={inputCls()}
          />
        </Campo>
        <Campo label="E-mail de atendimento" className="md:col-span-3">
          <input
            type="email"
            value={config.emailAtendimento}
            onChange={(e) => alterar({ emailAtendimento: e.target.value })}
            autoComplete="work email"
            className={inputCls()}
          />
        </Campo>
        <Campo label="Instagram da loja" className="md:col-span-3">
          <input
            value={config.instagram}
            onChange={(e) => alterar({ instagram: e.target.value.replace(/\s/g, '') })}
            placeholder="@suaassistencia"
            autoComplete="off"
            className={inputCls()}
          />
        </Campo>
        <Campo label="Endereço completo" className="md:col-span-6">
          <input
            value={config.endereco}
            onChange={(e) => alterar({ endereco: e.target.value })}
            placeholder="Rua, número, bairro, cidade - UF"
            autoComplete="off"
            className={inputCls()}
          />
        </Campo>
        <Campo
          label="Horário de funcionamento"
          dica="Impresso no rodapé dos documentos para orientar o cliente na retirada."
          className="md:col-span-6"
        >
          <input
            value={config.horarioFuncionamento}
            onChange={(e) => alterar({ horarioFuncionamento: e.target.value })}
            placeholder="Ex: Seg a Sex: 08h às 18h | Sáb: 08h às 13h"
            className={inputCls()}
          />
        </Campo>
      </div>
    </div>

    <div className={cardCls}>
      <div>
        <h3 className="text-sm font-bold text-white">Preferências de impressão</h3>
        <p className="text-xs text-zinc-400 mt-0.5">Vale para o comprovante da Nova OS e para a impressão das Ordens de serviço.</p>
      </div>

      <Secao titulo="Formato padrão do papel">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FORMATOS.map((f) => {
            const ativo = config.formatoImpressao === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => alterar({ formatoImpressao: f.id })}
                aria-pressed={ativo}
                className={`p-4 rounded-xl border text-left transition ${
                  ativo ? 'border-blue-500 bg-blue-600/10 ring-1 ring-blue-500/30' : 'border-zinc-800/80 bg-[#080c14] hover:border-zinc-700'
                }`}
              >
                <p className={`text-xs font-bold ${ativo ? 'text-blue-400' : 'text-zinc-200'}`}>{f.titulo}</p>
                <p className="text-[11px] text-zinc-500 mt-1">{f.descricao}</p>
              </button>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Informações no rodapé">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Toggle
            checked={config.exibirContatosImpressao}
            onChange={(v) => alterar({ exibirContatosImpressao: v })}
            label="Exibir WhatsApp, Instagram e e-mail"
            descricao="Contatos da loja no rodapé do comprovante."
          />
          <Toggle
            checked={config.exibirPixImpressao}
            onChange={(v) => alterar({ exibirPixImpressao: v })}
            label="Exibir chave PIX"
            descricao={
              config.chavePix.trim()
                ? 'Mostra a chave PIX cadastrada em Configurações › Taxas.'
                : 'Cadastre a chave PIX em Configurações › Taxas.'
            }
          />
        </div>
      </Secao>
    </div>
  </div>
);
