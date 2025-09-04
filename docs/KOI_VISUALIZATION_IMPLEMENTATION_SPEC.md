# KOI Knowledge Graph Visualization & Search Implementation Specification

## Executive Summary

This document outlines the implementation of a comprehensive knowledge graph visualization and natural language query system for the KOI (Knowledge Organization Infrastructure) project. The solution integrates with the existing GAIA platform to provide interactive graph exploration, SPARQL querying, and AI-powered natural language to query conversion.

## Goals & Objectives

### Primary Goals
1. **Interactive Visualization**: Create rich, interactive visualizations for the RDF knowledge graph built by koi-processor
2. **Natural Language Querying**: Enable users to query the knowledge graph using natural language, automatically converting to SPARQL
3. **Semantic Search**: Provide advanced search capabilities across essence alignments, provenance chains, and metabolic processes
4. **Integration**: Seamlessly integrate with existing GAIA agent system and web infrastructure

### Success Metrics
- **Performance**: Query response <2s, graph rendering <5s for 1,000+ nodes, 60fps interactions
- **Usability**: Non-technical users can successfully explore knowledge graph via natural language
- **Scale**: Handle full dataset of 1,116+ documents with responsive performance
- **Integration**: Unified experience with existing GAIA agents and authentication

## Rationale & Strategic Context

### Why GAIA Repository?
The GAIA repository is optimal for this implementation because:

1. **Existing Infrastructure**: Already has React/TypeScript frontend, Django backend, and web server configuration
2. **Technology Alignment**: Current stack (React, Django, Nginx) directly supports our visualization strategy
3. **Agent Integration**: Natural integration point for AI-powered query generation and semantic search
4. **Deployment Ready**: Existing Docker, SSL, and authentication infrastructure

### Architecture Decision: Hybrid Approach
We selected a hybrid React frontend + Django backend API approach for:

- **Frontend**: React + D3.js + Sigma.js for rich, interactive visualizations at `https://regen.gaiaai.xyz/koi`
- **Backend**: Django REST API for SPARQL processing and NL→SPARQL conversion at `https://admin.regen.gaiaai.xyz/api/koi/`
- **Data Store**: Apache Jena Fuseki triplestore with RDF data from koi-processor

This architecture provides optimal separation of concerns, security, and performance.

## Repository Organization Strategy

### File Structure
```
/Users/darrenzal/projects/RegenAI/GAIA/
├── packages/app/src/pages/koi/                    # React frontend components
│   ├── KOIPage.tsx                               # Main page component
│   ├── components/
│   │   ├── QueryInterface.tsx                    # Natural language query interface
│   │   ├── SPARQLBuilder.tsx                     # Visual SPARQL builder
│   │   ├── EssenceAlignmentRadar.tsx            # D3.js essence visualization
│   │   ├── ProvenanceTimeline.tsx               # CAT receipt timeline
│   │   ├── MetabolicProcessFlow.tsx             # Hierarchical process view
│   │   └── GraphExplorer.tsx                    # Sigma.js large graph explorer
│   ├── hooks/
│   │   ├── useKOIWebSocket.ts                   # WebSocket for real-time updates
│   │   ├── useSPARQLQuery.ts                    # SPARQL query management
│   │   └── useGraphData.ts                      # Graph data state management
│   └── types/
│       └── koi-types.ts                         # TypeScript definitions
├── django_admin/koi_visualization/               # Django backend app
│   ├── models.py                                # Query history, caching models
│   ├── views.py                                 # REST API endpoints
│   ├── services/
│   │   ├── sparql_service.py                    # SPARQL execution service
│   │   ├── nl_sparql_service.py                 # Natural language conversion
│   │   └── ontology_service.py                  # Ontology loading/caching
│   ├── serializers.py                           # DRF serializers
│   └── urls.py                                  # API routing
├── docker-compose.yml                           # Add Fuseki service
└── docs/koi/                                    # Implementation documentation
    ├── API_REFERENCE.md                         # API endpoint documentation
    ├── FRONTEND_COMPONENTS.md                   # React component guide
    └── DEPLOYMENT_GUIDE.md                      # Deployment instructions
```

### Development Workflow
1. **Feature Branches**: Create branches from `develop` (following GAIA conventions)
2. **Component Development**: Build React components with Storybook for isolation
3. **API Development**: Use Django's built-in testing framework for backend services
4. **Integration Testing**: Test full stack with real RDF data
5. **Documentation**: Update relevant docs with each component/API addition

## Implementation Strategy

### Phase-Based Approach
The implementation follows a 5-phase approach prioritizing core functionality first, then advanced features:

1. **Infrastructure Foundation** (Week 1)
2. **Backend SPARQL & NL Processing** (Weeks 2-3)  
3. **Frontend Visualization Components** (Weeks 3-4)
4. **Advanced Features & Integration** (Week 5)
5. **Testing, Optimization & Deployment** (Week 6)

### Risk Mitigation
- **Data Complexity**: Start with simplified test datasets before full 1,116 documents
- **Performance**: Implement virtualization and caching from the beginning
- **Integration Issues**: Develop against existing GAIA development environment
- **User Experience**: Create mockups and get feedback before implementation

## Detailed Implementation Steps

### Phase 1: Infrastructure Foundation (Week 1)

#### 1.1 Apache Jena Fuseki Integration
**Objective**: Set up triplestore service and load RDF data

**Steps**:
1. Add Fuseki service to `docker-compose.yml`:
   ```yaml
   fuseki:
     image: stain/jena-fuseki
     container_name: gaia-fuseki
     ports:
       - "3030:3030"
     volumes:
       - fuseki_data:/fuseki
       - ./koi-data:/staging
     environment:
       - ADMIN_PASSWORD=admin
   ```

2. Create data loading script:
   ```bash
   # scripts/load-koi-data.sh
   docker exec gaia-fuseki tdbloader --graph=default /staging/koi-graph.ttl
   ```

3. Configure persistent storage and backup procedures

**Deliverables**:
- Fuseki service running and accessible
- RDF data loaded and queryable via SPARQL endpoint
- Basic health checks and monitoring

**Testing Criteria**:
- [ ] Fuseki responds to HTTP requests on port 3030
- [ ] SPARQL endpoint returns valid responses
- [ ] Sample queries execute successfully against loaded data
- [ ] Data persistence verified after container restart

#### 1.2 Django KOI App Creation
**Objective**: Create Django application structure for API backend

**Steps**:
1. Create Django app:
   ```bash
   cd django_admin
   python manage.py startapp koi_visualization
   ```

2. Add dependencies to `requirements.txt`:
   ```
   SPARQLWrapper==2.0.0
   rdflib==6.3.2
   openai==1.3.0
   django-cors-headers==4.3.1
   ```

3. Configure Django settings:
   ```python
   # settings.py additions
   INSTALLED_APPS += ['koi_visualization']
   KOI_SPARQL_ENDPOINT = 'http://fuseki:3030/koi/sparql'
   KOI_ONTOLOGY_PATH = '/path/to/regen-unified-ontology.ttl'
   ```

4. Create base model structure and initial migrations

**Deliverables**:
- Django app created and configured
- Database models for query history and caching
- Basic API structure with DRF integration

**Testing Criteria**:
- [ ] Django app loads without errors
- [ ] Database migrations run successfully
- [ ] Basic API endpoints return 200 responses
- [ ] SPARQL endpoint connectivity from Django confirmed

#### 1.3 React Route Setup
**Objective**: Create frontend page structure and navigation

**Steps**:
1. Add new route to GAIA React router:
   ```typescript
   // App.tsx
   <Route path="/koi" element={<KOIPage />} />
   ```

2. Install visualization dependencies:
   ```bash
   bun add d3 sigma @types/d3 @sigma/node @sigma/edge
   ```

3. Create base page component with navigation and layout

4. Set up TypeScript definitions for KOI data structures

**Deliverables**:
- KOI page accessible at `/koi` route
- Base component structure established
- Dependencies installed and configured

**Testing Criteria**:
- [ ] Route renders without errors
- [ ] Navigation to KOI page works from main GAIA interface
- [ ] Dependencies imported successfully
- [ ] Base layout matches GAIA design system

### Phase 2: Backend SPARQL & NL Processing (Weeks 2-3)

#### 2.1 Core Django Services
**Objective**: Implement SPARQL execution and natural language processing services

