import Anthropic from '@anthropic-ai/sdk'

// The generic contract the rest of the app calls. Nothing outside this file
// needs to know we're using Gemini specifically - if we ever added another
// provider, it would just be a second function that returns this same shape.
export type LlmClient = {
    generateJson: (prompt: string, responseSchema: object) => Promise<unknown>
}

const GEMINI_MODEL = 'gemini-3.6-flash'

// Our schemas are written in standard JSON Schema (lowercase types, e.g.
// "object", "string"). Gemini expects uppercase type names instead (e.g.
// "OBJECT", "STRING"), so this walks the schema and converts them, keeping
// that quirk contained to this adapter instead of leaking into every schema
// we write.
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = { ...schema }

    if (typeof converted.type === 'string') {
        converted.type = converted.type.toUpperCase()
    }

    const properties = converted.properties as Record<string, unknown> | undefined
    if (properties) {
        const convertedProperties: Record<string, unknown> = {}
        for (const key of Object.keys(properties)) {
            convertedProperties[key] = toGeminiSchema(properties[key] as Record<string, unknown>)
        }
        converted.properties = convertedProperties
    }

    if (converted.items) {
        converted.items = toGeminiSchema(converted.items as Record<string, unknown>)
    }

    return converted
}

// Builds an LlmClient that talks to Google's Gemini API.
export function createGeminiClient(apiKey: string): LlmClient {
    async function generateJson(prompt: string, responseSchema: object): Promise<unknown> {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                    ],
                },
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: toGeminiSchema(responseSchema as Record<string, unknown>),
            },
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
            const errorBody = await response.text()
            throw new Error('Gemini API request failed with status ' + response.status + ': ' + errorBody)
        }

        const data = await response.json()
        const generatedText = data.candidates[0].content.parts[0].text
        return JSON.parse(generatedText)
    }

    return {
        generateJson: generateJson,
    }
}

const CLAUDE_MODEL = 'claude-haiku-4-5'
const CLAUDE_TOOL_NAME = 'return_structured_result'

// Claude's "strict tool use" requires every object node in the schema to
// explicitly set additionalProperties: false. This walks our plain schema
// and adds that, keeping this Claude-specific requirement contained here
// instead of leaking into every schema we write.
function addClaudeStrictModeFields(schema: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = { ...schema }

    if (converted.type === 'object') {
        converted.additionalProperties = false

        const properties = converted.properties as Record<string, unknown> | undefined
        if (properties) {
            const convertedProperties: Record<string, unknown> = {}
            for (const key of Object.keys(properties)) {
                convertedProperties[key] = addClaudeStrictModeFields(properties[key] as Record<string, unknown>)
            }
            converted.properties = convertedProperties
        }
    }

    if (converted.type === 'array' && converted.items) {
        converted.items = addClaudeStrictModeFields(converted.items as Record<string, unknown>)
    }

    return converted
}

// Builds an LlmClient that talks to Anthropic's Claude API, using the
// official SDK. Since Claude doesn't have a "respond in this JSON shape"
// mode the way Gemini does, we get the same effect by giving it one tool to
// call, matching our schema, and forcing it to call that tool - the tool's
// input then IS our result.
export function createClaudeClient(apiKey: string): LlmClient {
    const client = new Anthropic({
        apiKey: apiKey,
        // We are calling Claude directly from browser code (no backend
        // server), which the SDK blocks by default since it would normally
        // expose the API key publicly. That's an acceptable tradeoff here
        // because this app never gets deployed - it only runs locally, with
        // each user supplying their own key.
        dangerouslyAllowBrowser: true,
    })

    async function generateJson(prompt: string, responseSchema: object): Promise<unknown> {
        const response = await client.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            messages: [
                { role: 'user', content: prompt },
            ],
            tools: [
                {
                    name: CLAUDE_TOOL_NAME,
                    description: 'Returns the result in the required structured format.',
                    strict: true,
                    input_schema: addClaudeStrictModeFields(responseSchema as Record<string, unknown>) as Anthropic.Tool.InputSchema,
                },
            ],
            tool_choice: { type: 'tool', name: CLAUDE_TOOL_NAME },
        })

        for (const block of response.content) {
            if (block.type === 'tool_use') {
                return block.input
            }
        }

        throw new Error('Claude did not return a structured tool result.')
    }

    return {
        generateJson: generateJson,
    }
}
