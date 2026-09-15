/** NARZĘDZIE RĘCZNE (debug, sieć) — nie jest częścią pipeline'u. */
/**
 * Dev probe: verify what yahoo-finance2 v4 actually returns for the modules
 * the valuation engine depends on. Run with: npx tsx scripts/probe-yahoo.ts
 */
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const ticker = process.argv[2] ?? 'AAPL';

const qs = await yf.quoteSummary(ticker, {
  modules: [
    'summaryDetail',
    'defaultKeyStatistics',
    'financialData',
    'balanceSheetHistory',
    'cashflowStatementHistory',
  ],
});

console.log('--- summaryDetail (keys) ---');
console.log(Object.keys(qs.summaryDetail ?? {}).join(', '));
console.log('dividendYield =', qs.summaryDetail?.dividendYield, '| payoutRatio =', qs.summaryDetail?.payoutRatio);
console.log('--- defaultKeyStatistics ---');
console.log('trailingEps =', qs.defaultKeyStatistics?.trailingEps, '| bookValue =', qs.defaultKeyStatistics?.bookValue, '| sharesOutstanding =', qs.defaultKeyStatistics?.sharesOutstanding, '| pegRatio =', qs.defaultKeyStatistics?.pegRatio);
console.log('--- financialData ---');
console.log('currentPrice =', qs.financialData?.currentPrice, '| freeCashflow =', qs.financialData?.freeCashflow, '| debtToEquity =', qs.financialData?.debtToEquity, '| ebitda =', qs.financialData?.ebitda);
console.log('--- balanceSheetHistory statements ---');
console.log(JSON.stringify(qs.balanceSheetHistory?.balanceSheetStatements, null, 2));
console.log('--- cashflowStatementHistory statements ---');
console.log(JSON.stringify(qs.cashflowStatementHistory?.cashflowStatements, null, 2));

console.log('\n--- fundamentalsTimeSeries annual (last rows, selected keys) ---');
const fts = (await yf.fundamentalsTimeSeries(ticker, {
  period1: '2020-01-01',
  type: 'annual',
  module: 'all',
})) as Array<Record<string, any> & { date: Date }>;
for (const row of fts.slice(-4)) {
  console.log({
    date: row.date,
    totalRevenue: row.totalRevenue,
    netIncome: row.netIncome,
    dilutedEPS: row.dilutedEPS,
    stockholdersEquity: row.stockholdersEquity,
    ordinarySharesNumber: row.ordinarySharesNumber,
    operatingCashFlow: row.operatingCashFlow,
    capitalExpenditure: row.capitalExpenditure,
    freeCashFlow: row.freeCashFlow,
    EBITDA: row.EBITDA,
    totalDebt: row.totalDebt,
    cashAndCashEquivalents: row.cashAndCashEquivalents,
    cashDividendsPaid: row.cashDividendsPaid,
  });
}

console.log('\n--- chart (weekly, 1 year) ---');
const chart = await yf.chart(ticker, {
  period1: '2024-07-01',
  period2: '2025-07-01',
  interval: '1wk',
});
console.log('quotes:', chart.quotes.length, 'first:', chart.quotes[0]?.date, chart.quotes[0]?.close, 'last:', chart.quotes.at(-1)?.date, chart.quotes.at(-1)?.close);
