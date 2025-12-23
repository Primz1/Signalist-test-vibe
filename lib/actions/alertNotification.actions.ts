'use server';

import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import { addAlertNotification, listAlertNotifications, markNotificationsRead } from '@/database/models/alertNotification.model';
import { auth } from '@/lib/better-auth/auth';

export type ActionResult<T> = { success: true; data: T } | { success: false; message: string };

const getSessionUser = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user || null;
};

export async function getNotifications(): Promise<ActionResult<AlertNotification[]>> {
  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };
    await connectToDatabase();
    const items = await listAlertNotifications(user.id, 30);
    return { success: true, data: items as unknown as AlertNotification[] };
  } catch (err) {
    console.error('getNotifications error', err);
    return { success: false, message: 'Failed to load notifications' };
  }
}

export async function markNotifications(): Promise<ActionResult<{ updated: number }>> {
  try {
    const user = await getSessionUser();
    if (!user?.id) return { success: false, message: 'Not authenticated' };
    await connectToDatabase();
    const res = await markNotificationsRead(user.id);
    return { success: true, data: { updated: res.modifiedCount ?? 0 } };
  } catch (err) {
    console.error('markNotifications error', err);
    return { success: false, message: 'Failed to mark notifications' };
  }
}

export async function addNotificationDirect(input: {
  userId: string;
  alertId: string;
  symbol: string;
  company: string;
  message: string;
  price?: number;
  changePercent?: number;
  triggeredAt?: Date;
}): Promise<ActionResult<AlertNotification>> {
  try {
    if (!input.userId) return { success: false, message: 'Missing user' };
    await connectToDatabase();
    const doc = await addAlertNotification(input);
    return { success: true, data: doc.toObject() as unknown as AlertNotification };
  } catch (err) {
    console.error('addNotificationDirect error', err);
    return { success: false, message: 'Failed to add notification' };
  }
}
