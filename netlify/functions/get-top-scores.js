import { ensureSchema, sql, jsonResponse, methodNotAllowed } from "./_db.js";

// Behavior:
// - With className: top 5 scores for that class, one per unique name (best score)
// - Without className: global top 25, one per unique name (best score)
// NOTE: "Unique name" is case-insensitive.

export default async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  await ensureSchema();

  const url = new URL(req.url);
  const className = (url.searchParams.get("className") || "").trim();
  const isClass = Boolean(className);

  const baseSelect = `
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
      (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS ts,
      created_at
    FROM scores
  `;

  // Pick best row per unique name first, then rank.
  // DISTINCT ON needs ORDER BY: (key, score desc...)
  const rows = isClass
    ? await sql(
        `
          WITH best AS (
            SELECT DISTINCT ON (LOWER(name))
              *
            FROM (
              ${baseSelect}
              WHERE class_name = $1
            ) s
            ORDER BY LOWER(name), points DESC, accuracy DESC, best_streak DESC, created_at DESC
          )
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
            ts
          FROM best
          ORDER BY points DESC, accuracy DESC, best_streak DESC, ts DESC
          LIMIT 5;
        `,
        [className]
      )
    : await sql(
        `
          WITH best AS (
            SELECT DISTINCT ON (LOWER(name))
              *
            FROM (
              ${baseSelect}
            ) s
            ORDER BY LOWER(name), points DESC, accuracy DESC, best_streak DESC, created_at DESC
          )
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
            ts
          FROM best
          ORDER BY points DESC, accuracy DESC, best_streak DESC, ts DESC
          LIMIT 25;
        `
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
