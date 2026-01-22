import { ensureSchema, sqlQuery, jsonResponse, methodNotAllowed } from "./_db.js";

// Behavior:
// - With className: top N scores for that class, one per unique name (best score)
// - Without className: global top N, one per unique (name + className) (best score)
// NOTE:
// - For global list, "unique player" is (LOWER(name), class_name) so same name in different classes both show up.
// - For class list, class is already fixed, so unique by LOWER(name) is correct.
// Optional query param: ?limit=NUMBER
// - Default: class=5, global=25
// - Clamped: class 1..200, global 1..500

export default async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  await ensureSchema();

  const url = new URL(req.url);
  const className = (url.searchParams.get("className") || "").trim();
  const isClass = Boolean(className);

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const defaultLimit = isClass ? 5 : 25;
  let limit = defaultLimit;

  // IMPORTANT: only parse if the param exists
  if (url.searchParams.has("limit")) {
    const raw = (url.searchParams.get("limit") || "").trim();
    const parsed = parseInt(raw, 10);

    if (Number.isFinite(parsed)) {
      limit = clamp(parsed, 1, isClass ? 200 : 500);
    }
  }

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

  const rows = isClass
    ? await sqlQuery(
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
          LIMIT $2;
        `,
        [className, limit]
      )
    : await sqlQuery(
        `
          WITH best AS (
            SELECT DISTINCT ON (LOWER(name), class_name)
              *
            FROM (
              ${baseSelect}
              WHERE class_name IS NOT NULL
            ) s
            ORDER BY LOWER(name), class_name, points DESC, accuracy DESC, best_streak DESC, created_at DESC
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
          LIMIT $1;
        `,
        [limit]
      );

  const out = rows.map((r) => ({
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
    ts: Number(r.ts) || Date.now(),
  }));

  return jsonResponse(out);
};
