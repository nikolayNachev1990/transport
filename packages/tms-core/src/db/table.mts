export interface BaseRow {
  id: string;
  created_at: Date;
  updated_at: Date;
}

export interface TenantScopedRow extends BaseRow {
  tenant_id: string;
}

export interface TableConfig<Row extends BaseRow = BaseRow> {
  readonly name: string;
  readonly tenantScoped: boolean;
  // Never populated — a phantom marker so TypeScript carries Row through to
  // callers like db.findById(table, id): Promise<Row | null>.
  readonly _row?: Row;
}

// Row is only ever used as a phantom type parameter here — the caller
// supplies it explicitly (defineTable<Order>("orders", ...)) so later calls
// like db.findById(ordersTable, id) come back typed as Order | null.
export function defineTable<Row extends BaseRow>(
  name: string,
  options: { tenantScoped: boolean },
): TableConfig<Row> {
  return { name, tenantScoped: options.tenantScoped };
}
