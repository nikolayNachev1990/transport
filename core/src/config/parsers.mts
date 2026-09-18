// Ready-made `parse` functions for the common field types. Each one throws
// on invalid input instead of returning a bad-but-truthy value — the whole
// point of giving `parse` a way to fail is so a typo doesn't turn into a
// service that starts up with garbage config. loadConfig itself stays
// generic and has no idea any of these exist; it only knows `parse` can
// throw.

export const asNumber = (raw: string): number => {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`"${raw}" is not a valid number`);
  }
  return value;
};

export const asInt = (raw: string): number => {
  const value = asNumber(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`"${raw}" is not a valid integer`);
  }
  return value;
};

export const asBoolean = (raw: string): boolean => {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`"${raw}" is not "true" or "false"`);
};

export const asList = (raw: string): string[] =>
  raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const asUrl = (raw: string): string => {
  try {
    new URL(raw);
  } catch {
    throw new Error(`"${raw}" is not a valid URL`);
  }
  return raw;
};
