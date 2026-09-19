# Document fixtures (local only, not in git)

Level-1 parser tests in `doc-service/tests` read these through a read-only
mount at `/fixtures` (see the doc-service volumes in docker-compose.yaml).

- `documents/` — public specimens/blank forms downloaded from official and
  Wikimedia sources, grouped by type. Regenerate by searching for specimens;
  licences are mixed, so this folder is git-ignored.
- `private/` — **real documents from real companies. Personal data: never
  commit, never share.** One folder per document type:
  `registration_certificates/ driving_licences/ driver_cards/ insurance/
  technical_inspections/ adr/ transport_orders/ customs_t1_t2/ cmr/`.
  Photos, scans, PDFs and Word files all welcome — the messier the better
  (skewed, dim, phone-taken); real-world noise is what the parsers must survive.

When adding real documents, write the expected values next to each file as
`<file>.expected.json` (e.g. `{"registration_number": "CA1234BH", "vin": "..."}`)
so a test can score the parsers against them.

Note: whenever the AI tier answers a request, the file is sent to the
Anthropic API. Real customer documents contain personal data — make sure
that processing is covered by your agreement/DPA before running production
traffic through it.
