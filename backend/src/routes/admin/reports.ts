import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import type { DbConnection } from "../../config/db";
import { authMiddleware } from "../../middleware/auth";
import { isFeatureEnabled } from "../../utils/featureFlags";
import { toCsv } from "../../utils/csv";
import { REPORT_ROLES, DATE_RE, todayStr, daysAgoStr, inRequesterScope, getClassSchoolId } from "./shared";

const router = new Hono<AppEnv>();

/* ============================================================
   DOWNLOAD ATTENDANCE REPORT (CSV) — ADMIN / OWNER
   Filters: optional classId (defaults to all classes) and an optional
   date range, which cannot reach further back than 365 days.
   ============================================================ */
interface AttendanceReportRow {
  date: string;
  first_name: string | null;
  surname: string | null;
  class_name: string | null;
  status: string;
}

router.get("/attendance/report", authMiddleware, REPORT_ROLES, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  if (!(await isFeatureEnabled(db, "attendance_report", user.schoolId))) {
    return c.json({ message: "The attendance report feature is currently disabled" }, 403);
  }

  const classIdParam = c.req.query("classId");
  const startDateParam = c.req.query("startDate");
  const endDateParam = c.req.query("endDate");

  const today = todayStr();
  const oneYearAgo = daysAgoStr(365);

  const startDate = typeof startDateParam === "string" && startDateParam ? startDateParam : oneYearAgo;
  const endDate = typeof endDateParam === "string" && endDateParam ? endDateParam : today;

  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return c.json({ message: "Invalid date format, expected YYYY-MM-DD" }, 400);
  }
  if (startDate > endDate) {
    return c.json({ message: "Start date must be before end date" }, 400);
  }
  if (startDate < oneYearAgo) {
    return c.json({ message: "Start date cannot be more than a year ago" }, 400);
  }
  if (endDate > today) {
    return c.json({ message: "End date cannot be in the future" }, 400);
  }

  const classId = classIdParam ? Number(classIdParam) : null;

  if (classId) {
    const classSchoolId = await getClassSchoolId(db, classId);
    if (classSchoolId === null || !inRequesterScope(user, classSchoolId)) {
      return c.json({ message: "Class not found" }, 404);
    }
  }

  const params: any[] = [startDate, endDate];
  let classFilter = "";
  if (classId) {
    classFilter = "AND a.class_id = $3";
    params.push(classId);
  } else {
    classFilter = "AND c.school_id = $3";
    params.push(user.schoolId);
  }

  const { rows } = await db.query<AttendanceReportRow>(
    `SELECT
       TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
       s.first_name,
       s.surname,
       c.class_name,
       a.status
     FROM attendance a
     JOIN students s ON s.id = a.student_id
     JOIN classes c ON c.id = a.class_id
     WHERE a.date BETWEEN $1 AND $2 ${classFilter}
     ORDER BY c.class_name ASC, a.date ASC, s.first_name ASC, s.surname ASC`,
    params
  );

  const csv = toCsv(
    ["Date", "First Name", "Last Name", "Class", "Attendance"],
    rows.map(r => [r.date, r.first_name, r.surname, r.class_name, r.status === "PRESENT" ? "Present" : "Absent"])
  );

  return c.text(csv, 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="attendance_report_${startDate}_to_${endDate}.csv"`
  });
});

/* ============================================================
   ANALYTICS DASHBOARD
   Attendance trend + students-per-class, behind the
   "analytics_dashboard" flag. The attendance trend range is either the
   school's current term (school_terms row covering today) or a trailing
   365-day window — no academic-year concept exists in this schema, so
   "year" means the last 365 days, not a calendar/school year.

   Fees trend is a separate chart, gated by its own "fees" flag (a school
   can have analytics on without fees, or vice versa) — collected vs
   outstanding amounts either per fee_period ("month") or summed by
   calendar year of the period's start_date ("year").
   ============================================================ */
interface TermDatesRow {
  name: string;
  start_date: string;
  end_date: string;
}

// TO_CHAR'd rather than left as the driver's native Date parse for
// start_date/end_date (DATE columns) — every caller treats these as plain
// YYYY-MM-DD strings (lexicographic comparisons against `today`, direct
// reuse as query params), same reasoning as the attendance report query
// above.
const resolveCurrentTerm = async (db: DbConnection, schoolId: number, today: string): Promise<TermDatesRow | null> => {
  const { rows } = await db.query<TermDatesRow>(
    `SELECT name, TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date
     FROM school_terms
     WHERE school_id = $1 AND start_date <= $2 AND end_date >= $3
     ORDER BY start_date ASC LIMIT 1`,
    [schoolId, today, today]
  );
  return rows[0] ?? null;
};

// Postgres returns SUM(...)/COUNT(*) as strings in the driver's default row
// mode, not numbers.
interface AttendanceTrendRow {
  date: string;
  present_count: string;
  total_count: string;
}

interface ClassCountRow {
  class_id: number;
  class_name: string | null;
  student_count: string;
}

interface FeesTrendRow {
  label: string;
  collected: string;
  outstanding: string;
}

router.get("/analytics", authMiddleware, REPORT_ROLES, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const schoolId = user.schoolId;

  if (!(await isFeatureEnabled(db, "analytics_dashboard", schoolId))) {
    return c.json({ message: "The analytics dashboard feature is currently disabled" }, 403);
  }

  const rangeParam = c.req.query("range");
  const range = typeof rangeParam === "string" ? rangeParam : "term";
  if (range !== "term" && range !== "year") {
    return c.json({ message: "range must be 'term' or 'year'" }, 400);
  }

  const feesRangeParam = c.req.query("feesRange");
  const feesRange = typeof feesRangeParam === "string" ? feesRangeParam : "month";
  if (feesRange !== "month" && feesRange !== "year") {
    return c.json({ message: "feesRange must be 'month' or 'year'" }, 400);
  }

  const today = todayStr();
  let rangeStart: string;
  let rangeEnd: string;
  let termName: string | null = null;

  if (range === "year") {
    rangeStart = daysAgoStr(365);
    rangeEnd = today;
  } else {
    const term = await resolveCurrentTerm(db, schoolId!, today);
    if (term) {
      rangeStart = term.start_date;
      rangeEnd = term.end_date < today ? term.end_date : today;
      termName = term.name;
    } else {
      rangeStart = daysAgoStr(30);
      rangeEnd = today;
    }
  }

  const { rows: attendanceRows } = await db.query<AttendanceTrendRow>(
    `SELECT
       TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
       SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_count,
       COUNT(*) AS total_count
     FROM attendance a
     JOIN classes c ON c.id = a.class_id
     WHERE c.school_id = $1 AND a.date BETWEEN $2 AND $3
     GROUP BY a.date
     ORDER BY a.date ASC`,
    [schoolId, rangeStart, rangeEnd]
  );

  const { rows: classRows } = await db.query<ClassCountRow>(
    `SELECT c.id AS class_id, c.class_name, COUNT(sc.student_id) AS student_count
     FROM classes c
     LEFT JOIN student_classes sc ON sc.class_id = c.id
     WHERE c.school_id = $1
     GROUP BY c.id, c.class_name
     ORDER BY c.class_name ASC`,
    [schoolId]
  );

  // Fees is its own feature (independent of analytics_dashboard), so this
  // chart only appears once a school has both turned on — same LEFT JOIN
  // shape as the fees list endpoint, just aggregated instead of per-row.
  let feesTrend: { range: "month" | "year"; points: { label: string; collected: number; outstanding: number }[] } | null =
    null;
  if (await isFeatureEnabled(db, "fees", schoolId)) {
    const feesQuery =
      feesRange === "year"
        ? `SELECT EXTRACT(YEAR FROM fp.start_date) AS label,
                  SUM(CASE WHEN sf.status = 'paid' THEN sf.amount ELSE 0 END) AS collected,
                  SUM(CASE WHEN sf.status = 'unpaid' THEN sf.amount ELSE 0 END) AS outstanding
           FROM fee_periods fp
           LEFT JOIN student_fees sf ON sf.fee_period_id = fp.id
           WHERE fp.school_id = $1
           GROUP BY EXTRACT(YEAR FROM fp.start_date)
           ORDER BY EXTRACT(YEAR FROM fp.start_date) ASC`
        : `SELECT fp.name AS label,
                  SUM(CASE WHEN sf.status = 'paid' THEN sf.amount ELSE 0 END) AS collected,
                  SUM(CASE WHEN sf.status = 'unpaid' THEN sf.amount ELSE 0 END) AS outstanding
           FROM fee_periods fp
           LEFT JOIN student_fees sf ON sf.fee_period_id = fp.id
           WHERE fp.school_id = $1
           GROUP BY fp.id, fp.name, fp.start_date
           ORDER BY fp.start_date ASC`;

    const { rows: feesRows } = await db.query<FeesTrendRow>(feesQuery, [schoolId]);
    feesTrend = {
      range: feesRange,
      points: feesRows.map(r => ({
        label: String(r.label),
        collected: Number(r.collected),
        outstanding: Number(r.outstanding)
      }))
    };
  }

  return c.json({
    attendanceTrend: {
      range,
      rangeStart,
      rangeEnd,
      termName,
      points: attendanceRows.map(r => ({
        date: r.date,
        rate: Number(r.total_count) > 0 ? Number(r.present_count) / Number(r.total_count) : null
      }))
    },
    studentsPerClass: classRows.map(r => ({
      classId: r.class_id,
      className: r.class_name || "(Unnamed class)",
      studentCount: Number(r.student_count)
    })),
    feesTrend
  });
});


export default router;
