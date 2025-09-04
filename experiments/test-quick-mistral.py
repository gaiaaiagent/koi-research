#!/usr/bin/env python3
import asyncio
from pathlib import Path
import sys
sys.path.append('/Users/darrenzal/koi-research')
from process_all_documents_mistral import ProductionMetabolicProcessor

async def quick_test():
    processor = ProductionMetabolicProcessor(model="mistral:7b")
    
    # Test on one file
    test_file = Path("/Users/darrenzal/koi-research/test-documents/scientific-paper.md")
    result = await processor.process_document(test_file)
    
    if result:
        print(f"✅ Extracted {len(result['entities'])} entities")
        for entity in result['entities'][:3]:
            print(f"  - {entity.get('@type', 'Unknown')}: {entity.get('name', 'Unnamed')[:50]}")
    else:
        print("❌ Extraction failed")

if __name__ == "__main__":
    asyncio.run(quick_test())
