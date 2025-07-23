import { RAGEngine } from "./rag-engine"
import { KnowledgeGraphExtractor } from "./knowledge-graph-extractor"
import {
  type KnowledgeGraphDatabase,
  createKnowledgeGraphDatabase,
  NodeType,
  RelationshipType,
} from "./knowledge-graph-database"
import { VectorDatabaseClient } from "./vector-database-client"
import { AIClient } from "./ai-client"
import type {
  KnowledgeGraphConfig,
  KnowledgeGraphNode,
  KnowledgeGraphRelationship,
  DocumentGraphStructure,
  GraphSearchOptions,
} from "./knowledge-graph-types"
import type { HybridSearchResult } from "./hybrid-search-result-types" // Declare HybridSearchResult

interface HybridRAGConfig {
  aiConfig: any
  vectorDBConfig: any
  knowledgeGraphConfig: KnowledgeGraphConfig
  hybridSettings: {
    vectorWeight: number
    graphWeight: number
    enableGraphReasoning: boolean
    maxGraphDepth: number
    minConfidenceThreshold: number
  }
}

interface Document {
  id: string
  name: string
  content: string
  chunks: string[]
  embeddings: number[][]
  uploadedAt: Date
  metadata?: any
}

interface HybridQueryOptions {
  useVector: boolean
  useGraph: boolean
  showReasoning: boolean
  maxResults: number
  complexityLevel: "simple" | "normal" | "complex"
}

export class HybridRAGEngine {
  private ragEngine: RAGEngine
  private knowledgeGraph: KnowledgeGraphDatabase
  private graphExtractor: KnowledgeGraphExtractor
  private vectorDB: VectorDatabaseClient
  private aiClient: AIClient
  private config: HybridRAGConfig
  private isInitialized = false

  constructor(config: HybridRAGConfig) {
    this.config = config
    this.ragEngine = new RAGEngine()
    this.knowledgeGraph = createKnowledgeGraphDatabase(config.knowledgeGraphConfig)
    this.vectorDB = new VectorDatabaseClient(config.vectorDBConfig)
    this.aiClient = new AIClient(config.aiConfig)
    this.graphExtractor = new KnowledgeGraphExtractor(this.aiClient)
  }

  async initialize(): Promise<void> {
    try {
      console.log("Initializing Hybrid RAG Engine...")

      // Initialize all components
      await this.ragEngine.initialize(this.config.aiConfig)
      await this.knowledgeGraph.initialize()
      await this.vectorDB.initialize()

      this.isInitialized = true
      console.log("Hybrid RAG Engine initialized successfully")
    } catch (error) {
      console.error("Failed to initialize Hybrid RAG Engine:", error)
      throw error
    }
  }

  async processDocument(file: File): Promise<Document> {
    if (!this.isInitialized) {
      throw new Error("Hybrid RAG Engine not initialized")
    }

    console.log(`Processing document: ${file.name}`)

    try {
      // Process document with traditional RAG engine
      const document = await this.ragEngine.processDocument(file)
      console.log(`Document processed: ${document.chunks.length} chunks`)

      // Extract knowledge graph structure
      await this.extractDocumentKnowledgeGraph(document)
      console.log("Knowledge graph extraction completed")

      return document
    } catch (error) {
      console.error("Error processing document:", error)
      throw error
    }
  }

