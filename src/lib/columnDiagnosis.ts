import type { LlmClient } from './llm'
import type { FileAnalysis } from './analysis'

export type ColumnDiagnosis = {
    columnName: string
    likelyMeaning: string
    diagnosis: string
}

// The shape the LLM must follow when answering - one entry per column, in
// the same order the columns were given. Written in plain, standard JSON
// Schema; each provider's adapter (in llm.ts) handles translating this into
// whatever exact format that provider needs.
const columnDiagnosisSchema = {
    type: 'object',
    properties: {
        columns: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    columnName: { type: 'string' },
                    likelyMeaning: { type: 'string' },
                    diagnosis: { type: 'string' },
                },
                required: ['columnName', 'likelyMeaning', 'diagnosis'],
            },
        },
    },
    required: ['columns'],
}

// Turns the code-computed stats for every column into a plain-text prompt.
function buildColumnDiagnosisPrompt(analysis: FileAnalysis): string {
    let prompt = 'You are reviewing a CSV file with ' + analysis.rowCount + ' rows.\n'
    prompt = prompt + 'For each column below, based only on the information given, do two things:\n'
    prompt = prompt + '1. State what the column most likely represents in plain English.\n'
    prompt = prompt + '2. If it has missing values, type inconsistencies, or outliers, give the most probable cause (for example: inconsistent formatting, mixed date formats, abbreviation vs full name variants, unexpected characters). If it has no significant issues, say so clearly.\n'
    prompt = prompt + 'Only use the information provided below. Do not invent facts about the data that are not shown here.\n\n'

    for (const column of analysis.columns) {
        prompt = prompt + 'Column name: ' + column.name + '\n'
        prompt = prompt + 'Most common type: ' + column.mostCommonType + '\n'
        prompt = prompt + 'Missing values: ' + column.missingCount + ' out of ' + analysis.rowCount + '\n'
        prompt = prompt + 'Distinct values: ' + column.distinctCount + '\n'
        prompt = prompt + 'Values with leading/trailing whitespace: ' + column.whitespaceIssueCount + '\n'
        prompt = prompt + 'Values with an inconsistent type: ' + column.typeInconsistencyCount + '\n'
        prompt = prompt + 'Unusually extreme values (outliers): ' + column.outlierCount + '\n'
        prompt = prompt + 'Example values: ' + column.sampleValues.join(', ') + '\n\n'
    }

    return prompt
}

export async function diagnoseColumns(llmClient: LlmClient, analysis: FileAnalysis): Promise<ColumnDiagnosis[]> {
    const prompt = buildColumnDiagnosisPrompt(analysis)
    const result = await llmClient.generateJson(prompt, columnDiagnosisSchema) as { columns: ColumnDiagnosis[] }
    return result.columns
}
