/* Painel Construtora Lindóia — feito sob medida.
   Fluxo: login GitHub (OAuth já existente em /api/auth) → lê/grava
   arquivos de conteúdo direto no repositório via API do GitHub →
   cada salvamento vira commit → Vercel republica o site. */

const REPO = 'RAKIaero/construtora-lindoia';
const BRANCH = 'main';
const GH = 'https://api.github.com';
const SITE = 'https://construtora-lindoia.vercel.app';
const DIR_OBRAS = 'src/content/obras';
const DIR_PRODUTOS = 'src/content/produtos';
const DIR_UPLOADS = 'public/img/uploads';

const SEGMENTOS = {
  agroindustria: 'Agroindústria',
  comercial: 'Comercial e Varejo',
  industria: 'Indústria',
  infraestrutura: 'Infraestrutura',
};

const FUNIL = {
  novo: ['Novos', '#2563eb'],
  contato: ['Em contato', '#d97706'],
  orcamento: ['Orçamento enviado', '#7c3aed'],
  fechado: ['Fechados', '#16a34a'],
  perdido: ['Perdidos', '#6b7280'],
};

let token = localStorage.getItem('lin_token') || '';
let usuario = null;
let aba = 'obras';
let itens = { obras: [], produtos: [], leads: [] };
let leadsErro = null;
let leadsCarregado = false;
let editando = null; // item aberto no modal
let fotosEdit = []; // [{path, url, novo:File|null}]
let salvando = false;

const $ = (s) => document.querySelector(s);

/* ============ utilidades ============ */
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function yamlStr(s) {
  return '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

let toastTimer = null;
function toast(msg, tipo = '', fixo = false) {
  clearTimeout(toastTimer);
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast ' + tipo;
  el.innerHTML = (tipo === '' && fixo ? '<span class="gira"></span>' : '') + esc(msg);
  el.classList.remove('hidden');
  if (!fixo) toastTimer = setTimeout(() => el.classList.add('hidden'), 4200);
}

/* ============ GitHub API ============ */
async function gh(caminho, opts = {}) {
  const r = await fetch(GH + caminho, {
    ...opts,
    headers: {
      Authorization: 'token ' + token,
      Accept: 'application/vnd.github+json',
      ...(opts.headers || {}),
    },
  });
  if (r.status === 401) {
    sair();
    throw new Error('Sessão expirada. Entre de novo.');
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Erro ' + r.status);
  }
  return r.status === 204 ? null : r.json();
}
const enc = encodeURIComponent;
const listar = (dir) => gh(`/repos/${REPO}/contents/${dir}?ref=${BRANCH}`);
const lerArq = (path) => gh(`/repos/${REPO}/contents/${path}?ref=${BRANCH}`);
const gravar = (path, b64, msg, sha) =>
  gh(`/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message: msg, content: b64, branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
const apagar = (path, sha, msg) =>
  gh(`/repos/${REPO}/contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: msg, sha, branch: BRANCH }),
  });

