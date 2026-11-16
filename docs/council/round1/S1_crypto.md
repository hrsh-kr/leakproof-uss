# S1 (applied crypto / key management): LeakProof keys

Verified in `logic.mjs` and `pipeline-core.mjs`: the exam secret is `randomHex(15)` (120 bits), `deriveKey` is SHA-256 of its hex string, and `rngFrom` collapses any seed to 32 bits (xmur3 plus mulberry32). The draw and every seat's copy order use it. `combine()` accepts duplicate x-values silently.

## (a) Key architecture
| Option | How | Pro | Con |
|---|---|---|---|
| A. Brief's v1: symmetric pool key, then exam key | 2 ceremonies | Matches the docs | A pool key given to setters lets them read each other's questions. Two ceremonies is the "too many steps" Phase I complaint. |
| **B. Pool keypair, per-question keys (recommend)** | Admin's browser makes an ECDH/RSA-OAEP keypair. The public key goes to setters. Each question gets a random AES key, wrapped to the public key. The private key is AES-wrapped under a random 32-byte key W, and **W is Shamir-split 3-of-5**. | Setters can't read others' questions. The draw runs on IDs only, so no plaintext ever exists before release. **One** ceremony (release). | Hybrid-encryption code is new. The quorum can open undrawn questions, though the server only sends drawn ones. |
| C. Trusted draw server | Server decrypts for the draw | 2 days of work saved | Server sees plaintext. The honest fallback if B slips. |

**Locations:** the public key is on the server. Wrapped question keys and ciphertext are on the server. Each custodian's share is encrypted under their own passphrase (PBKDF2-SHA256, at least 600k iterations, 16-byte salt) and stored as a blob. W and the private key are never stored. Plaintext lives only in the centre tab's memory.

## (b) Shamir and AES-GCM
| Option | Pro | Con |
|---|---|---|
| Keep own 127-bit code | Original, already tested | Cannot hold a 256-bit key, so it needs two halves, and `combine` needs hardening |
| **Library, GF(256), byte-wise (recommend)** | Handles 32 bytes. I recall Privy's `shamir-secret-sharing` as audited and dependency-free; **verify that claim and pin the version** | Third-party code. We still write the share checks. |
| Own 2^256−189 prime | Original | Subtle bugs, no audit |

Rules for AES-GCM:
- Use raw random 32-byte keys with **no `deriveKey`**. If a hash is ever kept, use HKDF with a label.
- Use a fresh 96-bit random IV from `getRandomValues` for every encryption, stored beside the ciphertext, never reused under a key.
- Set AAD to `exam|question|setter|version`, so swapped ciphertexts fail.
- Reject duplicate x, x=0 and wrong lengths. Add a SHA-256 commitment per share so a bad share is named.
- Replace `rngFrom` with HMAC-SHA256 or CSPRNG draws, and add an HMAC tag to the copy ID. A check digit catches typos only, so it cannot protect against a forged ID that frames a seat.
- Run the app over HTTPS: `crypto.subtle` does not exist on plain `http://` pages.

## (c) Honest claims
**Can claim:**
- A stolen database, backup or snapshot holds no plaintext and no key.
- Fewer than 3 shares reveal nothing.
- Tampered blobs are detected.
- Copy IDs are authenticated.
- Log edits are detected if the head hash is anchored off the VM (posted in the guide, and held by custodians).

**Must state as limits:**
- The VM serves the JavaScript, so a malicious VM operator could ship code that steals shares.
- The ceremony dealer's browser sees the secret once.
- The centre's browser sees the plaintext.
- There is no HSM, and printers are simulated.
- A hash chain alone proves nothing against the database owner.

## (d) Mistakes classmates will find
1. Labelling 120-127-bit keys as AES-256, or SHA-256 as a KDF.
2. Key or shares reaching the server, localStorage, URLs or logs, or a quorum enforced only in the UI.
3. IV reuse, or no AAD.
4. A 32-bit seeded PRNG for the draw and the copies.
5. A tamper-evident log the database owner can recompute.

**Biggest risk of B:** hybrid wrap/unwrap code written in a rush. Mitigation: freeze the format first, write test vectors, and do one end-to-end test.
