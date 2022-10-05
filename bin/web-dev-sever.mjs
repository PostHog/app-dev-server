import express from 'express'
import cors from 'cors'
import fse from 'fs-extra'
import { transform } from '@babel/standalone'

console.log(`Usage: web-dev-server [apiKey] [host] [pathTo/web.ts]`)

const defaultHost = 'localhost'
const defaultPort = 3040

const posthogKey = process.argv[2] || 'test'
const posthogHost = process.argv[3] || 'http://localhost:8000'
const webTsPath = process.argv[4] || 'web.ts'

export function startServer(opts = {}) {
    const host = opts.host || defaultHost
    const port = opts.port || defaultPort

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
    app.get('/', async (req, res) => {
        let pluginJson = {}
        let config = {}
        try {
            pluginJson = JSON.parse(fse.readFileSync('plugin.json', { encoding: 'utf-8' }))
            for (const configEntry of pluginJson.config || []) {
                if (configEntry.web) {
                    config[configEntry.key] = configEntry.default
                }
            }
        } catch (e) {
            console.error(`🤔 Could not read plugin.json.`)
            process.exit(1)
        }
        const webTsSource = fse.readFileSync(webTsPath, { encoding: 'utf-8' })
        const { code } = transform(webTsSource, {
            envName: 'production',
            code: true,
            babelrc: false,
            configFile: false,
            filename: 'web.ts',
            presets: [['typescript', { isTSX: false, allExtensions: true }], 'env'],
        })

        res.send(`
            <html>
                <head>
                    <title>${pluginJson.name || 'PostHog App'}</title>
                    <script>
                        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
                        posthog.init(${JSON.stringify(posthogKey)},{
                            api_host: ${JSON.stringify(posthogHost)},
                            opt_in_web_app_injection: false, // opt out of all other apps 
                        })
                    </script>
                </head>
                <body>
                    <h1>${pluginJson.name || 'PostHog App'}</h1>
                    <pre>plugin = ${JSON.stringify(pluginJson, null, 2)}</pre>
                    <pre>config = ${JSON.stringify(config, null, 2)}</pre>
                    <script>
                        let exports = {};
                        ${code}
                        var config = ${JSON.stringify(config)};
                        inject({ config: config, posthog: window.posthog });
                    </script>
                </body>
            </html>
        `)
    })
    app.listen(port)
    return app
}

startServer()
