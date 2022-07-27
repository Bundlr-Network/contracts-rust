import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import dotenv from "dotenv";
import { Command } from "commander";

import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";

import { connect } from "./contract";
import { WarpNodeFactory } from "warp-contracts";

function readJwk(filepath: string): Promise<JWKInterface> {
  let f = path.resolve(process.cwd(), filepath);
  return fs.readFile(f).then((walletData) => {
    let json = JSON.parse(walletData.toString());
    return json as JWKInterface;
  });
}

type AllowanceArgs = {
  gateway: string;
  contract: string;
  wallet: string;
  owner: string;
  spender: string;
};

type ApproveArgs = {
  gateway: string;
  contract: string;
  wallet: string;
  spender: string;
  amount: string;
};

type BalanceArgs = {
  gateway: string;
  contract: string;
  wallet: string;
  address: string;
};

type TransferArgs = {
  gateway: string;
  contract: string;
  recipient: string;
  amount: string;
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

async function balance(args: BalanceArgs) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.fileCached(arweave, "cache");

  let connection = await connect(warp, args.contract, wallet);
  let res = await connection.balanceOf(args.address);

  console.log(res);
}

async function allowance(args: AllowanceArgs) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.fileCached(arweave, "cache");

  let connection = await connect(warp, args.contract, wallet);
  let res = await connection.allowance(args.owner, args.spender);

  console.log(res);
}

async function approve(args: ApproveArgs) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.fileCached(arweave, "cache");

  let connection = await connect(warp, args.contract, wallet);
  let res = await connection.approve(args.spender, BigInt(args.amount));

  console.log(res);
}

async function transfer(args: TransferArgs) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.fileCached(arweave, "cache");

  let connection = await connect(warp, args.contract, wallet);
  let res = await connection.transfer(args.recipient, BigInt(args.amount));

  console.log(res);
}

async function readState(args: {
  wallet: string;
  gateway: string;
  contract: string;
}) {
  let arweaveUrl = new URL(args.gateway);

  let wallet = await readJwk(args.wallet);

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.fileCached(arweave, "cache");
  let connection = await connect(warp, args.contract, wallet);

  console.log(JSON.stringify(await connection.readState(), null, 4));
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
  .command("balance")
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
  .requiredOption("-a, --address <address>", "Balance of")
  .action((opts) => {
    balance(opts)
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
  .command("transfer")
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
  .requiredOption("-r, --recipient <address>", "Transfer to")
  .requiredOption("-a, --amount <amount>", "Amount in winston")
  .action((opts) => {
    transfer(opts)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Application failed: ", err);
        process.exit(1);
      });
  });

program
  .command("approve")
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
  .requiredOption("-s, --spender <address>", "Transfer to")
  .requiredOption("-a, --amount <amount>", "Amount in winston")
  .action((opts) => {
    approve(opts)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Application failed: ", err);
        process.exit(1);
      });
  });

program
  .command("allowance")
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
  .requiredOption("-o, --owner <address>", "Transfer to")
  .requiredOption("-s, --spender <address>", "Transfer to")
  .action((opts) => {
    allowance(opts)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error("Application failed: ", err);
        process.exit(1);
      });
  });

program.parse();
