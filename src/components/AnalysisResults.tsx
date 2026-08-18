import { useState } from 'react'
import type { FileAnalysis, FileSummary, ColumnAnalysis } from '../lib/analysis'
import type { ColumnDiagnosis } from '../lib/columnDiagnosis'
import { getColumnFindings, getColumnSeverity, rankColumns, getQualityScore, getVerdictLine } from '../lib/severity'
import type { Severity } from '../lib/severity'
import './AnalysisResults.css'

type AnalysisResultsProps = {
    analysis: FileAnalysis
    summary: FileSummary
    columnDiagnosis: ColumnDiagnosis[] | null
    llmStatus: 'idle' | 'loading' | 'success' | 'error'
    llmError: string | null
    onReset: () => void
}

type SortKey = 'name' | 'type' | 'missing' | 'distinct' | 'issues'
type SortDirection = 'ascending' | 'descending'

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

// Small text-and-color badge for a severity. The text label matters, not
// just the color, so this is still readable without relying on color.
function renderSeverityBadge(severity: Severity) {
    let label = 'Good'
    if (severity === 'warning') {
        label = 'Warning'
    } else if (severity === 'critical') {
        label = 'Critical'
    }
    return <span className={'severity-badge severity-' + severity}>{label}</span>
}

function getSortValue(column: ColumnAnalysis, key: SortKey, rowCount: number): string | number {
    if (key === 'name') {
        return column.name
    } else if (key === 'type') {
        return column.mostCommonType
    } else if (key === 'missing') {
        return column.missingCount
    } else if (key === 'distinct') {
        return column.distinctCount
    } else {
        return getColumnFindings(column, rowCount).length
    }
}

