import React from 'react';
import { DESTAQUES_HERO, DORES_E_SOLUCOES, ICONES, PASSOS, PERGUNTAS, RECURSOS } from './conteudo';
import { MockupOS } from './MockupOS';

interface Props {
  onEntrar: () => void;
  onCriarConta: () => void;
}

// ==========================================
// Página inicial pública (antes do login): apresenta o sistema e leva ao cadastro.
// Estrutura: cabeçalho -> hero -> dores x soluções -> recursos -> como começar -> dúvidas -> CTA final -> rodapé.
// ==========================================

const Icone: React.FC<{ d: string; className?: string }> = ({ d, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const Logo: React.FC = () => (
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-xl overflow-hidden border border-blue-500/30 bg-[#0d131f] shrink-0">
      <img
        src="/logo-montec.png"
        alt=""
        className="w-full h-full object-cover"
        onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
      />
    </div>
    <span className="font-extrabold text-white tracking-tight">Montec System</span>
  </div>
);

const Rotulo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block text-[11px] font-bold tracking-[0.18em] text-blue-400 uppercase">{children}</span>
);

const BotaoPrimario: React.FC<{ onClick: () => void; children: React.ReactNode; grande?: boolean }> = ({ onClick, children, grande }) => (
  <button
    type="button"
    onClick={onClick}
    className={`group inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 ${
      grande ? 'px-7 py-4 text-base' : 'px-5 py-3 text-sm'
    }`}
  >
    {children}
    <Icone d={ICONES.seta} className="w-4 h-4 motion-safe:transition-transform group-hover:translate-x-0.5" />
  </button>
);

const LINKS_NAV = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#como-comecar', label: 'Como começar' },
  { href: '#duvidas', label: 'Dúvidas' },
];

export const LandingPage: React.FC<Props> = ({ onEntrar, onCriarConta }) => (
  <div className="min-h-screen bg-[#080c14] text-zinc-100 font-sans selection:bg-blue-600 selection:text-white overflow-x-hidden">
    {/* ================= CABEÇALHO ================= */}
    <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-[#080c14]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Seções da página" className="hidden md:flex items-center gap-7">
          {LINKS_NAV.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-zinc-400 hover:text-white transition">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onEntrar} className="px-3 sm:px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition">
            Entrar
          </button>
          <button
            type="button"
            onClick={onCriarConta}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition"
          >
            Criar conta
          </button>
        </div>
      </div>
    </header>

    <main>
      {/* ================= HERO ================= */}
      <section className="relative">
        {/* Grade sutil + brilho (mesma linguagem visual da tela de login) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.15] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-20 sm:pb-28 grid lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/25 bg-blue-500/10 text-[11px] font-bold text-blue-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Feito para assistências técnicas
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] font-black text-white tracking-tight leading-[1.07] [text-wrap:balance]">
              Sua assistência organizada, <span className="text-blue-400">do balcão ao caixa.</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl [text-wrap:pretty]">
              Ordens de serviço com checklist, garantias com certidão, taxas da maquininha e lucro real de cada
              conserto — tudo em um só lugar, com acesso individual para cada funcionário.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <BotaoPrimario onClick={onCriarConta} grande>
                Criar minha conta
              </BotaoPrimario>
              <a
                href="#recursos"
                className="inline-flex items-center justify-center px-7 py-4 rounded-xl border border-zinc-700/80 text-base font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white transition"
              >
                Ver o que o sistema faz
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
              {DESTAQUES_HERO.map((d) => (
                <li key={d.texto} className="flex items-center gap-2 text-sm text-zinc-400">
                  <Icone d={d.icone} className="w-4 h-4 text-blue-400" />
                  {d.texto}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:pl-6">
            <MockupOS />
          </div>
        </div>
      </section>

      {/* ================= DORES x SOLUÇÕES ================= */}
      <section className="border-t border-zinc-800/60 bg-[#070b12]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
          <div className="max-w-2xl">
            <Rotulo>O dia a dia da bancada</Rotulo>
            <h2 className="mt-3 text-3xl sm:text-4xl font-black text-white tracking-tight [text-wrap:balance]">
              Os problemas que custam clientes — e como o Montec resolve.
            </h2>
          </div>

          <div className="mt-12 space-y-3">
            {DORES_E_SOLUCOES.map((item) => (
              <div
                key={item.dor}
                className="grid md:grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-5 p-4 sm:p-5 rounded-2xl border border-zinc-800/80 bg-[#0c101a]"
              >
                <p className="flex items-start gap-3 text-sm sm:text-base text-zinc-400">
                  <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <Icone d={ICONES.x} className="w-3.5 h-3.5" />
                  </span>
                  {item.dor}
                </p>
                <Icone d={ICONES.seta} className="hidden md:block w-5 h-5 text-zinc-600" />
                <p className="flex items-start gap-3 text-sm sm:text-base font-semibold text-zinc-100">
                  <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Icone d={ICONES.check} className="w-3.5 h-3.5" />
                  </span>
                  {item.solucao}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= RECURSOS (GRADE) ================= */}
      <section id="recursos" className="scroll-mt-16 border-t border-zinc-800/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="max-w-2xl">
              <Rotulo>Recursos</Rotulo>
              <h2 className="mt-3 text-3xl sm:text-4xl font-black text-white tracking-tight [text-wrap:balance]">
                Tudo o que a sua assistência usa no dia — e nada que atrapalhe.
              </h2>
            </div>
            <BotaoPrimario onClick={onCriarConta}>Começar agora</BotaoPrimario>
          </div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {RECURSOS.map((r, i) => (
              <article
                key={r.titulo}
                className={`p-6 rounded-2xl border border-zinc-800/80 bg-[#0c101a] hover:border-zinc-700 transition ${
                  i === 0 ? 'sm:col-span-2 lg:col-span-1 lg:row-span-2 bg-gradient-to-b from-blue-600/10 to-[#0c101a] border-blue-500/25' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Icone d={r.icone} />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">{r.titulo}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{r.texto}</p>
                {r.itens && (
                  <ul className="mt-5 space-y-2.5">
                    {r.itens.map((it) => (
                      <li key={it} className="flex items-start gap-2.5 text-sm text-zinc-300">
                        <Icone d={ICONES.check} className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                        {it}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= COMO COMEÇAR ================= */}
      <section id="como-comecar" className="scroll-mt-16 border-t border-zinc-800/60 bg-[#070b12]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
          <div className="max-w-2xl">
            <Rotulo>Como começar</Rotulo>
            <h2 className="mt-3 text-3xl sm:text-4xl font-black text-white tracking-tight">Do cadastro à primeira OS em 4 passos.</h2>
          </div>

          <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="relative p-6 rounded-2xl border border-zinc-800/80 bg-[#0c101a]">
                <span className="text-5xl font-black text-blue-500/25 leading-none select-none" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 text-base font-bold text-white">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {p.titulo}
                </h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{p.texto}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <BotaoPrimario onClick={onCriarConta}>Criar minha conta</BotaoPrimario>
            <p className="text-sm text-zinc-500">
              Já tem conta?{' '}
              <button type="button" onClick={onEntrar} className="font-semibold text-blue-400 hover:text-blue-300">
                Entrar no sistema
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ================= DÚVIDAS ================= */}
      <section id="duvidas" className="scroll-mt-16 border-t border-zinc-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
          <div className="text-center">
            <Rotulo>Dúvidas frequentes</Rotulo>
            <h2 className="mt-3 text-3xl sm:text-4xl font-black text-white tracking-tight">Antes de começar</h2>
          </div>
          <div className="mt-10 space-y-3">
            {PERGUNTAS.map((q) => (
              <details key={q.pergunta} className="group rounded-2xl border border-zinc-800/80 bg-[#0c101a] open:border-zinc-700">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none p-5 text-sm sm:text-base font-semibold text-white [&::-webkit-details-marker]:hidden">
                  {q.pergunta}
                  <span className="w-7 h-7 shrink-0 rounded-full border border-zinc-700 flex items-center justify-center text-zinc-400 motion-safe:transition-transform group-open:rotate-45">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="px-5 pb-5 -mt-1 text-sm text-zinc-400 leading-relaxed">{q.resposta}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA FINAL ================= */}
      <section className="px-4 sm:px-6 pb-20 sm:pb-24">
        <div className="relative max-w-6xl mx-auto overflow-hidden rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-600/20 via-[#0c101a] to-[#0c101a] p-8 sm:p-14">
          <div className="absolute -right-24 -top-24 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight [text-wrap:balance]">
              Pronto para organizar a sua bancada?
            </h2>
            <p className="mt-4 text-base sm:text-lg text-zinc-300 leading-relaxed">
              Crie a sua conta, cadastre a loja e abra a primeira ordem de serviço ainda hoje.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <BotaoPrimario onClick={onCriarConta} grande>
                Criar minha conta
              </BotaoPrimario>
              <button
                type="button"
                onClick={onEntrar}
                className="px-7 py-4 rounded-xl border border-zinc-600/80 text-base font-semibold text-zinc-200 hover:border-zinc-400 hover:text-white transition"
              >
                Já tenho conta
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    {/* ================= RODAPÉ ================= */}
    <footer className="border-t border-zinc-800/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-zinc-500">Gestão de ordens de serviço para assistências técnicas.</p>
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {LINKS_NAV.map((l) => (
            <a key={l.href} href={l.href} className="text-zinc-400 hover:text-white transition">
              {l.label}
            </a>
          ))}
          <button type="button" onClick={onEntrar} className="text-zinc-400 hover:text-white transition">
            Entrar
          </button>
        </nav>
      </div>
      <div className="border-t border-zinc-800/60">
        <p className="max-w-6xl mx-auto px-4 sm:px-6 py-5 text-xs text-zinc-600">© {new Date().getFullYear()} Montec System</p>
      </div>
    </footer>
  </div>
);
