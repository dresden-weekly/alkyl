use Mix.Config

config :alkyl, Alkyl.Repo,
  adapter: Ecto.Adapters.Postgres,
  hostname:   "localhost",
  database:   "alkyl_dev",
  # ssl:        true,
  username:   "postgres",
  password:   "password"
