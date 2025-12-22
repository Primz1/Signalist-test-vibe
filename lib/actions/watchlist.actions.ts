
'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/database/mongoose';
import { Watchlist, addWatchlistItem, listWatchlistItems, listWatchlistSymbols as listSymbolsOnly, removeWatchlistItem } from '@/database/models/watchlist.model';
import { auth } from '@/lib/better-auth/auth';

type ActionResult<T> = { success: true; data: T } | { success: false; message: string };

const getSessionUser = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user || null;
};

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
  if (!email) return [];

  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');

    // Better Auth stores users in the "user" collection
    const user = await db.collection('user').findOne<{ _id?: unknown; id?: string; email?: string }>({ email });

    if (!user) return [];

    const userId = (user.id as string) || String(user._id || '');
    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
    return items.map((i) => String(i.symbol));
  } catch (err) {
    console.error('getWatchlistSymbolsByEmail error:', err);
    return [];
  }
}

export async function listWatchlist(): Promise<ActionResult<WatchlistItem[]>> {
  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };

    await connectToDatabase();
    const items = await listWatchlistItems(user.id);
    return { success: true, data: items };
  } catch (err) {
    console.error('listWatchlist error:', err);
    return { success: false, message: 'Failed to load watchlist' };
  }
}

export async function listWatchlistSymbols(): Promise<ActionResult<string[]>> {
  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };

    await connectToDatabase();
    const symbols = await listSymbolsOnly(user.id);
    return { success: true, data: symbols };
  } catch (err) {
    console.error('listWatchlistSymbols error:', err);
    return { success: false, message: 'Failed to load watchlist symbols' };
  }
}

export async function addToWatchlist(symbol: string, company: string): Promise<ActionResult<WatchlistItem>> {
  if (!symbol?.trim() || !company?.trim()) {
    return { success: false, message: 'Symbol and company are required' };
  }

  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };

    await connectToDatabase();
    const { item } = await addWatchlistItem({ userId: user.id, symbol, company });
    if (!item) return { success: false, message: 'Failed to add to watchlist' };
    revalidatePath('/watchlist');
    revalidatePath('/');
    return { success: true, data: item as WatchlistItem };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to add to watchlist';
    console.error('addToWatchlist error:', err);
    return { success: false, message: msg };
  }
}

export async function removeFromWatchlist(symbol: string): Promise<ActionResult<WatchlistItem>> {
  if (!symbol?.trim()) {
    return { success: false, message: 'Symbol is required' };
  }

  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };

    await connectToDatabase();
    const removed = await removeWatchlistItem(user.id, symbol);
    revalidatePath('/watchlist');
    revalidatePath('/');
    return { success: true, data: removed as WatchlistItem };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to remove from watchlist';
    console.error('removeFromWatchlist error:', err);
    return { success: false, message: msg };
  }
}
