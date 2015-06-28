defmodule AlkylTest do
  use ExUnit.Case

  import Alkyl.Utils.Common

  test "split_lf_aware function" do
    assert split_lf_aware("one line string\n", 3)         == {"one", " line string\n"}
    assert split_lf_aware("one line string\n", 9)         == {"one line ", "string\n"}
    assert split_lf_aware("two line\n string\n", 9)       == {"two line\n", " string\n"}
    assert split_lf_aware("one line ütf-8 string\n", 3)   == {"one", " line ütf-8 string\n"}
    assert split_lf_aware("one line ütf-8 string\n", 9)   == {"one line ", "ütf-8 string\n"}
    assert split_lf_aware("one line ütf-8 string\n", 14)  == {"one line ütf-8", " string\n"}
    assert split_lf_aware("two line\n ütf-8 string\n", 9) == {"two line\n", " ütf-8 string\n"}

    assert split_lf_aware("", 0)                          == {"", ""}
    assert split_lf_aware("", 5)                          == {"", ""}
    assert split_lf_aware("one", 5)                       == {"one", ""}
    assert split_lf_aware("one\n line", 10)               == {"one\n", " line"}
    assert split_lf_aware("two\nlines\n", 12)             == {"two\nlines\n", ""}
    # assert_raise ArgumentError, "position out of range", fn ->
    #   split_lf_aware("", 5)
    # end
  end
end
