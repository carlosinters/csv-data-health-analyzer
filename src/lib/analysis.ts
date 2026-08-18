import type { ParseResult } from 'papaparse'
import type { ParseError } from 'papaparse'
import type { CsvRow } from './csv'


export type ColumnAnalysis = {
    name: string
    missingCount: number
    whitespaceIssueCount: number
    mostCommonType: 'number' | 'string' | 'boolean'
    typeInconsistencyCount: number
    outlierCount: number
    distinctCount: number
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

// Finds the value at a given percentile (0 to 1) in an already-sorted
// array of numbers. If the percentile falls between two values, this
// interpolates between them instead of picking one or the other.
function percentile(sortedNumbers: number[], percentileToFind: number): number {
    const index = percentileToFind * (sortedNumbers.length - 1)
    const lowerIndex = Math.floor(index)
    const upperIndex = Math.ceil(index)

    if (lowerIndex === upperIndex) {
        return sortedNumbers[lowerIndex]
    }

    const lowerValue = sortedNumbers[lowerIndex]
    const upperValue = sortedNumbers[upperIndex]
    const fractionBetween = index - lowerIndex

    return lowerValue + (upperValue - lowerValue) * fractionBetween
}

// Uses the IQR (interquartile range) method to count how many numbers are
// unusually far from the rest of the numbers in the same list. This works
// the same way whether the numbers are actual values from a numeric column,
// or the lengths of strings from a text column.
function countOutliers(numbers: number[]): number {
    if (numbers.length < 4) {
        // Too few values to meaningfully judge what counts as "unusual".
        return 0
    }

    const sortedNumbers = [...numbers]
    sortedNumbers.sort(function (a, b) {
        if (a < b) {
            return -1
        } else if (a > b) {
            return 1
        } else {
            return 0
        }
    })

    const firstQuartile = percentile(sortedNumbers, 0.25)
    const thirdQuartile = percentile(sortedNumbers, 0.75)
    const interquartileRange = thirdQuartile - firstQuartile

    const smallestValue = sortedNumbers[0]
    const largestValue = sortedNumbers[sortedNumbers.length - 1]
    const range = largestValue - smallestValue

    if (range === 0) {
        // Every value is identical, so there is nothing to compare against.
        return 0
    }

    const dispersionRatio = interquartileRange / range
    if (dispersionRatio > 0.5) {
        // The middle half of the data already spans more than half of the
        // full range, so the values are too spread out for "outlier" to be
        // a meaningful idea here.
        return 0
    }

    const lowerBound = firstQuartile - 1.5 * interquartileRange
    const upperBound = thirdQuartile + 1.5 * interquartileRange

    let outlierCount = 0
    for (const number of sortedNumbers) {
        if (number < lowerBound || number > upperBound) {
            outlierCount = outlierCount + 1
            //console.log('Outlier detected:', number) // for debugging purposes
        }
    }
    
    return outlierCount
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
    const numberValues: number[] = []
    const stringLengths: number[] = []
    const distinctValues = new Set<string | number | boolean>()

    for (const row of rows) {
        const value = row[columnName]

        if (value === null) { //empty values are considered null because of dynamicTyping:true when file loaded
            missingCount = missingCount + 1
            continue //skip the rest of the checks for this value since it's missing
        }

        distinctValues.add(value)

        if (typeof value === 'string' && value !== value.trim()) {
            whitespaceIssueCount = whitespaceIssueCount + 1
        }

        if (typeof value === 'number') {
            numberCount = numberCount + 1
            numberValues.push(value)
        } else if (typeof value === 'string') {
            stringCount = stringCount + 1
            stringLengths.push(value.length)
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

    // A column "looks categorical" when the same values repeat a lot, e.g.
    // a Region column with only a handful of distinct values across every
    // row. String length is not a meaningful signal there, since different
    // spellings of the same category ("CA" vs "California") naturally have
    // different lengths without being unusual data.
    const distinctRatio = distinctValues.size / totalNonMissingValues
    const looksCategorical = distinctRatio < 0.5

    let outlierCount = 0
    if (mostCommonType === 'number') {
        outlierCount = countOutliers(numberValues)
    } else if (mostCommonType === 'string' && !looksCategorical) {
        outlierCount = countOutliers(stringLengths)
    }

    return {
        name: columnName,
        missingCount,
        whitespaceIssueCount,
        mostCommonType,
        typeInconsistencyCount,
        outlierCount,
        distinctCount: distinctValues.size,
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

    let totalOutliers = 0
    for (const column of analysis.columns) {
        totalOutliers = totalOutliers + column.outlierCount
        //console.log('Column:', column.name, 'Outliers:', column.outlierCount) // for debugging purposes
    }

    if (totalOutliers === 0) {
        messages.push('No unusually extreme values were found in your columns.')
    } else {
        messages.push(totalOutliers + ' unusually extreme values were found in your columns.')
    }

    if (analysis.parsingErrorCount > 0) {
        messages.push(analysis.parsingErrorCount + ' rows had minor formatting issues while reading this file.')
    }

    return {
        isCritical: false,
        messages,
    }

}