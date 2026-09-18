import { randomUUID } from "node:crypto";
import fs from "node:fs";

export interface LocalGroupSettings {
  groupId: string;
}

// Caches a generated consumer groupId in a local dotfile so repeated local
// runs reuse the same group instead of minting a new one (and losing Kafka
// consumer offsets) every restart. Not used at all once a real groupId is
// configured — see broker/index.mts.
export function localGroupSettings(group: string, filename = ".broker-group"): LocalGroupSettings {
  if (!fs.existsSync(filename)) {
    const settings: LocalGroupSettings = { groupId: `${group}-${randomUUID()}` };
    fs.writeFileSync(filename, JSON.stringify(settings));
    return settings;
  }

  const settings = JSON.parse(fs.readFileSync(filename, "utf-8")) as LocalGroupSettings;
  if (!settings.groupId) {
    throw new Error("broker.localGroupSettings: cached file has no groupId");
  }
  return settings;
}
