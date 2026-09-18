import assert from "node:assert/strict";
import { loadConfig, ConfigError, asNumber, asBoolean, asList } from "../dist/config/index.mjs";

// 1. Missing required field is caught, naming the exact field and its description.
{
  let error;
  try {
    loadConfig({ DB_URL: { required: true, description: "Postgres connection string" } }, {});
  } catch (err) {
    error = err;
  }
  assert.ok(error instanceof ConfigError, "expected a ConfigError");
  assert.match(error.message, /Missing DB_URL — Postgres connection string/);
  console.log("1. missing required field -> ConfigError:", error.message.split("\n")[1]);
}

// 2. Invalid value (not just missing) is caught — the case a naive
//    Number("abc") loader gets wrong (it silently starts with NaN instead).
{
  let error;
  try {
    loadConfig(
      { APP_PORT: { required: true, parse: asNumber, description: "HTTP port" } },
      { APP_PORT: "abc" },
    );
  } catch (err) {
    error = err;
  }
  assert.ok(error instanceof ConfigError);
  assert.match(error.message, /Invalid APP_PORT — HTTP port \("abc" is not a valid number\)/);
  console.log("2. invalid value (parse throws) -> ConfigError:", error.message.split("\n")[1]);
}

// 3. Missing and invalid fields are collected together, not reported one at a time.
{
  let error;
  try {
    loadConfig(
      {
        DB_URL: { required: true, description: "Postgres connection string" },
        APP_PORT: { required: true, parse: asNumber, description: "HTTP port" },
      },
      { APP_PORT: "abc" },
    );
  } catch (err) {
    error = err;
  }
  assert.equal(error.problems.length, 2);
  console.log("3. missing + invalid collected together:", error.problems);
}

// 4. No shared state between calls. A naive "create a, create b, check both"
//    could pass by coincidence under a global static too, if b simply
//    overwrites shared state and both checks happen to read after that.
//    The real proof: read a.NAME again AFTER b exists — if state were
//    shared/global, a.NAME would now read "b".
{
  const a = loadConfig({ NAME: { required: true, description: "x" } }, { NAME: "a" });
  const b = loadConfig({ NAME: { required: true, description: "x" } }, { NAME: "b" });
  assert.equal(b.NAME, "b");
  assert.equal(a.NAME, "a", 'a.NAME must still be "a" after b was created');
  console.log("4. no shared state -> a.NAME is still", a.NAME, "after creating b (b.NAME =", b.NAME + ")");
}

// 5. Successful parse, with defaults and parse helpers, correct values at runtime.
{
  const config = loadConfig(
    {
      APP_PORT: { required: false, default: 80, parse: asNumber, description: "HTTP port" },
      DEBUG: { required: false, default: false, parse: asBoolean, description: "Verbose logging" },
      BROKERS: { required: true, parse: asList, description: "Kafka broker hosts" },
    },
    { BROKERS: "kafka-1:9092, kafka-2:9092" },
  );
  assert.equal(config.APP_PORT, 80);
  assert.equal(config.DEBUG, false);
  assert.deepEqual(config.BROKERS, ["kafka-1:9092", "kafka-2:9092"]);
  console.log("5. successful load with defaults + parsers ->", config);
}

console.log("\nALL BEHAVIOR ASSERTIONS PASSED");
