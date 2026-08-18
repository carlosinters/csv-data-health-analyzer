import { useState } from 'react'
import type { LlmProvider } from '../lib/llmSettings'

type SetupFormProps = {
    initialProvider: LlmProvider
    initialApiKey: string
    onSubmit: (file: File, provider: LlmProvider, apiKey: string) => void
}

function SetupForm({ initialProvider, initialApiKey, onSubmit }: SetupFormProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [provider, setProvider] = useState<LlmProvider>(initialProvider)
    const [apiKey, setApiKey] = useState<string>(initialApiKey)

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const files = event.target.files
        if (files !== null && files.length > 0) {
            setSelectedFile(files[0])
        }
    }

    function handleProviderChange(event: React.ChangeEvent<HTMLSelectElement>) {
        setProvider(event.target.value as LlmProvider)
    }

    function handleApiKeyChange(event: React.ChangeEvent<HTMLInputElement>) {
        setApiKey(event.target.value)
    }

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        if (selectedFile === null) {
            return
        }
        onSubmit(selectedFile, provider, apiKey)
    }

    return (
        <form onSubmit={handleSubmit}>
            <h1>Data Analyzer Assistant</h1>
            <p>Select a CSV file to get an honest first read on what is inside it.</p>

            <label>
                CSV file
                <input type="file" accept=".csv" onChange={handleFileChange} />
            </label>

            <label>
                AI provider (optional, adds plain-English insights)
                <select value={provider} onChange={handleProviderChange}>
                    <option value="gemini">Google Gemini</option>
                    <option value="claude">Anthropic Claude</option>
                </select>
            </label>

            <label>
                API key (optional)
                <input
                    type="password"
                    value={apiKey}
                    onChange={handleApiKeyChange}
                    placeholder="Paste your API key here"
                />
            </label>

            <button type="submit" disabled={selectedFile === null}>
                Analyze
            </button>
        </form>
    )
}

export default SetupForm