**Implementation**:
```python
# services/sparql_service.py
class SPARQLService:
    def __init__(self):
        self.endpoint = settings.KOI_SPARQL_ENDPOINT
        self.sparql = SPARQLWrapper(self.endpoint)
        
    def execute_query(self, query: str) -> Dict[str, Any]:
        """Execute SPARQL query and return results"""
        try:
            self.sparql.setQuery(query)
            self.sparql.setReturnFormat(JSON)
            results = self.sparql.query().convert()
            return {
                'success': True,
                'results': results,
                'query': query,
                'execution_time': time.time() - start_time
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_essence_alignments(self, filters: Dict = None) -> List[Dict]:
        """Get documents with essence alignment data"""
        query = """
        PREFIX regen: <http://regen.network/ontology#>
        SELECT ?doc ?essence ?confidence ?content WHERE {
            ?doc regen:hasEssenceAlignment ?essence .
            ?doc regen:confidence ?confidence .
            ?doc regen:content ?content .
            FILTER(?confidence > 0.5)
        }
        ORDER BY DESC(?confidence)
        """
        return self.execute_query(query)
    
    def get_provenance_chain(self, rid: str) -> List[Dict]:
        """Get CAT receipt provenance chain for a document"""
        query = f"""
        PREFIX regen: <http://regen.network/ontology#>
        SELECT ?source ?target ?transformation ?timestamp WHERE {{
            ?receipt regen:sourceRID "{rid}" .
            ?receipt regen:targetRID ?target .
            ?receipt regen:transformation ?transformation .
            ?receipt regen:timestamp ?timestamp .
        }}
        ORDER BY ?timestamp
        """
        return self.execute_query(query)

# services/nl_sparql_service.py
class NLToSPARQLService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.ontology_context = self._load_ontology_context()
        
    def generate_sparql(self, user_query: str) -> Dict[str, Any]:
        """Convert natural language to SPARQL query"""
        
        # Load few-shot examples from query history
        examples = self._get_successful_examples()
        
        prompt = f"""
        You are a SPARQL query generator for the Regen Network knowledge graph.
        
        Ontology context:
        {self.ontology_context}
        
        Example queries:
        {examples}
        
        User question: "{user_query}"
        
        Generate a SPARQL query that answers this question. Focus on:
        - Essence alignments (Re-Whole Value, Nest Caring, Harmonize Agency)
        - Provenance tracking via CAT receipts
        - Metabolic processes and relationships
        
        Return only the SPARQL query, no explanation.
        """
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )
            
            generated_query = response.choices[0].message.content
            
            # Validate generated SPARQL
            is_valid = self._validate_sparql(generated_query)
            
            return {
                'success': True,
                'sparql_query': generated_query,
                'is_valid': is_valid,
                'user_query': user_query
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'user_query': user_query
            }
    
    def _validate_sparql(self, query: str) -> bool:
        """Validate SPARQL syntax without execution"""
        try:
            # Use rdflib to parse and validate syntax
            from rdflib.plugins.sparql import prepareQuery
            prepareQuery(query)
            return True
        except:
            return False
```

**Deliverables**:
- SPARQL service with core query methods
- Natural language to SPARQL conversion service
- Query validation and error handling
- Performance monitoring and caching

**Testing Criteria**:
- [ ] All SPARQL service methods execute without errors
- [ ] Natural language queries generate valid SPARQL
- [ ] Query validation correctly identifies syntax errors
- [ ] Performance meets <2s response time target

#### 2.2 REST API Endpoints
**Objective**: Create API endpoints for frontend consumption

**Implementation**:
```python
# views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .services.sparql_service import SPARQLService
from .services.nl_sparql_service import NLToSPARQLService

@api_view(['POST'])
def natural_language_query(request):
    """
    Convert natural language to SPARQL and execute
    POST /api/koi/nl-query/
    Body: {"question": "Show me documents about regenerative agriculture"}
    """
    nl_service = NLToSPARQLService()
    sparql_service = SPARQLService()
    
    user_query = request.data.get('question', '')
    
    # Generate SPARQL from natural language
    nl_result = nl_service.generate_sparql(user_query)
    
    if not nl_result['success']:
        return Response(nl_result, status=400)
    
    # Execute generated query
    sparql_result = sparql_service.execute_query(nl_result['sparql_query'])
    
    # Store in query history
    QueryHistory.objects.create(
        user_query=user_query,
        generated_sparql=nl_result['sparql_query'],
        execution_time=sparql_result.get('execution_time', 0),
        result_count=len(sparql_result.get('results', {}).get('bindings', []))
    )
    
    return Response({
        'original_question': user_query,
        'generated_sparql': nl_result['sparql_query'],
        'is_valid_sparql': nl_result['is_valid'],
        'execution_result': sparql_result,
        'visualization_data': format_for_visualization(sparql_result)
    })

@api_view(['POST'])
def execute_sparql(request):
    """
    Execute raw SPARQL query
    POST /api/koi/sparql/
    Body: {"query": "SELECT * WHERE { ?s ?p ?o } LIMIT 10"}
    """
    sparql_service = SPARQLService()
    query = request.data.get('query', '')
    
    result = sparql_service.execute_query(query)
    
    return Response({
        'query': query,
        'result': result,
        'visualization_data': format_for_visualization(result)
    })

@api_view(['GET'])
def get_essence_data(request):
    """Get pre-formatted essence alignment visualization data"""
    sparql_service = SPARQLService()
    
    # Get query parameters for filtering
    essence_type = request.query_params.get('essence_type', None)
    min_confidence = float(request.query_params.get('min_confidence', 0.5))
    
    data = sparql_service.get_essence_alignments({
        'essence_type': essence_type,
        'min_confidence': min_confidence
    })
    
    return Response({
        'essence_data': format_essence_for_d3(data),
        'filters_applied': {
            'essence_type': essence_type,
            'min_confidence': min_confidence
        }
    })

@api_view(['GET'])
def get_graph_data(request):
    """Get node/edge data for large graph visualization"""
    sparql_service = SPARQLService()
    
    # Parameters for graph scope
    max_nodes = int(request.query_params.get('max_nodes', 1000))
    center_node = request.query_params.get('center_node', None)
    depth = int(request.query_params.get('depth', 2))
    
    graph_data = sparql_service.get_graph_neighborhood({
        'center_node': center_node,
        'depth': depth,
        'max_nodes': max_nodes
    })
    
    return Response({
        'nodes': format_nodes_for_sigma(graph_data['nodes']),
        'edges': format_edges_for_sigma(graph_data['edges']),
        'metadata': {
            'total_nodes': len(graph_data['nodes']),
            'total_edges': len(graph_data['edges']),
            'center_node': center_node,
            'depth': depth
        }
    })
```

**Deliverables**:
- Complete REST API with documented endpoints
- Request/response serializers
- Error handling and validation
- API documentation with examples

**Testing Criteria**:
- [ ] All API endpoints return proper HTTP status codes
- [ ] Request/response data properly serialized
- [ ] Error handling provides meaningful messages
- [ ] API documentation accurate and complete

#### 2.3 Caching & Performance Optimization
**Objective**: Implement caching for expensive SPARQL operations

**Implementation**:
```python
# models.py
class CachedSPARQLResult(models.Model):
    query_hash = models.CharField(max_length=64, unique=True)
    sparql_query = models.TextField()
    result_data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    access_count = models.IntegerField(default=0)
    
    @classmethod
    def get_cached_result(cls, query: str, ttl_hours: int = 24):
        """Get cached result if available and not expired"""
        query_hash = hashlib.sha256(query.encode()).hexdigest()
        
        try:
            cached = cls.objects.get(
                query_hash=query_hash,
                expires_at__gt=timezone.now()
            )
            cached.access_count += 1
            cached.save()
            return cached.result_data
        except cls.DoesNotExist:
            return None
    
    @classmethod
    def cache_result(cls, query: str, result: dict, ttl_hours: int = 24):
        """Cache SPARQL result with TTL"""
        query_hash = hashlib.sha256(query.encode()).hexdigest()
        expires_at = timezone.now() + timedelta(hours=ttl_hours)
        
        cls.objects.update_or_create(
            query_hash=query_hash,
            defaults={
                'sparql_query': query,
                'result_data': result,
                'expires_at': expires_at,
                'access_count': 1
            }
        )

# Enhanced SPARQL service with caching
class CachedSPARQLService(SPARQLService):
    def execute_query(self, query: str, use_cache: bool = True) -> Dict[str, Any]:
        if use_cache:
            cached_result = CachedSPARQLResult.get_cached_result(query)
            if cached_result:
                return {
                    'success': True,
                    'results': cached_result,
                    'query': query,
                    'from_cache': True
                }
        
        # Execute query normally
        result = super().execute_query(query)
        
        # Cache successful results
        if result['success'] and use_cache:
            CachedSPARQLResult.cache_result(query, result['results'])
        
        return result
```

**Deliverables**:
- Database-backed caching system
- Cache invalidation strategies
- Performance monitoring metrics
- Cache hit rate reporting

**Testing Criteria**:
- [ ] Cache system reduces duplicate query execution
- [ ] Cache invalidation works correctly
- [ ] Performance improvement measurable (>50% faster for cached queries)
- [ ] Cache hit rates tracked and reported

### Phase 3: Frontend Visualization Components (Weeks 3-4)

#### 3.1 Query Interface Components
**Objective**: Create user-friendly query interfaces

