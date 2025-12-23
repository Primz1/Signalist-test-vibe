import { inngest } from "@/lib/inngest/client";
import { connectToDatabase } from "@/database/mongoose";
import { listActiveAlerts, Alert } from "@/database/models/alert.model";
import { addAlertNotification } from "@/database/models/alertNotification.model";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const getToken = () => process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? "";
const isCryptoSymbol = (symbol: string) => /USDT$|USDC$|BTC$|ETH$|BNB$/i.test(symbol);

const fetchBinanceTicker = async (symbol: string) => {
  const upper = symbol.toUpperCase();
  const endpoints = [
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(upper)}`,
    `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${encodeURIComponent(upper)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const price = data?.lastPrice ? Number(data.lastPrice) : undefined;
      const changePercent = data?.priceChangePercent ? Number(data.priceChangePercent) : undefined;
      if (price !== undefined) return { price, changePercent } as const;
    } catch {
      continue;
    }
  }
  return null;
};

const fetchFinnhubQuote = async (symbol: string) => {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const price = typeof data?.c === "number" ? data.c : undefined;
    const changePercent = typeof data?.dp === "number" ? data.dp : undefined;
    if (price !== undefined) return { price, changePercent } as const;
    return null;
  } catch {
    return null;
  }
};

const fetchYahooQuote = async (symbol: string) => {
  const upper = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(upper)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const quote = data?.quoteResponse?.result?.[0];
    const price = typeof quote?.regularMarketPrice === 'number' ? quote.regularMarketPrice : undefined;
    const changePercent = typeof quote?.regularMarketChangePercent === 'number' ? quote.regularMarketChangePercent : undefined;
    if (price !== undefined) return { price, changePercent } as const;
    return null;
  } catch {
    return null;
  }
};

const fetchPrice = async (symbol: string) => {
  if (isCryptoSymbol(symbol)) {
    return fetchBinanceTicker(symbol);
  }
  const finnhubQuote = await fetchFinnhubQuote(symbol);
  if (finnhubQuote) return finnhubQuote;
  return fetchYahooQuote(symbol);
};

const shouldNotify = (frequency: 'once' | 'per_hour' | 'per_day', lastNotifiedAt?: Date) => {
  if (!lastNotifiedAt) return true;
  const now = Date.now();
  const last = new Date(lastNotifiedAt).getTime();
  const diff = now - last;
  if (frequency === 'once') return false;
  if (frequency === 'per_hour') return diff >= 60 * 60 * 1000;
  if (frequency === 'per_day') return diff >= 24 * 60 * 60 * 1000;
  return true;
};

const evaluateAlerts = async (alerts: Awaited<ReturnType<typeof listActiveAlerts>>) => {
  if (!alerts || alerts.length === 0) return { success: true, triggered: 0, message: "No active alerts" };

  const symbols = Array.from(new Set(alerts.map((a) => a.symbol?.toUpperCase()).filter(Boolean)));
  const priceMap = new Map<string, { price?: number; changePercent?: number }>();

  const results = await Promise.all(
    symbols.map(async (sym) => {
      const data = await fetchPrice(sym);
      return { sym, data } as const;
    })
  );
  results.forEach(({ sym, data }) => {
    if (data) priceMap.set(sym, data);
  });

  const now = new Date();
  let triggered = 0;

  for (const alert of alerts) {
    const symUpper = (alert.symbol || "").toUpperCase();
    const quote = priceMap.get(symUpper);
    if (!quote?.price) continue;

    const hit = alert.condition === "gt" ? quote.price >= alert.threshold : quote.price <= alert.threshold;
    if (!hit) continue;
    if (!shouldNotify(alert.frequency, alert.lastNotifiedAt)) continue;

    try {
      await addAlertNotification({
        userId: alert.userId,
        alertId: String(alert._id),
        symbol: symUpper,
        company: alert.company,
        message: `${symUpper} is ${alert.condition === "gt" ? "above" : "below"} ${alert.threshold}`,
        price: quote.price,
        changePercent: quote.changePercent,
        triggeredAt: now,
      });
    } catch (err) {
      console.error("alert notification insert failed", alert._id, err);
    }

    try {
      await Alert.updateOne(
        { _id: alert._id },
        {
          $set: {
            lastTriggeredAt: now,
            lastNotifiedAt: now,
            lastPrice: quote.price,
            lastChangePercent: quote.changePercent,
            ...(alert.frequency === "once" ? { isActive: false } : {}),
          },
        }
      );
    } catch (err) {
      console.error("alert update failed", alert._id, err);
    }

    triggered += 1;
  }

  return { success: true, triggered };
};

export const runAlertSweep = async () => {
  await connectToDatabase();
  const alerts = await listActiveAlerts();
  return evaluateAlerts(alerts);
};

export const checkPriceAlerts = inngest.createFunction(
  { id: "check-price-alerts" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    await connectToDatabase();
    const alerts = await step.run("load-active-alerts", listActiveAlerts);
    return step.run("evaluate-alerts", () => evaluateAlerts(alerts as Awaited<ReturnType<typeof listActiveAlerts>>));
  }
);
