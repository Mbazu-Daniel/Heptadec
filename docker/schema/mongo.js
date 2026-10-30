
const COLLECTIONS = [
  "order_items",
  "product_suppliers",
  "orders",
  "products",
  "suppliers",
  "categories",
  "regions",
  "events",
];

for (const name of COLLECTIONS) {
  db.getCollection(name).deleteMany({});
}

db.regions.insertMany([
  { _id: 1, code: "eu-west-1", name: "Europe West" },
  { _id: 2, code: "us-east-1", name: "US East" },
  { _id: 3, code: "ap-south-1", name: "India South" },
]);

db.categories.insertMany([
  { _id: 1, name: "Laptops", description: "Portable machines" },
  { _id: 2, name: "Displays", description: "Monitors and panels" },
  { _id: 3, name: "Storage", description: "Drives and enclosures" },
]);

db.suppliers.insertMany([
  { _id: 1, name: "Northwind Components", email: "orders@northwind.example", region_id: 1 },
  { _id: 2, name: "Pacific Parts", email: "sales@pacific.example", region_id: 3 },
  { _id: 3, name: "Atlantic Supply", email: "hello@atlantic.example", region_id: 2 },
]);

db.products.insertMany([
  { _id: 1, category_id: 1, name: "Meridian 14", description: null, price: 1299.0, in_stock: true },
  { _id: 2, category_id: 1, name: "Meridian 16", description: null, price: 1899.0, in_stock: true },
  { _id: 3, category_id: 2, name: "Halden 27", description: "4K panel", price: 549.5, in_stock: true },
  { _id: 4, category_id: 3, name: "Rack 4U", description: "Eight-bay enclosure", price: 389.0, in_stock: false },
]);

db.product_suppliers.insertMany([
  { _id: 1, product_id: 1, supplier_id: 1, unit_price: 1120.0 },
  { _id: 2, product_id: 1, supplier_id: 2, unit_price: 1155.0 },
  { _id: 3, product_id: 3, supplier_id: 3, unit_price: 470.0 },
  { _id: 4, product_id: 4, supplier_id: 2, unit_price: 340.0 },
]);

db.orders.insertMany([
  { _id: 1, region_id: 1, status: "delivered", total: 1299.0 },
  { _id: 2, region_id: 2, status: "queued", total: 549.5 },
  { _id: 3, region_id: 3, status: "delivered", total: 4189.0 },
]);

db.order_items.insertMany([
  { _id: 1, order_id: 1, product_id: 1, quantity: 1, unit_price: 1299.0 },
  { _id: 2, order_id: 2, product_id: 3, quantity: 1, unit_price: 549.5 },
  { _id: 3, order_id: 3, product_id: 1, quantity: 1, unit_price: 1299.0 },
  { _id: 4, order_id: 3, product_id: 2, quantity: 1, unit_price: 1899.0 },
  { _id: 5, order_id: 3, product_id: 4, quantity: 1, unit_price: 389.0 },
]);

db.events.insertMany([
  { _id: "a91f", event_name: "checkout", region: "eu-west-1" },
  { _id: "b204", event_name: "signup", region: "us-east-1" },
  { _id: "c77e", event_name: "checkout", region: "eu-west-1" },
  { _id: "d013", event_name: "refund", region: "ap-south-1" },
]);