  private async extractDocumentKnowledgeGraph(document: Document): Promise<DocumentGraphStructure> {
    console.log("Extracting knowledge graph from document...")

    // Create document node
    const documentNode = await this.knowledgeGraph.createNode({
      type: NodeType.DOCUMENT,
      properties: {
        title: document.name,
        content: document.content.substring(0, 1000), // Truncate for storage
        chunkCount: document.chunks.length,
        uploadedAt: document.uploadedAt.toISOString(),
        ...document.metadata,
      },
      labels: ["Document"],
    })

    const sections: KnowledgeGraphNode[] = []
    const entities: KnowledgeGraphNode[] = []
    const relationships: KnowledgeGraphRelationship[] = []

    // Process each chunk for entity extraction
    for (let i = 0; i < document.chunks.length; i++) {
      const chunk = document.chunks[i]
      console.log(`Processing chunk ${i + 1}/${document.chunks.length}`)

      // Create section node for chunk
      const sectionNode = await this.knowledgeGraph.createNode({
        type: NodeType.SECTION,
        properties: {
          content: chunk,
          chunkIndex: i,
          documentId: document.id,
          wordCount: chunk.split(" ").length,
        },
        labels: ["Section", "Chunk"],
      })
      sections.push(sectionNode)

      // Create relationship between document and section
      await this.knowledgeGraph.createRelationship({
        type: RelationshipType.CONTAINS,
        sourceNodeId: documentNode.id,
        targetNodeId: sectionNode.id,
        properties: {
          chunkIndex: i,
          relationship: "document_contains_section",
        },
        confidence: 1.0,
      })

      // Extract entities from chunk
      const extractionResult = await this.graphExtractor.extractEntitiesAndRelationships(chunk, document.id, i)

      // Create entity nodes
      for (const extractedEntity of extractionResult.entities) {
        const entityNode = await this.knowledgeGraph.createNode({
          type: NodeType.ENTITY,
          properties: {
            text: extractedEntity.text,
            entityType: extractedEntity.type,
            confidence: extractedEntity.confidence,
            startOffset: extractedEntity.startOffset,
            endOffset: extractedEntity.endOffset,
            documentId: document.id,
            chunkIndex: i,
            ...extractedEntity.properties,
          },
          labels: ["Entity", extractedEntity.type],
        })
        entities.push(entityNode)

        // Create relationship between section and entity
        const mentionsRel = await this.knowledgeGraph.createRelationship({
          type: RelationshipType.MENTIONS,
          sourceNodeId: sectionNode.id,
          targetNodeId: entityNode.id,
          properties: {
            context: chunk.substring(
              Math.max(0, extractedEntity.startOffset - 50),
              Math.min(chunk.length, extractedEntity.endOffset + 50),
            ),
            confidence: extractedEntity.confidence,
          },
          confidence: extractedEntity.confidence,
        })
        relationships.push(mentionsRel)
      }

      // Create entity relationships
      for (const extractedRel of extractionResult.relationships) {
        // Find corresponding entity nodes
        const sourceEntity = entities.find((e) => e.properties.text === extractedRel.sourceEntity)
        const targetEntity = entities.find((e) => e.properties.text === extractedRel.targetEntity)

        if (sourceEntity && targetEntity) {
          const entityRel = await this.knowledgeGraph.createRelationship({
            type: extractedRel.relationshipType as RelationshipType,
            sourceNodeId: sourceEntity.id,
            targetNodeId: targetEntity.id,
            properties: {
              context: extractedRel.context,
              extractedFrom: `chunk_${i}`,
              ...extractedRel.properties,
            },
            confidence: extractedRel.confidence,
          })
          relationships.push(entityRel)
        }
      }
    }

    // Create document hierarchy
    const hierarchy = {
      document: documentNode.id,
      sections: sections.map((section, index) => ({
        id: section.id,
        title: `Section ${index + 1}`,
        level: 1,
        children: [],
        parent: documentNode.id,
      })),
    }

    console.log(`Knowledge graph created: ${entities.length} entities, ${relationships.length} relationships`)

    return {
      documentNode,
      sections,
      entities,
      relationships,
      hierarchy,
    }
  }

