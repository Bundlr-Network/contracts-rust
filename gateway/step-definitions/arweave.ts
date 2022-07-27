import { AfterAll, BeforeAll } from "@cucumber/cucumber";

import ArLocal from "arlocal";
import Arweave from "arweave";
import { LoggerFactory, Warp, WarpNodeFactory } from "warp-contracts";

let connection: ArLocal;

function getConnection(): [Arweave, Warp] {
  const arweave = Arweave.init({
    host: "localhost",
    port: 1820,
    protocol: "http",
  });

  LoggerFactory.INST.logLevel("trace");

  return [arweave, WarpNodeFactory.memCachedBased(arweave).useArweaveGateway().build()];
}

BeforeAll(async function () {
  connection = new ArLocal(1820, false);
  await connection.start();
  // Start resolves beore the ArLocal is ready and listening,
  // so just wait a bit longer to make sure it's ready
  return new Promise<void>((resolve) => {
    setTimeout(async () => {
      resolve();
    }, 2000);
  });
});

AfterAll(async function () {
  // something tries blockchain interactions while (or after)
  // this AfterAll hook is called.
  // this is just a terrible hack to wait a moment longer
  return new Promise<void>((resolve) => {
    setTimeout(async () => {
      await connection.stop();
      resolve();
    }, 2000);
  });
});

export default {
  getConnection,
};
