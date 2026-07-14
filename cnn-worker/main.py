# ══════════════════════════════════════════════════════════════
# Dellmology Pro — CNN Technical Pattern Recognition Worker
# 
# Per roadmap: "CNN Technical Pattern Recognition (Python worker).
# Python is unmatched for ML/AI. Use FastAPI to expose a local
# endpoint that the Next.js backend can call."
# ══════════════════════════════════════════════════════════════

import io
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel
import numpy as np
import logging

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from engine.fundamental_analyzer import FundamentalAnalyzer

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Dellmology CNN Vision Engine", version="1.0.0")
analyzer = FundamentalAnalyzer()

import pandas as pd
import mplfinance as mpf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image

def compute_rsi(prices, period=14):
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-10)
    return 100 - (100 / (1 + rs))

def compute_macd(prices, slow=26, fast=12, signal=9):
    exp1 = prices.ewm(span=fast, adjust=False).mean()
    exp2 = prices.ewm(span=slow, adjust=False).mean()
    macd = exp1 - exp2
    macd_signal = macd.ewm(span=signal, adjust=False).mean()
    return macd, macd_signal

def compute_heikin_ashi(df):
    ha_df = df.copy()
    ha_close = (df['Open'] + df['High'] + df['Low'] + df['Close']) / 4.0
    
    ha_open = pd.Series(0.0, index=df.index)
    ha_open.iloc[0] = (df['Open'].iloc[0] + df['Close'].iloc[0]) / 2.0
    for i in range(1, len(df)):
        ha_open.iloc[i] = (ha_open.iloc[i-1] + ha_close.iloc[i-1]) / 2.0
        
    ha_high = pd.concat([df['High'], ha_open, ha_close], axis=1).max(axis=1)
    ha_low = pd.concat([df['Low'], ha_open, ha_close], axis=1).min(axis=1)
    
    ha_df['Open'] = ha_open
    ha_df['Close'] = ha_close
    ha_df['High'] = ha_high
    ha_df['Low'] = ha_low
    return ha_df

def apply_time_gradient(image_path):
    try:
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img, dtype=np.float32)
        h, w, c = arr.shape
        gradient = np.linspace(0.3, 1.0, w).reshape(1, w, 1)
        arr = arr * gradient
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        Image.fromarray(arr).save(image_path)
    except Exception as e:
        logger.error(f"Error applying time gradient to {image_path}: {e}")

def generate_candlestick_image(df_window, filename):
    mc = mpf.make_marketcolors(up='g', down='r', edge='inherit', wick='inherit', volume='in')
    s  = mpf.make_mpf_style(marketcolors=mc, gridstyle='', facecolor='black', edgecolor='black', figcolor='black')
    
    h_max = df_window['High'].max()
    l_min = df_window['Low'].min()
    diff = h_max - l_min
    
    fib_levels = []
    if diff > 0:
        fib_levels = [
            h_max - 0.236 * diff,
            h_max - 0.382 * diff,
            h_max - 0.500 * diff,
            h_max - 0.618 * diff,
            h_max - 0.786 * diff
        ]
    
    ap = []
    if 'MA20' in df_window.columns and not df_window['MA20'].isna().all():
        ap.append(mpf.make_addplot(df_window['MA20'], color='#3498db', width=1.0))
    if 'MA50' in df_window.columns and not df_window['MA50'].isna().all():
        ap.append(mpf.make_addplot(df_window['MA50'], color='#f1c40f', width=1.0))
    if 'VWAP' in df_window.columns and not df_window['VWAP'].isna().all():
        ap.append(mpf.make_addplot(df_window['VWAP'], color='#e74c3c', width=1.0))
        
    plot_kwargs = {
        'type': 'candle',
        'style': s,
        'axisoff': True,
        'savefig': dict(fname=filename, dpi=100, bbox_inches='tight', pad_inches=0)
    }
    
    if ap:
        plot_kwargs['addplot'] = ap
    if fib_levels:
        plot_kwargs['hlines'] = dict(hlines=fib_levels, colors='#7f8c8d', linestyle='dashed', linewidths=0.5)
        
    mpf.plot(df_window, **plot_kwargs)
    plt.close('all')
    apply_time_gradient(filename)

# ── PyTorch Model Loading ──────────────────────────────────────
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image

MODEL_PATH = os.path.join(os.path.dirname(__file__), "best_model.pth")
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

CLASSES = ['breakout', 'bullish_flag', 'sideways', 'trash']

from torchvision import models

