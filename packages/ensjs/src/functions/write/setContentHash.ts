import {
  Account,
  Address,
  Hash,
  SendTransactionParameters,
  Transport,
} from 'viem'
import { ChainWithEns, WalletWithEns } from '../../contracts/addContracts'
import {
  Prettify,
  SimpleTransactionRequest,
  WriteTransactionParameters,
} from '../../types'
import { encodeSetContentHash } from '../../utils/encoders/encodeSetContentHash'
import { namehash } from '../../utils/normalise'

export type SetContentHashDataParameters = {
  /** Name to set content hash for */
  name: string
  /** Content hash value */
  contentHash: string | null
  /** Resolver address to set content hash on */
  resolverAddress: Address
}

export type SetContentHashDataReturnType = SimpleTransactionRequest

export type SetContentHashParameters<
  TChain extends ChainWithEns,
  TAccount extends Account | undefined,
  TChainOverride extends ChainWithEns | undefined,
> = Prettify<
  SetContentHashDataParameters &
    WriteTransactionParameters<TChain, TAccount, TChainOverride>
>

export type SetContentHashReturnType = Hash

export const makeFunctionData = <
  TChain extends ChainWithEns,
  TAccount extends Account | undefined,
>(
  _wallet: WalletWithEns<Transport, TChain, TAccount>,
  { name, contentHash, resolverAddress }: SetContentHashDataParameters,
): SetContentHashDataReturnType => {
  return {
    to: resolverAddress,
    data: encodeSetContentHash({ namehash: namehash(name), contentHash }),
  }
}

/**
 * Sets the content hash record for a name on a resolver.
 * @param wallet - {@link WalletWithEns}
 * @param parameters - {@link SetContentHashParameters}
 * @returns Transaction hash. {@link SetContentHashReturnType}
 *
 * @example
 * import { createPublicClient, createWalletClient, http, custom } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { addContracts, setContentHash } from '@ensdomains/ensjs'
 *
 * const [mainnetWithEns] = addContracts([mainnet])
 * const client = createPublicClient({
 *   chain: mainnetWithEns,
 *   transport: http(),
 * })
 * const wallet = createWalletClient({
 *   chain: mainnetWithEns,
 *   transport: custom(window.ethereum),
 * })
 * const hash = await setContentHash(wallet, {
 *   name: 'ens.eth',
 *   value: 'ipns://k51qzi5uqu5djdczd6zw0grmo23j2vkj9uzvujencg15s5rlkq0ss4ivll8wqw',
 *   resolverAddress: '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41',
 * })
 * // 0x...
 */
async function setContentHash<
  TChain extends ChainWithEns,
  TAccount extends Account | undefined,
  TChainOverride extends ChainWithEns | undefined = ChainWithEns,
>(
  wallet: WalletWithEns<Transport, TChain, TAccount>,
  {
    name,
    contentHash,
    resolverAddress,
    ...txArgs
  }: SetContentHashParameters<TChain, TAccount, TChainOverride>,
): Promise<SetContentHashReturnType> {
  const data = makeFunctionData(wallet, {
    name,
    contentHash,
    resolverAddress,
  })
  const writeArgs = {
    ...data,
    ...txArgs,
  } as SendTransactionParameters<TChain, TAccount, TChainOverride>
  return wallet.sendTransaction(writeArgs)
}

setContentHash.makeFunctionData = makeFunctionData

export default setContentHash
