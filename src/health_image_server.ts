import { createServer } from "node:http";
import { InfraiError, infrai } from "./infrai_storage.js";
import {
  RequestInputError,
  resizeAndStoreHealthImage,
  uploadBodySchema,
} from "./health_image_upload.js";

const bucket = process.env.INFRAI_STORAGE_BUCKET ?? "health-image-thumbnails";
const port = Number(process.env.PORT ?? 3000);
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_REQUEST_BYTES) throw new RequestInputError("Request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestInputError("Request body must be valid JSON");
  }
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

await infrai.storage.bucket.create({ name: bucket });

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/appointment-images") {
    json(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const parsed = uploadBodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      json(response, 400, { error: "Invalid upload request", details: parsed.error.flatten() });
      return;
    }
    json(response, 201, await resizeAndStoreHealthImage(bucket, parsed.data));
  } catch (error) {
    if (error instanceof RequestInputError) {
      json(response, 400, { error: error.message });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      json(response, error.status, { error: error.message, code: error.code });
      return;
    }
    console.error(error);
    json(response, 502, { error: "Image storage request did not complete" });
  }
}).listen(port, () => {
  console.log(`Health image service listening on http://localhost:${port}`);
});
