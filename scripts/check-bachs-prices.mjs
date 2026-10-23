// The app advertises the prices in its environment; Bachs charges its own
// catalogue. A mismatch means the customer is charged something the app did
// not promise, so the deploy stops here rather than shipping the difference.
//
//   BACHS_BASE_URL BACHS_SECRET_KEY BACHS_CURRENCY BACHS_PRODUCT_MONTHLY
//   BACHS_PRODUCT_YEARLY BACHS_PRICE_MONTHLY BACHS_PRICE_YEARLY
//
// A plan with no product id or no advertised price is not checked: there is
// nothing to compare it with.

const baseUrl = process.env.BACHS_BASE_URL;
const apiKey = process.env.BACHS_SECRET_KEY;
const currency = process.env.BACHS_CURRENCY;

const plans = [
  {
    cadence: "monthly",
    productId: process.env.BACHS_PRODUCT_MONTHLY,
    advertised: process.env.BACHS_PRICE_MONTHLY,
  },
  {
    cadence: "yearly",
    productId: process.env.BACHS_PRODUCT_YEARLY,
    advertised: process.env.BACHS_PRICE_YEARLY,
  },
];

const problems = [];

for (const plan of plans) {
  if (!plan.productId || !plan.advertised || !baseUrl || !apiKey) {
    continue;
  }
  const response = await fetch(`${baseUrl}/v1/products/${plan.productId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    problems.push(
      `${plan.cadence}: the product could not be read (${response.status})`,
    );
    continue;
  }
  const product = await response.json();
  if (product.price?.currency !== currency) {
    problems.push(
      `${plan.cadence}: the product is priced in ${product.price?.currency}, the app says ${currency}`,
    );
  }
  if (product.price?.amount !== plan.advertised) {
    problems.push(
      `${plan.cadence}: the product costs ${product.price?.amount}, the app says ${plan.advertised}`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`[bachs] ${problem}`);
  }
  process.exit(1);
}

console.log("[bachs] the advertised prices match the catalogue");
