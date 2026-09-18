import { Client } from "@elastic/elasticsearch";

export interface SearchConfig {
  url: string;
  user: string;
  password: string;
  mapping: Record<string, Record<string, unknown>>;
}

export interface SearchQueryResult {
  _index: string;
  _id: string;
  matched_queries?: unknown;
  [key: string]: unknown;
}

export interface Search {
  reIndex(oldIndex: string, newIndex: string): Promise<boolean>;
  checkIndexExists(index: string): Promise<boolean>;
  countDocuments(index: string): Promise<number>;
  getIndex(index: string, id: string): Promise<unknown>;
  setIndex(index: string, body: Record<string, unknown>, customId?: string): Promise<boolean>;
  updateIndex(index: string, id: string, body: Record<string, unknown>, customId?: string): Promise<boolean>;
  deleteIndex(index: string, id: string): Promise<boolean>;
  query(query: Record<string, unknown>): Promise<SearchQueryResult[] | false>;
  count(query: Record<string, unknown>): Promise<number>;
  autocomplete(query: Record<string, unknown>, fields: string[]): Promise<unknown[] | false>;
}

function logError(operation: string, error: unknown): void {
  console.log(`Search.${operation}: ${error instanceof Error ? error.message : String(error)}`);
}

export async function createSearch(config: SearchConfig): Promise<Search> {
  const client = new Client({
    node: config.url,
    auth: { username: config.user, password: config.password },
  });

  for (const [index, mapping] of Object.entries(config.mapping)) {
    try {
      await client.transport.request({ method: "PUT", path: `/${index}`, body: mapping, querystring: {} });
    } catch (error) {
      logError(`mapping[${index}]`, error);
    }
  }

  return {
    async reIndex(oldIndex, newIndex) {
      try {
        await client.reindex({
          wait_for_completion: true,
          refresh: true,
          source: { index: oldIndex },
          dest: { index: newIndex },
        });
        return true;
      } catch (error) {
        logError("reIndex", error);
        return false;
      }
    },

    async checkIndexExists(index) {
      try {
        return await client.indices.exists({ index });
      } catch (error) {
        logError("checkIndexExists", error);
        return false;
      }
    },

    async countDocuments(index) {
      try {
        const response = await client.count({ index });
        return response.count;
      } catch {
        return 0;
      }
    },

    async getIndex(index, id) {
      try {
        return await client.get({ index, id });
      } catch (error) {
        logError("getIndex", error);
        return false;
      }
    },

    async setIndex(index, body, customId) {
      try {
        const id = customId ?? (body.id as string | undefined);
        await client.index({ index, document: body, ...(id ? { id } : {}) });
        return true;
      } catch (error) {
        logError("setIndex", error);
        return false;
      }
    },

    async updateIndex(index, id, body, customId) {
      try {
        await client.update({ index, id: customId ?? id, doc: body });
        return true;
      } catch (error) {
        logError("updateIndex", error);
        return false;
      }
    },

    async deleteIndex(index, id) {
      try {
        await client.delete({ index, id });
        return true;
      } catch (error) {
        logError("deleteIndex", error);
        return false;
      }
    },

    async query(query) {
      try {
        const response = await client.search(query);
        const hits = response.hits.hits;
        if (hits.length === 0) return false;
        return hits.map((hit) => ({
          ...(hit._source as Record<string, unknown>),
          _index: hit._index,
          _id: hit._id,
          ...(hit.matched_queries ? { matched_queries: hit.matched_queries } : {}),
        })) as SearchQueryResult[];
      } catch (error) {
        logError("query", error);
        return false;
      }
    },

    async count(query) {
      try {
        const response = await client.count(query);
        return response.count;
      } catch (error) {
        logError("count", error);
        return 0;
      }
    },

    async autocomplete(query, fields) {
      try {
        const result = await client.search(query);
        const hits = result.hits.hits;
        const suggests = hits.map((hit) => {
          const source = hit._source as Record<string, unknown>;
          return fields.length === 1
            ? source[fields[0] as string]
            : Object.fromEntries(fields.map((field) => [field, source[field]]));
        });
        return suggests.length > 0 ? suggests : false;
      } catch (error) {
        logError("autocomplete", error);
        return false;
      }
    },
  };
}
