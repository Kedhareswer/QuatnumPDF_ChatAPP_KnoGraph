import type {
  KnowledgeGraphNode,
  KnowledgeGraphRelationship,
  KnowledgeGraphConfig,
  GraphQuery,
  GraphQueryResult,
  GraphSearchOptions,
  GraphAnalytics,
  GraphValidationResult,
} from "./knowledge-graph-types"

export abstract class KnowledgeGraphDatabase {
  protected config: KnowledgeGraphConfig
  protected isInitialized = false

  constructor(config: KnowledgeGraphConfig) {
    this.config = config
  }

  abstract initialize(): Promise<void>
  abstract createNode(node: Omit<KnowledgeGraphNode, "id" | "createdAt" | "updatedAt">): Promise<KnowledgeGraphNode>
  abstract updateNode(id: string, updates: Partial<KnowledgeGraphNode>): Promise<KnowledgeGraphNode>
  abstract deleteNode(id: string): Promise<void>
  abstract getNode(id: string): Promise<KnowledgeGraphNode | null>
  abstract createRelationship(
    relationship: Omit<KnowledgeGraphRelationship, "id" | "createdAt">,
  ): Promise<KnowledgeGraphRelationship>
  abstract deleteRelationship(id: string): Promise<void>
  abstract query(query: GraphQuery): Promise<GraphQueryResult>
  abstract search(searchTerm: string, options: GraphSearchOptions): Promise<GraphQueryResult>
  abstract getAnalytics(): Promise<GraphAnalytics>
  abstract validateGraph(): Promise<GraphValidationResult>
  abstract clear(): Promise<void>
  abstract close(): Promise<void>

  protected validateConfig(): void {
    if (!this.config) {
      throw new Error("Knowledge graph configuration is required")
    }
  }
}

// Neo4j Implementation
export class Neo4jKnowledgeGraph extends KnowledgeGraphDatabase {
  private driver: any
  private session: any

