import React, { useMemo, useState } from 'react';
import { sugerirModelos } from '../utils/aparelhos';

interface Props {
  valor: string;
  onChange: (valor: string) => void;
  /** Modelos já cadastrados nas OS da loja (aparecem antes da lista base). */
  modelosDaLoja: string[];
  className?: string;
  placeholder?: string;
}

/**
 * Campo de modelo do aparelho com sugestões enquanto digita.
 * Setas escolhem, Enter confirma, Esc fecha. O texto livre continua valendo para modelos fora da lista.
 */
export const CampoModeloAparelho: React.FC<Props> = ({ valor, onChange, modelosDaLoja, className, placeholder }) => {
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);

  const sugestoes = useMemo(() => sugerirModelos(valor, modelosDaLoja), [valor, modelosDaLoja]);
  const mostrar = aberto && sugestoes.length > 0;

  const escolher = (modelo: string) => {
    onChange(modelo);
    setAberto(false);
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!mostrar) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestaque((i) => (i + 1) % sugestoes.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque((i) => (i - 1 + sugestoes.length) % sugestoes.length);
    } else if (e.key === 'Enter') {
      e.preventDefault(); // não envia o formulário da OS
      escolher(sugestoes[Math.min(destaque, sugestoes.length - 1)].modelo);
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        required
        value={valor}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
          setDestaque(0);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={aoTeclar}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrar}
        aria-autocomplete="list"
        aria-controls="sugestoes-modelo-aparelho"
        className={className}
      />
      {mostrar && (
        <ul
          id="sugestoes-modelo-aparelho"
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-[#0c101a] border border-zinc-700/80 rounded-xl shadow-2xl py-1"
        >
          {sugestoes.map((s, i) => (
            <li
              key={s.modelo}
              role="option"
              aria-selected={i === destaque}
              // mousedown (antes do blur do campo) para o clique não ser perdido
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(s.modelo);
              }}
              onMouseEnter={() => setDestaque(i)}
              className={`flex items-center justify-between gap-2 px-3.5 py-2 text-xs cursor-pointer ${
                i === destaque ? 'bg-blue-600/20 text-white' : 'text-zinc-300'
              }`}
            >
              <span className="truncate">{s.modelo}</span>
              {s.daLoja && <span className="text-[10px] text-zinc-500 shrink-0">já atendido</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
