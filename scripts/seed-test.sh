#!/usr/bin/env bash
set -euo pipefail

COMPOSE="docker compose -f docker-compose.test.yml"
DEADLINE=180

wait_for() {
  local label="$1"
  shift
  local start
  start=$(date +%s)
  until "$@" >/dev/null 2>&1; do
    if [ $(( $(date +%s) - start )) -ge "$DEADLINE" ]; then
      echo "seed: timed out waiting for ${label}" >&2
      exit 1
    fi
    sleep 2
  done
  echo "seed: ${label} is up"
}

echo "seed: waiting for services"
wait_for "postgres" $COMPOSE exec -T postgres-test pg_isready -U heptadec -d heptadec_test
wait_for "mysql" $COMPOSE exec -T mysql-test mysqladmin ping -h 127.0.0.1 -uheptadec -pDelta1force
wait_for "mariadb" $COMPOSE exec -T mariadb-test mariadb-admin ping -h 127.0.0.1 -uheptadec -pDelta1force
wait_for "redis" $COMPOSE exec -T redis-test redis-cli ping
wait_for "clickhouse" $COMPOSE exec -T clickhouse-test wget -q -O /dev/null http://127.0.0.1:8123/ping
wait_for "libsql" curl -sf http://127.0.0.1:8081/health
wait_for "mongo" $COMPOSE exec -T mongo-test mongosh --quiet --eval "db.adminCommand('ping')"
wait_for "quickwit" curl -sf http://127.0.0.1:7282/health/livez

echo "seed: postgres"
$COMPOSE exec -T postgres-test psql -U heptadec -d heptadec_test -q -v ON_ERROR_STOP=1 <<'SQL'
DROP TABLE IF EXISTS order_items, product_suppliers, orders, products, suppliers, categories, regions, events;
SQL
$COMPOSE exec -T postgres-test psql -U heptadec -d heptadec_test -q -v ON_ERROR_STOP=1 < docker/initdb/01-schema.sql
$COMPOSE exec -T postgres-test psql -U heptadec -d heptadec_test -q -v ON_ERROR_STOP=1 <<'SQL'
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
  (1, 1, 'Meridian 14', NULL, 1299.00, true),
  (2, 1, 'Meridian 16', NULL, 1899.00, true),
  (3, 2, 'Halden 27', '4K panel', 549.50, true),
  (4, 3, 'Rack 4U', 'Eight-bay enclosure', 389.00, false);

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
SQL

echo "seed: mysql"
$COMPOSE exec -T mysql-test mysql -uheptadec -pDelta1force heptadec_test < docker/schema/mysql.sql

echo "seed: mariadb"
$COMPOSE exec -T mariadb-test mariadb -uheptadec -pDelta1force heptadec_test < docker/schema/mysql.sql

echo "seed: redis"
$COMPOSE exec -T redis-test redis-cli FLUSHALL
$COMPOSE exec -T redis-test redis-cli <<'REDIS'
HSET event:a91f event_name checkout region eu-west-1
HSET event:b204 event_name signup region us-east-1
HSET event:c77e event_name checkout region eu-west-1
HSET event:d013 event_name refund region ap-south-1
REDIS

echo "seed: clickhouse"
$COMPOSE exec -T clickhouse-test clickhouse-client --user heptadec --password Delta1force --database heptadec_test --queries-file /dev/stdin < docker/schema/clickhouse.sql

echo "seed: libsql"
node scripts/seed-libsql.mjs docker/schema/sqlite.sql http://127.0.0.1:8081/

echo "seed: mongo"
$COMPOSE exec -T mongo-test mongosh -u heptadec -p Delta1force --authenticationDatabase admin heptadec_test --quiet --file /dev/stdin < docker/schema/mongo.js

