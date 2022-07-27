import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import { Command } from "commander";

import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import { LoggerFactory, Warp, WarpNodeFactory } from "warp-contracts";

import {
  connect as connectTokenContract,
  deploy as deployTokenContract,
  TokenState as TokenContractState,
} from "../../token/ts/contract";
import {
  connect as connectBundlersContract,
  deploy as deployBundlersContract,
  State as BundlersContractState,
} from "../../bundlers/ts/contract";
import {
  connect as connectValidatorsContract,
  deploy as deployValidatorsContract,
  State as ValidatorsContractState,
} from "../../validators/ts/contract";

interface Secrets {
  wallets: {
    ["token-contract-owner"]: JWKInterface;
    ["bundlers-contract-owner"]: JWKInterface;
    ["bundler-1"]: JWKInterface;
    ["bundler-2"]: JWKInterface;
    ["validator-1"]: JWKInterface;
    ["validator-2"]: JWKInterface;
    ["validator-3"]: JWKInterface;
    ["validator-4"]: JWKInterface;
    ["validator-5"]: JWKInterface;
    ["validator-6"]: JWKInterface;
    ["validator-7"]: JWKInterface;
    ["test1"]: JWKInterface;
  };
}

function readSecrets(filepath: string): Promise<Secrets> {
  let f = path.resolve(process.cwd(), filepath);
  return fs.readFile(f).then((walletData) => {
    let json = JSON.parse(walletData.toString());
    return json as Secrets;
  });
}

LoggerFactory.INST.logLevel("trace");
LoggerFactory.INST.logLevel("trace", "WASM:Rust");
LoggerFactory.INST.logLevel("trace", "WasmContractHandlerApi");

type CliArgs = {
  gateway: string;
  secrets: string;
  arlocal: boolean;
  bundlerStake: string;
  minimumValidatorStake: string;
};

function defaultPort(protocol: string) {
  switch (protocol) {
    case "http:":
      return 80;
    case "https:":
      return 443;
    default:
      throw Error(`Unsupported protocol: ${protocol}`);
  }
}

class ArLocal {
  arweave?: Arweave;
  constructor(arweave?: Arweave) {
    this.arweave = arweave;
  }
  async mine() {
    if (this.arweave) {
      return this.arweave.api.get("mine");
    }
  }
  async mint(address: string) {
    await this.arweave?.api.get(`mint/${address}/1000000000000000`);
  }
}

function createWarpNode(arlocal: boolean, arweave: Arweave) {
  if (arlocal) {
    return WarpNodeFactory.forTesting(arweave);
  } else {
    return WarpNodeFactory.memCached(arweave);
  }
}

async function doTokenContractDeployment(
  warp: Warp,
  wallet: JWKInterface,
  initialStateFile: string,
  useBundler: boolean
) {
  const tokenContractOwnerAddress = await warp.arweave.wallets.jwkToAddress(
    wallet
  );

  const contractStateFromFile = await fs
    .readFile(path.resolve(initialStateFile), "utf8")
    .then((data) => JSON.parse(data.toString()));

  const initialContractState = {
    ...contractStateFromFile,
    ...{
      owner: tokenContractOwnerAddress,
      balances: {
        [tokenContractOwnerAddress]:
          contractStateFromFile.totalSupply.toString(),
      },
    },
  };

  const { contractTxId } = await deployTokenContract(
    warp,
    wallet,
    initialContractState,
    useBundler
  );

  return contractTxId;
}

async function approve(
  warp: Warp,
  wallet: JWKInterface,
  contractTxId: string,
  spenderAddress: string,
  amount: bigint
) {
  let connection = await connectTokenContract(warp, contractTxId, wallet);
  return connection.approve(spenderAddress, amount);
}

async function transfer(
  warp: Warp,
  wallet: JWKInterface,
  contractTxId: string,
  toAddress: string,
  amount: bigint
) {
  let connection = await connectTokenContract(warp, contractTxId, wallet);
  return connection.transfer(toAddress, amount);
}

async function doBundlersContractDeployment(
  warp: Warp,
  wallet: JWKInterface,
  initialStateFile: string,
  tokenContractTxId: string,
  bundlerStake: bigint,
  useBundler: boolean
) {
  const bundlersContractOwnerAddress = await warp.arweave.wallets.jwkToAddress(
    wallet
  );

  const initialContractState: BundlersContractState = await fs
    .readFile(path.resolve(initialStateFile), "utf8")
    .then((data) => JSON.parse(data.toString()));

  initialContractState.token = tokenContractTxId;
  initialContractState.stake = bundlerStake.toString();
  initialContractState.allowedInteractors.push(bundlersContractOwnerAddress);
  // just to be sure, deduplicate
  initialContractState.allowedInteractors = [
    ...new Set(initialContractState.allowedInteractors),
  ];

  const { contractTxId } = await deployBundlersContract(
    warp,
    wallet,
    initialContractState,
    useBundler
  );

  return contractTxId;
}

