export const config = { path: '/api/callback' };

export default async (req) => {
  const code = new URL(req.url).searchParams.get('code');
  if (!code) {
    return new Response('Código de autorização ausente', { status: 400 });
  }

  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: (process.env.OAUTH_GITHUB_CLIENT_ID || '').trim(),
      client_secret: (process.env.OAUTH_GITHUB_CLIENT_SECRET || '').trim(),
      code,
    }),
  });
  const data = await r.json();

  const payload = data.error
    ? `authorization:github:error:${JSON.stringify(data)}`
    : `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: 'github' })}`;

  return new Response(
    `<!doctype html>
<html><body><script>
  (function () {
    function receive(e) {
      window.opener.postMessage(${JSON.stringify(payload)}, e.origin);
      window.removeEventListener('message', receive, false);
    }
    window.addEventListener('message', receive, false);
    window.opener.postMessage('authorizing:github', '*');
  })();
</script>
<p>Autenticando… pode fechar esta janela se não fechar sozinha.</p>
</body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
};
