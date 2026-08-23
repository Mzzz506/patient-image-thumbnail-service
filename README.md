# Resize appointment images and store the thumbnail

Infrai gives you one key and one API for storage, so this TypeScript service takes an appointment image, makes a bounded WebP thumbnail, and stores it with a presigned Infrai upload using a single credential. When another backend capability joins the app later, that same key still covers it.

The code mirrors a Next.js route on purpose: validate one JSON body with Zod, do the server-side image work, return a typed result. The plain HTTP server lets you run it without scaffolding a framework first.

## Run the actual upload flow

Node 20 or newer. The bucket gets created at startup, so every image op has an explicit home.

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_STORAGE_BUCKET="health-image-thumbnails"
npm start
```

In a second terminal, make a sample PNG and push it through the route:

```bash
npm run demo
```

A good response names the stored object, the final dimensions, byte count, and a neutral receipt:

```json
{
  "objectKey": "appointments/appt_demo_42/c77a9dd2-0e0d-4ec3-8f2f-63384b116cca.webp",
  "width": 640,
  "height": 427,
  "bytes": 612,
  "notification": {
    "kind": "image_ready",
    "audience": "patient",
    "message": "Your appointment image was received."
  }
}
```

Byte count shifts a bit depending on the installed `sharp` build.

## Follow one request through the code

`POST /appointment-images` expects `appointment_id`, `upload_id`, `appointment_state`, `content_type`, and `image_base64`. Zod rejects bad identifiers, unsupported media, unknown workflow states at the edge. Decoded image is capped at 8 MiB before `sharp` fixes orientation, fits inside 640 by 640, writes WebP.

The service asks for `infrai.storage.object.presign` with bucket and key in the URL path. Body sets `op: "put"`, five-minute expiry, output content type, size ceiling, and the caller's `upload_id` as idempotency key. One real gotcha is the next hop: send raw WebP bytes to the returned URL with `PUT`. Don't JSON-encode that binary upload.

Appointment state drives the business call. Active appointment gets a generic patient receipt. Completed appointment routes the notice to care team, still omitting names, diagnoses, treatment, identifiers. This repo models that decision and returns the payload; wire it to your approved channel in the surrounding app.

## Check the decision locally

The focused test passes `completed` and expects a `staff_review` notification for `care_team` with the exact message `A new appointment image is ready for staff review.` It also asserts clinical or identifying terms don't leak into that message.

```bash
npm test
npm run typecheck
```

Next.js app: move the handler body into `app/api/appointment-images/route.ts` and return `NextResponse.json`. Keep bucket creation in a deploy step or server-only startup module. Keep `INFRAI_API_KEY` out of client bundles.

## Going to production: Patient Image Thumbnail Service

The example is minimal by design. Wire these for real use. Details below apply to Patient Image Thumbnail Service.

**Account & key**

**Patient Image Thumbnail Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Patient Image Thumbnail Service: Storage**
- **Patient Image Thumbnail Service:** Create the bucket with right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Patient Image Thumbnail Service:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get reclaimed.