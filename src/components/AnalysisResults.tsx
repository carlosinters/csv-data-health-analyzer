import type { FileAnalysis, FileSummary } from '../lib/analysis'
import type { ColumnDiagnosis } from '../lib/columnDiagnosis'

type AnalysisResultsProps = {
    analysis: FileAnalysis
    summary: FileSummary
    columnDiagnosis: ColumnDiagnosis[] | null
    llmStatus: 'idle' | 'loading' | 'success' | 'error'
    llmError: string | null
}

// Finds the AI diagnosis for one column by name, or null if there is none
// (the AI call hasn't finished yet, failed, or was never made).
function findDiagnosisForColumn(columnName: string, columnDiagnosis: ColumnDiagnosis[] | null): ColumnDiagnosis | null {
    if (columnDiagnosis === null) {
        return null
    }
    for (const diagnosis of columnDiagnosis) {
        if (diagnosis.columnName === columnName) {
            return diagnosis
        }
    }
    return null
}

function AnalysisResults({ analysis, summary, columnDiagnosis, llmStatus, llmError }: AnalysisResultsProps) {
    if (summary.isCritical) {
        return (
            <div>
                <h1>Data Analyzer Assistant</h1>
                <p>{summary.messages[0]}</p>
            </div>
        )
    }

    const summaryListItems: React.ReactElement[] = []
    for (let index = 0; index < summary.messages.length; index = index + 1) {
        summaryListItems.push(<li key={index}>{summary.messages[index]}</li>)
    }

    const columnCards: React.ReactElement[] = []
    for (const column of analysis.columns) {
        const diagnosis = findDiagnosisForColumn(column.name, columnDiagnosis)

        columnCards.push(
            <div key={column.name}>
                <h3>{column.name}</h3>
                <p>Most common type: {column.mostCommonType}</p>
                <p>Missing values: {column.missingCount} out of {analysis.rowCount}</p>
                <p>Distinct values: {column.distinctCount}</p>
                <p>Values with stray whitespace: {column.whitespaceIssueCount}</p>
                <p>Type inconsistencies: {column.typeInconsistencyCount}</p>
                <p>Unusually extreme values: {column.outlierCount}</p>
                {diagnosis !== null && (
                    <div>
                        <p>Likely meaning: {diagnosis.likelyMeaning}</p>
                        <p>Diagnosis: {diagnosis.diagnosis}</p>
                    </div>
                )}
            </div>,
        )
    }

    return (
        <div>
            <h1>Data Analyzer Assistant</h1>

            <section>
                <h2>Summary</h2>
                <ul>{summaryListItems}</ul>
            </section>

            {llmStatus === 'loading' && <p>Getting AI insights...</p>}

            {llmStatus === 'error' && (
                <div>
                    <p>Your API key did not work, so only the code-based analysis above is shown.</p>
                    <details>
                        <summary>Technical details</summary>
                        <p>{llmError}</p>
                    </details>
                </div>
            )}

            <section>
                <h2>Columns</h2>
                {columnCards}
            </section>
        </div>
    )
}

export default AnalysisResults
