console.time('next-wall-time')
// Usage: node scripts/minimal-server.js <path-to-app-dir>
// This script is used to run a minimal Next.js server in production mode.

process.env.NODE_ENV = 'production'

// Change this to 'experimental' for server actions
process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = 'next'

if (process.env.LOG_REQUIRE) {
  const originalRequire = require('module').prototype.require

  require('module').prototype.require = function (path) {
    const start = performance.now()
    const result = originalRequire.apply(this, arguments)
    const end = performance.now()
    console.log(`${path}, ${end - start}`)

    return result
  }
}

if (process.env.LOG_COMPILE) {
  const originalCompile = require('module').prototype._compile
  const currentDir = process.cwd()
  require('module').prototype._compile = function (content, filename) {
    const strippedFilename = filename.replace(currentDir, '')
    console.time(`Module '${strippedFilename}' compiled`)
    const result = originalCompile.apply(this, arguments)
    console.timeEnd(`Module '${strippedFilename}' compiled`)
    return result
  }
}

const appDir = process.argv[2]
const absoluteAppDir = require('path').resolve(appDir)
process.chdir(absoluteAppDir)

let readFileCount = 0
let readFileSyncCount = 0

if (process.env.LOG_READFILE) {
  const originalReadFile = require('fs').readFile
  const originalReadFileSync = require('fs').readFileSync

  require('fs').readFile = function (path, options, callback) {
    readFileCount++
    console.log(`readFile: ${path}`)
    return originalReadFile.apply(this, arguments)
  }

  require('fs').readFileSync = function (path, options) {
    readFileSyncCount++
    console.log(`readFileSync: ${path}`)
    return originalReadFileSync.apply(this, arguments)
  }
}

console.time('next-cold-start')

const NextServer = process.env.USE_BUNDLED_NEXT
  ? require('next/dist/compiled/minimal-next-server/server.runtime').default
  : require('next/dist/server/next-server').default

require('react')
require('react/jsx-runtime')
require('react-dom')
require('react-dom/server.edge')
require('react-server-dom-webpack/client.edge')
;[
  'next/dist/server/app-render/get-segment-param',
  'next/dist/shared/lib/app-router-context',
  'next/dist/shared/lib/constants',
  'next/dist/shared/lib/hooks-client-context',
  'next/dist/shared/lib/router/utils/add-path-prefix',
  'next/dist/shared/lib/router/utils/handle-smooth-scroll',
  'next/dist/shared/lib/server-inserted-html',
  'next/dist/shared/lib/router/utils/is-bot',
].forEach((mod) => require(mod))

if (process.env.USE_BUNDLED_NEXT) {
  require('next/dist/compiled/minimal-next-server/app-page-render.runtime')
}

if (process.env.LOG_READFILE) {
  console.log(`readFileCount: ${readFileCount + readFileSyncCount}`)
}

const path = require('path')

const distDir = '.next'

const compiledConfig = require(path.join(
  absoluteAppDir,
  distDir,
  'required-server-files.json'
)).config

const nextServer = new NextServer({
  conf: compiledConfig,
  dir: '.',
  distDir: distDir,
  minimalMode: true,
  customServer: false,
})

const requestHandler = nextServer.getRequestHandler()

require('http')
  .createServer((req, res) => {
    console.time('next-request')
    readFileCount = 0
    readFileSyncCount = 0

    return requestHandler(req, res)
      .catch((err) => {
        console.error(err)
        res.statusCode = 500
        res.end('Internal Server Error')
      })
      .finally(() => {
        console.timeEnd('next-request')
        if (process.env.LOG_READFILE) {
          console.log(`readFileCount: ${readFileCount + readFileSyncCount}`)
        }
        console.timeEnd('next-wall-time')
        require('process').exit(0)
      })
  })
  .listen(3000, () => {
    console.timeEnd('next-cold-start')
    fetch('http://localhost:3000')
  })
