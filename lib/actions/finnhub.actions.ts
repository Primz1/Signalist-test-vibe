'use server';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { POPULAR_CRYPTO_SYMBOLS, POPULAR_STOCK_SYMBOLS } from '@/lib/constants';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
  const options: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
    ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
    : { cache: 'no-store' };

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fetch failed ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export { fetchJSON };

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
  try {
    const range = getDateRange(5);
    const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      throw new Error('FINNHUB API key is not configured');
    }
    const cleanSymbols = (symbols || [])
      .map((s) => s?.trim().toUpperCase())
      .filter((s): s is string => Boolean(s));

    const maxArticles = 6;

    if (cleanSymbols.length > 0) {
      const perSymbolArticles: Record<string, RawNewsArticle[]> = {};

      await Promise.all(
        cleanSymbols.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}&token=${token}`;
            const articles = await fetchJSON<RawNewsArticle[]>(url, 300);
            perSymbolArticles[sym] = (articles || []).filter(validateArticle);
          } catch (e) {
            console.error('Error fetching company news for', sym, e);
            perSymbolArticles[sym] = [];
          }
        })
      );

      const collected: MarketNewsArticle[] = [];
      for (let round = 0; round < maxArticles; round++) {
        for (let i = 0; i < cleanSymbols.length; i++) {
          const sym = cleanSymbols[i];
          const list = perSymbolArticles[sym] || [];
          if (list.length === 0) continue;
          const article = list.shift();
          if (!article || !validateArticle(article)) continue;
          collected.push(formatArticle(article, true, sym, round));
          if (collected.length >= maxArticles) break;
        }
        if (collected.length >= maxArticles) break;
      }

      if (collected.length > 0) {
        collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
        return collected.slice(0, maxArticles);
      }
    }

    const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
    const general = await fetchJSON<RawNewsArticle[]>(generalUrl, 300);

    const seen = new Set<string>();
    const unique: RawNewsArticle[] = [];
    for (const art of general || []) {
      if (!validateArticle(art)) continue;
      const key = `${art.id}-${art.url}-${art.headline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(art);
      if (unique.length >= 20) break;
    }

    const formatted = unique.slice(0, maxArticles).map((a, idx) => formatArticle(a, false, undefined, idx));
    return formatted;
  } catch (err) {
    console.error('getNews error:', err);
    throw new Error('Failed to fetch news');
  }
}

const COMMON_CRYPTO_QUOTES = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB'];

const formatCryptoPair = (rawPair?: string) => {
  if (!rawPair) return 'Crypto';
  const pair = rawPair.toUpperCase();
  const quote = COMMON_CRYPTO_QUOTES.find((q) => pair.endsWith(q));
  if (!quote) return pair;
  const base = pair.slice(0, pair.length - quote.length);
  return base ? `${base} / ${quote}` : pair;
};

type FinnhubCryptoSymbol = {
  symbol: string;
  displaySymbol: string;
  description: string;
  exchange: string;
};

type FinnhubSearchResultWithExchange = FinnhubSearchResult & { __exchange?: string };

async function fetchCryptoSymbols(exchange: string): Promise<FinnhubCryptoSymbol[]> {
  const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!token) {
    console.error('Crypto symbols fetch failed: FINNHUB API key is not configured');
    return [];
  }

  const url = `${FINNHUB_BASE_URL}/crypto/symbol?exchange=${encodeURIComponent(exchange)}&token=${token}`;
  try {
    return await fetchJSON<FinnhubCryptoSymbol[]>(url, 3600);
  } catch (err) {
    console.error('Error fetching crypto symbols for', exchange, err);
    return [];
  }
}
const toWatchlistSet = (symbols?: string[]) => {
  const set = new Set<string>();
  (symbols || []).forEach((s) => {
    if (s) set.add(s.trim().toUpperCase());
  });
  return set;
};

export const searchStocks = async (query?: string, watchlistSymbols?: string[]): Promise<StockWithWatchlistStatus[]> => {
  try {
    const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
      return [];
    }

    const watchlistSet = toWatchlistSet(watchlistSymbols);

    const trimmed = typeof query === 'string' ? query.trim() : '';
    let results: FinnhubSearchResultWithExchange[] = [];

    if (!trimmed) {
      const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
      const profiles = await Promise.all(
        top.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
            const profile = await fetchJSON<any>(url, 3600);
            return { sym, profile };
          } catch (e: any) {
            const status = e?.response?.status ?? e?.status;
            if (status === 429) {
              console.warn('Profile fetch rate-limited for', sym);
              return { sym, profile: null };
            }
            console.error('Error fetching profile2 for', sym, e);
            return { sym, profile: null };
          }
        })
      );

      const stockResults = profiles.reduce<FinnhubSearchResultWithExchange[]>((acc, { sym, profile }) => {
        const symbol = sym.toUpperCase();
        const name: string | undefined = profile?.name || profile?.ticker;
        if (!name) return acc;
        acc.push({
          symbol,
          description: name,
          displaySymbol: symbol,
          type: 'Common Stock',
          __exchange: profile?.exchange,
        });
        return acc;
      }, []);

      const cryptoSymbols = await fetchCryptoSymbols('BINANCE');
      const cryptoResults: FinnhubSearchResultWithExchange[] = cryptoSymbols
        .filter((item) => POPULAR_CRYPTO_SYMBOLS.includes(item.symbol))
        .map((item) => {
          const [exchangePart, pair] = item.symbol.split(':');
          return {
            symbol: (pair || item.symbol).toUpperCase(),
            description: item.description || formatCryptoPair(pair || item.symbol),
            displaySymbol: pair || item.symbol,
            type: 'Crypto',
            __exchange: item.exchange || exchangePart,
          };
        });

      results = [...stockResults, ...cryptoResults];
    } else {
      const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
      const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
      const upperQuery = trimmed.toUpperCase();

      results = Array.isArray(data?.result)
        ? (data.result as FinnhubSearchResultWithExchange[])
        : [];

      const cryptoSymbols = await fetchCryptoSymbols('BINANCE');
      const cryptoMatches = cryptoSymbols.filter((item) => {
        const pair = (item.symbol.split(':')[1] || item.symbol).toUpperCase();
        const desc = (item.description || '').toUpperCase();
        return pair.includes(upperQuery) || desc.includes(upperQuery);
      });

      const cryptoResults: FinnhubSearchResultWithExchange[] = cryptoMatches.map((item) => {
        const [exchangePart, pair] = item.symbol.split(':');
        return {
          symbol: (pair || item.symbol).toUpperCase(),
          description: item.description || formatCryptoPair(pair || item.symbol),
          displaySymbol: pair || item.symbol,
          type: 'Crypto',
          __exchange: item.exchange || exchangePart,
        };
      });

      results = [...results, ...cryptoResults];
    }

    const mapped = results
      .map((r) => {
        const symbol = (r.symbol || '').toUpperCase();
        if (!symbol) return undefined;
        const exchangeFromDisplay = (r.displaySymbol as string | undefined) || undefined;
        const exchange = exchangeFromDisplay || r.__exchange || 'US';
        return {
          symbol,
          name: r.description || symbol,
          exchange,
          type: r.type || 'Stock',
          isInWatchlist: watchlistSet.has(symbol),
        } as StockWithWatchlistStatus;
      })
      .filter((item): item is StockWithWatchlistStatus => Boolean(item));

    const deduped: StockWithWatchlistStatus[] = [];
    const seen = new Set<string>();
    for (const item of mapped) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      deduped.push(item);
      if (deduped.length >= 15) break;
    }

    return deduped;
  } catch (err) {
    console.error('Error in stock search:', err);
    return [];
  }
};