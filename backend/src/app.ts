import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import parentRoutes from "./routes/parent";
import teacherRoutes from "./routes/teacher";
import studentRoutes from "./routes/student";
import systemAdminRoutes from "./routes/systemAdmin";
import featuresRoutes from "./routes/features";
import notificationsRoutes from "./routes/notifications";
import notesRoutes from "./routes/notes";

export const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.get("/", (_req, res) => {
  res.json({ message: "ilm backend running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/system-admin", systemAdminRoutes);
app.use("/api/features", featuresRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/notes", notesRoutes);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});
