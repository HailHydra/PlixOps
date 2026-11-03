import { FinalVideoSchema } from "./contracts.js";
import { transitionTask } from "./engine.js";

export function deliverFinalVideo(task, input, user) {
  if (!user || !["edit", "video"].includes(user.role) || (task.editorId && task.editorId !== user.id)) {
    throw Object.assign(new Error("Only the assigned editor can send the final video link."), { status: 403 });
  }
  if (task.state !== "approved") {
    throw Object.assign(new Error("The video must be approved before you send the final link."), { status: 409 });
  }
  const parsed = FinalVideoSchema.safeParse(input);
  if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0].message), { status: 400 });
  return {
    ...transitionTask(task, "ready_for_performance", user.name, "Sent the high-quality video link to the Performance Team."),
    finalVideoUrl: parsed.data.finalVideoUrl,
    finalVideoSubmittedById: user.id,
    finalVideoSubmittedAt: new Date().toISOString(),
  };
}

