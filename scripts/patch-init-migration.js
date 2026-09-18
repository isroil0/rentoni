// SQLite cannot ALTER TABLE ADD CONSTRAINT, so CHECK constraints must be injected
// into the generated CREATE TABLE statements of the initial migration.
const fs = require('fs');
const file = process.argv[2];
let sql = fs.readFileSync(file, 'utf8');

const CHECKS = {
  users: [`"users_role_check" CHECK ("role" IN ('SUPER_ADMIN','CUSTOMER'))`],
  product_variants: [
    `"pv_cost_price_check" CHECK ("cost_price_cents" >= 0)`,
    `"pv_selling_price_check" CHECK ("selling_price_cents" >= 0)`,
    `"pv_minimum_stock_check" CHECK ("minimum_stock" >= 0)`,
    `"pv_sku_check" CHECK (length(trim("sku")) > 0)`,
    `"pv_color_check" CHECK (length(trim("color")) > 0)`,
    `"pv_size_check" CHECK (length(trim("size")) > 0)`,
  ],
  product_images: [`"pi_sort_order_check" CHECK ("sort_order" >= 0)`],
  // The single most important invariant in the whole system.
  inventory: [`"inventory_quantity_non_negative" CHECK ("quantity" >= 0)`],
  inventory_transactions: [
    `"it_type_check" CHECK ("type" IN ('PURCHASE','SALE','RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE'))`,
    `"it_quantity_check" CHECK ("quantity" <> 0)`,
    `"it_prev_check" CHECK ("previous_quantity" >= 0)`,
    `"it_new_check" CHECK ("new_quantity" >= 0)`,
    `"it_delta_check" CHECK ("new_quantity" = "previous_quantity" + "quantity")`,
    `"it_reference_type_check" CHECK ("reference_type" IS NULL OR "reference_type" IN ('PURCHASE','ORDER','RETURN','ORDER_CANCELLATION','MANUAL'))`,
  ],
  purchases: [
    `"purchases_status_check" CHECK ("status" IN ('DRAFT','RECEIVED','CANCELLED'))`,
    `"purchases_total_check" CHECK ("total_cost_cents" >= 0)`,
  ],
  purchase_items: [
    `"puri_quantity_check" CHECK ("quantity" > 0)`,
    `"puri_unit_cost_check" CHECK ("unit_cost_cents" >= 0)`,
    `"puri_total_check" CHECK ("total_cents" >= 0)`,
  ],
  orders: [
    `"orders_source_check" CHECK ("source" IN ('POS','ONLINE'))`,
    `"orders_status_check" CHECK ("status" IN ('PENDING','CONFIRMED','PAID','COMPLETED','CANCELLED','REFUNDED'))`,
    `"orders_payment_status_check" CHECK ("payment_status" IN ('UNPAID','PAID','REFUNDED'))`,
    `"orders_payment_method_check" CHECK ("payment_method" IS NULL OR "payment_method" IN ('CASH','CARD','OTHER'))`,
    `"orders_amounts_check" CHECK ("subtotal_cents" >= 0 AND "discount_cents" >= 0 AND "total_cents" >= 0)`,
    `"orders_discount_check" CHECK ("discount_cents" <= "subtotal_cents")`,
    `"orders_online_customer_check" CHECK ("source" <> 'ONLINE' OR "customer_id" IS NOT NULL)`,
  ],
  order_items: [
    `"oi_quantity_check" CHECK ("quantity" > 0)`,
    `"oi_unit_price_check" CHECK ("unit_price_cents" >= 0)`,
    `"oi_discount_check" CHECK ("discount_cents" >= 0)`,
    `"oi_total_check" CHECK ("total_cents" >= 0)`,
  ],
  returns: [
    `"returns_quantity_check" CHECK ("quantity" > 0)`,
    `"returns_status_check" CHECK ("status" IN ('REQUESTED','ACCEPTED','REJECTED'))`,
    `"returns_refund_check" CHECK ("refund_cents" >= 0)`,
  ],
  cart_items: [`"cart_items_quantity_check" CHECK ("quantity" > 0)`],
  number_sequences: [`"number_sequences_value_check" CHECK ("value" >= 0)`],
};

let patched = 0;
for (const [table, checks] of Object.entries(CHECKS)) {
  const start = sql.indexOf(`CREATE TABLE "${table}" (`);
  if (start === -1) throw new Error(`table not found in migration: ${table}`);
  const end = sql.indexOf('\n);', start);
  if (end === -1) throw new Error(`could not find end of CREATE TABLE for ${table}`);
  const clause = checks.map((c) => `,\n    CONSTRAINT ${c}`).join('');
  sql = sql.slice(0, end) + clause + sql.slice(end);
  patched += checks.length;
}

const header = `-- Initial schema for the Men's Shirt POS + Inventory backend.
-- CHECK constraints below are hand-added on top of the Prisma-generated DDL because
-- SQLite has no ENUM type and Prisma cannot express CHECK constraints in schema.prisma.
-- They are the last line of defence behind the application-level validation and the
-- centralised InventoryService (notably: inventory.quantity >= 0).

`;
fs.writeFileSync(file, header + sql);
console.log(`Injected ${patched} CHECK constraints across ${Object.keys(CHECKS).length} tables.`);
