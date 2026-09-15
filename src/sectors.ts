/**
 * Klasyfikacja sektorowa z kodu SIC (SEC submissions JSON).
 * UWAGA: kod SIC w pliku submissions to stan BIEŻĄCY, nie point-in-time.
 * SIC zmienia się rzadko, ale to jest znane źródło drobnego look-ahead — patrz docs/limitations.md.
 */
export function sectorFromSic(sic: number | null | undefined): string | null {
  if (sic == null || !Number.isFinite(sic)) return null;
  if (sic >= 100 && sic <= 999) return 'Agriculture';
  if (sic >= 1000 && sic <= 1499) return 'Mining & Energy';
  if (sic >= 1500 && sic <= 1799) return 'Construction';
  if (sic >= 2000 && sic <= 3999) return 'Manufacturing';
  if (sic >= 4000 && sic <= 4899) return 'Transportation & Communications';
  if (sic >= 4900 && sic <= 4999) return 'Utilities';
  if (sic >= 5000 && sic <= 5199) return 'Wholesale Trade';
  if (sic >= 5200 && sic <= 5999) return 'Retail Trade';
  if (sic >= 6000 && sic <= 6799) return 'Financial Services';
  if (sic >= 7000 && sic <= 8999) return 'Services';
  if (sic >= 9100 && sic <= 9729) return 'Public Administration';
  if (sic >= 9900 && sic <= 9999) return 'Nonclassifiable';
  return null;
}
