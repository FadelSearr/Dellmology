import requests
import os
import json

url = 'http://localhost:8002/analyze/chart'
image_path = os.path.join(os.path.dirname(__file__), 'dataset_split', 'val', 'breakout', 'AAPL_20211210.png')
json_path = image_path.replace('.png', '.json')

payload = {}
if os.path.exists(json_path):
    print(f"Loading companion JSON features: {json_path}")
    with open(json_path, 'r') as f:
        payload = json.load(f)

print(f"Sending image to FastAPI worker: {image_path}")
with open(image_path, 'rb') as f:
    files = {'file': f}
    response = requests.post(url, files=files, data=payload)
    
print("\nResponse Status Code:", response.status_code)
print("Response JSON:")
print(response.json())
