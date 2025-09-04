#!/usr/bin/env python3
"""
Simple single document extraction test
"""

import ollama
import json
from pathlib import Path

def test_single_extraction():
    """Test extraction on a single document snippet"""
    
    # Find one non-Twitter markdown file
    data_dir = Path("/Users/darrenzal/GAIA/data")
    test_file = None
    for f in data_dir.rglob("*.md"):
        if "twitter" not in str(f).lower():
            test_file = f
            break
    
    if not test_file:
        print("No test file found")
        return
    
    print(f"📄 Testing with: {test_file.name}")
    
    # Read first 500 characters
    content = test_file.read_text(encoding='utf-8', errors='ignore')[:500]
    print(f"\n📝 Content preview:\n{content}\n")
    
    # Prepare extraction prompt
    prompt = f"""Extract JSON-LD entities from this document. Return ONLY a JSON array.

Document: {test_file.name}
Content: {content}

Focus on:
1. Identify entity type (Agent, SemanticAsset, EcologicalAsset, GovernanceAct)
2. Detect essence alignments (Re-Whole Value, Nest Caring, Harmonize Agency)
3. Generate unique @id

Return JSON array like:
[{{"@type": "regen:TYPE", "@id": "unique_id", "name": "entity name", "alignsWith": ["essence"]}}]"""

    print("🤖 Calling DeepSeek Coder for extraction...")
    
    # Call Ollama
    client = ollama.Client()
    response = client.generate(
        model="deepseek-coder:6.7b",
        prompt=prompt,
        format="json",
        options={
            "temperature": 0.3,
            "num_predict": 1000  # Increased for complete JSON
        },
        stream=False
    )
    
    print("\n📊 Raw response:")
    print(response['response'][:500])
    
    # Try to parse JSON
    try:
        entities = json.loads(response['response'])
        print(f"\n✅ Successfully extracted {len(entities) if isinstance(entities, list) else 1} entities:")
        if isinstance(entities, list):
            for entity in entities:
                print(f"  - {entity.get('@type', 'Unknown')}: {entity.get('name', 'Unknown')}")
        else:
            print(f"  - {entities.get('@type', 'Unknown')}: {entities.get('name', 'Unknown')}")
    except json.JSONDecodeError as e:
        print(f"\n❌ Failed to parse JSON: {e}")
        print("Response was not valid JSON")

if __name__ == "__main__":
    test_single_extraction()