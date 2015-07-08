defmodule Alkyl.ChangesetProcessorTest do
  use ExUnit.Case

  alias Alkyl.PadData.Atext
  alias Alkyl.PadData.Pool
  alias Alkyl.PadData.Pad
  alias Alkyl.PadData.Changeset
  # alias Alkyl.PadData.RawChangeset
  alias Alkyl.PadData.ChangesetProcessor

  test "adding an attribute" do

    pad_atext = %{text: "This is an initial static text-piece.\n\n",
                  attribs: "|2+13"}

    pad_pool = %{numToAttrib: %{}, nextNum: 0}

    chset_str = "Z:13>0=b*0=7$"

    chs_pool = %Pool{numToAttrib: %{"0" => ["bold","true"]}, nextNum: 1}

    { pad, chset } = prepare_data(pad_atext, pad_pool, chset_str, chs_pool)

    result = ChangesetProcessor.apply(pad, chset)

    assert  result == %Pad{
                              atext: %Atext{text: "This is an initial static text-piece.\n\n",
                                            attribs: "+b*0+7|2+l"},
                              pool: %Pool{
                                        numToAttrib: %{"0" => ["bold", "true"]},
                                        nextNum: 1},
                              head: 0
                            }
  end

  test "adding an overlapping attribute" do

    pad_atext = %{text: "This is an initial static text-piece.\n\n",
                  attribs: "+b*0+7|2+l"}

    pad_pool = %{numToAttrib: %{"0" => ["bold","true"]}, nextNum: 1}

    chset_str = "Z:13>0=8*0=h$"

    chs_pool = %Pool{numToAttrib: %{"0" => ["italic","true"]}, nextNum: 1}

    { pad, chset } = prepare_data(pad_atext, pad_pool, chset_str, chs_pool)

    pad_res = ChangesetProcessor.apply(pad, chset)

    assert pad_res.atext.attribs == "+8*1+3*0*1+7*1+7|2+e"

    assert pad_res.pool == %Pool{ numToAttrib: %{"0" => ["bold", "true"],
                                             "1" => ["italic","true"]},
                                  nextNum: 2}
  end

  test "deleting one character" do

    pad_atext = %{text: "This is an initial static text-piece.\n\n",
                  attribs: "+8*1+3*0*1+7*1+7|2+e"}

    pad_pool = %{numToAttrib: %{"0" => ["bold", "true"],
                            "1" => ["italic","true"]}, nextNum: 1}

    chset_str = "Z:13<1=9-1$"

    chs_pool = %Pool{numToAttrib: %{"0" => ["italic","true"]}, nextNum: 1}

    { pad, chset } = prepare_data(pad_atext, pad_pool, chset_str, chs_pool)

    pad_res = ChangesetProcessor.apply(pad, chset)

    assert pad_res.atext.text == "This is a initial static text-piece.\n\n"

    assert pad_res.atext.attribs == "+8*1+2*0*1+7*1+7|2+e"
  end

  test "inserting a word" do

    pad_atext = %{text: "This is a initial static text-piece.\n\n",
                  attribs: "+8*1+2*0*1+7*1+7|2+e"}

    pad_pool = %{numToAttrib: %{"0" => ["bold", "true"],
                            "1" => ["italic","true"]}, nextNum: 1}

    chset_str = "Z:12>5=a*0+5$tiny "

    chs_pool = %Pool{numToAttrib: %{"0" => ["italic","true"]}, nextNum: 1}

    { pad, chset } = prepare_data(pad_atext, pad_pool, chset_str, chs_pool)

    pad_res = ChangesetProcessor.apply(pad, chset)

    assert pad_res.atext.text == "This is a tiny initial static text-piece.\n\n"

    assert pad_res.atext.attribs == "+8*1+7*0*1+7*1+7|2+e"
  end


  defp prepare_data(pad_atext, pad_pool, chs_string, chs_pool) do

    pad = %Pad{atext: Atext.build(pad_atext), pool: struct(Pool, pad_pool)}

    { changeset, new_pool } = Changeset.build(chs_string, chs_pool, pad.pool)

    { %{pad | pool: new_pool}, changeset }
  end
end
