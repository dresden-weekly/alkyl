require.define({
  "ep_etherpad-lite/static/js/pad.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc., 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* global $, window */

var socket;

// These jQuery things should create local references, but for now `require()`
// assigns to the global `$` and augments it with plugins.
require('./jquery');
require('./farbtastic');
require('./excanvas');
JSON = require('./json2');

var chat = require('./chat').chat;
var getCollabClient = require('./collab_client').getCollabClient;
var padconnectionstatus = require('./pad_connectionstatus').padconnectionstatus;
var padcookie = require('./pad_cookie').padcookie;
var padeditbar = require('./pad_editbar').padeditbar;
var padeditor = require('./pad_editor').padeditor;
var padimpexp = require('./pad_impexp').padimpexp;
var padmodals = require('./pad_modals').padmodals;
var padsavedrevs = require('./pad_savedrevs');
var paduserlist = require('./pad_userlist').paduserlist;
var padutils = require('./pad_utils').padutils;
var colorutils = require('./colorutils').colorutils;
var createCookie = require('./pad_utils').createCookie;
var readCookie = require('./pad_utils').readCookie;
var randomString = require('./pad_utils').randomString;
var gritter = require('./gritter').gritter;

var hooks = require('./pluginfw/hooks');

var receivedClientVars = false;

function createCookie(name, value, days, path){ /* Warning Internet Explorer doesn't use this it uses the one from pad_utils.js */
  if (days)
  {
    var date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    var expires = "; expires=" + date.toGMTString();
  }
  else{
    var expires = "";
  }
  
  if(!path){ // If the path isn't set then just whack the cookie on the root path
    path = "/";
  }
  
  //Check if the browser is IE and if so make sure the full path is set in the cookie
  if((navigator.appName == 'Microsoft Internet Explorer') || ((navigator.appName == 'Netscape') && (new RegExp("Trident/.*rv:([0-9]{1,}[\.0-9]{0,})").exec(navigator.userAgent) != null))){
    document.cookie = name + "=" + value + expires + "; path="+document.location;
  }
  else{
    document.cookie = name + "=" + value + expires + "; path=" + path;
  }
}

function readCookie(name)
{
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++)
  {
    var c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function randomString()
{
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var string_length = 20;
  var randomstring = '';
  for (var i = 0; i < string_length; i++)
  {
    var rnum = Math.floor(Math.random() * chars.length);
    randomstring += chars.substring(rnum, rnum + 1);
  }
  return "t." + randomstring;
}

// This array represents all GET-parameters which can be used to change a setting.
//   name:     the parameter-name, eg  `?noColors=true`  =>  `noColors`
//   checkVal: the callback is only executed when
//                * the parameter was supplied and matches checkVal
//                * the parameter was supplied and checkVal is null
//   callback: the function to call when all above succeeds, `val` is the value supplied by the user
var getParameters = [
  { name: "noColors",         checkVal: "true",  callback: function(val) { settings.noColors = true; $('#clearAuthorship').hide(); } },
  { name: "showControls",     checkVal: "false", callback: function(val) { $('#editbar').addClass('hideControlsEditbar'); $('#editorcontainer').addClass('hideControlsEditor'); } },
  { name: "showChat",         checkVal: "false", callback: function(val) { $('#chaticon').hide(); } },
  { name: "showLineNumbers",  checkVal: "false", callback: function(val) { settings.LineNumbersDisabled = true; } },
  { name: "useMonospaceFont", checkVal: "true",  callback: function(val) { settings.useMonospaceFontGlobal = true; } },
  // If the username is set as a parameter we should set a global value that we can call once we have initiated the pad.
  { name: "userName",         checkVal: null,    callback: function(val) { settings.globalUserName = decodeURIComponent(val); clientVars.userName = decodeURIComponent(val); } },
  // If the userColor is set as a parameter, set a global value to use once we have initiated the pad.
  { name: "userColor",        checkVal: null,    callback: function(val) { settings.globalUserColor = decodeURIComponent(val); clientVars.userColor = decodeURIComponent(val); } },
  { name: "rtl",              checkVal: "true",  callback: function(val) { settings.rtlIsTrue = true } },
  { name: "alwaysShowChat",   checkVal: "true",  callback: function(val) { chat.stickToScreen(); } },
  { name: "chatAndUsers",     checkVal: "true",  callback: function(val) { chat.chatAndUsers(); } },
  { name: "lang",             checkVal: null,    callback: function(val) { window.html10n.localize([val, 'en']); } }
];

function getParams()
{
  // Tries server enforced options first..
  for(var i = 0; i < getParameters.length; i++)
  {
   var setting = getParameters[i];
    var value = clientVars.padOptions[setting.name];
    if(value.toString() === setting.checkVal)
    {
      setting.callback(value);
    }
  }
  
  // Then URL applied stuff
  var params = getUrlVars()
  
  for(var i = 0; i < getParameters.length; i++)
  {
    var setting = getParameters[i];
    var value = params[setting.name];
    
    if(value && (value == setting.checkVal || setting.checkVal == null))
    {
      setting.callback(value);
    }
  }
}

function getUrlVars()
{
  var vars = [], hash;
  var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
  for(var i = 0; i < hashes.length; i++)
  {
    hash = hashes[i].split('=');
    vars.push(hash[0]);
    vars[hash[0]] = hash[1];
  }
  return vars;
}

function savePassword()
{
  //set the password cookie
  createCookie("password",$("#passwordinput").val(),null,document.location.pathname);
  //reload
  document.location=document.location;
  return false;
}

function sendClientReady(isReconnect, messageType)
{
  messageType = typeof messageType !== 'undefined' ? messageType : 'CLIENT_READY';
  var padId = document.location.pathname.substring(document.location.pathname.lastIndexOf("/") + 1);
  padId = decodeURIComponent(padId); // unescape neccesary due to Safari and Opera interpretation of spaces

  if(!isReconnect)
  {
    var titleArray = document.title.split('|');
    var title = titleArray[titleArray.length - 1];
    document.title = padId.replace(/_+/g, ' ') + " | " + title;
  }

  var token = readCookie("token");
  if (token == null)
  {
    token = "t." + randomString();
    createCookie("token", token, 60);
  }
  
  var sessionID = decodeURIComponent(readCookie("sessionID"));
  var password = readCookie("password");

  var msg = {
    "component": "pad",
    "type": messageType,
    "padId": padId,
    "sessionID": sessionID,
    "password": password,
    "token": token,
    "protocolVersion": 2
  };
  
  //this is a reconnect, lets tell the server our revisionnumber
  if(isReconnect == true)
  {
    msg.client_rev=pad.collabClient.getCurrentRevisionNumber();
    msg.reconnect=true;
  }
  
  socket.json.send(msg);
}

function handshake()
{
  var loc = document.location;
  //get the correct port
  var port = loc.port == "" ? (loc.protocol == "https:" ? 443 : 80) : loc.port;
  //create the url
  var url = loc.protocol + "//" + loc.hostname + ":" + port + "/";
  //find out in which subfolder we are
  var resource =  exports.baseURL.substring(1)  + "socket.io";
  //connect
  socket = pad.socket = io.connect(url, {
    // Allow deployers to host Etherpad on a non-root path
    'path': exports.baseURL + "socket.io",
    'resource': resource,
    'max reconnection attempts': 3,
    'sync disconnect on unload' : false
  });

  var disconnectTimeout;

  socket.once('connect', function () {
    sendClientReady(false);
  });
  
  socket.on('reconnect', function () {
    //reconnect is before the timeout, lets stop the timeout
    if(disconnectTimeout)
    {
      clearTimeout(disconnectTimeout);
    }

    pad.collabClient.setChannelState("CONNECTED");
    pad.sendClientReady(true);
  });
  
  socket.on('disconnect', function (reason) {
    if(reason == "booted"){
      pad.collabClient.setChannelState("DISCONNECTED");
    } else {
      function disconnectEvent()
      {
        pad.collabClient.setChannelState("DISCONNECTED", "reconnect_timeout");
      }
      
      pad.collabClient.setChannelState("RECONNECTING");
      
      disconnectTimeout = setTimeout(disconnectEvent, 20000);
    }
  });

  var initalized = false;

  socket.on('message', function(obj)
  {
    //the access was not granted, give the user a message
    if(obj.accessStatus)
    {
      if(!receivedClientVars){
        $('.passForm').submit(require(module.id).savePassword);
      }

      if(obj.accessStatus == "deny")
      {
        $('#loading').hide();
        $("#permissionDenied").show();

        if(receivedClientVars)
        {
          // got kicked
          $("#editorcontainer").hide();
          $("#editorloadingbox").show();
        }
      }
      else if(obj.accessStatus == "needPassword")
      {
        $('#loading').hide();
        $('#passwordRequired').show();
        $("#passwordinput").focus();
      }
      else if(obj.accessStatus == "wrongPassword")
      {
        $('#loading').hide();
        $('#wrongPassword').show();
        $('#passwordRequired').show();
        $("#passwordinput").focus();
      }
    }
    
    //if we haven't recieved the clientVars yet, then this message should it be
    else if (!receivedClientVars && obj.type == "CLIENT_VARS")
    {
      //log the message
      if (window.console) console.log(obj);

      receivedClientVars = true;

      //set some client vars
      clientVars = obj.data;
      clientVars.userAgent = "Anonymous";
      clientVars.collab_client_vars.clientAgent = "Anonymous";
 
      //initalize the pad
      pad._afterHandshake();
      initalized = true;

      if(clientVars.readonly){
        chat.hide();
        $('#myusernameedit').attr("disabled", true);
        $('#chatinput').attr("disabled", true);
        $('#chaticon').hide();
        $('#options-chatandusers').parent().hide();
        $('#options-stickychat').parent().hide();
      }

      $("body").addClass(clientVars.readonly ? "readonly" : "readwrite")

      padeditor.ace.callWithAce(function (ace) {
        ace.ace_setEditable(!clientVars.readonly);
      });

      // If the LineNumbersDisabled value is set to true then we need to hide the Line Numbers
      if (settings.LineNumbersDisabled == true)
      {
        pad.changeViewOption('showLineNumbers', false);
      }

      // If the noColors value is set to true then we need to hide the background colors on the ace spans
      if (settings.noColors == true)
      {
        pad.changeViewOption('noColors', true);
      }
      
      if (settings.rtlIsTrue == true)
      {
        pad.changeViewOption('rtlIsTrue', true);
      }

      // If the Monospacefont value is set to true then change it to monospace.
      if (settings.useMonospaceFontGlobal == true)
      {
        pad.changeViewOption('useMonospaceFont', true);
      }
      // if the globalUserName value is set we need to tell the server and the client about the new authorname
      if (settings.globalUserName !== false)
      {
        pad.notifyChangeName(settings.globalUserName); // Notifies the server
        pad.myUserInfo.name = settings.globalUserName;
        $('#myusernameedit').val(settings.globalUserName); // Updates the current users UI
      }
      if (settings.globalUserColor !== false && colorutils.isCssHex(settings.globalUserColor))
      {

        // Add a 'globalUserColor' property to myUserInfo, so collabClient knows we have a query parameter.
        pad.myUserInfo.globalUserColor = settings.globalUserColor;
        pad.notifyChangeColor(settings.globalUserColor); // Updates pad.myUserInfo.colorId
        paduserlist.setMyUserInfo(pad.myUserInfo);
      }
    }
    //This handles every Message after the clientVars
    else
    {
      //this message advices the client to disconnect
      if (obj.disconnect)
      {
        console.warn("FORCED TO DISCONNECT");
        console.warn(obj);
        padconnectionstatus.disconnected(obj.disconnect);
        socket.disconnect();
        return;
      }
      else
      {
        pad.collabClient.handleMessageFromServer(obj);
      }
    }
  });
  // Bind the colorpicker
  var fb = $('#colorpicker').farbtastic({ callback: '#mycolorpickerpreview', width: 220});
  // Bind the read only button  
  $('#readonlyinput').on('click',function(){
    padeditbar.setEmbedLinks();
  });
}

$.extend($.gritter.options, { 
  position: 'bottom-right', // defaults to 'top-right' but can be 'bottom-left', 'bottom-right', 'top-left', 'top-right' (added in 1.7.1)
  fade: false, // dont fade, too jerky on mobile
  time: 6000 // hang on the screen for...
});

var pad = {
  // don't access these directly from outside this file, except
  // for debugging
  collabClient: null,
  myUserInfo: null,
  diagnosticInfo: {},
  initTime: 0,
  clientTimeOffset: null,
  padOptions: {},

  // these don't require init; clientVars should all go through here
  getPadId: function()
  {
    return clientVars.padId;
  },
  getClientIp: function()
  {
    return clientVars.clientIp;
  },
  getColorPalette: function()
  {
    return clientVars.colorPalette;
  },
  getDisplayUserAgent: function()
  {
    return padutils.uaDisplay(clientVars.userAgent);
  },
  getIsDebugEnabled: function()
  {
    return clientVars.debugEnabled;
  },
  getPrivilege: function(name)
  {
    return clientVars.accountPrivs[name];
  },
  getUserIsGuest: function()
  {
    return clientVars.userIsGuest;
  },
  getUserId: function()
  {
    return pad.myUserInfo.userId;
  },
  getUserName: function()
  {
    return pad.myUserInfo.name;
  },
  userList: function()
  {
    return paduserlist.users();
  },
  sendClientReady: function(isReconnect, messageType)
  {
    messageType = typeof messageType !== 'undefined' ? messageType : 'CLIENT_READY';
    sendClientReady(isReconnect, messageType);
  },
  switchToPad: function(padId)
  {
    var newHref = new RegExp(/.*\/p\/[^\/]+/).exec(document.location.pathname) || clientVars.padId;
    newHref = newHref[0];    
    if (options != null){
      newHref = newHref + '?' + options;
    }

    if(window.history && window.history.pushState)
    {
      $('#chattext p').remove(); //clear the chat messages
      window.history.pushState("", "", newHref);      
      receivedClientVars = false;
      sendClientReady(false, 'SWITCH_TO_PAD');
    }
    else // fallback
    {
      window.location.href = newHref;
    }
  },
  sendClientMessage: function(msg)
  {
    pad.collabClient.sendClientMessage(msg);
  },
  createCookie: createCookie,

  init: function()
  {
    padutils.setupGlobalExceptionHandler();

    $(document).ready(function()
    {
      // start the custom js
      if (typeof customStart == "function") customStart();
      handshake();

      // To use etherpad you have to allow cookies.
      // This will check if the creation of a test-cookie has success.
      // Otherwise it shows up a message to the user.
      createCookie("test", "test");
      if (!readCookie("test"))
      {
        $('#loading').hide();
        $('#noCookie').show();
      }
    });
  },
  _afterHandshake: function()
  {
    pad.clientTimeOffset = new Date().getTime() - clientVars.serverTimestamp;
  
    //initialize the chat
    chat.init(this);
    getParams();

    padcookie.init(); // initialize the cookies
    pad.initTime = +(new Date());
    pad.padOptions = clientVars.initialOptions;

    if ((!browser.msie) && (!(browser.firefox && browser.version.indexOf("1.8.") == 0)))
    {
      document.domain = document.domain; // for comet
    }

    // for IE
    if (browser.msie)
    {
      try
      {
        document.execCommand("BackgroundImageCache", false, true);
      }
      catch (e)
      {}
    }

    // order of inits is important here:
    pad.myUserInfo = {
      userId: clientVars.userId,
      name: clientVars.userName,
      ip: pad.getClientIp(),
      colorId: clientVars.userColor,
      userAgent: pad.getDisplayUserAgent()
    };

    padimpexp.init(this);
    padsavedrevs.init(this);

    padeditor.init(postAceInit, pad.padOptions.view || {}, this);

    paduserlist.init(pad.myUserInfo, this);
    padconnectionstatus.init();
    padmodals.init(this);

    pad.collabClient = getCollabClient(padeditor.ace, clientVars.collab_client_vars, pad.myUserInfo, {
      colorPalette: pad.getColorPalette()
    }, pad);
    pad.collabClient.setOnUserJoin(pad.handleUserJoin);
    pad.collabClient.setOnUpdateUserInfo(pad.handleUserUpdate);
    pad.collabClient.setOnUserLeave(pad.handleUserLeave);
    pad.collabClient.setOnClientMessage(pad.handleClientMessage);
    pad.collabClient.setOnServerMessage(pad.handleServerMessage);
    pad.collabClient.setOnChannelStateChange(pad.handleChannelStateChange);
    pad.collabClient.setOnInternalAction(pad.handleCollabAction);

    // load initial chat-messages
    if(clientVars.chatHead != -1)
    {
      var chatHead = clientVars.chatHead;
      var start = Math.max(chatHead - 100, 0);
      pad.collabClient.sendMessage({"type": "GET_CHAT_MESSAGES", "start": start, "end": chatHead});
    }
    else // there are no messages
    {
      $("#chatloadmessagesbutton").css("display", "none");
    }

    function postAceInit()
    {
      padeditbar.init();
      setTimeout(function()
      {
        padeditor.ace.focus();
      }, 0);
      if(padcookie.getPref("chatAlwaysVisible")){ // if we have a cookie for always showing chat then show it
        chat.stickToScreen(true); // stick it to the screen
        $('#options-stickychat').prop("checked", true); // set the checkbox to on
      }
      if(padcookie.getPref("chatAndUsers")){ // if we have a cookie for always showing chat then show it
        chat.chatAndUsers(true); // stick it to the screen
        $('#options-chatandusers').prop("checked", true); // set the checkbox to on
      }
      if(padcookie.getPref("showAuthorshipColors") == false){
        pad.changeViewOption('showAuthorColors', false);
      }
      if(padcookie.getPref("showLineNumbers") == false){
        pad.changeViewOption('showLineNumbers', false);
      }
      if(padcookie.getPref("rtlIsTrue") == true){
        pad.changeViewOption('rtlIsTrue', true);
      }

      var fonts = ['useMonospaceFont', 'useOpenDyslexicFont', 'useComicSansFont', 'useCourierNewFont', 'useGeorgiaFont', 'useImpactFont',
        'useLucidaFont', 'useLucidaSansFont', 'usePalatinoFont', 'useTahomaFont', 'useTimesNewRomanFont',
        'useTrebuchetFont', 'useVerdanaFont', 'useSymbolFont', 'useWebdingsFont', 'useWingDingsFont', 'useSansSerifFont',
        'useSerifFont'];

      $.each(fonts, function(i, font){
        if(padcookie.getPref(font) == true){
          pad.changeViewOption(font, true);
        }
      })

      hooks.aCallAll("postAceInit", {ace: padeditor.ace, pad: pad});
    }
  },
  dispose: function()
  {
    padeditor.dispose();
  },
  notifyChangeName: function(newName)
  {
    pad.myUserInfo.name = newName;
    pad.collabClient.updateUserInfo(pad.myUserInfo);
  },
  notifyChangeColor: function(newColorId)
  {
    pad.myUserInfo.colorId = newColorId;
    pad.collabClient.updateUserInfo(pad.myUserInfo);
  },
  changePadOption: function(key, value)
  {
    var options = {};
    options[key] = value;
    pad.handleOptionsChange(options);
    pad.collabClient.sendClientMessage(
    {
      type: 'padoptions',
      options: options,
      changedBy: pad.myUserInfo.name || "unnamed"
    });
  },
  changeViewOption: function(key, value)
  {
    var options = {
      view: {}
    };
    options.view[key] = value;
    pad.handleOptionsChange(options);
  },
  handleOptionsChange: function(opts)
  {
    // opts object is a full set of options or just
    // some options to change
    if (opts.view)
    {
      if (!pad.padOptions.view)
      {
        pad.padOptions.view = {};
      }
      for (var k in opts.view)
      {
        pad.padOptions.view[k] = opts.view[k];
        padcookie.setPref(k, opts.view[k]);
      }
      padeditor.setViewOptions(pad.padOptions.view);
    }
    if (opts.guestPolicy)
    {
      // order important here
      pad.padOptions.guestPolicy = opts.guestPolicy;
    }
  },
  getPadOptions: function()
  {
    // caller shouldn't mutate the object
    return pad.padOptions;
  },
  isPadPublic: function()
  {
    return pad.getPadOptions().guestPolicy == 'allow';
  },
  suggestUserName: function(userId, name)
  {
    pad.collabClient.sendClientMessage(
    {
      type: 'suggestUserName',
      unnamedId: userId,
      newName: name
    });
  },
  handleUserJoin: function(userInfo)
  {
    paduserlist.userJoinOrUpdate(userInfo);
  },
  handleUserUpdate: function(userInfo)
  {
    paduserlist.userJoinOrUpdate(userInfo);
  },
  handleUserLeave: function(userInfo)
  {
    paduserlist.userLeave(userInfo);
  },
  handleClientMessage: function(msg)
  {
    if (msg.type == 'suggestUserName')
    {
      if (msg.unnamedId == pad.myUserInfo.userId && msg.newName && !pad.myUserInfo.name)
      {
        pad.notifyChangeName(msg.newName);
        paduserlist.setMyUserInfo(pad.myUserInfo);
      }
    }
    else if (msg.type == 'newRevisionList')
    {
      padsavedrevs.newRevisionList(msg.revisionList);
    }
    else if (msg.type == 'revisionLabel')
    {
      padsavedrevs.newRevisionList(msg.revisionList);
    }
    else if (msg.type == 'padoptions')
    {
      var opts = msg.options;
      pad.handleOptionsChange(opts);
    }
    else if (msg.type == 'guestanswer')
    {
      // someone answered a prompt, remove it
      paduserlist.removeGuestPrompt(msg.guestId);
    }
  },
  dmesg: function(m)
  {
    if (pad.getIsDebugEnabled())
    {
      var djs = $('#djs').get(0);
      var wasAtBottom = (djs.scrollTop - (djs.scrollHeight - $(djs).height()) >= -20);
      $('#djs').append('<p>' + m + '</p>');
      if (wasAtBottom)
      {
        djs.scrollTop = djs.scrollHeight;
      }
    }
  },
  handleServerMessage: function(m)
  {
    if (m.type == 'NOTICE')
    {
      if (m.text)
      {
        alertBar.displayMessage(function(abar)
        {
          abar.find("#servermsgdate").text(" (" + padutils.simpleDateTime(new Date) + ")");
          abar.find("#servermsgtext").text(m.text);
        });
      }
      if (m.js)
      {
        window['ev' + 'al'](m.js);
      }
    }
    else if (m.type == 'GUEST_PROMPT')
    {
      paduserlist.showGuestPrompt(m.userId, m.displayName);
    }
  },
  handleChannelStateChange: function(newState, message)
  {
    var oldFullyConnected = !! padconnectionstatus.isFullyConnected();
    var wasConnecting = (padconnectionstatus.getStatus().what == 'connecting');
    if (newState == "CONNECTED")
    {
      padconnectionstatus.connected();
    }
    else if (newState == "RECONNECTING")
    {
      padconnectionstatus.reconnecting();
    }
    else if (newState == "DISCONNECTED")
    {
      pad.diagnosticInfo.disconnectedMessage = message;
      pad.diagnosticInfo.padId = pad.getPadId();
      pad.diagnosticInfo.socket = {};
      
      //we filter non objects from the socket object and put them in the diagnosticInfo 
      //this ensures we have no cyclic data - this allows us to stringify the data
      for(var i in socket.socket)
      {
        var value = socket.socket[i];
        var type = typeof value;
        
        if(type == "string" || type == "number")
        {
          pad.diagnosticInfo.socket[i] = value;
        }
      }
    
      pad.asyncSendDiagnosticInfo();
      if (typeof window.ajlog == "string")
      {
        window.ajlog += ("Disconnected: " + message + '\n');
      }
      padeditor.disable();
      padeditbar.disable();
      padimpexp.disable();

      padconnectionstatus.disconnected(message);
    }
    var newFullyConnected = !! padconnectionstatus.isFullyConnected();
    if (newFullyConnected != oldFullyConnected)
    {
      pad.handleIsFullyConnected(newFullyConnected, wasConnecting);
    }
  },
  handleIsFullyConnected: function(isConnected, isInitialConnect)
  {
    pad.determineChatVisibility(isConnected && !isInitialConnect);
    pad.determineChatAndUsersVisibility(isConnected && !isInitialConnect);
    pad.determineAuthorshipColorsVisibility();
    setTimeout(function(){
      padeditbar.toggleDropDown("none");
    }, 1000);
  },
  determineChatVisibility: function(asNowConnectedFeedback){
    var chatVisCookie = padcookie.getPref('chatAlwaysVisible');
    if(chatVisCookie){ // if the cookie is set for chat always visible
      chat.stickToScreen(true); // stick it to the screen
      $('#options-stickychat').prop("checked", true); // set the checkbox to on
    }
    else{
      $('#options-stickychat').prop("checked", false); // set the checkbox for off
    }
  },
  determineChatAndUsersVisibility: function(asNowConnectedFeedback){
    var chatAUVisCookie = padcookie.getPref('chatAndUsersVisible');
    if(chatAUVisCookie){ // if the cookie is set for chat always visible
      chat.chatAndUsers(true); // stick it to the screen
      $('#options-chatandusers').prop("checked", true); // set the checkbox to on
    }
    else{
      $('#options-chatandusers').prop("checked", false); // set the checkbox for off
    }
  },
  determineAuthorshipColorsVisibility: function(){
    var authColCookie = padcookie.getPref('showAuthorshipColors');
    if (authColCookie){
      pad.changeViewOption('showAuthorColors', true);
      $('#options-colorscheck').prop("checked", true);
    }
    else {
      $('#options-colorscheck').prop("checked", false);
    }
  },
  handleCollabAction: function(action)
  {
    if (action == "commitPerformed")
    {
      padeditbar.setSyncStatus("syncing");
    }
    else if (action == "newlyIdle")
    {
      padeditbar.setSyncStatus("done");
    }
  },
  hideServerMessage: function()
  {
    alertBar.hideMessage();
  },
  asyncSendDiagnosticInfo: function()
  {
    window.setTimeout(function()
    {
      $.ajax(
      {
        type: 'post',
        url: '/ep/pad/connection-diagnostic-info',
        data: {
          diagnosticInfo: JSON.stringify(pad.diagnosticInfo)
        },
        success: function()
        {},
        error: function()
        {}
      });
    }, 0);
  },
  forceReconnect: function()
  {
    $('form#reconnectform input.padId').val(pad.getPadId());
    pad.diagnosticInfo.collabDiagnosticInfo = pad.collabClient.getDiagnosticInfo();
    $('form#reconnectform input.diagnosticInfo').val(JSON.stringify(pad.diagnosticInfo));
    $('form#reconnectform input.missedChanges').val(JSON.stringify(pad.collabClient.getMissedChanges()));
    $('form#reconnectform').submit();
  },
  // this is called from code put into a frame from the server:
  handleImportExportFrameCall: function(callName, varargs)
  {
    padimpexp.handleFrameCall.call(padimpexp, callName, Array.prototype.slice.call(arguments, 1));
  },
  callWhenNotCommitting: function(f)
  {
    pad.collabClient.callWhenNotCommitting(f);
  },
  getCollabRevisionNumber: function()
  {
    return pad.collabClient.getCurrentRevisionNumber();
  },
  isFullyConnected: function()
  {
    return padconnectionstatus.isFullyConnected();
  },
  addHistoricalAuthors: function(data)
  {
    if (!pad.collabClient)
    {
      window.setTimeout(function()
      {
        pad.addHistoricalAuthors(data);
      }, 1000);
    }
    else
    {
      pad.collabClient.addHistoricalAuthors(data);
    }
  }
};

var alertBar = (function()
{

  var animator = padutils.makeShowHideAnimator(arriveAtAnimationState, false, 25, 400);

  function arriveAtAnimationState(state)
  {
    if (state == -1)
    {
      $("#alertbar").css('opacity', 0).css('display', 'block');
    }
    else if (state == 0)
    {
      $("#alertbar").css('opacity', 1);
    }
    else if (state == 1)
    {
      $("#alertbar").css('opacity', 0).css('display', 'none');
    }
    else if (state < 0)
    {
      $("#alertbar").css('opacity', state + 1);
    }
    else if (state > 0)
    {
      $("#alertbar").css('opacity', 1 - state);
    }
  }

  var self = {
    displayMessage: function(setupFunc)
    {
      animator.show();
      setupFunc($("#alertbar"));
    },
    hideMessage: function()
    {
      animator.hide();
    }
  };
  return self;
}());

function init() {
  return pad.init();
}

var settings = {
  LineNumbersDisabled: false
, noColors: false
, useMonospaceFontGlobal: false
, globalUserName: false
, globalUserColor: false
, rtlIsTrue: false
};

pad.settings = settings;
exports.baseURL = '';
exports.settings = settings;
exports.createCookie = createCookie;
exports.readCookie = readCookie;
exports.randomString = randomString;
exports.getParams = getParams;
exports.getUrlVars = getUrlVars;
exports.savePassword = savePassword;
exports.handshake = handshake;
exports.pad = pad;
exports.init = init;
exports.alertBar = alertBar;

}
, "ep_etherpad-lite/static/js/pad_utils.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var Security = require('./security');

/**
 * Generates a random String with the given length. Is needed to generate the Author, Group, readonly, session Ids
 */

function randomString(len)
{
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var randomstring = '';
  len = len || 20
  for (var i = 0; i < len; i++)
  {
    var rnum = Math.floor(Math.random() * chars.length);
    randomstring += chars.substring(rnum, rnum + 1);
  }
  return randomstring;
}

function createCookie(name, value, days, path){ /* Used by IE */
  if (days)
  {
    var date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    var expires = "; expires=" + date.toGMTString();
  }
  else{
    var expires = "";
  }

  if(!path){ // IF the Path of the cookie isn't set then just create it on root
    path = "/";
  }

  //Check if the browser is IE and if so make sure the full path is set in the cookie
  if((navigator.appName == 'Microsoft Internet Explorer') || ((navigator.appName == 'Netscape') && (new RegExp("Trident/.*rv:([0-9]{1,}[\.0-9]{0,})").exec(navigator.userAgent) != null))){
    document.cookie = name + "=" + value + expires + "; path=/"; /* Note this bodge fix for IE is temporary until auth is rewritten */
  }
  else{
    document.cookie = name + "=" + value + expires + "; path=" + path;
  }

}

function readCookie(name)
{
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++)
  {
    var c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

var padutils = {
  escapeHtml: function(x)
  {
    return Security.escapeHTML(String(x));
  },
  uniqueId: function()
  {
    var pad = require('./pad').pad; // Sidestep circular dependency
    function encodeNum(n, width)
    {
      // returns string that is exactly 'width' chars, padding with zeros
      // and taking rightmost digits
      return (Array(width + 1).join('0') + Number(n).toString(35)).slice(-width);
    }
    return [pad.getClientIp(), encodeNum(+new Date, 7), encodeNum(Math.floor(Math.random() * 1e9), 4)].join('.');
  },
  uaDisplay: function(ua)
  {
    var m;

    function clean(a)
    {
      var maxlen = 16;
      a = a.replace(/[^a-zA-Z0-9\.]/g, '');
      if (a.length > maxlen)
      {
        a = a.substr(0, maxlen);
      }
      return a;
    }

    function checkver(name)
    {
      var m = ua.match(RegExp(name + '\\/([\\d\\.]+)'));
      if (m && m.length > 1)
      {
        return clean(name + m[1]);
      }
      return null;
    }

    // firefox
    if (checkver('Firefox'))
    {
      return checkver('Firefox');
    }

    // misc browsers, including IE
    m = ua.match(/compatible; ([^;]+);/);
    if (m && m.length > 1)
    {
      return clean(m[1]);
    }

    // iphone
    if (ua.match(/\(iPhone;/))
    {
      return 'iPhone';
    }

    // chrome
    if (checkver('Chrome'))
    {
      return checkver('Chrome');
    }

    // safari
    m = ua.match(/Safari\/[\d\.]+/);
    if (m)
    {
      var v = '?';
      m = ua.match(/Version\/([\d\.]+)/);
      if (m && m.length > 1)
      {
        v = m[1];
      }
      return clean('Safari' + v);
    }

    // everything else
    var x = ua.split(' ')[0];
    return clean(x);
  },
  // e.g. "Thu Jun 18 2009 13:09"
  simpleDateTime: function(date)
  {
    var d = new Date(+date); // accept either number or date
    var dayOfWeek = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[d.getDay()];
    var month = (['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])[d.getMonth()];
    var dayOfMonth = d.getDate();
    var year = d.getFullYear();
    var hourmin = d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
    return dayOfWeek + ' ' + month + ' ' + dayOfMonth + ' ' + year + ' ' + hourmin;
  },
  findURLs: function(text)
  {
    // copied from ACE
    var _REGEX_WORDCHAR = /[\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u1FFF\u3040-\u9FFF\uF900-\uFDFF\uFE70-\uFEFE\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFDC]/;
    var _REGEX_URLCHAR = new RegExp('(' + /[-:@a-zA-Z0-9_.,~%+\/?=&#;()$]/.source + '|' + _REGEX_WORDCHAR.source + ')');
    var _REGEX_URL = new RegExp(/(?:(?:https?|s?ftp|ftps|file|nfs):\/\/|mailto:)/.source + _REGEX_URLCHAR.source + '*(?![:.,;])' + _REGEX_URLCHAR.source, 'g');

    // returns null if no URLs, or [[startIndex1, url1], [startIndex2, url2], ...]


    function _findURLs(text)
    {
      _REGEX_URL.lastIndex = 0;
      var urls = null;
      var execResult;
      while ((execResult = _REGEX_URL.exec(text)))
      {
        urls = (urls || []);
        var startIndex = execResult.index;
        var url = execResult[0];
        urls.push([startIndex, url]);
      }

      return urls;
    }

    return _findURLs(text);
  },
  escapeHtmlWithClickableLinks: function(text, target)
  {
    var idx = 0;
    var pieces = [];
    var urls = padutils.findURLs(text);

    function advanceTo(i)
    {
      if (i > idx)
      {
        pieces.push(Security.escapeHTML(text.substring(idx, i)));
        idx = i;
      }
    }
    if (urls)
    {
      for (var j = 0; j < urls.length; j++)
      {
        var startIndex = urls[j][0];
        var href = urls[j][1];
        advanceTo(startIndex);
        pieces.push('<a ', (target ? 'target="' + Security.escapeHTMLAttribute(target) + '" ' : ''), 'href="', Security.escapeHTMLAttribute(href), '">');
        advanceTo(startIndex + href.length);
        pieces.push('</a>');
      }
    }
    advanceTo(text.length);
    return pieces.join('');
  },
  bindEnterAndEscape: function(node, onEnter, onEscape)
  {

    // Use keypress instead of keyup in bindEnterAndEscape
    // Keyup event is fired on enter in IME (Input Method Editor), But
    // keypress is not. So, I changed to use keypress instead of keyup.
    // It is work on Windows (IE8, Chrome 6.0.472), CentOs (Firefox 3.0) and Mac OSX (Firefox 3.6.10, Chrome 6.0.472, Safari 5.0).
    if (onEnter)
    {
      node.keypress(function(evt)
      {
        if (evt.which == 13)
        {
          onEnter(evt);
        }
      });
    }

    if (onEscape)
    {
      node.keydown(function(evt)
      {
        if (evt.which == 27)
        {
          onEscape(evt);
        }
      });
    }
  },
  timediff: function(d)
  {
    var pad = require('./pad').pad; // Sidestep circular dependency
    function format(n, word)
    {
      n = Math.round(n);
      return ('' + n + ' ' + word + (n != 1 ? 's' : '') + ' ago');
    }
    d = Math.max(0, (+(new Date) - (+d) - pad.clientTimeOffset) / 1000);
    if (d < 60)
    {
      return format(d, 'second');
    }
    d /= 60;
    if (d < 60)
    {
      return format(d, 'minute');
    }
    d /= 60;
    if (d < 24)
    {
      return format(d, 'hour');
    }
    d /= 24;
    return format(d, 'day');
  },
  makeAnimationScheduler: function(funcToAnimateOneStep, stepTime, stepsAtOnce)
  {
    if (stepsAtOnce === undefined)
    {
      stepsAtOnce = 1;
    }

    var animationTimer = null;

    function scheduleAnimation()
    {
      if (!animationTimer)
      {
        animationTimer = window.setTimeout(function()
        {
          animationTimer = null;
          var n = stepsAtOnce;
          var moreToDo = true;
          while (moreToDo && n > 0)
          {
            moreToDo = funcToAnimateOneStep();
            n--;
          }
          if (moreToDo)
          {
            // more to do
            scheduleAnimation();
          }
        }, stepTime * stepsAtOnce);
      }
    }
    return {
      scheduleAnimation: scheduleAnimation
    };
  },
  makeShowHideAnimator: function(funcToArriveAtState, initiallyShown, fps, totalMs)
  {
    var animationState = (initiallyShown ? 0 : -2); // -2 hidden, -1 to 0 fade in, 0 to 1 fade out
    var animationFrameDelay = 1000 / fps;
    var animationStep = animationFrameDelay / totalMs;

    var scheduleAnimation = padutils.makeAnimationScheduler(animateOneStep, animationFrameDelay).scheduleAnimation;

    function doShow()
    {
      animationState = -1;
      funcToArriveAtState(animationState);
      scheduleAnimation();
    }

    function doQuickShow()
    { // start showing without losing any fade-in progress
      if (animationState < -1)
      {
        animationState = -1;
      }
      else if (animationState <= 0)
      {
        animationState = animationState;
      }
      else
      {
        animationState = Math.max(-1, Math.min(0, -animationState));
      }
      funcToArriveAtState(animationState);
      scheduleAnimation();
    }

    function doHide()
    {
      if (animationState >= -1 && animationState <= 0)
      {
        animationState = 1e-6;
        scheduleAnimation();
      }
    }

    function animateOneStep()
    {
      if (animationState < -1 || animationState == 0)
      {
        return false;
      }
      else if (animationState < 0)
      {
        // animate show
        animationState += animationStep;
        if (animationState >= 0)
        {
          animationState = 0;
          funcToArriveAtState(animationState);
          return false;
        }
        else
        {
          funcToArriveAtState(animationState);
          return true;
        }
      }
      else if (animationState > 0)
      {
        // animate hide
        animationState += animationStep;
        if (animationState >= 1)
        {
          animationState = 1;
          funcToArriveAtState(animationState);
          animationState = -2;
          return false;
        }
        else
        {
          funcToArriveAtState(animationState);
          return true;
        }
      }
    }

    return {
      show: doShow,
      hide: doHide,
      quickShow: doQuickShow
    };
  },
  _nextActionId: 1,
  uncanceledActions: {},
  getCancellableAction: function(actionType, actionFunc)
  {
    var o = padutils.uncanceledActions[actionType];
    if (!o)
    {
      o = {};
      padutils.uncanceledActions[actionType] = o;
    }
    var actionId = (padutils._nextActionId++);
    o[actionId] = true;
    return function()
    {
      var p = padutils.uncanceledActions[actionType];
      if (p && p[actionId])
      {
        actionFunc();
      }
    };
  },
  cancelActions: function(actionType)
  {
    var o = padutils.uncanceledActions[actionType];
    if (o)
    {
      // clear it
      delete padutils.uncanceledActions[actionType];
    }
  },
  makeFieldLabeledWhenEmpty: function(field, labelText)
  {
    field = $(field);

    function clear()
    {
      field.addClass('editempty');
      field.val(labelText);
    }
    field.focus(function()
    {
      if (field.hasClass('editempty'))
      {
        field.val('');
      }
      field.removeClass('editempty');
    });
    field.blur(function()
    {
      if (!field.val())
      {
        clear();
      }
    });
    return {
      clear: clear
    };
  },
  getCheckbox: function(node)
  {
    return $(node).is(':checked');
  },
  setCheckbox: function(node, value)
  {
    if (value)
    {
      $(node).attr('checked', 'checked');
    }
    else
    {
      $(node).removeAttr('checked');
    }
  },
  bindCheckboxChange: function(node, func)
  {
    $(node).change(func);
  },
  encodeUserId: function(userId)
  {
    return userId.replace(/[^a-y0-9]/g, function(c)
    {
      if (c == ".") return "-";
      return 'z' + c.charCodeAt(0) + 'z';
    });
  },
  decodeUserId: function(encodedUserId)
  {
    return encodedUserId.replace(/[a-y0-9]+|-|z.+?z/g, function(cc)
    {
      if (cc == '-') return '.';
      else if (cc.charAt(0) == 'z')
      {
        return String.fromCharCode(Number(cc.slice(1, -1)));
      }
      else
      {
        return cc;
      }
    });
  }
};

var globalExceptionHandler = undefined;
function setupGlobalExceptionHandler() {
  if (!globalExceptionHandler) {
    globalExceptionHandler = function test (msg, url, linenumber)
    {
      var errorId = randomString(20);
      var userAgent = padutils.escapeHtml(navigator.userAgent);
      if ($("#editorloadingbox").attr("display") != "none"){
        //show javascript errors to the user
        $("#editorloadingbox").css("padding", "10px");
        $("#editorloadingbox").css("padding-top", "45px");
        $("#editorloadingbox").html("<div style='text-align:left;color:red;font-size:16px;'><b>An error occured</b><br>The error was reported with the following id: '" + errorId + "'<br><br><span style='color:black;font-weight:bold;font-size:16px'>Please press and hold Ctrl and press F5 to reload this page, if the problem persists please send this error message to your webmaster: </span><div style='color:black;font-size:14px'>'"
          + "ErrorId: " + errorId + "<br>URL: " + window.location.href + "<br>UserAgent: " + userAgent + "<br>" + msg + " in " + url + " at line " + linenumber + "'</div></div>");
      }

      //send javascript errors to the server
      var errObj = {errorInfo: JSON.stringify({errorId: errorId, msg: msg, url: window.location.href, linenumber: linenumber, userAgent: navigator.userAgent})};
      var loc = document.location;
      var url = loc.protocol + "//" + loc.hostname + ":" + loc.port + "/" + loc.pathname.substr(1, loc.pathname.indexOf("/p/")) + "jserror";
 
      $.post(url, errObj);
 
      return false;
    };
    window.onerror = globalExceptionHandler;
  }
}

padutils.setupGlobalExceptionHandler = setupGlobalExceptionHandler;

padutils.binarySearch = require('./ace2_common').binarySearch;

exports.randomString = randomString;
exports.createCookie = createCookie;
exports.readCookie = readCookie;
exports.padutils = padutils;

}
, "ep_etherpad-lite/static/js/browser.js": function (require, exports, module) {
/*!
  * Bowser - a browser detector
  * https://github.com/ded/bowser
  * MIT License | (c) Dustin Diaz 2014
  */

!function (name, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports['browser'] = definition()
  else if (typeof define == 'function' && define.amd) define(definition)
  else this[name] = definition()
}('bowser', function () {
  /**
    * See useragents.js for examples of navigator.userAgent
    */

  var t = true

  function detect(ua) {

    function getFirstMatch(regex) {
      var match = ua.match(regex);
      return (match && match.length > 1 && match[1]) || '';
    }

    var iosdevice = getFirstMatch(/(ipod|iphone|ipad)/i).toLowerCase()
      , likeAndroid = /like android/i.test(ua)
      , android = !likeAndroid && /android/i.test(ua)
      , versionIdentifier = getFirstMatch(/version\/(\d+(\.\d+)?)/i)
      , tablet = /tablet/i.test(ua)
      , mobile = !tablet && /[^-]mobi/i.test(ua)
      , result

    if (/opera|opr/i.test(ua)) {
      result = {
        name: 'Opera'
      , opera: t
      , version: versionIdentifier || getFirstMatch(/(?:opera|opr)[\s\/](\d+(\.\d+)?)/i)
      }
    }
    else if (/windows phone/i.test(ua)) {
      result = {
        name: 'Windows Phone'
      , windowsphone: t
      , msie: t
      , version: getFirstMatch(/iemobile\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/msie|trident/i.test(ua)) {
      result = {
        name: 'Internet Explorer'
      , msie: t
      , version: getFirstMatch(/(?:msie |rv:)(\d+(\.\d+)?)/i)
      }
    }
    else if (/chrome|crios|crmo/i.test(ua)) {
      result = {
        name: 'Chrome'
      , chrome: t
      , version: getFirstMatch(/(?:chrome|crios|crmo)\/(\d+(\.\d+)?)/i)
      }
    }
    else if (iosdevice) {
      result = {
        name : iosdevice == 'iphone' ? 'iPhone' : iosdevice == 'ipad' ? 'iPad' : 'iPod'
      }
      // WTF: version is not part of user agent in web apps
      if (versionIdentifier) {
        result.version = versionIdentifier
      }
    }
    else if (/sailfish/i.test(ua)) {
      result = {
        name: 'Sailfish'
      , sailfish: t
      , version: getFirstMatch(/sailfish\s?browser\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/seamonkey\//i.test(ua)) {
      result = {
        name: 'SeaMonkey'
      , seamonkey: t
      , version: getFirstMatch(/seamonkey\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/firefox|iceweasel/i.test(ua)) {
      result = {
        name: 'Firefox'
      , firefox: t
      , version: getFirstMatch(/(?:firefox|iceweasel)[ \/](\d+(\.\d+)?)/i)
      }
      if (/\((mobile|tablet);[^\)]*rv:[\d\.]+\)/i.test(ua)) {
        result.firefoxos = t
      }
    }
    else if (/silk/i.test(ua)) {
      result =  {
        name: 'Amazon Silk'
      , silk: t
      , version : getFirstMatch(/silk\/(\d+(\.\d+)?)/i)
      }
    }
    else if (android) {
      result = {
        name: 'Android'
      , version: versionIdentifier
      }
    }
    else if (/phantom/i.test(ua)) {
      result = {
        name: 'PhantomJS'
      , phantom: t
      , version: getFirstMatch(/phantomjs\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/blackberry|\bbb\d+/i.test(ua) || /rim\stablet/i.test(ua)) {
      result = {
        name: 'BlackBerry'
      , blackberry: t
      , version: versionIdentifier || getFirstMatch(/blackberry[\d]+\/(\d+(\.\d+)?)/i)
      }
    }
    else if (/(web|hpw)os/i.test(ua)) {
      result = {
        name: 'WebOS'
      , webos: t
      , version: versionIdentifier || getFirstMatch(/w(?:eb)?osbrowser\/(\d+(\.\d+)?)/i)
      };
      /touchpad\//i.test(ua) && (result.touchpad = t)
    }
    else if (/bada/i.test(ua)) {
      result = {
        name: 'Bada'
      , bada: t
      , version: getFirstMatch(/dolfin\/(\d+(\.\d+)?)/i)
      };
    }
    else if (/tizen/i.test(ua)) {
      result = {
        name: 'Tizen'
      , tizen: t
      , version: getFirstMatch(/(?:tizen\s?)?browser\/(\d+(\.\d+)?)/i) || versionIdentifier
      };
    }
    else if (/safari/i.test(ua)) {
      result = {
        name: 'Safari'
      , safari: t
      , version: versionIdentifier
      }
    }
    else result = {}

    // set webkit or gecko flag for browsers based on these engines
    if (/(apple)?webkit/i.test(ua)) {
      result.name = result.name || "Webkit"
      result.webkit = t
      if (!result.version && versionIdentifier) {
        result.version = versionIdentifier
      }
    } else if (!result.opera && /gecko\//i.test(ua)) {
      result.name = result.name || "Gecko"
      result.gecko = t
      result.version = result.version || getFirstMatch(/gecko\/(\d+(\.\d+)?)/i)
    }

    // set OS flags for platforms that have multiple browsers
    if (android || result.silk) {
      result.android = t
    } else if (iosdevice) {
      result[iosdevice] = t
      result.ios = t
    }

    // OS version extraction
    var osVersion = '';
    if (iosdevice) {
      osVersion = getFirstMatch(/os (\d+([_\s]\d+)*) like mac os x/i);
      osVersion = osVersion.replace(/[_\s]/g, '.');
    } else if (android) {
      osVersion = getFirstMatch(/android[ \/-](\d+(\.\d+)*)/i);
    } else if (result.windowsphone) {
      osVersion = getFirstMatch(/windows phone (?:os)?\s?(\d+(\.\d+)*)/i);
    } else if (result.webos) {
      osVersion = getFirstMatch(/(?:web|hpw)os\/(\d+(\.\d+)*)/i);
    } else if (result.blackberry) {
      osVersion = getFirstMatch(/rim\stablet\sos\s(\d+(\.\d+)*)/i);
    } else if (result.bada) {
      osVersion = getFirstMatch(/bada\/(\d+(\.\d+)*)/i);
    } else if (result.tizen) {
      osVersion = getFirstMatch(/tizen[\/\s](\d+(\.\d+)*)/i);
    }
    if (osVersion) {
      result.osversion = osVersion;
    }

    // device type extraction
    var osMajorVersion = osVersion.split('.')[0];
    if (tablet || iosdevice == 'ipad' || (android && (osMajorVersion == 3 || (osMajorVersion == 4 && !mobile))) || result.silk) {
      result.tablet = t
    } else if (mobile || iosdevice == 'iphone' || iosdevice == 'ipod' || android || result.blackberry || result.webos || result.bada) {
      result.mobile = t
    }

    // Graded Browser Support
    // http://developer.yahoo.com/yui/articles/gbs
    if ((result.msie && result.version >= 10) ||
        (result.chrome && result.version >= 20) ||
        (result.firefox && result.version >= 20.0) ||
        (result.safari && result.version >= 6) ||
        (result.opera && result.version >= 10.0) ||
        (result.ios && result.osversion && result.osversion.split(".")[0] >= 6) ||
        (result.blackberry && result.version >= 10.1)
        ) {
      result.a = t;
    }
    else if ((result.msie && result.version < 10) ||
        (result.chrome && result.version < 20) ||
        (result.firefox && result.version < 20.0) ||
        (result.safari && result.version < 6) ||
        (result.opera && result.version < 10.0) ||
        (result.ios && result.osversion && result.osversion.split(".")[0] < 6)
        ) {
      result.c = t
    } else result.x = t

    return result
  }

  var bowser = detect(typeof navigator !== 'undefined' ? navigator.userAgent : '')


  /*
   * Set our detect method to the main bowser object so we can
   * reuse it to test other user agents.
   * This is needed to implement future tests.
   */
  bowser._detect = detect;

  return bowser
});

}
, "ep_etherpad-lite/static/js/pad_cookie.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


var padcookie = (function()
{
  function getRawCookie()
  {
    // returns null if can't get cookie text
    if (!document.cookie)
    {
      return null;
    }
    // look for (start of string OR semicolon) followed by whitespace followed by prefs=(something);
    var regexResult = document.cookie.match(/(?:^|;)\s*prefs=([^;]*)(?:;|$)/);
    if ((!regexResult) || (!regexResult[1]))
    {
      return null;
    }
    return regexResult[1];
  }

  function setRawCookie(safeText)
  {
    var expiresDate = new Date();
    expiresDate.setFullYear(3000);
    document.cookie = ('prefs=' + safeText + ';expires=' + expiresDate.toGMTString());
  }

  function parseCookie(text)
  {
    // returns null if can't parse cookie.
    try
    {
      var cookieData = JSON.parse(unescape(text));
      return cookieData;
    }
    catch (e)
    {
      return null;
    }
  }

  function stringifyCookie(data)
  {
    return escape(JSON.stringify(data));
  }

  function saveCookie()
  {
    if (!inited)
    {
      return;
    }
    setRawCookie(stringifyCookie(cookieData));

    if ((!getRawCookie()) && (!alreadyWarnedAboutNoCookies))
    {
      alert("Warning: it appears that your browser does not have cookies enabled." + " EtherPad uses cookies to keep track of unique users for the purpose" + " of putting a quota on the number of active users.  Using EtherPad without " + " cookies may fill up your server's user quota faster than expected.");
      alreadyWarnedAboutNoCookies = true;
    }
  }

  var wasNoCookie = true;
  var cookieData = {};
  var alreadyWarnedAboutNoCookies = false;
  var inited = false;

  var pad = undefined;
  var self = {
    init: function(prefsToSet, _pad)
    {
      pad = _pad;

      var rawCookie = getRawCookie();
      if (rawCookie)
      {
        var cookieObj = parseCookie(rawCookie);
        if (cookieObj)
        {
          wasNoCookie = false; // there was a cookie
          delete cookieObj.userId;
          delete cookieObj.name;
          delete cookieObj.colorId;
          cookieData = cookieObj;
        }
      }

      for (var k in prefsToSet)
      {
        cookieData[k] = prefsToSet[k];
      }

      inited = true;
      saveCookie();
    },
    wasNoCookie: function()
    {
      return wasNoCookie;
    },
    getPref: function(prefName)
    {
      return cookieData[prefName];
    },
    setPref: function(prefName, value)
    {
      cookieData[prefName] = value;
      saveCookie();
    }
  };
  return self;
}());

exports.padcookie = padcookie;

}
, "ep_etherpad-lite/static/js/pad_editor.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var padcookie = require('./pad_cookie').padcookie;
var padutils = require('./pad_utils').padutils;

var padeditor = (function()
{
  var Ace2Editor = undefined;
  var pad = undefined;
  var settings = undefined;

  // Array of available fonts
  var fonts = ['useMonospaceFont', 'useOpenDyslexicFont', 'useComicSansFont', 'useCourierNewFont', 'useGeorgiaFont', 'useImpactFont',
    'useLucidaFont', 'useLucidaSansFont', 'usePalatinoFont', 'useTahomaFont', 'useTimesNewRomanFont',
    'useTrebuchetFont', 'useVerdanaFont', 'useSymbolFont', 'useWebdingsFont', 'useWingDingsFont', 'useSansSerifFont',
    'useSerifFont'];

  var self = {
    ace: null,
    // this is accessed directly from other files
    viewZoom: 100,
    init: function(readyFunc, initialViewOptions, _pad)
    {
      Ace2Editor = require('./ace').Ace2Editor;
      pad = _pad;
      settings = pad.settings;

      function aceReady()
      {
        $("#editorloadingbox").hide();
        if (readyFunc)
        {
          readyFunc();
        }
      }

      self.ace = new Ace2Editor();
      self.ace.init("editorcontainer", "", aceReady);
      self.ace.setProperty("wraps", true);
      if (pad.getIsDebugEnabled())
      {
        self.ace.setProperty("dmesg", pad.dmesg);
      }
      self.initViewOptions();
      self.setViewOptions(initialViewOptions);

      // view bar
      $("#viewbarcontents").show();
    },
    initViewOptions: function()
    {
      // Line numbers
      padutils.bindCheckboxChange($("#options-linenoscheck"), function()
      {
        pad.changeViewOption('showLineNumbers', padutils.getCheckbox($("#options-linenoscheck")));
      });

      // Author colors
      padutils.bindCheckboxChange($("#options-colorscheck"), function()
      {
        padcookie.setPref('showAuthorshipColors', padutils.getCheckbox("#options-colorscheck"));
        pad.changeViewOption('showAuthorColors', padutils.getCheckbox("#options-colorscheck"));
      });

      // Right to left
      padutils.bindCheckboxChange($("#options-rtlcheck"), function()
      {
        pad.changeViewOption('rtlIsTrue', padutils.getCheckbox($("#options-rtlcheck")))
      });
      html10n.bind('localized', function() {
        pad.changeViewOption('rtlIsTrue', ('rtl' == html10n.getDirection()));
        padutils.setCheckbox($("#options-rtlcheck"), ('rtl' == html10n.getDirection()));
      })

      // font family change
      $("#viewfontmenu").change(function()
      {
        $.each(fonts, function(i, font){
          var sfont = font.replace("use","");
          sfont = sfont.replace("Font","");
          sfont = sfont.toLowerCase();
          pad.changeViewOption(font, $("#viewfontmenu").val() == sfont);
        });
      });
      
      // Language
      html10n.bind('localized', function() {
        $("#languagemenu").val(html10n.getLanguage());
        // translate the value of 'unnamed' and 'Enter your name' textboxes in the userlist
        // this does not interfere with html10n's normal value-setting because html10n just ingores <input>s
        // also, a value which has been set by the user will be not overwritten since a user-edited <input>
        // does *not* have the editempty-class
        $('input[data-l10n-id]').each(function(key, input){
          input = $(input);
          if(input.hasClass("editempty")){
            input.val(html10n.get(input.attr("data-l10n-id")));
          }
        });
      })
      $("#languagemenu").val(html10n.getLanguage());
      $("#languagemenu").change(function() {
        pad.createCookie("language",$("#languagemenu").val(),null,'/');
        window.html10n.localize([$("#languagemenu").val(), 'en']);
      });
    },
    setViewOptions: function(newOptions)
    {
      function getOption(key, defaultValue)
      {
        var value = String(newOptions[key]);
        if (value == "true") return true;
        if (value == "false") return false;
        return defaultValue;
      }

      var v;

      v = getOption('rtlIsTrue', ('rtl' == html10n.getDirection()));
      self.ace.setProperty("rtlIsTrue", v);
      padutils.setCheckbox($("#options-rtlcheck"), v);

      v = getOption('showLineNumbers', true);
      self.ace.setProperty("showslinenumbers", v);
      padutils.setCheckbox($("#options-linenoscheck"), v);

      v = getOption('showAuthorColors', true);
      self.ace.setProperty("showsauthorcolors", v);
      padutils.setCheckbox($("#options-colorscheck"), v);

      // Override from parameters if true
      if (settings.noColors !== false){
        self.ace.setProperty("showsauthorcolors", !settings.noColors);
      }

      var normalFont = true;
      // Go through each font and see if the option is set..
      $.each(fonts, function(i, font){
        var isEnabled = getOption(font, false);
        if(isEnabled){
          font = font.replace("use","");
          font = font.replace("Font","");
          font = font.toLowerCase();
          if(font === "monospace") self.ace.setProperty("textface", "Courier new");
          if(font === "opendyslexic") self.ace.setProperty("textface", "OpenDyslexic");
          if(font === "comicsans") self.ace.setProperty("textface", "Comic Sans MS");
          if(font === "georgia") self.ace.setProperty("textface", "Georgia");
          if(font === "impact") self.ace.setProperty("textface", "Impact");
          if(font === "lucida") self.ace.setProperty("textface", "Lucida");
          if(font === "lucidasans") self.ace.setProperty("textface", "Lucida Sans Unicode");
          if(font === "palatino") self.ace.setProperty("textface", "Palatino Linotype");
          if(font === "tahoma") self.ace.setProperty("textface", "Tahoma");
          if(font === "timesnewroman") self.ace.setProperty("textface", "Times New Roman");
          if(font === "trebuchet") self.ace.setProperty("textface", "Trebuchet MS");
          if(font === "verdana") self.ace.setProperty("textface", "Verdana");
          if(font === "symbol") self.ace.setProperty("textface", "Symbol");
          if(font === "webdings") self.ace.setProperty("textface", "Webdings");
          if(font === "wingdings") self.ace.setProperty("textface", "Wingdings");
          if(font === "sansserif") self.ace.setProperty("textface", "MS Sans Serif");
          if(font === "serif") self.ace.setProperty("textface", "MS Serif");

          // $("#viewfontmenu").val(font);
          normalFont = false;
        }
      });

      // No font has been previously selected so use the Normal font
      if(normalFont){
        self.ace.setProperty("textface", "Arial, sans-serif");
        // $("#viewfontmenu").val("normal");
      }

    },
    dispose: function()
    {
      if (self.ace)
      {
        self.ace.destroy();
        self.ace = null;
      }
    },
    disable: function()
    {
      if (self.ace)
      {
        self.ace.setProperty("grayedOut", true);
        self.ace.setEditable(false);
      }
    },
    restoreRevisionText: function(dataFromServer)
    {
      pad.addHistoricalAuthors(dataFromServer.historicalAuthorData);
      self.ace.importAText(dataFromServer.atext, dataFromServer.apool, true);
    }
  };
  return self;
}());

exports.padeditor = padeditor;

}
, "ep_etherpad-lite/static/js/pad_editbar.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code.
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var hooks = require('./pluginfw/hooks');
var padutils = require('./pad_utils').padutils;
var padeditor = require('./pad_editor').padeditor;
var padsavedrevs = require('./pad_savedrevs');

var ToolbarItem = function (element) {
  this.$el = element;
};

ToolbarItem.prototype.getCommand = function () {
  return this.$el.attr("data-key");
};

ToolbarItem.prototype.getValue = function () {
  if (this.isSelect()) {
    return this.$el.find("select").val();
  }
};

ToolbarItem.prototype.setValue = function (val) {
  if (this.isSelect()) {
    return this.$el.find("select").val(val);
  }
};


ToolbarItem.prototype.getType = function () {
  return this.$el.attr("data-type");
};

ToolbarItem.prototype.isSelect = function () {
  return this.getType() == "select";
};

ToolbarItem.prototype.isButton = function () {
  return this.getType() == "button";
};

ToolbarItem.prototype.bind = function (callback) {
  var self = this;

  if (self.isButton()) {
    self.$el.click(function (event) {
      $(':focus').blur();
      callback(self.getCommand(), self);
      event.preventDefault();
    });
  }
  else if (self.isSelect()) {
    self.$el.find("select").change(function () {
      callback(self.getCommand(), self);
    });
  }
};


var padeditbar = (function()
{

  var syncAnimation = (function()
  {
    var SYNCING = -100;
    var DONE = 100;
    var state = DONE;
    var fps = 25;
    var step = 1 / fps;
    var T_START = -0.5;
    var T_FADE = 1.0;
    var T_GONE = 1.5;
    var animator = padutils.makeAnimationScheduler(function()
    {
      if (state == SYNCING || state == DONE)
      {
        return false;
      }
      else if (state >= T_GONE)
      {
        state = DONE;
        $("#syncstatussyncing").css('display', 'none');
        $("#syncstatusdone").css('display', 'none');
        return false;
      }
      else if (state < 0)
      {
        state += step;
        if (state >= 0)
        {
          $("#syncstatussyncing").css('display', 'none');
          $("#syncstatusdone").css('display', 'block').css('opacity', 1);
        }
        return true;
      }
      else
      {
        state += step;
        if (state >= T_FADE)
        {
          $("#syncstatusdone").css('opacity', (T_GONE - state) / (T_GONE - T_FADE));
        }
        return true;
      }
    }, step * 1000);
    return {
      syncing: function()
      {
        state = SYNCING;
        $("#syncstatussyncing").css('display', 'block');
        $("#syncstatusdone").css('display', 'none');
      },
      done: function()
      {
        state = T_START;
        animator.scheduleAnimation();
      }
    };
  }());

  var self = {
    init: function() {
      var self = this;
      self.dropdowns = [];
      // Listen for resize events (sucks but needed as iFrame ace_inner has to be position absolute
      // A CSS fix for this would be nice but I'm not sure how we'd do it.
      $(window).resize(function(){
        self.redrawHeight();
      });

      $("#editbar .editbarbutton").attr("unselectable", "on"); // for IE
      $("#editbar").removeClass("disabledtoolbar").addClass("enabledtoolbar");
      $("#editbar [data-key]").each(function () {
        $(this).unbind("click");
        (new ToolbarItem($(this))).bind(function (command, item) {
          self.triggerCommand(command, item);
        });
      });

      $('body:not(#editorcontainerbox)').on("keydown", function(evt){
        bodyKeyEvent(evt);
      });

      $('#editbar').show();

      this.redrawHeight();

      registerDefaultCommands(self);

      hooks.callAll("postToolbarInit", {
        toolbar: self,
        ace: padeditor.ace
      });
    },
    isEnabled: function()
    {
//      return !$("#editbar").hasClass('disabledtoolbar');
      return true;
    },
    disable: function()
    {
      $("#editbar").addClass('disabledtoolbar').removeClass("enabledtoolbar");
    },
    commands: {},
    registerCommand: function (cmd, callback) {
      this.commands[cmd] = callback;
      return this;
    },
    redrawHeight: function(){
      var editbarHeight = $('.menu_left').height() + 1 + "px";
      var containerTop = $('.menu_left').height() + 6 + "px";
      $('#editbar').css("height", editbarHeight);

      $('#editorcontainer').css("top", containerTop);

      // make sure pop ups are in the right place
      if($('#editorcontainer').offset()){
        $('.popup').css("top", $('#editorcontainer').offset().top + "px");
      }

      // If sticky chat is enabled..
      if($('#options-stickychat').is(":checked")){
        if($('#editorcontainer').offset()){
          $('#chatbox').css("top", $('#editorcontainer').offset().top + "px");
        }
      };

      // If chat and Users is enabled..
      if($('#options-chatandusers').is(":checked")){
        if($('#editorcontainer').offset()){
          $('#users').css("top", $('#editorcontainer').offset().top + "px");
        }
      }

    },
    registerDropdownCommand: function (cmd, dropdown) {
      dropdown = dropdown || cmd;
      self.dropdowns.push(dropdown)
      this.registerCommand(cmd, function () {
        self.toggleDropDown(dropdown);
      });
    },
    registerAceCommand: function (cmd, callback) {
      this.registerCommand(cmd, function (cmd, ace) {
        ace.callWithAce(function (ace) {
          callback(cmd, ace);
        }, cmd, true);
      });
    },
    triggerCommand: function (cmd, item) {
      if (self.isEnabled() && this.commands[cmd]) {
        this.commands[cmd](cmd, padeditor.ace, item);
      }
      if(padeditor.ace) padeditor.ace.focus();
    },
    toggleDropDown: function(moduleName, cb)
    {
      // hide all modules and remove highlighting of all buttons
      if(moduleName == "none")
      {
        var returned = false
        for(var i=0;i<self.dropdowns.length;i++)
        {
          //skip the userlist
          if(self.dropdowns[i] == "users")
            continue;

          var module = $("#" + self.dropdowns[i]);

          if(module.css('display') != "none")
          {
            $("li[data-key=" + self.dropdowns[i] + "] > a").removeClass("selected");
            module.slideUp("fast", cb);
            returned = true;
          }
        }
        if(!returned && cb) return cb();
      }
      else
      {
        // hide all modules that are not selected and remove highlighting
        // respectively add highlighting to the corresponding button
        for(var i=0;i<self.dropdowns.length;i++)
        {
          var module = $("#" + self.dropdowns[i]);

          if(module.css('display') != "none")
          {
            $("li[data-key=" + self.dropdowns[i] + "] > a").removeClass("selected");
            module.slideUp("fast");
          }
          else if(self.dropdowns[i]==moduleName)
          {
            $("li[data-key=" + self.dropdowns[i] + "] > a").addClass("selected");
            module.slideDown("fast", cb);
          }
        }
      }
    },
    setSyncStatus: function(status)
    {
      if (status == "syncing")
      {
        syncAnimation.syncing();
      }
      else if (status == "done")
      {
        syncAnimation.done();
      }
    },
    setEmbedLinks: function()
    {
      if ($('#readonlyinput').is(':checked'))
      {
        var basePath = document.location.href.substring(0, document.location.href.indexOf("/p/"));
        var readonlyLink = basePath + "/p/" + clientVars.readOnlyId;
        $('#embedinput').val("<iframe name='embed_readonly' src='" + readonlyLink + "?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false' width=600 height=400></iframe>");
        $('#linkinput').val(readonlyLink);
      }
      else
      {
        var padurl = window.location.href.split("?")[0];
        $('#embedinput').val("<iframe name='embed_readwrite' src='" + padurl + "?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false' width=600 height=400></iframe>");
        $('#linkinput').val(padurl);
      }
    }
  };

  var editbarPosition = 0;

  function bodyKeyEvent(evt){

    // If the event is Alt F9 or Escape & we're already in the editbar menu
    // Send the users focus back to the pad
    if((evt.keyCode === 120 && evt.altKey) || evt.keyCode === 27){
      if($(':focus').parents(".toolbar").length === 1){
        // If we're in the editbar already..
        // Close any dropdowns we have open..
        padeditbar.toggleDropDown("none");
        // Check we're on a pad and not on the timeslider
        // Or some other window I haven't thought about!
        if(typeof pad === 'undefined'){
          // Timeslider probably..
          // Shift focus away from any drop downs
          $(':focus').blur(); // required to do not try to remove!
          $('#padmain').focus(); // Focus back onto the pad
        }else{
          // Shift focus away from any drop downs
          $(':focus').blur(); // required to do not try to remove!
          padeditor.ace.focus(); // Sends focus back to pad
          // The above focus doesn't always work in FF, you have to hit enter afterwards
          evt.preventDefault();
        }
      }else{
        // Focus on the editbar :)
        var firstEditbarElement = parent.parent.$('#editbar').children("ul").first().children().first().children().first().children().first();
        $(this).blur();
        firstEditbarElement.focus();
        evt.preventDefault();
      }
    }
    // Are we in the toolbar??
    if($(':focus').parents(".toolbar").length === 1){
      // On arrow keys go to next/previous button item in editbar
      if(evt.keyCode !== 39 && evt.keyCode !== 37) return;

      // Get all the focusable items in the editbar
      var focusItems = $('#editbar').find('button, select');

      // On left arrow move to next button in editbar
      if(evt.keyCode === 37){
        // If a dropdown is visible or we're in an input don't move to the next button
        if($('.popup').is(":visible") || evt.target.localName === "input") return;

        editbarPosition--;
        // Allow focus to shift back to end of row and start of row
        if(editbarPosition === -1) editbarPosition = focusItems.length -1;
        $(focusItems[editbarPosition]).focus()
      }

      // On right arrow move to next button in editbar
      if(evt.keyCode === 39){
        // If a dropdown is visible or we're in an input don't move to the next button
        if($('.popup').is(":visible") || evt.target.localName === "input") return;

        editbarPosition++;
        // Allow focus to shift back to end of row and start of row
        if(editbarPosition >= focusItems.length) editbarPosition = 0;
        $(focusItems[editbarPosition]).focus();
      }
    }

  }

  function aceAttributeCommand(cmd, ace) {
    ace.ace_toggleAttributeOnSelection(cmd);
  }

  function registerDefaultCommands(toolbar) {
    toolbar.registerDropdownCommand("showusers", "users");
    toolbar.registerDropdownCommand("settings");
    toolbar.registerDropdownCommand("connectivity");
    toolbar.registerDropdownCommand("import_export");
    toolbar.registerDropdownCommand("embed");

    toolbar.registerCommand("settings", function () {
      toolbar.toggleDropDown("settings", function(){
        $('#options-stickychat').focus();
      });
    });

    toolbar.registerCommand("import_export", function () {
      toolbar.toggleDropDown("import_export", function(){
        // If Import file input exists then focus on it..
        if($('#importfileinput').length !== 0){
          setTimeout(function(){
            $('#importfileinput').focus();
          }, 100);
        }else{
          $('.exportlink').first().focus();
        }
      });
    });

    toolbar.registerCommand("showusers", function () {
      toolbar.toggleDropDown("users", function(){
        $('#myusernameedit').focus();
      });
    });

    toolbar.registerCommand("embed", function () {
      toolbar.setEmbedLinks();
      toolbar.toggleDropDown("embed", function(){
        $('#linkinput').focus().select();
      });
    });

    toolbar.registerCommand("savedRevision", function () {
      padsavedrevs.saveNow();
    });

    toolbar.registerCommand("showTimeSlider", function () {
      document.location = document.location.pathname+ '/timeslider';
    });

    toolbar.registerAceCommand("bold", aceAttributeCommand);
    toolbar.registerAceCommand("italic", aceAttributeCommand);
    toolbar.registerAceCommand("underline", aceAttributeCommand);
    toolbar.registerAceCommand("strikethrough", aceAttributeCommand);

    toolbar.registerAceCommand("undo", function (cmd, ace) {
      ace.ace_doUndoRedo(cmd);
    });

    toolbar.registerAceCommand("redo", function (cmd, ace) {
      ace.ace_doUndoRedo(cmd);
    });

    toolbar.registerAceCommand("insertunorderedlist", function (cmd, ace) {
      ace.ace_doInsertUnorderedList();
    });

    toolbar.registerAceCommand("insertorderedlist", function (cmd, ace) {
      ace.ace_doInsertOrderedList();
    });

    toolbar.registerAceCommand("indent", function (cmd, ace) {
      if (!ace.ace_doIndentOutdent(false)) {
        ace.ace_doInsertUnorderedList();
      }
    });

    toolbar.registerAceCommand("outdent", function (cmd, ace) {
      ace.ace_doIndentOutdent(true);
    });

    toolbar.registerAceCommand("clearauthorship", function (cmd, ace) {
      if ((!(ace.ace_getRep().selStart && ace.ace_getRep().selEnd)) || ace.ace_isCaret()) {
        if (window.confirm(html10n.get("pad.editbar.clearcolors"))) {
          ace.ace_performDocumentApplyAttributesToCharRange(0, ace.ace_getRep().alltext.length, [
            ['author', '']
          ]);
        }
      }
      else {
        ace.ace_setAttributeOnSelection('author', '');
      }
    });

    toolbar.registerCommand('timeslider_returnToPad', function(cmd) {
      if( document.referrer.length > 0 && document.referrer.substring(document.referrer.lastIndexOf("/")-1, document.referrer.lastIndexOf("/")) === "p") {
        document.location = document.referrer;
      } else {
        document.location = document.location.href.substring(0,document.location.href.lastIndexOf("/"));
      }
    });
  }

  return self;
}());

exports.padeditbar = padeditbar;

}
, "ep_etherpad-lite/static/js/pad_docbar.js": null
, "ep_etherpad-lite/static/js/pad_modals.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
 
var padeditbar = require('./pad_editbar').padeditbar;

var padmodals = (function()
{
  var pad = undefined;
  var self = {
    init: function(_pad)
    {
      pad = _pad;
    },
    showModal: function(messageId)
    {
      padeditbar.toggleDropDown("none", function() {
        $("#connectivity .visible").removeClass('visible');
        $("#connectivity ."+messageId).addClass('visible');
        padeditbar.toggleDropDown("connectivity");
      });
    },
    showOverlay: function() {
      $("#overlay").show();
    },
    hideOverlay: function() {
      $("#overlay").hide();
    }
  };
  return self;
}());

exports.padmodals = padmodals;

}
, "ep_etherpad-lite/static/js/ace.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code.
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// requires: top
// requires: plugins
// requires: undefined

var KERNEL_SOURCE = '../static/js/require-kernel.js';

Ace2Editor.registry = {
  nextId: 1
};

var hooks = require('./pluginfw/hooks');
var _ = require('./underscore');

function scriptTag(source) {
  return (
    '<script type="text/javascript">\n'
    + source.replace(/<\//g, '<\\/') +
    '</script>'
  )
}

function Ace2Editor()
{
  var ace2 = Ace2Editor;

  var editor = {};
  var info = {
    editor: editor,
    id: (ace2.registry.nextId++)
  };
  var loaded = false;

  var actionsPendingInit = [];

  function pendingInit(func, optDoNow)
  {
    return function()
    {
      var that = this;
      var args = arguments;
      var action = function()
      {
        func.apply(that, args);
      }
      if (optDoNow)
      {
        optDoNow.apply(that, args);
      }
      if (loaded)
      {
        action();
      }
      else
      {
        actionsPendingInit.push(action);
      }
    };
  }

  function doActionsPendingInit()
  {
    _.each(actionsPendingInit, function(fn,i){
      fn()
    });
    actionsPendingInit = [];
  }

  ace2.registry[info.id] = info;

  // The following functions (prefixed by 'ace_')  are exposed by editor, but
  // execution is delayed until init is complete
  var aceFunctionsPendingInit = ['importText', 'importAText', 'focus',
  'setEditable', 'getFormattedCode', 'setOnKeyPress', 'setOnKeyDown',
  'setNotifyDirty', 'setProperty', 'setBaseText', 'setBaseAttributedText',
  'applyChangesToBase', 'applyPreparedChangesetToBase',
  'setUserChangeNotificationCallback', 'setAuthorInfo',
  'setAuthorSelectionRange', 'callWithAce', 'execCommand', 'replaceRange'];

  _.each(aceFunctionsPendingInit, function(fnName,i){
    var prefix = 'ace_';
    var name = prefix + fnName;
    editor[fnName] = pendingInit(function(){
      info[prefix + fnName].apply(this, arguments);
    });
  });

  editor.exportText = function()
  {
    if (!loaded) return "(awaiting init)\n";
    return info.ace_exportText();
  };

  editor.getFrame = function()
  {
    return info.frame || null;
  };

  editor.getDebugProperty = function(prop)
  {
    return info.ace_getDebugProperty(prop);
  };

  editor.getInInternationalComposition = function()
  {
    if (!loaded) return false;
    return info.ace_getInInternationalComposition();
  };

  // prepareUserChangeset:
  // Returns null if no new changes or ACE not ready.  Otherwise, bundles up all user changes
  // to the latest base text into a Changeset, which is returned (as a string if encodeAsString).
  // If this method returns a truthy value, then applyPreparedChangesetToBase can be called
  // at some later point to consider these changes part of the base, after which prepareUserChangeset
  // must be called again before applyPreparedChangesetToBase.  Multiple consecutive calls
  // to prepareUserChangeset will return an updated changeset that takes into account the
  // latest user changes, and modify the changeset to be applied by applyPreparedChangesetToBase
  // accordingly.
  editor.prepareUserChangeset = function()
  {
    if (!loaded) return null;
    return info.ace_prepareUserChangeset();
  };

  editor.getUnhandledErrors = function()
  {
    if (!loaded) return [];
    // returns array of {error: <browser Error object>, time: +new Date()}
    return info.ace_getUnhandledErrors();
  };



  function sortFilesByEmbeded(files) {
    var embededFiles = [];
    var remoteFiles = [];

    if (Ace2Editor.EMBEDED) {
      for (var i = 0, ii = files.length; i < ii; i++) {
        var file = files[i];
        if (Object.prototype.hasOwnProperty.call(Ace2Editor.EMBEDED, file)) {
          embededFiles.push(file);
        } else {
          remoteFiles.push(file);
        }
      }
    } else {
      remoteFiles = files;
    }

    return {embeded: embededFiles, remote: remoteFiles};
  }
  function pushStyleTagsFor(buffer, files) {
    var sorted = sortFilesByEmbeded(files);
    var embededFiles = sorted.embeded;
    var remoteFiles = sorted.remote;

    if (embededFiles.length > 0) {
      buffer.push('<style type="text/css">');
      for (var i = 0, ii = embededFiles.length; i < ii; i++) {
        var file = embededFiles[i];
        buffer.push((Ace2Editor.EMBEDED[file] || '').replace(/<\//g, '<\\/'));
      }
      buffer.push('<\/style>');
    }
    for (var i = 0, ii = remoteFiles.length; i < ii; i++) {
      var file = remoteFiles[i];
      buffer.push('<link rel="stylesheet" type="text/css" href="' + file + '"\/>');
    }
  }

  editor.destroy = pendingInit(function()
  {
    info.ace_dispose();
    info.frame.parentNode.removeChild(info.frame);
    delete ace2.registry[info.id];
    info = null; // prevent IE 6 closure memory leaks
  });

  editor.init = function(containerId, initialCode, doneFunc)
  {

    editor.importText(initialCode);

    info.onEditorReady = function()
    {
      loaded = true;
      doActionsPendingInit();
      doneFunc();
    };

    (function()
    {
      var doctype = "<!doctype html>";

      var iframeHTML = [];

      iframeHTML.push(doctype);
      iframeHTML.push("<html><head>");

      // calls to these functions ($$INCLUDE_...)  are replaced when this file is processed
      // and compressed, putting the compressed code from the named file directly into the
      // source here.
      // these lines must conform to a specific format because they are passed by the build script:
      var includedCSS = [];
      var $$INCLUDE_CSS = function(filename) {includedCSS.push(filename)};
      $$INCLUDE_CSS("../static/css/iframe_editor.css");
      $$INCLUDE_CSS("../static/css/pad.css");
      $$INCLUDE_CSS("../static/custom/pad.css");

      var additionalCSS = _(hooks.callAll("aceEditorCSS")).map(function(path){ return '../static/plugins/' + path });
      includedCSS = includedCSS.concat(additionalCSS);

      pushStyleTagsFor(iframeHTML, includedCSS);

      if (!Ace2Editor.EMBEDED && Ace2Editor.EMBEDED[KERNEL_SOURCE]) {
        // Remotely src'd script tag will not work in IE; it must be embedded, so
        // throw an error if it is not.
        throw new Error("Require kernel could not be found.");
      }

      iframeHTML.push(scriptTag(
Ace2Editor.EMBEDED[KERNEL_SOURCE] + '\n\
require.setRootURI("../javascripts/src");\n\
require.setLibraryURI("../javascripts/lib");\n\
require.setGlobalKeyPath("require");\n\
\n\
var hooks = require("ep_etherpad-lite/static/js/pluginfw/hooks");\n\
var plugins = require("ep_etherpad-lite/static/js/pluginfw/client_plugins");\n\
hooks.plugins = plugins;\n\
plugins.adoptPluginsFromAncestorsOf(window);\n\
\n\
$ = jQuery = require("ep_etherpad-lite/static/js/rjquery").jQuery; // Expose jQuery #HACK\n\
var Ace2Inner = require("ep_etherpad-lite/static/js/ace2_inner");\n\
\n\
plugins.ensure(function () {\n\
  Ace2Inner.init();\n\
});\n\
'));

      iframeHTML.push('<style type="text/css" title="dynamicsyntax"></style>');

      hooks.callAll("aceInitInnerdocbodyHead", {
        iframeHTML: iframeHTML
      });

      iframeHTML.push('</head><body id="innerdocbody" role="application" class="syntax" spellcheck="false">&nbsp;</body></html>');

      // Expose myself to global for my child frame.
      var thisFunctionsName = "ChildAccessibleAce2Editor";
      (function () {return this}())[thisFunctionsName] = Ace2Editor;

      var outerScript = '\
editorId = ' + JSON.stringify(info.id) + ';\n\
editorInfo = parent[' + JSON.stringify(thisFunctionsName) + '].registry[editorId];\n\
window.onload = function () {\n\
  window.onload = null;\n\
  setTimeout(function () {\n\
    var iframe = document.createElement("IFRAME");\n\
    iframe.name = "ace_inner";\n\
    iframe.title = "pad";\n\
    iframe.scrolling = "no";\n\
    var outerdocbody = document.getElementById("outerdocbody");\n\
    iframe.frameBorder = 0;\n\
    iframe.allowTransparency = true; // for IE\n\
    outerdocbody.insertBefore(iframe, outerdocbody.firstChild);\n\
    iframe.ace_outerWin = window;\n\
    readyFunc = function () {\n\
      editorInfo.onEditorReady();\n\
      readyFunc = null;\n\
      editorInfo = null;\n\
    };\n\
    var doc = iframe.contentWindow.document;\n\
    doc.open();\n\
    var text = (' + JSON.stringify(iframeHTML.join('\n')) + ');\n\
    doc.write(text);\n\
    doc.close();\n\
  }, 0);\n\
}';

      var outerHTML = [doctype, '<html><head>']

      var includedCSS = [];
      var $$INCLUDE_CSS = function(filename) {includedCSS.push(filename)};
      $$INCLUDE_CSS("../static/css/iframe_editor.css");
      $$INCLUDE_CSS("../static/css/pad.css");
      $$INCLUDE_CSS("../static/custom/pad.css");


      var additionalCSS = _(hooks.callAll("aceEditorCSS")).map(function(path){ return '../static/plugins/' + path });
      includedCSS = includedCSS.concat(additionalCSS);

      pushStyleTagsFor(outerHTML, includedCSS);

      // bizarrely, in FF2, a file with no "external" dependencies won't finish loading properly
      // (throbs busy while typing)
      outerHTML.push('<style type="text/css" title="dynamicsyntax"></style>', '<link rel="stylesheet" type="text/css" href="data:text/css,"/>', scriptTag(outerScript), '</head><body id="outerdocbody"><div id="sidediv"><!-- --></div><div id="linemetricsdiv">x</div></body></html>');

      var outerFrame = document.createElement("IFRAME");
      outerFrame.name = "ace_outer";
      outerFrame.frameBorder = 0; // for IE
      outerFrame.title = "Ether";
      info.frame = outerFrame;
      document.getElementById(containerId).appendChild(outerFrame);

      var editorDocument = outerFrame.contentWindow.document;

      editorDocument.open();
      editorDocument.write(outerHTML.join(''));
      editorDocument.close();
    })();
  };

  return editor;
}

exports.Ace2Editor = Ace2Editor;
;
Ace2Editor.EMBEDED = Ace2Editor.EMBEDED || {};
Ace2Editor.EMBEDED["../static/js/require-kernel.js"] = "var require = (function () {\n/*!\n\n  require-kernel\n\n  Created by Chad Weider on 01/04/11.\n  Released to the Public Domain on 17/01/12.\n\n*/\n\n  /* Storage */\n  var main = null; // Reference to main module in `modules`.\n  var modules = {}; // Repository of module objects build from `definitions`.\n  var definitions = {}; // Functions that construct `modules`.\n  var loadingModules = {}; // Locks for detecting circular dependencies.\n  var definitionWaiters = {}; // Locks for clearing duplicate requires.\n  var fetchRequests = []; // Queue of pending requests.\n  var currentRequests = 0; // Synchronization for parallel requests.\n  var maximumRequests = 2; // The maximum number of parallel requests.\n  var deferred = []; // A list of callbacks that can be evaluated eventually.\n  var deferredScheduled = false; // If deferred functions will be executed.\n\n  var syncLock = undefined;\n  var globalKeyPath = undefined;\n\n  var rootURI = undefined;\n  var libraryURI = undefined;\n\n  var JSONP_TIMEOUT = 60 * 1000;\n\n  function CircularDependencyError(message) {\n    this.name = \"CircularDependencyError\";\n    this.message = message;\n  };\n  CircularDependencyError.prototype = Error.prototype;\n  function ArgumentError(message) {\n    this.name = \"ArgumentError\";\n    this.message = message;\n  };\n  ArgumentError.prototype = Error.prototype;\n\n  /* Utility */\n  function hasOwnProperty(object, key) {\n    // Object-independent because an object may define `hasOwnProperty`.\n    return Object.prototype.hasOwnProperty.call(object, key);\n  }\n\n  /* Deferral */\n  function defer(f_1, f_2, f_n) {\n    deferred.push.apply(deferred, arguments);\n  }\n\n  function _flushDefer() {\n    // Let exceptions happen, but don't allow them to break notification.\n    try {\n      while (deferred.length) {\n        var continuation = deferred.shift();\n        continuation();\n      }\n      deferredScheduled = false;\n    } finally {\n      deferredScheduled = deferred.length > 0;\n      deferred.length && setTimeout(_flushDefer, 0);\n    }\n  }\n\n  function flushDefer() {\n    if (!deferredScheduled && deferred.length > 0) {\n      if (syncLock) {\n        // Only asynchronous operations will wait on this condition so schedule\n        // and don't interfere with the synchronous operation in progress.\n        deferredScheduled = true;\n        setTimeout(_flushDefer, 0);\n      } else {\n        _flushDefer();\n      }\n    }\n  }\n\n  function flushDeferAfter(f) {\n    try {\n      deferredScheduled = true;\n      f();\n      deferredScheduled = false;\n      flushDefer();\n    } finally {\n      deferredScheduled = false;\n      deferred.length && setTimeout(flushDefer, 0);\n    }\n  }\n\n  // See RFC 2396 Appendix B\n  var URI_EXPRESSION =\n      /^(([^:\\/?#]+):)?(\\/\\/([^\\/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?/;\n  function parseURI(uri) {\n    var match = uri.match(URI_EXPRESSION);\n    var location = match && {\n      scheme: match[2],\n      host: match[4],\n      path: match[5],\n      query: match[7],\n      fragment: match[9]\n    };\n    return location;\n  }\n\n  function joinURI(location) {\n    var uri = \"\";\n    if (location.scheme)\n      uri += location.scheme + ':';\n    if (location.host)\n      uri += \"//\" + location.host\n    if (location.host && location.path && location.path.charAt(0) != '/')\n      url += \"/\"\n    if (location.path)\n      uri += location.path\n    if (location.query)\n      uri += \"?\" + location.query\n    if (uri.fragment)\n      uri += \"#\" + location.fragment\n\n    return uri;\n  }\n\n  function isSameDomain(uri) {\n    var host_uri =\n      (typeof location == \"undefined\") ? {} : parseURI(location.toString());\n    var uri = parseURI(uri);\n\n    return (!uri.scheme && !uri.host)\n        || (uri.scheme === host_uri.scheme) && (uri.host === host_uri.host);\n  }\n\n  function mirroredURIForURI(uri) {\n    var host_uri =\n      (typeof location == \"undefined\") ? {} : parseURI(location.toString());\n    var uri = parseURI(uri);\n\n    uri.scheme = host_uri.scheme;\n    uri.host = host_uri.host;\n    return joinURI(uri);\n  }\n\n  function normalizePath(path) {\n    var pathComponents1 = path.split('/');\n    var pathComponents2 = [];\n\n    var component;\n    for (var i = 0, ii = pathComponents1.length; i < ii; i++) {\n      component = pathComponents1[i];\n      switch (component) {\n        case '':\n          if (i == 0 || i == ii - 1) {\n            // This indicates a leading or trailing slash.\n            pathComponents2.push(component);\n          }\n          break;\n        case '.':\n          // Always skip.\n          break;\n        case '..':\n          if (pathComponents2.length > 1\n            || (pathComponents2.length == 1\n              && pathComponents2[0] != ''\n              && pathComponents2[0] != '.')) {\n            pathComponents2.pop();\n            break;\n          }\n        default:\n          pathComponents2.push(component);\n      }\n    }\n\n    return pathComponents2.join('/');\n  }\n\n  function fullyQualifyPath(path, basePath) {\n    var fullyQualifiedPath = path;\n    if (path.charAt(0) == '.'\n      && (path.charAt(1) == '/'\n        || (path.charAt(1) == '.' && path.charAt(2) == '/'))) {\n      if (!basePath) {\n        basePath = '';\n      } else if (basePath.charAt(basePath.length-1) != '/') {\n        basePath += '/';\n      }\n      fullyQualifiedPath = basePath + path;\n    }\n    return fullyQualifiedPath;\n  }\n\n  function setRootURI(URI) {\n    if (!URI) {\n      throw new ArgumentError(\"Invalid root URI.\");\n    }\n    rootURI = (URI.charAt(URI.length-1) == '/' ? URI.slice(0,-1) : URI);\n  }\n\n  function setLibraryURI(URI) {\n    libraryURI = (URI.charAt(URI.length-1) == '/' ? URI : URI + '/');\n  }\n\n  function URIForModulePath(path) {\n    var components = path.split('/');\n    for (var i = 0, ii = components.length; i < ii; i++) {\n      components[i] = encodeURIComponent(components[i]);\n    }\n    path = components.join('/')\n\n    if (path.charAt(0) == '/') {\n      if (!rootURI) {\n        throw new Error(\"Attempt to retrieve the root module \"\n          + \"\\\"\"+ path + \"\\\" but no root URI is defined.\");\n      }\n      return rootURI + path;\n    } else {\n      if (!libraryURI) {\n        throw new Error(\"Attempt to retrieve the library module \"\n          + \"\\\"\"+ path + \"\\\" but no libary URI is defined.\");\n      }\n      return libraryURI + path;\n    }\n  }\n\n  function _compileFunction(code, filename) {\n    return new Function(code);\n  }\n\n  function compileFunction(code, filename) {\n    var compileFunction = rootRequire._compileFunction || _compileFunction;\n    return compileFunction.apply(this, arguments);\n  }\n\n  /* Remote */\n  function setRequestMaximum (value) {\n    value == parseInt(value);\n    if (value > 0) {\n      maximumRequests = value;\n      checkScheduledfetchDefines();\n    } else {\n      throw new ArgumentError(\"Value must be a positive integer.\")\n    }\n  }\n\n  function setGlobalKeyPath (value) {\n    globalKeyPath = value;\n  }\n\n  var XMLHttpFactories = [\n    function () {return new XMLHttpRequest()},\n    function () {return new ActiveXObject(\"Msxml2.XMLHTTP\")},\n    function () {return new ActiveXObject(\"Msxml3.XMLHTTP\")},\n    function () {return new ActiveXObject(\"Microsoft.XMLHTTP\")}\n  ];\n\n  function createXMLHTTPObject() {\n    var xmlhttp = false;\n    for (var i = 0, ii = XMLHttpFactories.length; i < ii; i++) {\n      try {\n        xmlhttp = XMLHttpFactories[i]();\n      } catch (error) {\n        continue;\n      }\n      break;\n    }\n    return xmlhttp;\n  }\n\n  function getXHR(uri, async, callback, request) {\n    var request = request || createXMLHTTPObject();\n    if (!request) {\n      throw new Error(\"Error making remote request.\")\n    }\n\n    function onComplete(request) {\n      // Build module constructor.\n      if (request.status == 200) {\n        callback(undefined, request.responseText);\n      } else {\n        callback(true, undefined);\n      }\n    }\n\n    request.open('GET', uri, !!(async));\n    if (async) {\n      request.onreadystatechange = function (event) {\n        if (request.readyState == 4) {\n          onComplete(request);\n        }\n      };\n      request.send(null);\n    } else {\n      request.send(null);\n      onComplete(request);\n    }\n  }\n\n  function getXDR(uri, callback) {\n    var xdr = new XDomainRequest();\n    xdr.open('GET', uri);\n    xdr.error(function () {\n      callback(true, undefined);\n    });\n    xdr.onload(function () {\n      callback(undefined, request.responseText);\n    });\n    xdr.send();\n  }\n\n  function fetchDefineXHR(path, async) {\n    // If cross domain and request doesn't support such requests, go straight\n    // to mirroring.\n\n    var _globalKeyPath = globalKeyPath;\n\n    var callback = function (error, text) {\n      if (error) {\n        define(path, null);\n      } else {\n        if (_globalKeyPath) {\n          compileFunction(text, path)();\n        } else {\n          var definition = compileFunction(\n              'return (function (require, exports, module) {'\n            + text + '\\n'\n            + '})', path)();\n          define(path, definition);\n        }\n      }\n    }\n\n    var uri = URIForModulePath(path);\n    if (_globalKeyPath) {\n      uri += '?callback=' + encodeURIComponent(globalKeyPath + '.define');\n    }\n    if (isSameDomain(uri)) {\n      getXHR(uri, async, callback);\n    } else {\n      var request = createXMLHTTPObject();\n      if (request && request.withCredentials !== undefined) {\n        getXHR(uri, async, callback, request);\n      } else if (async && (typeof XDomainRequest != \"undefined\")) {\n        getXDR(uri, callback);\n      } else {\n        getXHR(mirroredURIForURI(uri), async, callback);\n      }\n    }\n  }\n\n  function fetchDefineJSONP(path) {\n    var head = document.head\n      || document.getElementsByTagName('head')[0]\n      || document.documentElement;\n    var script = document.createElement('script');\n    if (script.async !== undefined) {\n      script.async = \"true\";\n    } else {\n      script.defer = \"true\";\n    }\n    script.type = \"application/javascript\";\n    script.src = URIForModulePath(path)\n      + '?callback=' + encodeURIComponent(globalKeyPath + '.define');\n\n    // Handle failure of JSONP request.\n    if (JSONP_TIMEOUT < Infinity) {\n      var timeoutId = setTimeout(function () {\n        timeoutId = undefined;\n        define(path, null);\n      }, JSONP_TIMEOUT);\n      definitionWaiters[path].unshift(function () {\n        timeoutId === undefined && clearTimeout(timeoutId);\n      });\n    }\n\n    head.insertBefore(script, head.firstChild);\n  }\n\n  /* Modules */\n  function fetchModule(path, continuation) {\n    if (hasOwnProperty(definitionWaiters, path)) {\n      definitionWaiters[path].push(continuation);\n    } else {\n      definitionWaiters[path] = [continuation];\n      schedulefetchDefine(path);\n    }\n  }\n\n  function schedulefetchDefine(path) {\n    fetchRequests.push(path);\n    checkScheduledfetchDefines();\n  }\n\n  function checkScheduledfetchDefines() {\n    if (fetchRequests.length > 0 && currentRequests < maximumRequests) {\n      var fetchRequest = fetchRequests.pop();\n      currentRequests++;\n      definitionWaiters[fetchRequest].unshift(function () {\n        currentRequests--;\n        checkScheduledfetchDefines();\n      });\n      if (globalKeyPath\n        && typeof document !== 'undefined'\n          && document.readyState\n            && /^loaded|complete$/.test(document.readyState)) {\n        fetchDefineJSONP(fetchRequest);\n      } else {\n        fetchDefineXHR(fetchRequest, true);\n      }\n    }\n  }\n\n  function fetchModuleSync(path, continuation) {\n    fetchDefineXHR(path, false);\n    continuation();\n  }\n\n  function moduleIsLoaded(path) {\n    return hasOwnProperty(modules, path);\n  }\n\n  function loadModule(path, continuation) {\n    // If it's a function then it hasn't been exported yet. Run function and\n    //  then replace with exports result.\n    if (!moduleIsLoaded(path)) {\n      if (hasOwnProperty(loadingModules, path)) {\n        throw new CircularDependencyError(\"Encountered circular dependency.\");\n      } else if (!moduleIsDefined(path)) {\n        throw new Error(\"Attempt to load undefined module.\");\n      } else if (definitions[path] === null) {\n        continuation(null);\n      } else {\n        var definition = definitions[path];\n        var _module = {id: path, exports: {}};\n        var _require = requireRelativeTo(path);\n        if (!main) {\n          main = _module;\n        }\n        try {\n          loadingModules[path] = true;\n          definition(_require, _module.exports, _module);\n          modules[path] = _module;\n          delete loadingModules[path];\n          continuation(_module);\n        } finally {\n          delete loadingModules[path];\n        }\n      }\n    } else {\n      var module = modules[path];\n      continuation(module);\n    }\n  }\n\n  function _moduleAtPath(path, fetchFunc, continuation) {\n    // hack fix temporary in for etherpad #2505\n    if(path === \"ep_etherpad-lite/static/js/pad.js\") path = \"ep_etherpad-lite/static/js/pad\";\n    // Making the below change saves on 2 http requests\n    // and also 1 per plugin and nothing seems to b0rk?\n    // This code is run on the client only\n    // var suffixes = ['', '.js', '/index.js'];\n    var suffixes = ['.js', '/index.js'];\n    if (path.charAt(path.length - 1) == '/') {\n      suffixes = ['index.js'];\n    }\n    var i = 0, ii = suffixes.length;\n    var _find = function (i) {\n      if (i < ii) {\n        var path_ = path + suffixes[i];\n        var after = function () {\n          loadModule(path_, function (module) {\n            if (module === null) {\n              _find(i + 1);\n            } else {\n              continuation(module);\n            }\n          });\n        }\n\n        if (!moduleIsDefined(path_)) {\n          fetchFunc(path_, after);\n        } else {\n          after();\n        }\n\n      } else {\n        continuation(null);\n      }\n    };\n    _find(0);\n  }\n\n  function moduleAtPath(path, continuation) {\n    defer(function () {\n      _moduleAtPath(path, fetchModule, continuation);\n    });\n  }\n\n  function moduleAtPathSync(path) {\n    var module;\n    var oldSyncLock = syncLock;\n    syncLock = true;\n\n    // HACK TODO\n    // This is completely the wrong way to do it but for now it shows it works\n    if(path == \"async\"){\n      // console.warn(\"path is async and we're doing a ghetto fix\");\n      path = \"async/lib/async\";\n    }\n\n    // HACK TODO\n    // This is completely the wrong way to do it but for now it shows it works\n    if(path == \"underscore\"){\n      // console.warn(\"path is async and we're doing a ghetto fix\");\n      path = \"underscore/underscore\";\n    }\n\n    // HACK TODO\n    // This is completely the wrong way to do it but for now it shows it works\n    if(path == \"unorm\"){\n      // console.warn(\"path is async and we're doing a ghetto fix\");\n      path = \"unorm/lib/unorm\";\n    }\n\n    try {\n      _moduleAtPath(path, fetchModuleSync, function (_module) {\n        module = _module;\n      });\n    } finally {\n      syncLock = oldSyncLock;\n    }\n    return module;\n  }\n\n  /* Definition */\n  function moduleIsDefined(path) {\n    return hasOwnProperty(definitions, path);\n  }\n\n  function defineModule(path, module) {\n    if (typeof path != 'string'\n      || !((typeof module == 'function') || module === null)) {\n      throw new ArgumentError(\n          \"Definition must be a (string, function) pair.\");\n    }\n\n    if (moduleIsDefined(path)) {\n      // Drop import silently\n    } else {\n      definitions[path] = module;\n    }\n  }\n\n  function defineModules(moduleMap) {\n    if (typeof moduleMap != 'object') {\n      throw new ArgumentError(\"Mapping must be an object.\");\n    }\n    for (var path in moduleMap) {\n      if (hasOwnProperty(moduleMap, path)) {\n        defineModule(path, moduleMap[path]);\n      }\n    }\n  }\n\n  function define(fullyQualifiedPathOrModuleMap, module) {\n    var moduleMap;\n    if (arguments.length == 1) {\n      moduleMap = fullyQualifiedPathOrModuleMap;\n      defineModules(moduleMap);\n    } else if (arguments.length == 2) {\n      var path = fullyQualifiedPathOrModuleMap;\n      defineModule(fullyQualifiedPathOrModuleMap, module);\n      moduleMap = {};\n      moduleMap[path] = module;\n    } else {\n      throw new ArgumentError(\"Expected 1 or 2 arguments, but got \"\n          + arguments.length + \".\");\n    }\n\n    // With all modules installed satisfy those conditions for all waiters.\n    for (var path in moduleMap) {\n      if (hasOwnProperty(moduleMap, path)\n        && hasOwnProperty(definitionWaiters, path)) {\n        defer.apply(this, definitionWaiters[path]);\n        delete definitionWaiters[path];\n      }\n    }\n\n    flushDefer();\n  }\n\n  /* Require */\n  function _designatedRequire(path, continuation) {\n    if (continuation === undefined) {\n      var module = moduleAtPathSync(path);\n      if (!module) {\n        throw new Error(\"The module at \\\"\" + path + \"\\\" does not exist.\");\n      }\n      return module.exports;\n    } else {\n      if (!(typeof continuation == 'function')) {\n        throw new ArgumentError(\"Continuation must be a function.\");\n      }\n\n      flushDeferAfter(function () {\n        moduleAtPath(path, function (module) {\n          continuation(module && module.exports);\n        });\n      });\n    }\n  }\n\n  function designatedRequire(path, continuation) {\n    var designatedRequire =\n        rootRequire._designatedRequire || _designatedRequire;\n    return designatedRequire.apply(this, arguments);\n  }\n\n  function requireRelative(basePath, qualifiedPath, continuation) {\n    qualifiedPath = qualifiedPath.toString();\n    var path = normalizePath(fullyQualifyPath(qualifiedPath, basePath));\n    return designatedRequire(path, continuation);\n  }\n\n  function requireRelativeN(basePath, qualifiedPaths, continuation) {\n    if (!(typeof continuation == 'function')) {\n      throw new ArgumentError(\"Final argument must be a continuation.\");\n    } else {\n      // Copy and validate parameters\n      var _qualifiedPaths = [];\n      for (var i = 0, ii = qualifiedPaths.length; i < ii; i++) {\n        _qualifiedPaths[i] = qualifiedPaths[i].toString();\n      }\n      var results = [];\n      function _require(result) {\n        results.push(result);\n        if (qualifiedPaths.length > 0) {\n          requireRelative(basePath, qualifiedPaths.shift(), _require);\n        } else {\n          continuation.apply(this, results);\n        }\n      }\n      for (var i = 0, ii = qualifiedPaths.length; i < ii; i++) {\n        requireRelative(basePath, _qualifiedPaths[i], _require);\n      }\n    }\n  }\n\n  var requireRelativeTo = function (basePath) {\n    basePath = basePath.replace(/[^\\/]+$/, '');\n    function require(qualifiedPath, continuation) {\n      if (arguments.length > 2) {\n        var qualifiedPaths = Array.prototype.slice.call(arguments, 0, -1);\n        var continuation = arguments[arguments.length-1];\n        return requireRelativeN(basePath, qualifiedPaths, continuation);\n      } else {\n        return requireRelative(basePath, qualifiedPath, continuation);\n      }\n    }\n    require.main = main;\n\n    return require;\n  }\n\n  var rootRequire = requireRelativeTo('/');\n\n  /* Private internals */\n  rootRequire._modules = modules;\n  rootRequire._definitions = definitions;\n  rootRequire._designatedRequire = _designatedRequire;\n  rootRequire._compileFunction = _compileFunction;\n\n  /* Public interface */\n  rootRequire.define = define;\n  rootRequire.setRequestMaximum = setRequestMaximum;\n  rootRequire.setGlobalKeyPath = setGlobalKeyPath;\n  rootRequire.setRootURI = setRootURI;\n  rootRequire.setLibraryURI = setLibraryURI;\n\n  return rootRequire;\n}())\n;\n";
Ace2Editor.EMBEDED["../static/css/iframe_editor.css"] = "html{cursor:text}span{cursor:auto}::selection{background:#acf}::-moz-selection{background:#acf}a{cursor:pointer!important;white-space:pre-wrap}li,ol,ul{padding:0;margin:0}ul,ul.list-bullet1{margin-left:1.5em}ul ul{margin-left:0!important}ul.list-bullet2{margin-left:3em}ul.list-bullet3{margin-left:4.5em}ul.list-bullet4{margin-left:6em}ul.list-bullet5{margin-left:7.5em}ul.list-bullet6{margin-left:9em}ul.list-bullet7{margin-left:10.5em}ul.list-bullet8{margin-left:12em}ul.list-bullet9{margin-left:13.5em}ul.list-bullet10{margin-left:15em}ul.list-bullet11{margin-left:16.5em}ul.list-bullet12{margin-left:18em}ul.list-bullet13{margin-left:19.5em}ul.list-bullet14{margin-left:21em}ul.list-bullet15{margin-left:22.5em}ul,ul.list-bullet1{list-style-type:disc}ul.list-bullet2{list-style-type:circle}ul.list-bullet3{list-style-type:square}ul.list-bullet4{list-style-type:disc}ul.list-bullet5{list-style-type:circle}ul.list-bullet6{list-style-type:square}ul.list-bullet7{list-style-type:disc}ul.list-bullet8{list-style-type:circle}ul.list-bullet9{list-style-type:disc}ul.list-bullet10{list-style-type:circle}ul.list-bullet11{list-style-type:square}ul.list-bullet12{list-style-type:disc}ul.list-bullet13{list-style-type:circle}ul.list-bullet14{list-style-type:square}ul.list-bullet15{list-style-type:disc}ul.list-bullet16{margin-left:24em;list-style-type:circle}ul.list-indent1{margin-left:1.5em}ul.list-indent2{margin-left:3em}ul.list-indent3{margin-left:4.5em}ul.list-indent4{margin-left:6em}ul.list-indent5{margin-left:7.5em}ul.list-indent6{margin-left:9em}ul.list-indent7{margin-left:10.5em}ul.list-indent8{margin-left:12em}ul.list-indent9{margin-left:13.5em}ul.list-indent10{margin-left:15em}ul.list-indent11{margin-left:16.5em}ul.list-indent12{margin-left:18em}ul.list-indent13{margin-left:19.5em}ul.list-indent14{margin-left:21em}ul.list-indent15{margin-left:22.5em}ul.list-indent16{margin-left:24em}body,p{margin:0}ul.list-indent1,ul.list-indent10,ul.list-indent11,ul.list-indent12,ul.list-indent13,ul.list-indent14,ul.list-indent15,ul.list-indent16,ul.list-indent2,ul.list-indent3,ul.list-indent4,ul.list-indent5,ul.list-indent6,ul.list-indent7,ul.list-indent8,ul.list-indent9{list-style-type:none}body{white-space:nowrap;word-wrap:normal}#outerdocbody{background-color:#fff}body.grayedout{background-color:#eee!important}#innerdocbody{font-size:12px;font-family:Arial,sans-serif;line-height:16px;padding:1px 10px 8px 1px;overflow:hidden;background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}.noprewrap{white-space:normal}body.doesWrap:not(.noprewrap)>div{white-space:pre-wrap}#sidediv{font-size:11px;font-family:monospace;line-height:16px;padding-top:8px;padding-right:3px;position:absolute;width:20px;top:0;left:0;cursor:default;color:#fff}#sidedivinner{text-align:right}.sidedivdelayed{background-color:#eee;color:#888!important;border-right:1px solid #ccc}.sidedivhidden{display:none}#outerdocbody iframe{display:block;position:relative;left:32px;top:7px;border:0;width:1px;height:1px}#outerdocbody .hotrect{border:1px solid #999;position:absolute}body.mozilla,body.safari{display:table-cell}body.doesWrap{word-wrap:break-word;display:block!important}.safari div{padding-right:1px}#linemetricsdiv{position:absolute;left:-1000px;top:-1000px;color:#fff;z-index:-1;font-size:12px;font-family:monospace}ol{list-style-type:decimal}ol>li{display:block}ol.list-number1{text-indent:0}ol.list-number2{text-indent:10px}ol.list-number3{text-indent:20px}ol.list-number4{text-indent:30px}ol.list-number5{text-indent:40px}ol.list-number6{text-indent:50px}ol.list-number7{text-indent:60px}ol.list-number8{text-indent:70px}ol.list-number9{text-indent:80px}ol.list-number10{text-indent:90px}ol.list-number11{text-indent:100px}ol.list-number12{text-indent:110px}ol.list-number13{text-indent:120px}ol.list-number14{text-indent:130px}ol.list-number15{text-indent:140px}ol.list-number16{text-indent:150px}.list-start-number1{counter-reset:first second}.list-start-number2{counter-reset:second}.list-start-number3{counter-reset:third}.list-start-number4{counter-reset:fourth}.list-start-number5{counter-reset:fifth}.list-start-number6{counter-reset:sixth}.list-start-number7{counter-reset:seventh}.list-start-number8{counter-reset:eighth}.list-start-number9{counter-reset:ninth}.list-start-number10{counter-reset:tenth}.list-start-number11{counter-reset:eleventh}.list-start-number12{counter-reset:twelth}.list-start-number13{counter-reset:thirteenth}.list-start-number14{counter-reset:fourteenth}.list-start-number15{counter-reset:fifteenth}.list-start-number16{counter-reset:sixteenth}.list-number1 li:before{content:counter(first)\". \";counter-increment:first}.list-number2 li:before{content:counter(first)\".\" counter(second)\". \";counter-increment:second}.list-number3 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\". \";counter-increment:third 1}.list-number4 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\". \";counter-increment:fourth 1}.list-number5 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\". \";counter-increment:fifth 1}.list-number6 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\". \";counter-increment:sixth 1}.list-number7 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\". \";counter-increment:seventh 1}.list-number8 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\". \";counter-increment:eighth 1}.list-number9 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\". \";counter-increment:ninth 1}.list-number10 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\". \";counter-increment:tenth 1}.list-number11 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\". \";counter-increment:eleventh 1}.list-number12 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\". \";counter-increment:twelth 1}.list-number13 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\".\" counter(thirteenth)\". \";counter-increment:thirteenth 1}.list-number14 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\".\" counter(thirteenth)\".\" counter(fourteenth)\". \";counter-increment:fourteenth 1}.list-number15 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\".\" counter(thirteenth)\".\" counter(fourteenth)\".\" counter(fifteenth)\". \";counter-increment:fifteenth 1}.list-number16 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\".\" counter(thirteenth)\".\" counter(fourteenth)\".\" counter(fifteenth)\".\" counter(sixteenth)\". \";counter-increment:fixteenth 1}";
Ace2Editor.EMBEDED["../static/custom/pad.css"] = "";
Ace2Editor.EMBEDED["../static/css/pad.css"] = ".toolbar ul,iframe{position:absolute}#myusernameform .editactive,#myusernameform .editempty,.usertdname input.editactive,.usertdname input.editempty{background:#fff;border-top:1px solid #c3c3c3;border-left:1px solid #c3c3c3;border-bottom:1px solid #e6e6e6;border-right:1px solid #e6e6e6}#chatcounter,#chatlabel,#otheruserstable td,.buttonicon{vertical-align:middle}#chaticon a,#chatlabel,#titlecross,#titlesticky,.exporttype,.popup a,.toolbar ul li a{text-decoration:none}#chatlabel,#nootherusers,#titlebar,.throbbold{font-weight:700}*,body,html,p{margin:0;padding:0}.clear{clear:both}html{font-size:62.5%;width:100%}body,textarea{font-family:Helvetica,Arial,sans-serif}.readonly .acl-write{display:none}#users{background:-webkit-linear-gradient(#F7F7F7,#EEE);background:-moz-linear-gradient(#F7F7F7,#EEE);background:-ms-linear-gradient(#F7F7F7,#EEE);background:-o-linear-gradient(#F7F7F7,#EEE);background:linear-gradient(#F7F7F7,#EEE);width:160px;color:#fff;padding:5px;border-radius:0 0 6px 6px;border:1px solid #ccc}#users,.toolbar{background:#f7f7f7}#otherusers{max-height:400px;overflow:auto}a img{border:0}.toolbar{background:-webkit-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-moz-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-o-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-ms-linear-gradient(#f7f7f7,#f1f1f1 80%);background:linear-gradient(#f7f7f7,#f1f1f1 80%);border-bottom:1px solid #ccc;overflow:hidden;padding-top:4px;width:100%;white-space:nowrap;height:32px}.toolbar ul{list-style:none;padding-right:3px;padding-left:1px;z-index:2;overflow:hidden;float:left}.toolbar ul li{float:left;margin-left:2px;height:32px}.toolbar ul li.separator{border:inherit;background:inherit;visibility:hidden;width:0;padding:5px;height:22px}.toolbar ul li a:hover{text-decoration:none;background:#fff;background:-webkit-linear-gradient(#f4f4f4,#e4e4e4);background:-moz-linear-gradient(#f4f4f4,#e4e4e4);background:-o-linear-gradient(#f4f4f4,#e4e4e4);background:-ms-linear-gradient(#f4f4f4,#e4e4e4);background:linear-gradient(#f4f4f4,#e4e4e4)}.toolbar ul li .activeButton,.toolbar ul li a:active{background:#eee;background:-webkit-linear-gradient(#ddd,#fff);background:-moz-linear-gradient(#ddd,#fff);background:-o-linear-gradient(#ddd,#fff);background:-ms-linear-gradient(#ddd,#fff);background:linear-gradient(#ddd,#fff);-webkit-box-shadow:0 0 8px rgba(0,0,0,.1)inset;-moz-box-shadow:0 0 8px rgba(0,0,0,.1)inset;box-shadow:0 0 8px rgba(0,0,0,.1)inset}.toolbar ul li a{background:#fff;background:-webkit-linear-gradient(#fff,#f0f0f0);background:-moz-linear-gradient(#fff,#f0f0f0);background:-o-linear-gradient(#fff,#f0f0f0);background:-ms-linear-gradient(#fff,#f0f0f0);background:linear-gradient(#fff,#f0f0f0);border:1px solid #ccc;border-radius:3px;color:#ccc;cursor:pointer;display:inline-block;min-height:18px;overflow:hidden;padding:4px 5px;text-align:center;min-width:18px}#connectivity *,#editbar,#mystatusedit,table#otheruserstable{display:none}.toolbar ul li a .buttonicon{position:relative;top:1px}.toolbar ul li a .buttontext{font-size:14px;border:none;background:0 0;margin-top:1px;color:#666}.buttontext::-moz-focus-inner{padding:0;border:0}.buttontext:focus{border:1px solid #666!important}.toolbar ul li a.grouped-left{border-radius:3px 0 0 3px}.toolbar ul li a.grouped-middle{border-radius:0;margin-left:-2px;border-left:0}.toolbar ul li a.grouped-right{border-radius:0 3px 3px 0;margin-left:-2px;border-left:0}.toolbar ul li a.selected{background:#eee!important;background:-webkit-linear-gradient(#EEE,#F0F0F0)!important;background:-moz-linear-gradient(#EEE,#F0F0F0)!important;background:-o-linear-gradient(#EEE,#F0F0F0)!important;background:-ms-linear-gradient(#EEE,#F0F0F0)!important;background:linear-gradient(#EEE,#F0F0F0)!important}.toolbar ul li select{background:#fff;padding:4px;line-height:22px;height:28px;border-radius:3px;border:1px solid #ccc;outline:0}.toolbar ul.menu_left{left:0;right:250px}.toolbar ul.menu_right{right:0}li[data-key=showusers]>a{min-width:30px;text-align:left}li[data-key=showusers]>a #online_count{color:#777;font-size:11px;position:relative;top:2px;padding-left:2px}#chatbox,#chatinputbox,#chattext,#editorcontainer,#editorcontainerbox,#editorloadingbox,#mycolorpicker,#mycolorpickercancel,#mycolorpickerpreview,#mycolorpickersave,#padeditor,#padmain,#padpage,.toolbar #overlay{position:absolute}#editorcontainer{top:37px;left:0;right:0;bottom:0;z-index:1}#editorcontainer iframe{height:100%;width:100%;padding:0;margin:0;left:0}#editorloadingbox{padding-top:100px;padding-bottom:100px;font-size:2.5em;color:#aaa;text-align:center;width:100%;height:30px;z-index:100}#editorloadingbox .passForm,#editorloadingbox button,#editorloadingbox input{padding:10px}.loadingAnimation{-webkit-animation:loadingAnimation 2s infinite linear;animation:loadingAnimation 2s infinite linear;font-family:fontawesome-etherpad;font-size:24px;z-index:150;width:25px;height:25px}.loadingAnimation:before{content:\"\\e80e\"}@-webkit-keyframes loadingAnimation{0%{-webkit-transform:rotate(0);transform:rotate(0)}100%{-webkit-transform:rotate(359deg);transform:rotate(359deg)}}@keyframes loadingAnimation{0%{-webkit-transform:rotate(0);transform:rotate(0)}100%{-webkit-transform:rotate(359deg);transform:rotate(359deg)}}#editorcontainerbox{bottom:0;top:0;width:100%}#padpage{top:0;bottom:0;width:100%}#padmain{margin-top:0;top:63px!important;left:0;right:0;bottom:0;zoom:1}#padeditor{bottom:0;left:0;right:0;top:0;zoom:1}#myswatchbox{position:absolute;left:5px;top:5px;width:24px;height:24px;background:0 0;cursor:pointer}#myswatch{width:100%;height:100%;background:0 0}#mycolorpicker{width:232px;height:265px;left:-250px;top:0;z-index:101;display:none;border-radius:0 0 6px 6px;background:#f7f7f7;border:1px solid #ccc;border-top:0;padding-left:10px;padding-top:10px}#mycolorpickersave{left:10px;font-weight:700}#mycolorpickercancel{left:85px}#mycolorpickercancel,#mycolorpickersave{background:#fff;background:-webkit-linear-gradient(#fff,#ccc);background:-moz-linear-gradient(#fff,#ccc);background:-o-linear-gradient(#fff,#ccc);background:-ms-linear-gradient(#fff,#ccc);background:linear-gradient(#fff,#ccc);border:1px solid #ccc;-webkit-border-radius:4px;-moz-border-radius:4px;border-radius:4px;font-size:12px;cursor:pointer;color:#000;overflow:hidden;padding:4px;top:240px;text-align:center;width:60px}#titlecross,#titlesticky{color:#555;text-align:right}#chatbox,#chaticon{border-top-right-radius:5px;border-top-left-radius:5px}#mycolorpickerpreview{left:207px;top:240px;width:16px;height:16px;padding:4px;overflow:hidden;color:#fff;-webkit-border-radius:5px;-moz-border-radius:5px;border-radius:5px}#myusernameform{margin-left:30px}#myusernameedit{font-size:1.3em;padding:3px;height:18px;margin:0;width:122px;background:0 0}#myusernameform input.editable{border:1px solid #444}#myuser .myusernameedithoverable:hover{background:#fff;color:#000}#mystatusform{margin-left:35px;margin-top:5px}#mystatusedit{font-size:1.2em;color:#777;font-style:italic;padding:2px;height:14px;margin:0;border:1px solid #bbb;width:199px;background:0 0}#myusernameform .editactive,#myusernameform .editempty{color:#000}#myusernameform .editempty{color:#333}#myswatchbox,#myusernameedit,#otheruserstable .swatch{border:1px solid #ccc!important;color:#333}#nootherusers{padding:10px;font-size:1.2em;color:#eee}#nootherusers a{color:#3C88FF}#otheruserstable td{height:26px;padding:0 2px;color:#333}#otheruserstable .swatch{border:1px solid #000;width:13px;height:13px;overflow:hidden;margin:0 4px;-webkit-touch-callout:none;-webkit-user-select:none;-khtml-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.usertdswatch{width:1%}.usertdname{font-size:1.3em;color:#444}.usertdstatus{font-size:1.1em;font-style:italic;color:#999}.usertdactivity{font-size:1.1em;color:#777}.usertdname input{border:1px solid #bbb;width:80px;padding:2px}#chatbox,#chaticon{border-right:1px solid #999;border-top:1px solid #999;border-left:1px solid #999}.usertdname input.editempty{color:#888;font-style:italic}#connectivity{z-index:600!important}#connectivity .visible,#connectivity .visible *{display:block}#reconnect_form button{font-size:12pt;padding:5px}.toolbar #overlay{z-index:500;display:none;background-repeat:repeat-both;width:100%;height:inherit;left:0;top:0}* html #overlay,.exporttype{background-repeat:no-repeat}* html #overlay{-ms-filter:\"progid:DXImageTransform.Microsoft.Alpha(Opacity=100)\";filter:alpha(opacity=100);opacity:1;background-image:none}#chatbox{bottom:0;right:20px;width:180px;height:200px;z-index:400;background-color:#f7f7f7;padding:3px 3px 10px;display:none}#chaticon,#chattext{background-color:#fff}#chattext{border:1px solid #fff;-ms-overflow-y:scroll;overflow-y:scroll;font-size:12px;right:0;left:0;top:25px;bottom:25px;z-index:1002}#chattext p{padding:3px;-ms-overflow-x:hidden;overflow-x:hidden;word-wrap:break-word}.chatloadmessages{margin:5px auto;display:block}#chatloadmessagesbutton{line-height:1.8em}#chatloadmessagesball{display:none}#chatinputbox{padding:3px 2px;bottom:0;right:0;left:3px}#chatlabel{font-size:13px;color:#555;margin-right:3px}#chatinput{border:1px solid #BBB;width:100%;float:right}#chaticon{z-index:400;position:fixed;bottom:0;right:20px;padding:5px;cursor:pointer}.chatAndUsers,.chatAndUsersChat,.stickyChat{border-left:1px solid #ccc!important}#chatcounter{color:#777;font-size:10px}#titlebar{line-height:16px;color:#555;position:relative;bottom:2px}#titlelabel{font-size:13px;margin:4px 0 0 4px;position:absolute}#titlesticky{font-size:10px;padding-top:2px;float:right;cursor:pointer}#titlecross{font-size:25px;float:right;cursor:pointer}.time{float:right;color:#333;font-style:italic;font-size:10px;margin-left:3px;margin-right:3px;margin-top:2px}#exportColumn{margin-top:20px}.exporttype{margin-top:4px;color:#333;padding-bottom:2px;display:inline;padding-left:5px;font-family:Arial}.buttonicon,.exportlink{font-family:fontawesome-etherpad}.exportlink{display:block;margin:5px;color:#666}#chatthrob,#importmessageabiword,#importmessagesuccess,#importstatusball{display:none}#exporthtmla:before{content:\"\\e826\"}#exportplaina:before{content:\"\\e802\"}#exportworda:before{content:\"\\e804\"}#exportpdfa:before{content:\"\\e803\"}#exportetherpada:before{content:\"\\e806\"}#exportopena:before{content:\"\\e805\"}#importmessageabiword{color:#900;font-size:small}#importsubmitinput{margin-top:12px;padding:2px 4px}#chatthrob{position:absolute;bottom:40px;font-size:14px;width:150px;height:40px;right:20px;z-index:200;color:#fff;background-color:#000;background-color:rgba(0,0,0,.7);padding:10px;-webkit-border-radius:6px;-moz-border-radius:6px;border-radius:6px;-ms-filter:\"progid:DXImageTransform.Microsoft.Alpha(Opacity=80)\";filter:alpha(opacity=80);opacity:.8}.buttonicon{width:16px;height:16px;display:inline-block;border:none;padding:0;background:0 0;font-size:15px;font-style:normal;font-weight:400;color:#666;cursor:pointer}[class*=\" icon-\"]:before,[class^=icon-]:before,[data-icon]:before{font-weight:400!important;font-family:fontawesome-etherpad!important;line-height:1;font-style:normal!important}.buttonicon::-moz-focus-inner{padding:0;border:0}.buttonicon:focus{border:1px solid #666}.popup,.popup select{border:1px solid #ccc}.buttonicon-bold:before{content:\"\\e81c\"}.buttonicon-italic:before{content:\"\\e81d\"}.buttonicon-underline:before{content:\"\\e817\"}.buttonicon-strikethrough:before{content:\"\\e818\"}.buttonicon-insertorderedlist:before{content:\"\\e816\"}.buttonicon-insertunorderedlist:before{content:\"\\e815\"}.buttonicon-indent:before{content:\"\\e814\"}.buttonicon-outdent:before{content:\"\\e813\"}.buttonicon-undo:before{content:\"\\e823\"}.buttonicon-redo:before{content:\"\\e824\"}.buttonicon-clearauthorship:before{content:\"\\e80d\"}.buttonicon-settings:before{content:\"\\e833\"}.buttonicon-import_export:before{content:\"\\e834\"}.buttonicon-embed:before{content:\"\\e827\"}.buttonicon-history:before{content:\"\\e837\"}.buttonicon-chat:before{content:\"\\e829\"}.buttonicon-showusers:before{content:\"\\e808\"}.buttonicon-savedRevision:before{content:\"\\e835\"}#focusprotector{z-index:100;position:absolute;bottom:0;top:0;left:0;right:0;background-color:#fff;-ms-filter:\"progid:DXImageTransform.Microsoft.Alpha(Opacity=1)\";filter:alpha(opacity=1);opacity:.01;display:none}.rtl{direction:RTL}input[type=checkbox]{vertical-align:-1px}.right{float:right}.popup{font-size:12px;width:80%;max-width:500px;padding:10px;border-radius:0 0 6px 6px;border-top:none;background:#f7f7f7;background:-webkit-linear-gradient(#F7F7F7,#EEE);background:-moz-linear-gradient(#F7F7F7,#EEE);background:-ms-linear-gradient(#F7F7F7,#EEE);background:-o-linear-gradient(#F7F7F7,#EEE);background:linear-gradient(#F7F7F7,#EEE);-webkit-box-shadow:0 0 8px #888;-moz-box-shadow:0 0 8px #888;box-shadow:0 2px 4px #ddd;color:#222}.popup input[type=text]{width:100%;padding:5px;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;-ms-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:10px}#users input[type=text],.popup input[type=text]{outline:0}.popup button{padding:5px;font-size:14px}.popup h1{color:#555;font-size:18px}.popup h2{color:#777;font-size:15px}.popup p{margin:5px 0}.popup select{background:#fff;padding:2px;height:24px;border-radius:3px;outline:0;width:120px}.chatAndUsers,.chatAndUsersChat,.stickyChat{border:none!important}.chatAndUsers,.stickyChat{border-radius:0!important}.column{float:left;width:50%}#connectivity,#embed,#import_export,#settings,#users{position:absolute;top:38px;right:20px;display:none;z-index:500}.chatAndUsers,.chatAndUsersChat{width:182px!important;right:0!important}.stickyChat{background-color:#f1f1f1!important;right:0!important;top:37px;-webkit-border-radius:0!important;-moz-border-radius:0!important;height:auto!important;width:185px!important}.chatAndUsers{display:block!important;border-bottom:1px solid #ccc!important;height:155px!important}#noCookie,#passwordRequired,#permissionDenied,#wrongPassword,.chatAndUsersChat>div>#titlecross{display:none}.chatAndUsers>#otherusers{max-height:100px;overflow-y:auto}.chatAndUsersChat{bottom:0!important;margin:165px 0 0;padding:5px!important}@media screen and (max-width:600px){.toolbar ul li.separator{display:none}.toolbar ul li a{padding:4px 1px}.toolbar ul.menu_left{left:0;right:150px}}@media all and (max-width:400px){#gritter-notice-wrapper{max-height:172px;overflow:hidden;width:100%!important;background-color:#ccc;bottom:20px;left:0;right:0;color:#000}.gritter-close{display:block!important;left:auto!important;right:5px}#gritter-notice-wrapper.bottom-right{left:0!important;bottom:30px!important;right:0!important}.gritter-item p{color:#000;font-size:16px}.gritter-title{text-shadow:none!important;color:#000}.gritter-item{padding:2px 11px 8px 4px}.gritter-item-wrapper{margin:0}.gritter-item-wrapper>div{background:0 0}#editorcontainer{top:68px}#editbar{height:62px}.toolbar ul.menu_left{left:0;right:100px}.toolbar ul.menu_right{right:0}.popup{width:100%;max-width:300px;top:72px!important}}@media only screen and (min-device-width:320px)and (max-device-width:720px){#users{top:auto;right:0!important;bottom:33px;border-radius:0!important;height:55px!important;overflow:auto}#mycolorpicker{left:-73px;top:auto!important;bottom:33px!important}#editorcontainer{margin-bottom:33px}.toolbar ul.menu_left{right:0}.toolbar ul.menu_right{background:#f7f7f7;background:-webkit-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-moz-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-o-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-ms-linear-gradient(#f7f7f7,#f1f1f1 80%);background:linear-gradient(#f7f7f7,#f1f1f1 80%);width:100%;right:0!important;overflow:hidden;height:32px;position:fixed;bottom:0;border-top:1px solid #ccc}.toolbar ul.menu_right>li:last-child{float:right}.toolbar ul.menu_right>li a{border-radius:0;border:none;background:0 0;margin:0;padding:8px}.toolbar ul li a.selected{background:0 0!important}li[data-key=showusers]>a{margin-top:-10px;padding-top:2px!important;line-height:20px;vertical-align:top!important}#chaticon{position:absolute;right:48px}.popup{-webkit-border-radius:0;-moz-border-radius:0;border-radius:0;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;-ms-box-sizing:border-box;box-sizing:border-box;width:100%}#connectivity,#embed,#import_export,#settings{top:auto;left:0;bottom:33px;right:0}.toolbar ul li .separator{display:none}#online_count{line-height:24px}#chatbox{position:absolute;bottom:33px!important;margin:65px 0 0}#gritter-notice-wrapper{bottom:43px!important;right:10px!important}}#gritter-notice-wrapper{position:fixed;top:20px;right:20px;width:301px;z-index:9999;background-color:#666}#gritter-notice-wrapper.bottom-right{top:auto;left:auto;bottom:20px;right:20px}.gritter-item-wrapper{position:relative;margin:0 0 10px}.gritter-top{height:10px}.hover .gritter-top{background-position:right -30px}.gritter-bottom{height:8px;margin:0}.hover .gritter-bottom{background-position:bottom right}.gritter-item{display:block;color:#eee;padding:2px 11px 8px;font-size:11px;font-family:verdana}.hover .gritter-item{background-position:right -40px}.gritter-item p{padding:0;margin:0}.gritter-close{display:none;position:absolute;top:5px;left:3px;cursor:pointer;width:30px;height:30px}.gritter-title{font-size:14px;font-weight:700;padding:0 0 7px;display:block;text-shadow:1px 1px 0 #000}.gritter-image{width:48px;height:48px;float:left}.gritter-with-image,.gritter-without-image{padding:0 0 5px}.gritter-with-image{width:220px;float:right}.gritter-close,.gritter-light .gritter-bottom,.gritter-light .gritter-item,.gritter-light .gritter-top{color:#222}.gritter-light .gritter-title{text-shadow:none}@font-face{font-family:opendyslexic;src:url(../../static/font/opendyslexic.otf)format(\"opentype\")}@font-face{font-family:fontawesome-etherpad;src:url(../font/fontawesome-etherpad.eot);src:url(../font/fontawesome-etherpad.eot?#iefix)format(\"embedded-opentype\"),url(../font/fontawesome-etherpad.woff)format(\"woff\"),url(../font/fontawesome-etherpad.ttf)format(\"truetype\"),url(../font/fontawesome-etherpad.svg#fontawesome-etherpad)format(\"svg\");font-weight:400;font-style:normal}[data-icon]:before{content:attr(data-icon);font-variant:normal!important;text-transform:none!important;speak:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}[class*=\" icon-\"]:before,[class^=icon-]:before{font-variant:normal!important;text-transform:none!important;speak:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.hideControlsEditor{top:0!important}.hideControlsEditbar{display:none!important}";
Ace2Editor.EMBEDED["../static/css/iframe_editor.css"] = "html{cursor:text}span{cursor:auto}::selection{background:#acf}::-moz-selection{background:#acf}a{cursor:pointer!important;white-space:pre-wrap}li,ol,ul{padding:0;margin:0}ul,ul.list-bullet1{margin-left:1.5em}ul ul{margin-left:0!important}ul.list-bullet2{margin-left:3em}ul.list-bullet3{margin-left:4.5em}ul.list-bullet4{margin-left:6em}ul.list-bullet5{margin-left:7.5em}ul.list-bullet6{margin-left:9em}ul.list-bullet7{margin-left:10.5em}ul.list-bullet8{margin-left:12em}ul.list-bullet9{margin-left:13.5em}ul.list-bullet10{margin-left:15em}ul.list-bullet11{margin-left:16.5em}ul.list-bullet12{margin-left:18em}ul.list-bullet13{margin-left:19.5em}ul.list-bullet14{margin-left:21em}ul.list-bullet15{margin-left:22.5em}ul,ul.list-bullet1{list-style-type:disc}ul.list-bullet2{list-style-type:circle}ul.list-bullet3{list-style-type:square}ul.list-bullet4{list-style-type:disc}ul.list-bullet5{list-style-type:circle}ul.list-bullet6{list-style-type:square}ul.list-bullet7{list-style-type:disc}ul.list-bullet8{list-style-type:circle}ul.list-bullet9{list-style-type:disc}ul.list-bullet10{list-style-type:circle}ul.list-bullet11{list-style-type:square}ul.list-bullet12{list-style-type:disc}ul.list-bullet13{list-style-type:circle}ul.list-bullet14{list-style-type:square}ul.list-bullet15{list-style-type:disc}ul.list-bullet16{margin-left:24em;list-style-type:circle}ul.list-indent1{margin-left:1.5em}ul.list-indent2{margin-left:3em}ul.list-indent3{margin-left:4.5em}ul.list-indent4{margin-left:6em}ul.list-indent5{margin-left:7.5em}ul.list-indent6{margin-left:9em}ul.list-indent7{margin-left:10.5em}ul.list-indent8{margin-left:12em}ul.list-indent9{margin-left:13.5em}ul.list-indent10{margin-left:15em}ul.list-indent11{margin-left:16.5em}ul.list-indent12{margin-left:18em}ul.list-indent13{margin-left:19.5em}ul.list-indent14{margin-left:21em}ul.list-indent15{margin-left:22.5em}ul.list-indent16{margin-left:24em}body,p{margin:0}ul.list-indent1,ul.list-indent10,ul.list-indent11,ul.list-indent12,ul.list-indent13,ul.list-indent14,ul.list-indent15,ul.list-indent16,ul.list-indent2,ul.list-indent3,ul.list-indent4,ul.list-indent5,ul.list-indent6,ul.list-indent7,ul.list-indent8,ul.list-indent9{list-style-type:none}body{white-space:nowrap;word-wrap:normal}#outerdocbody{background-color:#fff}body.grayedout{background-color:#eee!important}#innerdocbody{font-size:12px;font-family:Arial,sans-serif;line-height:16px;padding:1px 10px 8px 1px;overflow:hidden;background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}.noprewrap{white-space:normal}body.doesWrap:not(.noprewrap)>div{white-space:pre-wrap}#sidediv{font-size:11px;font-family:monospace;line-height:16px;padding-top:8px;padding-right:3px;position:absolute;width:20px;top:0;left:0;cursor:default;color:#fff}#sidedivinner{text-align:right}.sidedivdelayed{background-color:#eee;color:#888!important;border-right:1px solid #ccc}.sidedivhidden{display:none}#outerdocbody iframe{display:block;position:relative;left:32px;top:7px;border:0;width:1px;height:1px}#outerdocbody .hotrect{border:1px solid #999;position:absolute}body.mozilla,body.safari{display:table-cell}body.doesWrap{word-wrap:break-word;display:block!important}.safari div{padding-right:1px}#linemetricsdiv{position:absolute;left:-1000px;top:-1000px;color:#fff;z-index:-1;font-size:12px;font-family:monospace}ol{list-style-type:decimal}ol>li{display:block}ol.list-number1{text-indent:0}ol.list-number2{text-indent:10px}ol.list-number3{text-indent:20px}ol.list-number4{text-indent:30px}ol.list-number5{text-indent:40px}ol.list-number6{text-indent:50px}ol.list-number7{text-indent:60px}ol.list-number8{text-indent:70px}ol.list-number9{text-indent:80px}ol.list-number10{text-indent:90px}ol.list-number11{text-indent:100px}ol.list-number12{text-indent:110px}ol.list-number13{text-indent:120px}ol.list-number14{text-indent:130px}ol.list-number15{text-indent:140px}ol.list-number16{text-indent:150px}.list-start-number1{counter-reset:first second}.list-start-number2{counter-reset:second}.list-start-number3{counter-reset:third}.list-start-number4{counter-reset:fourth}.list-start-number5{counter-reset:fifth}.list-start-number6{counter-reset:sixth}.list-start-number7{counter-reset:seventh}.list-start-number8{counter-reset:eighth}.list-start-number9{counter-reset:ninth}.list-start-number10{counter-reset:tenth}.list-start-number11{counter-reset:eleventh}.list-start-number12{counter-reset:twelth}.list-start-number13{counter-reset:thirteenth}.list-start-number14{counter-reset:fourteenth}.list-start-number15{counter-reset:fifteenth}.list-start-number16{counter-reset:sixteenth}.list-number1 li:before{content:counter(first)\". \";counter-increment:first}.list-number2 li:before{content:counter(first)\".\" counter(second)\". \";counter-increment:second}.list-number3 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\". \";counter-increment:third 1}.list-number4 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\". \";counter-increment:fourth 1}.list-number5 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\". \";counter-increment:fifth 1}.list-number6 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\". \";counter-increment:sixth 1}.list-number7 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\". \";counter-increment:seventh 1}.list-number8 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\". \";counter-increment:eighth 1}.list-number9 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\". \";counter-increment:ninth 1}.list-number10 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\". \";counter-increment:tenth 1}.list-number11 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\". \";counter-increment:eleventh 1}.list-number12 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\". \";counter-increment:twelth 1}.list-number13 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(seventh)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\".\" counter(thirteenth)\". \";counter-increment:thirteenth 1}.list-number14 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\".\" counter(thirteenth)\".\" counter(fourteenth)\". \";counter-increment:fourteenth 1}.list-number15 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\".\" counter(thirteenth)\".\" counter(fourteenth)\".\" counter(fifteenth)\". \";counter-increment:fifteenth 1}.list-number16 li:before{content:counter(first)\".\" counter(second)\".\" counter(third)\".\" counter(fourth)\".\" counter(fifth)\".\" counter(sixth)\".\" counter(eighth)\".\" counter(ninth)\".\" counter(tenth)\".\" counter(eleventh)\".\" counter(twelth)\".\" counter(thirteenth)\".\" counter(fourteenth)\".\" counter(fifteenth)\".\" counter(sixteenth)\". \";counter-increment:fixteenth 1}";
Ace2Editor.EMBEDED["../static/custom/pad.css"] = "";
Ace2Editor.EMBEDED["../static/css/pad.css"] = ".toolbar ul,iframe{position:absolute}#myusernameform .editactive,#myusernameform .editempty,.usertdname input.editactive,.usertdname input.editempty{background:#fff;border-top:1px solid #c3c3c3;border-left:1px solid #c3c3c3;border-bottom:1px solid #e6e6e6;border-right:1px solid #e6e6e6}#chatcounter,#chatlabel,#otheruserstable td,.buttonicon{vertical-align:middle}#chaticon a,#chatlabel,#titlecross,#titlesticky,.exporttype,.popup a,.toolbar ul li a{text-decoration:none}#chatlabel,#nootherusers,#titlebar,.throbbold{font-weight:700}*,body,html,p{margin:0;padding:0}.clear{clear:both}html{font-size:62.5%;width:100%}body,textarea{font-family:Helvetica,Arial,sans-serif}.readonly .acl-write{display:none}#users{background:-webkit-linear-gradient(#F7F7F7,#EEE);background:-moz-linear-gradient(#F7F7F7,#EEE);background:-ms-linear-gradient(#F7F7F7,#EEE);background:-o-linear-gradient(#F7F7F7,#EEE);background:linear-gradient(#F7F7F7,#EEE);width:160px;color:#fff;padding:5px;border-radius:0 0 6px 6px;border:1px solid #ccc}#users,.toolbar{background:#f7f7f7}#otherusers{max-height:400px;overflow:auto}a img{border:0}.toolbar{background:-webkit-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-moz-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-o-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-ms-linear-gradient(#f7f7f7,#f1f1f1 80%);background:linear-gradient(#f7f7f7,#f1f1f1 80%);border-bottom:1px solid #ccc;overflow:hidden;padding-top:4px;width:100%;white-space:nowrap;height:32px}.toolbar ul{list-style:none;padding-right:3px;padding-left:1px;z-index:2;overflow:hidden;float:left}.toolbar ul li{float:left;margin-left:2px;height:32px}.toolbar ul li.separator{border:inherit;background:inherit;visibility:hidden;width:0;padding:5px;height:22px}.toolbar ul li a:hover{text-decoration:none;background:#fff;background:-webkit-linear-gradient(#f4f4f4,#e4e4e4);background:-moz-linear-gradient(#f4f4f4,#e4e4e4);background:-o-linear-gradient(#f4f4f4,#e4e4e4);background:-ms-linear-gradient(#f4f4f4,#e4e4e4);background:linear-gradient(#f4f4f4,#e4e4e4)}.toolbar ul li .activeButton,.toolbar ul li a:active{background:#eee;background:-webkit-linear-gradient(#ddd,#fff);background:-moz-linear-gradient(#ddd,#fff);background:-o-linear-gradient(#ddd,#fff);background:-ms-linear-gradient(#ddd,#fff);background:linear-gradient(#ddd,#fff);-webkit-box-shadow:0 0 8px rgba(0,0,0,.1)inset;-moz-box-shadow:0 0 8px rgba(0,0,0,.1)inset;box-shadow:0 0 8px rgba(0,0,0,.1)inset}.toolbar ul li a{background:#fff;background:-webkit-linear-gradient(#fff,#f0f0f0);background:-moz-linear-gradient(#fff,#f0f0f0);background:-o-linear-gradient(#fff,#f0f0f0);background:-ms-linear-gradient(#fff,#f0f0f0);background:linear-gradient(#fff,#f0f0f0);border:1px solid #ccc;border-radius:3px;color:#ccc;cursor:pointer;display:inline-block;min-height:18px;overflow:hidden;padding:4px 5px;text-align:center;min-width:18px}#connectivity *,#editbar,#mystatusedit,table#otheruserstable{display:none}.toolbar ul li a .buttonicon{position:relative;top:1px}.toolbar ul li a .buttontext{font-size:14px;border:none;background:0 0;margin-top:1px;color:#666}.buttontext::-moz-focus-inner{padding:0;border:0}.buttontext:focus{border:1px solid #666!important}.toolbar ul li a.grouped-left{border-radius:3px 0 0 3px}.toolbar ul li a.grouped-middle{border-radius:0;margin-left:-2px;border-left:0}.toolbar ul li a.grouped-right{border-radius:0 3px 3px 0;margin-left:-2px;border-left:0}.toolbar ul li a.selected{background:#eee!important;background:-webkit-linear-gradient(#EEE,#F0F0F0)!important;background:-moz-linear-gradient(#EEE,#F0F0F0)!important;background:-o-linear-gradient(#EEE,#F0F0F0)!important;background:-ms-linear-gradient(#EEE,#F0F0F0)!important;background:linear-gradient(#EEE,#F0F0F0)!important}.toolbar ul li select{background:#fff;padding:4px;line-height:22px;height:28px;border-radius:3px;border:1px solid #ccc;outline:0}.toolbar ul.menu_left{left:0;right:250px}.toolbar ul.menu_right{right:0}li[data-key=showusers]>a{min-width:30px;text-align:left}li[data-key=showusers]>a #online_count{color:#777;font-size:11px;position:relative;top:2px;padding-left:2px}#chatbox,#chatinputbox,#chattext,#editorcontainer,#editorcontainerbox,#editorloadingbox,#mycolorpicker,#mycolorpickercancel,#mycolorpickerpreview,#mycolorpickersave,#padeditor,#padmain,#padpage,.toolbar #overlay{position:absolute}#editorcontainer{top:37px;left:0;right:0;bottom:0;z-index:1}#editorcontainer iframe{height:100%;width:100%;padding:0;margin:0;left:0}#editorloadingbox{padding-top:100px;padding-bottom:100px;font-size:2.5em;color:#aaa;text-align:center;width:100%;height:30px;z-index:100}#editorloadingbox .passForm,#editorloadingbox button,#editorloadingbox input{padding:10px}.loadingAnimation{-webkit-animation:loadingAnimation 2s infinite linear;animation:loadingAnimation 2s infinite linear;font-family:fontawesome-etherpad;font-size:24px;z-index:150;width:25px;height:25px}.loadingAnimation:before{content:\"\\e80e\"}@-webkit-keyframes loadingAnimation{0%{-webkit-transform:rotate(0);transform:rotate(0)}100%{-webkit-transform:rotate(359deg);transform:rotate(359deg)}}@keyframes loadingAnimation{0%{-webkit-transform:rotate(0);transform:rotate(0)}100%{-webkit-transform:rotate(359deg);transform:rotate(359deg)}}#editorcontainerbox{bottom:0;top:0;width:100%}#padpage{top:0;bottom:0;width:100%}#padmain{margin-top:0;top:63px!important;left:0;right:0;bottom:0;zoom:1}#padeditor{bottom:0;left:0;right:0;top:0;zoom:1}#myswatchbox{position:absolute;left:5px;top:5px;width:24px;height:24px;background:0 0;cursor:pointer}#myswatch{width:100%;height:100%;background:0 0}#mycolorpicker{width:232px;height:265px;left:-250px;top:0;z-index:101;display:none;border-radius:0 0 6px 6px;background:#f7f7f7;border:1px solid #ccc;border-top:0;padding-left:10px;padding-top:10px}#mycolorpickersave{left:10px;font-weight:700}#mycolorpickercancel{left:85px}#mycolorpickercancel,#mycolorpickersave{background:#fff;background:-webkit-linear-gradient(#fff,#ccc);background:-moz-linear-gradient(#fff,#ccc);background:-o-linear-gradient(#fff,#ccc);background:-ms-linear-gradient(#fff,#ccc);background:linear-gradient(#fff,#ccc);border:1px solid #ccc;-webkit-border-radius:4px;-moz-border-radius:4px;border-radius:4px;font-size:12px;cursor:pointer;color:#000;overflow:hidden;padding:4px;top:240px;text-align:center;width:60px}#titlecross,#titlesticky{color:#555;text-align:right}#chatbox,#chaticon{border-top-right-radius:5px;border-top-left-radius:5px}#mycolorpickerpreview{left:207px;top:240px;width:16px;height:16px;padding:4px;overflow:hidden;color:#fff;-webkit-border-radius:5px;-moz-border-radius:5px;border-radius:5px}#myusernameform{margin-left:30px}#myusernameedit{font-size:1.3em;padding:3px;height:18px;margin:0;width:122px;background:0 0}#myusernameform input.editable{border:1px solid #444}#myuser .myusernameedithoverable:hover{background:#fff;color:#000}#mystatusform{margin-left:35px;margin-top:5px}#mystatusedit{font-size:1.2em;color:#777;font-style:italic;padding:2px;height:14px;margin:0;border:1px solid #bbb;width:199px;background:0 0}#myusernameform .editactive,#myusernameform .editempty{color:#000}#myusernameform .editempty{color:#333}#myswatchbox,#myusernameedit,#otheruserstable .swatch{border:1px solid #ccc!important;color:#333}#nootherusers{padding:10px;font-size:1.2em;color:#eee}#nootherusers a{color:#3C88FF}#otheruserstable td{height:26px;padding:0 2px;color:#333}#otheruserstable .swatch{border:1px solid #000;width:13px;height:13px;overflow:hidden;margin:0 4px;-webkit-touch-callout:none;-webkit-user-select:none;-khtml-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.usertdswatch{width:1%}.usertdname{font-size:1.3em;color:#444}.usertdstatus{font-size:1.1em;font-style:italic;color:#999}.usertdactivity{font-size:1.1em;color:#777}.usertdname input{border:1px solid #bbb;width:80px;padding:2px}#chatbox,#chaticon{border-right:1px solid #999;border-top:1px solid #999;border-left:1px solid #999}.usertdname input.editempty{color:#888;font-style:italic}#connectivity{z-index:600!important}#connectivity .visible,#connectivity .visible *{display:block}#reconnect_form button{font-size:12pt;padding:5px}.toolbar #overlay{z-index:500;display:none;background-repeat:repeat-both;width:100%;height:inherit;left:0;top:0}* html #overlay,.exporttype{background-repeat:no-repeat}* html #overlay{-ms-filter:\"progid:DXImageTransform.Microsoft.Alpha(Opacity=100)\";filter:alpha(opacity=100);opacity:1;background-image:none}#chatbox{bottom:0;right:20px;width:180px;height:200px;z-index:400;background-color:#f7f7f7;padding:3px 3px 10px;display:none}#chaticon,#chattext{background-color:#fff}#chattext{border:1px solid #fff;-ms-overflow-y:scroll;overflow-y:scroll;font-size:12px;right:0;left:0;top:25px;bottom:25px;z-index:1002}#chattext p{padding:3px;-ms-overflow-x:hidden;overflow-x:hidden;word-wrap:break-word}.chatloadmessages{margin:5px auto;display:block}#chatloadmessagesbutton{line-height:1.8em}#chatloadmessagesball{display:none}#chatinputbox{padding:3px 2px;bottom:0;right:0;left:3px}#chatlabel{font-size:13px;color:#555;margin-right:3px}#chatinput{border:1px solid #BBB;width:100%;float:right}#chaticon{z-index:400;position:fixed;bottom:0;right:20px;padding:5px;cursor:pointer}.chatAndUsers,.chatAndUsersChat,.stickyChat{border-left:1px solid #ccc!important}#chatcounter{color:#777;font-size:10px}#titlebar{line-height:16px;color:#555;position:relative;bottom:2px}#titlelabel{font-size:13px;margin:4px 0 0 4px;position:absolute}#titlesticky{font-size:10px;padding-top:2px;float:right;cursor:pointer}#titlecross{font-size:25px;float:right;cursor:pointer}.time{float:right;color:#333;font-style:italic;font-size:10px;margin-left:3px;margin-right:3px;margin-top:2px}#exportColumn{margin-top:20px}.exporttype{margin-top:4px;color:#333;padding-bottom:2px;display:inline;padding-left:5px;font-family:Arial}.buttonicon,.exportlink{font-family:fontawesome-etherpad}.exportlink{display:block;margin:5px;color:#666}#chatthrob,#importmessageabiword,#importmessagesuccess,#importstatusball{display:none}#exporthtmla:before{content:\"\\e826\"}#exportplaina:before{content:\"\\e802\"}#exportworda:before{content:\"\\e804\"}#exportpdfa:before{content:\"\\e803\"}#exportetherpada:before{content:\"\\e806\"}#exportopena:before{content:\"\\e805\"}#importmessageabiword{color:#900;font-size:small}#importsubmitinput{margin-top:12px;padding:2px 4px}#chatthrob{position:absolute;bottom:40px;font-size:14px;width:150px;height:40px;right:20px;z-index:200;color:#fff;background-color:#000;background-color:rgba(0,0,0,.7);padding:10px;-webkit-border-radius:6px;-moz-border-radius:6px;border-radius:6px;-ms-filter:\"progid:DXImageTransform.Microsoft.Alpha(Opacity=80)\";filter:alpha(opacity=80);opacity:.8}.buttonicon{width:16px;height:16px;display:inline-block;border:none;padding:0;background:0 0;font-size:15px;font-style:normal;font-weight:400;color:#666;cursor:pointer}[class*=\" icon-\"]:before,[class^=icon-]:before,[data-icon]:before{font-weight:400!important;font-family:fontawesome-etherpad!important;line-height:1;font-style:normal!important}.buttonicon::-moz-focus-inner{padding:0;border:0}.buttonicon:focus{border:1px solid #666}.popup,.popup select{border:1px solid #ccc}.buttonicon-bold:before{content:\"\\e81c\"}.buttonicon-italic:before{content:\"\\e81d\"}.buttonicon-underline:before{content:\"\\e817\"}.buttonicon-strikethrough:before{content:\"\\e818\"}.buttonicon-insertorderedlist:before{content:\"\\e816\"}.buttonicon-insertunorderedlist:before{content:\"\\e815\"}.buttonicon-indent:before{content:\"\\e814\"}.buttonicon-outdent:before{content:\"\\e813\"}.buttonicon-undo:before{content:\"\\e823\"}.buttonicon-redo:before{content:\"\\e824\"}.buttonicon-clearauthorship:before{content:\"\\e80d\"}.buttonicon-settings:before{content:\"\\e833\"}.buttonicon-import_export:before{content:\"\\e834\"}.buttonicon-embed:before{content:\"\\e827\"}.buttonicon-history:before{content:\"\\e837\"}.buttonicon-chat:before{content:\"\\e829\"}.buttonicon-showusers:before{content:\"\\e808\"}.buttonicon-savedRevision:before{content:\"\\e835\"}#focusprotector{z-index:100;position:absolute;bottom:0;top:0;left:0;right:0;background-color:#fff;-ms-filter:\"progid:DXImageTransform.Microsoft.Alpha(Opacity=1)\";filter:alpha(opacity=1);opacity:.01;display:none}.rtl{direction:RTL}input[type=checkbox]{vertical-align:-1px}.right{float:right}.popup{font-size:12px;width:80%;max-width:500px;padding:10px;border-radius:0 0 6px 6px;border-top:none;background:#f7f7f7;background:-webkit-linear-gradient(#F7F7F7,#EEE);background:-moz-linear-gradient(#F7F7F7,#EEE);background:-ms-linear-gradient(#F7F7F7,#EEE);background:-o-linear-gradient(#F7F7F7,#EEE);background:linear-gradient(#F7F7F7,#EEE);-webkit-box-shadow:0 0 8px #888;-moz-box-shadow:0 0 8px #888;box-shadow:0 2px 4px #ddd;color:#222}.popup input[type=text]{width:100%;padding:5px;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;-ms-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:10px}#users input[type=text],.popup input[type=text]{outline:0}.popup button{padding:5px;font-size:14px}.popup h1{color:#555;font-size:18px}.popup h2{color:#777;font-size:15px}.popup p{margin:5px 0}.popup select{background:#fff;padding:2px;height:24px;border-radius:3px;outline:0;width:120px}.chatAndUsers,.chatAndUsersChat,.stickyChat{border:none!important}.chatAndUsers,.stickyChat{border-radius:0!important}.column{float:left;width:50%}#connectivity,#embed,#import_export,#settings,#users{position:absolute;top:38px;right:20px;display:none;z-index:500}.chatAndUsers,.chatAndUsersChat{width:182px!important;right:0!important}.stickyChat{background-color:#f1f1f1!important;right:0!important;top:37px;-webkit-border-radius:0!important;-moz-border-radius:0!important;height:auto!important;width:185px!important}.chatAndUsers{display:block!important;border-bottom:1px solid #ccc!important;height:155px!important}#noCookie,#passwordRequired,#permissionDenied,#wrongPassword,.chatAndUsersChat>div>#titlecross{display:none}.chatAndUsers>#otherusers{max-height:100px;overflow-y:auto}.chatAndUsersChat{bottom:0!important;margin:165px 0 0;padding:5px!important}@media screen and (max-width:600px){.toolbar ul li.separator{display:none}.toolbar ul li a{padding:4px 1px}.toolbar ul.menu_left{left:0;right:150px}}@media all and (max-width:400px){#gritter-notice-wrapper{max-height:172px;overflow:hidden;width:100%!important;background-color:#ccc;bottom:20px;left:0;right:0;color:#000}.gritter-close{display:block!important;left:auto!important;right:5px}#gritter-notice-wrapper.bottom-right{left:0!important;bottom:30px!important;right:0!important}.gritter-item p{color:#000;font-size:16px}.gritter-title{text-shadow:none!important;color:#000}.gritter-item{padding:2px 11px 8px 4px}.gritter-item-wrapper{margin:0}.gritter-item-wrapper>div{background:0 0}#editorcontainer{top:68px}#editbar{height:62px}.toolbar ul.menu_left{left:0;right:100px}.toolbar ul.menu_right{right:0}.popup{width:100%;max-width:300px;top:72px!important}}@media only screen and (min-device-width:320px)and (max-device-width:720px){#users{top:auto;right:0!important;bottom:33px;border-radius:0!important;height:55px!important;overflow:auto}#mycolorpicker{left:-73px;top:auto!important;bottom:33px!important}#editorcontainer{margin-bottom:33px}.toolbar ul.menu_left{right:0}.toolbar ul.menu_right{background:#f7f7f7;background:-webkit-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-moz-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-o-linear-gradient(#f7f7f7,#f1f1f1 80%);background:-ms-linear-gradient(#f7f7f7,#f1f1f1 80%);background:linear-gradient(#f7f7f7,#f1f1f1 80%);width:100%;right:0!important;overflow:hidden;height:32px;position:fixed;bottom:0;border-top:1px solid #ccc}.toolbar ul.menu_right>li:last-child{float:right}.toolbar ul.menu_right>li a{border-radius:0;border:none;background:0 0;margin:0;padding:8px}.toolbar ul li a.selected{background:0 0!important}li[data-key=showusers]>a{margin-top:-10px;padding-top:2px!important;line-height:20px;vertical-align:top!important}#chaticon{position:absolute;right:48px}.popup{-webkit-border-radius:0;-moz-border-radius:0;border-radius:0;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;-ms-box-sizing:border-box;box-sizing:border-box;width:100%}#connectivity,#embed,#import_export,#settings{top:auto;left:0;bottom:33px;right:0}.toolbar ul li .separator{display:none}#online_count{line-height:24px}#chatbox{position:absolute;bottom:33px!important;margin:65px 0 0}#gritter-notice-wrapper{bottom:43px!important;right:10px!important}}#gritter-notice-wrapper{position:fixed;top:20px;right:20px;width:301px;z-index:9999;background-color:#666}#gritter-notice-wrapper.bottom-right{top:auto;left:auto;bottom:20px;right:20px}.gritter-item-wrapper{position:relative;margin:0 0 10px}.gritter-top{height:10px}.hover .gritter-top{background-position:right -30px}.gritter-bottom{height:8px;margin:0}.hover .gritter-bottom{background-position:bottom right}.gritter-item{display:block;color:#eee;padding:2px 11px 8px;font-size:11px;font-family:verdana}.hover .gritter-item{background-position:right -40px}.gritter-item p{padding:0;margin:0}.gritter-close{display:none;position:absolute;top:5px;left:3px;cursor:pointer;width:30px;height:30px}.gritter-title{font-size:14px;font-weight:700;padding:0 0 7px;display:block;text-shadow:1px 1px 0 #000}.gritter-image{width:48px;height:48px;float:left}.gritter-with-image,.gritter-without-image{padding:0 0 5px}.gritter-with-image{width:220px;float:right}.gritter-close,.gritter-light .gritter-bottom,.gritter-light .gritter-item,.gritter-light .gritter-top{color:#222}.gritter-light .gritter-title{text-shadow:none}@font-face{font-family:opendyslexic;src:url(../../static/font/opendyslexic.otf)format(\"opentype\")}@font-face{font-family:fontawesome-etherpad;src:url(../font/fontawesome-etherpad.eot);src:url(../font/fontawesome-etherpad.eot?#iefix)format(\"embedded-opentype\"),url(../font/fontawesome-etherpad.woff)format(\"woff\"),url(../font/fontawesome-etherpad.ttf)format(\"truetype\"),url(../font/fontawesome-etherpad.svg#fontawesome-etherpad)format(\"svg\");font-weight:400;font-style:normal}[data-icon]:before{content:attr(data-icon);font-variant:normal!important;text-transform:none!important;speak:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}[class*=\" icon-\"]:before,[class^=icon-]:before{font-variant:normal!important;text-transform:none!important;speak:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.hideControlsEditor{top:0!important}.hideControlsEditbar{display:none!important}";

}
, "ep_etherpad-lite/static/js/collab_client.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var chat = require('./chat').chat;
var hooks = require('./pluginfw/hooks');

// Dependency fill on init. This exists for `pad.socket` only.
// TODO: bind directly to the socket.
var pad = undefined;
function getSocket() {
  return pad && pad.socket;
}

/** Call this when the document is ready, and a new Ace2Editor() has been created and inited.
    ACE's ready callback does not need to have fired yet.
    "serverVars" are from calling doc.getCollabClientVars() on the server. */
function getCollabClient(ace2editor, serverVars, initialUserInfo, options, _pad)
{
  var editor = ace2editor;
  pad = _pad; // Inject pad to avoid a circular dependency.

  var rev = serverVars.rev;
  var padId = serverVars.padId;

  var state = "IDLE";
  var stateMessage;
  var channelState = "CONNECTING";
  var appLevelDisconnectReason = null;

  var lastCommitTime = 0;
  var initialStartConnectTime = 0;

  var userId = initialUserInfo.userId;
  //var socket;
  var userSet = {}; // userId -> userInfo
  userSet[userId] = initialUserInfo;

  var caughtErrors = [];
  var caughtErrorCatchers = [];
  var caughtErrorTimes = [];
  var debugMessages = [];
  var msgQueue = [];

  tellAceAboutHistoricalAuthors(serverVars.historicalAuthorData);
  tellAceActiveAuthorInfo(initialUserInfo);

  var callbacks = {
    onUserJoin: function()
    {},
    onUserLeave: function()
    {},
    onUpdateUserInfo: function()
    {},
    onChannelStateChange: function()
    {},
    onClientMessage: function()
    {},
    onInternalAction: function()
    {},
    onConnectionTrouble: function()
    {},
    onServerMessage: function()
    {}
  };
  if (browser.firefox)
  {
    // Prevent "escape" from taking effect and canceling a comet connection;
    // doesn't work if focus is on an iframe.
    $(window).bind("keydown", function(evt)
    {
      if (evt.which == 27)
      {
        evt.preventDefault()
      }
    });
  }

  editor.setProperty("userAuthor", userId);
  editor.setBaseAttributedText(serverVars.initialAttributedText, serverVars.apool);
  editor.setUserChangeNotificationCallback(wrapRecordingErrors("handleUserChanges", handleUserChanges));

  function dmesg(str)
  {
    if (typeof window.ajlog == "string") window.ajlog += str + '\n';
    debugMessages.push(str);
  }

  function handleUserChanges()
  {
    if (editor.getInInternationalComposition()) return;
    if ((!getSocket()) || channelState == "CONNECTING")
    {
      if (channelState == "CONNECTING" && (((+new Date()) - initialStartConnectTime) > 20000))
      {
        setChannelState("DISCONNECTED", "initsocketfail");
      }
      else
      {
        // check again in a bit
        setTimeout(wrapRecordingErrors("setTimeout(handleUserChanges)", handleUserChanges), 1000);
      }
      return;
    }

    var t = (+new Date());

    if (state != "IDLE")
    {
      if (state == "COMMITTING" && msgQueue.length == 0 && (t - lastCommitTime) > 20000)
      {
        // a commit is taking too long
        setChannelState("DISCONNECTED", "slowcommit");
      }
      else if (state == "COMMITTING" && msgQueue.length == 0 && (t - lastCommitTime) > 5000)
      {
        callbacks.onConnectionTrouble("SLOW");
      }
      else
      {
        // run again in a few seconds, to detect a disconnect
        setTimeout(wrapRecordingErrors("setTimeout(handleUserChanges)", handleUserChanges), 3000);
      }
      return;
    }

    var earliestCommit = lastCommitTime + 500;
    if (t < earliestCommit)
    {
      setTimeout(wrapRecordingErrors("setTimeout(handleUserChanges)", handleUserChanges), earliestCommit - t);
      return;
    }

    // apply msgQueue changeset.
    if (msgQueue.length != 0) {
      var msg;
      while (msg = msgQueue.shift()) {
        var newRev = msg.newRev;
        rev=newRev;
        if (msg.type == "ACCEPT_COMMIT")
        {
          editor.applyPreparedChangesetToBase();
          setStateIdle();
          callCatchingErrors("onInternalAction", function()
          {
            callbacks.onInternalAction("commitAcceptedByServer");
          });
          callCatchingErrors("onConnectionTrouble", function()
          {
            callbacks.onConnectionTrouble("OK");
          });
          handleUserChanges();
        }
        else if (msg.type == "NEW_CHANGES")
        {
          var changeset = msg.changeset;
          var author = (msg.author || '');
          var apool = msg.apool;

          editor.applyChangesToBase(changeset, author, apool);
        }
      }
    }

    var sentMessage = false;
    var userChangesData = editor.prepareUserChangeset();
    if (userChangesData.changeset)
    {
      lastCommitTime = t;
      state = "COMMITTING";
      stateMessage = {
        type: "USER_CHANGES",
        baseRev: rev,
        changeset: userChangesData.changeset,
        apool: userChangesData.apool
      };
      sendMessage(stateMessage);
      sentMessage = true;
      callbacks.onInternalAction("commitPerformed");
    }

    if (sentMessage)
    {
      // run again in a few seconds, to detect a disconnect
      setTimeout(wrapRecordingErrors("setTimeout(handleUserChanges)", handleUserChanges), 3000);
    }
  }

  function setUpSocket()
  {
    hiccupCount = 0;
    setChannelState("CONNECTED");
    doDeferredActions();

    initialStartConnectTime = +new Date();
  }

  var hiccupCount = 0;

  function sendMessage(msg)
  {
    getSocket().json.send(
    {
      type: "COLLABROOM",
      component: "pad",
      data: msg
    });
  }

  function wrapRecordingErrors(catcher, func)
  {
    return function()
    {
      try
      {
        return func.apply(this, Array.prototype.slice.call(arguments));
      }
      catch (e)
      {
        caughtErrors.push(e);
        caughtErrorCatchers.push(catcher);
        caughtErrorTimes.push(+new Date());
        //console.dir({catcher: catcher, e: e});
        throw e;
      }
    };
  }

  function callCatchingErrors(catcher, func)
  {
    try
    {
      wrapRecordingErrors(catcher, func)();
    }
    catch (e)
    { /*absorb*/
    }
  }

  function handleMessageFromServer(evt)
  {
    if (window.console) console.log(evt);

    if (!getSocket()) return;
    if (!evt.data) return;
    var wrapper = evt;
    if (wrapper.type != "COLLABROOM" && wrapper.type != "CUSTOM") return;
    var msg = wrapper.data;

    if (msg.type == "NEW_CHANGES")
    {
      var newRev = msg.newRev;
      var changeset = msg.changeset;
      var author = (msg.author || '');
      var apool = msg.apool;

      // When inInternationalComposition, msg pushed msgQueue.
      if (msgQueue.length > 0 || editor.getInInternationalComposition()) {
        if (msgQueue.length > 0) var oldRev = msgQueue[msgQueue.length - 1].newRev;
        else oldRev = rev;

        if (newRev != (oldRev + 1))
        {
          window.console.warn("bad message revision on NEW_CHANGES: " + newRev + " not " + (oldRev + 1));
          // setChannelState("DISCONNECTED", "badmessage_newchanges");
          return;
        }
        msgQueue.push(msg);
        return;
      }

      if (newRev != (rev + 1))
      {
        window.console.warn("bad message revision on NEW_CHANGES: " + newRev + " not " + (rev + 1));
        // setChannelState("DISCONNECTED", "badmessage_newchanges");
        return;
      }
      rev = newRev;
      editor.applyChangesToBase(changeset, author, apool);
    }
    else if (msg.type == "ACCEPT_COMMIT")
    {
      var newRev = msg.newRev;
      if (msgQueue.length > 0)
      {
        if (newRev != (msgQueue[msgQueue.length - 1].newRev + 1))
        {
          window.console.warn("bad message revision on ACCEPT_COMMIT: " + newRev + " not " + (msgQueue[msgQueue.length - 1][0] + 1));
          // setChannelState("DISCONNECTED", "badmessage_acceptcommit");
          return;
        }
        msgQueue.push(msg);
        return;
      }

      if (newRev != (rev + 1))
      {
        window.console.warn("bad message revision on ACCEPT_COMMIT: " + newRev + " not " + (rev + 1));
        // setChannelState("DISCONNECTED", "badmessage_acceptcommit");
        return;
      }
      rev = newRev;
      editor.applyPreparedChangesetToBase();
      setStateIdle();
      callCatchingErrors("onInternalAction", function()
      {
        callbacks.onInternalAction("commitAcceptedByServer");
      });
      callCatchingErrors("onConnectionTrouble", function()
      {
        callbacks.onConnectionTrouble("OK");
      });
      handleUserChanges();
    }
    else if (msg.type == "NO_COMMIT_PENDING")
    {
      if (state == "COMMITTING")
      {
        // server missed our commit message; abort that commit
        setStateIdle();
        handleUserChanges();
      }
    }
    else if (msg.type == "USER_NEWINFO")
    {
      var userInfo = msg.userInfo;
      var id = userInfo.userId;

      // Avoid a race condition when setting colors.  If our color was set by a
      // query param, ignore our own "new user" message's color value.
      if (id === initialUserInfo.userId && initialUserInfo.globalUserColor)
      {
        msg.userInfo.colorId = initialUserInfo.globalUserColor;
      }

      
      if (userSet[id])
      {
        userSet[id] = userInfo;
        callbacks.onUpdateUserInfo(userInfo);
      }
      else
      {
        userSet[id] = userInfo;
        callbacks.onUserJoin(userInfo);
      }
      tellAceActiveAuthorInfo(userInfo);
    }
    else if (msg.type == "USER_LEAVE")
    {
      var userInfo = msg.userInfo;
      var id = userInfo.userId;
      if (userSet[id])
      {
        delete userSet[userInfo.userId];
        fadeAceAuthorInfo(userInfo);
        callbacks.onUserLeave(userInfo);
      }
    }

    else if (msg.type == "DISCONNECT_REASON")
    {
      appLevelDisconnectReason = msg.reason;
    }
    else if (msg.type == "CLIENT_MESSAGE")
    {
      callbacks.onClientMessage(msg.payload);
    }
    else if (msg.type == "CHAT_MESSAGE")
    {
      chat.addMessage(msg, true, false);
    }
    else if (msg.type == "CHAT_MESSAGES")
    {
      for(var i = msg.messages.length - 1; i >= 0; i--)
      {
        chat.addMessage(msg.messages[i], true, true);
      }
      if(!chat.gotInitalMessages)
      {
        chat.scrollDown();
        chat.gotInitalMessages = true;
        chat.historyPointer = clientVars.chatHead - msg.messages.length;
      }

      // messages are loaded, so hide the loading-ball
      $("#chatloadmessagesball").css("display", "none");

      // there are less than 100 messages or we reached the top
      if(chat.historyPointer <= 0) 
        $("#chatloadmessagesbutton").css("display", "none");
      else // there are still more messages, re-show the load-button
        $("#chatloadmessagesbutton").css("display", "block");
    }
    else if (msg.type == "SERVER_MESSAGE")
    {
      callbacks.onServerMessage(msg.payload);
    }
    hooks.callAll('handleClientMessage_' + msg.type, {payload: msg.payload});
  }

  function updateUserInfo(userInfo)
  {
    userInfo.userId = userId;
    userSet[userId] = userInfo;
    tellAceActiveAuthorInfo(userInfo);
    if (!getSocket()) return;
    sendMessage(
    {
      type: "USERINFO_UPDATE",
      userInfo: userInfo
    });
  }

  function tellAceActiveAuthorInfo(userInfo)
  {
    tellAceAuthorInfo(userInfo.userId, userInfo.colorId);
  }

  function tellAceAuthorInfo(userId, colorId, inactive)
  {
    if(typeof colorId == "number")
    {
      colorId = clientVars.colorPalette[colorId];
    }
    
    var cssColor = colorId;
    if (inactive)
    {
      editor.setAuthorInfo(userId, {
        bgcolor: cssColor,
        fade: 0.5
      });
    }
    else
    {
      editor.setAuthorInfo(userId, {
        bgcolor: cssColor
      });
    }
  }

  function fadeAceAuthorInfo(userInfo)
  {
    tellAceAuthorInfo(userInfo.userId, userInfo.colorId, true);
  }

  function getConnectedUsers()
  {
    return valuesArray(userSet);
  }

  function tellAceAboutHistoricalAuthors(hadata)
  {
    for (var author in hadata)
    {
      var data = hadata[author];
      if (!userSet[author])
      {
        tellAceAuthorInfo(author, data.colorId, true);
      }
    }
  }

  function setChannelState(newChannelState, moreInfo)
  {
    if (newChannelState != channelState)
    {
      channelState = newChannelState;
      callbacks.onChannelStateChange(channelState, moreInfo);
    }
  }

  function valuesArray(obj)
  {
    var array = [];
    $.each(obj, function(k, v)
    {
      array.push(v);
    });
    return array;
  }

  // We need to present a working interface even before the socket
  // is connected for the first time.
  var deferredActions = [];

  function defer(func, tag)
  {
    return function()
    {
      var that = this;
      var args = arguments;

      function action()
      {
        func.apply(that, args);
      }
      action.tag = tag;
      if (channelState == "CONNECTING")
      {
        deferredActions.push(action);
      }
      else
      {
        action();
      }
    }
  }

  function doDeferredActions(tag)
  {
    var newArray = [];
    for (var i = 0; i < deferredActions.length; i++)
    {
      var a = deferredActions[i];
      if ((!tag) || (tag == a.tag))
      {
        a();
      }
      else
      {
        newArray.push(a);
      }
    }
    deferredActions = newArray;
  }

  function sendClientMessage(msg)
  {
    sendMessage(
    {
      type: "CLIENT_MESSAGE",
      payload: msg
    });
  }

  function getCurrentRevisionNumber()
  {
    return rev;
  }

  function getMissedChanges()
  {
    var obj = {};
    obj.userInfo = userSet[userId];
    obj.baseRev = rev;
    if (state == "COMMITTING" && stateMessage)
    {
      obj.committedChangeset = stateMessage.changeset;
      obj.committedChangesetAPool = stateMessage.apool;
      editor.applyPreparedChangesetToBase();
    }
    var userChangesData = editor.prepareUserChangeset();
    if (userChangesData.changeset)
    {
      obj.furtherChangeset = userChangesData.changeset;
      obj.furtherChangesetAPool = userChangesData.apool;
    }
    return obj;
  }

  function setStateIdle()
  {
    state = "IDLE";
    callbacks.onInternalAction("newlyIdle");
    schedulePerhapsCallIdleFuncs();
  }

  function callWhenNotCommitting(func)
  {
    idleFuncs.push(func);
    schedulePerhapsCallIdleFuncs();
  }

  var idleFuncs = [];

  function schedulePerhapsCallIdleFuncs()
  {
    setTimeout(function()
    {
      if (state == "IDLE")
      {
        while (idleFuncs.length > 0)
        {
          var f = idleFuncs.shift();
          f();
        }
      }
    }, 0);
  }

  var self = {
    setOnUserJoin: function(cb)
    {
      callbacks.onUserJoin = cb;
    },
    setOnUserLeave: function(cb)
    {
      callbacks.onUserLeave = cb;
    },
    setOnUpdateUserInfo: function(cb)
    {
      callbacks.onUpdateUserInfo = cb;
    },
    setOnChannelStateChange: function(cb)
    {
      callbacks.onChannelStateChange = cb;
    },
    setOnClientMessage: function(cb)
    {
      callbacks.onClientMessage = cb;
    },
    setOnInternalAction: function(cb)
    {
      callbacks.onInternalAction = cb;
    },
    setOnConnectionTrouble: function(cb)
    {
      callbacks.onConnectionTrouble = cb;
    },
    setOnServerMessage: function(cb)
    {
      callbacks.onServerMessage = cb;
    },
    updateUserInfo: defer(updateUserInfo),
    handleMessageFromServer: handleMessageFromServer,
    getConnectedUsers: getConnectedUsers,
    sendClientMessage: sendClientMessage,
    sendMessage: sendMessage,
    getCurrentRevisionNumber: getCurrentRevisionNumber,
    getMissedChanges: getMissedChanges,
    callWhenNotCommitting: callWhenNotCommitting,
    addHistoricalAuthors: tellAceAboutHistoricalAuthors,
    setChannelState: setChannelState
  };

  $(document).ready(setUpSocket);
  return self;
}

exports.getCollabClient = getCollabClient;

}
, "ep_etherpad-lite/static/js/pad_userlist.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code.
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var padutils = require('./pad_utils').padutils;
var hooks = require('./pluginfw/hooks');

var myUserInfo = {};

var colorPickerOpen = false;
var colorPickerSetup = false;
var previousColorId = 0;


var paduserlist = (function()
{

  var rowManager = (function()
  {
    // The row manager handles rendering rows of the user list and animating
    // their insertion, removal, and reordering.  It manipulates TD height
    // and TD opacity.

    function nextRowId()
    {
      return "usertr" + (nextRowId.counter++);
    }
    nextRowId.counter = 1;
    // objects are shared; fields are "domId","data","animationStep"
    var rowsFadingOut = []; // unordered set
    var rowsFadingIn = []; // unordered set
    var rowsPresent = []; // in order
    var ANIMATION_START = -12; // just starting to fade in
    var ANIMATION_END = 12; // just finishing fading out


    function getAnimationHeight(step, power)
    {
      var a = Math.abs(step / 12);
      if (power == 2) a = a * a;
      else if (power == 3) a = a * a * a;
      else if (power == 4) a = a * a * a * a;
      else if (power >= 5) a = a * a * a * a * a;
      return Math.round(26 * (1 - a));
    }
    var OPACITY_STEPS = 6;

    var ANIMATION_STEP_TIME = 20;
    var LOWER_FRAMERATE_FACTOR = 2;
    var scheduleAnimation = padutils.makeAnimationScheduler(animateStep, ANIMATION_STEP_TIME, LOWER_FRAMERATE_FACTOR).scheduleAnimation;

    var NUMCOLS = 4;

    // we do lots of manipulation of table rows and stuff that JQuery makes ok, despite
    // IE's poor handling when manipulating the DOM directly.

    function getEmptyRowHtml(height)
    {
      return '<td colspan="' + NUMCOLS + '" style="border:0;height:' + height + 'px"><!-- --></td>';
    }

    function isNameEditable(data)
    {
      return (!data.name) && (data.status != 'Disconnected');
    }

    function replaceUserRowContents(tr, height, data)
    {
      var tds = getUserRowHtml(height, data).match(/<td.*?<\/td>/gi);
      if (isNameEditable(data) && tr.find("td.usertdname input:enabled").length > 0)
      {
        // preserve input field node
        for (var i = 0; i < tds.length; i++)
        {
          var oldTd = $(tr.find("td").get(i));
          if (!oldTd.hasClass('usertdname'))
          {
            oldTd.replaceWith(tds[i]);
          }
        }
      }
      else
      {
        tr.html(tds.join(''));
      }
      return tr;
    }

    function getUserRowHtml(height, data)
    {
      var nameHtml;
      if (data.name)
      {
        nameHtml = padutils.escapeHtml(data.name);
      }
      else
      {
        nameHtml = '<input data-l10n-id="pad.userlist.unnamed" type="text" class="editempty newinput" value="'+_('pad.userlist.unnamed')+'" ' + (isNameEditable(data) ? '' : 'disabled="disabled" ') + '/>';
      }

      return ['<td style="height:', height, 'px" class="usertdswatch"><div class="swatch" style="background:' + padutils.escapeHtml(data.color) + '">&nbsp;</div></td>', '<td style="height:', height, 'px" class="usertdname">', nameHtml, '</td>', '<td style="height:', height, 'px" class="activity">', padutils.escapeHtml(data.activity), '</td>'].join('');
    }

    function getRowHtml(id, innerHtml, authorId)
    {
      return '<tr data-authorId="'+authorId+'" id="' + id + '">' + innerHtml + '</tr>';
    }

    function rowNode(row)
    {
      return $("#" + row.domId);
    }

    function handleRowData(row)
    {
      if (row.data && row.data.status == 'Disconnected')
      {
        row.opacity = 0.5;
      }
      else
      {
        delete row.opacity;
      }
    }

    function handleRowNode(tr, data)
    {
      if (data.titleText)
      {
        var titleText = data.titleText;
        window.setTimeout(function()
        {
          /* tr.attr('title', titleText)*/
        }, 0);
      }
      else
      {
        tr.removeAttr('title');
      }
    }

    function handleOtherUserInputs()
    {
      // handle 'INPUT' elements for naming other unnamed users
      $("#otheruserstable input.newinput").each(function()
      {
        var input = $(this);
        var tr = input.closest("tr");
        if (tr.length > 0)
        {
          var index = tr.parent().children().index(tr);
          if (index >= 0)
          {
            var userId = rowsPresent[index].data.id;
            rowManagerMakeNameEditor($(this), userId);
          }
        }
      }).removeClass('newinput');
    }

    // animationPower is 0 to skip animation, 1 for linear, 2 for quadratic, etc.


    function insertRow(position, data, animationPower)
    {
      position = Math.max(0, Math.min(rowsPresent.length, position));
      animationPower = (animationPower === undefined ? 4 : animationPower);

      var domId = nextRowId();
      var row = {
        data: data,
        animationStep: ANIMATION_START,
        domId: domId,
        animationPower: animationPower
      };
      var authorId = data.id;

      handleRowData(row);
      rowsPresent.splice(position, 0, row);
      var tr;
      if (animationPower == 0)
      {
        tr = $(getRowHtml(domId, getUserRowHtml(getAnimationHeight(0), data), authorId));
        row.animationStep = 0;
      }
      else
      {
        rowsFadingIn.push(row);
        tr = $(getRowHtml(domId, getEmptyRowHtml(getAnimationHeight(ANIMATION_START)), authorId));
      }
      handleRowNode(tr, data);
      if (position == 0)
      {
        $("table#otheruserstable").prepend(tr);
      }
      else
      {
        rowNode(rowsPresent[position - 1]).after(tr);
      }

      if (animationPower != 0)
      {
        scheduleAnimation();
      }

      handleOtherUserInputs();

      return row;
    }

    function updateRow(position, data)
    {
      var row = rowsPresent[position];
      if (row)
      {
        row.data = data;
        handleRowData(row);
        if (row.animationStep == 0)
        {
          // not currently animating
          var tr = rowNode(row);
          replaceUserRowContents(tr, getAnimationHeight(0), row.data).find("td").css('opacity', (row.opacity === undefined ? 1 : row.opacity));
          handleRowNode(tr, data);
          handleOtherUserInputs();
        }
      }
    }

    function removeRow(position, animationPower)
    {
      animationPower = (animationPower === undefined ? 4 : animationPower);
      var row = rowsPresent[position];
      if (row)
      {
        rowsPresent.splice(position, 1); // remove
        if (animationPower == 0)
        {
          rowNode(row).remove();
        }
        else
        {
          row.animationStep = -row.animationStep; // use symmetry
          row.animationPower = animationPower;
          rowsFadingOut.push(row);
          scheduleAnimation();
        }
      }
    }

    // newPosition is position after the row has been removed


    function moveRow(oldPosition, newPosition, animationPower)
    {
      animationPower = (animationPower === undefined ? 1 : animationPower); // linear is best
      var row = rowsPresent[oldPosition];
      if (row && oldPosition != newPosition)
      {
        var rowData = row.data;
        removeRow(oldPosition, animationPower);
        insertRow(newPosition, rowData, animationPower);
      }
    }

    function animateStep()
    {
      // animation must be symmetrical
      for (var i = rowsFadingIn.length - 1; i >= 0; i--)
      { // backwards to allow removal
        var row = rowsFadingIn[i];
        var step = ++row.animationStep;
        var animHeight = getAnimationHeight(step, row.animationPower);
        var node = rowNode(row);
        var baseOpacity = (row.opacity === undefined ? 1 : row.opacity);
        if (step <= -OPACITY_STEPS)
        {
          node.find("td").height(animHeight);
        }
        else if (step == -OPACITY_STEPS + 1)
        {
          node.html(getUserRowHtml(animHeight, row.data)).find("td").css('opacity', baseOpacity * 1 / OPACITY_STEPS);
          handleRowNode(node, row.data);
        }
        else if (step < 0)
        {
          node.find("td").css('opacity', baseOpacity * (OPACITY_STEPS - (-step)) / OPACITY_STEPS).height(animHeight);
        }
        else if (step == 0)
        {
          // set HTML in case modified during animation
          node.html(getUserRowHtml(animHeight, row.data)).find("td").css('opacity', baseOpacity * 1).height(animHeight);
          handleRowNode(node, row.data);
          rowsFadingIn.splice(i, 1); // remove from set
        }
      }
      for (var i = rowsFadingOut.length - 1; i >= 0; i--)
      { // backwards to allow removal
        var row = rowsFadingOut[i];
        var step = ++row.animationStep;
        var node = rowNode(row);
        var animHeight = getAnimationHeight(step, row.animationPower);
        var baseOpacity = (row.opacity === undefined ? 1 : row.opacity);
        if (step < OPACITY_STEPS)
        {
          node.find("td").css('opacity', baseOpacity * (OPACITY_STEPS - step) / OPACITY_STEPS).height(animHeight);
        }
        else if (step == OPACITY_STEPS)
        {
          node.html(getEmptyRowHtml(animHeight));
        }
        else if (step <= ANIMATION_END)
        {
          node.find("td").height(animHeight);
        }
        else
        {
          rowsFadingOut.splice(i, 1); // remove from set
          node.remove();
        }
      }

      handleOtherUserInputs();

      return (rowsFadingIn.length > 0) || (rowsFadingOut.length > 0); // is more to do
    }

    var self = {
      insertRow: insertRow,
      removeRow: removeRow,
      moveRow: moveRow,
      updateRow: updateRow
    };
    return self;
  }()); ////////// rowManager
  var otherUsersInfo = [];
  var otherUsersData = [];

  function rowManagerMakeNameEditor(jnode, userId)
  {
    setUpEditable(jnode, function()
    {
      var existingIndex = findExistingIndex(userId);
      if (existingIndex >= 0)
      {
        return otherUsersInfo[existingIndex].name || '';
      }
      else
      {
        return '';
      }
    }, function(newName)
    {
      if (!newName)
      {
        jnode.addClass("editempty");
        jnode.val(_('pad.userlist.unnamed'));
      }
      else
      {
        jnode.attr('disabled', 'disabled');
        pad.suggestUserName(userId, newName);
      }
    });
  }

  function findExistingIndex(userId)
  {
    var existingIndex = -1;
    for (var i = 0; i < otherUsersInfo.length; i++)
    {
      if (otherUsersInfo[i].userId == userId)
      {
        existingIndex = i;
        break;
      }
    }
    return existingIndex;
  }

  function setUpEditable(jqueryNode, valueGetter, valueSetter)
  {
    jqueryNode.bind('focus', function(evt)
    {
      var oldValue = valueGetter();
      if (jqueryNode.val() !== oldValue)
      {
        jqueryNode.val(oldValue);
      }
      jqueryNode.addClass("editactive").removeClass("editempty");
    });
    jqueryNode.bind('blur', function(evt)
    {
      var newValue = jqueryNode.removeClass("editactive").val();
      valueSetter(newValue);
    });
    padutils.bindEnterAndEscape(jqueryNode, function onEnter()
    {
      jqueryNode.blur();
    }, function onEscape()
    {
      jqueryNode.val(valueGetter()).blur();
    });
    jqueryNode.removeAttr('disabled').addClass('editable');
  }

  function updateInviteNotice()
  {
    if (otherUsersInfo.length == 0)
    {
      $("#otheruserstable").hide();
      $("#nootherusers").show();
    }
    else
    {
      $("#nootherusers").hide();
      $("#otheruserstable").show();
    }
  }

  var knocksToIgnore = {};
  var guestPromptFlashState = 0;
  var guestPromptFlash = padutils.makeAnimationScheduler(

  function()
  {
    var prompts = $("#guestprompts .guestprompt");
    if (prompts.length == 0)
    {
      return false; // no more to do
    }

    guestPromptFlashState = 1 - guestPromptFlashState;
    if (guestPromptFlashState)
    {
      prompts.css('background', '#ffa');
    }
    else
    {
      prompts.css('background', '#ffe');
    }

    return true;
  }, 1000);

  var pad = undefined;
  var self = {
    init: function(myInitialUserInfo, _pad)
    {
      pad = _pad;

      self.setMyUserInfo(myInitialUserInfo);

      if($('#online_count').length === 0) $('#editbar [data-key=showusers] > a').append('<span id="online_count">1</span>');

      $("#otheruserstable tr").remove();

      if (pad.getUserIsGuest())
      {
        $("#myusernameedit").addClass('myusernameedithoverable');
        setUpEditable($("#myusernameedit"), function()
        {
          return myUserInfo.name || '';
        }, function(newValue)
        {
          myUserInfo.name = newValue;
          pad.notifyChangeName(newValue);
          // wrap with setTimeout to do later because we get
          // a double "blur" fire in IE...
          window.setTimeout(function()
          {
            self.renderMyUserInfo();
          }, 0);
        });
      }

      // color picker
      $("#myswatchbox").click(showColorPicker);
      $("#mycolorpicker .pickerswatchouter").click(function()
      {
        $("#mycolorpicker .pickerswatchouter").removeClass('picked');
        $(this).addClass('picked');
      });
      $("#mycolorpickersave").click(function()
      {
        closeColorPicker(true);
      });
      $("#mycolorpickercancel").click(function()
      {
        closeColorPicker(false);
      });
      //
    },
    users: function(){
      // Returns an object of users who have been on this pad
      // Firstly we have to get live data..
      var userList = otherUsersInfo;
      // Now we need to add ourselves..
      userList.push(myUserInfo);
      // Now we add historical authors
      var historical = clientVars.collab_client_vars.historicalAuthorData;
      for (var key in historical){
        var userId = historical[key].userId;
        // Check we don't already have this author in our array
        var exists = false;

        userList.forEach(function(user){
          if(user.userId === userId) exists = true;
        });

        if(exists === false){
          userList.push(historical[key]);
        }

      }
      return userList;
    },
    setMyUserInfo: function(info)
    {
      //translate the colorId
      if(typeof info.colorId == "number")
      {
        info.colorId = clientVars.colorPalette[info.colorId];
      }

      myUserInfo = $.extend(
      {}, info);

      self.renderMyUserInfo();
    },
    userJoinOrUpdate: function(info)
    {
      if ((!info.userId) || (info.userId == myUserInfo.userId))
      {
        // not sure how this would happen
        return;
      }

      hooks.callAll('userJoinOrUpdate', {
        userInfo: info
      });

      var userData = {};
      userData.color = typeof info.colorId == "number" ? clientVars.colorPalette[info.colorId] : info.colorId;
      userData.name = info.name;
      userData.status = '';
      userData.activity = '';
      userData.id = info.userId;
      // Firefox ignores \n in title text; Safari does a linebreak
      userData.titleText = [info.userAgent || '', info.ip || ''].join(' \n');

      var existingIndex = findExistingIndex(info.userId);

      var numUsersBesides = otherUsersInfo.length;
      if (existingIndex >= 0)
      {
        numUsersBesides--;
      }
      var newIndex = padutils.binarySearch(numUsersBesides, function(n)
      {
        if (existingIndex >= 0 && n >= existingIndex)
        {
          // pretend existingIndex isn't there
          n++;
        }
        var infoN = otherUsersInfo[n];
        var nameN = (infoN.name || '').toLowerCase();
        var nameThis = (info.name || '').toLowerCase();
        var idN = infoN.userId;
        var idThis = info.userId;
        return (nameN > nameThis) || (nameN == nameThis && idN > idThis);
      });

      if (existingIndex >= 0)
      {
        // update
        if (existingIndex == newIndex)
        {
          otherUsersInfo[existingIndex] = info;
          otherUsersData[existingIndex] = userData;
          rowManager.updateRow(existingIndex, userData);
        }
        else
        {
          otherUsersInfo.splice(existingIndex, 1);
          otherUsersData.splice(existingIndex, 1);
          otherUsersInfo.splice(newIndex, 0, info);
          otherUsersData.splice(newIndex, 0, userData);
          rowManager.updateRow(existingIndex, userData);
          rowManager.moveRow(existingIndex, newIndex);
        }
      }
      else
      {
        otherUsersInfo.splice(newIndex, 0, info);
        otherUsersData.splice(newIndex, 0, userData);
        rowManager.insertRow(newIndex, userData);
      }

      updateInviteNotice();

      self.updateNumberOfOnlineUsers();
    },
    updateNumberOfOnlineUsers: function()
    {
      var online = 1; // you are always online!
      for (var i = 0; i < otherUsersData.length; i++)
      {
        if (otherUsersData[i].status == "")
        {
          online++;
        }
      }

      $('#online_count').text(online);

      return online;
    },
    userLeave: function(info)
    {
      var existingIndex = findExistingIndex(info.userId);
      if (existingIndex >= 0)
      {
        var userData = otherUsersData[existingIndex];
        userData.status = 'Disconnected';
        rowManager.updateRow(existingIndex, userData);
        if (userData.leaveTimer)
        {
          window.clearTimeout(userData.leaveTimer);
        }
        // set up a timer that will only fire if no leaves,
        // joins, or updates happen for this user in the
        // next N seconds, to remove the user from the list.
        var thisUserId = info.userId;
        var thisLeaveTimer = window.setTimeout(function()
        {
          var newExistingIndex = findExistingIndex(thisUserId);
          if (newExistingIndex >= 0)
          {
            var newUserData = otherUsersData[newExistingIndex];
            if (newUserData.status == 'Disconnected' && newUserData.leaveTimer == thisLeaveTimer)
            {
              otherUsersInfo.splice(newExistingIndex, 1);
              otherUsersData.splice(newExistingIndex, 1);
              rowManager.removeRow(newExistingIndex);
              hooks.callAll('userLeave', {
                userInfo: info
              });
              updateInviteNotice();
            }
          }
        }, 8000); // how long to wait
        userData.leaveTimer = thisLeaveTimer;
      }
      updateInviteNotice();

      self.updateNumberOfOnlineUsers();
    },
    showGuestPrompt: function(userId, displayName)
    {
      if (knocksToIgnore[userId])
      {
        return;
      }

      var encodedUserId = padutils.encodeUserId(userId);

      var actionName = 'hide-guest-prompt-' + encodedUserId;
      padutils.cancelActions(actionName);

      var box = $("#guestprompt-" + encodedUserId);
      if (box.length == 0)
      {
        // make guest prompt box
        box = $('<div id="'+padutils.escapeHtml('guestprompt-' + encodedUserId) + '" class="guestprompt"><div class="choices"><a href="' + padutils.escapeHtml('javascript:void(require('+JSON.stringify(module.id)+').paduserlist.answerGuestPrompt(' + JSON.stringify(encodedUserId) + ',false))')+'">'+_('pad.userlist.deny')+'</a> <a href="' + padutils.escapeHtml('javascript:void(require('+JSON.stringify(module.id)+').paduserlist.answerGuestPrompt(' + JSON.stringify(encodedUserId) + ',true))') + '">'+_('pad.userlist.approve')+'</a></div><div class="guestname"><strong>'+_('pad.userlist.guest')+':</strong> ' + padutils.escapeHtml(displayName) + '</div></div>');
        $("#guestprompts").append(box);
      }
      else
      {
        // update display name
        box.find(".guestname").html('<strong>'+_('pad.userlist.guest')+':</strong> ' + padutils.escapeHtml(displayName));
      }
      var hideLater = padutils.getCancellableAction(actionName, function()
      {
        self.removeGuestPrompt(userId);
      });
      window.setTimeout(hideLater, 15000); // time-out with no knock
      guestPromptFlash.scheduleAnimation();
    },
    removeGuestPrompt: function(userId)
    {
      var box = $("#guestprompt-" + padutils.encodeUserId(userId));
      // remove ID now so a new knock by same user gets new, unfaded box
      box.removeAttr('id').fadeOut("fast", function()
      {
        box.remove();
      });

      knocksToIgnore[userId] = true;
      window.setTimeout(function()
      {
        delete knocksToIgnore[userId];
      }, 5000);
    },
    answerGuestPrompt: function(encodedUserId, approve)
    {
      var guestId = padutils.decodeUserId(encodedUserId);

      var msg = {
        type: 'guestanswer',
        authId: pad.getUserId(),
        guestId: guestId,
        answer: (approve ? "approved" : "denied")
      };
      pad.sendClientMessage(msg);

      self.removeGuestPrompt(guestId);
    },
    renderMyUserInfo: function()
    {
      if (myUserInfo.name)
      {
        $("#myusernameedit").removeClass("editempty").val(myUserInfo.name);
      }
      else
      {
        $("#myusernameedit").addClass("editempty").val(_("pad.userlist.entername"));
      }
      if (colorPickerOpen)
      {
        $("#myswatchbox").addClass('myswatchboxunhoverable').removeClass('myswatchboxhoverable');
      }
      else
      {
        $("#myswatchbox").addClass('myswatchboxhoverable').removeClass('myswatchboxunhoverable');
      }

      $("#myswatch").css({'background-color': myUserInfo.colorId});

      if (browser.msie && parseInt(browser.version) <= 8) {
        $("li[data-key=showusers] > a").css({'box-shadow': 'inset 0 0 30px ' + myUserInfo.colorId,'background-color': myUserInfo.colorId});
      }
      else
      {
        $("li[data-key=showusers] > a").css({'box-shadow': 'inset 0 0 30px ' + myUserInfo.colorId});
      }
    }
  };
  return self;
}());

function getColorPickerSwatchIndex(jnode)
{
  //  return Number(jnode.get(0).className.match(/\bn([0-9]+)\b/)[1])-1;
  return $("#colorpickerswatches li").index(jnode);
}

function closeColorPicker(accept)
{
  if (accept)
  {
    var newColor = $("#mycolorpickerpreview").css("background-color");
    var parts = newColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    // parts now should be ["rgb(0, 70, 255", "0", "70", "255"]
    if (parts) {
      delete (parts[0]);
      for (var i = 1; i <= 3; ++i) {
          parts[i] = parseInt(parts[i]).toString(16);
          if (parts[i].length == 1) parts[i] = '0' + parts[i];
      }
      var newColor = "#" +parts.join(''); // "0070ff"
    }
    myUserInfo.colorId = newColor;
    pad.notifyChangeColor(newColor);
    paduserlist.renderMyUserInfo();
  }
  else
  {
    //pad.notifyChangeColor(previousColorId);
    //paduserlist.renderMyUserInfo();
  }

  colorPickerOpen = false;
  $("#mycolorpicker").fadeOut("fast");
}

function showColorPicker()
{
  previousColorId = myUserInfo.colorId;

  if (!colorPickerOpen)
  {
    var palette = pad.getColorPalette();

    if (!colorPickerSetup)
    {
      var colorsList = $("#colorpickerswatches")
      for (var i = 0; i < palette.length; i++)
      {

        var li = $('<li>', {
          style: 'background: ' + palette[i] + ';'
        });

        li.appendTo(colorsList);

        li.bind('click', function(event)
        {
          $("#colorpickerswatches li").removeClass('picked');
          $(event.target).addClass("picked");

          var newColorId = getColorPickerSwatchIndex($("#colorpickerswatches .picked"));
          pad.notifyChangeColor(newColorId);
        });

      }

      colorPickerSetup = true;
    }

    $("#mycolorpicker").fadeIn();
    colorPickerOpen = true;

    $("#colorpickerswatches li").removeClass('picked');
    $($("#colorpickerswatches li")[myUserInfo.colorId]).addClass("picked"); //seems weird
  }
}

exports.paduserlist = paduserlist;

}
, "ep_etherpad-lite/static/js/pad_impexp.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var padimpexp = (function()
{

  ///// import
  var currentImportTimer = null;

  function addImportFrames()
  {
    $("#import .importframe").remove();
    var iframe = $('<iframe style="display: none;" name="importiframe" class="importframe"></iframe>');
    $('#import').append(iframe);
  }

  function fileInputUpdated()
  {
    $('#importsubmitinput').addClass('throbbold');
    $('#importformfilediv').addClass('importformenabled');
    $('#importsubmitinput').removeAttr('disabled');
    $('#importmessagefail').fadeOut('fast');
  }

  function fileInputSubmit()
  {
    $('#importmessagefail').fadeOut("fast");
    var ret = window.confirm(html10n.get("pad.impexp.confirmimport"));
    if (ret)
    {        
      currentImportTimer = window.setTimeout(function()
      {
        if (!currentImportTimer)
        {
          return;
        }
        currentImportTimer = null;
        importFailed("Request timed out.");
        importDone();
      }, 25000); // time out after some number of seconds
      $('#importsubmitinput').attr(
      {
        disabled: true
      }).val(html10n.get("pad.impexp.importing"));
      
      window.setTimeout(function()
      {
        $('#importfileinput').attr(
        {
          disabled: true
        });
      }, 0);
      $('#importarrow').stop(true, true).hide();
      $('#importstatusball').show();
    }
    return ret;
  }

  function importFailed(msg)
  {
    importErrorMessage(msg);
  }

  function importDone()
  {
    $('#importsubmitinput').removeAttr('disabled').val(html10n.get("pad.impexp.importbutton"));
    window.setTimeout(function()
    {
      $('#importfileinput').removeAttr('disabled');
    }, 0);
    $('#importstatusball').hide();
    importClearTimeout();
    addImportFrames();
  }

  function importClearTimeout()
  {
    if (currentImportTimer)
    {
      window.clearTimeout(currentImportTimer);
      currentImportTimer = null;
    }
  }

  function importErrorMessage(status)
  {
    var msg="";
  
    if(status === "convertFailed"){
      msg = html10n.get("pad.impexp.convertFailed");
    } else if(status === "uploadFailed"){
      msg = html10n.get("pad.impexp.uploadFailed");
    } else if(status === "padHasData"){
      msg = html10n.get("pad.impexp.padHasData");
    }
  
    function showError(fade)
    {
      $('#importmessagefail').html('<strong style="color: red">'+html10n.get('pad.impexp.importfailed')+':</strong> ' + (msg || html10n.get('pad.impexp.copypaste','')))[(fade ? "fadeIn" : "show")]();
    }

    if ($('#importexport .importmessage').is(':visible'))
    {
      $('#importmessagesuccess').fadeOut("fast");
      $('#importmessagefail').fadeOut("fast", function()
      {
        showError(true);
      });
    }
    else
    {
      showError();
    }
  }

  function importSuccessful(token)
  {
    $.ajax(
    {
      type: 'post',
      url: '/ep/pad/impexp/import2',
      data: {
        token: token,
        padId: pad.getPadId()
      },
      success: importApplicationSuccessful,
      error: importApplicationFailed,
      timeout: 25000
    });
    addImportFrames();
  }

  function importApplicationFailed(xhr, textStatus, errorThrown)
  {
    importErrorMessage("Error during conversion.");
    importDone();
  }

  ///// export

  function cantExport()
  {
    var type = $(this);
    if (type.hasClass("exporthrefpdf"))
    {
      type = "PDF";
    }
    else if (type.hasClass("exporthrefdoc"))
    {
      type = "Microsoft Word";
    }
    else if (type.hasClass("exporthrefodt"))
    {
      type = "OpenDocument";
    }
    else
    {
      type = "this file";
    }
    alert(html10n.get("pad.impexp.exportdisabled", {type:type}));
    return false;
  }

  /////
  var pad = undefined;
  var self = {
    init: function(_pad)
    {
      pad = _pad;

      //get /p/padname
      // if /p/ isn't available due to a rewrite we use the clientVars padId
      var pad_root_path = new RegExp(/.*\/p\/[^\/]+/).exec(document.location.pathname) || clientVars.padId;
      //get http://example.com/p/padname without Params
      var pad_root_url = document.location.protocol + '//' + document.location.host + document.location.pathname;

      //i10l buttom import
      $('#importsubmitinput').val(html10n.get("pad.impexp.importbutton"));
      html10n.bind('localized', function() {
        $('#importsubmitinput').val(html10n.get("pad.impexp.importbutton"));
      })

      // build the export links
      $("#exporthtmla").attr("href", pad_root_path + "/export/html");
      $("#exportetherpada").attr("href", pad_root_path + "/export/etherpad");
      $("#exportplaina").attr("href", pad_root_path + "/export/txt");

      // activate action to import in the form
      $("#importform").attr('action', pad_root_url + "/import");
      
      //hide stuff thats not avaible if abiword is disabled
      if(clientVars.abiwordAvailable == "no")
      {
        $("#exportworda").remove();
        $("#exportpdfa").remove();
        $("#exportopena").remove();

        $("#importmessageabiword").show();
      }
      else if(clientVars.abiwordAvailable == "withoutPDF")
      {
        $("#exportpdfa").remove();
        
        $("#exportworda").attr("href", pad_root_path + "/export/doc");
        $("#exportopena").attr("href", pad_root_path + "/export/odt");
        
        $("#importexport").css({"height":"142px"});
        $("#importexportline").css({"height":"142px"});
      }
      else
      {
        $("#exportworda").attr("href", pad_root_path + "/export/doc");
        $("#exportpdfa").attr("href", pad_root_path + "/export/pdf");
        $("#exportopena").attr("href", pad_root_path + "/export/odt");
      }
    
      addImportFrames();
      $("#importfileinput").change(fileInputUpdated);
      $('#importform').unbind("submit").submit(fileInputSubmit);
      $('.disabledexport').click(cantExport);
    },
    handleFrameCall: function(directDatabaseAccess, status)
    {
      if (status !== "ok")
      {
        importFailed(status);
      }
      if(directDatabaseAccess) pad.switchToPad(clientVars.padId);
      importDone();
    },
    disable: function()
    {
      $("#impexp-disabled-clickcatcher").show();
      $("#import").css('opacity', 0.5);
      $("#impexp-export").css('opacity', 0.5);
    },
    enable: function()
    {
      $("#impexp-disabled-clickcatcher").hide();
      $("#import").css('opacity', 1);
      $("#impexp-export").css('opacity', 1);
    }
  };
  return self;
}());

exports.padimpexp = padimpexp;

}
, "ep_etherpad-lite/static/js/pad_savedrevs.js": function (require, exports, module) {
/**
 * Copyright 2012 Peter 'Pita' Martischka
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var pad;

exports.saveNow = function(){
  pad.collabClient.sendMessage({"type": "SAVE_REVISION"});
  $.gritter.add({
    // (string | mandatory) the heading of the notification
    title: _("pad.savedrevs.marked"),
    // (string | mandatory) the text inside the notification
    text: _("pad.savedrevs.timeslider") || "You can view saved revisions in the timeslider",
    // (bool | optional) if you want it to fade out on its own or just sit there
    sticky: false,
    // (int | optional) the time you want it to be alive for before fading out
    time: '2000'
  });
}

exports.init = function(_pad){
  pad = _pad;
}

}
, "ep_etherpad-lite/static/js/pad_connectionstatus.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var padmodals = require('./pad_modals').padmodals;

var padconnectionstatus = (function()
{

  var status = {
    what: 'connecting'
  };

  var self = {
    init: function()
    {
      $('button#forcereconnect').click(function()
      {
        window.location.reload();
      });
    },
    connected: function()
    {
      status = {
        what: 'connected'
      };
      padmodals.showModal('connected');
      padmodals.hideOverlay();
    },
    reconnecting: function()
    {
      status = {
        what: 'reconnecting'
      };
      
      padmodals.showModal('reconnecting');
      padmodals.showOverlay();
    },
    disconnected: function(msg)
    {
      if(status.what == "disconnected")
        return;
      
      status = {
        what: 'disconnected',
        why: msg
      };
      
      var k = String(msg); // known reason why
      if (!(k == 'userdup' || k == 'deleted' || k == 'looping' || k == 'slowcommit' || k == 'initsocketfail' || k == 'unauth' || k == 'badChangeset' || k == 'corruptPad'))
      {
        k = 'disconnected';
      }

      padmodals.showModal(k);
      padmodals.showOverlay();
    },
    isFullyConnected: function()
    {
      return status.what == 'connected';
    },
    getStatus: function()
    {
      return status;
    }
  };
  return self;
}());

exports.padconnectionstatus = padconnectionstatus;

}
, "ep_etherpad-lite/static/js/chat.js": function (require, exports, module) {
/**
 * Copyright 2009 Google Inc., 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var padutils = require('./pad_utils').padutils;
var padcookie = require('./pad_cookie').padcookie;
var Tinycon = require('tinycon/tinycon');
var hooks = require('./pluginfw/hooks');
var padeditor = require('./pad_editor').padeditor;

var chat = (function()
{
  var isStuck = false;
  var userAndChat = false;
  var gotInitialMessages = false;
  var historyPointer = 0;
  var chatMentions = 0;
  var self = {
    show: function () 
    {      
      $("#chaticon").hide();
      $("#chatbox").show();
      $("#gritter-notice-wrapper").hide();
      self.scrollDown();
      chatMentions = 0;
      Tinycon.setBubble(0);
    },
    focus: function () 
    {
      setTimeout(function(){
        $("#chatinput").focus();
      },100);
    },
    stickToScreen: function(fromInitialCall) // Make chat stick to right hand side of screen
    {
      chat.show();
      if(!isStuck || fromInitialCall) { // Stick it to
        padcookie.setPref("chatAlwaysVisible", true);
        $('#chatbox').addClass("stickyChat");
        $('#titlesticky').hide();
        $('#editorcontainer').css({"right":"192px"});
        $('.stickyChat').css("top",$('#editorcontainer').offset().top+"px");
        isStuck = true;
      } else { // Unstick it
        padcookie.setPref("chatAlwaysVisible", false);
        $('.stickyChat').css("top", "auto");
        $('#chatbox').removeClass("stickyChat");
        $('#titlesticky').show();
        $('#editorcontainer').css({"right":"0px"});
        isStuck = false;
      }
    },
    chatAndUsers: function(fromInitialCall)
    {
      var toEnable = $('#options-chatandusers').is(":checked");
      if(toEnable || !userAndChat || fromInitialCall){
        padcookie.setPref("chatAndUsers", true);
        chat.stickToScreen(true);
        $('#options-stickychat').prop('checked', true)
        $('#options-chatandusers').prop('checked', true)
        $('#options-stickychat').prop("disabled", "disabled");
        $('#users').addClass("chatAndUsers");
        $("#chatbox").addClass("chatAndUsersChat");
        // redraw
        userAndChat = true;
        padeditbar.redrawHeight()
      }else{
        padcookie.setPref("chatAndUsers", false);
        $('#options-stickychat').prop("disabled", false);
        $('#users').removeClass("chatAndUsers");
        $("#chatbox").removeClass("chatAndUsersChat");
      }
    },
    hide: function () 
    {
      // decide on hide logic based on chat window being maximized or not 
      if ($('#options-stickychat').prop('checked')) {
        chat.stickToScreen();
        $('#options-stickychat').prop('checked', false);
      }
      else {  
        $("#chatcounter").text("0");
        $("#chaticon").show();
        $("#chatbox").hide();
        $.gritter.removeAll();
        $("#gritter-notice-wrapper").show();
      }
    },
    scrollDown: function()
    {
      if($('#chatbox').css("display") != "none"){
        if(!self.lastMessage || !self.lastMessage.position() || self.lastMessage.position().top < $('#chattext').height()) {
          // if we use a slow animate here we can have a race condition when a users focus can not be moved away
          // from the last message recieved.
          $('#chattext').animate({scrollTop: $('#chattext')[0].scrollHeight}, { duration: 400, queue: false });
          self.lastMessage = $('#chattext > p').eq(-1);
        }
      }
    }, 
    send: function()
    {
      var text = $("#chatinput").val();
      if(text.replace(/\s+/,'').length == 0)
        return;
      this._pad.collabClient.sendMessage({"type": "CHAT_MESSAGE", "text": text});
      $("#chatinput").val("");
    },
    addMessage: function(msg, increment, isHistoryAdd)
    {
      //correct the time
      msg.time += this._pad.clientTimeOffset;
      
      //create the time string
      var minutes = "" + new Date(msg.time).getMinutes();
      var hours = "" + new Date(msg.time).getHours();
      if(minutes.length == 1)
        minutes = "0" + minutes ;
      if(hours.length == 1)
        hours = "0" + hours ;
      var timeStr = hours + ":" + minutes;
        
      //create the authorclass
      var authorClass = "author-" + msg.userId.replace(/[^a-y0-9]/g, function(c)
      {
        if (c == ".") return "-";
        return 'z' + c.charCodeAt(0) + 'z';
      });

      var text = padutils.escapeHtmlWithClickableLinks(msg.text, "_blank");

      var authorName = msg.userName == null ? _('pad.userlist.unnamed') : padutils.escapeHtml(msg.userName);

      // the hook args
      var ctx = {
        "authorName" : authorName,
        "author" : msg.userId,
        "text" : text,
        "sticky" : false,
        "timestamp" : msg.time,
        "timeStr" : timeStr
      }

      // is the users focus already in the chatbox?
      var alreadyFocused = $("#chatinput").is(":focus");

      // does the user already have the chatbox open?
      var chatOpen = $("#chatbox").is(":visible");

      // does this message contain this user's name? (is the curretn user mentioned?)
      var myName = $('#myusernameedit').val();
      var wasMentioned = (text.toLowerCase().indexOf(myName.toLowerCase()) !== -1 && myName != "undefined");

      if(wasMentioned && !alreadyFocused && !isHistoryAdd && !chatOpen)
      { // If the user was mentioned show for twice as long and flash the browser window
        chatMentions++;
        Tinycon.setBubble(chatMentions);
        ctx.sticky = true;
      }

      // Call chat message hook
      hooks.aCallAll("chatNewMessage", ctx, function() {

        var html = "<p data-authorId='" + msg.userId + "' class='" + authorClass + "'><b>" + authorName + ":</b><span class='time " + authorClass + "'>" + ctx.timeStr + "</span> " + ctx.text + "</p>";
        if(isHistoryAdd)
          $(html).insertAfter('#chatloadmessagesbutton');
        else
          $("#chattext").append(html);

        //should we increment the counter??
        if(increment && !isHistoryAdd)
        {
          // Update the counter of unread messages
          var count = Number($("#chatcounter").text());
          count++;
          $("#chatcounter").text(count);

          if(!chatOpen) {
            $.gritter.add({
              // (string | mandatory) the heading of the notification
              title: ctx.authorName,
              // (string | mandatory) the text inside the notification
              text: ctx.text,
              // (bool | optional) if you want it to fade out on its own or just sit there
              sticky: ctx.sticky,
              // (int | optional) the time you want it to be alive for before fading out
              time: '4000'
            });
          }
        }
      });

      // Clear the chat mentions when the user clicks on the chat input box
      $('#chatinput').click(function(){
        chatMentions = 0;
        Tinycon.setBubble(0);
      });
      if(!isHistoryAdd)
        self.scrollDown();
    },
    init: function(pad)
    {
      this._pad = pad;
      $("#chatinput").on("keydown", function(evt){
        // If the event is Alt C or Escape & we're already in the chat menu
        // Send the users focus back to the pad
        if((evt.altKey == true && evt.which === 67) || evt.which === 27){
          // If we're in chat already..
          $(':focus').blur(); // required to do not try to remove!
          padeditor.ace.focus(); // Sends focus back to pad
          evt.preventDefault();
          return false;
        }
      });

      $('body:not(#chatinput)').on("keypress", function(evt){
        if (evt.altKey && evt.which == 67){
          // Alt c focuses on the Chat window
          $(this).blur();
          chat.show();
          $("#chatinput").focus();
          evt.preventDefault();
        }
      });

      $("#chatinput").keypress(function(evt){
        //if the user typed enter, fire the send
        if(evt.which == 13 || evt.which == 10)
        {
          evt.preventDefault();
          self.send();
        }
      });

      // initial messages are loaded in pad.js' _afterHandshake

      $("#chatcounter").text(0);
      $("#chatloadmessagesbutton").click(function()
      {
        var start = Math.max(self.historyPointer - 20, 0);
        var end = self.historyPointer;

        if(start == end) // nothing to load
          return;

        $("#chatloadmessagesbutton").css("display", "none");
        $("#chatloadmessagesball").css("display", "block");

        pad.collabClient.sendMessage({"type": "GET_CHAT_MESSAGES", "start": start, "end": end});
        self.historyPointer = start;
      });
    }
  }

  return self;
}());

exports.chat = chat;


}
, "ep_etherpad-lite/static/js/gritter.js": function (require, exports, module) {
/*
 * Gritter for jQuery
 * http://www.boedesign.com/
 *
 * Copyright (c) 2012 Jordan Boesch
 * Dual licensed under the MIT and GPL licenses.
 *
 * Date: February 24, 2012
 * Version: 1.7.4
 */

(function($){
	/**
	* Set it up as an object under the jQuery namespace
	*/
	$.gritter = {};
	
	/**
	* Set up global options that the user can over-ride
	*/
	$.gritter.options = {
		position: '',
		class_name: '', // could be set to 'gritter-light' to use white notifications
		time: 6000 // hang on the screen for...
	}
	
	/**
	* Add a gritter notification to the screen
	* @see Gritter#add();
	*/
	$.gritter.add = function(params){

		try {
			return Gritter.add(params || {});
		} catch(e) {
		
			var err = 'Gritter Error: ' + e;
			(typeof(console) != 'undefined' && console.error) ? 
				console.error(err, params) : 
				alert(err);
				
		}
		
	}
	
	/**
	* Remove a gritter notification from the screen
	* @see Gritter#removeSpecific();
	*/
	$.gritter.remove = function(id, params){
		Gritter.removeSpecific(id, params || {});
	}
	
	/**
	* Remove all notifications
	* @see Gritter#stop();
	*/
	$.gritter.removeAll = function(params){
		Gritter.stop(params || {});
	}
	
	/**
	* Big fat Gritter object
	* @constructor (not really since its object literal)
	*/
	var Gritter = {
		
		// Public - options to over-ride with $.gritter.options in "add"
		position: '',
		fade_in_speed: '',
		fade_out_speed: '',
		time: '',
		
		// Private - no touchy the private parts
		_custom_timer: 0,
		_item_count: 0,
		_is_setup: 0,
		_tpl_close: '<div class="gritter-close"></div>',
		_tpl_title: '<span class="gritter-title">[[title]]</span>',
		_tpl_item: '<div id="gritter-item-[[number]]" class="gritter-item-wrapper [[item_class]]" style="display:none"><div class="gritter-top"></div><div class="gritter-item">[[close]][[image]]<div class="[[class_name]]">[[title]]<p>[[text]]</p></div><div style="clear:both"></div></div><div class="gritter-bottom"></div></div>',
		_tpl_wrap: '<div id="gritter-notice-wrapper" aria-live="polite" aria-atomic="false" aria-relevant="additions" role="log"></div>',
		
		/**
		* Add a gritter notification to the screen
		* @param {Object} params The object that contains all the options for drawing the notification
		* @return {Integer} The specific numeric id to that gritter notification
		*/
		add: function(params){
			// Handle straight text
			if(typeof(params) == 'string'){
				params = {text:params};
			}

			// We might have some issues if we don't have a title or text!
			if(!params.text){
				throw 'You must supply "text" parameter.'; 
			}
			
			// Check the options and set them once
			if(!this._is_setup){
				this._runSetup();
			}
			
			// Basics
			var title = params.title, 
				text = params.text,
				image = params.image || '',
				sticky = params.sticky || false,
				item_class = params.class_name || $.gritter.options.class_name,
				position = $.gritter.options.position,
				time_alive = params.time || '';

			this._verifyWrapper();
			
			this._item_count++;
			var number = this._item_count, 
				tmp = this._tpl_item;
			
			// Assign callbacks
			$(['before_open', 'after_open', 'before_close', 'after_close']).each(function(i, val){
				Gritter['_' + val + '_' + number] = ($.isFunction(params[val])) ? params[val] : function(){}
			});

			// Reset
			this._custom_timer = 0;
			
			// A custom fade time set
			if(time_alive){
				this._custom_timer = time_alive;
			}
			
			var image_str = (image != '') ? '<img src="' + image + '" class="gritter-image" />' : '',
				class_name = (image != '') ? 'gritter-with-image' : 'gritter-without-image';
			
			// String replacements on the template
			if(title){
				title = this._str_replace('[[title]]',title,this._tpl_title);
			}else{
				title = '';
			}
			
			tmp = this._str_replace(
				['[[title]]', '[[text]]', '[[close]]', '[[image]]', '[[number]]', '[[class_name]]', '[[item_class]]'],
				[title, text, this._tpl_close, image_str, this._item_count, class_name, item_class], tmp
			);

			// If it's false, don't show another gritter message
			if(this['_before_open_' + number]() === false){
				return false;
			}

			$('#gritter-notice-wrapper').addClass(position).append(tmp);
			
			var item = $('#gritter-item-' + this._item_count);
			
			item.fadeIn(this.fade_in_speed, function(){
				Gritter['_after_open_' + number]($(this));
			});
			
			if(!sticky){
				this._setFadeTimer(item, number);
			}
			
			// Bind the hover/unhover states
			$(item).bind('mouseenter mouseleave', function(event){
				if(event.type == 'mouseenter'){
					if(!sticky){ 
						Gritter._restoreItemIfFading($(this), number);
					}
				}
				else {
					if(!sticky){
						Gritter._setFadeTimer($(this), number);
					}
				}
				Gritter._hoverState($(this), event.type);
			});
			
			// Clicking (X) makes the perdy thing close
			$(item).find('.gritter-close').click(function(){
				Gritter.removeSpecific(number, {}, null, true);
			});
			
			return number;
		
		},
		
		/**
		* If we don't have any more gritter notifications, get rid of the wrapper using this check
		* @private
		* @param {Integer} unique_id The ID of the element that was just deleted, use it for a callback
		* @param {Object} e The jQuery element that we're going to perform the remove() action on
		* @param {Boolean} manual_close Did we close the gritter dialog with the (X) button
		*/
		_countRemoveWrapper: function(unique_id, e, manual_close){
			
			// Remove it then run the callback function
			e.remove();
			this['_after_close_' + unique_id](e, manual_close);
			
			// Check if the wrapper is empty, if it is.. remove the wrapper
			if($('.gritter-item-wrapper').length == 0){
				$('#gritter-notice-wrapper').remove();
			}
		
		},
		
		/**
		* Fade out an element after it's been on the screen for x amount of time
		* @private
		* @param {Object} e The jQuery element to get rid of
		* @param {Integer} unique_id The id of the element to remove
		* @param {Object} params An optional list of params to set fade speeds etc.
		* @param {Boolean} unbind_events Unbind the mouseenter/mouseleave events if they click (X)
		*/
		_fade: function(e, unique_id, params, unbind_events){

			var params = params || {},
				fade = (typeof(params.fade) != 'undefined') ? params.fade : true,
				fade_out_speed = params.speed || this.fade_out_speed,
				manual_close = unbind_events;

			this['_before_close_' + unique_id](e, manual_close);
			
			// If this is true, then we are coming from clicking the (X)
			if(unbind_events){
				e.unbind('mouseenter mouseleave');
			}
			
			// Fade it out or remove it
			if(fade){
			
				e.animate({
					opacity: 0
				}, fade_out_speed, function(){
					e.animate({ height: 0 }, 300, function(){
						Gritter._countRemoveWrapper(unique_id, e, manual_close);
					})
				})
				
			}
			else {
				
				this._countRemoveWrapper(unique_id, e);
				
			}
						
		},
		
		/**
		* Perform actions based on the type of bind (mouseenter, mouseleave) 
		* @private
		* @param {Object} e The jQuery element
		* @param {String} type The type of action we're performing: mouseenter or mouseleave
		*/
		_hoverState: function(e, type){
			
			// Change the border styles and add the (X) close button when you hover
			if(type == 'mouseenter'){
				
				e.addClass('hover');
				
				// Show close button
				e.find('.gritter-close').show();
						
			}
			// Remove the border styles and hide (X) close button when you mouse out
			else {
				
				e.removeClass('hover');
				
				// Hide close button
				e.find('.gritter-close').hide();
				
			}
			
		},
		
		/**
		* Remove a specific notification based on an ID
		* @param {Integer} unique_id The ID used to delete a specific notification
		* @param {Object} params A set of options passed in to determine how to get rid of it
		* @param {Object} e The jQuery element that we're "fading" then removing
		* @param {Boolean} unbind_events If we clicked on the (X) we set this to true to unbind mouseenter/mouseleave
		*/
		removeSpecific: function(unique_id, params, e, unbind_events){
			
			if(!e){
				var e = $('#gritter-item-' + unique_id);
			}

			// We set the fourth param to let the _fade function know to 
			// unbind the "mouseleave" event.  Once you click (X) there's no going back!
			this._fade(e, unique_id, params || {}, unbind_events);
			
		},
		
		/**
		* If the item is fading out and we hover over it, restore it!
		* @private
		* @param {Object} e The HTML element to remove
		* @param {Integer} unique_id The ID of the element
		*/
		_restoreItemIfFading: function(e, unique_id){
			
			clearTimeout(this['_int_id_' + unique_id]);
			e.stop().css({ opacity: '', height: '' });
			
		},
		
		/**
		* Setup the global options - only once
		* @private
		*/
		_runSetup: function(){
		
			for(opt in $.gritter.options){
				this[opt] = $.gritter.options[opt];
			}
			this._is_setup = 1;
			
		},
		
		/**
		* Set the notification to fade out after a certain amount of time
		* @private
		* @param {Object} item The HTML element we're dealing with
		* @param {Integer} unique_id The ID of the element
		*/
		_setFadeTimer: function(e, unique_id){
			
			var timer_str = (this._custom_timer) ? this._custom_timer : this.time;
			this['_int_id_' + unique_id] = setTimeout(function(){ 
				Gritter._fade(e, unique_id);
			}, timer_str);
		
		},
		
		/**
		* Bring everything to a halt
		* @param {Object} params A list of callback functions to pass when all notifications are removed
		*/  
		stop: function(params){
			
			// callbacks (if passed)
			var before_close = ($.isFunction(params.before_close)) ? params.before_close : function(){};
			var after_close = ($.isFunction(params.after_close)) ? params.after_close : function(){};
			
			var wrap = $('#gritter-notice-wrapper');
			before_close(wrap);
			wrap.fadeOut(function(){
				$(this).remove();
				after_close();
			});
		
		},
		
		/**
		* An extremely handy PHP function ported to JS, works well for templating
		* @private
		* @param {String/Array} search A list of things to search for
		* @param {String/Array} replace A list of things to replace the searches with
		* @return {String} sa The output
		*/  
		_str_replace: function(search, replace, subject, count){
		
			var i = 0, j = 0, temp = '', repl = '', sl = 0, fl = 0,
				f = [].concat(search),
				r = [].concat(replace),
				s = subject,
				ra = r instanceof Array, sa = s instanceof Array;
			s = [].concat(s);
			
			if(count){
				this.window[count] = 0;
			}
		
			for(i = 0, sl = s.length; i < sl; i++){
				
				if(s[i] === ''){
					continue;
				}
				
				for (j = 0, fl = f.length; j < fl; j++){
					
					temp = s[i] + '';
					repl = ra ? (r[j] !== undefined ? r[j] : '') : r[0];
					s[i] = (temp).split(f[j]).join(repl);
					
					if(count && s[i] !== temp){
						this.window[count] += (temp.length-s[i].length) / f[j].length;
					}
					
				}
			}
			
			return sa ? s : s[0];
			
		},
		
		/**
		* A check to make sure we have something to wrap our notices with
		* @private
		*/  
		_verifyWrapper: function(){
		  
			if($('#gritter-notice-wrapper').length == 0){
				$('body').append(this._tpl_wrap);
			}
		
		}
		
	}
	
})(jQuery);

}
, "tinycon/tinycon.js": function (require, exports, module) {
/*!
 * Tinycon - A small library for manipulating the Favicon
 * Tom Moor, http://tommoor.com
 * Copyright (c) 2012 Tom Moor
 * MIT Licensed
 * @version 0.2.6
*/

(function(){
	
	var Tinycon = {};
	var currentFavicon = null;
	var originalFavicon = null;
	var originalTitle = document.title;
	var faviconImage = null;
	var canvas = null;
	var options = {};
	var defaults = {
		width: 7,
		height: 9,
		font: '10px arial',
		colour: '#ffffff',
		background: '#F03D25',
		fallback: true
	};
	
	var ua = (function () {
		var agent = navigator.userAgent.toLowerCase();
		// New function has access to 'agent' via closure
		return function (browser) {
			return agent.indexOf(browser) !== -1;
		};
	}());

	var browser = {
		ie: ua('msie'),
		chrome: ua('chrome'),
		webkit: ua('chrome') || ua('safari'),
		safari: ua('safari') && !ua('chrome'),
		mozilla: ua('mozilla') && !ua('chrome') && !ua('safari')
	};
	
	// private methods
	var getFaviconTag = function(){
		
		var links = document.getElementsByTagName('link');
		
		for(var i=0, len=links.length; i < len; i++) {
			if ((links[i].getAttribute('rel') || '').match(/\bicon\b/)) {
				return links[i];
			}
		}
		
		return false;
	};
	
	var removeFaviconTag = function(){
	
		var links = document.getElementsByTagName('link');
		var head = document.getElementsByTagName('head')[0];
		
		for(var i=0, len=links.length; i < len; i++) {
			var exists = (typeof(links[i]) !== 'undefined');
			if (exists && links[i].getAttribute('rel') === 'icon') {
				head.removeChild(links[i]);
			}
		}
	};
	
	var getCurrentFavicon = function(){
		
		if (!originalFavicon || !currentFavicon) {
			var tag = getFaviconTag();
			originalFavicon = currentFavicon = tag ? tag.getAttribute('href') : '/favicon.ico';
		}

		return currentFavicon;
	};
	
	var getCanvas = function (){
		
		if (!canvas) {
			canvas = document.createElement("canvas");
			canvas.width = 16;
			canvas.height = 16;
		}
		
		return canvas;
	};
	
	var setFaviconTag = function(url){
		removeFaviconTag();
		
		var link = document.createElement('link');
		link.type = 'image/x-icon';
		link.rel = 'icon';
		link.href = url;
		document.getElementsByTagName('head')[0].appendChild(link);
	};
	
	var log = function(message){
		if (window.console) window.console.log(message);
	};
	
	var drawFavicon = function(num, colour) {

		// fallback to updating the browser title if unsupported
		if (!getCanvas().getContext || browser.ie || browser.safari || options.fallback === 'force') {
			return updateTitle(num);
		}
		
		var context = getCanvas().getContext("2d");
		var colour = colour || '#000000';
		var num = num || 0;
		var src = getCurrentFavicon();
		
		faviconImage = new Image();
		faviconImage.onload = function() {
			
			// clear canvas  
			context.clearRect(0, 0, 16, 16);

			// draw original favicon
			context.drawImage(faviconImage, 0, 0, faviconImage.width, faviconImage.height, 0, 0, 16, 16);
			
			// draw bubble over the top
			if (num > 0) drawBubble(context, num, colour);
			
			// refresh tag in page
			refreshFavicon();
		};
		
		// allow cross origin resource requests if the image is not a data:uri
		// as detailed here: https://github.com/mrdoob/three.js/issues/1305
		if (!src.match(/^data/)) {
			faviconImage.crossOrigin = 'anonymous';
		}
		
		faviconImage.src = src;
	};
	
	var updateTitle = function(num) {
		
		if (options.fallback) {
			if (num > 0) {
				document.title = '('+num+') ' + originalTitle;
			} else {
				document.title = originalTitle;
			}
		}
	};
	
	var drawBubble = function(context, num, colour) {
		
		// bubble needs to be larger for double digits
		var len = (num+"").length-1;
		var width = options.width + (6*len);
		var w = 16-width;
		var h = 16-options.height;

		// webkit seems to render fonts lighter than firefox
		context.font = (browser.webkit ? 'bold ' : '') + options.font;
		context.fillStyle = options.background;
		context.strokeStyle = options.background;
		context.lineWidth = 1;
		
		// bubble
		context.fillRect(w,h,width-1,options.height);
		
		// rounded left
		context.beginPath();
		context.moveTo(w-0.5,h+1);
		context.lineTo(w-0.5,15);
		context.stroke();
		
		// rounded right
		context.beginPath();
		context.moveTo(15.5,h+1);
		context.lineTo(15.5,15);
		context.stroke();
		
		// bottom shadow
		context.beginPath();
		context.strokeStyle = "rgba(0,0,0,0.3)";
		context.moveTo(w,16);
		context.lineTo(15,16);
		context.stroke();
		
		// number
		context.fillStyle = options.colour;
		context.textAlign = "right";
		context.textBaseline = "top";
		
		// unfortunately webkit/mozilla are a pixel different in text positioning
		context.fillText(num, 15, browser.mozilla ? 7 : 6);  
	};
	
	var refreshFavicon = function(){
		// check support
		if (!getCanvas().getContext) return;
		
		setFaviconTag(getCanvas().toDataURL());
	};
	
	
	// public methods
	Tinycon.setOptions = function(custom){
		options = {};
		
		for(var key in defaults){
			options[key] = custom.hasOwnProperty(key) ? custom[key] : defaults[key];
		}
		return this;
	};
	
	Tinycon.setImage = function(url){
		currentFavicon = url;
		refreshFavicon();
		return this;
	};
	
	Tinycon.setBubble = function(num, colour){
		
		// validate
		if(isNaN(parseFloat(num)) || !isFinite(num)) return log('Bubble must be a number');
		
		drawFavicon(num, colour);
		return this;
	};
	
	Tinycon.reset = function(){
		Tinycon.setImage(originalFavicon);
	};
	
	Tinycon.setOptions(defaults);

  module.exports = Tinycon;

})();

}
, "ep_etherpad-lite/static/js/excanvas.js": function (require, exports, module) {
// Copyright 2006 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
document.createElement("canvas").getContext||(function(){var s=Math,j=s.round,F=s.sin,G=s.cos,V=s.abs,W=s.sqrt,k=10,v=k/2;function X(){return this.context_||(this.context_=new H(this))}var L=Array.prototype.slice;function Y(b,a){var c=L.call(arguments,2);return function(){return b.apply(a,c.concat(L.call(arguments)))}}var M={init:function(b){if(/MSIE/.test(navigator.userAgent)&&!window.opera){var a=b||document;a.createElement("canvas");a.attachEvent("onreadystatechange",Y(this.init_,this,a))}},init_:function(b){b.namespaces.g_vml_||
b.namespaces.add("g_vml_","urn:schemas-microsoft-com:vml","#default#VML");b.namespaces.g_o_||b.namespaces.add("g_o_","urn:schemas-microsoft-com:office:office","#default#VML");if(!b.styleSheets.ex_canvas_){var a=b.createStyleSheet();a.owningElement.id="ex_canvas_";a.cssText="canvas{display:inline-block;overflow:hidden;text-align:left;width:300px;height:150px}g_vml_\\:*{behavior:url(#default#VML)}g_o_\\:*{behavior:url(#default#VML)}"}var c=b.getElementsByTagName("canvas"),d=0;for(;d<c.length;d++)this.initElement(c[d])},
initElement:function(b){if(!b.getContext){b.getContext=X;b.innerHTML="";b.attachEvent("onpropertychange",Z);b.attachEvent("onresize",$);var a=b.attributes;if(a.width&&a.width.specified)b.style.width=a.width.nodeValue+"px";else b.width=b.clientWidth;if(a.height&&a.height.specified)b.style.height=a.height.nodeValue+"px";else b.height=b.clientHeight}return b}};function Z(b){var a=b.srcElement;switch(b.propertyName){case "width":a.style.width=a.attributes.width.nodeValue+"px";a.getContext().clearRect();
break;case "height":a.style.height=a.attributes.height.nodeValue+"px";a.getContext().clearRect();break}}function $(b){var a=b.srcElement;if(a.firstChild){a.firstChild.style.width=a.clientWidth+"px";a.firstChild.style.height=a.clientHeight+"px"}}M.init();var N=[],B=0;for(;B<16;B++){var C=0;for(;C<16;C++)N[B*16+C]=B.toString(16)+C.toString(16)}function I(){return[[1,0,0],[0,1,0],[0,0,1]]}function y(b,a){var c=I(),d=0;for(;d<3;d++){var f=0;for(;f<3;f++){var h=0,g=0;for(;g<3;g++)h+=b[d][g]*a[g][f];c[d][f]=
h}}return c}function O(b,a){a.fillStyle=b.fillStyle;a.lineCap=b.lineCap;a.lineJoin=b.lineJoin;a.lineWidth=b.lineWidth;a.miterLimit=b.miterLimit;a.shadowBlur=b.shadowBlur;a.shadowColor=b.shadowColor;a.shadowOffsetX=b.shadowOffsetX;a.shadowOffsetY=b.shadowOffsetY;a.strokeStyle=b.strokeStyle;a.globalAlpha=b.globalAlpha;a.arcScaleX_=b.arcScaleX_;a.arcScaleY_=b.arcScaleY_;a.lineScale_=b.lineScale_}function P(b){var a,c=1;b=String(b);if(b.substring(0,3)=="rgb"){var d=b.indexOf("(",3),f=b.indexOf(")",d+
1),h=b.substring(d+1,f).split(",");a="#";var g=0;for(;g<3;g++)a+=N[Number(h[g])];if(h.length==4&&b.substr(3,1)=="a")c=h[3]}else a=b;return{color:a,alpha:c}}function aa(b){switch(b){case "butt":return"flat";case "round":return"round";case "square":default:return"square"}}function H(b){this.m_=I();this.mStack_=[];this.aStack_=[];this.currentPath_=[];this.fillStyle=this.strokeStyle="#000";this.lineWidth=1;this.lineJoin="miter";this.lineCap="butt";this.miterLimit=k*1;this.globalAlpha=1;this.canvas=b;
var a=b.ownerDocument.createElement("div");a.style.width=b.clientWidth+"px";a.style.height=b.clientHeight+"px";a.style.overflow="hidden";a.style.position="absolute";b.appendChild(a);this.element_=a;this.lineScale_=this.arcScaleY_=this.arcScaleX_=1}var i=H.prototype;i.clearRect=function(){this.element_.innerHTML=""};i.beginPath=function(){this.currentPath_=[]};i.moveTo=function(b,a){var c=this.getCoords_(b,a);this.currentPath_.push({type:"moveTo",x:c.x,y:c.y});this.currentX_=c.x;this.currentY_=c.y};
i.lineTo=function(b,a){var c=this.getCoords_(b,a);this.currentPath_.push({type:"lineTo",x:c.x,y:c.y});this.currentX_=c.x;this.currentY_=c.y};i.bezierCurveTo=function(b,a,c,d,f,h){var g=this.getCoords_(f,h),l=this.getCoords_(b,a),e=this.getCoords_(c,d);Q(this,l,e,g)};function Q(b,a,c,d){b.currentPath_.push({type:"bezierCurveTo",cp1x:a.x,cp1y:a.y,cp2x:c.x,cp2y:c.y,x:d.x,y:d.y});b.currentX_=d.x;b.currentY_=d.y}i.quadraticCurveTo=function(b,a,c,d){var f=this.getCoords_(b,a),h=this.getCoords_(c,d),g={x:this.currentX_+
0.6666666666666666*(f.x-this.currentX_),y:this.currentY_+0.6666666666666666*(f.y-this.currentY_)};Q(this,g,{x:g.x+(h.x-this.currentX_)/3,y:g.y+(h.y-this.currentY_)/3},h)};i.arc=function(b,a,c,d,f,h){c*=k;var g=h?"at":"wa",l=b+G(d)*c-v,e=a+F(d)*c-v,m=b+G(f)*c-v,r=a+F(f)*c-v;if(l==m&&!h)l+=0.125;var n=this.getCoords_(b,a),o=this.getCoords_(l,e),q=this.getCoords_(m,r);this.currentPath_.push({type:g,x:n.x,y:n.y,radius:c,xStart:o.x,yStart:o.y,xEnd:q.x,yEnd:q.y})};i.rect=function(b,a,c,d){this.moveTo(b,
a);this.lineTo(b+c,a);this.lineTo(b+c,a+d);this.lineTo(b,a+d);this.closePath()};i.strokeRect=function(b,a,c,d){var f=this.currentPath_;this.beginPath();this.moveTo(b,a);this.lineTo(b+c,a);this.lineTo(b+c,a+d);this.lineTo(b,a+d);this.closePath();this.stroke();this.currentPath_=f};i.fillRect=function(b,a,c,d){var f=this.currentPath_;this.beginPath();this.moveTo(b,a);this.lineTo(b+c,a);this.lineTo(b+c,a+d);this.lineTo(b,a+d);this.closePath();this.fill();this.currentPath_=f};i.createLinearGradient=function(b,
a,c,d){var f=new D("gradient");f.x0_=b;f.y0_=a;f.x1_=c;f.y1_=d;return f};i.createRadialGradient=function(b,a,c,d,f,h){var g=new D("gradientradial");g.x0_=b;g.y0_=a;g.r0_=c;g.x1_=d;g.y1_=f;g.r1_=h;return g};i.drawImage=function(b){var a,c,d,f,h,g,l,e,m=b.runtimeStyle.width,r=b.runtimeStyle.height;b.runtimeStyle.width="auto";b.runtimeStyle.height="auto";var n=b.width,o=b.height;b.runtimeStyle.width=m;b.runtimeStyle.height=r;if(arguments.length==3){a=arguments[1];c=arguments[2];h=g=0;l=d=n;e=f=o}else if(arguments.length==
5){a=arguments[1];c=arguments[2];d=arguments[3];f=arguments[4];h=g=0;l=n;e=o}else if(arguments.length==9){h=arguments[1];g=arguments[2];l=arguments[3];e=arguments[4];a=arguments[5];c=arguments[6];d=arguments[7];f=arguments[8]}else throw Error("Invalid number of arguments");var q=this.getCoords_(a,c),t=[];t.push(" <g_vml_:group",' coordsize="',k*10,",",k*10,'"',' coordorigin="0,0"',' style="width:',10,"px;height:",10,"px;position:absolute;");if(this.m_[0][0]!=1||this.m_[0][1]){var E=[];E.push("M11=",
this.m_[0][0],",","M12=",this.m_[1][0],",","M21=",this.m_[0][1],",","M22=",this.m_[1][1],",","Dx=",j(q.x/k),",","Dy=",j(q.y/k),"");var p=q,z=this.getCoords_(a+d,c),w=this.getCoords_(a,c+f),x=this.getCoords_(a+d,c+f);p.x=s.max(p.x,z.x,w.x,x.x);p.y=s.max(p.y,z.y,w.y,x.y);t.push("padding:0 ",j(p.x/k),"px ",j(p.y/k),"px 0;filter:progid:DXImageTransform.Microsoft.Matrix(",E.join(""),", sizingmethod='clip');")}else t.push("top:",j(q.y/k),"px;left:",j(q.x/k),"px;");t.push(' ">','<g_vml_:image src="',b.src,
'"',' style="width:',k*d,"px;"," height:",k*f,'px;"',' cropleft="',h/n,'"',' croptop="',g/o,'"',' cropright="',(n-h-l)/n,'"',' cropbottom="',(o-g-e)/o,'"'," />","</g_vml_:group>");this.element_.insertAdjacentHTML("BeforeEnd",t.join(""))};i.stroke=function(b){var a=[],c=P(b?this.fillStyle:this.strokeStyle),d=c.color,f=c.alpha*this.globalAlpha;a.push("<g_vml_:shape",' filled="',!!b,'"',' style="position:absolute;width:',10,"px;height:",10,'px;"',' coordorigin="0 0" coordsize="',k*10," ",k*10,'"',' stroked="',
!b,'"',' path="');var h={x:null,y:null},g={x:null,y:null},l=0;for(;l<this.currentPath_.length;l++){var e=this.currentPath_[l];switch(e.type){case "moveTo":a.push(" m ",j(e.x),",",j(e.y));break;case "lineTo":a.push(" l ",j(e.x),",",j(e.y));break;case "close":a.push(" x ");e=null;break;case "bezierCurveTo":a.push(" c ",j(e.cp1x),",",j(e.cp1y),",",j(e.cp2x),",",j(e.cp2y),",",j(e.x),",",j(e.y));break;case "at":case "wa":a.push(" ",e.type," ",j(e.x-this.arcScaleX_*e.radius),",",j(e.y-this.arcScaleY_*e.radius),
" ",j(e.x+this.arcScaleX_*e.radius),",",j(e.y+this.arcScaleY_*e.radius)," ",j(e.xStart),",",j(e.yStart)," ",j(e.xEnd),",",j(e.yEnd));break}if(e){if(h.x==null||e.x<h.x)h.x=e.x;if(g.x==null||e.x>g.x)g.x=e.x;if(h.y==null||e.y<h.y)h.y=e.y;if(g.y==null||e.y>g.y)g.y=e.y}}a.push(' ">');if(b)if(typeof this.fillStyle=="object"){var m=this.fillStyle,r=0,n={x:0,y:0},o=0,q=1;if(m.type_=="gradient"){var t=m.x1_/this.arcScaleX_,E=m.y1_/this.arcScaleY_,p=this.getCoords_(m.x0_/this.arcScaleX_,m.y0_/this.arcScaleY_),
z=this.getCoords_(t,E);r=Math.atan2(z.x-p.x,z.y-p.y)*180/Math.PI;if(r<0)r+=360;if(r<1.0E-6)r=0}else{var p=this.getCoords_(m.x0_,m.y0_),w=g.x-h.x,x=g.y-h.y;n={x:(p.x-h.x)/w,y:(p.y-h.y)/x};w/=this.arcScaleX_*k;x/=this.arcScaleY_*k;var R=s.max(w,x);o=2*m.r0_/R;q=2*m.r1_/R-o}var u=m.colors_;u.sort(function(ba,ca){return ba.offset-ca.offset});var J=u.length,da=u[0].color,ea=u[J-1].color,fa=u[0].alpha*this.globalAlpha,ga=u[J-1].alpha*this.globalAlpha,S=[],l=0;for(;l<J;l++){var T=u[l];S.push(T.offset*q+
o+" "+T.color)}a.push('<g_vml_:fill type="',m.type_,'"',' method="none" focus="100%"',' color="',da,'"',' color2="',ea,'"',' colors="',S.join(","),'"',' opacity="',ga,'"',' g_o_:opacity2="',fa,'"',' angle="',r,'"',' focusposition="',n.x,",",n.y,'" />')}else a.push('<g_vml_:fill color="',d,'" opacity="',f,'" />');else{var K=this.lineScale_*this.lineWidth;if(K<1)f*=K;a.push("<g_vml_:stroke",' opacity="',f,'"',' joinstyle="',this.lineJoin,'"',' miterlimit="',this.miterLimit,'"',' endcap="',aa(this.lineCap),
'"',' weight="',K,'px"',' color="',d,'" />')}a.push("</g_vml_:shape>");this.element_.insertAdjacentHTML("beforeEnd",a.join(""))};i.fill=function(){this.stroke(true)};i.closePath=function(){this.currentPath_.push({type:"close"})};i.getCoords_=function(b,a){var c=this.m_;return{x:k*(b*c[0][0]+a*c[1][0]+c[2][0])-v,y:k*(b*c[0][1]+a*c[1][1]+c[2][1])-v}};i.save=function(){var b={};O(this,b);this.aStack_.push(b);this.mStack_.push(this.m_);this.m_=y(I(),this.m_)};i.restore=function(){O(this.aStack_.pop(),
this);this.m_=this.mStack_.pop()};function ha(b){var a=0;for(;a<3;a++){var c=0;for(;c<2;c++)if(!isFinite(b[a][c])||isNaN(b[a][c]))return false}return true}function A(b,a,c){if(!!ha(a)){b.m_=a;if(c)b.lineScale_=W(V(a[0][0]*a[1][1]-a[0][1]*a[1][0]))}}i.translate=function(b,a){A(this,y([[1,0,0],[0,1,0],[b,a,1]],this.m_),false)};i.rotate=function(b){var a=G(b),c=F(b);A(this,y([[a,c,0],[-c,a,0],[0,0,1]],this.m_),false)};i.scale=function(b,a){this.arcScaleX_*=b;this.arcScaleY_*=a;A(this,y([[b,0,0],[0,a,
0],[0,0,1]],this.m_),true)};i.transform=function(b,a,c,d,f,h){A(this,y([[b,a,0],[c,d,0],[f,h,1]],this.m_),true)};i.setTransform=function(b,a,c,d,f,h){A(this,[[b,a,0],[c,d,0],[f,h,1]],true)};i.clip=function(){};i.arcTo=function(){};i.createPattern=function(){return new U};function D(b){this.type_=b;this.r1_=this.y1_=this.x1_=this.r0_=this.y0_=this.x0_=0;this.colors_=[]}D.prototype.addColorStop=function(b,a){a=P(a);this.colors_.push({offset:b,color:a.color,alpha:a.alpha})};function U(){}G_vmlCanvasManager=
M;CanvasRenderingContext2D=H;CanvasGradient=D;CanvasPattern=U})();

}
, "ep_etherpad-lite/static/js/farbtastic.js": function (require, exports, module) {
// Farbtastic 2.0 alpha
(function ($) {
  
var __debug = false;
var __factor = 0.8;

$.fn.farbtastic = function (options) {
  $.farbtastic(this, options);
  return this;
};

$.farbtastic = function (container, options) {
  var container = $(container)[0];
  return container.farbtastic || (container.farbtastic = new $._farbtastic(container, options));
}

$._farbtastic = function (container, options) {
  var fb = this;
  
  /////////////////////////////////////////////////////

  /**
   * Link to the given element(s) or callback.
   */
  fb.linkTo = function (callback) {
    // Unbind previous nodes
    if (typeof fb.callback == 'object') {
      $(fb.callback).unbind('keyup', fb.updateValue);
    }

    // Reset color
    fb.color = null;

    // Bind callback or elements
    if (typeof callback == 'function') {
      fb.callback = callback;
    }
    else if (typeof callback == 'object' || typeof callback == 'string') {
      fb.callback = $(callback);
      fb.callback.bind('keyup', fb.updateValue);
      if (fb.callback[0].value) {
        fb.setColor(fb.callback[0].value);
      }
    }
    return this;
  }
  fb.updateValue = function (event) {
    if (this.value && this.value != fb.color) {
      fb.setColor(this.value);
    }
  }

  /**
   * Change color with HTML syntax #123456
   */
  fb.setColor = function (color) {
    var unpack = fb.unpack(color);
    if (fb.color != color && unpack) {
      fb.color = color;
      fb.rgb = unpack;
      fb.hsl = fb.RGBToHSL(fb.rgb);
      fb.updateDisplay();
    }
    return this;
  }

  /**
   * Change color with HSL triplet [0..1, 0..1, 0..1]
   */
  fb.setHSL = function (hsl) {
    fb.hsl = hsl;

    var convertedHSL = [hsl[0]]
    convertedHSL[1] = hsl[1]*__factor+((1-__factor)/2);
    convertedHSL[2] = hsl[2]*__factor+((1-__factor)/2);

    fb.rgb = fb.HSLToRGB(convertedHSL);
    fb.color = fb.pack(fb.rgb);
    fb.updateDisplay();
    return this;
  }

  /////////////////////////////////////////////////////
  //excanvas-compatible building of canvases
  fb._makeCanvas = function(className){
    var c = document.createElement('canvas');
    if (!c.getContext) { // excanvas hack
        c = window.G_vmlCanvasManager.initElement(c);
        c.getContext(); //this creates the excanvas children
    }
    $(c).addClass(className);
    return c;
  }

  /**
   * Initialize the color picker widget.
   */
  fb.initWidget = function () {

    // Insert markup and size accordingly.
    var dim = {
      width: options.width,
      height: options.width
    };
    $(container)
      .html(
        '<div class="farbtastic" style="position: relative">' +
          '<div class="farbtastic-solid"></div>' +
        '</div>'
      )
      .children('.farbtastic')
        .append(fb._makeCanvas('farbtastic-mask'))
        .append(fb._makeCanvas('farbtastic-overlay'))
      .end()
      .find('*').attr(dim).css(dim).end()
      .find('div>*').css('position', 'absolute');

    // Determine layout
    fb.radius = (options.width - options.wheelWidth) / 2 - 1;
    fb.square = Math.floor((fb.radius - options.wheelWidth / 2) * 0.7) - 1;
    fb.mid = Math.floor(options.width / 2);
    fb.markerSize = options.wheelWidth * 0.3;
    fb.solidFill = $('.farbtastic-solid', container).css({
      width: fb.square * 2 - 1,
      height: fb.square * 2 - 1,
      left: fb.mid - fb.square,
      top: fb.mid - fb.square
    });

    // Set up drawing context.
    fb.cnvMask = $('.farbtastic-mask', container);
    fb.ctxMask = fb.cnvMask[0].getContext('2d');
    fb.cnvOverlay = $('.farbtastic-overlay', container);
    fb.ctxOverlay = fb.cnvOverlay[0].getContext('2d');
    fb.ctxMask.translate(fb.mid, fb.mid);
    fb.ctxOverlay.translate(fb.mid, fb.mid);
    
    // Draw widget base layers.
    fb.drawCircle();
    fb.drawMask();
  }

  /**
   * Draw the color wheel.
   */
  fb.drawCircle = function () {
    var tm = +(new Date());
    // Draw a hue circle with a bunch of gradient-stroked beziers.
    // Have to use beziers, as gradient-stroked arcs don't work.
    var n = 24,
        r = fb.radius,
        w = options.wheelWidth,
        nudge = 8 / r / n * Math.PI, // Fudge factor for seams.
        m = fb.ctxMask,
        angle1 = 0, color1, d1;
    m.save();
    m.lineWidth = w / r;
    m.scale(r, r);
    // Each segment goes from angle1 to angle2.
    for (var i = 0; i <= n; ++i) {
      var d2 = i / n,
          angle2 = d2 * Math.PI * 2,
          // Endpoints
          x1 = Math.sin(angle1), y1 = -Math.cos(angle1);
          x2 = Math.sin(angle2), y2 = -Math.cos(angle2),
          // Midpoint chosen so that the endpoints are tangent to the circle.
          am = (angle1 + angle2) / 2,
          tan = 1 / Math.cos((angle2 - angle1) / 2),
          xm = Math.sin(am) * tan, ym = -Math.cos(am) * tan,
          // New color
          color2 = fb.pack(fb.HSLToRGB([d2, 1, 0.5]));
      if (i > 0) {
        if (browser.msie) {
          // IE's gradient calculations mess up the colors. Correct along the diagonals.
          var corr = (1 + Math.min(Math.abs(Math.tan(angle1)), Math.abs(Math.tan(Math.PI / 2 - angle1)))) / n;
          color1 = fb.pack(fb.HSLToRGB([d1 - 0.15 * corr, 1, 0.5]));
          color2 = fb.pack(fb.HSLToRGB([d2 + 0.15 * corr, 1, 0.5]));
          // Create gradient fill between the endpoints.
          var grad = m.createLinearGradient(x1, y1, x2, y2);
          grad.addColorStop(0, color1);
          grad.addColorStop(1, color2);
          m.fillStyle = grad;
          // Draw quadratic curve segment as a fill.
          var r1 = (r + w / 2) / r, r2 = (r - w / 2) / r; // inner/outer radius.
          m.beginPath();
          m.moveTo(x1 * r1, y1 * r1);
          m.quadraticCurveTo(xm * r1, ym * r1, x2 * r1, y2 * r1);
          m.lineTo(x2 * r2, y2 * r2);
          m.quadraticCurveTo(xm * r2, ym * r2, x1 * r2, y1 * r2);
          m.fill();
        }
        else {
          // Create gradient fill between the endpoints.
          var grad = m.createLinearGradient(x1, y1, x2, y2);
          grad.addColorStop(0, color1);
          grad.addColorStop(1, color2);
          m.strokeStyle = grad;
          // Draw quadratic curve segment.
          m.beginPath();
          m.moveTo(x1, y1);
          m.quadraticCurveTo(xm, ym, x2, y2);
          m.stroke();
        }
      }
      // Prevent seams where curves join.
      angle1 = angle2 - nudge; color1 = color2; d1 = d2;
    }
    m.restore();
    __debug && $('body').append('<div>drawCircle '+ (+(new Date()) - tm) +'ms');
  };
  
  /**
   * Draw the saturation/luminance mask.
   */
  fb.drawMask = function () {
    var tm = +(new Date());

    // Iterate over sat/lum space and calculate appropriate mask pixel values.
    var size = fb.square * 2, sq = fb.square;
    function calculateMask(sizex, sizey, outputPixel) {
      var isx = 1 / sizex, isy = 1 / sizey;
      for (var y = 0; y <= sizey; ++y) {
        var l = 1 - y * isy;
        for (var x = 0; x <= sizex; ++x) {
          var s = 1 - x * isx;
          // From sat/lum to alpha and color (grayscale)
          var a = 1 - 2 * Math.min(l * s, (1 - l) * s);
          var c = (a > 0) ? ((2 * l - 1 + a) * .5 / a) : 0;

          a = a*__factor+(1-__factor)/2;
          c = c*__factor+(1-__factor)/2;

          outputPixel(x, y, c, a);
        }
      }      
    }
 
    // Method #1: direct pixel access (new Canvas).
    if (fb.ctxMask.getImageData) {
      // Create half-resolution buffer.
      var sz = Math.floor(size / 2);
      var buffer = document.createElement('canvas');
      buffer.width = buffer.height = sz + 1;
      var ctx = buffer.getContext('2d');
      var frame = ctx.getImageData(0, 0, sz + 1, sz + 1);

      var i = 0;
      calculateMask(sz, sz, function (x, y, c, a) {
        frame.data[i++] = frame.data[i++] = frame.data[i++] = c * 255;
        frame.data[i++] = a * 255;
      });

      ctx.putImageData(frame, 0, 0);
      fb.ctxMask.drawImage(buffer, 0, 0, sz + 1, sz + 1, -sq, -sq, sq * 2, sq * 2);
    }
    // Method #2: drawing commands (old Canvas).
    else if (!browser.msie) {
      // Render directly at half-resolution
      var sz = Math.floor(size / 2);
      calculateMask(sz, sz, function (x, y, c, a) {
        c = Math.round(c * 255);
        fb.ctxMask.fillStyle = 'rgba(' + c + ', ' + c + ', ' + c + ', ' + a +')';
        fb.ctxMask.fillRect(x * 2 - sq - 1, y * 2 - sq - 1, 2, 2);
      });
    }
    // Method #3: vertical DXImageTransform gradient strips (IE).
    else {
      var cache_last, cache, w = 6; // Each strip is 6 pixels wide.
      var sizex = Math.floor(size / w);
      // 6 vertical pieces of gradient per strip.
      calculateMask(sizex, 6, function (x, y, c, a) {
        if (x == 0) {
          cache_last = cache;
          cache = [];
        }
        c = Math.round(c * 255);
        a = Math.round(a * 255);
        // We can only start outputting gradients once we have two rows of pixels.
        if (y > 0) {
          var c_last = cache_last[x][0],
              a_last = cache_last[x][1],
              color1 = fb.packDX(c_last, a_last),
              color2 = fb.packDX(c, a),
              y1 = Math.round(fb.mid + ((y - 1) * .333 - 1) * sq),
              y2 = Math.round(fb.mid + (y * .333 - 1) * sq);
          $('<div>').css({
            position: 'absolute',
            filter: "progid:DXImageTransform.Microsoft.Gradient(StartColorStr="+ color1 +", EndColorStr="+ color2 +", GradientType=0)",
            top: y1,
            height: y2 - y1,
            // Avoid right-edge sticking out.
            left: fb.mid + (x * w - sq - 1),
            width: w - (x == sizex ? Math.round(w / 2) : 0)
          }).appendTo(fb.cnvMask);
        }
        cache.push([c, a]);
      });
    }    
    __debug && $('body').append('<div>drawMask '+ (+(new Date()) - tm) +'ms');
  }

  /**
   * Draw the selection markers.
   */
  fb.drawMarkers = function () {
    // Determine marker dimensions
    var sz = options.width, lw = Math.ceil(fb.markerSize / 4), r = fb.markerSize - lw + 1;
    var angle = fb.hsl[0] * 6.28,
        x1 =  Math.sin(angle) * fb.radius,
        y1 = -Math.cos(angle) * fb.radius,
        x2 = 2 * fb.square * (.5 - fb.hsl[1]),
        y2 = 2 * fb.square * (.5 - fb.hsl[2]),
        c1 = fb.invert ? '#fff' : '#000',
        c2 = fb.invert ? '#000' : '#fff';
    var circles = [
      { x: x1, y: y1, r: r,             c: '#000', lw: lw + 1 },
      { x: x1, y: y1, r: fb.markerSize, c: '#fff', lw: lw },
      { x: x2, y: y2, r: r,             c: c2,     lw: lw + 1 },
      { x: x2, y: y2, r: fb.markerSize, c: c1,     lw: lw },
    ];

    // Update the overlay canvas.
    fb.ctxOverlay.clearRect(-fb.mid, -fb.mid, sz, sz);
    for (i in circles) {
      var c = circles[i];
      fb.ctxOverlay.lineWidth = c.lw;
      fb.ctxOverlay.strokeStyle = c.c;
      fb.ctxOverlay.beginPath();
      fb.ctxOverlay.arc(c.x, c.y, c.r, 0, Math.PI * 2, true);
      fb.ctxOverlay.stroke();
    }
  }

  /**
   * Update the markers and styles
   */
  fb.updateDisplay = function () {
    // Determine whether labels/markers should invert.
    fb.invert = (fb.rgb[0] * 0.3 + fb.rgb[1] * .59 + fb.rgb[2] * .11) <= 0.6;

    // Update the solid background fill.
    fb.solidFill.css('backgroundColor', fb.pack(fb.HSLToRGB([fb.hsl[0], 1, 0.5])));

    // Draw markers
    fb.drawMarkers();
    
    // Linked elements or callback
    if (typeof fb.callback == 'object') {
      // Set background/foreground color
      $(fb.callback).css({
        backgroundColor: fb.color,
        color: fb.invert ? '#fff' : '#000'
      });

      // Change linked value
      $(fb.callback).each(function() {
        if ((typeof this.value == 'string') && this.value != fb.color) {
          this.value = fb.color;
        }
      });
    }
    else if (typeof fb.callback == 'function') {
      fb.callback.call(fb, fb.color);
    }
  }
  
  /**
   * Helper for returning coordinates relative to the center.
   */
  fb.widgetCoords = function (event) {
    return {
      x: event.pageX - fb.offset.left - fb.mid,    
      y: event.pageY - fb.offset.top - fb.mid
    };    
  }

  /**
   * Mousedown handler
   */
  fb.mousedown = function (event) {
    // Capture mouse
    if (!$._farbtastic.dragging) {
      $(document).bind('mousemove', fb.mousemove).bind('mouseup', fb.mouseup);
      $._farbtastic.dragging = true;
    }

    // Update the stored offset for the widget.
    fb.offset = $(container).offset();

    // Check which area is being dragged
    var pos = fb.widgetCoords(event);
    fb.circleDrag = Math.max(Math.abs(pos.x), Math.abs(pos.y)) > (fb.square + 2);

    // Process
    fb.mousemove(event);
    return false;
  }

  /**
   * Mousemove handler
   */
  fb.mousemove = function (event) {
    // Get coordinates relative to color picker center
    var pos = fb.widgetCoords(event);

    // Set new HSL parameters
    if (fb.circleDrag) {
      var hue = Math.atan2(pos.x, -pos.y) / 6.28;
      fb.setHSL([(hue + 1) % 1, fb.hsl[1], fb.hsl[2]]);
    }
    else {
      var sat = Math.max(0, Math.min(1, -(pos.x / fb.square / 2) + .5));
      var lum = Math.max(0, Math.min(1, -(pos.y / fb.square / 2) + .5));
      fb.setHSL([fb.hsl[0], sat, lum]);
    }
    return false;
  }

  /**
   * Mouseup handler
   */
  fb.mouseup = function () {
    // Uncapture mouse
    $(document).unbind('mousemove', fb.mousemove);
    $(document).unbind('mouseup', fb.mouseup);
    $._farbtastic.dragging = false;
  }

  /* Various color utility functions */
  fb.dec2hex = function (x) {
    return (x < 16 ? '0' : '') + x.toString(16);
  }

  fb.packDX = function (c, a) {
    return '#' + fb.dec2hex(a) + fb.dec2hex(c) + fb.dec2hex(c) + fb.dec2hex(c);
  };
  
  fb.pack = function (rgb) {
    var r = Math.round(rgb[0] * 255);
    var g = Math.round(rgb[1] * 255);
    var b = Math.round(rgb[2] * 255);
    return '#' + fb.dec2hex(r) + fb.dec2hex(g) + fb.dec2hex(b);
  };

  fb.unpack = function (color) {
    if (color.length == 7) {
      function x(i) {
        return parseInt(color.substring(i, i + 2), 16) / 255;
      }
      return [ x(1), x(3), x(5) ];
    }
    else if (color.length == 4) {
      function x(i) {
        return parseInt(color.substring(i, i + 1), 16) / 15;
      }
      return [ x(1), x(2), x(3) ];
    }
  };

  fb.HSLToRGB = function (hsl) {
    var m1, m2, r, g, b;
    var h = hsl[0], s = hsl[1], l = hsl[2];
    m2 = (l <= 0.5) ? l * (s + 1) : l + s - l * s;
    m1 = l * 2 - m2;
    return [
      this.hueToRGB(m1, m2, h + 0.33333),
      this.hueToRGB(m1, m2, h),
      this.hueToRGB(m1, m2, h - 0.33333)
    ];
  };

  fb.hueToRGB = function (m1, m2, h) {
    h = (h + 1) % 1;
    if (h * 6 < 1) return m1 + (m2 - m1) * h * 6;
    if (h * 2 < 1) return m2;
    if (h * 3 < 2) return m1 + (m2 - m1) * (0.66666 - h) * 6;
    return m1;
  };

  fb.RGBToHSL = function (rgb) {
    var r = rgb[0], g = rgb[1], b = rgb[2],
        min = Math.min(r, g, b),
        max = Math.max(r, g, b),
        delta = max - min,
        h = 0,
        s = 0,
        l = (min + max) / 2;
    if (l > 0 && l < 1) {
      s = delta / (l < 0.5 ? (2 * l) : (2 - 2 * l));
    }
    if (delta > 0) {
      if (max == r && max != g) h += (g - b) / delta;
      if (max == g && max != b) h += (2 + (b - r) / delta);
      if (max == b && max != r) h += (4 + (r - g) / delta);
      h /= 6;
    }
    return [h, s, l];
  };

  // Parse options.
  if (!options.callback) {
    options = { callback: options };
  }
  options = $.extend({
    width: 300,
    wheelWidth: (options.width || 300) / 10,
    callback: null
  }, options);

  // Initialize.
  fb.initWidget();

  // Install mousedown handler (the others are set on the document on-demand)
  $('canvas.farbtastic-overlay', container).mousedown(fb.mousedown);

  // Set linked elements/callback
  if (options.callback) {
    fb.linkTo(options.callback);
  }
  // Set to gray.
  fb.setColor('#808080');
}

})(jQuery);

}
, "ep_etherpad-lite/static/js/pad": null
, "ep_etherpad-lite/static/js/pad_utils": null
, "ep_etherpad-lite/static/js/browser": null
, "ep_etherpad-lite/static/js/pad_cookie": null
, "ep_etherpad-lite/static/js/pad_editor": null
, "ep_etherpad-lite/static/js/pad_editbar": null
, "ep_etherpad-lite/static/js/pad_docbar": null
, "ep_etherpad-lite/static/js/pad_modals": null
, "ep_etherpad-lite/static/js/ace": null
, "ep_etherpad-lite/static/js/collab_client": null
, "ep_etherpad-lite/static/js/pad_userlist": null
, "ep_etherpad-lite/static/js/pad_impexp": null
, "ep_etherpad-lite/static/js/pad_savedrevs": null
, "ep_etherpad-lite/static/js/pad_connectionstatus": null
, "ep_etherpad-lite/static/js/chat": null
, "ep_etherpad-lite/static/js/gritter": null
, "tinycon/tinycon": null
, "ep_etherpad-lite/static/js/excanvas": null
, "ep_etherpad-lite/static/js/farbtastic": null
, "ep_etherpad-lite/static/js/pad/index.js": null
, "ep_etherpad-lite/static/js/pad_utils/index.js": null
, "ep_etherpad-lite/static/js/browser/index.js": null
, "ep_etherpad-lite/static/js/pad_cookie/index.js": null
, "ep_etherpad-lite/static/js/pad_editor/index.js": null
, "ep_etherpad-lite/static/js/pad_editbar/index.js": null
, "ep_etherpad-lite/static/js/pad_docbar/index.js": null
, "ep_etherpad-lite/static/js/pad_modals/index.js": null
, "ep_etherpad-lite/static/js/ace/index.js": null
, "ep_etherpad-lite/static/js/collab_client/index.js": null
, "ep_etherpad-lite/static/js/pad_userlist/index.js": null
, "ep_etherpad-lite/static/js/pad_impexp/index.js": null
, "ep_etherpad-lite/static/js/pad_savedrevs/index.js": null
, "ep_etherpad-lite/static/js/pad_connectionstatus/index.js": null
, "ep_etherpad-lite/static/js/chat/index.js": null
, "ep_etherpad-lite/static/js/gritter/index.js": null
, "tinycon/tinycon/index.js": null
, "ep_etherpad-lite/static/js/excanvas/index.js": null
, "ep_etherpad-lite/static/js/farbtastic/index.js": null
});
