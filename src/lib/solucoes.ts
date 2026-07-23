export interface Solucao {
  slug: string;
  eyebrow: string;
  titulo: string;
  texto: string;
  imagem: string;
  descricao: string;
  segmentoObras: string | null; // qual segmento de obras mostrar (null = obras em destaque)
}

export const SOLUCOES: Solucao[] = [
  {
    slug: 'agroindustria',
    eyebrow: 'Agroindústria',
    titulo: 'O agronegócio é a força motriz do nosso país',
    texto:
      'Desenvolvemos soluções específicas que atendem as rigorosas demandas do setor, construindo armazéns, bases para silos, barracões e moegas projetados para máxima eficiência operacional e durabilidade. Nossas estruturas são pensadas para proteger a safra, otimizar a logística e fortalecer a cadeia produtiva, garantindo que o investimento no campo gere os melhores resultados.',
    imagem: '/img/obras/armazem.webp',
    descricao:
      'Armazéns, silos, barracões e moegas em estrutura pré-moldada para o agronegócio. Construtora Lindóia, Sinop-MT.',
    segmentoObras: 'agroindustria',
  },
  {
    slug: 'comercial',
    eyebrow: 'Comercial e Varejo',
    titulo: 'Criamos espaços que geram negócios',
    texto:
      'Para o setor comercial e de varejo, entregamos projetos como supermercados, centros de distribuição e edifícios comerciais, utilizando sistemas construtivos que aliam agilidade, resistência e um excelente acabamento estético. Nossas soluções em pré-fabricados permitem a construção de amplos vãos livres e layouts flexíveis, essenciais para a funcionalidade e o sucesso de qualquer empreendimento comercial.',
    imagem: '/img/obras/machadao-primavera-1.webp',
    descricao:
      'Supermercados, centros de distribuição e edifícios comerciais em pré-fabricado, com amplos vãos livres. Construtora Lindóia.',
    segmentoObras: 'comercial',
  },
  {
    slug: 'industria',
    eyebrow: 'Indústria e Infraestrutura',
    titulo: 'A base de toda grande obra precisa ser sólida e confiável',
    texto:
      'A Construtora Lindóia entrega plantas industriais completas e soluções essenciais de infraestrutura que garantem a estabilidade e a longevidade dos projetos. Produzimos e instalamos elementos como aduelas para sistemas de drenagem e muros de arrimo para contenção de terrenos, componentes cruciais que asseguram a segurança e a correta preparação do solo para receber as edificações.',
    imagem: '/img/obras/berneck-1.webp',
    descricao:
      'Plantas industriais e infraestrutura: aduelas, drenagem e muros de arrimo em concreto. Construtora Lindóia, Sinop-MT.',
    segmentoObras: 'industria',
  },
  {
    slug: 'turnkey',
    eyebrow: 'Turnkey · Chave na mão',
    titulo: 'Para clientes que buscam a máxima conveniência e eficiência',
    texto:
      'Oferecemos a solução Turnkey, ou "chave na mão". Neste modelo, assumimos a responsabilidade integral pelo projeto, desde a concepção e planejamento até a execução e entrega final da obra, pronta para operar. Centralizamos todas as etapas, garantindo um único ponto de contato, cumprimento rigoroso dos prazos e total alinhamento com o orçamento, proporcionando uma experiência livre de preocupações.',
    imagem: '/img/obras/machado-aeroporto-1.webp',
    descricao:
      'Obra turnkey (chave na mão) da Construtora Lindóia: do projeto à entrega pronta para operar, com um único ponto de contato.',
    segmentoObras: null,
  },
];
