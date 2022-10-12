#!/usr/bin/env node
import express from 'express'
import cors from 'cors'
import fse from 'fs-extra'
import { transform } from '@babel/standalone'
import chokidar from 'chokidar'
import { createHash } from 'crypto'

const defaultHost = 'localhost'
const defaultPort = 3040

let clients = new Set()

function reloadLiveServer() {
    clients.forEach((client) => client.write(`data: reload\n\n`))
}

export function startServer(opts = {}) {
    const { host, port, posthogHost, posthogKey, siteTsPath } = {
        host: defaultHost,
        port: defaultPort,
        posthogKey: 'test',
        posthogHost: 'http://localhost:8000',
        siteTsPath: 'site.ts',
        ...opts,
    }

    console.log(`🍱 Starting server at http://${host}:${port}`)

    const app = express()
    app.on('error', function (e) {
        if (e.code === 'EADDRINUSE') {
            console.error(`🛑 http://${host}:${port} is already in use. Trying another port.`)
        } else {
            console.error(`🛑 ${e}`)
        }
        process.exit(1)
    })
    app.use(cors())
    app.get('/_reload', (request, response) => {
        response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache',
        })
        clients.add(response)
        request.on('close', () => clients.delete(response))
    })

    app.get('/', async (req, res) => {
        let pluginJson = {}
        let config = {}
        try {
            pluginJson = JSON.parse(fse.readFileSync('plugin.json', { encoding: 'utf-8' }))
            for (const configEntry of pluginJson.config || []) {
                if (configEntry.site) {
                    config[configEntry.key] = configEntry.default
                }
            }
        } catch (e) {
            console.error(`🤔 Could not read plugin.json: ${e.message}`)
            res.status(500).send(`Could not read plugin.json: ${e.message}`)
            return
        }

        let siteJs = ''
        try {
            const siteTsSource = fse.readFileSync(siteTsPath, { encoding: 'utf-8' })
            const { code } = transform(siteTsSource, {
                envName: 'production',
                code: true,
                babelrc: false,
                configFile: false,
                filename: 'site.ts',
                presets: [['typescript', { isTSX: false, allExtensions: true }], 'env'],
            })
            siteJs = code
        } catch (e) {}

        const localStorageKey =
            'siteConfig-' + createHash('md5').update(JSON.stringify(pluginJson.config)).digest('hex')

        res.send(`
            <html>
                <head>
                    <title>${pluginJson.name || 'PostHog App'}</title>
                    <script>
                        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
                        posthog.init(${JSON.stringify(posthogKey)},{
                            api_host: ${JSON.stringify(posthogHost)},
                            opt_in_site_apps: false, // opt out of all other apps 
                        })
                    </script>
                    <script type="text/javascript">
                        if ('EventSource' in window) {
                            ;(function () {
                                var eventSource = new EventSource('/_reload');
                                eventSource.onmessage = () => window.location.reload()
                                console.log('Live reload enabled.')
                            })()
                        }
                    </script>
                    <script>
                        const localStorageKey = ${JSON.stringify(localStorageKey)}
                        function setConfig(config) {
                            localStorage.setItem(localStorageKey, JSON.stringify(config))
                        }
                        function getDefaultConfig() {
                            return ${JSON.stringify(config)}
                        }
                        function getConfig() {
                            return JSON.parse(localStorage.getItem(localStorageKey) || 'null') || getDefaultConfig()
                        }
                        function resetConfig() {
                            localStorage.setItem(localStorageKey, null)
                        }
                    </script>
                </head>
                <body>
                    <h1>${pluginJson.name || 'PostHog Site App'}</h1>
                    <pre>plugin.json = ${JSON.stringify(pluginJson, null, 2)}</pre>
                    <h2>site.ts</h2>
                    ${
                        siteJs
                            ? `
                        <p>
                            Edit <code>site.ts</code> and save to reload. Look at the browser console for errors.
                            Update the plugin's config below:
                        </p>
                        <textarea id='siteConfig' style='width:100%;height:30vh;'></textarea>
                        <script>document.getElementById("siteConfig").value = JSON.stringify(getConfig(), null, 4)</script>
                        <button type='button' onclick='setConfig(JSON.parse(document.getElementById("siteConfig").value));window.location.reload()'>Update</button>
                        <button type='button' onclick='resetConfig();window.location.reload()'>Reset</button>
                        <script>
                            let exports = {};
                            ${siteJs}
                            inject({ config: getConfig(), posthog: window.posthog });
                        </script>`
                            : 'This app does not come with a <code>site.ts</code> file.'
                    }
                </body>
            </html>
        `)
    })
    app.listen(port)

    chokidar
        .watch('*', {
            ignoreInitial: true,
        })
        .on('all', (event, filePath) => {
            console.log('🔄 Reloading. Changes in ' + filePath)
            reloadLiveServer()
        })

    return app
}
