

function requireApiKey(): string {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error('Brak zmiennej środowiskowej ALPHA_VANTAGE_API_KEY (patrz .env.example).');
  return key;
}

export interface AlphaVantageRow {
  date: Date;
  [key: string]: unknown;
}

export async function fetchAlphaVantageFundamentals(ticker: string): Promise<AlphaVantageRow[]> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const incRes = await fetch(`https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${ticker}&apikey=${requireApiKey()}`);
  await sleep(1500);
  const balRes = await fetch(`https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${ticker}&apikey=${requireApiKey()}`);
  await sleep(1500);
  const cfRes = await fetch(`https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${ticker}&apikey=${requireApiKey()}`);

  const incData = await incRes.json() as any;
  const balData = await balRes.json() as any;
  const cfData = await cfRes.json() as any;

  if (incData.Information) {
    throw new Error(`Alpha Vantage API rate limit: ${incData.Information}`);
  }
  if (incData['Error Message']) {
    throw new Error(`Alpha Vantage API error: ${incData['Error Message']}`);
  }
  
  if (!incData.annualReports || !balData.annualReports || !cfData.annualReports) {
    throw new Error(`Missing annual reports from Alpha Vantage for ${ticker}`);
  }

  const merged = new Map<string, any>();

  const parseNumber = (val: any) => {
    if (val === 'None' || val == null) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  };

  for (const rep of incData.annualReports) {
    merged.set(rep.fiscalDateEnding, { ...rep });
  }

  for (const rep of balData.annualReports) {
    const existing = merged.get(rep.fiscalDateEnding) || {};
    merged.set(rep.fiscalDateEnding, { ...existing, ...rep });
  }

  for (const rep of cfData.annualReports) {
    const existing = merged.get(rep.fiscalDateEnding) || {};
    merged.set(rep.fiscalDateEnding, { ...existing, ...rep });
  }

  const sortedKeys = Array.from(merged.keys()).sort();

  return sortedKeys.map(dateStr => {
    const m = merged.get(dateStr);
    
    return {
      date: new Date(dateStr),
      ordinarySharesNumber: parseNumber(m.commonStockSharesOutstanding),
      stockholdersEquity: parseNumber(m.totalShareholderEquity),
      netIncome: parseNumber(m.netIncome),
      totalRevenue: parseNumber(m.totalRevenue),
      ebit: parseNumber(m.ebit),
      EBITDA: parseNumber(m.ebitda),
      operatingCashFlow: parseNumber(m.operatingCashflow),
      capitalExpenditure: parseNumber(m.capitalExpenditures),
      freeCashFlow: (parseNumber(m.operatingCashflow) != null && parseNumber(m.capitalExpenditures) != null) 
        ? parseNumber(m.operatingCashflow)! - Math.abs(parseNumber(m.capitalExpenditures)!) 
        : null,
      cashDividendsPaid: parseNumber(m.dividendPayout),
      totalDebt: (parseNumber(m.shortTermDebt) || 0) + (parseNumber(m.longTermDebt) || 0),
      cashAndCashEquivalents: parseNumber(m.cashAndCashEquivalentsAtCarryingValue) || parseNumber(m.cashAndShortTermInvestments),
      totalAssets: parseNumber(m.totalAssets),
      totalLiabilities: parseNumber(m.totalLiabilities),
      retainedEarnings: parseNumber(m.retainedEarnings),
      workingCapital: (parseNumber(m.totalCurrentAssets) || 0) - (parseNumber(m.totalCurrentLiabilities) || 0),
      taxRateForCalcs: (parseNumber(m.incomeTaxExpense) != null && parseNumber(m.incomeBeforeTax) != null && parseNumber(m.incomeBeforeTax)! !== 0) 
        ? parseNumber(m.incomeTaxExpense)! / parseNumber(m.incomeBeforeTax)! 
        : 0.21,
    };
  });
}
