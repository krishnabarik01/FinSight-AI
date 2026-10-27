"""
FinSight AI — Beginner Learning Resources & Market Literacy API
Provides structured, jargon-free lessons and glossaries explaining stock market mechanics,
indicators, ETFs, risk management, and Indian regulatory compliance (SEBI).
"""

from typing import List, Dict, Any
from fastapi import APIRouter

router = APIRouter(prefix="/api/education", tags=["education"])

LEARNING_MODULES = [
    {
        "id": "market-cap",
        "title": "Understanding Market Capitalization",
        "category": "Stock Market Basics",
        "reading_time_mins": 3,
        "summary": "Market capitalization (Market Cap) represents the total market value of a company's outstanding shares.",
        "icon": "Layers",
        "key_takeaways": [
            "Calculated as: Current Share Price × Total Number of Outstanding Shares.",
            "Mega/Large Cap (> ₹20,000 Cr): Proven industry giants like SBI, Reliance, and TCS. Offer lower volatility and higher institutional ownership.",
            "Mid Cap (₹5,000 – ₹20,000 Cr): Emerging leaders with higher growth potential but wider price swings.",
            "Small Cap (< ₹5,000 Cr): Early-stage growth companies carrying higher volatility and business risk."
        ],
        "beginner_tip": "As a beginner, allocating 70-80% of your equity exposure to Large Caps or NIFTY 50 Index ETFs provides stability."
    },
    {
        "id": "price-charts-ohlc",
        "title": "How to Read Stock Price Charts & OHLC Candles",
        "category": "Technical Analysis",
        "reading_time_mins": 4,
        "summary": "Candlestick charts reveal the price battle between buyers (bulls) and sellers (bears) across each timeframe.",
        "icon": "BarChart3",
        "key_takeaways": [
            "Open (O): The price of the very first trade executed when the trading session begins.",
            "High (H): The absolute peak price reached during the selected timeframe.",
            "Low (L): The lowest price point touched during the timeframe.",
            "Close (C): The final transaction price at session closing.",
            "Green Candle: Close > Open (buyers were in control). Red Candle: Close < Open (sellers pushed price down)."
        ],
        "beginner_tip": "Always review charts across multiple periods (1 Week, 1 Month, 1 Year) to understand the larger prevailing trend rather than getting distracted by 5-minute noise."
    },
    {
        "id": "technical-indicators",
        "title": "Essential Technical Indicators: RSI & Moving Averages",
        "category": "Decision Support",
        "reading_time_mins": 5,
        "summary": "Mathematical indicators help measure momentum and trend direction without emotion.",
        "icon": "Activity",
        "key_takeaways": [
            "RSI (Relative Strength Index): Oscillates between 0 and 100. Above 70 suggests overbought (stretched upside); below 30 indicates oversold (temporary exhaustion of selling).",
            "SMA 20 (20-Day Simple Moving Average): Gauges short-term trend momentum.",
            "SMA 50 (50-Day Simple Moving Average): Crucial intermediate support line for institutional investors.",
            "SMA 200 (200-Day Simple Moving Average): The benchmark long-term bull/bear dividing line."
        ],
        "beginner_tip": "Never buy a stock based solely on an indicator. Combine RSI momentum with fundamental balance sheet health and reasonable valuation."
    },
    {
        "id": "etfs-index-funds",
        "title": "Index ETFs vs Individual Stocks",
        "category": "Portfolio Building",
        "reading_time_mins": 4,
        "summary": "Exchange Traded Funds (ETFs) allow you to buy an entire basket of stocks with a single transaction.",
        "icon": "PieChart",
        "key_takeaways": [
            "NIFTY 50 BeES (NIFTYBEES): Tracks the top 50 listed companies in India across all sectors.",
            "Gold BeES (GOLDBEES): Tracks the domestic spot price of 24 Karat gold backed by physical bullion.",
            "Zero Stock-Picking Risk: If one company underperforms, the remaining 49 balance the portfolio.",
            "Low Expense Ratio: ETF management fees are typically less than 0.05% – 0.15% per year."
        ],
        "beginner_tip": "For first-time investors, starting with monthly SIPs in an index ETF like NIFTYBEES is the most reliable way to participate in India's economic growth."
    },
    {
        "id": "risk-management-stop-loss",
        "title": "Stop-Loss & Capital Preservation Rules",
        "category": "Risk Management",
        "reading_time_mins": 4,
        "summary": "The first rule of investing is capital preservation. Losses compound against you geometrically.",
        "icon": "ShieldAlert",
        "key_takeaways": [
            "A 10% loss requires an 11% gain to recover. A 50% loss requires a 100% gain just to break even.",
            "Stop-Loss: A predefined exit threshold (e.g. -7% or -8%) that limits capital destruction if an investment thesis fails.",
            "Target Price: A realistic valuation boundary to lock in partial profits rather than turning winning trades into losses.",
            "Automated Monitoring: FinSight AI continuously checks your holdings against your target prices and stop-losses."
        ],
        "beginner_tip": "Set your stop-loss and target price when you buy a stock, not when you are panicking during a market correction."
    },
    {
        "id": "sebi-investor-awareness",
        "title": "Indian Regulatory Framework & SEBI Guidelines",
        "category": "Compliance & Protection",
        "reading_time_mins": 3,
        "summary": "Understanding investor protections, transparency requirements, and the boundary between analysis and advisory.",
        "icon": "ShieldCheck",
        "key_takeaways": [
            "Securities and Exchange Board of India (SEBI): The statutory regulatory authority protecting retail investor interests.",
            "No Guaranteed Returns: Under Indian financial regulations, no legitimate platform can promise guaranteed profits or risk-free stock market returns.",
            "Educational Analysis vs Regulated Advisory: FinSight AI provides transparent mathematical analysis and educational risk decomposition to empower informed decisions, not personalized registered advisory.",
            "Avoid Unregistered 'Tips': Never execute trades based on unregulated social media channels or guaranteed profit claims."
        ],
        "beginner_tip": "Always verify data sources, inspect historical drawdown metrics, and understand why an alert triggered before acting."
    }
]

GLOSSARY_ITEMS = [
    {"term": "LTP (Last Traded Price)", "definition": "The exact price at which the most recent trade occurred on the exchange (NSE/BSE)."},
    {"term": "P/E Ratio (Price-to-Earnings)", "definition": "Stock Price divided by Annual Earnings Per Share. A P/E of 20 means investors are paying ₹20 for every ₹1 of company net profit."},
    {"term": "Beta", "definition": "A statistical measure of a stock's volatility relative to the benchmark index (NIFTY 50). Beta = 1.0 moves in tandem; Beta = 1.3 swings 30% more aggressively."},
    {"term": "Volatility (Annualized)", "definition": "The annualized standard deviation of daily percentage price returns, representing price dispersion risk."},
    {"term": "Maximum Drawdown", "definition": "The maximum observed peak-to-trough percentage loss an asset has experienced over a given period."},
    {"term": "Support & Resistance", "definition": "Support is a price floor where buyers historically overcome sellers; resistance is a price ceiling where sellers tend to emerge."}
]

@router.get("/modules")
async def get_modules():
    """Returns curated educational modules for beginner investors."""
    return {
        "modules": LEARNING_MODULES,
        "total_modules": len(LEARNING_MODULES)
    }

@router.get("/glossary")
async def get_glossary():
    """Returns financial terminology glossary tailored for Indian market beginners."""
    return {
        "terms": GLOSSARY_ITEMS,
        "total_terms": len(GLOSSARY_ITEMS)
    }
