import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import { authMiddleware, requireRole } from "../../middleware/auth";

const router = new Hono<AppEnv>();

interface IdRow {
  id: number;
}

interface RoleRow {
  id: number;
  name: string;
}

/* ============================================================
   GET ALL ROLES
   ============================================================ */
router.get("/roles", authMiddleware, requireRole("admin", "owner", "maintainer", "system_admin"), async c => {
  const { rows } = await c.get("db").query<RoleRow>("SELECT id, name FROM roles ORDER BY name ASC");
  return c.json(rows);
});

/* ============================================================
   ADD NEW ROLE
   `roles` is a platform-wide table, not school-scoped — unlike GET
   /roles above (read-only, used by every dashboard to populate a "grant
   role" dropdown), creating one is restricted to the two roles that
   actually manage the platform's role catalog. An "owner" is scoped to
   their own school and has no product UI for this (only
   Maintainer/System Admin dashboards call this route), so including it
   here would let a single school's owner create roles visible platform-
   wide with no legitimate use case exercising that access.
   ============================================================ */
router.post("/roles/add", authMiddleware, requireRole("maintainer", "system_admin"), async c => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));
  const name = (body?.name || "").toString().trim().toLowerCase();

  if (!name) {
    return c.json({ success: false, message: "Role name cannot be empty" });
  }

  if (!/^[a-z][a-z0-9_-]{1,49}$/.test(name)) {
    return c.json({
      success: false,
      message: "Role name must start with a letter and contain only lowercase letters, numbers, hyphens, or underscores"
    });
  }

  const { rows: existing } = await db.query<IdRow>("SELECT id FROM roles WHERE name = $1", [name]);

  if (existing.length > 0) {
    return c.json({ success: false, message: "A role with this name already exists" });
  }

  await db.query("INSERT INTO roles (name) VALUES ($1)", [name]);

  return c.json({ success: true, message: "Role added successfully" });
});


export default router;
