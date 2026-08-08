import { formatDistanceToNow } from 'date-fns';

export function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return 'N/A';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch (e) {
    return dateStr;
  }
}
