import os
import joblib
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

class NLPEngine:
    def __init__(self):
        self.is_ready = True
        self.custom_model = None
        self.vader = SentimentIntensityAnalyzer()
        
        # Load trained weights if available
        weight_path = os.path.join(os.path.dirname(__file__), 'nlp_weights.pkl')
        if os.path.exists(weight_path):
            try:
                self.custom_model = joblib.load(weight_path)
                print(f"NLP custom weights loaded successfully from {weight_path}")
            except Exception as e:
                print(f"Failed to load NLP weights: {e}")
        else:
            print("No nlp_weights.pkl found. Falling back to VaderSentiment.")

    def analyze_sentiment(self, text: str):
        if not text:
            return {"sentiment": "NEUTRAL", "confidence": 50.0}
            
        if self.custom_model:
            # Use custom trained model
            pred = self.custom_model.predict([text])[0]
            probs = self.custom_model.predict_proba([text])[0]
            
            confidence = max(probs) * 100
            if pred == 1:
                sentiment = "BULLISH"
            elif pred == -1:
                sentiment = "BEARISH"
            else:
                sentiment = "NEUTRAL"
        else:
            # Fallback to Vader
            scores = self.vader.polarity_scores(text)
            compound = scores['compound']
            
            confidence = abs(compound) * 100
            
            if compound >= 0.05:
                sentiment = "BULLISH"
            elif compound <= -0.05:
                sentiment = "BEARISH"
            else:
                sentiment = "NEUTRAL"
                confidence = 50.0 
                
            if sentiment != "NEUTRAL":
                confidence = min(100.0, 50.0 + (confidence * 0.5))
                
        return {
            "sentiment": sentiment,
            "confidence": round(confidence, 1)
        }

# Singleton instance
nlp_engine = NLPEngine()

if __name__ == "__main__":
    print(nlp_engine.analyze_sentiment("I love this stock! It is going to the moon."))
    print(nlp_engine.analyze_sentiment("Terrible earnings report, very bad."))
