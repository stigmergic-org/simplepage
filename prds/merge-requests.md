# Merge Requests

Instead of forking the page to your own ENS domain, you can submit a merge request to the page you are editing.

## General reqirements
- In order to submit a MR, the user must have at least one SimplePage subscription
- User signs a message to submit a MR to a DService backend

## Frontend requirements
- All pending MRs can be inspected under /spg-merges
- All MRs loaded from DService must be verified client side (e.g. signature, block data can be loaded from /page as normal)
- Repo lib can handle creating requests and merging requests
- Each MR can be shown with diff and merged, if merged the `_prev` folder might get multiple CIDs, e.g.g `0`, `1`, etc.

## DService requirements
- Endpoint /merges/:ens-name
  - GET: list all merge request for the given name
  - POST: add or update a specific merge request to the given name
- Sync MRs with other DService instances
  - Discovery: Provide to DHT, an inline CID("spg-merges")
  - Publish to IPNS (w/ node PeerID): CID(Map<ens-name, merge-request[]>)
  - Find other DServices providing CID("spg-merges")
  - Resolve other DServices IPNS and ingest their MR maps



## Merge request signature format

Merge request could utilize SIWE in the following way:

```
simplepage.eth.link wants you to sign in with your Ethereum account:
0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2

Merge Request: "This is the title"

URI: web3://jthor.eth // the identity making the MR
Version: 1
Chain ID: 1
Nonce: 32891756 // the nonce should be incremental, allows MR updates
Issued At: 2021-09-30T16:25:24Z
Expiration Time: 2021-10-30T16:25:24Z
Request ID: {uuid} // a uuid identifying the MR
Resources:
- ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwqx // the new proposed repo root
```