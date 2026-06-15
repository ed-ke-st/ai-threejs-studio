import { nanoid } from "nanoid";
import type postgres from "postgres";
import type { BillingOrder, BillingStatus, CreditBalance, CreditPackage } from "@ai-threejs-studio/shared";
import { config } from "./config.js";
import { getSql } from "./db.js";

type DbSql = postgres.Sql | postgres.TransactionSql;

export interface CreditReservation {
  id: string;
  credits: number;
}

export interface BillingService {
  packages(): CreditPackage[];
  status(userId: string): Promise<BillingStatus>;
  consume(userId: string, credits: number, reason: string): Promise<CreditReservation>;
  refund(userId: string, reservation: CreditReservation): Promise<void>;
  createPayPalOrder(userId: string, packageId: string): Promise<BillingOrder>;
  capturePayPalOrder(userId: string, orderId: string): Promise<BillingOrder>;
  handlePayPalWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<void>;
}

const DISABLED_BALANCE: CreditBalance = { enabled: false, bonus: 0, paid: 0, total: 0 };

export class NoopBillingService implements BillingService {
  packages(): CreditPackage[] {
    return [];
  }
  async status(): Promise<BillingStatus> {
    return { credits: DISABLED_BALANCE, packages: [] };
  }
  async consume(): Promise<CreditReservation> {
    throw new Error("Platform credits are not enabled.");
  }
  async refund(): Promise<void> {}
  async createPayPalOrder(): Promise<BillingOrder> {
    throw new Error("Billing is not enabled.");
  }
  async capturePayPalOrder(): Promise<BillingOrder> {
    throw new Error("Billing is not enabled.");
  }
  async handlePayPalWebhook(): Promise<void> {}
}

export class PostgresBillingService implements BillingService {
  constructor(private readonly sql: postgres.Sql) {}

  packages(): CreditPackage[] {
    return config.billing.packages;
  }

  async status(userId: string): Promise<BillingStatus> {
    await this.grantBonusIfNeeded(userId);
    return { credits: await this.balance(userId), packages: this.packages() };
  }

  async consume(userId: string, credits: number, reason: string): Promise<CreditReservation> {
    if (!Number.isInteger(credits) || credits <= 0) throw new Error("Invalid credit amount.");
    const id = `${reason}-${nanoid(12)}`;
    await this.grantBonusIfNeeded(userId);
    await this.sql.begin(async (tx) => {
      const row = await this.lockBalance(tx, userId);
      if (row.bonus_credits + row.paid_credits < credits) {
        throw new Error(`Not enough platform credits. Need ${credits}, have ${row.bonus_credits + row.paid_credits}.`);
      }
      const fromBonus = Math.min(row.bonus_credits, credits);
      const fromPaid = credits - fromBonus;
      await tx`
        update credit_balances
        set bonus_credits = bonus_credits - ${fromBonus},
            paid_credits = paid_credits - ${fromPaid},
            updated_at = now()
        where user_id = ${userId}
      `;
      if (fromBonus > 0) await this.insertLedger(tx, userId, "bonus", -fromBonus, "consume", id, { reason });
      if (fromPaid > 0) await this.insertLedger(tx, userId, "paid", -fromPaid, "consume", id, { reason });
    });
    return { id, credits };
  }

  async refund(userId: string, reservation: CreditReservation): Promise<void> {
    await this.sql.begin(async (tx) => {
      await this.lockBalance(tx, userId);
      const consumed = await tx<{ credit_type: "paid" | "bonus"; amount: number }[]>`
        select credit_type, -amount as amount
        from credit_ledger
        where user_id = ${userId}
          and reason = 'consume'
          and reference_id = ${reservation.id}
          and amount < 0
      `;
      if (consumed.length === 0) return;
      const alreadyRefunded = await tx`
        select 1 from credit_ledger
        where user_id = ${userId}
          and reason = 'refund'
          and reference_id = ${reservation.id}
        limit 1
      `;
      if (alreadyRefunded.length > 0) return;
      const paid = consumed.filter((row) => row.credit_type === "paid").reduce((sum, row) => sum + Number(row.amount), 0);
      const bonus = consumed.filter((row) => row.credit_type === "bonus").reduce((sum, row) => sum + Number(row.amount), 0);
      await this.ensureBalance(tx, userId);
      await tx`
        update credit_balances
        set paid_credits = paid_credits + ${paid},
            bonus_credits = bonus_credits + ${bonus},
            updated_at = now()
        where user_id = ${userId}
      `;
      if (bonus > 0) await this.insertLedger(tx, userId, "bonus", bonus, "refund", reservation.id, {});
      if (paid > 0) await this.insertLedger(tx, userId, "paid", paid, "refund", reservation.id, {});
    });
  }

