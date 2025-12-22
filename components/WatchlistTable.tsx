"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { removeFromWatchlist } from "@/lib/actions/watchlist.actions";
import { toast } from "sonner";
import clsx from "clsx";
import { Star } from "lucide-react";

type WatchlistEntry = {
	_id?: string;
	symbol: string;
	company: string;
	addedAt?: string | Date;
	price?: number;
	changePercent?: number;
	marketCap?: number;
	volume?: number;
	isCrypto?: boolean;
	dayHigh?: number;
	dayLow?: number;
};

type WatchlistTableProps = {
	items: WatchlistEntry[];
	onAddAlert?: (entry: WatchlistEntry) => void;
};

const formatDate = (value?: string | Date) => {
	if (!value) return "-";
	const d = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) return "-";
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const EmptyState = () => (
	<div className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-400">
		No symbols yet. Use Add Stock to populate your watchlist.
	</div>
);

const formatNumber = (value?: number, opts: Intl.NumberFormatOptions = {}) => {
	if (value === undefined || value === null || Number.isNaN(value)) return '-';
	return new Intl.NumberFormat(undefined, opts).format(value);
};

const formatCurrency = (value?: number) => formatNumber(value, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const formatPrice = (value?: number) => {
	if (value === undefined || value === null || Number.isNaN(value)) return '-';
	return formatCurrency(value);
};

const WatchlistTable = ({ items, onAddAlert }: WatchlistTableProps) => {
	const [rows, setRows] = useState<WatchlistEntry[]>(items);
	const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		setRows(items);
	}, [items]);

	const handleRemove = (symbol: string) => {
		setPendingSymbol(symbol);
		startTransition(async () => {
			const res = await removeFromWatchlist(symbol);
			if (!res.success) {
				toast.error(res.message || "Failed to remove symbol");
				setPendingSymbol(null);
				return;
			}
			setRows((prev) => prev.filter((row) => row.symbol !== symbol));
			setPendingSymbol(null);
			toast.success(`${symbol} removed from watchlist`);
		});
	};

	const content = useMemo(() => {
		if (!rows.length) return <EmptyState />;

		return (
			<div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0c0c0f] shadow-md">
				<Table>
					<TableHeader className="bg-gray-900/60">
						<TableRow>
							<TableHead></TableHead>
							<TableHead>Assets</TableHead>
							<TableHead>Symbol</TableHead>
							<TableHead>Price</TableHead>
							<TableHead>Change</TableHead>
							<TableHead>Day High</TableHead>
							<TableHead>Day Low</TableHead>
							<TableHead className="text-right">Alert</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.symbol}>
								<TableCell className="text-left">
									<button
										onClick={() => handleRemove(row.symbol)}
										disabled={isPending && pendingSymbol === row.symbol}
										className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 transition hover:bg-amber-400/20"
										title="Remove from watchlist"
									>
										<Star className="h-4 w-4" />
									</button>
								</TableCell>
								<TableCell className="font-medium text-gray-100">{row.company}</TableCell>
								<TableCell className="text-gray-300">{row.symbol}</TableCell>
								<TableCell className="text-gray-100">{formatCurrency(row.price)}</TableCell>
								<TableCell className={clsx(
									'text-sm',
									typeof row.changePercent === 'number'
										? row.changePercent >= 0
											? 'text-emerald-400'
											: 'text-red-400'
										: 'text-gray-400'
								)}>
									{typeof row.changePercent === 'number' ? `${row.changePercent.toFixed(2)}%` : '-'}
								</TableCell>
								<TableCell className="text-gray-300">{formatPrice(row.dayHigh)}</TableCell>
								<TableCell className="text-gray-300">{formatPrice(row.dayLow)}</TableCell>
								<TableCell className="text-right">
									<Button
										variant="secondary"
										size="sm"
										className="bg-amber-400 text-black hover:bg-amber-300"
										onClick={() => onAddAlert?.(row)}
									>
										Add Alert
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		);
	}, [rows, isPending, pendingSymbol]);

	return content;
};

export default WatchlistTable;
