import sharp from "sharp";

const image = await sharp({
  create: { width: 1200, height: 800, channels: 3, background: "#dce9e4" },
})
  .png()
  .toBuffer();

const response = await fetch("http://localhost:3000/appointment-images", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    appointment_id: "appt_demo_42",
    upload_id: "c77a9dd2-0e0d-4ec3-8f2f-63384b116cca",
    appointment_state: "checked_in",
    content_type: "image/png",
    image_base64: image.toString("base64"),
  }),
});

console.log(JSON.stringify(await response.json(), null, 2));
