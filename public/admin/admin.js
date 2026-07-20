/* Painel Construtora Lindóia — previews ao vivo e ajustes */

CMS.registerPreviewStyle('/admin/preview.css');

var SEGMENTOS = {
  agroindustria: 'Agroindústria',
  comercial: 'Comercial e Varejo',
  industria: 'Indústria',
  infraestrutura: 'Infraestrutura',
};

function asset(props, path) {
  if (!path) return '';
  var a = props.getAsset(path);
  return a ? a.toString() : path;
}

/* ---- Preview de OBRA: replica a página /obras/slug ---- */
var ObraPreview = createClass({
  render: function () {
    var e = this.props.entry;
    var titulo = e.getIn(['data', 'titulo']) || 'Título da obra';
    var cliente = e.getIn(['data', 'cliente']) || '';
    var cidade = e.getIn(['data', 'cidade']) || '';
    var seg = SEGMENTOS[e.getIn(['data', 'segmento'])] || 'Segmento';
    var destaque = e.getIn(['data', 'destaque']);
    var capa = e.getIn(['data', 'capa']);
    var fotos = e.getIn(['data', 'fotos']);
    var imgs = [];
    if (capa) imgs.push(capa);
    if (fotos && fotos.forEach) {
      fotos.forEach(function (f) {
        if (f && f !== capa) imgs.push(f);
      });
    }
    var self = this;

    return h(
      'div',
      {},
      h(
        'div',
        { className: 'prev-head' },
        h('div', { className: 'prev-eyebrow' }, seg),
        h('h1', {}, titulo),
        h('p', {}, cliente + (cidade ? ' · ' + cidade : ''))
      ),
      h(
        'div',
        { className: 'prev-body' },
        destaque ? h('span', { className: 'prev-badge' }, '★ Destaque na página inicial') : null,
        h('div', { className: 'prev-desc' }, this.props.widgetFor('body')),
        h(
          'div',
          { className: 'prev-galeria' },
          imgs.map(function (f, i) {
            return h('img', { key: i, src: asset(self.props, f) });
          })
        )
      )
    );
  },
});
CMS.registerPreviewTemplate('obras', ObraPreview);

/* ---- Preview de PRODUTO: replica o card do catálogo ---- */
var ProdutoPreview = createClass({
  render: function () {
    var e = this.props.entry;
    return h(
      'div',
      { className: 'prev-prod-wrap' },
      h(
        'div',
        { className: 'prev-prod' },
        h('img', { src: asset(this.props, e.getIn(['data', 'imagem'])) }),
        h('b', {}, e.getIn(['data', 'nome']) || 'Nome do produto'),
        h('p', {}, e.getIn(['data', 'resumo']) || 'Resumo do produto')
      )
    );
  },
});
CMS.registerPreviewTemplate('produtos', ProdutoPreview);

/* ---- Preview de CLIENTES ---- */
var ClientesPreview = createClass({
  render: function () {
    var self = this;
    var lista = this.props.entry.getIn(['data', 'clientes']);
    var items = [];
    if (lista && lista.forEach) {
      lista.forEach(function (c, i) {
        items.push(
          h(
            'div',
            { className: 'prev-cli', key: i },
            h('img', { src: asset(self.props, c.get('logo')) }),
            h('b', {}, c.get('nome'))
          )
        );
      });
    }
    return h('div', { className: 'prev-lista' }, items);
  },
});
CMS.registerPreviewTemplate('clientes', ClientesPreview);

/* ---- Preview de DEPOIMENTOS ---- */
var DepoimentosPreview = createClass({
  render: function () {
    var lista = this.props.entry.getIn(['data', 'depoimentos']);
    var items = [];
    if (lista && lista.forEach) {
      lista.forEach(function (d, i) {
        items.push(
          h(
            'div',
            { className: 'prev-dep', key: i },
            h('p', {}, '"' + (d.get('texto') || '') + '"'),
            h('b', {}, d.get('autor') || ''),
            h('span', {}, d.get('empresa') || '')
          )
        );
      });
    }
    return h('div', { className: 'prev-lista' }, items);
  },
});
CMS.registerPreviewTemplate('depoimentos', DepoimentosPreview);
