/**
 * Debug-mode only. Sends one NDJSON log line to the ingest endpoint.
 * Do not log secrets (tokens, client_secret, private keys).
 */
const INGEST_URL = "http://127.0.0.1:7315/ingest/386ad41b-ea55-4c1c-90a9-aa25251321fb";
const SESSION_ID = "a1a618";

export function oidcDebugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  const body = {
    sessionId: SESSION_ID,
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
    timestamp: Date.now(),
  };
  fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION_ID },
    body: JSON.stringify(body),
  }).catch(() => {});
}