  async initialize(): Promise<void> {
    try {
      this.validateConfig()

      if (!this.config.connectionString || !this.config.username || !this.config.password) {
        throw new Error("Neo4j connection string, username, and password are required")
      }

      // Dynamic import to avoid build issues
      const neo4j = await import("neo4j-driver")

      this.driver = neo4j.default.driver(
        this.config.connectionString,
        neo4j.default.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: this.config.maxConnections || 50,
          connectionTimeout: this.config.connectionTimeout || 30000,
        },
      )

      // Test connection
      this.session = this.driver.session({ database: this.config.database || "neo4j" })
      await this.session.run("RETURN 1")

      // Create indexes for better performance
      await this.createIndexes()

      this.isInitialized = true
      console.log("Neo4j Knowledge Graph initialized successfully")
    } catch (error) {
      console.error("Failed to initialize Neo4j:", error)
      throw new Error(`Neo4j initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  private async createIndexes(): Promise<void> {
    const indexes = [
      "CREATE INDEX IF NOT EXISTS FOR (n:Document) ON (n.id)",
      "CREATE INDEX IF NOT EXISTS FOR (n:Entity) ON (n.id)",
      "CREATE INDEX IF NOT EXISTS FOR (n:Entity) ON (n.type)",
      "CREATE INDEX IF NOT EXISTS FOR (n:Concept) ON (n.id)",
      "CREATE INDEX IF NOT EXISTS FOR (n:Section) ON (n.documentId)",
      "CREATE TEXT INDEX IF NOT EXISTS FOR (n:Entity) ON (n.text)",
      "CREATE TEXT INDEX IF NOT EXISTS FOR (n:Document) ON (n.title, n.content)",
    ]

    for (const indexQuery of indexes) {
      try {
        await this.session.run(indexQuery)
      } catch (error) {
        console.warn(`Failed to create index: ${indexQuery}`, error)
      }
    }
  }

  async createNode(nodeData: Omit<KnowledgeGraphNode, "id" | "createdAt" | "updatedAt">): Promise<KnowledgeGraphNode> {
    if (!this.isInitialized) await this.initialize()

    const id = this.generateId()
    const now = new Date()

    const node: KnowledgeGraphNode = {
      ...nodeData,
      id,
      createdAt: now,
      updatedAt: now,
    }

    const labels = node.labels.join(":")
    const query = `
      CREATE (n:${labels} {
        id: $id,
        type: $type,
        properties: $properties,
        createdAt: datetime($createdAt),
        updatedAt: datetime($updatedAt)
      })
      RETURN n
    `

    const result = await this.session.run(query, {
      id: node.id,
      type: node.type,
      properties: node.properties,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })

    if (result.records.length === 0) {
      throw new Error("Failed to create node")
    }

    return node
  }

  async updateNode(id: string, updates: Partial<KnowledgeGraphNode>): Promise<KnowledgeGraphNode> {
    if (!this.isInitialized) await this.initialize()

    const setClause = Object.keys(updates)
      .filter((key) => key !== "id" && key !== "createdAt")
      .map((key) => `n.${key} = $${key}`)
      .join(", ")

    const query = `
      MATCH (n {id: $id})
      SET ${setClause}, n.updatedAt = datetime($updatedAt)
      RETURN n
    `

    const params = {
      id,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    const result = await this.session.run(query, params)

    if (result.records.length === 0) {
      throw new Error(`Node with id ${id} not found`)
    }

    return this.recordToNode(result.records[0].get("n"))
  }

  async deleteNode(id: string): Promise<void> {
    if (!this.isInitialized) await this.initialize()

    const query = `
      MATCH (n {id: $id})
      DETACH DELETE n
    `

    await this.session.run(query, { id })
  }

  async getNode(id: string): Promise<KnowledgeGraphNode | null> {
    if (!this.isInitialized) await this.initialize()

    const query = `
      MATCH (n {id: $id})
      RETURN n
    `

    const result = await this.session.run(query, { id })

    if (result.records.length === 0) {
      return null
    }

    return this.recordToNode(result.records[0].get("n"))
  }

  async createRelationship(
    relationshipData: Omit<KnowledgeGraphRelationship, "id" | "createdAt">,
  ): Promise<KnowledgeGraphRelationship> {
    if (!this.isInitialized) await this.initialize()

    const id = this.generateId()
    const now = new Date()

    const relationship: KnowledgeGraphRelationship = {
      ...relationshipData,
      id,
      createdAt: now,
    }

    const query = `
      MATCH (source {id: $sourceNodeId})
      MATCH (target {id: $targetNodeId})
      CREATE (source)-[r:${relationship.type} {
        id: $id,
        properties: $properties,
        weight: $weight,
        confidence: $confidence,
        createdAt: datetime($createdAt)
      }]->(target)
      RETURN r
    `

    const result = await this.session.run(query, {
      sourceNodeId: relationship.sourceNodeId,
      targetNodeId: relationship.targetNodeId,
      id: relationship.id,
      properties: relationship.properties,
      weight: relationship.weight || 1.0,
      confidence: relationship.confidence || 1.0,
      createdAt: now.toISOString(),
    })

    if (result.records.length === 0) {
      throw new Error("Failed to create relationship")
    }

    return relationship
  }

  async deleteRelationship(id: string): Promise<void> {
    if (!this.isInitialized) await this.initialize()

    const query = `
      MATCH ()-[r {id: $id}]-()
      DELETE r
    `

    await this.session.run(query, { id })
  }

  async query(graphQuery: GraphQuery): Promise<GraphQueryResult> {
    if (!this.isInitialized) await this.initialize()

    const startTime = Date.now()

    try {
      const result = await this.session.run(graphQuery.query, graphQuery.parameters || {})

      const nodes: KnowledgeGraphNode[] = []
      const relationships: KnowledgeGraphRelationship[] = []

      result.records.forEach((record: any) => {
        record.keys.forEach((key: string) => {
          const value = record.get(key)

          if (value && value.labels) {
            // It's a node
            nodes.push(this.recordToNode(value))
          } else if (value && value.type) {
            // It's a relationship
            relationships.push(this.recordToRelationship(value))
          }
        })
      })

      return {
        nodes: this.deduplicateNodes(nodes),
        relationships: this.deduplicateRelationships(relationships),
        executionTime: Date.now() - startTime,
        resultCount: result.records.length,
      }
    } catch (error) {
      console.error("Graph query failed:", error)
      throw new Error(`Query execution failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  async search(searchTerm: string, options: GraphSearchOptions): Promise<GraphQueryResult> {
    if (!this.isInitialized) await this.initialize()

    let query = ""
    const params: Record<string, any> = { searchTerm: searchTerm.toLowerCase() }

    switch (options.searchType) {
      case "entity":
        query = `
          MATCH (n:Entity)
          WHERE toLower(n.text) CONTAINS $searchTerm
            OR toLower(n.properties.normalized) CONTAINS $searchTerm
          RETURN n
          LIMIT ${options.maxResults || 10}
        `
        break

      case "relationship":
        query = `
          MATCH (source)-[r]->(target)
          WHERE toLower(r.properties.context) CONTAINS $searchTerm
          RETURN source, r, target
          LIMIT ${options.maxResults || 10}
        `
        break

      case "path":
        query = `
          MATCH path = (start)-[*1..${options.maxDepth || 3}]-(end)
          WHERE toLower(start.text) CONTAINS $searchTerm
            OR toLower(end.text) CONTAINS $searchTerm
          RETURN path
          LIMIT ${options.maxResults || 5}
        `
        break

      case "pattern":
      default:
        query = `
          MATCH (n)
          WHERE toLower(n.text) CONTAINS $searchTerm
            OR toLower(n.properties.content) CONTAINS $searchTerm
            OR toLower(n.properties.title) CONTAINS $searchTerm
          OPTIONAL MATCH (n)-[r]-(connected)
          RETURN n, r, connected
          LIMIT ${options.maxResults || 10}
        `
        break
    }

    return await this.query({ query, parameters: params })
  }

  async getAnalytics(): Promise<GraphAnalytics> {
    if (!this.isInitialized) await this.initialize()

    const queries = {
      nodeCount: "MATCH (n) RETURN count(n) as count",
      relationshipCount: "MATCH ()-[r]-() RETURN count(r) as count",
      density: `
        MATCH (n)
        WITH count(n) as nodeCount
        MATCH ()-[r]-()
        WITH nodeCount, count(r) as relCount
        RETURN CASE 
          WHEN nodeCount > 1 THEN toFloat(relCount) / (nodeCount * (nodeCount - 1))
          ELSE 0.0 
        END as density
      `,
      connectedComponents: `
        CALL gds.wcc.stats('myGraph') 
        YIELD componentCount
        RETURN componentCount
      `,
    }

    const results: any = {}

    for (const [key, query] of Object.entries(queries)) {
      try {
        const result = await this.session.run(query)
        if (result.records.length > 0) {
          const record = result.records[0]
          results[key] = record.get(
            key === "connectedComponents" ? "componentCount" : key === "density" ? "density" : "count",
          )
        }
      } catch (error) {
        console.warn(`Failed to get ${key}:`, error)
        results[key] = 0
      }
    }

    return {
      nodeCount: results.nodeCount || 0,
      relationshipCount: results.relationshipCount || 0,
      averageDegree: results.nodeCount > 0 ? (results.relationshipCount * 2) / results.nodeCount : 0,
      density: results.density || 0,
      connectedComponents: results.connectedComponents || 0,
      centralityScores: {},
      clusteringCoefficient: 0,
    }
  }

  async validateGraph(): Promise<GraphValidationResult> {
    if (!this.isInitialized) await this.initialize()

    const errors: any[] = []
    const warnings: any[] = []

    // Check for orphaned nodes
    try {
      const orphanQuery = `
        MATCH (n)
        WHERE NOT (n)-[]-()
        RETURN n.id as nodeId, labels(n) as labels
        LIMIT 100
      `
      const orphanResult = await this.session.run(orphanQuery)

      orphanResult.records.forEach((record: any) => {
        warnings.push({
          type: "ORPHANED_NODE",
          message: `Node ${record.get("nodeId")} has no relationships`,
          suggestion: "Consider connecting this node or removing it if not needed",
          nodeId: record.get("nodeId"),
          severity: "LOW" as const,
        })
      })
    } catch (error) {
      console.warn("Failed to check for orphaned nodes:", error)
    }

    // Check for duplicate entities
    try {
      const duplicateQuery = `
        MATCH (n:Entity)
        WITH n.text as text, collect(n) as nodes
        WHERE size(nodes) > 1
        RETURN text, [node in nodes | node.id] as nodeIds
        LIMIT 50
      `
      const duplicateResult = await this.session.run(duplicateQuery)

      duplicateResult.records.forEach((record: any) => {
        warnings.push({
          type: "DUPLICATE_ENTITIES",
          message: `Multiple entities found with text: ${record.get("text")}`,
          suggestion: "Consider merging duplicate entities",
          severity: "MEDIUM" as const,
        })
      })
    } catch (error) {
      console.warn("Failed to check for duplicate entities:", error)
    }

    const analytics = await this.getAnalytics()

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      statistics: analytics,
    }
  }

  async clear(): Promise<void> {
    if (!this.isInitialized) await this.initialize()

    const query = "MATCH (n) DETACH DELETE n"
    await this.session.run(query)
    console.log("Neo4j knowledge graph cleared")
  }

  async close(): Promise<void> {
    if (this.session) {
      await this.session.close()
    }
    if (this.driver) {
      await this.driver.close()
    }
    this.isInitialized = false
  }

  private recordToNode(record: any): KnowledgeGraphNode {
    return {
      id: record.properties.id,
      type: record.properties.type,
      properties: record.properties.properties || {},
      labels: record.labels || [],
      createdAt: new Date(record.properties.createdAt),
      updatedAt: new Date(record.properties.updatedAt),
    }
  }

  private recordToRelationship(record: any): KnowledgeGraphRelationship {
    return {
      id: record.properties.id,
      type: record.type,
      sourceNodeId: record.start.toString(),
      targetNodeId: record.end.toString(),
      properties: record.properties.properties || {},
      weight: record.properties.weight,
      confidence: record.properties.confidence,
      createdAt: new Date(record.properties.createdAt),
    }
  }

  private deduplicateNodes(nodes: KnowledgeGraphNode[]): KnowledgeGraphNode[] {
    const seen = new Set<string>()
    return nodes.filter((node) => {
      if (seen.has(node.id)) return false
      seen.add(node.id)
      return true
    })
  }

  private deduplicateRelationships(relationships: KnowledgeGraphRelationship[]): KnowledgeGraphRelationship[] {
    const seen = new Set<string>()
    return relationships.filter((rel) => {
      if (seen.has(rel.id)) return false
      seen.add(rel.id)
      return true
    })
  }

  private generateId(): string {
    return `kg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// In-Memory Implementation for Development/Testing
export class InMemoryKnowledgeGraph extends KnowledgeGraphDatabase {
  private nodes = new Map<string, KnowledgeGraphNode>()
  private relationships = new Map<string, KnowledgeGraphRelationship>()
  private nodesByType = new Map<string, Set<string>>()
  private relationshipsByType = new Map<string, Set<string>>()

  async initialize(): Promise<void> {
    this.isInitialized = true
    console.log("In-memory Knowledge Graph initialized")
  }

  async createNode(nodeData: Omit<KnowledgeGraphNode, "id" | "createdAt" | "updatedAt">): Promise<KnowledgeGraphNode> {
    const id = this.generateId()
    const now = new Date()

    const node: KnowledgeGraphNode = {
      ...nodeData,
      id,
      createdAt: now,
      updatedAt: now,
    }

    this.nodes.set(id, node)

    // Index by type
    if (!this.nodesByType.has(node.type)) {
      this.nodesByType.set(node.type, new Set())
    }
    this.nodesByType.get(node.type)!.add(id)

    return node
  }

  async updateNode(id: string, updates: Partial<KnowledgeGraphNode>): Promise<KnowledgeGraphNode> {
    const existingNode = this.nodes.get(id)
    if (!existingNode) {
      throw new Error(`Node with id ${id} not found`)
    }

    const updatedNode: KnowledgeGraphNode = {
      ...existingNode,
      ...updates,
      id: existingNode.id, // Preserve original ID
      createdAt: existingNode.createdAt, // Preserve creation time
      updatedAt: new Date(),
    }

    this.nodes.set(id, updatedNode)
    return updatedNode
  }

  async deleteNode(id: string): Promise<void> {
    const node = this.nodes.get(id)
    if (!node) return

    // Remove from type index
    const typeSet = this.nodesByType.get(node.type)
    if (typeSet) {
      typeSet.delete(id)
      if (typeSet.size === 0) {
        this.nodesByType.delete(node.type)
      }
    }

    // Remove all relationships involving this node
    const relationshipsToDelete: string[] = []
    this.relationships.forEach((rel, relId) => {
      if (rel.sourceNodeId === id || rel.targetNodeId === id) {
        relationshipsToDelete.push(relId)
      }
    })

    relationshipsToDelete.forEach((relId) => {
      this.relationships.delete(relId)
    })

    this.nodes.delete(id)
  }

  async getNode(id: string): Promise<KnowledgeGraphNode | null> {
    return this.nodes.get(id) || null
  }

  async createRelationship(
    relationshipData: Omit<KnowledgeGraphRelationship, "id" | "createdAt">,
  ): Promise<KnowledgeGraphRelationship> {
    // Verify source and target nodes exist
    if (!this.nodes.has(relationshipData.sourceNodeId)) {
      throw new Error(`Source node ${relationshipData.sourceNodeId} not found`)
    }
    if (!this.nodes.has(relationshipData.targetNodeId)) {
      throw new Error(`Target node ${relationshipData.targetNodeId} not found`)
    }

    const id = this.generateId()
    const relationship: KnowledgeGraphRelationship = {
      ...relationshipData,
      id,
      createdAt: new Date(),
    }

    this.relationships.set(id, relationship)

    // Index by type
    if (!this.relationshipsByType.has(relationship.type)) {
      this.relationshipsByType.set(relationship.type, new Set())
    }
    this.relationshipsByType.get(relationship.type)!.add(id)

    return relationship
  }

  async deleteRelationship(id: string): Promise<void> {
    const relationship = this.relationships.get(id)
    if (!relationship) return

    // Remove from type index
    const typeSet = this.relationshipsByType.get(relationship.type)
    if (typeSet) {
      typeSet.delete(id)
      if (typeSet.size === 0) {
        this.relationshipsByType.delete(relationship.type)
      }
    }

    this.relationships.delete(id)
  }

  async query(graphQuery: GraphQuery): Promise<GraphQueryResult> {
    const startTime = Date.now()

    // Simple query implementation for basic patterns
    // This is a simplified version - real implementation would need a proper query parser
    const nodes: KnowledgeGraphNode[] = []
    const relationships: KnowledgeGraphRelationship[] = []

    // For now, return all nodes and relationships (limited implementation)
    if (graphQuery.query.toLowerCase().includes("match (n)")) {
      nodes.push(...Array.from(this.nodes.values()))
    }

    if (graphQuery.query.toLowerCase().includes("match ()-[r]-()")) {
      relationships.push(...Array.from(this.relationships.values()))
    }

    return {
      nodes: nodes.slice(0, graphQuery.limit || 100),
      relationships: relationships.slice(0, graphQuery.limit || 100),
      executionTime: Date.now() - startTime,
      resultCount: nodes.length + relationships.length,
    }
  }

  async search(searchTerm: string, options: GraphSearchOptions): Promise<GraphQueryResult> {
    const startTime = Date.now()
    const searchLower = searchTerm.toLowerCase()

    const matchingNodes: KnowledgeGraphNode[] = []
    const matchingRelationships: KnowledgeGraphRelationship[] = []

    // Search nodes
    this.nodes.forEach((node) => {
      const nodeText = JSON.stringify(node).toLowerCase()
      if (nodeText.includes(searchLower)) {
        matchingNodes.push(node)
      }
    })

    // Search relationships if requested
    if (options.includeRelationships) {
      this.relationships.forEach((rel) => {
        const relText = JSON.stringify(rel).toLowerCase()
        if (relText.includes(searchLower)) {
          matchingRelationships.push(rel)
        }
      })
    }

    const limit = options.maxResults || 10
    return {
      nodes: matchingNodes.slice(0, limit),
      relationships: matchingRelationships.slice(0, limit),
      executionTime: Date.now() - startTime,
      resultCount: matchingNodes.length + matchingRelationships.length,
    }
  }

  async getAnalytics(): Promise<GraphAnalytics> {
    const nodeCount = this.nodes.size
    const relationshipCount = this.relationships.size

    // Calculate average degree
    const degreeMap = new Map<string, number>()
    this.relationships.forEach((rel) => {
      degreeMap.set(rel.sourceNodeId, (degreeMap.get(rel.sourceNodeId) || 0) + 1)
      degreeMap.set(rel.targetNodeId, (degreeMap.get(rel.targetNodeId) || 0) + 1)
    })

    const totalDegree = Array.from(degreeMap.values()).reduce((sum, degree) => sum + degree, 0)
    const averageDegree = nodeCount > 0 ? totalDegree / nodeCount : 0

    // Calculate density
    const maxPossibleEdges = nodeCount * (nodeCount - 1)
    const density = maxPossibleEdges > 0 ? relationshipCount / maxPossibleEdges : 0

    return {
      nodeCount,
      relationshipCount,
      averageDegree,
      density,
      connectedComponents: 1, // Simplified - would need proper algorithm
      centralityScores: {},
      clusteringCoefficient: 0, // Simplified
    }
  }

  async validateGraph(): Promise<GraphValidationResult> {
    const errors: any[] = []
    const warnings: any[] = []

    // Check for orphaned nodes
    const connectedNodes = new Set<string>()
    this.relationships.forEach((rel) => {
      connectedNodes.add(rel.sourceNodeId)
      connectedNodes.add(rel.targetNodeId)
    })

    this.nodes.forEach((node, nodeId) => {
      if (!connectedNodes.has(nodeId)) {
        warnings.push({
          type: "ORPHANED_NODE",
          message: `Node ${nodeId} has no relationships`,
          suggestion: "Consider connecting this node or removing it if not needed",
          nodeId,
          severity: "LOW" as const,
        })
      }
    })

    // Check for broken relationships
    this.relationships.forEach((rel, relId) => {
      if (!this.nodes.has(rel.sourceNodeId)) {
        errors.push({
          type: "BROKEN_RELATIONSHIP",
          message: `Relationship ${relId} references non-existent source node ${rel.sourceNodeId}`,
          relationshipId: relId,
          severity: "HIGH" as const,
        })
      }
      if (!this.nodes.has(rel.targetNodeId)) {
        errors.push({
          type: "BROKEN_RELATIONSHIP",
          message: `Relationship ${relId} references non-existent target node ${rel.targetNodeId}`,
          relationshipId: relId,
          severity: "HIGH" as const,
        })
      }
    })

    const analytics = await this.getAnalytics()

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      statistics: analytics,
    }
  }

  async clear(): Promise<void> {
    this.nodes.clear()
    this.relationships.clear()
    this.nodesByType.clear()
    this.relationshipsByType.clear()
    console.log("In-memory knowledge graph cleared")
  }

  async close(): Promise<void> {
    await this.clear()
    this.isInitialized = false
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Additional helper methods for in-memory implementation
  getNodesByType(type: string): KnowledgeGraphNode[] {
    const nodeIds = this.nodesByType.get(type) || new Set()
    return Array.from(nodeIds)
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean)
  }

  getRelationshipsByType(type: string): KnowledgeGraphRelationship[] {
    const relIds = this.relationshipsByType.get(type) || new Set()
    return Array.from(relIds)
      .map((id) => this.relationships.get(id)!)
      .filter(Boolean)
  }

  getConnectedNodes(nodeId: string, direction: "in" | "out" | "both" = "both"): KnowledgeGraphNode[] {
    const connectedNodeIds = new Set<string>()

    this.relationships.forEach((rel) => {
      if (direction === "out" || direction === "both") {
        if (rel.sourceNodeId === nodeId) {
          connectedNodeIds.add(rel.targetNodeId)
        }
      }
      if (direction === "in" || direction === "both") {
        if (rel.targetNodeId === nodeId) {
          connectedNodeIds.add(rel.sourceNodeId)
        }
      }
    })

    return Array.from(connectedNodeIds)
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean)
  }
}

export function createKnowledgeGraphDatabase(config: KnowledgeGraphConfig): KnowledgeGraphDatabase {
  switch (config.provider) {
    case "neo4j":
      return new Neo4jKnowledgeGraph(config)
    case "memory":
    default:
      return new InMemoryKnowledgeGraph(config)
  }
}
