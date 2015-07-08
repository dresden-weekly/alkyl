defmodule Alkyl.PoolTest do
  use ExUnit.Case
  alias Alkyl.PadData.Pool

  test "Unifying the attribute identifiers of a changeset's pool..." do

    pool = %Pool{numToAttrib: %{"0" => ["bold","true"],
                                "1" => ["author","erich"],
                                "2" => ["heading","h1"],
                                "3" => ["author","emil"],
                                "4" => ["heading","h4"],
                                "5" => ["heading","h2"],
                                "6" => ["heading","code"]},
                       nextNum: 7}

    ch_pool = %Pool{numToAttrib: %{"0" => ["author","emil"],
                                   "1" => ["heading","h2"],
                                   "2" => ["bold",""],
                                   "3" => ["heading",""],
                                   "4" => ["author","erna"]},
                    nextNum: 5}

    res = Pool.unify(pool, ch_pool)

    assert res == {
        {
            %Pool{numToAttrib: %{"0" => ["bold", "true"],
                                 "1" => ["author", "erich"],
                                 "2" => ["heading", "h1"],
                                 "3" => ["author", "emil"],
                                 "4" => ["heading", "h4"],
                                 "5" => ["heading", "h2"],
                                 "6" => ["heading", "code"],
                                 "7" => ["author", "erna"]},
                  nextNum: 8},

            %Pool{numToAttrib: %{"3" => ["author", "emil"],
                                 "5" => ["heading", "h2"],
                                 "7" => ["author", "erna"],
                                 "8" => ["bold", ""],
                                 "9" => ["heading", ""]},
                  nextNum: 10}
        },

        {
            %{"0" => "3", "1" => "5", "4" => "7", "2" => "8", "3" => "9"},
            ["8", "9"]
        }
    }

  end

end
