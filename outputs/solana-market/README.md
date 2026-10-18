# Optional Solana quote engine

The current quote program supports waits of up to **12 hours**, with 60 seconds
of allowance for clock drift. The client rejects longer waits before submitting
a transaction. Use the normal server merchant engine for a 24-hour waiting cart.

Shopper maximum totals and minimum savings constrain the quote ceiling. Returned
quotes are checked against both conditions before they can become merchant offers.

`npm run test:solana` executes the existing compiled program in **LiteSVM**, using
the test's injected local RPC adapter. It makes no public devnet transactions and
does not deploy the program. A passing local test is not evidence of deployment.
