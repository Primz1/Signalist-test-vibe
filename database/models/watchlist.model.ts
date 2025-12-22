import {Schema, model, models, type Document, type Model} from 'mongoose';
// Define the interface for WatchlistItem
export interface WatchlistItem extends Document {
  userId: string;
  symbol: string;
  company: string;
  addedAt: Date;
}

// Create the Watchlist schema
const WatchlistSchema = new Schema<WatchlistItem>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  company: {              
    type: String,
    required: true,
    trim: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});          

// Add compound index on userId + symbol to prevent duplicates
WatchlistSchema.index({ userId: 1, symbol: 1 }, { unique: true });

// Use the models?.Watchlist || model pattern to avoid hot-reload issues
export const Watchlist: Model<WatchlistItem> =
  (models?.Watchlist as Model<WatchlistItem>) || model<WatchlistItem>('Watchlist', WatchlistSchema);

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

type AddWatchlistParams = {
  userId: string;
  symbol: string;
  company: string;
};

export const addWatchlistItem = async ({ userId, symbol, company }: AddWatchlistParams) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const trimmedCompany = company.trim();

  try {
    const doc = await Watchlist.findOneAndUpdate(
      { userId, symbol: normalizedSymbol },
      {
        userId,
        symbol: normalizedSymbol,
        company: trimmedCompany,
        $setOnInsert: { addedAt: new Date() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return { item: doc };
  } catch (err: any) {
    if (err?.code === 11000) {
      throw new Error('Symbol already exists in watchlist');
    }
    throw err;
  }
};

export const listWatchlistItems = async (userId: string) => {
  return Watchlist.find({ userId }).sort({ addedAt: -1 }).lean();
};

export const listWatchlistSymbols = async (userId: string) => {
  const items = await Watchlist.find({ userId }).select('symbol -_id').lean();
  return items.map((item) => item.symbol);
};

export const removeWatchlistItem = async (userId: string, symbol: string) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const res = await Watchlist.findOneAndDelete({ userId, symbol: normalizedSymbol }).lean();
  if (!res) {
    throw new Error('Symbol not found in watchlist');
  }
  return res;
};