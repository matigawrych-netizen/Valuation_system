import { yahooFinance } from './yahoo-mapper.js';
import { RSI, MACD, BollingerBands, SMA } from 'technicalindicators';

export interface TechnicalIndicators {
  rsi14: number | null;
  macd: {
    MACD?: number;
    signal?: number;
    histogram?: number;
  } | null;
  bollingerBands: {
    upper?: number;
    middle?: number;
    lower?: number;
    pb?: number; // %b indicator: (Price - Lower) / (Upper - Lower)
  } | null;
  sma50: number | null;
  sma200: number | null;
  signals: string[];
  technicalAdjustment: number; // Value added to margin of safety (negative = buy signal/reduced MoS, positive = sell signal/increased MoS)
}

export async function fetchTechnicalIndicators(ticker: string): Promise<TechnicalIndicators> {
  const empty: TechnicalIndicators = {
    rsi14: null,
    macd: null,
    bollingerBands: null,
    sma50: null,
    sma200: null,
    signals: [],
    technicalAdjustment: 0,
  };

  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 250); // Get around 250 calendar days to ensure we have at least 150 trading days
    const history = await yahooFinance.historical(ticker, { period1, interval: '1d' });
    
    if (!history || history.length < 50) return empty;

    const closes = history.map(h => h.close).filter(c => c != null);
    if (closes.length < 50) return empty;

    const currentPrice = closes[closes.length - 1];
    
    const rsiOutput = RSI.calculate({ period: 14, values: closes });
    const rsi14 = rsiOutput.length > 0 ? rsiOutput[rsiOutput.length - 1] : null;

    const macdOutput = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const macd = macdOutput.length > 0 ? macdOutput[macdOutput.length - 1] : null;

    const bbOutput = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 });
    let bollingerBands = null;
    if (bbOutput.length > 0) {
      const lastBB = bbOutput[bbOutput.length - 1];
      const pb = (currentPrice - lastBB.lower) / (lastBB.upper - lastBB.lower);
      bollingerBands = { upper: lastBB.upper, middle: lastBB.middle, lower: lastBB.lower, pb };
    }

    const sma50Output = SMA.calculate({ period: 50, values: closes });
    const sma50 = sma50Output.length > 0 ? sma50Output[sma50Output.length - 1] : null;

    const sma200Output = closes.length >= 200 ? SMA.calculate({ period: 200, values: closes }) : [];
    const sma200 = sma200Output.length > 0 ? sma200Output[sma200Output.length - 1] : null;

    // Generate signals and adjustment
    const signals: string[] = [];
    let technicalAdjustment = 0;

    if (rsi14 !== null) {
      if (rsi14 < 30) {
        signals.push('RSI Oversold (<30)');
        technicalAdjustment -= 0.03; // symmetrical
      } else if (rsi14 > 70) {
        signals.push('RSI Overbought (>70)');
        technicalAdjustment += 0.03;
      }
    }

    if (macd?.histogram !== undefined && macd.histogram !== null) {
      if (macd.histogram > 0 && macdOutput.length >= 2 && macdOutput[macdOutput.length - 2].histogram! <= 0) {
        signals.push('MACD bullish crossover');
        technicalAdjustment -= 0.03; // symmetrical
      } else if (macd.histogram < 0 && macdOutput.length >= 2 && macdOutput[macdOutput.length - 2].histogram! >= 0) {
        signals.push('MACD bearish crossover');
        technicalAdjustment += 0.03;
      }
    }

    if (bollingerBands?.pb !== undefined) {
      if (bollingerBands.pb < 0) {
        signals.push('Price below lower Bollinger Band (potential rebound)');
        technicalAdjustment -= 0.03; // symmetrical
      } else if (bollingerBands.pb > 1) {
        signals.push('Price above upper Bollinger Band (extended)');
        technicalAdjustment += 0.03;
      }
    }

    if (sma50 !== null && sma200 !== null && sma50Output.length >= 2 && sma200Output.length >= 2) {
      if (sma50 > sma200) {
        // bullish trend
        const prev50 = sma50Output[sma50Output.length - 2];
        const prev200 = sma200Output[sma200Output.length - 2];
        if (closes[closes.length - 2] <= prev200 && currentPrice > sma200) {
            signals.push('Price crossed above SMA200 (Bullish)');
            technicalAdjustment -= 0.03;
        }
        
        if (prev50 <= prev200) {
          signals.push('Golden Cross (SMA50 > SMA200)');
          technicalAdjustment -= 0.05;
        }
      } else if (sma50 < sma200) {
        const prev50 = sma50Output[sma50Output.length - 2];
        const prev200 = sma200Output[sma200Output.length - 2];
        
        if (closes[closes.length - 2] >= prev200 && currentPrice < sma200) {
            signals.push('Price crossed below SMA200 (Bearish)');
            technicalAdjustment += 0.03;
        }

        if (prev50 >= prev200) {
          signals.push('Death Cross (SMA50 < SMA200)');
          technicalAdjustment += 0.05;
        }
      }
    }

    // Cap technical adjustment
    technicalAdjustment = Math.max(-0.1, Math.min(0.1, technicalAdjustment));

    return {
      rsi14,
      macd: macd as any,
      bollingerBands,
      sma50,
      sma200,
      signals,
      technicalAdjustment,
    };
  } catch (err) {
    console.warn(`Failed to fetch technical indicators for ${ticker}`, err);
    return empty;
  }
}
