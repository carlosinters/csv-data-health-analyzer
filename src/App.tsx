import { useEffect, useRef } from 'react'
import { loadCsvFile } from './lib/csv'
import { analyzeFile, summarizeFile } from './lib/analysis'
import { createGeminiClient, createClaudeClient } from './lib/llm'
import type { LlmClient } from './lib/llm'
import { diagnoseColumns } from './lib/columnDiagnosis'

// Change this to 'claude' to use Claude instead of Gemini.
const LLM_PROVIDER: 'gemini' | 'claude' = 'claude'

function App() {
  const hasRunAnalysis = useRef(false)

  useEffect(() => {
    if (hasRunAnalysis.current) {
      // React's StrictMode intentionally mounts this component twice in
      // development to catch effects that aren't safe to run more than
      // once. That's fine for console.log, but the LLM calls below cost
      // real money, so this stops the second run from actually happening.
      return
    }
    hasRunAnalysis.current = true

    const result = loadCsvFile() // Loads a CSV file
    const analysis = analyzeFile(result) // Analyzes the loaded CSV file
    const summary = summarizeFile(analysis) // Generates a summary of the analysis
    console.log(analysis) // Logs the analysis result to the console
    console.log('CSV Analysis Result:', summary) // Logs the analysis summary to the console

    if (summary.isCritical) {
      // The file is fundamentally unusable, so there is nothing useful to
      // send to the LLM.
      return
    }

    let llmClient: LlmClient

    if (LLM_PROVIDER === 'gemini') {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        console.log('No Gemini API key found in .env, skipping LLM analysis.')
        return
      }
      llmClient = createGeminiClient(apiKey)
    } else {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
      if (!apiKey) {
        console.log('No Anthropic API key found in .env, skipping LLM analysis.')
        return
      }
      llmClient = createClaudeClient(apiKey)
    }

    async function runColumnDiagnosis() {
      const diagnosis = await diagnoseColumns(llmClient, analysis) //Await is needed for the function to complete before logging the result
      console.log('Column diagnosis from LLM:', diagnosis)
    }

    runColumnDiagnosis()
  },[])

  return (
    <div>
      <h1> Data analyzer Assistant</h1>
    </div>
  )
}

export default App
