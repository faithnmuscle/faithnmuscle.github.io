/**
 * POST /functions/apply
 * Public endpoint - receives application form submissions and stores them.
 * No auth required. Uses service role key server-side to insert.
 *
 * Accepts: application/json OR multipart/form-data OR application/x-www-form-urlencoded
 * Body fields (all optional except full_name, email, service_type):
 *   full_name, email, contact (phone), age, sex,
 *   height_cm, weight_kg, target_weight_kg,
 *   service_type ('coaching'|'workout'|'meal'|'athletes'|'rehab')
 *   + any other form fields stored in form_data jsonb
 *
 * To wire up the existing apply forms, add to each form's submit handler:
 *   fetch('/functions/apply', { method:'POST', body: new FormData(form) })
 *   (no need to await - fire and forget alongside Web3Forms)
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Server not configured' }, 500);
  }

  // Parse body - accept JSON, FormData, or urlencoded
  let raw = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      raw = await request.json();
    } else {
      const fd = await request.formData();
      fd.forEach((v, k) => {
        // Accumulate multiple values (checkboxes) into arrays
        if (raw[k] !== undefined) {
          raw[k] = Array.isArray(raw[k]) ? [...raw[k], v] : [raw[k], v];
        } else {
          raw[k] = v;
        }
      });
    }
  } catch {
    return json({ error: 'Could not parse request body' }, 400);
  }

  // Required fields
  const { full_name, email, service_type } = raw;
  if (!full_name || !email) {
    return json({ error: 'full_name and email are required' }, 400);
  }

  // Separate known top-level fields from the rest (stored in form_data)
  const {
    contact, phone,
    age, sex, height_cm, weight_kg, target_weight_kg,
    // Web3Forms internal fields - strip these
    access_key, subject, from_name, botcheck, redirect,
    ...rest
  } = raw;

  const validTypes = ['coaching', 'workout', 'meal', 'athletes', 'rehab'];
  const resolvedType = validTypes.includes(service_type) ? service_type : 'coaching';

  const row = {
    service_type:     resolvedType,
    full_name:        String(full_name).trim(),
    email:            String(email).trim().toLowerCase(),
    phone:            contact || phone || null,
    age:              age ? Number(age) : null,
    sex:              sex || null,
    height_cm:        height_cm  ? Number(height_cm)  : null,
    weight_kg:        weight_kg  ? Number(weight_kg)  : null,
    target_weight_kg: target_weight_kg ? Number(target_weight_kg) : null,
    form_data:        rest,
    status:           'pending',
    source:           'website',
    created_at:       new Date().toISOString(),
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/applications`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase insert error:', err);
    return json({ error: 'Failed to save application' }, 500, CORS);
  }

  return json({ ok: true, message: 'Application received' }, 201, CORS);
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
  });
}
