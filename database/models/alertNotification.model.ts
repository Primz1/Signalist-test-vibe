import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface AlertNotification extends Document {
  userId: string;
  alertId: string;
  symbol: string;
  company: string;
  message: string;
  price?: number;
  changePercent?: number;
  triggeredAt: Date;
  read: boolean;
}

const AlertNotificationSchema = new Schema<AlertNotification>(
  {
    userId: { type: String, required: true, index: true },
    alertId: { type: String, required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    company: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    price: { type: Number },
    changePercent: { type: Number },
    triggeredAt: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AlertNotificationSchema.index({ userId: 1, read: 1, triggeredAt: -1 });

export const AlertNotificationModel: Model<AlertNotification> =
  (models?.AlertNotification as Model<AlertNotification>) ||
  model<AlertNotification>('AlertNotification', AlertNotificationSchema);

export const addAlertNotification = async (input: {
  userId: string;
  alertId: string;
  symbol: string;
  company: string;
  message: string;
  price?: number;
  changePercent?: number;
  triggeredAt?: Date;
}) => {
  return AlertNotificationModel.create({ ...input, triggeredAt: input.triggeredAt ?? new Date() });
};

export const listAlertNotifications = async (userId: string, limit = 20) => {
  return AlertNotificationModel.find({ userId })
    .sort({ triggeredAt: -1 })
    .limit(limit)
    .lean();
};

export const markNotificationsRead = async (userId: string) => {
  return AlertNotificationModel.updateMany({ userId, read: false }, { $set: { read: true } });
};
