import type { ParseResult } from 'papaparse'
import type { ParseError } from 'papaparse'
import type { CsvRow } from './csv'


export type ColumnAnalysis = {
    name: string
    missingCount: number
    whitespaceIssueCount: number
    mostCommonType: 'number' | 'string' | 'boolean'
    typeInconsistencyCount: number
}

export type FileAnalysis = {
    isLoadable: boolean
    hasHeaders: boolean
    rowCount: number
    columnCount: number
    columns: ColumnAnalysis[]
    emptyRowCount: number
    duplicateRowCount: number
    parsingErrorCount: number
    parsingErrorTypes : Record <string, number>
}

function countParsingErrorTypes(errors: ParseError[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const error of errors) {
        if (counts[error.type] === undefined) {
            counts[error.type] = 1
        } else {
            counts[error.type] = counts[error.type] + 1
        }
    }
    return counts
}


export function analyzeFile(result: ParseResult<CsvRow>): FileAnalysis {
    const isLoadable = result.data.length  > 0 //ensure that the file has data  
    const hasHeaders = (!!result.meta.fields && result.meta.fields.length > 0) //ensure that the file has headers
    const fields = result.meta.fields
    if (!isLoadable ||!fields || !hasHeaders) { //not loadable or no headers, return an empty analysis
        return {
            isLoadable,
            hasHeaders,
            rowCount: 0,
            columnCount: 0,
            columns: [],
            emptyRowCount: 0,
            duplicateRowCount: 0,
            parsingErrorCount: result.errors.length,
            parsingErrorTypes: countParsingErrorTypes(result.errors)
        }
    }

    //if we are here the file loaded without critical errors

    const rowCount = result.data.length 
    const columnCount = fields.length

    return {
        isLoadable,
        hasHeaders,
        rowCount,
        columnCount,
        columns: [],
        emptyRowCount: 0, //we will implement the logic to count empty rows later
        duplicateRowCount: 0, //we will implement the logic to count duplicate rows later
        parsingErrorCount: result.errors.length,
        parsingErrorTypes: countParsingErrorTypes(result.errors)
    }

}