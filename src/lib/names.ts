export type NameOf = (id: string | null | undefined) => string;

/** "Alex" or "Alex & Sam" */
export const teamName = (ids: string[], nameOf: NameOf) => ids.map((id) => nameOf(id)).join(' & ');
/** "Alex" or "Alex/Sam" for tight spaces */
export const teamShort = (ids: string[], nameOf: NameOf) => ids.map((id) => nameOf(id)).join('/');

export const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export const formatDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
