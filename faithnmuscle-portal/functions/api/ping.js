/**
 * GET /functions/ping
 * Diagnostic endpoint - confirms Pages Functions are deployed and running.
 */
export function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, ts: Date.now(), service: 'faithnmuscle-portal' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
