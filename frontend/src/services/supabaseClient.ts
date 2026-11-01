import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mlgkdyeujcglwlfdirin.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_HGJD0kFeVf03Gm-4vft8uQ_b4R4Om9P'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Cliente avulso, sem sessão salva: confere uma senha (ex.: a senha atual antes de trocar) sem mexer
 * no login que está aberto no sistema.
 */
export const criarClienteVerificacao = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'bancadaos-verificacao' },
  })
