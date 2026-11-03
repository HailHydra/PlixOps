import { NextResponse } from "next/server";
import { GoLiveSchema } from "@/lib/workflow/contracts";
import { transitionTask } from "@/lib/workflow/engine";
import { mutateState } from "@/lib/store/unified-store";

export async function POST(request, context) {
  try {
    const { id } = await context.params;
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const parsed = GoLiveSchema.safeParse({ ...body, taskId: id });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid go-live submission" },
        { status: 400 }
      );
    }

    const { result } = await mutateState(async ({ tasks }) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Task ${id} not found`);

      const current = tasks[index];
      const videoAsset = current.finalVideoUrl || current.videoLink || "";
      const liveUrl = parsed.data.liveUrl || videoAsset;

      let updated = transitionTask(
        current,
        "published",
        "Performance Marketer",
        videoAsset
          ? `Campaign pushed LIVE with approved video: ${videoAsset}`
          : "Campaign pushed LIVE"
      );

      updated.liveUrl = liveUrl;
      if (parsed.data.campaignId) updated.campaignId = parsed.data.campaignId;
      updated.publishedAt = new Date().toISOString();

      if (liveUrl) {
        updated.assets = updated.assets || [];
        updated.assets.unshift({
          id: `ast-live-${Date.now()}`,
          type: "live_link",
          label: "Live Campaign",
          url: liveUrl,
          submittedAt: new Date().toISOString(),
        });
      }

      tasks[index] = updated;
      return updated;
    }, "Performance Marketer");

    return NextResponse.json({ task: result });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to push live" }, { status: 500 });
  }
}
