import fs from "node:fs";
import path from "node:path";
import {
  ArWallet,
  Contract,
  ContractDeploy,
  HandlerBasedContract,
  sleep,
  Warp,
} from "warp-contracts";

export type State = {
  bundlers: { [key: string]: string | null };
  allowedInteractors: string[];
  token: string;
  stake: string;
  withdrawDelay: number;
};

export interface BundlersContract extends Contract<State> {
  currentState(): Promise<State>;
  bundlers(): Promise<{ [key: string]: string }>;
  allowedInteractors(): Promise<Set<string>>;
  withdrawDelay(): Promise<number>;
  stake(): Promise<bigint>;
  token(): Promise<string>;
  join(): Promise<string>;
  leave(): Promise<string>;
  withdraw(): Promise<string>;
  syncSlash(): Promise<string>;
  addAllowedInteractor(address: string): Promise<string>;
  removeAllowedInteractor(address: string): Promise<string>;
}

class BundlersContractImpl
  extends HandlerBasedContract<State>
  implements BundlersContract
{
  constructor(
    _contractTxId: string,
    warp: Warp,
    private _mainnet: boolean = false
  ) {
    super(_contractTxId, warp);
  }

  async currentState() {
    return (await super.readState()).state as State;
  }

  async token() {
    const interactionResult = await this.viewState({
      function: "token",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result as string;
  }

  async stake() {
    const interactionResult = await this.viewState({
      function: "stake",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return BigInt(interactionResult.result as string);
  }

  async bundlers() {
    const interactionResult = await this.viewState({
      function: "bundlers",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result as { [key: string]: string };
  }

  async allowedInteractors() {
    const interactionResult = await this.viewState({
      function: "allowedInteractors",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result as Set<string>;
  }

  async withdrawDelay() {
    const interactionResult = await this.viewState({
      function: "withdrawDelay",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result as number;
  }

  async join() {
    return this.write({
      function: "join",
    });
  }

  async leave() {
    return this.write({
      function: "leave",
    });
  }

  async withdraw() {
    return this.write({
      function: "withdraw",
    });
  }

  async syncSlash() {
    return this.write({
      function: "syncSlash",
    });
  }

  async addAllowedInteractor(address: string) {
    return this.write({
      function: "addAllowedInteractor",
      interactor: address,
    });
  }

  async removeAllowedInteractor(address: string) {
    return this.write({
      function: "removeAllowedInteractor",
      interactor: address,
    });
  }

  async write(input: any): Promise<string> {
    const dry = await this.dryWrite(input);
    return this._mainnet
      ? this.bundleInteraction(input).then(async(response) => {
          if (response) {
            await fs.promises.writeFile(`dry_${response.originalTxId}`, `BUNDLER WRITE ${this._mainnet} ${JSON.stringify(dry, null, 4)}`);
            return response.originalTxId;
          }
          throw Error("Received 'null' as interaction response");
        })
      : this.writeInteraction(input).then(async (result) => {
          // if (input.function === "join") { console.log("SLEEPING"); await sleep(10000); }
          if (result) {
            await fs.promises.writeFile(`dry_${result}`, `BUNDLER WRITE ${this._mainnet} ${JSON.stringify(dry, null, 4)}`);
            return result;
          }
          throw Error("Received 'null' as interaction response");
        });
  }
}

export async function deploy(
  warp: Warp,
  wallet: ArWallet,
  initialState: State,
  useBundler: boolean = false
): Promise<ContractDeploy> {
  let contractSrc = fs.readFileSync(
    path.join(__dirname, "../pkg/rust-contract_bg.wasm")
  );
  // deploying contract using the new SDK.
  return warp.createContract.deploy(
    {
      wallet,
      initState: JSON.stringify(initialState),
      src: contractSrc,
      wasmSrcCodeDir: path.join(__dirname, "../src"),
      wasmGlueCode: path.join(__dirname, "../pkg/rust-contract.js"),
    },
    useBundler
  );
}

export async function connect(
  warp: Warp,
  contractTxId: string,
  wallet: ArWallet
): Promise<BundlersContract> {
  let contract = new BundlersContractImpl(
    contractTxId,
    warp,
    warp.useWarpGwInfo // We assume that if we're using the Warp gateway then we're on mainnet
  ).setEvaluationOptions({
    internalWrites: true,
  }) as BundlersContract;

  return contract.connect(wallet) as BundlersContract;
}
