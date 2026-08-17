import Papa from 'papaparse'
import sampleCsvText from '../../data/lakeside_orders_sample.csv?raw'


export type CsvRow = Record <string, string | number | boolean | null>

export function loadCsvFile() {
    return Papa.parse <CsvRow>(sampleCsvText, { //loads the CSV file, assuming a string header and values that are either string, number, boolean or null
        header: true, //We expect the file to have headers
        skipEmptyLines: true, //We ignore empty lines to load
        dynamicTyping: true, // auto convert values that look like strings to actual strings
        transformHeader: (header) => header.trim(), // Trim whitespace from column names
        //we do not trim rows to detect leading or trailing whitespaces in the data     
    })
}