  async createPayPalOrder(userId: string, packageId: string): Promise<BillingOrder> {
    const pack = this.packageById(packageId);
    const accessToken = await this.paypalAccessToken();
    const id = nanoid(14);
    const order = await this.paypalRequest<Record<string, unknown>>("/v2/checkout/orders", accessToken, {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `order_${id}`
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: pack.id,
            description: `${pack.label} generation credits`,
            amount: {
              currency_code: pack.currency,
              value: (pack.amountCents / 100).toFixed(2)
            }
          }
        ]
      })
    });
    const paypalOrderId = stringField(order.id);
    if (!paypalOrderId) throw new Error("PayPal order did not include an id.");
    const approvalUrl = approvalLink(order);
    await this.sql`
      insert into paypal_orders (
        id, user_id, package_id, credits, amount_cents, currency,
        paypal_order_id, status, approval_url, raw
      ) values (
        ${id}, ${userId}, ${pack.id}, ${pack.credits}, ${pack.amountCents}, ${pack.currency},
        ${paypalOrderId}, ${stringField(order.status) || "CREATED"}, ${approvalUrl}, ${JSON.stringify(order)}::jsonb
      )
    `;
    return { id, paypalOrderId, status: stringField(order.status) || "CREATED", approvalUrl, package: pack };
  }

  async capturePayPalOrder(userId: string, orderId: string): Promise<BillingOrder> {
    const [stored] = await this.sql<PayPalOrderRow[]>`
      select * from paypal_orders where id = ${orderId} and user_id = ${userId} limit 1
    `;
    if (!stored) throw new Error("Order not found.");
    const pack = this.packageById(stored.package_id);
    if (stored.credited_at) return rowToBillingOrder(stored, pack);
    const accessToken = await this.paypalAccessToken();
    const capture = await this.paypalRequest<Record<string, unknown>>(`/v2/checkout/orders/${stored.paypal_order_id}/capture`, accessToken, {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `capture_${stored.id}`
      },
      body: "{}"
    });
    if (captureStatus(capture) !== "COMPLETED") {
      await this.sql`
        update paypal_orders
        set status = ${captureStatus(capture) || "CAPTURE_PENDING"},
            raw = ${JSON.stringify(capture)}::jsonb,
            updated_at = now()
        where id = ${stored.id}
      `;
      throw new Error("PayPal order was not completed.");
    }
    await this.creditCapturedOrder(stored.paypal_order_id, capture);
    const [updated] = await this.sql<PayPalOrderRow[]>`
      select * from paypal_orders where id = ${orderId} and user_id = ${userId} limit 1
    `;
    return rowToBillingOrder(updated ?? stored, pack);
  }

  async handlePayPalWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<void> {
    if (!config.billing.paypal.webhookId) return;
    await this.verifyWebhook(headers, event);
    const record = event as Record<string, unknown>;
    const eventType = stringField(record.event_type);
    const resource = isRecord(record.resource) ? record.resource : {};
    if (eventType === "CHECKOUT.ORDER.APPROVED") {
      const orderId = stringField(resource.id);
      if (orderId) {
        await this.sql`
          update paypal_orders
          set status = 'APPROVED',
              raw = ${JSON.stringify(event)}::jsonb,
              updated_at = now()
          where paypal_order_id = ${orderId}
            and credited_at is null
        `;
      }
    }
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = stringField(resource.supplementary_data?.related_ids?.order_id);
      if (orderId) await this.creditCapturedOrder(orderId, event);
    }
    if (eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
      await this.markOrderForReview(resource, eventType, event);
    }
    if (eventType === "CUSTOMER.DISPUTE.CREATED" || eventType === "CUSTOMER.DISPUTE.RESOLVED") {
      await this.markOrderForReview(resource, eventType, event);
    }
  }

  private async creditCapturedOrder(paypalOrderId: string, raw: unknown): Promise<void> {
    await this.sql.begin(async (tx) => {
      const [order] = await tx<PayPalOrderRow[]>`
        select * from paypal_orders where paypal_order_id = ${paypalOrderId} for update
      `;
      if (!order || order.credited_at) return;
      const details = captureDetails(raw);
      if (details.status !== "COMPLETED") throw new Error("PayPal capture is not completed.");
      if (details.amountCents !== order.amount_cents || details.currency !== order.currency.toUpperCase()) {
        throw new Error("PayPal capture amount does not match the purchased credit package.");
      }
      await this.ensureBalance(tx, order.user_id);
      await tx`
        update credit_balances
        set paid_credits = paid_credits + ${order.credits},
            updated_at = now()
        where user_id = ${order.user_id}
      `;
      await this.insertLedger(tx, order.user_id, "paid", order.credits, "purchase", order.paypal_order_id, {
        packageId: order.package_id,
        orderId: order.id
      });
      await tx`
        update paypal_orders
        set status = 'COMPLETED',
            paypal_capture_id = ${captureId(raw)},
            credited_at = now(),
            updated_at = now(),
            raw = ${JSON.stringify(raw)}::jsonb
        where id = ${order.id}
      `;
    });
  }

  private async grantBonusIfNeeded(userId: string): Promise<void> {
    const amount = config.billing.freeCredits;
    await this.sql.begin(async (tx) => {
      await this.ensureBalance(tx, userId);
      const [row] = await tx<{ bonus_granted_at: string | null }[]>`
        select bonus_granted_at from credit_balances where user_id = ${userId} for update
      `;
      if (row?.bonus_granted_at || amount <= 0) return;
      await tx`
        update credit_balances
        set bonus_credits = bonus_credits + ${amount},
            bonus_granted_at = now(),
            updated_at = now()
        where user_id = ${userId}
      `;
      await this.insertLedger(tx, userId, "bonus", amount, "signup_bonus", "initial", {});
    });
  }

  private async balance(userId: string): Promise<CreditBalance> {
    const [row] = await this.sql<{ paid_credits: number; bonus_credits: number }[]>`
      select paid_credits, bonus_credits from credit_balances where user_id = ${userId}
    `;
    const paid = row ? Number(row.paid_credits) : 0;
    const bonus = row ? Number(row.bonus_credits) : 0;
    return { enabled: true, paid, bonus, total: paid + bonus };
  }

  private async ensureBalance(sql: DbSql, userId: string): Promise<void> {
    await sql`
      insert into credit_balances (user_id) values (${userId})
      on conflict (user_id) do nothing
    `;
  }

  private async lockBalance(sql: DbSql, userId: string): Promise<{ paid_credits: number; bonus_credits: number }> {
    await this.ensureBalance(sql, userId);
    const [row] = await sql<{ paid_credits: number; bonus_credits: number }[]>`
      select paid_credits, bonus_credits from credit_balances where user_id = ${userId} for update
    `;
    return row ?? { paid_credits: 0, bonus_credits: 0 };
  }

  private async insertLedger(sql: DbSql, userId: string, creditType: "paid" | "bonus", amount: number, reason: string, referenceId: string | null, metadata: Record<string, unknown>): Promise<void> {
    await sql`
      insert into credit_ledger (id, user_id, credit_type, amount, reason, reference_id, metadata)
      values (${nanoid(16)}, ${userId}, ${creditType}, ${amount}, ${reason}, ${referenceId}, ${JSON.stringify(metadata)}::jsonb)
      on conflict do nothing
    `;
  }

  private packageById(id: string): CreditPackage {
    const pack = this.packages().find((item) => item.id === id);
    if (!pack) throw new Error("Unknown credit package.");
    return pack;
  }

  private paypalBaseUrl(): string {
    return config.billing.paypal.environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private paypalConfigured(): { clientId: string; clientSecret: string } {
    const { clientId, clientSecret } = config.billing.paypal;
    if (!clientId || !clientSecret) throw new Error("PayPal is not configured.");
    return { clientId, clientSecret };
  }

  private async paypalAccessToken(): Promise<string> {
    const { clientId, clientSecret } = this.paypalConfigured();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(`${this.paypalBaseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    if (!response.ok) throw new Error(`PayPal auth failed (${response.status}).`);
    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) throw new Error("PayPal auth returned no access token.");
    return data.access_token;
  }

  private async paypalRequest<T>(path: string, accessToken: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.paypalBaseUrl()}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = isRecord(data) && typeof data.message === "string" ? data.message : `PayPal request failed (${response.status}).`;
      throw new Error(message);
    }
    return data as T;
  }

  private async verifyWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<void> {
    const accessToken = await this.paypalAccessToken();
    const header = (name: string) => {
      const value = headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value ?? "";
    };
    const result = await this.paypalRequest<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", accessToken, {
      method: "POST",
      body: JSON.stringify({
        auth_algo: header("paypal-auth-algo"),
        cert_url: header("paypal-cert-url"),
        transmission_id: header("paypal-transmission-id"),
        transmission_sig: header("paypal-transmission-sig"),
        transmission_time: header("paypal-transmission-time"),
        webhook_id: config.billing.paypal.webhookId,
        webhook_event: event
      })
    });
    if (result.verification_status !== "SUCCESS") throw new Error("Invalid PayPal webhook signature.");
  }

  private async markOrderForReview(resource: Record<string, any>, status: string, raw: unknown): Promise<void> {
    const captureId = stringField(resource.id) || stringField(resource.disputed_transactions?.[0]?.seller_transaction_id);
    const orderId = stringField(resource.supplementary_data?.related_ids?.order_id);
    if (!captureId && !orderId) return;
    await this.sql`
      update paypal_orders
      set status = ${status},
          raw = ${JSON.stringify(raw)}::jsonb,
          updated_at = now()
      where (${captureId} <> '' and paypal_capture_id = ${captureId})
         or (${orderId} <> '' and paypal_order_id = ${orderId})
    `;
  }
}

interface PayPalOrderRow {
  id: string;
  user_id: string;
  package_id: string;
  credits: number;
  amount_cents: number;
  currency: string;
  paypal_order_id: string;
  paypal_capture_id: string | null;
  status: string;
  approval_url: string | null;
  credited_at: string | null;
}

function rowToBillingOrder(row: PayPalOrderRow, pack: CreditPackage): BillingOrder {
  return {
    id: row.id,
    paypalOrderId: row.paypal_order_id,
    status: row.status,
    approvalUrl: row.approval_url ?? "",
    package: pack
  };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function approvalLink(order: Record<string, unknown>): string {
  const links = Array.isArray(order.links) ? order.links : [];
  for (const link of links) {
    if (isRecord(link) && link.rel === "approve" && typeof link.href === "string") return link.href;
  }
  throw new Error("PayPal order did not include an approval URL.");
}

function captureId(value: unknown): string | null {
  const details = captureDetails(value);
  if (details.id) return details.id;
  const record = isRecord(value) ? value : {};
  const units = Array.isArray(record.purchase_units) ? record.purchase_units : [];
  const first = isRecord(units[0]) ? units[0] : {};
  const captures = Array.isArray(first.payments?.captures) ? first.payments.captures : [];
  const capture = isRecord(captures[0]) ? captures[0] : {};
  return stringField(capture.id) || null;
}

function captureStatus(value: unknown): string {
  return captureDetails(value).status;
}

function captureDetails(value: unknown): { id: string | null; status: string; amountCents: number | null; currency: string | null } {
  const record = isRecord(value) ? value : {};
  const resource = isRecord(record.resource) ? record.resource : record;
  const units = Array.isArray(record.purchase_units) ? record.purchase_units : [];
  const firstUnit = isRecord(units[0]) ? units[0] : {};
  const captures = Array.isArray(firstUnit.payments?.captures) ? firstUnit.payments.captures : [];
  const nestedCapture = isRecord(captures[0]) ? captures[0] : {};
  const capture = isRecord(record.resource) ? resource : stringField(nestedCapture.status) ? nestedCapture : resource;
  const amount = isRecord(capture.amount) ? capture.amount : {};
  return {
    id: stringField(capture.id) || null,
    status: stringField(capture.status),
    amountCents: amountCents(stringField(amount.value)),
    currency: stringField(amount.currency_code).toUpperCase() || null
  };
}

function amountCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

export function createBillingService(): BillingService {
  if (!config.auth.enabled || !config.auth.allowPlatformKeys || !config.supabaseDbUrl) return new NoopBillingService();
  return new PostgresBillingService(getSql());
}
