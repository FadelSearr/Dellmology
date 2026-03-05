"""
Advanced Screener Module
Stock screening based on multiple criteria
"""


import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import json

logger = logging.getLogger(__name__)

class ScreenerMode(Enum):
    """Screener execution modes"""
    DAYTRADE = "DAYTRADE"  # High volatility, scalping, tight stops
    SWING = "SWING"  # Trend following, broker accumulation, longer holds
    CUSTOM = "CUSTOM"  # User-defined filters

@dataclass
class ScreenerConfig:
    """Configuration for screener"""
    mode: ScreenerMode = ScreenerMode.DAYTRADE
    min_technical_score: float = 0.6
    min_flow_score: float = 0.5
    min_pressure_score: float = 0.4
    min_volatility: float = 1.5  # percent
    max_volatility: float = 15.0  # percent
    min_volume: int = 100_000
    price_range_min: float = 100  # IDR
    price_range_max: float = 10_000  # IDR
    exclude_anomalies: bool = True  # Exclude stocks with HIGH severity anomalies
    max_results: int = 20

def calculate_model_confidence(signal_snapshots: List[Dict], actual_outcomes: Dict[str, float], threshold: float = 0.02) -> Dict:
    """
    Calculate model confidence based on historical signal accuracy.
    Args:
        signal_snapshots: List of saved signal snapshots
        actual_outcomes: Dict mapping symbol to actual outcome (profit/loss)
        threshold: Allowed deviation for 'hit'
    Returns:
        Dict with confidence score and status
    """
    total = len(signal_snapshots)
    hits = 0
    for snap in signal_snapshots:
        symbol = snap.get("symbol")
        expected = snap.get("recommendation")
        actual = actual_outcomes.get(symbol)
        # For simplicity, treat profit > 0 as hit for BUY, < 0 as hit for SELL
        if expected in ["BUY", "STRONG_BUY"] and actual and actual > threshold:
            hits += 1
        elif expected in ["SELL", "STRONG_SELL"] and actual and actual < -threshold:
            hits += 1
    confidence = hits / total if total else 0.0
    status = "HIGH" if confidence > 0.7 else ("MEDIUM" if confidence > 0.4 else "LOW")
    return {"confidence": confidence, "status": status, "total": total, "hits": hits}

def run_multi_version_analysis(stocks_data: List[Dict], config_a: ScreenerConfig, config_b: ScreenerConfig) -> Dict:
    """
    Run Champion (A) and Challenger (B) analysis and compare results
    Args:
        stocks_data: List of stock data dicts
        config_a: Champion config
        config_b: Challenger config
    Returns:
        Dict with both results and comparison
    """
    screener_a = AdvancedScreener()
    screener_a.config = config_a
    screener_b = AdvancedScreener()
    screener_b.config = config_b

    scores_a = screener_a.screen_all_stocks(stocks_data)
    scores_b = screener_b.screen_all_stocks(stocks_data)

    # Compare recommendations
    comparison = []
    for sa, sb in zip(scores_a, scores_b):
        comparison.append({
            'symbol': sa.symbol,
            'champion_score': sa.score,
            'champion_recommendation': sa.recommendation,
            'challenger_score': sb.score,
            'challenger_recommendation': sb.recommendation,
            'agreement': sa.recommendation == sb.recommendation
        })

    return {
        'champion': [asdict(s) for s in scores_a],
        'challenger': [asdict(s) for s in scores_b],
        'comparison': comparison
    }


@dataclass
class StockScore:
    """Comprehensive stock scoring for screening"""
    symbol: str
    score: float  # 0-100, composite score
    rank: int  # Position in sorted list (1=best)
    
    # Component scores
    technical_score: float  # CNN patterns + support/resistance
    flow_score: float  # Broker accumulation, Z-score
    pressure_score: float  # HAKA/HAKI ratio + volume
    volatility_score: float  # ATR-based volatility
    anomaly_score: float  # Order flow anomalies (negative impact)
    ai_consensus: float  # Gemini analysis agreement
    
    # Metrics
    current_price: float
    volatility_percent: float
    haka_ratio: float  # HAKA / (HAKA + HAKI)
    broker_net_value: int  # Net accumulation/distribution
    top_broker: str  # Name of top accumulating broker
    
    # Risk metrics
    risk_reward_ratio: float  # Best available pattern's R:R
    recommended_entry: float
    recommended_stop: float
    recommended_target: float
    
    # Additional context
    pattern_matches: List[str]  # Detected patterns
    anomalies_detected: List[str]  # Order flow anomalies
    recommendation: str  # BUY, SELL, HOLD, STRONG_BUY, STRONG_SELL
    reason: str  # Why this recommendation
    
    last_updated: str


