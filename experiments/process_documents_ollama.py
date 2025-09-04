#!/usr/bin/env python3
"""
KOI Document Processor with Ollama/DeepSeek Coder for Metabolic Ontology Extraction
Processes documents locally using Ollama with DeepSeek Coder 6.7B model
"""

import asyncio
import json
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import ollama
from dotenv import load_dotenv

# Load environment
load_dotenv('/Users/darrenzal/koi-research/.env')

@dataclass
class ProcessingStats:
    """Track processing statistics"""
    total_documents: int = 0
    processed_documents: int = 0
    failed_documents: int = 0
    entities_extracted: int = 0
    processing_time: float = 0.0
    

class OllamaMetabolicProcessor:
    """Process documents with metabolic ontology extraction using Ollama"""
    
    def __init__(self, model: str = "deepseek-coder:6.7b", use_llm: bool = True):
        self.model = model
        self.use_llm = use_llm
        self.stats = ProcessingStats()
        self.processed_entities = []
        self.client = ollama.Client()
        
        # Metabolic ontology context
        self.ontology_context = {
            "@context": {
                "regen": "https://regen.network/ontology#",
                "schema": "http://schema.org/",
                "prov": "http://www.w3.org/ns/prov#",
                "koi": "https://regen.network/koi#"
            }
        }
        
        # DeepSeek-optimized prompt using the winning strategy
        self.system_prompt = ""
    
    def generate_rid(self, source: str, identifier: str) -> str:
        """Generate Resource Identifier"""
        return f"orn:regen.{source}:{identifier}"
    
    def generate_cid(self, content: str) -> str:
        """Generate Content Identifier"""
        hash_obj = hashlib.sha256(content.encode())
        return f"cid:sha256:{hash_obj.hexdigest()[:16]}"
    
    async def extract_entities_llm(self, content: str, metadata: Dict) -> List[Dict]:
        """Extract entities using Ollama with DeepSeek Coder"""
        try:
            # Use the winning "Direct Example-Based" strategy
            prompt = f"""You must extract entities using ONLY these exact types from Regen Network ontology:
- regen:Agent (people, organizations)  
- regen:SemanticAsset (documents, proposals)
- regen:EcologicalAsset (carbon credits, ecological resources)
- regen:GovernanceAct (votes, decisions)
- regen:MetabolicFlow (value flows)
- regen:Transformation (state changes)

Document: {metadata.get('filename', 'Unknown')}
Content: {content[:2000]}

Return a JSON array with this EXACT structure:
[
  {{
    "@type": "regen:Agent",
    "@id": "orn:regen.agent:{metadata.get('id', 'unknown')}_1",
    "name": "Entity Name",
    "alignsWith": ["Re-Whole Value"],
    "metabolicProcess": "Anchor"
  }}
]

Use ONLY these essence alignments: "Re-Whole Value", "Nest Caring", "Harmonize Agency"
Use ONLY these processes: "Anchor", "Attest", "Issue", "Circulate", "Govern", "Retire"

Extract entities now. Return ONLY the JSON array:"""
            
            # Call Ollama
            response = self.client.generate(
                model=self.model,
                prompt=prompt,
                format="json",  # Request JSON output
                options={
                    "temperature": 0.2,  # Lower for more consistent output
                    "top_p": 0.9,
                    "num_predict": 2000,  # Enough for multiple entities
                    "seed": 42  # For reproducibility
                }
            )
            
            # Parse the response
            try:
                result_text = response['response']
                # Clean up the response if needed
                result_text = result_text.strip()
                if not result_text.startswith('['):
                    # Try to extract JSON array from the response
                    import re
                    json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
                    if json_match:
                        result_text = json_match.group()
                    else:
                        # Wrap single entity in array
                        result_text = f"[{result_text}]"
                
                entities = json.loads(result_text)
                
                # Ensure entities is a list
                if isinstance(entities, dict):
                    entities = [entities]
                
                # Add document metadata to each entity
                for i, entity in enumerate(entities):
                    if isinstance(entity, dict):  # Ensure it's a dict
                        if '@id' not in entity:
                            entity['@id'] = self.generate_rid(
                                metadata.get('source', 'document'),
                                f"{metadata.get('id', 'unknown')}_{i}"
                            )
                        entity['foundIn'] = metadata.get('path', '')
                        entity['extractedAt'] = datetime.now(tz=timezone.utc).isoformat()
                
                return entities
                
            except json.JSONDecodeError as e:
                print(f"Failed to parse JSON from LLM response: {e}")
                # Fall back to basic extraction
                return self.extract_entities_basic(content, metadata)
                
        except Exception as e:
            print(f"LLM extraction failed: {e}")
            # Fall back to basic extraction
            return self.extract_entities_basic(content, metadata)
    
    def extract_entities_basic(self, content: str, metadata: Dict) -> List[Dict]:
        """Basic entity extraction without LLM (fallback)"""
        entities = []
        
        # Document as Semantic Asset
        doc_entity = {
            **self.ontology_context,
            "@type": "regen:SemanticAsset",
            "@id": self.generate_rid(metadata.get("source", "document"), metadata.get("id", "unknown")),
            "name": metadata.get("filename", "Unknown Document"),
            "content_preview": content[:500],
            "cid": self.generate_cid(content),
            "alignsWith": [],
            "metabolicProcess": "Anchor",
            "timestamp": datetime.now(tz=timezone.utc).isoformat()
        }
        
        # Detect essence alignments
        content_lower = content.lower()
        
        if any(word in content_lower for word in ["regenerat", "restore", "heal", "ecosystem"]):
            doc_entity["alignsWith"].append("Re-Whole Value")
        
        if any(word in content_lower for word in ["community", "collaborat", "caring", "together"]):
            doc_entity["alignsWith"].append("Nest Caring")
        
        if any(word in content_lower for word in ["govern", "coordinat", "decision", "autonomy"]):
            doc_entity["alignsWith"].append("Harmonize Agency")
        
        entities.append(doc_entity)
        
        # Extract specific entity types
        if "carbon" in content_lower or "credit" in content_lower:
            entities.append({
                **self.ontology_context,
                "@type": "regen:EcologicalAsset",
                "@id": self.generate_rid("asset", f"carbon_{metadata.get('id', 'unknown')}"),
                "name": "Carbon Credit Reference",
                "foundIn": doc_entity["@id"],
                "alignsWith": ["Re-Whole Value"]
            })
        
        return entities
    
    async def process_document(self, file_path: Path) -> Dict:
        """Process a single document"""
        import time
        start_time = time.time()
        
        try:
            # Read document
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Create metadata
            metadata = {
                "filename": file_path.name,
                "path": str(file_path),
                "id": file_path.stem,
                "source": self._identify_source(file_path),
                "size": len(content)
            }
            
            # Extract entities
            if self.use_llm:
                entities = await self.extract_entities_llm(content, metadata)
            else:
                entities = self.extract_entities_basic(content, metadata)
            
            self.stats.entities_extracted += len(entities)
            self.stats.processed_documents += 1
            
            # Track metabolic transformation
            transformation = {
                "@type": "regen:Transformation",
                "@id": self.generate_rid("transform", f"{metadata['id']}_extraction"),
                "fromState": metadata["path"],
                "toState": [e["@id"] for e in entities],
                "process": "Extract",
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                "processingTime": time.time() - start_time
            }
            
            return {
                "metadata": metadata,
                "entities": entities,
                "transformation": transformation
            }
            
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
            self.stats.failed_documents += 1
            return None
    
    def _identify_source(self, file_path: Path) -> str:
        """Identify source from file path"""
        path_str = str(file_path).lower()
        if "notion" in path_str:
            return "notion"
        elif "discourse" in path_str:
            return "discourse"
        elif "medium" in path_str:
            return "medium"
        elif "podcast" in path_str:
            return "podcast"
        elif "twitter" in path_str:
            return "twitter"
        elif "github" in path_str:
            return "github"
        else:
            return "document"
    
    async def process_directory(self, directory: Path, limit: Optional[int] = None, exclude_twitter: bool = True) -> None:
        """Process documents in a directory"""
        import time
        overall_start = time.time()
        
        # Find all documents
        patterns = ["*.md", "*.json", "*.txt"]
        files = []
        
        for pattern in patterns:
            found_files = list(directory.rglob(pattern))
            if exclude_twitter:
                found_files = [f for f in found_files if "twitter" not in str(f).lower()]
            files.extend(found_files)
        
        # Apply limit if specified
        if limit:
            files = files[:limit]
        
        self.stats.total_documents = len(files)
        
        print(f"📊 Processing {len(files)} documents with {self.model}")
        print(f"📐 Exclude Twitter: {exclude_twitter}")
        print(f"🤖 Using LLM: {self.use_llm}")
        
        # Process in batches for progress tracking
        batch_size = 5
        for i in range(0, len(files), batch_size):
            batch = files[i:i+batch_size]
            tasks = [self.process_document(f) for f in batch]
            results = await asyncio.gather(*tasks)
            
            # Store results
            for result in results:
                if result:
                    self.processed_entities.append(result)
            
            # Progress update
            print(f"Progress: {self.stats.processed_documents}/{self.stats.total_documents} "
                  f"(Failed: {self.stats.failed_documents})")
        
        self.stats.processing_time = time.time() - overall_start
    
    def save_results(self, output_path: Path) -> None:
        """Save processing results"""
        output = {
            "metadata": {
                "processing_date": datetime.now(tz=timezone.utc).isoformat(),
                "model": self.model,
                "total_documents": self.stats.total_documents,
                "processed_documents": self.stats.processed_documents,
                "failed_documents": self.stats.failed_documents,
                "entities_extracted": self.stats.entities_extracted,
                "processing_time": self.stats.processing_time,
                "avg_time_per_doc": self.stats.processing_time / max(self.stats.processed_documents, 1)
            },
            "entities": self.processed_entities
        }
        
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"✅ Results saved to {output_path}")
    
    def print_summary(self):
        """Print processing summary"""
        print("\n" + "=" * 60)
        print("📊 PROCESSING SUMMARY")
        print("=" * 60)
        print(f"Model: {self.model}")
        print(f"Documents processed: {self.stats.processed_documents}/{self.stats.total_documents}")
        print(f"Documents failed: {self.stats.failed_documents}")
        print(f"Entities extracted: {self.stats.entities_extracted}")
        print(f"Total time: {self.stats.processing_time:.2f} seconds")
        print(f"Avg time per doc: {self.stats.processing_time / max(self.stats.processed_documents, 1):.2f} seconds")
        
        if self.stats.entities_extracted > 0:
            print(f"Avg entities per doc: {self.stats.entities_extracted / max(self.stats.processed_documents, 1):.1f}")


