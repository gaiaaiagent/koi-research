#!/usr/bin/env python3
"""
Test different prompt strategies for metabolic ontology extraction
"""

import ollama
import json
import re
from pathlib import Path
from typing import Dict, List

def clean_json_response(response: str) -> str:
    """Clean and extract JSON from response"""
    # Remove markdown code blocks if present
    response = re.sub(r'```json\s*', '', response)
    response = re.sub(r'```\s*', '', response)
    
    # Try to find JSON array or object
    json_match = re.search(r'(\[[\s\S]*\]|\{[\s\S]*\})', response)
    if json_match:
        return json_match.group(1)
    return response

def test_prompt_strategy(strategy_name: str, prompt: str, content: str, model: str = "deepseek-coder:6.7b") -> Dict:
    """Test a specific prompt strategy"""
    print(f"\n{'='*60}")
    print(f"🧪 Testing Strategy: {strategy_name}")
    print(f"{'='*60}")
    
    client = ollama.Client()
    
    try:
        # Call model
        response = client.generate(
            model=model,
            prompt=prompt.format(content=content),
            options={
                "temperature": 0.2,  # Lower for consistency
                "num_predict": 2000,
                "top_p": 0.9
            },
            stream=False
        )
        
        raw_response = response['response']
        print(f"📊 Raw response preview:\n{raw_response[:300]}...")
        
        # Clean and parse JSON
        cleaned = clean_json_response(raw_response)
        entities = json.loads(cleaned)
        
        # Validate entities
        if isinstance(entities, list):
            print(f"\n✅ Extracted {len(entities)} entities:")
            for entity in entities[:3]:  # Show first 3
                entity_type = entity.get('@type', 'Unknown')
                entity_name = entity.get('name', 'Unknown')
                aligns = entity.get('alignsWith', [])
                print(f"  - Type: {entity_type}")
                print(f"    Name: {entity_name[:50]}")
                print(f"    Aligns: {aligns}")
                
            # Check if it follows our ontology
            valid_types = ['regen:Agent', 'regen:SemanticAsset', 'regen:EcologicalAsset', 
                          'regen:GovernanceAct', 'regen:MetabolicFlow', 'regen:Transformation']
            follows_ontology = any(e.get('@type', '') in valid_types for e in entities)
            print(f"\n{'✅' if follows_ontology else '❌'} Follows Regen Ontology: {follows_ontology}")
            
            return {"success": True, "entities": entities, "follows_ontology": follows_ontology}
        else:
            print(f"⚠️ Response is not a list: {type(entities)}")
            return {"success": False, "error": "Not a list"}
            
    except json.JSONDecodeError as e:
        print(f"❌ JSON parsing failed: {e}")
        return {"success": False, "error": str(e)}
    except Exception as e:
        print(f"❌ Error: {e}")
        return {"success": False, "error": str(e)}

