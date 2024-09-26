/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-await-in-loop */
// eslint-disable-next-line @typescript-eslint/naming-convention
const { BigNumber } = require('ethers')
const { ethers } = require('hardhat')
const { namehash } = require('viem/ens')
const { MAX_DATE_INT } = require('../dist/cjs/utils/consts')
const { encodeFuses } = require('../dist/cjs/utils/fuses')

/**
 * @type {{
 *  label: string
 *  namedOwner: string
 *  data?: any[]
 *  reverseRecord?: boolean
 *  fuses?: number
 *  subnames?: {
 *    label: string
 *    namedOwner: string
 *    fuses?: number
 *    expiry?: number
 *  }[]
 *  duration?: number | BigNumber
 * }[]}
 */
const names = [
  {
    label: 'wrapped',
    namedOwner: 'owner',
    reverseRecord: true,
  },
  {
    label: 'wrapped-with-subnames',
    namedOwner: 'owner',
    subnames: [
      { label: 'test', namedOwner: 'owner2' },
      { label: 'legacy', namedOwner: 'owner2' },
      { label: 'xyz', namedOwner: 'owner2' },
      { label: 'addr', namedOwner: 'owner2' },
    ],
  },
  {
    label: 'expired-wrapped',
    namedOwner: 'owner',
    subnames: [{ label: 'test', namedOwner: 'owner2' }],
    duration: 2419200,
  },
  {
    label: 'wrapped-big-duration',
    namedOwner: 'owner3',
    duration: Math.floor((MAX_DATE_INT - Date.now()) / 1000),
  },
  {
    label: 'wrapped-max-duration',
    namedOwner: 'owner3',
    duration: BigNumber.from('18446744073709'),
  },
  {
    label: 'wrapped-with-expiring-subnames',
    namedOwner: 'owner',
    fuses: encodeFuses({
      input: {
        child: {
          named: ['CANNOT_UNWRAP'],
        },
      },
    }),
    subnames: [
      {
        label: 'test',
        namedOwner: 'owner2',
        expiry: Math.floor(Date.now() / 1000),
      },
      {
        label: 'test1',
        namedOwner: 'owner2',
        expiry: 0,
      },
      {
        label: 'recent-pcc',
        namedOwner: 'owner2',
        expiry: Math.floor(Date.now() / 1000),
        fuses: encodeFuses({
          input: {
            parent: { named: ['PARENT_CANNOT_CONTROL'] },
          },
        }),
      },
      {
        label: 'pcc',
        namedOwner: 'owner2',
        expiry: MAX_DATE_INT,
        fuses: encodeFuses({
          input: {
            parent: { named: ['PARENT_CANNOT_CONTROL'] },
          },
        }),
      },
    ],
  },
]

/**
 * @type {import('hardhat-deploy/types').DeployFunction}
 */
const func = async function (hre) {
  const { getNamedAccounts, network } = hre
  const allNamedAccts = await getNamedAccounts()

  const controller = await ethers.getContract('ETHRegistrarController')
  const publicResolver = await ethers.getContract('PublicResolver')

  await network.provider.send('anvil_setBlockTimestampInterval', [60])

  for (const {
    label,
    namedOwner,
    data = [],
    reverseRecord = false,
    fuses = 0,
    subnames,
    duration = 31536000,
  } of names) {
    const secret =
      '0x0000000000000000000000000000000000000000000000000000000000000000'
    const owner = allNamedAccts[namedOwner]
    const resolver = publicResolver.address

    const commitment = await controller.makeCommitment(
      label,
      owner,
      duration,
      secret,
      resolver,
      data,
      reverseRecord,
      fuses,
    )

    const _controller = controller.connect(await ethers.getSigner(owner))
    const commitTx = await controller.commit(commitment)
    console.log(
      `Committing commitment for ${label}.eth (tx: ${commitTx.hash})...`,
    )
    await commitTx.wait()

    await network.provider.send('evm_mine')

    const [price] = await controller.rentPrice(label, duration)

    const registerTx = await _controller.register(
      label,
      owner,
      duration,
      secret,
      resolver,
      data,
      reverseRecord,
      fuses,
      {
        value: price,
      },
    )
    console.log(`Registering name ${label}.eth (tx: ${registerTx.hash})...`)
    await registerTx.wait()

    if (subnames) {
      console.log(`Setting subnames for ${label}.eth...`)
      const nameWrapper = await ethers.getContract('NameWrapper')
      for (const {
        label: subnameLabel,
        namedOwner: namedSubnameOwner,
        fuses: subnameFuses = 0,
        expiry: subnameExpiry = BigNumber.from(2).pow(64).sub(1),
      } of subnames) {
        const subnameOwner = allNamedAccts[namedSubnameOwner]
        const _nameWrapper = nameWrapper.connect(await ethers.getSigner(owner))
        const setSubnameTx = await _nameWrapper.setSubnodeRecord(
          namehash(`${label}.eth`),
          subnameLabel,
          subnameOwner,
          resolver,
          '0',
          subnameFuses,
          subnameExpiry,
        )
        console.log(` - ${subnameLabel} (tx: ${setSubnameTx.hash})...`)
        await setSubnameTx.wait()
      }
    }
  }

  await network.provider.send('anvil_setBlockTimestampInterval', [1])

  return true
}

func.id = 'register-wrapped-names'
func.tags = ['register-wrapped-names']
func.dependencies = ['ETHRegistrarController']
func.runAtTheEnd = true

module.exports = func
