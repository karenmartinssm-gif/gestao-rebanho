import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.46.1/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configurado =
  !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_ANON_KEY.includes('SUA-CHAVE');

// Bloqueia o uso acidental da chave secreta no navegador.
function ehChaveSecreta(chave) {
  if (chave.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(atob(chave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export const chaveInsegura = configurado && ehChaveSecreta(SUPABASE_ANON_KEY);

export const sb = configurado && !chaveInsegura
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const BUCKET = 'rebanho';
