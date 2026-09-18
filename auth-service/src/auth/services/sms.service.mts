import moment from "moment";
import { db } from "../../resources.mjs";
import smsConfig from "../../config/sms.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const tables = {
  usage: "sms_usage",
  userUsage: "sms_user_usage",
  userAttempts: "sms_user_attempts",
  blockedNumbers: "sms_blocked_mobile_numbers",
  blockedIps: "sms_blocked_ips",
  mobileCodes: "mobile_codes",
};

class SmsService {
  usages = {
    daily: smsConfig.usageDaily,
    weekly: smsConfig.usageWeekly,
    monthly: smsConfig.usageMonthly,
  };
  date = {
    day: parseInt(moment().format("YYYYMMDD")),
    week: parseInt(moment().format("YYYYww")),
    month: parseInt(moment().format("YYYYMM")),
  };
  blockUserUsage = {
    stage1: smsConfig.blockUserUsage.stage1,
    stage2: smsConfig.blockUserUsage.stage2,
  };
  blockUserUsageInterval = {
    stage1: smsConfig.blockUserUsageInterval.stage1,
    stage2: smsConfig.blockUserUsageInterval.stage2,
  };
  failAttempts = {
    stage1: smsConfig.failAttempts.stage1,
    stage2: smsConfig.failAttempts.stage2,
  };
  blockAttempts = {
    stage1: smsConfig.block.stage1,
    stage2: smsConfig.block.stage2,
  };

  async getUsage(date: string | number) {
    let row = await db.findByWhere<Row>(tables.usage, { date });

    if (!row) {
      row = await db.insert<Row>(tables.usage, { date, usage: 0 });
    }

    return row as Row;
  }

  async updateUsages() {
    const getDayUsage = await this.getUsage(this.date.day);
    const getWeekUsage = await this.getUsage(this.date.week);
    const getMonthUsage = await this.getUsage(this.date.month);

    await db.updateById(tables.usage, getDayUsage.id, { usage: getDayUsage.usage + 1 });
    await db.updateById(tables.usage, getWeekUsage.id, { usage: getWeekUsage.usage + 1 });
    await db.updateById(tables.usage, getMonthUsage.id, { usage: getMonthUsage.usage + 1 });
  }

  async getUserUsage(userId: string, mobileNumber: string, date: string | number) {
    const result = await db.raw<{ rows: Row[]; rowCount: number }>(
      `
      SELECT * FROM
        ${tables.userUsage}
      WHERE
        mobile_number = :mobile_number
      AND
        date = :date
      ORDER BY
        id
      DESC LIMIT 1
    `,
      { mobile_number: mobileNumber, date },
    );

    if (result && result.rowCount > 0) {
      return result.rows[0] as Row;
    }

    return (await db.insert<Row>(tables.userUsage, {
      user_id: userId,
      mobile_number: mobileNumber,
      date,
    })) as Row;
  }

  async setUserUsage(userId: string, mobileNumber: string, ip: string) {
    const getDayUsage = await this.getUserUsage(userId, mobileNumber, this.date.day);

    const usage = getDayUsage.usage + 1;
    await db.updateById(tables.userUsage, getDayUsage.id, { usage });

    if (usage > this.blockUserUsage.stage1) {
      await this.blockMobileNumber(userId, mobileNumber);
      await this.blockIp(userId, ip);
      await db.updateById(tables.userUsage, getDayUsage.id, { usage: 0 });
      return false;
    }

    await this.updateUsages();

    return true;
  }

  async checkUserUsage(mobileNumber: string, ip: string) {
    let date = moment().subtract(this.blockUserUsageInterval.stage1, "hours").utc().toISOString();
    let query = await db.raw<{ rows: Row[]; rowCount: number }>(
      `
      SELECT * FROM
        ${tables.mobileCodes}
      WHERE
        mobile_number = :mobile_number and created_at > :date
      ORDER BY
        id
      DESC
    `,
      { mobile_number: mobileNumber, date },
    );

    if (query && query.rowCount > this.blockUserUsage.stage1) {
      console.log("Abuse detected, blocking sms sending on stage 1.");
      return false;
    }

    date = moment().subtract(this.blockUserUsageInterval.stage2, "hours").utc().toISOString();
    query = await db.raw<{ rows: Row[]; rowCount: number }>(
      `
      SELECT * FROM
        ${tables.mobileCodes}
      WHERE
        mobile_number = :mobile_number and created_at > :date
      ORDER BY
        id
      DESC
    `,
      { mobile_number: mobileNumber, date },
    );

    if (query && query.rowCount > this.blockUserUsage.stage2) {
      console.log("Abuse detected, blocking sms sending on stage 2.");
      await this.blockMobileNumber(null, mobileNumber);
      await this.blockIp(null, ip);
      return false;
    }

    return true;
  }

