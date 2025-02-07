import { createConfigComponent } from '@well-known-components/env-config-provider'
import { IConfigComponent, ILoggerComponent, Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createRunner, defaultServerConfig } from '@well-known-components/test-helpers'

// Record of components
export type TestComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  getBaseUrl: () => Promise<string>
}

// Context passed to all handlers, we always include the components here
export type AppContext = {
  components: TestComponents
}

// main entry point of the application, it's role is to wire components
// together (controllers, handlers) and ultimately start the components
// by calling startComponents
async function main({ components: _components, startComponents }: Lifecycle.EntryPointParameters<TestComponents>) {
  await startComponents()
}

// initComponents role is to create BUT NOT START the components,
// this function is only called once by the Lifecycle manager
async function initComponents(): Promise<TestComponents> {
  const logs = await createLogComponent({})

  const config = createConfigComponent(defaultServerConfig())

  const getBaseUrl = async () => {
    return `http://${await config.requireString('HTTP_SERVER_HOST')}:${await config.requireString('HTTP_SERVER_PORT')}`
  }

  return /*components*/ {
    logs,
    config,
    getBaseUrl
  }
}

export const runServerBasedE2ETest = createRunner<TestComponents>({ initComponents, main })
