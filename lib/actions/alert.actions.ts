'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/database/mongoose';
import { AlertItem, createAlertItem, listAlertItems, removeAlertItem, Alert } from '@/database/models/alert.model';
import { runAlertSweep } from '@/lib/inngest/alert-check';
import { auth } from '@/lib/better-auth/auth';

export type AlertCondition = 'gt' | 'lt';
export type AlertFrequency = 'once' | 'per_hour' | 'per_day';
export type AlertType = 'price';

type ActionResult<T> = { success: true; data: T } | { success: false; message: string };

const serializeAlert = (item: any): AlertItem & { _id?: string; createdAt?: string; updatedAt?: string } => {
  return {
    ...(item || {}),
    _id: item?._id ? String(item._id) : undefined,
    createdAt: item?.createdAt ? new Date(item.createdAt).toISOString() : undefined,
    updatedAt: item?.updatedAt ? new Date(item.updatedAt).toISOString() : undefined,
  } as any;
};

const getSessionUser = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user || null;
};

export async function listAlerts(): Promise<ActionResult<AlertItem[]>> {
  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };

    await connectToDatabase();
    const items = await listAlertItems(user.id);
    return { success: true, data: items.map(serializeAlert) as any };
  } catch (err) {
    console.error('listAlerts error:', err);
    return { success: false, message: 'Failed to load alerts' };
  }
}

export async function createAlert(params: {
  symbol: string;
  company: string;
  alertName: string;
  alertType?: AlertType;
  condition: AlertCondition;
  threshold: number;
  frequency: AlertFrequency;
}): Promise<ActionResult<AlertItem>> {
  const { symbol, company, alertName, condition, threshold, frequency } = params;
  if (!symbol?.trim() || !company?.trim() || !alertName?.trim()) {
    return { success: false, message: 'Alert name, symbol, and company are required' };
  }
  if (!Number.isFinite(threshold)) {
    return { success: false, message: 'Threshold must be a number' };
  }
  if (!['gt', 'lt'].includes(condition)) {
    return { success: false, message: 'Invalid condition' };
  }
  if (!['once', 'per_hour', 'per_day'].includes(frequency)) {
    return { success: false, message: 'Invalid frequency' };
  }

  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };

    await connectToDatabase();
    const doc = await createAlertItem({
      userId: user.id,
      symbol,
      company,
      alertName: alertName.trim(),
      alertType: params.alertType ?? 'price',
      condition,
      threshold,
      frequency,
    });
    revalidatePath('/watchlist');
    return { success: true, data: serializeAlert(doc.toObject()) as any };
  } catch (err) {
    console.error('createAlert error:', err);
    return { success: false, message: 'Failed to create alert' };
  }
}

export async function deleteAlert(alertId: string): Promise<ActionResult<AlertItem>> {
  if (!alertId) return { success: false, message: 'Alert id is required' };
  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };

    await connectToDatabase();
    const removed = await removeAlertItem(user.id, alertId);
    if (!removed) return { success: false, message: 'Alert not found' };
    revalidatePath('/watchlist');
    return { success: true, data: serializeAlert(removed) as any };
  } catch (err) {
    console.error('deleteAlert error:', err);
    return { success: false, message: 'Failed to delete alert' };
  }
}

export async function setAlertActive(alertId: string, isActive: boolean): Promise<ActionResult<AlertItem>> {
  if (!alertId) return { success: false, message: 'Alert id is required' };
  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };

    await connectToDatabase();
    const res = await Alert.findOneAndUpdate({ _id: alertId, userId: user.id }, { $set: { isActive } }, { new: true }).lean();
    if (!res) return { success: false, message: 'Alert not found' };
    return { success: true, data: serializeAlert(res) as any };
  } catch (err) {
    console.error('setAlertActive error:', err);
    return { success: false, message: 'Failed to update alert' };
  }
}

export async function runAlertSweepAction(): Promise<ActionResult<{ triggered: number }>> {
  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };
    const res = await runAlertSweep();
    return { success: true, data: { triggered: (res as any)?.triggered ?? 0 } };
  } catch (err) {
    console.error('runAlertSweepAction error:', err);
    return { success: false, message: 'Failed to run alerts' };
  }
}