**Implementation**:
```typescript
// components/QueryInterface.tsx
import React, { useState, useCallback } from 'react'
import { useSPARQLQuery } from '../hooks/useSPARQLQuery'

interface QueryResult {
  originalQuestion: string
  generatedSparql: string
  isValidSparql: boolean
  executionResult: any
  visualizationData: any
}

export const QueryInterface: React.FC = () => {
  const [naturalQuery, setNaturalQuery] = useState('')
  const [sparqlQuery, setSparqlQuery] = useState('')
  const [showSparqlEditor, setShowSparqlEditor] = useState(false)
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  
  const { executeNaturalQuery, executeSparqlQuery, loading, error } = useSPARQLQuery()
  
  const handleNaturalQuery = useCallback(async (query: string) => {
    const result = await executeNaturalQuery(query)
    
    if (result) {
      setSparqlQuery(result.generatedSparql)
      setQueryHistory(prev => [query, ...prev.slice(0, 9)]) // Keep last 10
    }
  }, [executeNaturalQuery])
  
  const handleSparqlQuery = useCallback(async (query: string) => {
    const result = await executeSparqlQuery(query)
    // Handle result
  }, [executeSparqlQuery])
  
  return (
    <div className="query-interface">
      {/* Natural Language Input */}
      <div className="natural-query-section">
        <textarea
          value={naturalQuery}
          onChange={(e) => setNaturalQuery(e.target.value)}
          placeholder="Ask about the knowledge graph in natural language..."
          className="natural-query-input"
          rows={3}
        />
        <button 
          onClick={() => handleNaturalQuery(naturalQuery)}
          disabled={loading}
          className="query-button"
        >
          {loading ? 'Processing...' : 'Query Knowledge Graph'}
        </button>
      </div>
      
      {/* SPARQL Editor Toggle */}
      <div className="sparql-editor-toggle">
        <label>
          <input
            type="checkbox"
            checked={showSparqlEditor}
            onChange={(e) => setShowSparqlEditor(e.target.checked)}
          />
          Show SPARQL Editor
        </label>
      </div>
      
      {/* SPARQL Editor */}
      {showSparqlEditor && (
        <div className="sparql-editor-section">
          <textarea
            value={sparqlQuery}
            onChange={(e) => setSparqlQuery(e.target.value)}
            placeholder="Enter SPARQL query..."
            className="sparql-editor"
            rows={8}
          />
          <button 
            onClick={() => handleSparqlQuery(sparqlQuery)}
            disabled={loading}
            className="sparql-execute-button"
          >
            Execute SPARQL
          </button>
        </div>
      )}
      
      {/* Query History */}
      <div className="query-history">
        <h4>Recent Queries</h4>
        {queryHistory.map((query, index) => (
          <div 
            key={index} 
            className="history-item"
            onClick={() => setNaturalQuery(query)}
          >
            {query}
          </div>
        ))}
      </div>
      
      {/* Error Display */}
      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}
    </div>
  )
}

// hooks/useSPARQLQuery.ts
export const useSPARQLQuery = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const executeNaturalQuery = useCallback(async (question: string) => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/koi/nl-query/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ question })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      return result
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])
  
  const executeSparqlQuery = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/koi/sparql/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ query })
      })
      
      const result = await response.json()
      return result
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])
  
  return {
    executeNaturalQuery,
    executeSparqlQuery,
    loading,
    error
  }
}
```

**Deliverables**:
- Natural language query interface
- SPARQL editor with syntax highlighting
- Query history and suggestions
- Error handling and validation

**Testing Criteria**:
- [ ] Natural language queries generate proper API calls
- [ ] SPARQL editor validates syntax
- [ ] Query history functions correctly
- [ ] Error messages are user-friendly

#### 3.2 D3.js Visualization Components
**Objective**: Create custom visualizations for KOI-specific data patterns

**Implementation**:
```typescript
// components/EssenceAlignmentRadar.tsx
import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface EssenceDocument {
  id: string
  title: string
  essenceScores: {
    'Re-Whole Value': number
    'Nest Caring': number
    'Harmonize Agency': number
  }
  confidence: number
}

export const EssenceAlignmentRadar: React.FC<{ documents: EssenceDocument[] }> = ({ documents }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  
  useEffect(() => {
    if (!documents.length || !svgRef.current) return
    
    const svg = d3.select(svgRef.current)
    const width = 400
    const height = 400
    const margin = 40
    const radius = Math.min(width, height) / 2 - margin
    
    // Clear previous render
    svg.selectAll('*').remove()
    
    // Set up container
    const container = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width/2}, ${height/2})`)
    
    // Essence dimensions
    const essenceTypes = ['Re-Whole Value', 'Nest Caring', 'Harmonize Agency']
    const numAxes = essenceTypes.length
    const angleSlice = (2 * Math.PI) / numAxes
    
    // Scales
    const essenceScale = d3.scaleLinear()
      .domain([0, 1])
      .range([0, radius])
    
    // Draw grid lines
    const gridLevels = 5
    for (let level = 1; level <= gridLevels; level++) {
      const levelRadius = (radius / gridLevels) * level
      
      const gridPoints = essenceTypes.map((_, i) => {
        const angle = angleSlice * i - Math.PI / 2
        return [
          Math.cos(angle) * levelRadius,
          Math.sin(angle) * levelRadius
        ]
      })
      
      container.append('polygon')
        .attr('points', gridPoints.map(d => d.join(',')).join(' '))
        .attr('fill', 'none')
        .attr('stroke', '#ccc')
        .attr('stroke-width', 1)
    }
    
    // Draw axis lines and labels
    essenceTypes.forEach((essence, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      
      // Axis line
      container.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', y)
        .attr('stroke', '#999')
        .attr('stroke-width', 1)
      
      // Axis label
      container.append('text')
        .attr('x', x * 1.15)
        .attr('y', y * 1.15)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .text(essence)
    })
    
    // Draw document essence profiles
    documents.forEach((doc, docIndex) => {
      const pathPoints = essenceTypes.map((essence, i) => {
        const angle = angleSlice * i - Math.PI / 2
        const value = doc.essenceScores[essence as keyof typeof doc.essenceScores]
        const scaledRadius = essenceScale(value)
        return [
          Math.cos(angle) * scaledRadius,
          Math.sin(angle) * scaledRadius
        ]
      })
      
      // Close the path
      pathPoints.push(pathPoints[0])
      
      // Create path
      const line = d3.line()
        .x(d => d[0])
        .y(d => d[1])
        .curve(d3.curveLinearClosed)
      
      // Color based on overall confidence
      const color = d3.interpolateViridis(doc.confidence)
      
      container.append('path')
        .datum(pathPoints)
        .attr('d', line)
        .attr('fill', color)
        .attr('fill-opacity', 0.3)
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .on('mouseover', function(event) {
          // Show tooltip
          const tooltip = d3.select('body').append('div')
            .attr('class', 'tooltip')
            .style('position', 'absolute')
            .style('padding', '8px')
            .style('background', 'rgba(0,0,0,0.8)')
            .style('color', 'white')
            .style('border-radius', '4px')
            .style('font-size', '12px')
          
          tooltip.html(`
            <strong>${doc.title}</strong><br/>
            Re-Whole Value: ${doc.essenceScores['Re-Whole Value'].toFixed(2)}<br/>
            Nest Caring: ${doc.essenceScores['Nest Caring'].toFixed(2)}<br/>
            Harmonize Agency: ${doc.essenceScores['Harmonize Agency'].toFixed(2)}<br/>
            Confidence: ${doc.confidence.toFixed(2)}
          `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px')
        })
        .on('mouseout', function() {
          d3.selectAll('.tooltip').remove()
        })
    })
    
  }, [documents])
  
  return (
    <div className="essence-radar-container">
      <h3>Essence Alignment Patterns</h3>
      <svg ref={svgRef}></svg>
      <div className="legend">
        <p>Each shape represents a document's essence alignment profile</p>
        <p>Color intensity indicates confidence level</p>
      </div>
    </div>
  )
}

// components/ProvenanceTimeline.tsx
import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface CATReceipt {
  sourceRID: string
  targetRID: string
  transformation: string
  timestamp: Date
  confidence: number
}

