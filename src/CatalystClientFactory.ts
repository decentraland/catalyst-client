import { Fetcher } from 'dcl-catalyst-commons'
import { DeploymentBuilder } from './utils'

export type CatalystClientOptions = {
  catalystUrl: string
  origin: string // The name or a description of the app that is using the client
  proofOfWorkEnabled: boolean
  fetcher?: Fetcher
  deploymentBuilderClass?: typeof DeploymentBuilder
}
