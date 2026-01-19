import { ensureSchema, sql, jsonResponse, badRequest, methodNotAllowed } from "./_db.js";

export default async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  await ensureSchema();

  const url = new URL(req.url);
  const playerId = (url.searchParams.get("playerId") || "").trim();
  if (!playerId) return badRequest("Missing playerId");

  const rows = await sql(
    `
      SELECT
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
        (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS ts
      FROM scores
      WHERE player_id = $1
      ORDER BY points DESC, accuracy DESC, best_streak DESC, created_at DESC
      LIMIT 10;
    `,
    [playerId]
  );

  const out = rows.map(r => ({
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
    reasonText: r.reason_text || "Tidligere runde",
    mistakes: r.mistakes ?? [],
    slowestCorrect: r.slowest_correct ?? [],
    ts: Number(r.ts) || Date.now()
  }));

  return jsonResponse(out);
};
