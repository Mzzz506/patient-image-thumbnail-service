import sharp from "sharp";
import { z } from "zod";
import { chooseOperationalNotification } from "./appointment_notification.js";
import { infrai } from "./infrai_storage.js";

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 512 * 1024;

export const uploadBodySchema = z.object({
  appointment_id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  upload_id: z.string().uuid(),
  appointment_state: z.enum(["scheduled", "checked_in", "completed"]),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  image_base64: z.string().min(1),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;

export type UploadResult = {
  objectKey: string;
  width: number;
  height: number;
  bytes: number;
  notification: ReturnType<typeof chooseOperationalNotification>;
};

export async function resizeAndStoreHealthImage(
  bucket: string,
  input: UploadBody,
): Promise<UploadResult> {
  const source = Buffer.from(input.image_base64, "base64");
  if (source.length === 0 || source.length > MAX_SOURCE_BYTES) {
    throw new RequestInputError("image_base64 must decode to an image no larger than 8 MiB");
  }

  let thumbnail: Buffer;
  try {
    thumbnail = await sharp(source)
      .rotate()
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new RequestInputError("image_base64 must contain a readable JPEG, PNG, or WebP image");
  }

  const objectKey = `appointments/${input.appointment_id}/${input.upload_id}.webp`;
  const presigned = await infrai.storage.object.presign(bucket, objectKey, {
    op: "put",
    expires_seconds: 300,
    content_type: "image/webp",
    max_bytes: MAX_THUMBNAIL_BYTES,
    idempotency_key: input.upload_id,
  });

  let upload: Response;
  if (presigned.method === "POST" && presigned.fields) {
    const form = new FormData();
    for (const [name, value] of Object.entries(presigned.fields)) form.append(name, value);
    form.append("file", new Blob([new Uint8Array(thumbnail)], { type: "image/webp" }));
    upload = await fetch(presigned.url, { method: "POST", body: form });
  } else {
    upload = await fetch(presigned.url, {
      method: presigned.method,
      headers: presigned.headers ?? { "Content-Type": "image/webp" },
      body: new Uint8Array(thumbnail),
    });
  }
  if (!upload.ok) throw new Error(`Signed upload returned HTTP ${upload.status}`);

  const metadata = await sharp(thumbnail).metadata();
  return {
    objectKey,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    bytes: thumbnail.length,
    notification: chooseOperationalNotification(input.appointment_state),
  };
}

export class RequestInputError extends Error {}
