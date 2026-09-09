import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "services/doc-service/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Only relay.mts/consumer.mts may talk to Kafka directly — publish()
    // must only ever write to the outbox table (PLAN-backend.md stage 6,
    // requirement 1). This catches transitive imports too, not just a
    // direct one in publisher.mts: every file under tms-core/src is
    // covered except the two allowed to import the client, so anything
    // publisher.mts might reach *through* another file gets flagged at
    // that file, not silently missed the way a source-text grep would be.
    files: ["packages/tms-core/src/**/*.mts"],
    ignores: [
      "packages/tms-core/src/events/relay.mts",
      "packages/tms-core/src/events/consumer.mts",
      "**/*.test.mts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@confluentinc/kafka-javascript",
              message: "Only relay.mts and consumer.mts may import a Kafka client — see tms-core/events publish/relay split.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
