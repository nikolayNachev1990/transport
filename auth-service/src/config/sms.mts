import { loadConfig, asInt } from "@transport/core/config";

const env = loadConfig(
  {
    SMS_USAGE_DAILY: { required: false, default: 10, parse: asInt, description: "Max SMS per user per day" },
    SMS_USAGE_WEEKLY: { required: false, default: 10, parse: asInt, description: "Max SMS per user per week" },
    SMS_USAGE_MONTHLY: { required: false, default: 10, parse: asInt, description: "Max SMS per user per month" },
    SMS_BLOCK_USER_USAGE_STAGE_1: { required: false, default: 5, parse: asInt, description: "Usage count triggering stage-1 block" },
    SMS_BLOCK_USER_USAGE_STAGE_2: { required: false, default: 15, parse: asInt, description: "Usage count triggering stage-2 block" },
    SMS_BLOCK_USER_USAGE_INTERVAL_STAGE_1: { required: false, default: 3, parse: asInt, description: "Stage-1 block duration, hours" },
    SMS_BLOCK_USER_USAGE_INTERVAL_STAGE_2: { required: false, default: 5, parse: asInt, description: "Stage-2 block duration, hours" },
    SMS_FAIL_ATTEMPTS_STAGE_1: { required: false, default: 5, parse: asInt, description: "Fail count triggering stage-1 block" },
    SMS_FAIL_ATTEMPTS_STAGE_2: { required: false, default: 15, parse: asInt, description: "Fail count triggering stage-2 block" },
    SMS_BLOCK_STAGE_1: { required: false, default: 1, parse: asInt, description: "Stage-1 block duration, hours" },
    SMS_BLOCK_STAGE_2: { required: false, default: 24, parse: asInt, description: "Stage-2 block duration, hours" },
  },
  process.env,
);

export default {
  usageDaily: env.SMS_USAGE_DAILY,
  usageWeekly: env.SMS_USAGE_WEEKLY,
  usageMonthly: env.SMS_USAGE_MONTHLY,
  blockUserUsage: { stage1: env.SMS_BLOCK_USER_USAGE_STAGE_1, stage2: env.SMS_BLOCK_USER_USAGE_STAGE_2 },
  blockUserUsageInterval: {
    stage1: env.SMS_BLOCK_USER_USAGE_INTERVAL_STAGE_1,
    stage2: env.SMS_BLOCK_USER_USAGE_INTERVAL_STAGE_2,
  },
  failAttempts: { stage1: env.SMS_FAIL_ATTEMPTS_STAGE_1, stage2: env.SMS_FAIL_ATTEMPTS_STAGE_2 },
  block: { stage1: env.SMS_BLOCK_STAGE_1, stage2: env.SMS_BLOCK_STAGE_2 },
};
