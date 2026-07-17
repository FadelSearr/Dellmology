import torch
import torch.nn as nn
import numpy as np

class StockLSTM(nn.Module):
    def __init__(self, input_size=5, hidden_size=64, num_layers=2, output_size=1):
        super(StockLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)
        self.sigmoid = nn.Sigmoid()
        
    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        
        out, _ = self.lstm(x, (h0, c0))
        out = self.fc(out[:, -1, :])
        out = self.sigmoid(out)
        return out

class LSTMForecaster:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = StockLSTM(input_size=5).to(self.device)
        self.is_ready = True
        
        # Load trained weights if available
        import os
        weight_path = os.path.join(os.path.dirname(__file__), 'lstm_weights.pth')
        if os.path.exists(weight_path):
            try:
                self.model.load_state_dict(torch.load(weight_path, map_location=self.device))
                print(f"LSTM weights loaded successfully from {weight_path}")
            except Exception as e:
                print(f"Failed to load LSTM weights: {e}")
        else:
            print("No lstm_weights.pth found. Using untrained LSTM.")
            
        self.model.eval()

    def forecast(self, timeseries_data):
        """
        timeseries_data: List of dicts with open, high, low, close, volume
        Returns direction (UP/DOWN/SIDEWAYS) and confidence
        """
        if not timeseries_data or len(timeseries_data) < 10:
            return {"direction": "SIDEWAYS", "confidence": 50.0}
            
        # Extract features
        features = []
        for row in timeseries_data:
            o = float(row.get('open', 0))
            h = float(row.get('high', 0))
            l = float(row.get('low', 0))
            c = float(row.get('close', 0))
            v = float(row.get('volume', 0))
            features.append([o, h, l, c, v])
            
        # Normalize (Dummy normalization for now)
        arr = np.array(features)
        mean = np.mean(arr, axis=0)
        std = np.std(arr, axis=0)
        std[std == 0] = 1 # prevent div zero
        arr_norm = (arr - mean) / std
        
        # Convert to tensor shape (1, seq_len, features)
        tensor_x = torch.FloatTensor(arr_norm).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            output = self.model(tensor_x)
            prob = output.item()
            
        # Interpret probability (0.0 to 1.0)
        confidence = prob * 100
        
        if prob > 0.6:
            direction = "UP"
        elif prob < 0.4:
            direction = "DOWN"
            confidence = (1 - prob) * 100
        else:
            direction = "SIDEWAYS"
            confidence = 50.0 + (abs(prob - 0.5) * 100)
            
        return {
            "direction": direction,
            "confidence": round(confidence, 1)
        }

# Singleton instance
lstm_engine = LSTMForecaster()
