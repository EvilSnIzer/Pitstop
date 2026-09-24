export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public requestId?: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Pitstop-Request", "1");
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  return requestJson<T>(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
}

export async function uploadMedia(file: File): Promise<{ id: number }> {
  const form = new FormData();
  form.append("file", file);
  const direct = process.env.NEXT_PUBLIC_DIRECT_API_URL;
  if (!direct) return api("/upload/", { method: "POST", body: form });
  const ticket = await api<{ token: string }>("/upload/authorize/", {
    method: "POST",
    body: JSON.stringify({ size: file.size, mime_type: file.type }),
  });
  return requestJson(`${direct.replace(/\/$/, "")}/api/v1/upload/`, {
    method: "POST",
    headers: { "X-Upload-Token": ticket.token },
    credentials: "omit",
    body: form,
  });
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(75000)])
        : AbortSignal.timeout(75000),
    });
  } catch {
    throw new ApiError(
      0,
      "Connection interrupted. Your draft is kept. Please retry.",
      "network_error",
    );
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}). Please retry.`;
    let code: string | undefined;
    try {
      const data = await res.json();
      code = data.code;
      if (data.errors) {
        message = Object.entries(data.errors)
          .map(
            ([field, value]) =>
              `${field}: ${Array.isArray(value) ? value.join(" ") : value}`,
          )
          .join(" ");
      } else if (typeof data.detail === "string") message = data.detail;
    } catch {
      /* A proxy may return HTML instead of the API error envelope. */
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ApiError(
      res.status,
      message,
      code,
      res.headers.get("x-request-id") ?? undefined,
      retryAfter || undefined,
    );
  }
  if (res.status === 204) return undefined as T;
  try {
    return await res.json();
  } catch {
    throw new ApiError(
      503,
      "The backend may be waking up. Wait about a minute and retry.",
      "upstream_unavailable",
    );
  }
}
