import { neon } from "@netlify/neon";

// Uses process.env.NETLIFY_DATABASE_URL automatically in Netlify DB projects.
export const sql = neon();

let ready = false;

export async function ensureSchema() {
  if (ready) return;

  // Core table
  await sql(`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      player_id TEXT NOT NULL,
      name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      points INT NOT NULL,
      attempts INT NOT NULL,
      correct INT NOT NULL,
      accuracy INT NOT NULL,
      best_streak INT NOT NULL,
      max_factor INT NOT NULL,
      elapsed_sec REAL NOT NULL,
      avg_sec REAL NOT NULL,
      reason_text TEXT NOT NULL,
      mistakes JSONB NOT NULL,
      slowest_correct JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Useful indexes
  await sql(`CREATE INDEX IF NOT EXISTS scores_player_id_idx ON scores (player_id);`);
  await sql(`CREATE INDEX IF NOT EXISTS scores_points_idx ON scores (points DESC);`);

  ready = true;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export function badRequest(message) {
  return jsonResponse({ error: message }, 400);
}

export function methodNotAllowed() {
  return new Response("Method Not Allowed", { status: 405 });
}
