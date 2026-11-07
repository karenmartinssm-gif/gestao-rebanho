// =====================================================================
// CONFIGURAÇÃO DO SUPABASE
// Supabase → Project Settings → API:
//   * Project URL
//   * chave "anon public" (ou "publishable"). Ela é pública por natureza:
//     a proteção dos dados é feita pelas políticas RLS do banco.
// NUNCA coloque aqui a chave "service_role" / "secret".
// =====================================================================
export const SUPABASE_URL = 'https://uyqsqvixdxncvwbsuiqv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_DhcUfpoAqCOCCGGldhpwHA_7Y1YK3m-';
