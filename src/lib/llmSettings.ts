export type LlmProvider = 'gemini' | 'claude'

export type LlmSettings = {
    provider: LlmProvider
    apiKey: string
}

// These are just the names of the two slots we use in the browser's
// localStorage - a small key-value store that persists between page reloads,
// but never leaves the browser (nothing here is sent to any server of ours,
// since we don't have one).
const PROVIDER_STORAGE_KEY = 'llmProvider'
const API_KEY_STORAGE_KEY = 'llmApiKey'

export function saveLlmSettings(settings: LlmSettings): void {
    localStorage.setItem(PROVIDER_STORAGE_KEY, settings.provider)
    localStorage.setItem(API_KEY_STORAGE_KEY, settings.apiKey)
}

// Returns the saved settings, or null if nothing has been saved yet (for
// example, the very first time someone opens the app).
export function loadLlmSettings(): LlmSettings | null {
    const savedProvider = localStorage.getItem(PROVIDER_STORAGE_KEY)
    const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY)

    if (savedProvider === null || savedApiKey === null) {
        return null
    }

    if (savedProvider !== 'gemini' && savedProvider !== 'claude') {
        // Defensive check: localStorage can only hold plain strings, so
        // TypeScript cannot guarantee this string is really a valid
        // LlmProvider. If it somehow isn't, treat it as nothing saved.
        return null
    }

    return {
        provider: savedProvider,
        apiKey: savedApiKey,
    }
}

export function clearLlmSettings(): void {
    localStorage.removeItem(PROVIDER_STORAGE_KEY)
    localStorage.removeItem(API_KEY_STORAGE_KEY)
}