echo "seed: quickwit"
curl -sf -X DELETE http://127.0.0.1:7282/api/v1/indexes/events >/dev/null || true
curl -sf -X POST http://127.0.0.1:7282/api/v1/indexes -H 'content-type: application/json' \
  -d '{"version":"0.8","index_id":"events","doc_mapping":{"field_mappings":[{"name":"id","type":"text","tokenizer":"raw"},{"name":"event_name","type":"text","tokenizer":"default"},{"name":"region","type":"text","tokenizer":"raw"}],"store_source":true},"indexing_settings":{},"search_settings":{"default_search_fields":["event_name"]}}' \
  >/dev/null
curl -sf -X POST 'http://127.0.0.1:7282/api/v1/events/ingest?commit=force' -H 'content-type: application/x-ndjson' \
  -d '{"id":"a91f","event_name":"checkout","region":"eu-west-1"}
{"id":"b204","event_name":"signup","region":"us-east-1"}
{"id":"c77e","event_name":"checkout","region":"eu-west-1"}
{"id":"d013","event_name":"refund","region":"ap-south-1"}' \
  >/dev/null

echo "seed: verifying"
pg_count=$($COMPOSE exec -T postgres-test psql -U heptadec -d heptadec_test -tAc 'SELECT COUNT(*) FROM events;')
pg_fks=$($COMPOSE exec -T postgres-test psql -U heptadec -d heptadec_test -tAc "SELECT COUNT(*) FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace;")
pg_tables=$($COMPOSE exec -T postgres-test psql -U heptadec -d heptadec_test -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('regions','categories','suppliers','products','product_suppliers','orders','order_items','events');")
my_count=$($COMPOSE exec -T mysql-test mysql -uheptadec -pDelta1force heptadec_test -NBe 'SELECT COUNT(*) FROM events;')
maria_count=$($COMPOSE exec -T mariadb-test mariadb -uheptadec -pDelta1force heptadec_test -NBe 'SELECT COUNT(*) FROM events;' 2>/dev/null)
redis_count=$($COMPOSE exec -T redis-test redis-cli KEYS 'event:*' | wc -l)
ch_count=$($COMPOSE exec -T clickhouse-test clickhouse-client --user heptadec --password Delta1force --database heptadec_test --query 'SELECT COUNT(*) FROM events;')
libsql_count=$(curl -sf -X POST http://127.0.0.1:8081/ -H 'content-type: application/json' -d '{"statements":["SELECT COUNT(*) FROM events"]}' | grep -o '\[4\]' | head -1)
qw_hits=$(curl -sf -X POST http://127.0.0.1:7282/api/v1/events/search -H 'content-type: application/json' -d '{"query":"*","max_hits":10}' | grep -o '"num_hits": [0-9]*')

libsql_query() {
  curl -sf -X POST http://127.0.0.1:8081/ -H 'content-type: application/json' \
    -d "{\"statements\":[\"$1\"]}" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const box=JSON.parse(s);const one=Array.isArray(box)?box[0]:box;process.stdout.write(String(one?.results?.rows?.[0]?.[0] ?? "?"))})'
}
my_tables=$($COMPOSE exec -T mysql-test mysql -uheptadec -pDelta1force heptadec_test -NBe "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('regions','categories','suppliers','products','product_suppliers','orders','order_items','events');")
my_fks=$($COMPOSE exec -T mysql-test mysql -uheptadec -pDelta1force heptadec_test -NBe 'SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL;')
maria_tables=$($COMPOSE exec -T mariadb-test mariadb -uheptadec -pDelta1force heptadec_test -NBe "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('regions','categories','suppliers','products','product_suppliers','orders','order_items','events');" 2>/dev/null)
maria_fks=$($COMPOSE exec -T mariadb-test mariadb -uheptadec -pDelta1force heptadec_test -NBe 'SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL;' 2>/dev/null)
ch_tables=$($COMPOSE exec -T clickhouse-test clickhouse-client --user heptadec --password Delta1force --database heptadec_test --query "SELECT count() FROM system.tables WHERE database = currentDatabase() AND name IN ('regions','categories','suppliers','products','product_suppliers','orders','order_items','events')")
libsql_tables=$(libsql_query "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('regions','categories','suppliers','products','product_suppliers','orders','order_items','events')")
libsql_fks=$(libsql_query "SELECT count(*) FROM (SELECT id FROM pragma_foreign_key_list('suppliers') UNION ALL SELECT id FROM pragma_foreign_key_list('products') UNION ALL SELECT id FROM pragma_foreign_key_list('product_suppliers') UNION ALL SELECT id FROM pragma_foreign_key_list('orders') UNION ALL SELECT id FROM pragma_foreign_key_list('order_items'))")
mongo_names='["regions","categories","suppliers","products","product_suppliers","orders","order_items","events"]'
mongo_count=$($COMPOSE exec -T mongo-test mongosh -u heptadec -p Delta1force --authenticationDatabase admin heptadec_test --quiet --eval 'db.events.countDocuments()')
mongo_collections=$($COMPOSE exec -T mongo-test mongosh -u heptadec -p Delta1force --authenticationDatabase admin heptadec_test --quiet --eval "${mongo_names}.filter(n => db.getCollectionNames().includes(n)).length")
echo "seed: shape mysql=${my_tables}/${my_fks} mariadb=${maria_tables}/${maria_fks} clickhouse=${ch_tables}/0 libsql=${libsql_tables}/${libsql_fks} mongo=${mongo_collections}/0 (fixture tables/foreign keys)"

echo "seed: postgres=${pg_count} postgres_tables=${pg_tables} postgres_fks=${pg_fks} mysql=${my_count} mariadb=${maria_count} redis_keys=${redis_count} clickhouse=${ch_count} libsql=${libsql_count} mongo=${mongo_count} quickwit=${qw_hits}"
[ "${pg_count}" = "4" ] || { echo "seed: postgres count wrong" >&2; exit 1; }
[ "${pg_tables}" = "8" ] || { echo "seed: postgres table count wrong" >&2; exit 1; }
[ "${pg_fks}" = "7" ] || { echo "seed: postgres foreign key count wrong" >&2; exit 1; }
[ "${my_count}" = "4" ] || { echo "seed: mysql count wrong" >&2; exit 1; }
[ "${maria_count}" = "4" ] || { echo "seed: mariadb count wrong" >&2; exit 1; }
[ "${redis_count}" = "4" ] || { echo "seed: redis key count wrong" >&2; exit 1; }
[ "${ch_count}" = "4" ] || { echo "seed: clickhouse count wrong" >&2; exit 1; }
[ "${libsql_count}" = "[4]" ] || { echo "seed: libsql count wrong" >&2; exit 1; }
[ "${qw_hits}" = '"num_hits": 4' ] || { echo "seed: quickwit hit count wrong" >&2; exit 1; }
[ "${my_tables}" = "8" ] || { echo "seed: mysql table count wrong (${my_tables})" >&2; exit 1; }
[ "${my_fks}" = "7" ] || { echo "seed: mysql foreign key count wrong (${my_fks})" >&2; exit 1; }
[ "${maria_tables}" = "8" ] || { echo "seed: mariadb table count wrong (${maria_tables})" >&2; exit 1; }
[ "${maria_fks}" = "7" ] || { echo "seed: mariadb foreign key count wrong (${maria_fks})" >&2; exit 1; }
[ "${ch_tables}" = "8" ] || { echo "seed: clickhouse table count wrong (${ch_tables})" >&2; exit 1; }
[ "${libsql_tables}" = "8" ] || { echo "seed: libsql table count wrong (${libsql_tables})" >&2; exit 1; }
[ "${libsql_fks}" = "7" ] || { echo "seed: libsql foreign key count wrong (${libsql_fks})" >&2; exit 1; }
[ "${mongo_count}" = "4" ] || { echo "seed: mongo count wrong (${mongo_count})" >&2; exit 1; }
[ "${mongo_collections}" = "8" ] || { echo "seed: mongo collection count wrong (${mongo_collections})" >&2; exit 1; }

echo "seed: all eight engines verified"
