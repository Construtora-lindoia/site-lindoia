import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://construtoralindoia.com.br',
  integrations: [sitemap()],
});
