import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json')
if (!configPath) throw new Error('Could not find tsconfig.json')

const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath))
const program = ts.createProgram(parsed.fileNames, parsed.options)
const diagnostics = ts.getPreEmitDiagnostics(program)
const counts = new Map()
const detailFilter = process.argv[2]

if (detailFilter) {
  for (const diagnostic of diagnostics) {
    const absoluteFileName = diagnostic.file?.fileName
    const fileName = absoluteFileName
      ? path.relative(process.cwd(), absoluteFileName).replaceAll('\\', '/')
      : '<project>'
    if (!fileName.includes(detailFilter)) continue

    const location = diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null
    const suffix = location ? `:${location.line + 1}:${location.character + 1}` : ''
    console.log(`${fileName}${suffix} TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
  }
  process.exitCode = diagnostics.length === 0 ? 0 : 1
  process.exit()
}

for (const diagnostic of diagnostics) {
  const fileName = diagnostic.file?.fileName
    ? path.relative(process.cwd(), diagnostic.file.fileName).replaceAll('\\', '/')
    : '<project>'
  counts.set(fileName, (counts.get(fileName) ?? 0) + 1)
}

for (const [fileName, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${count}\t${fileName}`)
}

console.log(`Total: ${diagnostics.length} error(s) across ${counts.size} file(s)`)
process.exitCode = diagnostics.length === 0 ? 0 : 1
