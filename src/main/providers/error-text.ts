// Provider HTTP errors leave the main process as status + short reason only.
// Never forward the raw response body: it can echo masked keys or request details.
export function shortReasonForStatus(status: number): string {
  if (status === 401) return 'Auth failed';
  if (status === 403) return 'Access denied';
  if (status === 404) return 'Model or endpoint not found';
  if (status === 408) return 'Request timed out';
  if (status === 429) return 'Rate limited';
  if (status >= 500) return 'Provider unavailable';
  return 'Request failed';
}

export function providerHttpError(providerName: string, status: number): Error {
  return new Error(`${providerName} API error ${status}: ${shortReasonForStatus(status)}`);
}

// Word boundary + required separator so normal words (keyboard, risky) survive.
const KEY_LIKE = /\b(?:sk|xai|pk|rk|key)[-_][A-Za-z0-9*_-]{4,}|\bAIza[A-Za-z0-9_-]{10,}/g;
const BEARER = /Bearer\s+\S+/gi;

// Last line of defense for any error text sent to the renderer.
export function sanitizeErrorMessage(message: string): string {
  let out = message.split('\n')[0];
  const brace = out.search(/[{[]/);
  if (brace >= 0) {
    const prefix = out.slice(0, brace).replace(/[:\s]+$/, '');
    // Keep a readable reason from a JSON body instead of collapsing to "Provider error".
    const inner = extractJsonMessage(out.slice(brace));
    out = [prefix, inner].filter(Boolean).join(': ');
  }
  out = out.replace(BEARER, 'Bearer [redacted]').replace(KEY_LIKE, '[redacted]');
  if (out.length > 120) out = `${out.slice(0, 117)}...`;
  return out || 'Provider error';
}

function extractJsonMessage(raw: string): string {
  try {
    const data = JSON.parse(raw) as unknown;
    const pick = (v: unknown): string | undefined => {
      if (!v || typeof v !== 'object') return typeof v === 'string' ? v : undefined;
      const o = v as Record<string, unknown>;
      return pick(o.error) ?? (typeof o.message === 'string' ? o.message : undefined);
    };
    const first = Array.isArray(data) ? data[0] : data;
    return (pick(first) || '').split('\n')[0];
  } catch {
    return '';
  }
}
