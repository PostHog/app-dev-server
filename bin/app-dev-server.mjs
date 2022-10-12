#!/usr/bin/env node
import { startServer } from '../src/server.mjs'

console.log(`Usage: npx @posthog/app-dev-server [apiKey] [host] [pathTo/site.ts]`)

startServer({
    posthogKey: process.argv[2] || 'test',
    posthogHost: process.argv[3] || 'http://localhost:8000',
    siteTsPath: process.argv[4] || 'site.ts',
})
