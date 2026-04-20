/**
 * GET /api/photo?photo_id=<uuid>
 * Verifies JWT + ownership, streams photo from R2.
 * Also supports DELETE /api/photo?photo_id=<uuid> to remove a photo.
 *
 * Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * R2 binding: PROGRESS_PHOTOS
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const photo_id = new URL(request.url).searchParams.get('photo_id');
  if (!photo_id) return err('photo_id required', 400);

  const { caller, isAdmin } = await authenticate(request, env);
  if (!caller) return err('Unauthorized', 401);

  const svcHdrs = { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY };
  const metaRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/progress_photos?id=eq.${photo_id}&select=storage_path,client_id`,
    { headers: svcHdrs }
  );
  const metas = await metaRes.json();
  if (!metas?.[0]) return err('Not found', 404);
  const { storage_path, client_id } = metas[0];

  if (!isAdmin && client_id !== caller.id) return err('Forbidden', 403);
  if (!env.PROGRESS_PHOTOS) return err('Storage not configured', 503);

  const object = await env.PROGRESS_PHOTOS.get(storage_path);
  if (!object) return err('Photo not found in storage', 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
      ...CORS,
    },
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const photo_id = new URL(request.url).searchParams.get('photo_id');
  if (!photo_id) return err('photo_id required', 400);

  const { caller, isAdmin } = await authenticate(request, env);
  if (!caller) return err('Unauthorized', 401);

  const svcHdrs = { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY };
  const metaRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/progress_photos?id=eq.${photo_id}&select=storage_path,client_id`,
    { headers: svcHdrs }
  );
  const metas = await metaRes.json();
  if (!metas?.[0]) return err('Not found', 404);
  const { storage_path, client_id } = metas[0];

  if (!isAdmin && client_id !== caller.id) return err('Forbidden', 403);

  // Delete R2 object
  if (env.PROGRESS_PHOTOS) {
    await env.PROGRESS_PHOTOS.delete(storage_path).catch(() => {});
  }

  // Delete metadata row
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/progress_photos?id=eq.${photo_id}`,
    { method: 'DELETE', headers: svcHdrs }
  );

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function authenticate(request, env) {
  const jwt = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!jwt) return { caller: null, isAdmin: false };

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return { caller: null, isAdmin: false };
  const caller = await userRes.json();

  const profileRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${caller.id}&select=role`,
    { headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const profiles = await profileRes.json();
  return { caller, isAdmin: profiles?.[0]?.role === 'admin' };
}

function err(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
