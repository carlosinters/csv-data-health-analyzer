import type { LlmClient } from './llm'
import type { FileAnalysis } from './analysis'

export type ColumnDiagnosis = {
    columnName: string
    likelyMeaning: string
    diagnosis: string
    severity: 'good' | 'warning' | 'critical'
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
                    severity: { type: 'string', enum: ['good', 'warning', 'critical'] },
                },
                required: ['columnName', 'likelyMeaning', 'diagnosis', 'severity'],
            },
        },
    },
    required: ['columns'],
}

// Turns the code-computed stats for every column into a plain-text prompt.
function buildColumnDiagnosisPrompt(analysis: FileAnalysis): string {
    let prompt = 'You are reviewing a CSV file with ' + analysis.rowCount + ' rows.\n'
    prompt = prompt + 'For each column below, based only on the information given, do three things:\n'
    prompt = prompt + '1. State what the column most likely represents in plain English.\n'
    prompt = prompt + '2. If it has missing values, type inconsistencies, or outliers, give the most probable cause (for example: inconsistent formatting, mixed date formats, abbreviation vs full name variants, unexpected characters). If it has no significant issues, say so clearly.\n'
    prompt = prompt + '3. Look at the example values themselves, not just the counts, for problems the counts cannot show: the same real-world value written in more than one way (for example a country appearing as "USA", "United States", and "US", or a unit written as "kg" and "kilograms"). If you notice this kind of inconsistency, describe it in your diagnosis even though it may not show up as a missing value, a type mismatch, or an outlier.\n'
    prompt = prompt + 'Then assign a severity for the column: "critical" if the issues make the data unusable as given, "warning" if you found a real problem worth a person\'s attention (including a same-value-written-differently issue from step 3, even if the statistics look clean), or "good" if you see no real issue.\n'
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