  async addDocument(document: Document): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Hybrid RAG Engine not initialized")
    }

    try {
      // Add to traditional RAG engine
      await this.ragEngine.addDocument(document)

      // Add to vector database
      const vectorDocuments = document.chunks.map((chunk, index) => ({
        id: `${document.id}_${index}`,
        content: chunk,
        embedding: document.embeddings[index] || [],
        metadata: {
          source: document.name,
          chunkIndex: index,
          documentId: document.id,
          timestamp: document.uploadedAt,
        },
      }))
      await this.vectorDB.addDocuments(vectorDocuments)

      console.log("Document added to hybrid system successfully")
    } catch (error) {
      console.error("Error adding document to hybrid system:", error)
      throw error
    }
  }

  async hybridQuery(question: string, options: Partial<HybridQueryOptions> = {}): Promise<HybridSearchResult> {
    if (!this.isInitialized) {
      throw new Error("Hybrid RAG Engine not initialized")
    }

    const queryOptions: HybridQueryOptions = {
      useVector: true,
      useGraph: true,
      showReasoning: false,
      maxResults: 10,
      complexityLevel: "normal",
      ...options,
    }

    console.log(`Hybrid query: "${question}" with options:`, queryOptions)

    try {
      const startTime = Date.now()
      let vectorResults: any[] = []
      let graphResults: any = { nodes: [], relationships: [], executionTime: 0, resultCount: 0 }
      let explanation = ""

      // Determine query strategy based on question complexity
      const queryStrategy = this.analyzeQueryStrategy(question)
      console.log(`Query strategy: ${queryStrategy}`)

      // Vector search
      if (queryOptions.useVector) {
        console.log("Executing vector search...")
        try {
          const ragResponse = await this.ragEngine.query(question, {
            complexityLevel: queryOptions.complexityLevel,
            showThinking: queryOptions.showReasoning,
          })

          vectorResults = ragResponse.retrievedChunks.map((chunk) => ({
            id: `vector_${Date.now()}_${Math.random()}`,
            content: chunk.content,
            score: chunk.similarity,
            metadata: {
              source: chunk.source,
              type: "vector",
              similarity: chunk.similarity,
            },
          }))

          explanation += `Vector search found ${vectorResults.length} relevant chunks. `
        } catch (error) {
          console.error("Vector search failed:", error)
          explanation += "Vector search encountered an error. "
        }
      }

      // Knowledge graph search
      if (queryOptions.useGraph) {
        console.log("Executing knowledge graph search...")
        try {
          graphResults = await this.executeGraphQuery(question, queryStrategy)
          explanation += `Graph search found ${graphResults.nodes.length} nodes and ${graphResults.relationships.length} relationships. `
        } catch (error) {
          console.error("Graph search failed:", error)
          explanation += "Graph search encountered an error. "
        }
      }

      // Combine and rank results
      const combinedScore = this.calculateCombinedScore(vectorResults, graphResults)
      explanation += `Combined analysis completed in ${Date.now() - startTime}ms.`

      // Extract sources
      const sources = [
        ...vectorResults.map((r) => r.metadata.source),
        ...graphResults.nodes.map((n: any) => n.properties.source || "Knowledge Graph"),
      ].filter((source, index, array) => array.indexOf(source) === index)

      return {
        vectorResults,
        graphResults,
        combinedScore,
        explanation,
        sources,
      }
    } catch (error) {
      console.error("Hybrid query failed:", error)
      return {
        vectorResults: [],
        graphResults: { nodes: [], relationships: [], executionTime: 0, resultCount: 0 },
        combinedScore: 0,
        explanation: `Query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        sources: [],
      }
    }
  }

  private analyzeQueryStrategy(question: string): "vector_primary" | "graph_primary" | "balanced" {
    const questionLower = question.toLowerCase()

    // Graph-primary indicators
    const graphIndicators = [
      "how are",
      "what is the relationship",
      "connected to",
      "related to",
      "who authored",
      "what cites",
      "mentioned in",
      "associated with",
      "compare",
      "contrast",
      "difference between",
      "similar to",
    ]

    // Vector-primary indicators
    const vectorIndicators = [
      "what does",
      "explain",
      "describe",
      "definition of",
      "summary of",
      "key points",
      "main ideas",
      "overview",
    ]

    const graphScore = graphIndicators.reduce(
      (score, indicator) => (questionLower.includes(indicator) ? score + 1 : score),
      0,
    )

    const vectorScore = vectorIndicators.reduce(
      (score, indicator) => (questionLower.includes(indicator) ? score + 1 : score),
      0,
    )

    if (graphScore > vectorScore) return "graph_primary"
    if (vectorScore > graphScore) return "vector_primary"
    return "balanced"
  }

  private async executeGraphQuery(question: string, strategy: string): Promise<any> {
    const searchOptions: GraphSearchOptions = {
      searchType: "pattern",
      maxResults: 20,
      minConfidence: this.config.hybridSettings.minConfidenceThreshold,
      includeRelationships: true,
      maxDepth: this.config.hybridSettings.maxGraphDepth,
    }

    // Extract key terms from question for graph search
    const searchTerms = this.extractSearchTerms(question)
    console.log("Graph search terms:", searchTerms)

    const results = { nodes: [], relationships: [], executionTime: 0, resultCount: 0 }

    for (const term of searchTerms) {
      try {
        const termResults = await this.knowledgeGraph.search(term, searchOptions)
        results.nodes.push(...termResults.nodes)
        results.relationships.push(...termResults.relationships)
        results.executionTime += termResults.executionTime
        results.resultCount += termResults.resultCount
      } catch (error) {
        console.warn(`Graph search failed for term "${term}":`, error)
      }
    }

    // Deduplicate results
    results.nodes = this.deduplicateNodes(results.nodes)
    results.relationships = this.deduplicateRelationships(results.relationships)

    return results
  }

  private extractSearchTerms(question: string): string[] {
    // Simple term extraction - in production, use more sophisticated NLP
    const stopWords = new Set([
      "the",
      "is",
      "at",
      "which",
      "on",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "with",
      "to",
      "for",
      "of",
      "as",
      "by",
    ])

    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .slice(0, 5) // Limit to top 5 terms
  }

  private calculateCombinedScore(vectorResults: any[], graphResults: any): number {
    const vectorScore =
      vectorResults.length > 0 ? vectorResults.reduce((sum, r) => sum + r.score, 0) / vectorResults.length : 0

    const graphScore =
      graphResults.nodes.length > 0
        ? Math.min(1.0, graphResults.nodes.length / 10) // Normalize based on node count
        : 0

    return (
      (vectorScore * this.config.hybridSettings.vectorWeight + graphScore * this.config.hybridSettings.graphWeight) /
      (this.config.hybridSettings.vectorWeight + this.config.hybridSettings.graphWeight)
    )
  }

  private deduplicateNodes(nodes: any[]): any[] {
    const seen = new Set<string>()
    return nodes.filter((node) => {
      if (seen.has(node.id)) return false
      seen.add(node.id)
      return true
    })
  }

  private deduplicateRelationships(relationships: any[]): any[] {
    const seen = new Set<string>()
    return relationships.filter((rel) => {
      if (seen.has(rel.id)) return false
      seen.add(rel.id)
      return true
    })
  }

  async removeDocument(documentId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Hybrid RAG Engine not initialized")
    }

    try {
      // Remove from RAG engine
      this.ragEngine.removeDocument(documentId)

      // Remove from vector database
      await this.vectorDB.deleteDocument(documentId)

      // Remove from knowledge graph
      const documentQuery = {
        query: "MATCH (d:Document {properties.documentId: $documentId}) DETACH DELETE d",
        parameters: { documentId },
      }
      await this.knowledgeGraph.query(documentQuery)

      console.log(`Document ${documentId} removed from hybrid system`)
    } catch (error) {
      console.error("Error removing document from hybrid system:", error)
      throw error
    }
  }

  async getSystemStatus(): Promise<any> {
    if (!this.isInitialized) {
      return {
        initialized: false,
        ragEngine: null,
        knowledgeGraph: null,
        vectorDB: null,
      }
    }

    try {
      const [ragStatus, graphAnalytics] = await Promise.all([
        this.ragEngine.getStatus(),
        this.knowledgeGraph.getAnalytics(),
      ])

      return {
        initialized: true,
        ragEngine: ragStatus,
        knowledgeGraph: {
          nodeCount: graphAnalytics.nodeCount,
          relationshipCount: graphAnalytics.relationshipCount,
          density: graphAnalytics.density,
          connectedComponents: graphAnalytics.connectedComponents,
        },
        vectorDB: {
          provider: this.config.vectorDBConfig.provider,
          status: "connected",
        },
        hybridSettings: this.config.hybridSettings,
      }
    } catch (error) {
      console.error("Error getting system status:", error)
      return {
        initialized: true,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async validateSystem(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error("Hybrid RAG Engine not initialized")
    }

    try {
      const graphValidation = await this.knowledgeGraph.validateGraph()
      const ragDiagnostics = await this.ragEngine.runDiagnostics()

      return {
        knowledgeGraph: graphValidation,
        ragEngine: ragDiagnostics,
        overall: {
          isValid: graphValidation.isValid && ragDiagnostics.systemStatus.initialized,
          issues: [...graphValidation.errors, ...graphValidation.warnings],
        },
      }
    } catch (error) {
      console.error("System validation failed:", error)
      return {
        overall: {
          isValid: false,
          issues: [
            {
              type: "VALIDATION_ERROR",
              message: error instanceof Error ? error.message : "Unknown validation error",
              severity: "HIGH",
            },
          ],
        },
      }
    }
  }

  async clearAll(): Promise<void> {
    if (!this.isInitialized) {
      return
    }

    try {
      await Promise.all([this.ragEngine.clearDocuments(), this.knowledgeGraph.clear(), this.vectorDB.clear()])

      console.log("Hybrid RAG Engine cleared successfully")
    } catch (error) {
      console.error("Error clearing hybrid system:", error)
      throw error
    }
  }

  async close(): Promise<void> {
    if (!this.isInitialized) {
      return
    }

    try {
      await this.knowledgeGraph.close()
      this.isInitialized = false
      console.log("Hybrid RAG Engine closed successfully")
    } catch (error) {
      console.error("Error closing hybrid system:", error)
      throw error
    }
  }

  // Utility methods
  isHealthy(): boolean {
    return this.isInitialized && this.ragEngine.isHealthy()
  }

  getConfig(): HybridRAGConfig {
    return { ...this.config }
  }

  updateHybridSettings(settings: Partial<HybridRAGConfig["hybridSettings"]>): void {
    this.config.hybridSettings = {
      ...this.config.hybridSettings,
      ...settings,
    }
    console.log("Hybrid settings updated:", this.config.hybridSettings)
  }
}
