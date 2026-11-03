/**
 * PlixOps Calendar Analytics & Turnaround Utility
 * B&W Minimalist High-Contrast Palette
 */

export const BREADCRUMB_PALETTE = {
  INK: "#121413",
  MUTED: "#6b7280",
  BORDER: "#e5e7eb",
  SURFACE: "#ffffff",
  SUBTLE: "#f9fafb",
  ACCENT: "#000000",
};

/**
 * Checks if a task was completed on a given date (YYYY-MM-DD).
 */
export function isTaskCompletedOnDate(task, dateStr) {
  const terminalStates = ["published", "approved", "ready_for_performance", "approval_pending"];
  if (!terminalStates.includes(task.state)) return false;

  const datesToCheck = [
    task.publishedAt,
    task.videoApprovedAt,
    task.videoSubmittedAt,
    task.scriptApprovedAt,
    task.scriptSubmittedAt,
    task.updatedAt,
  ].filter(Boolean);

  return datesToCheck.some((dt) => dt.slice(0, 10) === dateStr);
}

/**
 * Classifies a task for a given calendar date (YYYY-MM-DD).
 * Returns: "completed" | "delayed" | "remained" | null
 */
export function classifyTaskForDate(task, dateStr) {
  const isTerminal = ["published", "cancelled"].includes(task.state);
  const targetDateStr = task.targetDate ? task.targetDate.slice(0, 10) : null;

  // 1. COMPLETED: Finished on this day
  if (isTaskCompletedOnDate(task, dateStr)) {
    return "completed";
  }

  // Active stage elapsed calculation
  const currentStage = (task.stageDurations || []).slice(-1)[0];
  const stageElapsedHours = currentStage && !currentStage.completedAt
    ? Math.max(0, (Date.now() - new Date(currentStage.startedAt).getTime()) / 3600000)
    : (currentStage?.durationHours || 0);

  // 2. DELAYED:
  // - Target date passed and task still unfinished
  // - Or stage turnaround exceeded 24 hours SLA
  // - Or rework exceeded 12 hours
  const isOverdue = !isTerminal && (
    (targetDateStr && targetDateStr < dateStr) ||
    (targetDateStr === dateStr && stageElapsedHours > 24) ||
    (task.state === "changes_requested" && stageElapsedHours > 12)
  );

  if (isOverdue) {
    return "delayed";
  }

  // 3. REMAINED (In Progress / Scheduled for this day):
  if (targetDateStr === dateStr && !isTerminal) {
    return "remained";
  }

  return null;
}

/**
 * Generates days of the month grid (including leading/trailing blanks for 7xN calendar)
 */
export function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon ...
  // Standardize to Monday start: 0 = Mon, 6 = Sun
  const mondayOffset = (startDayOfWeek + 6) % 7;

  const totalDays = lastDay.getDate();
  const days = [];

  // Leading empty days from previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = mondayOffset - 1; i >= 0; i--) {
    days.push({
      dateStr: null,
      dayNumber: prevMonthLastDay - i,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let day = 1; day <= totalDays; day++) {
    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days.push({
      dateStr: dStr,
      dayNumber: day,
      isCurrentMonth: true,
    });
  }

  // Trailing empty days to complete row of 7
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    days.push({
      dateStr: null,
      dayNumber: i,
      isCurrentMonth: false,
    });
  }

  return days;
}

/**
 * Computes calendar aggregates for a list of tasks for an entire month.
 * Also computes the distinct (deduplicated) month task breakdown for the pie chart.
 */
export function computeMonthDaySummaries(tasks, year, month) {
  const days = getMonthDays(year, month);
  const summaries = {};

  for (const day of days) {
    if (!day.dateStr) continue;
    const completed = [];
    const remained = [];
    const delayed = [];

    for (const task of tasks) {
      const classification = classifyTaskForDate(task, day.dateStr);
      if (classification === "completed") completed.push(task);
      else if (classification === "remained") remained.push(task);
      else if (classification === "delayed") delayed.push(task);
    }

    summaries[day.dateStr] = {
      completed,
      remained,
      delayed,
      total: completed.length + remained.length + delayed.length,
    };
  }

  // Deduplicated month-level set for the month Pie Chart
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthCompletedSet = new Set();
  const monthRemainedSet = new Set();
  const monthDelayedSet = new Set();

  for (const task of tasks) {
    const isTerminal = ["published", "cancelled"].includes(task.state);
    const targetDateStr = task.targetDate ? task.targetDate.slice(0, 10) : "";
    const isTargetInMonth = targetDateStr.startsWith(monthPrefix);

    const completionDate = [
      task.publishedAt,
      task.videoApprovedAt,
      task.videoSubmittedAt,
      task.scriptApprovedAt,
      task.scriptSubmittedAt,
      task.updatedAt,
    ].filter(Boolean).find((d) => d.slice(0, 10).startsWith(monthPrefix));

    if (completionDate && ["published", "approved", "ready_for_performance", "approval_pending"].includes(task.state)) {
      monthCompletedSet.add(task.id);
      continue;
    }

    if (isTargetInMonth) {
      const currentStage = (task.stageDurations || []).slice(-1)[0];
      const stageElapsedHours = currentStage && !currentStage.completedAt
        ? Math.max(0, (Date.now() - new Date(currentStage.startedAt).getTime()) / 3600000)
        : (currentStage?.durationHours || 0);

      const isDelayed = !isTerminal && (
        stageElapsedHours > 24 ||
        task.state === "changes_requested" ||
        targetDateStr < "2026-10-30" // Past deadline
      );

      if (isDelayed) {
        monthDelayedSet.add(task.id);
      } else if (!isTerminal) {
        monthRemainedSet.add(task.id);
      }
    }
  }

  return {
    summaries,
    monthUniqueTotals: {
      completed: monthCompletedSet.size,
      remained: monthRemainedSet.size,
      delayed: monthDelayedSet.size,
      total: monthCompletedSet.size + monthRemainedSet.size + monthDelayedSet.size,
    },
  };
}

