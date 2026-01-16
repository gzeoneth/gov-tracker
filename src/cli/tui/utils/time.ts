/**
 * Shared time formatting utilities
 */

export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export const SEC_PER_MINUTE = 60;
export const SEC_PER_HOUR = 3600;
export const SEC_PER_DAY = 86400;

export function formatDurationMs(diffMs: number): { text: string; color: string } {
  const hours = Math.floor(diffMs / MS_PER_HOUR);
  const mins = Math.floor((diffMs % MS_PER_HOUR) / MS_PER_MINUTE);

  if (hours > 48) {
    const days = Math.floor(hours / 24);
    return { text: `${days}d ${hours % 24}h`, color: "gray" };
  }
  if (hours >= 1) {
    return { text: `${hours}h ${mins}m`, color: "yellow" };
  }
  return { text: `${mins}m`, color: "green" };
}

export function formatElapsedMs(elapsedMs: number, date: Date): { text: string; color: string } {
  if (elapsedMs < MS_PER_HOUR) {
    return { text: `${Math.floor(elapsedMs / MS_PER_MINUTE)}m ago`, color: "gray" };
  }
  if (elapsedMs < MS_PER_DAY) {
    return { text: `${Math.floor(elapsedMs / MS_PER_HOUR)}h ago`, color: "gray" };
  }
  return { text: date.toLocaleDateString(), color: "gray" };
}

export function formatDurationSec(remainingSec: number): string {
  const days = Math.floor(remainingSec / SEC_PER_DAY);
  const hours = Math.floor((remainingSec % SEC_PER_DAY) / SEC_PER_HOUR);
  const mins = Math.floor((remainingSec % SEC_PER_HOUR) / SEC_PER_MINUTE);
  return `${days}d ${hours}h ${mins}m`;
}
