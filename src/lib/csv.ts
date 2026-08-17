import Papa from 'papaparse'
import sampleCsvText from '../../data/lakeside_orders_sample.csv?raw'

export function loadCsvFile() {
    return Papa.parse(sampleCsvText, {header: true, skipEmptyLines: true, })
}