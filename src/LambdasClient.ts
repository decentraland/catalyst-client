import { EthAddress } from 'dcl-crypto'
import { Profile, Fetcher, RequestOptions } from 'dcl-catalyst-commons'
import { sanitizeUrl } from './utils/Helper'
import { LambdasAPI } from './LambdasAPI'

export class LambdasClient implements LambdasAPI {
  private readonly lambdasUrl: string

  constructor(lambdasUrl: string, private readonly fetcher: Fetcher = new Fetcher()) {
    this.lambdasUrl = sanitizeUrl(lambdasUrl)
  }

  fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile> {
    return this.fetcher.fetchJson(`${this.lambdasUrl}/profile/${ethAddress}`, options)
  }
}