export const ProvenanceTimeline: React.FC<{ receipts: CATReceipt[] }> = ({ receipts }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  
  useEffect(() => {
    if (!receipts.length || !svgRef.current) return
    
    const svg = d3.select(svgRef.current)
    const margin = { top: 20, right: 80, bottom: 40, left: 80 }
    const width = 800 - margin.left - margin.right
    const height = 400 - margin.top - margin.bottom
    
    // Clear previous render
    svg.selectAll('*').remove()
    
    const container = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)
    
    // Sort receipts by timestamp
    const sortedReceipts = [...receipts].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    
    // Scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(sortedReceipts, d => d.timestamp) as [Date, Date])
      .range([0, width])
    
    const yScale = d3.scaleBand()
      .domain(sortedReceipts.map((_, i) => i.toString()))
      .range([0, height])
      .padding(0.2)
    
    // Add axes
    container.append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(xScale))
    
    // Draw timeline
    const timeline = container.selectAll('.timeline-item')
      .data(sortedReceipts)
      .enter()
      .append('g')
      .attr('class', 'timeline-item')
    
    // Timeline bars
    timeline.append('rect')
      .attr('x', d => xScale(d.timestamp) - 20)
      .attr('y', (d, i) => yScale(i.toString())!)
      .attr('width', 40)
      .attr('height', yScale.bandwidth())
      .attr('fill', d => d3.interpolateBlues(d.confidence))
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
    
    // Source RID labels
    timeline.append('text')
      .attr('x', -5)
      .attr('y', (d, i) => yScale(i.toString())! + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'central')
      .style('font-size', '10px')
      .text(d => d.sourceRID.substring(0, 12) + '...')
    
    // Target RID labels
    timeline.append('text')
      .attr('x', width + 5)
      .attr('y', (d, i) => yScale(i.toString())! + yScale.bandwidth() / 2)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'central')
      .style('font-size', '10px')
      .text(d => d.targetRID.substring(0, 12) + '...')
    
    // Transformation type labels
    timeline.append('text')
      .attr('x', d => xScale(d.timestamp))
      .attr('y', (d, i) => yScale(i.toString())! + yScale.bandwidth() / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-size', '8px')
      .style('fill', 'white')
      .text(d => d.transformation)
    
    // Add arrows showing transformation flow
    timeline.append('line')
      .attr('x1', -5)
      .attr('y1', (d, i) => yScale(i.toString())! + yScale.bandwidth() / 2)
      .attr('x2', width + 5)
      .attr('y2', (d, i) => yScale(i.toString())! + yScale.bandwidth() / 2)
      .attr('stroke', '#999')
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#arrowhead)')
    
    // Add arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#999')
    
  }, [receipts])
  
  return (
    <div className="provenance-timeline-container">
      <h3>Transformation Provenance Timeline</h3>
      <svg ref={svgRef}></svg>
      <div className="legend">
        <p>Shows the chronological sequence of document transformations</p>
        <p>Bar color intensity indicates transformation confidence</p>
      </div>
    </div>
  )
}
```

**Deliverables**:
- Essence alignment radar visualization
- Provenance timeline component
- Metabolic process flow component
- Interactive tooltips and legends

**Testing Criteria**:
- [ ] Visualizations render correctly with sample data
- [ ] Interactive features (hover, click) work as expected
- [ ] Components handle empty/invalid data gracefully
- [ ] Visual design matches KOI strategy specifications

#### 3.3 Sigma.js Large Graph Explorer
**Objective**: Create performant large-scale graph visualization

**Implementation**:
```typescript
// components/GraphExplorer.tsx
import React, { useEffect, useRef, useState } from 'react'
import { Sigma } from 'sigma'
import { DirectedGraph } from 'graphology'
import { Attributes } from 'graphology-types'

interface GraphNode extends Attributes {
  id: string
  label: string
  x: number
  y: number
  size: number
  color: string
  type: 'document' | 'concept' | 'essence'
}

interface GraphEdge extends Attributes {
  source: string
  target: string
  label: string
  weight: number
  color: string
}

export const GraphExplorer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sigma, setSigma] = useState<Sigma | null>(null)
  const [graph, setGraph] = useState<DirectedGraph | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Initialize Sigma and graph
  useEffect(() => {
    if (!containerRef.current) return
    
    const newGraph = new DirectedGraph()
    const newSigma = new Sigma(newGraph, containerRef.current, {
      renderLabels: true,
      renderEdgeLabels: false,
      enableEdgeHoverEvents: false,
      defaultNodeColor: '#999',
      defaultEdgeColor: '#ccc',
      labelFont: 'Arial',
      labelSize: 12,
      labelWeight: 'normal'
    })
    
    setGraph(newGraph)
    setSigma(newSigma)
    
    // Event listeners
    newSigma.on('clickNode', (event) => {
      const nodeId = event.node
      setSelectedNode(nodeId)
      
      // Highlight node and neighbors
      highlightNeighborhood(newGraph, nodeId)
    })
    
    newSigma.on('clickStage', () => {
      setSelectedNode(null)
      clearHighlights(newGraph)
    })
    
    return () => {
      newSigma.kill()
    }
  }, [])
  
  // Load graph data
  useEffect(() => {
    if (!graph || !sigma) return
    
    const loadGraphData = async () => {
      try {
        const response = await fetch('/api/koi/graph-data/', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        const data = await response.json()
        
        // Clear existing graph
        graph.clear()
        
        // Add nodes
        data.nodes.forEach((node: GraphNode) => {
          graph.addNode(node.id, {
            label: node.label,
            x: node.x,
            y: node.y,
            size: node.size,
            color: node.color,
            type: node.type
          })
        })
        
        // Add edges
        data.edges.forEach((edge: GraphEdge) => {
          if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
            graph.addEdge(edge.source, edge.target, {
              label: edge.label,
              weight: edge.weight,
              color: edge.color
            })
          }
        })
        
        // Refresh sigma
        sigma.refresh()
        
      } catch (error) {
        console.error('Error loading graph data:', error)
      }
    }
    
    loadGraphData()
  }, [graph, sigma])
  
  // Search functionality
  const handleSearch = (term: string) => {
    if (!graph || !sigma) return
    
    setSearchTerm(term)
    
    if (!term.trim()) {
      // Clear search highlights
      graph.forEachNode((node) => {
        graph.setNodeAttribute(node, 'highlighted', false)
      })
    } else {
      // Highlight matching nodes
      graph.forEachNode((node) => {
        const label = graph.getNodeAttribute(node, 'label').toLowerCase()
        const isMatch = label.includes(term.toLowerCase())
        graph.setNodeAttribute(node, 'highlighted', isMatch)
        
        // Increase size of matching nodes
        if (isMatch) {
          graph.setNodeAttribute(node, 'size', 15)
        } else {
          graph.setNodeAttribute(node, 'size', 8)
        }
      })
    }
    
    sigma.refresh()
  }
  
  const highlightNeighborhood = (graph: DirectedGraph, centerNode: string) => {
    // Get neighbors
    const neighbors = new Set(graph.neighbors(centerNode))
    neighbors.add(centerNode)
    
    // Highlight neighbors
    graph.forEachNode((node) => {
      if (neighbors.has(node)) {
        graph.setNodeAttribute(node, 'color', '#ff6b35')
        graph.setNodeAttribute(node, 'size', 15)
      } else {
        graph.setNodeAttribute(node, 'color', '#ccc')
        graph.setNodeAttribute(node, 'size', 5)
      }
    })
    
    // Highlight relevant edges
    graph.forEachEdge((edge) => {
      const source = graph.source(edge)
      const target = graph.target(edge)
      
      if (neighbors.has(source) && neighbors.has(target)) {
        graph.setEdgeAttribute(edge, 'color', '#ff6b35')
        graph.setEdgeAttribute(edge, 'size', 3)
      } else {
        graph.setEdgeAttribute(edge, 'color', '#eee')
        graph.setEdgeAttribute(edge, 'size', 1)
      }
    })
    
    if (sigma) sigma.refresh()
  }
  
  const clearHighlights = (graph: DirectedGraph) => {
    graph.forEachNode((node) => {
      const nodeType = graph.getNodeAttribute(node, 'type')
      graph.setNodeAttribute(node, 'color', getNodeColor(nodeType))
      graph.setNodeAttribute(node, 'size', 8)
    })
    
    graph.forEachEdge((edge) => {
      graph.setEdgeAttribute(edge, 'color', '#ccc')
      graph.setEdgeAttribute(edge, 'size', 1)
    })
    
    if (sigma) sigma.refresh()
  }
  
  const getNodeColor = (type: string): string => {
    switch (type) {
      case 'document': return '#4285f4'
      case 'concept': return '#34a853'  
      case 'essence': return '#ea4335'
      default: return '#999'
    }
  }
  
  return (
    <div className="graph-explorer-container">
      <div className="graph-controls">
        <h3>Knowledge Graph Explorer</h3>
        
        <div className="search-controls">
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>
        
        {selectedNode && (
          <div className="node-info">
            <h4>Selected Node</h4>
            <p>ID: {selectedNode}</p>
            <p>Label: {graph?.getNodeAttribute(selectedNode, 'label')}</p>
            <p>Type: {graph?.getNodeAttribute(selectedNode, 'type')}</p>
            <p>Neighbors: {graph?.neighbors(selectedNode).length}</p>
          </div>
        )}
        
        <div className="legend">
          <h4>Node Types</h4>
          <div className="legend-item">
            <span className="legend-color" style={{backgroundColor: '#4285f4'}}></span>
            Document
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{backgroundColor: '#34a853'}}></span>
            Concept
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{backgroundColor: '#ea4335'}}></span>
            Essence
          </div>
        </div>
      </div>
      
      <div 
        ref={containerRef} 
        className="graph-container"
        style={{ width: '100%', height: '600px' }}
      />
    </div>
  )
}
```

**Deliverables**:
- Sigma.js graph renderer with WebGL support
- Interactive node selection and neighborhood highlighting
- Search and filtering capabilities
- Performance optimization for 1,000+ nodes

**Testing Criteria**:
- [ ] Graph renders smoothly with 1,000+ nodes
- [ ] Interactive features (pan, zoom, click) work at 60fps
- [ ] Search functionality highlights correct nodes
- [ ] Node selection shows proper neighborhood highlighting

### Phase 4: Advanced Features & Integration (Week 5)

#### 4.1 WebSocket Real-time Updates
**Objective**: Implement real-time updates for graph changes

**Implementation**:
```python
# django_admin/koi_visualization/consumers.py
from channels.generic.websocket import AsyncWebsocketConsumer
import json
from .services.sparql_service import SPARQLService

class KOIGraphConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("koi_updates", self.channel_name)
        await self.accept()
        
        # Send initial connection message
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': 'Connected to KOI graph updates'
        }))
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("koi_updates", self.channel_name)
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages"""
        data = json.loads(text_data)
        message_type = data.get('type')
        
        if message_type == 'subscribe_to_node':
            node_id = data.get('node_id')
            await self.channel_layer.group_add(f"node_{node_id}", self.channel_name)
            
        elif message_type == 'unsubscribe_from_node':
            node_id = data.get('node_id')
            await self.channel_layer.group_discard(f"node_{node_id}", self.channel_name)
            
        elif message_type == 'request_graph_update':
            # Send current graph statistics
            sparql_service = SPARQLService()
            stats = await sparql_service.get_graph_statistics()
            
            await self.send(text_data=json.dumps({
                'type': 'graph_statistics',
                'data': stats
            }))
    
    async def graph_update(self, event):
        """Send graph update to WebSocket client"""
        await self.send(text_data=json.dumps({
            'type': 'graph_update',
            'data': event['data']
        }))
    
    async def node_update(self, event):
        """Send specific node update to WebSocket client"""
        await self.send(text_data=json.dumps({
            'type': 'node_update',
            'node_id': event['node_id'],
            'data': event['data']
        }))

# WebSocket routing
# django_admin/koi_visualization/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/koi/$', consumers.KOIGraphConsumer.as_asgi()),
]
```

```typescript
// hooks/useKOIWebSocket.ts
import { useEffect, useState, useCallback } from 'react'

interface WebSocketMessage {
  type: string
  data?: any
  node_id?: string
  message?: string
}

export const useKOIWebSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/koi/`
    
    const ws = new WebSocket(wsUrl)
    
    ws.onopen = () => {
      console.log('WebSocket connected')
      setIsConnected(true)
      setSocket(ws)
    }
    
    ws.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data)
      setLastMessage(message)
      
      // Handle different message types
      switch (message.type) {
        case 'connection_established':
          console.log('KOI WebSocket connection established')
          break
          
        case 'graph_update':
          // Trigger graph refresh
          break
          
        case 'node_update':
          // Update specific node
          break
          
        case 'graph_statistics':
          // Update statistics display
          break
      }
    }
    
    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
      setSocket(null)
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setIsConnected(false)
    }
    
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [])
  
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
    }
  }, [socket])
  
  const subscribeToNode = useCallback((nodeId: string) => {
    sendMessage({
      type: 'subscribe_to_node',
      node_id: nodeId
    })
  }, [sendMessage])
  
  const unsubscribeFromNode = useCallback((nodeId: string) => {
    sendMessage({
      type: 'unsubscribe_from_node', 
      node_id: nodeId
    })
  }, [sendMessage])
  
  const requestGraphUpdate = useCallback(() => {
    sendMessage({
      type: 'request_graph_update'
    })
  }, [sendMessage])
  
  return {
    socket,
    isConnected,
    lastMessage,
    sendMessage,
    subscribeToNode,
    unsubscribeFromNode,
    requestGraphUpdate
  }
}
```

**Deliverables**:
- WebSocket consumer for real-time updates
- React hook for WebSocket management
- Real-time graph statistics
- Node subscription system

**Testing Criteria**:
- [ ] WebSocket connects successfully
- [ ] Real-time messages received and processed
- [ ] Node subscriptions work correctly
- [ ] Connection resilience (reconnect on failure)

#### 4.2 Agent Integration & Chat Interface
**Objective**: Connect KOI visualization with existing GAIA agents

**Implementation**:
```typescript
// components/ChatQueryInterface.tsx
import React, { useState, useRef, useEffect } from 'react'
import { useKOIWebSocket } from '../hooks/useKOIWebSocket'

interface ChatMessage {
  id: string
  type: 'user' | 'agent' | 'system'
  content: string
  timestamp: Date
  agentId?: string
  queryResult?: any
}

export const ChatQueryInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<string>('regenai')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { isConnected, sendMessage } = useKOIWebSocket()
  
  const agents = [
    { id: 'regenai', name: 'RegenAI', color: '#4285f4' },
    { id: 'governor', name: 'Governor', color: '#34a853' },
    { id: 'voiceofnature', name: 'Voice of Nature', color: '#ea4335' },
    { id: 'narrative', name: 'Narrative', color: '#fbbc04' },
    { id: 'advocate', name: 'Advocate', color: '#9c27b0' }
  ]
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: currentMessage,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setCurrentMessage('')
    setIsLoading(true)
    
    try {
      // Send to both natural language query API and agent chat
      const [nlResponse, agentResponse] = await Promise.all([
        // Natural language to SPARQL
        fetch('/api/koi/nl-query/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: currentMessage })
        }),
        
        // Agent chat (using existing GAIA WebSocket or HTTP API)
        fetch(`/api/agents/${selectedAgent}/chat/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: currentMessage,
            context: 'koi_visualization'
          })
        })
      ])
      
      // Process SPARQL results
      if (nlResponse.ok) {
        const nlData = await nlResponse.json()
        
        const systemMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: 'system',
          content: `Found ${nlData.execution_result?.results?.bindings?.length || 0} results`,
          timestamp: new Date(),
          queryResult: nlData
        }
        
        setMessages(prev => [...prev, systemMessage])
      }
      
      // Process agent response
      if (agentResponse.ok) {
        const agentData = await agentResponse.json()
        
        const agentMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          type: 'agent',
          content: agentData.response,
          timestamp: new Date(),
          agentId: selectedAgent
        }
        
        setMessages(prev => [...prev, agentMessage])
      }
      
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 3).toString(),
        type: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }
  
  const getAgentInfo = (agentId: string) => {
    return agents.find(a => a.id === agentId) || agents[0]
  }
  
  return (
    <div className="chat-query-interface">
      <div className="chat-header">
        <h3>Knowledge Graph Chat</h3>
        <div className="agent-selector">
          <label>Agent: </label>
          <select 
            value={selectedAgent} 
            onChange={(e) => setSelectedAgent(e.target.value)}
          >
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <div className="connection-status">
          <span className={isConnected ? 'connected' : 'disconnected'}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
      </div>
      
      <div className="messages-container">
        {messages.map(message => (
          <div key={message.id} className={`message message-${message.type}`}>
            <div className="message-header">
              {message.type === 'agent' && message.agentId && (
                <span 
                  className="agent-badge"
                  style={{ color: getAgentInfo(message.agentId).color }}
                >
                  {getAgentInfo(message.agentId).name}
                </span>
              )}
              <span className="timestamp">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">
              {message.content}
            </div>
            
            {/* Show SPARQL results if available */}
            {message.queryResult && (
              <div className="query-result">
                <details>
                  <summary>SPARQL Query & Results</summary>
                  <div className="sparql-query">
                    <strong>Generated SPARQL:</strong>
                    <pre>{message.queryResult.generated_sparql}</pre>
                  </div>
                  <div className="sparql-results">
                    <strong>Results:</strong>
                    <pre>{JSON.stringify(message.queryResult.execution_result, null, 2)}</pre>
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="message message-system">
            <div className="loading">Processing...</div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="input-container">
        <textarea
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about the knowledge graph or chat with an agent..."
          rows={3}
          disabled={isLoading}
        />
        <button 
          onClick={handleSendMessage}
          disabled={isLoading || !currentMessage.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

**Deliverables**:
- Chat interface integrated with existing GAIA agents
- Unified query results from both SPARQL and agent responses
- Agent selection and context management
- Chat history and session management

**Testing Criteria**:
- [ ] Chat interface communicates with existing agents
- [ ] SPARQL results display correctly in chat
- [ ] Agent responses integrate knowledge graph context
- [ ] Message history persists during session

#### 4.3 Export & Sharing Features
**Objective**: Enable users to export and share visualizations and results

**Implementation**:
```typescript
// components/ExportInterface.tsx
import React, { useState } from 'react'
import * as d3 from 'd3'

interface ExportOptions {
  format: 'svg' | 'png' | 'json' | 'csv' | 'sparql' | 'url'
  includeData: boolean
  includeVisualization: boolean
  compressionLevel: number
}

export const ExportInterface: React.FC<{
  currentQuery?: string
  queryResults?: any
  visualizationRef?: React.RefObject<SVGSVGElement>
}> = ({ currentQuery, queryResults, visualizationRef }) => {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'svg',
    includeData: true,
    includeVisualization: true,
    compressionLevel: 1
  })
  const [isExporting, setIsExporting] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  
  const handleExport = async () => {
    setIsExporting(true)
    
    try {
      switch (exportOptions.format) {
        case 'svg':
          await exportSVG()
          break
        case 'png':
          await exportPNG()
          break
        case 'json':
          await exportJSON()
          break
        case 'csv':
          await exportCSV()
          break
        case 'sparql':
          await exportSPARQL()
          break
        case 'url':
          await createShareURL()
          break
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsExporting(false)
    }
  }
  
  const exportSVG = async () => {
    if (!visualizationRef?.current) {
      throw new Error('No visualization available to export')
    }
    
    const svgElement = visualizationRef.current
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgElement)
    
    // Add CSS styles inline
    const styledSvg = addInlineStyles(svgString)
    
    downloadFile(styledSvg, 'koi-visualization.svg', 'image/svg+xml')
  }
  
  const exportPNG = async () => {
    if (!visualizationRef?.current) {
      throw new Error('No visualization available to export')
    }
    
    const svgElement = visualizationRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    const svgData = new XMLSerializer().serializeToString(svgElement)
    const img = new Image()
    
    return new Promise<void>((resolve, reject) => {
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        
        canvas.toBlob((blob) => {
          if (blob) {
            downloadBlob(blob, 'koi-visualization.png')
            resolve()
          } else {
            reject(new Error('Failed to create PNG blob'))
          }
        }, 'image/png')
      }
      
      img.onerror = () => reject(new Error('Failed to load SVG for PNG conversion'))
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
    })
  }
  
  const exportJSON = async () => {
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportFormat: 'KOI Knowledge Graph JSON',
        version: '1.0'
      },
      query: exportOptions.includeData ? currentQuery : null,
      results: exportOptions.includeData ? queryResults : null,
      visualization: exportOptions.includeVisualization ? getVisualizationConfig() : null
    }
    
    const jsonString = JSON.stringify(exportData, null, 2)
    downloadFile(jsonString, 'koi-export.json', 'application/json')
  }
  
  const exportCSV = async () => {
    if (!queryResults?.execution_result?.results?.bindings) {
      throw new Error('No query results available to export as CSV')
    }
    
    const bindings = queryResults.execution_result.results.bindings
    
    if (bindings.length === 0) {
      throw new Error('No data to export')
    }
    
    // Get column headers
    const headers = Object.keys(bindings[0])
    
    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...bindings.map((binding: any) => 
        headers.map(header => {
          const value = binding[header]?.value || ''
          // Escape quotes and wrap in quotes if contains comma
          return value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value
        }).join(',')
      )
    ].join('\n')
    
    downloadFile(csvContent, 'koi-query-results.csv', 'text/csv')
  }
  
  const exportSPARQL = async () => {
    if (!currentQuery) {
      throw new Error('No SPARQL query available to export')
    }
    
    const sparqlContent = `# KOI Knowledge Graph SPARQL Query
# Generated on: ${new Date().toISOString()}

${currentQuery}
`
    
    downloadFile(sparqlContent, 'koi-query.sparql', 'application/sparql-query')
  }
  
  const createShareURL = async () => {
    try {
      // Create shareable state
      const shareState = {
        query: currentQuery,
        timestamp: Date.now(),
        version: '1.0'
      }
      
      // Encode state
      const encodedState = btoa(JSON.stringify(shareState))
      
      // Create URL
      const baseUrl = window.location.origin + window.location.pathname
      const fullUrl = `${baseUrl}?shared=${encodedState}`
      
      setShareUrl(fullUrl)
      
      // Copy to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(fullUrl)
        alert('Share URL copied to clipboard!')
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = fullUrl
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        alert('Share URL copied to clipboard!')
      }
      
    } catch (error) {
      console.error('Failed to create share URL:', error)
      throw new Error('Failed to create shareable URL')
    }
  }
  
  const addInlineStyles = (svgString: string): string => {
    // Add common CSS styles inline to SVG for standalone viewing
    const styles = `
      <style>
        <![CDATA[
          .node { stroke: #333; stroke-width: 1px; }
          .edge { stroke: #999; stroke-width: 1px; fill: none; }
          .essence-radar { fill: rgba(66, 133, 244, 0.3); stroke: #4285f4; }
          text { font-family: Arial, sans-serif; font-size: 12px; }
          .axis { stroke: #999; }
          .grid { stroke: #ccc; stroke-width: 0.5px; }
        ]]>
      </style>
    `
    
    return svgString.replace('<svg', `<svg${styles.includes('<style>') ? styles : ''} `)
  }
  
  const getVisualizationConfig = () => {
    // Return current visualization configuration for JSON export
    return {
      type: 'koi_knowledge_graph',
      components: ['essence_radar', 'provenance_timeline', 'graph_explorer'],
      settings: exportOptions
    }
  }
  
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    downloadBlob(blob, filename)
  }
  
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  return (
    <div className="export-interface">
      <h3>Export & Share</h3>
      
      <div className="export-options">
        <div className="format-selection">
          <label>Export Format:</label>
          <select 
            value={exportOptions.format}
            onChange={(e) => setExportOptions(prev => ({
              ...prev,
              format: e.target.value as ExportOptions['format']
            }))}
          >
            <option value="svg">SVG (Vector Graphics)</option>
            <option value="png">PNG (Image)</option>
            <option value="json">JSON (Data + Config)</option>
            <option value="csv">CSV (Query Results)</option>
            <option value="sparql">SPARQL (Query Only)</option>
            <option value="url">Shareable URL</option>
          </select>
        </div>
        
        <div className="include-options">
          <label>
            <input
              type="checkbox"
              checked={exportOptions.includeData}
              onChange={(e) => setExportOptions(prev => ({
                ...prev,
                includeData: e.target.checked
              }))}
            />
            Include query data
          </label>
          
          <label>
            <input
              type="checkbox"
              checked={exportOptions.includeVisualization}
              onChange={(e) => setExportOptions(prev => ({
                ...prev,
                includeVisualization: e.target.checked
              }))}
            />
            Include visualization
          </label>
        </div>
      </div>
      
      <button 
        onClick={handleExport}
        disabled={isExporting}
        className="export-button"
      >
        {isExporting ? 'Exporting...' : `Export as ${exportOptions.format.toUpperCase()}`}
      </button>
      
      {shareUrl && (
        <div className="share-url-result">
          <label>Shareable URL:</label>
          <input 
            type="text" 
            value={shareUrl}
            readOnly
            className="share-url-input"
          />
          <button onClick={() => setShareUrl('')}>Clear</button>
        </div>
      )}
    </div>
  )
}
```

**Deliverables**:
- Multi-format export functionality (SVG, PNG, JSON, CSV, SPARQL)
- Shareable URL generation with state encoding
- Clipboard integration for easy sharing
- Export options and customization

**Testing Criteria**:
- [ ] All export formats produce valid output files
- [ ] Shareable URLs restore correct visualization state
- [ ] Clipboard operations work across browsers
- [ ] Export options affect output correctly

### Phase 5: Testing, Optimization & Deployment (Week 6)

#### 5.1 Comprehensive Testing Strategy
**Objective**: Ensure system reliability and performance

**Testing Implementation**:
```python
# tests/test_sparql_service.py
import pytest
from django.test import TestCase
from unittest.mock import Mock, patch
from koi_visualization.services.sparql_service import SPARQLService
from koi_visualization.services.nl_sparql_service import NLToSPARQLService

class TestSPARQLService(TestCase):
    def setUp(self):
        self.service = SPARQLService()
        
    @patch('koi_visualization.services.sparql_service.SPARQLWrapper')
    def test_execute_query_success(self, mock_sparql_wrapper):
        # Mock successful SPARQL execution
        mock_instance = Mock()
        mock_sparql_wrapper.return_value = mock_instance
        mock_instance.query.return_value.convert.return_value = {
            'results': {'bindings': [{'doc': {'value': 'test'}}]}
        }
        
        result = self.service.execute_query("SELECT * WHERE { ?s ?p ?o }")
        
        self.assertTrue(result['success'])
        self.assertIn('results', result)
        self.assertIn('execution_time', result)
    
    def test_essence_alignments_query_format(self):
        # Test that essence alignment queries return correct format
        with patch.object(self.service, 'execute_query') as mock_execute:
            mock_execute.return_value = {
                'success': True,
                'results': {
                    'results': {
                        'bindings': [
                            {
                                'doc': {'value': 'doc1'},
                                'essence': {'value': 'Re-Whole Value'},
                                'confidence': {'value': '0.8'}
                            }
                        ]
                    }
                }
            }
            
            result = self.service.get_essence_alignments()
            self.assertTrue(result['success'])
            self.assertEqual(len(result['results']['results']['bindings']), 1)

class TestNLToSPARQLService(TestCase):
    def setUp(self):
        self.service = NLToSPARQLService()
    
    @patch('koi_visualization.services.nl_sparql_service.OpenAI')
    def test_generate_sparql_success(self, mock_openai):
        # Mock OpenAI response
        mock_client = Mock()
        mock_openai.return_value = mock_client
        mock_response = Mock()
        mock_response.choices[0].message.content = "SELECT * WHERE { ?s ?p ?o }"
        mock_client.chat.completions.create.return_value = mock_response
        
        result = self.service.generate_sparql("Show me all documents")
        
        self.assertTrue(result['success'])
        self.assertIn('sparql_query', result)
        self.assertIn('is_valid', result)
    
    def test_validate_sparql_syntax(self):
        # Test SPARQL validation
        valid_query = "SELECT * WHERE { ?s ?p ?o }"
        invalid_query = "INVALID SPARQL SYNTAX"
        
        self.assertTrue(self.service._validate_sparql(valid_query))
        self.assertFalse(self.service._validate_sparql(invalid_query))

# tests/test_api_endpoints.py
from rest_framework.test import APITestCase
from django.urls import reverse
import json

class TestKOIAPI(APITestCase):
    def test_natural_language_query_endpoint(self):
        """Test natural language query API endpoint"""
        url = reverse('koi:nl-query')
        data = {'question': 'Show me documents about regenerative agriculture'}
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('original_question', response.data)
        self.assertIn('generated_sparql', response.data)
        self.assertIn('execution_result', response.data)
    
    def test_execute_sparql_endpoint(self):
        """Test direct SPARQL execution endpoint"""
        url = reverse('koi:execute-sparql')
        data = {'query': 'SELECT * WHERE { ?s ?p ?o } LIMIT 10'}
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('query', response.data)
        self.assertIn('result', response.data)
    
    def test_get_graph_data_endpoint(self):
        """Test graph data retrieval endpoint"""
        url = reverse('koi:graph-data')
        
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('nodes', response.data)
        self.assertIn('edges', response.data)
        self.assertIn('metadata', response.data)

# Performance testing
class TestPerformance(TestCase):
    def test_large_query_performance(self):
        """Test performance with large dataset queries"""
        service = SPARQLService()
        
        # Query for all documents (potentially large result set)
        large_query = """
        SELECT ?doc ?title ?content WHERE {
            ?doc rdf:type regen:Document .
            ?doc regen:title ?title .
            ?doc regen:content ?content .
        }
        """
        
        import time
        start_time = time.time()
        result = service.execute_query(large_query)
        execution_time = time.time() - start_time
        
        # Performance target: <2 seconds for large queries
        self.assertLess(execution_time, 2.0)
        self.assertTrue(result['success'])

# Integration testing
class TestIntegration(TestCase):
    def test_full_nl_to_visualization_pipeline(self):
        """Test complete pipeline from natural language to visualization data"""
        nl_service = NLToSPARQLService()
        sparql_service = SPARQLService()
        
        # Generate SPARQL from natural language
        nl_result = nl_service.generate_sparql("Show me essence alignments")
        self.assertTrue(nl_result['success'])
        
        # Execute generated SPARQL
        sparql_result = sparql_service.execute_query(nl_result['sparql_query'])
        self.assertTrue(sparql_result['success'])
        
        # Verify visualization data format
        viz_data = format_for_visualization(sparql_result)
        self.assertIn('nodes', viz_data)
        self.assertIn('edges', viz_data)
```

```typescript
// Frontend testing with Jest and React Testing Library
// tests/components/QueryInterface.test.tsx
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryInterface } from '../components/QueryInterface'
import { useSPARQLQuery } from '../hooks/useSPARQLQuery'

// Mock the custom hook
jest.mock('../hooks/useSPARQLQuery')

describe('QueryInterface', () => {
  const mockUseSPARQLQuery = useSPARQLQuery as jest.MockedFunction<typeof useSPARQLQuery>
  
  beforeEach(() => {
    mockUseSPARQLQuery.mockReturnValue({
      executeNaturalQuery: jest.fn(),
      executeSparqlQuery: jest.fn(),
      loading: false,
      error: null
    })
  })
  
  test('renders natural language input', () => {
    render(<QueryInterface />)
    
    expect(screen.getByPlaceholderText(/ask about the knowledge graph/i)).toBeInTheDocument()
    expect(screen.getByText(/query knowledge graph/i)).toBeInTheDocument()
  })
  
  test('handles natural language query submission', async () => {
    const mockExecuteNaturalQuery = jest.fn().mockResolvedValue({
      generatedSparql: 'SELECT * WHERE { ?s ?p ?o }',
      executionResult: { success: true }
    })
    
    mockUseSPARQLQuery.mockReturnValue({
      executeNaturalQuery: mockExecuteNaturalQuery,
      executeSparqlQuery: jest.fn(),
      loading: false,
      error: null
    })
    
    render(<QueryInterface />)
    
    const input = screen.getByPlaceholderText(/ask about the knowledge graph/i)
    const button = screen.getByText(/query knowledge graph/i)
    
    fireEvent.change(input, { target: { value: 'Show me all documents' } })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(mockExecuteNaturalQuery).toHaveBeenCalledWith('Show me all documents')
    })
  })
  
  test('displays SPARQL editor when checkbox is checked', () => {
    render(<QueryInterface />)
    
    const checkbox = screen.getByRole('checkbox', { name: /show sparql editor/i })
    fireEvent.click(checkbox)
    
    expect(screen.getByPlaceholderText(/enter sparql query/i)).toBeInTheDocument()
  })
  
  test('shows error message when query fails', async () => {
    mockUseSPARQLQuery.mockReturnValue({
      executeNaturalQuery: jest.fn(),
      executeSparqlQuery: jest.fn(),
      loading: false,
      error: 'SPARQL execution failed'
    })
    
    render(<QueryInterface />)
    
    expect(screen.getByText(/error: sparql execution failed/i)).toBeInTheDocument()
  })
})

// Performance testing for visualizations
// tests/components/GraphExplorer.performance.test.tsx
describe('GraphExplorer Performance', () => {
  test('handles large dataset without performance issues', async () => {
    // Create mock data with 1000+ nodes
    const mockNodes = Array.from({ length: 1000 }, (_, i) => ({
      id: `node-${i}`,
      label: `Node ${i}`,
      x: Math.random() * 800,
      y: Math.random() * 600,
      size: 8,
      color: '#4285f4',
      type: 'document'
    }))
    
    const mockEdges = Array.from({ length: 2000 }, (_, i) => ({
      source: `node-${Math.floor(Math.random() * 1000)}`,
      target: `node-${Math.floor(Math.random() * 1000)}`,
      label: `Edge ${i}`,
      weight: 1,
      color: '#ccc'
    }))
    
    // Mock API response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: mockNodes,
        edges: mockEdges
      })
    })
    
    const startTime = performance.now()
    render(<GraphExplorer />)
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByText(/knowledge graph explorer/i)).toBeInTheDocument()
    })
    
    const endTime = performance.now()
    const renderTime = endTime - startTime
    
    // Performance target: <5 seconds for 1000+ nodes
    expect(renderTime).toBeLessThan(5000)
  })
})
```

**Deliverables**:
- Complete test suite for backend services
- Frontend component and integration tests
- Performance benchmarking tests
- Automated testing pipeline

**Testing Criteria**:
- [ ] All unit tests pass with >90% coverage
- [ ] Integration tests verify end-to-end functionality
- [ ] Performance tests confirm <2s query response, <5s visualization rendering
- [ ] Error handling tests cover failure scenarios

#### 5.2 Performance Optimization
**Objective**: Optimize system for production performance targets

**Optimization Implementation**:
```python
# Optimized SPARQL service with caching and connection pooling
from django.core.cache import cache
from concurrent.futures import ThreadPoolExecutor
import hashlib

class OptimizedSPARQLService(SPARQLService):
    def __init__(self):
        super().__init__()
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.connection_pool = self._create_connection_pool()
    
    def execute_query_async(self, query: str, use_cache: bool = True):
        """Execute SPARQL query asynchronously"""
        return self.executor.submit(self.execute_query, query, use_cache)
    
    def execute_batch_queries(self, queries: List[str]) -> List[Dict]:
        """Execute multiple queries in parallel"""
        futures = [self.execute_query_async(query) for query in queries]
        return [future.result() for future in futures]
    
    def get_cached_or_execute(self, query: str, cache_ttl: int = 3600) -> Dict:
        """Get result from cache or execute query"""
        cache_key = f"sparql_query_{hashlib.md5(query.encode()).hexdigest()}"
        
        # Try cache first
        cached_result = cache.get(cache_key)
        if cached_result:
            return {
                'success': True,
                'results': cached_result,
                'from_cache': True,
                'query': query
            }
        
        # Execute query
        result = self.execute_query(query, use_cache=False)
        
        # Cache successful results
        if result['success']:
            cache.set(cache_key, result['results'], cache_ttl)
        
        return result

# Database query optimization
class OptimizedQueryHistory(QueryHistory):
    class Meta:
        indexes = [
            models.Index(fields=['created_at']),
            models.Index(fields=['execution_time']),
            models.Index(fields=['result_count']),
        ]
    
    @classmethod
    def get_popular_queries(cls, limit: int = 10) -> List['QueryHistory']:
        """Get most frequently executed queries for optimization"""
        return cls.objects.values('user_query', 'generated_sparql').annotate(
            count=models.Count('id'),
            avg_time=models.Avg('execution_time')
        ).order_by('-count')[:limit]

# Frontend performance optimizations
# hooks/useOptimizedGraphData.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { debounce } from 'lodash'

export const useOptimizedGraphData = () => {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [visibleNodes, setVisibleNodes] = useState<Set<string>>(new Set())
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  
  // Debounce viewport changes to avoid excessive API calls
  const debouncedViewportChange = useMemo(
    () => debounce((viewport: Viewport) => {
      updateVisibleNodes(viewport)
    }, 100),
    []
  )
  
  // Level-of-detail rendering based on zoom level
  const getNodeDetail = useCallback((zoom: number) => {
    if (zoom > 2) return 'high'
    if (zoom > 1) return 'medium'
    return 'low'
  }, [])
  
  // Virtual rendering - only render visible nodes
  const getVisibleNodeData = useCallback(() => {
    if (!graphData) return { nodes: [], edges: [] }
    
    const nodes = graphData.nodes.filter(node => visibleNodes.has(node.id))
    const edges = graphData.edges.filter(edge => 
      visibleNodes.has(edge.source) && visibleNodes.has(edge.target)
    )
    
    return { nodes, edges }
  }, [graphData, visibleNodes])
  
  // Optimize node rendering based on zoom level
  const optimizeForZoom = useCallback((zoom: number) => {
    const detail = getNodeDetail(zoom)
    
    // Adjust rendering complexity based on zoom
    if (detail === 'low') {
      // Hide labels, simplify rendering
      return {
        showLabels: false,
        simplifiedNodes: true,
        maxNodes: 500
      }
    } else if (detail === 'medium') {
      return {
        showLabels: true,
        simplifiedNodes: false,
        maxNodes: 1000
      }
    } else {
      return {
        showLabels: true,
        simplifiedNodes: false,
        maxNodes: 2000
      }
    }
  }, [getNodeDetail])
  
  return {
    graphData: getVisibleNodeData(),
    viewport,
    setViewport: debouncedViewportChange,
    optimizeForZoom
  }
}
```

**Deliverables**:
- Query result caching with Redis integration
- Connection pooling for SPARQL endpoints
- Frontend virtualization for large datasets
- Level-of-detail rendering based on zoom

**Testing Criteria**:
- [ ] Cache hit rates >70% for common queries
- [ ] Rendering performance >60fps for pan/zoom operations
- [ ] Memory usage stable with large datasets
- [ ] Query response times consistently <2s

#### 5.3 Deployment Configuration
**Objective**: Prepare system for production deployment

**Deployment Implementation**:
```yaml
# docker-compose.production.yml additions
services:
  fuseki:
    image: stain/jena-fuseki
    container_name: gaia-fuseki
    ports:
      - "3030:3030"
    volumes:
      - fuseki_data:/fuseki
      - ./koi-data:/staging
    environment:
      - ADMIN_PASSWORD=${FUSEKI_ADMIN_PASSWORD}
      - JVM_ARGS=-Xmx4g -Xms2g
    restart: unless-stopped
    networks:
      - gaia-network
    
  redis:
    image: redis:7-alpine
    container_name: gaia-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 1gb --maxmemory-policy allkeys-lru
    restart: unless-stopped
    networks:
      - gaia-network

volumes:
  fuseki_data:
  redis_data:
```

```python
# django_admin/settings/production.py
# KOI-specific production settings
KOI_SPARQL_ENDPOINT = 'http://fuseki:3030/koi/sparql'
KOI_REDIS_URL = 'redis://redis:6379/2'  # Use DB 2 for KOI caching

# Cache configuration
CACHES['koi'] = {
    'BACKEND': 'django_redis.cache.RedisCache',
    'LOCATION': KOI_REDIS_URL,
    'OPTIONS': {
        'CLIENT_CLASS': 'django_redis.client.DefaultClient',
    },
    'KEY_PREFIX': 'koi',
    'TIMEOUT': 3600,  # 1 hour default
}

# Performance settings
KOI_MAX_QUERY_TIME = 10  # seconds
KOI_MAX_RESULTS = 10000
KOI_CACHE_DEFAULT_TTL = 3600
KOI_ENABLE_QUERY_LOGGING = True

# Security settings
KOI_ALLOWED_SPARQL_PREFIXES = [
    'PREFIX regen: <http://regen.network/ontology#>',
    'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>',
    'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
    'PREFIX owl: <http://www.w3.org/2002/07/owl#>'
]
```

```bash
#!/bin/bash
# scripts/deploy-koi.sh
set -e

echo "🚀 Deploying KOI Visualization System"

# Build and start services
echo "📦 Building Docker services..."
docker-compose -f docker-compose.yml -f docker-compose.production.yml build fuseki redis

echo "🏃 Starting services..."
docker-compose up -d fuseki redis

# Wait for services to be ready
echo "⏳ Waiting for Fuseki to be ready..."
until curl -f http://localhost:3030/$/ping; do
    sleep 2
done

echo "⏳ Waiting for Redis to be ready..."
until docker exec gaia-redis redis-cli ping; do
    sleep 2
done

# Load RDF data
echo "📚 Loading RDF data into Fuseki..."
if [ -f "./koi-data/koi-graph.ttl" ]; then
    docker exec gaia-fuseki tdbloader --graph=default /staging/koi-graph.ttl
    echo "✅ RDF data loaded successfully"
else
    echo "⚠️  Warning: No RDF data file found at ./koi-data/koi-graph.ttl"
fi

# Run Django migrations
echo "🗃️  Running Django migrations..."
python django_admin/manage.py migrate

# Install frontend dependencies and build
echo "🏗️  Building frontend..."
cd packages/app
bun install
bun run build
cd ../..

# Update Nginx configuration
echo "🔧 Updating Nginx configuration..."
docker-compose up -d nginx --no-deps

# Health checks
echo "🏥 Running health checks..."

# Check Fuseki
if curl -f http://localhost:3030/$/ping > /dev/null 2>&1; then
    echo "✅ Fuseki is healthy"
else
    echo "❌ Fuseki health check failed"
    exit 1
fi

# Check Redis
if docker exec gaia-redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is healthy"
else
    echo "❌ Redis health check failed"
    exit 1
fi

# Check KOI API
if curl -f http://localhost:8000/api/koi/health/ > /dev/null 2>&1; then
    echo "✅ KOI API is healthy"
else
    echo "❌ KOI API health check failed"
    exit 1
fi

echo "🎉 KOI Visualization System deployed successfully!"
echo "📊 Access the visualization at: https://regen.gaiaai.xyz/koi"
echo "🔍 SPARQL endpoint available at: http://localhost:3030/koi/sparql"
```

**Deliverables**:
- Production Docker configuration
- Deployment scripts with health checks
- Environment-specific settings
- Monitoring and logging configuration

**Testing Criteria**:
- [ ] Deployment script completes without errors
- [ ] All services start and pass health checks
- [ ] Frontend builds and serves correctly
- [ ] Production environment loads test queries successfully

## Testing Criteria Summary

### Unit Testing Requirements
- **Backend**: >90% code coverage for services and API endpoints
- **Frontend**: >85% coverage for React components and hooks
- **Integration**: Full pipeline testing from NL query to visualization

### Performance Requirements
- **Query Response**: <2 seconds for common SPARQL patterns
- **Visualization Rendering**: <5 seconds for 1,000+ node graphs
- **Interactive Performance**: 60fps for pan/zoom/hover operations
- **Cache Performance**: >70% hit rate for frequent queries

### Functional Testing Requirements
- **Natural Language Processing**: Accurate SPARQL generation for common queries
- **Visualization Accuracy**: Correct rendering of essence alignments, provenance, metabolic processes
- **Export Functionality**: All formats produce valid, readable output
- **Real-time Updates**: WebSocket messages received and processed correctly

### Security Testing Requirements
- **Input Validation**: SPARQL injection prevention
- **Authentication**: Proper integration with GAIA auth system
- **Data Access**: Appropriate authorization for knowledge graph data

### Compatibility Testing Requirements
- **Browser Support**: Chrome, Firefox, Safari, Edge (latest 2 versions)
- **Mobile Responsiveness**: Functional on tablet devices (iPad, Android tablets)
- **API Compatibility**: RESTful API follows OpenAPI 3.0 specification

## Documentation Requirements

### Technical Documentation
- **API Reference**: Complete OpenAPI specification with examples
- **Component Library**: Storybook documentation for React components
- **Database Schema**: ERD and migration documentation
- **Deployment Guide**: Step-by-step production deployment instructions

### User Documentation
- **User Guide**: How to use natural language querying and visualization features
- **Query Examples**: Sample queries and expected results
- **Export Guide**: How to export and share visualizations
- **Troubleshooting**: Common issues and solutions

### Developer Documentation
- **Architecture Overview**: System design and component relationships  
- **Contributing Guide**: How to extend and modify the system
- **Plugin Development**: How to add new visualization components
- **Performance Guide**: Optimization strategies and monitoring

This comprehensive implementation specification provides a complete roadmap for creating the KOI Knowledge Graph Visualization system within the GAIA repository, leveraging existing infrastructure while adding sophisticated new capabilities for knowledge graph exploration and natural language querying.