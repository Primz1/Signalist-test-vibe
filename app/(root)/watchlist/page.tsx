import { getNews, searchStocks, fetchJSON } from "@/lib/actions/finnhub.actions";
import { listWatchlist, listWatchlistSymbols } from "@/lib/actions/watchlist.actions";
import { listAlerts } from "@/lib/actions/alert.actions";
import { getNotifications } from "@/lib/actions/alertNotification.actions";
import WatchlistClient, { WatchlistEntry } from "./WatchlistClient";

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

const getToken = () => process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

type QuoteResponse = {
  c?: number; // current price
  dp?: number; // percent change
  v?: number; // volume
  h?: number; // day high
  l?: number; // day low
};

type ProfileResponse = {
  marketCapitalization?: number;
  name?: string;
  ticker?: string;
};

type MetricResponse = {
  metric?: {
    peNormalizedAnnual?: number;
  };
};

type BinanceTicker = {
  lastPrice?: string;
  priceChangePercent?: string;
  volume?: string; // base asset volume
  quoteVolume?: string; // quote asset volume
  highPrice?: string;
  lowPrice?: string;
};

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
      const data = (await res.json()) as BinanceTicker;
      const price = data.lastPrice ? Number(data.lastPrice) : undefined;
      const changePercent = data.priceChangePercent ? Number(data.priceChangePercent) : undefined;
      const volume = data.quoteVolume ? Number(data.quoteVolume) : data.volume ? Number(data.volume) : undefined;
      const dayHigh = data.highPrice ? Number(data.highPrice) : undefined;
      const dayLow = data.lowPrice ? Number(data.lowPrice) : undefined;
      if (price !== undefined || changePercent !== undefined || volume !== undefined || dayHigh !== undefined || dayLow !== undefined) {
        return { price, changePercent, volume, dayHigh, dayLow } as Partial<WatchlistEntry>;
      }
    } catch {
      continue;
    }
  }

  return {} as Partial<WatchlistEntry>;
};

const fetchMetricsForSymbol = async (symbol: string) => {
  const token = getToken();
  if (!token && !isCryptoSymbol(symbol)) return {} as Partial<WatchlistEntry>;

  const isCrypto = isCryptoSymbol(symbol);
  const symbolCandidates: string[] = [];

  if (isCrypto) {
    const upper = symbol.toUpperCase();
    symbolCandidates.push(`BINANCE:${upper}`);
    symbolCandidates.push(upper);
  } else {
    symbolCandidates.push(symbol);
  }

  try {
    if (isCrypto) {
      const fromBinance = await fetchBinanceTicker(symbol);
      return { ...fromBinance, isCrypto, marketCap: undefined, peRatio: undefined } as Partial<WatchlistEntry>;
    }

    let quote: QuoteResponse | undefined;
    let profile: ProfileResponse | undefined;
    let metric: MetricResponse | undefined;

    for (const candidate of symbolCandidates) {
      if (!quote) {
        try {
          quote = await fetchJSON<QuoteResponse>(`${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(candidate)}&token=${token}`, 120);
        } catch {}
      }

      if (!isCrypto && !profile) {
        try {
          profile = await fetchJSON<ProfileResponse>(`${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(candidate)}&token=${token}`, 3600);
        } catch {}
      }

      if (!isCrypto && !metric) {
        try {
          metric = await fetchJSON<MetricResponse>(`${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(candidate)}&metric=all&token=${token}`, 3600);
        } catch {}
      }
    }

    return {
      price: quote?.c,
      changePercent: quote?.dp,
      volume: quote?.v,
      dayHigh: quote?.h,
      dayLow: quote?.l,
      marketCap: isCrypto ? undefined : profile?.marketCapitalization,
      peRatio: isCrypto ? undefined : metric?.metric?.peNormalizedAnnual,
      isCrypto,
    } as Partial<WatchlistEntry>;
  } catch (err) {
    console.error('fetchMetricsForSymbol error', symbol, err);
    return {} as Partial<WatchlistEntry>;
  }
};

