/**
 * POST /functions/upload-document
 * Admin-only. Uploads a file to R2 and inserts a plan_documents row.
 *
 * Multipart form fields:
 *   file        - the file binary
 *   plan_id     - uuid
 *   file_type   - 'workout_program' | 'meal_program' | 'general'
 *   description - optional string
 *
 * Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * R2 binding: PLAN_DOCUMENTS
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
  } catch (err) {
    return json({ error: 'Unexpected error: ' + (err.message || String(err)) }, 500);
  }
}

async function handleRequest(context) {
  const { request, env } = context;

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

  // -- Parse multipart form --
  let formData;
  try { formData = await request.formData(); } catch { return json({ error: 'Invalid form data' }, 400); }

  const file        = formData.get('file');
  const plan_id     = formData.get('plan_id');
  const file_type   = formData.get('file_type') || 'general';
  const description = formData.get('description') || '';

  if (!file || !plan_id) return json({ error: 'file and plan_id are required' }, 400);

  if (!env.PLAN_DOCUMENTS) return json({ error: 'R2 bucket not configured. Add PLAN_DOCUMENTS binding in Cloudflare Pages settings.' }, 503);

  // -- Validate --
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) return json({ error: 'File must be under 10MB' }, 400);

  const validTypes = ['workout_program', 'meal_program', 'general'];
  if (!validTypes.includes(file_type)) return json({ error: 'Invalid file_type' }, 400);

  // Sanitise filename - strip path traversal, keep extension
  const rawName    = file.name || 'document';
  const safeName   = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_');
  const timestamp  = Date.now();
  const storagePath = `documents/${plan_id}/${timestamp}_${safeName}`;

  // -- Write to R2 --
  try {
    const fileBuffer = await file.arrayBuffer();
    await env.PLAN_DOCUMENTS.put(storagePath, fileBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
  } catch (err) {
    return json({ error: 'Storage upload failed' }, 500);
  }

  // -- Insert metadata row --
  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/plan_documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      plan_id,
      file_name:    safeName,
      storage_path: storagePath,
      file_type,
      description:  description || null,
      uploaded_by:  caller.id,
      created_at:   new Date().toISOString(),
    }),
  });

  if (!insertRes.ok) {
    // Clean up R2 object if DB insert failed
    await env.PLAN_DOCUMENTS.delete(storagePath).catch(() => {});
    return json({ error: 'Failed to save document record' }, 500);
  }

  const rows = await insertRes.json();

  // -- Notify client --
  const planRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/plans?id=eq.${plan_id}&select=client_id`,
    { headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const plans = await planRes.json();
  if (plans?.[0]?.client_id) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        user_id:    plans[0].client_id,
        type:       'document_uploaded',
        title:      'New document available',
        body:       `${safeName} has been uploaded to your plan.`,
        created_at: new Date().toISOString(),
      }),
    });
  }

  return json({ success: true, document_id: rows?.[0]?.id });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
