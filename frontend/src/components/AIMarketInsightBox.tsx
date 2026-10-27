import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Calculator,
  Compass,
  DollarSign,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
  Sliders,
  Layers,
  BarChart2,
  Calendar,
  Clock
} from 'lucide-react';

interface AIMarketInsightBoxProps {
  insight: any;
  currentPrice: number;
  currency: string;
  symbol: string;
  tierName: string;
}

export const AIMarketInsightBox: React.FC<AIMarketInsightBoxProps> = ({
  insight,
  currentPrice,
  currency,
  symbol,
  tierName,
}) => {
  const [isDataExpanded, setIsDataExpanded] = useState(false);

  // Profit and Risk Calculator Inputs
  const [investmentAmount, setInvestmentAmount] = useState<number>(10000);
  const [entryPrice, setEntryPrice] = useState<number>(currentPrice || 150);
  const [targetPrice, setTargetPrice] = useState<number>(
    insight?.profit_scenarios?.bullish?.target_range_high || (currentPrice * 1.05)
  );
  const [stopLossPrice, setStopLossPrice] = useState<number>(
    insight?.recommendation?.stop_loss_level || (currentPrice * 0.95)
  );
  const [feeRatePct, setFeeRatePct] = useState<number>(0.1); // 0.1% standard brokerage & regulatory charge

  // Update calculator defaults whenever insight or currentPrice changes
  useEffect(() => {
    if (currentPrice > 0) {
      setEntryPrice(currentPrice);
      if (insight?.profit_scenarios?.bullish?.target_range_high) {
        setTargetPrice(insight.profit_scenarios.bullish.target_range_high);
      } else {
        setTargetPrice(Number((currentPrice * 1.06).toFixed(2)));
      }
      if (insight?.recommendation?.stop_loss_level) {
        setStopLossPrice(insight.recommendation.stop_loss_level);
      } else {
        setStopLossPrice(Number((currentPrice * 0.94).toFixed(2)));
      }
    }
  }, [insight, currentPrice, tierName]);

  // Instant Calculator Computations
  const calcResults = useMemo(() => {
    const validEntry = entryPrice > 0 ? entryPrice : currentPrice;
    const shares = validEntry > 0 ? Math.floor(investmentAmount / validEntry) : 0;
    const totalInvested = shares * validEntry;

    // Gross profit at target
    const grossProfit = shares * (targetPrice - validEntry);
    const returnPct = validEntry > 0 ? ((targetPrice - validEntry) / validEntry) * 100 : 0;

    // Gross loss at stop-loss
    const grossLoss = shares * (validEntry - stopLossPrice);
    const lossPct = validEntry > 0 ? ((validEntry - stopLossPrice) / validEntry) * 100 : 0;

    // Risk to Reward ratio
    const riskToReward = grossLoss > 0 && grossProfit > 0
      ? (grossProfit / grossLoss).toFixed(2)
      : grossProfit > 0 ? 'Favorable (>5:1)' : 'N/A';

    // Estimated round-trip charges (buy + exit trade volume * feeRate)
    const estimatedCharges = (totalInvested + (shares * targetPrice)) * (feeRatePct / 100);
    const netProfit = grossProfit - estimatedCharges;

    return {
      shares,
      totalInvested: Number(totalInvested.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
      returnPct: Number(returnPct.toFixed(2)),
      lossPct: Number(lossPct.toFixed(2)),
      riskToReward,
      estimatedCharges: Number(estimatedCharges.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
    };
  }, [investmentAmount, entryPrice, targetPrice, stopLossPrice, feeRatePct, currentPrice]);

  if (!insight) return null;

  const { status_badge, status_color, current_condition, profit_scenarios, recommendation, quantitative_data } = insight;
  const currSymbol = currency === 'USD' ? '$' : '₹';

  return (
    <div className="bg-white border-2 border-blue-500/30 rounded-2xl p-6 shadow-md shadow-blue-500/5 space-y-6 animate-in fade-in duration-200">
      {/* Box Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Sparkles size={22} className="stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                AI Market Insight & Profit Opportunity
              </h2>
              {/* Dynamic Market Status Badge */}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                status_color === 'emerald' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                status_color === 'rose' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                status_color === 'amber' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                'bg-blue-100 text-blue-800 border border-blue-300'
              }`}>
                {status_badge}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Customized analytical breakdown for <strong className="text-blue-700">{tierName}</strong> • {profit_scenarios?.horizon}
            </p>
          </div>
        </div>

        {/* Action Badge Preview */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-semibold uppercase">AI Action:</span>
          <span className={`px-3 py-1 rounded-lg text-xs font-black tracking-wide uppercase ${
            recommendation?.action_color === 'emerald' ? 'bg-emerald-600 text-white shadow-xs' :
            recommendation?.action_color === 'rose' ? 'bg-rose-600 text-white shadow-xs' :
            recommendation?.action_color === 'amber' ? 'bg-amber-500 text-white shadow-xs' :
            'bg-blue-600 text-white shadow-xs'
          }`}>
            {recommendation?.action}
          </span>
        </div>
      </div>

      {/* ========================================================
          1. Current Stock Condition
      ======================================================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Compass size={16} className="text-blue-600" />
            1. Current Stock Condition
          </h3>
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock size={12} />
            Verified: {current_condition?.last_updated || 'Live'}
          </span>
        </div>

        {/* Plain English Summary Narrative Banner */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 leading-relaxed space-y-2">
          <p className="font-semibold text-slate-900">
            {current_condition?.headline}
          </p>
          <p className="text-slate-600">
            {current_condition?.summary_narrative}
          </p>
        </div>

        {/* Quantitative Snapshot Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-[11px] text-slate-400 font-medium">Market Price</div>
            <div className="text-base font-extrabold text-slate-900 mt-0.5">
              {currSymbol}{currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className={`text-[10px] font-bold ${current_condition?.price_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {current_condition?.price_change >= 0 ? '+' : ''}{current_condition?.price_change_pct}% today
            </div>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-[11px] text-slate-400 font-medium">Short-Term Trend</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
              {current_condition?.short_term_trend}
            </div>
            <div className="text-[10px] text-slate-500">20-SMA: {currSymbol}{quantitative_data?.technical_indicators?.sma_20}</div>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-[11px] text-slate-400 font-medium">Momentum (RSI 14)</div>
            <div className="text-base font-extrabold text-slate-900 mt-0.5">
              {quantitative_data?.technical_indicators?.rsi_14}
            </div>
            <div className="text-[10px] text-slate-500">
              MACD: {quantitative_data?.technical_indicators?.macd}
            </div>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-[11px] text-slate-400 font-medium">Volatility & Downside</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
              {quantitative_data?.technical_indicators?.volatility_annual_pct}% Ann.
            </div>
            <div className="text-[10px] text-slate-500">14-ATR: {currSymbol}{quantitative_data?.technical_indicators?.atr_14}</div>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-[11px] text-slate-400 font-medium">Support & Resistance</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5">
              {currSymbol}{current_condition?.support_level} / {currSymbol}{current_condition?.resistance_level}
            </div>
            <div className="text-[10px] text-slate-500">Floor vs Ceiling</div>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-[11px] text-slate-400 font-medium">Trading Volume</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
              {quantitative_data?.technical_indicators?.volume_ratio}x Avg
            </div>
            <div className="text-[10px] text-slate-500">30D Turnover</div>
          </div>
        </div>

        {/* Primary Reasons for Bias */}
        <div className="p-3.5 bg-blue-50/50 border border-blue-200/80 rounded-xl text-xs space-y-1.5">
          <div className="font-bold text-blue-900 flex items-center gap-1.5">
            <Activity size={14} className="text-blue-700" />
            Core Catalysts Supporting the {status_badge} Condition:
          </div>
          <ul className="grid sm:grid-cols-3 gap-2 text-slate-700">
            {(current_condition?.reasons_for_bias || []).map((reason: string, i: number) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ========================================================
          2. Future Profit Opportunity Analysis
      ======================================================== */}
      <section className="space-y-4 pt-4 border-t border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <BarChart2 size={16} className="text-blue-600" />
            2. Potential Profit & Price Scenarios
          </h3>
          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            Analysis Horizon: {profit_scenarios?.horizon}
          </span>
        </div>

        {/* Three Scenarios Grid */}
        <div className="grid md:grid-cols-3 gap-4 text-xs">
          {/* Bullish Scenario */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-emerald-200/80">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <TrendingUp size={15} className="text-emerald-600" />
                  Bullish Scenario
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  +{profit_scenarios?.bullish?.gain_pct_low}% to +{profit_scenarios?.bullish?.gain_pct_high}%
                </span>
              </div>
              <div className="mt-2 text-slate-700 leading-relaxed text-[11px]">
                {profit_scenarios?.bullish?.conditions}
              </div>
            </div>

            <div className="pt-2 border-t border-emerald-200/60 space-y-1.5 text-[11px]">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">Target Range:</span>
                <span className="font-mono font-bold text-emerald-800">
                  {currSymbol}{profit_scenarios?.bullish?.target_range_low} – {currSymbol}{profit_scenarios?.bullish?.target_range_high}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Resistance Target:</span>
                <span className="font-mono text-slate-800">{currSymbol}{profit_scenarios?.bullish?.resistance_level}</span>
              </div>
            </div>
          </div>

          {/* Neutral Scenario */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Sliders size={15} className="text-blue-600" />
                  Neutral Scenario
                </span>
                <span className="font-mono font-bold text-slate-600">
                  Consolidation
                </span>
              </div>
              <div className="mt-2 text-slate-700 leading-relaxed text-[11px]">
                {profit_scenarios?.neutral?.conditions}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-1.5 text-[11px]">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">Expected Range:</span>
                <span className="font-mono font-bold text-slate-800">
                  {currSymbol}{profit_scenarios?.neutral?.range_low} – {currSymbol}{profit_scenarios?.neutral?.range_high}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                Bound by support ({currSymbol}{profit_scenarios?.neutral?.range_low}) and 20-SMA
              </div>
            </div>
          </div>

          {/* Bearish Scenario */}
          <div className="p-4 bg-rose-50/50 border border-rose-200 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-rose-200/80">
                <span className="font-bold text-rose-900 flex items-center gap-1.5">
                  <TrendingDown size={15} className="text-rose-600" />
                  Bearish Scenario
                </span>
                <span className="font-mono font-bold text-rose-700">
                  {profit_scenarios?.bearish?.loss_pct_low}% to {profit_scenarios?.bearish?.loss_pct_high}%
                </span>
              </div>
              <div className="mt-2 text-slate-700 leading-relaxed text-[11px]">
                {profit_scenarios?.bearish?.conditions}
              </div>
            </div>

            <div className="pt-2 border-t border-rose-200/60 space-y-1.5 text-[11px]">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">Downside Range:</span>
                <span className="font-mono font-bold text-rose-800">
                  {currSymbol}{profit_scenarios?.bearish?.downside_range_low} – {currSymbol}{profit_scenarios?.bearish?.downside_range_high}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Critical Support:</span>
                <span className="font-mono text-rose-700 font-bold">{currSymbol}{profit_scenarios?.bearish?.critical_support}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 italic">
          * {profit_scenarios?.disclaimer}
        </p>
      </section>

      {/* ========================================================
          3. Profit and Risk Calculator
      ======================================================== */}
      <section className="space-y-4 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Calculator size={16} className="text-blue-600" />
            3. Interactive Profit & Risk Calculator
          </h3>
          <span className="text-[11px] text-slate-400">Instantly recalculates upon input adjustment</span>
        </div>

        <div className="p-5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-5">
          {/* Inputs Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Investment Amount ({currSymbol})</label>
              <input
                type="number"
                step="100"
                min="100"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Entry Price ({currSymbol})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-slate-700">Target Price ({currSymbol})</label>
                <button
                  type="button"
                  onClick={() => setTargetPrice(profit_scenarios?.bullish?.target_range_high || currentPrice * 1.05)}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  Reset Bullish
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={targetPrice}
                onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-emerald-800 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-slate-700">Stop-Loss Price ({currSymbol})</label>
                <button
                  type="button"
                  onClick={() => setStopLossPrice(recommendation?.stop_loss_level || currentPrice * 0.95)}
                  className="text-[10px] text-rose-600 hover:underline"
                >
                  Reset Support
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-rose-800 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
              />
            </div>
          </div>

          {/* Calculator Computed Outputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-3 border-t border-slate-200">
            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <div className="text-slate-400 text-[11px]">Shares Purchasable</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {calcResults.shares.toLocaleString()} shares
              </div>
              <div className="text-[10px] text-slate-500">
                Total Allocated: {currSymbol}{calcResults.totalInvested.toLocaleString()}
              </div>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
              <div className="text-emerald-700 font-semibold text-[11px]">Potential Profit (Target)</div>
              <div className="text-base font-extrabold text-emerald-700 mt-0.5">
                +{currSymbol}{calcResults.grossProfit.toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-800 font-bold">
                +{calcResults.returnPct}% Gross Return
              </div>
            </div>

            <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg">
              <div className="text-rose-700 font-semibold text-[11px]">Potential Loss (Stop-Loss)</div>
              <div className="text-base font-extrabold text-rose-700 mt-0.5">
                -{currSymbol}{calcResults.grossLoss.toLocaleString()}
              </div>
              <div className="text-[10px] text-rose-800 font-bold">
                -{calcResults.lossPct}% Capital at Risk
              </div>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
              <div className="text-blue-700 font-semibold text-[11px]">Risk-to-Reward Ratio</div>
              <div className="text-base font-extrabold text-blue-900 mt-0.5">
                {calcResults.riskToReward}
              </div>
              <div className="text-[10px] text-slate-500">
                Est. Net Profit: +{currSymbol}{calcResults.netProfit.toLocaleString()} (after 0.1% fees)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          4. AI Action Recommendation
      ======================================================== */}
      <section className="space-y-4 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert size={16} className="text-blue-600" />
            4. AI Action Recommendation & Execution Guardrails
          </h3>
          <span className="text-xs text-slate-400">Model Conviction: {recommendation?.confidence_score}%</span>
        </div>

        <div className={`p-5 rounded-xl border ${
          recommendation?.action_color === 'emerald' ? 'bg-emerald-50/50 border-emerald-200' :
          recommendation?.action_color === 'rose' ? 'bg-rose-50/50 border-rose-200' :
          recommendation?.action_color === 'amber' ? 'bg-amber-50/50 border-amber-200' :
          'bg-blue-50/50 border-blue-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase">Recommended Stance:</div>
              <div className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
                <span className={`px-3 py-1 rounded-lg text-sm font-black uppercase text-white ${
                  recommendation?.action_color === 'emerald' ? 'bg-emerald-600' :
                  recommendation?.action_color === 'rose' ? 'bg-rose-600' :
                  recommendation?.action_color === 'amber' ? 'bg-amber-500' : 'bg-blue-600'
                }`}>
                  {recommendation?.action}
                </span>
                <span className="text-xs font-normal text-slate-500">
                  (Confidence: {recommendation?.confidence_score}%)
                </span>
              </div>
            </div>

            <div className="text-xs space-y-1 sm:text-right">
              <div><strong className="text-slate-700">Target Level:</strong> <span className="font-mono font-bold text-emerald-700">{currSymbol}{recommendation?.target_price}</span></div>
              <div><strong className="text-slate-700">Invalidation Level:</strong> <span className="font-mono font-bold text-rose-700">{currSymbol}{recommendation?.stop_loss_level}</span></div>
            </div>
          </div>

          <div className="mt-3.5 space-y-2 text-xs">
            <div className="font-bold text-slate-900">Key Rationale:</div>
            <ul className="space-y-1.5 text-slate-700">
              {(recommendation?.key_reasons || []).map((reason: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-blue-600 mt-0.5 shrink-0" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>

            <div className="pt-2 grid sm:grid-cols-2 gap-3 text-[11px] text-slate-600">
              <div className="p-2.5 bg-white/80 rounded-lg border border-slate-200">
                <strong className="text-slate-900">Entry Trigger to Watch:</strong> {recommendation?.entry_conditions}
              </div>
              <div className="p-2.5 bg-white/80 rounded-lg border border-slate-200">
                <strong className="text-slate-900">Suggested Monitoring Timeframe:</strong> {recommendation?.monitoring_timeframe}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          5. Detailed Quantitative Data (Collapsible)
      ======================================================== */}
      <section className="pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setIsDataExpanded(!isDataExpanded)}
          className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl transition text-xs font-bold text-slate-800 border border-slate-200"
        >
          <span className="flex items-center gap-2">
            <Layers size={16} className="text-blue-600" />
            5. View Complete Quantitative Analysis Data & Methodology
          </span>
          <span className="flex items-center gap-1 text-blue-600 font-semibold text-xs">
            {isDataExpanded ? 'Hide Details' : 'Expand Full Matrix'}
            {isDataExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {isDataExpanded && (
          <div className="mt-4 p-5 bg-white border border-slate-200 rounded-xl space-y-6 text-xs animate-in fade-in duration-200">
            {/* Historical Price Performance Table */}
            <div>
              <h4 className="font-bold text-slate-900 text-xs mb-2">Historical Price Performance</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400">1-Week Return</span>
                  <div className={`text-base font-bold ${quantitative_data?.historical_performance?.['1_week_pct'] >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {quantitative_data?.historical_performance?.['1_week_pct'] >= 0 ? '+' : ''}{quantitative_data?.historical_performance?.['1_week_pct']}%
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400">1-Month Return</span>
                  <div className={`text-base font-bold ${quantitative_data?.historical_performance?.['1_month_pct'] >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {quantitative_data?.historical_performance?.['1_month_pct'] >= 0 ? '+' : ''}{quantitative_data?.historical_performance?.['1_month_pct']}%
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400">6-Month Return</span>
                  <div className={`text-base font-bold ${quantitative_data?.historical_performance?.['6_month_pct'] >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {quantitative_data?.historical_performance?.['6_month_pct'] >= 0 ? '+' : ''}{quantitative_data?.historical_performance?.['6_month_pct']}%
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400">1-Year Return</span>
                  <div className={`text-base font-bold ${quantitative_data?.historical_performance?.['1_year_pct'] >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {quantitative_data?.historical_performance?.['1_year_pct'] >= 0 ? '+' : ''}{quantitative_data?.historical_performance?.['1_year_pct']}%
                  </div>
                </div>
              </div>
            </div>

            {/* Complete Technical & Fundamental Metrics */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3.5 bg-slate-50 rounded-xl space-y-2">
                <h5 className="font-bold text-slate-900 pb-1 border-b border-slate-200">Technical Indicators (Daily)</h5>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>RSI (14-Period): <strong className="text-slate-900">{quantitative_data?.technical_indicators?.rsi_14}</strong></div>
                  <div>MACD: <strong className="text-slate-900">{quantitative_data?.technical_indicators?.macd}</strong></div>
                  <div>MACD Signal: <strong className="text-slate-900">{quantitative_data?.technical_indicators?.macd_signal}</strong></div>
                  <div>SMA 20: <strong className="text-slate-900">{currSymbol}{quantitative_data?.technical_indicators?.sma_20}</strong></div>
                  <div>SMA 50: <strong className="text-slate-900">{currSymbol}{quantitative_data?.technical_indicators?.sma_50}</strong></div>
                  <div>SMA 200: <strong className="text-slate-900">{currSymbol}{quantitative_data?.technical_indicators?.sma_200}</strong></div>
                  <div>ATR (14): <strong className="text-slate-900">{currSymbol}{quantitative_data?.technical_indicators?.atr_14}</strong></div>
                  <div>Ann. Volatility: <strong className="text-slate-900">{quantitative_data?.technical_indicators?.volatility_annual_pct}%</strong></div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl space-y-2">
                <h5 className="font-bold text-slate-900 pb-1 border-b border-slate-200">Fundamental Ratios & Benchmarks</h5>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>Trailing P/E: <strong className="text-slate-900">{quantitative_data?.fundamental_ratios?.pe_ratio || 'N/A'}</strong></div>
                  <div>Forward P/E: <strong className="text-slate-900">{quantitative_data?.fundamental_ratios?.forward_pe || 'N/A'}</strong></div>
                  <div>EPS (Diluted): <strong className="text-slate-900">{currSymbol}{quantitative_data?.fundamental_ratios?.eps || 'N/A'}</strong></div>
                  <div>Operating Margin: <strong className="text-slate-900">{quantitative_data?.fundamental_ratios?.operating_margin_pct ? `${quantitative_data.fundamental_ratios.operating_margin_pct}%` : 'N/A'}</strong></div>
                  <div>Debt-to-Equity: <strong className="text-slate-900">{quantitative_data?.fundamental_ratios?.debt_to_equity ?? 'N/A'}</strong></div>
                  <div>Beta (Market Sens.): <strong className="text-slate-900">{quantitative_data?.fundamental_ratios?.beta}</strong></div>
                  <div>52W High: <strong className="text-slate-900">{currSymbol}{quantitative_data?.support_resistance?.week_52_high}</strong></div>
                  <div>52W Low: <strong className="text-slate-900">{currSymbol}{quantitative_data?.support_resistance?.week_52_low}</strong></div>
                </div>
              </div>
            </div>

            {/* Model Validation Details */}
            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2">
              <div className="font-bold text-blue-900 flex items-center justify-between">
                <span>Model Architecture: {quantitative_data?.model_validation?.model_name}</span>
                <span className="font-mono text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  Accuracy: {quantitative_data?.model_validation?.directional_accuracy_pct}%
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                <div>Validation: <strong>{quantitative_data?.model_validation?.validation_method}</strong></div>
                <div>RMSE: <strong className="font-mono">{quantitative_data?.model_validation?.rmse}</strong></div>
                <div>MAE: <strong className="font-mono">{quantitative_data?.model_validation?.mae}</strong></div>
                <div>R² Score: <strong className="font-mono">{quantitative_data?.model_validation?.r2_score}</strong></div>
              </div>
              <p className="text-[11px] text-slate-500 pt-1 border-t border-blue-200/60 leading-relaxed">
                {quantitative_data?.methodology_notes}
              </p>
            </div>

            {/* News Disclosures */}
            {quantitative_data?.news_feed && quantitative_data.news_feed.length > 0 && (
              <div>
                <h5 className="font-bold text-slate-900 text-xs mb-2">Verified Company News & Context</h5>
                <div className="space-y-2">
                  {quantitative_data.news_feed.map((n: any, i: number) => (
                    <div key={i} className="p-2.5 bg-slate-50 rounded-lg text-[11px] flex items-center justify-between">
                      <div>
                        <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-800 hover:text-blue-600">
                          {n.title}
                        </a>
                        <div className="text-[10px] text-slate-400">{n.source} • {n.published_at}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        n.sentiment === 'Bullish' ? 'bg-emerald-100 text-emerald-800' :
                        n.sentiment === 'Bearish' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {n.sentiment}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-[10px] text-slate-400">
              {quantitative_data?.data_source_warning}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
