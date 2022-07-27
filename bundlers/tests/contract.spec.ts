import fs from "node:fs";
import path from "node:path";

import ArLocal from "arlocal";
import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import {
  getTag,
  Warp,
  WarpNodeFactory,
  SmartWeaveTags,
  LoggerFactory,
} from "warp-contracts";

import {
  connect as connectTokenContract,
  deploy as deployTokenContract,
  TokenContract,
  TokenState,
} from "../../token/ts/contract";

import { addFunds, mineBlock } from "../ts/utils";
import { connect, deploy, State, BundlersContract } from "../ts/contract";
import { NetworkInfoInterface } from "arweave/node/network";

jest.setTimeout(30000);

describe("Bundlers Contract", () => {
  let accounts: { wallet: JWKInterface; address: string }[];

  let initialState: State;
  let initialTokenContractState: TokenState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let connections: { token: TokenContract; bundlers: BundlersContract }[];

  let contractTxId: string;
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

    LoggerFactory.INST.logLevel("trace");
    LoggerFactory.INST.logLevel("trace", "WASM:Rust");
    LoggerFactory.INST.logLevel("trace", "WasmContractHandlerApi");

    warp = WarpNodeFactory.memCachedBased(arweave).useArweaveGateway().build();

    // Create accounts, fund them and get address
    accounts = await Promise.all(
      [0, 1, 2, 3].map(async (_) => {
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

    const stateFromFile = JSON.parse(
      fs.readFileSync(path.join(__dirname, "./data/bundlers.json"), "utf8")
    );

    initialState = {
      ...stateFromFile,
      withdrawDelay: 3, // NOTE: For tests, we allow withdraw after 3 blocks
      token: tokenContractTxId,
      stake: (
        BigInt(10) ** BigInt(initialTokenContractState.decimals)
      ).toString(),
    };

    contractTxId = await deploy(warp, accounts[0].wallet, initialState).then(
      (deployment) => deployment.contractTxId
    );
    await mineBlock(arweave);

    console.log(`Contract TX ID: ${contractTxId}`);
    console.log(`Token Contract TX ID: ${tokenContractTxId}`);

    connections = await Promise.all(
      accounts.map(async (account) => {
        let [token, bundlers] = await Promise.all([
          connectTokenContract(warp, tokenContractTxId, account.wallet),
          connect(warp, contractTxId, account.wallet),
        ]);
        token.connect(account.wallet);
        bundlers.connect(account.wallet);
        return { token, bundlers };
      })
    );

    await connections[0].token.transfer(
      accounts[1].address,
      BigInt(200) * BigInt(10) ** BigInt(await connections[0].token.decimals())
    );

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

  it("contract owner has implicit right to add interactors", async () => {
    expect(await connections[0].bundlers.allowedInteractors()).not.toContain(
      accounts[0].address
    );

    await connections[0].bundlers.addAllowedInteractor(accounts[1].address);
    await mineBlock(arweave);

    expect(await connections[0].bundlers.allowedInteractors()).toContain(
      accounts[1].address
    );
  });

  it("allowed interactor has right to add other interactors", async () => {
    expect(await connections[0].bundlers.allowedInteractors()).not.toContain(
      accounts[2].address
    );
    expect(await connections[0].bundlers.allowedInteractors()).not.toContain(
      accounts[3].address
    );

    await connections[1].bundlers.addAllowedInteractor(accounts[2].address);
    await connections[1].bundlers.addAllowedInteractor(accounts[3].address);
    await mineBlock(arweave);

    expect(await connections[0].bundlers.allowedInteractors()).toContain(
      accounts[2].address
    );
    expect(await connections[0].bundlers.allowedInteractors()).toContain(
      accounts[3].address
    );
  });

  it("allowed interactor has right to remove other interactors", async () => {
    expect(await connections[0].bundlers.allowedInteractors()).toContain(
      accounts[3].address
    );

    await connections[1].bundlers.removeAllowedInteractor(accounts[3].address);
    await mineBlock(arweave);

    expect(await connections[0].bundlers.allowedInteractors()).not.toContain(
      accounts[3].address
    );
  });

  it("contract owner has implicit right to remove other interactors", async () => {
    expect(await connections[0].bundlers.allowedInteractors()).toContain(
      accounts[2].address
    );

    await connections[0].bundlers.removeAllowedInteractor(accounts[2].address);
    await mineBlock(arweave);

    expect(await connections[0].bundlers.allowedInteractors()).not.toContain(
      accounts[2].address
    );
  });

  it("join should fail when allowance is not properly set", async () => {
    let balancesBefore = await Promise.all(
      [accounts[1].address, contractTxId].map((address) =>
        connections[0].token.balanceOf(address).then(({ balance }) => balance)
      )
    );

    await connections[1].bundlers.join();
    await mineBlock(arweave);

    let bundlers = await connections[1].bundlers.bundlers();
    expect(Object.keys(bundlers)).not.toContain(accounts[1].address);

    let bundlerBalanceBefore = BigInt(balancesBefore[0]);
    let bundlerBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(accounts[1].address)).balance
    );
    expect(bundlerBalanceAfter).toEqual(bundlerBalanceBefore);

    let contractBalanceBefore = BigInt(balancesBefore[1]);
    let contractBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(contractTxId)).balance
    );
    expect(contractBalanceAfter).toEqual(contractBalanceBefore);
  });

  it("join should succeed after approving allowance for the stake", async () => {
    let balancesBefore = await Promise.all(
      [accounts[1].address, contractTxId].map((address) =>
        connections[0].token.balanceOf(address).then(({ balance }) => balance)
      )
    );

    let stake = BigInt(await connections[1].bundlers.stake());

    await connections[1].token.approve(contractTxId, stake);
    await mineBlock(arweave);

    await connections[1].bundlers.join();
    await mineBlock(arweave);

    expect(await connections[0].bundlers.bundlers()).toEqual(
      expect.objectContaining({ [accounts[1].address]: null })
    );

    let bundlerBalanceBefore = BigInt(balancesBefore[0]);
    let bundlerBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(accounts[1].address)).balance
    );
    expect(bundlerBalanceAfter).toEqual(bundlerBalanceBefore - stake);

    let contractBalanceBefore = BigInt(balancesBefore[1]);
    let contractBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(contractTxId)).balance
    );
    expect(contractBalanceAfter).toEqual(contractBalanceBefore + stake);
  });

  it("leave should register bundler as leaving with block number", async () => {
    let balancesBefore = await Promise.all(
      [accounts[1].address, contractTxId].map((address) =>
        connections[0].token.balanceOf(address).then(({ balance }) => balance)
      )
    );

    let withdrawDelay = await connections[1].bundlers.withdrawDelay();

    await connections[1].bundlers.leave();
    await mineBlock(arweave);

    // FIXME: is there any better way to sync the state after mining?
    await connections[1].bundlers.currentState();

    // cast getNetworkInfo() result to ignore that it might return null
    const networkInfo =
      connections[1].bundlers.getNetworkInfo() as NetworkInfoInterface;

    expect(await connections[0].bundlers.bundlers()).toEqual(
      expect.objectContaining({
        // FIXME: why the bundlers map has strings as values instead of bigints
        [accounts[1].address]: (networkInfo.height + withdrawDelay).toString(),
      })
    );

    let bundlerBalanceBefore = BigInt(balancesBefore[0]);
    let bundlerBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(accounts[1].address)).balance
    );
    expect(bundlerBalanceAfter).toEqual(bundlerBalanceBefore);

    let contractBalanceBefore = BigInt(balancesBefore[1]);
    let contractBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(contractTxId)).balance
    );
    expect(contractBalanceAfter).toEqual(contractBalanceBefore);
  });

  it("withdraw should succeed after withdraw delay", async () => {
    // NOTE: pulling current state makes sure we are in-sync
    await connections[1].bundlers.currentState();

    let balancesBefore = await Promise.all(
      [accounts[1].address, contractTxId].map((address) =>
        connections[1].token.balanceOf(address).then(({ balance }) => balance)
      )
    );

    let stake = BigInt(await connections[1].bundlers.stake());

    // FIXME: why does this map return strings instead of bigints?
    let withdrawAllowedAt = (await connections[1].bundlers.bundlers())[
      accounts[1].address
    ];

    // cast getNetworkInfo() result to ignore that it might return null
    let networkInfo =
      connections[1].bundlers.getNetworkInfo() as NetworkInfoInterface;

    let blocksNeeded = Math.max(
      0,
      Number(BigInt(withdrawAllowedAt) - BigInt(networkInfo.height))
    );

    // Mine enought blocks so that withdraw should become available
    for (let i = 0; i < blocksNeeded; ++i) {
      await mineBlock(arweave);
    }

    await connections[1].bundlers.withdraw();
    await mineBlock(arweave);

    let bundlers = await connections[0].bundlers.bundlers();
    expect(Object.keys(bundlers)).not.toContain(accounts[1].address);

    let contractBalanceBefore = BigInt(balancesBefore[1]);
    let contractBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(contractTxId)).balance
    );
    expect(contractBalanceAfter).toEqual(contractBalanceBefore - stake);

    let bundlerBalanceBefore = BigInt(balancesBefore[0]);
    let bundlerBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(accounts[1].address)).balance
    );
    expect(bundlerBalanceAfter).toEqual(bundlerBalanceBefore + stake);
  });
});
