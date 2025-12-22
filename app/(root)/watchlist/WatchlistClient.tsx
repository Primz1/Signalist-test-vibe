"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SearchCommand } from "@/components/SearchCommand";
import WatchlistTable from "@/components/WatchlistTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addToWatchlist } from "@/lib/actions/watchlist.actions";
import { createAlert, deleteAlert, setAlertActive, runAlertSweepAction } from "@/lib/actions/alert.actions";
import { getNotifications, markNotifications } from "@/lib/actions/alertNotification.actions";
import { ArrowUpRight, Bell, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export type WatchlistEntry = {
  _id?: string;
  symbol: string;
  company: string;
  addedAt?: string | Date;
  price?: number;
  changePercent?: number;
  marketCap?: number;
  peRatio?: number;
  volume?: number;
  isCrypto?: boolean;
  dayHigh?: number;
  dayLow?: number;
};

export type AlertEntry = {
  _id?: string;
  symbol: string;
  company: string;
  alertName: string;
  alertType: "price";
  condition: "gt" | "lt";
  threshold: number;
  frequency: "once" | "per_hour" | "per_day";
  isActive?: boolean;
  createdAt?: string;
  lastTriggeredAt?: string;
  lastNotifiedAt?: string;
  lastPrice?: number;
  lastChangePercent?: number;
};

type AlertNotificationEntry = {
  _id?: string;
  alertId: string;
  symbol: string;
  company: string;
  message: string;
  price?: number;
  changePercent?: number;
  triggeredAt: string;
  read: boolean;
};

const NewsGrid = ({ articles }: { articles: MarketNewsArticle[] }) => {
  if (!articles?.length) {
    return (
      <div className="rounded-xl border border-gray-800 bg-[#0c0c0f] p-4 text-sm text-gray-400">
        No news available right now.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0c0c0f] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">News</h2>
        <span className="text-xs uppercase text-gray-500">Latest</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <Link
            key={`${article.id}-${article.url}`}
            href={article.url || "#"}
            target="_blank"
            className="group block rounded-lg border border-gray-800 bg-black/40 p-3 transition hover:border-gray-700"
          >
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{article.source}</span>
              <span>{article.datetimeString}</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-gray-100 group-hover:text-gray-50">
              {article.headline}
            </div>
            <div className="mt-1 line-clamp-3 text-xs text-gray-400">{article.summary}</div>
            <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
              Read more <ArrowUpRight className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

const AlertsPlaceholder = () => (
  <div className="h-full rounded-xl border border-gray-800 bg-[#0c0c0f] p-4 text-gray-200">
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold">Alerts</h2>
      <Button size="sm" variant="secondary" className="bg-amber-400 text-black hover:bg-amber-300">
        Create Alert
      </Button>
    </div>
    <p className="text-sm text-gray-400">Alert management UI coming soon.</p>
  </div>
);

interface WatchlistClientProps {
  initialItems: WatchlistEntry[];
  initialStocks: StockWithWatchlistStatus[];
  initialSymbols: string[];
  initialAlerts: AlertEntry[];
  initialNotifications: AlertNotificationEntry[];
  initialNews: MarketNewsArticle[];
}

const WatchlistClient = ({ initialItems, initialStocks, initialSymbols, initialAlerts, initialNotifications, initialNews }: WatchlistClientProps) => {
  const [rows, setRows] = useState<WatchlistEntry[]>(initialItems);
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [alerts, setAlerts] = useState<AlertEntry[]>(initialAlerts ?? []);
  const [notifications, setNotifications] = useState<AlertNotificationEntry[]>(initialNotifications ?? []);
  const notificationsRef = useRef<AlertNotificationEntry[]>(initialNotifications ?? []);
  const [isPending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const router = useRouter();

  const token = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  const isCryptoSymbol = (sym: string) => /USDT$|USDC$|USD$|BTC$|ETH$|BNB$/i.test(sym);
  const buildQuoteUrl = (sym: string) => {
    const upper = sym.toUpperCase();
    return `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(upper)}&token=${token}`;
  };

  const [alertName, setAlertName] = useState("");
  const [alertSymbol, setAlertSymbol] = useState<string>(initialSymbols[0] ?? "");
  const [alertCondition, setAlertCondition] = useState<"gt" | "lt">("lt");
  const [alertThreshold, setAlertThreshold] = useState<string>("");
  const [alertFrequency, setAlertFrequency] = useState<"once" | "per_hour" | "per_day">("once");
  const [isCreatingAlert, startCreatingAlert] = useTransition();

  const fetchBinanceTicker = async (sym: string) => {
    const upper = sym.toUpperCase();
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
        const volume = data?.quoteVolume ? Number(data.quoteVolume) : data?.volume ? Number(data.volume) : undefined;
        const dayHigh = data?.highPrice ? Number(data.highPrice) : undefined;
        const dayLow = data?.lowPrice ? Number(data.lowPrice) : undefined;
        if (price !== undefined || changePercent !== undefined || volume !== undefined || dayHigh !== undefined || dayLow !== undefined) {
          return { price, changePercent, volume, dayHigh, dayLow } as const;
        }
      } catch {
        continue;
      }
    }

    return null;
  };

  const refreshQuotes = async (targetSymbols?: string[]) => {
    const list = (targetSymbols ?? symbols).map((s) => s.toUpperCase());
    if (!list.length) return;

    setRefreshing(true);
    try {
      const results = await Promise.all(
        list.map(async (sym) => {
          if (isCryptoSymbol(sym)) {
            const data = await fetchBinanceTicker(sym);
            return { sym, data } as const;
          }

          if (!token) return { sym, data: null } as const;

          try {
            const res = await fetch(buildQuoteUrl(sym), { cache: 'no-store' });
            if (!res.ok) return { sym, data: null } as const;
            const data = await res.json();
            return { sym, data } as const;
          } catch {
            return { sym, data: null } as const;
          }
        })
      );

      setRows((prev) =>
        prev.map((row) => {
          const symUpper = row.symbol.toUpperCase();
          const hit = results.find((r) => r.sym === symUpper);
          if (!hit?.data) return row;
          const price = typeof hit.data.c === 'number' ? hit.data.c : typeof hit.data.price === 'number' ? hit.data.price : row.price;
          const changePercent = typeof hit.data.dp === 'number' ? hit.data.dp : typeof hit.data.changePercent === 'number' ? hit.data.changePercent : row.changePercent;
          const volume = typeof hit.data.v === 'number' ? hit.data.v : typeof hit.data.volume === 'number' ? hit.data.volume : row.volume;
          const dayHigh = typeof hit.data.h === 'number' ? hit.data.h : typeof hit.data.dayHigh === 'number' ? hit.data.dayHigh : row.dayHigh;
          const dayLow = typeof hit.data.l === 'number' ? hit.data.l : typeof hit.data.dayLow === 'number' ? hit.data.dayLow : row.dayLow;
          return { ...row, price, changePercent, volume, dayHigh, dayLow };
        })
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleAdd = async (stock: StockWithWatchlistStatus) => {
    setRefreshing(true);
    const res = await addToWatchlist(stock.symbol, stock.name);
    if (!res.success) {
      toast.error(res.message || "Failed to add to watchlist");
      setRefreshing(false);
      return;
    }

    setRows((prev) => {
      if (prev.some((row) => row.symbol === stock.symbol)) return prev;
      const symUpper = stock.symbol.toUpperCase();
      return [{ symbol: symUpper, company: stock.name, addedAt: new Date().toISOString(), isCrypto: isCryptoSymbol(symUpper) }, ...prev];
    });
    setSymbols((prev) => {
      const symUpper = stock.symbol.toUpperCase();
      return prev.includes(symUpper) ? prev : [...prev, symUpper];
    });
    toast.success(`${stock.symbol.toUpperCase()} added to watchlist`);

    // Grab fresh quote immediately for the added symbol
    await refreshQuotes([stock.symbol]);

    startTransition(() => {
      router.refresh();
      setRefreshing(false);
    });
  };

  useEffect(() => {
    refreshQuotes();
    const interval = setInterval(() => refreshQuotes(), 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join('|')]);

  useEffect(() => {
    if (!alertSymbol && symbols.length) {
      setAlertSymbol(symbols[0]);
    }
  }, [alertSymbol, symbols]);

  const priceLookup = useMemo(() => {
    const map = new Map<string, { price?: number; changePercent?: number }>();
    rows.forEach((row) => map.set(row.symbol.toUpperCase(), { price: row.price, changePercent: row.changePercent }));
    return map;
  }, [rows]);

  const resolveCompany = (sym: string) => {
    const hit = rows.find((row) => row.symbol.toUpperCase() === sym.toUpperCase());
    return hit?.company || sym;
  };

  const resetAlertForm = () => {
    setAlertName("");
    setAlertThreshold("");
    setAlertCondition("lt");
    setAlertFrequency("once");
  };

  const openAlertFor = (entry: WatchlistEntry) => {
    setAlertSymbol(entry.symbol.toUpperCase());
    setAlertName(`${entry.symbol.toUpperCase()} alert`);
    setAlertThreshold(entry.price ? String(entry.price) : "");
    setAlertModalOpen(true);
  };

  const handleCreateAlert = () => {
    const thresholdValue = Number(alertThreshold);
    if (!Number.isFinite(thresholdValue)) {
      toast.error("Enter a numeric threshold");
      return;
    }
    if (!alertSymbol) {
      toast.error("Select a symbol");
      return;
    }

    startCreatingAlert(async () => {
      const res = await createAlert({
        symbol: alertSymbol,
        company: resolveCompany(alertSymbol),
        alertName: alertName.trim() || `${alertSymbol} alert`,
        alertType: "price",
        condition: alertCondition,
        threshold: thresholdValue,
        frequency: alertFrequency,
      });
      if (!res.success) {
        toast.error(res.message || "Failed to create alert");
        return;
      }

      const newAlert: AlertEntry = {
        _id: (res.data as any)._id ? String((res.data as any)._id) : (res.data as any).id,
        symbol: res.data.symbol.toUpperCase(),
        company: res.data.company,
        alertName: res.data.alertName,
        alertType: res.data.alertType ?? "price",
        condition: res.data.condition,
        threshold: res.data.threshold,
        frequency: res.data.frequency,
        isActive: res.data.isActive,
        createdAt: (res.data as any).createdAt ?? new Date().toISOString(),
      };

      setAlerts((prev) => [newAlert, ...prev]);
      setAlertModalOpen(false);
      resetAlertForm();
      toast.success("Alert created");
      runAlertSweepAction();
    });
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!alertId) return;
    setRefreshing(true);
    try {
      const res = await deleteAlert(alertId);
      if (!res.success) {
        toast.error(res.message || "Failed to remove alert");
        return;
      }
      setAlerts((prev) => prev.filter((a) => a._id !== alertId));
      toast.success("Alert removed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleAlert = async (alertId: string, isActive: boolean) => {
    const res = await setAlertActive(alertId, isActive);
    if (!res.success) {
      toast.error(res.message || "Failed to update alert");
      return;
    }
    setAlerts((prev) => prev.map((a) => (a._id === alertId ? { ...a, isActive } : a)));
    toast.success(isActive ? "Alert resumed" : "Alert paused");
  };

  const conditionLabel = (cond: "gt" | "lt") => (cond === "gt" ? "Greater than (>)" : "Less than (<)");
  const frequencyLabel = (freq: "once" | "per_hour" | "per_day") => {
    if (freq === "per_hour") return "Once per hour";
    if (freq === "per_day") return "Once per day";
    return "Once";
  };

  const formatPriceDisplay = (value?: number) => {
    if (value === undefined || value === null || Number.isNaN(value)) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  };

  const changeColor = (cp?: number) => {
    if (typeof cp !== "number") return "text-gray-400";
    return cp >= 0 ? "text-emerald-400" : "text-red-400";
  };

  const changeText = (cp?: number) => (typeof cp === "number" ? `${cp.toFixed(2)}%` : "-");

  const timeAgo = (iso?: string) => {
    if (!iso) return null;
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await getNotifications();
        if (!('success' in res) || !res.success) return;

        const existingIds = new Set(notificationsRef.current.map((n) => n._id || `${n.alertId}-${n.triggeredAt}`));
        const mapped = (res.data || []).map((n: any) => ({
          _id: typeof n._id === 'object' && 'toString' in n._id ? (n._id as any).toString() : (n._id as any) ?? undefined,
          alertId: typeof n.alertId === 'object' && 'toString' in n.alertId ? (n.alertId as any).toString() : String(n.alertId ?? ''),
          symbol: (n.symbol || '').toUpperCase(),
          company: n.company,
          message: n.message,
          price: n.price,
          changePercent: n.changePercent,
          triggeredAt: n.triggeredAt ? new Date(n.triggeredAt).toISOString() : new Date().toISOString(),
          read: Boolean(n.read),
        })) as AlertNotificationEntry[];

        const newOnes = mapped.filter((n) => !existingIds.has(n._id || `${n.alertId}-${n.triggeredAt}`));
        if (newOnes.length > 0) {
          newOnes.forEach((n) => toast.info(`${n.symbol}: ${n.message}`));
        }
        notificationsRef.current = mapped;
        setNotifications(mapped);
      } catch (err) {
        // silent
      }
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const runSweep = async () => {
      try {
        await runAlertSweepAction();
      } catch {
        // silent
      }
    };

    runSweep();
    const interval = setInterval(runSweep, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkNotifications = async () => {
    const res = await markNotifications();
    if (!res.success) {
      toast.error(res.message || "Failed to mark notifications");
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-50">Watchlist</h1>
          <p className="text-sm text-gray-400">Track your symbols and manage alerts.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] relative">
        {refreshing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
          </div>
        )}
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <SearchCommand
              renderAs="button"
              label={isPending ? "Loading..." : "Add to watchlist"}
              initialStocks={initialStocks}
              watchlistSymbols={symbols}
              onSelectStock={handleAdd}
              mode="add"
            />
          </div>
          <WatchlistTable items={rows} onAddAlert={openAlertFor} />
        </div>
        <div className="rounded-xl border border-gray-800 bg-[#0c0c0f] p-4 text-gray-100 shadow-md space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Alerts</h2>
              <p className="text-sm text-gray-400">Create price alerts for stocks or crypto.</p>
            </div>
            <Button
              size="sm"
              className="bg-amber-400 text-black hover:bg-amber-300"
              onClick={() => setAlertModalOpen(true)}
            >
              Create Alert
            </Button>
          </div>

          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {alerts.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-800 bg-black/30 p-4 text-sm text-gray-400">
                No alerts yet. Create one to stay notified.
              </div>
            )}
            {alerts.map((alert) => {
              const quote = priceLookup.get(alert.symbol.toUpperCase());
              return (
                <div key={alert._id || `${alert.symbol}-${alert.threshold}`} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-sm font-semibold text-amber-200">
                        {alert.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-100">{alert.company}</div>
                        <div className="text-xs text-gray-400">{alert.symbol}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gray-800 px-2 py-1 text-[11px] text-gray-200 border border-gray-700">
                        {frequencyLabel(alert.frequency)}
                      </span>
                      {!alert.isActive && (
                        <span className="rounded-full bg-red-500/10 px-2 py-1 text-[11px] text-red-300 border border-red-500/30">
                          Inactive
                        </span>
                      )}
                      {alert._id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700"
                          onClick={() => handleToggleAlert(alert._id!, !alert.isActive)}
                        >
                          {alert.isActive ? "Pause" : "Resume"}
                        </Button>
                      )}
                      {alert._id && (
                        <button
                          onClick={() => handleDeleteAlert(alert._id!)}
                          className="rounded-full border border-gray-800 p-2 text-gray-400 transition hover:text-red-300 hover:border-red-300/40"
                          title="Delete alert"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-200">
                      <Bell className="h-4 w-4 text-amber-300" />
                      <span>
                        {conditionLabel(alert.condition)} {formatPriceDisplay(alert.threshold)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-200">{formatPriceDisplay(quote?.price)}</div>
                      <div className={`text-xs ${changeColor(quote?.changePercent)}`}>{changeText(quote?.changePercent)}</div>
                      <div className="text-[11px] text-gray-500">
                        {alert.lastTriggeredAt ? `Triggered ${timeAgo(alert.lastTriggeredAt)}` : alert.isActive ? "Waiting" : "Triggered"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

          <div className="rounded-xl border border-gray-800 bg-[#0c0c0f] p-4 text-gray-100 shadow-md space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Recent Alerts</h2>
                <p className="text-sm text-gray-400">In-app notifications when alerts fire.</p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-500/15 px-2 py-1 text-[11px] text-red-300 border border-red-500/30">
                    {unreadCount} new
                  </span>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700"
                  onClick={handleMarkNotifications}
                >
                  Mark read
                </Button>
              </div>
            </div>

            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {notifications.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-800 bg-black/30 p-4 text-sm text-gray-400">
                  No alerts have fired yet.
                </div>
              )}
              {notifications.map((n) => (
                <div
                  key={n._id || `${n.alertId}-${n.triggeredAt}`}
                  className={`rounded-lg border p-3 ${n.read ? 'border-gray-800 bg-black/30' : 'border-amber-400/40 bg-amber-400/5'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-100">{n.company}</div>
                      <div className="text-xs text-gray-400">{n.symbol}</div>
                      <div className="mt-1 text-sm text-gray-100">{n.message}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {formatPriceDisplay(n.price)} {changeText(n.changePercent)}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-400">{timeAgo(n.triggeredAt) || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
      </div>

      <Dialog open={alertModalOpen} onOpenChange={setAlertModalOpen}>
        <DialogContent className="bg-[#0f0f12] border-gray-800 text-gray-50 max-w-xl">
          <DialogHeader>
            <DialogTitle>Price Alert</DialogTitle>
            <DialogDescription className="text-gray-400">
              Choose a symbol, set a condition, and we will keep an eye on it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="alertName">Alert Name</Label>
              <Input
                id="alertName"
                placeholder="Apple at Discount"
                value={alertName}
                onChange={(e) => setAlertName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Stock / Crypto</Label>
              <Select value={alertSymbol} onValueChange={setAlertSymbol}>
                <SelectTrigger className="w-full bg-[#141418] text-gray-100 border-gray-800">
                  <SelectValue placeholder="Select symbol" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f0f12] border-gray-800 text-gray-100">
                  {symbols.map((sym) => (
                    <SelectItem key={sym} value={sym}>
                      {sym}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Condition</Label>
                <Select value={alertCondition} onValueChange={(v: "gt" | "lt") => setAlertCondition(v)}>
                  <SelectTrigger className="w-full bg-[#141418] text-gray-100 border-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0f12] border-gray-800 text-gray-100">
                    <SelectItem value="gt">Greater than (&gt;)</SelectItem>
                    <SelectItem value="lt">Less than (&lt;)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Threshold value</Label>
                <Input
                  type="number"
                  placeholder="$ eg: 140"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Frequency</Label>
                <Select value={alertFrequency} onValueChange={(v: "once" | "per_hour" | "per_day") => setAlertFrequency(v)}>
                  <SelectTrigger className="w-full bg-[#141418] text-gray-100 border-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0f12] border-gray-800 text-gray-100">
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="per_hour">Once per hour</SelectItem>
                    <SelectItem value="per_day">Once per day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="bg-amber-400 text-black hover:bg-amber-300 w-full"
              onClick={handleCreateAlert}
              disabled={isCreatingAlert}
            >
              {isCreatingAlert ? "Creating..." : "Create Alert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewsGrid articles={initialNews} />
    </section>
  );
};

export default WatchlistClient;
