import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { mutateState } from "@/lib/store/unified-store";

export async function POST(request, context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { scriptOwnerId, editorId, brandOwnerId } = body;
    const sessionUser = await getServerSession();

    // STRICT MANAGER ENFORCEMENT: Only editing managers or admins can assign editors
    if (editorId !== undefined && sessionUser?.role !== "administrator" && !sessionUser?.isTeamLead) {
      return NextResponse.json({ error: "Only editing managers can assign editors" }, { status: 403 });
    }

    const { result } = await mutateState(async ({ tasks, users }) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Task ${id} not found`);

      const current = tasks[index];
      const now = new Date().toISOString();

      const updated = {
        ...current,
        updatedAt: now,
      };

      if (scriptOwnerId !== undefined) {
        const canAssignWriter = !sessionUser || ["content", "brand", "administrator", "master_admin"].includes(sessionUser.role);
        if (!canAssignWriter) throw new Error("You cannot assign Content Team work");
        if (sessionUser && sessionUser.role === "content" && current.scriptOwnerId !== sessionUser.id && current.contentOwnerId !== sessionUser.id) {
          throw new Error("You can only reassign a task currently allocated to you");
        }
        const writer = scriptOwnerId ? users.find((user) => user.id === scriptOwnerId) : null;
        if (scriptOwnerId && (!writer || writer.role !== "content")) {
          throw new Error("Select a valid Content Team member");
        }
        updated.scriptOwnerId = scriptOwnerId || null;
        updated.contentOwnerId = scriptOwnerId || null;
        updated.activity = [
          {
            at: now,
            actor: sessionUser?.name || "Content Writer",
            team: "Content",
            text: writer ? `Reassigned content work to ${writer.name}.` : "Removed the Content Team assignment.",
          },
          ...(updated.activity || []),
        ];
      }
      if (editorId !== undefined) {
        const editor = editorId ? users.find((user) => user.id === editorId) : null;
        if (editorId && (!editor || !["edit", "video"].includes(editor.role) || editor.isTeamLead)) {
          throw new Error("Select a valid editing team member");
        }
        if (!["editing_queue", "editing_in_progress", "changes_requested", "approval_pending"].includes(current.state)) {
          throw new Error("Editors can only be assigned after script approval");
        }

        updated.editorId = editorId || null;
        updated.editorAssignedById = editorId ? (sessionUser?.id || "mgr") : null;
        updated.editorAssignedByName = editorId ? (sessionUser?.name || "Editing Manager") : null;
        updated.editorAssignedAt = editorId ? now : null;
        updated.activity = [
          {
            at: now,
            actor: sessionUser?.name || "Editing Manager",
            team: "Video",
            text: editorId
              ? `Assigned video to ${editor?.name || "Editor"}.`
              : "Returned video to the unassigned dispatch queue.",
          },
          ...(updated.activity || []),
        ];
      }
      if (brandOwnerId !== undefined) {
        updated.brandOwnerId = brandOwnerId;
      }

      tasks[index] = updated;
      return updated;
    }, sessionUser?.name || "Dispatcher");

    return NextResponse.json({ task: result });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to update assignment" },
      { status: 500 }
    );
  }
}

