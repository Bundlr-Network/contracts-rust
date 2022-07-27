import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import { Command } from "commander";

import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import { WarpNodeFactory } from "warp-contracts";

import { deploy } from "./contract";

function readJwk(filepath: string): Promise<JWKInterface> {
  let f = path.resolve(process.cwd(), filepath);
  return fs.readFile(f).then((walletData) => {
    let json = JSON.parse(walletData.toString());
    return json as JWKInterface;
  });
}

type CliArgs = {
  gateway: string;
  wallet: string;
  state: string;
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

async function run(args: CliArgs) {
  let arweaveUrl = new URL(args.gateway);
  let wallet = await readJwk(args.wallet);

  let arweave = Arweave.init({
    host: arweaveUrl.hostname,
    port: arweaveUrl.port ? arweaveUrl.port : defaultPort(arweaveUrl.protocol),
    protocol: arweaveUrl.protocol.split(":")[0], // URL holds colon at the end of the protocol
  });

  let warp = WarpNodeFactory.memCached(arweave);

  let walletAddress = await arweave.wallets.jwkToAddress(wallet);

  let contractSrc = await fs.readFile(
    path.join(__dirname, "../pkg/rust-contract_bg.wasm")
  );

  const stateFromFile = JSON.parse(
    await fs.readFile(path.resolve(process.cwd(), args.state), "utf8")
  );

  let initialState = {
    ...stateFromFile,
    ...{
      owner: walletAddress,
      balances: {
        [walletAddress]: stateFromFile.totalSupply.toString(),
      },
    },
  };

  return await deploy(warp, wallet, initialState, false);
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
  .requiredOption("-w, --wallet <path>", "Path to Arweave wallet file")
  .requiredOption(
    "-s, --state <path>",
    "Path to JSON file defining initial state"
  );

run(appArgs.parse(process.argv).opts())
  .then((result) => {
    console.error("Deployment done");
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Deployment failed: ", err);
    process.exit(1);
  });
