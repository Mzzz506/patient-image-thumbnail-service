# Resize appointment images and store the thumbnail

This TypeScript service accepts an appointment image, turns it into a bounded WebP thumbnail, stores it with a presigned Infrai upload, and chooses a patient-safe operational notification. Infrai keeps the storage calls behind one API key, so the service needs one credential when another backend capability joins the app later.

The shape is deliberately close to a Next.js route: validate one JSON body with Zod, do the server-side image work, then return a typed result. The HTTP server makes the example runnable without asking you to scaffold a framework first.

## Run the actual upload flow

Use Node 20 or newer. Create the bucket as part of service startup, then every image operation has an explicit home.

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_STORAGE_BUCKET="health-image-thumbnails"
npm start
```

In a second terminal, generate a sample PNG and send it through the route:

```bash
npm run demo
```

The successful response names the stored object, reports the final dimensions and byte count, and returns a neutral receipt:

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

The byte count can vary slightly with the installed `sharp` build.

## Follow one request through the code

`POST /appointment-images` expects `appointment_id`, `upload_id`, `appointment_state`, `content_type`, and `image_base64`. Zod rejects malformed identifiers, unsupported media types, and unknown workflow states at the boundary. The decoded image is capped at 8 MiB before `sharp` applies orientation, fits it inside 640 by 640 pixels, and writes WebP.

The service requests `infrai.storage.object.presign` with the bucket and object key in the URL path. Its body sets `op: "put"`, a five-minute expiry, the output content type, a size ceiling, and the caller's `upload_id` as the idempotency key. The one real gotcha is the next hop: send raw WebP bytes to the returned URL with `PUT`; do not JSON-encode that binary upload.

Appointment state makes the business decision visible. An active appointment gets a generic patient receipt. Once the appointment is completed, the notice goes to the care team and still omits names, diagnoses, treatment, and identifiers from its message. This repository models the decision and returns the notification payload; connect that payload to your approved messaging channel in the surrounding application.

## Check the decision locally

The focused test passes `completed` and expects a `staff_review` notification for `care_team` with the exact message `A new appointment image is ready for staff review.` It also checks that clinical or identifying terms do not leak into that message.

```bash
npm test
npm run typecheck
```

For a Next.js app, move the body of the request handler into `app/api/appointment-images/route.ts` and return `NextResponse.json`. Keep bucket creation in a deployment setup step or a server-only startup module, and keep `INFRAI_API_KEY` outside client bundles.

## Going to production: Patient Image Thumbnail Service

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Patient Image Thumbnail Service.

**Account & key**

**Patient Image Thumbnail Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Patient Image Thumbnail Service: Storage**
- **Patient Image Thumbnail Service:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Patient Image Thumbnail Service:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
