import { ensureSchema, sql, jsonResponse, badRequest, methodNotAllowed } from "./_db.js";

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

function requireAdmin(req) {
  const expected = (process.env.ADMIN_TOKEN || "").trim();
  const got = (req.headers.get("x-admin-token") || "").trim();
  if (!expected) return false;         // fail-closed hvis du ikke har satt token
  return got && got === expected;
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

export default async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed();
  if (!requireAdmin(req)) return unauthorized();

  await ensureSchema();

  const url = new URL(req.url);

  // ---------- LIST ----------
  if (req.method === "GET") {
    const className = (url.searchParams.get("className") || "").trim();
    const playerId = (url.searchParams.get("playerId") || "").trim();
    const name = (url.searchParams.get("name") || "").trim();
    const limit = clampInt(url.searchParams.get("limit") || 200, 1, 1000);

    const where = [];
    const params = [];

    if (className) {
      params.push(className);
      where.push(`UPPER(class_name) = UPPER($${params.length})`);
    }
    if (playerId) {
      params.push(playerId);
      where.push(`player_id = $${params.length}`);
    }
    if (name) {
      params.push(`%${name}%`);
      where.push(`name ILIKE $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await sql(
      `
        SELECT
          id,
          player_id,
          name,
          class_name,
          points,
          attempts,
          correct,
          accuracy,
          best_streak,
          max_factor,
          elapsed_sec,
          avg_sec,
          reason_text,
          mistakes,
          slowest_correct,
          created_at,
          (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS ts
        FROM scores
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ${limit};
      `,
      params
    );

    const out = rows.map(r => ({
      id: Number(r.id),
      playerId: r.player_id,
      name: r.name,
      className: r.class_name,
      points: Number(r.points) || 0,
      attempts: Number(r.attempts) || 0,
      correct: Number(r.correct) || 0,
      accuracy: Number(r.accuracy) || 0,
      bestStreak: Number(r.best_streak) || 0,
      maxFactor: Number(r.max_factor) || 10,
      elapsedSec: Number(r.elapsed_sec) || 0,
      avgSec: Number(r.avg_sec) || 0,
      reasonText: r.reason_text || "",
      mistakes: r.mistakes ?? [],
      slowestCorrect: r.slowest_correct ?? [],
      createdAt: r.created_at,
      ts: Number(r.ts) || Date.now()
    }));

    return jsonResponse(out);
  }

  // ---------- DELETE ACTIONS ----------
  // POST JSON: { action: "deleteScore"|"deleteUser"|"deleteClass", id? , playerId? , className? }
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const action = String(body.action || "").trim();

  if (action === "deleteScore") {
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return badRequest("Missing/invalid id");

    const rows = await sql(`DELETE FROM scores WHERE id = $1 RETURNING id;`, [id]);
    return jsonResponse({ ok: true, deleted: rows.length });
  }

  if (action === "deleteUser") {
    const playerId = String(body.playerId || "").trim();
    if (!playerId) return badRequest("Missing playerId");

    const before = await sql(`SELECT COUNT(*)::int AS c FROM scores WHERE player_id = $1;`, [playerId]);
    await sql(`DELETE FROM scores WHERE player_id = $1;`, [playerId]);

    return jsonResponse({ ok: true, deleted: Number(before?.[0]?.c || 0) });
  }

  if (action === "deleteClass") {
    const className = String(body.className || "").trim();
    if (!className) return badRequest("Missing className");

    const before = await sql(
      `SELECT COUNT(*)::int AS c FROM scores WHERE UPPER(class_name) = UPPER($1);`,
      [className]
    );
    await sql(`DELETE FROM scores WHERE UPPER(class_name) = UPPER($1);`, [className]);

    return jsonResponse({ ok: true, deleted: Number(before?.[0]?.c || 0) });
  }

  return badRequest("Unknown action");
};
