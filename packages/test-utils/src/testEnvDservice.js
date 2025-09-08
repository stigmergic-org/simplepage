import { TestEnvironmentKubo } from "./testEnvKubo";
import { TestEnvironmentEvm } from "./testEnvEvm";
import { DService } from '@simplepg/dservice';
import net from 'net';

export class TestEnvironmentDservice {
  constructor() {
    this.dservice = null;
    this.kubo = new TestEnvironmentKubo();
    this.evm = new TestEnvironmentEvm();
    this.dservicePort = null;
  }

  async findAvailablePort() {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(0, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
    });
  }

  async waitUntilBlockIsIndexed(blockNumber) {
    while (this.dservice.indexer.currentBlock < blockNumber) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async start() {
    this.addresses = await this.evm.start();
    this.kuboApi = await this.kubo.start();
    
    // Find an available port for dservice
    this.dservicePort = await this.findAvailablePort();
    this.dserviceUrl = `http://localhost:${this.dservicePort}`;
    console.log('dserviceUrl', this.dserviceUrl)
    
    const config = {
      ipfs: {
        ipfsClient: this.kuboApi
      },
      api: {
        port: this.dservicePort,
        host: 'localhost'
      },
      blockchain: {
        rpcUrl: this.evm.url,
        startBlock: 1,
        chainId: this.evm.chainId,
        universalResolver: this.addresses.universalResolver,
        simplePageAddress: this.addresses.simplepage
      },
      silent: true
    };
    
    this.dservice = new DService(config);
    await this.dservice.start();
  }

  async stop() {
    if (this.dservice) {
      await this.dservice.stop();
    }
    await this.kubo.stop();
    await this.evm.stop();
  }
}