-- The demo Postgres shape, and the same shape the integration tests introspect.
--
-- This file owns the DDL and nothing else: no rows. scripts/seed-test.sh applies
-- it to the test stack and then writes the data, so the demo database and the
-- test database are the same schema by construction rather than by convention.
--
-- The point of the shape is that it has real foreign keys in both directions and
-- a join table, so an entity-relationship diagram has something to draw:
-- `categories` and `regions` are roots, `products` and `suppliers` hang off them,
-- `product_suppliers` joins the two, and `orders` → `order_items` → `products`
-- is a three-hop chain.

CREATE TABLE regions (
  id   SERIAL PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL
);

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(128) NOT NULL,
  description TEXT NULL
);

CREATE TABLE suppliers (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(128) NOT NULL,
  email     VARCHAR(255) NULL,
  region_id INTEGER      NOT NULL REFERENCES regions (id)
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER        NOT NULL REFERENCES categories (id),
  name        VARCHAR(255)  NOT NULL,
  description TEXT           NULL,
  price       NUMERIC(10,2) NOT NULL,
  in_stock    BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE product_suppliers (
  product_id  INTEGER       NOT NULL REFERENCES products (id),
  supplier_id INTEGER       NOT NULL REFERENCES suppliers (id),
  unit_price  NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (product_id, supplier_id)
);

CREATE TABLE orders (
  id        SERIAL PRIMARY KEY,
  region_id INTEGER        NOT NULL REFERENCES regions (id),
  status    VARCHAR(32)    NOT NULL DEFAULT 'new',
  total     NUMERIC(12,2)  NOT NULL DEFAULT 0,
  placed_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER       NOT NULL REFERENCES orders (id),
  product_id INTEGER       NOT NULL REFERENCES products (id),
  quantity   INTEGER       NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL
);

-- The query runner's fixture. Kept so `apps/api/test/query.test.ts` has a table
-- to read and prove a refused write left the row count alone.
CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  region     TEXT NOT NULL
);

-- Postgres does not index the referencing side of a foreign key on its own, and
-- an entity-relationship diagram that hides its indexes is hiding real schema.
CREATE INDEX suppliers_region_idx  ON suppliers  (region_id);
CREATE INDEX products_category_idx ON products   (category_id);
CREATE INDEX orders_region_idx     ON orders     (region_id);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);
CREATE INDEX orders_status_idx     ON orders     (status);