#!/usr/bin/env python
import requests
import json

# Test the prescription API to see what data structure we're getting
url = "http://localhost:8001/api/v1/pharmacy/prescriptions/7/"
headers = {
    "Authorization": "Bearer your-token-here",  # You'll need to add a valid token
    "Content-Type": "application/json"
}

try:
    response = requests.get(url, headers=headers)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Prescription Data:")
        print(json.dumps(data, indent=2))
        
        print("\nMedications:")
        for i, med in enumerate(data.get('medications', [])):
            print(f"\nMedication {i+1}:")
            print(f"  ID: {med.get('id')}")
            print(f"  Generic: {med.get('generic')}")
            print(f"  Medication: {med.get('medication')}")
            print(f"  Medication Name: {med.get('medication_name')}")
            print(f"  Medication Details: {med.get('medication_details')}")
    else:
        print(f"Error: {response.text}")
except Exception as e:
    print(f"Exception: {e}")