import { useState } from 'react'
import { loadCsvFile } from './lib/csv'
import { analyzeFile, summarizeFile } from './lib/analysis'
import type { FileAnalysis, FileSummary } from './lib/analysis'
import { createGeminiClient, createClaudeClient } from './lib/llm'
import { diagnoseColumns } from './lib/columnDiagnosis'
import type { ColumnDiagnosis } from './lib/columnDiagnosis'
import { loadLlmSettings, saveLlmSettings } from './lib/llmSettings'
import type { LlmProvider } from './lib/llmSettings'
import SetupForm from './components/SetupForm'
import AnalysisResults from './components/AnalysisResults'

type Stage = 'setup' | 'analyzing' | 'results'
type LlmStatus = 'idle' | 'loading' | 'success' | 'error'

function App() {
    const [stage, setStage] = useState<Stage>('setup')
    const [analysis, setAnalysis] = useState<FileAnalysis | null>(null)
    const [summary, setSummary] = useState<FileSummary | null>(null)
    const [columnDiagnosis, setColumnDiagnosis] = useState<ColumnDiagnosis[] | null>(null)
    const [llmStatus, setLlmStatus] = useState<LlmStatus>('idle')
    const [llmError, setLlmError] = useState<string | null>(null)

    const savedSettings = loadLlmSettings()
    const initialProvider: LlmProvider = savedSettings ? savedSettings.provider : 'gemini'
    const initialApiKey = savedSettings ? savedSettings.apiKey : ''

    async function handleAnalyze(file: File, provider: LlmProvider, apiKey: string) {
        saveLlmSettings({ provider: provider, apiKey: apiKey })
        setStage('analyzing')

        const result = await loadCsvFile(file)
        const newAnalysis = analyzeFile(result)
        const newSummary = summarizeFile(newAnalysis)

        setAnalysis(newAnalysis)
        setSummary(newSummary)
        setStage('results')

        if (newSummary.isCritical) {
            // Nothing usable to send to the LLM.
            return
        }

        if (apiKey.trim() === '') {
            // No key provided - the code-only results are still shown, we
            // just never attempt an LLM call.
            return
        }

        setLlmStatus('loading')

        try {
            const llmClient = provider === 'gemini' ? createGeminiClient(apiKey) : createClaudeClient(apiKey)
            const diagnosis = await diagnoseColumns(llmClient, newAnalysis)
            setColumnDiagnosis(diagnosis)
            setLlmStatus('success')
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            setLlmError(message)
            setLlmStatus('error')
        }
    }

    return (
        <div>
            {stage === 'setup' && (
                <SetupForm
                    initialProvider={initialProvider}
                    initialApiKey={initialApiKey}
                    onSubmit={handleAnalyze}
                />
            )}

            {stage === 'analyzing' && <p>Loading and analyzing your file...</p>}

            {stage === 'results' && analysis && summary && (
                <AnalysisResults
                    analysis={analysis}
                    summary={summary}
                    columnDiagnosis={columnDiagnosis}
                    llmStatus={llmStatus}
                    llmError={llmError}
                />
            )}
        </div>
    )
}

export default App