/* ============ frontmatter ============ */
function parseMd(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: texto.trim() };
  const data = {};
  let listaAtual = null;
  for (const linha of m[1].split(/\r?\n/)) {
    const item = linha.match(/^\s+-\s+(.*)$/);
    if (item && listaAtual) {
      data[listaAtual].push(limpaVal(item[1]));
      continue;
    }
    const kv = linha.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, k, vRaw] = kv;
    if (vRaw === '') {
      data[k] = [];
      listaAtual = k;
    } else {
      data[k] = limpaVal(vRaw);
      listaAtual = null;
    }
  }
  return { data, body: m[2].trim() };
}
function limpaVal(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
function mdObra(d, body) {
  const linhas = [
    '---',
    'titulo: ' + yamlStr(d.titulo),
    'cliente: ' + yamlStr(d.cliente),
    'segmento: ' + d.segmento,
  ];
  if (d.cidade) linhas.push('cidade: ' + yamlStr(d.cidade));
  linhas.push('capa: ' + d.capa, 'fotos:');
  d.fotos.forEach((f) => linhas.push('  - ' + f));
  linhas.push('ordem: ' + (d.ordem ?? 50), 'destaque: ' + !!d.destaque, '---', '', body || '');
  return linhas.join('\n');
}
function mdProduto(d) {
  return [
    '---',
    'nome: ' + yamlStr(d.nome),
    'imagem: ' + d.imagem,
    'resumo: ' + yamlStr(d.resumo),
    'ordem: ' + (d.ordem ?? 50),
    '---',
    '',
  ].join('\n');
}

/* ============ imagens ============ */
function comprimir(file) {
  return new Promise((resolve) => {
    if (file.size < 600 * 1024) return resolve(file); // pequena: sobe como veio
    const img = new Image();
    img.onload = () => {
      const MAX = 1920;
      const escala = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((blob) => resolve(blob && blob.size < file.size ? blob : file), 'image/jpeg', 0.85);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}
function blobB64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result.split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}
function extDe(blob, nome) {
  if (blob.type === 'image/jpeg') return 'jpg';
  if (blob.type === 'image/png') return 'png';
  if (blob.type === 'image/webp') return 'webp';
  return (nome.split('.').pop() || 'jpg').toLowerCase();
}

/* ============ autenticação ============ */
function entrar() {
  const pop = window.open(SITE + '/api/auth', 'ghauth', 'width=680,height=760');
  const ouve = (e) => {
    if (typeof e.data !== 'string') return;
    if (e.data === 'authorizing:github') {
      pop.postMessage('ready', '*');
      return;
    }
    const m = e.data.match(/^authorization:github:(success|error):([\s\S]+)$/);
    if (!m) return;
    window.removeEventListener('message', ouve);
    if (m[1] === 'error') {
      toast('Falha no login. Tenta de novo.', 'erro');
      return;
    }
    try {
      token = JSON.parse(m[2]).token;
      localStorage.setItem('lin_token', token);
      iniciar();
    } catch {
      toast('Resposta de login inválida.', 'erro');
    }
  };
  window.addEventListener('message', ouve);
}
function sair() {
  token = '';
  usuario = null;
  localStorage.removeItem('lin_token');
  render();
}

/* ============ carga de dados ============ */
async function carregarTudo() {
  const [arqObras, arqProds] = await Promise.all([listar(DIR_OBRAS), listar(DIR_PRODUTOS)]);
  const lerTodos = (arqs, tipo) =>
    Promise.all(
      arqs
        .filter((a) => a.name.endsWith('.md'))
        .map(async (a) => {
          const f = await lerArq(a.path);
          const { data, body } = parseMd(fromB64(f.content));
          return { tipo, arquivo: a.path, sha: f.sha, slug: a.name.replace(/\.md$/, ''), data, body };
        })
    );
  const [obras, produtos] = await Promise.all([lerTodos(arqObras, 'obra'), lerTodos(arqProds, 'produto')]);
  const porOrdem = (a, b) => (a.data.ordem ?? 99) - (b.data.ordem ?? 99) || a.data.titulo?.localeCompare?.(b.data.titulo) || 0;
  itens.obras = obras.sort(porOrdem);
  itens.produtos = produtos.sort(porOrdem);
}

/* ============ telas ============ */
function render() {
  const app = $('#app');
  if (!token) {
    app.innerHTML = `
      <div class="login">
        <div class="login-card">
          <img src="/img/logo.webp" alt="Construtora Lindóia" />
          <h1>Painel do site</h1>
          <p>Adicione obras e produtos. Cada alteração salva já atualiza o site sozinha.</p>
          <button class="btn" id="bt-entrar">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
            Entrar com GitHub
          </button>
        </div>
      </div>`;
    $('#bt-entrar').onclick = entrar;
    return;
  }

  app.innerHTML = `
    <header class="topo">
      <div class="topo-in">
        <img class="logo" src="/img/logo.webp" alt="Construtora Lindóia" />
        <a class="ver-site" href="${SITE}" target="_blank" rel="noopener">ver o site ↗</a>
        <div class="user">
          ${usuario ? `<img src="${esc(usuario.avatar_url)}" alt="" /><span style="font-size:.8rem;font-weight:600">${esc(usuario.login)}</span>` : ''}
          <button id="bt-sair">Sair</button>
        </div>
      </div>
    </header>
    <main class="corpo">
      <div class="cab">
        <div class="abas">
          <button data-aba="obras" class="${aba === 'obras' ? 'on' : ''}">Obras<span>${itens.obras.length}</span></button>
          <button data-aba="produtos" class="${aba === 'produtos' ? 'on' : ''}">Produtos<span>${itens.produtos.length}</span></button>
          <button data-aba="leads" class="${aba === 'leads' ? 'on' : ''}">Leads<span>${itens.leads.filter((l) => l.status === 'novo').length || itens.leads.length}</span></button>
        </div>
        <button class="btn" id="bt-novo">+ ${aba === 'obras' ? 'Nova obra' : aba === 'produtos' ? 'Novo produto' : 'Novo lead'}</button>
      </div>
      <div id="grade"></div>
    </main>`;

  $('#bt-sair').onclick = sair;
  $('#bt-novo').onclick = () => (aba === 'leads' ? abrirLeadManual() : abrirEditor(null));
  document.querySelectorAll('.abas button').forEach((b) => {
    b.onclick = async () => {
      aba = b.dataset.aba;
      render();
      if (aba === 'leads' && !leadsCarregado) {
        await carregarLeads();
        render();
      }
    };
  });
  renderGrade();
}

function renderGrade() {
  if (aba === 'leads') return renderLeads();
  const lista = itens[aba];
  const g = $('#grade');
  if (!lista.length) {
    g.innerHTML = `<div class="vazio">Nada aqui ainda. Clique em <b>+ ${aba === 'obras' ? 'Nova obra' : 'Novo produto'}</b> pra começar.</div>`;
    return;
  }
  g.className = 'grade';
  g.innerHTML = lista
    .map((it, i) => {
      const d = it.data;
      const img = aba === 'obras' ? d.capa : d.imagem;
      const contain = aba === 'produtos' ? ' contain' : '';
      const badge = aba === 'obras' ? `<span class="badge">${esc(SEGMENTOS[d.segmento] || d.segmento || '')}</span>` : '';
      const star = aba === 'obras' && d.destaque ? '<span class="badge star">★ destaque</span>' : '';
      const sub = aba === 'obras' ? [d.cliente, d.cidade].filter(Boolean).join(' · ') : d.resumo || '';
      return `
      <div class="card" data-i="${i}">
        <div class="thumb${contain}">${img ? `<img loading="lazy" src="${esc(SITE + img)}" onerror="this.remove()" />` : ''}${badge}${star}</div>
        <div class="info"><b>${esc(d.titulo || d.nome || it.slug)}</b><small>${esc(sub)}</small></div>
      </div>`;
    })
    .join('');
  g.querySelectorAll('.card').forEach((c) => (c.onclick = () => abrirEditor(itens[aba][+c.dataset.i])));
}

/* ============ editor ============ */
function abrirEditor(item) {
  editando = item;
  const ehObra = aba === 'obras';
  const d = item ? { ...item.data } : {};
  fotosEdit = [];
  if (ehObra && item) {
    const vistos = new Set();
    [d.capa, ...(d.fotos || [])].forEach((p) => {
      if (p && !vistos.has(p)) {
        vistos.add(p);
        fotosEdit.push({ path: p, url: SITE + p, novo: null });
      }
    });
  }
  if (!ehObra && item && d.imagem) fotosEdit.push({ path: d.imagem, url: SITE + d.imagem, novo: null });

  const veu = document.createElement('div');
  veu.className = 'veu';
  veu.innerHTML = `
    <div class="modal">
      <div class="modal-topo">
        <b>${item ? 'Editar' : ehObra ? 'Nova obra' : 'Novo produto'} ${item ? '· ' + esc(d.titulo || d.nome || '') : ''}</b>
        <button id="bt-fecha">×</button>
      </div>
      <div class="modal-corpo">
        <div>
          ${
            ehObra
              ? `
          <div class="campo"><label>Título da obra</label><input type="text" id="f-titulo" value="${esc(d.titulo || '')}" placeholder="Ex: Machado — Aeroporto" /></div>
          <div class="campo"><label>Cliente</label><input type="text" id="f-cliente" value="${esc(d.cliente || '')}" placeholder="Ex: Machado Supermercados" /></div>
          <div class="linha2">
            <div class="campo"><label>Segmento</label><select id="f-segmento">${Object.entries(SEGMENTOS)
              .map(([v, l]) => `<option value="${v}" ${d.segmento === v ? 'selected' : ''}>${l}</option>`)
              .join('')}</select></div>
            <div class="campo"><label>Cidade (opcional)</label><input type="text" id="f-cidade" value="${esc(d.cidade || '')}" placeholder="Ex: Sinop-MT" /></div>
          </div>
          <div class="campo"><label>Descrição</label><textarea id="f-body" placeholder="Fale da obra em 1-3 frases.">${esc(item?.body || '')}</textarea></div>
          <div class="linha2">
            <div class="campo"><label>Ordem</label><input type="number" id="f-ordem" value="${d.ordem ?? 50}" /></div>
            <div class="campo" style="display:flex;align-items:flex-end;padding-bottom:6px">
              <label class="check"><input type="checkbox" id="f-destaque" ${d.destaque ? 'checked' : ''} /> Destacar na página inicial</label>
            </div>
          </div>`
              : `
          <div class="campo"><label>Nome do produto</label><input type="text" id="f-nome" value="${esc(d.nome || '')}" placeholder="Ex: Laje Alveolar Protendida" /></div>
          <div class="campo"><label>Resumo (1 frase)</label><textarea id="f-resumo" placeholder="Ex: Lajes protendidas de alta capacidade de carga.">${esc(d.resumo || '')}</textarea></div>
          <div class="campo"><label>Ordem</label><input type="number" id="f-ordem" value="${d.ordem ?? 50}" /></div>`
          }
        </div>
        <div>
          <div class="campo"><label>${ehObra ? 'Fotos da obra' : 'Foto do produto'}</label>
            <div class="solta" id="solta">Arraste ${ehObra ? 'as fotos' : 'a foto'} aqui<br/>ou <b>clique pra escolher</b></div>
            <input type="file" id="f-arqs" accept="image/*" ${ehObra ? 'multiple' : ''} class="hidden" />
            <div class="fotos-grade" id="fotos"></div>
            ${ehObra ? '<div class="dica-capa">A primeira foto é a capa — clique numa foto pra torná-la capa.</div>' : ''}
          </div>
        </div>
      </div>
      <div class="modal-pe">
        ${item ? '<button class="btn danger" id="bt-excluir">Excluir</button>' : ''}
        <button class="btn sec" id="bt-cancela">Cancelar</button>
        <button class="btn" id="bt-salva" style="min-width:170px">Salvar e publicar</button>
      </div>
    </div>`;
  document.body.appendChild(veu);

  const fecha = () => !salvando && veu.remove();
  $('#bt-fecha').onclick = fecha;
  $('#bt-cancela').onclick = fecha;
  veu.addEventListener('mousedown', (e) => e.target === veu && fecha());

  const solta = $('#solta');
  const inp = $('#f-arqs');
  solta.onclick = () => inp.click();
  solta.ondragover = (e) => { e.preventDefault(); solta.classList.add('puxa'); };
  solta.ondragleave = () => solta.classList.remove('puxa');
  solta.ondrop = (e) => { e.preventDefault(); solta.classList.remove('puxa'); addArquivos(e.dataTransfer.files, ehObra); };
  inp.onchange = () => addArquivos(inp.files, ehObra);

  if ($('#bt-excluir')) $('#bt-excluir').onclick = () => excluir(veu);
  $('#bt-salva').onclick = () => salvar(veu, ehObra);
  renderFotos(ehObra);
}

function addArquivos(files, ehObra) {
  const novos = [...files].filter((f) => f.type.startsWith('image/'));
  if (!ehObra) fotosEdit = [];
  novos.forEach((f) => fotosEdit.push({ path: null, url: URL.createObjectURL(f), novo: f }));
  renderFotos(ehObra);
}
function renderFotos(ehObra) {
  const g = $('#fotos');
  if (!g) return;
  g.innerHTML = fotosEdit
    .map(
      (f, i) => `
    <div class="foto-mini" data-i="${i}" title="${ehObra ? 'Clique pra virar capa' : ''}">
      <img src="${esc(f.url)}" />
      ${ehObra && i === 0 ? '<span class="capa-tag">capa</span>' : ''}
      <button class="tira" data-tira="${i}" title="Remover">×</button>
    </div>`
    )
    .join('');
  g.querySelectorAll('.tira').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      fotosEdit.splice(+b.dataset.tira, 1);
      renderFotos(ehObra);
    };
  });
  if (ehObra)
    g.querySelectorAll('.foto-mini').forEach((c) => {
      c.onclick = () => {
        const i = +c.dataset.i;
        if (i > 0) {
          fotosEdit.unshift(fotosEdit.splice(i, 1)[0]);
          renderFotos(ehObra);
        }
      };
    });
}

