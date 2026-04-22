/**
 * POST /functions/create-user
 * Admin-only. Invites user via POST /auth/v1/invite (magic-link email), updates profile + plan.
 *
 * Requires: Authorization: Bearer <admin JWT>
 * Body (JSON): { full_name, email, phone?, plan_type, price_lkr?, start_date?, end_date?, notes? }
 *
 * Env vars (Cloudflare Pages → Settings → Environment variables):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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

  const missingEnv = [
    !env.SUPABASE_URL && 'SUPABASE_URL',
    !env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    !env.SUPABASE_ANON_KEY && 'SUPABASE_ANON_KEY',
  ].filter(Boolean);

  if (missingEnv.length) {
    return json({
      error: `Server not configured - missing environment variable(s): ${missingEnv.join(', ')}`,
      missing: missingEnv,
    }, 500);
  }

  // -- Auth check --
  const authHeader = request.headers.get('Authorization') || '';
  const jwt        = authHeader.replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  // Verify the JWT and confirm admin role via the anon-key endpoint
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'apikey': env.SUPABASE_ANON_KEY,
    },
  });
  if (!userRes.ok) return json({ error: 'Unauthorized' }, 401);

  const caller = await userRes.json();

  // Check admin role in profiles table using service role (bypasses RLS)
  const profileRes = await supabase(env, `rest/v1/profiles?id=eq.${caller.id}&select=role`);
  const profiles   = await profileRes.json();
  if (!profiles?.[0] || profiles[0].role !== 'admin') {
    return json({ error: 'Forbidden - admin only' }, 403);
  }

  // -- Parse body --
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { full_name, email, phone, plan_type, price_lkr, start_date, end_date, notes } = body;
  if (!full_name || !email || !plan_type) {
    return json({ error: 'full_name, email, and plan_type are required' }, 400);
  }

  const validPlanTypes = ['coaching','workout','meal','athletes','rehab'];
  if (!validPlanTypes.includes(plan_type)) {
    return json({ error: 'Invalid plan_type' }, 400);
  }

  const emailNorm = String(email).trim().toLowerCase();

  // -- Invite auth user (same as supabase.auth.admin.inviteUserByEmail): creates user + sends invite email --
  // Do not use POST /admin/users with send_email_invite; that field is not part of the public Admin API and can break hosted Auth.
  const inviteRes = await fetch(`${env.SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email: emailNorm,
      data: { full_name: String(full_name).trim() },
    }),
  });

  const inviteRaw = await inviteRes.text();
  let inviteBody;
  try {
    inviteBody = inviteRaw ? JSON.parse(inviteRaw) : {};
  } catch {
    return json({ error: 'Invalid response from auth server' }, 502);
  }

  if (!inviteRes.ok) {
    const msg = (inviteBody?.msg || inviteBody?.message || inviteBody?.error_description || '').toLowerCase();
    if (inviteRes.status === 422 || msg.includes('already') || msg.includes('registered')) {
      return json({ error: 'A user with this email already exists' }, 409);
    }
    return json(
      { error: inviteBody?.msg || inviteBody?.message || inviteBody?.error_description || 'Failed to send invite' },
      inviteRes.status >= 400 && inviteRes.status < 600 ? inviteRes.status : 500
    );
  }

  const userId = inviteBody?.user?.id || inviteBody?.id;
  if (!userId) {
    return json({ error: 'Auth invite succeeded but no user id returned' }, 502);
  }

  // ── Update profile (trigger created the row; now fill in details) ──
  await supabase(env, `rest/v1/profiles?id=eq.${userId}`, 'PATCH', {
    full_name: String(full_name).trim(),
    email: emailNorm,
    contact_phone: phone || null,
    updated_at: new Date().toISOString(),
  });

  // ── Create plan ──
  const planBody = {
    client_id:  userId,
    plan_type,
    status:     'pending',
    price_lkr:  price_lkr  || null,
    start_date: start_date || null,
    end_date:   end_date   || null,
    notes:      notes      || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const planRes  = await supabase(env, 'rest/v1/plans', 'POST', planBody, { Prefer: 'return=representation' });
  const planData = await planRes.json();
  const planId   = planData?.[0]?.id;

  // ── Insert notification for new plan ──
  if (planId) {
    await supabase(env, 'rest/v1/notifications', 'POST', {
      user_id:    userId,
      type:       'plan_assigned',
      title:      'Welcome to Faith n Muscle!',
      body:       `Your ${plan_type} plan has been set up. Check your email for the invite link.`,
      created_at: new Date().toISOString(),
    });
  }

  return json({ success: true, user_id: userId, plan_id: planId });
}

// ── Helpers ──

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function supabase(env, path, method = 'GET', body = null, extraHeaders = {}) {
  return fetch(`${env.SUPABASE_URL}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
