import type { AIClient } from "./ai-client"
import type {
  EntityExtractionResult,
  ExtractedEntity,
  ExtractedRelationship,
  EntityResolutionResult,
  ResolvedEntity,
} from "./knowledge-graph-types"

export class KnowledgeGraphExtractor {
  private aiClient: AIClient
  private entityCache = new Map<string, ExtractedEntity[]>()
  private relationshipCache = new Map<string, ExtractedRelationship[]>()

  constructor(aiClient: AIClient) {
    this.aiClient = aiClient
  }

  async extractEntitiesAndRelationships(
    text: string,
    documentId: string,
    chunkIndex?: number,
  ): Promise<EntityExtractionResult> {
    const startTime = Date.now()

    try {
      console.log(`Extracting entities from text (${text.length} chars)`)

      // Check cache first
      const cacheKey = this.generateCacheKey(text)
      if (this.entityCache.has(cacheKey)) {
        console.log("Using cached entity extraction results")
        return {
          entities: this.entityCache.get(cacheKey)!,
          relationships: this.relationshipCache.get(cacheKey) || [],
          confidence: 0.9,
          processingTime: Date.now() - startTime,
        }
      }

      // Extract entities using AI
      const entities = await this.extractEntities(text)
      console.log(`Extracted ${entities.length} entities`)

      // Extract relationships using AI
      const relationships = await this.extractRelationships(text, entities)
      console.log(`Extracted ${relationships.length} relationships`)

      // Cache results
      this.entityCache.set(cacheKey, entities)
      this.relationshipCache.set(cacheKey, relationships)

      const result: EntityExtractionResult = {
        entities,
        relationships,
        confidence: this.calculateOverallConfidence(entities, relationships),
        processingTime: Date.now() - startTime,
      }

      console.log(`Entity extraction completed in ${result.processingTime}ms`)
      return result
    } catch (error) {
      console.error("Error in entity extraction:", error)
      return {
        entities: [],
        relationships: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
      }
    }
  }