/* ============ salvar / excluir ============ */
async function subirFotos(base) {
  const paths = [];
  for (let i = 0; i < fotosEdit.length; i++) {
    const f = fotosEdit[i];
    if (!f.novo) {
      paths.push(f.path);
      continue;
    }
    const blob = await comprimir(f.novo);
    const ext = extDe(blob, f.novo.name);
    const nome = `${base}-${Date.now().toString(36)}${i}.${ext}`;
    const caminho = `${DIR_UPLOADS}/${nome}`;
    toast(`Enviando foto ${i + 1} de ${fotosEdit.length}…`, '', true);
    await gravar(caminho, await blobB64(blob), `conteúdo: envia imagem ${nome}`);
    paths.push('/img/uploads/' + nome);
  }
  return paths;
}

async function salvar(veu, ehObra) {
  if (salvando) return;
  const v = (id) => $(id)?.value.trim();
  try {
    if (ehObra) {
      if (!v('#f-titulo')) return toast('Dá um título pra obra.', 'erro');
      if (!fotosEdit.length) return toast('Adiciona pelo menos uma foto.', 'erro');
    } else {
      if (!v('#f-nome')) return toast('Dá um nome pro produto.', 'erro');
      if (!fotosEdit.length) return toast('Adiciona a foto do produto.', 'erro');
    }
    salvando = true;
    $('#bt-salva').disabled = true;

    const slug = editando ? editando.slug : slugify(ehObra ? v('#f-titulo') : v('#f-nome'));
    const paths = await subirFotos(slug);
    toast('Publicando…', '', true);

    let conteudo, rotulo;
    if (ehObra) {
      conteudo = mdObra(
        {
          titulo: v('#f-titulo'),
          cliente: v('#f-cliente') || v('#f-titulo'),
          segmento: $('#f-segmento').value,
          cidade: v('#f-cidade'),
          capa: paths[0],
          fotos: paths,
          ordem: Number(v('#f-ordem')) || 50,
          destaque: $('#f-destaque').checked,
        },
        v('#f-body')
      );
      rotulo = v('#f-titulo');
    } else {
      conteudo = mdProduto({
        nome: v('#f-nome'),
        imagem: paths[0],
        resumo: v('#f-resumo') || '',
        ordem: Number(v('#f-ordem')) || 50,
      });
      rotulo = v('#f-nome');
    }

    const arquivo = editando ? editando.arquivo : `${ehObra ? DIR_OBRAS : DIR_PRODUTOS}/${slug}.md`;
    const acao = editando ? 'atualiza' : 'cria';
    await gravar(arquivo, toB64(conteudo), `conteúdo: ${acao} ${ehObra ? 'obra' : 'produto'} "${rotulo}"`, editando?.sha);

    salvando = false;
    veu.remove();
    toast('✓ Salvo! O site atualiza em ~1 minuto.', 'ok');
    await carregarTudo();
    render();
  } catch (e) {
    salvando = false;
    const b = $('#bt-salva');
    if (b) b.disabled = false;
    toast('Erro ao salvar: ' + e.message, 'erro');
  }
}

