import requests, json

def safe_get(url, method='get'):
    try:
        if method=='get':
            r = requests.get(url, timeout=30)
        else:
            r = requests.post(url, timeout=60)
        try:
            print(json.dumps(r.json(), indent=2))
        except Exception:
            print(r.text)
    except Exception as e:
        print('ERROR:', e)

if __name__ == '__main__':
    print('--- RLS smoke ---')
    safe_get('http://localhost:8000/api/maintenance/rls-smoke')
    print('\n--- Refresh aggregates ---')
    safe_get('http://localhost:8000/api/maintenance/refresh-aggregates', method='post')
    print('\n--- Model status ---')
    safe_get('http://localhost:8000/models/status')