function AnalysisResults({ analysis, summary, columnDiagnosis, llmStatus, llmError, onReset }: AnalysisResultsProps) {
    const [sortKey, setSortKey] = useState<SortKey | null>(null)
    const [sortDirection, setSortDirection] = useState<SortDirection>('ascending')
    const [openColumnNames, setOpenColumnNames] = useState<Set<string>>(new Set())

    if (summary.isCritical) {
        return (
            <div className="results-page">
                <h1>Data Analyzer Assistant</h1>
                <p className="critical-message">{summary.messages[0]}</p>
                <button type="button" onClick={onReset}>Try another file</button>
            </div>
        )
    }

    function handleHeaderClick(key: SortKey) {
        if (sortKey === key) {
            if (sortDirection === 'ascending') {
                setSortDirection('descending')
            } else {
                setSortDirection('ascending')
            }
        } else {
            setSortKey(key)
            setSortDirection('ascending')
        }
    }

    function toggleColumnOpen(columnName: string) {
        const newOpenColumnNames = new Set(openColumnNames)
        if (newOpenColumnNames.has(columnName)) {
            newOpenColumnNames.delete(columnName)
        } else {
            newOpenColumnNames.add(columnName)
        }
        setOpenColumnNames(newOpenColumnNames)
    }

    let displayedColumns: ColumnAnalysis[]
    if (sortKey === null) {
        displayedColumns = rankColumns(analysis.columns, analysis.rowCount)
    } else {
        displayedColumns = [...analysis.columns]
        displayedColumns.sort(function (columnA, columnB) {
            const valueA = getSortValue(columnA, sortKey, analysis.rowCount)
            const valueB = getSortValue(columnB, sortKey, analysis.rowCount)

            let comparison = 0
            if (valueA < valueB) {
                comparison = -1
            } else if (valueA > valueB) {
                comparison = 1
            }

            if (sortDirection === 'descending') {
                comparison = comparison * -1
            }

            return comparison
        })
    }

    const score = getQualityScore(analysis)
    const verdictLine = getVerdictLine(analysis, score)

    let columnsNeedingAttention = 0
    for (const column of analysis.columns) {
        if (getColumnSeverity(column, analysis.rowCount) !== 'good') {
            columnsNeedingAttention = columnsNeedingAttention + 1
        }
    }

    // The first summary message is the row/column count, already covered
    // by the verdict line above, so the findings list starts after it.
    const findingMessages = summary.messages.slice(1)
    const findingItems: { message: string, severity: Severity }[] = []
    for (const message of findingMessages) {
        let severity: Severity = 'warning'
        if (message.startsWith('No ')) {
            severity = 'good'
        }
        findingItems.push({ message: message, severity: severity })
    }
    findingItems.sort(function (itemA, itemB) {
        if (itemA.severity === 'warning' && itemB.severity === 'good') {
            return -1
        } else if (itemA.severity === 'good' && itemB.severity === 'warning') {
            return 1
        } else {
            return 0
        }
    })

    const findingListItems: React.ReactElement[] = []
    for (let index = 0; index < findingItems.length; index = index + 1) {
        const item = findingItems[index]
        findingListItems.push(
            <li key={index} className={'finding-item finding-' + item.severity}>
                <span className="finding-dot"></span>
                {item.message}
            </li>,
        )
    }

    const tableRows: React.ReactElement[] = []
    for (const column of displayedColumns) {
        const diagnosis = findDiagnosisForColumn(column.name, columnDiagnosis)
        const findings = getColumnFindings(column, analysis.rowCount)
        const severity = getColumnSeverity(column, analysis.rowCount)
        const missingPercent = Math.round((column.missingCount / analysis.rowCount) * 100)
        const isOpen = openColumnNames.has(column.name)

        tableRows.push(
            <tr key={column.name} className="column-row" onClick={() => toggleColumnOpen(column.name)}>
                <td className="column-name-cell">
                    <span className={'expand-chevron' + (isOpen ? ' open' : '')}>▸</span>
                    {column.name}
                </td>
                <td>{column.mostCommonType}</td>
                <td>
                    <div className="missing-bar-track">
                        <div className="missing-bar-fill" style={{ width: missingPercent + '%' }}></div>
                    </div>
                    {missingPercent}%
                </td>
                <td>{column.distinctCount}</td>
                <td>{renderSeverityBadge(severity)}</td>
            </tr>,
        )

        if (isOpen) {
            const sampleChips: React.ReactElement[] = []
            for (let index = 0; index < column.sampleValues.length; index = index + 1) {
                sampleChips.push(<span key={index} className="sample-chip">{column.sampleValues[index]}</span>)
            }

            const findingRows: React.ReactElement[] = []
            for (let index = 0; index < findings.length; index = index + 1) {
                findingRows.push(<li key={index}>{findings[index].message}</li>)
            }

            tableRows.push(
                <tr key={column.name + '-detail'} className="column-detail-row">
                    <td colSpan={5}>
                        <div className="column-detail-panel">
                            {findingRows.length > 0 && <ul>{findingRows}</ul>}
                            {findingRows.length === 0 && <p>No issues found in this column.</p>}

                            {diagnosis !== null && (
                                <div className="ai-diagnosis">
                                    <p><strong>Likely meaning:</strong> {diagnosis.likelyMeaning}</p>
                                    <p><strong>AI diagnosis:</strong> {diagnosis.diagnosis}</p>
                                </div>
                            )}

                            {column.sampleValues.length > 0 && (
                                <div className="sample-values">
                                    <p>Example values from your file:</p>
                                    <div className="sample-chip-list">{sampleChips}</div>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>,
            )
        }
    }

    return (
        <div className="results-page">
            <h1>Data Analyzer Assistant</h1>

            <section className="verdict-card">
                <div className="score-meter">
                    <span className="score-number">{score}</span>
                    <span className="score-max">/5</span>
                </div>
                <div>
                    <p className="verdict-line">{verdictLine}</p>
                    <div className="stat-tiles">
                        <div className="stat-tile">
                            <span className="stat-value">{analysis.rowCount}</span>
                            <span className="stat-label">rows</span>
                        </div>
                        <div className="stat-tile">
                            <span className="stat-value">{analysis.columnCount}</span>
                            <span className="stat-label">columns</span>
                        </div>
                        <div className="stat-tile">
                            <span className="stat-value">{columnsNeedingAttention}</span>
                            <span className="stat-label">need attention</span>
                        </div>
                    </div>
                </div>
            </section>

            {findingListItems.length > 0 && (
                <section>
                    <h2>Findings</h2>
                    <ul className="findings-list">{findingListItems}</ul>
                </section>
            )}

            <section className="ai-status-strip">
                {llmStatus === 'idle' && <p>Add an API key to get AI-written interpretations of each column.</p>}
                {llmStatus === 'loading' && <p className="ai-loading">Getting AI insights...</p>}
                {llmStatus === 'success' && <p>AI interpretations added below - click a column to see them.</p>}
                {llmStatus === 'error' && (
                    <div>
                        <p>Your API key did not work, so only the code-based analysis below is shown.</p>
                        <details>
                            <summary>Technical details</summary>
                            <p>{llmError}</p>
                        </details>
                    </div>
                )}
            </section>

            <section>
                <h2>Columns</h2>
                <table className="column-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleHeaderClick('name')}>Column</th>
                            <th onClick={() => handleHeaderClick('type')}>Type</th>
                            <th onClick={() => handleHeaderClick('missing')}>Missing</th>
                            <th onClick={() => handleHeaderClick('distinct')}>Distinct</th>
                            <th onClick={() => handleHeaderClick('issues')}>Issues</th>
                        </tr>
                    </thead>
                    <tbody>{tableRows}</tbody>
                </table>
            </section>

            <button type="button" className="reset-button" onClick={onReset}>Analyze another file</button>
        </div>
    )
}

export default AnalysisResults
