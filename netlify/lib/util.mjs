/* Utilidades compartilhadas das funções Netlify.
   Fica FORA de netlify/functions/ pra não virar um endpoint — só é
   empacotada junto quando as funções a importam. */
import { neon } from '@neondatabase/serverless';

/* Repositório do site (dono/nome) — usado pra autorizar quem edita o painel.
   Definir GITHUB_REPO nas variáveis da Netlify (ex.: construtoralindoia/site-lindoia). */
export const REPO = (process.env.GITHUB_REPO || 'Construtora-lindoia/site-lindoia').trim();

let sql;
export function db() {
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
  if (!url) throw new Error('Banco de dados ainda não configurado');
  if (!sql) sql = neon(url);
  return sql;
}

/* Painel: autoriza quem tem acesso de escrita no repositório do site.
   GitHub exige User-Agent — o fetch do Node não manda por padrão. */
const cacheAuth = new Map();
export async function autorizado(req) {
  const t = (req.headers.get('authorization') || '').replace(/^token\s+/i, '').trim();
  if (!t) return false;
  const hit = cacheAuth.get(t);
  if (hit && hit.exp > Date.now()) return hit.ok;
  let ok = false;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        Authorization: 'token ' + t,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'lindoia-painel',
      },
    });
    if (r.ok) {
      const j = await r.json();
      ok = !!(j.permissions && (j.permissions.push || j.permissions.admin));
    }
  } catch {}
  cacheAuth.set(t, { ok, exp: Date.now() + 5 * 60 * 1000 });
  return ok;
}

export const corta = (v, n) => String(v ?? '').trim().slice(0, n);

/* Respostas web-padrão (Netlify Functions 2.0) */
export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export const notAllowed = (allow) =>
  new Response(JSON.stringify({ error: 'Método não permitido' }), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8', Allow: allow },
  });
