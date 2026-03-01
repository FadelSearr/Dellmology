package main

import (
	"fmt"
	"log"
	"time"
)

// Market Regime Types
type RegimeType string

const (
	RegimeUptrend   RegimeType = "UPTREND"
	RegimeDowntrend RegimeType = "DOWNTREND"
	RegimeSideways  RegimeType = "SIDEWAYS"
	RegimeVolatile  RegimeType = "VOLATILE"
)

type VolatilityLevel string

const (
	VolatilityLow    VolatilityLevel = "LOW"
	VolatilityMed    VolatilityLevel = "MEDIUM"
	VolatilityHigh   VolatilityLevel = "HIGH"
	VolatilityExtreme VolatilityLevel = "EXTREME"
)

type MarketRegime struct {
	Regime           RegimeType      `json:"regime"`
	Volatility       VolatilityLevel `json:"volatility"`
	TrendStrength    float64         `json:"trend_strength"`    // 0-100
	RSI              float64         `json:"rsi"`               // 0-100
	ATR              float64         `json:"atr"`               // Average True Range
	LastUpdated      time.Time       `json:"last_updated"`
	Timestamp        int64           `json:"timestamp"`
}

type RegimeAnalyzer struct {
	prices       []float64
	closes       []float64
	highs        []float64
	lows         []float64
	maxHistory   int
	updateTicker *time.Ticker
}

// NewRegimeAnalyzer creates a new market regime analyzer
func NewRegimeAnalyzer(maxHistory int) *RegimeAnalyzer {
	return &RegimeAnalyzer{
		prices:     make([]float64, 0, maxHistory),
		closes:     make([]float64, 0, maxHistory),
		highs:      make([]float64, 0, maxHistory),
		lows:       make([]float64, 0, maxHistory),
		maxHistory: maxHistory,
	}
}

// AddPrice adds a price point for analysis
func (ra *RegimeAnalyzer) AddPrice(price float64) {
	if len(ra.prices) >= ra.maxHistory {
		ra.prices = ra.prices[1:]
		ra.closes = ra.closes[1:]
		ra.highs = ra.highs[1:]
		ra.lows = ra.lows[1:]
	}
	ra.prices = append(ra.prices, price)
	ra.closes = append(ra.closes, price)
	
	// Update highs/lows
	if len(ra.highs) == 0 {
		ra.highs = append(ra.highs, price)
		ra.lows = append(ra.lows, price)
	} else {
		high := ra.highs[len(ra.highs)-1]
		low := ra.lows[len(ra.lows)-1]
		
		if price > high {
			ra.highs = append(ra.highs, price)
		} else {
			ra.highs = append(ra.highs, high)
		}
		
		if price < low {
			ra.lows = append(ra.lows, price)
		} else {
			ra.lows = append(ra.lows, low)
		}
	}
}

// CalculateRegime computes the current market regime
func (ra *RegimeAnalyzer) CalculateRegime() MarketRegime {
	if len(ra.prices) < 20 {
		return MarketRegime{
			Regime:      RegimeSideways,
			Volatility:  VolatilityMed,
			LastUpdated: time.Now(),
			Timestamp:   time.Now().Unix(),
		}
	}

	// Calculate ATR (Average True Range)
	atr := ra.calculateATR()

	// Calculate RSI (Relative Strength Index)
	rsi := ra.calculateRSI()

	// Calculate trend strength using linear regression
	trendStrength := ra.calculateTrendStrength()

	// Determine volatility level
	volatility := ra.classifyVolatility(atr)

	// Determine regime based on trend and RSI
	regime := ra.classifyRegime(trendStrength, rsi)

	return MarketRegime{
		Regime:        regime,
		Volatility:    volatility,
		TrendStrength: trendStrength,
		RSI:           rsi,
		ATR:           atr,
		LastUpdated:   time.Now(),
		Timestamp:     time.Now().Unix(),
	}
}

// calculateATR computes Average True Range
func (ra *RegimeAnalyzer) calculateATR() float64 {
	if len(ra.prices) < 2 {
		return 0
	}

	period := 14
	if len(ra.closes) < period {
		period = len(ra.closes)
	}

	sum := 0.0
	for i := period - 1; i < len(ra.closes); i++ {
		high := ra.highs[i]
		low := ra.lows[i]
		prevClose := 0.0
		if i > 0 {
			prevClose = ra.closes[i-1]
		}

		tr := high - low
		if high-prevClose > tr {
			tr = high - prevClose
		}
		if prevClose-low > tr {
			tr = prevClose - low
		}
		sum += tr
	}

	return sum / float64(period)
}

