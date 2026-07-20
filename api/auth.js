export default function handler(req, res) {
  const clientId = (process.env.OAUTH_GITHUB_CLIENT_ID || '').trim();
  if (!clientId) {
    res.status(500).send('OAUTH_GITHUB_CLIENT_ID não configurado na Vercel');
    return;
  }
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user`;
  res.redirect(302, url);
}
