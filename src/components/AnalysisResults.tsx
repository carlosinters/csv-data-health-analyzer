import { useState } from 'react'
import type { FileAnalysis, FileSummary, ColumnAnalysis } from '../lib/analysis'
import type { ColumnDiagnosis, FileDiagnosis } from '../lib/columnDiagnosis'
import { getColumnFindings, getColumnSeverity, combineSeverity, severityRank, getVerdictLine, getQualityScore, getScoreLabel } from '../lib/severity'
import type { Severity } from '../lib/severity'
import './AnalysisResults.css'

type AnalysisResultsProps = {
    analysis: FileAnalysis
    summary: FileSummary
    fileDiagnosis: FileDiagnosis | null
    llmStatus: 'idle' | 'loading' | 'success' | 'error'
    llmError: string | null
    onReset: () => void
}

// The kickoff-questions section should only appear once the LLM has
// answered with something usable - exactly 3 non-empty questions and a
// non-empty piece of advice. A malformed or incomplete answer is treated
// the same as no answer at all, rather than showing a broken section.
function hasUsableKickoffData(fileDiagnosis: FileDiagnosis | null): boolean {
    if (fileDiagnosis === null) {
        return false
    }
    if (fileDiagnosis.kickoffQuestions.length !== 3) {
        return false
    }
    for (const question of fileDiagnosis.kickoffQuestions) {
        if (question.trim() === '') {
            return false
        }
    }
    if (fileDiagnosis.advice.trim() === '') {
        return false
    }
    return true
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

// The severity shown to the user: the worse of what the code found from the
// raw counts and what the AI found by reading the actual example values (it
// can catch things counts cannot, like a country written three different
// ways). If the AI hasn't answered yet, this is just the code's severity.
function getEffectiveSeverity(column: ColumnAnalysis, columnDiagnosis: ColumnDiagnosis[] | null, rowCount: number): Severity {
    const localSeverity = getColumnSeverity(column, rowCount)
    const diagnosis = findDiagnosisForColumn(column.name, columnDiagnosis)
    if (diagnosis === null) {
        return localSeverity
    }
    return combineSeverity(localSeverity, diagnosis.severity)
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

function AnalysisResults({ analysis, summary, fileDiagnosis, llmStatus, llmError, onReset }: AnalysisResultsProps) {
    const [sortKey, setSortKey] = useState<SortKey | null>(null)
    const [sortDirection, setSortDirection] = useState<SortDirection>('ascending')
    const [openColumnNames, setOpenColumnNames] = useState<Set<string>>(new Set())

    let columnDiagnosis: ColumnDiagnosis[] | null = null
    if (fileDiagnosis !== null) {
        columnDiagnosis = fileDiagnosis.columns
    }

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
        displayedColumns = [...analysis.columns]
        displayedColumns.sort(function (columnA, columnB) {
            const rankA = severityRank(getEffectiveSeverity(columnA, columnDiagnosis, analysis.rowCount))
            const rankB = severityRank(getEffectiveSeverity(columnB, columnDiagnosis, analysis.rowCount))
            return rankB - rankA
        })
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
    const scoreLabel = getScoreLabel(score)

    let criticalColumnCount = 0
    let warningColumnCount = 0
    let goodColumnCount = 0
    for (const column of analysis.columns) {
        const effectiveSeverity = getEffectiveSeverity(column, columnDiagnosis, analysis.rowCount)
        if (effectiveSeverity === 'critical') {
            criticalColumnCount = criticalColumnCount + 1
        } else if (effectiveSeverity === 'warning') {
            warningColumnCount = warningColumnCount + 1
        } else {
            goodColumnCount = goodColumnCount + 1
        }
    }
    const columnsNeedingAttention = criticalColumnCount + warningColumnCount

    // The score meter's color follows whichever severity is most common
    // across the file's columns - red if critical columns outnumber the
    // rest, yellow if warnings do, green otherwise.
    let scoreColor: Severity = 'good'
    if (criticalColumnCount >= warningColumnCount && criticalColumnCount >= goodColumnCount) {
        scoreColor = 'critical'
    } else if (warningColumnCount >= goodColumnCount) {
        scoreColor = 'warning'
    }

    const verdictLine = getVerdictLine(analysis, score, columnsNeedingAttention)

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
        const severity = getEffectiveSeverity(column, columnDiagnosis, analysis.rowCount)
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
                                    <p>
                                        <strong>AI diagnosis:</strong> {diagnosis.diagnosis}{' '}
                                        {renderSeverityBadge(diagnosis.severity)}
                                    </p>
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

    const showKickoffSection = llmStatus === 'success' && hasUsableKickoffData(fileDiagnosis)
    const kickoffQuestionItems: React.ReactElement[] = []
    if (showKickoffSection && fileDiagnosis !== null) {
        for (let index = 0; index < fileDiagnosis.kickoffQuestions.length; index = index + 1) {
            kickoffQuestionItems.push(<li key={index}>{fileDiagnosis.kickoffQuestions[index]}</li>)
        }
    }

    return (
        <div className="results-page">
            <h1>Data Analyzer Assistant</h1>

            <section className="verdict-card">
                <div className="score-block">
                    <div className={'score-meter score-meter-' + scoreColor}>
                        <span className="score-number">{score}</span>
                        <span className="score-max">/5</span>
                    </div>
                    <span className={'score-label score-label-' + scoreColor}>{scoreLabel}</span>
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

            {showKickoffSection && fileDiagnosis !== null && (
                <section className="kickoff-section">
                    <h2>Ask the client</h2>
                    <ul className="kickoff-questions">{kickoffQuestionItems}</ul>
                    <p className="kickoff-advice"><strong>Advice for the client:</strong> {fileDiagnosis.advice}</p>
                </section>
            )}

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
