-- The shape from docker/initdb/01-schema.sql, spelled for ClickHouse.
--
-- MergeTree has no foreign keys, so this is the same eight tables with the same
-- columns and the same ordering keys but no declared relationships: the diagram
-- draws the tables and the app reports zero edges, which is the truth about the
-- engine rather than a reduced view of it.
--
-- scripts/seed-test.sh pipes this into the test-stack server. It owns the rows
-- as well as the DDL because a diagram of empty tables is not worth drawing.

DROP TABLE IF EXISTS order_items, product_suppliers, orders, products, suppliers, categories, regions, events;

CREATE TABLE regions (
  id   UInt32,
  code String,
  name String
) ENGINE = MergeTree() ORDER BY id;

CREATE TABLE categories (
  id          UInt32,
  name        String,
  description Nullable(String)
) ENGINE = MergeTree() ORDER BY id;

CREATE TABLE suppliers (
  id        UInt32,
  name      String,
  email     Nullable(String),
  region_id UInt32
) ENGINE = MergeTree() ORDER BY id;

CREATE TABLE products (
  id          UInt32,
  category_id UInt32,
  name        String,
  description Nullable(String),
  price       Decimal(10,2),
  in_stock    UInt8,
  created_at  DateTime DEFAULT now()
) ENGINE = MergeTree() ORDER BY id;

CREATE TABLE product_suppliers (
  product_id  UInt32,
  supplier_id UInt32,
  unit_price  Decimal(10,2)
) ENGINE = MergeTree() ORDER BY (product_id, supplier_id);

CREATE TABLE orders (
  id        UInt32,
  region_id UInt32,
  status    String DEFAULT 'new',
  total     Decimal(12,2) DEFAULT 0,
  placed_at DateTime DEFAULT now()
) ENGINE = MergeTree() ORDER BY id;

CREATE TABLE order_items (
  id         UInt32,
  order_id   UInt32,
  product_id UInt32,
  quantity   Int32 DEFAULT 1,
  unit_price Decimal(10,2)
) ENGINE = MergeTree() ORDER BY id;

-- The query runner's fixture, kept so a refused write has a row count to check.
CREATE TABLE events (
  id         String,
  event_name String,
  region     String
) ENGINE = MergeTree() ORDER BY id;

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