const WatchlistPage = async () => {
  const [watchlistRes, symbolsRes, alertsRes, notificationsRes] = await Promise.all([
    listWatchlist(),
    listWatchlistSymbols(),
    listAlerts(),
    getNotifications(),
  ]);
  const itemsRaw = watchlistRes.success ? watchlistRes.data : [];
  const symbols = (symbolsRes.success ? symbolsRes.data : []).map((s: string) => s.toUpperCase());
  const alertsRaw = alertsRes.success ? alertsRes.data : [];
  const notificationsRaw = notificationsRes.success ? notificationsRes.data : [];

  const metricsBySymbol: Record<string, Partial<WatchlistEntry>> = {};
  if (symbols.length > 0) {
    const metrics = await Promise.all(symbols.map((sym) => fetchMetricsForSymbol(sym)));
    symbols.forEach((sym, idx) => {
      metricsBySymbol[sym] = metrics[idx] || {};
    });
  }

  const watchlistItems: WatchlistEntry[] = itemsRaw.map((item) => {
    const symbolUpper = (item.symbol || '').toUpperCase();
    const metrics = metricsBySymbol[symbolUpper] ?? {};
    const isCrypto = metrics.isCrypto ?? isCryptoSymbol(symbolUpper);
    return {
      _id: typeof item._id === 'object' && 'toString' in item._id ? (item._id as any).toString() : (item._id as any) ?? undefined,
      symbol: symbolUpper,
      company: item.company,
      addedAt: item.addedAt ? new Date(item.addedAt).toISOString() : null,
      price: metrics.price,
      changePercent: metrics.changePercent,
      marketCap: metrics.marketCap,
      peRatio: metrics.peRatio,
      volume: metrics.volume,
      dayHigh: metrics.dayHigh,
      dayLow: metrics.dayLow,
      isCrypto,
    };
  }).map((w) => ({ ...w }));

  const alerts = alertsRaw.map((item: any) => ({
    _id: typeof item._id === 'object' && 'toString' in item._id ? (item._id as any).toString() : (item._id as any) ?? undefined,
    symbol: (item.symbol || '').toUpperCase(),
    company: item.company,
    alertName: item.alertName,
    alertType: item.alertType ?? 'price',
    condition: item.condition,
    threshold: item.threshold,
    frequency: item.frequency,
    isActive: item.isActive,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
    lastTriggeredAt: item.lastTriggeredAt ? new Date(item.lastTriggeredAt).toISOString() : undefined,
    lastNotifiedAt: item.lastNotifiedAt ? new Date(item.lastNotifiedAt).toISOString() : undefined,
    lastPrice: item.lastPrice,
    lastChangePercent: item.lastChangePercent,
  })).map((a) => ({ ...a }));

  const notifications = notificationsRaw.map((n: any) => ({
    _id: typeof n._id === 'object' && 'toString' in n._id ? (n._id as any).toString() : (n._id as any) ?? undefined,
    alertId: typeof n.alertId === 'object' && 'toString' in n.alertId ? (n.alertId as any).toString() : String(n.alertId ?? ''),
    symbol: (n.symbol || '').toUpperCase(),
    company: n.company,
    message: n.message,
    price: n.price,
    changePercent: n.changePercent,
    triggeredAt: n.triggeredAt ? new Date(n.triggeredAt).toISOString() : new Date().toISOString(),
    read: Boolean(n.read),
  })).map((n) => ({ ...n }));

  const initialStocks = await searchStocks(undefined, symbols);
  const news = await getNews(symbols.slice(0, 6));

  return (
    <WatchlistClient
      initialItems={watchlistItems}
      initialStocks={initialStocks}
      initialSymbols={symbols}
      initialAlerts={alerts}
      initialNotifications={notifications}
      initialNews={news}
    />
  );
};

export default WatchlistPage;
