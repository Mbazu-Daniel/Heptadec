-- The shape from docker/initdb/01-schema.sql, spelled for MySQL and MariaDB.
--
-- 01-schema.sql spells it once for Postgres and says why the shape exists: real
-- foreign keys in both directions, a join table, and a three-hop chain, so an
-- entity-relationship diagram has something to draw. Without the same shape on
-- these engines their diagram is one lonely table, which is a different product
-- rather than the same one pointed somewhere else.
--
-- scripts/seed-test.sh pipes this into both test-stack servers. It owns the rows
-- as well as the DDL because a diagram of empty tables is not worth drawing.

DROP TABLE IF EXISTS order_items, product_suppliers, orders, products, suppliers, categories, regions, events;

CREATE TABLE regions (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(128) NOT NULL,
  email     VARCHAR(255) NULL,
  region_id INT NOT NULL,
  CONSTRAINT fk_suppliers_region FOREIGN KEY (region_id) REFERENCES regions (id)
) ENGINE=InnoDB;

CREATE TABLE products (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description VARCHAR(255) NULL,
  price       DECIMAL(10,2) NOT NULL,
  in_stock    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id)
) ENGINE=InnoDB;

CREATE TABLE product_suppliers (
  product_id  INT NOT NULL,
  supplier_id INT NOT NULL,
  unit_price  DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (product_id, supplier_id),
  CONSTRAINT fk_product_suppliers_product  FOREIGN KEY (product_id)  REFERENCES products (id),
  CONSTRAINT fk_product_suppliers_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  region_id INT NOT NULL,
  status    VARCHAR(32) NOT NULL DEFAULT 'new',
  total     DECIMAL(12,2) NOT NULL DEFAULT 0,
  placed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_region FOREIGN KEY (region_id) REFERENCES regions (id)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   INT NOT NULL,
  product_id INT NOT NULL,
  quantity   INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_order_items_order   FOREIGN KEY (order_id)   REFERENCES orders (id),
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB;

-- The query runner's fixture, kept so a refused write has a row count to check.
CREATE TABLE events (
  id         VARCHAR(16) PRIMARY KEY,
  event_name VARCHAR(64) NOT NULL,
  region     VARCHAR(32) NOT NULL
) ENGINE=InnoDB;

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
  (1, 1, 'Meridian 14', NULL, 1299.00, TRUE),
  (2, 1, 'Meridian 16', NULL, 1899.00, TRUE),
  (3, 2, 'Halden 27', '4K panel', 549.50, TRUE),
  (4, 3, 'Rack 4U', 'Eight-bay enclosure', 389.00, FALSE);

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
