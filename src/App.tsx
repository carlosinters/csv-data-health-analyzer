import { useState } from 'react'
import { loadCsvFile } from './lib/csv'
import { analyzeFile, summarizeFile } from './lib/analysis'
import type { FileAnalysis, FileSummary } from './lib/analysis'
import { createGeminiClient, createClaudeClient } from './lib/llm'
import { diagnoseFile } from './lib/columnDiagnosis'
import type { FileDiagnosis } from './lib/columnDiagnosis'
import { loadLlmSettings, saveLlmSettings } from './lib/llmSettings'
import type { LlmProvider, LlmSettings } from './lib/llmSettings'
import SetupForm from './components/SetupForm'
import AnalysisResults from './components/AnalysisResults'

type Stage = 'setup' | 'analyzing' | 'results'
type LlmStatus = 'idle' | 'loading' | 'success' | 'error'

// Reads localStorage once, the first time the component is created, instead
// of on every single render.
function getInitialLlmSettings(): LlmSettings {
    const savedSettings = loadLlmSettings()
    if (savedSettings !== null) {
        return savedSettings
    }
    return { provider: 'gemini', apiKey: '' }
}

function App() {
    const [stage, setStage] = useState<Stage>('setup')
    const [analysis, setAnalysis] = useState<FileAnalysis | null>(null)
    const [summary, setSummary] = useState<FileSummary | null>(null)
    const [fileDiagnosis, setFileDiagnosis] = useState<FileDiagnosis | null>(null)
    const [llmStatus, setLlmStatus] = useState<LlmStatus>('idle')
    const [llmError, setLlmError] = useState<string | null>(null)
    const [fileError, setFileError] = useState<string | null>(null)
    const [initialSettings] = useState<LlmSettings>(getInitialLlmSettings)

    async function handleAnalyze(file: File, provider: LlmProvider, apiKey: string) {
        saveLlmSettings({ provider: provider, apiKey: apiKey })
        setFileError(null)
        setStage('analyzing')

        let newAnalysis: FileAnalysis
        let newSummary: FileSummary

        try {
            const result = await loadCsvFile(file)
            newAnalysis = analyzeFile(result)
            newSummary = summarizeFile(newAnalysis)
        } catch (error) {
            let message = 'Unknown error'
            if (error instanceof Error) {
                message = error.message
            }
            setFileError(message)
            setStage('setup')
            return
        }

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
            let llmClient
            if (provider === 'gemini') {
                llmClient = createGeminiClient(apiKey)
            } else {
                llmClient = createClaudeClient(apiKey)
            }

            const diagnosis = await diagnoseFile(llmClient, newAnalysis)
            setFileDiagnosis(diagnosis)
            setLlmStatus('success')
        } catch (error) {
            let message = 'Unknown error'
            if (error instanceof Error) {
                message = error.message
            }
            setLlmError(message)
            setLlmStatus('error')
        }
    }

    function handleReset() {
        setStage('setup')
        setAnalysis(null)
        setSummary(null)
        setFileDiagnosis(null)
        setLlmStatus('idle')
        setLlmError(null)
        setFileError(null)
    }

    return (
        <div>
            {stage === 'setup' && (
                <SetupForm
                    initialProvider={initialSettings.provider}
                    initialApiKey={initialSettings.apiKey}
                    fileError={fileError}
                    onSubmit={handleAnalyze}
                />
            )}

            {stage === 'analyzing' && <p>Loading and analyzing your file...</p>}

            {stage === 'results' && analysis && summary && (
                <AnalysisResults
                    analysis={analysis}
                    summary={summary}
                    fileDiagnosis={fileDiagnosis}
                    llmStatus={llmStatus}
                    llmError={llmError}
                    onReset={handleReset}
                />
            )}
        </div>
    )
}

export default App
