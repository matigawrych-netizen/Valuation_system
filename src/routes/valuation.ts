import { Router } from 'express';
import { calculateFairValue } from '../valuation-engine.js';
import { fetchSnapshot } from '../yahoo-mapper.js';
import { buildEngineConfig } from '../engine-config.js';
import { fetchMacroEnvironment } from '../macro-provider.js';
import { fetchTechnicalIndicators } from '../technical-provider.js';

export const valuationRouter = Router();

/**
 * GET /api/valuation/:ticker
 *
 * Fair Value / Entry Target come from the multi-factor weighted valuation
 * engine (archetype blend x 10 models x weight matrix + margin-of-safety
 * overlay) — see src/valuation-engine.ts.
 */
valuationRouter.get('/api/valuation/:ticker', async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.^-]{1,12}$/.test(ticker)) {
    res.status(400).json({ error: 'invalid ticker' });
    return;
  }

  try {
    const [snapshot, macro, technicals] = await Promise.all([
      fetchSnapshot(ticker),
      fetchMacroEnvironment(),
      fetchTechnicalIndicators(ticker)
    ]);
    const result = calculateFairValue(snapshot, { macro, technicals, engineConfig: buildEngineConfig({ trainedWeights: false }).config });
    const price = snapshot.financialData.currentPrice;

    res.json({
      ticker,
      asOf: new Date().toISOString(),
      price,
      fairValue: round2(result.fairValue),
      entryTarget: round2(result.entryTarget),
      marginOfSafety: round4(result.marginOfSafety),
      macroContext: {
        rateRegime: macro.rateRegime,
        cpiYoY: round4(macro.cpiYoY),
        yieldSpread: round4(macro.yieldSpread),
        marketRegime: macro.marketRegime,
      },
      technicalContext: {
        rsi14: technicals.rsi14 ? round2(technicals.rsi14) : null,
        sma50: technicals.sma50 ? round2(technicals.sma50) : null,
        sma200: technicals.sma200 ? round2(technicals.sma200) : null,
      },
      fundamentalsContext: snapshot.fundamentals ? {
        workingCapital: snapshot.fundamentals.workingCapital,
        totalAssets: snapshot.fundamentals.totalAssets,
        retainedEarnings: snapshot.fundamentals.retainedEarnings,
        ebit: snapshot.fundamentals.ebit,
        totalLiabilities: snapshot.fundamentals.totalLiabilities,
        investedCapital: snapshot.fundamentals.investedCapital,
      } : null,
      earningsQualityAdjustment: 1, // Legacy, removed
      sector: undefined, // Legacy, removed
      signals: result.warnings,
      upside: result.upside,
      belowEntryTarget: price != null ? price <= result.entryTarget : null,
      lowConfidence: result.lowConfidence,
      validModelCount: result.validModelCount,
      archetypeBlend: result.archetypeBlend.map((a) => ({
        archetype: a.archetype,
        confidence: round4(a.confidence),
      })),
      modelResults: Object.entries(result.models).map(([model, value]) => ({
        model,
        value: value != null ? round2(value) : null,
      })),
      blocks: Object.entries(result.blocks).map(([block, value]) => ({
        block,
        value: value != null ? round2(value) : null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // yahoo-finance2 throws for unknown symbols; surface that as a 404.
    if (/not found|no fundamentals|quotesummary/i.test(message)) {
      res.status(404).json({ error: `no data for ${ticker}`, detail: message });
      return;
    }
    res.status(502).json({ error: 'upstream data fetch failed', detail: message });
  }
});

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
