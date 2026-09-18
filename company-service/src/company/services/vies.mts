import axios from "axios";

export interface ViesResult {
  valid: boolean | null;
  raw: Record<string, unknown>;
}

// VIES's REST API (not the older SOAP one) — a plain POST, no WSDL
// client needed. Network/VIES-outage failures are swallowed into
// { valid: null, raw: { error } } rather than thrown: a VAT check that
// can't currently reach the EU service is a data point ("unknown"), not
// a reason to fail the whole request.
export async function checkVat(countryCode: string, vatNumber: string): Promise<ViesResult> {
  try {
    const response = await axios.post(
      "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",
      { countryCode, vatNumber },
      { timeout: 10000, validateStatus: () => true },
    );
    if (response.status !== 200) {
      return { valid: null, raw: { error: `VIES responded ${response.status}`, body: response.data } };
    }
    return { valid: Boolean(response.data?.valid), raw: response.data };
  } catch (error) {
    return { valid: null, raw: { error: error instanceof Error ? error.message : String(error) } };
  }
}
