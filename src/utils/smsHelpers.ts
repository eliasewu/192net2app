import { SMSLog } from '../types';

/**
 * Calculate DLR response time in milliseconds between submit_time and dlr_timestamp.
 * Returns null if either timestamp is missing or invalid.
 */
export function getDLRResponseTime(log: SMSLog): number | null {
  if (!log.dlr_timestamp || !log.submit_time) return null;
  try {
    const submit = new Date(log.submit_time).getTime();
    const dlr = new Date(log.dlr_timestamp).getTime();
    if (isNaN(submit) || isNaN(dlr)) return null;
    return dlr - submit;
  } catch {
    return null;
  }
}

/**
 * Calculate DLR duration in milliseconds between submit_time and delivery_time.
 * Returns null if either timestamp is missing or invalid.
 */
export function getDLRDuration(log: SMSLog): number | null {
  if (!log.delivery_time || !log.submit_time) return null;
  try {
    const submit = new Date(log.submit_time).getTime();
    const delivery = new Date(log.delivery_time).getTime();
    if (isNaN(submit) || isNaN(delivery)) return null;
    return delivery - submit;
  } catch {
    return null;
  }
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * - null → "-"
 * - < 1000ms → "Xms"
 * - < 60000ms → "X.Xs"
 * - >= 60000ms → "X.Xm"
 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Get the CSS row style class based on SMS log DLR status.
 * Returns Tailwind background/hover classes for color-coded rows:
 * - delivered/DELIVRD → green
 * - failed/UNDELIV/rejected → red
 * - pending → yellow
 * - sent → blue
 * - default → empty string
 */
export function getRowStyle(log: SMSLog): string {
  if (log.status === 'delivered' || log.dlr_status === 'DELIVRD') {
    return 'bg-green-50 hover:bg-green-100';
  }
  if (log.status === 'failed' || log.dlr_status === 'UNDELIV' || log.status === 'rejected') {
    return 'bg-red-50 hover:bg-red-100';
  }
  if (log.status === 'pending') {
    return 'bg-yellow-50 hover:bg-yellow-100';
  }
  if (log.status === 'sent') {
    return 'bg-blue-50 hover:bg-blue-100';
  }
  return '';
}
