import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import dotenv from "dotenv";
import { Command } from "commander";

import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";

import { WarpNodeFactory } from "warp-contracts";

function readJwk(filepath: string): Promise<JWKInterface> {
  let f = path.resolve(process.cwd(), filepath);
  return fs.readFile(f).then((walletData) => {
    let json = JSON.parse(walletData.toString());
    return json as JWKInterface;
  });
}

type BalanceArgs = {
  gateway: string;
  address: string;
};

type TransferArgs = {
  gateway: string;
  wallet: string;
  recipient: string;
  amount: string;
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

  let arweave: Arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.fileCached(arweave, "cache");

  let res = await warp.arweave.wallets.getBalance(args.address);

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

  let tx = await arweave.createTransaction(
    {
      target: args.recipient,
      quantity: args.amount,
    },
    wallet
  );

  await arweave.transactions.sign(tx, wallet);

  let res = await arweave.transactions.post(tx);

  console.log(res);
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
  .command("transfer")
  .option(
    "-g, --gateway <url>",
    "Arweave gateway URL",
    process.env.BUNDLR_ARWEAVE
      ? process.env.BUNDLR_ARWEAVE
      : "https://arweave.net"
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

program.parse();
