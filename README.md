# Bundlr Contracts

## Testing

### Start ArLocal

Start with defaults from command line:

```sh
npx arlocal
```

Or start in a node.js terminal:

```js
const ArLocal = require("arlocal").default;
const arlocal = new ArLocal(1984, false);
await arlocal.start();
```

Then open a node.js terminal or continue in the previous one:

```js
const Arweave = require("arweave");
let arweave = Arweave.init({ host: "localhost", port: 1984, protocol: "http" });
```

Add some AR to the address matching your wallet:

```js
await arweave.api.get("/mint/<WALLET_ADDRESS_1>/10000000000000000");
await arweave.api.get("/mint/<WALLET_ADDRESS_2>/10000000000000000");
```

Now keep this terminal open, because after each deployment, we need to instruct `ArLocal`
to mine a new block.

### Deploy Token Contract

In another terminal, run `yarn deploy` to deploy the contract:

```sh
cd tokens
yarn deploy \
    -g http://localhost:1984 \
    -w path/to/wallet1.json \
    -s example-data/example-state.json
```

Remember to mine a block in the node.js terminal

```js
await arweave.api.get("mine");
```

Move some tokens to second wallet address:

```sh
cd tokens
npx ts-node ts/tools.ts \
    -g http://localhost:1984 \
    -w path/to/wallet1.json \
    -c <TOKEN_CONTRACT_ADDRESS> \
    -r <WALLET_ADDRESS_2> \
    -a 200
```

And mine a block in the node.js terminal

```js
await arweave.api.get("mine");
```

### Deploy Bundlers Contract

In another terminal, run `yarn deploy` to deploy the contract:

```js
cd bundlers
yarn deploy \
    -g http://localhost:1984 \
    -w path/to/wallet1.json \
    -s deploy/state/example-state.json \
    -t <TOKEN_CONTRACT_ADDRESS>
```

Remember to mine a block in the node.js terminal

```js
await arweave.api.get("mine");
```

### Bundler Join

Allow second wallet address to interact (join) using bundlers contract:

```sh
cd bundlers
npx ts-node ts/tools.ts allow \
    -g http://localhost:1984 \
    -w path/to/wallet1.json \
    -a <WALLET_ADDRESS_2>
```

```js
await arweave.api.get("mine");
```

Approve token transfer from second wallet address to the bundlers contract address:

```sh
cd tokens
npx ts-node ts/tools.ts approve \
    -g http://localhost:1984 \
    -w path/to/wallet2.json \
    -c <TOKEN_CONTRACT_ADDRESS> \
    -s <BUNDLER_CONTRACT_ADDRESS> \
    -a 100
```

```js
await arweave.api.get("mine");
```

Join as a new bundler

```sh
cd bundlers
npx ts-node ts/tools.ts join \
    -g http://localhost:1984 \
    -w path/to/wallet2.json \
    -c <BUNDLERS_CONTRACT_ADDRESS>
```

```js
await arweave.api.get("mine");
```

### Deploy Validators Contract

In another terminal, run `yarn deploy` to deploy the contract:

```js
cd validators
yarn deploy \
    -g http://localhost:1984 \
    -w path/to/wallet2.json \
    -s ./example-data/example-state.json \
    -t <TOKEN_CONTRACT_ADDRESS> \
    -c <BUNDLERS_CONTRACT_ADDRESS> \
    -a <WALLET_ADDRESS_2>
```

Remember to mine a block in the node.js terminal

```js
await arweave.api.get("mine");
```

### Validator Join

Approve token transfer from first wallet address to the validators contract address:

```sh
cd tokens
npx ts-node ts/tools.ts approve \
    -g http://localhost:1984 \
    -w path/to/wallet1.json \
    -c <TOKEN_CONTRACT_ADDRESS> \
    -s <VALIDATORS_CONTRACT_ADDRESS> \
    -a 10
```

```js
await arweave.api.get("mine");
```

Join as a new validator using first wallet address:

```sh
npx ts-node ts/tools.ts join \
    -g http://localhost:1984 \
    -w path/to/wallet1.json \
    -c <VALIDATORS_CONTRACT_ADDRESS> \
    -s 10 \
    -u https://example.com
```

### Scripted Test Setup

Create secrets file with Mozilla SOPS. The following command expects that `validator` project can be found from parallel folder to this project.

```sh
cd utils
sh initialize-secrets.sh \
    <GPG_FINGERPRINT> \
    ./secrets.test.yaml \
    "../../validator/target/debug/wallet-tool create" \
    "../../validator/target/debug/wallet-tool show-address"
```

Deploy everything

```sh
cd utils
sops exec-file --output-type=json ../../secrets.test.yaml "yarn deploy --gateway http://localhost:1984 --secrets {} --arlocal"
```

Alternatively, if you don't want to use SOPS for secrets, create JSON file

```json-with-comments
{
    "wallets": {
        "token-contract-owner": {
            // Arweave key data
        },
        "bundlers-contract-owner": {
            // Arweave key data
        },
        "bundler-1": {
            // Arweave key data
        },
        "bundler-2": {
            // Arweave key data
        },
        "validator-1": {
            // Arweave key data
        },
        "validator-2": {
            // Arweave key data
        },
        "validator-3": {
            // Arweave key data
             },
        "validator-4": {
            // Arweave key data
           },
        "validator-5": {
            // Arweave key data
        },
        "validator-6": {
            // Arweave key data
        },
        "validator-7": {
            // Arweave key data
        }
    }
}
```

and then run deployment script:

```sh
cd utils
yarn deploy --gateway http://localhost:1984 --secrets /path/to/secrets --arlocal
```
