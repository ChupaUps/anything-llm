jest.mock("../../utils/prisma", () => ({
  memories: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const prisma = require("../../utils/prisma");
const { Memory } = require("../../models/memory");

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Validations
// ---------------------------------------------------------------------------
describe("Memory.validations", () => {
  describe("id", () => {
    it("accepts an integer", () => {
      expect(Memory.validations.id(1)).toBe(1);
    });

    it("coerces a numeric string", () => {
      expect(Memory.validations.id("5")).toBe(5);
    });

    it("throws on non-integer", () => {
      expect(() => Memory.validations.id("abc")).toThrow();
      expect(() => Memory.validations.id(1.5)).toThrow();
    });
  });

  describe("userId", () => {
    it("returns null for null or undefined", () => {
      expect(Memory.validations.userId(null)).toBeNull();
      expect(Memory.validations.userId(undefined)).toBeNull();
      expect(Memory.validations.userId()).toBeNull();
    });

    it("coerces a valid value to int", () => {
      expect(Memory.validations.userId(3)).toBe(3);
      expect(Memory.validations.userId("7")).toBe(7);
    });
  });

  describe("workspaceId", () => {
    it("returns null for null or undefined", () => {
      expect(Memory.validations.workspaceId(null)).toBeNull();
      expect(Memory.validations.workspaceId(undefined)).toBeNull();
      expect(Memory.validations.workspaceId()).toBeNull();
    });

    it("coerces a valid value to int", () => {
      expect(Memory.validations.workspaceId(10)).toBe(10);
    });
  });

  describe("scope", () => {
    it("accepts valid scopes", () => {
      expect(Memory.validations.scope("workspace")).toBe("workspace");
      expect(Memory.validations.scope("global")).toBe("global");
    });

    it("defaults to workspace", () => {
      expect(Memory.validations.scope()).toBe("workspace");
    });

    it("throws on invalid scope", () => {
      expect(() => Memory.validations.scope("invalid")).toThrow();
    });
  });

  describe("content", () => {
    it("accepts a non-empty string", () => {
      expect(Memory.validations.content("hello")).toBe("hello");
    });

    it("throws on empty or whitespace-only string", () => {
      expect(() => Memory.validations.content("")).toThrow();
      expect(() => Memory.validations.content("   ")).toThrow();
    });

    it("throws on non-string", () => {
      expect(() => Memory.validations.content(123)).toThrow();
      expect(() => Memory.validations.content(null)).toThrow();
    });
  });

  describe("source", () => {
    it("accepts user and auto", () => {
      expect(Memory.validations.source("user")).toBe("user");
      expect(Memory.validations.source("auto")).toBe("auto");
    });

    it("defaults to auto", () => {
      expect(Memory.validations.source()).toBe("auto");
    });

    it("throws on an unknown source", () => {
      expect(() => Memory.validations.source("manual")).toThrow();
    });
  });

  describe("pinned", () => {
    it("coerces to boolean", () => {
      expect(Memory.validations.pinned(true)).toBe(true);
      expect(Memory.validations.pinned(1)).toBe(true);
      expect(Memory.validations.pinned()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// limits / expiresAt
// ---------------------------------------------------------------------------
describe("Memory.limits", () => {
  it("exposes capacity and TTL to clients", () => {
    expect(Memory.limits()).toEqual({
      global: Memory.GLOBAL_LIMIT,
      workspace: Memory.WORKSPACE_LIMIT,
      ttlDays: Memory.TTL_DAYS,
    });
  });

  it("keeps global capacity at least at the legacy default", () => {
    expect(Memory.GLOBAL_LIMIT).toBeGreaterThanOrEqual(5);
    expect(Memory.WORKSPACE_LIMIT).toBeGreaterThanOrEqual(5);
  });
});

describe("Memory.expiresAt", () => {
  it("returns null for a pinned memory", () => {
    expect(
      Memory.expiresAt({ pinned: true, lastUsedAt: new Date() })
    ).toBeNull();
    expect(Memory.expiresAt(null)).toBeNull();
  });

  it("anchors expiry on the most recent activity", () => {
    const lastUsedAt = new Date("2026-01-10T00:00:00.000Z");
    const expiresAt = Memory.expiresAt({
      pinned: false,
      lastUsedAt,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2025-12-01T00:00:00.000Z"),
    });

    expect(expiresAt.getTime() - lastUsedAt.getTime()).toBe(
      Memory.TTL_DAYS * 24 * 60 * 60 * 1000
    );
  });
});

// ---------------------------------------------------------------------------
// forUserWorkspace
// ---------------------------------------------------------------------------
describe("Memory.forUserWorkspace", () => {
  it("queries workspace-scoped memories ordered by createdAt desc", async () => {
    const fakeMemories = [{ id: 2 }, { id: 1 }];
    prisma.memories.findMany.mockResolvedValue(fakeMemories);

    const result = await Memory.forUserWorkspace(1, 5);
    expect(result).toEqual(fakeMemories);
    expect(prisma.memories.findMany).toHaveBeenCalledWith({
      where: { userId: 1, workspaceId: 5, scope: "workspace" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns empty array on error", async () => {
    prisma.memories.findMany.mockRejectedValue(new Error("db error"));
    const result = await Memory.forUserWorkspace(1, 5);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// globalForUser
// ---------------------------------------------------------------------------
describe("Memory.globalForUser", () => {
  it("queries global-scoped memories", async () => {
    const fakeMemories = [{ id: 1, scope: "global" }];
    prisma.memories.findMany.mockResolvedValue(fakeMemories);

    const result = await Memory.globalForUser(1);
    expect(result).toEqual(fakeMemories);
    expect(prisma.memories.findMany).toHaveBeenCalledWith({
      where: { userId: 1, scope: "global" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns empty array on error", async () => {
    prisma.memories.findMany.mockRejectedValue(new Error("db error"));
    const result = await Memory.globalForUser(1);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// allForUser
// ---------------------------------------------------------------------------
describe("Memory.allForUser", () => {
  it("lists both scopes for the user, pinned first, with the workspace relation", async () => {
    const fakeMemories = [{ id: 1, scope: "global" }];
    prisma.memories.findMany.mockResolvedValue(fakeMemories);

    const result = await Memory.allForUser(1);
    expect(result).toEqual(fakeMemories);
    expect(prisma.memories.findMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      include: { workspace: { select: { id: true, name: true, slug: true } } },
    });
  });

  it("scopes to unowned memories in single-user mode", async () => {
    prisma.memories.findMany.mockResolvedValue([]);
    await Memory.allForUser(null);
    expect(prisma.memories.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: null } })
    );
  });

  it("returns an empty array on error", async () => {
    prisma.memories.findMany.mockRejectedValue(new Error("db error"));
    expect(await Memory.allForUser(1)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
describe("Memory.create", () => {
  it("creates a workspace memory when under limit", async () => {
    prisma.memories.count.mockResolvedValue(0);
    const fakeMemory = { id: 1, content: "test", scope: "workspace" };
    prisma.memories.create.mockResolvedValue(fakeMemory);

    const { memory, message } = await Memory.create({
      userId: 1,
      workspaceId: 2,
      scope: "workspace",
      content: "test",
    });

    expect(memory).toEqual(fakeMemory);
    expect(message).toBeNull();
  });

  it("rejects when workspace limit is reached", async () => {
    prisma.memories.count.mockResolvedValue(Memory.WORKSPACE_LIMIT);

    const { memory, message } = await Memory.create({
      userId: 1,
      workspaceId: 2,
      scope: "workspace",
      content: "test",
    });

    expect(memory).toBeNull();
    expect(message).toMatch(/limit/i);
    expect(prisma.memories.create).not.toHaveBeenCalled();
  });

  it("rejects when global limit is reached", async () => {
    prisma.memories.count.mockResolvedValue(Memory.GLOBAL_LIMIT);

    const { memory, message } = await Memory.create({
      userId: 1,
      scope: "global",
      content: "test",
    });

    expect(memory).toBeNull();
    expect(message).toMatch(/limit/i);
    expect(prisma.memories.create).not.toHaveBeenCalled();
  });

  it("returns error message on prisma failure", async () => {
    prisma.memories.count.mockResolvedValue(0);
    prisma.memories.create.mockRejectedValue(new Error("unique constraint"));

    const { memory, message } = await Memory.create({
      userId: 1,
      workspaceId: 2,
      content: "test",
    });

    expect(memory).toBeNull();
    expect(message).toBe("unique constraint");
  });

  it("persists the source and defaults it to user", async () => {
    prisma.memories.count.mockResolvedValue(0);
    prisma.memories.create.mockResolvedValue({ id: 1 });

    await Memory.create({ userId: 1, scope: "global", content: "fact" });
    await Memory.create({
      userId: 1,
      scope: "global",
      source: "auto",
      content: "fact",
    });

    const [first, second] = prisma.memories.create.mock.calls;
    expect(first[0].data.source).toBe("user");
    expect(second[0].data.source).toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
describe("Memory.update", () => {
  it("updates content by id", async () => {
    const updated = { id: 1, content: "new content" };
    prisma.memories.update.mockResolvedValue(updated);

    const { memory, message } = await Memory.update(1, {
      content: "new content",
    });

    expect(memory).toEqual(updated);
    expect(message).toBeNull();
    expect(prisma.memories.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ content: "new content" }),
    });
  });

  it("returns error on invalid content", async () => {
    const { memory, message } = await Memory.update(1, { content: "" });
    expect(memory).toBeNull();
    expect(message).toBeTruthy();
  });

  it("returns error on prisma failure", async () => {
    prisma.memories.update.mockRejectedValue(new Error("not found"));
    const { memory, message } = await Memory.update(999, {
      content: "test",
    });
    expect(memory).toBeNull();
    expect(message).toBe("not found");
  });

  it("marks an edited memory as user-authored", async () => {
    prisma.memories.update.mockResolvedValue({ id: 1 });
    await Memory.update(1, { content: "refined fact" });

    const [{ data }] = prisma.memories.update.mock.calls[0];
    expect(data.source).toBe("user");
    expect(data.updatedAt).toBeInstanceOf(Date);
  });

  it("updates only the pinned flag without touching content", async () => {
    const updated = { id: 1, content: "fact", pinned: true };
    prisma.memories.update.mockResolvedValue(updated);

    const { memory } = await Memory.update(1, { pinned: true });
    expect(memory).toEqual(updated);

    const [{ where, data }] = prisma.memories.update.mock.calls[0];
    expect(where).toEqual({ id: 1 });
    expect(data.pinned).toBe(true);
    expect(data).not.toHaveProperty("content");
    expect(data).not.toHaveProperty("source");
  });

  it("rejects an empty update payload", async () => {
    const { memory, message } = await Memory.update(1, {});
    expect(memory).toBeNull();
    expect(message).toMatch(/nothing to update/i);
    expect(prisma.memories.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------
describe("Memory.delete", () => {
  it("returns true on success", async () => {
    prisma.memories.delete.mockResolvedValue({});
    expect(await Memory.delete(1)).toBe(true);
    expect(prisma.memories.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it("returns false on error", async () => {
    prisma.memories.delete.mockRejectedValue(new Error("not found"));
    expect(await Memory.delete(999)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteExpired
// ---------------------------------------------------------------------------
describe("Memory.deleteExpired", () => {
  it("deletes only stale non-pinned memories", async () => {
    prisma.memories.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.memories.deleteMany.mockResolvedValue({ count: 2 });

    const deleted = await Memory.deleteExpired(30);
    expect(deleted).toBe(2);

    const [{ where }] = prisma.memories.findMany.mock.calls[0];
    expect(where.pinned).toBe(false);
    expect(where.AND).toHaveLength(2);
    expect(prisma.memories.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
    });
  });

  it("skips the query when the TTL is disabled", async () => {
    expect(await Memory.deleteExpired(0)).toBe(0);
    expect(prisma.memories.findMany).not.toHaveBeenCalled();
    expect(prisma.memories.deleteMany).not.toHaveBeenCalled();
  });

  it("does not call deleteMany when nothing expired", async () => {
    prisma.memories.findMany.mockResolvedValue([]);
    expect(await Memory.deleteExpired(30)).toBe(0);
    expect(prisma.memories.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 0 on error", async () => {
    prisma.memories.findMany.mockRejectedValue(new Error("db error"));
    expect(await Memory.deleteExpired(30)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// promoteToGlobal
// ---------------------------------------------------------------------------
describe("Memory.promoteToGlobal", () => {
  it("promotes a workspace memory to global", async () => {
    const existing = { id: 1, userId: 1, scope: "workspace" };
    prisma.memories.findUnique.mockResolvedValue(existing);
    prisma.memories.count.mockResolvedValue(0);
    const promoted = { ...existing, scope: "global", workspaceId: null };
    prisma.memories.update.mockResolvedValue(promoted);

    const { memory, message } = await Memory.promoteToGlobal(1);
    expect(memory.scope).toBe("global");
    expect(message).toBeNull();
  });

  it("returns message if memory not found", async () => {
    prisma.memories.findUnique.mockResolvedValue(null);
    const { memory, message } = await Memory.promoteToGlobal(999);
    expect(memory).toBeNull();
    expect(message).toMatch(/not found/i);
  });

  it("returns existing memory if already global", async () => {
    const existing = { id: 1, scope: "global" };
    prisma.memories.findUnique.mockResolvedValue(existing);

    const { memory, message } = await Memory.promoteToGlobal(1);
    expect(memory).toEqual(existing);
    expect(message).toMatch(/already global/i);
  });

  it("rejects when global limit is reached", async () => {
    const existing = { id: 1, userId: 1, scope: "workspace" };
    prisma.memories.findUnique.mockResolvedValue(existing);
    prisma.memories.count.mockResolvedValue(Memory.GLOBAL_LIMIT);

    const { memory, message } = await Memory.promoteToGlobal(1);
    expect(memory).toBeNull();
    expect(message).toMatch(/limit/i);
  });
});

// ---------------------------------------------------------------------------
// demoteToWorkspace
// ---------------------------------------------------------------------------
describe("Memory.demoteToWorkspace", () => {
  it("demotes a global memory to workspace scope", async () => {
    const existing = { id: 1, userId: 1, scope: "global" };
    prisma.memories.findUnique.mockResolvedValue(existing);
    prisma.memories.count.mockResolvedValue(0);
    const demoted = { ...existing, scope: "workspace", workspaceId: 5 };
    prisma.memories.update.mockResolvedValue(demoted);

    const { memory, message } = await Memory.demoteToWorkspace(1, 5);
    expect(memory.scope).toBe("workspace");
    expect(memory.workspaceId).toBe(5);
    expect(message).toBeNull();
  });

  it("returns message if memory not found", async () => {
    prisma.memories.findUnique.mockResolvedValue(null);
    const { memory, message } = await Memory.demoteToWorkspace(999, 5);
    expect(memory).toBeNull();
    expect(message).toMatch(/not found/i);
  });

  it("returns existing memory if already workspace-scoped", async () => {
    const existing = { id: 1, scope: "workspace" };
    prisma.memories.findUnique.mockResolvedValue(existing);

    const { memory, message } = await Memory.demoteToWorkspace(1, 5);
    expect(memory).toEqual(existing);
    expect(message).toMatch(/already workspace/i);
  });

  it("rejects when workspace limit is reached", async () => {
    const existing = { id: 1, userId: 1, scope: "global" };
    prisma.memories.findUnique.mockResolvedValue(existing);
    prisma.memories.count.mockResolvedValue(Memory.WORKSPACE_LIMIT);

    const { memory, message } = await Memory.demoteToWorkspace(1, 5);
    expect(memory).toBeNull();
    expect(message).toMatch(/limit/i);
  });
});

// ---------------------------------------------------------------------------
// updateLastUsed
// ---------------------------------------------------------------------------
describe("Memory.updateLastUsed", () => {
  it("updates lastUsedAt for the given ids", async () => {
    prisma.memories.updateMany.mockResolvedValue({ count: 2 });
    await Memory.updateLastUsed([1, 2]);
    expect(prisma.memories.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
    });
  });

  it("no-ops on empty array", async () => {
    await Memory.updateLastUsed([]);
    expect(prisma.memories.updateMany).not.toHaveBeenCalled();
  });

  it("no-ops when called with no arguments", async () => {
    await Memory.updateLastUsed();
    expect(prisma.memories.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// touch
// ---------------------------------------------------------------------------
describe("Memory.touch", () => {
  it("stamps every injected memory and bumps its use count", async () => {
    prisma.memories.updateMany.mockResolvedValue({ count: 3 });

    await Memory.touch([1, 2, 3]);
    expect(prisma.memories.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 3] } },
      data: { lastUsedAt: expect.any(Date), useCount: { increment: 1 } },
    });
  });

  it("ignores an empty list", async () => {
    await Memory.touch([]);
    expect(prisma.memories.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// countForScope
// ---------------------------------------------------------------------------
describe("Memory.countForScope", () => {
  it("counts workspace-scoped memories with workspaceId", async () => {
    prisma.memories.count.mockResolvedValue(5);
    const count = await Memory.countForScope(1, 2, "workspace");
    expect(count).toBe(5);
    expect(prisma.memories.count).toHaveBeenCalledWith({
      where: { userId: 1, scope: "workspace", workspaceId: 2 },
    });
  });

  it("counts global-scoped memories without workspaceId", async () => {
    prisma.memories.count.mockResolvedValue(3);
    const count = await Memory.countForScope(1, null, "global");
    expect(count).toBe(3);
    expect(prisma.memories.count).toHaveBeenCalledWith({
      where: { userId: 1, scope: "global" },
    });
  });

  it("returns 0 on error", async () => {
    prisma.memories.count.mockRejectedValue(new Error("db error"));
    const count = await Memory.countForScope(1, 2, "workspace");
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// replaceWorkspaceMemories
// ---------------------------------------------------------------------------
describe("Memory.replaceWorkspaceMemories", () => {
  let tx;
  beforeEach(() => {
    tx = {
      memories: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction.mockImplementation((cb) => cb(tx));
  });

  it("deletes old memories and creates new ones in a transaction", async () => {
    const result = await Memory.replaceWorkspaceMemories(1, 2, [
      "fact one",
      "fact two",
    ]);
    expect(result).toBe(true);
    expect(tx.memories.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1, workspaceId: 2, scope: "workspace" },
    });
    expect(tx.memories.create).toHaveBeenCalledTimes(2);
  });

  it("caps at WORKSPACE_LIMIT", async () => {
    const tooMany = Array.from({ length: 30 }, (_, i) => `fact ${i}`);
    await Memory.replaceWorkspaceMemories(1, 2, tooMany);
    expect(tx.memories.create).toHaveBeenCalledTimes(Memory.WORKSPACE_LIMIT);
  });

  it("filters out non-string and empty entries", async () => {
    await Memory.replaceWorkspaceMemories(1, 2, [
      "valid",
      "",
      "   ",
      123,
      null,
      "also valid",
    ]);
    expect(tx.memories.create).toHaveBeenCalledTimes(2);
  });

  it("returns false on transaction error", async () => {
    prisma.$transaction.mockRejectedValue(new Error("tx failed"));
    const result = await Memory.replaceWorkspaceMemories(1, 2, ["fact"]);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyExtractedMemories
// ---------------------------------------------------------------------------
describe("Memory.applyExtractedMemories", () => {
  let tx;
  beforeEach(() => {
    tx = {
      memories: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation((cb) => cb(tx));
  });

  it("creates workspace and global memories", async () => {
    const result = await Memory.applyExtractedMemories(1, 2, [
      { content: "ws fact", scope: "WORKSPACE", action: "create" },
      { content: "global fact", scope: "GLOBAL", action: "create" },
    ]);

    expect(result).toEqual({
      workspaceCount: 1,
      globalCount: 1,
      updatedCount: 0,
      evictedCount: 0,
    });
    expect(tx.memories.create).toHaveBeenCalledTimes(2);
    expect(tx.memories.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: "global",
        workspaceId: null,
        source: "auto",
      }),
    });
  });

  it("scopes updates to the current user's workspace or global memories", async () => {
    const result = await Memory.applyExtractedMemories(1, 2, [
      {
        content: "revised",
        scope: "WORKSPACE",
        action: "update",
        updateId: 10,
      },
    ]);

    expect(result.updatedCount).toBe(1);
    expect(tx.memories.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        userId: 1,
        OR: [{ scope: "workspace", workspaceId: 2 }, { scope: "global" }],
      },
      data: expect.objectContaining({ content: "revised", source: "auto" }),
    });
  });

  it("does not count an update whose id belongs to another user or workspace", async () => {
    tx.memories.updateMany.mockResolvedValue({ count: 0 });

    const result = await Memory.applyExtractedMemories(4, 2, [
      {
        content: "attacker replacement",
        scope: "WORKSPACE",
        action: "update",
        updateId: 1,
      },
    ]);

    expect(result.updatedCount).toBe(0);
    expect(tx.memories.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, userId: 4 }),
      })
    );
  });

  it("scopes updates to unowned memories in single-user mode", async () => {
    await Memory.applyExtractedMemories(null, 2, [
      {
        content: "revised",
        scope: "WORKSPACE",
        action: "update",
        updateId: 10,
      },
    ]);

    expect(tx.memories.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 10, userId: null }),
      })
    );
  });

  it("skips updates without a numeric updateId", async () => {
    const result = await Memory.applyExtractedMemories(1, 2, [
      { content: "bad update", scope: "WORKSPACE", action: "update" },
      {
        content: "also bad",
        scope: "WORKSPACE",
        action: "update",
        updateId: "abc",
      },
    ]);

    expect(result.updatedCount).toBe(0);
    expect(tx.memories.updateMany).not.toHaveBeenCalled();
  });

  it("evicts the least-recently-used memory instead of dropping a new fact", async () => {
    tx.memories.count
      .mockResolvedValueOnce(Memory.WORKSPACE_LIMIT)
      .mockResolvedValueOnce(Memory.WORKSPACE_LIMIT - 1)
      .mockResolvedValue(0);
    tx.memories.findMany.mockResolvedValue([
      {
        id: 1,
        lastUsedAt: null,
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
      {
        id: 2,
        lastUsedAt: new Date("2024-06-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ]);
    tx.memories.deleteMany.mockResolvedValue({ count: 1 });

    const result = await Memory.applyExtractedMemories(1, 2, [
      { content: "Fresh fact", scope: "WORKSPACE", action: "create" },
    ]);

    expect(tx.memories.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pinned: false, scope: "workspace" }),
      })
    );
    expect(tx.memories.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
    });
    expect(tx.memories.create).toHaveBeenCalledTimes(1);
    expect(result.workspaceCount).toBe(1);
    expect(result.evictedCount).toBe(1);
  });

  it("drops new memories when the scope is full of pinned memories", async () => {
    tx.memories.count
      .mockResolvedValueOnce(Memory.WORKSPACE_LIMIT)
      .mockResolvedValueOnce(Memory.WORKSPACE_LIMIT)
      .mockResolvedValue(0);
    tx.memories.findMany.mockResolvedValue([]);

    const result = await Memory.applyExtractedMemories(1, 2, [
      { content: "rejected", scope: "WORKSPACE", action: "create" },
    ]);

    expect(result.workspaceCount).toBe(0);
    expect(result.evictedCount).toBe(0);
    expect(tx.memories.create).not.toHaveBeenCalled();
  });

  it("filters out malformed entries", async () => {
    const result = await Memory.applyExtractedMemories(1, 2, [
      null,
      { content: "", scope: "WORKSPACE", action: "create" },
      { content: "valid", scope: "INVALID", action: "create" },
      { content: "also valid", scope: "WORKSPACE", action: "bad" },
      { scope: "WORKSPACE", action: "create" },
      { content: "good", scope: "WORKSPACE", action: "create" },
    ]);

    expect(result.workspaceCount).toBe(1);
    expect(tx.memories.create).toHaveBeenCalledTimes(1);
  });

  it("handles non-array input gracefully", async () => {
    const result = await Memory.applyExtractedMemories(1, 2, null);
    expect(result).toEqual({
      workspaceCount: 0,
      globalCount: 0,
      updatedCount: 0,
      evictedCount: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// evictOldest
// ---------------------------------------------------------------------------
describe("Memory.evictOldest", () => {
  it("deletes the requested number of candidates, oldest activity first", async () => {
    const tx = {
      memories: {
        findMany: jest.fn().mockResolvedValue([
          { id: 3, lastUsedAt: null, updatedAt: new Date("2024-03-01") },
          { id: 1, lastUsedAt: null, updatedAt: new Date("2024-01-01") },
          {
            id: 2,
            lastUsedAt: new Date("2024-05-01"),
            updatedAt: new Date("2024-02-01"),
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const deleted = await Memory.evictOldest(
      tx,
      { userId: 1, scope: "global" },
      2
    );

    expect(deleted).toBe(2);
    expect(tx.memories.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 3] } },
    });
  });

  it("never evicts pinned memories", async () => {
    const tx = {
      memories: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
    };

    expect(await Memory.evictOldest(tx, { userId: 1 }, 5)).toBe(0);
    expect(tx.memories.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pinned: false }),
      })
    );
    expect(tx.memories.deleteMany).not.toHaveBeenCalled();
  });

  it("no-ops when nothing needs evicting", async () => {
    const tx = { memories: { findMany: jest.fn(), deleteMany: jest.fn() } };
    expect(await Memory.evictOldest(tx, {}, 0)).toBe(0);
    expect(tx.memories.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// migrateToMultiUser
// ---------------------------------------------------------------------------
describe("Memory.migrateToMultiUser", () => {
  it("reassigns unowned memories to the admin user", async () => {
    prisma.memories.updateMany.mockResolvedValue({ count: 3 });
    const result = await Memory.migrateToMultiUser(1);
    expect(result).toBe(true);
    expect(prisma.memories.updateMany).toHaveBeenCalledWith({
      where: { userId: null },
      data: { userId: 1 },
    });
  });

  it("returns false on error", async () => {
    prisma.memories.updateMany.mockRejectedValue(new Error("db error"));
    expect(await Memory.migrateToMultiUser(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------
describe("Memory.get", () => {
  it("returns the first matching memory", async () => {
    const fake = { id: 1, content: "test" };
    prisma.memories.findFirst.mockResolvedValue(fake);

    const result = await Memory.get({ id: 1 });
    expect(result).toEqual(fake);
    expect(prisma.memories.findFirst).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it("returns null when no match found", async () => {
    prisma.memories.findFirst.mockResolvedValue(null);
    expect(await Memory.get({ id: 999 })).toBeNull();
  });

  it("returns null on error", async () => {
    prisma.memories.findFirst.mockRejectedValue(new Error("db error"));
    expect(await Memory.get({ id: 1 })).toBeNull();
  });
});
