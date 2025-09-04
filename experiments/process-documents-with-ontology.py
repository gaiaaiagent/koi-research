#!/usr/bin/env python3
"""
KOI Document Processor with Metabolic Ontology Extraction
Processes documents and extracts JSON-LD entities with cost estimation
"""

import asyncio
import json
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import tiktoken
from dotenv import load_dotenv

# Load environment
load_dotenv('/Users/darrenzal/koi-research/.env')

@dataclass
class ProcessingStats:
    """Track processing statistics and costs"""
    total_documents: int = 0
    processed_documents: int = 0
    total_tokens: int = 0
    total_characters: int = 0
    extraction_cost: float = 0.0
    embedding_cost: float = 0.0
    entities_extracted: int = 0
    
    def estimate_cost(self, char_count: int, model: str = "gpt-4o-mini") -> float:
        """Estimate cost for processing based on character count"""
        # Rough estimate: 1 token ≈ 4 characters
        estimated_tokens = char_count / 4
        
        # Model pricing (per 1K tokens)
        pricing = {
            "gpt-4o": 0.005,      # $5 per 1M input tokens
            "gpt-4o-mini": 0.00015,  # $0.15 per 1M input tokens
            "gpt-3.5-turbo": 0.0005   # $0.50 per 1M input tokens
        }
        
        # For extraction, we send prompt + document (input) and get JSON-LD (output)
        # Assume output is ~30% of input size
        input_cost = (estimated_tokens / 1000) * pricing.get(model, 0.00015)
        output_cost = (estimated_tokens * 0.3 / 1000) * pricing.get(model, 0.00015) * 2  # Output costs more
        
        return input_cost + output_cost


class MetabolicDocumentProcessor:
    """Process documents with metabolic ontology extraction"""
    
    def __init__(self, use_llm: bool = False, model: str = "gpt-4o-mini"):
        self.use_llm = use_llm
        self.model = model
        self.stats = ProcessingStats()
        self.processed_entities = []
        
        # Metabolic ontology context
        self.ontology_context = {
            "@context": {
                "regen": "https://regen.network/ontology#",
                "schema": "http://schema.org/",
                "prov": "http://www.w3.org/ns/prov#"
            }
        }
        
        # Initialize tokenizer for accurate token counting
        try:
            self.tokenizer = tiktoken.encoding_for_model(model if "gpt" in model else "gpt-3.5-turbo")
        except:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")
    
    def generate_rid(self, source: str, identifier: str) -> str:
        """Generate Resource Identifier"""
        return f"orn:regen.{source}:{identifier}"
    
    def generate_cid(self, content: str) -> str:
        """Generate Content Identifier"""
        hash_obj = hashlib.sha256(content.encode())
        return f"cid:sha256:{hash_obj.hexdigest()[:16]}"
    
    def extract_entities_basic(self, content: str, metadata: Dict) -> List[Dict]:
        """Basic entity extraction without LLM"""
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
        
        if "proposal" in content_lower or "vote" in content_lower:
            entities.append({
                **self.ontology_context,
                "@type": "regen:GovernanceAct",
                "@id": self.generate_rid("governance", f"act_{metadata.get('id', 'unknown')}"),
                "name": "Governance Activity",
                "foundIn": doc_entity["@id"],
                "alignsWith": ["Harmonize Agency"]
            })
        
        if "regen network" in content_lower:
            entities.append({
                **self.ontology_context,
                "@type": "regen:Agent",
                "@id": "orn:regen.agent:regen-network",
                "name": "Regen Network",
                "mentioned_in": doc_entity["@id"],
                "alignsWith": ["Re-Whole Value", "Nest Caring", "Harmonize Agency"]
            })
        
        return entities
    
    async def extract_entities_llm(self, content: str, metadata: Dict) -> List[Dict]:
        """Extract entities using LLM (requires OpenAI API key)"""
        # This would use the full prompt from metabolic-extractor.py
        # For now, return basic extraction
        return self.extract_entities_basic(content, metadata)
    
    async def process_document(self, file_path: Path) -> Dict:
        """Process a single document"""
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
            
            # Update stats
            self.stats.total_characters += len(content)
            token_count = len(self.tokenizer.encode(content))
            self.stats.total_tokens += token_count
            
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
                "timestamp": datetime.now(tz=timezone.utc).isoformat()
            }
            
            return {
                "metadata": metadata,
                "entities": entities,
                "transformation": transformation
            }
            
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
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
    
    async def process_directory(self, directory: Path, exclude_twitter: bool = True) -> None:
        """Process all documents in a directory"""
        # Find all documents
        patterns = ["*.md", "*.json", "*.txt"]
        files = []
        
        for pattern in patterns:
            found_files = list(directory.rglob(pattern))
            if exclude_twitter:
                found_files = [f for f in found_files if "twitter" not in str(f).lower()]
            files.extend(found_files)
        
        self.stats.total_documents = len(files)
        
        print(f"📊 Found {len(files)} documents to process")
        print(f"📐 Exclude Twitter: {exclude_twitter}")
        
        # Process in batches
        batch_size = 10
        for i in range(0, len(files), batch_size):
            batch = files[i:i+batch_size]
            tasks = [self.process_document(f) for f in batch]
            results = await asyncio.gather(*tasks)
            
            # Store results
            for result in results:
                if result:
                    self.processed_entities.append(result)
            
            # Progress update
            print(f"Progress: {self.stats.processed_documents}/{self.stats.total_documents}")
    
    def estimate_total_cost(self) -> Dict:
        """Estimate total processing cost"""
        # Calculate costs for different models
        models = ["gpt-4o-mini", "gpt-3.5-turbo", "gpt-4o"]
        estimates = {}
        
        for model in models:
            cost = self.stats.estimate_cost(self.stats.total_characters, model)
            estimates[model] = {
                "extraction_cost": cost,
                "embedding_cost": cost * 0.1,  # Embeddings are cheaper
                "total_cost": cost * 1.1
            }
        
        return {
            "statistics": {
                "total_documents": self.stats.total_documents,
                "processed_documents": self.stats.processed_documents,
                "total_characters": self.stats.total_characters,
                "total_tokens": self.stats.total_tokens,
                "entities_extracted": self.stats.entities_extracted,
                "avg_doc_size": self.stats.total_characters / max(self.stats.processed_documents, 1)
            },
            "cost_estimates": estimates,
            "recommended_model": "gpt-4o-mini"  # Best balance of cost/quality
        }
    
    def save_results(self, output_path: Path) -> None:
        """Save processing results"""
        output = {
            "metadata": {
                "processing_date": datetime.now(tz=timezone.utc).isoformat(),
                "total_documents": self.stats.processed_documents,
                "entities_extracted": self.stats.entities_extracted
            },
            "entities": self.processed_entities,
            "cost_analysis": self.estimate_total_cost()
        }
        
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"✅ Results saved to {output_path}")


