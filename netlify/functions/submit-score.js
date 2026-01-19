import { ensureSchema, sqlQuery, jsonResponse, badRequest, methodNotAllowed } from "./_db.js";

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function clampFloat(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function safeText(s, maxLen) {
  return String(s ?? "").trim().slice(0, maxLen);
}

function safeArray(x, maxLen = 200) {
  if (!Array.isArray(x)) return [];
  return x.slice(0, maxLen);
}

export default async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  await ensureSchema();

  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const playerId = safeText(body.playerId, 80);
  const name = safeText(body.name, 40) || "Ukjent";
  const className = safeText(body.className, 40) || "Ukjent";

  if (!playerId) return badRequest("Missing playerId");

  const points = clampInt(body.points, 0, 1000000);
  const attempts = clampInt(body.attempts, 0, 1000000);
  const correct = clampInt(body.correct, 0, 1000000);
  const accuracy = clampInt(body.accuracy, 0, 100);
  const bestStreak = clampInt(body.bestStreak, 0, 1000000);
  const maxFactor = clampInt(body.maxFactor, 1, 12);
  const elapsedSec = clampFloat(body.elapsedSec, 0, 600);
  const avgSec = clampFloat(body.avgSec, 0, 60);
  const reasonText = safeText(body.reasonText, 80) || "Ferdig";

  const mistakes = safeArray(body.mistakes, 80);
  const slowestCorrect = safeArray(body.slowestCorrect, 10);

  // Store JSON as JSONB
  const mistakesJson = JSON.stringify(mistakes);
  const slowestJson = JSON.stringify(slowestCorrect);

  await sqlQuery(
    `
      INSERT INTO scores (
        player_id, name, class_name,
        points, attempts, correct, accuracy,
        best_streak, max_factor,
        elapsed_sec, avg_sec,
        reason_text, mistakes, slowest_correct
      )
      VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9,
        $10, $11,
        $12, $13::jsonb, $14::jsonb
      );
    `,
    [
      playerId, name, className,
      points, attempts, correct, accuracy,
      bestStreak, maxFactor,
      elapsedSec, avgSec,
      reasonText, mistakesJson, slowestJson
    ]
  );

  return jsonResponse({ ok: true });
};