  private async extractEntities(text: string): Promise<ExtractedEntity[]> {
    const prompt = this.createEntityExtractionPrompt(text)

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert entity extraction system. Extract named entities from text and return them in a structured JSON format.

ENTITY TYPES TO EXTRACT:
- PERSON: People, authors, researchers
- ORGANIZATION: Companies, institutions, universities
- LOCATION: Places, cities, countries, regions
- DATE: Dates, time periods, years
- CONCEPT: Technical terms, theories, methodologies
- CITATION: References to other works
- TOPIC: Subject areas, domains, fields of study

RESPONSE FORMAT:
Return a JSON array of entities with this structure:
{
  "entities": [
    {
      "text": "exact text from document",
      "type": "ENTITY_TYPE",
      "startOffset": 0,
      "endOffset": 10,
      "confidence": 0.95,
      "properties": {
        "normalized": "normalized form",
        "category": "subcategory if applicable"
      }
    }
  ]
}

REQUIREMENTS:
- Extract only entities that are clearly identifiable
- Provide accurate start/end offsets
- Assign confidence scores (0.0-1.0)
- Include relevant properties for context
- Avoid overlapping entities`,
      },
      {
        role: "user" as const,
        content: prompt,
      },
    ]

    try {
      const response = await this.aiClient.generateText(messages)
      const parsed = this.parseEntityResponse(response, text)
      return parsed
    } catch (error) {
      console.error("Error extracting entities:", error)
      return this.fallbackEntityExtraction(text)
    }
  }

  private async extractRelationships(text: string, entities: ExtractedEntity[]): Promise<ExtractedRelationship[]> {
    if (entities.length < 2) {
      return []
    }

    const prompt = this.createRelationshipExtractionPrompt(text, entities)

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert relationship extraction system. Identify relationships between entities in text.

RELATIONSHIP TYPES:
- MENTIONS: Entity is mentioned in context
- RELATES_TO: General semantic relationship
- PART_OF: Hierarchical containment
- AUTHORED_BY: Authorship relationship
- LOCATED_IN: Geographic relationship
- OCCURRED_ON: Temporal relationship
- CITES: Citation relationship
- ASSOCIATED_WITH: General association

RESPONSE FORMAT:
{
  "relationships": [
    {
      "sourceEntity": "entity text",
      "targetEntity": "entity text",
      "relationshipType": "RELATIONSHIP_TYPE",
      "confidence": 0.85,
      "context": "surrounding text context",
      "properties": {
        "direction": "bidirectional|unidirectional",
        "strength": "weak|medium|strong"
      }
    }
  ]
}

REQUIREMENTS:
- Only extract relationships explicitly supported by text
- Provide confidence scores (0.0-1.0)
- Include context that supports the relationship
- Avoid redundant or trivial relationships`,
      },
      {
        role: "user" as const,
        content: prompt,
      },
    ]

    try {
      const response = await this.aiClient.generateText(messages)
      const parsed = this.parseRelationshipResponse(response)
      return parsed
    } catch (error) {
      console.error("Error extracting relationships:", error)
      return []
    }
  }

  private createEntityExtractionPrompt(text: string): string {
    return `Extract named entities from the following text:

TEXT:
${text}

Focus on extracting entities that are:
1. Clearly identifiable and unambiguous
2. Relevant to the document's content
3. Properly categorized by type
4. Accurately positioned in the text

Provide the response in the specified JSON format.`
  }

  private createRelationshipExtractionPrompt(text: string, entities: ExtractedEntity[]): string {
    const entityList = entities.map((e) => `- ${e.text} (${e.type})`).join("\n")

    return `Identify relationships between the following entities in the given text:

ENTITIES:
${entityList}

TEXT:
${text}

Extract relationships that are:
1. Explicitly stated or strongly implied in the text
2. Meaningful and non-trivial
3. Properly categorized by relationship type
4. Supported by clear textual evidence

Provide the response in the specified JSON format.`
  }

  private parseEntityResponse(response: string, originalText: string): ExtractedEntity[] {
    try {
      // Clean the response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error("No JSON found in response")
      }

      const parsed = JSON.parse(jsonMatch[0])
      const entities = parsed.entities || []

      return entities
        .map((entity: any) => ({
          text: entity.text || "",
          type: entity.type || "CONCEPT",
          startOffset: entity.startOffset || 0,
          endOffset: entity.endOffset || entity.text?.length || 0,
          confidence: Math.min(1.0, Math.max(0.0, entity.confidence || 0.5)),
          properties: entity.properties || {},
          aliases: entity.aliases || [],
        }))
        .filter((entity: ExtractedEntity) => entity.text && entity.text.length > 0)
    } catch (error) {
      console.error("Error parsing entity response:", error)
      return this.fallbackEntityExtraction(originalText)
    }
  }

  private parseRelationshipResponse(response: string): ExtractedRelationship[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return []
      }

      const parsed = JSON.parse(jsonMatch[0])
      const relationships = parsed.relationships || []

      return relationships
        .map((rel: any) => ({
          sourceEntity: rel.sourceEntity || "",
          targetEntity: rel.targetEntity || "",
          relationshipType: rel.relationshipType || "RELATES_TO",
          confidence: Math.min(1.0, Math.max(0.0, rel.confidence || 0.5)),
          context: rel.context || "",
          properties: rel.properties || {},
        }))
        .filter(
          (rel: ExtractedRelationship) => rel.sourceEntity && rel.targetEntity && rel.sourceEntity !== rel.targetEntity,
        )
    } catch (error) {
      console.error("Error parsing relationship response:", error)
      return []
    }
  }

  private fallbackEntityExtraction(text: string): ExtractedEntity[] {
    console.log("Using fallback entity extraction")

    const entities: ExtractedEntity[] = []

    // Simple regex-based extraction as fallback
    const patterns = [
      { type: "PERSON", regex: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g },
      { type: "ORGANIZATION", regex: /\b[A-Z][a-zA-Z\s&]+(?:Inc|Corp|Ltd|University|Institute|Company)\b/g },
      { type: "DATE", regex: /\b\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g },
      { type: "LOCATION", regex: /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*(?:\s(?:City|State|Country|University|College))\b/g },
    ]

    patterns.forEach((pattern) => {
      let match
      while ((match = pattern.regex.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type: pattern.type,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          confidence: 0.6, // Lower confidence for fallback
          properties: { extractionMethod: "fallback" },
        })
      }
    })

    return entities
  }

  private calculateOverallConfidence(entities: ExtractedEntity[], relationships: ExtractedRelationship[]): number {
    if (entities.length === 0) return 0

    const entityConfidence = entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length
    const relationshipConfidence =
      relationships.length > 0
        ? relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length
        : entityConfidence

    return (entityConfidence + relationshipConfidence) / 2
  }

  private generateCacheKey(text: string): string {
    // Simple hash function for caching
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString()
  }

  async resolveEntities(entities: ExtractedEntity[]): Promise<EntityResolutionResult> {
    console.log(`Resolving ${entities.length} entities`)

    const resolvedEntities: ResolvedEntity[] = []
    const mergedEntities: Array<{ canonical: string; aliases: string[]; confidence: number }> = []
    const ambiguousEntities: Array<{ entity: string; possibleResolutions: string[] }> = []

    // Group similar entities
    const entityGroups = this.groupSimilarEntities(entities)

    for (const group of entityGroups) {
      if (group.length === 1) {
        // Single entity, no resolution needed
        const entity = group[0]
        resolvedEntities.push({
          id: this.generateEntityId(entity.text, entity.type),
          canonicalName: entity.text,
          type: entity.type,
          aliases: entity.aliases || [],
          properties: entity.properties,
          confidence: entity.confidence,
        })
      } else {
        // Multiple similar entities, resolve to canonical form
        const canonical = this.selectCanonicalEntity(group)
        const aliases = group.map((e) => e.text).filter((text) => text !== canonical.text)

        resolvedEntities.push({
          id: this.generateEntityId(canonical.text, canonical.type),
          canonicalName: canonical.text,
          type: canonical.type,
          aliases,
          properties: this.mergeEntityProperties(group),
          confidence: group.reduce((sum, e) => sum + e.confidence, 0) / group.length,
        })

        mergedEntities.push({
          canonical: canonical.text,
          aliases,
          confidence: canonical.confidence,
        })
      }
    }

    return {
      resolvedEntities,
      mergedEntities,
      ambiguousEntities,
    }
  }

  private groupSimilarEntities(entities: ExtractedEntity[]): ExtractedEntity[][] {
    const groups: ExtractedEntity[][] = []
    const processed = new Set<number>()

    for (let i = 0; i < entities.length; i++) {
      if (processed.has(i)) continue

      const group = [entities[i]]
      processed.add(i)

      for (let j = i + 1; j < entities.length; j++) {
        if (processed.has(j)) continue

        if (this.areEntitiesSimilar(entities[i], entities[j])) {
          group.push(entities[j])
          processed.add(j)
        }
      }

      groups.push(group)
    }

    return groups
  }

  private areEntitiesSimilar(entity1: ExtractedEntity, entity2: ExtractedEntity): boolean {
    // Same type required
    if (entity1.type !== entity2.type) return false

    // Check text similarity
    const text1 = entity1.text.toLowerCase().trim()
    const text2 = entity2.text.toLowerCase().trim()

    // Exact match
    if (text1 === text2) return true

    // Check if one is contained in the other (for partial matches)
    if (text1.includes(text2) || text2.includes(text1)) {
      return Math.abs(text1.length - text2.length) <= 3
    }

    // Check Levenshtein distance for typos
    const distance = this.levenshteinDistance(text1, text2)
    const maxLength = Math.max(text1.length, text2.length)
    const similarity = 1 - distance / maxLength

    return similarity >= 0.8
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null))

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator)
      }
    }

    return matrix[str2.length][str1.length]
  }

  private selectCanonicalEntity(entities: ExtractedEntity[]): ExtractedEntity {
    // Select the entity with highest confidence, or longest text if tied
    return entities.reduce((best, current) => {
      if (current.confidence > best.confidence) return current
      if (current.confidence === best.confidence && current.text.length > best.text.length) return current
      return best
    })
  }

  private mergeEntityProperties(entities: ExtractedEntity[]): Record<string, any> {
    const merged: Record<string, any> = {}

    entities.forEach((entity) => {
      Object.entries(entity.properties).forEach(([key, value]) => {
        if (!merged[key]) {
          merged[key] = value
        } else if (Array.isArray(merged[key])) {
          if (!merged[key].includes(value)) {
            merged[key].push(value)
          }
        } else if (merged[key] !== value) {
          merged[key] = [merged[key], value]
        }
      })
    })

    return merged
  }

  private generateEntityId(text: string, type: string): string {
    const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "_")
    return `${type.toLowerCase()}_${normalized}_${Date.now()}`
  }

  clearCache(): void {
    this.entityCache.clear()
    this.relationshipCache.clear()
    console.log("Entity extraction cache cleared")
  }

  getCacheStats(): { entities: number; relationships: number } {
    return {
      entities: this.entityCache.size,
      relationships: this.relationshipCache.size,
    }
  }
}
