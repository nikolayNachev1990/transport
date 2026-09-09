export interface TestMinioConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function testMinioConfig(): TestMinioConfig {
  const endpoint = process.env["TEST_MINIO_ENDPOINT"];
  if (endpoint === undefined || endpoint === "") {
    throw new Error(
      "TEST_MINIO_ENDPOINT is not set. Start test infra with " +
        "`docker compose -f docker-compose.test.yml up -d` and export " +
        "TEST_MINIO_ENDPOINT=http://localhost:59000",
    );
  }
  return {
    endpoint,
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
    bucket: "tms-core-test",
  };
}
