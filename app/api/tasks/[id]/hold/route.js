import { NextResponse } from "next/server";
import { transitionTask } from "@/lib/workflow/engine";
import { mutateState } from "@/lib/store/unified-store";

export async function POST(_request, context) {
  try {
    const { id } = await context.params;

    const { result } = await mutateState(async ({ tasks }) => {
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) throw new Error(`Task ${id} not found`);

      const current = tasks[index];
      if (current.state !== "ready_for_performance") {
        throw new Error("Only tasks that are ready for live can be moved to On Hold");
      }

      const updated = transitionTask(
        current,
        "publishing_failed",
        "Performance Marketer",
        "Moved to On Hold"
      );

      tasks[index] = updated;
      return updated;
    }, "Performance Marketer");

    return NextResponse.json({ task: result });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to move task to On Hold" },
      { status: 500 }
    );
  }
}
