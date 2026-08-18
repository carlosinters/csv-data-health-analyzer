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

// A row counts as "empty" when every single column in it is null.
function countEmptyRows(rows: CsvRow[]): number {
    let emptyRowCount = 0
    for (const row of rows) {
        const values = Object.values(row)
        const allValuesAreNull = values.every((value) => value === null)
        if (allValuesAreNull) {
            emptyRowCount = emptyRowCount + 1
        }
    }
    return emptyRowCount
}

// A row counts as a "duplicate" when every column matches a row we've
// already seen earlier in the file. The first occurrence is not counted,
// only the repeats after it.
function countDuplicateRows(rows: CsvRow[]): number {
    let duplicateRowCount = 0
    const seenRowSignatures = new Set<string>()
    for (const row of rows) {
        const signature = JSON.stringify(row)
        if (seenRowSignatures.has(signature)) {
            duplicateRowCount = duplicateRowCount + 1
            //console.log('Duplicate row detected:', row) for debugging purposes
        } else {
            seenRowSignatures.add(signature)
        }
    }
    return duplicateRowCount
}

// Looks at every value in one column and reports:
// - how many are missing (null)
// - how many strings have leading/trailing whitespace
// - which type (number, string, or boolean) shows up most often
// - how many values don't match that most-common type
function analyzeColumn(columnName: string, rows: CsvRow[]): ColumnAnalysis {
    let missingCount = 0
    let whitespaceIssueCount = 0
    let numberCount = 0
    let stringCount = 0
    let booleanCount = 0

    for (const row of rows) {
        const value = row[columnName]

        if (value === null) {
            missingCount = missingCount + 1
            continue
        }

        if (typeof value === 'string' && value !== value.trim()) {
            whitespaceIssueCount = whitespaceIssueCount + 1
        }

        if (typeof value === 'number') {
            numberCount = numberCount + 1
        } else if (typeof value === 'string') {
            stringCount = stringCount + 1
        } else if (typeof value === 'boolean') {
            booleanCount = booleanCount + 1
        }
    }

    // Start by assuming "string" is the most common type, then check if
    // number or boolean actually beat it.
    let mostCommonType: 'number' | 'string' | 'boolean' = 'string'
    let mostCommonTypeCount = stringCount

    if (numberCount > mostCommonTypeCount) {
        mostCommonType = 'number'
        mostCommonTypeCount = numberCount
    }

    if (booleanCount > mostCommonTypeCount) {
        mostCommonType = 'boolean'
        mostCommonTypeCount = booleanCount
    }

    // Every non-missing value that isn't the most common type counts as
    // an inconsistency.
    const totalNonMissingValues = numberCount + stringCount + booleanCount
    const typeInconsistencyCount = totalNonMissingValues - mostCommonTypeCount

    return {
        name: columnName,
        missingCount,
        whitespaceIssueCount,
        mostCommonType,
        typeInconsistencyCount,
    }
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

    const columns: ColumnAnalysis[] = []
    for (const columnName of fields) {
        columns.push(analyzeColumn(columnName, result.data))
    }

    return {
        isLoadable,
        hasHeaders,
        rowCount,
        columnCount,
        columns,
        emptyRowCount: countEmptyRows(result.data),
        duplicateRowCount: countDuplicateRows(result.data),
        parsingErrorCount: result.errors.length,
        parsingErrorTypes: countParsingErrorTypes(result.errors)
    }
}

export type FileSummary = {
    isCritical: boolean
    messages: string[]
}

// Turns a FileAnalysis into plain-English sentences, in order from most
// to least severe. If the file is fundamentally unusable, we stop after
// one explanatory message instead of describing data that isn't really there.
export function summarizeFile(analysis: FileAnalysis): FileSummary {
    if (!analysis.hasHeaders) {
        return {
            isCritical: true,
            messages: ["We could not identify column headers in this file. Please check that it is a valid CSV."],
        }
    }

    if (!analysis.isLoadable) {
        return {
            isCritical: true,
            messages: ["This file has column headers but no data rows to analyze."],
        }
    }

    const messages: string[] = []

    messages.push('Your file loaded correctly and has ' + analysis.rowCount + ' rows and ' + analysis.columnCount + ' columns.')

    if (analysis.duplicateRowCount === 0) {
        messages.push('No duplicate rows were found.')
    } else {
        messages.push(analysis.duplicateRowCount + ' rows appear to be exact duplicates of another row.')
    }

    if (analysis.emptyRowCount === 0) {
        messages.push('No completely empty rows were found.')
    } else {
        messages.push(analysis.emptyRowCount + ' rows are completely empty.')
    }

    let totalTypeInconsistencies = 0
    for (const column of analysis.columns) {
        totalTypeInconsistencies = totalTypeInconsistencies + column.typeInconsistencyCount
    }

    if (totalTypeInconsistencies === 0) {
        messages.push('No type inconsistencies were found across your columns.')
    } else {
        messages.push(totalTypeInconsistencies + ' values across your columns do not match the type most common in their column.')
    }

    if (analysis.parsingErrorCount > 0) {
        messages.push(analysis.parsingErrorCount + ' rows had minor formatting issues while reading this file.')
    }

    return {
        isCritical: false,
        messages,
    }

}