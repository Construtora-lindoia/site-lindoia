import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const obras = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/obras' }),
  schema: z.object({
    titulo: z.string(),
    cliente: z.string(),
    segmento: z.enum(['agroindustria', 'comercial', 'industria', 'infraestrutura']),
    cidade: z.string().optional(),
    capa: z.string(),
    fotos: z.array(z.string()).default([]),
    ordem: z.number().default(99),
    destaque: z.boolean().default(false),
  }),
});

const produtos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/produtos' }),
  schema: z.object({
    nome: z.string(),
    imagem: z.string(),
    resumo: z.string(),
    fotos: z.array(z.string()).default([]),
    especificacoes: z.array(z.string()).default([]),
    ordem: z.number().default(99),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    titulo: z.string(),
    descricao: z.string(),
    data: z.coerce.date(),
    capa: z.string().optional(),
    rascunho: z.boolean().default(false),
    obras: z.array(z.string()).default([]),
    produtos: z.array(z.string()).default([]),
  }),
});

export const collections = { obras, produtos, blog };
