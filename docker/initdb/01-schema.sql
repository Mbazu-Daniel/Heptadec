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

CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  region     TEXT NOT NULL
);

CREATE INDEX suppliers_region_idx  ON suppliers  (region_id);
CREATE INDEX products_category_idx ON products   (category_id);
CREATE INDEX orders_region_idx     ON orders     (region_id);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);
CREATE INDEX orders_status_idx     ON orders     (status);
