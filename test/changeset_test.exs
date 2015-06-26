defmodule Alkyl.RawChangesetTest do
  use ExUnit.Case
  alias Alkyl.PadData.RawChangeset

  test "test parsing a changeset string" do

    changeset_str = "Z:5g>7|5=2p=v*4*5+1=9*5+6$xblabla"

    desired = %RawChangeset{changeset_str: "Z:5g>7|5=2p=v*4*5+1=9*5+6$xblabla",
                            old_len: 196,
                            new_len: 203,
                            change_ops: [
                              %{attribs: [], len: 97, lfs: 5, opc: "=", text: ""},
                              %{attribs: [], len: 31, lfs: 0, opc: "=", text: ""},
                              %{attribs: ["4", "5"], len: 1, lfs: 0, opc: "+", text: "x"},
                              %{attribs: [], len: 9, lfs: 0, opc: "=", text: ""},
                              %{attribs: ["5"], len: 6, lfs: 0, opc: "+", text: "blabla"}
                               ],
                            char_bank: "xblabla"}

    assert RawChangeset.parse(changeset_str) == desired
  end

end
