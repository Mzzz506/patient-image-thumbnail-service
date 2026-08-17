import assert from "node:assert/strict";
import test from "node:test";
import { chooseOperationalNotification } from "../src/appointment_notification.js";

test("a completed appointment routes the image notice to the care team without clinical details", () => {
  const notification = chooseOperationalNotification("completed");

  assert.deepEqual(notification, {
    kind: "staff_review",
    audience: "care_team",
    message: "A new appointment image is ready for staff review.",
  });
  assert.doesNotMatch(notification.message, /patient|diagnosis|treatment|appointment id/i);
});

test("an active appointment gets a neutral patient receipt", () => {
  assert.deepEqual(chooseOperationalNotification("checked_in"), {
    kind: "image_ready",
    audience: "patient",
    message: "Your appointment image was received.",
  });
});
