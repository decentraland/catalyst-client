import { EthAddress } from 'dcl-crypto'
import { Profile, RequestOptions } from "dcl-catalyst-commons";

export interface LambdasAPI {

    /** Retrieve / Download */
    fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile>;

}