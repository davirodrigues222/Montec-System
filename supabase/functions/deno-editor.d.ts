// Tipos mínimos do Deno só para o editor (VS Code) não acusar erro nas Edge Functions.
// No Supabase as funções rodam no Deno de verdade; este arquivo não é publicado.
declare namespace Deno {
  const env: { get(nome: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}

declare module 'jsr:@supabase/supabase-js@2' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const createClient: (...args: any[]) => any;
}
