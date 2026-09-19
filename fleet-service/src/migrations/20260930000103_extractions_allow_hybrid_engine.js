// doc-service now answers with engine = 'hybrid' when Level 1 read part of a
// document and the AI completed/cross-checked it (SPEC-doc-service.md §4.5.1).
// The original CHECK only knew 'local' and 'ai', so every hybrid result made
// the UPDATE fail and the extraction stayed 'queued' forever.
exports.up = async function (knex) {
  await knex.raw("ALTER TABLE document_extractions DROP CONSTRAINT IF EXISTS document_extractions_engine_check");
  await knex.raw("ALTER TABLE document_extractions ADD CONSTRAINT document_extractions_engine_check CHECK (engine IN ('local', 'ai', 'hybrid'))");
};

exports.down = async function (knex) {
  await knex.raw("ALTER TABLE document_extractions DROP CONSTRAINT IF EXISTS document_extractions_engine_check");
  await knex.raw("ALTER TABLE document_extractions ADD CONSTRAINT document_extractions_engine_check CHECK (engine IN ('local', 'ai'))");
};
