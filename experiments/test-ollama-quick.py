#!/usr/bin/env python3
"""
Quick test of Ollama/DeepSeek Coder extraction
"""

import asyncio
import json
from pathlib import Path
import sys
sys.path.append('/Users/darrenzal/koi-research')
from process_documents_ollama import OllamaMetabolicProcessor

async def quick_test():
    """Test with just 5 documents"""
    print("🧪 Quick test with 5 documents")
    print("=" * 60)
    
    # Initialize processor
    processor = OllamaMetabolicProcessor(
        model="deepseek-coder:6.7b",
        use_llm=True
    )
    
    # Find 5 non-Twitter markdown files
    data_dir = Path("/Users/darrenzal/GAIA/data")
    files = []
    for f in data_dir.rglob("*.md"):
        if "twitter" not in str(f).lower():
            files.append(f)
            if len(files) >= 5:
                break
    
    print(f"📂 Testing with {len(files)} documents:")
    for f in files:
        print(f"  - {f.name}")
    
    print("\n🤖 Processing with DeepSeek Coder...")
    
    # Process each file
    for i, file_path in enumerate(files, 1):
        print(f"\n[{i}/5] Processing: {file_path.name}")
        result = await processor.process_document(file_path)
        
        if result and 'entities' in result:
            print(f"  ✅ Extracted {len(result['entities'])} entities")
            for entity in result['entities'][:2]:  # Show first 2
                print(f"    - {entity.get('@type', 'Unknown')}: {entity.get('name', 'Unknown')[:50]}")
        else:
            print("  ❌ Failed to extract entities")
    
    # Print summary
    processor.print_summary()
    
    # Save test results
    output_path = Path("/Users/darrenzal/koi-research/quick-test-results.json")
    processor.save_results(output_path)
    
    print(f"\n✅ Quick test complete! Results saved to {output_path}")

if __name__ == "__main__":
    asyncio.run(quick_test())