from fastapi import FastAPI, Request
from pydantic import BaseModel
from typing import List, Optional
import random

# Import our engines
from nlp_engine import nlp_engine
from lstm_engine import lstm_engine

app = FastAPI(title="Dellmology ML Engines", version="1.0.0")

class OHLCV(BaseModel):
    timestamp: Optional[str] = None
    open: float
    high: float
    low: float
    close: float
    volume: float

class SentimentRequest(BaseModel):
    text: str

@app.get("/health")
def health_check():
    return {
        "nlp": nlp_engine.is_ready,
        "lstm": lstm_engine.is_ready
    }


@app.post("/analyze/sentiment")
async def analyze_sentiment(req: SentimentRequest):
    """
    NLP Sentiment Analysis using VADER
    """
    res = nlp_engine.analyze_sentiment(req.text)
    return res

@app.post("/analyze/forecast")
async def analyze_forecast(data: List[OHLCV]):
    """
    LSTM Time-Series Forecasting
    """
    # Convert Pydantic models to dicts
    dict_data = [item.dict() for item in data]
    res = lstm_engine.forecast(dict_data)
    return res

if __name__ == "__main__":
    import uvicorn
    # Run the server on port 8000 (Expected by Next.js app)
    uvicorn.run(app, host="127.0.0.1", port=8000)
