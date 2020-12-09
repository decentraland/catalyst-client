import { EthAddress } from 'dcl-crypto'
import { Profile } from 'dcl-catalyst-commons'
import { RequestOptions } from 'dcl-catalyst-commons/dist/utils/FetcherConfiguration'

export interface LambdasAPI {
  /** Retrieve / Download */
  fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile>
}
