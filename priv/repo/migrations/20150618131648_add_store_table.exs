defmodule Alkyl.Repo.Migrations.AddStoreTable do
  use Ecto.Migration

  def change do
    create table(:store, primary_key: false) do
      add :key, :string, primary_key: true
      add :value, :text

      timestamps
    end
  end
end
