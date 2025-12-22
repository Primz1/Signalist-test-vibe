'use client'

import { NAV_ITEMS } from "@/lib/constants"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { SearchCommand } from "./SearchCommand"
import { addToWatchlist } from "@/lib/actions/watchlist.actions"
import { useTransition } from "react"
import { toast } from "sonner"

const NavItems = ({ initialStocks, watchlistSymbols }: { initialStocks: StockWithWatchlistStatus[]; watchlistSymbols?: string[] }) => {
    const pathname: string = usePathname()
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleQuickAdd = (stock: StockWithWatchlistStatus) => {
        startTransition(async () => {
            const res = await addToWatchlist(stock.symbol, stock.name);
            if (!res.success) {
                toast.error(res.message || 'Failed to add to watchlist');
                return false;
            }
            toast.success(`${stock.symbol} added to watchlist`);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('watchlist:added', { detail: { symbol: stock.symbol, company: stock.name } }));
            }
            if (pathname === '/watchlist') {
                router.refresh();
            }
            return true;
        })
    }

    const isActive = (path: string) => {
        if (path === '/') return pathname === '/';

        return pathname.startsWith(path);
    }
    return (
        <ul className="flex flex-col sm:flex-row p-2 gap-3 sm:gap-10 font-medium">
            {NAV_ITEMS.map(({ href, label }) => {
                if (href === '/search') return (
                    <li key="search-trigger">
                        <SearchCommand
                            renderAs="text"
                            label={isPending ? "Working..." : "Search"}
                            initialStocks={initialStocks}
                            watchlistSymbols={watchlistSymbols}
                            quickAddEnabled
                            onQuickAdd={handleQuickAdd}
                        />
                    </li>
                )
                return <li key={href}>
                    <Link href={href} className={`hover:text-yellow-500 transition-colors ${isActive(href) ? 'text-gray-100' : ''
                        }`}>
                        {label}
                    </Link>
                </li>

            })}

        </ul>
    )
}

export default NavItems

