// Sends GraphQL requests to Hasura, either loading a query/mutation by
// name from graphql/<name>.graphql (parsed once to also recover its
// operation name + top-level field alias) or given one already built.
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import fs from "node:fs";
import path from "node:path";
import gql from "graphql-tag";

class Hasura {
  tester = null;
  config = {};

  constructor(tester, config) {
    this.tester = tester;
    this.config = config;
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async graphql({ dir = null, name, vars = {} }) {
    if (!dir) dir = this.config.graphql?.dir ?? path.join(process.cwd(), "graphql");
    if (!name) throw new Error('hasura.graphql requires "name"');

    const file = path.join(dir, `${name}.graphql`);
    if (!fs.existsSync(file)) {
      throw new Error(`hasura.graphql file "${file}" is missing`);
    }
    const content = fs.readFileSync(file).toString();

    let parsed;
    try {
      parsed = gql`${content}`;
    } catch (error) {
      throw new Error(`hasura.graphql parse "${name}" failed: ${error.message}`);
    }

    let alias = null;
    let operationName = null;
    for (const definition of parsed.definitions) {
      if (definition.kind !== "OperationDefinition") continue;
      if (!["mutation", "query"].includes(definition.operation)) continue;
      alias = definition.selectionSet?.selections?.[0]?.name?.value ?? null;
      operationName = definition.name?.value ?? null;
      break;
    }
    if (!alias || !operationName) {
      throw new Error(`hasura.graphql "${name}" is missing an operation name or top-level field`);
    }

    return { alias, operationName, query: content, variables: vars };
  }

  // options.pick: optional (response) => value, run over the raw axios
  // response. Errors from a bad `pick` (or a GraphQL error response) log
  // the actual payload before re-throwing, so a failing test's console
  // output shows what Hasura/auth-service actually said, not just
  // "Cannot read properties of undefined".
  async request({ url = null, name, vars = {}, graphql = null, headers = {}, pick = null, delay = 50 }) {
    if (!url) url = this.config.hasura?.url;
    if (!url) throw new Error("hasura.request: no url (pass one, or set config.hasura.url)");
    if (!name) throw new Error('hasura.request requires "name"');

    headers = { "content-type": "application/json", ...headers, "idempotent-key": `tester-${uuidv4()}` };

    const body = graphql ?? (await this.graphql({ name, vars }));

    await this.delay(delay);

    const response = await axios.post(url, JSON.stringify(body), { headers, validateStatus: () => true });

    if (!pick) return response;

    try {
      return pick(response);
    } catch (error) {
      const errors = response.data?.errors;
      console.log(`hasura.request "${name}" — pick() failed: ${error.message}`);
      console.log(`hasura.request "${name}" response:`, errors ?? response.data);
      throw error;
    }
  }

  // Polls `request` until `validator(response)` returns true or `retry`
  // attempts are used up — for anything that needs a moment to settle
  // (e.g. a consumer processing an event before the effect is visible).
  async repeat({ retry, delay, validator, label = null, ...requestOptions }) {
    if (typeof retry !== "number") throw new Error('hasura.repeat requires "retry" (number)');
    if (typeof delay !== "number") throw new Error('hasura.repeat requires "delay" (number)');
    if (typeof validator !== "function") throw new Error('hasura.repeat requires "validator" (function)');

    label = label ?? `... hasura.repeat ${requestOptions.name} attempt`;

    let response = null;
    for (let attempt = 1; attempt <= retry; attempt += 1) {
      console.log(label, attempt);
      await this.delay(delay);
      response = await this.request(requestOptions);
      if (await validator(response)) return response;
    }
    throw new Error(`hasura.repeat "${requestOptions.name}" — validator never passed after ${retry} attempt(s)`);
  }
}

export default Hasura;
