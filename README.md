Alkyl
=====

Elixir/Cowboy based [Etherpad](http://etherpad.org) back-end.


Copy `config/sample-dev.exs` to `config/dev.exs` and start with `iex -S mix`.
Then open http://127.0.0.1:4001/.


Current state: **draft**

The [Changeset Protocol](http://policypad.readthedocs.org/en/latest/changesets.html) is now basically working.

Next features to implement:

- create real sessions
- saving guest users and pads with revision history
- apply changes from the client to a saved pad
- create pad sessions to forward changes to multiple clients
