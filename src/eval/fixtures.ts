export interface EvalCase {
  id: string;
  changelogEntry: string;
  methodName: string;
  beforeCode: string;
  // Substrings the patched code must contain / must no longer contain for
  // the case to count as a pass. Heuristic, not semantic — good enough to
  // catch "didn't even try" and "left the old call in place" failures.
  mustContain: string[];
  mustNotContain: string[];
}

/**
 * Starter set of real, well-documented Stripe API migrations. Replace or
 * extend this with 10-15 historical breaking changes for whatever SDK
 * you're actually tracking (see TARGET_PACKAGE_REPO in .env) — these are
 * just enough to prove the harness itself works.
 */
export const cases: EvalCase[] = [
  {
    id: "charges-to-payment-intents",
    changelogEntry:
      "`charges.create` is legacy. Use `paymentIntents.create` instead.",
    methodName: "charges.create",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function charge(amount) {
  return stripe.charges.create({
    amount,
    currency: "usd",
    source: "tok_visa",
  });
}
`,
    mustContain: ["paymentIntents.create"],
    mustNotContain: ["charges.create"],
  },
  {
    id: "sources-to-payment-methods",
    changelogEntry:
      "`sources.create` is legacy. Use `paymentMethods.create` instead.",
    methodName: "sources.create",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function addCard(token) {
  return stripe.sources.create({
    type: "card",
    token,
  });
}
`,
    mustContain: ["paymentMethods.create"],
    mustNotContain: ["sources.create"],
  },
  {
    id: "plans-to-prices",
    changelogEntry:
      "`plans.create` is legacy. Use `prices.create` instead.",
    methodName: "plans.create",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createPlan() {
  return stripe.plans.create({
    amount: 1000,
    currency: "usd",
    interval: "month",
    product: "prod_123",
  });
}
`,
    mustContain: ["prices.create"],
    mustNotContain: ["plans.create"],
  },
  {
    id: "orders-to-checkout-sessions",
    changelogEntry:
      "The legacy Orders API (`orders.create`) is shut down. Use `checkout.sessions.create` instead.",
    methodName: "orders.create",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function placeOrder(items) {
  return stripe.orders.create({ items });
}
`,
    mustContain: ["checkout.sessions.create"],
    mustNotContain: ["orders.create"],
  },
  {
    id: "subscription-plan-to-price",
    changelogEntry:
      "Subscription items no longer accept a `plan` field. Use `price` instead.",
    methodName: "subscriptions.create",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function subscribe(customerId, planId) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ plan: planId }],
  });
}
`,
    mustContain: ["price:"],
    mustNotContain: ["plan:"],
  },
];
