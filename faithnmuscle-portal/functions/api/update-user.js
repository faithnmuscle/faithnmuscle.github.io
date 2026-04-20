/**
 * POST /functions/update-user
 * Admin-only. Updates a Supabase auth user's email.
 *
 * Body (JSON): { user_id, email }
 *
 * Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'Server not configured - set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY in Cloudflare Pages environment variables' }, 500);
  }

  // -- Auth + admin check --
  const jwt = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return json({ error: 'Unauthorized' }, 401);
  const caller = await userRes.json();

  const profileRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${caller.id}&select=role`,
    { headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const profiles = await profileRes.json();
  if (profiles?.[0]?.role !== 'admin') return json({ error: 'Forbidden - admin only' }, 403);

  // -- Parse body --
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { user_id, email } = body;
  if (!user_id || !email) return json({ error: 'user_id and email are required' }, 400);

  // -- Update auth user email via admin API --
  const updateRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    return json({ error: err.message || 'Failed to update auth email' }, 500);
  }

  return json({ success: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
