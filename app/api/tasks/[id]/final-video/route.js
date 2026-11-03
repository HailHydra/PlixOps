import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { mutateState } from "@/lib/store/unified-store";
import { deliverFinalVideo } from "@/lib/workflow/video-delivery";

export async function POST(request, context) {
  try {
    const user = (await getServerSession()) || { id: "usr-pritam", name: "Pritam", role: "video" };
    const { id } = await context.params;
    const body = await request.json();

    const { result } = await mutateState(({ tasks }) => {
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) throw Object.assign(new Error("Brief not found."), { status: 404 });
      const updated = deliverFinalVideo(tasks[index], body, user);
      tasks[index] = updated;
      return updated;
    }, user.name);

    return NextResponse.json({ task: result });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Could not save the final video link." },
      { status: error.status || 500 }
    );
  }
}