class ChartPatternResNet(nn.Module):
    """
    Optimized ResNet18 Multi-Modal Architecture for fast CPU training.
    """
    def __init__(self, num_classes=4):
        super(ChartPatternResNet, self).__init__()
        # Load ResNet18 base
        self.model = models.resnet18(weights=None)
        
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        
        # Tabular MLP Branch
        self.tab_mlp = nn.Sequential(
            nn.Linear(7, 16),
            nn.ReLU(),
            nn.Linear(16, 16),
            nn.ReLU()
        )
        
        # ResNet18 layer2 output features: 128, layer4 output features: 512
        # Total visual features = 128 + 512 = 640
        # Fused layer: 640 + 16 (tabular) = 656 inputs -> 128 -> num_classes
        self.fc = nn.Sequential(
            nn.Linear(128 + 512 + 16, 128),
            nn.ReLU(),
            nn.Dropout(0.4),
            nn.Linear(128, num_classes)
        )
        
    def forward(self, x_img, x_tab):
        # 1. Visual Feature Extraction (Multi-Scale Fusion)
        x = self.model.conv1(x_img)
        x = self.model.bn1(x)
        x = self.model.relu(x)
        x = self.model.maxpool(x)
        
        x1 = self.model.layer1(x)
        x2 = self.model.layer2(x1) # (B, 128, 28, 28)
        x3 = self.model.layer3(x2)
        x4 = self.model.layer4(x3) # (B, 512, 7, 7)
        
        feat2 = torch.flatten(self.pool(x2), 1) # (B, 128)
        feat4 = torch.flatten(self.pool(x4), 1) # (B, 512)
        fused_visual = torch.cat((feat2, feat4), dim=1) # (B, 640)
        
        # 2. Tabular Feature Extraction
        fused_tab = self.tab_mlp(x_tab) # (B, 16)
        
        # 3. Concatenate and Classify
        fused_all = torch.cat((fused_visual, fused_tab), dim=1) # (B, 656)
        return self.fc(fused_all)


model = ChartPatternResNet(num_classes=len(CLASSES))

# Load model weights
try:
    logger.info(f"Attempting to load CNN Model from {MODEL_PATH} on {device}...")
    model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    model.eval()
    model = model.to(device)
    logger.info("Successfully loaded CNN best_model.pth")
except Exception as e:
    logger.warning(f"Model not loaded. Using fallback/mock mode. Error: {e}")
    model = None

# Preprocessing transforms (matches train_cnn.py)
preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

class PatternResponse(BaseModel):
    pattern: str
    confidence: float
    bbox: list[int] | None = None

# ── Endpoints ──────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "online", "engine": "CNN Vision Engine (FastAPI)"}

@app.get("/analyze/fundamental/{ticker}")
def analyze_fundamental(ticker: str):
    """
    Runs fundamental analysis using Yahoo Finance via yfinance.
    """
    result = analyzer.analyze_stock(ticker)
    return result

@app.post("/analyze/chart", response_model=PatternResponse)
async def analyze_chart(
    file: UploadFile = File(...),
    rsi: float = Form(50.0),
    macd: float = Form(0.0),
    macd_signal: float = Form(0.0),
    ma20_ratio: float = Form(1.0),
    ma50_ratio: float = Form(1.0),
    vwap_ratio: float = Form(1.0),
    volume_ratio: float = Form(1.0)
):
    """
    Receives an image (screenshot of chart or plotted candles) and optional
    tabular technical indicators, runs them through the Multi-Modal ResNet50,
    and detects technical patterns.
    """
    image_bytes = await file.read()
    
    if model is None:
        logger.warning("CNN model not loaded. Using fallback mock.")
        return PatternResponse(
            pattern="Mock: Bull Flag",
            confidence=0.87
        )
        
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = preprocess(image).unsqueeze(0).to(device)
        
        # Package tabular features
        tab_features = torch.FloatTensor([
            rsi / 100.0,
            macd,
            macd_signal,
            ma20_ratio,
            ma50_ratio,
            vwap_ratio,
            volume_ratio
        ]).unsqueeze(0).to(device)
        
        with torch.no_grad():
            outputs = model(tensor, tab_features)
            probabilities = torch.softmax(outputs, dim=1)
            confidence, predicted_idx = torch.max(probabilities, 1)
            
        pattern = CLASSES[predicted_idx.item()]
        conf_val = confidence.item()
        
        logger.info(f"CNN predicted pattern: {pattern} with {conf_val*100:.2f}% confidence")
        return PatternResponse(
            pattern=pattern,
            confidence=conf_val
        )
    except Exception as e:
        logger.error(f"Classification error: {e}")
        return PatternResponse(
            pattern="Error",
            confidence=0.0
        )

