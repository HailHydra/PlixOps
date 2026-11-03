import { NextResponse } from "next/server";
import { transitionTask } from "@/lib/workflow/engine";
import { mutateState } from "@/lib/store/unified-store";
import { saveReviewVideo, deleteReviewVideo } from "@/lib/video/storage";

export const runtime = "nodejs";

export async function POST(request, context) {
  let asset = null;
  try {
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") || "";

    let videoUrl = "";
    let comment = "";
    let aspectRatio = "9:16";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("video");
      comment = form.get("comment") || "";
      aspectRatio = form.get("aspectRatio") || "9:16";

      if (file && typeof file.arrayBuffer === "function" && file.size > 0) {
        asset = await saveReviewVideo(file);
        videoUrl = `/api/tasks/${encodeURIComponent(id)}/video/${asset.key}`;
      } else {
        videoUrl = form.get("videoUrl") || "";
      }
    } else {
      const body = await request.json();
      videoUrl = body.videoUrl || "";
      comment = body.comment || "";
      aspectRatio = body.aspectRatio || "9:16";
    }

    if (!videoUrl) {
      return NextResponse.json({ error: "Please upload a video file or provide a video link." }, { status: 400 });
    }

    const { result } = await mutateState(async ({ tasks }) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Task ${id} not found`);

      const current = tasks[index];
      const version = Math.max(0, ...(current.versions || []).map((item) => Number(item.number) || 0)) + 1;

      let updated = transitionTask(
        current,
        "approval_pending",
        "Video Editor",
        `Submitted video cut v${version} for Brand review.`
      );

      updated.videoLink = videoUrl;
      updated.videoAsset = asset;
      updated.aspectRatio = aspectRatio;

      // Add to versions
      updated.versions = updated.versions || [];
      updated.versions.unshift({
        id: `ver-${Date.now()}`,
        number: version,
        videoUrl,
        videoAsset: asset,
        aspectRatio,
        comment,
        status: "In review",
        submittedAt: new Date().toISOString(),
      });

      // Add pending video approval
      updated.approvals = updated.approvals || [];
      updated.approvals.unshift({
        id: `appr-vid-${Date.now()}`,
        type: "video",
        status: "pending",
        requestedBy: "Video Editor",
        comment,
        requestedAt: new Date().toISOString(),
      });

      tasks[index] = updated;
      return updated;
    }, "Video Editor");

    return NextResponse.json({ task: result });
  } catch (error) {
    if (asset) await deleteReviewVideo(asset).catch(() => {});
    return NextResponse.json({ error: error.message || "Failed to submit video" }, { status: 500 });
  }
}
