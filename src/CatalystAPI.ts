import { ContentAPI } from './ContentAPI'
import { LambdasAPI } from './LambdasAPI'

export interface CatalystAPI extends ContentAPI, LambdasAPI {
  getCatalystUrl(): string
}
