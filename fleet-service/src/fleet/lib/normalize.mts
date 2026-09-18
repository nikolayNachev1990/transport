// SPEC-fleet-service.md §5.1/§5.2 — registration number and VIN
// normalization, shared by both vehicles and trailers (identical rules).

// The 12 Cyrillic letters that have an exact visual Latin lookalike on a
// license plate — e.g. "СА1234ВХ" (Cyrillic С,А,В,Х) and "CA1234BX" (Latin)
// must be treated as the same plate. Any *other* Cyrillic letter means the
// input isn't actually a plate typed in the wrong keyboard layout, so it's
// a real error rather than something to silently transliterate.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  У: "Y",
  Х: "X",
};

const CYRILLIC_RANGE = /[Ѐ-ӿ]/;

export function normalizeRegistrationNumber(raw: string): string | null {
  const stripped = raw.toUpperCase().replace(/[\s-]/g, "");
  let out = "";
  for (const ch of stripped) {
    const latin = CYRILLIC_TO_LATIN[ch];
    if (latin) {
      out += latin;
      continue;
    }
    if (CYRILLIC_RANGE.test(ch)) return null; // FLEET_INVALID_REGISTRATION_NUMBER
    out += ch;
  }
  return out;
}

// 17 chars, uppercase, no I/O/Q (they're excluded from the VIN alphabet
// precisely because they're easily confused with 1/0). No checksum digit
// enforced — that's a North-America-only VIN rule.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(raw: string): string | null {
  const upper = raw.toUpperCase();
  return VIN_RE.test(upper) ? upper : null;
}
