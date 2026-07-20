import { neon } from '@neondatabase/serverless';

const REPO = 'RAKIaero/construtora-lindoia';
const STATUS_VALIDOS = ['novo', 'contato', 'orcamento', 'fechado', 'perdido'];

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
  await db()`CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ DEFAULT now(),
    atualizado_em TIMESTAMPTZ DEFAULT now(),
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    email TEXT DEFAULT '',
    cidade TEXT DEFAULT '',
    segmento TEXT DEFAULT '',
    mensagem TEXT DEFAULT '',
    origem TEXT DEFAULT 'site',
    utm TEXT DEFAULT '',
    status TEXT DEFAULT 'novo',
    notas TEXT DEFAULT ''
  )`;
  tabelaPronta = true;
}

/* Painel: autoriza quem tem acesso de escrita no repositório do site */
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
      const b = req.body || {};
      if (corta(b.site, 10)) return res.status(200).json({ ok: true }); // honeypot: finge sucesso
      const nome = corta(b.nome, 120);
      const telefone = corta(b.telefone, 40);
      if (nome.length < 2 || telefone.length < 8) {
        return res.status(400).json({ error: 'Preencha nome e WhatsApp.' });
      }
      const [lead] = await db()`INSERT INTO leads (nome, telefone, email, cidade, segmento, mensagem, origem, utm)
        VALUES (${nome}, ${telefone}, ${corta(b.email, 120)}, ${corta(b.cidade, 80)},
                ${corta(b.segmento, 40)}, ${corta(b.mensagem, 2000)},
                ${corta(b.origem, 40) || 'site'}, ${corta(b.utm, 500)})
        RETURNING id`;
      return res.status(201).json({ ok: true, id: lead.id });
    }

    if (req.method === 'GET') {
      if (!(await autorizado(req))) return res.status(401).json({ error: 'Não autorizado' });
      const leads = await db()`SELECT * FROM leads ORDER BY criado_em DESC LIMIT 500`;
      return res.status(200).json({ leads });
    }

    if (req.method === 'PATCH') {
      if (!(await autorizado(req))) return res.status(401).json({ error: 'Não autorizado' });
      const b = req.body || {};
      const id = Number(b.id);
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const status = STATUS_VALIDOS.includes(b.status) ? b.status : null;
      const notas = typeof b.notas === 'string' ? corta(b.notas, 4000) : null;
      const [lead] = await db()`UPDATE leads SET
          status = COALESCE(${status}, status),
          notas = COALESCE(${notas}, notas),
          atualizado_em = now()
        WHERE id = ${id} RETURNING *`;
      if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
      return res.status(200).json({ lead });
    }

    if (req.method === 'DELETE') {
      if (!(await autorizado(req))) return res.status(401).json({ error: 'Não autorizado' });
      const id = Number((req.query || {}).id);
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      await db()`DELETE FROM leads WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