  async userAttempts(userId: string | null, mobileNumber: string, ip: string | null) {
    const startDate = moment().subtract(this.blockAttempts.stage1, "hours").toISOString();
    const endDate = moment().toISOString();
    const result = await db.raw<{ rows: Row[] }>(
      `
    SELECT * FROM
      ${tables.userAttempts}
    WHERE
      (mobile_number = :mobile_number and created_at > :startDate and created_at < :endDate)
    OR
      (mobile_number = :mobile_number and updated_at > :startDate and updated_at < :endDate)
    ORDER BY
      id
    DESC LIMIT 1
  `,
      { mobile_number: mobileNumber, startDate, endDate },
    );

    if (result && result.rows.length > 0) {
      const found = result.rows[0] as Row;
      const updated = (await db.updateById<Row>(tables.userAttempts, found.id, { attempts: found.attempts + 1 })) as Row;

      if (updated.attempts > this.failAttempts.stage1) {
        await this.blockMobileNumber(userId, mobileNumber);
        await this.blockIp(userId, ip);
        await db.updateById(tables.userAttempts, updated.id, { attempts: 0 });
        return false;
      }

      return true;
    }

    await db.insert(tables.userAttempts, {
      user_id: userId,
      mobile_number: mobileNumber,
      ip,
      attempts: 1,
    });

    return true;
  }

  async blockMobileNumber(userId: string | null, mobileNumber: string) {
    const expire = moment().add(this.blockAttempts.stage1, "hours").utc().toISOString();
    await db.insert(tables.blockedNumbers, {
      user_id: userId,
      mobile_number: mobileNumber,
      status: 1,
      block_expire: expire,
    });
  }

  async blockIp(userId: string | null, ip: string | null) {
    const expire = moment().add(this.blockAttempts.stage1, "hours").utc().toISOString();
    await db.insert(tables.blockedIps, {
      user_id: userId,
      ip,
      status: 1,
      block_expire: expire,
    });
  }

  async checkPermission(mobileNumber: string | null, ip: string | null) {
    const getDayUsage = await this.getUsage(this.date.day);
    const getWeekUsage = await this.getUsage(this.date.week);
    const getMonthUsage = await this.getUsage(this.date.month);

    if (getDayUsage.usage > this.usages.daily) {
      console.log("exceed daily usage");
      return false;
    }

    if (getWeekUsage.usage > this.usages.weekly) {
      console.log("exceed weekly usage");
      return false;
    }

    if (getMonthUsage.usage > this.usages.monthly) {
      console.log("exceed monthly usage");
      return false;
    }

    if (ip) {
      const checkBlockedIp = await db.findByWhere(tables.blockedIps, { ip, status: 1 });

      if (checkBlockedIp) {
        console.log("user has been blocked by ip");
        return false;
      }
    }

    if (mobileNumber) {
      const checkMobileNumber = await db.findByWhere(tables.blockedNumbers, {
        mobile_number: mobileNumber,
        status: 1,
      });

      if (checkMobileNumber) {
        console.log("user has been blocked by mobile number");
        return false;
      }
    }

    return true;
  }

  async clean() {
    const date = moment().toISOString();
    const numbersQuery = await db.raw<{ rows: Row[]; rowCount: number }>(
      `
      SELECT * FROM
        sms_blocked_mobile_numbers
      WHERE
        status = 1
      AND
        block_expire < :date
    `,
      { date },
    );

    if (numbersQuery && numbersQuery.rowCount > 0) {
      for (const row of numbersQuery.rows) {
        await db.updateById("sms_blocked_mobile_numbers", row.id, { status: 0 });
      }
    }

    const ipsQuery = await db.raw<{ rows: Row[]; rowCount: number }>(
      `
      SELECT * FROM
        sms_blocked_ips
      WHERE
        status = 1
      AND
        block_expire < :date
    `,
      { date },
    );

    if (ipsQuery && ipsQuery.rowCount > 0) {
      for (const row of ipsQuery.rows) {
        await db.updateById("sms_blocked_ips", row.id, { status: 0 });
      }
    }
  }
}

export default SmsService;
