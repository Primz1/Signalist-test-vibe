"use client"

import { MouseEvent, useEffect, useMemo, useState } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import { Button } from "./ui/button"
import { Loader2, Star, TrendingUp } from "lucide-react"
import { searchStocks } from "@/lib/actions/finnhub.actions"
import { useDebounce } from "@/hooks/useDebounce"
import clsx from "clsx"
import Link from "next/link"
import { toast } from "sonner"

type SearchCommandProps = {
  renderAs?: "button" | "text" | "icon";
  label?: string;
  initialStocks: StockWithWatchlistStatus[];
  watchlistSymbols?: string[];
  onSelectStock?: (stock: StockWithWatchlistStatus) => Promise<void> | void;
  mode?: "link" | "add";
  quickAddEnabled?: boolean;
  onQuickAdd?: (stock: StockWithWatchlistStatus) => Promise<boolean> | Promise<void> | void;
};

const RECENT_STOCKS_KEY = 'signalist_recent_stocks'
const MAX_RECENT_STOCKS = 10

export function SearchCommand({ renderAs = 'button', label = 'Add stock', initialStocks, watchlistSymbols, onSelectStock, mode, quickAddEnabled, onQuickAdd }: SearchCommandProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<StockWithWatchlistStatus[]>(initialStocks)
  const [recentStocks, setRecentStocks] = useState<StockWithWatchlistStatus[]>(initialStocks.slice(0, MAX_RECENT_STOCKS))
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null)
  const [localWatchlistSet, setLocalWatchlistSet] = useState<Set<string>>(new Set())

  const isSearchMode = !!searchTerm.trim();
  const displayStocks = isSearchMode ? searchResults : recentStocks;


  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])


  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(RECENT_STOCKS_KEY) : null;
      if (stored) {
        const parsed = JSON.parse(stored) as StockWithWatchlistStatus[];
        if (Array.isArray(parsed)) {
          setRecentStocks(parsed.slice(0, MAX_RECENT_STOCKS));
          setSearchResults(initialStocks);
          return;
        }
      }
    } catch (error) {
      console.warn('Failed to load recent stocks from storage', error);
    }

    setRecentStocks(initialStocks.slice(0, MAX_RECENT_STOCKS));
    setSearchResults(initialStocks);
  }, [initialStocks])

  useEffect(() => {
    if (!watchlistSymbols) return;
    const set = new Set(watchlistSymbols.map((s) => s.toUpperCase()))
    setLocalWatchlistSet(set);
    setRecentStocks((prev) => prev.map((item) => ({ ...item, isInWatchlist: set.has(item.symbol) })))
    setSearchResults((prev) => prev.map((item) => ({ ...item, isInWatchlist: set.has(item.symbol) })))
  }, [watchlistSymbols])


  const handleSearch = async () => {
    if(!isSearchMode) {
      setSearchResults(initialStocks);
      return;
    }

    setLoading(true);
    try {
      const results = await searchStocks(searchTerm.trim(), watchlistSymbols);
      setSearchResults(results);
    } catch {
      setSearchResults([])
    } finally {
      setLoading(false);
    }

  }


  const debouncedSearch = useDebounce(handleSearch, 300);
  
  useEffect(() => {
    debouncedSearch();
  }, [searchTerm]);


  const persistRecentStocks = (items: StockWithWatchlistStatus[]) => {
    setRecentStocks(items);
    try {
      localStorage.setItem(RECENT_STOCKS_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn('Failed to save recent stocks', error);
    }
  }

  const handleSelectStock = async (stock: StockWithWatchlistStatus, e?: MouseEvent) => {
    if (onSelectStock) {
      e?.preventDefault();
      setAddingSymbol(stock.symbol);
      try {
        await onSelectStock(stock);
      } finally {
        setAddingSymbol(null);
      }
    }

    setOpen(false)
    setSearchTerm("");
    setSearchResults(initialStocks);
    const next = [stock, ...recentStocks.filter((item) => item.symbol !== stock.symbol)].slice(0, MAX_RECENT_STOCKS);
    persistRecentStocks(next);

    // mark as in-watchlist locally
    setLocalWatchlistSet((prev) => {
      const copy = new Set(prev);
      copy.add(stock.symbol.toUpperCase());
      setRecentStocks((cur) => cur.map((item) => item.symbol === stock.symbol ? { ...item, isInWatchlist: true } : item));
      setSearchResults((cur) => cur.map((item) => item.symbol === stock.symbol ? { ...item, isInWatchlist: true } : item));
      return copy;
    });
  }

  const handleQuickAdd = async (stock: StockWithWatchlistStatus, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onQuickAdd) return;
    setAddingSymbol(stock.symbol);
    try {
      const res = await onQuickAdd(stock);
      if (res !== false) {
        setLocalWatchlistSet((prev) => {
          const copy = new Set(prev);
          copy.add(stock.symbol.toUpperCase());
          setRecentStocks((cur) => cur.map((item) => item.symbol === stock.symbol ? { ...item, isInWatchlist: true } : item));
          setSearchResults((cur) => cur.map((item) => item.symbol === stock.symbol ? { ...item, isInWatchlist: true } : item));
          return copy;
        });
        toast.success(`${stock.symbol} added to watchlist`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add');
    } finally {
      setAddingSymbol(null);
    }
  };

  const watchlistSet = useMemo(() => {
    if (localWatchlistSet.size) return localWatchlistSet;
    return new Set(watchlistSymbols?.map((s) => s.toUpperCase()) ?? []);
  }, [localWatchlistSet, watchlistSymbols]);

  const resolvedMode: "link" | "add" = onSelectStock ? mode || "add" : "link";

  return (
    <>
      {renderAs === 'text' && (
        <span onClick={() => setOpen(true)} className="search-text">
          {label}
        </span>
      )}
      {renderAs === 'button' && (
        <Button onClick={() => setOpen(true)} className="search-btn">
          {label}
        </Button>
      )}
      {renderAs === 'icon' && (
        <Button
          onClick={() => setOpen(true)}
          variant="secondary"
          className="h-9 w-9 rounded-full bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
        >
          <Star className="h-4 w-4" />
        </Button>
      )}
      <CommandDialog open={open} onOpenChange={setOpen} className="search-dialog">
          <div className="search-field">
            <CommandInput value={searchTerm} onValueChange={setSearchTerm} placeholder="Search stocks..." className="search-input" />
            {loading && <Loader2 className="search-loader" />}
          </div>
        <CommandList className="search-list">
          {loading ?(
            <CommandEmpty className="search-list-empty">Loading stocks...</CommandEmpty>
          ) : displayStocks?.length === 0 ? (
            <div className="search-list-indicator">
              {isSearchMode ? 'No results found': 'No stocks available'}

            </div>
          ) : (
            <ul>
              <div className="search-count">
                {isSearchMode ? 'Search Results': 'Popular Stocks'}
               {`  `}({displayStocks?.length || 0})
              </div>
              {displayStocks?.map((stock) => (
                <li key={stock.symbol} className="search-item">
                  {resolvedMode === "add" ? (
                    <button
                      className="search-item-link"
                      onClick={(e) => handleSelectStock(stock, e)}
                      disabled={addingSymbol === stock.symbol}
                    >
                      <TrendingUp className="h-4 w-4 text-gray-500" />
                      <div className="flex-1 text-left">
                        <div className="search-item-name flex items-center gap-2">
                          {stock.name}
                          {(stock.isInWatchlist || watchlistSet.has(stock.symbol)) && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-[2px] text-[11px] text-emerald-300">
                              In watchlist
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {stock.symbol} | {stock.exchange} | {stock.type}
                        </div>
                      </div>
                      <span
                        className={clsx(
                          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 transition hover:bg-amber-400/20",
                          addingSymbol === stock.symbol && "opacity-70"
                        )}
                        title="Add to watchlist"
                      >
                        {addingSymbol === stock.symbol ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Star className="h-4 w-4" />
                        )}
                      </span>
                    </button>
                  ) : (
                    <div className="search-item-link">
                      <Link href={`/stocks/${stock.symbol}`} className="flex flex-1 items-center gap-3" onClick={() => handleSelectStock(stock)}>
                        <TrendingUp className="h-4 w-4 text-gray-500" />
                        <div className="flex-1 text-left">
                          <div className="search-item-name flex items-center gap-2">
                            {stock.name}
                            {(stock.isInWatchlist || watchlistSet.has(stock.symbol)) && (
                              <span className="rounded-full bg-emerald-500/10 px-2 py-[2px] text-[11px] text-emerald-300">
                                In watchlist
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {stock.symbol} | {stock.exchange} | {stock.type}
                          </div>
                        </div>
                      </Link>
                      {quickAddEnabled && onQuickAdd && (
                        <button
                          className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 transition hover:bg-amber-400/20"
                          onClick={(e) => handleQuickAdd(stock, e)}
                          disabled={addingSymbol === stock.symbol}
                          title="Add to watchlist"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      {!quickAddEnabled && (
                        <span className="text-xs font-medium text-amber-400">Open</span>
                      )}
                    </div>
                  )}
                </li>
                ))}
            </ul>
            
          )} 
        </CommandList>
      </CommandDialog>
    </>
  )
}