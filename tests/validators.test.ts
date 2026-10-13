import { describe, expect, it } from "vitest";
import { aiAssistSchema, apiAiSummarySchema } from "@/lib/validators/ai";
import { loginSchema } from "@/lib/validators/auth";
import { checkoutSchema } from "@/lib/validators/billing";
import { formatIssues } from "@/lib/validators/common";
import { addMemberSchema } from "@/lib/validators/team";
import {
  createCommentSchema,
  createTicketSchema,
  ticketFiltersSchema,
  updateTicketSchema,
} from "@/lib/validators/tickets";

const uuid = "4f1c2b8e-9d3a-4e5f-8a7b-1c2d3e4f5a6b";

describe("loginSchema", () => {
  it("normalises email case and whitespace", () => {
    expect(loginSchema.parse({ email: "  Olivia@Northwind.TEST ", password: "x" }).email).toBe("olivia@northwind.test");
  });

  it("rejects invalid emails and empty passwords", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("createTicketSchema", () => {
  const valid = {
    subject: "Checkout broken",
    description: "Customers see a 500",
    requesterName: "Dana",
    requesterEmail: "dana@example.com",
  };

  it("applies defaults and treats an empty assignee as unassigned", () => {
    const parsed = createTicketSchema.parse({ ...valid, assigneeId: "" });
    expect(parsed.priority).toBe("normal");
    expect(parsed.assigneeId).toBeUndefined();
  });

  it("rejects short subjects, unknown priorities and malformed assignee ids", () => {
    expect(createTicketSchema.safeParse({ ...valid, subject: "Hi" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...valid, priority: "critical" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...valid, assigneeId: "42" }).success).toBe(false);
  });

  it("produces readable issue paths", () => {
    const result = createTicketSchema.safeParse({ ...valid, requesterEmail: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) expect(formatIssues(result.error)).toEqual([{ path: "requesterEmail", message: "Enter a valid email address" }]);
  });
});

describe("updateTicketSchema", () => {
  it("requires at least one field", () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(false);
  });

  it("maps an empty assignee to null (unassign)", () => {
    expect(updateTicketSchema.parse({ assigneeId: "" }).assigneeId).toBeNull();
    expect(updateTicketSchema.parse({ status: "resolved" })).toEqual({ status: "resolved" });
  });
});

describe("createCommentSchema", () => {
  it("coerces HTML checkbox values", () => {
    expect(createCommentSchema.parse({ body: "Hi", isInternal: "on" }).isInternal).toBe(true);
    expect(createCommentSchema.parse({ body: "Hi", isInternal: null }).isInternal).toBe(false);
  });

  it("rejects blank bodies", () => {
    expect(createCommentSchema.safeParse({ body: "   " }).success).toBe(false);
  });
});

describe("ticketFiltersSchema", () => {
  it("coerces query-string values and ignores blanks", () => {
    expect(ticketFiltersSchema.parse({ status: "", page: "2", pageSize: "50", assignee: "me" })).toEqual({
      page: 2,
      pageSize: 50,
      assignee: "me",
    });
  });

  it("caps page size and rejects unknown statuses", () => {
    expect(ticketFiltersSchema.safeParse({ pageSize: "500" }).success).toBe(false);
    expect(ticketFiltersSchema.safeParse({ status: "archived" }).success).toBe(false);
  });
});

describe("team, billing and AI schemas", () => {
  it("validates member invites", () => {
    expect(addMemberSchema.safeParse({ email: "sam@x.io", name: "Sam", role: "agent" }).success).toBe(true);
    expect(addMemberSchema.safeParse({ email: "sam@x.io", name: "Sam", role: "superuser" }).success).toBe(false);
  });

  it("only allows paid plans at checkout", () => {
    expect(checkoutSchema.safeParse({ plan: "pro" }).success).toBe(true);
    expect(checkoutSchema.safeParse({ plan: "free" }).success).toBe(false);
  });

  it("defaults AI tasks to summary", () => {
    expect(aiAssistSchema.parse({})).toEqual({ task: "summary" });
    expect(apiAiSummarySchema.parse({ ticketId: uuid })).toEqual({ ticketId: uuid, task: "summary", stream: false });
    expect(apiAiSummarySchema.safeParse({ ticketId: "abc" }).success).toBe(false);
  });
});
