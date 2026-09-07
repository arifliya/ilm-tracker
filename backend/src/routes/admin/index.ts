import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import classesRoutes from "./classes";
import staffRoutes from "./staff";
import studentsParentsRoutes from "./studentsParents";
import userAccountsRoutes from "./userAccounts";
import guardiansRoutes from "./guardians";
import rolesRoutes from "./roles";
import reportsRoutes from "./reports";
import bulkUploadRoutes from "./bulkUpload";

// Split by concern (was one 2000+ line admin.ts) — each sub-router still
// registers its routes at the exact same paths as before, just grouped by
// resource instead of interleaved in one file. Mounted at "/" on each since
// every original path was already relative to /api/admin (this router's own
// mount point in app.ts).
const router = new Hono<AppEnv>();

router.route("/", classesRoutes);
router.route("/", staffRoutes);
router.route("/", studentsParentsRoutes);
router.route("/", userAccountsRoutes);
router.route("/", guardiansRoutes);
router.route("/", rolesRoutes);
router.route("/", reportsRoutes);
router.route("/", bulkUploadRoutes);

export default router;
