-- The shape from docker/initdb/01-schema.sql, spelled for SQLite and LibSQL.
--
-- The foreign keys are declared inline, which is all SQLite supports, and that
-- is what PRAGMA foreign_key_list reports back — enough for the diagram to draw
-- the same edges Postgres draws. SQLite only enforces them when
-- PRAGMA foreign_keys is on, and this fixture never violates them either way.
--
-- scripts/seed-test.sh posts this to the test-stack server. It owns the rows as
-- well as the DDL because a diagram of empty tables is not worth drawing.

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS product_suppliers;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS regions;
DROP TABLE IF EXISTS events;

CREATE TABLE regions (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NULL
);

CREATE TABLE suppliers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  email     TEXT NULL,
  region_id INTEGER NOT NULL REFERENCES regions (id)
);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories (id),
  name        TEXT NOT NULL,
  description TEXT NULL,
  price       NUMERIC(10,2) NOT NULL,
  in_stock    BOOLEAN NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_suppliers (
  product_id  INTEGER NOT NULL REFERENCES products (id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers (id),
  unit_price  NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (product_id, supplier_id)
);

CREATE TABLE orders (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id INTEGER NOT NULL REFERENCES regions (id),
  status    TEXT NOT NULL DEFAULT 'new',
  total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  placed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  quantity   INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL
);

-- The query runner's fixture, kept so a refused write has a row count to check.
CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  region     TEXT NOT NULL
);

CREATE INDEX suppliers_region_idx   ON suppliers   (region_id);
CREATE INDEX products_category_idx  ON products    (category_id);
CREATE INDEX orders_region_idx      ON orders      (region_id);
CREATE INDEX order_items_order_idx  ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);
CREATE INDEX orders_status_idx      ON orders      (status);

INSERT INTO regions (id, code, name) VALUES
  (1, 'eu-west-1', 'Europe West'),
  (2, 'us-east-1', 'US East'),
  (3, 'ap-south-1', 'India South');

INSERT INTO categories (id, name, description) VALUES
  (1, 'Laptops', 'Portable machines'),
  (2, 'Displays', 'Monitors and panels'),
  (3, 'Storage', 'Drives and enclosures');

INSERT INTO suppliers (id, name, email, region_id) VALUES
  (1, 'Northwind Components', 'orders@northwind.example', 1),
  (2, 'Pacific Parts', 'sales@pacific.example', 3),
  (3, 'Atlantic Supply', 'hello@atlantic.example', 2);

INSERT INTO products (id, category_id, name, description, price, in_stock) VALUES
  (1, 1, 'Meridian 14', NULL, 1299.00, 1),
  (2, 1, 'Meridian 16', NULL, 1899.00, 1),
  (3, 2, 'Halden 27', '4K panel', 549.50, 1),
  (4, 3, 'Rack 4U', 'Eight-bay enclosure', 389.00, 0);

INSERT INTO product_suppliers (product_id, supplier_id, unit_price) VALUES
  (1, 1, 1120.00),
  (1, 2, 1155.00),
  (3, 3, 470.00),
  (4, 2, 340.00);

INSERT INTO orders (id, region_id, status, total) VALUES
  (1, 1, 'delivered', 1299.00),
  (2, 2, 'queued', 549.50),
  (3, 3, 'delivered', 4189.00);

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES
  (1, 1, 1, 1, 1299.00),
  (2, 2, 3, 1, 549.50),
  (3, 3, 1, 1, 1299.00),
  (4, 3, 2, 1, 1899.00),
  (5, 3, 4, 1, 389.00);

INSERT INTO events (id, event_name, region) VALUES
  ('a91f', 'checkout', 'eu-west-1'),
  ('b204', 'signup', 'us-east-1'),
  ('c77e', 'checkout', 'eu-west-1'),
  ('d013', 'refund', 'ap-south-1');