async function excluir(veu) {
  if (salvando || !editando) return;
  const nome = editando.data.titulo || editando.data.nome || editando.slug;
  if (!confirm(`Excluir "${nome}" do site? Essa ação publica na hora.`)) return;
  try {
    salvando = true;
    toast('Excluindo…', '', true);
    await apagar(editando.arquivo, editando.sha, `conteúdo: remove "${nome}"`);
    salvando = false;
    veu.remove();
    toast('✓ Excluído. O site atualiza em ~1 minuto.', 'ok');
    await carregarTudo();
    render();
  } catch (e) {
    salvando = false;
    toast('Erro ao excluir: ' + e.message, 'erro');
  }
}

/* ============ leads ============ */
async function apiLeads(method, corpo, query) {
  const r = await fetch('/api/leads' + (query || ''), {
    method,
    headers: { Authorization: 'token ' + token, 'Content-Type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erro ' + r.status);
  return j;
}
async function carregarLeads() {
  try {
    leadsErro = null;
    itens.leads = (await apiLeads('GET')).leads || [];
    leadsCarregado = true;
  } catch (e) {
    leadsErro = e.message;
  }
}

function telWa(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d && !d.startsWith('55') && d.length >= 10) d = '55' + d;
  return d ? 'https://wa.me/' + d : null;
}
function tempoRel(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'há ' + h + 'h';
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 30) return 'há ' + d + ' dias';
  return new Date(iso).toLocaleDateString('pt-BR');
}
const ORIGENS = { site: 'Site', manual: 'Manual' };

