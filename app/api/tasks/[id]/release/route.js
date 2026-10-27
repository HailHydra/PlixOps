import { NextResponse } from "next/server";
import { CATEGORY_ROUTING } from "@/lib/workflow/constants";
import { transitionTask } from "@/lib/workflow/engine";
import { mutateState } from "@/lib/store/unified-store";

export async function POST(request, context) {
  try {
    const { id } = await context.params;

    const { result } = await mutateState(async ({ tasks }) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Task ${id} not found`);

      const current = tasks[index];
      const routing = CATEGORY_ROUTING[current.category] || { writerId: null, writerName: "Unassigned" };

      const updated = transitionTask(
        current,
        "social_research",
        "Brand Approver",
        `Released brief to Content scripting queue.`
      );

      if (!updated.scriptOwnerId && routing.writerId) {
        updated.scriptOwnerId = routing.writerId;
        updated.contentOwnerId = routing.writerId;
      }

      tasks[index] = updated;
      return updated;
    }, "Brand Approver");

    return NextResponse.json({ task: result });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to release draft brief" },
      { status: 500 }
    );
  }
}

