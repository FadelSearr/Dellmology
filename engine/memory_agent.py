import os
import json
import logging
from flask import Flask, request, jsonify
import chromadb
from chromadb.utils import embedding_functions

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

app = Flask(__name__)

# Initialize ChromaDB Persistent Client
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'chroma_db')
os.makedirs(DB_PATH, exist_ok=True)

try:
    client = chromadb.PersistentClient(path=DB_PATH)
    # Gunakan default embedding function (all-MiniLM-L6-v2) yang ringan
    emb_fn = embedding_functions.DefaultEmbeddingFunction()
    collection = client.get_or_create_collection(name="market_memory", embedding_function=emb_fn)
    logging.info(f"🧠 Memory Agent connected to ChromaDB at {DB_PATH}")
except Exception as e:
    logging.error(f"Failed to init ChromaDB: {e}")
    collection = None

@app.route('/store', methods=['POST'])
def store_memory():
    if not collection:
        return jsonify({"error": "DB not initialized"}), 500

    data = request.json
    ticker = data.get('ticker')
    text = data.get('text')
    sentiment = data.get('sentiment')
    timestamp = data.get('timestamp')

    if not ticker or not text:
        return jsonify({"error": "Missing ticker or text"}), 400

    doc_id = f"{ticker}_{timestamp}"
    
    try:
        collection.add(
            documents=[text],
            metadatas=[{"ticker": ticker, "sentiment": sentiment, "timestamp": timestamp}],
            ids=[doc_id]
        )
        logging.info(f"💾 Stored memory for {ticker}: {sentiment}")
        return jsonify({"status": "success", "id": doc_id})
    except Exception as e:
        logging.error(f"Store error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/recall', methods=['GET'])
def recall_memory():
    if not collection:
        return jsonify({"error": "DB not initialized"}), 500
        
    ticker = request.args.get('ticker')
    query = request.args.get('q', 'sentiment')
    limit = int(request.args.get('limit', 5))

    try:
        results = collection.query(
            query_texts=[query],
            n_results=limit,
            where={"ticker": ticker} if ticker else None
        )
        return jsonify({"status": "success", "data": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    logging.info("🧠 Memory Agent starting on port 8001...")
    # Matikan werkzeug logs agar terminal rapi
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    app.run(host='127.0.0.1', port=8001)
