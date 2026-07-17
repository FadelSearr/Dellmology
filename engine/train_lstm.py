import yfinance as yf
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import os
from lstm_engine import StockLSTM

def create_sequences(data, seq_length=50):
    xs, ys = [], []
    for i in range(len(data) - seq_length - 1):
        x = data[i:(i + seq_length)]
        # Target: Is tomorrow's close higher than today's close?
        today_close = data[i + seq_length - 1, 3] # Index 3 is Close
        tomorrow_close = data[i + seq_length, 3]
        y = 1.0 if tomorrow_close > today_close else 0.0
        
        xs.append(x)
        ys.append([y])
    return np.array(xs), np.array(ys)

def train_lstm():
    print("Downloading historical data for BBCA.JK (BCA)...")
    ticker = "BBCA.JK"
    df = yf.download(ticker, period="5y")
    
    if df.empty:
        print("Error downloading data!")
        return
        
    print(f"Data downloaded: {len(df)} days.")
    
    # Use Open, High, Low, Close, Volume
    data = df[['Open', 'High', 'Low', 'Close', 'Volume']].values
    
    # Simple Normalization
    mean = np.mean(data, axis=0)
    std = np.std(data, axis=0)
    std[std == 0] = 1
    data_norm = (data - mean) / std
    
    print("Creating sequences...")
    X, y = create_sequences(data_norm, seq_length=10) # Using 10 days sequence to match engine dummy for fast training
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Training on {device}...")
    
    X_tensor = torch.FloatTensor(X).to(device)
    y_tensor = torch.FloatTensor(y).to(device)
    
    model = StockLSTM(input_size=5).to(device)
    
    criterion = nn.BCELoss() # Binary Cross Entropy for Up/Down
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    epochs = 100
    print(f"Starting training for {epochs} epochs...")
    
    for epoch in range(epochs):
        model.train()
        optimizer.zero_grad()
        
        outputs = model(X_tensor)
        loss = criterion(outputs, y_tensor)
        
        loss.backward()
        optimizer.step()
        
        if (epoch+1) % 10 == 0:
            print(f'Epoch [{epoch+1}/{epochs}], Loss: {loss.item():.4f}')
            
    # Save model
    save_path = os.path.join(os.path.dirname(__file__), 'lstm_weights.pth')
    torch.save(model.state_dict(), save_path)
    print(f"Training Complete! Model saved to {save_path}")

if __name__ == "__main__":
    train_lstm()