function renderLeads() {
  const g = $('#grade');
  g.className = '';
  if (!leadsCarregado && !leadsErro) {
    g.innerHTML = '<div class="carregando"><span class="gira escuro"></span></div>';
    return;
  }
  if (leadsErro) {
    g.innerHTML = `<div class="aviso-banco">
      <b>Funil de leads ainda não ativado</b>
      <p>${esc(leadsErro)}</p>
      <p>Falta criar o banco de dados gratuito na Vercel (Storage → Create Database → Neon) e conectar ao projeto <b>construtora-lindoia</b>. Depois disso, esta aba liga sozinha.</p>
    </div>`;
    return;
  }
  const porStatus = {};
  Object.keys(FUNIL).forEach((s) => (porStatus[s] = []));
  itens.leads.forEach((l) => (porStatus[l.status] || porStatus.novo).push(l));

  g.innerHTML = `<div class="kanban">${Object.entries(FUNIL)
    .map(([st, [rotulo, cor]]) => {
      const lista = porStatus[st];
      return `<div class="coluna" data-st="${st}">
        <div class="coluna-cab" style="--cor:${cor}"><i></i>${rotulo}<span>${lista.length}</span></div>
        ${lista
          .map((l) => {
            const wa = telWa(l.telefone);
            return `<div class="lead-card" draggable="true" data-id="${l.id}">
              <div class="lead-topo"><b>${esc(l.nome)}</b><small>${tempoRel(l.criado_em)}</small></div>
              <small class="lead-sub">${esc([ORIGENS[l.origem] || l.origem, l.cidade, SEGMENTOS[l.segmento] || (l.segmento === 'produtos' ? 'Produtos' : l.segmento)].filter(Boolean).join(' · '))}</small>
              ${l.mensagem ? `<p class="lead-msg">${esc(l.mensagem)}</p>` : ''}
              ${l.notas ? '<small class="lead-nota">✎ tem anotações</small>' : ''}
              <div class="lead-acoes">
                ${wa ? `<a class="lead-wa" href="${wa}" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp</a>` : ''}
                <select class="lead-status" onclick="event.stopPropagation()">
                  ${Object.entries(FUNIL).map(([v, [r]]) => `<option value="${v}" ${l.status === v ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
              </div>
            </div>`;
          })
          .join('')}
        ${!lista.length ? '<div class="coluna-vazia">—</div>' : ''}
      </div>`;
    })
    .join('')}</div>`;

  g.querySelectorAll('.lead-card').forEach((c) => {
    const lead = itens.leads.find((l) => l.id === +c.dataset.id);
    c.onclick = () => abrirLead(lead);
    c.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(lead.id));
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => c.classList.add('arrastando'));
    });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.querySelector('.lead-status').onchange = async (e) => {
      try {
        await apiLeads('PATCH', { id: lead.id, status: e.target.value });
        lead.status = e.target.value;
        renderLeads();
      } catch (err) {
        toast('Erro: ' + err.message, 'erro');
      }
    };
  });

  g.querySelectorAll('.coluna').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('recebendo');
    });
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('recebendo');
    });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('recebendo');
      const id = +e.dataTransfer.getData('text/plain');
      const lead = itens.leads.find((l) => l.id === id);
      const novoStatus = col.dataset.st;
      if (!lead || lead.status === novoStatus) return;
      const anterior = lead.status;
      lead.status = novoStatus;
      renderLeads(); // move na hora; desfaz se a API falhar
      try {
        await apiLeads('PATCH', { id, status: novoStatus });
      } catch (err) {
        lead.status = anterior;
        renderLeads();
        toast('Erro ao mover: ' + err.message, 'erro');
      }
    });
  });
}

function abrirLead(l) {
  const wa = telWa(l.telefone);
  const veu = document.createElement('div');
  veu.className = 'veu';
  veu.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-topo"><b>${esc(l.nome)}</b><button id="bt-fecha">×</button></div>
      <div class="modal-corpo" style="grid-template-columns:1fr">
        <div>
          <div class="lead-det">
            <div><label>WhatsApp</label>${esc(l.telefone)}</div>
            ${l.email ? `<div><label>E-mail</label>${esc(l.email)}</div>` : ''}
            ${l.cidade ? `<div><label>Cidade</label>${esc(l.cidade)}</div>` : ''}
            ${l.segmento ? `<div><label>Tipo de obra</label>${esc(SEGMENTOS[l.segmento] || l.segmento)}</div>` : ''}
            <div><label>Origem</label>${esc(ORIGENS[l.origem] || l.origem)}${l.utm ? ' · ' + esc(l.utm) : ''}</div>
            <div><label>Chegou</label>${new Date(l.criado_em).toLocaleString('pt-BR')}</div>
          </div>
          ${l.mensagem ? `<div class="campo"><label>Mensagem</label><p style="font-size:.9rem;color:#4a4a4a">${esc(l.mensagem)}</p></div>` : ''}
          <div class="campo"><label>Anotações internas</label><textarea id="l-notas" placeholder="Ex: orçamento enviado dia 22, aguardando retorno…">${esc(l.notas || '')}</textarea></div>
        </div>
      </div>
      <div class="modal-pe">
        <button class="btn danger" id="bt-l-excluir">Excluir</button>
        ${wa ? `<a class="btn sec" style="text-decoration:none" href="${wa}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : ''}
        <button class="btn" id="bt-l-salvar">Salvar anotações</button>
      </div>
    </div>`;
  document.body.appendChild(veu);
  const fecha = () => veu.remove();
  $('#bt-fecha').onclick = fecha;
  veu.addEventListener('mousedown', (e) => e.target === veu && fecha());
  $('#bt-l-salvar').onclick = async () => {
    try {
      await apiLeads('PATCH', { id: l.id, notas: $('#l-notas').value.trim() });
      l.notas = $('#l-notas').value.trim();
      fecha();
      toast('✓ Anotações salvas.', 'ok');
      renderLeads();
    } catch (e) {
      toast('Erro: ' + e.message, 'erro');
    }
  };
  $('#bt-l-excluir').onclick = async () => {
    if (!confirm(`Excluir o lead "${l.nome}"?`)) return;
    try {
      await apiLeads('DELETE', null, '?id=' + l.id);
      itens.leads = itens.leads.filter((x) => x.id !== l.id);
      fecha();
      toast('✓ Lead excluído.', 'ok');
      renderLeads();
    } catch (e) {
      toast('Erro: ' + e.message, 'erro');
    }
  };
}

function abrirLeadManual() {
  const veu = document.createElement('div');
  veu.className = 'veu';
  veu.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-topo"><b>Novo lead</b><button id="bt-fecha">×</button></div>
      <div class="modal-corpo" style="grid-template-columns:1fr">
        <div>
          <div class="campo"><label>Nome*</label><input type="text" id="ml-nome" /></div>
          <div class="campo"><label>WhatsApp*</label><input type="text" id="ml-tel" placeholder="(66) 9…" /></div>
          <div class="campo"><label>Cidade</label><input type="text" id="ml-cidade" /></div>
          <div class="campo"><label>Observação</label><textarea id="ml-msg" placeholder="Ex: chegou por indicação do Machado…"></textarea></div>
        </div>
      </div>
      <div class="modal-pe">
        <button class="btn sec" id="bt-cancela">Cancelar</button>
        <button class="btn" id="bt-ml-salvar">Adicionar</button>
      </div>
    </div>`;
  document.body.appendChild(veu);
  const fecha = () => veu.remove();
  $('#bt-fecha').onclick = fecha;
  $('#bt-cancela').onclick = fecha;
  veu.addEventListener('mousedown', (e) => e.target === veu && fecha());
  $('#bt-ml-salvar').onclick = async () => {
    const nome = $('#ml-nome').value.trim();
    const tel = $('#ml-tel').value.trim();
    if (nome.length < 2 || tel.length < 8) return toast('Preencha nome e WhatsApp.', 'erro');
    try {
      const r = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone: tel, cidade: $('#ml-cidade').value.trim(), mensagem: $('#ml-msg').value.trim(), origem: 'manual' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro');
      fecha();
      toast('✓ Lead adicionado.', 'ok');
      await carregarLeads();
      render();
    } catch (e) {
      toast('Erro: ' + e.message, 'erro');
    }
  };
}

/* ============ boot ============ */
async function iniciar() {
  $('#app').innerHTML = '<div class="carregando"><span class="gira escuro"></span></div>';
  try {
    usuario = await gh('/user');
    await carregarTudo();
    render();
  } catch (e) {
    if (token) toast(e.message, 'erro');
    render();
  }
}
iniciar();
