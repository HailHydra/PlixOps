"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Filter,
  ExternalLink,
  User,
  Users,
} from "lucide-react";
import {
  getMonthDays,
  computeMonthDaySummaries,
  classifyTaskForDate,
} from "@/lib/workflow/calendar-utils";

/**
 * Minimalist High-Contrast Black & White SVG Donut / Pie Chart
 */
function BwPieChart({ completed = 0, remained = 0, delayed = 0 }) {
  const total = completed + remained + delayed;

  if (total === 0) {
    return (
      <div className="bw-pie-empty">
        <svg viewBox="0 0 160 160" width="130" height="130">
          <circle cx="80" cy="80" r="60" fill="none" stroke="#e5e7eb" strokeWidth="22" />
        </svg>
        <span className="bw-pie-empty-text">No Deliverables</span>
      </div>
    );
  }

  // Calculate percentages and stroke-dash offsets (Circumference of r=52 is 2*pi*52 ≈ 326.72)
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  const pctCompleted = completed / total;
  const pctRemained = remained / total;
  const pctDelayed = delayed / total;

  const strokeCompleted = pctCompleted * circumference;
  const strokeRemained = pctRemained * circumference;
  const strokeDelayed = pctDelayed * circumference;

  // Offsets for sequential segments
  const offsetCompleted = 0;
  const offsetRemained = -strokeCompleted;
  const offsetDelayed = -(strokeCompleted + strokeRemained);

  const completionRatio = Math.round(pctCompleted * 100);

  return (
    <div className="bw-pie-container">
      <div className="bw-pie-visual">
        <svg viewBox="0 0 160 160" width="130" height="130" className="bw-pie-svg">
          {/* Background Ring */}
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="22" />

          {/* Segment 1: Completed (Solid Deep Black #121413) */}
          {completed > 0 && (
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#121413"
              strokeWidth="22"
              strokeDasharray={`${strokeCompleted} ${circumference}`}
              strokeDashoffset={offsetCompleted}
              transform="rotate(-90 80 80)"
              className="bw-pie-segment"
            />
          )}

          {/* Segment 2: Remained / In Progress (White with crisp black outline) */}
          {remained > 0 && (
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#9ca3af"
              strokeWidth="22"
              strokeDasharray={`${strokeRemained} ${circumference}`}
              strokeDashoffset={offsetRemained}
              transform="rotate(-90 80 80)"
              className="bw-pie-segment"
            />
          )}

          {/* Segment 3: Delayed (Solid Pure Black with distinct hatch pattern) */}
          {delayed > 0 && (
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#000000"
              strokeWidth="22"
              strokeDasharray={`${strokeDelayed} ${circumference}`}
              strokeDashoffset={offsetDelayed}
              transform="rotate(-90 80 80)"
              className="bw-pie-segment delayed"
            />
          )}

          {/* Center Cutout text */}
          <text x="80" y="74" textAnchor="middle" className="bw-pie-center-val">
            {completionRatio}%
          </text>
          <text x="80" y="93" textAnchor="middle" className="bw-pie-center-lbl">
            ON TRACK
          </text>
        </svg>
      </div>

      {/* Legend alongside the Pie */}
      <div className="bw-pie-legend">
        <div className="bw-legend-item">
          <span className="bw-legend-swatch swatch-completed" />
          <div className="bw-legend-text">
            <span>Completed</span>
            <strong>{completed} ({Math.round(pctCompleted * 100)}%)</strong>
          </div>
        </div>

        <div className="bw-legend-item">
          <span className="bw-legend-swatch swatch-remained" />
          <div className="bw-legend-text">
            <span>In Progress</span>
            <strong>{remained} ({Math.round(pctRemained * 100)}%)</strong>
          </div>
        </div>

        <div className="bw-legend-item">
          <span className="bw-legend-swatch swatch-delayed" />
          <div className="bw-legend-text">
            <span>Delayed</span>
            <strong>{delayed} ({Math.round(pctDelayed * 100)}%)</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Minimalist Black & White Date Drilldown Modal
 */
function DateDrilldownModal({ dateStr, tasks, onClose, onOpenTask }) {
  const [filterType, setFilterType] = useState("all"); // "all" | "completed" | "remained" | "delayed"

  const { completed, remained, delayed } = useMemo(() => {
    const c = [];
    const r = [];
    const d = [];
    for (const task of tasks) {
      const cls = classifyTaskForDate(task, dateStr);
      if (cls === "completed") c.push(task);
      else if (cls === "remained") r.push(task);
      else if (cls === "delayed") d.push(task);
    }
    return { completed: c, remained: r, delayed: d };
  }, [tasks, dateStr]);

  const displayedTasks = useMemo(() => {
    if (filterType === "completed") return completed;
    if (filterType === "remained") return remained;
    if (filterType === "delayed") return delayed;
    return [...delayed, ...remained, ...completed];
  }, [filterType, completed, remained, delayed]);

  const formattedDate = useMemo(() => {
    try {
      const d = new Date(`${dateStr}T12:00:00Z`);
      return new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(d);
    } catch (_) {
      return dateStr;
    }
  }, [dateStr]);

  return (
    <div className="drilldown-backdrop" onClick={onClose}>
      <div className="drilldown-modal bw-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="drilldown-header">
          <div>
            <span className="bw-eyebrow">DAY SUMMARY</span>
            <h2>{formattedDate}</h2>
          </div>
          <button className="icon-btn-sm" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </header>

        {/* 3 High-Contrast B/W Summary Cards */}
        <div className="drilldown-kpis">
          <button
            className={`bw-kpi-card ${filterType === "completed" ? "active" : ""}`}
            onClick={() => setFilterType(filterType === "completed" ? "all" : "completed")}
          >
            <div className="bw-kpi-label">
              <CheckCircle2 size={15} />
              <span>Completed</span>
            </div>
            <strong>{completed.length}</strong>
            <small>Finished</small>
          </button>

          <button
            className={`bw-kpi-card ${filterType === "remained" ? "active" : ""}`}
            onClick={() => setFilterType(filterType === "remained" ? "all" : "remained")}
          >
            <div className="bw-kpi-label">
              <Clock size={15} />
              <span>In Progress</span>
            </div>
            <strong>{remained.length}</strong>
            <small>On track</small>
          </button>

          <button
            className={`bw-kpi-card ${filterType === "delayed" ? "active" : ""}`}
            onClick={() => setFilterType(filterType === "delayed" ? "all" : "delayed")}
          >
            <div className="bw-kpi-label">
              <AlertCircle size={15} />
              <span>Delayed</span>
            </div>
            <strong>{delayed.length}</strong>
            <small>Past deadline</small>
          </button>
        </div>

        {/* Deliverables List Table */}
        <div className="drilldown-table-wrap">
          <table className="bw-table">
            <thead>
              <tr>
                <th>Work Item & Hook</th>
                <th>Product / Category</th>
                <th>Classification</th>
                <th>Assigned Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedTasks.map((task) => {
                const cls = classifyTaskForDate(task, dateStr);
                const currentStage = (task.stageDurations || []).slice(-1)[0];
                const stageDuration = currentStage?.durationHours !== null && currentStage?.durationHours !== undefined
                  ? `${currentStage.durationHours}h`
                  : "Active";

                return (
                  <tr key={task.id} onClick={() => onOpenTask(task)}>
                    <td>
                      <strong>{task.title}</strong>
                      <span className="task-subtext">{task.id} · Hook: <em>{task.hookName || "Not set"}</em></span>
                    </td>
                    <td>
                      <span>{task.product}</span>
                      <small className="task-subtext">{task.category}</small>
                    </td>
                    <td>
                      <span className={`bw-badge ${cls}`}>
                        {cls === "completed" ? "COMPLETED" : cls === "delayed" ? "DELAYED" : "REMAINED"}
                      </span>
                    </td>
                    <td>
                      <span className="bw-owner-tag">
                        {task.editorAssignedByName || "Assigned Team"}
                      </span>
                    </td>
                    <td>
                      <span className="bw-status-tag">{task.state}</span>
                      <small className="task-subtext">TAT: {stageDuration}</small>
                    </td>
                  </tr>
                );
              })}

              {!displayedTasks.length && (
                <tr>
                  <td colSpan={5} className="bw-empty-cell">
                    <span>No deliverables recorded for this classification on {dateStr}.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="drilldown-footer">
          <span>Click any work item above to inspect full task drawer & review deliverables.</span>
          <button className="bw-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Minimalist Black & White Personal Space & Calendar Component
 */
export default function PersonalSpace({
  tasks = [],
  users = [],
  currentUser = null,
  isManager = false,
  onOpenTask,
}) {
  // Calendar Month State (Default to October 2026 based on project context)
  const [currentDate, setCurrentDate] = useState(new Date("2026-10-15T00:00:00Z"));
  const [selectedEditorId, setSelectedEditorId] = useState("all");
  const [activeDateModal, setActiveDateModal] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Editors list for manager filter
  const editors = useMemo(() => {
    return users.filter((u) => ["edit", "video"].includes(u.role) && !u.isTeamLead);
  }, [users]);

  // Filter tasks based on Manager vs Individual Contributor view
  const scopedTasks = useMemo(() => {
    if (!currentUser) return tasks;

    // 1. If Individual Contributor (not manager/admin), strictly scope to their tasks
    if (!isManager && currentUser.role !== "administrator") {
      if (["edit", "video"].includes(currentUser.role)) {
        return tasks.filter((t) => t.editorId === currentUser.id);
      }
      if (currentUser.role === "content") {
        return tasks.filter((t) => t.scriptOwnerId === currentUser.id || t.contentOwnerId === currentUser.id);
      }
      if (currentUser.role === "brand") {
        return tasks.filter((t) => t.brandOwnerId === currentUser.id || t.creatorId === currentUser.id);
      }
      return tasks;
    }

    // 2. If Manager or Admin, allow filtering by specific editor or "all"
    if (selectedEditorId !== "all") {
      return tasks.filter((t) => t.editorId === selectedEditorId);
    }

    // Video manager sees all video tasks
    if (["edit", "video"].includes(currentUser.role)) {
      return tasks.filter((t) => ["editing_queue", "editing_in_progress", "changes_requested", "approval_pending"].includes(t.state) || Boolean(t.editorId));
    }

    return tasks;
  }, [tasks, currentUser, isManager, selectedEditorId]);

  // Compute month summaries and unique counts
  const monthDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const monthData = useMemo(() => computeMonthDaySummaries(scopedTasks, year, month), [scopedTasks, year, month]);
  const daySummaries = monthData.summaries;

  // Month-level rollups from the deduplicated task set
  const monthTotals = useMemo(() => {
    return monthData.monthUniqueTotals || {
      completed: 0,
      remained: 0,
      delayed: 0,
    };
  }, [monthData]);

  const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(currentDate);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <section className="personal-space-wrap">
      {/* Top Banner / Persona Header */}
      <div className="personal-space-header">
        <div>
          <span className="bw-eyebrow">
            {isManager ? "VIDEO TEAM CALENDAR" : "MY CALENDAR"}
          </span>
          <h1>{isManager ? "Team Calendar" : `Calendar — ${currentUser?.name}`}</h1>
        </div>

        {/* Manager Filter Dropdown */}
        {isManager && (
          <div className="manager-filter-box">
            <label>
              <Users size={14} /> Scope Calendar:
            </label>
            <select
              value={selectedEditorId}
              onChange={(e) => setSelectedEditorId(e.target.value)}
              className="bw-select"
            >
              <option value="all">All Editors ({editors.length} Active)</option>
              {editors.map((ed) => (
                <option value={ed.id} key={ed.id}>
                  {ed.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Month Analytics Section: Donut/Pie Chart + High-Contrast KPI Cards */}
      <div className="bw-analytics-card">
        <div className="bw-analytics-chart-side">
          <div className="bw-card-mini-head">
            <span className="bw-eyebrow">MONTHLY RATIO</span>
            <h3>Status</h3>
          </div>
          <BwPieChart
            completed={monthTotals.completed}
            remained={monthTotals.remained}
            delayed={monthTotals.delayed}
          />
        </div>

        <div className="bw-analytics-stats-side">
          <div className="bw-overview-stat">
            <span>Completed</span>
            <strong>{monthTotals.completed}</strong>
            <small>Finished</small>
          </div>

          <div className="bw-overview-stat">
            <span>In Progress</span>
            <strong>{monthTotals.remained}</strong>
            <small>On track</small>
          </div>

          <div className="bw-overview-stat">
            <span>Delayed</span>
            <strong>{monthTotals.delayed}</strong>
            <small>Past deadline</small>
          </div>

          <div className="bw-overview-stat">
            <span>Completion Rate</span>
            <strong>
              {monthTotals.completed + monthTotals.delayed > 0
                ? `${Math.round((monthTotals.completed / (monthTotals.completed + monthTotals.delayed)) * 100)}%`
                : "100%"}
            </strong>
            <small>On time</small>
          </div>
        </div>
      </div>

      {/* Calendar Card */}
      <div className="bw-calendar-card">
        {/* Calendar Nav Bar */}
        <div className="calendar-controls">
          <div className="calendar-month-title">
            <CalendarIcon size={18} />
            <h2>{monthName}</h2>
          </div>

          <div className="calendar-arrows">
            <button className="bw-arrow-btn" onClick={prevMonth} aria-label="Previous Month">
              <ChevronLeft size={16} />
            </button>
            <button className="bw-arrow-btn" onClick={nextMonth} aria-label="Next Month">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Days of Week Header (Mon - Sun) */}
        <div className="calendar-grid-header">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
            <div key={d} className="calendar-col-title">
              {d}
            </div>
          ))}
        </div>

        {/* 7xN Calendar Days Grid */}
        <div className="calendar-grid-body">
          {monthDays.map((cell, idx) => {
            const summary = cell.dateStr ? daySummaries[cell.dateStr] : null;
            const hasActivity = summary && summary.total > 0;

            return (
              <div
                key={`${cell.dayNumber}-${idx}`}
                className={`calendar-cell ${!cell.isCurrentMonth ? "other-month" : ""} ${hasActivity ? "has-data" : ""}`}
                onClick={() => {
                  if (cell.dateStr && hasActivity) {
                    setActiveDateModal(cell.dateStr);
                  }
                }}
              >
                <div className="cell-top">
                  <span className="day-number">{cell.dayNumber}</span>
                  {hasActivity && <span className="bw-cell-total">{summary.total}</span>}
                </div>

                {/* Black & White Text Badges */}
                {hasActivity && (
                  <div className="cell-badges">
                    {summary.completed.length > 0 && (
                      <span className="bw-badge completed" title="Completed">
                        C: {summary.completed.length}
                      </span>
                    )}
                    {summary.remained.length > 0 && (
                      <span className="bw-badge remained" title="Remained / In Progress">
                        R: {summary.remained.length}
                      </span>
                    )}
                    {summary.delayed.length > 0 && (
                      <span className="bw-badge delayed" title="Delayed / SLA Breached">
                        D: {summary.delayed.length}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Date Drilldown Dashboard Modal */}
      {activeDateModal && (
        <DateDrilldownModal
          dateStr={activeDateModal}
          tasks={scopedTasks}
          onClose={() => setActiveDateModal(null)}
          onOpenTask={onOpenTask}
        />
      )}
    </section>
  );
}