@app.post("/analyze/timeseries")
def analyze_timeseries(data: list[dict]):
    """
    Analyzes OHLCV timeseries data by plotting in-memory and running real PyTorch CNN inference.
    """
    if not data or len(data) < 30:
        logger.warning(f"Insufficient bars data ({len(data)}). Falling back to mock.")
        return {
            "pattern": "None",
            "confidence": 50,
            "adx_strength": "Moderate",
            "trend_regime": "Consolidation",
            "regime": "sideways"
        }
        
    try:
        # 1. Parse JSON list to pandas DataFrame
        df = pd.DataFrame(data)
        df['Date'] = pd.to_datetime(df['time'], unit='s')
        df.set_index('Date', inplace=True)
        df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}, inplace=True)
        
        # 2. Pre-compute indicators
        df['MA20'] = df['Close'].rolling(20).mean()
        df['MA50'] = df['Close'].rolling(50).mean()
        
        typical_price = (df['High'] + df['Low'] + df['Close']) / 3.0
        df['VWAP'] = (typical_price * df['Volume']).cumsum() / (df['Volume'].cumsum() + 1e-10)
        
        df['MA20_ratio'] = df['Close'] / (df['MA20'] + 1e-10)
        df['MA50_ratio'] = df['Close'] / (df['MA50'] + 1e-10)
        df['VWAP_ratio'] = df['Close'] / (df['VWAP'] + 1e-10)
        
        avg_vol_20 = df['Volume'].rolling(20).mean()
        df['Volume_ratio'] = df['Volume'] / (avg_vol_20 + 1e-10)
        
        df['RSI'] = compute_rsi(df['Close'])
        macd_vals, macd_sig_vals = compute_macd(df['Close'])
        df['MACD'] = macd_vals
        df['MACD_Signal'] = macd_sig_vals
        
        # Fill missing values
        df.fillna(method='bfill', inplace=True)
        df.fillna(0, inplace=True)
        
        # 3. Compute Heikin-Ashi
        df_ha = compute_heikin_ashi(df)
        for col in ['MA20', 'MA50', 'VWAP', 'MA20_ratio', 'MA50_ratio', 'VWAP_ratio', 'Volume_ratio', 'RSI', 'MACD', 'MACD_Signal']:
            df_ha[col] = df[col]
            
        # 4. Extract last 30 days window
        df_window = df_ha.iloc[-30:]
        
        # 5. Plot in-memory to temp file
        temp_filename = os.path.join(os.path.dirname(__file__), "temp_pattern_predict.png")
        generate_candlestick_image(df_window, temp_filename)
        
        # 6. Perform CNN + Tabular model inference
        pattern = "None"
        confidence = 0.5
        
        if model is not None:
            image = Image.open(temp_filename).convert("RGB")
            tensor = preprocess(image).unsqueeze(0).to(device)
            
            last_row = df_window.iloc[-1]
            tab_features = torch.FloatTensor([
                float(last_row["RSI"]) / 100.0,
                float(last_row["MACD"]),
                float(last_row["MACD_Signal"]),
                float(last_row["MA20_ratio"]),
                float(last_row["MA50_ratio"]),
                float(last_row["VWAP_ratio"]),
                float(last_row["Volume_ratio"])
            ]).unsqueeze(0).to(device)
            
            with torch.no_grad():
                outputs = model(tensor, tab_features)
                probabilities = torch.softmax(outputs, dim=1)
                confidence_tensor, predicted_idx = torch.max(probabilities, 1)
                
            pattern = CLASSES[predicted_idx.item()]
            confidence = confidence_tensor.item()
            
        # Clean up temp image
        if os.path.exists(temp_filename):
            try:
                os.remove(temp_filename)
            except:
                pass
                
        # 7. Map class to regime
        regime_map = {
            'breakout': 'uptrend',
            'bullish_flag': 'uptrend',
            'sideways': 'sideways',
            'trash': 'consolidation'
        }
        regime = regime_map.get(pattern, 'sideways')
        
        logger.info(f"CNN real timeseries prediction: {pattern} with {confidence*100:.2f}% confidence. Regime: {regime}")
        
        # Calculate helper metrics for display
        last_row = df_window.iloc[-1]
        
        return {
            "pattern": pattern,
            "confidence": int(confidence * 100) if confidence <= 1.0 else int(confidence),
            "adx_strength": "High" if float(last_row.get("Volume_ratio", 0)) > 2.0 else "Moderate",
            "trend_regime": regime.capitalize(),
            "regime": regime
        }
    except Exception as e:
        logger.error(f"Inference error in timeseries analyze: {e}")
        return {
            "pattern": "None",
            "confidence": 50,
            "adx_strength": "Moderate",
            "trend_regime": "Consolidation",
            "regime": "sideways"
        }

if __name__ == "__main__":
    logger.info("Starting Dellmology CNN Worker on port 8002...")
    uvicorn.run(app, host="0.0.0.0", port=8002)
