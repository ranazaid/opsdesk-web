/**
 * Domain vocabulary shared by the database schema, validators, server code and
 * client components. Kept dependency-free so it can be imported anywhere.
 */

export const ROLES = ["owner", "admin", "agent", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const PLANS = ["free", "pro", "business"] as const;
export type Plan = (typeof PLANS)[number];

export const AI_TASKS = ["summary", "reply"] as const;
export type AiTask = (typeof AI_TASKS)[number];

/** Platforms that can register a push token (mobile companion app). */
export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  agent: "Agent",
  viewer: "Viewer",
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};
