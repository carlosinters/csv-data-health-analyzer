import { useEffect } from 'react'
import { loadCsvFile } from './lib/csv'
import { analyzeFile } from './lib/analysis'


function App() {
  
  useEffect(() => {
    const result = loadCsvFile() // Loads a CSV file
    const analysis = analyzeFile(result) // Analyzes the loaded CSV file
    console.log('CSV Analysis Result:', analysis) // Logs the analysis result to the console
  },[])

  return (
    <div>
      <h1> Data analyzer Assistant</h1>
    </div>
  )
}

export default App
