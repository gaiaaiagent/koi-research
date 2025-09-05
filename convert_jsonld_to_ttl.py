#!/usr/bin/env python3
"""
Convert KOI JSON-LD entities to Turtle (TTL) format for Apache Jena Fuseki

This script takes the production pipeline JSON-LD output and converts it to
TTL format while preserving all KOI features: RIDs, CIDs, provenance, etc.
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from rdflib import Graph, Namespace, URIRef, Literal, BNode
from rdflib.namespace import RDF, RDFS, OWL, XSD, DC

# Define namespaces
REGEN = Namespace("http://regen.network/ontology#")
KOI = Namespace("http://koi.network/ontology#")
ORN = Namespace("orn:")
CID = Namespace("cid:")
PROV = Namespace("http://www.w3.org/ns/prov#")

def setup_graph():
    """Initialize RDF graph with KOI namespaces"""
    g = Graph()
    g.bind("regen", REGEN)
    g.bind("koi", KOI)
    g.bind("orn", ORN)
    g.bind("cid", CID)
    g.bind("prov", PROV)
    g.bind("dc", DC)
    g.bind("rdf", RDF)
    g.bind("rdfs", RDFS)
    g.bind("owl", OWL)
    g.bind("xsd", XSD)
    return g

def convert_entity(entity_data, g):
    """Convert a single JSON-LD entity to RDF triples"""
    # Get the @id or generate one
    entity_id = entity_data.get("@id")
    if not entity_id:
        # Generate based on name if no @id
        name = entity_data.get("name", "unknown")
        entity_id = f"orn:regen.entity:{name.replace(' ', '_')}"
    
    entity_uri = URIRef(entity_id)
    
    # Add type
    entity_type = entity_data.get("@type")
    if entity_type:
        if isinstance(entity_type, list):
            for t in entity_type:
                type_uri = REGEN[t.replace("regen:", "")] if "regen:" in t else URIRef(t)
                g.add((entity_uri, RDF.type, type_uri))
        else:
            type_uri = REGEN[entity_type.replace("regen:", "")] if "regen:" in entity_type else URIRef(entity_type)
            g.add((entity_uri, RDF.type, type_uri))
    
    # Add name
    if "name" in entity_data:
        g.add((entity_uri, RDFS.label, Literal(entity_data["name"])))
    
    # Add KOI-specific properties
    if "wasExtractedUsing" in entity_data:
        g.add((entity_uri, PROV.wasGeneratedBy, URIRef(entity_data["wasExtractedUsing"])))
    
    if "ontologyVersion" in entity_data:
        g.add((entity_uri, KOI.ontologyVersion, URIRef(entity_data["ontologyVersion"])))
    
    if "extractedAt" in entity_data:
        g.add((entity_uri, PROV.generatedAtTime, Literal(entity_data["extractedAt"], datatype=XSD.dateTime)))
    
    if "extractedBy" in entity_data:
        g.add((entity_uri, PROV.wasAttributedTo, Literal(entity_data["extractedBy"])))
    
    if "foundIn" in entity_data:
        g.add((entity_uri, PROV.wasDerivedFrom, Literal(entity_data["foundIn"])))
    
    # Add essence alignments
    if "alignsWith" in entity_data:
        alignments = entity_data["alignsWith"]
        if isinstance(alignments, list):
            for alignment in alignments:
                g.add((entity_uri, REGEN.alignsWith, Literal(alignment)))
    
    # Add any additional properties
    skip_props = ["@id", "@type", "name", "wasExtractedUsing", "ontologyVersion", 
                  "extractedAt", "extractedBy", "foundIn", "alignsWith"]
    
    for key, value in entity_data.items():
        if key not in skip_props:
            # Create property URI
            prop_uri = REGEN[key] if not ":" in key else URIRef(key)
            
            # Add the triple
            if isinstance(value, list):
                for v in value:
                    g.add((entity_uri, prop_uri, Literal(v)))
            elif isinstance(value, dict):
                # Handle nested objects (create blank node)
                bnode = BNode()
                g.add((entity_uri, prop_uri, bnode))
                # Recursively add nested properties
                for k, v in value.items():
                    g.add((bnode, REGEN[k], Literal(v)))
            else:
                g.add((entity_uri, prop_uri, Literal(value)))

def convert_transformation(transform_data, g):
    """Convert transformation/CAT receipt to RDF"""
    trans_id = transform_data.get("@id")
    if not trans_id:
        trans_id = f"orn:regen.transform:{datetime.now().isoformat()}"
    
    trans_uri = URIRef(trans_id)
    
    # Add type
    trans_type = transform_data.get("@type", "regen:Transformation")
    type_uri = REGEN[trans_type.replace("regen:", "")] if "regen:" in trans_type else URIRef(trans_type)
    g.add((trans_uri, RDF.type, type_uri))
    
    # Add transformation properties
    if "fromState" in transform_data:
        g.add((trans_uri, REGEN.fromState, Literal(transform_data["fromState"])))
    
    if "toState" in transform_data:
        to_states = transform_data["toState"]
        if isinstance(to_states, list):
            for state in to_states:
                g.add((trans_uri, REGEN.toState, URIRef(state)))
        else:
            g.add((trans_uri, REGEN.toState, URIRef(to_states)))
    
    if "process" in transform_data:
        g.add((trans_uri, REGEN.process, Literal(transform_data["process"])))
    
    if "timestamp" in transform_data:
        g.add((trans_uri, PROV.generatedAtTime, Literal(transform_data["timestamp"], datatype=XSD.dateTime)))
    
    if "processingTime" in transform_data:
        g.add((trans_uri, REGEN.processingTime, Literal(transform_data["processingTime"], datatype=XSD.decimal)))

def main():
    # Input and output files
    input_file = Path("/Users/darrenzal/projects/RegenAI/koi-processor/production-pipeline-20250902_235652.json")
    output_file = Path("/Users/darrenzal/projects/RegenAI/koi-research/koi-entities-production.ttl")
    
    print(f"Converting JSON-LD to Turtle format...")
    print(f"Input: {input_file}")
    print(f"Output: {output_file}")
    
    # Load JSON-LD data
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    # Initialize RDF graph
    g = setup_graph()
    
    # Add metadata as graph metadata
    metadata = data.get("metadata", {})
    graph_uri = URIRef("orn:regen.dataset:production-pipeline-20250902")
    g.add((graph_uri, RDF.type, REGEN.Dataset))
    g.add((graph_uri, DC.date, Literal(metadata.get("processing_date", ""), datatype=XSD.dateTime)))
    g.add((graph_uri, REGEN.processorVersion, Literal(metadata.get("processor_version", ""))))
    g.add((graph_uri, REGEN.ontologyVersion, URIRef(metadata.get("ontology_version", ""))))
    g.add((graph_uri, REGEN.entitiesExtracted, Literal(metadata.get("entities_extracted", 0), datatype=XSD.integer)))
    
    # Process entities
    entities = data.get("entities", [])
    entity_count = 0
    transformation_count = 0
    
    for doc in entities:
        # Process document metadata
        doc_metadata = doc.get("metadata", {})
        
        # Process extracted entities
        doc_entities = doc.get("entities", [])
        for entity in doc_entities:
            convert_entity(entity, g)
            entity_count += 1
        
        # Process transformation/CAT receipt
        if "transformation" in doc:
            convert_transformation(doc["transformation"], g)
            transformation_count += 1
    
    # Serialize to Turtle format
    ttl_output = g.serialize(format="turtle")
    
    # Write to file
    with open(output_file, 'w') as f:
        f.write(ttl_output)
    
    # Print statistics
    print(f"\nConversion complete!")
    print(f"Entities converted: {entity_count}")
    print(f"Transformations converted: {transformation_count}")
    print(f"Total triples: {len(g)}")
    print(f"Output saved to: {output_file}")
    
    # Also create a smaller sample for testing
    sample_file = Path("/Users/darrenzal/projects/RegenAI/koi-research/koi-entities-sample.ttl")
    sample_g = setup_graph()
    
    # Copy first 10 entities for sample
    for triple in list(g)[:100]:
        sample_g.add(triple)
    
    sample_ttl = sample_g.serialize(format="turtle")
    with open(sample_file, 'w') as f:
        f.write(sample_ttl)
    
    print(f"Sample (first 100 triples) saved to: {sample_file}")

if __name__ == "__main__":
    main()