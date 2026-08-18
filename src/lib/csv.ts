import Papa from 'papaparse'
import type { ParseResult } from 'papaparse'

export type CsvRow = Record<string, string | number | boolean | null>

// Parsing a real uploaded File is asynchronous (Papa Parse reads it in the
// background and hands the result to a callback), unlike parsing a plain
// string, which returns a result immediately. We wrap that callback in a
// Promise so the rest of the app can just "await" this function like any
// other async call.
export function loadCsvFile(file: File): Promise<ParseResult<CsvRow>> {
    return new Promise(function (resolve, reject) {
        Papa.parse<CsvRow>(file, {
            header: true, //We expect the file to have headers
            skipEmptyLines: true, //We ignore empty lines to load
            dynamicTyping: true, // auto convert values that look like strings to actual strings
            transformHeader: (header) => header.trim(), // Trim whitespace from column names
            //we do not trim rows to detect leading or trailing whitespaces in the data
            complete: function (results) {
                resolve(results)
            },
            error: function (error) {
                // Without this, a failure to even read the file (for example,
                // it isn't really a text file) would leave this Promise
                // pending forever, and the app stuck on "Loading...".
                reject(error)
            },
        })
    })
}
