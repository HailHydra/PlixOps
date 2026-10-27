import { NextResponse } from "next/server";
import { CreateBriefSchema } from "@/lib/workflow/contracts";
import { filterTasksForTeam, initializeBrief } from "@/lib/workflow/engine";
import { getState, mutateState } from "@/lib/store/unified-store";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const team = searchParams.get("team") || "administrator";

    const state = await getState();
    const visibleTasks = filterTasksForTeam(state.tasks, team);

    return NextResponse.json({
      team,
      tasks: visibleTasks,
      totalCount: visibleTasks.length,
      users: state.users,
      revision: state.revision,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = CreateBriefSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid brief submission" },
        { status: 400 }
      );
    }

    const newTask = initializeBrief(parsed.data, "Brand Manager");

    const { result } = await mutateState(async ({ tasks }) => {
      tasks.unshift(newTask);
      return newTask;
    }, "Brand Manager");

    return NextResponse.json({ task: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create brief" }, { status: 500 });
  }
}

