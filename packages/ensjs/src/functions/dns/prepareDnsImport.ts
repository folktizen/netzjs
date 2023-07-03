import { type ProvableAnswer, type SignedSet } from '@ensdomains/dnsprovejs'
import type * as packet from 'dns-packet'
import { toType } from 'dns-packet/types'
import { keccak256, toBytes, toHex } from 'viem'
import { readContract } from 'viem/actions'
import { ClientWithEns } from '../../contracts/consts'
import { anchorsSnippet, rrDataSnippet } from '../../contracts/dnssecImpl'
import { getChainContractAddress } from '../../contracts/getChainContractAddress'
import { DnsNewerRecordTypeAvailableError } from '../../errors/dns'
import { packetToBytes } from '../../utils/hexEncodedName'
import { Endpoint } from './types'

export type PrepareDnsImportParameters = {
  /** Name to prepare for DNS import */
  name: string
  /** An RFC-1035 compatible DNS endpoint to use (default: `https://cloudflare-dns.com/dns-query`) */
  endpoint?: Endpoint
}

export type RrSetWithSig = {
  rrset: Uint8Array
  sig: Uint8Array
}

export type PrepareDnsImportReturnType = {
  rrsets: RrSetWithSig[]
  proof: Uint8Array
}

// Compares two serial numbers using RFC1982 serial number math.
const serialNumberGt = (i1: number, i2: number): boolean =>
  (i1 < i2 && i2 - i1 > 0x7fffffff) || (i1 > i2 && i1 - i2 < 0x7fffffff)

const encodeProofs = (
  proofs: SignedSet<packet.Ds | packet.Dnskey | packet.Rtxt>[],
): RrSetWithSig[] =>
  proofs.map((proof) => ({
    rrset: proof.toWire(true),
    sig: proof.signature.data.signature,
  }))

/**
 * Creates prepared data for `importDnsName()`
 * @param client - {@link ClientWithEns}
 * @param parameters - {@link PrepareDnsImportParameters}
 * @returns Prepared data object
 *
 * @example
 * import { createPublicClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { addContracts, prepareDnsImport } from '@ensdomains/ensjs'
 *
 * const mainnetWithEns = addContracts([mainnet])
 * const client = createPublicClient({
 *   chain: mainnetWithEns,
 *   transport: http(),
 * })
 * const preparedData = await prepareDnsImport(client, {
 *   name: 'example.eth',
 * })
 */
const prepareDnsImport = async (
  client: ClientWithEns,
  {
    name,
    endpoint = 'https://cloudflare-dns.com/dns-query',
  }: PrepareDnsImportParameters,
): Promise<PrepareDnsImportReturnType> => {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { DNSProver } = await import('@ensdomains/dnsprovejs')
  const prover = DNSProver.create(endpoint)
  const result = (await prover.queryWithProof(
    'TXT',
    `_ens.${name}`,
  )) as ProvableAnswer<packet.Rtxt>

  const allProofs = (
    result.proofs as SignedSet<packet.Ds | packet.Dnskey | packet.Rtxt>[]
  ).concat([result.answer])

  const ensDnssecImplAddress = getChainContractAddress({
    client,
    contract: 'ensDnssecImpl',
  })

  for (let i = allProofs.length - 1; i >= 0; i -= 1) {
    const proof = allProofs[i]
    const hexEncodedName = toHex(packetToBytes(proof.signature.name))
    const type = toType(proof.signature.data.typeCovered)
    // eslint-disable-next-line no-await-in-loop
    const [inception, expiration, hash] = await readContract(client, {
      abi: rrDataSnippet,
      address: ensDnssecImplAddress,
      functionName: 'rrdata',
      args: [type, hexEncodedName],
    })
    if (serialNumberGt(inception, proof.signature.data.inception))
      throw new DnsNewerRecordTypeAvailableError({
        typeCovered: proof.signature.data.typeCovered,
        signatureName: proof.signature.name,
        onchainInception: inception,
        dnsInception: proof.signature.data.inception,
      })
    const expired = serialNumberGt(Date.now() / 1000, expiration)
    const proofHash = keccak256(proof.toWire(false)).slice(0, 42)
    const isKnownProof = hash === proofHash && !expired
    if (isKnownProof) {
      if (i === allProofs.length - 1) {
        return { rrsets: [], proof: proof.toWire(false) }
      }
      return {
        rrsets: encodeProofs(allProofs.slice(i + 1, allProofs.length)),
        proof: proof.toWire(false),
      }
    }
  }

  return {
    rrsets: encodeProofs(allProofs),
    proof: toBytes(
      await readContract(client, {
        abi: anchorsSnippet,
        address: ensDnssecImplAddress,
        functionName: 'anchors',
      }),
    ),
  }
}

export default prepareDnsImport
