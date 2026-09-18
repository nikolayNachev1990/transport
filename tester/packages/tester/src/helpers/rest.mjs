// Direct REST calls — bypassing Hasura entirely, for hitting a service's
// own /api/... routes (or /health, /topics/health, ...) when there's no
// Hasura action wrapping it.
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

class Rest {
  tester = null;
  config = {};

  constructor(tester, config) {
    this.tester = tester;
    this.config = config;
  }

  async request({ url, method, body = {}, headers = {}, pick = null }) {
    if (typeof url !== "string" || url.length === 0) {
      throw new Error('Rest.request requires "url"');
    }
    if (!METHODS.includes(method)) {
      throw new Error(`Rest.request "method" must be one of: ${METHODS.join(", ")}`);
    }

    headers = { "content-type": "application/json", ...headers, "idempotent-key": `tester-${uuidv4()}` };

    const response = await axios.request({
      url,
      method,
      data: method === "GET" ? undefined : body,
      headers,
      validateStatus: () => true,
    });

    if (!pick) return response;

    try {
      return pick(response);
    } catch (error) {
      console.log(`Rest.request "${method} ${url}" — pick() failed: ${error.message}`);
      console.log(`Rest.request "${method} ${url}" response:`, response.data);
      throw error;
    }
  }
}

export default Rest;
