import os
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

def train_nlp():
    print("Training custom NLP Sentiment Model for Indonesian/Global Stocks...")
    
    # Dummy Dataset for training
    # 1 = Bullish, -1 = Bearish, 0 = Neutral
    dataset = [
        ("Harga BBCA diproyeksi naik tahun depan karena laporan keuangan memuaskan", 1),
        ("Asing terus borong saham bank besar, IHSG menghijau", 1),
        ("Dividen besar akan dibagikan bulan depan, prospek sangat cerah", 1),
        ("Banyak sentimen positif yang mengangkat harga saham gorengan ini", 1),
        ("Target price dinaikkan oleh analis karena performa ekspor membaik", 1),
        
        ("Perusahaan gagal bayar utang, saham anjlok parah", -1),
        ("IHSG merah karena sentimen negatif dari bank sentral Amerika", -1),
        ("Laporan kuartal 3 sangat mengecewakan, net income turun 50%", -1),
        ("Bandar distribusi besar-besaran, ritel nyangkut di pucuk", -1),
        ("Terkena suspend oleh BEI karena pergerakan harga tidak wajar", -1),
        
        ("IHSG ditutup datar di akhir pekan", 0),
        ("Rapat umum pemegang saham berjalan lancar tanpa ada kejutan", 0),
        ("Harga emas dunia stabil menjelang penutupan", 0),
        ("Tidak ada berita signifikan dari bursa efek hari ini", 0),
        ("Volume perdagangan masih sepi", 0)
    ]
    
    # Split text and labels
    texts = [item[0] for item in dataset]
    labels = [item[1] for item in dataset]
    
    print(f"Dataset size: {len(texts)} samples")
    print("Building TF-IDF Pipeline...")
    
    # Create Pipeline
    model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2)), LogisticRegression())
    
    print("Training model...")
    model.fit(texts, labels)
    
    # Save the model
    save_path = os.path.join(os.path.dirname(__file__), 'nlp_weights.pkl')
    joblib.dump(model, save_path)
    print(f"NLP Training Complete! Model saved to {save_path}")
    
    # Test
    test_text = "Asing memborong saham ini gila-gilaan"
    pred = model.predict([test_text])[0]
    probs = model.predict_proba([test_text])[0]
    
    print(f"Test prediction for '{test_text}': Label {pred}, Probs: {probs}")

if __name__ == "__main__":
    train_nlp()