async def main():
    """Main processing function"""
    print("🌿 KOI Document Processor with Ollama/DeepSeek Coder")
    print("=" * 60)
    
    # Initialize processor with DeepSeek Coder
    processor = OllamaMetabolicProcessor(
        model="deepseek-coder:6.7b",
        use_llm=True  # Set to False to use basic extraction only
    )
    
    # Process test batch first (100 documents)
    data_dir = Path("/Users/darrenzal/GAIA/data")
    
    print("\n📂 Processing test batch (100 non-Twitter documents)...")
    await processor.process_directory(
        data_dir, 
        limit=100,  # Process only 100 documents for testing
        exclude_twitter=True
    )
    
    # Print summary
    processor.print_summary()
    
    # Save results
    output_path = Path("/Users/darrenzal/koi-research/test-extraction-results.json")
    processor.save_results(output_path)
    
    # Show sample of extracted entities
    if processor.processed_entities:
        print("\n📝 Sample extracted entities:")
        sample = processor.processed_entities[0] if processor.processed_entities else None
        if sample and 'entities' in sample:
            for entity in sample['entities'][:2]:  # Show first 2 entities
                print(f"\nEntity Type: {entity.get('@type', 'Unknown')}")
                print(f"ID: {entity.get('@id', 'Unknown')}")
                print(f"Name: {entity.get('name', 'Unknown')}")
                print(f"Aligns With: {entity.get('alignsWith', [])}")
    
    print("\n" + "=" * 60)
    print("✅ Test batch complete!")
    print("\nNext steps:")
    print("1. Review extracted entities in test-extraction-results.json")
    print("2. Adjust prompts if needed for better extraction")
    print("3. Run full processing by removing the limit parameter")
    print("4. Load results into Neo4j knowledge graph")


if __name__ == "__main__":
    asyncio.run(main())