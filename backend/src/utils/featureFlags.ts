import type { DbConnection } from "../config/db";

interface IdRow {
  id: number;
}

// A flag's expiry is a property of the flag itself, not of any one school's
// override — once it passes, every school's override for that flag is
// cleared so everyone reverts to default_enabled, and the expiry itself is
// cleared. This keeps that invariant true regardless of which route touches
// the table.
export const resetExpiredFeatureFlags = async (db: DbConnection) => {
  const { rows: expired } = await db.query<IdRow>(
    "SELECT id FROM feature_flags WHERE expires_at IS NOT NULL AND expires_at < NOW()"
  );

  for (const flag of expired) {
    await db.query("DELETE FROM school_feature_flags WHERE feature_flag_id = $1", [flag.id]);
  }

  if (expired.length > 0) {
    await db.query(
      "UPDATE feature_flags SET expires_at = NULL WHERE expires_at IS NOT NULL AND expires_at < NOW()"
    );
  }
};

interface FeatureStateRow {
  default_enabled: boolean;
  override_enabled: boolean | null;
}

// Effective state for one school: its explicit override if system_admin has
// set one, otherwise the flag's default_enabled.
export const isFeatureEnabled = async (
  db: DbConnection,
  key: string,
  schoolId: number | null
): Promise<boolean> => {
  await resetExpiredFeatureFlags(db);

  const { rows } = await db.query<FeatureStateRow>(
    `SELECT ff.default_enabled AS default_enabled, sff.enabled AS override_enabled
     FROM feature_flags ff
     LEFT JOIN school_feature_flags sff
       ON sff.feature_flag_id = ff.id AND sff.school_id = $1
     WHERE ff.feature_key = $2`,
    [schoolId, key]
  );

  const row = rows[0];
  if (!row) return false;

  return row.override_enabled !== null ? !!row.override_enabled : !!row.default_enabled;
};
