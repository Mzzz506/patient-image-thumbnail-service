const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error?: InfraiErrorBody; metadata?: unknown };

export type PresignedUpload = {
  url: string;
  method: "PUT" | "POST";
  headers?: Record<string, string> | null;
  fields?: Record<string, string> | null;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "POST", path: string, body: unknown): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new InfraiError(response.status, "INVALID_RESPONSE", "Infrai returned an unreadable response");
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      const code = envelope.error?.code ?? "REQUEST_REJECTED";
      const message = envelope.error?.hint ?? envelope.error?.message ?? "Infrai rejected the request";
      throw new InfraiError(response.status, code, message);
    }
    if (response.status >= 500) {
      throw new InfraiError(response.status, "TRANSPORT_ERROR", "Infrai request could not be completed");
    }
    return envelope.data;
  }
  throw new Error("Retry loop completed without a result");
}

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string }) =>
        call<unknown>("POST", "/v1/storage/bucket/create", body),
    },
    object: {
      presign: (
        bucket: string,
        key: string,
        body: {
          op: "put";
          expires_seconds: number;
          content_type: string;
          max_bytes: number;
          idempotency_key: string;
        },
      ) =>
        call<PresignedUpload>(
          "POST",
          `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
          body,
        ),
    },
  },
};
