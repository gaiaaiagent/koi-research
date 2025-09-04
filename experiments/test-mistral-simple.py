#!/usr/bin/env python3
"""
Simple test of Mistral for discourse extraction
"""

import ollama
import json
from pathlib import Path

def test_mistral_on_scientific_paper():
    """Test Mistral on the scientific paper"""
    
    # Read the scientific paper
    doc_path = Path("/Users/darrenzal/koi-research/test-documents/scientific-paper.md")
    content = doc_path.read_text()[:1500]  # First 1500 chars
    
    print("📄 Testing Mistral on scientific paper")
    print("=" * 60)
    
    # Create prompt for Mistral
    prompt = f"""Extract discourse elements from this scientific paper and return as JSON.

Types to identify:
- Hypothesis: testable predictions or proposed explanations
- Evidence: data, observations, results that support/oppose claims  
- Claim/Conclusion: assertions or judgments from reasoning
- Experiment: tests or investigations
- Question: inquiries or unknowns

Document excerpt:
{content}

Return JSON array with extracted entities. Each should have:
- "type": one of [Hypothesis, Evidence, Claim, Experiment, Question, Result, Conclusion]
- "text": the actual text or summary
- "relationship": how it relates to other elements (if applicable)

JSON output:"""

    print("🤖 Calling Mistral 7B...")
    
    # Call Mistral
    client = ollama.Client()
    response = client.generate(
        model="mistral:7b",
        prompt=prompt,
        format="json",
        options={
            "temperature": 0.3,
            "num_predict": 2000
        },
        stream=False
    )
    
    print("\n📊 Mistral's Response:")
    print("-" * 60)
    print(response['response'][:1000])
    
    # Try to parse JSON
    try:
        import re
        json_text = response['response']
        # Extract JSON array if wrapped in markdown
        json_match = re.search(r'\[[\s\S]*\]', json_text)
        if json_match:
            json_text = json_match.group()
        
        entities = json.loads(json_text)
        
        print("\n✅ Successfully parsed JSON!")
        print(f"Extracted {len(entities) if isinstance(entities, list) else 1} discourse elements:")
        
        if isinstance(entities, list):
            for entity in entities:
                print(f"\n  Type: {entity.get('type', 'Unknown')}")
                print(f"  Text: {entity.get('text', '')[:100]}")
                if entity.get('relationship'):
                    print(f"  Relationship: {entity.get('relationship')}")
        
        # Count types
        type_counts = {}
        for e in (entities if isinstance(entities, list) else [entities]):
            etype = e.get('type', 'Unknown')
            type_counts[etype] = type_counts.get(etype, 0) + 1
        
        print("\n📈 Summary:")
        for dtype, count in type_counts.items():
            print(f"  - {dtype}: {count}")
            
        print("\n🎯 Mistral successfully identifies discourse elements!")
        
    except json.JSONDecodeError as e:
        print(f"\n❌ JSON parsing failed: {e}")
        print("Raw response was not valid JSON")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    test_mistral_on_scientific_paper()