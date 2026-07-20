export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) {
    res.status(400).send('Código de autorização ausente');
    return;
  }

  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.OAUTH_GITHUB_CLIENT_ID,
      client_secret: process.env.OAUTH_GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = await r.json();

  const payload = data.error
    ? `authorization:github:error:${JSON.stringify(data)}`
    : `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: 'github' })}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
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
</body></html>`);
}