// calculateRSI computes Relative Strength Index
func (ra *RegimeAnalyzer) calculateRSI() float64 {
	if len(ra.closes) < 14 {
		return 50 // Neutral default
	}

	period := 14
	gainSum := 0.0
	lossSum := 0.0

	for i := len(ra.closes) - period; i < len(ra.closes); i++ {
		change := ra.closes[i] - ra.closes[i-1]
		if change > 0 {
			gainSum += change
		} else {
			lossSum -= change
		}
	}

	avgGain := gainSum / float64(period)
	avgLoss := lossSum / float64(period)

	if avgLoss == 0 {
		if avgGain > 0 {
			return 100
		}
		return 50
	}

	rs := avgGain / avgLoss
	rsi := 100 - (100 / (1 + rs))

	return rsi
}

// calculateTrendStrength uses simple linear regression
func (ra *RegimeAnalyzer) calculateTrendStrength() float64 {
	if len(ra.prices) < 20 {
		return 0
	}

	// Use last 20 prices for trend analysis
	start := len(ra.prices) - 20
	if start < 0 {
		start = 0
	}
	prices := ra.prices[start:]

	// Linear regression
	n := float64(len(prices))
	sumX := n * (n - 1) / 2
	sumY := 0.0
	sumXY := 0.0
	sumX2 := 0.0

	for i, price := range prices {
		x := float64(i)
		sumY += price
		sumXY += x * price
		sumX2 += x * x
	}

	slope := (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX)

	// Calculate R-squared as trend strength
	avgY := sumY / n
	ssRes := 0.0
	ssTot := 0.0

	for i, price := range prices {
		predicted := slope*float64(i) + (avgY - slope*sumX/n)
		ssRes += (price - predicted) * (price - predicted)
		ssTot += (price - avgY) * (price - avgY)
	}

	rSquared := 0.0
	if ssTot != 0 {
		rSquared = (1 - ssRes/ssTot) * 100
	}

	if rSquared < 0 {
		rSquared = 0
	}

	return rSquared
}

// classifyRegime determines the market regime
func (ra *RegimeAnalyzer) classifyRegime(trendStrength float64, rsi float64) RegimeType {
	// If weak trend, it's sideways
	if trendStrength < 30 {
		return RegimeSideways
	}

	// Strong uptrend: RSI > 50 and trend strength > 50
	if rsi > 55 && trendStrength > 50 {
		return RegimeUptrend
	}

	// Strong downtrend: RSI < 45 and trend strength > 50
	if rsi < 45 && trendStrength > 50 {
		return RegimeDowntrend
	}

	// Default to sideways
	return RegimeSideways
}

// classifyVolatility determines volatility level based on ATR
func (ra *RegimeAnalyzer) classifyVolatility(atr float64) VolatilityLevel {
	if len(ra.closes) == 0 {
		return VolatilityMed
	}

	lastPrice := ra.closes[len(ra.closes)-1]
	atrPercent := (atr / lastPrice) * 100

	// Volatility classification (adjustable thresholds)
	if atrPercent > 5.0 {
		return VolatilityExtreme
	} else if atrPercent > 3.0 {
		return VolatilityHigh
	} else if atrPercent > 1.5 {
		return VolatilityMed
	}

	return VolatilityLow
}

// String representation
func (mr MarketRegime) String() string {
	return fmt.Sprintf("%s (Vol: %s, Strength: %.1f%%)", mr.Regime, mr.Volatility, mr.TrendStrength)
}

// GetStatus returns a human-readable status
func (mr MarketRegime) GetStatus() string {
	status := fmt.Sprintf("%s - %s", mr.Regime, mr.Volatility)
	if mr.Volatility == VolatilityExtreme {
		status += " ⚠️  CAUTION"
	}
	return status
}

// LogRegime logs the regime information
func LogRegime(regime MarketRegime) {
	log.Printf("[REGIME] %s | RSI: %.1f | ATR: %.2f | Strength: %.1f%%",
		regime.Regime, regime.RSI, regime.ATR, regime.TrendStrength)
}
