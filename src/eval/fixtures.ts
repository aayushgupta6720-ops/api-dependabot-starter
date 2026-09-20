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
 * Real breaking changes pulled from stripe-node's own CHANGELOG
 * (https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md), each
 * tagged with the release it shipped in. If you point TARGET_PACKAGE_REPO
 * at a different SDK, swap these out for that SDK's own history the same
 * way — grep its changelog for "breaking"/"rename"/"remove".
 */
export const cases: EvalCase[] = [
  {
    id: "v22-constructor-requires-new",
    changelogEntry:
      "v22.0.0: Stripe import is now a true ES6 class. Calling `Stripe(key)` without `new` is no longer supported — use `new Stripe(key)` instead.",
    methodName: "Stripe",
    beforeCode: `import Stripe from "stripe";

const stripeClient = Stripe(process.env.STRIPE_SECRET_KEY);

async function getBalance() {
  return stripeClient.balance.retrieve();
}
`,
    mustContain: ["new Stripe("],
    mustNotContain: ["= Stripe("],
  },
  {
    id: "v22-remove-api-key-as-string-arg",
    changelogEntry:
      "v22.0.0: Passing a plain API key string as the last argument to a method call (e.g. `stripe.customers.retrieve(id, apiKey)`) is no longer supported. Pass it via `{ apiKey }` in the RequestOptions object instead.",
    methodName: "customers.retrieve",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getCustomer(id, apiKey) {
  return stripe.customers.retrieve(id, apiKey);
}
`,
    mustContain: ["{ apiKey"], // covers both `{ apiKey }` shorthand and `{ apiKey: ... }`
    mustNotContain: ["retrieve(id, apiKey)"],
  },
  {
    id: "v22-remove-callback-support",
    changelogEntry:
      "v22.0.0: Callback support was removed. Passing a callback as the last argument to an API method (e.g. `stripe.customers.list(callback)`) is no longer supported — use async/await instead.",
    methodName: "customers.list",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function listCustomers(onDone) {
  stripe.customers.list(customers => {
    onDone(customers);
  });
}
`,
    mustContain: ["await stripe.customers.list"],
    mustNotContain: ["customers.list(customers =>"],
  },
  {
    id: "v19-parse-thin-event-renamed",
    changelogEntry:
      "v19.0.0: Renamed `StripeClient.parseThinEvent` to `StripeClient.parseEventNotification` and removed the `Stripe.ThinEvent` interface.",
    methodName: "parseThinEvent",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function handleWebhook(payload) {
  return stripe.parseThinEvent(payload);
}
`,
    mustContain: ["parseEventNotification"],
    mustNotContain: ["parseThinEvent"],
  },
  {
    id: "v18-webhooks-factory-to-property",
    changelogEntry:
      "v18.0.0: `Stripe.webhooks` is no longer a factory function, it's a plain object. Calling `Stripe.webhooks().constructEvent(...)` is no longer supported — use `Stripe.webhooks.constructEvent(...)` instead.",
    methodName: "webhooks.constructEvent",
    beforeCode: `import Stripe from "stripe";

function verifyWebhook(payload, sig, secret) {
  return Stripe.webhooks().constructEvent(payload, sig, secret);
}
`,
    mustContain: ["Stripe.webhooks.constructEvent"],
    mustNotContain: ["Stripe.webhooks().constructEvent"],
  },
  {
    id: "v17-billing-alert-usage-threshold",
    changelogEntry:
      "v17.0.0: Renamed `usage_threshold_config` to `usage_threshold` on `Billing.AlertCreateParams` and `Billing.Alert`.",
    methodName: "billing.alerts.create",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createAlert(meterId) {
  return stripe.billing.alerts.create({
    alert_type: "usage_threshold",
    usage_threshold_config: { gte: 1000, meter: meterId },
  });
}
`,
    mustContain: ["usage_threshold:"],
    mustNotContain: ["usage_threshold_config"],
  },
  {
    id: "v16-issuing-volume-to-quantity-decimal",
    changelogEntry:
      "v16.0.0: Renamed `volume_decimal` to `quantity_decimal` on Issuing fuel purchase details (e.g. `Issuing.TransactionCreateForceCaptureParams.testHelpers.purchase_details.fuel`).",
    methodName: "testHelpers.issuing.authorizations.capture",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function captureAuthorization(id) {
  return stripe.testHelpers.issuing.authorizations.capture(id, {
    purchase_details: { fuel: { volume_decimal: "10.5" } },
  });
}
`,
    mustContain: ["quantity_decimal"],
    mustNotContain: ["volume_decimal"],
  },
  {
    id: "v10-invoice-list-upcoming-lines-renamed",
    changelogEntry:
      "v10.0.0: Renamed `listUpcomingLineItems` method on the `Invoice` resource to `listUpcomingLines`.",
    methodName: "invoices.listUpcomingLineItems",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function upcomingLines(customerId) {
  return stripe.invoices.listUpcomingLineItems({ customer: customerId });
}
`,
    mustContain: ["listUpcomingLines"],
    mustNotContain: ["listUpcomingLineItems"],
  },
  {
    id: "v10-issuing-card-retrieve-details-removed",
    changelogEntry:
      "v10.0.0: Removed `retrieveDetails` method from the `Issuing.Card` resource. The method was unsupported; see https://stripe.com/docs/issuing/cards/virtual for the supported way to access card details.",
    methodName: "issuing.cards.retrieveDetails",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getCardDetails(cardId) {
  return stripe.issuing.cards.retrieveDetails(cardId);
}
`,
    mustContain: [],
    mustNotContain: ["retrieveDetails("], // only flags an actual re-invocation, not an explanatory comment
  },
  {
    id: "v6-checkout-session-renamed-and-namespaced",
    changelogEntry:
      "v6.21.0: Renamed `CheckoutSession` to `Session` and moved it under the `checkout` namespace.",
    methodName: "checkoutSessions.create",
    beforeCode: `import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createCheckoutSession(items) {
  return stripe.checkoutSessions.create({ line_items: items });
}
`,
    mustContain: ["checkout.sessions.create"],
    mustNotContain: ["checkoutSessions.create"],
  },
];
