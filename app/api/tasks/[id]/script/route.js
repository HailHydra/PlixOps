import { NextResponse } from "next/server";
import { SubmitScriptSchema } from "@/lib/workflow/contracts";
import { transitionTask } from "@/lib/workflow/engine";
import { mutateState } from "@/lib/store/unified-store";

export async function POST(request, context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = SubmitScriptSchema.safeParse({ ...body, taskId: id });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid script submission" },
        { status: 400 }
      );
    }

    const { result } = await mutateState(async ({ tasks }) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Task ${id} not found`);

      const current = tasks[index];
      let updated = transitionTask(
        current,
        "script_approval_pending",
        "Content Writer",
        `Submitted Google Docs script with Hook "${parsed.data.hookName}".`
      );

      updated.hookName = parsed.data.hookName;
      updated.scriptLink = parsed.data.scriptUrl;

      // Add to assets
      updated.assets = updated.assets || [];
      updated.assets.unshift({
        id: `ast-${Date.now()}`,
        type: "script",
        label: "Google Docs Script",
        url: parsed.data.scriptUrl,
        submittedAt: new Date().toISOString(),
      });

      // Add pending approval
      updated.approvals = updated.approvals || [];
      updated.approvals.unshift({
        id: `appr-${Date.now()}`,
        type: "script",
        status: "pending",
        requestedBy: "Content Writer",
        comment: parsed.data.comment,
        requestedAt: new Date().toISOString(),
      });

      tasks[index] = updated;
      return updated;
    }, "Content Writer");

    return NextResponse.json({ task: result });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to submit script" }, { status: 500 });
  }
}

