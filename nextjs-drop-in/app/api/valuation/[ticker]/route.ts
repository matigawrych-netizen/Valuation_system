/**
 * Drop-in Next.js App Router route handler.
 *
 * Copy this file to:   app/api/valuation/[ticker]/route.ts
 * Copy alongside it:   src/valuation-engine.ts  and  src/yahoo-mapper.ts
 * (adjust the two import paths below to wherever you put them, e.g. "@/lib/...")
 *
 * Requires yahoo-finance2 v4:  npm i yahoo-finance2
 */
import { NextResponse } from 'next/server';
import { calculateFairValue } from '@/lib/valuation-engine';
import { fetchSnapshot } from '@/lib/yahoo-mapper';
import { fetchMacroEnvironment } from '@/lib/macro-provider';
import { fetchTechnicalIndicators } from '@/lib/technical-provider';

export const dynamic = 'force-dynamic'; // live quotes — never statically cache

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const raw = (await params).ticker;
  const ticker = raw.trim().toUpperCase();
  if (!/^[A-Z0-9.^-]{1,12}$/.test(ticker)) {
    return NextResponse.json({ error: 'invalid ticker' }, { status: 400 });
  }

  try {
    const [snapshot, macro, technicals] = await Promise.all([
      fetchSnapshot(ticker),
      fetchMacroEnvironment(),
      fetchTechnicalIndicators(ticker)
    ]);
    const result = calculateFairValue(snapshot, { macro, technicals });
    const price = snapshot.financialData.currentPrice;

    return NextResponse.json({
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
      earningsQualityAdjustment: round4(result.earningsQualityAdjustment ?? 1),
      sector: result.sector,
      signals: result.signals,
      upside: price ? round4(result.fairValue / price - 1) : null,
      belowEntryTarget: price != null ? price <= result.entryTarget && !result.lowConfidence : null,
      lowConfidence: result.lowConfidence,
      validModelCount: result.validModelCount,
      archetypeBlend: result.archetypeBlend.map((a) => ({
        archetype: a.archetype,
        confidence: round4(a.confidence),
      })),
      modelResults: result.modelResults.map((m) => ({
        model: m.model,
        value: m.value != null ? round2(m.value) : null,
        ...(m.reason ? { reason: m.reason } : {}),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|no fundamentals|quotesummary/i.test(message)) {
      return NextResponse.json(
        { error: `no data for ${ticker}`, detail: message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'upstream data fetch failed', detail: message },
      { status: 502 }
    );
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