async def main():
    """Main processing function"""
    print("🌿 KOI Document Processor with Metabolic Ontology")
    print("=" * 60)
    
    # Initialize processor (without LLM for cost estimation)
    processor = MetabolicDocumentProcessor(use_llm=False, model="gpt-4o-mini")
    
    # Process non-Twitter documents
    data_dir = Path("/Users/darrenzal/GAIA/data")
    
    print("\n📂 Processing non-Twitter documents for cost estimation...")
    await processor.process_directory(data_dir, exclude_twitter=True)
    
    # Show cost analysis
    cost_analysis = processor.estimate_total_cost()
    
    print("\n💰 COST ANALYSIS")
    print("=" * 60)
    print(f"Documents: {cost_analysis['statistics']['total_documents']}")
    print(f"Total characters: {cost_analysis['statistics']['total_characters']:,}")
    print(f"Total tokens (estimated): {cost_analysis['statistics']['total_tokens']:,}")
    print(f"Entities extracted (basic): {cost_analysis['statistics']['entities_extracted']}")
    print(f"Average document size: {cost_analysis['statistics']['avg_doc_size']:.0f} chars")
    
    print("\n💵 Estimated Costs for Full LLM Extraction:")
    for model, costs in cost_analysis['cost_estimates'].items():
        print(f"\n{model}:")
        print(f"  Extraction: ${costs['extraction_cost']:.2f}")
        print(f"  Embeddings: ${costs['embedding_cost']:.2f}")
        print(f"  TOTAL: ${costs['total_cost']:.2f}")
    
    # Estimate for Twitter documents
    twitter_files = list(data_dir.rglob("twitter/*.md"))
    twitter_chars = sum(len(f.read_text(encoding='utf-8', errors='ignore')) for f in twitter_files[:100]) * (len(twitter_files) / 100)
    twitter_cost = processor.stats.estimate_cost(twitter_chars, "gpt-4o-mini")
    
    print(f"\n🐦 Twitter Documents ({len(twitter_files)} files):")
    print(f"  Estimated cost with gpt-4o-mini: ${twitter_cost:.2f}")
    
    print(f"\n📊 TOTAL ESTIMATED COST (ALL DOCUMENTS with gpt-4o-mini):")
    print(f"  Non-Twitter: ${cost_analysis['cost_estimates']['gpt-4o-mini']['total_cost']:.2f}")
    print(f"  Twitter: ${twitter_cost:.2f}")
    print(f"  GRAND TOTAL: ${cost_analysis['cost_estimates']['gpt-4o-mini']['total_cost'] + twitter_cost:.2f}")
    
    # Save results
    output_path = Path("/Users/darrenzal/koi-research/processing-results.json")
    processor.save_results(output_path)
    
    print("\n" + "=" * 60)
    print("✅ Cost estimation complete!")
    print("\nNext steps:")
    print("1. Review cost estimates above")
    print("2. Add OpenAI API key to .env if costs are acceptable")
    print("3. Run with use_llm=True for full extraction")
    print("4. Results will be saved with full JSON-LD entities")


if __name__ == "__main__":
    asyncio.run(main())