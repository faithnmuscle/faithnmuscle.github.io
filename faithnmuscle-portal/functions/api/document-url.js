/**
 * GET /api/document-url?document_id=<uuid>
 * Verifies JWT + plan ownership, streams the file from R2.
 *
 * Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * R2 binding: PLAN_DOCUMENTS
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const document_id = url.searchParams.get('document_id');

  if (!document_id) return err('document_id required', 400);

  // Auth
  const jwt = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!jwt) return err('Unauthorized', 401);

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return err('Unauthorized', 401);
  const caller = await userRes.json();

  // Fetch document metadata
  const docRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/plan_documents?id=eq.${document_id}&select=storage_path,file_name,plan_id`,
    { headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const docs = await docRes.json();
  if (!docs?.[0]) return err('Document not found', 404);
  const { storage_path, file_name, plan_id } = docs[0];

  // Check caller owns this plan (or is admin)
  const profileRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${caller.id}&select=role`,
    { headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const profiles = await profileRes.json();
  const isAdmin  = profiles?.[0]?.role === 'admin';

  if (!isAdmin) {
    const planRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/plans?id=eq.${plan_id}&client_id=eq.${caller.id}&select=id`,
      { headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY } }
    );
    const plans = await planRes.json();
    if (!plans?.[0]) return err('Forbidden', 403);
  }

  if (!env.PLAN_DOCUMENTS) return err('Storage not configured', 503);

  // Stream file from R2
  const object = await env.PLAN_DOCUMENTS.get(storage_path);
  if (!object) return err('File not found in storage', 404);

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
  const safeName    = (file_name || 'document').replace(/[^\w.\-]/g, '_');

  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      ...CORS,
    },
  });
}

function err(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
