# redstone smartweave contracts - AssemblyScript template

Following repository is a template for writing SmartWeave contracts in AssemblyScript and building them into WASM binaries which can be then processed by RedStone SmartWeave SDK.

It's a template for writing PST contract. If you are not familiar with the concept of Profit Sharing Tokens we created a [tutorial](https://redstone.academy/docs/pst/introduction/intro) for writing your first PST contract in our RedStone Academy.

Please note, that current implementation for Assemblyscript has its limits. RedStone SDK's [Smarteave.readContractState method]() which allows reading other contracts' state is not supported. It will be available in other implementation - Rust and Go - which will be soon released and enabled to use.

AssemblyScript compiles a variant of TypeScript to WebAssembly using Binaryen. As it's written in the Assemblyscrit documentation - in its simplest form it is JavaScript with WebAssembly types compiled to WebAssembly exports and imports.

This template lets you quickly write AssemblyScript contract, test it, compile it to WebAssembly and deploy.

- [Installation](#installation)
- [Writing contract](#writing-contract)
- [Tests](#tests)
- [Build](#build)
- [Deploy](#deploy)
- [Using SDK](#using-sdk)

## Installation

You will need:

- [Node.js](https://nodejs.org/en/download/) version 16.5 or above:
- [yarn](https://yarnpkg.com/getting-started/install) installed

To install all dependencies run following command:

```bash
yarn install
```

## Writing contract

Following template is designed for you to quickly understand basic concepts of writing contracts using Assemblyscript and RedStone SmartWeave SDK. If you want to play around with the code jump to the [Quick start chapter](#quick-start). If you will feel the need to explore some more - walk through the rest of the tutorial starting with [Implementation](#implementation) section.

## Quick start

If you want to edit contract's code and create your own implementation you can do it by following these steps:

1. Edit `init-state.json` by adding the initial state for your contract - [deploy/state/init-state.json](deploy/state/init-state.json)

2. Edit/add actions which user will be able to call while interactinh with the contract - [assembly/actions](assembly/actions)

3. Add Assemblyscript schemas which should describe input and output types for your actions - similair to what you would do when writing in Typescript - [assembly/schemas.ts](assembly/schemas.ts)

4. Add above action functions to the `functions` Map in [assembly/contract.ts](assembly/contract.ts#L16) - when user will interact with the contract, required action function will be searched for in the map and called with `state` and `action` as arguments in order to output the result of the function and optionally set a new state (if indicated action changes the state).

5. Compile your contract to WASM binary by running following command:

```bash
yarn run asbuild
```

6. Write tests for your contract (we will use Jest library for testing) - you can find a template in the [tests/](tests) folder.

7. Deploy your contract to one of the networks (mainnet/RedStone public testnet/localhost) by running following command (`network`: `mainnet` | `testnet` | `local`)

```bash
yarn run deploy:[network]
```

NOTE: If you want to deploy your contract locally you need to run Arlocal by typing following command:

```bash
npx arlocal
```

NOTE: When using mainnet please put your wallet key in [deploy/mainnet/.secrets/wallet-mainnet.json](deploy/mainnet/.secrets/wallet-mainnet.json). `.secrets` folder has been added to `.gitignore` so your key is kept securely.

You can view deploy script code [here](deploy/scripts/deploy.js)

8. Using RedStone SmartWeave SDKs' methods is similair to how you should use them in case of regular JS contracts. You can run a script which compiles contract, deploys it and reads its state by running:

```bash
yarn run read:[network]
```

If you would like to view `read-contract-state.js` script code you can check it out [here](deploy/scripts/read-contract-state.js).

We recommend reading the rest of the docs, but you can start writing your contract right away.

## Implementation

### Actions

Like in a classic TypeScript example we will need contract's action functions which we'll divide into separate files. You can divide them further into write and read folders. Check out example action - `balance` - implementation [here](assembly/actions/balance)

### Types

For each action we'll define input and output variables types. We'll create a dedicated `schemas.ts` file with all the types used in the contract. AssemblyScript is a TypeScript-like language but unlike the second one - because of being compiled statically ahead of time it's not designed to describe JavaScript dynamic features and it required stricter type checking. API for most of the types is quite similair to TypeScript with couple of differences, e.g.:

- There is no `any` or `undefined`
- AssemblyScript inherits WebAssembly's more specific integer, floating point and reference types (e.g. `i32` - a 32-bit signed integer). You can view the whole list in the [documentation](https://www.assemblyscript.org/types.html#types)
- Inference - compared to TypeScript type inference is limited - type of each expression must be known in advance. More info [here](https://www.assemblyscript.org/types.html#inference)
- Nullability - basic types cannot be nullable, but class and function types can
- There are no union types, but a similar effect can be achieved with generics
- Objects must be typed, say using a Map or class

```js
@serializable
export class StateSchema {
  balances: Map<string, i32> = new Map<string, i32>();
  canEvolve: boolean;
  evolve: string | null;
  name: string;
  owner: string;
  ticker: string;
}
```

### @serializable

In order for an object to be serializable you need to decorate it with the `@serializable` tag. Thanks to that you can then encode objects into strings, and decode JSON-encoded strings into objects. You can read some more in [serial-as repository](https://github.com/gagdiez/serial-as).

### Map

Our `balances` property is a mapping of string keys to i32 values. The Map API is very similar to JavaScript's (you can use all its methods - `has`, `get`, `set` etc.). One thing worth recalling - a `.get` with a key that does not exist results in an error, because undefined cannot be represented.

```js
balances: Map<string, i32> = new Map<string, i32>();
```

### Imports

In order for WebAssembly to use external resources, we need to explicitly import them. It is necessary to wire a module to the host environment.

In AssemblyScript, host functionality can be imported by utilizing the ambient context, that is using a declare statement like so:

```js
export declare namespace console {
  function logO(msg: string, data: string /* stringified json */): void;

  function log(msg: string): void;
}
```

Same applies to SmartWeave methods:

```js
export declare namespace Contract {
  function id(): string;

  function owner(): string;
}
```

We need to import them in a `contract.ts` file. Remember - they are needed even if IDE reports as non-used.

```js
import { Contract } from './imports/smartweave/contract';
```

### Errors

Instead of using SDK's `ContractError` we need to throw an `Error` object with a following message convention:

```js
if (!state.balances.has(target)) {
  throw new Error('[CE:TNE] Cannot get balance, target does not exist');
}
```

### Contract.ts

Firstly, we'll create a mapping of action functions names to functions itself. Side note: inline 'array' map initializer doe not work in AssemblyScript so we need to initialize it by setting elements with a specified key and a value by using `set()` method.

```js
const functions: Map<string, ContractFn> = new Map();

functions.set('balance', balance);
functions.set('transfer', transfer);
functions.set('evolve', evolve);
functions.set('mint', mint);
```

We will then get an action passed to the contract, get it from the `functions` map and call it with `state` and `action` as arguments in order to output the result of the function and optionally set a new state (if indicated action changes the state).

````js
    const handlerResult = functions.get(fn)(state, action);
    if (handlerResult.state != null) {
      console.logO('Setting new state', stringify(handlerResult.state))
      contractState = handlerResult.state;
    }
    return handlerResult.result;
    ```
````

### Language limitations

Please remember that AssemblyScript does not support closures and for... of... iteration. You can check which other features are not supported (and also what other implementation plans has the AssemblyScript team) [here](https://www.assemblyscript.org/status.html#language-features).

### asconfig.json

Instead of providing the options outlined above on the command line, a configuration file typically named asconfig.json can be used. Options provided on the command line override any options in the configuration file. You can specify `debug` and `release` targets with all additional options:

- `binaryFile` - path and name for compiled binary
- `textFile` - path and name for text format (.wat)
- `sourceMap` - enables source map generation
- `debug` - when set to true the compiler appends a name section to the binary, containing names of functions, globals, locals and so on, these names will show up in stack traces
- `optimizeLevel` - how much to focus on optimizing code. [0-3]
- `shrinkLevel` - how much to focus on shrinking code size. [0-2, s=1, z=2]
- `converge` - if set to true re-optimizes until no further improvements can be made
- `noAssert` - if set to true replaces assertions with just their value without trapping

```json
"targets": {
    "debug": {
      "binaryFile": "build/untouched.wasm",
      "textFile": "build/untouched.wat",
      "sourceMap": true,
      "debug": true
    },
    "release": {
      "binaryFile": "build/optimized.wasm",
      "sourceMap": false,
      "optimizeLevel": 3,
      "shrinkLevel": 0,
      "converge": false,
      "noAssert": false
    }
```

## Build

Now we need to compile our contract. You can achieve that by running following command:

```bash
yarn run asbuild
```

Running `asbuild` command will compile `contract.ts` file to WebAssembly. Compiled binary will be emitted to the `build/` directory. You can also compile file in debug mode like so:

```bash
yarn run asbuild:debug
```

In case of debug mode - also source map and text format will be emitted.

Similar to TypeScript's `tsc` transpiling to JavaScript, AssemblyScript's `asc` compiles to WebAssembly. Non-option arguments are treated as the names of entry files - in our case it will be a contract file.

- `sourceMap` - generates a source map alongside a binary
- `runtime` - you can then specify runtime options - `stub` which does not provide a garbage collector at all and never frees (useful where modules are short-lived and collected as a whole anyhow).
- `exportRuntime` compiler option wich exports runtime interface from the module to the host.
- `transform` - specifies the path to a custom transform to load (`ContractTransform.js` file)
- `exportTable` - exports the function table as 'table'
- `target` - configuration file target to use. Defaults to 'release'.

```bash
    "asbuild": "asc assembly/contract.ts --sourceMap --runtime stub --exportRuntime --transform ./ContractTransform --exportTable --target release"
```

You can view the whole list of compile options [here](https://www.assemblyscript.org/compiler.html#compiler-options).

### Tests

Run your test with this command:

```bash
yarn run test
```

Writing tests do not differ much from writing tests for regular JS contracts. The only difference is - you need to inidicate correct compiled WASM file.
You also need to pass the path to the original wasm contract source code while deploying the contract. SDK will then zip it and pass to the data deployed while creating the transaction.

```js
const contractTxId = await smartweave.createContract.deploy(
  {
    wallet,
    initState: JSON.stringify(initialState),
    src: contractSrc,
  },
  path.join(__dirname, '../../assembly')
);
```

## Deploy

You can deploy the contract to three types of networks - mainnet, RedStone public testnet and local testnet. All of them share some common code which you can view in [deploy/scripts/utils](deploy/scripts/utils).
Deploy script does not differ from the one you would write when deploying a regular JavaScript contract. These are the steps you need to follow to deploy a contract:

- initialize Arweave
- initialize SmartWeave
- load wallet
- add funds to the wallet - in case of test wallets
- read `initial-state.json` file
- read file with compiled contract ([build/optimized.wasm](build/optimized.wasm))
- deploy contract using SDK's `deploy` method
- mine block - in case of testnets

Then, you just need to deploy contract by running proper deploy command which firstly compiles the contract and then fire correct NodeJS script:

```bash
    npm run deploy:[network]
```

# Using SDK

Optionally - you can run following script:

```bash
    npm run read:[network]
```

...which compiles contract, deploys it and then reads its state. Using SDKs' methods works exactly the same like in case of a regular JS contract.
