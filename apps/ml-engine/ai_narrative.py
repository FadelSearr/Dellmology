import os
import json
import logging
from datetime import datetime
import google.generativeai as genai

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Configure Gemini API
API_KEY = os.getenv('GEMINI_API_KEY', 'YOUR_API_KEY_HERE')
genai.configure(api_key=API_KEY)

class AINarrativeGenerator:
    """Generates AI narratives for market analysis using Gemini API"""
    
    def __init__(self):
        self.model = genai.GenerativeModel('gemini-1.5-flash')
    
    def generate_broker_analysis_narrative(self, broker_data: dict) -> str:
        """
        Generates narrative for broker flow analysis
        Args:
            broker_data: {
                'symbol': 'BBCA',
                'whales': [...],
                'z_score': [-2.5, 0, 2.5],
                'wash_sale_score': 45,
                'consistency': 5/7
            }
        """
        try:
            prompt = f"""
            Analyze the following broker flow data for {broker_data.get('symbol', 'UNKNOWN')} stock and provide a brief, strategic narrative:
            
            Data:
            - Whale Brokers (Z-Score > 2.5): {json.dumps(broker_data.get('whales', [])[:3])}
            - Wash Sale Risk Score: {broker_data.get('wash_sale_score', 0):.1f}%
            - Consistency Score: {broker_data.get('consistency', 0):.1f}%
            - Analysis Period: {broker_data.get('period', '7 days')}
            
            Provide analysis in Indonesian language covering:
            1. Current broker sentiment (Accumulasi/Distribusi/Netral)
            2. Whale activity patterns
            3. Risk assessment (Wash sale probability)
            4. Short-term outlook
            
            Keep it concise (max 150 words) and actionable for traders.
            """
            
            response = self.model.generate_content(prompt)
            return response.text
            
        except Exception as e:
            logging.error(f"Error generating broker narrative: {e}")
            return "Unable to generate analysis at this time."
    
    def generate_market_regime_narrative(self, regime_data: dict) -> str:
        """
        Generates narrative for market regime
        Args:
            regime_data: {
                'regime': 'UPTREND',
                'volatility': 'HIGH',
                'rsi': 65,
                'atr': 145,
                'trend_strength': 72
            }
        """
        try:
            prompt = f"""
            Analyze the current market regime and provide strategic guidance:
            
            Market Regime:
            - Trend: {regime_data.get('regime', 'UNKNOWN')}
            - Volatility: {regime_data.get('volatility', 'MEDIUM')}
            - RSI: {regime_data.get('rsi', 50):.1f}
            - Trend Strength: {regime_data.get('trend_strength', 0):.1f}%
            - ATR: {regime_data.get('atr', 0):.2f}
            
            Provide guidance in Indonesian covering:
            1. Market condition assessment
            2. Recommended trading strategy (Daytrade vs Swing)
            3. Risk management advice
            4. Key levels to watch
            
            Keep it concise (max 150 words) and practical.
            """
            
            response = self.model.generate_content(prompt)
            return response.text
            
        except Exception as e:
            logging.error(f"Error generating regime narrative: {e}")
            return "Unable to analyze market conditions at this time."
    
    def generate_screener_narrative(self, screener_results: dict) -> str:
        """
        Generates narrative for AI screener results
        Args:
            screener_results: {
                'mode': 'DAYTRADE',
                'stocks': ['BBCA', 'TLKM'],
                'signals': [85, 72],
                'reasons': ['High HAKA', 'Whale accumulation']
            }
        """
        try:
            stocks_info = "\n".join([
                f"- {stock}: Signal {screener_results['signals'][i]}/100 ({screener_results['reasons'][i]})"
                for i, stock in enumerate(screener_results.get('stocks', [])[:5])
            ])
            
            prompt = f"""
            Summarize these AI screener results for {screener_results.get('mode', 'TRADING')} mode:
            
            {stocks_info}
            
            Provide analysis in Indonesian (max 100 words):
            1. Best opportunities today
            2. Common patterns observed
            3. Caution points or risks
            4. Next scan time recommendation
            """
            
            response = self.model.generate_content(prompt)
            return response.text
            
        except Exception as e:
            logging.error(f"Error generating screener narrative: {e}")
            return "Unable to process screener results."
    
    def generate_swot_analysis(self, symbol: str, data: dict) -> dict:
        """
        Generates SWOT analysis for a stock
        Returns structured SWOT as dict
        """
        try:
            prompt = f"""
            Provide a SWOT analysis for {symbol} based on:
            
            Broker Flow: {json.dumps(data.get('broker_flow', {}))}
            Market Regime: {data.get('regime', 'NEUTRAL')}
            Technical Signal: {data.get('technical_signal', 'NEUTRAL')}
            
            Return ONLY valid JSON in this format:
            {{
                "strengths": ["item1", "item2"],
                "weaknesses": ["item1", "item2"],
                "opportunities": ["item1", "item2"],
                "threats": ["item1", "item2"]
            }}
            """
            
            response = self.model.generate_content(prompt)
            
            # Parse JSON from response
            try:
                swot = json.loads(response.text)
                return swot
            except json.JSONDecodeError:
                logging.warning("Failed to parse SWOT JSON, returning default")
                return {
                    "strengths": ["Unable to analyze"],
                    "weaknesses": [],
                    "opportunities": [],
                    "threats": []
                }
                
        except Exception as e:
            logging.error(f"Error generating SWOT: {e}")
            return {}


# Test/Demo function
def main():
    """Demo of narrative generation"""
    generator = AINarrativeGenerator()
    
    # Test broker narrative
    broker_data = {
        'symbol': 'BBCA',
        'whales': [
            {'broker': 'PD', 'net_value': 5000000000, 'z_score': 3.2},
            {'broker': 'YP', 'net_value': 3000000000, 'z_score': 2.8}
        ],
        'wash_sale_score': 35,
        'consistency': 6/7,
        'period': '7 days'
    }
    
    print("=" * 60)
    print("BROKER ANALYSIS NARRATIVE")
    print("=" * 60)
    narrative = generator.generate_broker_analysis_narrative(broker_data)
    print(narrative)
    
    # Test regime narrative
    regime_data = {
        'regime': 'UPTREND',
        'volatility': 'HIGH',
        'rsi': 68,
        'atr': 145.5,
        'trend_strength': 75.2
    }
    
    print("\n" + "=" * 60)
    print("MARKET REGIME NARRATIVE")
    print("=" * 60)
    narrative = generator.generate_market_regime_narrative(regime_data)
    print(narrative)


if __name__ == "__main__":
    main()
