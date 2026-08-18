import type { ColumnAnalysis, FileAnalysis } from './analysis'

export type Severity = 'good' | 'warning' | 'critical'

export type Finding = {
    severity: Severity
    message: string
}

// Turns one column's raw counts into plain-English findings, each with its
// own severity. A column can have zero, one, or several findings.
export function getColumnFindings(column: ColumnAnalysis, rowCount: number): Finding[] {
    const findings: Finding[] = []

    if (rowCount > 0) {
        const missingPercent = (column.missingCount / rowCount) * 100

        if (missingPercent > 20) {
            findings.push({
                severity: 'critical',
                message: Math.round(missingPercent) + '% of values are missing.',
            })
        } else if (missingPercent > 5) {
            findings.push({
                severity: 'warning',
                message: Math.round(missingPercent) + '% of values are missing.',
            })
        }
    }

    if (column.typeInconsistencyCount > 0) {
        findings.push({
            severity: 'warning',
            message: column.typeInconsistencyCount + ' values do not match the type most common in this column.',
        })
    }

    if (column.whitespaceIssueCount > 0) {
        findings.push({
            severity: 'warning',
            message: column.whitespaceIssueCount + ' values have leading or trailing whitespace.',
        })
    }

    if (column.outlierCount > 0) {
        findings.push({
            severity: 'warning',
            message: column.outlierCount + ' values look unusually extreme compared to the rest of this column.',
        })
    }

    if (column.distinctCount === 1) {
        findings.push({
            severity: 'warning',
            message: 'Every value in this column is the same.',
        })
    }

    return findings
}

// The worst severity among a column's findings. If there are no findings at
// all, the column is 'good'.
export function getColumnSeverity(column: ColumnAnalysis, rowCount: number): Severity {
    const findings = getColumnFindings(column, rowCount)

    let worstSeverity: Severity = 'good'
    for (const finding of findings) {
        if (finding.severity === 'critical') {
            worstSeverity = 'critical'
        } else if (finding.severity === 'warning' && worstSeverity !== 'critical') {
            worstSeverity = 'warning'
        }
    }

    return worstSeverity
}

// A severity can be compared to another using this order, so we can sort
// columns from worst to best.
export function severityRank(severity: Severity): number {
    if (severity === 'critical') {
        return 2
    } else if (severity === 'warning') {
        return 1
    } else {
        return 0
    }
}

// The worse of two severities. Used to fold the AI's judgment (which can
// catch things the local counts cannot, like the same real-world value
// written in different forms) into the severity already computed from the
// column's stats, without ever letting the AI downgrade a problem the code
// already found.
export function combineSeverity(severityA: Severity, severityB: Severity): Severity {
    if (severityRank(severityB) > severityRank(severityA)) {
        return severityB
    }
    return severityA
}

// Returns a new array of columns, sorted worst-first, so the table's
// default order surfaces the columns that need attention immediately.
export function rankColumns(columns: ColumnAnalysis[], rowCount: number): ColumnAnalysis[] {
    const ranked = [...columns]

    ranked.sort(function (columnA, columnB) {
        const rankA = severityRank(getColumnSeverity(columnA, rowCount))
        const rankB = severityRank(getColumnSeverity(columnB, rowCount))

        if (rankA > rankB) {
            return -1
        } else if (rankA < rankB) {
            return 1
        } else {
            return 0
        }
    })

    return ranked
}

// A 0-5 score for the whole file, computed deterministically in code (not
// asked of the LLM), so it is instant and reproducible. Starts at 5 and
// loses a point for each category of problem found across the file.
export function getQualityScore(analysis: FileAnalysis): number {
    let score = 5

    let hasColumnWithHighMissing = false
    let hasColumnWithTypeInconsistency = false
    for (const column of analysis.columns) {
        let missingPercent = 0
        if (analysis.rowCount > 0) {
            missingPercent = (column.missingCount / analysis.rowCount) * 100
        }

        if (missingPercent > 20) {
            hasColumnWithHighMissing = true
        }
        if (column.typeInconsistencyCount > 0) {
            hasColumnWithTypeInconsistency = true
        }
    }

    if (hasColumnWithHighMissing) {
        score = score - 1
    }
    if (hasColumnWithTypeInconsistency) {
        score = score - 1
    }
    if (analysis.duplicateRowCount > 0) {
        score = score - 1
    }
    if (analysis.emptyRowCount > 0) {
        score = score - 1
    }
    if (analysis.parsingErrorCount > 0) {
        score = score - 1
    }

    if (score < 0) {
        score = 0
    }

    return score
}

// A short label for the score, shown next to the number so its meaning is
// clear without having to read the rest of the page.
export function getScoreLabel(score: number): string {
    if (score >= 5) {
        return 'Excellent'
    } else if (score === 4) {
        return 'Good'
    } else if (score === 3) {
        return 'Needs review'
    } else if (score === 2) {
        return 'Poor'
    } else {
        return 'Critical'
    }
}

// The one-sentence headline shown at the top of the results. Takes the
// number of columns needing attention as a parameter, rather than
// recomputing it, so this always agrees with whatever count is shown
// elsewhere on the page (which may include AI-detected issues that this
// function has no way to see on its own).
export function getVerdictLine(analysis: FileAnalysis, score: number, columnsNeedingAttention: number): string {
    const rowsAndColumns = analysis.rowCount + ' rows across ' + analysis.columnCount + ' columns.'

    let columnWord = 'columns'
    if (columnsNeedingAttention === 1) {
        columnWord = 'column'
    }

    if (columnsNeedingAttention === 0) {
        return rowsAndColumns + ' No significant issues found.'
    } else if (score >= 4) {
        return rowsAndColumns + ' ' + columnsNeedingAttention + ' ' + columnWord + ' could use a closer look.'
    } else {
        return rowsAndColumns + ' ' + columnsNeedingAttention + ' ' + columnWord + ' need attention before this data is analysis-ready.'
    }
}
