/**
 * POST /api/upload-photo
 * Client-only. Uploads a compressed photo to R2 with quota enforcement.
 * Quota: max 3 photos per date, max 2 upload dates per calendar month.
 *
 * Multipart form fields:
 *   file       - compressed JPEG blob (max 3MB)
 *   photo_date - YYYY-MM-DD
 *   angle      - front | side | back | other
 *   plan_id    - uuid (optional)
 *
 * Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * R2 binding: PROGRESS_PHOTOS
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
  try {
    return await handleRequest(context);
  } catch (e) {
    return json({ error: 'Unexpected error: ' + (e.message || String(e)) }, 500);
  }
}

async function handleRequest({ request, env }) {
  // Auth
  const jwt = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return json({ error: 'Unauthorized' }, 401);
  const caller = await userRes.json();

  // Parse form
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Invalid form data' }, 400); }

  const file       = form.get('file');
  const photo_date = form.get('photo_date');
  const angle      = form.get('angle');
  const plan_id    = form.get('plan_id') || null;

  if (!file || !photo_date || !angle) return json({ error: 'file, photo_date and angle are required' }, 400);

  const VALID_ANGLES = ['front', 'side', 'back', 'other'];
  if (!VALID_ANGLES.includes(angle)) return json({ error: 'Invalid angle' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(photo_date)) return json({ error: 'Invalid date format' }, 400);
  if (file.size > 3 * 1024 * 1024) return json({ error: 'Photo must be under 3MB after compression' }, 400);

  if (!env.PROGRESS_PHOTOS) return json({ error: 'Photo storage not configured. Add PROGRESS_PHOTOS R2 binding in Cloudflare Pages settings.' }, 503);

  const svcHdrs = { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY };

  // Quota: max 3 photos per date
  const dateRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/progress_photos?client_id=eq.${caller.id}&photo_date=eq.${photo_date}&select=id`,
    { headers: svcHdrs }
  );
  const datePhotos = await dateRes.json();
  if ((datePhotos?.length || 0) >= 3) {
    return json({ error: 'Max 3 photos per date (one per angle). You already have the maximum for this date.' }, 429);
  }

  // Quota: max 2 upload dates per calendar month
  const monthStart = photo_date.slice(0, 7) + '-01';
  const nextMonth  = new Date(photo_date.slice(0, 7) + '-01');
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().split('T')[0];
  const monthRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/progress_photos?client_id=eq.${caller.id}&photo_date=gte.${monthStart}&photo_date=lt.${monthEnd}&select=photo_date`,
    { headers: svcHdrs }
  );
  const monthPhotos = await monthRes.json();
  const existingDates = new Set((monthPhotos || []).map(r => r.photo_date));
  if (!existingDates.has(photo_date) && existingDates.size >= 2) {
    return json({ error: 'Max 2 upload dates per month. You can still add photos to your existing date(s) this month.' }, 429);
  }

  // Write to R2
  const storagePath = `photos/${caller.id}/${photo_date}/${angle}_${Date.now()}.jpg`;
  try {
    await env.PROGRESS_PHOTOS.put(storagePath, await file.arrayBuffer(), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
  } catch (e) {
    return json({ error: 'Storage upload failed: ' + e.message }, 500);
  }

  // Insert metadata row
  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/progress_photos`, {
    method: 'POST',
    headers: { ...svcHdrs, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({
      client_id:    caller.id,
      plan_id:      plan_id || null,
      photo_date,
      angle,
      storage_path: storagePath,
      created_at:   new Date().toISOString(),
    }),
  });

  if (!insertRes.ok) {
    await env.PROGRESS_PHOTOS.delete(storagePath).catch(() => {});
    return json({ error: 'Failed to save photo record' }, 500);
  }

  const rows = await insertRes.json();
  return json({ success: true, photo_id: rows?.[0]?.id });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
