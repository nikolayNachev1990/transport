import { loadConfig, asBoolean } from "@transport/core/config";

const env = loadConfig(
  {
    TWILIO_STATUS: { required: false, default: false, parse: asBoolean, description: "Whether Twilio SMS is enabled" },
    TWILIO_FROM_NAME: { required: false, default: "Transport", description: "Sender name shown in SMS message text" },
    TWILIO_NUMBER: { required: false, default: "", description: "Twilio sending number" },
    TWILIO_ACCOUNT_SID: { required: false, default: "", description: "Twilio account SID" },
    TWILIO_AUTH_TOKEN: { required: false, default: "", description: "Twilio auth token" },
  },
  process.env,
);

export default {
  status: env.TWILIO_STATUS,
  fromName: env.TWILIO_FROM_NAME,
  number: env.TWILIO_NUMBER,
  accountSid: env.TWILIO_ACCOUNT_SID,
  authToken: env.TWILIO_AUTH_TOKEN,
};