async function allowInteractions(
  warp: Warp,
  approver: JWKInterface,
  contractTxId: string,
  allowedAddress: string
) {
  let connection = await connectBundlersContract(warp, contractTxId, approver);
  return connection.addAllowedInteractor(allowedAddress);
}

async function bundlersJoin(
  warp: Warp,
  bundler: JWKInterface,
  contractTxId: string
) {
  let connection = await connectBundlersContract(warp, contractTxId, bundler);
  return connection.join();
}

async function doValidatorsContractDeployment(
  warp: Warp,
  wallet: JWKInterface,
  initialStateFile: string,
  tokenContractTxId: string,
  bundlersContractTxId: string,
  minimumValidatorStake: bigint,
  useBundler: boolean
) {
  const bundlerAddress = await warp.arweave.wallets.jwkToAddress(wallet);

  const initialContractState: ValidatorsContractState = await fs
    .readFile(path.resolve(initialStateFile), "utf8")
    .then((data) => JSON.parse(data.toString()));

  initialContractState.token = tokenContractTxId;
  initialContractState.bundlersContract = bundlersContractTxId;
  initialContractState.bundler = bundlerAddress;
  initialContractState.minimumStake = minimumValidatorStake.toString();

  const { contractTxId } = await deployValidatorsContract(
    warp,
    wallet,
    initialContractState,
    useBundler
  );

  return contractTxId;
}

async function validatorJoin(
  warp: Warp,
  validator: JWKInterface,
  contractTxId: string,
  stake: bigint,
  url: URL
) {
  let connection = await connectValidatorsContract(
    warp,
    contractTxId,
    validator
  );
  return connection.join(stake, url);
}

