export type AppointmentState = "scheduled" | "checked_in" | "completed";

export type OperationalNotification = {
  kind: "image_ready" | "staff_review";
  audience: "patient" | "care_team";
  message: string;
};

export function chooseOperationalNotification(
  state: AppointmentState,
): OperationalNotification {
  if (state === "completed") {
    return {
      kind: "staff_review",
      audience: "care_team",
      message: "A new appointment image is ready for staff review.",
    };
  }

  return {
    kind: "image_ready",
    audience: "patient",
    message: "Your appointment image was received.",
  };
}
