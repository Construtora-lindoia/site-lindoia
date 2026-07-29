export const config = { path: '/api/auth' };

export default async () => {
  const clientId = (process.env.OAUTH_GITHUB_CLIENT_ID || '').trim();
  if (!clientId) {
    return new Response('OAUTH_GITHUB_CLIENT_ID não configurado nas variáveis da Netlify', { status: 500 });
  }
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user`;
  return new Response(null, { status: 302, headers: { Location: url } });
};
