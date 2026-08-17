import { useEffect } from 'react'
import { loadCsvFile } from './lib/csv'


function App() {
  
  useEffect(() => {
    const result = loadCsvFile()
    console.log('rows:', result.data.length)
    console.log('columns:', result.meta.fields)
    console.table(result.errors)
  },[])

  return (
    <div>
      <h1> Data analyzer Assistant</h1>
    </div>
  )
}

export default App
