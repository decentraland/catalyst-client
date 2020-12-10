import { EthAddress } from 'dcl-crypto'
import { Profile, Fetcher, RequestOptions } from 'dcl-catalyst-commons'
import { sanitizeUrl } from './utils/Helper'
import { LambdasAPI } from './LambdasAPI'
import merge from 'deepmerge'
import { version } from '../package.json'

export class LambdasClient implements LambdasAPI {
  private readonly lambdasUrl: string
  private readonly fetcher: Fetcher
  private readonly userAgentValue = `lambdas-client/${version} (+https://github.com/decentraland/catalyst-client)`

  constructor(lambdasUrl: string, fetcher?: Fetcher) {
    this.lambdasUrl = sanitizeUrl(lambdasUrl)
    this.fetcher = fetcher ?? new Fetcher({ headers: { 'user-agent': this.getUserAgentValue() } })
  }

  private getUserAgentValue(): string {
    return this.userAgentValue
  }

  fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile> {
    return this.fetcher.fetchJson(merge(options ?? {}, { url: `${this.lambdasUrl}/profile/${ethAddress}` }))
  }
}
