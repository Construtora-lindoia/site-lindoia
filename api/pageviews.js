import { neon } from '@neondatabase/serverless';

const REPO = 'RAKIaero/construtora-lindoia';

let sql;
function db() {
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
  if (!url) throw new Error('Banco de dados ainda não configurado na Vercel');
  if (!sql) sql = neon(url);
  return sql;
}

let tabelaPronta = false;
async function garanteTabela() {
  if (tabelaPronta) return;
  await db()`CREATE TABLE IF NOT EXISTS pageviews (
    id BIGSERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ DEFAULT now(),
    caminho TEXT DEFAULT '',
    origem TEXT DEFAULT 'Direto',
    dispositivo TEXT DEFAULT 'desktop',
    sessao TEXT DEFAULT ''
  )`;
  tabelaPronta = true;
}

/* Leitura do painel: só quem tem escrita no repositório do site */
const cacheAuth = new Map();
async function autorizado(req) {
  const t = (req.headers.authorization || '').replace(/^token\s+/i, '').trim();
  if (!t) return false;
  const hit = cacheAuth.get(t);
  if (hit && hit.exp > Date.now()) return hit.ok;
  let ok = false;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Authorization: 'token ' + t, Accept: 'application/vnd.github+json' },
    });
    if (r.ok) {
      const j = await r.json();
      ok = !!(j.permissions && (j.permissions.push || j.permissions.admin));
    }
  } catch {}
  cacheAuth.set(t, { ok, exp: Date.now() + 5 * 60 * 1000 });
  return ok;
}

const corta = (v, n) => String(v ?? '').trim().slice(0, n);

export default async function handler(req, res) {
  try {
    await garanteTabela();

    if (req.method === 'POST') {
      let b = req.body || {};
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      const caminho = corta(b.caminho || '/', 300);
      if (!caminho.startsWith('/') || caminho.startsWith('/admin')) return res.status(204).end();
      const origem = corta(b.origem || 'Direto', 60);
      const dispositivo = b.dispositivo === 'mobile' ? 'mobile' : 'desktop';
      const sessao = corta(b.sessao, 40);
      await db()`INSERT INTO pageviews (caminho, origem, dispositivo, sessao)
        VALUES (${caminho}, ${origem}, ${dispositivo}, ${sessao})`;
      return res.status(204).end();
    }

    if (req.method === 'GET') {
      if (!(await autorizado(req))) return res.status(401).json({ error: 'Não autorizado' });
      const dias = Math.min(365, Math.max(1, Number((req.query || {}).dias) || 30));
      const janela = `${dias} days`;
      const [total] = await db()`SELECT count(*)::int AS pageviews, count(distinct sessao)::int AS visitas
        FROM pageviews WHERE criado_em > now() - ${janela}::interval`;
      const porDia = await db()`SELECT to_char(date_trunc('day', criado_em AT TIME ZONE 'America/Cuiaba'), 'YYYY-MM-DD') AS dia,
          count(*)::int AS pageviews, count(distinct sessao)::int AS visitas
        FROM pageviews WHERE criado_em > now() - ${janela}::interval
        GROUP BY 1 ORDER BY 1`;
      const paginas = await db()`SELECT caminho, count(*)::int AS n
        FROM pageviews WHERE criado_em > now() - ${janela}::interval
        GROUP BY 1 ORDER BY n DESC LIMIT 8`;
      const origens = await db()`SELECT origem, count(distinct sessao)::int AS n
        FROM pageviews WHERE criado_em > now() - ${janela}::interval
        GROUP BY 1 ORDER BY n DESC LIMIT 8`;
      const dispositivos = await db()`SELECT dispositivo, count(distinct sessao)::int AS n
        FROM pageviews WHERE criado_em > now() - ${janela}::interval
        GROUP BY 1`;
      return res.status(200).json({ total, porDia, paginas, origens, dispositivos, dias });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