@dataclass
@dataclass
class ScreenerConfig:
    """Configuration for screener"""
    mode: 'ScreenerMode' = ScreenerMode.DAYTRADE
    min_technical_score: float = 0.6
    min_flow_score: float = 0.5
    min_pressure_score: float = 0.4
    min_volatility: float = 1.5  # percent
    max_volatility: float = 15.0  # percent
    min_volume: int = 100_000
    price_range_min: float = 100  # IDR
    price_range_max: float = 10_000  # IDR
    exclude_anomalies: bool = True  # Exclude stocks with HIGH severity anomalies
    max_results: int = 20


class AdvancedScreener:
    """Advanced multi-factor stock screener"""
    
    def __init__(self):
        self.config = ScreenerConfig()
        self.stock_data_cache = {}
        self.pattern_cache = {}
        
    def set_mode(self, mode: ScreenerMode):
        """Set screener mode"""
        self.config.mode = mode
        
        # Auto-adjust parameters based on mode
        if mode == ScreenerMode.DAYTRADE:
            self.config.min_volatility = 2.0
            self.config.max_volatility = 12.0
            self.config.min_pressure_score = 0.6  # Need strong HAKA/HAKI
            self.config.min_flow_score = 0.4  # Less critical for day trades
            
        elif mode == ScreenerMode.SWING:
            self.config.min_volatility = 0.5
            self.config.max_volatility = 8.0
            self.config.min_pressure_score = 0.4
            self.config.min_flow_score = 0.65  # Need strong broker consensus
            self.config.min_technical_score = 0.7  # Need good patterns
    
    def calculate_technical_score(self, patterns: List, current_price: float) -> float:
        """
        Calculate technical score based on detected patterns
        
        High score if:
        - Multiple patterns detected
        - High confidence patterns
        - Patterns with good R:R ratios
        - Pattern agreement (bullish or bearish, not mixed)
        """
        if not patterns:
            return 0.0
        
        bullish_patterns = [p for p in patterns if p.get('pattern_type') == 'BULLISH']
        bearish_patterns = [p for p in patterns if p.get('pattern_type') == 'BEARISH']
        
        # Penalize mixed signals
        if bullish_patterns and bearish_patterns:
            # Some of each type = confusion = low score
            total = len(bullish_patterns) + len(bearish_patterns)
            mixed_ratio = min(len(bullish_patterns), len(bearish_patterns)) / total
            base_score = 0.4 + (0.2 * (1 - mixed_ratio))
        else:
            # Clear direction
            base_score = 0.7
        
        # Boost for high confidence patterns
        max_confidence = max([p.get('confidence', 0) for p in patterns])
        confidence_boost = max_confidence * 0.3
        
        # Boost for R:R ratio
        best_rr = max([
            (p.get('target_price', current_price) - p.get('entry_price', current_price)) /
            (p.get('entry_price', current_price) - p.get('stop_loss', current_price) + 1e-8)
            for p in patterns
        ]) if patterns else 1.0
        rr_boost = min(0.2, (best_rr - 1) / 20)  # Max 0.2 boost for 3:1 RR
        
        score = min(1.0, base_score + confidence_boost + rr_boost)
        return score
    
    def calculate_flow_score(self, broker_flows: Dict, symbol: str) -> float:
        """
        Calculate broker flow score based on:
        - Number of brokers accumulating
        - Z-score significance
        - Consistency (how many days active)
        - Concentration risk (is it just one broker?)
        """
        if not broker_flows:
            return 0.0
        
        # Count high z-score brokers (z > 2 = significant)
        high_z_brokers = sum(1 for b in broker_flows.values() 
                            if b.get('z_score', 0) > 2.0)
        
        # Get consistency scores
        consistencies = [b.get('consistency_score', 0) for b in broker_flows.values()]
        avg_consistency = np.mean(consistencies) if consistencies else 0
        
        # Check for concentration (bad if just 1 broker)
        num_brokers = len(broker_flows)
        if num_brokers < 2:
            concentration_penalty = 0.3
        elif num_brokers > 3:
            concentration_boost = 0.1
        else:
            concentration_penalty = 0.0
            concentration_boost = 0.0
        
        # Base score
        score = (high_z_brokers / max(1, len(broker_flows))) * 0.5
        score += avg_consistency * 0.3
        score += concentration_boost - concentration_penalty
        
        return min(1.0, score)
    
    def calculate_pressure_score(self, haka_volume: int, haki_volume: int, 
                                volume: int) -> float:
        """
        Calculate buy/sell pressure score
        
        High score if:
        - High HAKA ratio (aggressive buying)
        - High volume (conviction)
        - Consistent direction
        """
        total = haka_volume + haki_volume
        if total == 0:
            return 0.5  # Neutral
        
        haka_ratio = haka_volume / total
        
        # Volume conviction (higher volume = stronger signal)
        volume_ratio = min(1.0, volume / 1_000_000)  # Normalize to 1M volume
        
        # Pressure direction
        if haka_ratio > 0.65:
            direction_score = haka_ratio  # Can go up to 1.0
        elif haka_ratio < 0.35:
            direction_score = 1 - haka_ratio  # Inverse for bearish
        else:
            direction_score = 0.5  # Neutral
        
        score = direction_score * 0.6 + volume_ratio * 0.4
        return min(1.0, score)
    
    def calculate_volatility_score(self, atr_percent: float, mode: ScreenerMode) -> float:
        """
        Calculate volatility score based on ATR
        
        For DAYTRADE: High volatility is good (2-8%)
        For SWING: Lower volatility is good (0.5-3%)
        """
        if mode == ScreenerMode.DAYTRADE:
            optimal_vol = 4.0
            if 2.0 <= atr_percent <= 8.0:
                score = 1.0 - abs(atr_percent - optimal_vol) / 6.0
            elif atr_percent < 2.0:
                score = 0.5
            else:
                score = 0.3
        else:  # SWING
            optimal_vol = 1.5
            if 0.5 <= atr_percent <= 3.0:
                score = 1.0 - abs(atr_percent - optimal_vol) / 2.5
            elif atr_percent < 0.5:
                score = 0.5
            else:
                score = 0.3
        
        return min(1.0, max(0.0, score))
    
    def calculate_anomaly_score(self, anomalies: List) -> float:
        """
        Calculate anomaly score (negative impact)
        
        HIGH severity anomalies are very bad
        MEDIUM severity anomalies are moderate concern
        LOW severity anomalies are acceptable
        """
        if not anomalies:
            return 1.0  # No anomalies = good
        
        high_count = sum(1 for a in anomalies if a.get('severity') == 'HIGH')
        medium_count = sum(1 for a in anomalies if a.get('severity') == 'MEDIUM')
        low_count = sum(1 for a in anomalies if a.get('severity') == 'LOW')
        
        # Scoring: each high severity = -0.3, medium = -0.1, low = -0.05
        penalty = (high_count * 0.3) + (medium_count * 0.1) + (low_count * 0.05)
        score = max(0.0, 1.0 - penalty)
        
        return score
    
    def screen_stock(self, symbol: str, stock_data: Dict, patterns: List, 
                     broker_flows: Dict, heatmap_data: Dict, anomalies: List) -> StockScore:
        """
        Screen single stock with all factors
        """
        # Calculate component scores
        technical = self.calculate_technical_score(patterns, stock_data['current_price'])
        flow = self.calculate_flow_score(broker_flows, symbol)
        pressure = self.calculate_pressure_score(
            heatmap_data.get('haka_volume', 0),
            heatmap_data.get('haki_volume', 0),
            heatmap_data.get('total_volume', 0)
        )
        volatility = self.calculate_volatility_score(
            stock_data.get('atr_percent', 0),
            self.config.mode
        )
        anomaly = self.calculate_anomaly_score(anomalies)
        
        # Mode-specific weighting
        if self.config.mode == ScreenerMode.DAYTRADE:
            weights = {
                'technical': 0.2,
                'pressure': 0.4,    # Key for scalping
                'volatility': 0.25,  # Important for intraday
                'flow': 0.1,
                'anomaly': 0.05
            }
        else:  # SWING
            weights = {
                'technical': 0.3,
                'pressure': 0.2,
                'volatility': 0.15,
                'flow': 0.25,      # Key for swing
                'anomaly': 0.1
            }
        
        # Composite score
        composite = (
            technical * weights['technical'] +
            flow * weights['flow'] +
            pressure * weights['pressure'] +
            volatility * weights['volatility'] +
            anomaly * weights['anomaly']
        )
        
        # Determine recommendation
        if composite > 0.85:
            recommendation = "STRONG_BUY"
        elif composite > 0.70:
            recommendation = "BUY"
        elif composite < 0.30:
            recommendation = "STRONG_SELL"
        elif composite < 0.45:
            recommendation = "SELL"
        else:
            recommendation = "HOLD"
        
        # Build reason
        top_factors = []
        if technical > 0.8:
            top_factors.append("Strong patterns")
        if pressure > 0.8:
            top_factors.append("High buy pressure")
        if flow > 0.8:
            top_factors.append("Broker accumulation")
        if volatility > 0.8:
            top_factors.append(f"Optimal volatility for {self.config.mode.value}")
        
        reason = ", ".join(top_factors) if top_factors else "Mixed signals"
        
        # Get best pattern for risk-reward
        best_rr = 1.5
        best_pattern = None
        if patterns:
            best_pattern = max(patterns, 
                             key=lambda p: (p.get('target_price', 0) - p.get('entry_price', 0)) /
                                         (p.get('entry_price', 1) - p.get('stop_loss', 0) + 1e-8))
            best_rr = (
                (best_pattern.get('target_price', stock_data['current_price']) - 
                 best_pattern.get('entry_price', stock_data['current_price'])) /
                (best_pattern.get('entry_price', stock_data['current_price']) - 
                 best_pattern.get('stop_loss', stock_data['current_price']) + 1e-8)
            )
        
        return StockScore(
            symbol=symbol,
            score=composite * 100,
            rank=0,  # Will be set after sorting
            technical_score=technical * 100,
            flow_score=flow * 100,
            pressure_score=pressure * 100,
            volatility_score=volatility * 100,
            anomaly_score=anomaly * 100,
            ai_consensus=0.0,  # Will be set by AI
            current_price=stock_data.get('current_price', 0),
            volatility_percent=stock_data.get('atr_percent', 0),
            haka_ratio=heatmap_data.get('haka_ratio', 0),
            broker_net_value=broker_flows.get('net_value', 0) if broker_flows else 0,
            top_broker=list(broker_flows.keys())[0] if broker_flows else "",
            risk_reward_ratio=best_rr,
            recommended_entry=stock_data.get('current_price', 0),
            recommended_stop=stock_data.get('current_price', 0) * 0.97,
            recommended_target=stock_data.get('current_price', 0) * 1.05,
            pattern_matches=[p.get('pattern_name', 'Unknown') for p in patterns],
            anomalies_detected=[a.get('anomaly_type', 'Unknown') for a in anomalies],
            recommendation=recommendation,
            reason=reason,
            last_updated=pd.Timestamp.now().isoformat()
        )
    
    def screen_all_stocks(self, stocks_data: List[Dict]) -> List[StockScore]:
        """
        Screen all stocks and return ranked scores
        """
        scores = []
        
        for stock in stocks_data:
            symbol = stock['symbol']
            
            # Extract component data
            patterns = stock.get('patterns', [])
            broker_flows = stock.get('broker_flows', {})
            heatmap = stock.get('heatmap', {})
            anomalies = stock.get('anomalies', [])
            
            # Filter by minimum criteria
            if (len(patterns) < 1 and 
                not heatmap.get('haka_volume', 0) > 0):
                continue  # No signals at all
            
            # Calculate score
            score = self.screen_stock(symbol, stock, patterns, broker_flows, heatmap, anomalies)
            
            # Apply config filters
            if score.score < self.config.min_technical_score * 100:
                continue
            if score.volatility_percent < self.config.min_volatility:
                continue
            if score.volatility_percent > self.config.max_volatility:
                continue
            if self.config.exclude_anomalies and any(a.get('severity') == 'HIGH' 
                                                     for a in anomalies):
                continue
            
            scores.append(score)
        
        # Sort by score and rank
        scores.sort(key=lambda x: x.score, reverse=True)
        for i, score in enumerate(scores[:self.config.max_results], 1):
            score.rank = i
        
        return scores[:self.config.max_results]
    
    def export_results(self, scores: List[StockScore], format: str = 'json') -> str:
        """
        Export screening results
        """
        if format == 'json':
            data = [asdict(s) for s in scores]
            return json.dumps(data, indent=2, default=str)
        elif format == 'csv':
            df = pd.DataFrame([asdict(s) for s in scores])
            return df.to_csv(index=False)
        else:
            raise ValueError(f"Unknown format: {format}")
