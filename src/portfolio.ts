export interface Position {
  cik: string;
  shares: number;
  entryPrice: number;
  highestPrice: number; // trailing stop
  lastPrice: number;
}

/** Portfel symulacji. Pozycje kluczowane CIK (ticker bywa recyklingowany). */
export class Portfolio {
  cash: number;
  positions: Map<string, Position> = new Map();
  history: { date: string; value: number }[] = [];
  totalCosts = 0;
  tradedNotional = 0;
  trades = 0;

  constructor(
    initialCash = 10_000,
    readonly costRate = 0.001
  ) {
    this.cash = initialCash;
  }

  buy(cik: string, price: number, amountUsd: number): boolean {
    const cost = amountUsd * this.costRate;
    if (this.cash < amountUsd + cost || price <= 0) return false;
    const shares = amountUsd / price;
    this.cash -= amountUsd + cost;
    this.totalCosts += cost;
    this.tradedNotional += amountUsd;
    this.trades++;
    const existing = this.positions.get(cik);
    if (existing) {
      const total = existing.shares + shares;
      existing.entryPrice = (existing.shares * existing.entryPrice + shares * price) / total;
      existing.shares = total;
      existing.highestPrice = Math.max(existing.highestPrice, price);
      existing.lastPrice = price;
    } else {
      this.positions.set(cik, { cik, shares, entryPrice: price, highestPrice: price, lastPrice: price });
    }
    return true;
  }

  sell(cik: string, price: number): boolean {
    const pos = this.positions.get(cik);
    if (!pos) return false;
    const gross = pos.shares * price;
    const cost = gross * this.costRate;
    this.cash += gross - cost;
    this.totalCosts += cost;
    this.tradedNotional += gross;
    this.trades++;
    this.positions.delete(cik);
    return true;
  }

  payDividend(cik: string, divPerShare: number) {
    const pos = this.positions.get(cik);
    if (pos && divPerShare > 0) this.cash += pos.shares * divPerShare;
  }

  updatePrices(prices: Map<string, number>) {
    for (const pos of this.positions.values()) {
      const p = prices.get(pos.cik);
      if (p != null) {
        pos.lastPrice = p;
        if (p > pos.highestPrice) pos.highestPrice = p;
      }
    }
  }

  /** Wartość wg ostatnich znanych cen pozycji (brak ceny w danym dniu obsługuje symulator jawnie, zanim tu trafi). */
  getValue(): number {
    let v = this.cash;
    for (const pos of this.positions.values()) v += pos.shares * pos.lastPrice;
    return v;
  }

  recordHistory(date: string) {
    this.history.push({ date, value: this.getValue() });
  }
}
