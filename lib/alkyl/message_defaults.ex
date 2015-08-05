defmodule Alkyl.MessageDefaults do

  alias Alkyl.PadData.Pad
  alias Alkyl.PadData.Atext
  alias Alkyl.PadData.Pool
  def initial_pad do
    %Pad{atext: %Atext{attribs: "|2+13",
                       text: "This is an initial static text-piece.\n\n"},
         pool: %Pool{nextNum: 0, numToAttrib: %{}}
        }
  end

  def author do
    %{colorId: :crypto.rand_uniform(0,34), name: nil, timestamp: 0}
  end

  def client_vars do
    %{
            "abiwordAvailable" => "no",
            "accountPrivs" => %{"maxRevisions" => 100},
            "chatHead" => -1,
            "clientIp" => "127.0.0.1",
            "colorPalette" => ["#ffc7c7", "#fff1c7", "#e3ffc7", "#c7ffd5", "#c7ffff", "#c7d5ff", "#e3c7ff", "#ffc7f1", "#ff8f8f", "#ffe38f", "#c7ff8f", "#8fffab", "#8fffff", "#8fabff", "#c78fff", "#ff8fe3", "#d97979", "#d9c179", "#a9d979", "#79d991", "#79d9d9", "#7991d9", "#a979d9", "#d979c1", "#d9a9a9", "#d9cda9", "#c1d9a9", "#a9d9b5", "#a9d9d9", "#a9b5d9", "#c1a9d9", "#d9a9cd", "#4c9c82", "#12d1ad", "#2d8e80", "#7485c3", "#a091c7", "#3185ab", "#6818b4", "#e6e76d", "#a42c64", "#f386e5"],
            "initialChangesets" => [],
            "initialOptions" => %{"guestPolicy" => "deny"},
            "initialRevisionList" => [],
            "initialTitle" => "Pad: icke",
            "numConnectedUsers" => 0,
            "opts" => %{},
            "padId" => "icke",
            "readOnlyId" => "r.c8f45fed8f9805e43b8a528caa524823",
            "readonly" => false,
            "savedRevisions" => [],
            "serverTimestamp" => 0,
            "userColor" => 12,
            "userId" => "a.1SiSgAsAkLdfjIn2",
            "userName" => "",
            "userIsGuest" => true,
            "collab_client_vars" => %{"apool" => %{"nextNum" => 0, "numToAttrib" => %{}},
                                      "clientIp" => "127.0.0.1",
                                      "historicalAuthorData" => %{},
                                      "initialAttributedText" => %{ "attribs" => "|2+13",
                                                                    "text" => "This is an initial static text-piece.\n\n"},
                                      "padId" => "icke",
                                      "rev" => 0,
                                      "time" => 1434008984626},
            "padOptions" => %{
                                    "alwaysShowChat" => false,
                                    "chatAndUsers" => false,
                                    "lang" => "en-gb",
                                    "noColors" => false,
                                    "rtl" => false,
                                    "showChat" => true,
                                    "showControls" => true,
                                    "showLineNumbers" => true,
                                    "useMonospaceFont" => false,
                                    "userColor" => false,
                                    "userName" => false},
            "plugins" => %{
                                 "parts" => [
                               %{
                                       "full_name" => "ep_etherpad-lite/swagger",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/swagger:expressCreateServer"
                                                      },
                                       "name" => "swagger",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/adminsettings",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/adminsettings:expressCreateServer",
                                                          "socketio" => "ep_etherpad-lite/node/hooks/express/adminsettings:socketio"
                                                      },
                                       "name" => "adminsettings",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/adminplugins",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/adminplugins:expressCreateServer",
                                                          "socketio" => "ep_etherpad-lite/node/hooks/express/adminplugins:socketio"
                                                      },
                                       "name" => "adminplugins",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/admin",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/admin:expressCreateServer"},
                                       "name" => "admin",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/tests",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/tests:expressCreateServer"
                                                      },
                                       "name" => "tests",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/socketio",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/socketio:expressCreateServer"
                                                      },
                                       "name" => "socketio",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/errorhandling",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/errorhandling:expressCreateServer"
                                                      },
                                       "name" => "errorhandling",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/importexport",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/importexport:expressCreateServer"
                                                      },
                                       "name" => "importexport",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/apicalls",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/apicalls:expressCreateServer"
                                                      },
                                       "name" => "apicalls",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/webaccess",
                                       "hooks" => %{
                                                          "expressConfigure" => "ep_etherpad-lite/node/hooks/express/webaccess:expressConfigure"
                                                      },
                                       "name" => "webaccess",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/padreadonly",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/padreadonly:expressCreateServer"
                                                      },
                                       "name" => "padreadonly",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/padurlsanitize",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/padurlsanitize:expressCreateServer"
                                                      },
                                       "name" => "padurlsanitize",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/specialpages",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/specialpages:expressCreateServer"
                                                      },
                                       "name" => "specialpages",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/i18n",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/i18n:expressCreateServer"},
                                       "name" => "i18n",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/static",
                                       "hooks" => %{
                                                          "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/static:expressCreateServer"
                                                      },
                                       "name" => "static",
                                       "plugin" => "ep_etherpad-lite"
                                   },
                               %{
                                       "full_name" => "ep_etherpad-lite/express",
                                       "hooks" => %{
                                                          "createServer" => "ep_etherpad-lite/node/hooks/express:createServer",
                                                          "restartServer" => "ep_etherpad-lite/node/hooks/express:restartServer"
                                                      },
                                       "name" => "express",
                                       "plugin" => "ep_etherpad-lite"}
                             ],
                                 "plugins" => %{
                                                      "ep_etherpad-lite" => %{
                                                                                    "package" => %{
                                                                                                         "author" => "Etherpad Foundation",
                                                                                                         "bin" => %{
                                                                                                                          "etherpad-lite" => "./node/server.js"
                                                                                                                      },
                                                                                                         "contributors" => [
                                                                                                           %{"name" => "John McLear"},
                                                                                                           %{"name" => "Hans Pinckaers"},
                                                                                                           %{"name" => "Robin Buse"},
                                                                                                           %{"name" => "Marcel Klehr"},
                                                                                                           %{"name" => "Peter Martischka"}
                                                                                                         ],
                                                                                                         "depth" => 1,
                                                                                                         "description" => "A Etherpad based on node.js",
                                                                                                         "devDependencies" => %{
                                                                                                                                      "wd" => "0.3.11"
                                                                                                                                  },
                                                                                                         "engines" => %{
                                                                                                                              "node" => ">=0.10.0",
                                                                                                                              "npm" => ">=1.0"
                                                                                                                          },
                                                                                                         "homepage" => "http://etherpad.org",
                                                                                                         "keywords" => [
                                                                                                           "etherpad", "realtime", "collaborative", "editor"
                                                                                                         ],
                                                                                                         "link" => "/home/thelonius/git/etherpad-lite-neu/src",
                                                                                                         "name" => "ep_etherpad-lite",
                                                                                                         "path" => "/home/thelonius/git/etherpad-lite-neu/node_modules/ep_etherpad-lite",
                                                                                                         "realName" => "ep_etherpad-lite",
                                                                                                         "realPath" => "/home/thelonius/git/etherpad-lite-neu/src",
                                                                                                         "repository" => %{
                                                                                                                                 "type" => "git",
                                                                                                                                 "url" => "http://github.com/ether/etherpad-lite.git"},
                                                                                                         "version" => "1.5.6"
                                                                                                     },
                                                                                    "parts" => [
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/express",
                                                                                              "hooks" => %{
                                                                                                                 "createServer" => "ep_etherpad-lite/node/hooks/express:createServer",
                                                                                                                 "restartServer" => "ep_etherpad-lite/node/hooks/express:restartServer"
                                                                                                             },
                                                                                              "name" => "express",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          }, %{
                                                                                           "full_name" => "ep_etherpad-lite/static",
                                                                                           "hooks" => %{
                                                                                                              "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/static:expressCreateServer"
                                                                                                          },
                                                                                           "name" => "static",
                                                                                           "plugin" => "ep_etherpad-lite"
                                                                                       },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/i18n",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/i18n:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "i18n",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/specialpages",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/specialpages:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "specialpages",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/padurlsanitize",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/padurlsanitize:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "padurlsanitize",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/padreadonly",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/padreadonly:expressCreateServer"},
                                                                                              "name" => "padreadonly",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/webaccess",
                                                                                              "hooks" => %{
                                                                                                                 "expressConfigure" => "ep_etherpad-lite/node/hooks/express/webaccess:expressConfigure"
                                                                                                             },
                                                                                              "name" => "webaccess",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/apicalls",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/apicalls:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "apicalls",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/importexport",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/importexport:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "importexport",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/errorhandling",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/errorhandling:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "errorhandling",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/socketio",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/socketio:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "socketio",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/tests",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/tests:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "tests",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/admin",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/admin:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "admin",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/adminplugins",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/adminplugins:expressCreateServer",
                                                                                                                 "socketio" => "ep_etherpad-lite/node/hooks/express/adminplugins:socketio"
                                                                                                             },
                                                                                              "name" => "adminplugins",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/adminsettings",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/adminsettings:expressCreateServer",
                                                                                                                 "socketio" => "ep_etherpad-lite/node/hooks/express/adminsettings:socketio"
                                                                                                             },
                                                                                              "name" => "adminsettings",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          },
                                                                                      %{
                                                                                              "full_name" => "ep_etherpad-lite/swagger",
                                                                                              "hooks" => %{
                                                                                                                 "expressCreateServer" => "ep_etherpad-lite/node/hooks/express/swagger:expressCreateServer"
                                                                                                             },
                                                                                              "name" => "swagger",
                                                                                              "plugin" => "ep_etherpad-lite"
                                                                                          }
                                                                                    ]
                                                                                }
                                                  }
                             }
        }

  end
end
