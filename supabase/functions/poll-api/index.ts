const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedPolls = new Set(["costume-adults", "costume-kids", "spookiest-cookie"]);
const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i % (a.length || 1)] ?? 0) ^ (b[i % (b.length || 1)] ?? 0);
  return difference === 0;
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function dbHeaders() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Poll storage is not configured. Set the Edge Function service role key.");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function tableUrl(params: URLSearchParams) {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new Error("Poll storage is not configured. Set the Edge Function project URL.");
  return `${base}/rest/v1/poll_votes?${params.toString()}`;
}

async function adminAllowed(req: Request) {
  const expected = Deno.env.get("ADMIN_PASSWORD") ?? "Password";
  const received = req.headers.get("x-admin-password") ?? "";
  return expected.length > 0 && constantTimeEqual(received, expected);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST for poll requests." }, 405);

  try {
    const payload = await req.json();
    const action = safeText(payload?.action, 40);

    if (action === "admin-auth") {
      if (!(await adminAllowed(req))) return json({ error: "Incorrect admin password." }, 401);
      return json({ ok: true });
    }

    if (action === "vote") {
      const pollId = safeText(payload?.pollId, 40);
      const username = safeText(payload?.username, 32);
      const answer = safeText(payload?.answer, 180);
      if (!allowedPolls.has(pollId)) return json({ error: "That poll was not found." }, 404);
      if (!username || username.toLocaleLowerCase() === "admin") return json({ error: "Please use a valid non-admin username." }, 400);
      if (!answer) return json({ error: "Please enter an answer." }, 400);

      const response = await fetch(tableUrl(new URLSearchParams({ on_conflict: "poll_id,username" })), {
        method: "POST",
        headers: { ...dbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ poll_id: pollId, username, answer, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) return json({ error: "Could not save the answer. Please try again." }, 502);
      return json({ ok: true });
    }

    if (action === "my-votes") {
      const username = safeText(payload?.username, 32);
      if (!username || username.toLocaleLowerCase() === "admin") return json({ error: "Please use a valid non-admin username." }, 400);
      const query = new URLSearchParams({ select: "poll_id,answer", username: `eq.${username}` });
      const response = await fetch(tableUrl(query), { headers: dbHeaders() });
      if (!response.ok) return json({ error: "Could not load your saved answers." }, 502);
      const rows = await response.json();
      return json({ votes: Object.fromEntries(rows.map((row: { poll_id: string; answer: string }) => [row.poll_id, row.answer])) });
    }

    if (!(await adminAllowed(req))) return json({ error: "Admin authorization is required." }, 401);

    const pollId = safeText(payload?.pollId, 40);
    if (!allowedPolls.has(pollId)) return json({ error: "That poll was not found." }, 404);

    if (action === "admin-list") {
      const query = new URLSearchParams({
        select: "username,answer,updated_at",
        poll_id: `eq.${pollId}`,
      });
      const response = await fetch(tableUrl(query), { headers: dbHeaders() });
      if (!response.ok) return json({ error: "Could not load the results." }, 502);
      const rows = await response.json();
      rows.sort((a: { answer: string; username: string }, b: { answer: string; username: string }) => a.answer.localeCompare(b.answer, "en", { sensitivity: "base" }) || a.username.localeCompare(b.username, "en", { sensitivity: "base" }));
      return json({ results: rows });
    }

    if (action === "admin-delete") {
      const username = safeText(payload?.username, 32);
      if (!username) return json({ error: "A username is required." }, 400);
      const query = new URLSearchParams({ poll_id: `eq.${pollId}`, username: `eq.${username}` });
      const response = await fetch(tableUrl(query), { method: "DELETE", headers: dbHeaders() });
      if (!response.ok) return json({ error: "Could not delete that answer." }, 502);
      return json({ ok: true });
    }

    if (action === "admin-clear") {
      const query = new URLSearchParams({ poll_id: `eq.${pollId}` });
      const response = await fetch(tableUrl(query), { method: "DELETE", headers: dbHeaders() });
      if (!response.ok) return json({ error: "Could not clear this poll." }, 502);
      return json({ ok: true });
    }

    return json({ error: "Unknown poll action." }, 400);
  } catch (error) {
    console.error("poll-api error", error);
    const message = error instanceof SyntaxError ? "Request body must be valid JSON." : "The poll service is unavailable right now.";
    return json({ error: message }, 500);
  }
});
