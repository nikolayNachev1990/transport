import moment from "moment";
import { db } from "../../resources.mjs";
import AuthService from "../../auth/services/auth.service.mjs";

const usersTable = "users";

interface UserRow {
  id: string;
  [key: string]: unknown;
}

class NotificationService {
  authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async snooze(userId: string, snoozeExpire: string | null) {
    const row = await db.updateByWhere<UserRow>(
      usersTable,
      { id: userId },
      {
        notifications_snooze: true,
        notifications_snooze_expire: snoozeExpire,
      },
    );

    if (!row) {
      return null;
    }

    await this.authService.emitUserUpdateEvent(row);
    return true;
  }

  async unsnooze(userId: string) {
    const row = await db.updateByWhere<UserRow>(
      usersTable,
      { id: userId },
      {
        notifications_snooze: false,
        notifications_snooze_expire: null,
      },
    );

    if (!row) {
      return null;
    }

    await this.authService.emitUserUpdateEvent(row);
    return true;
  }

  async queueDelete() {
    const todayDate = moment().utc().toISOString();

    const result = await db.raw<{ rows: UserRow[] }>(
      `
      SELECT *
      FROM ${usersTable}
      WHERE notifications_snooze_expire < :date
      AND notifications_snooze = true
    `,
      { date: todayDate },
    );

    if (result && result.rows.length > 0) {
      for (const row of result.rows) {
        const updateRow = await db.updateById<UserRow>(usersTable, row.id, {
          notifications_snooze: false,
          notifications_snooze_expire: null,
        });
        if (updateRow) {
          await this.authService.emitUserUpdateEvent(updateRow);
        }
      }
    }
  }
}

export default NotificationService;
