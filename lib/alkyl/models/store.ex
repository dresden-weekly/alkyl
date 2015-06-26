defmodule Alkyl.Store do
  use Ecto.Model

  @primary_key { :key, :string, [] }

  schema "store" do
    field :value, :string

    timestamps
  end

  import Alkyl.Repo
  # import Alkyl.Utils.Common
  alias __MODULE__

  def write_pad( name, value ) do
    pad_id = "pad:#{name}"
    pad = get(Store, pad_id)
    if pad do
      update(%Store{pad | value: value})
    else
      insert(%Store{key: "pad:#{name}", value: value})
    end
  end

  def read_pad(name) do
    get(Store, "pad:#{name}")
  end

  def create_pad( name, value ) do
    insert(%Store{key: "pad:#{name}", value: value})
  end

  def update_pad( name, value ) do
    pad = get!(Store, "pad:#{name}")
    update(%Store{pad | value: value})
  end
end
