import { Schema, model, models, type Document, type Model } from 'mongoose';

export type AlertCondition = 'gt' | 'lt';
export type AlertFrequency = 'once' | 'per_hour' | 'per_day';
export type AlertType = 'price';

export interface AlertItem extends Document {
  userId: string;
  symbol: string;
  company: string;
  alertName: string;
  alertType: AlertType;
  condition: AlertCondition;
  threshold: number;
  frequency: AlertFrequency;
  isActive: boolean;
  createdAt: Date;
  lastTriggeredAt?: Date;
  lastNotifiedAt?: Date;
  lastPrice?: number;
  lastChangePercent?: number;
}

const AlertSchema = new Schema<AlertItem>(
  {
    userId: { type: String, required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    company: { type: String, required: true, trim: true },
    alertName: { type: String, required: true, trim: true },
    alertType: { type: String, required: true, enum: ['price'], default: 'price' },
    condition: { type: String, required: true, enum: ['gt', 'lt'] },
    threshold: { type: Number, required: true },
    frequency: { type: String, required: true, enum: ['once', 'per_hour', 'per_day'], default: 'once' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastTriggeredAt: { type: Date },
    lastNotifiedAt: { type: Date },
    lastPrice: { type: Number },
    lastChangePercent: { type: Number },
  },
  { timestamps: true }
);

AlertSchema.index({ userId: 1, symbol: 1, alertType: 1, condition: 1, threshold: 1, frequency: 1 });

export const Alert: Model<AlertItem> = (models?.Alert as Model<AlertItem>) || model<AlertItem>('Alert', AlertSchema);

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

export const createAlertItem = async (params: {
  userId: string;
  symbol: string;
  company: string;
  alertName: string;
  alertType: AlertType;
  condition: AlertCondition;
  threshold: number;
  frequency: AlertFrequency;
}) => {
  const normalizedSymbol = normalizeSymbol(params.symbol);
  return Alert.create({ ...params, symbol: normalizedSymbol });
};

export const listAlertItems = async (userId: string) => {
  return Alert.find({ userId }).sort({ createdAt: -1 }).lean();
};

export const listActiveAlerts = async () => {
  return Alert.find({ isActive: true }).lean();
};

export const removeAlertItem = async (userId: string, alertId: string) => {
  return Alert.findOneAndDelete({ userId, _id: alertId }).lean();
};
