/**
 * Scheduled Cloudflare Worker - Supabase keep-alive
 * Fires every 3 days (cron trigger: every-3-days) to prevent
 * the free-tier Supabase project from pausing after 1 week idle.
 *
 * Register in wrangler.toml (or Cloudflare dashboard Workers & Pages → Triggers → Cron).
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey':         env.SUPABASE_SERVICE_ROLE_KEY,
        },
      }
    );

    if (!res.ok) {
      console.error('Keep-alive failed:', res.status, await res.text());
    } else {
      console.log('Keep-alive OK:', new Date().toISOString());
    }
  },
};
