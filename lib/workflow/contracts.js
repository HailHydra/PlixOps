import { z } from "zod";

/**
 * PlixOps Contracted Handoff Schemas
 * Strictly validates data delivered between teams.
 */

// Contract 1: Brand Intake -> Content Scripting
export const CreateBriefSchema = z.object({
  id: z.string().min(3).max(50).optional(),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(240),
  hookName: z.string().trim().min(2, "Hook Name is required").max(200),
  product: z.string().trim().min(2, "Product name is required"),
  category: z.enum(["Hair", "Skin", "Nutra", "Joyun", "B2G2"], {
    errorMap: () => ({ message: "Select a valid category: Hair, Skin, Nutra, Joyun, or B2G2" }),
  }),
  contentType: z.string().trim().min(1, "Content Type is required"),
  briefType: z.enum(["video", "ai"]).default("video"),
  priority: z.enum(["P0", "P1", "P2", "R0"]).default("P1"),
  platform: z.string().default("Instagram"),
  summary: z.string().max(10000).default(""),
  referenceUrls: z.array(z.string().url()).optional().default([]),
  asDraft: z.boolean().optional().default(false),
  brandOwnerId: z.string().optional().nullable(),
  creatorId: z.string().optional().nullable(),
});

// Assignment Schema
export const AssignTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  scriptOwnerId: z.string().optional().nullable(),
  contentOwnerId: z.string().optional().nullable(),
  editorId: z.string().optional().nullable(),
  brandOwnerId: z.string().optional().nullable(),
});

// Contract 2: Content Team -> Brand Script Approval
export const SubmitScriptSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  hookName: z.string().trim().min(2, "Hook Name is required").max(200),
  scriptUrl: z
    .string()
    .url("A valid URL is required")
    .regex(/^https:\/\/docs\.google\.com\/document\//, "Script must be a docs.google.com/document/ link"),
  comment: z.string().max(4000).optional().default(""),
});

// Contract 3: Brand Script Approval / Request Changes Decision
export const ScriptDecisionSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  decision: z.enum(["approved", "changes_requested"]),
  comment: z.string().max(4000).optional().default(""),
});

// Contract 4: Video Team -> Brand Video Review
export const SubmitVideoSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  videoUrl: z
    .string()
    .url("A valid URL is required")
    .regex(/^https:\/\/drive\.google\.com\//, "Video cut must be a drive.google.com link"),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  version: z.number().int().positive().default(1),
  comment: z.string().max(4000).optional().default(""),
});

// Contract 5: Brand Video Review Decision
export const VideoDecisionSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  decision: z.enum(["approved", "changes_requested"]),
  comment: z.string().max(4000).optional().default(""),
});

// Contract 6: Performance Team -> Go-Live Confirmation
export const GoLiveSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  liveUrl: z
    .string()
    .url("Live URL must be a valid URL")
    .regex(/^https:\/\//, "Live URL must start with https://"),
  campaignId: z.string().trim().optional().default(""),
  adSetId: z.string().trim().optional().default(""),
  utmSource: z.string().trim().optional().default("meta"),
  utmCampaign: z.string().trim().optional().default(""),
  comment: z.string().max(4000).optional().default(""),
});

