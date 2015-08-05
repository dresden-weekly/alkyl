defmodule Alkyl.Store do
  use Ecto.Model
  import Ecto.Query, only: [from: 2]
  require Logger
  alias Alkyl.PadData.Pad
  import Alkyl.Repo
  # import Alkyl.Utils.Common
  alias __MODULE__

  @primary_key { :key, :string, [] }

  schema "store" do
    field :value, :string

    timestamps
  end

  def write_pad( name, value ) do
    pad_id = "pad:#{name}"
    pad = get(Store, pad_id)
    if pad do
      update(%Store{pad | value: value})
    else
      insert(%Store{key: "pad:#{name}", value: value})
    end
  end

  def get_pad(name) do
    pad_id = "pad:#{name}"
    pad = get(Store, pad_id)
    if pad do
      Poison.decode! pad.value, as: Pad
    else
      insert(%Store{key: pad_id, value: Poison.encode! Alkyl.MessageDefaults.initial_pad})
      Alkyl.MessageDefaults.initial_pad
    end
  end

  def create_pad( name, value ) do
    insert(%Store{key: "pad:#{name}", value: value})
  end

  def update_pad( name, value ) do
    pad = get!(Store, "pad:#{name}")
    update(%Store{pad | value: value})
  end

  def insert_or_update(key, value) do
    rec = get(Store, key)
    if rec do
      update(%Store{rec | value: value})
    else
      insert(%Store{key: key, value: value})
    end
  end

  def author_by_token(tok) do
    key = "token2author:#{tok}"
    rec = get(Store, key)
    if rec do
      author_rec = get(Store, "globalAuthor:#{rec.value}")
      author = Poison.decode! author_rec.value, keys: :atoms
    else
      author = Alkyl.MessageDefaults.author
      rec = insert(%Store{key: key, value: Alkyl.Utils.Session.author_id})
      author_rec = insert(%Store{key: "globalAuthor:#{rec.value}", value: Poison.encode!(author) })
    end
    update(%Store{author_rec | value: Poison.encode!(%{author | timestamp: Alkyl.Utils.Messages.js_now()}) })
    %{user: rec.value, user_name: author.name, user_colorId: author.colorId}
  end

  def update_user(user, data) do
    author_rec = get(Store, "globalAuthor:#{user}")
    author = Poison.decode! author_rec.value, keys: :atoms
    update(%Store{author_rec | value: Poison.encode!(%{Map.merge(author, data) | timestamp: Alkyl.Utils.Messages.js_now()}) })
  end

  def insert_chat(pad, message) do
    message = Dict.delete message, "type"
    pad_id = "pad:#{pad}"
    transaction fn ->
      q = from s in Store, where: s.key == ^pad_id, lock: "FOR UPDATE"
      # Logger.debug "pad_id #{pad_id}"
      %Store{value: pad_cont} = pad_rec = Alkyl.Repo.one q
      %Pad{chatHead: lnum} = pad_json_obj = Poison.decode! pad_cont, as: Pad
      insert(%Store{key: "pad:#{pad}:chat:#{to_string(lnum+1)}", value: Poison.encode!(message)})
      update(%Store{pad_rec | value: Poison.encode!(%Pad{pad_json_obj | chatHead: lnum + 1})})
    end
  end

  def get_chats(pad) do
    match = "pad:#{pad}:chat:[0-9]+"
    q = from s in Alkyl.Store,
          where: fragment("? similar to ?", s.key, ^match),
          order_by: fragment("regexp_replace(?, '^.+:', '')::int", s.key)
    Alkyl.Repo.all(q) |> Enum.map &(Poison.decode! &1.value)
  end
end
