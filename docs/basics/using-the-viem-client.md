# Using the Viem Client

If you're only using parts of ENSjs, or want to control exactly what functions are being imported, you can use ENSjs methods with the viem `Client`.
Just wrap the viem `Chain` in the `addEnsContracts()` function, which adds all the required addresses to the chain.

```ts
import { http, createClient } from 'viem'
import { mainnet } from 'viem/chains'
import { addEnsContracts } from '@folktizen/netzjs'
import { getAddressRecord } from '@folktizen/netzjs/public'

const client = createClient({
  chain: addEnsContracts(mainnet),
  transport: http(),
})

const ethAddress = getAddressRecord(client, { name: 'ens.eth' })
```
