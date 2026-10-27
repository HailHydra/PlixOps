import { NextResponse } from "next/server";
import { mutateState } from "@/lib/store/unified-store";

export async function POST(request, context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { scriptOwnerId, editorId, brandOwnerId } = body;

    const { result } = await mutateState(async ({ tasks }) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Task ${id} not found`);

      const current = tasks[index];
      const now = new Date().toISOString();

      const updated = {
        ...current,
        updatedAt: now,
      };

      if (scriptOwnerId !== undefined) {
        updated.scriptOwnerId = scriptOwnerId;
        updated.contentOwnerId = scriptOwnerId;
      }
      if (editorId !== undefined) {
        updated.editorId = editorId;
      }
      if (brandOwnerId !== undefined) {
        updated.brandOwnerId = brandOwnerId;
      }

      tasks[index] = updated;
      return updated;
    }, "Dispatcher");

    return NextResponse.json({ task: result });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to update assignment" },
      { status: 500 }
    );
  }
}

