#!/usr/bin/env python3
"""
Fundamental Analysis Engine untuk saham IDX
Menganalisis metrik fundamental seperti P/E, ROE, Dividend Yield, dll
"""

import json
import logging
import yfinance as yf
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class FundamentalMetrics:
    """Data class untuk metrik fundamental"""
    ticker: str
    price: float
    
    # Valuation Metrics
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    peg_ratio: Optional[float] = None
    
    # Profitability Metrics
    roe: Optional[float] = None  # Return on Equity
    roa: Optional[float] = None  # Return on Assets
    net_profit_margin: Optional[float] = None
    gross_profit_margin: Optional[float] = None
    
    # Growth Metrics
    revenue_growth: Optional[float] = None
    earnings_growth: Optional[float] = None
    
    # Liquidity & Solvency
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None
    debt_to_equity: Optional[float] = None
    interest_coverage: Optional[float] = None
    
    # Dividend & Payout
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    eps: Optional[float] = None
    
    # Efficiency
    asset_turnover: Optional[float] = None
    inventory_turnover: Optional[float] = None
    
    # Market Metrics
    market_cap: Optional[float] = None
    book_value: Optional[float] = None
    
    timestamp: str = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now().isoformat()


class FundamentalAnalyzer:
    """
    Engine untuk menganalisis metrik fundamental saham IDX
    """
    
    def __init__(self, stockbit_token: Optional[str] = None, yahoo_finance_base: str = "https://query1.finance.yahoo.com"):
        self.stockbit_token = stockbit_token
        self.yahoo_base = yahoo_finance_base
        self.cache = {}
        self.cache_ttl = 3600  # 1 jam
        
    def analyze_stock(self, ticker: str, currency: str = "IDR") -> Dict:
        """
        Analisis fundamental untuk satu saham
        
        Args:
            ticker: Kode saham (contoh: BBRI.JK, BMRI.JK)
            currency: Mata uang (default: IDR)
            
        Returns:
            Dict dengan metrik fundamental dan rekomendasi
        """
        try:
            # Fetch fundamental data dari Yahoo Finance (Live)
            fundamental_data = self._fetch_yahoo_fundamental(ticker)
            
            # Fetch price data dari Yahoo Finance (Live)
            price_data = self._fetch_price_data(ticker)
            
            # Hitung metrik
            metrics = self._calculate_metrics(ticker, fundamental_data, price_data)
            
            # Generate insight & rekomendasi
            insight = self._generate_insight(metrics)
            
            return {
                "success": True,
                "ticker": ticker,
                "metrics": self._dataclass_to_dict(metrics),
                "insight": insight,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error analyzing {ticker}: {str(e)}", exc_info=True)
            return {
                "success": False,
                "ticker": ticker,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    def analyze_multiple(self, tickers: List[str], currency: str = "IDR") -> List[Dict]:
        """Analisis fundamental untuk multiple saham"""
        results = []
        for ticker in tickers:
            result = self.analyze_stock(ticker, currency)
            results.append(result)
        return results
    
    def screen_by_fundamental(self, criteria: Dict, tickers: List[str]) -> List[Dict]:
        """
        Screen saham berdasarkan kriteria fundamental
        """
        results = []
        
        for ticker in tickers:
            analysis = self.analyze_stock(ticker)
            
            if not analysis["success"]:
                continue
                
            metrics = analysis["metrics"]
            
            # Check criteria
            if self._matches_criteria(metrics, criteria):
                analysis["match_score"] = self._calculate_match_score(metrics, criteria)
                results.append(analysis)
        
        # Sort by match score
        results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
        return results
    
    def _fetch_yahoo_fundamental(self, ticker: str) -> Dict:
        """
        Fetch fundamental data dari Yahoo Finance (Live) using yfinance
        """
        try:
            yf_ticker = ticker if ".JK" in ticker else f"{ticker}.JK"
            stock = yf.Ticker(yf_ticker)
            
            info = stock.info
            
            def extract(key):
                val = info.get(key)
                return float(val) if val is not None else 0.0
            
            return {
                "eps": extract("trailingEps"),
                "book_value": extract("bookValue"),
                "net_income": extract("netIncomeToCommon"),
                "revenue": extract("totalRevenue"),
                "total_assets": extract("totalAssets"),
                "total_equity": extract("totalStockholderEquity"),
                "total_debt": extract("totalDebt"),
                "current_assets": extract("totalCurrentAssets"),
                "current_liabilities": extract("totalCurrentLiabilities"),
                "inventory": extract("inventory"),
                "dividend_per_share": extract("dividendRate"),
                "operating_income": extract("operatingMargins") * extract("totalRevenue"),
                "cogs": extract("totalRevenue") - extract("grossProfits")
            }
            
        except Exception as e:
            logger.warning(f"Could not fetch Yahoo Fundamental data for {ticker}: {e}")
            return {}
    
    def _fetch_price_data(self, ticker: str) -> Dict:
        """Fetch price data dari Yahoo Finance using yfinance"""
        try:
            yf_ticker = ticker if ".JK" in ticker else f"{ticker}.JK"
            stock = yf.Ticker(yf_ticker)
            
            hist = stock.history(period="1y")
            if hist.empty:
                return {}
                
            last_price = hist['Close'].iloc[-1]
            return {
                "price": last_price,
                "52_week_high": hist['High'].max(),
                "52_week_low": hist['Low'].min(),
                "volume": hist['Volume'].iloc[-1],
            }
            
        except Exception as e:
            logger.warning(f"Could not fetch price data for {ticker}: {e}")
            return {}
    
    def _calculate_metrics(self, ticker: str, fundamental_data: Dict, price_data: Dict) -> FundamentalMetrics:
        """Hitung semua metrik fundamental"""
        
        price = price_data.get("price", 0)
        
        # Dari fundamental_data (Stockbit/API)
        eps = fundamental_data.get("eps", 0)
        book_value = fundamental_data.get("book_value", 0)
        net_income = fundamental_data.get("net_income", 0)
        revenue = fundamental_data.get("revenue", 0)
        total_assets = fundamental_data.get("total_assets", 0)
        total_equity = fundamental_data.get("total_equity", 0)
        total_debt = fundamental_data.get("total_debt", 0)
        current_assets = fundamental_data.get("current_assets", 0)
        current_liabilities = fundamental_data.get("current_liabilities", 0)
        inventory = fundamental_data.get("inventory", 0)
        dividend_per_share = fundamental_data.get("dividend_per_share", 0)
        operating_income = fundamental_data.get("operating_income", 0)
        cogs = fundamental_data.get("cogs", 0)
        
        # Hitung P/E Ratio
        pe_ratio = price / eps if eps > 0 else None
        
        # Hitung P/B Ratio
        pb_ratio = price / book_value if book_value > 0 else None
        
        # Hitung ROE (Return on Equity)
        roe = (net_income / total_equity * 100) if total_equity > 0 else None
        
        # Hitung ROA (Return on Assets)
        roa = (net_income / total_assets * 100) if total_assets > 0 else None
        
        # Hitung Net Profit Margin
        net_profit_margin = (net_income / revenue * 100) if revenue > 0 else None
        
        # Hitung Gross Profit Margin
        gross_profit = revenue - cogs
        gross_profit_margin = (gross_profit / revenue * 100) if revenue > 0 else None
        
        # Hitung Current Ratio
        current_ratio = current_assets / current_liabilities if current_liabilities > 0 else None
        
        # Hitung Quick Ratio
        quick_assets = current_assets - inventory
        quick_ratio = quick_assets / current_liabilities if current_liabilities > 0 else None
        
        # Hitung Debt to Equity
        debt_to_equity = total_debt / total_equity if total_equity > 0 else None
        
        # Hitung Dividend Yield
        dividend_yield = (dividend_per_share / price * 100) if price > 0 else None
        
        # Hitung Asset Turnover
        asset_turnover = revenue / total_assets if total_assets > 0 else None
        
        return FundamentalMetrics(
            ticker=ticker,
            price=price,
            pe_ratio=pe_ratio,
            pb_ratio=pb_ratio,
            roe=roe,
            roa=roa,
            net_profit_margin=net_profit_margin,
            gross_profit_margin=gross_profit_margin,
            current_ratio=current_ratio,
            quick_ratio=quick_ratio,
            debt_to_equity=debt_to_equity,
            dividend_yield=dividend_yield,
            eps=eps,
            asset_turnover=asset_turnover
        )
    
    def _generate_insight(self, metrics: FundamentalMetrics) -> Dict:
        """Generate insight dan rekomendasi berdasarkan metrik"""
        insight = {
            "valuation": {},
            "profitability": {},
            "liquidity": {},
            "growth": {},
            "overall_rating": "",
            "recommendation": "",
            "warning": []
        }
        
        # Valuation Analysis
        if metrics.pe_ratio:
            if metrics.pe_ratio < 15:
                insight["valuation"]["pe_assessment"] = "Undervalued"
                insight["valuation"]["pe_status"] = "✅"
            elif metrics.pe_ratio > 25:
                insight["valuation"]["pe_assessment"] = "Overvalued"
                insight["valuation"]["pe_status"] = "⚠️"
            else:
                insight["valuation"]["pe_assessment"] = "Fair Value"
                insight["valuation"]["pe_status"] = "➡️"
        
        if metrics.pb_ratio:
            if metrics.pb_ratio < 1.5:
                insight["valuation"]["pb_assessment"] = "Attractive"
                insight["valuation"]["pb_status"] = "✅"
            else:
                insight["valuation"]["pb_assessment"] = "Expensive"
                insight["valuation"]["pb_status"] = "⚠️"
        
        # Profitability Analysis
        if metrics.roe and metrics.roe > 15:
            insight["profitability"]["roe_status"] = "✅ Excellent ROE"
        elif metrics.roe and metrics.roe > 10:
            insight["profitability"]["roe_status"] = "➡️ Good ROE"
        else:
            insight["profitability"]["roe_status"] = "⚠️ Low ROE"
            insight["warning"].append("ROE lebih rendah dari rata-rata industri")
        
        if metrics.net_profit_margin and metrics.net_profit_margin > 20:
            insight["profitability"]["margin_status"] = "✅ Excellent Margin"
        elif metrics.net_profit_margin and metrics.net_profit_margin > 10:
            insight["profitability"]["margin_status"] = "➡️ Good Margin"
        else:
            insight["profitability"]["margin_status"] = "⚠️ Low Margin"
        
        # Liquidity Analysis
        if metrics.current_ratio and metrics.current_ratio >= 1.5:
            insight["liquidity"]["status"] = "✅ Healthy"
        elif metrics.current_ratio and metrics.current_ratio >= 1.0:
            insight["liquidity"]["status"] = "➡️ Adequate"
        else:
            insight["liquidity"]["status"] = "⚠️ Concerning"
            insight["warning"].append("Current ratio di bawah 1.0 - potensi likuiditas bermasalah")
        
        # Debt Analysis
        if metrics.debt_to_equity and metrics.debt_to_equity <= 1.0:
            insight["liquidity"]["debt_status"] = "✅ Conservative"
        elif metrics.debt_to_equity and metrics.debt_to_equity <= 2.0:
            insight["liquidity"]["debt_status"] = "➡️ Moderate"
        else:
            insight["liquidity"]["debt_status"] = "⚠️ High Leverage"
            insight["warning"].append("Debt-to-equity ratio tinggi - risiko finansial meningkat")
        
        # Dividend Analysis
        if metrics.dividend_yield and metrics.dividend_yield >= 5:
            insight["growth"]["dividend"] = f"💰 Excellent ({metrics.dividend_yield:.2f}%)"
        elif metrics.dividend_yield and metrics.dividend_yield >= 3:
            insight["growth"]["dividend"] = f"✅ Good ({metrics.dividend_yield:.2f}%)"
        else:
            insight["growth"]["dividend"] = f"➡️ Moderate ({metrics.dividend_yield:.2f}%)" if metrics.dividend_yield else "❌ No dividend"
        
        # Overall Rating
        positive_signals = sum([
            bool(metrics.pe_ratio and metrics.pe_ratio < 15),
            bool(metrics.pb_ratio and metrics.pb_ratio < 1.5),
            bool(metrics.roe and metrics.roe > 15),
            bool(metrics.current_ratio and metrics.current_ratio >= 1.5),
            bool(metrics.debt_to_equity and metrics.debt_to_equity <= 1.0),
            bool(metrics.net_profit_margin and metrics.net_profit_margin > 10)
        ])
        
        if positive_signals >= 5:
            insight["overall_rating"] = "🟢 STRONG BUY"
            insight["recommendation"] = "Saham ini memiliki fundamentals yang sangat kuat untuk investasi jangka panjang"
        elif positive_signals >= 4:
            insight["overall_rating"] = "🟢 BUY"
            insight["recommendation"] = "Saham ini menarik untuk dipertimbangkan sebagai investasi"
        elif positive_signals >= 2:
            insight["overall_rating"] = "🟡 HOLD"
            insight["recommendation"] = "Tunggu signal yang lebih kuat sebelum masuk"
        else:
            insight["overall_rating"] = "🔴 SELL"
            insight["recommendation"] = "Fundamentals lemah, pertimbangkan pilihan lain"
        
        return insight
    
    def _matches_criteria(self, metrics: Dict, criteria: Dict) -> bool:
        """Check apakah metrics match dengan criteria"""
        for key, threshold in criteria.items():
            metric_key = key.replace("min_", "").replace("max_", "")
            
            if metric_key not in metrics:
                continue
            
            value = metrics[metric_key]
            
            if value is None:
                continue
            
            if key.startswith("min_") and value < threshold:
                return False
            
            if key.startswith("max_") and value > threshold:
                return False
        
        return True
    
    def _calculate_match_score(self, metrics: Dict, criteria: Dict) -> float:
        """Hitung score seberapa match dengan criteria"""
        score = 0
        matches = 0
        
        for key, threshold in criteria.items():
            metric_key = key.replace("min_", "").replace("max_", "")
            
            if metric_key not in metrics:
                continue
            
            value = metrics[metric_key]
            
            if value is None:
                continue
            
            matches += 1
            
            if key.startswith("min_"):
                score += min(value / threshold, 1.0) * 100
            else:
                score += min(threshold / value, 1.0) * 100
        
        return (score / matches) if matches > 0 else 0
    

    
    def _dataclass_to_dict(self, obj: FundamentalMetrics) -> Dict:
        """Convert dataclass to dictionary"""
        result = {}
        for key, value in obj.__dict__.items():
            if value is not None:
                # Round float values to 2 decimal places
                if isinstance(value, float):
                    result[key] = round(value, 2)
                else:
                    result[key] = value
        return result


# CLI Testing
if __name__ == "__main__":
    import json
    import sys
    analyzer = FundamentalAnalyzer()
    
    # Test single stock
    print("=" * 80)
    print("FUNDAMENTAL ANALYSIS - SINGLE STOCK")
    print("=" * 80)
    result = analyzer.analyze_stock("BBRI.JK")
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    # Test screening
    print("\n" + "=" * 80)
    print("FUNDAMENTAL SCREENING")
    print("=" * 80)
    criteria = {
        "min_roe": 12,
        "max_pe": 22,
        "min_current_ratio": 1.2,
        "max_debt_to_equity": 1.5
    }
    results = analyzer.screen_by_fundamental(criteria, ["BBRI.JK", "BMRI.JK", "BBCA.JK"])
    print(json.dumps(results, indent=2, ensure_ascii=False))
