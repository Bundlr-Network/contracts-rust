import fs from "node:fs";
import path from "node:path";

import ArLocal from "arlocal";
import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";

import {
  connect as connectTokenContract,
  deploy as deployTokenContract,
  TokenContract,
  TokenState,
} from "../../token/ts/contract";

import {
  connect as connectBundlersContract,
  deploy as deployBundlersContract,
  BundlersContract,
  State as BundlersState,
} from "../../bundlers/ts/contract";

import { addFunds, mineBlock } from "../ts/utils";
import {
  connect,
  deploy,
  SlashProposal,
  State,
  ValidatorsContract,
} from "../ts/contract";
import {
  getTag,
  LoggerFactory,
  SmartWeaveTags,
  Warp,
  WarpNodeFactory,
} from "warp-contracts";
import { NetworkInfoInterface } from "arweave/node/network";

jest.setTimeout(30000);

describe("Bundlers Contract", () => {
  let accounts: { wallet: JWKInterface; address: string }[];

  let initialState: State;
  let initialBundlersContractState: BundlersState;
  let initialTokenContractState: TokenState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let connections: {
    token: TokenContract;
    bundlers: BundlersContract;
    validators: ValidatorsContract;
  }[];

  let contractTxId: string;
  let bundlersContractTxId: string;
  let tokenContractTxId: string;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1820, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: "localhost",
      port: 1820,
      protocol: "http",
    });

    LoggerFactory.INST.logLevel("error");
    // LoggerFactory.INST.logLevel("debug", "WASM:Rust");
    // LoggerFactory.INST.logLevel("debug", "WasmContractHandlerApi");

    warp = WarpNodeFactory.memCachedBased(arweave).useArweaveGateway().build();

    // Create accounts, fund them and get address
    accounts = await Promise.all(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(async (_) => {
        let wallet = await arweave.wallets.generate();
        await addFunds(arweave, wallet);
        let address = await arweave.wallets.jwkToAddress(wallet);
        return {
          wallet,
          address,
        };
      })
    );

    const tokenContractStateFromFile = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../../token/tests/data/token.json"),
        "utf8"
      )
    );

    initialTokenContractState = {
      ...tokenContractStateFromFile,
      ...{
        owner: accounts[0].address,
        balances: {
          [accounts[0].address]:
            tokenContractStateFromFile.totalSupply.toString(),
        },
      },
    };

    tokenContractTxId = await deployTokenContract(
      warp,
      accounts[0].wallet,
      initialTokenContractState
    ).then((deployment) => deployment.contractTxId);

    const initialBundlersContractStateFromFile = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../../bundlers/tests/data/bundlers.json"),
        "utf8"
      )
    );

    initialBundlersContractState = {
      ...initialBundlersContractStateFromFile,
      withdrawDelay: 3, // NOTE: For tests, we allow withdraw after 3 blocks
      token: tokenContractTxId,
      stake: (
        BigInt(10) ** BigInt(initialTokenContractState.decimals)
      ).toString(),
    };

    bundlersContractTxId = await deployBundlersContract(
      warp,
      accounts[0].wallet,
      initialBundlersContractState
    ).then((deployment) => deployment.contractTxId);

    const stateFromFile: State = JSON.parse(
      fs.readFileSync(path.join(__dirname, "./data/validators.json"), "utf8")
    );

    let networkInfo = await warp.arweave.network.getInfo();

    initialState = {
      ...stateFromFile,
      token: tokenContractTxId,
      bundlersContract: bundlersContractTxId,
      minimumStake: (
        BigInt(10) ** BigInt(initialTokenContractState.decimals)
      ).toString(),
      bundler: accounts[1].address,
      epoch: {
        seq: "0",
        tx: networkInfo.current,
        height: networkInfo.height.toString(),
      },
      epochDuration: 3,
    };

    contractTxId = await deploy(warp, accounts[1].wallet, initialState).then(
      (deployment) => deployment.contractTxId
    );
    await mineBlock(arweave);

    console.log(`Token Contract TX ID: ${tokenContractTxId}`);
    console.log(`Bundlers Contract TX ID: ${bundlersContractTxId}`);
    console.log(`Validators Contract TX ID: ${contractTxId}`);

    connections = await Promise.all(
      accounts.map(async (account) => {
        return Promise.all([
          connectTokenContract(warp, tokenContractTxId, account.wallet),
          connectBundlersContract(warp, bundlersContractTxId, account.wallet),
          connect(warp, contractTxId, account.wallet),
        ]).then(([token, bundlers, validators]) => {
          return { token, bundlers, validators };
        });
      })
    );

    let decimals = await connections[0].token
      .decimals()
      .then((decimals) => BigInt(decimals));
    for (let i = 1; i < accounts.length; ++i) {
      await connections[0].token.transfer(
        accounts[i].address,
        BigInt(200) * BigInt(10) ** decimals
      );
    }
    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it("should properly deploy contract", async () => {
    const contractTx = await arweave.transactions.get(contractTxId);

    expect(contractTx).not.toBeNull();

    const contractSrcTx = await arweave.transactions.get(
      getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID)
    );
    expect(getTag(contractSrcTx, SmartWeaveTags.CONTENT_TYPE)).toEqual(
      "application/wasm"
    );
    expect(getTag(contractSrcTx, SmartWeaveTags.WASM_LANG)).toEqual("rust");
  });

  it("join should fail when allowance is not properly set", async () => {
    await connections[2].validators.join(
      BigInt(100),
      new URL("https://example.com")
    );
    await mineBlock(arweave);

    expect(await connections[2].validators.validators()).not.toContain(
      accounts[2].address
    );
  });

  it("join should succeed after approving allowance for the stake", async () => {
    let stake = await connections[2].validators
      .minimumStake()
      .then((stake) => BigInt(stake));
    await connections[2].token.approve(contractTxId, stake);
    await mineBlock(arweave);

    await connections[2].validators.join(stake, new URL("https://example.com"));
    await mineBlock(arweave);

    expect(await connections[2].validators.validators()).toContain(
      accounts[2].address
    );

    // TODO: check token balances
  });

  it("leave removes validator and returns the stake", async () => {
    await connections[2].validators.leave();
    await mineBlock(arweave);

    expect(await connections[2].validators.validators()).not.toEqual(
      expect.objectContaining({ [accounts[2].address]: false })
    );

    // TODO: check token balances
  });

  it("owner can update epoch", async () => {
    let stake = await connections[2].validators
      .minimumStake()
      .then((stake) => BigInt(stake));
    await connections[2].token.approve(contractTxId, stake);
    await mineBlock(arweave);

    await connections[2].validators.join(stake, new URL("https://example.com"));
    await mineBlock(arweave);

    await connections[1].validators.updateEpoch();
    await mineBlock(arweave);

    expect(await connections[1].validators.nominatedValidators()).toContain(
      accounts[2].address
    );
  });

  it("too frequent updates to epoch fails", async () => {
    await connections[2].validators.updateEpoch();
    await mineBlock(arweave);

    // TODO: how to check that the tx fails?
    // currently just check the test output
  });

  it("update epoch selects 10 random validators", async () => {
    let minimumStake = await connections[1].validators
      .minimumStake()
      .then((stake) => BigInt(stake));

    let epoch: { seq: bigint; tx: string; height: bigint } =
      await connections[1].validators.epoch().then((epoch) => {
        return {
          seq: BigInt(epoch.seq),
          tx: epoch.tx,
          height: BigInt(epoch.height),
        };
      });

    let epochDuration = await connections[1].validators
      .epochDuration()
      .then((duration) => BigInt(duration));

    for (let i = 3; i < accounts.length; ++i) {
      await connections[i].token.approve(contractTxId, minimumStake);
    }
    await mineBlock(arweave);

    for (let i = 3; i < accounts.length; ++i) {
      await connections[i].validators.join(
        minimumStake,
        new URL("https://example.com")
      );
    }
    await mineBlock(arweave);

    // cast getNetworkInfo() result to ignore that it might return null
    let networkInfo =
      connections[1].validators.getNetworkInfo() as NetworkInfoInterface;

    let blocksNeeded = Math.max(
      0,
      Number(epoch.height + epochDuration - BigInt(networkInfo.height))
    );

    // Mine enought blocks so that withdraw should become available
    for (let i = 0; i < blocksNeeded; ++i) {
      await mineBlock(arweave);
    }

    await connections[1].validators.updateEpoch();
    await mineBlock(arweave);

    let nominated1 = await connections[1].validators.nominatedValidators();
    await mineBlock(arweave);
    await mineBlock(arweave);
    await mineBlock(arweave);

    await connections[1].validators.updateEpoch();
    await mineBlock(arweave);

    let nominated2 = await connections[1].validators.nominatedValidators();

    expect(nominated1.sort()).not.toEqual(nominated2.sort());
  });

  it("validator can propose slashing", async () => {
    await connections[2].validators.proposeSlash({
      id: "tx1",
      size: 1,
      fee: "1",
      currency: "BTC",
      block: "100",
      validator: accounts[2].address,
      signature: "this is not verified",
    });
    await mineBlock(arweave);

    let state = await connections[1].validators.currentState();

    expect(state.slashProposals["tx1"]).not.toBeUndefined;
  });

  it("validator can vote slashing", async () => {
    await connections[3].validators.voteSlash("tx1", "for");
    await mineBlock(arweave);

    let state = await connections[1].validators.currentState();

    expect(state.slashProposals["tx1"][4].Open[accounts[3].address]).toEqual(
      "for"
    );
  });
});
