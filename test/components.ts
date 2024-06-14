import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createServerComponent, Router } from '@well-known-components/http-server'
import {
  IConfigComponent,
  IHttpServerComponent,
  ILoggerComponent,
  IMiddlewareAdapterHandler,
  Lifecycle
} from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createRunner, defaultServerConfig } from '@well-known-components/test-helpers'
import * as util from 'util'
import DefaultContext = IHttpServerComponent.DefaultContext

const logRequestMiddleware: IMiddlewareAdapterHandler<
  DefaultContext<AppContext>,
  IHttpServerComponent.IResponse
> = async function logger(ctx: DefaultContext<AppContext>, next: () => Promise<IHttpServerComponent.IResponse>) {
  const headers: Record<string, string> = {}

  for (const [header, value] of ctx.request.headers) {
    headers[header] = value
  }

  console.log('Test server got request:\n', ctx.request.method, ctx.url.toString(), JSON.stringify(headers, null, 2))
  const response = await next()
  console.log('Test server will send response:\n' + util.inspect(response, false, 30))
  return response
}

// Record of components
export type TestComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<AppContext>
  router: Router<AppContext>
  getBaseUrl: () => Promise<string>
}

// Context passed to all handlers, we always include the components here
export type AppContext = {
  components: TestComponents
}

// main entry point of the application, it's role is to wire components
// together (controllers, handlers) and ultimately start the components
// by calling startComponents
async function main({ components, startComponents }: Lifecycle.EntryPointParameters<TestComponents>) {
  const globalContext: AppContext = { components }

  components.server.setContext(globalContext)

  components.server.use(logRequestMiddleware)
  components.server.use(components.router.middleware())

  // start server and other components
  await startComponents()
}

// initComponents role is to create BUT NOT START the components,
// this function is only called once by the Lifecycle manager
async function initComponents(): Promise<TestComponents> {
  const logs = await createLogComponent({})

  const config = createConfigComponent(defaultServerConfig())

  const server = await createServerComponent<AppContext>({ logs, config }, {})

  const router = new Router<AppContext>()

  const getBaseUrl = async () => {
    return `http://${await config.requireString('HTTP_SERVER_HOST')}:${await config.requireString('HTTP_SERVER_PORT')}`
  }

  return /*components*/ {
    logs,
    config,
    server,
    router,
    getBaseUrl
  }
}

export const runServerBasedE2ETest = createRunner<TestComponents>({ initComponents, main })
