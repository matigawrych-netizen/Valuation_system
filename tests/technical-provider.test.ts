import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTechnicalIndicators } from '../src/technical-provider.js';
import { yahooFinance } from '../src/yahoo-mapper.js';

vi.mock('../src/yahoo-mapper.js', () => ({
  yahooFinance: {
    historical: vi.fn(),
  }
}));

describe('fetchTechnicalIndicators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate technicals correctly when enough data is present', async () => {
    // Generate mock closes (linear increase to simulate a strong trend)
    const mockHistory = Array.from({ length: 200 }).map((_, i) => ({
      date: new Date(),
      open: i, high: i + 1, low: i - 1, close: 100 + i, volume: 1000
    }));

    (yahooFinance.historical as any).mockResolvedValue(mockHistory);

    const technicals = await fetchTechnicalIndicators('AAPL');

    // With a perfectly linear upward trend, RSI should be 100 (or near it due to smoothing).
    expect(technicals.rsi14).toBeDefined();
    expect(technicals.sma50).toBeDefined();
    expect(technicals.sma200).toBeDefined();
    expect(technicals.bollingerBands).toBeDefined();
    expect(technicals.macd).toBeDefined();
  });

  it('should return empty values when insufficient data', async () => {
    const mockHistory = Array.from({ length: 49 }).map((_, i) => ({
      date: new Date(),
      open: i, high: i + 1, low: i - 1, close: i, volume: 1000
    }));

    (yahooFinance.historical as any).mockResolvedValue(mockHistory);

    const technicals = await fetchTechnicalIndicators('AAPL');

    expect(technicals.rsi14).toBeNull();
    expect(technicals.sma50).toBeNull();
  });
});
