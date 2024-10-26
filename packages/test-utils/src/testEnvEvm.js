import { spawn, execSync } from 'child_process';
import { CID } from 'multiformats/cid'
import { namehash } from 'viem/ens'
import { toString } from 'uint8arrays/to-string'
import net from 'net';

export class TestEnvironmentEvm {
    constructor() {
        this.anvilProcess = null;
        this.addresses = null;
        this.port = null;
        this.url = null;
        this.chainId = '31337';
        this.secretKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
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

    async start(options = {}) {
        const { port, externalAnvil = false, withManager = false } = options;
        
        // Find an available port
        this.port = port || await this.findAvailablePort();
        this.url = `http://127.0.0.1:${this.port}`;

        if (!externalAnvil) {
            // Start Anvil (using chainId from StdChains.sol)
            this.anvilProcess = spawn('anvil', [
                '--chain-id', this.chainId,
                '--block-time', '0.5',
                '--port', this.port.toString()
            ]);

            // Add error handling for the process
            this.anvilProcess.on('error', (error) => {
                console.error('Anvil process error:', error);
            });

            this.anvilProcess.stderr.on('data', (data) => {
                console.error('Anvil stderr:', data.toString());
            });

            this.anvilProcess.stdout.on('data', (data) => {
                // This is a hack to make anvil doesn't stall for some reason
                return
            });

            // Wait for Anvil to start
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Deploy contracts
        const scriptFunction = withManager ? 'runWithManager()' : 'run()';
        const output = execSync(
            `cd ../../contracts && forge script script/DeployTestEnv.s.sol:DeployTestEnv --sig "${scriptFunction}" --broadcast --rpc-url ${this.url} --private-key ${this.secretKey}`,
            { encoding: 'utf8' }
        );

        // Parse deployment addresses
        const jsonLine = output.split('\n').find(line => line.trim().startsWith('{'));
        this.addresses = JSON.parse(jsonLine);
        // console.log('addresses', this.addresses)

        return this.addresses;
    }

    mintPage(domain, duration, to) {
        // Convert duration to expiration timestamp
        const expiresAt = Math.floor(Date.now() / 1000) + duration;
        return this.updateUnits(domain, expiresAt, 0, to);
    }

    updateUnits(domain, expiresAt, unitIndex, to) {
        const result = execSync(
            `cast send ${this.addresses.simplepage} "updateUnits(string,uint256,uint256,address)" ${domain} ${expiresAt} ${unitIndex} ${to} --private-key ${this.secretKey} --rpc-url ${this.url}`,
            { encoding: 'utf8' }
        );
        return result;
    }

    setContenthash(resolver, domain, cid) {
        const node = namehash(domain);
        const contentHashHex = this.encodeCid(cid);
        const result = execSync(
            `cast send ${resolver} "setContenthash(bytes32,bytes)" ${node} ${contentHashHex} --private-key ${this.secretKey} --rpc-url ${this.url}`,
            { encoding: 'utf8' }
        );
    }

    clearContenthash(resolver, domain) {
        const node = namehash(domain);
        const result = execSync(
            `cast send ${resolver} "setContenthash(bytes32,bytes)" ${node} 0x --private-key ${this.secretKey} --rpc-url ${this.url}`,
            { encoding: 'utf8' }
        );
    }

    setResolver(universalResolver, domain, resolver) {
        const node = namehash(domain);
        const result = execSync(
            `cast send ${universalResolver} "setResolver(bytes32,address)" ${node} ${resolver} --private-key ${this.secretKey} --rpc-url ${this.url}`,
            { encoding: 'utf8' }
        );
    }

    clearResolver(universalResolver, domain) {
        const node = namehash(domain);
        const result = execSync(
            `cast send ${universalResolver} "setResolver(bytes32,address)" ${node} 0x0000000000000000000000000000000000000000 --private-key ${this.secretKey} --rpc-url ${this.url}`,
            { encoding: 'utf8' }
        );
    }

    setTextRecord(resolver, domain, key, value) {
        const node = namehash(domain);
        const result = execSync(
            `cast send ${resolver} "setText(bytes32,string,string)" ${node} ${key} "${value}" --private-key ${this.secretKey} --rpc-url ${this.url}`,
            { encoding: 'utf8' }
        );
    }

    clearTextRecord(resolver, domain, key) {
        const node = namehash(domain);
        const result = execSync(
            `cast send ${resolver} "setText(bytes32,string,string)" ${node} ${key} "" --private-key ${this.secretKey} --rpc-url ${this.url}`,
            { encoding: 'utf8' }
        );
    }

    encodeCid(cid) {
        // Create a simple IPFS contenthash encoding
        const cidHex = toString(CID.parse(cid).bytes, 'base16')
        return `0xe301${cidHex}`;
    }

    timeTravel(seconds) {
        const result = execSync(
            `cast rpc evm_increaseTime ${seconds} --rpc-url ${this.url}`,
            { encoding: 'utf8' }
        );
        return result;
    }

    async stop() {
        if (this.anvilProcess) {
            this.anvilProcess.kill('SIGTERM');
            // Wait a bit for the process to terminate
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Force kill if still running
            if (!this.anvilProcess.killed) {
                this.anvilProcess.kill('SIGKILL');
            }
        }
    }
} 