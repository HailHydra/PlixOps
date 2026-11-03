"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bell, Calendar as CalendarIcon, Check, CheckCheck, ChevronDown, CircleHelp, ExternalLink, FileText, Film,
  Folder, FolderOpen, LayoutDashboard, List, LogOut, Menu, MessageSquareWarning,
  PlayCircle, Plus, Rocket, Search, Send, Smartphone, Sparkles, UploadCloud, User, Video, X
} from "lucide-react";
import PersonalSpace from "@/components/PersonalSpace";
import FinalVideoForm from "@/components/FinalVideoForm";
import { CATEGORY_ROUTING, CONTENT_TYPES_BY_BRIEF, FALLBACK_VIDEO_EDITOR, TEAM_VISIBLE_STATES } from "@/lib/workflow/constants";
import plixProductsCatalog from "@/data/plix-products.json";
import { computePipelineMetrics, transitionTask } from "@/lib/workflow/engine";
import {
  NotificationService,
  INITIAL_NOTIFICATIONS,
  NOTIFICATION_EVENTS,
  PRIMARY_NOTIFICATION_PHONE,
} from "@/lib/notifications/notification-service";

const STATE = {
  draft: { label: "Brand Brief", tone: "teal" },
  social_research: { label: "Script queue", tone: "teal" },
  script_changes_requested: { label: "Script changes", tone: "rose" },
  script_approval_pending: { label: "Brand script approval", tone: "amber" },
  editing_queue: { label: "Video queue", tone: "teal" },
  editing_in_progress: { label: "Video production", tone: "blue" },
  changes_requested: { label: "Video changes", tone: "rose" },
  approval_pending: { label: "Brand video review", tone: "amber" },
  approved: { label: "Approved by Brand", tone: "green" },
  ready_for_performance: { label: "Ready for live", tone: "teal" },
  publishing_in_progress: { label: "Setup in progress", tone: "blue" },
  published: { label: "Live", tone: "green" },
  publishing_failed: { label: "On Hold", tone: "rose" },
  on_hold: { label: "On hold", tone: "gray" },
  blocked: { label: "Blocked", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

// Isolated Kanban Columns - Each team dashboard ONLY exposes their permitted stages
const ROLE_COLUMNS = {
  brand: [
    ["draft", "Brand Brief"],
    ["script_approval_pending", "Script Approval"],
    ["approval_pending", "Video Review"],
    ["approved", "Approved Videos"],
  ],
  content: [
    ["social_research", "Script queue"],
    ["script_changes_requested", "Script changes"],
    ["script_approval_pending", "Brand approval"],
  ],
  edit: [
    ["editing_queue", "Video queue"],
    ["changes_requested", "Video changes"],
    ["approval_pending", "Video approval"],
  ],
  video: [
    ["editing_queue", "Video queue"],
    ["changes_requested", "Video changes"],
    ["approval_pending", "Video approval"],
  ],
  video_manager: [
    ["editing_queue", "Video queue"],
    ["changes_requested", "Video changes"],
    ["approval_pending", "Video approval"],
  ],
  performance: [
    ["ready_for_performance", "Ready for live"],
    ["published", "Live"],
    ["publishing_failed", "On Hold"],
  ],
  administrator: [
    ["draft", "Brand Brief"],
    ["social_research", "Content scripting"],
    ["editing_queue", "Video editing"],
    ["ready_for_performance", "Ready for live"],
    ["published", "Live in market"],
  ],
};

function normalizeRole(role) {
  if (role === "edit") return "video";
  return role || "content";
}

function roleLabel(role) {
  switch (role) {
    case "brand": return "Brand Team";
    case "content": return "Content Team";
    case "edit":
    case "video": return "Video Team";
    case "performance": return "Performance Team";
    case "administrator": return "Operations Admin";
    default: return role;
  }
}

function briefType(task) {
  return task.briefType || (task.sourceSheet === "AI Tracker Main" || task.campaign === "AI Tracker Main" ? "ai" : "video");
}

function sourceSheet(task) {
  return task.sourceSheet || task.source?.sheet || (briefType(task) === "ai" ? "AI Tracker Main" : "Work Plan");
}

function dedupeUsers(users) {
  return [...new Map((users || []).map((user) => [user.id, user])).values()];
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Avatar({ person, small = false }) {
  return <span className={`avatar ${person?.tone || "slate"} ${small ? "small" : ""}`}>{person?.initials || "TM"}</span>;
}

function Priority({ value }) {
  const code = (value || "P2").toUpperCase();
  return <span className={`priority priority-${code.toLowerCase()}`}>{code}</span>;
}

function BriefBadge({ task }) {
  const b = briefType(task);
  const labels = {
    video: "Video",
    ai: "AI",
    joyun: "Joyun",
    global: "Global",
    b2g2: "B2G2",
  };
  const label = labels[b] || String(b).toUpperCase();
  return <span className={`brief-badge ${b}`}>{label}</span>;
}

function ContentTypeBadge({ value }) {
  return <span className="content-type-badge">{value || "Content type not set"}</span>;
}

function TaskHeaderBadges({ task }) {
  return <div className="task-header-badges"><Priority value={task.priority} /><BriefBadge task={task} /><ContentTypeBadge value={task.contentType} /></div>;
}

function Status({ state }) {
  const meta = STATE[state] || { label: state, tone: "gray" };
  return <span className={`status ${meta.tone}`}><i />{meta.label}</span>;
}

function OwnerSelect({ task, writers, onChange, compact = false }) {
  return (
    <select
      className={`owner-select ${compact ? "compact" : ""}`}
      value={task.scriptOwnerId || task.contentOwnerId || ""}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(task.id, event.target.value)}
      aria-label={`Assign writer for ${task.title}`}
    >
      <option value="">Unassigned</option>
      {writers.map((writer) => <option value={writer.id} key={writer.id}>{writer.name}</option>)}
    </select>
  );
}

function EditorSelect({ task, editors, onChange, compact = false }) {
  return (
    <select
      className={`owner-select ${compact ? "compact" : ""}`}
      value={task.editorId || ""}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(task.id, event.target.value)}
      aria-label={`Assign editor for ${task.title}`}
    >
      <option value="">Unassigned dispatch</option>
      {editors.map((editor) => <option value={editor.id} key={editor.id}>{editor.name}</option>)}
    </select>
  );
}

function TaskCard({
  task,
  writers = [],
  editors = [],
  users = [],
  canAssignEditor = false,
  onOpen,
  onAssign,
  onAssignEditor,
}) {
  const isVideoTask = ["editing_queue", "editing_in_progress", "changes_requested", "approval_pending", "approved"].includes(task.state);
  const owner = (users || []).find((person) => person.id === (isVideoTask ? task.editorId : (task.scriptOwnerId || task.contentOwnerId)));
  const currentStage = (task.stageDurations || []).slice(-1)[0];
  const stageDuration = currentStage?.durationHours !== null && currentStage?.durationHours !== undefined
    ? `${currentStage.durationHours}h`
    : "Active";

  return (
    <button className="task-card" onClick={() => onOpen(task)}>
      <div className="task-card-top">
        <TaskHeaderBadges task={task} />
        <Status state={task.state} />
      </div>
      <h3>{task.title}</h3>
      <p>{task.product} <i /> {task.category} <i /> Hook: <strong>{task.hookName || "Not set"}</strong></p>
      <div className="requirement-preview">
        <b>Brand Comments</b>
        <span>{task.summary || "No comments provided."}</span>
      </div>
      <div className="card-assignment">
        <span>
          <b>{isVideoTask ? "Assigned editor" : "Assigned owner"}</b>
          <span className="owner"><Avatar person={owner} small />{owner?.name || "Unassigned"}</span>
        </span>
        {isVideoTask
          ? (canAssignEditor && onAssignEditor ? <EditorSelect task={task} editors={editors} onChange={onAssignEditor} compact /> : null)
          : <OwnerSelect task={task} writers={writers} onChange={onAssign} compact />}
      </div>
      <div className="task-card-foot">
        <span>{task.id}</span>
        {canAssignEditor && <span>Stage TAT: <strong>{stageDuration}</strong></span>}
      </div>
      {task.state === "approved" && (
        <div style={{
          marginTop: "10px",
          padding: "8px 10px",
          background: "#ecfdf5",
          border: "1px solid #10b981",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px"
        }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#065f46", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Check size={13} /> Video Approved
          </span>
          <span style={{
            fontSize: "11px",
            fontWeight: "700",
            background: "#065f46",
            color: "#ffffff",
            padding: "3px 8px",
            borderRadius: "4px",
            display: "inline-flex",
            alignItems: "center",
            gap: "3px"
          }}>
            Push to Perf <Send size={11} />
          </span>
        </div>
      )}
    </button>
  );
}

function Board({ tasks, columns, writers, editors = [], users, canAssignEditor = false, onOpen, onAssign, onAssignEditor }) {
  return (
    <div className={`kanban ${columns.length >= 4 ? "four-column-kanban" : ""}`}>
      {columns.map(([colKey, label]) => {
        const items = tasks.filter((task) => {
          if (colKey === "needs_assignment") {
            return task.state === "editing_queue" && !task.editorId;
          }
          if (colKey === "assigned_queue") {
            return task.state === "editing_queue" && Boolean(task.editorId);
          }
          if (colKey === "editing_queue") {
            return task.state === "editing_queue" || task.state === "editing_in_progress";
          }
          if (colKey === "approval_pending") {
            return task.state === "approval_pending" || task.state === "approved";
          }
          return task.state === colKey;
        });

        const stateTone = STATE[colKey]?.tone || (colKey === "needs_assignment" ? "amber" : colKey === "assigned_queue" ? "blue" : "teal");

        return (
          <section className="kanban-column" key={colKey}>
            <header>
              <span className={`column-dot ${stateTone}`} />
              <strong>{label}</strong>
              <b>{items.length}</b>
            </header>
            <label className="column-search">
              <Search size={15} />
              <span>Search {label.toLowerCase()}</span>
            </label>
            <div className="column-cards">
              {items.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  writers={writers}
                  editors={editors}
                  users={users}
                  canAssignEditor={canAssignEditor}
                  onOpen={onOpen}
                  onAssign={onAssign}
                  onAssignEditor={onAssignEditor}
                />
              ))}
              {!items.length && (
                <div className="column-empty">
                  <Check size={19} />
                  <span>No tasks in this queue</span>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BrandFolderView({ tasks, onOpen, onCreateBrief, writers = [], users = [], onAssign }) {
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [folderView, setFolderView] = useState("board"); // Board view by default
  const [folderSearch, setFolderSearch] = useState("");
  const [groupBy, setGroupBy] = useState("category"); // "category" | "priority" | "state"

  const folders = useMemo(() => [
    {
      id: "brief_drafts",
      name: "Brand Brief",
      states: ["draft"],
      color: "#0f8975",
    },
    {
      id: "script_approval",
      name: "Script Approval",
      states: ["script_approval_pending"],
      color: "#d97706",
    },
    {
      id: "video_approval",
      name: "Video Review",
      states: ["approval_pending"],
      color: "#4f46e5",
    },
    {
      id: "revisions_feedback",
      name: "Revisions",
      states: ["script_changes_requested", "changes_requested"],
      color: "#dc2626",
    },
    {
      id: "live_campaigns",
      name: "Approved Videos",
      states: ["approved", "ready_for_performance", "publishing_in_progress", "published"],
      color: "#16a34a",
    },
  ], []);

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const rawFolderTasks = useMemo(() => {
    if (!activeFolder) return [];
    return tasks.filter((t) => activeFolder.states.includes(t.state));
  }, [tasks, activeFolder]);

  const folderTasks = useMemo(() => {
    if (!folderSearch) return rawFolderTasks;
    const query = folderSearch.toLowerCase();
    return rawFolderTasks.filter((t) => {
      const text = [t.id, t.title, t.hookName, t.product, t.category, t.contentType].join(" ").toLowerCase();
      return text.includes(query);
    });
  }, [rawFolderTasks, folderSearch]);

  // When a folder is clicked, render the folder view (Board view by default)
  if (activeFolder) {
    const isMultiState = activeFolder.states.length > 1;

    let boardColumns = [];
    if (groupBy === "category") {
      boardColumns = [
        ["Skin", "Skin (Himani / Sanjeet)", "teal"],
        ["Hair", "Hair (Zoha / Sidhharth)", "blue"],
        ["Nutra", "Nutra (Tanmay / Sindhura)", "amber"],
        ["Joyun", "Joyun (Shama)", "rose"],
        ["B2G2", "B2G2 & Global", "green"],
      ];
    } else if (groupBy === "priority") {
      boardColumns = [
        ["P0", "P0", "rose"],
        ["P1", "P1", "amber"],
        ["P2", "P2", "teal"],
        ["R0", "R0", "blue"],
      ];
    } else {
      boardColumns = activeFolder.states.map((s) => [
        s,
        STATE[s]?.label || s,
        STATE[s]?.tone || "teal",
      ]);
    }

    return (
      <div className="folder-detail-container">
        <div className="folder-detail-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <button className="button folder-back-btn" onClick={() => setActiveFolderId(null)}>
              <ArrowLeft size={15} />
              <span>Back</span>
            </button>
            <div className="folder-breadcrumb">
              <span onClick={() => setActiveFolderId(null)} className="crumb-link">
                Folders
              </span>
              <span className="crumb-separator">/</span>
              <span className="crumb-active">
                <Folder size={16} style={{ color: activeFolder.color }} />
                <strong>{activeFolder.name}</strong>
                <b className="folder-badge">{folderTasks.length}</b>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginLeft: "auto" }}>
            <label className="column-search" style={{ height: "36px", marginBottom: 0, minWidth: "190px" }}>
              <Search size={14} />
              <input
                type="text"
                value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
                placeholder={`Search ${activeFolder.name}...`}
                style={{ border: 0, outline: 0, background: "transparent", fontSize: "12px", width: "100%" }}
              />
            </label>

            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="owner-select compact"
              style={{ minHeight: "36px", fontSize: "11px", fontWeight: "700" }}
              aria-label="Group briefs by"
            >
              <option value="category">Board: By Category</option>
              <option value="priority">Board: By Priority</option>
              {isMultiState && <option value="state">Board: By Sub-Stage</option>}
            </select>

            <div className="view-toggle" style={{ margin: 0 }}>
              <button
                className={folderView === "board" ? "active" : ""}
                onClick={() => setFolderView("board")}
                title="Kanban Board View"
              >
                <LayoutDashboard size={15} />
                Board
              </button>
              <button
                className={folderView === "list" ? "active" : ""}
                onClick={() => setFolderView("list")}
                title="Table List View"
              >
                <List size={15} />
                List
              </button>
            </div>

            {activeFolder.id === "brief_drafts" && onCreateBrief && (
              <button
                className="button primary"
                style={{ minHeight: "36px", padding: "0 13px", fontSize: "12px" }}
                onClick={onCreateBrief}
              >
                <Plus size={14} />New brief
              </button>
            )}
          </div>
        </div>

        {folderView === "board" ? (
          <div className="kanban folder-kanban">
            {boardColumns.map(([colKey, colLabel, tone]) => {
              const colItems = folderTasks.filter((task) => {
                if (groupBy === "category") return (task.category || "B2G2") === colKey;
                if (groupBy === "priority") return task.priority === colKey;
                return task.state === colKey;
              });

              return (
                <section className="kanban-column" key={colKey}>
                  <header>
                    <span className={`column-dot ${tone || "teal"}`} />
                    <strong>{colLabel}</strong>
                    <b>{colItems.length}</b>
                  </header>
                  <div className="column-cards">
                    {colItems.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        writers={writers}
                        users={users}
                        onOpen={onOpen}
                        onAssign={onAssign}
                      />
                    ))}
                    {!colItems.length && (
                      <div className="column-empty">
                        <Check size={18} />
                        <span>No briefs in this column</span>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <TaskList
            tasks={folderTasks}
            writers={writers}
            users={users}
            onOpen={onOpen}
            onAssign={onAssign}
          />
        )}
      </div>
    );
  }

  // Initial Standard Rectangular Folder View with minimal icons
  return (
    <div className="folder-grid">
      {folders.map((folder) => {
        const count = tasks.filter((t) => folder.states.includes(t.state)).length;
        return (
          <button
            key={folder.id}
            className="folder-card"
            onClick={() => {
              setActiveFolderId(folder.id);
              setGroupBy(folder.states.length > 1 ? "state" : "category");
            }}
          >
            <div className="folder-card-header">
              <div className="folder-title-row">
                <Folder size={17} style={{ color: folder.color }} />
                <h3>{folder.name}</h3>
              </div>
              <span className="folder-count-badge" style={{ background: count > 0 ? folder.color : "#64748b" }}>
                {count} {count === 1 ? "brief" : "briefs"}
              </span>
            </div>
            {folder.subtitle && (
              <div className="folder-card-body">
                <p>{folder.subtitle}</p>
              </div>
            )}
            <div className="folder-card-footer">
              <span>Open &rarr;</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TaskList({ tasks = [], writers = [], editors = [], users = [], canAssignEditor = false, onOpen, onAssign, onAssignEditor }) {
  return (
    <section className="task-list panel">
      <table>
        <thead>
          <tr>
            <th>Task & Hook</th>
            <th>Brief</th>
            <th>Owner</th>
            <th>Priority</th>
            <th>Content type</th>
            {canAssignEditor && <th>Stage TAT</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const isVideoTask = ["editing_queue", "editing_in_progress", "changes_requested", "approval_pending", "approved"].includes(task.state);
            const editor = (users || []).find((user) => user.id === task.editorId);
            const currentStage = (task.stageDurations || []).slice(-1)[0];
            const durationLabel = currentStage?.durationHours !== null && currentStage?.durationHours !== undefined
              ? `${currentStage.durationHours}h`
              : "Active";

            return (
              <tr key={task.id} onClick={() => onOpen(task)}>
                <td>
                  <strong>{task.title}</strong>
                  <span>{task.id} · {task.product} · Hook: <em>{task.hookName || "Not set"}</em></span>
                </td>
                <td><BriefBadge task={task} /><span className="source">{sourceSheet(task)}</span></td>
                <td>
                  {isVideoTask
                    ? (canAssignEditor && onAssignEditor
                        ? <EditorSelect task={task} editors={editors} onChange={onAssignEditor} compact />
                        : <span className="inline-owner"><Avatar person={editor} small />{editor?.name || "Unassigned"}</span>)
                    : <OwnerSelect task={task} writers={writers} onChange={onAssign} compact />}
                </td>
                <td><Priority value={task.priority} /></td>
                <td>{task.contentType}</td>
                {canAssignEditor && <td><strong>{durationLabel}</strong></td>}
                <td><Status state={task.state} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!tasks.length && (
        <div className="empty-results">
          <Search size={22} />
          <strong>No matching tasks</strong>
          <span>Try another search or filter.</span>
        </div>
      )}
    </section>
  );
}

function getDriveEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return null;
}

function VideoDropzone({ file, onFileSelect, onClearFile, error }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      if (dropped.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(dropped.name)) {
        onFileSelect(dropped);
      }
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      onFileSelect(selected);
    }
  };

  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "600", color: "#111827" }}>
        Drop Video Cut (.mp4, .mov, .webm)
      </label>

      {file ? (
        <div style={{ border: "2px solid #10b981", borderRadius: "8px", background: "#f0fdf4", padding: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Film size={18} style={{ color: "#059669" }} />
              <div>
                <strong style={{ fontSize: "13px", color: "#065f46", display: "block" }}>{file.name}</strong>
                <span style={{ fontSize: "11px", color: "#047857" }}>
                  {(file.size / (1024 * 1024)).toFixed(1)} MB · Ready to send
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearFile}
              style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#b91c1c",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <X size={12} /> Remove
            </button>
          </div>

          {preview && (
            <div style={{ borderRadius: "6px", overflow: "hidden", background: "#000", maxHeight: "240px", display: "flex", justifyContent: "center" }}>
              <video
                src={preview}
                controls
                playsInline
                style={{ maxHeight: "240px", maxWidth: "100%", outline: "none" }}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: isDragOver ? "2px dashed #000" : "2px dashed #cbd5e1",
            borderRadius: "8px",
            background: isDragOver ? "#f1f5f9" : "#f8fafc",
            padding: "24px 16px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <div style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: isDragOver ? "#e2e8f0" : "#ffffff",
            border: "1px solid #e2e8f0",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "10px"
          }}>
            <UploadCloud size={22} style={{ color: isDragOver ? "#000" : "#64748b" }} />
          </div>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#0f172a" }}>
            Drag & drop video cut here
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            or click to browse from device (MP4, MOV, WebM)
          </div>
        </div>
      )}
      {error && <span style={{ color: "#dc2626", fontSize: "11px", marginTop: "4px", display: "block" }}>{error}</span>}
    </div>
  );
}

function ScriptHandoffSection({ task, role, viewerId, onSubmitScript, onSubmitVideo, onSubmitFinalVideo, onGoLive, onBrandDecision, onReleaseDraftBrief }) {
  const [hookName, setHookName] = useState(task?.hookName || "");
  const [scriptUrl, setScriptUrl] = useState(task?.scriptLink || "");
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(task?.videoLink || "");
  const [liveUrl, setLiveUrl] = useState(task?.liveUrl || "");
  const [comment, setComment] = useState("");

  if (!task || task.state === "draft") return null;

  // Brand Approval Action Gate - only Brand & Admin can approve/reject
  if ((role === "brand" || role === "administrator") && ["script_approval_pending", "approval_pending"].includes(task.state)) {
    const isScript = task.state === "script_approval_pending";
    return (
      <div className="script-form">
        <label>
          <span>Decision Notes</span>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Notes for the team..." />
        </label>
        <div className="script-actions">
          <button className="button changes" type="button" onClick={() => onBrandDecision(task.id, "changes_requested", isScript ? "script" : "video", comment)}>
            <MessageSquareWarning size={15} />Request changes
          </button>
          <button className="button primary" type="button" onClick={() => onBrandDecision(task.id, "approved", isScript ? "script" : "video", comment)}>
            <Check size={15} />{isScript ? "Approve Script" : "Approve Video"}
          </button>
        </div>
      </div>
    );
  }

  // Content Submission - only Content can prepare & submit scripts
  if (role === "content" && ["social_research", "script_changes_requested"].includes(task.state)) {
    return (
      <form className="script-form" onSubmit={(e) => { e.preventDefault(); onSubmitScript(task, scriptUrl, comment, hookName); }}>
        <label>
          <span>Hook Name</span>
          <input required maxLength={200} value={hookName} onChange={(e) => setHookName(e.target.value)} placeholder="Enter the hook name" />
        </label>
        <label>
          <span>Google Docs script link</span>
          <input type="url" required value={scriptUrl} onChange={(e) => setScriptUrl(e.target.value)} placeholder="https://docs.google.com/document/d/..." />
        </label>
        <label>
          <span>Note for Brand <small>(optional)</small></span>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Instructions or questions for Brand..." />
        </label>
        <div className="script-actions">
          <button className="button primary" type="submit"><Send size={15} />Send script to Brand Team</button>
        </div>
      </form>
    );
  }

  // Video Submission - only Video editors can submit cuts (Drag & Drop or link)
  if ((role === "edit" || role === "video") && ["editing_queue", "editing_in_progress", "changes_requested"].includes(task.state)) {
    return (
      <form className="script-form" onSubmit={(e) => {
        e.preventDefault();
        const payload = videoFile || videoUrl;
        if (!payload) return;
        onSubmitVideo(task, payload, comment);
      }}>
        {task.scriptLink && (
          <div style={{ marginBottom: "12px", padding: "10px 12px", background: "#f6f8f6", borderRadius: "4px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #dfe3df" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#2d312e" }}>
              <FileText size={14} style={{ color: "#2563eb" }} />
              <strong>Approved Script</strong>
            </span>
            <a href={task.scriptLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "600", textDecoration: "none" }}>
              Open Google Doc <ExternalLink size={13} />
            </a>
          </div>
        )}

        <VideoDropzone
          file={videoFile}
          onFileSelect={(f) => { setVideoFile(f); setVideoUrl(""); }}
          onClearFile={() => setVideoFile(null)}
        />

        {!videoFile && (
          <label style={{ marginTop: "4px" }}>
            <span>Or paste Video Cut Link</span>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/... or https://..."
            />
          </label>
        )}

        <label>
          <span>Editor Notes <small>(optional)</small></span>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Aspect ratio, duration, audio notes..." />
        </label>
        <div className="script-actions">
          <button className="button primary" type="submit" disabled={!videoFile && !videoUrl}>
            <Video size={15} />Send cut to Brand for approval
          </button>
        </div>
      </form>
    );
  }

  // Video Final Delivery - after Brand approves, assigned editor sends final high-quality link to Performance Team
  if ((role === "edit" || role === "video") && task.state === "approved" && (!task.editorId || task.editorId === viewerId)) {
    return <FinalVideoForm task={task} onSubmit={onSubmitFinalVideo} />;
  }

  if (task.state === "approved") {
    return (
      <div className="submitted-script">
        <Check size={18} />
        <div>
          <strong>Video Approved by Brand</strong>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#4f5551" }}>
            Waiting for the assigned editor to submit the high-quality Google Drive link for the Performance Team.
          </p>
          {task.videoLink && <a href={task.videoLink} target="_blank" rel="noreferrer">Review Cut <ExternalLink size={13} /></a>}
          {task.scriptLink && <a href={task.scriptLink} target="_blank" rel="noreferrer">Approved Script <ExternalLink size={13} /></a>}
        </div>
      </div>
    );
  }

  // Performance Go Live - only Performance can launch campaigns
  if (role === "performance" && ["ready_for_performance"].includes(task.state)) {
    return (
      <form className="script-form" onSubmit={(e) => { e.preventDefault(); onGoLive(task, liveUrl, comment); }}>
        {(task.finalVideoUrl || task.videoLink) && (
          <div style={{ marginBottom: "12px", padding: "10px 12px", background: "#f6f8f6", borderRadius: "4px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #dfe3df" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#2d312e" }}>
              <Film size={14} style={{ color: "#16a34a" }} />
              <strong>High-Quality Video Asset</strong>
            </span>
            <a href={task.finalVideoUrl || task.videoLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "600", textDecoration: "none" }}>
              Open Drive Video <ExternalLink size={13} />
            </a>
          </div>
        )}
        <label>
          <span>Live Campaign URL</span>
          <input type="url" required value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://instagram.com/reel/... or https://..." />
        </label>
        <label>
          <span>Publishing Notes</span>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ad set ID, UTM campaign, budget..." />
        </label>
        <div className="script-actions">
          <button className="button primary" type="submit"><Rocket size={15} />Record Go-Live</button>
        </div>
      </form>
    );
  }

  // Default Asset Preview
  return (
    <div className="submitted-script">
      <Check size={18} />
      <div>
        <strong>{task.state === "approved" ? "Approved Deliverables" : "Delivered Assets"}</strong>
        {task.scriptLink && <a href={task.scriptLink} target="_blank" rel="noreferrer">Open Google Doc <ExternalLink size={13} /></a>}
        {task.videoLink && <a href={task.videoLink} target="_blank" rel="noreferrer">Open Google Drive Video <ExternalLink size={13} /></a>}
        {task.liveUrl && <a href={task.liveUrl} target="_blank" rel="noreferrer">View Live Ad Link <ExternalLink size={13} /></a>}
      </div>
    </div>
  );
}

function Drawer({
  task,
  role,
  viewerId,
  users = [],
  writers = [],
  editors = [],
  canAssignEditor = false,
  isManager = false,
  isAdmin = false,
  onClose,
  onAssign,
  onAssignEditor,
  onSubmitScript,
  onSubmitVideo,
  onSubmitFinalVideo,
  onGoLive,
  onBrandDecision,
  onReleaseDraftBrief,
}) {
  const [tab, setTab] = useState("overview");
  const [drawerDecisionComment, setDrawerDecisionComment] = useState("");
  const canViewAuditTabs = Boolean(isAdmin || isManager);
  const availableTabs = canViewAuditTabs ? ["overview", "timing", "activity"] : ["overview"];

  useEffect(() => {
    if (!canViewAuditTabs && tab !== "overview") {
      setTab("overview");
    }
  }, [canViewAuditTabs, tab]);

  if (!task) return null;
  const writer = (users || []).find((person) => person.id === (task.scriptOwnerId || task.contentOwnerId));
  const editor = (users || []).find((person) => person.id === task.editorId);
  const isVideoTask = ["editing_queue", "editing_in_progress", "changes_requested", "approval_pending", "approved"].includes(task.state);
  const metrics = computePipelineMetrics(task);

  const hasActiveAction =
    ((role === "brand" || role === "administrator") && ["script_approval_pending", "approval_pending"].includes(task.state)) ||
    (role === "content" && ["social_research", "script_changes_requested"].includes(task.state)) ||
    ((role === "edit" || role === "video") && ["editing_queue", "editing_in_progress", "changes_requested", "approved"].includes(task.state)) ||
    (role === "performance" && ["ready_for_performance"].includes(task.state));
  const hasDeliveredAssets = Boolean(task.scriptLink || task.videoLink || task.liveUrl);
  const shouldShowActions = task.state !== "draft" && (hasActiveAction || hasDeliveredAssets);

  return (
    <>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close task details" />
      <aside className="drawer">
        <header className="drawer-head">
          <div>
            <span className="eyebrow">{task.id} · {task.category}</span>
            <TaskHeaderBadges task={task} />
            <h2>{task.title}</h2>
            <p>{task.product} · Hook: <strong>{task.hookName || "Not set"}</strong></p>
          </div>
          <button className="close-button" onClick={onClose}><X /></button>
        </header>
        {canViewAuditTabs && (
          <nav className="drawer-tabs">
            {availableTabs.map((item) => (
              <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>
            ))}
          </nav>
        )}
        <div className="drawer-body">
          {tab === "overview" && (
            <>
              {/* VIDEO CUT FROM EDITOR - AT VERY TOP FOR VIDEO APPROVAL */}
              {task.state === "approval_pending" && (
                <section className="detail-section" style={{ border: "2px solid #111827", borderRadius: "8px", padding: "16px", background: "#ffffff" }}>
                  <div className="section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Film size={18} style={{ color: "#111827" }} />
                      <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Video Cut from Editor</h3>
                      <span className="eyebrow" style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "4px", fontWeight: "700", fontSize: "11px" }}>
                        Pending Brand Approval
                      </span>
                    </div>
                    <Status state={task.state} />
                  </div>

                  {/* Video Player */}
                  {task.videoLink ? (
                    <div style={{ background: "#000000", borderRadius: "6px", overflow: "hidden", margin: "10px 0", maxHeight: "420px", display: "flex", justifyContent: "center", alignItems: "center" }}>
                      {getDriveEmbedUrl(task.videoLink) ? (
                        <iframe
                          src={getDriveEmbedUrl(task.videoLink)}
                          style={{ width: "100%", height: "360px", border: "0" }}
                          allow="autoplay"
                        />
                      ) : (
                        <video
                          src={task.videoLink}
                          controls
                          playsInline
                          preload="metadata"
                          style={{ maxHeight: "420px", maxWidth: "100%", outline: "none" }}
                        >
                          Your browser does not support the video tag.
                        </video>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: "20px", background: "#f8fafc", borderRadius: "6px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                      No video cut uploaded
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0 12px", fontSize: "12px", color: "#475569" }}>
                    <span>
                      {task.videoAsset?.name ? `File: ${task.videoAsset.name}` : "Submitted cut"}
                      {task.videoAsset?.size ? ` · ${(task.videoAsset.size / (1024 * 1024)).toFixed(1)} MB` : ""}
                    </span>
                    {task.videoLink && (
                      <a href={task.videoLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "600", textDecoration: "none" }}>
                        Open in new tab <ExternalLink size={12} />
                      </a>
                    )}
                  </div>

                  {(role === "brand" || role === "administrator") ? (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "12px", marginTop: "10px" }}>
                      <label style={{ display: "block", marginBottom: "8px" }}>
                        <span style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Decision Notes</span>
                        <input
                          value={drawerDecisionComment}
                          onChange={(e) => setDrawerDecisionComment(e.target.value)}
                          placeholder="Notes for the video editor..."
                          style={{ width: "100%", padding: "8px 10px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                        />
                      </label>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                        <button
                          className="button changes"
                          type="button"
                          onClick={() => onBrandDecision(task.id, "changes_requested", "video", drawerDecisionComment)}
                        >
                          <MessageSquareWarning size={15} />Request changes
                        </button>
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => onBrandDecision(task.id, "approved", "video", drawerDecisionComment)}
                        >
                          <Check size={15} />Approve Video
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "4px", fontSize: "12px", color: "#475569", border: "1px solid #e2e8f0" }}>
                      Submitted for Brand Review · Waiting for Brand approval
                    </div>
                  )}
                </section>
              )}

              {/* VIDEO APPROVED - DISPLAY AT TOP FOR EDITOR HANDOFF */}
              {task.state === "approved" && (
                <section className="detail-section" style={{ border: "2px solid #10b981", borderRadius: "8px", padding: "16px", background: "#ecfdf5" }}>
                  <div className="section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Check size={18} style={{ color: "#065f46" }} />
                      <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "#065f46" }}>Video Approved by Brand</h3>
                      <span className="eyebrow" style={{ background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: "4px", fontWeight: "700", fontSize: "11px" }}>
                        Ready for Performance Delivery
                      </span>
                    </div>
                    <Status state={task.state} />
                  </div>

                  {((role === "edit" || role === "video") && (!task.editorId || task.editorId === viewerId)) ? (
                    <div>
                      <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#047857" }}>
                        Brand has approved this video cut! Create or paste your final high-quality Google Drive video link below to deliver to the Performance Team.
                      </p>
                      <FinalVideoForm task={task} onSubmit={onSubmitFinalVideo} />
                    </div>
                  ) : (
                    <div>
                      <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#047857" }}>
                        This video cut was approved by the Brand Team. The assigned video editor will now submit the final high-quality link to send to the Performance Team.
                      </p>
                      {task.videoLink && (
                        <a href={task.videoLink} target="_blank" rel="noreferrer" style={{ fontSize: "12px", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px", color: "#065f46" }}>
                          Review Approved Cut <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* 1. References */}
              <section className="detail-section">
                <div className="section-title">
                  <h3>References</h3>
                  <span className="eyebrow">{(task.references || []).length} attached</span>
                </div>
                <div className="references">
                  {(task.references || []).length > 0 ? (
                    (task.references || []).map((ref, index) =>
                      /^https?:\/\//i.test(ref) ? (
                        <a href={ref} target="_blank" rel="noreferrer" key={`${ref}-${index}`}>
                          <ExternalLink size={14} />Open reference ({ref.replace(/^https?:\/\/(www\.)?/, "").slice(0, 36)}...)
                        </a>
                      ) : (
                        <span key={`${ref}-${index}`}><FileText size={14} />{ref}</span>
                      )
                    )
                  ) : (
                    <span style={{ fontSize: "12px", color: "#8b928e", fontStyle: "italic" }}>No reference link attached</span>
                  )}
                </div>
              </section>

              {/* 2. Brand Comments */}
              <section className="detail-section">
                <div className="section-title">
                  <h3>Brand Comments</h3>
                  <BriefBadge task={task} />
                </div>
                <p className="summary">{task.summary || "No comments provided."}</p>
                <div className="deliverables">
                  {(task.deliverables || []).map((item) => <span key={item}><Check size={13} />{item}</span>)}
                </div>
              </section>

              {/* 3. Actions (Active stages only, hidden for draft Brand Briefs and stages handled above) */}
              {shouldShowActions && task.state !== "approval_pending" && task.state !== "approved" && (
                <section className="detail-section">
                  <div className="section-title">
                    <h3>Actions</h3>
                    <Status state={task.state} />
                  </div>
                  <ScriptHandoffSection
                    task={task}
                    role={role}
                    viewerId={viewerId}
                    onSubmitScript={onSubmitScript}
                    onSubmitVideo={onSubmitVideo}
                    onSubmitFinalVideo={onSubmitFinalVideo}
                    onGoLive={onGoLive}
                    onBrandDecision={onBrandDecision}
                    onReleaseDraftBrief={onReleaseDraftBrief}
                  />
                </section>
              )}

              {/* 4. Assignment & Context */}
              <section className="detail-section">
                <div className="section-title">
                  <h3>Assignment & Context</h3>
                </div>
                <div className="detail-grid">
                  <div>
                    <label>Assigned Owner</label>
                    {isVideoTask
                      ? (canAssignEditor
                        ? <EditorSelect task={task} editors={editors} onChange={onAssignEditor} />
                        : <span className="inline-owner"><Avatar person={editor} small />{editor?.name || "Unassigned"}</span>)
                      : <OwnerSelect task={task} writers={writers} onChange={onAssign} />}
                  </div>
                  <div>
                    <label>Current Owner</label>
                    <span className="inline-owner"><Avatar person={isVideoTask ? editor : writer} small />{(isVideoTask ? editor : writer)?.name || "Unassigned"}</span>
                  </div>
                  <div>
                    <label>Priority</label>
                    <Priority value={task.priority} />
                  </div>
                  {canViewAuditTabs && (
                    <div>
                      <label>Total Pipeline Lead Time</label>
                      <span>{metrics.totalElapsedDays} Days</span>
                    </div>
                  )}
                  <div>
                    <label>Source</label>
                    <span>{sourceSheet(task)}</span>
                  </div>
                  <div>
                    <label>Platform</label>
                    <span>{task.platform || "Instagram"}</span>
                  </div>
                </div>
              </section>
            </>
          )}

          {canViewAuditTabs && tab === "timing" && (
            <section className="detail-section">
              <div className="section-title">
                <h3>Stage Execution & Turnaround (TAT)</h3>
                <span className="eyebrow">Total: {metrics.totalElapsedDays} Days</span>
              </div>
              <p className="summary" style={{ marginBottom: "16px" }}>
                Execution timestamps and turnaround times for each team handoff.
              </p>
              {(task.stageDurations || []).map((s, idx) => (
                <article className="activity-row" key={`${s.stage}-${idx}`}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{s.stage.replace(/_/g, " ").toUpperCase()} · Team: {s.team}</strong>
                    <p>
                      Started: {formatDateTime(s.startedAt)}
                      {s.completedAt ? ` · Completed: ${formatDateTime(s.completedAt)}` : " · Currently active"}
                    </p>
                    <time>{s.durationHours !== null && s.durationHours !== undefined ? `Turnaround: ${s.durationHours} hrs` : "In progress"}</time>
                  </div>
                </article>
              ))}
            </section>
          )}

          {canViewAuditTabs && tab === "activity" && (
            <section className="detail-section">
              <div className="section-title"><h3>Activity History</h3></div>
              {(task.activity || []).map((item, index) => (
                <article className="activity-row" key={`${item.at}-${index}`}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{item.actor}</strong>
                    <p>{item.text}</p>
                    <time>{formatDateTime(item.at)}</time>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

function ProductCombobox({
  products = [],
  value = "",
  onChange,
  onAddNewProduct,
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdCat, setNewProdCat] = useState("Skin");
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowAddForm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter products by typed query dynamically
  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q))
    );
  }, [products, query]);

  const exactMatchExists = useMemo(() => {
    return products.some((p) => p.name.toLowerCase() === query.trim().toLowerCase());
  }, [products, query]);

  const handleSelect = (prod) => {
    onChange(prod.name, prod.category);
    setQuery("");
    setIsOpen(false);
    setShowAddForm(false);
  };

  const handleCreateNew = (name, cat) => {
    const trimmed = (name || query).trim();
    if (!trimmed) return;
    onAddNewProduct(trimmed, cat);
    onChange(trimmed, cat);
    setQuery("");
    setNewProdName("");
    setIsOpen(false);
    setShowAddForm(false);
  };

  return (
    <div className="product-combobox-wrap" ref={dropdownRef}>
      <div className="product-combobox-input-box">
        <Search size={14} className="combobox-icon" />
        <input
          type="text"
          value={isOpen ? query : (value || query)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery(value ? "" : query);
          }}
          placeholder="Search product (or type to add)..."
          required
        />
        <div className="combobox-actions">
          {value && (
            <button
              type="button"
              className="combobox-btn"
              title="Clear selection"
              onClick={() => {
                onChange("", "");
                setQuery("");
              }}
            >
              <X size={13} />
            </button>
          )}
          <button
            type="button"
            className="combobox-btn"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle products dropdown"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="product-combobox-dropdown">
          <div className="product-combobox-list">
            {filtered.slice(0, 40).map((prod) => (
              <button
                type="button"
                key={prod.name}
                className={`product-combobox-item ${value === prod.name ? "active" : ""}`}
                onClick={() => handleSelect(prod)}
              >
                <strong>{prod.name}</strong>
                <span className={`product-cat-pill ${(prod.category || "skin").toLowerCase()}`}>
                  {prod.category}
                </span>
              </button>
            ))}

            {!filtered.length && (
              <div className="product-empty-state">
                <span>No existing products matching &quot;{query}&quot;</span>
              </div>
            )}
          </div>

          {/* Add Product Section */}
          {!showAddForm ? (
            <div className="product-add-prompt">
              {query.trim() && !exactMatchExists ? (
                <button
                  type="button"
                  className="product-add-trigger-btn"
                  onClick={() => {
                    setNewProdName(query.trim());
                    setShowAddForm(true);
                  }}
                >
                  <Plus size={14} /> Add &quot;{query.trim()}&quot; as product
                </button>
              ) : (
                <button
                  type="button"
                  className="product-add-trigger-btn"
                  onClick={() => {
                    setNewProdName("");
                    setShowAddForm(true);
                  }}
                >
                  <Plus size={14} /> Add New Product
                </button>
              )}
            </div>
          ) : (
            <div className="product-inline-add-box">
              <h4>Add New Product to Catalog</h4>
              <div className="product-inline-row">
                <input
                  type="text"
                  className="product-inline-input"
                  placeholder="Product name..."
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  autoFocus
                />
                <select
                  className="product-inline-select"
                  value={newProdCat}
                  onChange={(e) => setNewProdCat(e.target.value)}
                  aria-label="Product Category"
                >
                  <option value="Skin">Skin</option>
                  <option value="Hair">Hair</option>
                  <option value="Nutra">Nutra</option>
                  <option value="Joyun">Joyun</option>
                  <option value="B2G2">B2G2</option>
                </select>
                <button
                  type="button"
                  className="product-inline-save-btn"
                  onClick={() => handleCreateNew(newProdName, newProdCat)}
                >
                  Add & Select
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewBriefModal({ onClose, onSubmit }) {
  const defaultBrief = "video";
  const defaultCategory = "Nutra";

  // Dynamic products list initialized from catalog, expandable with user-added products
  const [products, setProducts] = useState(plixProductsCatalog.products || []);

  const [formData, setFormData] = useState({
    hookName: "",
    product: "",
    category: defaultCategory,
    contentType: (CONTENT_TYPES_BY_BRIEF[defaultBrief] || ["UGC"])[0],
    briefType: defaultBrief,
    priority: "P1",
    summary: "",
    referenceUrl: "",
  });

  const handleAddNewProduct = (name, category) => {
    setProducts((prev) => {
      if (prev.some((p) => p.name.toLowerCase() === name.toLowerCase())) return prev;
      return [{ name, category: category || "Skin" }, ...prev];
    });
  };

  // Dynamically vary content type options based on brief type
  const handleBriefTypeChange = (newBriefType) => {
    const allowed = CONTENT_TYPES_BY_BRIEF[newBriefType] || [];
    const nextType = allowed.includes(formData.contentType) ? formData.contentType : allowed[0];
    setFormData((prev) => ({
      ...prev,
      briefType: newBriefType,
      contentType: nextType,
    }));
  };

  const handleAction = (asDraft = false) => {
    if (!formData.hookName.trim()) {
      alert("Please provide a Hook Name");
      return;
    }
    if (!formData.product.trim()) {
      alert("Please select or add a Product");
      return;
    }
    onSubmit({
      ...formData,
      title: formData.hookName.trim(),
      asDraft,
      referenceUrls: formData.referenceUrl.trim() ? [formData.referenceUrl.trim()] : [],
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal new-brief-modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <span className="eyebrow">Brand Team</span>
            <h2>Create Brand Brief</h2>
          </div>
          <button type="button" className="close-button-rect" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </header>

        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleAction(false);
          }}
        >
          <div className="modal-body">
            {/* Hook Name */}
            <label className="form-group full-width">
              <span>Hook Name <b className="required">*</b></span>
              <input
                required
                maxLength={200}
                value={formData.hookName}
                onChange={(e) => setFormData({ ...formData, hookName: e.target.value })}
                placeholder="e.g. 3 Seconds to Clear Skin"
              />
            </label>

            {/* 2-Column Row: Brief Type & Priority */}
            <div className="form-row-2col">
              <label className="form-group">
                <span>Brief Type <b className="required">*</b></span>
                <select
                  value={formData.briefType}
                  onChange={(e) => handleBriefTypeChange(e.target.value)}
                >
                  <option value="video">Video</option>
                  <option value="ai">AI</option>
                  <option value="joyun">Joyun</option>
                  <option value="global">Global</option>
                  <option value="b2g2">B2G2</option>
                </select>
              </label>

              <label className="form-group">
                <span>Priority</span>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                >
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="R0">R0</option>
                </select>
              </label>
            </div>

            {/* Dynamic Product Search Bar with Add Product Option */}
            <div className="form-group full-width">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Product <b className="required">*</b></span>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  {formData.product ? `Selected: ${formData.product}` : `${products.length} products`}
                </span>
              </div>
              <ProductCombobox
                products={products}
                value={formData.product}
                onChange={(name, category) => {
                  setFormData((prev) => ({
                    ...prev,
                    product: name,
                    category: category || prev.category,
                  }));
                }}
                onAddNewProduct={handleAddNewProduct}
              />
            </div>

            {/* 2-Column Row: Category & Content Format */}
            <div className="form-row-2col">
              <label className="form-group">
                <span>Category</span>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="Skin">Skin</option>
                  <option value="Hair">Hair</option>
                  <option value="Nutra">Nutra</option>
                  <option value="Joyun">Joyun</option>
                  <option value="B2G2">B2G2</option>
                </select>
              </label>

              <label className="form-group">
                <span>Content Format <b className="required">*</b></span>
                <select
                  value={formData.contentType}
                  onChange={(e) => setFormData({ ...formData, contentType: e.target.value })}
                >
                  {(CONTENT_TYPES_BY_BRIEF[formData.briefType] || []).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Inspiration / Reference Link */}
            <label className="form-group full-width">
              <span>Reference Link <small>(optional)</small></span>
              <input
                type="url"
                value={formData.referenceUrl}
                onChange={(e) => setFormData({ ...formData, referenceUrl: e.target.value })}
                placeholder="https://drive.google.com/... or Instagram link"
              />
            </label>

            {/* Add Comments */}
            <label className="form-group full-width">
              <span>Add Comments</span>
              <textarea
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                placeholder="Add comments, requirements, or guidelines..."
              />
            </label>
          </div>

          <footer className="modal-footer">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                className="button"
                style={{ background: "#f5f7f5", borderColor: "#cfd4d0" }}
                onClick={() => handleAction(true)}
              >
                Save as Draft
              </button>
              <button type="submit" className="button primary">
                <Send size={14} />
                Send to Content Team
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

function SubmitVideoModal({ tasks = [], onClose, onSubmit }) {
  const eligibleTasks = tasks.filter((t) => ["editing_queue", "editing_in_progress", "changes_requested"].includes(t.state));
  const [selectedTaskId, setSelectedTaskId] = useState(eligibleTasks[0]?.id || "");
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [comment, setComment] = useState("");

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">VIDEO TEAM SUBMISSION</span>
            <h2>Submit Video Cut</h2>
            <p>Drop your video cut to send to Brand Team for review</p>
          </div>
          <button type="button" className="close-button" onClick={onClose}><X size={18} /></button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!selectedTask) return;
            const payload = videoFile || videoUrl;
            if (!payload) return;
            onSubmit(selectedTask, payload, comment);
            onClose();
          }}
        >
          <div className="modal-body">
            <div className="form-grid">
              <div className="field full">
                <label>Select Video Task</label>
                {eligibleTasks.length > 0 ? (
                  <select
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    required
                  >
                    {eligibleTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id} — {t.title} ({t.product} · {t.priority})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: "12px", color: "#8b928e", fontStyle: "italic", margin: 0 }}>
                    No video tasks currently awaiting submission in queue or production.
                  </p>
                )}
              </div>

              {selectedTask && (
                <div className="field full" style={{ background: "#f6f8f6", padding: "10px 12px", borderRadius: "4px", fontSize: "12px", border: "1px solid #dfe3df" }}>
                  <div><strong>Product:</strong> {selectedTask.product} · <strong>Category:</strong> {selectedTask.category}</div>
                  {selectedTask.scriptLink && (
                    <div style={{ marginTop: "4px" }}>
                      <strong>Approved Script:</strong> <a href={selectedTask.scriptLink} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Open Google Doc <ExternalLink size={12} /></a>
                    </div>
                  )}
                  {selectedTask.summary && (
                    <div style={{ marginTop: "4px", color: "#555" }}>
                      <strong>Brand Comments:</strong> {selectedTask.summary}
                    </div>
                  )}
                </div>
              )}

              <div className="field full">
                <VideoDropzone
                  file={videoFile}
                  onFileSelect={(f) => { setVideoFile(f); setVideoUrl(""); }}
                  onClearFile={() => setVideoFile(null)}
                />
              </div>

              {!videoFile && (
                <div className="field full">
                  <label>Or paste Video Cut Link</label>
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... or https://..."
                  />
                </div>
              )}

              <div className="field full">
                <label>Editor Notes (Optional)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Aspect ratio, duration, audio notes, or revisions..."
                />
              </div>
            </div>
          </div>

          <footer className="modal-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button type="button" className="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary" disabled={!selectedTask || (!videoFile && !videoUrl)}>
              <Send size={14} />Send to Brand Team
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export default function UnifiedDashboard({ initialTasks = [], initialUsers = [], initialNotifications = [], sessionUser = null }) {
  const users = useMemo(() => dedupeUsers(initialUsers), [initialUsers]);
  const writers = users.filter((p) => p.role === "content");
  const editors = users.filter((p) => ["edit", "video"].includes(p.role) && !p.isTeamLead);

  // User Identity & Role Authentication strictly bound to authenticated login session
  const currentUserId = sessionUser?.id || "usr-isha";
  const currentUser = users.find((p) => p.id === currentUserId) || sessionUser || users[0];
  const currentRole = currentUser?.role || "brand";
  const normalizedTeam = normalizeRole(currentRole);
  const isEditingManager = Boolean(currentUser?.isTeamLead && ["edit", "video"].includes(currentRole));

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (_) {
      window.location.href = "/login";
    }
  };

  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");
  const [brief, setBrief] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState("board");
  const [activeTab, setActiveTab] = useState("workspace"); // "workspace" | "personal"
  const [selectedId, setSelectedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitVideoModalOpen, setSubmitVideoModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications.length ? initialNotifications : INITIAL_NOTIFICATIONS);
  const [devicePushActive, setDevicePushActive] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); window.setTimeout(() => setToast(null), 2600); };

  // Sync device notification permission on mount
  useEffect(() => {
    setDevicePushActive(NotificationService.isDevicePermissionGranted());
  }, []);

  // Ensure personal space is only accessible for Video Team and Admin
  useEffect(() => {
    if (activeTab === "personal" && !["edit", "video", "administrator"].includes(currentRole)) {
      setActiveTab("workspace");
    }
  }, [activeTab, currentRole]);

  // Real-Time EventSource: Sync tasks & pipeline updates across all open team dashboards
  useEffect(() => {
    let eventSource;
    try {
      eventSource = new EventSource("/api/events");
      eventSource.onmessage = async () => {
        try {
          const res = await fetch("/api/tasks?team=administrator");
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.tasks)) {
              setTasks(data.tasks);
            }
          }
        } catch (_) {}
      };
    } catch (_) {}
    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const handleToggleDevicePush = async () => {
    const res = await NotificationService.requestDevicePermission();
    if (res.granted) {
      setDevicePushActive(true);
      showToast("Device notifications active on this system!");
      NotificationService.sendDeviceAlert("Device Alerts Enabled", `You will receive OS alerts when tasks flow to ${roleLabel(currentRole)}.`);
    } else if (!res.supported) {
      showToast("Web Notifications not supported in this browser");
    } else {
      setDevicePushActive(false);
      showToast("Device notification permission denied in browser");
    }
  };

  // Dedicated NotificationService Dispatcher (In-App, Device OS Alert, SMS, and Gmail API Email)
  const dispatchWorkflowHandoffNotification = async ({
    targetTeam,
    eventType,
    title,
    message,
    task,
    recipientUser,
    customNote,
  }) => {
    const notifId = `notif-${Date.now()}`;
    const now = new Date().toISOString();
    const phone = recipientUser?.phone || currentUser?.phone || PRIMARY_NOTIFICATION_PHONE;
    const recipientName = recipientUser?.name || roleLabel(targetTeam);
    const recipientEmail = recipientUser?.email || `${(recipientUser?.name || targetTeam).toLowerCase().replace(/[^a-z0-9]/g, "")}@plixlife.com`;

    // 1. Record In-App notification
    const newNotif = {
      id: notifId,
      taskId: task.id,
      targetTeam,
      type: eventType,
      title,
      message,
      actorName: currentUser?.name || "Team Member",
      recipientName,
      recipientPhone: phone,
      recipientEmail,
      createdAt: now,
      read: false,
      channels: ["in_app", "device", "sms", "email"],
      smsStatus: "delivered",
      emailStatus: "dispatched",
    };
    setNotifications((prev) => [newNotif, ...prev]);

    // 2. Trigger native OS / Device notification banner
    NotificationService.sendDeviceAlert(title, message, task.id);

    // 3. Dispatch SMS alert through system
    try {
      await NotificationService.dispatchSms({
        phone,
        recipientName,
        action: eventType,
        task,
        actorName: currentUser?.name || "Team Member",
      });
    } catch (_) {}

    // 4. Dispatch Gmail API email notification with PlixOps logo PNG
    try {
      await NotificationService.dispatchEmail({
        to: recipientEmail,
        recipientName,
        action: eventType,
        task,
        actorName: currentUser?.name || "Team Member",
        customNote,
      });
    } catch (_) {}
  };

  // Filter notifications relevant to this authenticated role
  const teamNotifications = useMemo(() => {
    if (currentRole === "administrator") return notifications;
    return notifications.filter((n) => n.targetTeam === normalizedTeam || n.targetTeam === currentRole);
  }, [notifications, normalizedTeam, currentRole]);

  const unreadCount = teamNotifications.filter((n) => !n.read).length;

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    showToast("All notifications marked as read");
  };

  // STRICT RBAC ABSTRACTION: Tasks for this role ONLY
  // A brand person will not have entire view of system; they only see activity assigned to them to act on and proceed.
  const roleTasks = useMemo(() => {
    if (currentRole === "administrator") return tasks;
    const allowed = TEAM_VISIBLE_STATES[normalizedTeam] || [];
    const teamTasks = tasks.filter((t) => allowed.includes(t.state));

    if (currentRole === "brand") {
      // Brand person only sees activity assigned to them
      return teamTasks.filter((task) => {
        const isAssignedApprover = CATEGORY_ROUTING[task.category]?.approverIds?.includes(currentUserId);
        const isBrandOwner = task.brandOwnerId === currentUserId;
        const isCreator = task.creatorId === currentUserId;
        const isUnassignedBrand = !task.brandOwnerId && (!CATEGORY_ROUTING[task.category]?.approverIds?.length || currentUserId === "usr-isha");
        return isAssignedApprover || isBrandOwner || isCreator || isUnassignedBrand;
      });
    }

    if (["edit", "video"].includes(currentRole)) {
      // Managers share the complete editing queue. Individual editors only see their work.
      return currentUser?.isTeamLead
        ? teamTasks
        : teamTasks.filter((task) => task.editorId === currentUserId);
    }

    return teamTasks;
  }, [tasks, normalizedTeam, currentRole, currentUserId, currentUser?.isTeamLead]);

  // Toolbar Filter
  const filtered = useMemo(() => {
    return roleTasks.filter((task) => {
      const haystack = [task.id, task.title, task.hookName, task.product, task.category, task.contentType].join(" ").toLowerCase();
      
      const matchesStatus = status === "all" || (
        status === "needs_assignment" ? (task.state === "editing_queue" && !task.editorId) :
        status === "assigned_queue" ? (task.state === "editing_queue" && Boolean(task.editorId)) :
        status === "editing_queue" ? (task.state === "editing_queue" || task.state === "editing_in_progress") :
        status === "approval_pending" ? (task.state === "approval_pending" || task.state === "approved") :
        task.state === status
      );

      return (
        (brief === "all" || briefType(task) === brief) &&
        (priority === "all" || task.priority === priority) &&
        matchesStatus &&
        (!search || haystack.includes(search.toLowerCase()))
      );
    });
  }, [roleTasks, search, brief, priority, status]);

  const selected = tasks.find((t) => t.id === selectedId);
  const columns = isEditingManager ? ROLE_COLUMNS.video_manager : (ROLE_COLUMNS[currentRole] || ROLE_COLUMNS.content);
  const isBrandTeam = currentRole === "brand";

  // Actions
  const assignWriter = async (taskId, writerId) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptOwnerId: writerId, contentOwnerId: writerId }),
      });
      if (!res.ok) throw new Error("Server assignment failed");
      const data = await res.json();
      const updated = data.task;
      setTasks((items) => items.map((t) => (t.id === taskId ? updated : t)));
      showToast("Owner assignment updated");
    } catch (_) {
      // Optimistic fallback
      setTasks((items) =>
        items.map((t) =>
          t.id === taskId
            ? { ...t, scriptOwnerId: writerId, contentOwnerId: writerId, updatedAt: new Date().toISOString() }
            : t
        )
      );
      showToast("Owner assignment updated");
    }
  };

  const assignEditor = async (taskId, editorId) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Editor assignment failed");
      setTasks((items) => items.map((task) => (task.id === taskId ? data.task : task)));
      showToast(editorId ? "Editor assigned — all manager dashboards updated" : "Returned to unassigned queue");
    } catch (error) {
      showToast(error.message || "Failed to assign editor");
    }
  };

  const handleCreateBrief = async (payload) => {
    const asDraft = Boolean(payload.asDraft);
    const routing = CATEGORY_ROUTING[payload.category] || { writerId: null, writerName: "Unassigned" };

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          asDraft,
          brandOwnerId: currentUser?.id,
          creatorId: currentUser?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create brief");
      const newTask = data.task;
      setTasks((items) => [newTask, ...items.filter((t) => t.id !== newTask.id)]);
      setModalOpen(false);

      if (asDraft) {
        showToast("Brief saved to Brand Brief Draft folder");
      } else {
        showToast("New brief released to Content queue");
        const assignedWriter = users.find((u) => u.id === routing.writerId) || users.find((u) => u.role === "content");
        dispatchWorkflowHandoffNotification({
          targetTeam: "content",
          eventType: NOTIFICATION_EVENTS.BRIEF_RELEASED,
          title: "Brand Brief Released",
          message: `Brief "${payload.title}" (${newTask.id}) released. Hook: "${payload.hookName}". Assigned to Content queue.`,
          task: newTask,
          recipientUser: assignedWriter,
        });
      }
    } catch (err) {
      showToast(err.message || "Failed to save brief");
    }
  };

  const handleReleaseDraftBrief = async (task) => {
    const routing = CATEGORY_ROUTING[task.category] || { writerId: null, writerName: "Unassigned" };
    try {
      const res = await fetch(`/api/tasks/${task.id}/release`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to release brief");
      const updated = data.task;
      setTasks((items) => items.map((t) => (t.id === task.id ? updated : t)));
      setSelectedId(null);
      showToast(`Brief ${task.id} released to Content queue`);

      const assignedWriter = users.find((u) => u.id === (updated.scriptOwnerId || routing.writerId)) || users.find((u) => u.role === "content");
      dispatchWorkflowHandoffNotification({
        targetTeam: "content",
        eventType: NOTIFICATION_EVENTS.BRIEF_RELEASED,
        title: "Brand Brief Released",
        message: `Brief "${task.title}" (${task.id}) released from draft. Hook: "${task.hookName || "Not set"}". Assigned to Content queue.`,
        task: updated,
        recipientUser: assignedWriter,
      });
    } catch (err) {
      showToast(err.message || "Failed to release draft brief");
    }
  };

  const handleSubmitScript = async (task, link, comments, hookName) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hookName, scriptUrl: link, comment: comments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit script");
      const updated = data.task;
      setTasks((items) => items.map((t) => (t.id === task.id ? updated : t)));
      setSelectedId(null);
      showToast("Script sent to Brand Team for approval");

      const brandApprover = users.find((u) => u.role === "brand");
      dispatchWorkflowHandoffNotification({
        targetTeam: "brand",
        eventType: NOTIFICATION_EVENTS.SCRIPT_SUBMITTED,
        title: "Script Ready for Approval",
        message: `Content script for "${task.title}" (${task.id}) submitted by ${currentUser?.name}. Brand approval required.`,
        task: updated,
        recipientUser: brandApprover,
      });
    } catch (err) {
      showToast(err.message || "Failed to submit script");
    }
  };

  const handleSubmitVideo = async (task, videoPayload, comments) => {
    try {
      let res;
      if (typeof window !== "undefined" && videoPayload instanceof File) {
        const formData = new FormData();
        formData.append("video", videoPayload);
        formData.append("comment", comments || "");
        formData.append("aspectRatio", "9:16");
        res = await fetch(`/api/tasks/${task.id}/video`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`/api/tasks/${task.id}/video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: videoPayload, aspectRatio: "9:16", version: 1, comment: comments }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit video cut");
      const updated = data.task;
      setTasks((items) => items.map((t) => (t.id === task.id ? updated : t)));
      setSelectedId(null);
      showToast("Video cut sent to Brand Team for review");

      const brandApprover = users.find((u) => u.role === "brand");
      dispatchWorkflowHandoffNotification({
        targetTeam: "brand",
        eventType: NOTIFICATION_EVENTS.VIDEO_SUBMITTED,
        title: "Video Cut Awaiting Review",
        message: `Video cut for "${task.title}" (${task.id}) submitted by ${currentUser?.name}. Brand review required.`,
        task: updated,
        recipientUser: brandApprover,
      });
    } catch (err) {
      showToast(err.message || "Failed to submit video");
    }
  };

  const handleSubmitFinalVideo = async (task, finalVideoUrl) => {
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/final-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalVideoUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send the final video link.");
      const updated = data.task;
      setTasks((items) => items.map((item) => (item.id === task.id ? updated : item)));
      setSelectedId(null);
      showToast("High-quality video delivered to Performance Team!");
      dispatchWorkflowHandoffNotification({
        targetTeam: "performance",
        eventType: NOTIFICATION_EVENTS.VIDEO_READY,
        title: "High-quality video ready",
        message: `The approved high-quality video for "${task.title}" (${task.id}) is ready. Open the brief for its Google Drive link.`,
        task: updated,
        recipientUser: users.find((user) => user.role === "performance"),
      });
    } catch (err) {
      showToast(err.message || "Failed to submit final video");
    }
  };

  const handleGoLive = async (task, link, comments) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveUrl: link, comment: comments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record go-live");
      const updated = data.task;
      setTasks((items) => items.map((t) => (t.id === task.id ? updated : t)));
      setSelectedId(null);
      showToast("Campaign is now LIVE in market!");

      const brandLead = users.find((u) => u.role === "brand");
      dispatchWorkflowHandoffNotification({
        targetTeam: "brand",
        eventType: NOTIFICATION_EVENTS.CAMPAIGN_LIVE,
        title: "Campaign is LIVE",
        message: `"${task.title}" (${task.id}) ad is active in market! Launched by ${currentUser?.name}.`,
        task: updated,
        recipientUser: brandLead,
      });
    } catch (err) {
      showToast(err.message || "Failed to push live");
    }
  };

  const handleBrandDecision = async (taskId, decision, type, comment) => {
    try {
      const res = await fetch(`/api/approvals/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, type, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record decision");
      const updated = data.task;
      setTasks((items) => items.map((t) => (t.id === taskId ? updated : t)));
      setSelectedId(null);
      showToast(decision === "approved"
        ? (type === "script" ? "Script approved! Sent to Video Team." : "Video approved! Shared back to Video Team.")
        : "Changes requested.");

      const current = tasks.find((t) => t.id === taskId) || updated;
      if (decision === "approved") {
        if (type === "script") {
          const editor = users.find((u) => u.id === updated.editorId) || users.find((u) => u.role === "video" || u.role === "edit");
          dispatchWorkflowHandoffNotification({
            targetTeam: "video",
            eventType: NOTIFICATION_EVENTS.SCRIPT_APPROVED,
            title: "Script Approved — Video Production",
            message: `Script approved for "${current.title}" (${current.id}) by ${currentUser?.name}. Video cutting can begin.`,
            task: updated,
            recipientUser: editor,
          });
        } else {
          const editor = users.find((u) => u.id === updated.editorId) || users.find((u) => u.role === "video" || u.role === "edit");
          dispatchWorkflowHandoffNotification({
            targetTeam: "video",
            eventType: NOTIFICATION_EVENTS.VIDEO_APPROVED,
            title: "Video Approved by Brand",
            message: `Video cut for "${current.title}" (${current.id}) was approved by ${currentUser?.name} and shared back to Video Team.`,
            task: updated,
            recipientUser: editor,
          });
        }
      } else {
        const reworkTeam = type === "script" ? "content" : "video";
        const recipient = type === "script"
          ? users.find((u) => u.id === current.scriptOwnerId) || users.find((u) => u.role === "content")
          : users.find((u) => u.id === current.editorId) || users.find((u) => u.role === "video" || u.role === "edit");

        dispatchWorkflowHandoffNotification({
          targetTeam: reworkTeam,
          eventType: type === "script" ? NOTIFICATION_EVENTS.SCRIPT_REWORK : NOTIFICATION_EVENTS.VIDEO_REWORK,
          title: type === "script" ? "Script Revisions Requested" : "Video Changes Requested",
          message: `Brand requested changes on "${current.title}": ${comment}`,
          task: updated,
          recipientUser: recipient,
          customNote: comment,
        });
      }
    } catch (err) {
      showToast(err.message || "Failed to record decision");
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar: ONLY SHOWS THIS USER'S ROLE-AUTHORIZED WORKSPACE */}
      {/* Other teams' dashboards are NOT visible in this navigation! */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark-logo">
            <img src="/plix-ops-logo.png" alt="Plix Ops" />
          </div>
        </div>

        <div className="workspace">
          <label>Workspace</label>
          <button>
            <span>
              <strong>Plix Ops</strong>
              <small>{roleLabel(currentRole)}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>

        <nav>
          <label>Workspaces</label>
          {currentRole === "brand" && (
            <button className={activeTab === "workspace" ? "active" : ""} onClick={() => setActiveTab("workspace")}>
              <Sparkles size={20} />
              <span>Brand Team</span>
            </button>
          )}
          {currentRole === "content" && (
            <button className={activeTab === "workspace" ? "active" : ""} onClick={() => setActiveTab("workspace")}>
              <FileText size={20} />
              <span>Content Team</span>
            </button>
          )}
          {(currentRole === "edit" || currentRole === "video") && (
            <button className={activeTab === "workspace" ? "active" : ""} onClick={() => setActiveTab("workspace")}>
              <Video size={20} />
              <span>Video Team</span>
            </button>
          )}
          {currentRole === "performance" && (
            <button className={activeTab === "workspace" ? "active" : ""} onClick={() => setActiveTab("workspace")}>
              <Rocket size={20} />
              <span>Performance Team</span>
            </button>
          )}
          {currentRole === "administrator" && (
            <button className={activeTab === "workspace" ? "active" : ""} onClick={() => setActiveTab("workspace")}>
              <LayoutDashboard size={20} />
              <span>All Operations</span>
            </button>
          )}

          {(["edit", "video"].includes(currentRole) || currentRole === "administrator") && (
            <>
              <label style={{ marginTop: "16px" }}>Analytics & Planning</label>
              <button className={activeTab === "personal" ? "active" : ""} onClick={() => setActiveTab("personal")}>
                <CalendarIcon size={20} />
                <span>{isEditingManager || currentRole === "administrator" ? "Team Calendar & Dispatch" : "Personal Space"}</span>
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-foot">
          <i />Active: {currentUser?.name}
          <span>{roleLabel(currentRole)}</span>
        </div>
      </aside>

      {/* Main Shell */}
      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu"><Menu /></button>
          <label className="global-search">
            <Search size={20} />
            <input
              id="global-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, campaigns, hooks..."
            />
            <kbd>⌘ K</kbd>
          </label>

          <div className="top-actions">
            <button><CircleHelp /></button>
            <button
              className="notification-trigger"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              title="Notifications & Device Alerts"
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="notification-badge-count">{unreadCount}</span>}
            </button>

            {/* Authenticated Account Profile */}
            <button className="user-button" onClick={() => setUserMenuOpen(!userMenuOpen)}>
              <Avatar person={currentUser} />
              <span>
                <strong>{currentUser?.name || "Team Member"}</strong>
                <small>{roleLabel(currentRole)}</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>

          {/* User Account & Session Menu (Strictly locked to authenticated account) */}
          {userMenuOpen && (
            <div className="user-menu">
              <header>
                <span>Authenticated Account</span>
                <button onClick={() => setUserMenuOpen(false)}><X size={15} /></button>
              </header>

              <div style={{ padding: "10px 4px 6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <Avatar person={currentUser} />
                  <div>
                    <strong style={{ fontSize: "14px", display: "block" }}>{currentUser?.name}</strong>
                    <small style={{ color: "#747a76" }}>{currentUser?.email || `${roleLabel(currentRole)} Member`}</small>
                  </div>
                </div>
                <div className="status" style={{ fontSize: "10px", padding: "3px 8px" }}>
                  Role: {roleLabel(currentRole)}
                </div>
              </div>

              <div style={{ borderTop: "1px solid #edf0ed", marginTop: "10px", paddingTop: "10px" }}>
                <button
                  className="button danger"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={handleSignOut}
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* In-App Notification Center & Device Alerts */}
          {notificationsOpen && (
            <div className="notifications-panel">
              <header className="notifications-header">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <strong>Notifications</strong>
                  {unreadCount > 0 && <span className="unread-counter">{unreadCount} new</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {unreadCount > 0 && (
                    <button className="button-text" onClick={markAllNotificationsRead}>
                      Mark all read
                    </button>
                  )}
                  <button className="icon-btn-sm" onClick={() => setNotificationsOpen(false)}>
                    <X size={15} />
                  </button>
                </div>
              </header>

              {/* Device & SMS Notification Channels */}
              <div className="notification-channel-bar">
                <div className="channel-item">
                  <Smartphone size={13} />
                  <span>SMS Target: <strong>{currentUser?.phone || PRIMARY_NOTIFICATION_PHONE}</strong></span>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  <a
                    href={`https://ntfy.sh/plix-${(currentUser?.phone || PRIMARY_NOTIFICATION_PHONE).replace(/[^0-9]/g, "").slice(-10)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="device-toggle-btn active"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "5px" }}
                    title="Open free live alert stream on phone"
                  >
                    <span className="channel-dot green" />
                    Free Phone Alerts
                  </a>
                  <button
                    className={`device-toggle-btn ${devicePushActive ? "active" : ""}`}
                    onClick={handleToggleDevicePush}
                    title="Toggle OS Device Push Notifications"
                  >
                    <span className={`channel-dot ${devicePushActive ? "green" : "gray"}`} />
                    {devicePushActive ? "Desktop: ON" : "Enable Desktop"}
                  </button>
                </div>
              </div>

              {/* Notifications List */}
              <div className="notifications-list">
                {teamNotifications.length === 0 ? (
                  <div className="notifications-empty">
                    <CheckCheck size={26} />
                    <strong>All caught up!</strong>
                    <span>No pending task alerts for {roleLabel(currentRole)}</span>
                  </div>
                ) : (
                  teamNotifications.map((n) => (
                    <article
                      key={n.id}
                      className={`notification-item ${n.read ? "read" : "unread"}`}
                      onClick={() => {
                        setSelectedId(n.taskId);
                        setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, read: true } : item));
                        setNotificationsOpen(false);
                      }}
                    >
                      <span className={`notification-dot ${n.read ? "read" : "active"}`} />
                      <div className="notification-item-content">
                        <div className="notification-item-header">
                          <strong>{n.title}</strong>
                          <time>{formatDateTime(n.createdAt)}</time>
                        </div>
                        <p>{n.message}</p>
                        <div className="notification-item-tags">
                          <span className="task-ref-tag">{n.taskId}</span>
                          <span className="sms-sent-tag">
                            <Check size={11} /> SMS Dispatched ({n.recipientPhone})
                          </span>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}
        </header>

        <main>
          {activeTab === "personal" ? (
            <PersonalSpace
              tasks={tasks}
              users={users}
              currentUser={currentUser}
              isManager={isEditingManager || currentRole === "administrator"}
              onOpenTask={(task) => setSelectedId(task.id)}
            />
          ) : (
            <>
          <div className="page-head">
            <div>
              <span className="eyebrow">{roleLabel(currentRole).toUpperCase()} DESK</span>
              <h1>
                {currentRole === "brand" ? "Brand Workspace" :
                 currentRole === "content" ? "Content Scripts" :
                 currentRole === "edit" || currentRole === "video" ? "Video Production" :
                 currentRole === "performance" ? "Performance Go-Live" :
                 "Operations Overview"}
              </h1>
            </div>

            {/* Only Brand and Admin have the permission to create new briefs */}
            {(currentRole === "brand" || currentRole === "administrator") && (
              <button className="button primary new-brief" onClick={() => setModalOpen(true)}>
                <Plus size={16} />New brief
              </button>
            )}

            {/* Video team quick submission matching PlixSheetAutomation */}
            {(currentRole === "video" || currentRole === "edit" || currentRole === "video_manager") && (
              <button className="button primary new-brief" onClick={() => setSubmitVideoModalOpen(true)}>
                <Video size={16} />Submit Video
              </button>
            )}
          </div>

          {/* Toolbar */}
          <section className="toolbar panel">
            <div className="queue-tabs">
              <button className={brief === "all" ? "active" : ""} onClick={() => setBrief("all")}>All</button>
              <button className={brief === "video" ? "active" : ""} onClick={() => setBrief("video")}>Video</button>
              <button className={brief === "ai" ? "active" : ""} onClick={() => setBrief("ai")}>AI</button>
              <button className={brief === "joyun" ? "active" : ""} onClick={() => setBrief("joyun")}>Joyun</button>
              <button className={brief === "global" ? "active" : ""} onClick={() => setBrief("global")}>Global</button>
              <button className={brief === "b2g2" ? "active" : ""} onClick={() => setBrief("b2g2")}>B2G2</button>
            </div>

            <div className="filter">
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="all">All priorities</option>
                {["P0", "P1", "P2", "R0"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="filter">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All statuses</option>
                {columns.map(([val, lbl]) => <option value={val} key={val}>{lbl}</option>)}
              </select>
            </div>

            <span className="result-count">{filtered.length} {brief === "all" ? "total" : brief} briefs</span>

            {!isBrandTeam && (
              <div className="view-toggle">
                <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={18} />List</button>
                <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><LayoutDashboard size={18} />Board</button>
              </div>
            )}
          </section>

          {/* Brand Team: Folder Explorer / Other Teams (Video, Content, Perf, Admin): Kanban Board or List */}
          {isBrandTeam ? (
            <BrandFolderView
              tasks={filtered}
              onOpen={(t) => setSelectedId(t.id)}
              onCreateBrief={() => setModalOpen(true)}
              writers={writers}
              users={users}
              onAssign={assignWriter}
            />
          ) : view === "board" ? (
            <Board
              tasks={filtered}
              columns={columns}
              writers={writers}
              editors={editors}
              users={users}
              canAssignEditor={isEditingManager || currentRole === "administrator"}
              onOpen={(t) => setSelectedId(t.id)}
              onAssign={assignWriter}
              onAssignEditor={assignEditor}
            />
          ) : (
            <TaskList
              tasks={filtered}
              writers={writers}
              editors={editors}
              users={users}
              canAssignEditor={isEditingManager || currentRole === "administrator"}
              onOpen={(t) => setSelectedId(t.id)}
              onAssign={assignWriter}
              onAssignEditor={assignEditor}
            />
          )}
            </>
          )}
        </main>
      </div>

      {/* Slide-out Drawer */}
      <Drawer
        task={selected}
        role={currentRole}
        users={users}
        writers={writers}
        editors={editors}
        canAssignEditor={isEditingManager || currentRole === "administrator"}
        isManager={isEditingManager || Boolean(currentUser?.isTeamLead)}
        isAdmin={currentRole === "administrator"}
        onClose={() => setSelectedId(null)}
        onAssign={assignWriter}
        onAssignEditor={assignEditor}
        onSubmitScript={handleSubmitScript}
        onSubmitVideo={handleSubmitVideo}
        onSubmitFinalVideo={handleSubmitFinalVideo}
        onGoLive={handleGoLive}
        onBrandDecision={handleBrandDecision}
        onReleaseDraftBrief={handleReleaseDraftBrief}
        viewerId={currentUser?.id}
      />

      {/* Modal for Creating Brief */}
      {modalOpen && <NewBriefModal onClose={() => setModalOpen(false)} onSubmit={handleCreateBrief} />}

      {/* Modal for Video Team Quick Submission */}
      {submitVideoModalOpen && (
        <SubmitVideoModal
          tasks={filtered}
          onClose={() => setSubmitVideoModalOpen(false)}
          onSubmit={(task, videoUrl, comment) => handleSubmitVideo(task, videoUrl, comment)}
        />
      )}

      {/* Toast Notification */}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}
