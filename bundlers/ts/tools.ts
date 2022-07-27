import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import dotenv from "dotenv";
import { Command } from "commander";

import Arweave from "arweave";
import { connect } from "./contract";
import { LoggerFactory, WarpNodeFactory } from "warp-contracts";
import base64url from "base64url";
import * as crypto from "crypto";

import {
  deploy as deployValidator,
  connect as connectValidator
} from "../../validators/ts/contract";
import { JWKInterface } from "arweave/node/lib/wallet";

function readJwk(filepath: string): Promise<JWKInterface> {
  let f = path.resolve(process.cwd(), filepath);
  return fs.readFile(f).then((walletData) => {
    let json = JSON.parse(walletData.toString());
    return json as JWKInterface;
  });
}

type JoinArgs = {
  gateway: string;
  contract: string;
  validatorState: string;
  wallet: string;
};

type AllowArgs = {
  gateway: string;
  contract: string;
  wallet: string;
  address: string;
};

type GetAllowedArgs = {
  gateway: string;
  contract: string;
  wallet: string;
};

type GetBundlersArgs = {
  gateway: string;
  contract: string;
  wallet: string;
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

LoggerFactory.INST.logLevel("trace");
LoggerFactory.INST.logLevel("trace", "WASM:Rust");
LoggerFactory.INST.logLevel("trace", "WasmContractHandlerApi");

async function join(args: JoinArgs) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);
  const address = base64url(crypto.createHash("sha256").update(base64url.toBuffer(wallet.n)).digest());

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.memCached(arweave);

  let connection = await connect(warp, args.contract, wallet);
  let res = await connection.join();

  console.log(args);

  let initialValidatorState = JSON.parse(
    await fs.readFile(path.resolve(process.cwd(), args.validatorState), "utf8")
  );

  let validatorRes = await deployValidator(warp, wallet, { ...initialValidatorState, bundler: address, bundlersContract: args.contract }, true);

  console.log(`Validator contract ${validatorRes}`);
  console.log(res);
}

async function allow(args: AllowArgs) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.memCached(arweave);

  let connection = await connect(warp, args.contract, wallet);
  let res = await connection.addAllowedInteractor(args.address);

  console.log(res);
}

async function getAllowed(args: GetAllowedArgs) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.memCached(arweave);

  let connection = await connect(warp, args.contract, wallet);
  let res = await connection.allowedInteractors();

  console.log(res);
}

async function getBundlers(args: GetBundlersArgs) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.memCached(arweave);

  let connection = await connect(warp, args.contract, wallet);
  let res = await connection.bundlers();

  console.log(res);
}

async function readState(args: JoinArgs): Promise<void> {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.memCached(arweave);

  let connection = await connect(warp, args.contract, wallet);

  console.log(await connection.readState());
}

let appVersion: string;

if (process.env.npm_package_version) {
  appVersion = process.env.npm_package_version;
} else {
  appVersion = require("../package.json").version;
}

dotenv.config();

let program = new Command();

program.version(appVersion);

program
  .command("join")
  .option(
    "-g, --gateway <url>",
    "Arweave gateway URL",
    process.env.BUNDLR_ARWEAVE
      ? process.env.BUNDLR_ARWEAVE
      : "https://arweave.net"
  )
  .requiredOption(
    "-c, --contract <address>",
    "Token contract address",
    process.env.BUNDLR_TOKEN_CONTRACT
  )
  .requiredOption("-v, --validator-state <path>", "Path to validator contract's initial state")
  .requiredOption("-w, --wallet <path>", "Path to wallet file")
  .action((opts) => {
    join(opts)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Application failed: ", err);
        process.exit(1);
      });
  });

  program
  .command("read-state")
  .option(
    "-g, --gateway <url>",
    "Arweave gateway URL",
    process.env.BUNDLR_ARWEAVE
      ? process.env.BUNDLR_ARWEAVE
      : "https://arweave.net"
  )
  .requiredOption(
    "-c, --contract <address>",
    "Token contract address",
    process.env.BUNDLR_TOKEN_CONTRACT
  )
  .requiredOption("-w, --wallet <path>", "Path to wallet file")
  .action((opts) => {
    readState(opts)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Application failed: ", err);
        process.exit(1);
      });
  });

program
  .command("allow")
  .option(
    "-g, --gateway <url>",
    "Arweave gateway URL",
    process.env.BUNDLR_ARWEAVE
      ? process.env.BUNDLR_ARWEAVE
      : "https://arweave.net"
  )
  .requiredOption(
    "-c, --contract <address>",
    "Token contract address",
    process.env.BUNDLR_TOKEN_CONTRACT
  )
  .requiredOption("-w, --wallet <path>", "Path to wallet file")
  .requiredOption("-a, --address <address>", "New allowed interactor")
  .action((opts) => {
    allow(opts)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Application failed: ", err);
        process.exit(1);
      });
  });

program
  .command("get-allowed")
  .option(
    "-g, --gateway <url>",
    "Arweave gateway URL",
    process.env.BUNDLR_ARWEAVE
      ? process.env.BUNDLR_ARWEAVE
      : "https://arweave.net"
  )
  .requiredOption(
    "-c, --contract <address>",
    "Token contract address",
    process.env.BUNDLR_TOKEN_CONTRACT
  )
  .requiredOption("-w, --wallet <path>", "Path to wallet file")
  .action((opts) => {
    getAllowed(opts)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Application failed: ", err);
        process.exit(1);
      });
  });

program
  .command("get-bundlers")
  .option(
    "-g, --gateway <url>",
    "Arweave gateway URL",
    process.env.BUNDLR_ARWEAVE
      ? process.env.BUNDLR_ARWEAVE
      : "https://arweave.net"
  )
  .requiredOption(
    "-c, --contract <address>",
    "Token contract address",
    process.env.BUNDLR_TOKEN_CONTRACT
  )
  .requiredOption("-w, --wallet <path>", "Path to wallet file")
  .action((opts) => {
    getBundlers(opts)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Application failed: ", err);
        process.exit(1);
      });
  });

program.parse();