async function run(args: CliArgs) {
  const arweaveUrl = new URL(args.gateway);
  const secrets = await readSecrets(args.secrets);

  const bundlerStake = BigInt(args.bundlerStake);
  const minimumValidatorStake = BigInt(args.minimumValidatorStake);

  const gwPort = arweaveUrl.port
    ? Number.parseInt(arweaveUrl.port)
    : defaultPort(arweaveUrl.protocol);

  const arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: gwPort,
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  const warp = createWarpNode(args.arlocal, arweave);

  console.log(args);
  

  const arlocal = new ArLocal(args.arlocal ? arweave : undefined);

  await Promise.all(Object.values(secrets.wallets).map(async(element: JWKInterface) => {
    await arlocal.mint(await arweave.wallets.jwkToAddress(element));
  }));

  const tokenContractTxId = await doTokenContractDeployment(
    warp,
    secrets.wallets["token-contract-owner"],
    `${__dirname}/../data/initial-token-state.json`,
    !args.arlocal
  );

  if (args.arlocal) await arlocal.mine();

  const bundlersContractTxId = await doBundlersContractDeployment(
    warp,
    secrets.wallets["bundlers-contract-owner"],
    `${__dirname}/../data/initial-bundlers-state.json`,
    tokenContractTxId,
    bundlerStake,
    !args.arlocal
  );

  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["bundler-1"]),
    bundlerStake
  );
  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["bundler-2"]),
    bundlerStake
  );
  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["validator-1"]),
    minimumValidatorStake
  );
  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["validator-2"]),
    minimumValidatorStake
  );
  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["validator-3"]),
    minimumValidatorStake
  );
  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["validator-4"]),
    minimumValidatorStake
  );
  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["validator-5"]),
    minimumValidatorStake
  );
  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["validator-6"]),
    minimumValidatorStake
  );
  if (args.arlocal) await arlocal.mine();

  await transfer(
    warp,
    secrets.wallets["token-contract-owner"],
    tokenContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["validator-7"]),
    minimumValidatorStake
  );
  if (args.arlocal) await arlocal.mine();

  await allowInteractions(
    warp,
    secrets.wallets["bundlers-contract-owner"],
    bundlersContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["bundler-1"])
  );
  if (args.arlocal) await arlocal.mine();
  await allowInteractions(
    warp,
    secrets.wallets["bundlers-contract-owner"],
    bundlersContractTxId,
    await arweave.wallets.jwkToAddress(secrets.wallets["bundler-2"])
  );
  if (args.arlocal) await arlocal.mine();

  await approve(
    warp,
    secrets.wallets["bundler-1"],
    tokenContractTxId,
    bundlersContractTxId,
    bundlerStake
  );
  console.log("Approved 1");
  
  if (args.arlocal) await arlocal.mine();
  await approve(
    warp,
    secrets.wallets["bundler-2"],
    tokenContractTxId,
    bundlersContractTxId,
    bundlerStake
  );
  console.log("Approved 2");

  if (args.arlocal) await arlocal.mine();

  await bundlersJoin(warp, secrets.wallets["bundler-1"], bundlersContractTxId);
  if (args.arlocal) await arlocal.mine();
  await bundlersJoin(warp, secrets.wallets["bundler-2"], bundlersContractTxId);
  if (args.arlocal) await arlocal.mine();

  const validatorsContract1 = await doValidatorsContractDeployment(
    warp,
    secrets.wallets["bundler-1"],
    `${__dirname}/../data/initial-validators-state.json`,
    tokenContractTxId,
    bundlersContractTxId,
    minimumValidatorStake,
    !args.arlocal
  );
  if (args.arlocal) await arlocal.mine();

  const validatorsContract2 = await doValidatorsContractDeployment(
    warp,
    secrets.wallets["bundler-2"],
    `${__dirname}/../data/initial-validators-state.json`,
    tokenContractTxId,
    bundlersContractTxId,
    minimumValidatorStake,
    !args.arlocal
  );
  if (args.arlocal) await arlocal.mine();

  await Promise.all([
    approve(
      warp,
      secrets.wallets["validator-1"],
      tokenContractTxId,
      validatorsContract1,
      minimumValidatorStake
    ),
    approve(
      warp,
      secrets.wallets["validator-2"],
      tokenContractTxId,
      validatorsContract1,
      minimumValidatorStake
    ),
    approve(
      warp,
      secrets.wallets["validator-3"],
      tokenContractTxId,
      validatorsContract1,
      minimumValidatorStake
    ),
    approve(
      warp,
      secrets.wallets["validator-4"],
      tokenContractTxId,
      validatorsContract2,
      minimumValidatorStake
    ),
    approve(
      warp,
      secrets.wallets["validator-5"],
      tokenContractTxId,
      validatorsContract2,
      minimumValidatorStake
    ),
    approve(
      warp,
      secrets.wallets["validator-6"],
      tokenContractTxId,
      validatorsContract2,
      minimumValidatorStake
    ),
    approve(
      warp,
      secrets.wallets["validator-7"],
      tokenContractTxId,
      validatorsContract2,
      minimumValidatorStake
    ),
  ]);
  if (args.arlocal) await arlocal.mine();

  await Promise.all([
    validatorJoin(
      warp,
      secrets.wallets["validator-1"],
      validatorsContract1,
      minimumValidatorStake,
      new URL("https://1.example.com")
    ),
    validatorJoin(
      warp,
      secrets.wallets["validator-2"],
      validatorsContract1,
      minimumValidatorStake,
      new URL("https://2.example.com")
    ),
    validatorJoin(
      warp,
      secrets.wallets["validator-3"],
      validatorsContract1,
      minimumValidatorStake,
      new URL("https://3.example.com")
    ),
    validatorJoin(
      warp,
      secrets.wallets["validator-4"],
      validatorsContract2,
      minimumValidatorStake,
      new URL("https://4.example.com")
    ),
    validatorJoin(
      warp,
      secrets.wallets["validator-5"],
      validatorsContract2,
      minimumValidatorStake,
      new URL("https://5.example.com")
    ),
    validatorJoin(
      warp,
      secrets.wallets["validator-6"],
      validatorsContract2,
      minimumValidatorStake,
      new URL("https://6.example.com")
    ),
    validatorJoin(
      warp,
      secrets.wallets["validator-7"],
      validatorsContract2,
      minimumValidatorStake,
      new URL("https://7.example.com")
    ),
  ]);

  LoggerFactory.INST.logLevel("fatal");
  LoggerFactory.INST.logLevel("fatal", "WASM:Rust");
  LoggerFactory.INST.logLevel("fatal", "WasmContractHandlerApi");

  // console.log(await warp.contract(validatorsContract1).setEvaluationOptions({ internalWrites: true }).readState());
  // console.log(await warp.contract(validatorsContract2).setEvaluationOptions({ internalWrites: true }).readState());
  console.log(JSON.stringify(await warp.contract(tokenContractTxId).setEvaluationOptions({ internalWrites: true }).readState(), null, 4));
  console.log(JSON.stringify(await warp.contract(bundlersContractTxId).setEvaluationOptions({ internalWrites: true }).readState(), null, 4));

  if (args.arlocal) await arlocal.mine();

  return {
    token: tokenContractTxId,
    bundlers: bundlersContractTxId,
    validators1: validatorsContract1,
    validators2: validatorsContract2,
  };
}

let appVersion: string;

if (process.env.npm_package_version) {
  appVersion = process.env.npm_package_version;
} else {
  appVersion = require("../package.json").version;
}

const appArgs = new Command();
appArgs
  .version(appVersion)
  .requiredOption("-g, --gateway <url>", "Arweave gateway URL")
  .requiredOption("-s, --secrets <path>", "Path to file containing all secrets")
  .option("-a, --arlocal", "Deploy to ArLocal")
  .option(
    "--minimum-validator-stake",
    "Minimun stake required from validators to allow joining",
    "100"
  )
  .option(
    "--bundler-stake",
    "Stake required from bundlers to allow joining",
    "100"
  );

run(appArgs.parse(process.argv).opts())
  .then((res) => {
    console.error("Done");
    console.log(JSON.stringify(res));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Deployment failed: ", err);
    process.exit(1);
  });
