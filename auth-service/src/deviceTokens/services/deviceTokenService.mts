import { db, broker } from "../../resources.mjs";

const table = "device_tokens";
const eventSchemaMap = {
  created: "deviceToken.created",
  updated: "deviceToken.updated",
  deleted: "deviceToken.deleted",
};

interface DeviceTokenRow {
  id: string;
  user_id: string;
  device_token: string;
  platform: string;
  domain: string;
}

class DeviceTokenService {
  async findById(id: string) {
    return db.findById<DeviceTokenRow>(table, id);
  }

  async findByDeviceToken(token: string) {
    const query = await db.raw<{ rows: DeviceTokenRow[] }>(`SELECT * FROM ${table} WHERE device_token = :token ORDER BY id DESC LIMIT 1`, { token });

    if (query && query.rows.length > 0) {
      return query.rows[0];
    }

    return null;
  }

  async findByWhere(where: Record<string, unknown>) {
    return db.findByWhere<DeviceTokenRow>(table, where);
  }

  async insert(sets: Record<string, unknown>) {
    return db.insert<DeviceTokenRow>(table, sets);
  }

  async insertAndEmit(sets: Record<string, unknown>) {
    const deviceToken = await this.insert(sets);
    if (!deviceToken) {
      return null;
    }

    const emitted = await broker.send(eventSchemaMap.created, deviceToken);
    if (!emitted) {
      return null;
    }

    return deviceToken;
  }

  async createDeviceToken(data: Record<string, unknown> | null) {
    if (!data) {
      return null;
    }
    return this.insertAndEmit(data);
  }

  async updateAndEmit(sets: { device_token: string; user_id: string; platform: string; domain: string }) {
    const deviceToken = await db.updateByWhere<DeviceTokenRow>(
      table,
      { device_token: sets.device_token },
      {
        user_id: sets.user_id,
        platform: sets.platform,
        domain: sets.domain,
      },
    );
    if (!deviceToken) {
      return null;
    }

    const emitted = await broker.send(eventSchemaMap.updated, deviceToken);
    if (!emitted) {
      return null;
    }

    return deviceToken;
  }

  async updateDeviceToken(data: { device_token: string; user_id: string; platform: string; domain: string } | null) {
    if (!data) {
      return null;
    }

    return this.updateAndEmit(data);
  }

  async deleteById(id: string) {
    return db.deleteById<DeviceTokenRow>(table, id);
  }

  async deleteAndEmit(id: string) {
    const message = await this.deleteById(id);
    if (!message) {
      return null;
    }
    const emitted = await broker.send(eventSchemaMap.deleted, message);
    if (!emitted) {
      return null;
    }
    return message;
  }

  async deleteAll() {
    const query = await db.raw<{ rows: DeviceTokenRow[] }>(`SELECT * FROM ${table} WHERE platform NOT IN ('ios','android')`);
    if (query && query.rows.length > 0) {
      for (const row of query.rows) {
        await this.deleteAndEmit(row.id);
      }
    }
  }

  async deleteByPlatformAndUser(userId: string, platform: string) {
    const result = await db.raw<{ rows: DeviceTokenRow[] }>("SELECT * FROM device_tokens WHERE user_id = :user_id AND platform = :platform", {
      user_id: userId,
      platform,
    });
    if (result && result.rows.length > 0) {
      for (const row of result.rows) {
        await this.deleteAndEmit(row.id);
      }
      return true;
    }
    return false;
  }

  async deleteByTokenAndUser(userId: string, token: string) {
    const result = await db.raw<{ rows: DeviceTokenRow[] }>("SELECT * FROM device_tokens WHERE user_id = :user_id AND device_token = :token", {
      user_id: userId,
      token,
    });
    if (result && result.rows.length > 0) {
      for (const row of result.rows) {
        await this.deleteAndEmit(row.id);
      }
      return true;
    }
    return false;
  }

  async deleteExpireToken(tokens: string[]) {
    if (tokens.length > 0) {
      for (const token of tokens) {
        const found = await db.findByWhere<DeviceTokenRow>(table, { device_token: token });
        const row = Array.isArray(found) ? found[0] : found;
        if (!row) {
          continue;
        }
        await this.deleteAndEmit(row.id);
        return true;
      }
    }
    return false;
  }
}

export default DeviceTokenService;