def main():
    """Test different prompting strategies"""
    
    # Load a test document
    data_dir = Path("/Users/darrenzal/GAIA/data")
    test_file = None
    # First try to find a governance doc, otherwise any non-twitter doc
    for f in data_dir.rglob("*.md"):
        if "twitter" not in str(f).lower():
            test_file = f
            if "govern" in str(f).lower() or "proposal" in str(f).lower():
                break  # Prefer governance docs but take any if not found
    
    if not test_file:
        print("No suitable test file found")
        return
    
    print(f"📄 Using test document: {test_file.name}")
    content = test_file.read_text(encoding='utf-8', errors='ignore')[:1000]
    
    # Strategy 1: Direct example-based
    prompt1 = """You must extract entities using ONLY these exact types from Regen Network ontology:
- regen:Agent (people, organizations)  
- regen:SemanticAsset (documents, proposals)
- regen:EcologicalAsset (carbon credits, ecological resources)
- regen:GovernanceAct (votes, decisions)
- regen:MetabolicFlow (value flows)
- regen:Transformation (state changes)

Document content:
{content}

Return a JSON array with this EXACT structure:
[
  {{
    "@type": "regen:Agent",
    "@id": "orn:regen.agent:unique_id",
    "name": "Entity Name",
    "alignsWith": ["Re-Whole Value"],
    "metabolicProcess": "Anchor"
  }}
]

Use ONLY these essence alignments: "Re-Whole Value", "Nest Caring", "Harmonize Agency"
Use ONLY these processes: "Anchor", "Attest", "Issue", "Circulate", "Govern", "Retire"

Extract entities now. Return ONLY the JSON array:"""

    # Strategy 2: Few-shot examples
    prompt2 = """Extract entities from the document using Regen Network's metabolic ontology.

Examples of correct extraction:

Input: "Regen Network launched carbon credits"
Output: [
  {{"@type": "regen:Agent", "@id": "orn:regen.agent:regen-network", "name": "Regen Network", "alignsWith": ["Re-Whole Value"]}},
  {{"@type": "regen:EcologicalAsset", "@id": "orn:regen.asset:carbon-credits", "name": "carbon credits", "alignsWith": ["Re-Whole Value"]}}
]

Input: "The governance proposal was voted on by the community"
Output: [
  {{"@type": "regen:GovernanceAct", "@id": "orn:regen.gov:proposal", "name": "governance proposal", "alignsWith": ["Harmonize Agency"]}},
  {{"@type": "regen:Agent", "@id": "orn:regen.agent:community", "name": "community", "alignsWith": ["Nest Caring"]}}
]

Now extract from this document:
{content}

Output JSON array:"""

    # Strategy 3: Role-playing with constraints
    prompt3 = """You are a Regen Network ontology expert. Your ONLY job is to identify entities that match these EXACT types:

ALLOWED TYPES (use exactly as shown):
• regen:Agent - Any person, organization, or collective
• regen:SemanticAsset - Documents, articles, proposals, reports  
• regen:EcologicalAsset - Carbon credits, natural resources, ecological data
• regen:GovernanceAct - Votes, decisions, proposals, governance actions
• regen:MetabolicFlow - Value exchanges, token flows
• regen:Transformation - State changes, processes

REQUIRED FIELDS for each entity:
• @type: Must be one of the types above
• @id: Format "orn:regen.category:identifier"  
• name: Short descriptive name
• alignsWith: Array with one or more of ["Re-Whole Value", "Nest Caring", "Harmonize Agency"]
• metabolicProcess: One of ["Anchor", "Attest", "Issue", "Circulate", "Govern", "Retire"]

Document to analyze:
{content}

Output ONLY a JSON array of entities. No explanation. Start with [:"""

    # Strategy 4: Step-by-step instruction
    prompt4 = """Follow these steps EXACTLY:

STEP 1: Read this document excerpt:
{content}

STEP 2: Identify entities that are:
- People or organizations → type: "regen:Agent"
- Documents or proposals → type: "regen:SemanticAsset"  
- Carbon credits or ecological resources → type: "regen:EcologicalAsset"
- Governance actions → type: "regen:GovernanceAct"

STEP 3: For each entity create JSON with:
- @type: (use exact type from step 2)
- @id: "orn:regen.[category]:[unique-name]"
- name: (entity name from text)
- alignsWith: Choose from ["Re-Whole Value", "Nest Caring", "Harmonize Agency"]
- metabolicProcess: Choose from ["Anchor", "Attest", "Issue", "Circulate", "Govern", "Retire"]

STEP 4: Return ONLY the JSON array, like:
[{{"@type":"regen:Agent","@id":"orn:regen.agent:name","name":"Name","alignsWith":["Re-Whole Value"],"metabolicProcess":"Anchor"}}]

Begin extraction:"""

    # Strategy 5: Simplified with post-processing hint
    prompt5 = """Extract entities as JSON. Use these exact @type values:
regen:Agent
regen:SemanticAsset
regen:EcologicalAsset
regen:GovernanceAct

Text: {content}

JSON array with @type, @id, name, alignsWith fields:"""

    # Test all strategies
    strategies = [
        ("Direct Example-Based", prompt1),
        ("Few-Shot Examples", prompt2),
        ("Role-Playing Expert", prompt3),
        ("Step-by-Step Instructions", prompt4),
        ("Simplified Format", prompt5)
    ]
    
    results = []
    for name, prompt in strategies:
        result = test_prompt_strategy(name, prompt, content)
        results.append((name, result))
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 SUMMARY OF RESULTS")
    print(f"{'='*60}")
    
    for name, result in results:
        success = "✅" if result.get("success") else "❌"
        ontology = "✅" if result.get("follows_ontology") else "❌"
        entities = len(result.get("entities", [])) if result.get("success") else 0
        print(f"{success} {name}: {entities} entities, Follows ontology: {ontology}")
    
    # Find best strategy
    best = max(results, key=lambda x: (x[1].get("follows_ontology", False), x[1].get("success", False)))
    print(f"\n🏆 Best Strategy: {best[0]}")
    
    # Save best result
    if best[1].get("success"):
        with open("/Users/darrenzal/koi-research/best-extraction-test.json", "w") as f:
            json.dump({
                "strategy": best[0],
                "test_file": str(test_file),
                "entities": best[1].get("entities", [])
            }, f, indent=2)
        print(f"💾 Best result saved to best-extraction-test.json")

if __name__ == "__main__":
    main()