require.define({
  "ep_etherpad-lite/static/js/ace2_inner.js": function (require, exports, module) {
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
var _, $, jQuery, plugins, Ace2Common;

var browser = require('./browser').browser;
if(browser.msie){
  // Honestly fuck IE royally.
  // Basically every hack we have since V11 causes a problem
  if(parseInt(browser.version) >= 11){
    delete browser.msie;
    browser.chrome = true;
    browser.modernIE = true;
  }
}

Ace2Common = require('./ace2_common');

plugins = require('ep_etherpad-lite/static/js/pluginfw/client_plugins');
$ = jQuery = require('./rjquery').$;
_ = require("./underscore");

var isNodeText = Ace2Common.isNodeText,
  getAssoc = Ace2Common.getAssoc,
  setAssoc = Ace2Common.setAssoc,
  isTextNode = Ace2Common.isTextNode,
  binarySearchInfinite = Ace2Common.binarySearchInfinite,
  htmlPrettyEscape = Ace2Common.htmlPrettyEscape,
  noop = Ace2Common.noop;
var hooks = require('./pluginfw/hooks');

function Ace2Inner(){

  var makeChangesetTracker = require('./changesettracker').makeChangesetTracker;
  var colorutils = require('./colorutils').colorutils;
  var makeContentCollector = require('./contentcollector').makeContentCollector;
  var makeCSSManager = require('./cssmanager').makeCSSManager;
  var domline = require('./domline').domline;
  var AttribPool = require('./AttributePool');
  var Changeset = require('./Changeset');
  var ChangesetUtils = require('./ChangesetUtils');
  var linestylefilter = require('./linestylefilter').linestylefilter;
  var SkipList = require('./skiplist');
  var undoModule = require('./undomodule').undoModule;
  var AttributeManager = require('./AttributeManager');

  var DEBUG = false; //$$ build script replaces the string "var DEBUG=true;//$$" with "var DEBUG=false;"
  // changed to false
  var isSetUp = false;

  var THE_TAB = '    '; //4
  var MAX_LIST_LEVEL = 16;

  var LINE_NUMBER_PADDING_RIGHT = 4;
  var LINE_NUMBER_PADDING_LEFT = 4;
  var MIN_LINEDIV_WIDTH = 20;
  var EDIT_BODY_PADDING_TOP = 8;
  var EDIT_BODY_PADDING_LEFT = 8;

  var caughtErrors = [];

  var thisAuthor = '';

  var disposed = false;
  var editorInfo = parent.editorInfo;

  var iframe = window.frameElement;
  var outerWin = iframe.ace_outerWin;
  iframe.ace_outerWin = null; // prevent IE 6 memory leak
  var sideDiv = iframe.nextSibling;
  var lineMetricsDiv = sideDiv.nextSibling;
  initLineNumbers();

  var outsideKeyDown = noop;

  var outsideKeyPress = function(){return true;};

  var outsideNotifyDirty = noop;

  // selFocusAtStart -- determines whether the selection extends "backwards", so that the focus
  // point (controlled with the arrow keys) is at the beginning; not supported in IE, though
  // native IE selections have that behavior (which we try not to interfere with).
  // Must be false if selection is collapsed!
  var rep = {
    lines: new SkipList(),
    selStart: null,
    selEnd: null,
    selFocusAtStart: false,
    alltext: "",
    alines: [],
    apool: new AttribPool()
  };

  // lines, alltext, alines, and DOM are set up in init()
  if (undoModule.enabled)
  {
    undoModule.apool = rep.apool;
  }

  var root, doc; // set in init()
  var isEditable = true;
  var doesWrap = true;
  var hasLineNumbers = true;
  var isStyled = true;

  // space around the innermost iframe element
  var iframePadLeft = MIN_LINEDIV_WIDTH + LINE_NUMBER_PADDING_RIGHT + EDIT_BODY_PADDING_LEFT;
  var iframePadTop = EDIT_BODY_PADDING_TOP;
  var iframePadBottom = 0,
      iframePadRight = 0;

  var console = (DEBUG && window.console);
  var documentAttributeManager;

  if (!window.console)
  {
    var names = ["log", "debug", "info", "warn", "error", "assert", "dir", "dirxml", "group", "groupEnd", "time", "timeEnd", "count", "trace", "profile", "profileEnd"];
    console = {};
    for (var i = 0; i < names.length; ++i)
    console[names[i]] = noop;
    //console.error = function(str) { alert(str); };
  }

  var PROFILER = window.PROFILER;
  if (!PROFILER)
  {
    PROFILER = function()
    {
      return {
        start: noop,
        mark: noop,
        literal: noop,
        end: noop,
        cancel: noop
      };
    };
  }

  // "dmesg" is for displaying messages in the in-page output pane
  // visible when "?djs=1" is appended to the pad URL.  It generally
  // remains a no-op unless djs is enabled, but we make a habit of
  // only calling it in error cases or while debugging.
  var dmesg = noop;
  window.dmesg = noop;

  var scheduler = parent; // hack for opera required

  var textFace = 'monospace';
  var textSize = 12;


  function textLineHeight()
  {
    return Math.round(textSize * 4 / 3);
  }

  var dynamicCSS = null;
  var outerDynamicCSS = null;
  var parentDynamicCSS = null;

  function initDynamicCSS()
  {
    dynamicCSS = makeCSSManager("dynamicsyntax");
    outerDynamicCSS = makeCSSManager("dynamicsyntax", "outer");
    parentDynamicCSS = makeCSSManager("dynamicsyntax", "parent");
  }

  var changesetTracker = makeChangesetTracker(scheduler, rep.apool, {
    withCallbacks: function(operationName, f)
    {
      inCallStackIfNecessary(operationName, function()
      {
        fastIncorp(1);
        f(
        {
          setDocumentAttributedText: function(atext)
          {
            setDocAText(atext);
          },
          applyChangesetToDocument: function(changeset, preferInsertionAfterCaret)
          {
            var oldEventType = currentCallStack.editEvent.eventType;
            currentCallStack.startNewEvent("nonundoable");

            performDocumentApplyChangeset(changeset, preferInsertionAfterCaret);

            currentCallStack.startNewEvent(oldEventType);
          }
        });
      });
    }
  });

  var authorInfos = {}; // presence of key determines if author is present in doc

  function getAuthorInfos(){
    return authorInfos;
  };
  editorInfo.ace_getAuthorInfos= getAuthorInfos;

  function setAuthorStyle(author, info)
  {
    if (!dynamicCSS) {
      return;
    }
    var authorSelector = getAuthorColorClassSelector(getAuthorClassName(author));

    var authorStyleSet = hooks.callAll('aceSetAuthorStyle', {
      dynamicCSS: dynamicCSS,
      parentDynamicCSS: parentDynamicCSS,
      outerDynamicCSS: outerDynamicCSS,
      info: info,
      author: author,
      authorSelector: authorSelector,
    });

    // Prevent default behaviour if any hook says so
    if (_.any(authorStyleSet, function(it) { return it }))
    {
      return
    }

    if (!info)
    {
      dynamicCSS.removeSelectorStyle(authorSelector);
      parentDynamicCSS.removeSelectorStyle(authorSelector);
    }
    else
    {
      if (info.bgcolor)
      {
        var bgcolor = info.bgcolor;
        if ((typeof info.fade) == "number")
        {
          bgcolor = fadeColor(bgcolor, info.fade);
        }

        var authorStyle = dynamicCSS.selectorStyle(authorSelector);
        var parentAuthorStyle = parentDynamicCSS.selectorStyle(authorSelector);
        var anchorStyle = dynamicCSS.selectorStyle(authorSelector + ' > a')

        // author color
        authorStyle.backgroundColor = bgcolor;
        parentAuthorStyle.backgroundColor = bgcolor;

        // text contrast
        if(colorutils.luminosity(colorutils.css2triple(bgcolor)) < 0.5)
        {
          authorStyle.color = '#ffffff';
          parentAuthorStyle.color = '#ffffff';
        }else{
          authorStyle.color = null;
          parentAuthorStyle.color = null;
        }

        // anchor text contrast
        if(colorutils.luminosity(colorutils.css2triple(bgcolor)) < 0.55)
        {
          anchorStyle.color = colorutils.triple2css(colorutils.complementary(colorutils.css2triple(bgcolor)));
        }else{
          anchorStyle.color = null;
        }
      }
    }
  }

  function setAuthorInfo(author, info)
  {
    if ((typeof author) != "string")
    {
      throw new Error("setAuthorInfo: author (" + author + ") is not a string");
    }
    if (!info)
    {
      delete authorInfos[author];
    }
    else
    {
      authorInfos[author] = info;
    }
    setAuthorStyle(author, info);
  }

  function getAuthorClassName(author)
  {
    return "author-" + author.replace(/[^a-y0-9]/g, function(c)
    {
      if (c == ".") return "-";
      return 'z' + c.charCodeAt(0) + 'z';
    });
  }

  function className2Author(className)
  {
    if (className.substring(0, 7) == "author-")
    {
      return className.substring(7).replace(/[a-y0-9]+|-|z.+?z/g, function(cc)
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
    return null;
  }

  function getAuthorColorClassSelector(oneClassName)
  {
    return ".authorColors ." + oneClassName;
  }

  function setUpTrackingCSS()
  {
    if (dynamicCSS)
    {
      var backgroundHeight = lineMetricsDiv.offsetHeight;
      var lineHeight = textLineHeight();
      var extraBodding = 0;
      var extraTodding = 0;
      if (backgroundHeight < lineHeight)
      {
        extraBodding = Math.ceil((lineHeight - backgroundHeight) / 2);
        extraTodding = lineHeight - backgroundHeight - extraBodding;
      }
      var spanStyle = dynamicCSS.selectorStyle("#innerdocbody span");
      spanStyle.paddingTop = extraTodding + "px";
      spanStyle.paddingBottom = extraBodding + "px";
    }
  }

  function fadeColor(colorCSS, fadeFrac)
  {
    var color = colorutils.css2triple(colorCSS);
    color = colorutils.blend(color, [1, 1, 1], fadeFrac);
    return colorutils.triple2css(color);
  }

  editorInfo.ace_getRep = function()
  {
    return rep;
  };

  editorInfo.ace_getAuthor = function()
  {
    return thisAuthor;
  }

  var currentCallStack = null;

  function inCallStack(type, action)
  {
    if (disposed) return;

    if (currentCallStack)
    {
      console.error("Can't enter callstack " + type + ", already in " + currentCallStack.type);
    }

    var profiling = false;

    function profileRest()
    {
      profiling = true;
      console.profile();
    }

    function newEditEvent(eventType)
    {
      return {
        eventType: eventType,
        backset: null
      };
    }

    function submitOldEvent(evt)
    {
      if (rep.selStart && rep.selEnd)
      {
        var selStartChar = rep.lines.offsetOfIndex(rep.selStart[0]) + rep.selStart[1];
        var selEndChar = rep.lines.offsetOfIndex(rep.selEnd[0]) + rep.selEnd[1];
        evt.selStart = selStartChar;
        evt.selEnd = selEndChar;
        evt.selFocusAtStart = rep.selFocusAtStart;
      }
      if (undoModule.enabled)
      {
        var undoWorked = false;
        try
        {
          if (evt.eventType == "setup" || evt.eventType == "importText" || evt.eventType == "setBaseText")
          {
            undoModule.clearHistory();
          }
          else if (evt.eventType == "nonundoable")
          {
            if (evt.changeset)
            {
              undoModule.reportExternalChange(evt.changeset);
            }
          }
          else
          {
            undoModule.reportEvent(evt);
          }
          undoWorked = true;
        }
        finally
        {
          if (!undoWorked)
          {
            undoModule.enabled = false; // for safety
          }
        }
      }
    }

    function startNewEvent(eventType, dontSubmitOld)
    {
      var oldEvent = currentCallStack.editEvent;
      if (!dontSubmitOld)
      {
        submitOldEvent(oldEvent);
      }
      currentCallStack.editEvent = newEditEvent(eventType);
      return oldEvent;
    }

    currentCallStack = {
      type: type,
      docTextChanged: false,
      selectionAffected: false,
      userChangedSelection: false,
      domClean: false,
      profileRest: profileRest,
      isUserChange: false,
      // is this a "user change" type of call-stack
      repChanged: false,
      editEvent: newEditEvent(type),
      startNewEvent: startNewEvent
    };
    var cleanExit = false;
    var result;
    try
    {
      result = action();

      hooks.callAll('aceEditEvent', {
        callstack: currentCallStack,
        editorInfo: editorInfo,
        rep: rep,
        documentAttributeManager: documentAttributeManager
      });

      //console.log("Just did action for: "+type);
      cleanExit = true;
    }
    catch (e)
    {
      caughtErrors.push(
      {
        error: e,
        time: +new Date()
      });
      dmesg(e.toString());
      throw e;
    }
    finally
    {
      var cs = currentCallStack;
      //console.log("Finished action for: "+type);
      if (cleanExit)
      {
        submitOldEvent(cs.editEvent);
        if (cs.domClean && cs.type != "setup")
        {
          // if (cs.isUserChange)
          // {
          //  if (cs.repChanged) parenModule.notifyChange();
          //  else parenModule.notifyTick();
          // }
          if (cs.selectionAffected)
          {
            updateBrowserSelectionFromRep();
          }
          if ((cs.docTextChanged || cs.userChangedSelection) && cs.type != "applyChangesToBase")
          {
            scrollSelectionIntoView();
          }
          if (cs.docTextChanged && cs.type.indexOf("importText") < 0)
          {
            outsideNotifyDirty();
          }
        }
      }
      else
      {
        // non-clean exit
        if (currentCallStack.type == "idleWorkTimer")
        {
          idleWorkTimer.atLeast(1000);
        }
      }
      currentCallStack = null;
      if (profiling) console.profileEnd();
    }
    return result;
  }
  editorInfo.ace_inCallStack = inCallStack;

  function inCallStackIfNecessary(type, action)
  {
    if (!currentCallStack)
    {
      inCallStack(type, action);
    }
    else
    {
      action();
    }
  }
  editorInfo.ace_inCallStackIfNecessary = inCallStackIfNecessary;

  function dispose()
  {
    disposed = true;
    if (idleWorkTimer) idleWorkTimer.never();
    teardown();
  }

  function checkALines()
  {
    return; // disable for speed


    function error()
    {
      throw new Error("checkALines");
    }
    if (rep.alines.length != rep.lines.length())
    {
      error();
    }
    for (var i = 0; i < rep.alines.length; i++)
    {
      var aline = rep.alines[i];
      var lineText = rep.lines.atIndex(i).text + "\n";
      var lineTextLength = lineText.length;
      var opIter = Changeset.opIterator(aline);
      var alineLength = 0;
      while (opIter.hasNext())
      {
        var o = opIter.next();
        alineLength += o.chars;
        if (opIter.hasNext())
        {
          if (o.lines !== 0) error();
        }
        else
        {
          if (o.lines != 1) error();
        }
      }
      if (alineLength != lineTextLength)
      {
        error();
      }
    }
  }

  function setWraps(newVal)
  {
    doesWrap = newVal;
    var dwClass = "doesWrap";
    setClassPresence(root, "doesWrap", doesWrap);
    scheduler.setTimeout(function()
    {
      inCallStackIfNecessary("setWraps", function()
      {
        fastIncorp(7);
        recreateDOM();
        fixView();
      });
    }, 0);

    // Chrome can't handle the truth..  If CSS rule white-space:pre-wrap
    // is true then any paste event will insert two lines..
    // Sadly this will mean you get a walking Caret in Chrome when clicking on a URL
    // So this has to be set to pre-wrap ;(
    // We need to file a bug w/ the Chromium team.
    if(browser.chrome){
      $("#innerdocbody").addClass("noprewrap");
    }

  }

  function setStyled(newVal)
  {
    var oldVal = isStyled;
    isStyled = !! newVal;

    if (newVal != oldVal)
    {
      if (!newVal)
      {
        // clear styles
        inCallStackIfNecessary("setStyled", function()
        {
          fastIncorp(12);
          var clearStyles = [];
          for (var k in STYLE_ATTRIBS)
          {
            clearStyles.push([k, '']);
          }
          performDocumentApplyAttributesToCharRange(0, rep.alltext.length, clearStyles);
        });
      }
    }
  }

  function setTextFace(face)
  {
    textFace = face;
    root.style.fontFamily = textFace;
    lineMetricsDiv.style.fontFamily = textFace;
    scheduler.setTimeout(function()
    {
      setUpTrackingCSS();
    }, 0);
  }

  function setTextSize(size)
  {
    textSize = size;
    root.style.fontSize = textSize + "px";
    root.style.lineHeight = textLineHeight() + "px";
    sideDiv.style.lineHeight = textLineHeight() + "px";
    lineMetricsDiv.style.fontSize = textSize + "px";
    scheduler.setTimeout(function()
    {
      setUpTrackingCSS();
    }, 0);
  }

  function recreateDOM()
  {
    // precond: normalized
    recolorLinesInRange(0, rep.alltext.length);
  }

  function setEditable(newVal)
  {
    isEditable = newVal;

    // the following may fail, e.g. if iframe is hidden
    if (!isEditable)
    {
      setDesignMode(false);
    }
    else
    {
      setDesignMode(true);
    }
    setClassPresence(root, "static", !isEditable);
  }

  function enforceEditability()
  {
    setEditable(isEditable);
  }

  function importText(text, undoable, dontProcess)
  {
    var lines;
    if (dontProcess)
    {
      if (text.charAt(text.length - 1) != "\n")
      {
        throw new Error("new raw text must end with newline");
      }
      if (/[\r\t\xa0]/.exec(text))
      {
        throw new Error("new raw text must not contain CR, tab, or nbsp");
      }
      lines = text.substring(0, text.length - 1).split('\n');
    }
    else
    {
      lines = _.map(text.split('\n'), textify);
    }
    var newText = "\n";
    if (lines.length > 0)
    {
      newText = lines.join('\n') + '\n';
    }

    inCallStackIfNecessary("importText" + (undoable ? "Undoable" : ""), function()
    {
      setDocText(newText);
    });

    if (dontProcess && rep.alltext != text)
    {
      throw new Error("mismatch error setting raw text in importText");
    }
  }

  function importAText(atext, apoolJsonObj, undoable)
  {
    atext = Changeset.cloneAText(atext);
    if (apoolJsonObj)
    {
      var wireApool = (new AttribPool()).fromJsonable(apoolJsonObj);
      atext.attribs = Changeset.moveOpsToNewPool(atext.attribs, wireApool, rep.apool);
    }
    inCallStackIfNecessary("importText" + (undoable ? "Undoable" : ""), function()
    {
      setDocAText(atext);
    });
  }

  function setDocAText(atext)
  {
    fastIncorp(8);

    var oldLen = rep.lines.totalWidth();
    var numLines = rep.lines.length();
    var upToLastLine = rep.lines.offsetOfIndex(numLines - 1);
    var lastLineLength = rep.lines.atIndex(numLines - 1).text.length;
    var assem = Changeset.smartOpAssembler();
    var o = Changeset.newOp('-');
    o.chars = upToLastLine;
    o.lines = numLines - 1;
    assem.append(o);
    o.chars = lastLineLength;
    o.lines = 0;
    assem.append(o);
    Changeset.appendATextToAssembler(atext, assem);
    var newLen = oldLen + assem.getLengthChange();
    var changeset = Changeset.checkRep(
    Changeset.pack(oldLen, newLen, assem.toString(), atext.text.slice(0, -1)));
    performDocumentApplyChangeset(changeset);

    performSelectionChange([0, rep.lines.atIndex(0).lineMarker], [0, rep.lines.atIndex(0).lineMarker]);

    idleWorkTimer.atMost(100);

    if (rep.alltext != atext.text)
    {
      dmesg(htmlPrettyEscape(rep.alltext));
      dmesg(htmlPrettyEscape(atext.text));
      throw new Error("mismatch error setting raw text in setDocAText");
    }
  }

  function setDocText(text)
  {
    setDocAText(Changeset.makeAText(text));
  }

  function getDocText()
  {
    var alltext = rep.alltext;
    var len = alltext.length;
    if (len > 0) len--; // final extra newline
    return alltext.substring(0, len);
  }

  function exportText()
  {
    if (currentCallStack && !currentCallStack.domClean)
    {
      inCallStackIfNecessary("exportText", function()
      {
        fastIncorp(2);
      });
    }
    return getDocText();
  }

  function editorChangedSize()
  {
    fixView();
  }

  function setOnKeyPress(handler)
  {
    outsideKeyPress = handler;
  }

  function setOnKeyDown(handler)
  {
    outsideKeyDown = handler;
  }

  function setNotifyDirty(handler)
  {
    outsideNotifyDirty = handler;
  }

  function getFormattedCode()
  {
    if (currentCallStack && !currentCallStack.domClean)
    {
      inCallStackIfNecessary("getFormattedCode", incorporateUserChanges);
    }
    var buf = [];
    if (rep.lines.length() > 0)
    {
      // should be the case, even for empty file
      var entry = rep.lines.atIndex(0);
      while (entry)
      {
        var domInfo = entry.domInfo;
        buf.push((domInfo && domInfo.getInnerHTML()) || domline.processSpaces(domline.escapeHTML(entry.text), doesWrap) || '&nbsp;' /*empty line*/ );
        entry = rep.lines.next(entry);
      }
    }
    return '<div class="syntax"><div>' + buf.join('</div>\n<div>') + '</div></div>';
  }

  var CMDS = {
    clearauthorship: function(prompt)
    {
      if ((!(rep.selStart && rep.selEnd)) || isCaret())
      {
        if (prompt)
        {
          prompt();
        }
        else
        {
          performDocumentApplyAttributesToCharRange(0, rep.alltext.length, [
            ['author', '']
          ]);
        }
      }
      else
      {
        setAttributeOnSelection('author', '');
      }
    }
  };

  function execCommand(cmd)
  {
    cmd = cmd.toLowerCase();
    var cmdArgs = Array.prototype.slice.call(arguments, 1);
    if (CMDS[cmd])
    {
      inCallStackIfNecessary(cmd, function()
      {
        fastIncorp(9);
        CMDS[cmd].apply(CMDS, cmdArgs);
      });
    }
  }

  function replaceRange(start, end, text)
  {
    inCallStackIfNecessary('replaceRange', function()
    {
      fastIncorp(9);
      performDocumentReplaceRange(start, end, text);
    });
  }

  editorInfo.ace_focus = focus;
  editorInfo.ace_importText = importText;
  editorInfo.ace_importAText = importAText;
  editorInfo.ace_exportText = exportText;
  editorInfo.ace_editorChangedSize = editorChangedSize;
  editorInfo.ace_setOnKeyPress = setOnKeyPress;
  editorInfo.ace_setOnKeyDown = setOnKeyDown;
  editorInfo.ace_setNotifyDirty = setNotifyDirty;
  editorInfo.ace_dispose = dispose;
  editorInfo.ace_getFormattedCode = getFormattedCode;
  editorInfo.ace_setEditable = setEditable;
  editorInfo.ace_execCommand = execCommand;
  editorInfo.ace_replaceRange = replaceRange;
  editorInfo.ace_getAuthorInfos= getAuthorInfos;
  editorInfo.ace_performDocumentReplaceRange = performDocumentReplaceRange;
  editorInfo.ace_performDocumentReplaceCharRange = performDocumentReplaceCharRange;
  editorInfo.ace_renumberList = renumberList;
  editorInfo.ace_doReturnKey = doReturnKey;
  editorInfo.ace_isBlockElement = isBlockElement;
  editorInfo.ace_getLineListType = getLineListType;

  editorInfo.ace_callWithAce = function(fn, callStack, normalize)
  {
    var wrapper = function()
    {
      return fn(editorInfo);
    };

    if (normalize !== undefined)
    {
      var wrapper1 = wrapper;
      wrapper = function()
      {
        editorInfo.ace_fastIncorp(9);
        wrapper1();
      };
    }

    if (callStack !== undefined)
    {
      return editorInfo.ace_inCallStack(callStack, wrapper);
    }
    else
    {
      return wrapper();
    }
  };

  // This methed exposes a setter for some ace properties
  // @param key the name of the parameter
  // @param value the value to set to
  editorInfo.ace_setProperty = function(key, value)
  {

    // Convinience function returning a setter for a class on an element
    var setClassPresenceNamed = function(element, cls){
      return function(value){
         setClassPresence(element, cls, !! value)
      }
    };

    // These properties are exposed
    var setters = {
      wraps: setWraps,
      showsauthorcolors: setClassPresenceNamed(root, "authorColors"),
      showsuserselections: setClassPresenceNamed(root, "userSelections"),
      showslinenumbers : function(value){
        hasLineNumbers = !! value;
        // disable line numbers on mobile devices
        if (browser.mobile) hasLineNumbers = false;
        setClassPresence(sideDiv, "sidedivhidden", !hasLineNumbers);
        fixView();
      },
      grayedout: setClassPresenceNamed(outerWin.document.body, "grayedout"),
      dmesg: function(){ dmesg = window.dmesg = value; },
      userauthor: function(value){
        thisAuthor = String(value);
        documentAttributeManager.author = thisAuthor;
      },
      styled: setStyled,
      textface: setTextFace,
      textsize: setTextSize,
      rtlistrue: function(value) {
        setClassPresence(root, "rtl", value)
        setClassPresence(root, "ltr", !value)
        document.documentElement.dir = value? 'rtl' : 'ltr'
      }
    };

    var setter = setters[key.toLowerCase()];

    // check if setter is present
    if(setter !== undefined){
      setter(value)
    }
  };

  editorInfo.ace_setBaseText = function(txt)
  {
    changesetTracker.setBaseText(txt);
  };
  editorInfo.ace_setBaseAttributedText = function(atxt, apoolJsonObj)
  {
    setUpTrackingCSS();
    changesetTracker.setBaseAttributedText(atxt, apoolJsonObj);
  };
  editorInfo.ace_applyChangesToBase = function(c, optAuthor, apoolJsonObj)
  {
    changesetTracker.applyChangesToBase(c, optAuthor, apoolJsonObj);
  };
  editorInfo.ace_prepareUserChangeset = function()
  {
    return changesetTracker.prepareUserChangeset();
  };
  editorInfo.ace_applyPreparedChangesetToBase = function()
  {
    changesetTracker.applyPreparedChangesetToBase();
  };
  editorInfo.ace_setUserChangeNotificationCallback = function(f)
  {
    changesetTracker.setUserChangeNotificationCallback(f);
  };
  editorInfo.ace_setAuthorInfo = function(author, info)
  {
    setAuthorInfo(author, info);
  };
  editorInfo.ace_setAuthorSelectionRange = function(author, start, end)
  {
    changesetTracker.setAuthorSelectionRange(author, start, end);
  };

  editorInfo.ace_getUnhandledErrors = function()
  {
    return caughtErrors.slice();
  };

  editorInfo.ace_getDocument = function()
  {
    return doc;
  };

  editorInfo.ace_getDebugProperty = function(prop)
  {
    if (prop == "debugger")
    {
      // obfuscate "eval" so as not to scare yuicompressor
      window['ev' + 'al']("debugger");
    }
    else if (prop == "rep")
    {
      return rep;
    }
    else if (prop == "window")
    {
      return window;
    }
    else if (prop == "document")
    {
      return document;
    }
    return undefined;
  };

  function now()
  {
    return (new Date()).getTime();
  }

  function newTimeLimit(ms)
  {
    //console.debug("new time limit");
    var startTime = now();
    var lastElapsed = 0;
    var exceededAlready = false;
    var printedTrace = false;
    var isTimeUp = function()
      {
        if (exceededAlready)
        {
          if ((!printedTrace))
          { // && now() - startTime - ms > 300) {
            //console.trace();
            printedTrace = true;
          }
          return true;
        }
        var elapsed = now() - startTime;
        if (elapsed > ms)
        {
          exceededAlready = true;
          //console.debug("time limit hit, before was %d/%d", lastElapsed, ms);
          //console.trace();
          return true;
        }
        else
        {
          lastElapsed = elapsed;
          return false;
        }
      };

    isTimeUp.elapsed = function()
    {
      return now() - startTime;
    };
    return isTimeUp;
  }


  function makeIdleAction(func)
  {
    var scheduledTimeout = null;
    var scheduledTime = 0;

    function unschedule()
    {
      if (scheduledTimeout)
      {
        scheduler.clearTimeout(scheduledTimeout);
        scheduledTimeout = null;
      }
    }

    function reschedule(time)
    {
      unschedule();
      scheduledTime = time;
      var delay = time - now();
      if (delay < 0) delay = 0;
      scheduledTimeout = scheduler.setTimeout(callback, delay);
    }

    function callback()
    {
      scheduledTimeout = null;
      // func may reschedule the action
      func();
    }
    return {
      atMost: function(ms)
      {
        var latestTime = now() + ms;
        if ((!scheduledTimeout) || scheduledTime > latestTime)
        {
          reschedule(latestTime);
        }
      },
      // atLeast(ms) will schedule the action if not scheduled yet.
      // In other words, "infinity" is replaced by ms, even though
      // it is technically larger.
      atLeast: function(ms)
      {
        var earliestTime = now() + ms;
        if ((!scheduledTimeout) || scheduledTime < earliestTime)
        {
          reschedule(earliestTime);
        }
      },
      never: function()
      {
        unschedule();
      }
    };
  }

  function fastIncorp(n)
  {
    // normalize but don't do any lexing or anything
    incorporateUserChanges(newTimeLimit(0));
  }
  editorInfo.ace_fastIncorp = fastIncorp;

  var idleWorkTimer = makeIdleAction(function()
  {

    //if (! top.BEFORE) top.BEFORE = [];
    //top.BEFORE.push(magicdom.root.dom.innerHTML);
    //if (! isEditable) return; // and don't reschedule
    if (inInternationalComposition)
    {
      // don't do idle input incorporation during international input composition
      idleWorkTimer.atLeast(500);
      return;
    }

    inCallStackIfNecessary("idleWorkTimer", function()
    {

      var isTimeUp = newTimeLimit(250);

      //console.time("idlework");
      var finishedImportantWork = false;
      var finishedWork = false;

      try
      {

        // isTimeUp() is a soft constraint for incorporateUserChanges,
        // which always renormalizes the DOM, no matter how long it takes,
        // but doesn't necessarily lex and highlight it
        incorporateUserChanges(isTimeUp);

        if (isTimeUp()) return;

        updateLineNumbers(); // update line numbers if any time left
        if (isTimeUp()) return;

        var visibleRange = getVisibleCharRange();
        var docRange = [0, rep.lines.totalWidth()];
        //console.log("%o %o", docRange, visibleRange);
        finishedImportantWork = true;
        finishedWork = true;
      }
      finally
      {
        //console.timeEnd("idlework");
        if (finishedWork)
        {
          idleWorkTimer.atMost(1000);
        }
        else if (finishedImportantWork)
        {
          // if we've finished highlighting the view area,
          // more highlighting could be counter-productive,
          // e.g. if the user just opened a triple-quote and will soon close it.
          idleWorkTimer.atMost(500);
        }
        else
        {
          var timeToWait = Math.round(isTimeUp.elapsed() / 2);
          if (timeToWait < 100) timeToWait = 100;
          idleWorkTimer.atMost(timeToWait);
        }
      }
    });

    //if (! top.AFTER) top.AFTER = [];
    //top.AFTER.push(magicdom.root.dom.innerHTML);
  });

  var _nextId = 1;

  function uniqueId(n)
  {
    // not actually guaranteed to be unique, e.g. if user copy-pastes
    // nodes with ids
    var nid = n.id;
    if (nid) return nid;
    return (n.id = "magicdomid" + (_nextId++));
  }


  function recolorLinesInRange(startChar, endChar, isTimeUp, optModFunc)
  {
    if (endChar <= startChar) return;
    if (startChar < 0 || startChar >= rep.lines.totalWidth()) return;
    var lineEntry = rep.lines.atOffset(startChar); // rounds down to line boundary
    var lineStart = rep.lines.offsetOfEntry(lineEntry);
    var lineIndex = rep.lines.indexOfEntry(lineEntry);
    var selectionNeedsResetting = false;
    var firstLine = null;
    var lastLine = null;
    isTimeUp = (isTimeUp || noop);

    // tokenFunc function; accesses current value of lineEntry and curDocChar,
    // also mutates curDocChar
    var curDocChar;
    var tokenFunc = function(tokenText, tokenClass)
      {
        lineEntry.domInfo.appendSpan(tokenText, tokenClass);
        };
    if (optModFunc)
    {
      var f = tokenFunc;
      tokenFunc = function(tokenText, tokenClass)
      {
        optModFunc(tokenText, tokenClass, f, curDocChar);
        curDocChar += tokenText.length;
      };
    }

    while (lineEntry && lineStart < endChar && !isTimeUp())
    {
      //var timer = newTimeLimit(200);
      var lineEnd = lineStart + lineEntry.width;

      curDocChar = lineStart;
      lineEntry.domInfo.clearSpans();
      getSpansForLine(lineEntry, tokenFunc, lineStart);
      lineEntry.domInfo.finishUpdate();

      markNodeClean(lineEntry.lineNode);

      if (rep.selStart && rep.selStart[0] == lineIndex || rep.selEnd && rep.selEnd[0] == lineIndex)
      {
        selectionNeedsResetting = true;
      }

      //if (timer()) console.dirxml(lineEntry.lineNode.dom);
      if (firstLine === null) firstLine = lineIndex;
      lastLine = lineIndex;
      lineStart = lineEnd;
      lineEntry = rep.lines.next(lineEntry);
      lineIndex++;
    }
    if (selectionNeedsResetting)
    {
      currentCallStack.selectionAffected = true;
    }
    //console.debug("Recolored line range %d-%d", firstLine, lastLine);
  }

  // like getSpansForRange, but for a line, and the func takes (text,class)
  // instead of (width,class); excludes the trailing '\n' from
  // consideration by func


  function getSpansForLine(lineEntry, textAndClassFunc, lineEntryOffsetHint)
  {
    var lineEntryOffset = lineEntryOffsetHint;
    if ((typeof lineEntryOffset) != "number")
    {
      lineEntryOffset = rep.lines.offsetOfEntry(lineEntry);
    }
    var text = lineEntry.text;
    var width = lineEntry.width; // text.length+1
    if (text.length === 0)
    {
      // allow getLineStyleFilter to set line-div styles
      var func = linestylefilter.getLineStyleFilter(
      0, '', textAndClassFunc, rep.apool);
      func('', '');
    }
    else
    {
      var offsetIntoLine = 0;
      var filteredFunc = linestylefilter.getFilterStack(text, textAndClassFunc, browser);
      var lineNum = rep.lines.indexOfEntry(lineEntry);
      var aline = rep.alines[lineNum];
      filteredFunc = linestylefilter.getLineStyleFilter(
      text.length, aline, filteredFunc, rep.apool);
      filteredFunc(text, '');
    }
  }

  var observedChanges;

  function clearObservedChanges()
  {
    observedChanges = {
      cleanNodesNearChanges: {}
    };
  }
  clearObservedChanges();

  function getCleanNodeByKey(key)
  {
    var p = PROFILER("getCleanNodeByKey", false);
    p.extra = 0;
    var n = doc.getElementById(key);
    // copying and pasting can lead to duplicate ids
    while (n && isNodeDirty(n))
    {
      p.extra++;
      n.id = "";
      n = doc.getElementById(key);
    }
    p.literal(p.extra, "extra");
    p.end();
    return n;
  }

  function observeChangesAroundNode(node)
  {
    // Around this top-level DOM node, look for changes to the document
    // (from how it looks in our representation) and record them in a way
    // that can be used to "normalize" the document (apply the changes to our
    // representation, and put the DOM in a canonical form).
    // top.console.log("observeChangesAroundNode(%o)", node);
    var cleanNode;
    var hasAdjacentDirtyness;
    if (!isNodeDirty(node))
    {
      cleanNode = node;
      var prevSib = cleanNode.previousSibling;
      var nextSib = cleanNode.nextSibling;
      hasAdjacentDirtyness = ((prevSib && isNodeDirty(prevSib)) || (nextSib && isNodeDirty(nextSib)));
    }
    else
    {
      // node is dirty, look for clean node above
      var upNode = node.previousSibling;
      while (upNode && isNodeDirty(upNode))
      {
        upNode = upNode.previousSibling;
      }
      if (upNode)
      {
        cleanNode = upNode;
      }
      else
      {
        var downNode = node.nextSibling;
        while (downNode && isNodeDirty(downNode))
        {
          downNode = downNode.nextSibling;
        }
        if (downNode)
        {
          cleanNode = downNode;
        }
      }
      if (!cleanNode)
      {
        // Couldn't find any adjacent clean nodes!
        // Since top and bottom of doc is dirty, the dirty area will be detected.
        return;
      }
      hasAdjacentDirtyness = true;
    }

    if (hasAdjacentDirtyness)
    {
      // previous or next line is dirty
      observedChanges.cleanNodesNearChanges['$' + uniqueId(cleanNode)] = true;
    }
    else
    {
      // next and prev lines are clean (if they exist)
      var lineKey = uniqueId(cleanNode);
      var prevSib = cleanNode.previousSibling;
      var nextSib = cleanNode.nextSibling;
      var actualPrevKey = ((prevSib && uniqueId(prevSib)) || null);
      var actualNextKey = ((nextSib && uniqueId(nextSib)) || null);
      var repPrevEntry = rep.lines.prev(rep.lines.atKey(lineKey));
      var repNextEntry = rep.lines.next(rep.lines.atKey(lineKey));
      var repPrevKey = ((repPrevEntry && repPrevEntry.key) || null);
      var repNextKey = ((repNextEntry && repNextEntry.key) || null);
      if (actualPrevKey != repPrevKey || actualNextKey != repNextKey)
      {
        observedChanges.cleanNodesNearChanges['$' + uniqueId(cleanNode)] = true;
      }
    }
  }

  function observeChangesAroundSelection()
  {
    if (currentCallStack.observedSelection) return;
    currentCallStack.observedSelection = true;

    var p = PROFILER("getSelection", false);
    var selection = getSelection();
    p.end();

    function topLevel(n)
    {
      if ((!n) || n == root) return null;
      while (n.parentNode != root)
      {
        n = n.parentNode;
      }
      return n;
    }

    if (selection)
    {
      var node1 = topLevel(selection.startPoint.node);
      var node2 = topLevel(selection.endPoint.node);
      if (node1) observeChangesAroundNode(node1);
      if (node2 && node1 != node2)
      {
        observeChangesAroundNode(node2);
      }
    }
  }

  function observeSuspiciousNodes()
  {
    // inspired by Firefox bug #473255, where pasting formatted text
    // causes the cursor to jump away, making the new HTML never found.
    if (root.getElementsByTagName)
    {
      var nds = root.getElementsByTagName("style");
      for (var i = 0; i < nds.length; i++)
      {
        var n = nds[i];
        while (n.parentNode && n.parentNode != root)
        {
          n = n.parentNode;
        }
        if (n.parentNode == root)
        {
          observeChangesAroundNode(n);
        }
      }
    }
  }

  function incorporateUserChanges(isTimeUp)
  {

    if (currentCallStack.domClean) return false;

    currentCallStack.isUserChange = true;

    isTimeUp = (isTimeUp ||
    function()
    {
      return false;
    });

    if (DEBUG && window.DONT_INCORP || window.DEBUG_DONT_INCORP) return false;

    var p = PROFILER("incorp", false);

    //if (doc.body.innerHTML.indexOf("AppJet") >= 0)
    //dmesg(htmlPrettyEscape(doc.body.innerHTML));
    //if (top.RECORD) top.RECORD.push(doc.body.innerHTML);
    // returns true if dom changes were made
    if (!root.firstChild)
    {
      root.innerHTML = "<div><!-- --></div>";
    }

    p.mark("obs");
    observeChangesAroundSelection();
    observeSuspiciousNodes();
    p.mark("dirty");
    var dirtyRanges = getDirtyRanges();
    //console.log("dirtyRanges: "+toSource(dirtyRanges));
    var dirtyRangesCheckOut = true;
    var j = 0;
    var a, b;
    while (j < dirtyRanges.length)
    {
      a = dirtyRanges[j][0];
      b = dirtyRanges[j][1];
      if (!((a === 0 || getCleanNodeByKey(rep.lines.atIndex(a - 1).key)) && (b == rep.lines.length() || getCleanNodeByKey(rep.lines.atIndex(b).key))))
      {
        dirtyRangesCheckOut = false;
        break;
      }
      j++;
    }
    if (!dirtyRangesCheckOut)
    {
      var numBodyNodes = root.childNodes.length;
      for (var k = 0; k < numBodyNodes; k++)
      {
        var bodyNode = root.childNodes.item(k);
        if ((bodyNode.tagName) && ((!bodyNode.id) || (!rep.lines.containsKey(bodyNode.id))))
        {
          observeChangesAroundNode(bodyNode);
        }
      }
      dirtyRanges = getDirtyRanges();
    }

    clearObservedChanges();

    p.mark("getsel");
    var selection = getSelection();

    //console.log(magicdom.root.dom.innerHTML);
    //console.log("got selection: %o", selection);
    var selStart, selEnd; // each one, if truthy, has [line,char] needed to set selection
    var i = 0;
    var splicesToDo = [];
    var netNumLinesChangeSoFar = 0;
    var toDeleteAtEnd = [];
    p.mark("ranges");
    p.literal(dirtyRanges.length, "numdirt");
    var domInsertsNeeded = []; // each entry is [nodeToInsertAfter, [info1, info2, ...]]
    while (i < dirtyRanges.length)
    {
      var range = dirtyRanges[i];
      a = range[0];
      b = range[1];
      var firstDirtyNode = (((a === 0) && root.firstChild) || getCleanNodeByKey(rep.lines.atIndex(a - 1).key).nextSibling);
      firstDirtyNode = (firstDirtyNode && isNodeDirty(firstDirtyNode) && firstDirtyNode);
      var lastDirtyNode = (((b == rep.lines.length()) && root.lastChild) || getCleanNodeByKey(rep.lines.atIndex(b).key).previousSibling);
      lastDirtyNode = (lastDirtyNode && isNodeDirty(lastDirtyNode) && lastDirtyNode);
      if (firstDirtyNode && lastDirtyNode)
      {
        var cc = makeContentCollector(isStyled, browser, rep.apool, null, className2Author);
        cc.notifySelection(selection);
        var dirtyNodes = [];
        for (var n = firstDirtyNode; n && !(n.previousSibling && n.previousSibling == lastDirtyNode);
        n = n.nextSibling)
        {
          if (browser.msie)
          {
            // try to undo IE's pesky and overzealous linkification
            try
            {
              n.createTextRange().execCommand("unlink", false, null);
            }
            catch (e)
            {}
          }
          cc.collectContent(n);
          dirtyNodes.push(n);
        }
        cc.notifyNextNode(lastDirtyNode.nextSibling);
        var lines = cc.getLines();
        if ((lines.length <= 1 || lines[lines.length - 1] !== "") && lastDirtyNode.nextSibling)
        {
          // dirty region doesn't currently end a line, even taking the following node
          // (or lack of node) into account, so include the following clean node.
          // It could be SPAN or a DIV; basically this is any case where the contentCollector
          // decides it isn't done.
          // Note that this clean node might need to be there for the next dirty range.
          //console.log("inclusive of "+lastDirtyNode.next().dom.tagName);
          b++;
          var cleanLine = lastDirtyNode.nextSibling;
          cc.collectContent(cleanLine);
          toDeleteAtEnd.push(cleanLine);
          cc.notifyNextNode(cleanLine.nextSibling);
        }

        var ccData = cc.finish();
        var ss = ccData.selStart;
        var se = ccData.selEnd;
        lines = ccData.lines;
        var lineAttribs = ccData.lineAttribs;
        var linesWrapped = ccData.linesWrapped;
        var scrollToTheLeftNeeded = false;

        if (linesWrapped > 0)
        {
          if(!browser.msie){
            // chrome decides in it's infinite wisdom that its okay to put the browsers visisble window in the middle of the span
            // an outcome of this is that the first chars of the string are no longer visible to the user..  Yay chrome..
            // Move the browsers visible area to the left hand side of the span
            // Firefox isn't quite so bad, but it's still pretty quirky.
            var scrollToTheLeftNeeded = true;
          }
          // console.log("Editor warning: " + linesWrapped + " long line" + (linesWrapped == 1 ? " was" : "s were") + " hard-wrapped into " + ccData.numLinesAfter + " lines.");
        }

        if (ss[0] >= 0) selStart = [ss[0] + a + netNumLinesChangeSoFar, ss[1]];
        if (se[0] >= 0) selEnd = [se[0] + a + netNumLinesChangeSoFar, se[1]];

        var entries = [];
        var nodeToAddAfter = lastDirtyNode;
        var lineNodeInfos = new Array(lines.length);
        for (var k = 0; k < lines.length; k++)
        {
          var lineString = lines[k];
          var newEntry = createDomLineEntry(lineString);
          entries.push(newEntry);
          lineNodeInfos[k] = newEntry.domInfo;
        }
        //var fragment = magicdom.wrapDom(document.createDocumentFragment());
        domInsertsNeeded.push([nodeToAddAfter, lineNodeInfos]);
        _.each(dirtyNodes,function(n){
          toDeleteAtEnd.push(n);
        });
        var spliceHints = {};
        if (selStart) spliceHints.selStart = selStart;
        if (selEnd) spliceHints.selEnd = selEnd;
        splicesToDo.push([a + netNumLinesChangeSoFar, b - a, entries, lineAttribs, spliceHints]);
        netNumLinesChangeSoFar += (lines.length - (b - a));
      }
      else if (b > a)
      {
        splicesToDo.push([a + netNumLinesChangeSoFar, b - a, [],
          []
        ]);
      }
      i++;
    }

    var domChanges = (splicesToDo.length > 0);

    // update the representation
    p.mark("splice");
    _.each(splicesToDo, function(splice)
    {
      doIncorpLineSplice(splice[0], splice[1], splice[2], splice[3], splice[4]);
    });

    //p.mark("relex");
    //rep.lexer.lexCharRange(getVisibleCharRange(), function() { return false; });
    //var isTimeUp = newTimeLimit(100);
    // do DOM inserts
    p.mark("insert");
    _.each(domInsertsNeeded,function(ins)
    {
      insertDomLines(ins[0], ins[1], isTimeUp);
    });

    p.mark("del");
    // delete old dom nodes
    _.each(toDeleteAtEnd,function(n)
    {
      //var id = n.uniqueId();
      // parent of n may not be "root" in IE due to non-tree-shaped DOM (wtf)
      if(n.parentNode) n.parentNode.removeChild(n);

      //dmesg(htmlPrettyEscape(htmlForRemovedChild(n)));
      //console.log("removed: "+id);
    });

    if(scrollToTheLeftNeeded){ // needed to stop chrome from breaking the ui when long strings without spaces are pasted
      $("#innerdocbody").scrollLeft(0);
    }

    p.mark("findsel");
    // if the nodes that define the selection weren't encountered during
    // content collection, figure out where those nodes are now.
    if (selection && !selStart)
    {
      //if (domChanges) dmesg("selection not collected");
      var selStartFromHook = hooks.callAll('aceStartLineAndCharForPoint', {
        callstack: currentCallStack,
        editorInfo: editorInfo,
        rep: rep,
        root:root,
        point:selection.startPoint,
        documentAttributeManager: documentAttributeManager
      });
      selStart = (selStartFromHook==null||selStartFromHook.length==0)?getLineAndCharForPoint(selection.startPoint):selStartFromHook;
    }
    if (selection && !selEnd)
    {
      var selEndFromHook = hooks.callAll('aceEndLineAndCharForPoint', {
        callstack: currentCallStack,
        editorInfo: editorInfo,
        rep: rep,
        root:root,
        point:selection.endPoint,
        documentAttributeManager: documentAttributeManager
      });
      selEnd = (selEndFromHook==null||selEndFromHook.length==0)?getLineAndCharForPoint(selection.endPoint):selEndFromHook;
    }

    // selection from content collection can, in various ways, extend past final
    // BR in firefox DOM, so cap the line
    var numLines = rep.lines.length();
    if (selStart && selStart[0] >= numLines)
    {
      selStart[0] = numLines - 1;
      selStart[1] = rep.lines.atIndex(selStart[0]).text.length;
    }
    if (selEnd && selEnd[0] >= numLines)
    {
      selEnd[0] = numLines - 1;
      selEnd[1] = rep.lines.atIndex(selEnd[0]).text.length;
    }

    p.mark("repsel");
    // update rep if we have a new selection
    // NOTE: IE loses the selection when you click stuff in e.g. the
    // editbar, so removing the selection when it's lost is not a good
    // idea.
    if (selection) repSelectionChange(selStart, selEnd, selection && selection.focusAtStart);
    // update browser selection
    p.mark("browsel");
    if (selection && (domChanges || isCaret()))
    {
      // if no DOM changes (not this case), want to treat range selection delicately,
      // e.g. in IE not lose which end of the selection is the focus/anchor;
      // on the other hand, we may have just noticed a press of PageUp/PageDown
      currentCallStack.selectionAffected = true;
    }

    currentCallStack.domClean = true;

    p.mark("fixview");

    fixView();

    p.end("END");

    return domChanges;
  }

  var STYLE_ATTRIBS = {
    bold: true,
    italic: true,
    underline: true,
    strikethrough: true,
    list: true
  };
  var OTHER_INCORPED_ATTRIBS = {
    insertorder: true,
    author: true
  };

  function isStyleAttribute(aname)
  {
    return !!STYLE_ATTRIBS[aname];
  }

  function isIncorpedAttribute(aname)
  {
    return ( !! STYLE_ATTRIBS[aname]) || ( !! OTHER_INCORPED_ATTRIBS[aname]);
  }

  function insertDomLines(nodeToAddAfter, infoStructs, isTimeUp)
  {
    isTimeUp = (isTimeUp ||
    function()
    {
      return false;
    });

    var lastEntry;
    var lineStartOffset;
    if (infoStructs.length < 1) return;
    var startEntry = rep.lines.atKey(uniqueId(infoStructs[0].node));
    var endEntry = rep.lines.atKey(uniqueId(infoStructs[infoStructs.length - 1].node));
    var charStart = rep.lines.offsetOfEntry(startEntry);
    var charEnd = rep.lines.offsetOfEntry(endEntry) + endEntry.width;

    //rep.lexer.lexCharRange([charStart, charEnd], isTimeUp);
    _.each(infoStructs, function(info)
    {
      var p2 = PROFILER("insertLine", false);
      var node = info.node;
      var key = uniqueId(node);
      var entry;
      p2.mark("findEntry");
      if (lastEntry)
      {
        // optimization to avoid recalculation
        var next = rep.lines.next(lastEntry);
        if (next && next.key == key)
        {
          entry = next;
          lineStartOffset += lastEntry.width;
        }
      }
      if (!entry)
      {
        p2.literal(1, "nonopt");
        entry = rep.lines.atKey(key);
        lineStartOffset = rep.lines.offsetOfKey(key);
      }
      else p2.literal(0, "nonopt");
      lastEntry = entry;
      p2.mark("spans");
      getSpansForLine(entry, function(tokenText, tokenClass)
      {
        info.appendSpan(tokenText, tokenClass);
      }, lineStartOffset, isTimeUp());
      //else if (entry.text.length > 0) {
      //info.appendSpan(entry.text, 'dirty');
      //}
      p2.mark("addLine");
      info.prepareForAdd();
      entry.lineMarker = info.lineMarker;
      if (!nodeToAddAfter)
      {
        root.insertBefore(node, root.firstChild);
      }
      else
      {
        root.insertBefore(node, nodeToAddAfter.nextSibling);
      }
      nodeToAddAfter = node;
      info.notifyAdded();
      p2.mark("markClean");
      markNodeClean(node);
      p2.end();
    });
  }

  function isCaret()
  {
    return (rep.selStart && rep.selEnd && rep.selStart[0] == rep.selEnd[0] && rep.selStart[1] == rep.selEnd[1]);
  }
  editorInfo.ace_isCaret = isCaret;

  // prereq: isCaret()


  function caretLine()
  {
    return rep.selStart[0];
  }
  editorInfo.ace_caretLine = caretLine;

  function caretColumn()
  {
    return rep.selStart[1];
  }
  editorInfo.ace_caretColumn = caretColumn;

  function caretDocChar()
  {
    return rep.lines.offsetOfIndex(caretLine()) + caretColumn();
  }
  editorInfo.ace_caretDocChar = caretDocChar;

  function handleReturnIndentation()
  {
    // on return, indent to level of previous line
    if (isCaret() && caretColumn() === 0 && caretLine() > 0)
    {
      var lineNum = caretLine();
      var thisLine = rep.lines.atIndex(lineNum);
      var prevLine = rep.lines.prev(thisLine);
      var prevLineText = prevLine.text;
      var theIndent = /^ *(?:)/.exec(prevLineText)[0];
      if (/[\[\(\:\{]\s*$/.exec(prevLineText)) theIndent += THE_TAB;
      var cs = Changeset.builder(rep.lines.totalWidth()).keep(
      rep.lines.offsetOfIndex(lineNum), lineNum).insert(
      theIndent, [
        ['author', thisAuthor]
      ], rep.apool).toString();
      performDocumentApplyChangeset(cs);
      performSelectionChange([lineNum, theIndent.length], [lineNum, theIndent.length]);
    }
  }

  function getPointForLineAndChar(lineAndChar)
  {
    var line = lineAndChar[0];
    var charsLeft = lineAndChar[1];
    //console.log("line: %d, key: %s, node: %o", line, rep.lines.atIndex(line).key,
    //getCleanNodeByKey(rep.lines.atIndex(line).key));
    var lineEntry = rep.lines.atIndex(line);
    charsLeft -= lineEntry.lineMarker;
    if (charsLeft < 0)
    {
      charsLeft = 0;
    }
    var lineNode = lineEntry.lineNode;
    var n = lineNode;
    var after = false;
    if (charsLeft === 0)
    {
      var index = 0;

      if (browser.msie && parseInt(browser.version) >= 11) {
        browser.msie = false; // Temp fix to resolve enter and backspace issues..
        // Note that this makes MSIE behave like modern browsers..
      }
      if (browser.msie && line == (rep.lines.length() - 1) && lineNode.childNodes.length === 0)
      {
        // best to stay at end of last empty div in IE
        index = 1;
      }
      return {
        node: lineNode,
        index: index,
        maxIndex: 1
      };
    }
    while (!(n == lineNode && after))
    {
      if (after)
      {
        if (n.nextSibling)
        {
          n = n.nextSibling;
          after = false;
        }
        else n = n.parentNode;
      }
      else
      {
        if (isNodeText(n))
        {
          var len = n.nodeValue.length;
          if (charsLeft <= len)
          {
            return {
              node: n,
              index: charsLeft,
              maxIndex: len
            };
          }
          charsLeft -= len;
          after = true;
        }
        else
        {
          if (n.firstChild) n = n.firstChild;
          else after = true;
        }
      }
    }
    return {
      node: lineNode,
      index: 1,
      maxIndex: 1
    };
  }

  function nodeText(n)
  {
      if (browser.msie) {
	  return n.innerText;
      } else {
	  return n.textContent || n.nodeValue || '';
      }
  }

  function getLineAndCharForPoint(point)
  {
    // Turn DOM node selection into [line,char] selection.
    // This method has to work when the DOM is not pristine,
    // assuming the point is not in a dirty node.
    if (point.node == root)
    {
      if (point.index === 0)
      {
        return [0, 0];
      }
      else
      {
        var N = rep.lines.length();
        var ln = rep.lines.atIndex(N - 1);
        return [N - 1, ln.text.length];
      }
    }
    else
    {
      var n = point.node;
      var col = 0;
      // if this part fails, it probably means the selection node
      // was dirty, and we didn't see it when collecting dirty nodes.
      if (isNodeText(n))
      {
        col = point.index;
      }
      else if (point.index > 0)
      {
        col = nodeText(n).length;
      }
      var parNode, prevSib;
      while ((parNode = n.parentNode) != root)
      {
        if ((prevSib = n.previousSibling))
        {
          n = prevSib;
          col += nodeText(n).length;
        }
        else
        {
          n = parNode;
        }
      }
      if (n.id === "") console.debug("BAD");
      if (n.firstChild && isBlockElement(n.firstChild))
      {
        col += 1; // lineMarker
      }
      var lineEntry = rep.lines.atKey(n.id);
      var lineNum = rep.lines.indexOfEntry(lineEntry);
      return [lineNum, col];
    }
  }
  editorInfo.ace_getLineAndCharForPoint = getLineAndCharForPoint;

  function createDomLineEntry(lineString)
  {
    var info = doCreateDomLine(lineString.length > 0);
    var newNode = info.node;
    return {
      key: uniqueId(newNode),
      text: lineString,
      lineNode: newNode,
      domInfo: info,
      lineMarker: 0
    };
  }

  function canApplyChangesetToDocument(changes)
  {
    return Changeset.oldLen(changes) == rep.alltext.length;
  }

  function performDocumentApplyChangeset(changes, insertsAfterSelection)
  {
    doRepApplyChangeset(changes, insertsAfterSelection);

    var requiredSelectionSetting = null;
    if (rep.selStart && rep.selEnd)
    {
      var selStartChar = rep.lines.offsetOfIndex(rep.selStart[0]) + rep.selStart[1];
      var selEndChar = rep.lines.offsetOfIndex(rep.selEnd[0]) + rep.selEnd[1];
      var result = Changeset.characterRangeFollow(changes, selStartChar, selEndChar, insertsAfterSelection);
      requiredSelectionSetting = [result[0], result[1], rep.selFocusAtStart];
    }

    var linesMutatee = {
      splice: function(start, numRemoved, newLinesVA)
      {
        var args = Array.prototype.slice.call(arguments, 2);
        domAndRepSplice(start, numRemoved, _.map(args, function(s){ return s.slice(0, -1); }), null);
      },
      get: function(i)
      {
        return rep.lines.atIndex(i).text + '\n';
      },
      length: function()
      {
        return rep.lines.length();
      },
      slice_notused: function(start, end)
      {
        return _.map(rep.lines.slice(start, end), function(e)
        {
          return e.text + '\n';
        });
      }
    };

    Changeset.mutateTextLines(changes, linesMutatee);

    checkALines();

    if (requiredSelectionSetting)
    {
      performSelectionChange(lineAndColumnFromChar(requiredSelectionSetting[0]), lineAndColumnFromChar(requiredSelectionSetting[1]), requiredSelectionSetting[2]);
    }

    function domAndRepSplice(startLine, deleteCount, newLineStrings, isTimeUp)
    {
      // dgreensp 3/2009: the spliced lines may be in the middle of a dirty region,
      // so if no explicit time limit, don't spend a lot of time highlighting
      isTimeUp = (isTimeUp || newTimeLimit(50));

      var keysToDelete = [];
      if (deleteCount > 0)
      {
        var entryToDelete = rep.lines.atIndex(startLine);
        for (var i = 0; i < deleteCount; i++)
        {
          keysToDelete.push(entryToDelete.key);
          entryToDelete = rep.lines.next(entryToDelete);
        }
      }

      var lineEntries = _.map(newLineStrings, createDomLineEntry);

      doRepLineSplice(startLine, deleteCount, lineEntries);

      var nodeToAddAfter;
      if (startLine > 0)
      {
        nodeToAddAfter = getCleanNodeByKey(rep.lines.atIndex(startLine - 1).key);
      }
      else nodeToAddAfter = null;

      insertDomLines(nodeToAddAfter, _.map(lineEntries, function(entry)
      {
        return entry.domInfo;
      }), isTimeUp);

      _.each(keysToDelete, function(k)
      {
        var n = doc.getElementById(k);
        n.parentNode.removeChild(n);
      });

      if ((rep.selStart && rep.selStart[0] >= startLine && rep.selStart[0] <= startLine + deleteCount) || (rep.selEnd && rep.selEnd[0] >= startLine && rep.selEnd[0] <= startLine + deleteCount))
      {
        currentCallStack.selectionAffected = true;
      }
    }
  }

  function checkChangesetLineInformationAgainstRep(changes)
  {
    return true; // disable for speed
    var opIter = Changeset.opIterator(Changeset.unpack(changes).ops);
    var curOffset = 0;
    var curLine = 0;
    var curCol = 0;
    while (opIter.hasNext())
    {
      var o = opIter.next();
      if (o.opcode == '-' || o.opcode == '=')
      {
        curOffset += o.chars;
        if (o.lines)
        {
          curLine += o.lines;
          curCol = 0;
        }
        else
        {
          curCol += o.chars;
        }
      }
      var calcLine = rep.lines.indexOfOffset(curOffset);
      var calcLineStart = rep.lines.offsetOfIndex(calcLine);
      var calcCol = curOffset - calcLineStart;
      if (calcCol != curCol || calcLine != curLine)
      {
        return false;
      }
    }
    return true;
  }

  function doRepApplyChangeset(changes, insertsAfterSelection)
  {
    Changeset.checkRep(changes);

    if (Changeset.oldLen(changes) != rep.alltext.length) throw new Error("doRepApplyChangeset length mismatch: " + Changeset.oldLen(changes) + "/" + rep.alltext.length);

    if (!checkChangesetLineInformationAgainstRep(changes))
    {
      throw new Error("doRepApplyChangeset line break mismatch");
    }

    (function doRecordUndoInformation(changes)
    {
      var editEvent = currentCallStack.editEvent;
      if (editEvent.eventType == "nonundoable")
      {
        if (!editEvent.changeset)
        {
          editEvent.changeset = changes;
        }
        else
        {
          editEvent.changeset = Changeset.compose(editEvent.changeset, changes, rep.apool);
        }
      }
      else
      {
        var inverseChangeset = Changeset.inverse(changes, {
          get: function(i)
          {
            return rep.lines.atIndex(i).text + '\n';
          },
          length: function()
          {
            return rep.lines.length();
          }
        }, rep.alines, rep.apool);

        if (!editEvent.backset)
        {
          editEvent.backset = inverseChangeset;
        }
        else
        {
          editEvent.backset = Changeset.compose(inverseChangeset, editEvent.backset, rep.apool);
        }
      }
    })(changes);

    //rep.alltext = Changeset.applyToText(changes, rep.alltext);
    Changeset.mutateAttributionLines(changes, rep.alines, rep.apool);

    if (changesetTracker.isTracking())
    {
      changesetTracker.composeUserChangeset(changes);
    }

  }

  /*
    Converts the position of a char (index in String) into a [row, col] tuple
  */
  function lineAndColumnFromChar(x)
  {
    var lineEntry = rep.lines.atOffset(x);
    var lineStart = rep.lines.offsetOfEntry(lineEntry);
    var lineNum = rep.lines.indexOfEntry(lineEntry);
    return [lineNum, x - lineStart];
  }

  function performDocumentReplaceCharRange(startChar, endChar, newText)
  {
    if (startChar == endChar && newText.length === 0)
    {
      return;
    }
    // Requires that the replacement preserve the property that the
    // internal document text ends in a newline.  Given this, we
    // rewrite the splice so that it doesn't touch the very last
    // char of the document.
    if (endChar == rep.alltext.length)
    {
      if (startChar == endChar)
      {
        // an insert at end
        startChar--;
        endChar--;
        newText = '\n' + newText.substring(0, newText.length - 1);
      }
      else if (newText.length === 0)
      {
        // a delete at end
        startChar--;
        endChar--;
      }
      else
      {
        // a replace at end
        endChar--;
        newText = newText.substring(0, newText.length - 1);
      }
    }
    performDocumentReplaceRange(lineAndColumnFromChar(startChar), lineAndColumnFromChar(endChar), newText);
  }

  function performDocumentReplaceRange(start, end, newText)
  {
    if (start === undefined) start = rep.selStart;
    if (end === undefined) end = rep.selEnd;

    //dmesg(String([start.toSource(),end.toSource(),newText.toSource()]));
    // start[0]: <--- start[1] --->CCCCCCCCCCC\n
    //           CCCCCCCCCCCCCCCCCCCC\n
    //           CCCC\n
    // end[0]:   <CCC end[1] CCC>-------\n
    var builder = Changeset.builder(rep.lines.totalWidth());
    ChangesetUtils.buildKeepToStartOfRange(rep, builder, start);
    ChangesetUtils.buildRemoveRange(rep, builder, start, end);
    builder.insert(newText, [
      ['author', thisAuthor]
    ], rep.apool);
    var cs = builder.toString();

    performDocumentApplyChangeset(cs);
  }

  function performDocumentApplyAttributesToCharRange(start, end, attribs)
  {
    end = Math.min(end, rep.alltext.length - 1);
    documentAttributeManager.setAttributesOnRange(lineAndColumnFromChar(start), lineAndColumnFromChar(end), attribs);
  }
  editorInfo.ace_performDocumentApplyAttributesToCharRange = performDocumentApplyAttributesToCharRange;


  function setAttributeOnSelection(attributeName, attributeValue)
  {
    if (!(rep.selStart && rep.selEnd)) return;

    documentAttributeManager.setAttributesOnRange(rep.selStart, rep.selEnd, [
      [attributeName, attributeValue]
    ]);
  }
  editorInfo.ace_setAttributeOnSelection = setAttributeOnSelection;


  function getAttributeOnSelection(attributeName){
    if (!(rep.selStart && rep.selEnd)) return
    
    var withIt = Changeset.makeAttribsString('+', [
      [attributeName, 'true']
    ], rep.apool);
    var withItRegex = new RegExp(withIt.replace(/\*/g, '\\*') + "(\\*|$)");
    function hasIt(attribs)
    {
      return withItRegex.test(attribs);
    }

    return rangeHasAttrib(rep.selStart, rep.selEnd)
    
    function rangeHasAttrib(selStart, selEnd) {
      // if range is collapsed -> no attribs in range
      if(selStart[1] == selEnd[1] && selStart[0] == selEnd[0]) return false
      
      if(selStart[0] != selEnd[0]) { // -> More than one line selected
        var hasAttrib = true
        
        // from selStart to the end of the first line
        hasAttrib = hasAttrib && rangeHasAttrib(selStart, [selStart[0], rep.lines.atIndex(selStart[0]).text.length])

        // for all lines in between
        for(var n=selStart[0]+1; n < selEnd[0]; n++) {
          hasAttrib = hasAttrib && rangeHasAttrib([n, 0], [n, rep.lines.atIndex(n).text.length])
        }

        // for the last, potentially partial, line
        hasAttrib = hasAttrib && rangeHasAttrib([selEnd[0], 0], [selEnd[0], selEnd[1]])
        
        return hasAttrib
      }
      
      // Logic tells us we now have a range on a single line
      
      var lineNum = selStart[0]
        , start = selStart[1]
        , end = selEnd[1]
        , hasAttrib = true
      
      // Iterate over attribs on this line
      
      var opIter = Changeset.opIterator(rep.alines[lineNum])
        , indexIntoLine = 0
      
      while (opIter.hasNext()) {
        var op = opIter.next();
        var opStartInLine = indexIntoLine;
        var opEndInLine = opStartInLine + op.chars;
        if (!hasIt(op.attribs)) {
          // does op overlap selection?
          if (!(opEndInLine <= start || opStartInLine >= end)) {
            hasAttrib = false; // since it's overlapping but hasn't got the attrib -> range hasn't got it
            break;
          }
        }
        indexIntoLine = opEndInLine;
      }
      
      return hasAttrib
    }
  }
  
  editorInfo.ace_getAttributeOnSelection = getAttributeOnSelection;

  function toggleAttributeOnSelection(attributeName)
  {
    if (!(rep.selStart && rep.selEnd)) return;

    var selectionAllHasIt = true;
    var withIt = Changeset.makeAttribsString('+', [
      [attributeName, 'true']
    ], rep.apool);
    var withItRegex = new RegExp(withIt.replace(/\*/g, '\\*') + "(\\*|$)");

    function hasIt(attribs)
    {
      return withItRegex.test(attribs);
    }

    var selStartLine = rep.selStart[0];
    var selEndLine = rep.selEnd[0];
    for (var n = selStartLine; n <= selEndLine; n++)
    {
      var opIter = Changeset.opIterator(rep.alines[n]);
      var indexIntoLine = 0;
      var selectionStartInLine = 0;
      var selectionEndInLine = rep.lines.atIndex(n).text.length; // exclude newline
      if (n == selStartLine)
      {
        selectionStartInLine = rep.selStart[1];
      }
      if (n == selEndLine)
      {
        selectionEndInLine = rep.selEnd[1];
      }
      while (opIter.hasNext())
      {
        var op = opIter.next();
        var opStartInLine = indexIntoLine;
        var opEndInLine = opStartInLine + op.chars;
        if (!hasIt(op.attribs))
        {
          // does op overlap selection?
          if (!(opEndInLine <= selectionStartInLine || opStartInLine >= selectionEndInLine))
          {
            selectionAllHasIt = false;
            break;
          }
        }
        indexIntoLine = opEndInLine;
      }
      if (!selectionAllHasIt)
      {
        break;
      }
    }

    if (selectionAllHasIt)
    {
      documentAttributeManager.setAttributesOnRange(rep.selStart, rep.selEnd, [
        [attributeName, '']
      ]);
    }
    else
    {
      documentAttributeManager.setAttributesOnRange(rep.selStart, rep.selEnd, [
        [attributeName, 'true']
      ]);
    }
  }
  editorInfo.ace_toggleAttributeOnSelection = toggleAttributeOnSelection;

  function performDocumentReplaceSelection(newText)
  {
    if (!(rep.selStart && rep.selEnd)) return;
    performDocumentReplaceRange(rep.selStart, rep.selEnd, newText);
  }

  // Change the abstract representation of the document to have a different set of lines.
  // Must be called after rep.alltext is set.


  function doRepLineSplice(startLine, deleteCount, newLineEntries)
  {

    _.each(newLineEntries, function(entry)
    {
      entry.width = entry.text.length + 1;
    });

    var startOldChar = rep.lines.offsetOfIndex(startLine);
    var endOldChar = rep.lines.offsetOfIndex(startLine + deleteCount);

    var oldRegionStart = rep.lines.offsetOfIndex(startLine);
    var oldRegionEnd = rep.lines.offsetOfIndex(startLine + deleteCount);
    rep.lines.splice(startLine, deleteCount, newLineEntries);
    currentCallStack.docTextChanged = true;
    currentCallStack.repChanged = true;
    var newRegionEnd = rep.lines.offsetOfIndex(startLine + newLineEntries.length);

    var newText = _.map(newLineEntries, function(e)
    {
      return e.text + '\n';
    }).join('');

    rep.alltext = rep.alltext.substring(0, startOldChar) + newText + rep.alltext.substring(endOldChar, rep.alltext.length);

    //var newTotalLength = rep.alltext.length;
    //rep.lexer.updateBuffer(rep.alltext, oldRegionStart, oldRegionEnd - oldRegionStart,
    //newRegionEnd - oldRegionStart);
  }

  function doIncorpLineSplice(startLine, deleteCount, newLineEntries, lineAttribs, hints)
  {

    var startOldChar = rep.lines.offsetOfIndex(startLine);
    var endOldChar = rep.lines.offsetOfIndex(startLine + deleteCount);

    var oldRegionStart = rep.lines.offsetOfIndex(startLine);

    var selStartHintChar, selEndHintChar;
    if (hints && hints.selStart)
    {
      selStartHintChar = rep.lines.offsetOfIndex(hints.selStart[0]) + hints.selStart[1] - oldRegionStart;
    }
    if (hints && hints.selEnd)
    {
      selEndHintChar = rep.lines.offsetOfIndex(hints.selEnd[0]) + hints.selEnd[1] - oldRegionStart;
    }

    var newText = _.map(newLineEntries, function(e)
    {
      return e.text + '\n';
    }).join('');
    var oldText = rep.alltext.substring(startOldChar, endOldChar);
    var oldAttribs = rep.alines.slice(startLine, startLine + deleteCount).join('');
    var newAttribs = lineAttribs.join('|1+1') + '|1+1'; // not valid in a changeset
    var analysis = analyzeChange(oldText, newText, oldAttribs, newAttribs, selStartHintChar, selEndHintChar);
    var commonStart = analysis[0];
    var commonEnd = analysis[1];
    var shortOldText = oldText.substring(commonStart, oldText.length - commonEnd);
    var shortNewText = newText.substring(commonStart, newText.length - commonEnd);
    var spliceStart = startOldChar + commonStart;
    var spliceEnd = endOldChar - commonEnd;
    var shiftFinalNewlineToBeforeNewText = false;

    // adjust the splice to not involve the final newline of the document;
    // be very defensive
    if (shortOldText.charAt(shortOldText.length - 1) == '\n' && shortNewText.charAt(shortNewText.length - 1) == '\n')
    {
      // replacing text that ends in newline with text that also ends in newline
      // (still, after analysis, somehow)
      shortOldText = shortOldText.slice(0, -1);
      shortNewText = shortNewText.slice(0, -1);
      spliceEnd--;
      commonEnd++;
    }
    if (shortOldText.length === 0 && spliceStart == rep.alltext.length && shortNewText.length > 0)
    {
      // inserting after final newline, bad
      spliceStart--;
      spliceEnd--;
      shortNewText = '\n' + shortNewText.slice(0, -1);
      shiftFinalNewlineToBeforeNewText = true;
    }
    if (spliceEnd == rep.alltext.length && shortOldText.length > 0 && shortNewText.length === 0)
    {
      // deletion at end of rep.alltext
      if (rep.alltext.charAt(spliceStart - 1) == '\n')
      {
        // (if not then what the heck?  it will definitely lead
        // to a rep.alltext without a final newline)
        spliceStart--;
        spliceEnd--;
      }
    }

    if (!(shortOldText.length === 0 && shortNewText.length === 0))
    {
      var oldDocText = rep.alltext;
      var oldLen = oldDocText.length;

      var spliceStartLine = rep.lines.indexOfOffset(spliceStart);
      var spliceStartLineStart = rep.lines.offsetOfIndex(spliceStartLine);

      var startBuilder = function()
      {
        var builder = Changeset.builder(oldLen);
        builder.keep(spliceStartLineStart, spliceStartLine);
        builder.keep(spliceStart - spliceStartLineStart);
        return builder;
      };

      var eachAttribRun = function(attribs, func /*(startInNewText, endInNewText, attribs)*/ )
      {
        var attribsIter = Changeset.opIterator(attribs);
        var textIndex = 0;
        var newTextStart = commonStart;
        var newTextEnd = newText.length - commonEnd - (shiftFinalNewlineToBeforeNewText ? 1 : 0);
        while (attribsIter.hasNext())
        {
          var op = attribsIter.next();
          var nextIndex = textIndex + op.chars;
          if (!(nextIndex <= newTextStart || textIndex >= newTextEnd))
          {
            func(Math.max(newTextStart, textIndex), Math.min(newTextEnd, nextIndex), op.attribs);
          }
          textIndex = nextIndex;
        }
      };

      var justApplyStyles = (shortNewText == shortOldText);
      var theChangeset;

      if (justApplyStyles)
      {
        // create changeset that clears the incorporated styles on
        // the existing text.  we compose this with the
        // changeset the applies the styles found in the DOM.
        // This allows us to incorporate, e.g., Safari's native "unbold".
        var incorpedAttribClearer = cachedStrFunc(function(oldAtts)
        {
          return Changeset.mapAttribNumbers(oldAtts, function(n)
          {
            var k = rep.apool.getAttribKey(n);
            if (isStyleAttribute(k))
            {
              return rep.apool.putAttrib([k, '']);
            }
            return false;
          });
        });

        var builder1 = startBuilder();
        if (shiftFinalNewlineToBeforeNewText)
        {
          builder1.keep(1, 1);
        }
        eachAttribRun(oldAttribs, function(start, end, attribs)
        {
          builder1.keepText(newText.substring(start, end), incorpedAttribClearer(attribs));
        });
        var clearer = builder1.toString();

        var builder2 = startBuilder();
        if (shiftFinalNewlineToBeforeNewText)
        {
          builder2.keep(1, 1);
        }
        eachAttribRun(newAttribs, function(start, end, attribs)
        {
          builder2.keepText(newText.substring(start, end), attribs);
        });
        var styler = builder2.toString();

        theChangeset = Changeset.compose(clearer, styler, rep.apool);
      }
      else
      {
        var builder = startBuilder();

        var spliceEndLine = rep.lines.indexOfOffset(spliceEnd);
        var spliceEndLineStart = rep.lines.offsetOfIndex(spliceEndLine);
        if (spliceEndLineStart > spliceStart)
        {
          builder.remove(spliceEndLineStart - spliceStart, spliceEndLine - spliceStartLine);
          builder.remove(spliceEnd - spliceEndLineStart);
        }
        else
        {
          builder.remove(spliceEnd - spliceStart);
        }

        var isNewTextMultiauthor = false;
        var authorAtt = Changeset.makeAttribsString('+', (thisAuthor ? [
          ['author', thisAuthor]
        ] : []), rep.apool);
        var authorizer = cachedStrFunc(function(oldAtts)
        {
          if (isNewTextMultiauthor)
          {
            // prefer colors from DOM
            return Changeset.composeAttributes(authorAtt, oldAtts, true, rep.apool);
          }
          else
          {
            // use this author's color
            return Changeset.composeAttributes(oldAtts, authorAtt, true, rep.apool);
          }
        });

        var foundDomAuthor = '';
        eachAttribRun(newAttribs, function(start, end, attribs)
        {
          var a = Changeset.attribsAttributeValue(attribs, 'author', rep.apool);
          if (a && a != foundDomAuthor)
          {
            if (!foundDomAuthor)
            {
              foundDomAuthor = a;
            }
            else
            {
              isNewTextMultiauthor = true; // multiple authors in DOM!
            }
          }
        });

        if (shiftFinalNewlineToBeforeNewText)
        {
          builder.insert('\n', authorizer(''));
        }

        eachAttribRun(newAttribs, function(start, end, attribs)
        {
          builder.insert(newText.substring(start, end), authorizer(attribs));
        });
        theChangeset = builder.toString();
      }

      //dmesg(htmlPrettyEscape(theChangeset));
      doRepApplyChangeset(theChangeset);
    }

    // do this no matter what, because we need to get the right
    // line keys into the rep.
    doRepLineSplice(startLine, deleteCount, newLineEntries);

    checkALines();
  }

  function cachedStrFunc(func)
  {
    var cache = {};
    return function(s)
    {
      if (!cache[s])
      {
        cache[s] = func(s);
      }
      return cache[s];
    };
  }

  function analyzeChange(oldText, newText, oldAttribs, newAttribs, optSelStartHint, optSelEndHint)
  {
    function incorpedAttribFilter(anum)
    {
      return isStyleAttribute(rep.apool.getAttribKey(anum));
    }

    function attribRuns(attribs)
    {
      var lengs = [];
      var atts = [];
      var iter = Changeset.opIterator(attribs);
      while (iter.hasNext())
      {
        var op = iter.next();
        lengs.push(op.chars);
        atts.push(op.attribs);
      }
      return [lengs, atts];
    }

    function attribIterator(runs, backward)
    {
      var lengs = runs[0];
      var atts = runs[1];
      var i = (backward ? lengs.length - 1 : 0);
      var j = 0;
      return function next()
      {
        while (j >= lengs[i])
        {
          if (backward) i--;
          else i++;
          j = 0;
        }
        var a = atts[i];
        j++;
        return a;
      };
    }

    var oldLen = oldText.length;
    var newLen = newText.length;
    var minLen = Math.min(oldLen, newLen);

    var oldARuns = attribRuns(Changeset.filterAttribNumbers(oldAttribs, incorpedAttribFilter));
    var newARuns = attribRuns(Changeset.filterAttribNumbers(newAttribs, incorpedAttribFilter));

    var commonStart = 0;
    var oldStartIter = attribIterator(oldARuns, false);
    var newStartIter = attribIterator(newARuns, false);
    while (commonStart < minLen)
    {
      if (oldText.charAt(commonStart) == newText.charAt(commonStart) && oldStartIter() == newStartIter())
      {
        commonStart++;
      }
      else break;
    }

    var commonEnd = 0;
    var oldEndIter = attribIterator(oldARuns, true);
    var newEndIter = attribIterator(newARuns, true);
    while (commonEnd < minLen)
    {
      if (commonEnd === 0)
      {
        // assume newline in common
        oldEndIter();
        newEndIter();
        commonEnd++;
      }
      else if (oldText.charAt(oldLen - 1 - commonEnd) == newText.charAt(newLen - 1 - commonEnd) && oldEndIter() == newEndIter())
      {
        commonEnd++;
      }
      else break;
    }

    var hintedCommonEnd = -1;
    if ((typeof optSelEndHint) == "number")
    {
      hintedCommonEnd = newLen - optSelEndHint;
    }


    if (commonStart + commonEnd > oldLen)
    {
      // ambiguous insertion
      var minCommonEnd = oldLen - commonStart;
      var maxCommonEnd = commonEnd;
      if (hintedCommonEnd >= minCommonEnd && hintedCommonEnd <= maxCommonEnd)
      {
        commonEnd = hintedCommonEnd;
      }
      else
      {
        commonEnd = minCommonEnd;
      }
      commonStart = oldLen - commonEnd;
    }
    if (commonStart + commonEnd > newLen)
    {
      // ambiguous deletion
      var minCommonEnd = newLen - commonStart;
      var maxCommonEnd = commonEnd;
      if (hintedCommonEnd >= minCommonEnd && hintedCommonEnd <= maxCommonEnd)
      {
        commonEnd = hintedCommonEnd;
      }
      else
      {
        commonEnd = minCommonEnd;
      }
      commonStart = newLen - commonEnd;
    }

    return [commonStart, commonEnd];
  }

  function equalLineAndChars(a, b)
  {
    if (!a) return !b;
    if (!b) return !a;
    return (a[0] == b[0] && a[1] == b[1]);
  }

  function performSelectionChange(selectStart, selectEnd, focusAtStart)
  {
    if (repSelectionChange(selectStart, selectEnd, focusAtStart))
    {
      currentCallStack.selectionAffected = true;
    }
  }
  editorInfo.ace_performSelectionChange = performSelectionChange;

  // Change the abstract representation of the document to have a different selection.
  // Should not rely on the line representation.  Should not affect the DOM.


  function repSelectionChange(selectStart, selectEnd, focusAtStart)
  {
    focusAtStart = !! focusAtStart;

    var newSelFocusAtStart = (focusAtStart && ((!selectStart) || (!selectEnd) || (selectStart[0] != selectEnd[0]) || (selectStart[1] != selectEnd[1])));

    if ((!equalLineAndChars(rep.selStart, selectStart)) || (!equalLineAndChars(rep.selEnd, selectEnd)) || (rep.selFocusAtStart != newSelFocusAtStart))
    {
      rep.selStart = selectStart;
      rep.selEnd = selectEnd;
      rep.selFocusAtStart = newSelFocusAtStart;
      currentCallStack.repChanged = true;

      return true;
      //console.log("selStart: %o, selEnd: %o, focusAtStart: %s", rep.selStart, rep.selEnd,
      //String(!!rep.selFocusAtStart));
    }
    return false;
    //console.log("%o %o %s", rep.selStart, rep.selEnd, rep.selFocusAtStart);
  }

  function doCreateDomLine(nonEmpty)
  {
    if (browser.msie && (!nonEmpty))
    {
      var result = {
        node: null,
        appendSpan: noop,
        prepareForAdd: noop,
        notifyAdded: noop,
        clearSpans: noop,
        finishUpdate: noop,
        lineMarker: 0
      };

      var lineElem = doc.createElement("div");
      result.node = lineElem;

      result.notifyAdded = function()
      {
        // magic -- settng an empty div's innerHTML to the empty string
        // keeps it from collapsing.  Apparently innerHTML must be set *after*
        // adding the node to the DOM.
        // Such a div is what IE 6 creates naturally when you make a blank line
        // in a document of divs.  However, when copy-and-pasted the div will
        // contain a space, so we note its emptiness with a property.
        lineElem.innerHTML = " "; // Frist we set a value that isnt blank
        // a primitive-valued property survives copy-and-paste
        setAssoc(lineElem, "shouldBeEmpty", true);
        // an object property doesn't
        setAssoc(lineElem, "unpasted", {});
        lineElem.innerHTML = ""; // Then we make it blank..  New line and no space = Awesome :)
      };
      var lineClass = 'ace-line';
      result.appendSpan = function(txt, cls)
      {
        if ((!txt) && cls)
        {
          // gain a whole-line style (currently to show insertion point in CSS)
          lineClass = domline.addToLineClass(lineClass, cls);
        }
        // otherwise, ignore appendSpan, this is an empty line
      };
      result.clearSpans = function()
      {
        lineClass = ''; // non-null to cause update
      };

      var writeClass = function()
      {
        if (lineClass !== null) lineElem.className = lineClass;
      };

      result.prepareForAdd = writeClass;
      result.finishUpdate = writeClass;
      result.getInnerHTML = function()
      {
        return "";
      };
      return result;
    }
    else
    {
      return domline.createDomLine(nonEmpty, doesWrap, browser, doc);
    }
  }

  function textify(str)
  {
    return str.replace(/[\n\r ]/g, ' ').replace(/\xa0/g, ' ').replace(/\t/g, '        ');
  }

  var _blockElems = {
    "div": 1,
    "p": 1,
    "pre": 1,
    "li": 1,
    "ol": 1,
    "ul": 1
  };

  _.each(hooks.callAll('aceRegisterBlockElements'), function(element){
      _blockElems[element] = 1;
  });

  function isBlockElement(n)
  {
    return !!_blockElems[(n.tagName || "").toLowerCase()];
  }

  function getDirtyRanges()
  {
    // based on observedChanges, return a list of ranges of original lines
    // that need to be removed or replaced with new user content to incorporate
    // the user's changes into the line representation.  ranges may be zero-length,
    // indicating inserted content.  for example, [0,0] means content was inserted
    // at the top of the document, while [3,4] means line 3 was deleted, modified,
    // or replaced with one or more new lines of content. ranges do not touch.
    var p = PROFILER("getDirtyRanges", false);
    p.forIndices = 0;
    p.consecutives = 0;
    p.corrections = 0;

    var cleanNodeForIndexCache = {};
    var N = rep.lines.length(); // old number of lines


    function cleanNodeForIndex(i)
    {
      // if line (i) in the un-updated line representation maps to a clean node
      // in the document, return that node.
      // if (i) is out of bounds, return true. else return false.
      if (cleanNodeForIndexCache[i] === undefined)
      {
        p.forIndices++;
        var result;
        if (i < 0 || i >= N)
        {
          result = true; // truthy, but no actual node
        }
        else
        {
          var key = rep.lines.atIndex(i).key;
          result = (getCleanNodeByKey(key) || false);
        }
        cleanNodeForIndexCache[i] = result;
      }
      return cleanNodeForIndexCache[i];
    }
    var isConsecutiveCache = {};

    function isConsecutive(i)
    {
      if (isConsecutiveCache[i] === undefined)
      {
        p.consecutives++;
        isConsecutiveCache[i] = (function()
        {
          // returns whether line (i) and line (i-1), assumed to be map to clean DOM nodes,
          // or document boundaries, are consecutive in the changed DOM
          var a = cleanNodeForIndex(i - 1);
          var b = cleanNodeForIndex(i);
          if ((!a) || (!b)) return false; // violates precondition
          if ((a === true) && (b === true)) return !root.firstChild;
          if ((a === true) && b.previousSibling) return false;
          if ((b === true) && a.nextSibling) return false;
          if ((a === true) || (b === true)) return true;
          return a.nextSibling == b;
        })();
      }
      return isConsecutiveCache[i];
    }

    function isClean(i)
    {
      // returns whether line (i) in the un-updated representation maps to a clean node,
      // or is outside the bounds of the document
      return !!cleanNodeForIndex(i);
    }
    // list of pairs, each representing a range of lines that is clean and consecutive
    // in the changed DOM.  lines (-1) and (N) are always clean, but may or may not
    // be consecutive with lines in the document.  pairs are in sorted order.
    var cleanRanges = [
      [-1, N + 1]
    ];

    function rangeForLine(i)
    {
      // returns index of cleanRange containing i, or -1 if none
      var answer = -1;
      _.each(cleanRanges ,function(r, idx)
      {
        if (i >= r[1]) return false; // keep looking
        if (i < r[0]) return true; // not found, stop looking
        answer = idx;
        return true; // found, stop looking
      });
      return answer;
    }

    function removeLineFromRange(rng, line)
    {
      // rng is index into cleanRanges, line is line number
      // precond: line is in rng
      var a = cleanRanges[rng][0];
      var b = cleanRanges[rng][1];
      if ((a + 1) == b) cleanRanges.splice(rng, 1);
      else if (line == a) cleanRanges[rng][0]++;
      else if (line == (b - 1)) cleanRanges[rng][1]--;
      else cleanRanges.splice(rng, 1, [a, line], [line + 1, b]);
    }

    function splitRange(rng, pt)
    {
      // precond: pt splits cleanRanges[rng] into two non-empty ranges
      var a = cleanRanges[rng][0];
      var b = cleanRanges[rng][1];
      cleanRanges.splice(rng, 1, [a, pt], [pt, b]);
    }
    var correctedLines = {};

    function correctlyAssignLine(line)
    {
      if (correctedLines[line]) return true;
      p.corrections++;
      correctedLines[line] = true;
      // "line" is an index of a line in the un-updated rep.
      // returns whether line was already correctly assigned (i.e. correctly
      // clean or dirty, according to cleanRanges, and if clean, correctly
      // attached or not attached (i.e. in the same range as) the prev and next lines).
      //console.log("correctly assigning: %d", line);
      var rng = rangeForLine(line);
      var lineClean = isClean(line);
      if (rng < 0)
      {
        if (lineClean)
        {
          console.debug("somehow lost clean line");
        }
        return true;
      }
      if (!lineClean)
      {
        // a clean-range includes this dirty line, fix it
        removeLineFromRange(rng, line);
        return false;
      }
      else
      {
        // line is clean, but could be wrongly connected to a clean line
        // above or below
        var a = cleanRanges[rng][0];
        var b = cleanRanges[rng][1];
        var didSomething = false;
        // we'll leave non-clean adjacent nodes in the clean range for the caller to
        // detect and deal with.  we deal with whether the range should be split
        // just above or just below this line.
        if (a < line && isClean(line - 1) && !isConsecutive(line))
        {
          splitRange(rng, line);
          didSomething = true;
        }
        if (b > (line + 1) && isClean(line + 1) && !isConsecutive(line + 1))
        {
          splitRange(rng, line + 1);
          didSomething = true;
        }
        return !didSomething;
      }
    }

    function detectChangesAroundLine(line, reqInARow)
    {
      // make sure cleanRanges is correct about line number "line" and the surrounding
      // lines; only stops checking at end of document or after no changes need
      // making for several consecutive lines. note that iteration is over old lines,
      // so this operation takes time proportional to the number of old lines
      // that are changed or missing, not the number of new lines inserted.
      var correctInARow = 0;
      var currentIndex = line;
      while (correctInARow < reqInARow && currentIndex >= 0)
      {
        if (correctlyAssignLine(currentIndex))
        {
          correctInARow++;
        }
        else correctInARow = 0;
        currentIndex--;
      }
      correctInARow = 0;
      currentIndex = line;
      while (correctInARow < reqInARow && currentIndex < N)
      {
        if (correctlyAssignLine(currentIndex))
        {
          correctInARow++;
        }
        else correctInARow = 0;
        currentIndex++;
      }
    }

    if (N === 0)
    {
      p.cancel();
      if (!isConsecutive(0))
      {
        splitRange(0, 0);
      }
    }
    else
    {
      p.mark("topbot");
      detectChangesAroundLine(0, 1);
      detectChangesAroundLine(N - 1, 1);

      p.mark("obs");
      //console.log("observedChanges: "+toSource(observedChanges));
      for (var k in observedChanges.cleanNodesNearChanges)
      {
        var key = k.substring(1);
        if (rep.lines.containsKey(key))
        {
          var line = rep.lines.indexOfKey(key);
          detectChangesAroundLine(line, 2);
        }
      }
      p.mark("stats&calc");
      p.literal(p.forIndices, "byidx");
      p.literal(p.consecutives, "cons");
      p.literal(p.corrections, "corr");
    }

    var dirtyRanges = [];
    for (var r = 0; r < cleanRanges.length - 1; r++)
    {
      dirtyRanges.push([cleanRanges[r][1], cleanRanges[r + 1][0]]);
    }

    p.end();

    return dirtyRanges;
  }

  function markNodeClean(n)
  {
    // clean nodes have knownHTML that matches their innerHTML
    var dirtiness = {};
    dirtiness.nodeId = uniqueId(n);
    dirtiness.knownHTML = n.innerHTML;
    if (browser.msie)
    {
      // adding a space to an "empty" div in IE designMode doesn't
      // change the innerHTML of the div's parent; also, other
      // browsers don't support innerText
      dirtiness.knownText = n.innerText;
    }
    setAssoc(n, "dirtiness", dirtiness);
  }

  function isNodeDirty(n)
  {
    var p = PROFILER("cleanCheck", false);
    if (n.parentNode != root) return true;
    var data = getAssoc(n, "dirtiness");
    if (!data) return true;
    if (n.id !== data.nodeId) return true;
    if (browser.msie)
    {
      if (n.innerText !== data.knownText) return true;
    }
    if (n.innerHTML !== data.knownHTML) return true;
    p.end();
    return false;
  }

  function getLineEntryTopBottom(entry, destObj)
  {
    var dom = entry.lineNode;
    var top = dom.offsetTop;
    var height = dom.offsetHeight;
    var obj = (destObj || {});
    obj.top = top;
    obj.bottom = (top + height);
    return obj;
  }

  function getViewPortTopBottom()
  {
    var theTop = getScrollY();
    var doc = outerWin.document;
    var height = doc.documentElement.clientHeight;
    return {
      top: theTop,
      bottom: (theTop + height)
    };
  }

  function getVisibleLineRange()
  {
    var viewport = getViewPortTopBottom();
    //console.log("viewport top/bottom: %o", viewport);
    var obj = {};
    var start = rep.lines.search(function(e)
    {
      return getLineEntryTopBottom(e, obj).bottom > viewport.top;
    });
    var end = rep.lines.search(function(e)
    {
      return getLineEntryTopBottom(e, obj).top >= viewport.bottom;
    });
    if (end < start) end = start; // unlikely
    //console.log(start+","+end);
    return [start, end];
  }

  function getVisibleCharRange()
  {
    var lineRange = getVisibleLineRange();
    return [rep.lines.offsetOfIndex(lineRange[0]), rep.lines.offsetOfIndex(lineRange[1])];
  }

  function handleCut(evt)
  {
    inCallStackIfNecessary("handleCut", function()
    {
      doDeleteKey(evt);
    });
    return true;
  }

  function handleClick(evt)
  {
    inCallStackIfNecessary("handleClick", function()
    {
      idleWorkTimer.atMost(200);
    });

    function isLink(n)
    {
      return (n.tagName || '').toLowerCase() == "a" && n.href;
    }

    // only want to catch left-click
    if ((!evt.ctrlKey) && (evt.button != 2) && (evt.button != 3))
    {
      // find A tag with HREF
      var n = evt.target;
      while (n && n.parentNode && !isLink(n))
      {
        n = n.parentNode;
      }
      if (n && isLink(n))
      {
        try
        {
          var newWindow = window.open(n.href, '_blank');
          newWindow.focus();
        }
        catch (e)
        {
          // absorb "user canceled" error in IE for certain prompts
        }
        evt.preventDefault();
      }
    }
    //hide the dropdownso
    if(window.parent.parent.padeditbar){ // required in case its in an iframe should probably use parent..  See Issue 327 https://github.com/ether/etherpad-lite/issues/327
      window.parent.parent.padeditbar.toggleDropDown("none");
    }
  }

  function doReturnKey()
  {
    if (!(rep.selStart && rep.selEnd))
    {
      return;
    }

    var lineNum = rep.selStart[0];
    var listType = getLineListType(lineNum);

    if (listType)
    {
      var text = rep.lines.atIndex(lineNum).text;
      listType = /([a-z]+)([0-9]+)/.exec(listType);
      var type  = listType[1];
      var level = Number(listType[2]);

      //detect empty list item; exclude indentation
      if(text === '*' && type !== "indent")
      {
        //if not already on the highest level
        if(level > 1)
        {
          setLineListType(lineNum, type+(level-1));//automatically decrease the level
        }
        else
        {
          setLineListType(lineNum, '');//remove the list
          renumberList(lineNum + 1);//trigger renumbering of list that may be right after
        }
      }
      else if (lineNum + 1 < rep.lines.length())
      {
        performDocumentReplaceSelection('\n');
        setLineListType(lineNum + 1, type+level);
      }
    }
    else
    {
      performDocumentReplaceSelection('\n');
      handleReturnIndentation();
    }
  }

  function doIndentOutdent(isOut)
  {
    if (!((rep.selStart && rep.selEnd) ||
        ((rep.selStart[0] == rep.selEnd[0]) && (rep.selStart[1] == rep.selEnd[1]) &&  rep.selEnd[1] > 1)) &&
        (isOut != true)
       )
    {
      return false;
    }

    var firstLine, lastLine;
    firstLine = rep.selStart[0];
    lastLine = Math.max(firstLine, rep.selEnd[0] - ((rep.selEnd[1] === 0) ? 1 : 0));
    var mods = [];
    for (var n = firstLine; n <= lastLine; n++)
    {
      var listType = getLineListType(n);
      var t = 'indent';
      var level = 0;
      if (listType)
      {
        listType = /([a-z]+)([0-9]+)/.exec(listType);
        if (listType)
        {
          t = listType[1];
          level = Number(listType[2]);
        }
      }
      var newLevel = Math.max(0, Math.min(MAX_LIST_LEVEL, level + (isOut ? -1 : 1)));
      if (level != newLevel)
      {
        mods.push([n, (newLevel > 0) ? t + newLevel : '']);
      }
    }

    _.each(mods, function(mod){
      setLineListType(mod[0], mod[1]);
    });
    return true;
  }
  editorInfo.ace_doIndentOutdent = doIndentOutdent;

  function doTabKey(shiftDown)
  {
    if (!doIndentOutdent(shiftDown))
    {
      performDocumentReplaceSelection(THE_TAB);
    }
  }

  function doDeleteKey(optEvt)
  {
    var evt = optEvt || {};
    var handled = false;
    if (rep.selStart)
    {
      if (isCaret())
      {
        var lineNum = caretLine();
        var col = caretColumn();
        var lineEntry = rep.lines.atIndex(lineNum);
        var lineText = lineEntry.text;
        var lineMarker = lineEntry.lineMarker;
        if (/^ +$/.exec(lineText.substring(lineMarker, col)))
        {
          var col2 = col - lineMarker;
          var tabSize = THE_TAB.length;
          var toDelete = ((col2 - 1) % tabSize) + 1;
          performDocumentReplaceRange([lineNum, col - toDelete], [lineNum, col], '');
          //scrollSelectionIntoView();
          handled = true;
        }
      }
      if (!handled)
      {
        if (isCaret())
        {
          var theLine = caretLine();
          var lineEntry = rep.lines.atIndex(theLine);
          if (caretColumn() <= lineEntry.lineMarker)
          {
            // delete at beginning of line
            var action = 'delete_newline';
            var prevLineListType = (theLine > 0 ? getLineListType(theLine - 1) : '');
            var thisLineListType = getLineListType(theLine);
            var prevLineEntry = (theLine > 0 && rep.lines.atIndex(theLine - 1));
            var prevLineBlank = (prevLineEntry && prevLineEntry.text.length == prevLineEntry.lineMarker);

            var thisLineHasMarker = documentAttributeManager.lineHasMarker(theLine);

            if (thisLineListType)
            {
              // this line is a list
              if (prevLineBlank && !prevLineListType)
              {
                // previous line is blank, remove it
                performDocumentReplaceRange([theLine - 1, prevLineEntry.text.length], [theLine, 0], '');
              }
              else
              {
                // delistify
                performDocumentReplaceRange([theLine, 0], [theLine, lineEntry.lineMarker], '');
              }
            }else if (thisLineHasMarker && prevLineEntry){
              // If the line has any attributes assigned, remove them by removing the marker '*'
              performDocumentReplaceRange([theLine -1 , prevLineEntry.text.length], [theLine, lineEntry.lineMarker], '');
            }
            else if (theLine > 0)
            {
              // remove newline
              performDocumentReplaceRange([theLine - 1, prevLineEntry.text.length], [theLine, 0], '');
            }
          }
          else
          {
            var docChar = caretDocChar();
            if (docChar > 0)
            {
              if (evt.metaKey || evt.ctrlKey || evt.altKey)
              {
                // delete as many unicode "letters or digits" in a row as possible;
                // always delete one char, delete further even if that first char
                // isn't actually a word char.
                var deleteBackTo = docChar - 1;
                while (deleteBackTo > lineEntry.lineMarker && isWordChar(rep.alltext.charAt(deleteBackTo - 1)))
                {
                  deleteBackTo--;
                }
                performDocumentReplaceCharRange(deleteBackTo, docChar, '');
              }
              else
              {
                // normal delete
                performDocumentReplaceCharRange(docChar - 1, docChar, '');
              }
            }
          }
        }
        else
        {
          performDocumentReplaceSelection('');
        }
      }
    }
     //if the list has been removed, it is necessary to renumber
    //starting from the *next* line because the list may have been
    //separated. If it returns null, it means that the list was not cut, try
    //from the current one.
    var line = caretLine();
    if(line != -1 && renumberList(line+1) === null)
    {
      renumberList(line);
    }
  }

  // set of "letter or digit" chars is based on section 20.5.16 of the original Java Language Spec
  var REGEX_WORDCHAR = /[\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u1FFF\u3040-\u9FFF\uF900-\uFDFF\uFE70-\uFEFE\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFDC]/;
  var REGEX_SPACE = /\s/;

  function isWordChar(c)
  {
    return !!REGEX_WORDCHAR.exec(c);
  }
  editorInfo.ace_isWordChar = isWordChar;

  function isSpaceChar(c)
  {
    return !!REGEX_SPACE.exec(c);
  }

  function moveByWordInLine(lineText, initialIndex, forwardNotBack)
  {
    var i = initialIndex;

    function nextChar()
    {
      if (forwardNotBack) return lineText.charAt(i);
      else return lineText.charAt(i - 1);
    }

    function advance()
    {
      if (forwardNotBack) i++;
      else i--;
    }

    function isDone()
    {
      if (forwardNotBack) return i >= lineText.length;
      else return i <= 0;
    }

    // On Mac and Linux, move right moves to end of word and move left moves to start;
    // on Windows, always move to start of word.
    // On Windows, Firefox and IE disagree on whether to stop for punctuation (FF says no).
    if (browser.msie && forwardNotBack)
    {
      while ((!isDone()) && isWordChar(nextChar()))
      {
        advance();
      }
      while ((!isDone()) && !isWordChar(nextChar()))
      {
        advance();
      }
    }
    else
    {
      while ((!isDone()) && !isWordChar(nextChar()))
      {
        advance();
      }
      while ((!isDone()) && isWordChar(nextChar()))
      {
        advance();
      }
    }

    return i;
  }

  function handleKeyEvent(evt)
  {
    // if (DEBUG && window.DONT_INCORP) return;
    if (!isEditable) return;
    var type = evt.type;
    var charCode = evt.charCode;
    var keyCode = evt.keyCode;
    var which = evt.which;
    var altKey = evt.altKey;
    var shiftKey = evt.shiftKey;

    // prevent ESC key
    if (keyCode == 27)
    {
      evt.preventDefault();
      return;
    }
    // Is caret potentially hidden by the chat button?
    var myselection = document.getSelection(); // get the current caret selection
    var caretOffsetTop = myselection.focusNode.parentNode.offsetTop | myselection.focusNode.offsetTop; // get the carets selection offset in px IE 214
    
    if(myselection.focusNode.wholeText){ // Is there any content?  If not lineHeight will report wrong..
      var lineHeight = myselection.focusNode.parentNode.offsetHeight; // line height of populated links
    }else{
      var lineHeight = myselection.focusNode.offsetHeight; // line height of blank lines
    }

    var heightOfChatIcon = parent.parent.$('#chaticon').height(); // height of the chat icon button
    lineHeight = (lineHeight *2) + heightOfChatIcon;
    var viewport = getViewPortTopBottom();
    var viewportHeight = viewport.bottom - viewport.top - lineHeight;
    var relCaretOffsetTop = caretOffsetTop - viewport.top; // relative Caret Offset Top to viewport
    if (viewportHeight < relCaretOffsetTop){
      parent.parent.$("#chaticon").css("opacity",".3"); // make chaticon opacity low when user types near it
    }else{
      parent.parent.$("#chaticon").css("opacity","1"); // make chaticon opacity back to full (so fully visible)
    }

    //dmesg("keyevent type: "+type+", which: "+which);
    // Don't take action based on modifier keys going up and down.
    // Modifier keys do not generate "keypress" events.
    // 224 is the command-key under Mac Firefox.
    // 91 is the Windows key in IE; it is ASCII for open-bracket but isn't the keycode for that key
    // 20 is capslock in IE.
    var isModKey = ((!charCode) && ((type == "keyup") || (type == "keydown")) && (keyCode == 16 || keyCode == 17 || keyCode == 18 || keyCode == 20 || keyCode == 224 || keyCode == 91));
    if (isModKey) return;

    // If the key is a keypress and the browser is opera and the key is enter, do nothign at all as this fires twice.
    if (keyCode == 13 && browser.opera && (type == "keypress")){
      return; // This stops double enters in Opera but double Tabs still show on single tab keypress, adding keyCode == 9 to this doesn't help as the event is fired twice
    }
    var specialHandled = false;
    var isTypeForSpecialKey = ((browser.msie || browser.safari || browser.chrome) ? (type == "keydown") : (type == "keypress"));
    var isTypeForCmdKey = ((browser.msie || browser.safari || browser.chrome) ? (type == "keydown") : (type == "keypress"));
    var stopped = false;

    inCallStackIfNecessary("handleKeyEvent", function()
    {
      if (type == "keypress" || (isTypeForSpecialKey && keyCode == 13 /*return*/ ))
      {
        // in IE, special keys don't send keypress, the keydown does the action
        if (!outsideKeyPress(evt))
        {
          evt.preventDefault();
          stopped = true;
        }
      }
      else if (evt.key === "Dead"){
        // If it's a dead key we don't want to do any Etherpad behavior.
        stopped = true;
        return true;
      }
      else if (type == "keydown")
      {
        outsideKeyDown(evt);
      }
      if (!stopped)
      {
        var specialHandledInHook = hooks.callAll('aceKeyEvent', {
          callstack: currentCallStack,
          editorInfo: editorInfo,
          rep: rep,
          documentAttributeManager: documentAttributeManager,
          evt:evt
        });
        specialHandled = (specialHandledInHook&&specialHandledInHook.length>0)?specialHandledInHook[0]:specialHandled;
        if ((!specialHandled) && altKey && isTypeForSpecialKey && keyCode == 120){
          // Alt F9 focuses on the File Menu and/or editbar.
          // Note that while most editors use Alt F10 this is not desirable
          // As ubuntu cannot use Alt F10....
          // Focus on the editbar. -- TODO: Move Focus back to previous state (we know it so we can use it)
          var firstEditbarElement = parent.parent.$('#editbar').children("ul").first().children().first().children().first().children().first();
          $(this).blur(); 
          firstEditbarElement.focus();
          evt.preventDefault();
        }
        if ((!specialHandled) && altKey && keyCode == 67 && type === "keydown"){
          // Alt c focuses on the Chat window
          $(this).blur(); 
          parent.parent.chat.show();
          parent.parent.$("#chatinput").focus();
          evt.preventDefault();
        }
        if ((!specialHandled) && evt.ctrlKey && shiftKey && keyCode == 50 && type === "keydown"){
          // Control-Shift-2 shows a gritter popup showing a line author
          var lineNumber = rep.selEnd[0];
          var alineAttrs = rep.alines[lineNumber];
          var apool = rep.apool;

          // TODO: support selection ranges
          // TODO: Still work when authorship colors have been cleared
          // TODO: i18n
          // TODO: There appears to be a race condition or so.

          var author = null;
          if (alineAttrs) {
            var authors = [];
            var authorNames = [];
            var opIter = Changeset.opIterator(alineAttrs);

            while (opIter.hasNext()){
              var op = opIter.next();
              authorId = Changeset.opAttributeValue(op, 'author', apool);

              // Only push unique authors and ones with values
              if(authors.indexOf(authorId) === -1 && authorId !== ""){
                authors.push(authorId);
              }

            }

          }

          // No author information is available IE on a new pad.
          if(authors.length === 0){
            var authorString = "No author information is available";
          }
          else{
            // Known authors info, both current and historical
            var padAuthors = parent.parent.pad.userList();
            var authorObj = {};
            authors.forEach(function(authorId){
              padAuthors.forEach(function(padAuthor){
                // If the person doing the lookup is the author..
                if(padAuthor.userId === authorId){
                  if(parent.parent.clientVars.userId === authorId){
                    authorObj = {
                      name: "Me"
                    }
                  }else{
                    authorObj = padAuthor;
                  }
                }
              });
              if(!authorObj){
                author = "Unknown";
                return;
              }
              author = authorObj.name;
              if(!author) author = "Unknown";
              authorNames.push(author);
            })
          }
          if(authors.length === 1){
            var authorString = "The author of this line is " + authorNames;
          }
          if(authors.length > 1){
            var authorString = "The authors of this line are " + authorNames.join(" & ");
	  }

          parent.parent.$.gritter.add({
            // (string | mandatory) the heading of the notification
            title: 'Line Authors',
            // (string | mandatory) the text inside the notification
            text: authorString,
            // (bool | optional) if you want it to fade out on its own or just sit there
            sticky: false,
            // (int | optional) the time you want it to be alive for before fading out
            time: '4000'
          });
        }
        if ((!specialHandled) && isTypeForSpecialKey && keyCode == 8)
        {
          // "delete" key; in mozilla, if we're at the beginning of a line, normalize now,
          // or else deleting a blank line can take two delete presses.
          // --
          // we do deletes completely customly now:
          //  - allows consistent (and better) meta-delete behavior
          //  - normalizing and then allowing default behavior confused IE
          //  - probably eliminates a few minor quirks
          fastIncorp(3);
          evt.preventDefault();
          doDeleteKey(evt);
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForSpecialKey && keyCode == 13)
        {
          // return key, handle specially;
          // note that in mozilla we need to do an incorporation for proper return behavior anyway.
          fastIncorp(4);
          evt.preventDefault();
          doReturnKey();
          //scrollSelectionIntoView();
          scheduler.setTimeout(function()
          {
            outerWin.scrollBy(-100, 0);
          }, 0);
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "s" && (evt.metaKey || evt.ctrlKey) && !evt.altKey) /* Do a saved revision on ctrl S */
        {
          evt.preventDefault();
          var originalBackground = parent.parent.$('#revisionlink').css("background")
          parent.parent.$('#revisionlink').css({"background":"lightyellow"});
          scheduler.setTimeout(function(){
            parent.parent.$('#revisionlink').css({"background":originalBackground});
          }, 1000);
          parent.parent.pad.collabClient.sendMessage({"type":"SAVE_REVISION"}); /* The parent.parent part of this is BAD and I feel bad..  It may break something */
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForSpecialKey && keyCode == 9 && !(evt.metaKey || evt.ctrlKey))
        {
          // tab
          fastIncorp(5);
          evt.preventDefault();
          doTabKey(evt.shiftKey);
          //scrollSelectionIntoView();
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "z" && (evt.metaKey || evt.ctrlKey) && !evt.altKey)
        {
          // cmd-Z (undo)
          fastIncorp(6);
          evt.preventDefault();
          if (evt.shiftKey)
          {
            doUndoRedo("redo");
          }
          else
          {
            doUndoRedo("undo");
          }
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "y" && (evt.metaKey || evt.ctrlKey))
        {
          // cmd-Y (redo)
          fastIncorp(10);
          evt.preventDefault();
          doUndoRedo("redo");
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "b" && (evt.metaKey || evt.ctrlKey))
        {
          // cmd-B (bold)
          fastIncorp(13);
          evt.preventDefault();
          toggleAttributeOnSelection('bold');
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "i" && (evt.metaKey || evt.ctrlKey))
        {
          // cmd-I (italic)
          fastIncorp(14);
          evt.preventDefault();
          toggleAttributeOnSelection('italic');
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "u" && (evt.metaKey || evt.ctrlKey))
        {
          // cmd-U (underline)
          fastIncorp(15);
          evt.preventDefault();
          toggleAttributeOnSelection('underline');
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "5" && (evt.metaKey || evt.ctrlKey) && evt.altKey !== true)
        {
          // cmd-5 (strikethrough)
          fastIncorp(13);
          evt.preventDefault();
          toggleAttributeOnSelection('strikethrough');
          specialHandled = true;
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "l" && (evt.metaKey || evt.ctrlKey) && evt.shiftKey)
        {
          // cmd-shift-L (unorderedlist)
          fastIncorp(9);
          evt.preventDefault();
          doInsertUnorderedList()
          specialHandled = true;
	}
        if ((!specialHandled) && isTypeForCmdKey && (String.fromCharCode(which).toLowerCase() == "n" || String.fromCharCode(which) == 1) && (evt.metaKey || evt.ctrlKey) && evt.shiftKey)
        {
          // cmd-shift-N (orderedlist)
          fastIncorp(9);
          evt.preventDefault();
          doInsertOrderedList()
          specialHandled = true;
	}
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "c" && (evt.metaKey || evt.ctrlKey) && evt.shiftKey) {
          // cmd-shift-C (clearauthorship)
          fastIncorp(9);
          evt.preventDefault();
          CMDS.clearauthorship();
        }
        if ((!specialHandled) && isTypeForCmdKey && String.fromCharCode(which).toLowerCase() == "h" && (evt.ctrlKey))
        {
          // cmd-H (backspace)
          fastIncorp(20);
          evt.preventDefault();
          doDeleteKey();
          specialHandled = true;
        }
        if((evt.which == 36 && evt.ctrlKey == true)){ setScrollY(0); } // Control Home send to Y = 0
        if((evt.which == 33 || evt.which == 34) && type == 'keydown' && !evt.ctrlKey){

          evt.preventDefault(); // This is required, browsers will try to do normal default behavior on page up / down and the default behavior SUCKS

          var oldVisibleLineRange = getVisibleLineRange();
          var topOffset = rep.selStart[0] - oldVisibleLineRange[0];
          if(topOffset < 0 ){
            topOffset = 0;
          }

          var isPageDown = evt.which === 34;
          var isPageUp = evt.which === 33;

          scheduler.setTimeout(function(){
            var newVisibleLineRange = getVisibleLineRange(); // the visible lines IE 1,10
            var linesCount = rep.lines.length(); // total count of lines in pad IE 10
            var numberOfLinesInViewport = newVisibleLineRange[1] - newVisibleLineRange[0]; // How many lines are in the viewport right now?

            if(isPageUp){
              rep.selEnd[0] = rep.selEnd[0] - numberOfLinesInViewport; // move to the bottom line +1 in the viewport (essentially skipping over a page)
              rep.selStart[0] = rep.selStart[0] - numberOfLinesInViewport; // move to the bottom line +1 in the viewport (essentially skipping over a page)
            }

            if(isPageDown){ // if we hit page down
              if(rep.selEnd[0] >= oldVisibleLineRange[0]){ // If the new viewpoint position is actually further than where we are right now
                rep.selStart[0] = oldVisibleLineRange[1] -1; // dont go further in the page down than what's visible IE go from 0 to 50 if 50 is visible on screen but dont go below that else we miss content
                rep.selEnd[0] = oldVisibleLineRange[1] -1; // dont go further in the page down than what's visible IE go from 0 to 50 if 50 is visible on screen but dont go below that else we miss content
              }
            }

            //ensure min and max
            if(rep.selEnd[0] < 0){
              rep.selEnd[0] = 0;
            }
            if(rep.selStart[0] < 0){
              rep.selStart[0] = 0;
            }
            if(rep.selEnd[0] >= linesCount){
              rep.selEnd[0] = linesCount-1;
            }
            updateBrowserSelectionFromRep();
            var myselection = document.getSelection(); // get the current caret selection, can't use rep. here because that only gives us the start position not the current
            var caretOffsetTop = myselection.focusNode.parentNode.offsetTop || myselection.focusNode.offsetTop; // get the carets selection offset in px IE 214

            // sometimes the first selection is -1 which causes problems (Especially with ep_page_view)
            // so use focusNode.offsetTop value.
            if(caretOffsetTop === -1) caretOffsetTop = myselection.focusNode.offsetTop;
            setScrollY(caretOffsetTop); // set the scrollY offset of the viewport on the document

          }, 200);
        }
        /* Attempt to apply some sanity to cursor handling in Chrome after a copy / paste event
           We have to do this the way we do because rep. doesn't hold the value for keyheld events IE if the user
           presses and holds the arrow key ..  Sorry if this is ugly, blame Chrome's weird handling of viewports after new content is added*/
        if((evt.which == 37 || evt.which == 38 || evt.which == 39 || evt.which == 40) && browser.chrome){
          var viewport = getViewPortTopBottom();
          var myselection = document.getSelection(); // get the current caret selection, can't use rep. here because that only gives us the start position not the current
          var caretOffsetTop = myselection.focusNode.parentNode.offsetTop || myselection.focusNode.offsetTop; // get the carets selection offset in px IE 214
          var lineHeight = $(myselection.focusNode.parentNode).parent("div").height(); // get the line height of the caret line
          // top.console.log("offsetTop", myselection.focusNode.parentNode.parentNode.offsetTop);
          try {
            lineHeight = $(myselection.focusNode).height() // needed for how chrome handles line heights of null objects
            // console.log("lineHeight now", lineHeight);
          }catch(e){}
          var caretOffsetTopBottom = caretOffsetTop + lineHeight;
          var visibleLineRange = getVisibleLineRange(); // the visible lines IE 1,10

          if(caretOffsetTop){ // sometimes caretOffsetTop bugs out and returns 0, not sure why, possible Chrome bug?  Either way if it does we don't wanna mess with it
            // top.console.log(caretOffsetTop, viewport.top, caretOffsetTopBottom, viewport.bottom);
            var caretIsNotVisible = (caretOffsetTop < viewport.top || caretOffsetTopBottom >= viewport.bottom); // Is the Caret Visible to the user?
            // Expect some weird behavior caretOffsetTopBottom is greater than viewport.bottom on a keypress down
            var offsetTopSamePlace = caretOffsetTop == viewport.top; // sometimes moving key left & up leaves the caret at the same point as the viewport.top, technically the caret is visible but it's not fully visible so we should move to it
            if(offsetTopSamePlace && (evt.which == 37 || evt.which == 38)){
                var newY = caretOffsetTop;
                setScrollY(newY);
            }

            if(caretIsNotVisible){ // is the cursor no longer visible to the user?
              // top.console.log("Caret is NOT visible to the user");
              // top.console.log(caretOffsetTop,viewport.top,caretOffsetTopBottom,viewport.bottom);
              // Oh boy the caret is out of the visible area, I need to scroll the browser window to lineNum.
              if(evt.which == 37 || evt.which == 38){ // If left or up arrow
                var newY = caretOffsetTop; // That was easy!
              }
              if(evt.which == 39 || evt.which == 40){ // if down or right arrow
                // only move the viewport if we're at the bottom of the viewport, if we hit down any other time the viewport shouldn't change
                // NOTE: This behavior only fires if Chrome decides to break the page layout after a paste, it's annoying but nothing I can do
                var selection = getSelection();
                // top.console.log("line #", rep.selStart[0]); // the line our caret is on
                // top.console.log("firstvisible", visibleLineRange[0]); // the first visiblel ine
                // top.console.log("lastVisible", visibleLineRange[1]); // the last visible line
                // top.console.log(rep.selStart[0], visibleLineRange[1], rep.selStart[0], visibleLineRange[0]);
                var newY = viewport.top + lineHeight;
              }
              if(newY){
                setScrollY(newY); // set the scrollY offset of the viewport on the document
              }
            }
          }
        }
      }

      if (type == "keydown")
      {
        idleWorkTimer.atLeast(500);
      }
      else if (type == "keypress")
      {
        if ((!specialHandled) && false /*parenModule.shouldNormalizeOnChar(charCode)*/)
        {
          idleWorkTimer.atMost(0);
        }
        else
        {
          idleWorkTimer.atLeast(500);
        }
      }
      else if (type == "keyup")
      {
        var wait = 0;
        idleWorkTimer.atLeast(wait);
        idleWorkTimer.atMost(wait);
      }

      // Is part of multi-keystroke international character on Firefox Mac
      var isFirefoxHalfCharacter = (browser.firefox && evt.altKey && charCode === 0 && keyCode === 0);

      // Is part of multi-keystroke international character on Safari Mac
      var isSafariHalfCharacter = (browser.safari && evt.altKey && keyCode == 229);

      if (thisKeyDoesntTriggerNormalize || isFirefoxHalfCharacter || isSafariHalfCharacter)
      {
        idleWorkTimer.atLeast(3000); // give user time to type
        // if this is a keydown, e.g., the keyup shouldn't trigger a normalize
        thisKeyDoesntTriggerNormalize = true;
      }

      if ((!specialHandled) && (!thisKeyDoesntTriggerNormalize) && (!inInternationalComposition))
      {
        if (type != "keyup")
        {
          observeChangesAroundSelection();
        }
      }

      if (type == "keyup")
      {
        thisKeyDoesntTriggerNormalize = false;
      }
    });
  }

  var thisKeyDoesntTriggerNormalize = false;

  function doUndoRedo(which)
  {
    // precond: normalized DOM
    if (undoModule.enabled)
    {
      var whichMethod;
      if (which == "undo") whichMethod = 'performUndo';
      if (which == "redo") whichMethod = 'performRedo';
      if (whichMethod)
      {
        var oldEventType = currentCallStack.editEvent.eventType;
        currentCallStack.startNewEvent(which);
        undoModule[whichMethod](function(backset, selectionInfo)
        {
          if (backset)
          {
            performDocumentApplyChangeset(backset);
          }
          if (selectionInfo)
          {
            performSelectionChange(lineAndColumnFromChar(selectionInfo.selStart), lineAndColumnFromChar(selectionInfo.selEnd), selectionInfo.selFocusAtStart);
          }
          var oldEvent = currentCallStack.startNewEvent(oldEventType, true);
          return oldEvent;
        });
      }
    }
  }
  editorInfo.ace_doUndoRedo = doUndoRedo;

  function updateBrowserSelectionFromRep()
  {
    // requires normalized DOM!
    var selStart = rep.selStart,
        selEnd = rep.selEnd;

    if (!(selStart && selEnd))
    {
      setSelection(null);
      return;
    }

    var selection = {};

    var ss = [selStart[0], selStart[1]];
    selection.startPoint = getPointForLineAndChar(ss);

    var se = [selEnd[0], selEnd[1]];
    selection.endPoint = getPointForLineAndChar(se);

    selection.focusAtStart = !! rep.selFocusAtStart;
    setSelection(selection);
  }
  editorInfo.ace_updateBrowserSelectionFromRep = updateBrowserSelectionFromRep;

  function nodeMaxIndex(nd)
  {
    if (isNodeText(nd)) return nd.nodeValue.length;
    else return 1;
  }

  function hasIESelection()
  {
    var browserSelection;
    try
    {
      browserSelection = doc.selection;
    }
    catch (e)
    {}
    if (!browserSelection) return false;
    var origSelectionRange;
    try
    {
      origSelectionRange = browserSelection.createRange();
    }
    catch (e)
    {}
    if (!origSelectionRange) return false;
    return true;
  }

  function getSelection()
  {
    // returns null, or a structure containing startPoint and endPoint,
    // each of which has node (a magicdom node), index, and maxIndex.  If the node
    // is a text node, maxIndex is the length of the text; else maxIndex is 1.
    // index is between 0 and maxIndex, inclusive.
    if (browser.msie)
    {
      var browserSelection;
      try
      {
        browserSelection = doc.selection;
      }
      catch (e)
      {}
      if (!browserSelection) return null;
      var origSelectionRange;
      try
      {
        origSelectionRange = browserSelection.createRange();
      }
      catch (e)
      {}
      if (!origSelectionRange) return null;
      var selectionParent = origSelectionRange.parentElement();
      if (selectionParent.ownerDocument != doc) return null;

      var newRange = function()
      {
        return doc.body.createTextRange();
      };

      var rangeForElementNode = function(nd)
      {
        var rng = newRange();
        // doesn't work on text nodes
        rng.moveToElementText(nd);
        return rng;
      };

      var pointFromCollapsedRange = function(rng)
      {
        var parNode = rng.parentElement();
        var elemBelow = -1;
        var elemAbove = parNode.childNodes.length;
        var rangeWithin = rangeForElementNode(parNode);

        if (rng.compareEndPoints("StartToStart", rangeWithin) === 0)
        {
          return {
            node: parNode,
            index: 0,
            maxIndex: 1
          };
        }
        else if (rng.compareEndPoints("EndToEnd", rangeWithin) === 0)
        {
          if (isBlockElement(parNode) && parNode.nextSibling)
          {
            // caret after block is not consistent across browsers
            // (same line vs next) so put caret before next node
            return {
              node: parNode.nextSibling,
              index: 0,
              maxIndex: 1
            };
          }
          return {
            node: parNode,
            index: 1,
            maxIndex: 1
          };
        }
        else if (parNode.childNodes.length === 0)
        {
          return {
            node: parNode,
            index: 0,
            maxIndex: 1
          };
        }

        for (var i = 0; i < parNode.childNodes.length; i++)
        {
          var n = parNode.childNodes.item(i);
          if (!isNodeText(n))
          {
            var nodeRange = rangeForElementNode(n);
            var startComp = rng.compareEndPoints("StartToStart", nodeRange);
            var endComp = rng.compareEndPoints("EndToEnd", nodeRange);
            if (startComp >= 0 && endComp <= 0)
            {
              var index = 0;
              if (startComp > 0)
              {
                index = 1;
              }
              return {
                node: n,
                index: index,
                maxIndex: 1
              };
            }
            else if (endComp > 0)
            {
              if (i > elemBelow)
              {
                elemBelow = i;
                rangeWithin.setEndPoint("StartToEnd", nodeRange);
              }
            }
            else if (startComp < 0)
            {
              if (i < elemAbove)
              {
                elemAbove = i;
                rangeWithin.setEndPoint("EndToStart", nodeRange);
              }
            }
          }
        }
        if ((elemAbove - elemBelow) == 1)
        {
          if (elemBelow >= 0)
          {
            return {
              node: parNode.childNodes.item(elemBelow),
              index: 1,
              maxIndex: 1
            };
          }
          else
          {
            return {
              node: parNode.childNodes.item(elemAbove),
              index: 0,
              maxIndex: 1
            };
          }
        }
        var idx = 0;
        var r = rng.duplicate();
        // infinite stateful binary search! call function for values 0 to inf,
        // expecting the answer to be about 40.  return index of smallest
        // true value.
        var indexIntoRange = binarySearchInfinite(40, function(i)
        {
          // the search algorithm whips the caret back and forth,
          // though it has to be moved relatively and may hit
          // the end of the buffer
          var delta = i - idx;
          var moved = Math.abs(r.move("character", -delta));
          // next line is work-around for fact that when moving left, the beginning
          // of a text node is considered to be after the start of the parent element:
          if (r.move("character", -1)) r.move("character", 1);
          if (delta < 0) idx -= moved;
          else idx += moved;
          return (r.compareEndPoints("StartToStart", rangeWithin) <= 0);
        });
        // iterate over consecutive text nodes, point is in one of them
        var textNode = elemBelow + 1;
        var indexLeft = indexIntoRange;
        while (textNode < elemAbove)
        {
          var tn = parNode.childNodes.item(textNode);
          if (indexLeft <= tn.nodeValue.length)
          {
            return {
              node: tn,
              index: indexLeft,
              maxIndex: tn.nodeValue.length
            };
          }
          indexLeft -= tn.nodeValue.length;
          textNode++;
        }
        var tn = parNode.childNodes.item(textNode - 1);
        return {
          node: tn,
          index: tn.nodeValue.length,
          maxIndex: tn.nodeValue.length
        };
      };

      var selection = {};
      if (origSelectionRange.compareEndPoints("StartToEnd", origSelectionRange) === 0)
      {
        // collapsed
        var pnt = pointFromCollapsedRange(origSelectionRange);
        selection.startPoint = pnt;
        selection.endPoint = {
          node: pnt.node,
          index: pnt.index,
          maxIndex: pnt.maxIndex
        };
      }
      else
      {
        var start = origSelectionRange.duplicate();
        start.collapse(true);
        var end = origSelectionRange.duplicate();
        end.collapse(false);
        selection.startPoint = pointFromCollapsedRange(start);
        selection.endPoint = pointFromCollapsedRange(end);
      }
      return selection;
    }
    else
    {
      // non-IE browser
      var browserSelection = window.getSelection();
      if (browserSelection && browserSelection.type != "None" && browserSelection.rangeCount !== 0)
      {
        var range = browserSelection.getRangeAt(0);

        function isInBody(n)
        {
          while (n && !(n.tagName && n.tagName.toLowerCase() == "body"))
          {
            n = n.parentNode;
          }
          return !!n;
        }

        function pointFromRangeBound(container, offset)
        {
          if (!isInBody(container))
          {
            // command-click in Firefox selects whole document, HEAD and BODY!
            return {
              node: root,
              index: 0,
              maxIndex: 1
            };
          }
          var n = container;
          var childCount = n.childNodes.length;
          if (isNodeText(n))
          {
            return {
              node: n,
              index: offset,
              maxIndex: n.nodeValue.length
            };
          }
          else if (childCount === 0)
          {
            return {
              node: n,
              index: 0,
              maxIndex: 1
            };
          }
          // treat point between two nodes as BEFORE the second (rather than after the first)
          // if possible; this way point at end of a line block-element is treated as
          // at beginning of next line
          else if (offset == childCount)
          {
            var nd = n.childNodes.item(childCount - 1);
            var max = nodeMaxIndex(nd);
            return {
              node: nd,
              index: max,
              maxIndex: max
            };
          }
          else
          {
            var nd = n.childNodes.item(offset);
            var max = nodeMaxIndex(nd);
            return {
              node: nd,
              index: 0,
              maxIndex: max
            };
          }
        }
        var selection = {};
        selection.startPoint = pointFromRangeBound(range.startContainer, range.startOffset);
        selection.endPoint = pointFromRangeBound(range.endContainer, range.endOffset);
        selection.focusAtStart = (((range.startContainer != range.endContainer) || (range.startOffset != range.endOffset)) && browserSelection.anchorNode && (browserSelection.anchorNode == range.endContainer) && (browserSelection.anchorOffset == range.endOffset));

        if(selection.startPoint.node.ownerDocument !== window.document){
          return null;
        }

        return selection;
      }
      else return null;
    }
  }

  function setSelection(selection)
  {
    function copyPoint(pt)
    {
      return {
        node: pt.node,
        index: pt.index,
        maxIndex: pt.maxIndex
      };
    }
    if (browser.msie)
    {
      // Oddly enough, accessing scrollHeight fixes return key handling on IE 8,
      // presumably by forcing some kind of internal DOM update.
      doc.body.scrollHeight;

      function moveToElementText(s, n)
      {
        while (n.firstChild && !isNodeText(n.firstChild))
        {
          n = n.firstChild;
        }
        s.moveToElementText(n);
      }

      function newRange()
      {
        return doc.body.createTextRange();
      }

      function setCollapsedBefore(s, n)
      {
        // s is an IE TextRange, n is a dom node
        if (isNodeText(n))
        {
          // previous node should not also be text, but prevent inf recurs
          if (n.previousSibling && !isNodeText(n.previousSibling))
          {
            setCollapsedAfter(s, n.previousSibling);
          }
          else
          {
            setCollapsedBefore(s, n.parentNode);
          }
        }
        else
        {
          moveToElementText(s, n);
          // work around for issue that caret at beginning of line
          // somehow ends up at end of previous line
          if (s.move('character', 1))
          {
            s.move('character', -1);
          }
          s.collapse(true); // to start
        }
      }

      function setCollapsedAfter(s, n)
      {
        // s is an IE TextRange, n is a magicdom node
        if (isNodeText(n))
        {
          // can't use end of container when no nextSibling (could be on next line),
          // so use previousSibling or start of container and move forward.
          setCollapsedBefore(s, n);
          s.move("character", n.nodeValue.length);
        }
        else
        {
          moveToElementText(s, n);
          s.collapse(false); // to end
        }
      }

      function getPointRange(point)
      {
        var s = newRange();
        var n = point.node;
        if (isNodeText(n))
        {
          setCollapsedBefore(s, n);
          s.move("character", point.index);
        }
        else if (point.index === 0)
        {
          setCollapsedBefore(s, n);
        }
        else
        {
          setCollapsedAfter(s, n);
        }
        return s;
      }

      if (selection)
      {
        if (!hasIESelection())
        {
          return; // don't steal focus
        }

        var startPoint = copyPoint(selection.startPoint);
        var endPoint = copyPoint(selection.endPoint);

        // fix issue where selection can't be extended past end of line
        // with shift-rightarrow or shift-downarrow
        if (endPoint.index == endPoint.maxIndex && endPoint.node.nextSibling)
        {
          endPoint.node = endPoint.node.nextSibling;
          endPoint.index = 0;
          endPoint.maxIndex = nodeMaxIndex(endPoint.node);
        }
        var range = getPointRange(startPoint);
        range.setEndPoint("EndToEnd", getPointRange(endPoint));

        // setting the selection in IE causes everything to scroll
        // so that the selection is visible.  if setting the selection
        // definitely accomplishes nothing, don't do it.


        function isEqualToDocumentSelection(rng)
        {
          var browserSelection;
          try
          {
            browserSelection = doc.selection;
          }
          catch (e)
          {}
          if (!browserSelection) return false;
          var rng2 = browserSelection.createRange();
          if (rng2.parentElement().ownerDocument != doc) return false;
          if (rng.compareEndPoints("StartToStart", rng2) !== 0) return false;
          if (rng.compareEndPoints("EndToEnd", rng2) !== 0) return false;
          return true;
        }
        if (!isEqualToDocumentSelection(range))
        {
          //dmesg(toSource(selection));
          //dmesg(escapeHTML(doc.body.innerHTML));
          range.select();
        }
      }
      else
      {
        try
        {
          doc.selection.empty();
        }
        catch (e)
        {}
      }
    }
    else
    {
      // non-IE browser
      var isCollapsed;

      function pointToRangeBound(pt)
      {
        var p = copyPoint(pt);
        // Make sure Firefox cursor is deep enough; fixes cursor jumping when at top level,
        // and also problem where cut/copy of a whole line selected with fake arrow-keys
        // copies the next line too.
        if (isCollapsed)
        {
          function diveDeep()
          {
            while (p.node.childNodes.length > 0)
            {
              //&& (p.node == root || p.node.parentNode == root)) {
              if (p.index === 0)
              {
                p.node = p.node.firstChild;
                p.maxIndex = nodeMaxIndex(p.node);
              }
              else if (p.index == p.maxIndex)
              {
                p.node = p.node.lastChild;
                p.maxIndex = nodeMaxIndex(p.node);
                p.index = p.maxIndex;
              }
              else break;
            }
          }
          // now fix problem where cursor at end of text node at end of span-like element
          // with background doesn't seem to show up...
          if (isNodeText(p.node) && p.index == p.maxIndex)
          {
            var n = p.node;
            while ((!n.nextSibling) && (n != root) && (n.parentNode != root))
            {
              n = n.parentNode;
            }
            if (n.nextSibling && (!((typeof n.nextSibling.tagName) == "string" && n.nextSibling.tagName.toLowerCase() == "br")) && (n != p.node) && (n != root) && (n.parentNode != root))
            {
              // found a parent, go to next node and dive in
              p.node = n.nextSibling;
              p.maxIndex = nodeMaxIndex(p.node);
              p.index = 0;
              diveDeep();
            }
          }
          // try to make sure insertion point is styled;
          // also fixes other FF problems
          if (!isNodeText(p.node))
          {
            diveDeep();
          }
        }
        if (isNodeText(p.node))
        {
          return {
            container: p.node,
            offset: p.index
          };
        }
        else
        {
          // p.index in {0,1}
          return {
            container: p.node.parentNode,
            offset: childIndex(p.node) + p.index
          };
        }
      }
      var browserSelection = window.getSelection();
      if (browserSelection)
      {
        browserSelection.removeAllRanges();
        if (selection)
        {
          isCollapsed = (selection.startPoint.node === selection.endPoint.node && selection.startPoint.index === selection.endPoint.index);
          var start = pointToRangeBound(selection.startPoint);
          var end = pointToRangeBound(selection.endPoint);

          if ((!isCollapsed) && selection.focusAtStart && browserSelection.collapse && browserSelection.extend)
          {
            // can handle "backwards"-oriented selection, shift-arrow-keys move start
            // of selection
            browserSelection.collapse(end.container, end.offset);
            //console.trace();
            //console.log(htmlPrettyEscape(rep.alltext));
            //console.log("%o %o", rep.selStart, rep.selEnd);
            //console.log("%o %d", start.container, start.offset);
            browserSelection.extend(start.container, start.offset);
          }
          else
          {
            var range = doc.createRange();
            range.setStart(start.container, start.offset);
            range.setEnd(end.container, end.offset);
            browserSelection.removeAllRanges();
            browserSelection.addRange(range);
          }
        }
      }
    }
  }

  function childIndex(n)
  {
    var idx = 0;
    while (n.previousSibling)
    {
      idx++;
      n = n.previousSibling;
    }
    return idx;
  }

  function fixView()
  {
    // calling this method repeatedly should be fast
    if (getInnerWidth() === 0 || getInnerHeight() === 0)
    {
      return;
    }

    function setIfNecessary(obj, prop, value)
    {
      if (obj[prop] != value)
      {
        obj[prop] = value;
      }
    }

    var lineNumberWidth = sideDiv.firstChild.offsetWidth;
    var newSideDivWidth = lineNumberWidth + LINE_NUMBER_PADDING_LEFT;
    if (newSideDivWidth < MIN_LINEDIV_WIDTH) newSideDivWidth = MIN_LINEDIV_WIDTH;
    iframePadLeft = EDIT_BODY_PADDING_LEFT;
    if (hasLineNumbers) iframePadLeft += newSideDivWidth + LINE_NUMBER_PADDING_RIGHT;
    setIfNecessary(iframe.style, "left", iframePadLeft + "px");
    setIfNecessary(sideDiv.style, "width", newSideDivWidth + "px");

    for (var i = 0; i < 2; i++)
    {
      var newHeight = root.clientHeight;
      var newWidth = (browser.msie ? root.createTextRange().boundingWidth : root.clientWidth);
      var viewHeight = getInnerHeight() - iframePadBottom - iframePadTop;
      var viewWidth = getInnerWidth() - iframePadLeft - iframePadRight;
      if (newHeight < viewHeight)
      {
        newHeight = viewHeight;
        if (browser.msie) setIfNecessary(outerWin.document.documentElement.style, 'overflowY', 'auto');
      }
      else
      {
        if (browser.msie) setIfNecessary(outerWin.document.documentElement.style, 'overflowY', 'scroll');
      }
      if (doesWrap)
      {
        newWidth = viewWidth;
      }
      else
      {
        if (newWidth < viewWidth) newWidth = viewWidth;
      }
      setIfNecessary(iframe.style, "height", newHeight + "px");
      setIfNecessary(iframe.style, "width", newWidth + "px");
      setIfNecessary(sideDiv.style, "height", newHeight + "px");
    }
    if (browser.firefox)
    {
      if (!doesWrap)
      {
        // the body:display:table-cell hack makes mozilla do scrolling
        // correctly by shrinking the <body> to fit around its content,
        // but mozilla won't act on clicks below the body.  We keep the
        // style.height property set to the viewport height (editor height
        // not including scrollbar), so it will never shrink so that part of
        // the editor isn't clickable.
        var body = root;
        var styleHeight = viewHeight + "px";
        setIfNecessary(body.style, "height", styleHeight);
      }
      else
      {
        setIfNecessary(root.style, "height", "");
      }
    }
    // if near edge, scroll to edge
    var scrollX = getScrollX();
    var scrollY = getScrollY();
    var win = outerWin;
    var r = 20;

    enforceEditability();

    $(sideDiv).addClass('sidedivdelayed');
  }

  function getScrollXY()
  {
    var win = outerWin;
    var odoc = outerWin.document;
    if (typeof(win.pageYOffset) == "number")
    {
      return {
        x: win.pageXOffset,
        y: win.pageYOffset
      };
    }
    var docel = odoc.documentElement;
    if (docel && typeof(docel.scrollTop) == "number")
    {
      return {
        x: docel.scrollLeft,
        y: docel.scrollTop
      };
    }
  }

  function getScrollX()
  {
    return getScrollXY().x;
  }

  function getScrollY()
  {
    return getScrollXY().y;
  }

  function setScrollX(x)
  {
    outerWin.scrollTo(x, getScrollY());
  }

  function setScrollY(y)
  {
    outerWin.scrollTo(getScrollX(), y);
  }

  function setScrollXY(x, y)
  {
    outerWin.scrollTo(x, y);
  }

  var _teardownActions = [];

  function teardown()
  {
    _.each(_teardownActions, function(a)
    {
      a();
    });
  }

  function setDesignMode(newVal)
  {
    try
    {
      function setIfNecessary(target, prop, val)
      {
        if (String(target[prop]).toLowerCase() != val)
        {
          target[prop] = val;
          return true;
        }
        return false;
      }
      if (browser.msie || browser.safari)
      {
        setIfNecessary(root, 'contentEditable', (newVal ? 'true' : 'false'));
      }
      else
      {
        var wasSet = setIfNecessary(doc, 'designMode', (newVal ? 'on' : 'off'));
        if (wasSet && newVal && browser.opera)
        {
          // turning on designMode clears event handlers
          bindTheEventHandlers();
        }
      }
      return true;
    }
    catch (e)
    {
      return false;
    }
  }

  var iePastedLines = null;

  function handleIEPaste(evt)
  {
    // Pasting in IE loses blank lines in a way that loses information;
    // "one\n\ntwo\nthree" becomes "<p>one</p><p>two</p><p>three</p>",
    // which becomes "one\ntwo\nthree".  We can get the correct text
    // from the clipboard directly, but we still have to let the paste
    // happen to get the style information.
    var clipText = window.clipboardData && window.clipboardData.getData("Text");
    if (clipText && doc.selection)
    {
      // this "paste" event seems to mess with the selection whether we try to
      // stop it or not, so can't really do document-level manipulation now
      // or in an idle call-stack.  instead, use IE native manipulation
      //function escapeLine(txt) {
      //return processSpaces(escapeHTML(textify(txt)));
      //}
      //var newHTML = map(clipText.replace(/\r/g,'').split('\n'), escapeLine).join('<br>');
      //doc.selection.createRange().pasteHTML(newHTML);
      //evt.preventDefault();
      //iePastedLines = map(clipText.replace(/\r/g,'').split('\n'), textify);
    }
  }


  var inInternationalComposition = false;
  function handleCompositionEvent(evt)
  {
    // international input events, fired in FF3, at least;  allow e.g. Japanese input
    if (evt.type == "compositionstart")
    {
      inInternationalComposition = true;
    }
    else if (evt.type == "compositionend")
    {
      inInternationalComposition = false;
    }
  }

  editorInfo.ace_getInInternationalComposition = function ()
  {
    return inInternationalComposition;
  }

  function bindTheEventHandlers()
  {
    $(document).on("keydown", handleKeyEvent);
    $(document).on("keypress", handleKeyEvent);
    $(document).on("keyup", handleKeyEvent);
    $(document).on("click", handleClick);

    // Disabled: https://github.com/ether/etherpad-lite/issues/2546
    // Will break OL re-numbering: https://github.com/ether/etherpad-lite/pull/2533
    // $(document).on("cut", handleCut); 

    $(root).on("blur", handleBlur);
    if (browser.msie)
    {
      $(document).on("click", handleIEOuterClick);
    }
    if (browser.msie) $(root).on("paste", handleIEPaste);

    // Don't paste on middle click of links
    $(root).on("paste", function(e){
      // TODO: this breaks pasting strings into URLS when using 
      // Control C and Control V -- the Event is never available
      // here.. :(
      if(e.target.a || e.target.localName === "a"){
        e.preventDefault();
      }
    })

    // CompositionEvent is not implemented below IE version 8
    if ( !(browser.msie && parseInt(browser.version <= 9)) && document.documentElement)
    {
      $(document.documentElement).on("compositionstart", handleCompositionEvent);
      $(document.documentElement).on("compositionend", handleCompositionEvent);
    }
  }

  function handleIEOuterClick(evt)
  {
    if ((evt.target.tagName || '').toLowerCase() != "html")
    {
      return;
    }
    if (!(evt.pageY > root.clientHeight))
    {
      return;
    }

    // click below the body
    inCallStackIfNecessary("handleOuterClick", function()
    {
      // put caret at bottom of doc
      fastIncorp(11);
      if (isCaret())
      { // don't interfere with drag
        var lastLine = rep.lines.length() - 1;
        var lastCol = rep.lines.atIndex(lastLine).text.length;
        performSelectionChange([lastLine, lastCol], [lastLine, lastCol]);
      }
    });
  }

  function getClassArray(elem, optFilter)
  {
    var bodyClasses = [];
    (elem.className || '').replace(/\S+/g, function(c)
    {
      if ((!optFilter) || (optFilter(c)))
      {
        bodyClasses.push(c);
      }
    });
    return bodyClasses;
  }

  function setClassArray(elem, array)
  {
    elem.className = array.join(' ');
  }

  function setClassPresence(elem, className, present)
  {
    if (present) $(elem).addClass(className);
    else $(elem).removeClass(className);
  }

  function focus()
  {
    window.focus();
  }

  function handleBlur(evt)
  {
    if (browser.msie)
    {
      // a fix: in IE, clicking on a control like a button outside the
      // iframe can "blur" the editor, causing it to stop getting
      // events, though typing still affects it(!).
      setSelection(null);
    }
  }

  function getSelectionPointX(point)
  {
    // doesn't work in wrap-mode
    var node = point.node;
    var index = point.index;

    function leftOf(n)
    {
      return n.offsetLeft;
    }

    function rightOf(n)
    {
      return n.offsetLeft + n.offsetWidth;
    }
    if (!isNodeText(node))
    {
      if (index === 0) return leftOf(node);
      else return rightOf(node);
    }
    else
    {
      // we can get bounds of element nodes, so look for those.
      // allow consecutive text nodes for robustness.
      var charsToLeft = index;
      var charsToRight = node.nodeValue.length - index;
      var n;
      for (n = node.previousSibling; n && isNodeText(n); n = n.previousSibling)
      charsToLeft += n.nodeValue;
      var leftEdge = (n ? rightOf(n) : leftOf(node.parentNode));
      for (n = node.nextSibling; n && isNodeText(n); n = n.nextSibling)
      charsToRight += n.nodeValue;
      var rightEdge = (n ? leftOf(n) : rightOf(node.parentNode));
      var frac = (charsToLeft / (charsToLeft + charsToRight));
      var pixLoc = leftEdge + frac * (rightEdge - leftEdge);
      return Math.round(pixLoc);
    }
  }

  function getPageHeight()
  {
    var win = outerWin;
    var odoc = win.document;
    if (win.innerHeight && win.scrollMaxY) return win.innerHeight + win.scrollMaxY;
    else if (odoc.body.scrollHeight > odoc.body.offsetHeight) return odoc.body.scrollHeight;
    else return odoc.body.offsetHeight;
  }

  function getPageWidth()
  {
    var win = outerWin;
    var odoc = win.document;
    if (win.innerWidth && win.scrollMaxX) return win.innerWidth + win.scrollMaxX;
    else if (odoc.body.scrollWidth > odoc.body.offsetWidth) return odoc.body.scrollWidth;
    else return odoc.body.offsetWidth;
  }

  function getInnerHeight()
  {
    var win = outerWin;
    var odoc = win.document;
    var h;
    if (browser.opera) h = win.innerHeight;
    else h = odoc.documentElement.clientHeight;
    if (h) return h;

    // deal with case where iframe is hidden, hope that
    // style.height of iframe container is set in px
    return Number(editorInfo.frame.parentNode.style.height.replace(/[^0-9]/g, '') || 0);
  }

  function getInnerWidth()
  {
    var win = outerWin;
    var odoc = win.document;
    return odoc.documentElement.clientWidth;
  }

  function scrollNodeVerticallyIntoView(node)
  {
    // requires element (non-text) node;
    // if node extends above top of viewport or below bottom of viewport (or top of scrollbar),
    // scroll it the minimum distance needed to be completely in view.
    var win = outerWin;
    var odoc = outerWin.document;
    var distBelowTop = node.offsetTop + iframePadTop - win.scrollY;
    var distAboveBottom = win.scrollY + getInnerHeight() - (node.offsetTop + iframePadTop + node.offsetHeight);

    if (distBelowTop < 0)
    {
      win.scrollBy(0, distBelowTop);
    }
    else if (distAboveBottom < 0)
    {
      win.scrollBy(0, -distAboveBottom);
    }
  }

  function scrollXHorizontallyIntoView(pixelX)
  {
    var win = outerWin;
    var odoc = outerWin.document;
    pixelX += iframePadLeft;
    var distInsideLeft = pixelX - win.scrollX;
    var distInsideRight = win.scrollX + getInnerWidth() - pixelX;
    if (distInsideLeft < 0)
    {
      win.scrollBy(distInsideLeft, 0);
    }
    else if (distInsideRight < 0)
    {
      win.scrollBy(-distInsideRight + 1, 0);
    }
  }

  function scrollSelectionIntoView()
  {
    if (!rep.selStart) return;
    fixView();
    var focusLine = (rep.selFocusAtStart ? rep.selStart[0] : rep.selEnd[0]);
    scrollNodeVerticallyIntoView(rep.lines.atIndex(focusLine).lineNode);
    if (!doesWrap)
    {
      var browserSelection = getSelection();
      if (browserSelection)
      {
        var focusPoint = (browserSelection.focusAtStart ? browserSelection.startPoint : browserSelection.endPoint);
        var selectionPointX = getSelectionPointX(focusPoint);
        scrollXHorizontallyIntoView(selectionPointX);
        fixView();
      }
    }
  }

  var listAttributeName = 'list';

  function getLineListType(lineNum)
  {
    return documentAttributeManager.getAttributeOnLine(lineNum, listAttributeName)
  }

  function setLineListType(lineNum, listType)
  {
    if(listType == ''){
      documentAttributeManager.removeAttributeOnLine(lineNum, listAttributeName);
      documentAttributeManager.removeAttributeOnLine(lineNum, 'start');
    }else{
      documentAttributeManager.setAttributeOnLine(lineNum, listAttributeName, listType);
    }

    //if the list has been removed, it is necessary to renumber
    //starting from the *next* line because the list may have been
    //separated. If it returns null, it means that the list was not cut, try
    //from the current one.
    if(renumberList(lineNum+1)==null)
    {
      renumberList(lineNum);
    }
  }

  function renumberList(lineNum){
    //1-check we are in a list
    var type = getLineListType(lineNum);
    if(!type)
    {
      return null;
    }
    type = /([a-z]+)[0-9]+/.exec(type);
    if(type[1] == "indent")
    {
      return null;
    }

    //2-find the first line of the list
    while(lineNum-1 >= 0 && (type=getLineListType(lineNum-1)))
    {
      type = /([a-z]+)[0-9]+/.exec(type);
      if(type[1] == "indent")
        break;
      lineNum--;
    }

    //3-renumber every list item of the same level from the beginning, level 1
    //IMPORTANT: never skip a level because there imbrication may be arbitrary
    var builder = Changeset.builder(rep.lines.totalWidth());
    var loc = [0,0];
    function applyNumberList(line, level)
    {
      //init
      var position = 1;
      var curLevel = level;
      var listType;
      //loop over the lines
      while(listType = getLineListType(line))
      {
        //apply new num
        listType = /([a-z]+)([0-9]+)/.exec(listType);
        curLevel = Number(listType[2]);
        if(isNaN(curLevel) || listType[0] == "indent")
        {
          return line;
        }
        else if(curLevel == level)
        {
          ChangesetUtils.buildKeepRange(rep, builder, loc, (loc = [line, 0]));
          ChangesetUtils.buildKeepRange(rep, builder, loc, (loc = [line, 1]), [
            ['start', position]
          ], rep.apool);

          position++;
          line++;
        }
        else if(curLevel < level)
        {
          return line;//back to parent
        }
        else
        {
          line = applyNumberList(line, level+1);//recursive call
        }
      }
      return line;
    }

    applyNumberList(lineNum, 1);
    var cs = builder.toString();
    if (!Changeset.isIdentity(cs))
    {
      performDocumentApplyChangeset(cs);
    }

    //4-apply the modifications


  }


  function doInsertList(type)
  {
    if (!(rep.selStart && rep.selEnd))
    {
      return;
    }

    var firstLine, lastLine;
    firstLine = rep.selStart[0];
    lastLine = Math.max(firstLine, rep.selEnd[0] - ((rep.selEnd[1] === 0) ? 1 : 0));

    var allLinesAreList = true;
    for (var n = firstLine; n <= lastLine; n++)
    {
      var listType = getLineListType(n);
      if (!listType || listType.slice(0, type.length) != type)
      {
        allLinesAreList = false;
        break;
      }
    }

    var mods = [];
    for (var n = firstLine; n <= lastLine; n++)
    {
      var t = '';
      var level = 0;
      var listType = /([a-z]+)([0-9]+)/.exec(getLineListType(n));
      if (listType)
      {
        t = listType[1];
        level = Number(listType[2]);
      }
      var t = getLineListType(n);
      mods.push([n, allLinesAreList ? 'indent' + level : (t ? type + level : type + '1')]);
    }

    _.each(mods, function(mod){
      setLineListType(mod[0], mod[1]);
    });
  }

  function doInsertUnorderedList(){
    doInsertList('bullet');
  }
  function doInsertOrderedList(){
    doInsertList('number');
  }
  editorInfo.ace_doInsertUnorderedList = doInsertUnorderedList;
  editorInfo.ace_doInsertOrderedList = doInsertOrderedList;

  var lineNumbersShown;
  var sideDivInner;

  function initLineNumbers()
  {
    lineNumbersShown = 1;
    sideDiv.innerHTML = '<table border="0" cellpadding="0" cellspacing="0" align="right"><tr><td id="sidedivinner"><div>1</div></td></tr></table>';
    sideDivInner = outerWin.document.getElementById("sidedivinner");
  }

  function updateLineNumbers()
  {
    var newNumLines = rep.lines.length();
    if (newNumLines < 1) newNumLines = 1;
    //update height of all current line numbers

    var a = sideDivInner.firstChild;
    var b = doc.body.firstChild;
    var n = 0;

    if (currentCallStack && currentCallStack.domClean)
    {

      while (a && b)
      {
        if(n > lineNumbersShown) //all updated, break
        break;
        var h = (b.clientHeight || b.offsetHeight);
        if (b.nextSibling)
        {
          // when text is zoomed in mozilla, divs have fractional
          // heights (though the properties are always integers)
          // and the line-numbers don't line up unless we pay
          // attention to where the divs are actually placed...
          // (also: padding on TTs/SPANs in IE...)
          h = b.nextSibling.offsetTop - b.offsetTop;
        }
        if (h)
        {
          var hpx = h + "px";
          if (a.style.height != hpx) {
            a.style.height = hpx;
          }
        }
        a = a.nextSibling;
        b = b.nextSibling;
        n++;
      }
    }

    if (newNumLines != lineNumbersShown)
    {
      var container = sideDivInner;
      var odoc = outerWin.document;
      var fragment = odoc.createDocumentFragment();
      while (lineNumbersShown < newNumLines)
      {
        lineNumbersShown++;
        var n = lineNumbersShown;
        var div = odoc.createElement("DIV");
        //calculate height for new line number
        if(b){
          var h = (b.clientHeight || b.offsetHeight);

          if (b.nextSibling){
            h = b.nextSibling.offsetTop - b.offsetTop;
          }
        }

        if(h){ // apply style to div
          div.style.height = h +"px";
        }

        div.appendChild(odoc.createTextNode(String(n)));
        fragment.appendChild(div);
        if(b){
          b = b.nextSibling;
        }
      }

      container.appendChild(fragment);
      while (lineNumbersShown > newNumLines)
      {
        container.removeChild(container.lastChild);
        lineNumbersShown--;
      }
    }
  }


  // Init documentAttributeManager
  documentAttributeManager = new AttributeManager(rep, performDocumentApplyChangeset);
  editorInfo.ace_performDocumentApplyAttributesToRange = function () {
    return documentAttributeManager.setAttributesOnRange.apply(documentAttributeManager, arguments);
  };

  this.init = function () {
    $(document).ready(function(){
      doc = document; // defined as a var in scope outside
      inCallStack("setup", function()
      {
        var body = doc.getElementById("innerdocbody");
        root = body; // defined as a var in scope outside
        if (browser.firefox) $(root).addClass("mozilla");
        if (browser.safari) $(root).addClass("safari");
        if (browser.msie) $(root).addClass("msie");
        setClassPresence(root, "authorColors", true);
        setClassPresence(root, "doesWrap", doesWrap);

        initDynamicCSS();

        enforceEditability();

        // set up dom and rep
        while (root.firstChild) root.removeChild(root.firstChild);
        var oneEntry = createDomLineEntry("");
        doRepLineSplice(0, rep.lines.length(), [oneEntry]);
        insertDomLines(null, [oneEntry.domInfo], null);
        rep.alines = Changeset.splitAttributionLines(
        Changeset.makeAttribution("\n"), "\n");

        bindTheEventHandlers();

      });

      hooks.callAll('aceInitialized', {
        editorInfo: editorInfo,
        rep: rep,
        documentAttributeManager: documentAttributeManager
      });

      scheduler.setTimeout(function()
      {
        parent.readyFunc(); // defined in code that sets up the inner iframe
      }, 0);

      isSetUp = true;
    });
  }

}

exports.init = function () {
  var editor = new Ace2Inner()
  editor.init();
};

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
, "ep_etherpad-lite/static/js/AttributePool.js": function (require, exports, module) {
/**
 * This code represents the Attribute Pool Object of the original Etherpad.
 * 90% of the code is still like in the original Etherpad
 * Look at https://github.com/ether/pad/blob/master/infrastructure/ace/www/easysync2.js
 * You can find a explanation what a attribute pool is here:
 * https://github.com/ether/etherpad-lite/blob/master/doc/easysync/easysync-notes.txt
 */

/*
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

/*
  An AttributePool maintains a mapping from [key,value] Pairs called
  Attributes to Numbers (unsigened integers) and vice versa. These numbers are
  used to reference Attributes in Changesets.
*/

var AttributePool = function () {
  this.numToAttrib = {}; // e.g. {0: ['foo','bar']}
  this.attribToNum = {}; // e.g. {'foo,bar': 0}
  this.nextNum = 0;
};

AttributePool.prototype.putAttrib = function (attrib, dontAddIfAbsent) {
  var str = String(attrib);
  if (str in this.attribToNum) {
    return this.attribToNum[str];
  }
  if (dontAddIfAbsent) {
    return -1;
  }
  var num = this.nextNum++;
  this.attribToNum[str] = num;
  this.numToAttrib[num] = [String(attrib[0] || ''), String(attrib[1] || '')];
  return num;
};

AttributePool.prototype.getAttrib = function (num) {
  var pair = this.numToAttrib[num];
  if (!pair) {
    return pair;
  }
  return [pair[0], pair[1]]; // return a mutable copy
};

AttributePool.prototype.getAttribKey = function (num) {
  var pair = this.numToAttrib[num];
  if (!pair) return '';
  return pair[0];
};

AttributePool.prototype.getAttribValue = function (num) {
  var pair = this.numToAttrib[num];
  if (!pair) return '';
  return pair[1];
};

AttributePool.prototype.eachAttrib = function (func) {
  for (var n in this.numToAttrib) {
    var pair = this.numToAttrib[n];
    func(pair[0], pair[1]);
  }
};

AttributePool.prototype.toJsonable = function () {
  return {
    numToAttrib: this.numToAttrib,
    nextNum: this.nextNum
  };
};

AttributePool.prototype.fromJsonable = function (obj) {
  this.numToAttrib = obj.numToAttrib;
  this.nextNum = obj.nextNum;
  this.attribToNum = {};
  for (var n in this.numToAttrib) {
    this.attribToNum[String(this.numToAttrib[n])] = Number(n);
  }
  return this;
};
  

module.exports = AttributePool;
}
, "ep_etherpad-lite/static/js/Changeset.js": function (require, exports, module) {
/*
 * This is the Changeset library copied from the old Etherpad with some modifications to use it in node.js
 * Can be found in https://github.com/ether/pad/blob/master/infrastructure/ace/www/easysync2.js
 */

/**
 * This code is mostly from the old Etherpad. Please help us to comment this code.
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

/*
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

var AttributePool = require("./AttributePool");

/**
 * ==================== General Util Functions =======================
 */

/**
 * This method is called whenever there is an error in the sync process
 * @param msg {string} Just some message
 */
exports.error = function error(msg) {
  var e = new Error(msg);
  e.easysync = true;
  throw e;
};

/**
 * This method is used for assertions with Messages 
 * if assert fails, the error function is called.
 * @param b {boolean} assertion condition
 * @param msgParts {string} error to be passed if it fails
 */
exports.assert = function assert(b, msgParts) {
  if (!b) {
    var msg = Array.prototype.slice.call(arguments, 1).join('');
    exports.error("Failed assertion: " + msg);
  }
};

/**
 * Parses a number from string base 36
 * @param str {string} string of the number in base 36
 * @returns {int} number
 */
exports.parseNum = function (str) {
  return parseInt(str, 36);
};

/**
 * Writes a number in base 36 and puts it in a string
 * @param num {int} number
 * @returns {string} string
 */
exports.numToString = function (num) {
  return num.toString(36).toLowerCase();
};

/**
 * Converts stuff before $ to base 10
 * @obsolete not really used anywhere??
 * @param cs {string} the string
 * @return integer 
 */
exports.toBaseTen = function (cs) {
  var dollarIndex = cs.indexOf('$');
  var beforeDollar = cs.substring(0, dollarIndex);
  var fromDollar = cs.substring(dollarIndex);
  return beforeDollar.replace(/[0-9a-z]+/g, function (s) {
    return String(exports.parseNum(s));
  }) + fromDollar;
};


/**
 * ==================== Changeset Functions =======================
 */

/**
 * returns the required length of the text before changeset 
 * can be applied
 * @param cs {string} String representation of the Changeset
 */ 
exports.oldLen = function (cs) {
  return exports.unpack(cs).oldLen;
};

/**
 * returns the length of the text after changeset is applied
 * @param cs {string} String representation of the Changeset
 */ 
exports.newLen = function (cs) {
  return exports.unpack(cs).newLen;
};

/**
 * this function creates an iterator which decodes string changeset operations
 * @param opsStr {string} String encoding of the change operations to be performed 
 * @param optStartIndex {int} from where in the string should the iterator start 
 * @return {Op} type object iterator 
 */
exports.opIterator = function (opsStr, optStartIndex) {
  //print(opsStr);
  var regex = /((?:\*[0-9a-z]+)*)(?:\|([0-9a-z]+))?([-+=])([0-9a-z]+)|\?|/g;
  var startIndex = (optStartIndex || 0);
  var curIndex = startIndex;
  var prevIndex = curIndex;

  function nextRegexMatch() {
    prevIndex = curIndex;
    var result;
    regex.lastIndex = curIndex;
    result = regex.exec(opsStr);
    curIndex = regex.lastIndex;
    if (result[0] == '?') {
      exports.error("Hit error opcode in op stream");
    }
  
    return result;
  }
  var regexResult = nextRegexMatch();
  var obj = exports.newOp();

  function next(optObj) {
    var op = (optObj || obj);
    if (regexResult[0]) {
      op.attribs = regexResult[1];
      op.lines = exports.parseNum(regexResult[2] || 0);
      op.opcode = regexResult[3];
      op.chars = exports.parseNum(regexResult[4]);
      regexResult = nextRegexMatch();
    } else {
      exports.clearOp(op);
    }
    return op;
  }

  function hasNext() {
    return !!(regexResult[0]);
  }

  function lastIndex() {
    return prevIndex;
  }
  return {
    next: next,
    hasNext: hasNext,
    lastIndex: lastIndex
  };
};

/**
 * Cleans an Op object
 * @param {Op} object to be cleared
 */
exports.clearOp = function (op) {
  op.opcode = '';
  op.chars = 0;
  op.lines = 0;
  op.attribs = '';
};

/**
 * Creates a new Op object
 * @param optOpcode the type operation of the Op object
 */
exports.newOp = function (optOpcode) {
  return {
    opcode: (optOpcode || ''),
    chars: 0,
    lines: 0,
    attribs: ''
  };
};

/**
 * Clones an Op
 * @param op Op to be cloned
 */
exports.cloneOp = function (op) {
  return {
    opcode: op.opcode,
    chars: op.chars,
    lines: op.lines,
    attribs: op.attribs
  };
};

/**
 * Copies op1 to op2
 * @param op1 src Op
 * @param op2 dest Op
 */
exports.copyOp = function (op1, op2) {
  op2.opcode = op1.opcode;
  op2.chars = op1.chars;
  op2.lines = op1.lines;
  op2.attribs = op1.attribs;
};

/**
 * Writes the Op in a string the way that changesets need it
 */
exports.opString = function (op) {
  // just for debugging
  if (!op.opcode) return 'null';
  var assem = exports.opAssembler();
  assem.append(op);
  return assem.toString();
};

/**
 * Used just for debugging
 */
exports.stringOp = function (str) {
  // just for debugging
  return exports.opIterator(str).next();
};

/**
 * Used to check if a Changeset if valid
 * @param cs {Changeset} Changeset to be checked
 */
exports.checkRep = function (cs) {
  // doesn't check things that require access to attrib pool (e.g. attribute order)
  // or original string (e.g. newline positions)
  var unpacked = exports.unpack(cs);
  var oldLen = unpacked.oldLen;
  var newLen = unpacked.newLen;
  var ops = unpacked.ops;
  var charBank = unpacked.charBank;

  var assem = exports.smartOpAssembler();
  var oldPos = 0;
  var calcNewLen = 0;
  var numInserted = 0;
  var iter = exports.opIterator(ops);
  while (iter.hasNext()) {
    var o = iter.next();
    switch (o.opcode) {
    case '=':
      oldPos += o.chars;
      calcNewLen += o.chars;
      break;
    case '-':
      oldPos += o.chars;
      exports.assert(oldPos <= oldLen, oldPos, " > ", oldLen, " in ", cs);
      break;
    case '+':
      {
        calcNewLen += o.chars;
        numInserted += o.chars;
        exports.assert(calcNewLen <= newLen, calcNewLen, " > ", newLen, " in ", cs);
        break;
      }
    }
    assem.append(o);
  }

  calcNewLen += oldLen - oldPos;
  charBank = charBank.substring(0, numInserted);
  while (charBank.length < numInserted) {
    charBank += "?";
  }

  assem.endDocument();
  var normalized = exports.pack(oldLen, calcNewLen, assem.toString(), charBank);
  exports.assert(normalized == cs, 'Invalid changeset (checkRep failed)');

  return cs;
}


/**
 * ==================== Util Functions =======================
 */

/**
 * creates an object that allows you to append operations (type Op) and also
 * compresses them if possible
 */
exports.smartOpAssembler = function () {
  // Like opAssembler but able to produce conforming exportss
  // from slightly looser input, at the cost of speed.
  // Specifically:
  // - merges consecutive operations that can be merged
  // - strips final "="
  // - ignores 0-length changes
  // - reorders consecutive + and - (which margingOpAssembler doesn't do)
  var minusAssem = exports.mergingOpAssembler();
  var plusAssem = exports.mergingOpAssembler();
  var keepAssem = exports.mergingOpAssembler();
  var assem = exports.stringAssembler();
  var lastOpcode = '';
  var lengthChange = 0;

  function flushKeeps() {
    assem.append(keepAssem.toString());
    keepAssem.clear();
  }

  function flushPlusMinus() {
    assem.append(minusAssem.toString());
    minusAssem.clear();
    assem.append(plusAssem.toString());
    plusAssem.clear();
  }

  function append(op) {
    if (!op.opcode) return;
    if (!op.chars) return;

    if (op.opcode == '-') {
      if (lastOpcode == '=') {
        flushKeeps();
      }
      minusAssem.append(op);
      lengthChange -= op.chars;
    } else if (op.opcode == '+') {
      if (lastOpcode == '=') {
        flushKeeps();
      }
      plusAssem.append(op);
      lengthChange += op.chars;
    } else if (op.opcode == '=') {
      if (lastOpcode != '=') {
        flushPlusMinus();
      }
      keepAssem.append(op);
    }
    lastOpcode = op.opcode;
  }

  function appendOpWithText(opcode, text, attribs, pool) {
    var op = exports.newOp(opcode);
    op.attribs = exports.makeAttribsString(opcode, attribs, pool);
    var lastNewlinePos = text.lastIndexOf('\n');
    if (lastNewlinePos < 0) {
      op.chars = text.length;
      op.lines = 0;
      append(op);
    } else {
      op.chars = lastNewlinePos + 1;
      op.lines = text.match(/\n/g).length;
      append(op);
      op.chars = text.length - (lastNewlinePos + 1);
      op.lines = 0;
      append(op);
    }
  }

  function toString() {
    flushPlusMinus();
    flushKeeps();
    return assem.toString();
  }

  function clear() {
    minusAssem.clear();
    plusAssem.clear();
    keepAssem.clear();
    assem.clear();
    lengthChange = 0;
  }

  function endDocument() {
    keepAssem.endDocument();
  }

  function getLengthChange() {
    return lengthChange;
  }

  return {
    append: append,
    toString: toString,
    clear: clear,
    endDocument: endDocument,
    appendOpWithText: appendOpWithText,
    getLengthChange: getLengthChange
  };
};


exports.mergingOpAssembler = function () {
  // This assembler can be used in production; it efficiently
  // merges consecutive operations that are mergeable, ignores
  // no-ops, and drops final pure "keeps".  It does not re-order
  // operations.
  var assem = exports.opAssembler();
  var bufOp = exports.newOp();

  // If we get, for example, insertions [xxx\n,yyy], those don't merge,
  // but if we get [xxx\n,yyy,zzz\n], that merges to [xxx\nyyyzzz\n].
  // This variable stores the length of yyy and any other newline-less
  // ops immediately after it.
  var bufOpAdditionalCharsAfterNewline = 0;

  function flush(isEndDocument) {
    if (bufOp.opcode) {
      if (isEndDocument && bufOp.opcode == '=' && !bufOp.attribs) {
        // final merged keep, leave it implicit
      } else {
        assem.append(bufOp);
        if (bufOpAdditionalCharsAfterNewline) {
          bufOp.chars = bufOpAdditionalCharsAfterNewline;
          bufOp.lines = 0;
          assem.append(bufOp);
          bufOpAdditionalCharsAfterNewline = 0;
        }
      }
      bufOp.opcode = '';
    }
  }

  function append(op) {
    if (op.chars > 0) {
      if (bufOp.opcode == op.opcode && bufOp.attribs == op.attribs) {
        if (op.lines > 0) {
          // bufOp and additional chars are all mergeable into a multi-line op
          bufOp.chars += bufOpAdditionalCharsAfterNewline + op.chars;
          bufOp.lines += op.lines;
          bufOpAdditionalCharsAfterNewline = 0;
        } else if (bufOp.lines == 0) {
          // both bufOp and op are in-line
          bufOp.chars += op.chars;
        } else {
          // append in-line text to multi-line bufOp
          bufOpAdditionalCharsAfterNewline += op.chars;
        }
      } else {
        flush();
        exports.copyOp(op, bufOp);
      }
    }
  }

  function endDocument() {
    flush(true);
  }

  function toString() {
    flush();
    return assem.toString();
  }

  function clear() {
    assem.clear();
    exports.clearOp(bufOp);
  }
  return {
    append: append,
    toString: toString,
    clear: clear,
    endDocument: endDocument
  };
};



exports.opAssembler = function () {
  var pieces = [];
  // this function allows op to be mutated later (doesn't keep a ref)

  function append(op) {
    pieces.push(op.attribs);
    if (op.lines) {
      pieces.push('|', exports.numToString(op.lines));
    }
    pieces.push(op.opcode);
    pieces.push(exports.numToString(op.chars));
  }

  function toString() {
    return pieces.join('');
  }

  function clear() {
    pieces.length = 0;
  }
  return {
    append: append,
    toString: toString,
    clear: clear
  };
};

/**
 * A custom made String Iterator
 * @param str {string} String to be iterated over
 */ 
exports.stringIterator = function (str) {
  var curIndex = 0;
  // newLines is the number of \n between curIndex and str.length
  var newLines = str.split("\n").length - 1
  function getnewLines(){
    return newLines
  }

  function assertRemaining(n) {
    exports.assert(n <= remaining(), "!(", n, " <= ", remaining(), ")");
  }

  function take(n) {
    assertRemaining(n);
    var s = str.substr(curIndex, n);
    newLines -= s.split("\n").length - 1
    curIndex += n;
    return s;
  }

  function peek(n) {
    assertRemaining(n);
    var s = str.substr(curIndex, n);
    return s;
  }

  function skip(n) {
    assertRemaining(n);
    curIndex += n;
  }

  function remaining() {
    return str.length - curIndex;
  }
  return {
    take: take,
    skip: skip,
    remaining: remaining,
    peek: peek,
    newlines: getnewLines
  };
};

/**
 * A custom made StringBuffer 
 */
exports.stringAssembler = function () {
  var pieces = [];

  function append(x) {
    pieces.push(String(x));
  }

  function toString() {
    return pieces.join('');
  }
  return {
    append: append,
    toString: toString
  };
};

/**
 * This class allows to iterate and modify texts which have several lines
 * It is used for applying Changesets on arrays of lines
 * Note from prev docs: "lines" need not be an array as long as it supports certain calls (lines_foo inside).
 */
exports.textLinesMutator = function (lines) {
  // Mutates lines, an array of strings, in place.
  // Mutation operations have the same constraints as exports operations
  // with respect to newlines, but not the other additional constraints
  // (i.e. ins/del ordering, forbidden no-ops, non-mergeability, final newline).
  // Can be used to mutate lists of strings where the last char of each string
  // is not actually a newline, but for the purposes of N and L values,
  // the caller should pretend it is, and for things to work right in that case, the input
  // to insert() should be a single line with no newlines.
  var curSplice = [0, 0];
  var inSplice = false;
  // position in document after curSplice is applied:
  var curLine = 0,
      curCol = 0;
  // invariant: if (inSplice) then (curLine is in curSplice[0] + curSplice.length - {2,3}) &&
  //            curLine >= curSplice[0]
  // invariant: if (inSplice && (curLine >= curSplice[0] + curSplice.length - 2)) then
  //            curCol == 0

  function lines_applySplice(s) {
    lines.splice.apply(lines, s);
  }

  function lines_toSource() {
    return lines.toSource();
  }

  function lines_get(idx) {
    if (lines.get) {
      return lines.get(idx);
    } else {
      return lines[idx];
    }
  }
  // can be unimplemented if removeLines's return value not needed

  function lines_slice(start, end) {
    if (lines.slice) {
      return lines.slice(start, end);
    } else {
      return [];
    }
  }

  function lines_length() {
    if ((typeof lines.length) == "number") {
      return lines.length;
    } else {
      return lines.length();
    }
  }

  function enterSplice() {
    curSplice[0] = curLine;
    curSplice[1] = 0;
    if (curCol > 0) {
      putCurLineInSplice();
    }
    inSplice = true;
  }

  function leaveSplice() {
    lines_applySplice(curSplice);
    curSplice.length = 2;
    curSplice[0] = curSplice[1] = 0;
    inSplice = false;
  }

  function isCurLineInSplice() {
    return (curLine - curSplice[0] < (curSplice.length - 2));
  }

  function debugPrint(typ) {
    print(typ + ": " + curSplice.toSource() + " / " + curLine + "," + curCol + " / " + lines_toSource());
  }

  function putCurLineInSplice() {
    if (!isCurLineInSplice()) {
      curSplice.push(lines_get(curSplice[0] + curSplice[1]));
      curSplice[1]++;
    }
    return 2 + curLine - curSplice[0];
  }

  function skipLines(L, includeInSplice) {
    if (L) {
      if (includeInSplice) {
        if (!inSplice) {
          enterSplice();
        }
        for (var i = 0; i < L; i++) {
          curCol = 0;
          putCurLineInSplice();
          curLine++;
        }
      } else {
        if (inSplice) {
          if (L > 1) {
            leaveSplice();
          } else {
            putCurLineInSplice();
          }
        }
        curLine += L;
        curCol = 0;
      }
      //print(inSplice+" / "+isCurLineInSplice()+" / "+curSplice[0]+" / "+curSplice[1]+" / "+lines.length);
/*if (inSplice && (! isCurLineInSplice()) && (curSplice[0] + curSplice[1] < lines.length)) {
  print("BLAH");
  putCurLineInSplice();
}*/
      // tests case foo in remove(), which isn't otherwise covered in current impl
    }
    //debugPrint("skip");
  }

  function skip(N, L, includeInSplice) {
    if (N) {
      if (L) {
        skipLines(L, includeInSplice);
      } else {
        if (includeInSplice && !inSplice) {
          enterSplice();
        }
        if (inSplice) {
          putCurLineInSplice();
        }
        curCol += N;
        //debugPrint("skip");
      }
    }
  }

  function removeLines(L) {
    var removed = '';
    if (L) {
      if (!inSplice) {
        enterSplice();
      }

      function nextKLinesText(k) {
        var m = curSplice[0] + curSplice[1];
        return lines_slice(m, m + k).join('');
      }
      if (isCurLineInSplice()) {
        //print(curCol);
        if (curCol == 0) {
          removed = curSplice[curSplice.length - 1];
          // print("FOO"); // case foo
          curSplice.length--;
          removed += nextKLinesText(L - 1);
          curSplice[1] += L - 1;
        } else {
          removed = nextKLinesText(L - 1);
          curSplice[1] += L - 1;
          var sline = curSplice.length - 1;
          removed = curSplice[sline].substring(curCol) + removed;
          curSplice[sline] = curSplice[sline].substring(0, curCol) + lines_get(curSplice[0] + curSplice[1]);
          curSplice[1] += 1;
        }
      } else {
        removed = nextKLinesText(L);
        curSplice[1] += L;
      }
      //debugPrint("remove");
    }
    return removed;
  }

  function remove(N, L) {
    var removed = '';
    if (N) {
      if (L) {
        return removeLines(L);
      } else {
        if (!inSplice) {
          enterSplice();
        }
        var sline = putCurLineInSplice();
        removed = curSplice[sline].substring(curCol, curCol + N);
        curSplice[sline] = curSplice[sline].substring(0, curCol) + curSplice[sline].substring(curCol + N);
        //debugPrint("remove");
      }
    }
    return removed;
  }

  function insert(text, L) {
    if (text) {
      if (!inSplice) {
        enterSplice();
      }
      if (L) {
        var newLines = exports.splitTextLines(text);
        if (isCurLineInSplice()) {
          //if (curCol == 0) {
          //curSplice.length--;
          //curSplice[1]--;
          //Array.prototype.push.apply(curSplice, newLines);
          //curLine += newLines.length;
          //}
          //else {
          var sline = curSplice.length - 1;
          var theLine = curSplice[sline];
          var lineCol = curCol;
          curSplice[sline] = theLine.substring(0, lineCol) + newLines[0];
          curLine++;
          newLines.splice(0, 1);
          Array.prototype.push.apply(curSplice, newLines);
          curLine += newLines.length;
          curSplice.push(theLine.substring(lineCol));
          curCol = 0;
          //}
        } else {
          Array.prototype.push.apply(curSplice, newLines);
          curLine += newLines.length;
        }
      } else {
        var sline = putCurLineInSplice();
        curSplice[sline] = curSplice[sline].substring(0, curCol) + text + curSplice[sline].substring(curCol);
        curCol += text.length;
      }
      //debugPrint("insert");
    }
  }

  function hasMore() {
    //print(lines.length+" / "+inSplice+" / "+(curSplice.length - 2)+" / "+curSplice[1]);
    var docLines = lines_length();
    if (inSplice) {
      docLines += curSplice.length - 2 - curSplice[1];
    }
    return curLine < docLines;
  }

  function close() {
    if (inSplice) {
      leaveSplice();
    }
    //debugPrint("close");
  }

  var self = {
    skip: skip,
    remove: remove,
    insert: insert,
    close: close,
    hasMore: hasMore,
    removeLines: removeLines,
    skipLines: skipLines
  };
  return self;
};

/**
 * Function allowing iterating over two Op strings. 
 * @params in1 {string} first Op string
 * @params idx1 {int} integer where 1st iterator should start
 * @params in2 {string} second Op string
 * @params idx2 {int} integer where 2nd iterator should start
 * @params func {function} which decides how 1st or 2nd iterator 
 *         advances. When opX.opcode = 0, iterator X advances to
 *         next element
 *         func has signature f(op1, op2, opOut)
 *             op1 - current operation of the first iterator
 *             op2 - current operation of the second iterator
 *             opOut - result operator to be put into Changeset
 * @return {string} the integrated changeset
 */
exports.applyZip = function (in1, idx1, in2, idx2, func) {
  var iter1 = exports.opIterator(in1, idx1);
  var iter2 = exports.opIterator(in2, idx2);
  var assem = exports.smartOpAssembler();
  var op1 = exports.newOp();
  var op2 = exports.newOp();
  var opOut = exports.newOp();
  while (op1.opcode || iter1.hasNext() || op2.opcode || iter2.hasNext()) {
    if ((!op1.opcode) && iter1.hasNext()) iter1.next(op1);
    if ((!op2.opcode) && iter2.hasNext()) iter2.next(op2);
    func(op1, op2, opOut);
    if (opOut.opcode) {
      //print(opOut.toSource());
      assem.append(opOut);
      opOut.opcode = '';
    }
  }
  assem.endDocument();
  return assem.toString();
};

/**
 * Unpacks a string encoded Changeset into a proper Changeset object
 * @params cs {string} String encoded Changeset
 * @returns {Changeset} a Changeset class
 */
exports.unpack = function (cs) {
  var headerRegex = /Z:([0-9a-z]+)([><])([0-9a-z]+)|/;
  var headerMatch = headerRegex.exec(cs);
  if ((!headerMatch) || (!headerMatch[0])) {
    exports.error("Not a exports: " + cs);
  }
  var oldLen = exports.parseNum(headerMatch[1]);
  var changeSign = (headerMatch[2] == '>') ? 1 : -1;
  var changeMag = exports.parseNum(headerMatch[3]);
  var newLen = oldLen + changeSign * changeMag;
  var opsStart = headerMatch[0].length;
  var opsEnd = cs.indexOf("$");
  if (opsEnd < 0) opsEnd = cs.length;
  return {
    oldLen: oldLen,
    newLen: newLen,
    ops: cs.substring(opsStart, opsEnd),
    charBank: cs.substring(opsEnd + 1)
  };
};

/**
 * Packs Changeset object into a string 
 * @params oldLen {int} Old length of the Changeset
 * @params newLen {int] New length of the Changeset
 * @params opsStr {string} String encoding of the changes to be made
 * @params bank {string} Charbank of the Changeset
 * @returns {Changeset} a Changeset class
 */
exports.pack = function (oldLen, newLen, opsStr, bank) {
  var lenDiff = newLen - oldLen;
  var lenDiffStr = (lenDiff >= 0 ? '>' + exports.numToString(lenDiff) : '<' + exports.numToString(-lenDiff));
  var a = [];
  a.push('Z:', exports.numToString(oldLen), lenDiffStr, opsStr, '$', bank);
  return a.join('');
};

/**
 * Applies a Changeset to a string
 * @params cs {string} String encoded Changeset
 * @params str {string} String to which a Changeset should be applied
 */
exports.applyToText = function (cs, str) {
  var unpacked = exports.unpack(cs);
  exports.assert(str.length == unpacked.oldLen, "mismatched apply: ", str.length, " / ", unpacked.oldLen);
  var csIter = exports.opIterator(unpacked.ops);
  var bankIter = exports.stringIterator(unpacked.charBank);
  var strIter = exports.stringIterator(str);
  var assem = exports.stringAssembler();
  while (csIter.hasNext()) {
    var op = csIter.next();
    switch (op.opcode) {
    case '+':
      //op is + and op.lines 0: no newlines must be in op.chars
      //op is + and op.lines >0: op.chars must include op.lines newlines
      if(op.lines != bankIter.peek(op.chars).split("\n").length - 1){
        throw new Error("newline count is wrong in op +; cs:"+cs+" and text:"+str);
      }
      assem.append(bankIter.take(op.chars));
      break;
    case '-':
      //op is - and op.lines 0: no newlines must be in the deleted string
      //op is - and op.lines >0: op.lines newlines must be in the deleted string
      if(op.lines != strIter.peek(op.chars).split("\n").length - 1){
        throw new Error("newline count is wrong in op -; cs:"+cs+" and text:"+str);
      }
      strIter.skip(op.chars);
      break;
    case '=':
      //op is = and op.lines 0: no newlines must be in the copied string
      //op is = and op.lines >0: op.lines newlines must be in the copied string
      if(op.lines != strIter.peek(op.chars).split("\n").length - 1){
        throw new Error("newline count is wrong in op =; cs:"+cs+" and text:"+str);
      }
      assem.append(strIter.take(op.chars));
      break;
    }
  }
  assem.append(strIter.take(strIter.remaining()));
  return assem.toString();
};

/**
 * applies a changeset on an array of lines
 * @param CS {Changeset} the changeset to be applied
 * @param lines The lines to which the changeset needs to be applied
 */
exports.mutateTextLines = function (cs, lines) {
  var unpacked = exports.unpack(cs);
  var csIter = exports.opIterator(unpacked.ops);
  var bankIter = exports.stringIterator(unpacked.charBank);
  var mut = exports.textLinesMutator(lines);
  while (csIter.hasNext()) {
    var op = csIter.next();
    switch (op.opcode) {
    case '+':
      mut.insert(bankIter.take(op.chars), op.lines);
      break;
    case '-':
      mut.remove(op.chars, op.lines);
      break;
    case '=':
      mut.skip(op.chars, op.lines, ( !! op.attribs));
      break;
    }
  }
  mut.close();
};

/**
 * Composes two attribute strings (see below) into one.
 * @param att1 {string} first attribute string
 * @param att2 {string} second attribue string
 * @param resultIsMutaton {boolean} 
 * @param pool {AttribPool} attribute pool 
 */
exports.composeAttributes = function (att1, att2, resultIsMutation, pool) {
  // att1 and att2 are strings like "*3*f*1c", asMutation is a boolean.
  // Sometimes attribute (key,value) pairs are treated as attribute presence
  // information, while other times they are treated as operations that
  // mutate a set of attributes, and this affects whether an empty value
  // is a deletion or a change.
  // Examples, of the form (att1Items, att2Items, resultIsMutation) -> result
  // ([], [(bold, )], true) -> [(bold, )]
  // ([], [(bold, )], false) -> []
  // ([], [(bold, true)], true) -> [(bold, true)]
  // ([], [(bold, true)], false) -> [(bold, true)]
  // ([(bold, true)], [(bold, )], true) -> [(bold, )]
  // ([(bold, true)], [(bold, )], false) -> []
  // pool can be null if att2 has no attributes.
  if ((!att1) && resultIsMutation) {
    // In the case of a mutation (i.e. composing two exportss),
    // an att2 composed with an empy att1 is just att2.  If att1
    // is part of an attribution string, then att2 may remove
    // attributes that are already gone, so don't do this optimization.
    return att2;
  }
  if (!att2) return att1;
  var atts = [];
  att1.replace(/\*([0-9a-z]+)/g, function (_, a) {
    atts.push(pool.getAttrib(exports.parseNum(a)));
    return '';
  });
  att2.replace(/\*([0-9a-z]+)/g, function (_, a) {
    var pair = pool.getAttrib(exports.parseNum(a));
    var found = false;
    for (var i = 0; i < atts.length; i++) {
      var oldPair = atts[i];
      if (oldPair[0] == pair[0]) {
        if (pair[1] || resultIsMutation) {
          oldPair[1] = pair[1];
        } else {
          atts.splice(i, 1);
        }
        found = true;
        break;
      }
    }
    if ((!found) && (pair[1] || resultIsMutation)) {
      atts.push(pair);
    }
    return '';
  });
  atts.sort();
  var buf = exports.stringAssembler();
  for (var i = 0; i < atts.length; i++) {
    buf.append('*');
    buf.append(exports.numToString(pool.putAttrib(atts[i])));
  }
  //print(att1+" / "+att2+" / "+buf.toString());
  return buf.toString();
};

/**
 * Function used as parameter for applyZip to apply a Changeset to an 
 * attribute 
 */
exports._slicerZipperFunc = function (attOp, csOp, opOut, pool) {
  // attOp is the op from the sequence that is being operated on, either an
  // attribution string or the earlier of two exportss being composed.
  // pool can be null if definitely not needed.
  //print(csOp.toSource()+" "+attOp.toSource()+" "+opOut.toSource());
  if (attOp.opcode == '-') {
    exports.copyOp(attOp, opOut);
    attOp.opcode = '';
  } else if (!attOp.opcode) {
    exports.copyOp(csOp, opOut);
    csOp.opcode = '';
  } else {
    switch (csOp.opcode) {
    case '-':
      {
        if (csOp.chars <= attOp.chars) {
          // delete or delete part
          if (attOp.opcode == '=') {
            opOut.opcode = '-';
            opOut.chars = csOp.chars;
            opOut.lines = csOp.lines;
            opOut.attribs = '';
          }
          attOp.chars -= csOp.chars;
          attOp.lines -= csOp.lines;
          csOp.opcode = '';
          if (!attOp.chars) {
            attOp.opcode = '';
          }
        } else {
          // delete and keep going
          if (attOp.opcode == '=') {
            opOut.opcode = '-';
            opOut.chars = attOp.chars;
            opOut.lines = attOp.lines;
            opOut.attribs = '';
          }
          csOp.chars -= attOp.chars;
          csOp.lines -= attOp.lines;
          attOp.opcode = '';
        }
        break;
      }
    case '+':
      {
        // insert
        exports.copyOp(csOp, opOut);
        csOp.opcode = '';
        break;
      }
    case '=':
      {
        if (csOp.chars <= attOp.chars) {
          // keep or keep part
          opOut.opcode = attOp.opcode;
          opOut.chars = csOp.chars;
          opOut.lines = csOp.lines;
          opOut.attribs = exports.composeAttributes(attOp.attribs, csOp.attribs, attOp.opcode == '=', pool);
          csOp.opcode = '';
          attOp.chars -= csOp.chars;
          attOp.lines -= csOp.lines;
          if (!attOp.chars) {
            attOp.opcode = '';
          }
        } else {
          // keep and keep going
          opOut.opcode = attOp.opcode;
          opOut.chars = attOp.chars;
          opOut.lines = attOp.lines;
          opOut.attribs = exports.composeAttributes(attOp.attribs, csOp.attribs, attOp.opcode == '=', pool);
          attOp.opcode = '';
          csOp.chars -= attOp.chars;
          csOp.lines -= attOp.lines;
        }
        break;
      }
    case '':
      {
        exports.copyOp(attOp, opOut);
        attOp.opcode = '';
        break;
      }
    }
  }
};

/**
 * Applies a Changeset to the attribs string of a AText.
 * @param cs {string} Changeset
 * @param astr {string} the attribs string of a AText
 * @param pool {AttribsPool} the attibutes pool
 */
exports.applyToAttribution = function (cs, astr, pool) {
  var unpacked = exports.unpack(cs);

  return exports.applyZip(astr, 0, unpacked.ops, 0, function (op1, op2, opOut) {
    return exports._slicerZipperFunc(op1, op2, opOut, pool);
  });
};

/*exports.oneInsertedLineAtATimeOpIterator = function(opsStr, optStartIndex, charBank) {
  var iter = exports.opIterator(opsStr, optStartIndex);
  var bankIndex = 0;

};*/

exports.mutateAttributionLines = function (cs, lines, pool) {
  //dmesg(cs);
  //dmesg(lines.toSource()+" ->");
  var unpacked = exports.unpack(cs);
  var csIter = exports.opIterator(unpacked.ops);
  var csBank = unpacked.charBank;
  var csBankIndex = 0;
  // treat the attribution lines as text lines, mutating a line at a time
  var mut = exports.textLinesMutator(lines);

  var lineIter = null;

  function isNextMutOp() {
    return (lineIter && lineIter.hasNext()) || mut.hasMore();
  }

  function nextMutOp(destOp) {
    if ((!(lineIter && lineIter.hasNext())) && mut.hasMore()) {
      var line = mut.removeLines(1);
      lineIter = exports.opIterator(line);
    }
    if (lineIter && lineIter.hasNext()) {
      lineIter.next(destOp);
    } else {
      destOp.opcode = '';
    }
  }
  var lineAssem = null;

  function outputMutOp(op) {
    //print("outputMutOp: "+op.toSource());
    if (!lineAssem) {
      lineAssem = exports.mergingOpAssembler();
    }
    lineAssem.append(op);
    if (op.lines > 0) {
      exports.assert(op.lines == 1, "Can't have op.lines of ", op.lines, " in attribution lines");
      // ship it to the mut
      mut.insert(lineAssem.toString(), 1);
      lineAssem = null;
    }
  }

  var csOp = exports.newOp();
  var attOp = exports.newOp();
  var opOut = exports.newOp();
  while (csOp.opcode || csIter.hasNext() || attOp.opcode || isNextMutOp()) {
    if ((!csOp.opcode) && csIter.hasNext()) {
      csIter.next(csOp);
    }
    //print(csOp.toSource()+" "+attOp.toSource()+" "+opOut.toSource());
    //print(csOp.opcode+"/"+csOp.lines+"/"+csOp.attribs+"/"+lineAssem+"/"+lineIter+"/"+(lineIter?lineIter.hasNext():null));
    //print("csOp: "+csOp.toSource());
    if ((!csOp.opcode) && (!attOp.opcode) && (!lineAssem) && (!(lineIter && lineIter.hasNext()))) {
      break; // done
    } else if (csOp.opcode == '=' && csOp.lines > 0 && (!csOp.attribs) && (!attOp.opcode) && (!lineAssem) && (!(lineIter && lineIter.hasNext()))) {
      // skip multiple lines; this is what makes small changes not order of the document size
      mut.skipLines(csOp.lines);
      //print("skipped: "+csOp.lines);
      csOp.opcode = '';
    } else if (csOp.opcode == '+') {
      if (csOp.lines > 1) {
        var firstLineLen = csBank.indexOf('\n', csBankIndex) + 1 - csBankIndex;
        exports.copyOp(csOp, opOut);
        csOp.chars -= firstLineLen;
        csOp.lines--;
        opOut.lines = 1;
        opOut.chars = firstLineLen;
      } else {
        exports.copyOp(csOp, opOut);
        csOp.opcode = '';
      }
      outputMutOp(opOut);
      csBankIndex += opOut.chars;
      opOut.opcode = '';
    } else {
      if ((!attOp.opcode) && isNextMutOp()) {
        nextMutOp(attOp);
      }
      //print("attOp: "+attOp.toSource());
      exports._slicerZipperFunc(attOp, csOp, opOut, pool);
      if (opOut.opcode) {
        outputMutOp(opOut);
        opOut.opcode = '';
      }
    }
  }

  exports.assert(!lineAssem, "line assembler not finished:"+cs);
  mut.close();

  //dmesg("-> "+lines.toSource());
};

/**
 * joins several Attribution lines
 * @param theAlines collection of Attribution lines
 * @returns {string} joined Attribution lines
 */
exports.joinAttributionLines = function (theAlines) {
  var assem = exports.mergingOpAssembler();
  for (var i = 0; i < theAlines.length; i++) {
    var aline = theAlines[i];
    var iter = exports.opIterator(aline);
    while (iter.hasNext()) {
      assem.append(iter.next());
    }
  }
  return assem.toString();
};

exports.splitAttributionLines = function (attrOps, text) {
  var iter = exports.opIterator(attrOps);
  var assem = exports.mergingOpAssembler();
  var lines = [];
  var pos = 0;

  function appendOp(op) {
    assem.append(op);
    if (op.lines > 0) {
      lines.push(assem.toString());
      assem.clear();
    }
    pos += op.chars;
  }

  while (iter.hasNext()) {
    var op = iter.next();
    var numChars = op.chars;
    var numLines = op.lines;
    while (numLines > 1) {
      var newlineEnd = text.indexOf('\n', pos) + 1;
      exports.assert(newlineEnd > 0, "newlineEnd <= 0 in splitAttributionLines");
      op.chars = newlineEnd - pos;
      op.lines = 1;
      appendOp(op);
      numChars -= op.chars;
      numLines -= op.lines;
    }
    if (numLines == 1) {
      op.chars = numChars;
      op.lines = 1;
    }
    appendOp(op);
  }

  return lines;
};

/**
 * splits text into lines
 * @param {string} text to be splitted
 */
exports.splitTextLines = function (text) {
  return text.match(/[^\n]*(?:\n|[^\n]$)/g);
};

/**
 * compose two Changesets
 * @param cs1 {Changeset} first Changeset
 * @param cs2 {Changeset} second Changeset
 * @param pool {AtribsPool} Attribs pool
 */
exports.compose = function (cs1, cs2, pool) {
  var unpacked1 = exports.unpack(cs1);
  var unpacked2 = exports.unpack(cs2);
  var len1 = unpacked1.oldLen;
  var len2 = unpacked1.newLen;
  exports.assert(len2 == unpacked2.oldLen, "mismatched composition of two changesets");
  var len3 = unpacked2.newLen;
  var bankIter1 = exports.stringIterator(unpacked1.charBank);
  var bankIter2 = exports.stringIterator(unpacked2.charBank);
  var bankAssem = exports.stringAssembler();

  var newOps = exports.applyZip(unpacked1.ops, 0, unpacked2.ops, 0, function (op1, op2, opOut) {
    //var debugBuilder = exports.stringAssembler();
    //debugBuilder.append(exports.opString(op1));
    //debugBuilder.append(',');
    //debugBuilder.append(exports.opString(op2));
    //debugBuilder.append(' / ');
    var op1code = op1.opcode;
    var op2code = op2.opcode;
    if (op1code == '+' && op2code == '-') {
      bankIter1.skip(Math.min(op1.chars, op2.chars));
    }
    exports._slicerZipperFunc(op1, op2, opOut, pool);
    if (opOut.opcode == '+') {
      if (op2code == '+') {
        bankAssem.append(bankIter2.take(opOut.chars));
      } else {
        bankAssem.append(bankIter1.take(opOut.chars));
      }
    }

    //debugBuilder.append(exports.opString(op1));
    //debugBuilder.append(',');
    //debugBuilder.append(exports.opString(op2));
    //debugBuilder.append(' -> ');
    //debugBuilder.append(exports.opString(opOut));
    //print(debugBuilder.toString());
  });

  return exports.pack(len1, len3, newOps, bankAssem.toString());
};

/**
 * returns a function that tests if a string of attributes
 * (e.g. *3*4) contains a given attribute key,value that
 * is already present in the pool.
 * @param attribPair array [key,value] of the attribute 
 * @param pool {AttribPool} Attribute pool
 */
exports.attributeTester = function (attribPair, pool) {
  if (!pool) {
    return never;
  }
  var attribNum = pool.putAttrib(attribPair, true);
  if (attribNum < 0) {
    return never;
  } else {
    var re = new RegExp('\\*' + exports.numToString(attribNum) + '(?!\\w)');
    return function (attribs) {
      return re.test(attribs);
    };
  }

  function never(attribs) {
    return false;
  }
};

/**
 * creates the identity Changeset of length N
 * @param N {int} length of the identity changeset
 */
exports.identity = function (N) {
  return exports.pack(N, N, "", "");
};


/**
 * creates a Changeset which works on oldFullText and removes text 
 * from spliceStart to spliceStart+numRemoved and inserts newText 
 * instead. Also gives possibility to add attributes optNewTextAPairs 
 * for the new text.
 * @param oldFullText {string} old text
 * @param spliecStart {int} where splicing starts
 * @param numRemoved {int} number of characters to be removed
 * @param newText {string} string to be inserted
 * @param optNewTextAPairs {string} new pairs to be inserted
 * @param pool {AttribPool} Attribution Pool
 */
exports.makeSplice = function (oldFullText, spliceStart, numRemoved, newText, optNewTextAPairs, pool) {
  var oldLen = oldFullText.length;

  if (spliceStart >= oldLen) {
    spliceStart = oldLen - 1;
  }
  if (numRemoved > oldFullText.length - spliceStart) {
    numRemoved = oldFullText.length - spliceStart;
  }
  var oldText = oldFullText.substring(spliceStart, spliceStart + numRemoved);
  var newLen = oldLen + newText.length - oldText.length;

  var assem = exports.smartOpAssembler();
  assem.appendOpWithText('=', oldFullText.substring(0, spliceStart));
  assem.appendOpWithText('-', oldText);
  assem.appendOpWithText('+', newText, optNewTextAPairs, pool);
  assem.endDocument();
  return exports.pack(oldLen, newLen, assem.toString(), newText);
};

/**
 * Transforms a changeset into a list of splices in the form
 * [startChar, endChar, newText] meaning replace text from
 * startChar to endChar with newText
 * @param cs Changeset
 */
exports.toSplices = function (cs) {
  // 
  var unpacked = exports.unpack(cs);
  var splices = [];

  var oldPos = 0;
  var iter = exports.opIterator(unpacked.ops);
  var charIter = exports.stringIterator(unpacked.charBank);
  var inSplice = false;
  while (iter.hasNext()) {
    var op = iter.next();
    if (op.opcode == '=') {
      oldPos += op.chars;
      inSplice = false;
    } else {
      if (!inSplice) {
        splices.push([oldPos, oldPos, ""]);
        inSplice = true;
      }
      if (op.opcode == '-') {
        oldPos += op.chars;
        splices[splices.length - 1][1] += op.chars;
      } else if (op.opcode == '+') {
        splices[splices.length - 1][2] += charIter.take(op.chars);
      }
    }
  }

  return splices;
};

/**
 * 
 */
exports.characterRangeFollow = function (cs, startChar, endChar, insertionsAfter) {
  var newStartChar = startChar;
  var newEndChar = endChar;
  var splices = exports.toSplices(cs);
  var lengthChangeSoFar = 0;
  for (var i = 0; i < splices.length; i++) {
    var splice = splices[i];
    var spliceStart = splice[0] + lengthChangeSoFar;
    var spliceEnd = splice[1] + lengthChangeSoFar;
    var newTextLength = splice[2].length;
    var thisLengthChange = newTextLength - (spliceEnd - spliceStart);

    if (spliceStart <= newStartChar && spliceEnd >= newEndChar) {
      // splice fully replaces/deletes range
      // (also case that handles insertion at a collapsed selection)
      if (insertionsAfter) {
        newStartChar = newEndChar = spliceStart;
      } else {
        newStartChar = newEndChar = spliceStart + newTextLength;
      }
    } else if (spliceEnd <= newStartChar) {
      // splice is before range
      newStartChar += thisLengthChange;
      newEndChar += thisLengthChange;
    } else if (spliceStart >= newEndChar) {
      // splice is after range
    } else if (spliceStart >= newStartChar && spliceEnd <= newEndChar) {
      // splice is inside range
      newEndChar += thisLengthChange;
    } else if (spliceEnd < newEndChar) {
      // splice overlaps beginning of range
      newStartChar = spliceStart + newTextLength;
      newEndChar += thisLengthChange;
    } else {
      // splice overlaps end of range
      newEndChar = spliceStart;
    }

    lengthChangeSoFar += thisLengthChange;
  }

  return [newStartChar, newEndChar];
};

/**
 * Iterate over attributes in a changeset and move them from
 * oldPool to newPool
 * @param cs {Changeset} Chageset/attribution string to be iterated over
 * @param oldPool {AttribPool} old attributes pool
 * @param newPool {AttribPool} new attributes pool
 * @return {string} the new Changeset
 */
exports.moveOpsToNewPool = function (cs, oldPool, newPool) {
  // works on exports or attribution string
  var dollarPos = cs.indexOf('$');
  if (dollarPos < 0) {
    dollarPos = cs.length;
  }
  var upToDollar = cs.substring(0, dollarPos);
  var fromDollar = cs.substring(dollarPos);
  // order of attribs stays the same
  return upToDollar.replace(/\*([0-9a-z]+)/g, function (_, a) {
    var oldNum = exports.parseNum(a);
    var pair = oldPool.getAttrib(oldNum);
    if(!pair) exports.error('Can\'t copy unknown attrib (reference attrib string to non-existant pool entry). Inconsistent attrib state!');
    var newNum = newPool.putAttrib(pair);
    return '*' + exports.numToString(newNum);
  }) + fromDollar;
};

/**
 * create an attribution inserting a text
 * @param text {string} text to be inserted
 */
exports.makeAttribution = function (text) {
  var assem = exports.smartOpAssembler();
  assem.appendOpWithText('+', text);
  return assem.toString();
};

/**
 * Iterates over attributes in exports, attribution string, or attribs property of an op
 * and runs function func on them
 * @param cs {Changeset} changeset
 * @param func {function} function to be called
 */ 
exports.eachAttribNumber = function (cs, func) {
  var dollarPos = cs.indexOf('$');
  if (dollarPos < 0) {
    dollarPos = cs.length;
  }
  var upToDollar = cs.substring(0, dollarPos);

  upToDollar.replace(/\*([0-9a-z]+)/g, function (_, a) {
    func(exports.parseNum(a));
    return '';
  });
};

/**
 * Filter attributes which should remain in a Changeset
 * callable on a exports, attribution string, or attribs property of an op,
 * though it may easily create adjacent ops that can be merged.
 * @param cs {Changeset} changeset to be filtered
 * @param filter {function} fnc which returns true if an 
 *        attribute X (int) should be kept in the Changeset
 */ 
exports.filterAttribNumbers = function (cs, filter) {
  return exports.mapAttribNumbers(cs, filter);
};

/**
 * does exactly the same as exports.filterAttribNumbers 
 */ 
exports.mapAttribNumbers = function (cs, func) {
  var dollarPos = cs.indexOf('$');
  if (dollarPos < 0) {
    dollarPos = cs.length;
  }
  var upToDollar = cs.substring(0, dollarPos);

  var newUpToDollar = upToDollar.replace(/\*([0-9a-z]+)/g, function (s, a) {
    var n = func(exports.parseNum(a));
    if (n === true) {
      return s;
    } else if ((typeof n) === "number") {
      return '*' + exports.numToString(n);
    } else {
      return '';
    }
  });

  return newUpToDollar + cs.substring(dollarPos);
};

/**
 * Create a Changeset going from Identity to a certain state
 * @params text {string} text of the final change
 * @attribs attribs {string} optional, operations which insert 
 *    the text and also puts the right attributes
 */
exports.makeAText = function (text, attribs) {
  return {
    text: text,
    attribs: (attribs || exports.makeAttribution(text))
  };
};

/**
 * Apply a Changeset to a AText 
 * @param cs {Changeset} Changeset to be applied
 * @param atext {AText} 
 * @param pool {AttribPool} Attribute Pool to add to
 */
exports.applyToAText = function (cs, atext, pool) {
  return {
    text: exports.applyToText(cs, atext.text),
    attribs: exports.applyToAttribution(cs, atext.attribs, pool)
  };
};

/**
 * Clones a AText structure
 * @param atext {AText} 
 */
exports.cloneAText = function (atext) {
  return {
    text: atext.text,
    attribs: atext.attribs
  };
};

/**
 * Copies a AText structure from atext1 to atext2
 * @param atext {AText} 
 */
exports.copyAText = function (atext1, atext2) {
  atext2.text = atext1.text;
  atext2.attribs = atext1.attribs;
};

/**
 * Append the set of operations from atext to an assembler
 * @param atext {AText} 
 * @param assem Assembler like smartOpAssembler
 */
exports.appendATextToAssembler = function (atext, assem) {
  // intentionally skips last newline char of atext
  var iter = exports.opIterator(atext.attribs);
  var op = exports.newOp();
  while (iter.hasNext()) {
    iter.next(op);
    if (!iter.hasNext()) {
      // last op, exclude final newline
      if (op.lines <= 1) {
        op.lines = 0;
        op.chars--;
        if (op.chars) {
          assem.append(op);
        }
      } else {
        var nextToLastNewlineEnd =
        atext.text.lastIndexOf('\n', atext.text.length - 2) + 1;
        var lastLineLength = atext.text.length - nextToLastNewlineEnd - 1;
        op.lines--;
        op.chars -= (lastLineLength + 1);
        assem.append(op);
        op.lines = 0;
        op.chars = lastLineLength;
        if (op.chars) {
          assem.append(op);
        }
      }
    } else {
      assem.append(op);
    }
  }
};

/**
 * Creates a clone of a Changeset and it's APool
 * @param cs {Changeset} 
 * @param pool {AtributePool}
 */
exports.prepareForWire = function (cs, pool) {
  var newPool = new AttributePool();
  var newCs = exports.moveOpsToNewPool(cs, pool, newPool);
  return {
    translated: newCs,
    pool: newPool
  };
};

/**
 * Checks if a changeset s the identity changeset
 */
exports.isIdentity = function (cs) {
  var unpacked = exports.unpack(cs);
  return unpacked.ops == "" && unpacked.oldLen == unpacked.newLen;
};

/**
 * returns all the values of attributes with a certain key 
 * in an Op attribs string 
 * @param attribs {string} Attribute string of a Op
 * @param key {string} string to be seached for
 * @param pool {AttribPool} attribute pool
 */
exports.opAttributeValue = function (op, key, pool) {
  return exports.attribsAttributeValue(op.attribs, key, pool);
};

/**
 * returns all the values of attributes with a certain key 
 * in an attribs string 
 * @param attribs {string} Attribute string
 * @param key {string} string to be seached for
 * @param pool {AttribPool} attribute pool
 */
exports.attribsAttributeValue = function (attribs, key, pool) {
  var value = '';
  if (attribs) {
    exports.eachAttribNumber(attribs, function (n) {
      if (pool.getAttribKey(n) == key) {
        value = pool.getAttribValue(n);
      }
    });
  }
  return value;
};

/**
 * Creates a Changeset builder for a string with initial 
 * length oldLen. Allows to add/remove parts of it
 * @param oldLen {int} Old length
 */
exports.builder = function (oldLen) {
  var assem = exports.smartOpAssembler();
  var o = exports.newOp();
  var charBank = exports.stringAssembler();

  var self = {
    // attribs are [[key1,value1],[key2,value2],...] or '*0*1...' (no pool needed in latter case)
    keep: function (N, L, attribs, pool) {
      o.opcode = '=';
      o.attribs = (attribs && exports.makeAttribsString('=', attribs, pool)) || '';
      o.chars = N;
      o.lines = (L || 0);
      assem.append(o);
      return self;
    },
    keepText: function (text, attribs, pool) {
      assem.appendOpWithText('=', text, attribs, pool);
      return self;
    },
    insert: function (text, attribs, pool) {
      assem.appendOpWithText('+', text, attribs, pool);
      charBank.append(text);
      return self;
    },
    remove: function (N, L) {
      o.opcode = '-';
      o.attribs = '';
      o.chars = N;
      o.lines = (L || 0);
      assem.append(o);
      return self;
    },
    toString: function () {
      assem.endDocument();
      var newLen = oldLen + assem.getLengthChange();
      return exports.pack(oldLen, newLen, assem.toString(), charBank.toString());
    }
  };

  return self;
};

exports.makeAttribsString = function (opcode, attribs, pool) {
  // makeAttribsString(opcode, '*3') or makeAttribsString(opcode, [['foo','bar']], myPool) work
  if (!attribs) {
    return '';
  } else if ((typeof attribs) == "string") {
    return attribs;
  } else if (pool && attribs && attribs.length) {
    if (attribs.length > 1) {
      attribs = attribs.slice();
      attribs.sort();
    }
    var result = [];
    for (var i = 0; i < attribs.length; i++) {
      var pair = attribs[i];
      if (opcode == '=' || (opcode == '+' && pair[1])) {
        result.push('*' + exports.numToString(pool.putAttrib(pair)));
      }
    }
    return result.join('');
  }
};

// like "substring" but on a single-line attribution string
exports.subattribution = function (astr, start, optEnd) {
  var iter = exports.opIterator(astr, 0);
  var assem = exports.smartOpAssembler();
  var attOp = exports.newOp();
  var csOp = exports.newOp();
  var opOut = exports.newOp();

  function doCsOp() {
    if (csOp.chars) {
      while (csOp.opcode && (attOp.opcode || iter.hasNext())) {
        if (!attOp.opcode) iter.next(attOp);

        if (csOp.opcode && attOp.opcode && csOp.chars >= attOp.chars && attOp.lines > 0 && csOp.lines <= 0) {
          csOp.lines++;
        }

        exports._slicerZipperFunc(attOp, csOp, opOut, null);
        if (opOut.opcode) {
          assem.append(opOut);
          opOut.opcode = '';
        }
      }
    }
  }

  csOp.opcode = '-';
  csOp.chars = start;

  doCsOp();

  if (optEnd === undefined) {
    if (attOp.opcode) {
      assem.append(attOp);
    }
    while (iter.hasNext()) {
      iter.next(attOp);
      assem.append(attOp);
    }
  } else {
    csOp.opcode = '=';
    csOp.chars = optEnd - start;
    doCsOp();
  }

  return assem.toString();
};

exports.inverse = function (cs, lines, alines, pool) {
  // lines and alines are what the exports is meant to apply to.
  // They may be arrays or objects with .get(i) and .length methods.
  // They include final newlines on lines.

  function lines_get(idx) {
    if (lines.get) {
      return lines.get(idx);
    } else {
      return lines[idx];
    }
  }

  function alines_get(idx) {
    if (alines.get) {
      return alines.get(idx);
    } else {
      return alines[idx];
    }
  }

  var curLine = 0;
  var curChar = 0;
  var curLineOpIter = null;
  var curLineOpIterLine;
  var curLineNextOp = exports.newOp('+');

  var unpacked = exports.unpack(cs);
  var csIter = exports.opIterator(unpacked.ops);
  var builder = exports.builder(unpacked.newLen);

  function consumeAttribRuns(numChars, func /*(len, attribs, endsLine)*/ ) {

    if ((!curLineOpIter) || (curLineOpIterLine != curLine)) {
      // create curLineOpIter and advance it to curChar
      curLineOpIter = exports.opIterator(alines_get(curLine));
      curLineOpIterLine = curLine;
      var indexIntoLine = 0;
      var done = false;
      while (!done && curLineOpIter.hasNext()) {
        curLineOpIter.next(curLineNextOp);
        if (indexIntoLine + curLineNextOp.chars >= curChar) {
          curLineNextOp.chars -= (curChar - indexIntoLine);
          done = true;
        } else {
          indexIntoLine += curLineNextOp.chars;
        }
      }
    }

    while (numChars > 0) {
      if ((!curLineNextOp.chars) && (!curLineOpIter.hasNext())) {
        curLine++;
        curChar = 0;
        curLineOpIterLine = curLine;
        curLineNextOp.chars = 0;
        curLineOpIter = exports.opIterator(alines_get(curLine));
      }
      if (!curLineNextOp.chars) {
        curLineOpIter.next(curLineNextOp);
      }
      var charsToUse = Math.min(numChars, curLineNextOp.chars);
      func(charsToUse, curLineNextOp.attribs, charsToUse == curLineNextOp.chars && curLineNextOp.lines > 0);
      numChars -= charsToUse;
      curLineNextOp.chars -= charsToUse;
      curChar += charsToUse;
    }

    if ((!curLineNextOp.chars) && (!curLineOpIter.hasNext())) {
      curLine++;
      curChar = 0;
    }
  }

  function skip(N, L) {
    if (L) {
      curLine += L;
      curChar = 0;
    } else {
      if (curLineOpIter && curLineOpIterLine == curLine) {
        consumeAttribRuns(N, function () {});
      } else {
        curChar += N;
      }
    }
  }

  function nextText(numChars) {
    var len = 0;
    var assem = exports.stringAssembler();
    var firstString = lines_get(curLine).substring(curChar);
    len += firstString.length;
    assem.append(firstString);

    var lineNum = curLine + 1;
    while (len < numChars) {
      var nextString = lines_get(lineNum);
      len += nextString.length;
      assem.append(nextString);
      lineNum++;
    }

    return assem.toString().substring(0, numChars);
  }

  function cachedStrFunc(func) {
    var cache = {};
    return function (s) {
      if (!cache[s]) {
        cache[s] = func(s);
      }
      return cache[s];
    };
  }

  var attribKeys = [];
  var attribValues = [];
  while (csIter.hasNext()) {
    var csOp = csIter.next();
    if (csOp.opcode == '=') {
      if (csOp.attribs) {
        attribKeys.length = 0;
        attribValues.length = 0;
        exports.eachAttribNumber(csOp.attribs, function (n) {
          attribKeys.push(pool.getAttribKey(n));
          attribValues.push(pool.getAttribValue(n));
        });
        var undoBackToAttribs = cachedStrFunc(function (attribs) {
          var backAttribs = [];
          for (var i = 0; i < attribKeys.length; i++) {
            var appliedKey = attribKeys[i];
            var appliedValue = attribValues[i];
            var oldValue = exports.attribsAttributeValue(attribs, appliedKey, pool);
            if (appliedValue != oldValue) {
              backAttribs.push([appliedKey, oldValue]);
            }
          }
          return exports.makeAttribsString('=', backAttribs, pool);
        });
        consumeAttribRuns(csOp.chars, function (len, attribs, endsLine) {
          builder.keep(len, endsLine ? 1 : 0, undoBackToAttribs(attribs));
        });
      } else {
        skip(csOp.chars, csOp.lines);
        builder.keep(csOp.chars, csOp.lines);
      }
    } else if (csOp.opcode == '+') {
      builder.remove(csOp.chars, csOp.lines);
    } else if (csOp.opcode == '-') {
      var textBank = nextText(csOp.chars);
      var textBankIndex = 0;
      consumeAttribRuns(csOp.chars, function (len, attribs, endsLine) {
        builder.insert(textBank.substr(textBankIndex, len), attribs);
        textBankIndex += len;
      });
    }
  }

  return exports.checkRep(builder.toString());
};

// %CLIENT FILE ENDS HERE%
exports.follow = function (cs1, cs2, reverseInsertOrder, pool) {
  var unpacked1 = exports.unpack(cs1);
  var unpacked2 = exports.unpack(cs2);
  var len1 = unpacked1.oldLen;
  var len2 = unpacked2.oldLen;
  exports.assert(len1 == len2, "mismatched follow - cannot transform cs1 on top of cs2");
  var chars1 = exports.stringIterator(unpacked1.charBank);
  var chars2 = exports.stringIterator(unpacked2.charBank);

  var oldLen = unpacked1.newLen;
  var oldPos = 0;
  var newLen = 0;

  var hasInsertFirst = exports.attributeTester(['insertorder', 'first'], pool);

  var newOps = exports.applyZip(unpacked1.ops, 0, unpacked2.ops, 0, function (op1, op2, opOut) {
    if (op1.opcode == '+' || op2.opcode == '+') {
      var whichToDo;
      if (op2.opcode != '+') {
        whichToDo = 1;
      } else if (op1.opcode != '+') {
        whichToDo = 2;
      } else {
        // both +
        var firstChar1 = chars1.peek(1);
        var firstChar2 = chars2.peek(1);
        var insertFirst1 = hasInsertFirst(op1.attribs);
        var insertFirst2 = hasInsertFirst(op2.attribs);
        if (insertFirst1 && !insertFirst2) {
          whichToDo = 1;
        } else if (insertFirst2 && !insertFirst1) {
          whichToDo = 2;
        }
        // insert string that doesn't start with a newline first so as not to break up lines
        else if (firstChar1 == '\n' && firstChar2 != '\n') {
          whichToDo = 2;
        } else if (firstChar1 != '\n' && firstChar2 == '\n') {
          whichToDo = 1;
        }
        // break symmetry:
        else if (reverseInsertOrder) {
          whichToDo = 2;
        } else {
          whichToDo = 1;
        }
      }
      if (whichToDo == 1) {
        chars1.skip(op1.chars);
        opOut.opcode = '=';
        opOut.lines = op1.lines;
        opOut.chars = op1.chars;
        opOut.attribs = '';
        op1.opcode = '';
      } else {
        // whichToDo == 2
        chars2.skip(op2.chars);
        exports.copyOp(op2, opOut);
        op2.opcode = '';
      }
    } else if (op1.opcode == '-') {
      if (!op2.opcode) {
        op1.opcode = '';
      } else {
        if (op1.chars <= op2.chars) {
          op2.chars -= op1.chars;
          op2.lines -= op1.lines;
          op1.opcode = '';
          if (!op2.chars) {
            op2.opcode = '';
          }
        } else {
          op1.chars -= op2.chars;
          op1.lines -= op2.lines;
          op2.opcode = '';
        }
      }
    } else if (op2.opcode == '-') {
      exports.copyOp(op2, opOut);
      if (!op1.opcode) {
        op2.opcode = '';
      } else if (op2.chars <= op1.chars) {
        // delete part or all of a keep
        op1.chars -= op2.chars;
        op1.lines -= op2.lines;
        op2.opcode = '';
        if (!op1.chars) {
          op1.opcode = '';
        }
      } else {
        // delete all of a keep, and keep going
        opOut.lines = op1.lines;
        opOut.chars = op1.chars;
        op2.lines -= op1.lines;
        op2.chars -= op1.chars;
        op1.opcode = '';
      }
    } else if (!op1.opcode) {
      exports.copyOp(op2, opOut);
      op2.opcode = '';
    } else if (!op2.opcode) {
      // @NOTE: Critical bugfix for EPL issue #1625. We do not copy op1 here
      // in order to prevent attributes from leaking into result changesets.
      // exports.copyOp(op1, opOut);
      op1.opcode = '';
    } else {
      // both keeps
      opOut.opcode = '=';
      opOut.attribs = exports.followAttributes(op1.attribs, op2.attribs, pool);
      if (op1.chars <= op2.chars) {
        opOut.chars = op1.chars;
        opOut.lines = op1.lines;
        op2.chars -= op1.chars;
        op2.lines -= op1.lines;
        op1.opcode = '';
        if (!op2.chars) {
          op2.opcode = '';
        }
      } else {
        opOut.chars = op2.chars;
        opOut.lines = op2.lines;
        op1.chars -= op2.chars;
        op1.lines -= op2.lines;
        op2.opcode = '';
      }
    }
    switch (opOut.opcode) {
    case '=':
      oldPos += opOut.chars;
      newLen += opOut.chars;
      break;
    case '-':
      oldPos += opOut.chars;
      break;
    case '+':
      newLen += opOut.chars;
      break;
    }
  });
  newLen += oldLen - oldPos;

  return exports.pack(oldLen, newLen, newOps, unpacked2.charBank);
};

exports.followAttributes = function (att1, att2, pool) {
  // The merge of two sets of attribute changes to the same text
  // takes the lexically-earlier value if there are two values
  // for the same key.  Otherwise, all key/value changes from
  // both attribute sets are taken.  This operation is the "follow",
  // so a set of changes is produced that can be applied to att1
  // to produce the merged set.
  if ((!att2) || (!pool)) return '';
  if (!att1) return att2;
  var atts = [];
  att2.replace(/\*([0-9a-z]+)/g, function (_, a) {
    atts.push(pool.getAttrib(exports.parseNum(a)));
    return '';
  });
  att1.replace(/\*([0-9a-z]+)/g, function (_, a) {
    var pair1 = pool.getAttrib(exports.parseNum(a));
    for (var i = 0; i < atts.length; i++) {
      var pair2 = atts[i];
      if (pair1[0] == pair2[0]) {
        if (pair1[1] <= pair2[1]) {
          // winner of merge is pair1, delete this attribute
          atts.splice(i, 1);
        }
        break;
      }
    }
    return '';
  });
  // we've only removed attributes, so they're already sorted
  var buf = exports.stringAssembler();
  for (var i = 0; i < atts.length; i++) {
    buf.append('*');
    buf.append(exports.numToString(pool.putAttrib(atts[i])));
  }
  return buf.toString();
};

exports.composeWithDeletions = function (cs1, cs2, pool) {
  var unpacked1 = exports.unpack(cs1);
  var unpacked2 = exports.unpack(cs2);
  var len1 = unpacked1.oldLen;
  var len2 = unpacked1.newLen;
  exports.assert(len2 == unpacked2.oldLen, "mismatched composition of two changesets");
  var len3 = unpacked2.newLen;
  var bankIter1 = exports.stringIterator(unpacked1.charBank);
  var bankIter2 = exports.stringIterator(unpacked2.charBank);
  var bankAssem = exports.stringAssembler();

  var newOps = exports.applyZip(unpacked1.ops, 0, unpacked2.ops, 0, function (op1, op2, opOut) {
    var op1code = op1.opcode;
    var op2code = op2.opcode;
    if (op1code == '+' && op2code == '-') {
      bankIter1.skip(Math.min(op1.chars, op2.chars));
    }
    exports._slicerZipperFuncWithDeletions(op1, op2, opOut, pool);
    if (opOut.opcode == '+') {
      if (op2code == '+') {
        bankAssem.append(bankIter2.take(opOut.chars));
      } else {
        bankAssem.append(bankIter1.take(opOut.chars));
      }
    }
  });

  return exports.pack(len1, len3, newOps, bankAssem.toString());
};

// This function is 95% like _slicerZipperFunc, we just changed two lines to ensure it merges the attribs of deletions properly. 
// This is necassary for correct paddiff. But to ensure these changes doesn't affect anything else, we've created a seperate function only used for paddiffs
exports._slicerZipperFuncWithDeletions= function (attOp, csOp, opOut, pool) {
  // attOp is the op from the sequence that is being operated on, either an
  // attribution string or the earlier of two exportss being composed.
  // pool can be null if definitely not needed.
  //print(csOp.toSource()+" "+attOp.toSource()+" "+opOut.toSource());
  if (attOp.opcode == '-') {
    exports.copyOp(attOp, opOut);
    attOp.opcode = '';
  } else if (!attOp.opcode) {
    exports.copyOp(csOp, opOut);
    csOp.opcode = '';
  } else {
    switch (csOp.opcode) {
    case '-':
      {
        if (csOp.chars <= attOp.chars) {
          // delete or delete part
          if (attOp.opcode == '=') {
            opOut.opcode = '-';
            opOut.chars = csOp.chars;
            opOut.lines = csOp.lines;
            opOut.attribs = csOp.attribs; //changed by yammer
          }
          attOp.chars -= csOp.chars;
          attOp.lines -= csOp.lines;
          csOp.opcode = '';
          if (!attOp.chars) {
            attOp.opcode = '';
          }
        } else {
          // delete and keep going
          if (attOp.opcode == '=') {
            opOut.opcode = '-';
            opOut.chars = attOp.chars;
            opOut.lines = attOp.lines;
            opOut.attribs = csOp.attribs; //changed by yammer
          }
          csOp.chars -= attOp.chars;
          csOp.lines -= attOp.lines;
          attOp.opcode = '';
        }
        break;
      }
    case '+':
      {
        // insert
        exports.copyOp(csOp, opOut);
        csOp.opcode = '';
        break;
      }
    case '=':
      {
        if (csOp.chars <= attOp.chars) {
          // keep or keep part
          opOut.opcode = attOp.opcode;
          opOut.chars = csOp.chars;
          opOut.lines = csOp.lines;
          opOut.attribs = exports.composeAttributes(attOp.attribs, csOp.attribs, attOp.opcode == '=', pool);
          csOp.opcode = '';
          attOp.chars -= csOp.chars;
          attOp.lines -= csOp.lines;
          if (!attOp.chars) {
            attOp.opcode = '';
          }
        } else {
          // keep and keep going
          opOut.opcode = attOp.opcode;
          opOut.chars = attOp.chars;
          opOut.lines = attOp.lines;
          opOut.attribs = exports.composeAttributes(attOp.attribs, csOp.attribs, attOp.opcode == '=', pool);
          attOp.opcode = '';
          csOp.chars -= attOp.chars;
          csOp.lines -= attOp.lines;
        }
        break;
      }
    case '':
      {
        exports.copyOp(attOp, opOut);
        attOp.opcode = '';
        break;
      }
    }
  }
};

}
, "ep_etherpad-lite/static/js/ChangesetUtils.js": function (require, exports, module) {
/**
 * This module contains several helper Functions to build Changesets
 * based on a SkipList
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
exports.buildRemoveRange = function(rep, builder, start, end)
{
  var startLineOffset = rep.lines.offsetOfIndex(start[0]);
  var endLineOffset = rep.lines.offsetOfIndex(end[0]);

  if (end[0] > start[0])
  {
    builder.remove(endLineOffset - startLineOffset - start[1], end[0] - start[0]);
    builder.remove(end[1]);
  }
  else
  {
    builder.remove(end[1] - start[1]);
  }
}

exports.buildKeepRange = function(rep, builder, start, end, attribs, pool)
{
  var startLineOffset = rep.lines.offsetOfIndex(start[0]);
  var endLineOffset = rep.lines.offsetOfIndex(end[0]);

  if (end[0] > start[0])
  {
    builder.keep(endLineOffset - startLineOffset - start[1], end[0] - start[0], attribs, pool);
    builder.keep(end[1], 0, attribs, pool);
  }
  else
  {
    builder.keep(end[1] - start[1], 0, attribs, pool);
  }
}

exports.buildKeepToStartOfRange = function(rep, builder, start)
{
  var startLineOffset = rep.lines.offsetOfIndex(start[0]);

  builder.keep(startLineOffset, start[0]);
  builder.keep(start[1]);
}


}
, "ep_etherpad-lite/static/js/skiplist.js": function (require, exports, module) {
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

var Ace2Common = require('./ace2_common'),
  _ = require('./underscore');

var noop = Ace2Common.noop;

function SkipList()
{
  var PROFILER = window.PROFILER;
  if (!PROFILER)
  {
    PROFILER = function()
    {
      return {
        start: noop,
        mark: noop,
        literal: noop,
        end: noop,
        cancel: noop
      };
    };
  }

  // if there are N elements in the skiplist, "start" is element -1 and "end" is element N
  var start = {
    key: null,
    levels: 1,
    upPtrs: [null],
    downPtrs: [null],
    downSkips: [1],
    downSkipWidths: [0]
  };
  var end = {
    key: null,
    levels: 1,
    upPtrs: [null],
    downPtrs: [null],
    downSkips: [null],
    downSkipWidths: [null]
  };
  var numNodes = 0;
  var totalWidth = 0;
  var keyToNodeMap = {};
  start.downPtrs[0] = end;
  end.upPtrs[0] = start;
  // a "point" object at location x allows modifications immediately after the first
  // x elements of the skiplist, such as multiple inserts or deletes.
  // After an insert or delete using point P, the point is still valid and points
  // to the same index in the skiplist.  Other operations with other points invalidate
  // this point.


  function _getPoint(targetLoc)
  {
    var numLevels = start.levels;
    var lvl = numLevels - 1;
    var i = -1,
        ws = 0;
    var nodes = new Array(numLevels);
    var idxs = new Array(numLevels);
    var widthSkips = new Array(numLevels);
    nodes[lvl] = start;
    idxs[lvl] = -1;
    widthSkips[lvl] = 0;
    while (lvl >= 0)
    {
      var n = nodes[lvl];
      while (n.downPtrs[lvl] && (i + n.downSkips[lvl] < targetLoc))
      {
        i += n.downSkips[lvl];
        ws += n.downSkipWidths[lvl];
        n = n.downPtrs[lvl];
      }
      nodes[lvl] = n;
      idxs[lvl] = i;
      widthSkips[lvl] = ws;
      lvl--;
      if (lvl >= 0)
      {
        nodes[lvl] = n;
      }
    }
    return {
      nodes: nodes,
      idxs: idxs,
      loc: targetLoc,
      widthSkips: widthSkips,
      toString: function()
      {
        return "getPoint(" + targetLoc + ")";
      }
    };
  }

  function _getNodeAtOffset(targetOffset)
  {
    var i = 0;
    var n = start;
    var lvl = start.levels - 1;
    while (lvl >= 0 && n.downPtrs[lvl])
    {
      while (n.downPtrs[lvl] && (i + n.downSkipWidths[lvl] <= targetOffset))
      {
        i += n.downSkipWidths[lvl];
        n = n.downPtrs[lvl];
      }
      lvl--;
    }
    if (n === start) return (start.downPtrs[0] || null);
    else if (n === end) return (targetOffset == totalWidth ? (end.upPtrs[0] || null) : null);
    return n;
  }

  function _entryWidth(e)
  {
    return (e && e.width) || 0;
  }

  function _insertKeyAtPoint(point, newKey, entry)
  {
    var p = PROFILER("insertKey", false);
    var newNode = {
      key: newKey,
      levels: 0,
      upPtrs: [],
      downPtrs: [],
      downSkips: [],
      downSkipWidths: []
    };
    p.mark("donealloc");
    var pNodes = point.nodes;
    var pIdxs = point.idxs;
    var pLoc = point.loc;
    var widthLoc = point.widthSkips[0] + point.nodes[0].downSkipWidths[0];
    var newWidth = _entryWidth(entry);
    p.mark("loop1");
    
    // The new node will have at least level 1
    // With a proability of 0.01^(n-1) the nodes level will be >= n
    while (newNode.levels == 0 || Math.random() < 0.01)
    {
      var lvl = newNode.levels;
      newNode.levels++;
      if (lvl == pNodes.length)
      {
        // assume we have just passed the end of point.nodes, and reached one level greater
        // than the skiplist currently supports
        pNodes[lvl] = start;
        pIdxs[lvl] = -1;
        start.levels++;
        end.levels++;
        start.downPtrs[lvl] = end;
        end.upPtrs[lvl] = start;
        start.downSkips[lvl] = numNodes + 1;
        start.downSkipWidths[lvl] = totalWidth;
        point.widthSkips[lvl] = 0;
      }
      var me = newNode;
      var up = pNodes[lvl];
      var down = up.downPtrs[lvl];
      var skip1 = pLoc - pIdxs[lvl];
      var skip2 = up.downSkips[lvl] + 1 - skip1;
      up.downSkips[lvl] = skip1;
      up.downPtrs[lvl] = me;
      me.downSkips[lvl] = skip2;
      me.upPtrs[lvl] = up;
      me.downPtrs[lvl] = down;
      down.upPtrs[lvl] = me;
      var widthSkip1 = widthLoc - point.widthSkips[lvl];
      var widthSkip2 = up.downSkipWidths[lvl] + newWidth - widthSkip1;
      up.downSkipWidths[lvl] = widthSkip1;
      me.downSkipWidths[lvl] = widthSkip2;
    }
    p.mark("loop2");
    p.literal(pNodes.length, "PNL");
    for (var lvl = newNode.levels; lvl < pNodes.length; lvl++)
    {
      var up = pNodes[lvl];
      up.downSkips[lvl]++;
      up.downSkipWidths[lvl] += newWidth;
    }
    p.mark("map");
    keyToNodeMap['$KEY$' + newKey] = newNode;
    numNodes++;
    totalWidth += newWidth;
    p.end();
  }

  function _getNodeAtPoint(point)
  {
    return point.nodes[0].downPtrs[0];
  }

  function _incrementPoint(point)
  {
    point.loc++;
    for (var i = 0; i < point.nodes.length; i++)
    {
      if (point.idxs[i] + point.nodes[i].downSkips[i] < point.loc)
      {
        point.idxs[i] += point.nodes[i].downSkips[i];
        point.widthSkips[i] += point.nodes[i].downSkipWidths[i];
        point.nodes[i] = point.nodes[i].downPtrs[i];
      }
    }
  }

  function _deleteKeyAtPoint(point)
  {
    var elem = point.nodes[0].downPtrs[0];
    var elemWidth = _entryWidth(elem.entry);
    for (var i = 0; i < point.nodes.length; i++)
    {
      if (i < elem.levels)
      {
        var up = elem.upPtrs[i];
        var down = elem.downPtrs[i];
        var totalSkip = up.downSkips[i] + elem.downSkips[i] - 1;
        up.downPtrs[i] = down;
        down.upPtrs[i] = up;
        up.downSkips[i] = totalSkip;
        var totalWidthSkip = up.downSkipWidths[i] + elem.downSkipWidths[i] - elemWidth;
        up.downSkipWidths[i] = totalWidthSkip;
      }
      else
      {
        var up = point.nodes[i];
        var down = up.downPtrs[i];
        up.downSkips[i]--;
        up.downSkipWidths[i] -= elemWidth;
      }
    }
    delete keyToNodeMap['$KEY$' + elem.key];
    numNodes--;
    totalWidth -= elemWidth;
  }

  function _propagateWidthChange(node)
  {
    var oldWidth = node.downSkipWidths[0];
    var newWidth = _entryWidth(node.entry);
    var widthChange = newWidth - oldWidth;
    var n = node;
    var lvl = 0;
    while (lvl < n.levels)
    {
      n.downSkipWidths[lvl] += widthChange;
      lvl++;
      while (lvl >= n.levels && n.upPtrs[lvl - 1])
      {
        n = n.upPtrs[lvl - 1];
      }
    }
    totalWidth += widthChange;
  }

  function _getNodeIndex(node, byWidth)
  {
    var dist = (byWidth ? 0 : -1);
    var n = node;
    while (n !== start)
    {
      var lvl = n.levels - 1;
      n = n.upPtrs[lvl];
      if (byWidth) dist += n.downSkipWidths[lvl];
      else dist += n.downSkips[lvl];
    }
    return dist;
  }

  function _getNodeByKey(key)
  {
    return keyToNodeMap['$KEY$' + key];
  }

  // Returns index of first entry such that entryFunc(entry) is truthy,
  // or length() if no such entry.  Assumes all falsy entries come before
  // all truthy entries.


  function _search(entryFunc)
  {
    var low = start;
    var lvl = start.levels - 1;
    var lowIndex = -1;

    function f(node)
    {
      if (node === start) return false;
      else if (node === end) return true;
      else return entryFunc(node.entry);
    }
    while (lvl >= 0)
    {
      var nextLow = low.downPtrs[lvl];
      while (!f(nextLow))
      {
        lowIndex += low.downSkips[lvl];
        low = nextLow;
        nextLow = low.downPtrs[lvl];
      }
      lvl--;
    }
    return lowIndex + 1;
  }

/*
The skip-list contains "entries", JavaScript objects that each must have a unique "key" property
that is a string.
  */
  var self = this;
  _.extend(this, {
    length: function()
    {
      return numNodes;
    },
    atIndex: function(i)
    {
      if (i < 0) console.warn("atIndex(" + i + ")");
      if (i >= numNodes) console.warn("atIndex(" + i + ">=" + numNodes + ")");
      return _getNodeAtPoint(_getPoint(i)).entry;
    },
    // differs from Array.splice() in that new elements are in an array, not varargs
    splice: function(start, deleteCount, newEntryArray)
    {
      if (start < 0) console.warn("splice(" + start + ", ...)");
      if (start + deleteCount > numNodes)
      {
        console.warn("splice(" + start + ", " + deleteCount + ", ...), N=" + numNodes);
        console.warn("%s %s %s", typeof start, typeof deleteCount, typeof numNodes);
        console.trace();
      }

      if (!newEntryArray) newEntryArray = [];
      var pt = _getPoint(start);
      for (var i = 0; i < deleteCount; i++)
      {
        _deleteKeyAtPoint(pt);
      }
      for (var i = (newEntryArray.length - 1); i >= 0; i--)
      {
        var entry = newEntryArray[i];
        _insertKeyAtPoint(pt, entry.key, entry);
        var node = _getNodeByKey(entry.key);
        node.entry = entry;
      }
    },
    next: function(entry)
    {
      return _getNodeByKey(entry.key).downPtrs[0].entry || null;
    },
    prev: function(entry)
    {
      return _getNodeByKey(entry.key).upPtrs[0].entry || null;
    },
    push: function(entry)
    {
      self.splice(numNodes, 0, [entry]);
    },
    slice: function(start, end)
    {
      // act like Array.slice()
      if (start === undefined) start = 0;
      else if (start < 0) start += numNodes;
      if (end === undefined) end = numNodes;
      else if (end < 0) end += numNodes;

      if (start < 0) start = 0;
      if (start > numNodes) start = numNodes;
      if (end < 0) end = 0;
      if (end > numNodes) end = numNodes;

      dmesg(String([start, end, numNodes]));
      if (end <= start) return [];
      var n = self.atIndex(start);
      var array = [n];
      for (var i = 1; i < (end - start); i++)
      {
        n = self.next(n);
        array.push(n);
      }
      return array;
    },
    atKey: function(key)
    {
      return _getNodeByKey(key).entry;
    },
    indexOfKey: function(key)
    {
      return _getNodeIndex(_getNodeByKey(key));
    },
    indexOfEntry: function(entry)
    {
      return self.indexOfKey(entry.key);
    },
    containsKey: function(key)
    {
      return !!(_getNodeByKey(key));
    },
    // gets the last entry starting at or before the offset
    atOffset: function(offset)
    {
      return _getNodeAtOffset(offset).entry;
    },
    keyAtOffset: function(offset)
    {
      return self.atOffset(offset).key;
    },
    offsetOfKey: function(key)
    {
      return _getNodeIndex(_getNodeByKey(key), true);
    },
    offsetOfEntry: function(entry)
    {
      return self.offsetOfKey(entry.key);
    },
    setEntryWidth: function(entry, width)
    {
      entry.width = width;
      _propagateWidthChange(_getNodeByKey(entry.key));
    },
    totalWidth: function()
    {
      return totalWidth;
    },
    offsetOfIndex: function(i)
    {
      if (i < 0) return 0;
      if (i >= numNodes) return totalWidth;
      return self.offsetOfEntry(self.atIndex(i));
    },
    indexOfOffset: function(offset)
    {
      if (offset <= 0) return 0;
      if (offset >= totalWidth) return numNodes;
      return self.indexOfEntry(self.atOffset(offset));
    },
    search: function(entryFunc)
    {
      return _search(entryFunc);
    },
    //debugToString: _debugToString,
    debugGetPoint: _getPoint,
    debugDepth: function()
    {
      return start.levels;
    }
  });
}

module.exports = SkipList;

}
, "ep_etherpad-lite/static/js/cssmanager.js": function (require, exports, module) {
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

function makeCSSManager(emptyStylesheetTitle, doc)
{
  if (doc === true)
  {
    doc = 'parent';
  } else if (!doc) {
    doc = 'inner';
  }

  function getSheetByTitle(title)
  {
    if (doc === 'parent')
    {
      win = window.parent.parent;
    }
    else if (doc === 'inner') {
      win = window;
    }
    else if (doc === 'outer') {
      win = window.parent;
    }
    else {
        throw "Unknown dynamic style container";
    }
    var allSheets = win.document.styleSheets;

    for (var i = 0; i < allSheets.length; i++)
    {
      var s = allSheets[i];
      if (s.title == title)
      {
        return s;
      }
    }
    return null;
  }

  var browserSheet = getSheetByTitle(emptyStylesheetTitle);

  function browserRules()
  {
    return (browserSheet.cssRules || browserSheet.rules);
  }

  function browserDeleteRule(i)
  {
    if (browserSheet.deleteRule) browserSheet.deleteRule(i);
    else browserSheet.removeRule(i);
  }

  function browserInsertRule(i, selector)
  {
    if (browserSheet.insertRule) browserSheet.insertRule(selector + ' {}', i);
    else browserSheet.addRule(selector, null, i);
  }
  var selectorList = [];

  function indexOfSelector(selector)
  {
    for (var i = 0; i < selectorList.length; i++)
    {
      if (selectorList[i] == selector)
      {
        return i;
      }
    }
    return -1;
  }

  function selectorStyle(selector)
  {
    var i = indexOfSelector(selector);
    if (i < 0)
    {
      // add selector
      browserInsertRule(0, selector);
      selectorList.splice(0, 0, selector);
      i = 0;
    }
    return browserRules().item(i).style;
  }

  function removeSelectorStyle(selector)
  {
    var i = indexOfSelector(selector);
    if (i >= 0)
    {
      browserDeleteRule(i);
      selectorList.splice(i, 1);
    }
  }

  return {
    selectorStyle: selectorStyle,
    removeSelectorStyle: removeSelectorStyle,
    info: function()
    {
      return selectorList.length + ":" + browserRules().length;
    }
  };
}

exports.makeCSSManager = makeCSSManager;

}
, "ep_etherpad-lite/static/js/colorutils.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

// DO NOT EDIT THIS FILE, edit infrastructure/ace/www/colorutils.js
// THIS FILE IS ALSO SERVED AS CLIENT-SIDE JS
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

var colorutils = {};

// Check that a given value is a css hex color value, e.g.
// "#ffffff" or "#fff"
colorutils.isCssHex = function(cssColor)
{
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cssColor);
}

// "#ffffff" or "#fff" or "ffffff" or "fff" to [1.0, 1.0, 1.0]
colorutils.css2triple = function(cssColor)
{
  var sixHex = colorutils.css2sixhex(cssColor);

  function hexToFloat(hh)
  {
    return Number("0x" + hh) / 255;
  }
  return [hexToFloat(sixHex.substr(0, 2)), hexToFloat(sixHex.substr(2, 2)), hexToFloat(sixHex.substr(4, 2))];
}

// "#ffffff" or "#fff" or "ffffff" or "fff" to "ffffff"
colorutils.css2sixhex = function(cssColor)
{
  var h = /[0-9a-fA-F]+/.exec(cssColor)[0];
  if (h.length != 6)
  {
    var a = h.charAt(0);
    var b = h.charAt(1);
    var c = h.charAt(2);
    h = a + a + b + b + c + c;
  }
  return h;
}

// [1.0, 1.0, 1.0] -> "#ffffff"
colorutils.triple2css = function(triple)
{
  function floatToHex(n)
  {
    var n2 = colorutils.clamp(Math.round(n * 255), 0, 255);
    return ("0" + n2.toString(16)).slice(-2);
  }
  return "#" + floatToHex(triple[0]) + floatToHex(triple[1]) + floatToHex(triple[2]);
}


colorutils.clamp = function(v, bot, top)
{
  return v < bot ? bot : (v > top ? top : v);
};
colorutils.min3 = function(a, b, c)
{
  return (a < b) ? (a < c ? a : c) : (b < c ? b : c);
};
colorutils.max3 = function(a, b, c)
{
  return (a > b) ? (a > c ? a : c) : (b > c ? b : c);
};
colorutils.colorMin = function(c)
{
  return colorutils.min3(c[0], c[1], c[2]);
};
colorutils.colorMax = function(c)
{
  return colorutils.max3(c[0], c[1], c[2]);
};
colorutils.scale = function(v, bot, top)
{
  return colorutils.clamp(bot + v * (top - bot), 0, 1);
};
colorutils.unscale = function(v, bot, top)
{
  return colorutils.clamp((v - bot) / (top - bot), 0, 1);
};

colorutils.scaleColor = function(c, bot, top)
{
  return [colorutils.scale(c[0], bot, top), colorutils.scale(c[1], bot, top), colorutils.scale(c[2], bot, top)];
}

colorutils.unscaleColor = function(c, bot, top)
{
  return [colorutils.unscale(c[0], bot, top), colorutils.unscale(c[1], bot, top), colorutils.unscale(c[2], bot, top)];
}

colorutils.luminosity = function(c)
{
  // rule of thumb for RGB brightness; 1.0 is white
  return c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11;
}

colorutils.saturate = function(c)
{
  var min = colorutils.colorMin(c);
  var max = colorutils.colorMax(c);
  if (max - min <= 0) return [1.0, 1.0, 1.0];
  return colorutils.unscaleColor(c, min, max);
}

colorutils.blend = function(c1, c2, t)
{
  return [colorutils.scale(t, c1[0], c2[0]), colorutils.scale(t, c1[1], c2[1]), colorutils.scale(t, c1[2], c2[2])];
}

colorutils.invert = function(c)
{
  return [1 - c[0], 1 - c[1], 1- c[2]];
}

colorutils.complementary = function(c)
{
  var inv = colorutils.invert(c);
  return [
    (inv[0] >= c[0]) ? Math.min(inv[0] * 1.30, 1) : (c[0] * 0.30),
    (inv[1] >= c[1]) ? Math.min(inv[1] * 1.59, 1) : (c[1] * 0.59),
    (inv[2] >= c[2]) ? Math.min(inv[2] * 1.11, 1) : (c[2] * 0.11)
  ];
}

exports.colorutils = colorutils;

}
, "ep_etherpad-lite/static/js/undomodule.js": function (require, exports, module) {
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

var Changeset = require('./Changeset');
var _ = require('./underscore');

var undoModule = (function()
{
  var stack = (function()
  {
    var stackElements = [];
    // two types of stackElements:
    // 1) { elementType: UNDOABLE_EVENT, eventType: "anything", [backset: <changeset>,]
    //      [selStart: <char number>, selEnd: <char number>, selFocusAtStart: <boolean>] }
    // 2) { elementType: EXTERNAL_CHANGE, changeset: <changeset> }
    // invariant: no two consecutive EXTERNAL_CHANGEs
    var numUndoableEvents = 0;

    var UNDOABLE_EVENT = "undoableEvent";
    var EXTERNAL_CHANGE = "externalChange";

    function clearStack()
    {
      stackElements.length = 0;
      stackElements.push(
      {
        elementType: UNDOABLE_EVENT,
        eventType: "bottom"
      });
      numUndoableEvents = 1;
    }
    clearStack();

    function pushEvent(event)
    {
      var e = _.extend(
      {}, event);
      e.elementType = UNDOABLE_EVENT;
      stackElements.push(e);
      numUndoableEvents++;
      //dmesg("pushEvent backset: "+event.backset);
    }

    function pushExternalChange(cs)
    {
      var idx = stackElements.length - 1;
      if (stackElements[idx].elementType == EXTERNAL_CHANGE)
      {
        stackElements[idx].changeset = Changeset.compose(stackElements[idx].changeset, cs, getAPool());
      }
      else
      {
        stackElements.push(
        {
          elementType: EXTERNAL_CHANGE,
          changeset: cs
        });
      }
    }

    function _exposeEvent(nthFromTop)
    {
      // precond: 0 <= nthFromTop < numUndoableEvents
      var targetIndex = stackElements.length - 1 - nthFromTop;
      var idx = stackElements.length - 1;
      while (idx > targetIndex || stackElements[idx].elementType == EXTERNAL_CHANGE)
      {
        if (stackElements[idx].elementType == EXTERNAL_CHANGE)
        {
          var ex = stackElements[idx];
          var un = stackElements[idx - 1];
          if (un.backset)
          {
            var excs = ex.changeset;
            var unbs = un.backset;
            un.backset = Changeset.follow(excs, un.backset, false, getAPool());
            ex.changeset = Changeset.follow(unbs, ex.changeset, true, getAPool());
            if ((typeof un.selStart) == "number")
            {
              var newSel = Changeset.characterRangeFollow(excs, un.selStart, un.selEnd);
              un.selStart = newSel[0];
              un.selEnd = newSel[1];
              if (un.selStart == un.selEnd)
              {
                un.selFocusAtStart = false;
              }
            }
          }
          stackElements[idx - 1] = ex;
          stackElements[idx] = un;
          if (idx >= 2 && stackElements[idx - 2].elementType == EXTERNAL_CHANGE)
          {
            ex.changeset = Changeset.compose(stackElements[idx - 2].changeset, ex.changeset, getAPool());
            stackElements.splice(idx - 2, 1);
            idx--;
          }
        }
        else
        {
          idx--;
        }
      }
    }

    function getNthFromTop(n)
    {
      // precond: 0 <= n < numEvents()
      _exposeEvent(n);
      return stackElements[stackElements.length - 1 - n];
    }

    function numEvents()
    {
      return numUndoableEvents;
    }

    function popEvent()
    {
      // precond: numEvents() > 0
      _exposeEvent(0);
      numUndoableEvents--;
      return stackElements.pop();
    }

    return {
      numEvents: numEvents,
      popEvent: popEvent,
      pushEvent: pushEvent,
      pushExternalChange: pushExternalChange,
      clearStack: clearStack,
      getNthFromTop: getNthFromTop
    };
  })();

  // invariant: stack always has at least one undoable event
  var undoPtr = 0; // zero-index from top of stack, 0 == top

  function clearHistory()
  {
    stack.clearStack();
    undoPtr = 0;
  }

  function _charOccurrences(str, c)
  {
    var i = 0;
    var count = 0;
    while (i >= 0 && i < str.length)
    {
      i = str.indexOf(c, i);
      if (i >= 0)
      {
        count++;
        i++;
      }
    }
    return count;
  }

  function _opcodeOccurrences(cs, opcode)
  {
    return _charOccurrences(Changeset.unpack(cs).ops, opcode);
  }

  function _mergeChangesets(cs1, cs2)
  {
    if (!cs1) return cs2;
    if (!cs2) return cs1;

    // Rough heuristic for whether changesets should be considered one action:
    // each does exactly one insertion, no dels, and the composition does also; or
    // each does exactly one deletion, no ins, and the composition does also.
    // A little weird in that it won't merge "make bold" with "insert char"
    // but will merge "make bold and insert char" with "insert char",
    // though that isn't expected to come up.
    var plusCount1 = _opcodeOccurrences(cs1, '+');
    var plusCount2 = _opcodeOccurrences(cs2, '+');
    var minusCount1 = _opcodeOccurrences(cs1, '-');
    var minusCount2 = _opcodeOccurrences(cs2, '-');
    if (plusCount1 == 1 && plusCount2 == 1 && minusCount1 == 0 && minusCount2 == 0)
    {
      var merge = Changeset.compose(cs1, cs2, getAPool());
      var plusCount3 = _opcodeOccurrences(merge, '+');
      var minusCount3 = _opcodeOccurrences(merge, '-');
      if (plusCount3 == 1 && minusCount3 == 0)
      {
        return merge;
      }
    }
    else if (plusCount1 == 0 && plusCount2 == 0 && minusCount1 == 1 && minusCount2 == 1)
    {
      var merge = Changeset.compose(cs1, cs2, getAPool());
      var plusCount3 = _opcodeOccurrences(merge, '+');
      var minusCount3 = _opcodeOccurrences(merge, '-');
      if (plusCount3 == 0 && minusCount3 == 1)
      {
        return merge;
      }
    }
    return null;
  }

  function reportEvent(event)
  {
    var topEvent = stack.getNthFromTop(0);

    function applySelectionToTop()
    {
      if ((typeof event.selStart) == "number")
      {
        topEvent.selStart = event.selStart;
        topEvent.selEnd = event.selEnd;
        topEvent.selFocusAtStart = event.selFocusAtStart;
      }
    }

    if ((!event.backset) || Changeset.isIdentity(event.backset))
    {
      applySelectionToTop();
    }
    else
    {
      var merged = false;
      if (topEvent.eventType == event.eventType)
      {
        var merge = _mergeChangesets(event.backset, topEvent.backset);
        if (merge)
        {
          topEvent.backset = merge;
          //dmesg("reportEvent merge: "+merge);
          applySelectionToTop();
          merged = true;
        }
      }
      if (!merged)
      {
        stack.pushEvent(event);
      }
      undoPtr = 0;
    }

  }

  function reportExternalChange(changeset)
  {
    if (changeset && !Changeset.isIdentity(changeset))
    {
      stack.pushExternalChange(changeset);
    }
  }

  function _getSelectionInfo(event)
  {
    if ((typeof event.selStart) != "number")
    {
      return null;
    }
    else
    {
      return {
        selStart: event.selStart,
        selEnd: event.selEnd,
        selFocusAtStart: event.selFocusAtStart
      };
    }
  }

  // For "undo" and "redo", the change event must be returned
  // by eventFunc and NOT reported through the normal mechanism.
  // "eventFunc" should take a changeset and an optional selection info object,
  // or can be called with no arguments to mean that no undo is possible.
  // "eventFunc" will be called exactly once.

  function performUndo(eventFunc)
  {
    if (undoPtr < stack.numEvents() - 1)
    {
      var backsetEvent = stack.getNthFromTop(undoPtr);
      var selectionEvent = stack.getNthFromTop(undoPtr + 1);
      var undoEvent = eventFunc(backsetEvent.backset, _getSelectionInfo(selectionEvent));
      stack.pushEvent(undoEvent);
      undoPtr += 2;
    }
    else eventFunc();
  }

  function performRedo(eventFunc)
  {
    if (undoPtr >= 2)
    {
      var backsetEvent = stack.getNthFromTop(0);
      var selectionEvent = stack.getNthFromTop(1);
      eventFunc(backsetEvent.backset, _getSelectionInfo(selectionEvent));
      stack.popEvent();
      undoPtr -= 2;
    }
    else eventFunc();
  }

  function getAPool()
  {
    return undoModule.apool;
  }

  return {
    clearHistory: clearHistory,
    reportEvent: reportEvent,
    reportExternalChange: reportExternalChange,
    performUndo: performUndo,
    performRedo: performRedo,
    enabled: true,
    apool: null
  }; // apool is filled in by caller
})();

exports.undoModule = undoModule;

}
, "unorm.js": null
, "ep_etherpad-lite/static/js/contentcollector.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

// THIS FILE IS ALSO AN APPJET MODULE: etherpad.collab.ace.contentcollector
// %APPJET%: import("etherpad.collab.ace.easysync2.Changeset");
// %APPJET%: import("etherpad.admin.plugins");
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

var _MAX_LIST_LEVEL = 16;

var UNorm = require('unorm');
var Changeset = require('./Changeset');
var hooks = require('./pluginfw/hooks');
var _ = require('./underscore');

function sanitizeUnicode(s)
{
  return UNorm.nfc(s);
}

function makeContentCollector(collectStyles, abrowser, apool, domInterface, className2Author)
{
  abrowser = abrowser || {};
  // I don't like the above.

  var dom = domInterface || {
    isNodeText: function(n)
    {
      return (n.nodeType == 3);
    },
    nodeTagName: function(n)
    {
      return n.tagName;
    },
    nodeValue: function(n)
    {
      return n.nodeValue;
    },
    nodeNumChildren: function(n)
    {
      if(n.childNodes == null) return 0;
      return n.childNodes.length;
    },
    nodeChild: function(n, i)
    {
      if(n.childNodes.item == null){
        return n.childNodes[i];
      }
      return n.childNodes.item(i);
    },
    nodeProp: function(n, p)
    {
      return n[p];
    },
    nodeAttr: function(n, a)
    {
      if(n.getAttribute != null) return n.getAttribute(a);
      if(n.attribs != null) return n.attribs[a];
      return null;
    },
    optNodeInnerHTML: function(n)
    {
      return n.innerHTML;
    }
  };

  var _blockElems = {
    "div": 1,
    "p": 1,
    "pre": 1,
    "li": 1
  };

  _.each(hooks.callAll('ccRegisterBlockElements'), function(element){
    _blockElems[element] = 1;
  });

  function isBlockElement(n)
  {
    return !!_blockElems[(dom.nodeTagName(n) || "").toLowerCase()];
  }

  function textify(str)
  {
    return sanitizeUnicode(
    str.replace(/\n/g, '').replace(/[\n\r ]/g, ' ').replace(/\xa0/g, ' ').replace(/\t/g, '        '));
  }

  function getAssoc(node, name)
  {
    return dom.nodeProp(node, "_magicdom_" + name);
  }

  var lines = (function()
  {
    var textArray = [];
    var attribsArray = [];
    var attribsBuilder = null;
    var op = Changeset.newOp('+');
    var self = {
      length: function()
      {
        return textArray.length;
      },
      atColumnZero: function()
      {
        return textArray[textArray.length - 1] === "";
      },
      startNew: function()
      {
        textArray.push("");
        self.flush(true);
        attribsBuilder = Changeset.smartOpAssembler();
      },
      textOfLine: function(i)
      {
        return textArray[i];
      },
      appendText: function(txt, attrString)
      {
        textArray[textArray.length - 1] += txt;
        //dmesg(txt+" / "+attrString);
        op.attribs = attrString;
        op.chars = txt.length;
        attribsBuilder.append(op);
      },
      textLines: function()
      {
        return textArray.slice();
      },
      attribLines: function()
      {
        return attribsArray;
      },
      // call flush only when you're done
      flush: function(withNewline)
      {
        if (attribsBuilder)
        {
          attribsArray.push(attribsBuilder.toString());
          attribsBuilder = null;
        }
      }
    };
    self.startNew();
    return self;
  }());
  var cc = {};

  function _ensureColumnZero(state)
  {
    if (!lines.atColumnZero())
    {
      cc.startNewLine(state);
    }
  }
  var selection, startPoint, endPoint;
  var selStart = [-1, -1],
      selEnd = [-1, -1];
  function _isEmpty(node, state)
  {
    // consider clean blank lines pasted in IE to be empty
    if (dom.nodeNumChildren(node) == 0) return true;
    if (dom.nodeNumChildren(node) == 1 && getAssoc(node, "shouldBeEmpty") && dom.optNodeInnerHTML(node) == "&nbsp;" && !getAssoc(node, "unpasted"))
    {
      if (state)
      {
        var child = dom.nodeChild(node, 0);
        _reachPoint(child, 0, state);
        _reachPoint(child, 1, state);
      }
      return true;
    }
    return false;
  }

  function _pointHere(charsAfter, state)
  {
    var ln = lines.length() - 1;
    var chr = lines.textOfLine(ln).length;
    if (chr == 0 && !_.isEmpty(state.lineAttributes))
    {
      chr += 1; // listMarker
    }
    chr += charsAfter;
    return [ln, chr];
  }

  function _reachBlockPoint(nd, idx, state)
  {
    if (!dom.isNodeText(nd)) _reachPoint(nd, idx, state);
  }

  function _reachPoint(nd, idx, state)
  {
    if (startPoint && nd == startPoint.node && startPoint.index == idx)
    {
      selStart = _pointHere(0, state);
    }
    if (endPoint && nd == endPoint.node && endPoint.index == idx)
    {
      selEnd = _pointHere(0, state);
    }
  }
  cc.incrementFlag = function(state, flagName)
  {
    state.flags[flagName] = (state.flags[flagName] || 0) + 1;
  }
  cc.decrementFlag = function(state, flagName)
  {
    state.flags[flagName]--;
  }
  cc.incrementAttrib = function(state, attribName)
  {
    if (!state.attribs[attribName])
    {
      state.attribs[attribName] = 1;
    }
    else
    {
      state.attribs[attribName]++;
    }
    _recalcAttribString(state);
  }
  cc.decrementAttrib = function(state, attribName)
  {
    state.attribs[attribName]--;
    _recalcAttribString(state);
  }

  function _enterList(state, listType)
  {
    var oldListType = state.lineAttributes['list'];
    if (listType != 'none')
    {
      state.listNesting = (state.listNesting || 0) + 1;
    }
    
    if(listType === 'none' || !listType ){
      delete state.lineAttributes['list']; 
    }
    else{
      state.lineAttributes['list'] = listType;
    }
    
    _recalcAttribString(state);
    return oldListType;
  }

  function _exitList(state, oldListType)
  {
    if (state.lineAttributes['list'])
    {
      state.listNesting--;
    }
    if (oldListType && oldListType != 'none') { state.lineAttributes['list'] = oldListType; }
    else { delete state.lineAttributes['list']; }
    _recalcAttribString(state);
  }

  function _enterAuthor(state, author)
  {
    var oldAuthor = state.author;
    state.authorLevel = (state.authorLevel || 0) + 1;
    state.author = author;
    _recalcAttribString(state);
    return oldAuthor;
  }

  function _exitAuthor(state, oldAuthor)
  {
    state.authorLevel--;
    state.author = oldAuthor;
    _recalcAttribString(state);
  }

  function _recalcAttribString(state)
  {
    var lst = [];
    for (var a in state.attribs)
    {
      if (state.attribs[a])
      {
        // The following splitting of the attribute name is a workaround
        // to enable the content collector to store key-value attributes
        // see https://github.com/ether/etherpad-lite/issues/2567 for more information
        // in long term the contentcollector should be refactored to get rid of this workaround
        var ATTRIBUTE_SPLIT_STRING = "::";
        
        // see if attributeString is splittable
        var attributeSplits = a.split(ATTRIBUTE_SPLIT_STRING);
        if (attributeSplits.length > 1) {
            // the attribute name follows the convention key::value
            // so save it as a key value attribute
            lst.push([attributeSplits[0], attributeSplits[1]]);
        } else {
            // the "normal" case, the attribute is just a switch
            // so set it true
            lst.push([a, 'true']);
        }
      }
    }
    if (state.authorLevel > 0)
    {
      var authorAttrib = ['author', state.author];
      if (apool.putAttrib(authorAttrib, true) >= 0)
      {
        // require that author already be in pool
        // (don't add authors from other documents, etc.)
        lst.push(authorAttrib);
      }
    }
    state.attribString = Changeset.makeAttribsString('+', lst, apool);
  }

  function _produceLineAttributesMarker(state)
  {
    // TODO: This has to go to AttributeManager.
    var attributes = [
      ['lmkr', '1'],
      ['insertorder', 'first']
    ].concat(
      _.map(state.lineAttributes,function(value,key){
        return [key, value];
      })
    );
    lines.appendText('*', Changeset.makeAttribsString('+', attributes , apool));
  }
  cc.startNewLine = function(state)
  {
    if (state)
    {
      var atBeginningOfLine = lines.textOfLine(lines.length() - 1).length == 0;
      if (atBeginningOfLine && !_.isEmpty(state.lineAttributes))
      {
        _produceLineAttributesMarker(state);
      }
    }
    lines.startNew();
  }
  cc.notifySelection = function(sel)
  {
    if (sel)
    {
      selection = sel;
      startPoint = selection.startPoint;
      endPoint = selection.endPoint;
    }
  };
  cc.doAttrib = function(state, na)
  {
    state.localAttribs = (state.localAttribs || []);
    state.localAttribs.push(na);
    cc.incrementAttrib(state, na);
  };
  cc.collectContent = function(node, state)
  {
    if (!state)
    {
      state = {
        flags: { /*name -> nesting counter*/
        },
        localAttribs: null,
        attribs: { /*name -> nesting counter*/
        },
        attribString: '',
        // lineAttributes maintain a map from attributes to attribute values set on a line
        lineAttributes: {
          /*
          example:
          'list': 'bullet1',
          */
        }
      };
    }
    var localAttribs = state.localAttribs;
    state.localAttribs = null;
    var isBlock = isBlockElement(node);
    var isEmpty = _isEmpty(node, state);
    if (isBlock) _ensureColumnZero(state);
    var startLine = lines.length() - 1;
    _reachBlockPoint(node, 0, state);
    if (dom.isNodeText(node))
    {
      var txt = dom.nodeValue(node);
      var tname = dom.nodeAttr(node.parentNode,"name");

      var txtFromHook = hooks.callAll('collectContentLineText', {
        cc: this,
        state: state,
        tname: tname,
        node:node,
        text:txt,
        styl: null,
        cls: null
      });  
      var txt = (typeof(txtFromHook)=='object'&&txtFromHook.length==0)?dom.nodeValue(node):txtFromHook[0];

      var rest = '';
      var x = 0; // offset into original text
      if (txt.length == 0)
      {
        if (startPoint && node == startPoint.node)
        {
          selStart = _pointHere(0, state);
        }
        if (endPoint && node == endPoint.node)
        {
          selEnd = _pointHere(0, state);
        }
      }
      while (txt.length > 0)
      {
        var consumed = 0;
        if (state.flags.preMode)
        {
          var firstLine = txt.split('\n', 1)[0];
          consumed = firstLine.length + 1;
          rest = txt.substring(consumed);
          txt = firstLine;
        }
        else
        { /* will only run this loop body once */
        }
        if (startPoint && node == startPoint.node && startPoint.index - x <= txt.length)
        {
          selStart = _pointHere(startPoint.index - x, state);
        }
        if (endPoint && node == endPoint.node && endPoint.index - x <= txt.length)
        {
          selEnd = _pointHere(endPoint.index - x, state);
        }
        var txt2 = txt;
        if ((!state.flags.preMode) && /^[\r\n]*$/.exec(txt))
        {
          // prevents textnodes containing just "\n" from being significant
          // in safari when pasting text, now that we convert them to
          // spaces instead of removing them, because in other cases
          // removing "\n" from pasted HTML will collapse words together.
          txt2 = "";
        }
        var atBeginningOfLine = lines.textOfLine(lines.length() - 1).length == 0;
        if (atBeginningOfLine)
        {
          // newlines in the source mustn't become spaces at beginning of line box
          txt2 = txt2.replace(/^\n*/, '');
        }
        if (atBeginningOfLine && !_.isEmpty(state.lineAttributes))
        {
          _produceLineAttributesMarker(state);
        }
        lines.appendText(textify(txt2), state.attribString);
        x += consumed;
        txt = rest;
        if (txt.length > 0)
        {
          cc.startNewLine(state);
        }
      }
    }
    else
    {
      var tname = (dom.nodeTagName(node) || "").toLowerCase();

      if (tname == "img"){
        var collectContentImage = hooks.callAll('collectContentImage', {
          cc: cc,
          state: state,
          tname: tname,
          styl: styl,
          cls: cls,
          node: node
        });
      }else{
        // THIS SEEMS VERY HACKY! -- Please submit a better fix!
        delete state.lineAttributes.img
      }

      if (tname == "br")
      {
        this.breakLine = true;
        var tvalue = dom.nodeAttr(node, 'value');
        var induceLineBreak = hooks.callAll('collectContentLineBreak', {
          cc: this,
          state: state,
          tname: tname,
          tvalue:tvalue,
          styl: null,
          cls: null
        });       
        var startNewLine= (typeof(induceLineBreak)=='object'&&induceLineBreak.length==0)?true:induceLineBreak[0];
        if(startNewLine){
          cc.startNewLine(state);
        }
      }
      else if (tname == "script" || tname == "style")
      {
        // ignore
      }
      else if (!isEmpty)
      {
        var styl = dom.nodeAttr(node, "style");
        var cls = dom.nodeAttr(node, "class");
        var isPre = (tname == "pre");
        if ((!isPre) && abrowser.safari)
        {
          isPre = (styl && /\bwhite-space:\s*pre\b/i.exec(styl));
        }
        if (isPre) cc.incrementFlag(state, 'preMode');
        var oldListTypeOrNull = null;
        var oldAuthorOrNull = null;
        if (collectStyles)
        {
          hooks.callAll('collectContentPre', {
            cc: cc,
            state: state,
            tname: tname,
            styl: styl,
            cls: cls
          });
          if (tname == "b" || (styl && /\bfont-weight:\s*bold\b/i.exec(styl)) || tname == "strong")
          {
            cc.doAttrib(state, "bold");
          }
          if (tname == "i" || (styl && /\bfont-style:\s*italic\b/i.exec(styl)) || tname == "em")
          {
            cc.doAttrib(state, "italic");
          }
          if (tname == "u" || (styl && /\btext-decoration:\s*underline\b/i.exec(styl)) || tname == "ins")
          {
            cc.doAttrib(state, "underline");
          }
          if (tname == "s" || (styl && /\btext-decoration:\s*line-through\b/i.exec(styl)) || tname == "del")
          {
            cc.doAttrib(state, "strikethrough");
          }
          if (tname == "ul" || tname == "ol")
          {
            if(node.attribs){
              var type = node.attribs.class;
            }else{
              var type = null;
            }
            var rr = cls && /(?:^| )list-([a-z]+[0-9]+)\b/.exec(cls);
            // lists do not need to have a type, so before we make a wrong guess, check if we find a better hint within the node's children
            if(!rr && !type){
              for (var i in node.children){
                if(node.children[i] && node.children[i].name=='ul'){
                  type = node.children[i].attribs.class
                  if(type){
                    break
                  }
                }
              }
            }
            if(rr && rr[1]){
              type = rr[1]
            } else {
              if(tname == "ul"){
                if((type && type.match("indent")) || (node.attribs && node.attribs.class && node.attribs.class.match("indent"))){
                  type = "indent"
                } else {
                  type = "bullet"
                }
              } else {
                type = "number"
              }
              type = type + String(Math.min(_MAX_LIST_LEVEL, (state.listNesting || 0) + 1));
            }
            oldListTypeOrNull = (_enterList(state, type) || 'none');
          }
          else if ((tname == "div" || tname == "p") && cls && cls.match(/(?:^| )ace-line\b/))
          {
            // This has undesirable behavior in Chrome but is right in other browsers.
            // See https://github.com/ether/etherpad-lite/issues/2412 for reasoning
            if(!abrowser.chrome) oldListTypeOrNull = (_enterList(state, type) || 'none');
          }
          if (className2Author && cls)
          {
            var classes = cls.match(/\S+/g);
            if (classes && classes.length > 0)
            {
              for (var i = 0; i < classes.length; i++)
              {
                var c = classes[i];
                var a = className2Author(c);
                if (a)
                {
                  oldAuthorOrNull = (_enterAuthor(state, a) || 'none');
                  break;
                }
              }
            }
          }
        }

        var nc = dom.nodeNumChildren(node);
        for (var i = 0; i < nc; i++)
        {
          var c = dom.nodeChild(node, i);
          cc.collectContent(c, state);
        }

        if (collectStyles)
        {
          hooks.callAll('collectContentPost', {
            cc: cc,
            state: state,
            tname: tname,
            styl: styl,
            cls: cls
          });
        }

        if (isPre) cc.decrementFlag(state, 'preMode');
        if (state.localAttribs)
        {
          for (var i = 0; i < state.localAttribs.length; i++)
          {
            cc.decrementAttrib(state, state.localAttribs[i]);
          }
        }
        if (oldListTypeOrNull)
        {
          _exitList(state, oldListTypeOrNull);
        }
        if (oldAuthorOrNull)
        {
          _exitAuthor(state, oldAuthorOrNull);
        }
      }
    }
    if (!abrowser.msie)
    {
      _reachBlockPoint(node, 1, state);
    }
    if (isBlock)
    {
      if (lines.length() - 1 == startLine)
      {
        cc.startNewLine(state);
      }
      else
      {
        _ensureColumnZero(state);
      }
    }
    if (abrowser.msie)
    {
      // in IE, a point immediately after a DIV appears on the next line
      _reachBlockPoint(node, 1, state);
    }
    state.localAttribs = localAttribs;
  };
  // can pass a falsy value for end of doc
  cc.notifyNextNode = function(node)
  {
    // an "empty block" won't end a line; this addresses an issue in IE with
    // typing into a blank line at the end of the document.  typed text
    // goes into the body, and the empty line div still looks clean.
    // it is incorporated as dirty by the rule that a dirty region has
    // to end a line.
    if ((!node) || (isBlockElement(node) && !_isEmpty(node)))
    {
      _ensureColumnZero(null);
    }
  };
  // each returns [line, char] or [-1,-1]
  var getSelectionStart = function()
    {
      return selStart;
      };
  var getSelectionEnd = function()
    {
      return selEnd;
      };

  // returns array of strings for lines found, last entry will be "" if
  // last line is complete (i.e. if a following span should be on a new line).
  // can be called at any point
  cc.getLines = function()
  {
    return lines.textLines();
  };

  cc.finish = function()
  {
    lines.flush();
    var lineAttribs = lines.attribLines();
    var lineStrings = cc.getLines();

    lineStrings.length--;
    lineAttribs.length--;

    var ss = getSelectionStart();
    var se = getSelectionEnd();

    function fixLongLines()
    {
      // design mode does not deal with with really long lines!
      var lineLimit = 2000; // chars
      var buffer = 10; // chars allowed over before wrapping
      var linesWrapped = 0;
      var numLinesAfter = 0;
      for (var i = lineStrings.length - 1; i >= 0; i--)
      {
        var oldString = lineStrings[i];
        var oldAttribString = lineAttribs[i];
        if (oldString.length > lineLimit + buffer)
        {
          var newStrings = [];
          var newAttribStrings = [];
          while (oldString.length > lineLimit)
          {
            //var semiloc = oldString.lastIndexOf(';', lineLimit-1);
            //var lengthToTake = (semiloc >= 0 ? (semiloc+1) : lineLimit);
            var lengthToTake = lineLimit;
            newStrings.push(oldString.substring(0, lengthToTake));
            oldString = oldString.substring(lengthToTake);
            newAttribStrings.push(Changeset.subattribution(oldAttribString, 0, lengthToTake));
            oldAttribString = Changeset.subattribution(oldAttribString, lengthToTake);
          }
          if (oldString.length > 0)
          {
            newStrings.push(oldString);
            newAttribStrings.push(oldAttribString);
          }

          function fixLineNumber(lineChar)
          {
            if (lineChar[0] < 0) return;
            var n = lineChar[0];
            var c = lineChar[1];
            if (n > i)
            {
              n += (newStrings.length - 1);
            }
            else if (n == i)
            {
              var a = 0;
              while (c > newStrings[a].length)
              {
                c -= newStrings[a].length;
                a++;
              }
              n += a;
            }
            lineChar[0] = n;
            lineChar[1] = c;
          }
          fixLineNumber(ss);
          fixLineNumber(se);
          linesWrapped++;
          numLinesAfter += newStrings.length;

          newStrings.unshift(i, 1);
          lineStrings.splice.apply(lineStrings, newStrings);
          newAttribStrings.unshift(i, 1);
          lineAttribs.splice.apply(lineAttribs, newAttribStrings);
        }
      }
      return {
        linesWrapped: linesWrapped,
        numLinesAfter: numLinesAfter
      };
    }
    var wrapData = fixLongLines();

    return {
      selStart: ss,
      selEnd: se,
      linesWrapped: wrapData.linesWrapped,
      numLinesAfter: wrapData.numLinesAfter,
      lines: lineStrings,
      lineAttribs: lineAttribs
    };
  }

  return cc;
}

exports.sanitizeUnicode = sanitizeUnicode;
exports.makeContentCollector = makeContentCollector;

}
, "ep_etherpad-lite/static/js/changesettracker.js": function (require, exports, module) {
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

var AttributePool = require('./AttributePool');
var Changeset = require('./Changeset');

function makeChangesetTracker(scheduler, apool, aceCallbacksProvider)
{

  // latest official text from server
  var baseAText = Changeset.makeAText("\n");
  // changes applied to baseText that have been submitted
  var submittedChangeset = null;
  // changes applied to submittedChangeset since it was prepared
  var userChangeset = Changeset.identity(1);
  // is the changesetTracker enabled
  var tracking = false;
  // stack state flag so that when we change the rep we don't
  // handle the notification recursively.  When setting, always
  // unset in a "finally" block.  When set to true, the setter
  // takes change of userChangeset.
  var applyingNonUserChanges = false;

  var changeCallback = null;

  var changeCallbackTimeout = null;

  function setChangeCallbackTimeout()
  {
    // can call this multiple times per call-stack, because
    // we only schedule a call to changeCallback if it exists
    // and if there isn't a timeout already scheduled.
    if (changeCallback && changeCallbackTimeout === null)
    {
      changeCallbackTimeout = scheduler.setTimeout(function()
      {
        try
        {
          changeCallback();
        }
        catch(pseudoError) {}
        finally
        {
          changeCallbackTimeout = null;
        }
      }, 0);
    }
  }

  var self;
  return self = {
    isTracking: function()
    {
      return tracking;
    },
    setBaseText: function(text)
    {
      self.setBaseAttributedText(Changeset.makeAText(text), null);
    },
    setBaseAttributedText: function(atext, apoolJsonObj)
    {
      aceCallbacksProvider.withCallbacks("setBaseText", function(callbacks)
      {
        tracking = true;
        baseAText = Changeset.cloneAText(atext);
        if (apoolJsonObj)
        {
          var wireApool = (new AttributePool()).fromJsonable(apoolJsonObj);
          baseAText.attribs = Changeset.moveOpsToNewPool(baseAText.attribs, wireApool, apool);
        }
        submittedChangeset = null;
        userChangeset = Changeset.identity(atext.text.length);
        applyingNonUserChanges = true;
        try
        {
          callbacks.setDocumentAttributedText(atext);
        }
        finally
        {
          applyingNonUserChanges = false;
        }
      });
    },
    composeUserChangeset: function(c)
    {
      if (!tracking) return;
      if (applyingNonUserChanges) return;
      if (Changeset.isIdentity(c)) return;
      userChangeset = Changeset.compose(userChangeset, c, apool);

      setChangeCallbackTimeout();
    },
    applyChangesToBase: function(c, optAuthor, apoolJsonObj)
    {
      if (!tracking) return;

      aceCallbacksProvider.withCallbacks("applyChangesToBase", function(callbacks)
      {

        if (apoolJsonObj)
        {
          var wireApool = (new AttributePool()).fromJsonable(apoolJsonObj);
          c = Changeset.moveOpsToNewPool(c, wireApool, apool);
        }

        baseAText = Changeset.applyToAText(c, baseAText, apool);

        var c2 = c;
        if (submittedChangeset)
        {
          var oldSubmittedChangeset = submittedChangeset;
          submittedChangeset = Changeset.follow(c, oldSubmittedChangeset, false, apool);
          c2 = Changeset.follow(oldSubmittedChangeset, c, true, apool);
        }

        var preferInsertingAfterUserChanges = true;
        var oldUserChangeset = userChangeset;
        userChangeset = Changeset.follow(c2, oldUserChangeset, preferInsertingAfterUserChanges, apool);
        var postChange = Changeset.follow(oldUserChangeset, c2, !preferInsertingAfterUserChanges, apool);

        var preferInsertionAfterCaret = true; //(optAuthor && optAuthor > thisAuthor);
        applyingNonUserChanges = true;
        try
        {
          callbacks.applyChangesetToDocument(postChange, preferInsertionAfterCaret);
        }
        finally
        {
          applyingNonUserChanges = false;
        }
      });
    },
    prepareUserChangeset: function()
    {
      // If there are user changes to submit, 'changeset' will be the
      // changeset, else it will be null.
      var toSubmit;
      if (submittedChangeset)
      {
        // submission must have been canceled, prepare new changeset
        // that includes old submittedChangeset
        toSubmit = Changeset.compose(submittedChangeset, userChangeset, apool);
      }
      else
      {

        // add forEach function to Array.prototype for IE8      
        if (!('forEach' in Array.prototype)) {
          Array.prototype.forEach= function(action, that /*opt*/) {
            for (var i= 0, n= this.length; i<n; i++)
              if (i in this)
                action.call(that, this[i], i, this);
          };
        }

        // Get my authorID
        var authorId = parent.parent.pad.myUserInfo.userId;

        // Sanitize authorship
        // We need to replace all author attribs with thisSession.author, in case they copy/pasted or otherwise inserted other peoples changes
        if(apool.numToAttrib){
          for (var attr in apool.numToAttrib){
            if (apool.numToAttrib[attr][0] == 'author' && apool.numToAttrib[attr][1] == authorId) var authorAttr = Number(attr).toString(36)
          }

          // Replace all added 'author' attribs with the value of the current user
          var cs = Changeset.unpack(userChangeset)
            , iterator = Changeset.opIterator(cs.ops)
            , op
            , assem = Changeset.mergingOpAssembler();

          while(iterator.hasNext()) {
            op = iterator.next()
            if(op.opcode == '+') {
              var newAttrs = ''

              op.attribs.split('*').forEach(function(attrNum) {
                if(!attrNum) return
                var attr = apool.getAttrib(parseInt(attrNum, 36))
                if(!attr) return
                if('author' == attr[0])  {
                  // replace that author with the current one
                  newAttrs += '*'+authorAttr; 
                }
                else newAttrs += '*'+attrNum // overtake all other attribs as is
              })
              op.attribs = newAttrs
            }
            assem.append(op)
          }
          assem.endDocument();
          userChangeset = Changeset.pack(cs.oldLen, cs.newLen, assem.toString(), cs.charBank)
          Changeset.checkRep(userChangeset)
        }
        if (Changeset.isIdentity(userChangeset)) toSubmit = null;
        else toSubmit = userChangeset;
      }

      var cs = null;
      if (toSubmit)
      {
        submittedChangeset = toSubmit;
        userChangeset = Changeset.identity(Changeset.newLen(toSubmit));

        cs = toSubmit;
      }
      var wireApool = null;
      if (cs)
      {
        var forWire = Changeset.prepareForWire(cs, apool);
        wireApool = forWire.pool.toJsonable();
        cs = forWire.translated;
      }

      var data = {
        changeset: cs,
        apool: wireApool
      };
      return data;
    },
    applyPreparedChangesetToBase: function()
    {
      if (!submittedChangeset)
      {
        // violation of protocol; use prepareUserChangeset first
        throw new Error("applySubmittedChangesToBase: no submitted changes to apply");
      }
      //bumpDebug("applying committed changeset: "+submittedChangeset.encodeToString(false));
      baseAText = Changeset.applyToAText(submittedChangeset, baseAText, apool);
      submittedChangeset = null;
    },
    setUserChangeNotificationCallback: function(callback)
    {
      changeCallback = callback;
    },
    hasUncommittedChanges: function()
    {
      return !!(submittedChangeset || (!Changeset.isIdentity(userChangeset)));
    }
  };

}

exports.makeChangesetTracker = makeChangesetTracker;

}
, "ep_etherpad-lite/static/js/linestylefilter.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

// THIS FILE IS ALSO AN APPJET MODULE: etherpad.collab.ace.linestylefilter
// %APPJET%: import("etherpad.collab.ace.easysync2.Changeset");
// %APPJET%: import("etherpad.admin.plugins");
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

// requires: easysync2.Changeset
// requires: top
// requires: plugins
// requires: undefined

var Changeset = require('./Changeset');
var hooks = require('./pluginfw/hooks');
var linestylefilter = {};
var _ = require('./underscore');
var AttributeManager = require('./AttributeManager');

linestylefilter.ATTRIB_CLASSES = {
  'bold': 'tag:b',
  'italic': 'tag:i',
  'underline': 'tag:u',
  'strikethrough': 'tag:s'
};

var lineAttributeMarker = 'lineAttribMarker';
exports.lineAttributeMarker = lineAttributeMarker;

linestylefilter.getAuthorClassName = function(author)
{
  return "author-" + author.replace(/[^a-y0-9]/g, function(c)
  {
    if (c == ".") return "-";
    return 'z' + c.charCodeAt(0) + 'z';
  });
};

// lineLength is without newline; aline includes newline,
// but may be falsy if lineLength == 0
linestylefilter.getLineStyleFilter = function(lineLength, aline, textAndClassFunc, apool)
{

  // Plugin Hook to add more Attrib Classes
  hooks.aCallAll('aceAttribClasses', linestylefilter.ATTRIB_CLASSES, function(err, ATTRIB_CLASSES){
    if(ATTRIB_CLASSES.length >= 1){
      linestylefilter.ATTRIB_CLASSES = ATTRIB_CLASSES[0];
    }
  });

  if (lineLength == 0) return textAndClassFunc;

  var nextAfterAuthorColors = textAndClassFunc;

  var authorColorFunc = (function()
  {
    var lineEnd = lineLength;
    var curIndex = 0;
    var extraClasses;
    var leftInAuthor;

    function attribsToClasses(attribs)
    {
      var classes = '';
      var isLineAttribMarker = false;
      
      Changeset.eachAttribNumber(attribs, function(n)
      {
        var key = apool.getAttribKey(n);  
        if (key)
        {
          var value = apool.getAttribValue(n);
          if (value)
          {
            if (!isLineAttribMarker && _.indexOf(AttributeManager.lineAttributes, key) >= 0){
              isLineAttribMarker = true;
            }
            if (key == 'author')
            {
              classes += ' ' + linestylefilter.getAuthorClassName(value);
            }
            else if (key == 'list')
            {
              classes += ' list:' + value;
            }
            else if (key == 'start')
            {
              classes += ' start:' + value;
            }
            else if (linestylefilter.ATTRIB_CLASSES[key])
            {
              classes += ' ' + linestylefilter.ATTRIB_CLASSES[key];
            }
            else
            {
              classes += hooks.callAllStr("aceAttribsToClasses", {
                linestylefilter: linestylefilter,
                key: key,
                value: value
              }, " ", " ", "");
            }            
          }
        }
      });
      
      if(isLineAttribMarker) classes += ' ' + lineAttributeMarker;
      return classes.substring(1);
    }

    var attributionIter = Changeset.opIterator(aline);
    var nextOp, nextOpClasses;

    function goNextOp()
    {
      nextOp = attributionIter.next();
      nextOpClasses = (nextOp.opcode && attribsToClasses(nextOp.attribs));
    }
    goNextOp();

    function nextClasses()
    {
      if (curIndex < lineEnd)
      {
        extraClasses = nextOpClasses;
        leftInAuthor = nextOp.chars;
        goNextOp();
        while (nextOp.opcode && nextOpClasses == extraClasses)
        {
          leftInAuthor += nextOp.chars;
          goNextOp();
        }
      }
    }
    nextClasses();

    return function(txt, cls)
    {

      var disableAuthColorForThisLine = hooks.callAll("disableAuthorColorsForThisLine", {
        linestylefilter: linestylefilter,
        text: txt,
        "class": cls
      }, " ", " ", "");   
      var disableAuthors = (disableAuthColorForThisLine==null||disableAuthColorForThisLine.length==0)?false:disableAuthColorForThisLine[0];
      while (txt.length > 0)
      {
        if (leftInAuthor <= 0 || disableAuthors)
        {
          // prevent infinite loop if something funny's going on
          return nextAfterAuthorColors(txt, cls);
        }
        var spanSize = txt.length;
        if (spanSize > leftInAuthor)
        {
          spanSize = leftInAuthor;
        }
        var curTxt = txt.substring(0, spanSize);
        txt = txt.substring(spanSize);
        nextAfterAuthorColors(curTxt, (cls && cls + " ") + extraClasses);
        curIndex += spanSize;
        leftInAuthor -= spanSize;
        if (leftInAuthor == 0)
        {
          nextClasses();
        }
      }
    };
  })();
  return authorColorFunc;
};

linestylefilter.getAtSignSplitterFilter = function(lineText, textAndClassFunc)
{
  var at = /@/g;
  at.lastIndex = 0;
  var splitPoints = null;
  var execResult;
  while ((execResult = at.exec(lineText)))
  {
    if (!splitPoints)
    {
      splitPoints = [];
    }
    splitPoints.push(execResult.index);
  }

  if (!splitPoints) return textAndClassFunc;

  return linestylefilter.textAndClassFuncSplitter(textAndClassFunc, splitPoints);
};

linestylefilter.getRegexpFilter = function(regExp, tag)
{
  return function(lineText, textAndClassFunc)
  {
    regExp.lastIndex = 0;
    var regExpMatchs = null;
    var splitPoints = null;
    var execResult;
    while ((execResult = regExp.exec(lineText)))
    {
      if (!regExpMatchs)
      {
        regExpMatchs = [];
        splitPoints = [];
      }
      var startIndex = execResult.index;
      var regExpMatch = execResult[0];
      regExpMatchs.push([startIndex, regExpMatch]);
      splitPoints.push(startIndex, startIndex + regExpMatch.length);
    }

    if (!regExpMatchs) return textAndClassFunc;

    function regExpMatchForIndex(idx)
    {
      for (var k = 0; k < regExpMatchs.length; k++)
      {
        var u = regExpMatchs[k];
        if (idx >= u[0] && idx < u[0] + u[1].length)
        {
          return u[1];
        }
      }
      return false;
    }

    var handleRegExpMatchsAfterSplit = (function()
    {
      var curIndex = 0;
      return function(txt, cls)
      {
        var txtlen = txt.length;
        var newCls = cls;
        var regExpMatch = regExpMatchForIndex(curIndex);
        if (regExpMatch)
        {
          newCls += " " + tag + ":" + regExpMatch;
        }
        textAndClassFunc(txt, newCls);
        curIndex += txtlen;
      };
    })();

    return linestylefilter.textAndClassFuncSplitter(handleRegExpMatchsAfterSplit, splitPoints);
  };
};


linestylefilter.REGEX_WORDCHAR = /[\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u1FFF\u3040-\u9FFF\uF900-\uFDFF\uFE70-\uFEFE\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFDC]/;
linestylefilter.REGEX_URLCHAR = new RegExp('(' + /[-:@a-zA-Z0-9_.,~%+\/\\?=&#!;()\[\]$]/.source + '|' + linestylefilter.REGEX_WORDCHAR.source + ')');
linestylefilter.REGEX_URL = new RegExp(/(?:(?:https?|s?ftp|ftps|file|nfs):\/\/|mailto:|www\.)/.source + linestylefilter.REGEX_URLCHAR.source + '*(?![:.,;])' + linestylefilter.REGEX_URLCHAR.source, 'g');
linestylefilter.getURLFilter = linestylefilter.getRegexpFilter(
linestylefilter.REGEX_URL, 'url');

linestylefilter.textAndClassFuncSplitter = function(func, splitPointsOpt)
{
  var nextPointIndex = 0;
  var idx = 0;

  // don't split at 0
  while (splitPointsOpt && nextPointIndex < splitPointsOpt.length && splitPointsOpt[nextPointIndex] == 0)
  {
    nextPointIndex++;
  }

  function spanHandler(txt, cls)
  {
    if ((!splitPointsOpt) || nextPointIndex >= splitPointsOpt.length)
    {
      func(txt, cls);
      idx += txt.length;
    }
    else
    {
      var splitPoints = splitPointsOpt;
      var pointLocInSpan = splitPoints[nextPointIndex] - idx;
      var txtlen = txt.length;
      if (pointLocInSpan >= txtlen)
      {
        func(txt, cls);
        idx += txt.length;
        if (pointLocInSpan == txtlen)
        {
          nextPointIndex++;
        }
      }
      else
      {
        if (pointLocInSpan > 0)
        {
          func(txt.substring(0, pointLocInSpan), cls);
          idx += pointLocInSpan;
        }
        nextPointIndex++;
        // recurse
        spanHandler(txt.substring(pointLocInSpan), cls);
      }
    }
  }
  return spanHandler;
};

linestylefilter.getFilterStack = function(lineText, textAndClassFunc, abrowser)
{
  var func = linestylefilter.getURLFilter(lineText, textAndClassFunc);

  var hookFilters = hooks.callAll("aceGetFilterStack", {
    linestylefilter: linestylefilter,
    browser: abrowser
  });
  _.map(hookFilters ,function(hookFilter)
  {
    func = hookFilter(lineText, func);
  });

  if (abrowser !== undefined && abrowser.msie)
  {
    // IE7+ will take an e-mail address like <foo@bar.com> and linkify it to foo@bar.com.
    // We then normalize it back to text with no angle brackets.  It's weird.  So always
    // break spans at an "at" sign.
    func = linestylefilter.getAtSignSplitterFilter(
    lineText, func);
  }
  return func;
};

// domLineObj is like that returned by domline.createDomLine
linestylefilter.populateDomLine = function(textLine, aline, apool, domLineObj)
{
  // remove final newline from text if any
  var text = textLine;
  if (text.slice(-1) == '\n')
  {
    text = text.substring(0, text.length - 1);
  }

  function textAndClassFunc(tokenText, tokenClass)
  {
    domLineObj.appendSpan(tokenText, tokenClass);
  }

  var func = linestylefilter.getFilterStack(text, textAndClassFunc);
  func = linestylefilter.getLineStyleFilter(text.length, aline, func, apool);
  func(text, '');
};

exports.linestylefilter = linestylefilter;

}
, "ep_etherpad-lite/static/js/domline.js": function (require, exports, module) {
/**
 * This code is mostly from the old Etherpad. Please help us to comment this code. 
 * This helps other people to understand this code better and helps them to improve it.
 * TL;DR COMMENTS ON THIS FILE ARE HIGHLY APPRECIATED
 */

// THIS FILE IS ALSO AN APPJET MODULE: etherpad.collab.ace.domline
// %APPJET%: import("etherpad.admin.plugins");
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

var Security = require('./security');
var hooks = require('./pluginfw/hooks');
var _ = require('./underscore');
var lineAttributeMarker = require('./linestylefilter').lineAttributeMarker;
var noop = function(){};


var domline = {};

domline.addToLineClass = function(lineClass, cls)
{
  // an "empty span" at any point can be used to add classes to
  // the line, using line:className.  otherwise, we ignore
  // the span.
  cls.replace(/\S+/g, function(c)
  {
    if (c.indexOf("line:") == 0)
    {
      // add class to line
      lineClass = (lineClass ? lineClass + ' ' : '') + c.substring(5);
    }
  });
  return lineClass;
}

// if "document" is falsy we don't create a DOM node, just
// an object with innerHTML and className
domline.createDomLine = function(nonEmpty, doesWrap, optBrowser, optDocument)
{
  var result = {
    node: null,
    appendSpan: noop,
    prepareForAdd: noop,
    notifyAdded: noop,
    clearSpans: noop,
    finishUpdate: noop,
    lineMarker: 0
  };

  var document = optDocument;

  if (document)
  {
    result.node = document.createElement("div");
  }
  else
  {
    result.node = {
      innerHTML: '',
      className: ''
    };
  }

  var html = [];
  var preHtml = '', 
  postHtml = '';
  var curHTML = null;

  function processSpaces(s)
  {
    return domline.processSpaces(s, doesWrap);
  }

  var perTextNodeProcess = (doesWrap ? _.identity : processSpaces);
  var perHtmlLineProcess = (doesWrap ? processSpaces : _.identity);
  var lineClass = 'ace-line';

  result.appendSpan = function(txt, cls)
  {

    var processedMarker = false;
    // Handle lineAttributeMarker, if present
    if (cls.indexOf(lineAttributeMarker) >= 0)
    {
      var listType = /(?:^| )list:(\S+)/.exec(cls);
      var start = /(?:^| )start:(\S+)/.exec(cls);

      _.map(hooks.callAll("aceDomLinePreProcessLineAttributes", {
        domline: domline,
        cls: cls
      }), function(modifier)
      {
        preHtml += modifier.preHtml;
        postHtml += modifier.postHtml;
        processedMarker |= modifier.processedMarker;
      });

      if (listType)
      {
        listType = listType[1];
        if (listType)
        {
          if(listType.indexOf("number") < 0)
          {
            preHtml += '<ul class="list-' + Security.escapeHTMLAttribute(listType) + '"><li>';
            postHtml = '</li></ul>' + postHtml;
          }
          else
          {
            if(start){ // is it a start of a list with more than one item in?
              if(start[1] == 1){ // if its the first one at this level?
                lineClass = lineClass + " " + "list-start-" + listType; // Add start class to DIV node
              }
              preHtml += '<ol start='+start[1]+' class="list-' + Security.escapeHTMLAttribute(listType) + '"><li>';
            }else{
              preHtml += '<ol class="list-' + Security.escapeHTMLAttribute(listType) + '"><li>'; // Handles pasted contents into existing lists
            }
            postHtml += '</li></ol>';
          }
        } 
        processedMarker = true;
      }
      _.map(hooks.callAll("aceDomLineProcessLineAttributes", {
        domline: domline,
        cls: cls
      }), function(modifier)
      {
        preHtml += modifier.preHtml;
        postHtml += modifier.postHtml;
        processedMarker |= modifier.processedMarker;
      });
      if( processedMarker ){
        result.lineMarker += txt.length;
        return; // don't append any text
      } 
    }
    var href = null;
    var simpleTags = null;
    if (cls.indexOf('url') >= 0)
    {
      cls = cls.replace(/(^| )url:(\S+)/g, function(x0, space, url)
      {
        href = url;
        return space + "url";
      });
    }
    if (cls.indexOf('tag') >= 0)
    {
      cls = cls.replace(/(^| )tag:(\S+)/g, function(x0, space, tag)
      {
        if (!simpleTags) simpleTags = [];
        simpleTags.push(tag.toLowerCase());
        return space + tag;
      });
    }

    var extraOpenTags = "";
    var extraCloseTags = "";

    _.map(hooks.callAll("aceCreateDomLine", {
      domline: domline,
      cls: cls
    }), function(modifier)
    {
      cls = modifier.cls;
      extraOpenTags = extraOpenTags + modifier.extraOpenTags;
      extraCloseTags = modifier.extraCloseTags + extraCloseTags;
    });

    if ((!txt) && cls)
    {
      lineClass = domline.addToLineClass(lineClass, cls);
    }
    else if (txt)
    {
      if (href)
      {
        if(!~href.indexOf("://") && !~href.indexOf("mailto:")) // if the url doesn't include a protocol prefix, assume http
        {
          href = "http://"+href;
        }
        extraOpenTags = extraOpenTags + '<a href="' + Security.escapeHTMLAttribute(href) + '">';
        extraCloseTags = '</a>' + extraCloseTags;
      }
      if (simpleTags)
      {
        simpleTags.sort();
        extraOpenTags = extraOpenTags + '<' + simpleTags.join('><') + '>';
        simpleTags.reverse();
        extraCloseTags = '</' + simpleTags.join('></') + '>' + extraCloseTags;
      }
      html.push('<span class="', Security.escapeHTMLAttribute(cls || ''), '">', extraOpenTags, perTextNodeProcess(Security.escapeHTML(txt)), extraCloseTags, '</span>');
    }
  };
  result.clearSpans = function()
  {
    html = [];
    lineClass = ''; // non-null to cause update
    result.lineMarker = 0;
  };

  function writeHTML()
  {
    var newHTML = perHtmlLineProcess(html.join(''));
    if (!newHTML)
    {
      if ((!document) || (!optBrowser))
      {
        newHTML += '&nbsp;';
      }
      else if (!optBrowser.msie)
      {
        newHTML += '<br/>';
      }
    }
    if (nonEmpty)
    {
      newHTML = (preHtml || '') + newHTML + (postHtml || '');
    }
    html = preHtml = postHtml = ''; // free memory
    if (newHTML !== curHTML)
    {
      curHTML = newHTML;
      result.node.innerHTML = curHTML;
    }
    if (lineClass !== null) result.node.className = lineClass;

    hooks.callAll("acePostWriteDomLineHTML", {
      node: result.node
    });
  }
  result.prepareForAdd = writeHTML;
  result.finishUpdate = writeHTML;
  result.getInnerHTML = function()
  {
    return curHTML || '';
  };
  return result;
};

domline.processSpaces = function(s, doesWrap)
{
  if (s.indexOf("<") < 0 && !doesWrap)
  {
    // short-cut
    return s.replace(/ /g, '&nbsp;');
  }
  var parts = [];
  s.replace(/<[^>]*>?| |[^ <]+/g, function(m)
  {
    parts.push(m);
  });
  if (doesWrap)
  {
    var endOfLine = true;
    var beforeSpace = false;
    // last space in a run is normal, others are nbsp,
    // end of line is nbsp
    for (var i = parts.length - 1; i >= 0; i--)
    {
      var p = parts[i];
      if (p == " ")
      {
        if (endOfLine || beforeSpace) parts[i] = '&nbsp;';
        endOfLine = false;
        beforeSpace = true;
      }
      else if (p.charAt(0) != "<")
      {
        endOfLine = false;
        beforeSpace = false;
      }
    }
    // beginning of line is nbsp
    for (var i = 0; i < parts.length; i++)
    {
      var p = parts[i];
      if (p == " ")
      {
        parts[i] = '&nbsp;';
        break;
      }
      else if (p.charAt(0) != "<")
      {
        break;
      }
    }
  }
  else
  {
    for (var i = 0; i < parts.length; i++)
    {
      var p = parts[i];
      if (p == " ")
      {
        parts[i] = '&nbsp;';
      }
    }
  }
  return parts.join('');
};

exports.domline = domline;

}
, "ep_etherpad-lite/static/js/AttributeManager.js": function (require, exports, module) {
var Changeset = require('./Changeset');
var ChangesetUtils = require('./ChangesetUtils');
var _ = require('./underscore');

var lineMarkerAttribute = 'lmkr';

// If one of these attributes are set to the first character of a 
// line it is considered as a line attribute marker i.e. attributes
// set on this marker are applied to the whole line. 
// The list attribute is only maintained for compatibility reasons
var lineAttributes = [lineMarkerAttribute,'list'];

/*
  The Attribute manager builds changesets based on a document 
  representation for setting and removing range or line-based attributes.
  
  @param rep the document representation to be used
  @param applyChangesetCallback this callback will be called 
    once a changeset has been built.
    
    
  A document representation contains 
  - an array `alines` containing 1 attributes string for each line 
  - an Attribute pool `apool`
  - a SkipList `lines` containing the text lines of the document.
*/

var AttributeManager = function(rep, applyChangesetCallback)
{
  this.rep = rep;
  this.applyChangesetCallback = applyChangesetCallback;
  this.author = '';
  
  // If the first char in a line has one of the following attributes
  // it will be considered as a line marker
};

AttributeManager.lineAttributes = lineAttributes;

AttributeManager.prototype = _(AttributeManager.prototype).extend({
  
  applyChangeset: function(changeset){
    if(!this.applyChangesetCallback) return changeset;
    
    var cs = changeset.toString();
    if (!Changeset.isIdentity(cs))
    {
      this.applyChangesetCallback(cs);
    }
    
    return changeset;
  },
  
  /*
    Sets attributes on a range
    @param start [row, col] tuple pointing to the start of the range
    @param end [row, col] tuple pointing to the end of the range
    @param attribute: an array of attributes
  */
  setAttributesOnRange: function(start, end, attribs)
  {
    var builder = Changeset.builder(this.rep.lines.totalWidth());
    ChangesetUtils.buildKeepToStartOfRange(this.rep, builder, start);
    ChangesetUtils.buildKeepRange(this.rep, builder, start, end, attribs, this.rep.apool);
    return this.applyChangeset(builder);
  },

  /* 
    Returns if the line already has a line marker
    @param lineNum: the number of the line
  */
  lineHasMarker: function(lineNum){
    var that = this;
    
    return _.find(lineAttributes, function(attribute){
      return that.getAttributeOnLine(lineNum, attribute) != ''; 
    }) !== undefined;
  },
  
  /*
    Gets a specified attribute on a line
    @param lineNum: the number of the line to set the attribute for
    @param attributeKey: the name of the attribute to get, e.g. list  
  */
  getAttributeOnLine: function(lineNum, attributeName){
    // get  `attributeName` attribute of first char of line
    var aline = this.rep.alines[lineNum];
    if (aline)
    {
      var opIter = Changeset.opIterator(aline);
      if (opIter.hasNext())
      {
        return Changeset.opAttributeValue(opIter.next(), attributeName, this.rep.apool) || '';
      }
    }
    return '';
  },
  
  /*
    Gets all attributes on a line
    @param lineNum: the number of the line to get the attribute for 
  */
  getAttributesOnLine: function(lineNum){
    // get attributes of first char of line
    var aline = this.rep.alines[lineNum];
    var attributes = []
    if (aline)
    {
      var opIter = Changeset.opIterator(aline)
        , op
      if (opIter.hasNext())
      {
        op = opIter.next()
        if(!op.attribs) return []
        
        Changeset.eachAttribNumber(op.attribs, function(n) {
          attributes.push([this.rep.apool.getAttribKey(n), this.rep.apool.getAttribValue(n)])
        }.bind(this))
        return attributes;
      }
    }
    return [];
  },
  
  /*
    Gets all attributes at a position containing line number and column
    @param lineNumber starting with zero
    @param column starting with zero
    returns a list of attributes in the format 
    [ ["key","value"], ["key","value"], ...  ]
  */
  getAttributesOnPosition: function(lineNumber, column){
    // get all attributes of the line
    var aline = this.rep.alines[lineNumber];
    
    if (!aline) {
        return [];
    }
    // iterate through all operations of a line
    var opIter = Changeset.opIterator(aline);
    
    // we need to sum up how much characters each operations take until the wanted position
    var currentPointer = 0;
    var attributes = [];    
    var currentOperation;
    
    while (opIter.hasNext()) {
      currentOperation = opIter.next();
      currentPointer = currentPointer + currentOperation.chars;      
      
      if (currentPointer > column) {
        // we got the operation of the wanted position, now collect all its attributes
        Changeset.eachAttribNumber(currentOperation.attribs, function (n) {
          attributes.push([
            this.rep.apool.getAttribKey(n),
            this.rep.apool.getAttribValue(n)
          ]);
        }.bind(this));
        
        // skip the loop
        return attributes;
      }
    }
    return attributes;
    
  },
  
  /*
    Gets all attributes at caret position 
    if the user selected a range, the start of the selection is taken
    returns a list of attributes in the format 
    [ ["key","value"], ["key","value"], ...  ]
  */
  getAttributesOnCaret: function(){
    return this.getAttributesOnPosition(this.rep.selStart[0], this.rep.selStart[1]);
  },
  
  /*
    Sets a specified attribute on a line
    @param lineNum: the number of the line to set the attribute for
    @param attributeKey: the name of the attribute to set, e.g. list
    @param attributeValue: an optional parameter to pass to the attribute (e.g. indention level)
  
  */
  setAttributeOnLine: function(lineNum, attributeName, attributeValue){
    var loc = [0,0];
    var builder = Changeset.builder(this.rep.lines.totalWidth());
    var hasMarker = this.lineHasMarker(lineNum);
    
    ChangesetUtils.buildKeepRange(this.rep, builder, loc, (loc = [lineNum, 0]));

    if(hasMarker){
      ChangesetUtils.buildKeepRange(this.rep, builder, loc, (loc = [lineNum, 1]), [
        [attributeName, attributeValue]
      ], this.rep.apool);
    }else{      
        // add a line marker
        builder.insert('*', [
          ['author', this.author],
          ['insertorder', 'first'],
          [lineMarkerAttribute, '1'],
          [attributeName, attributeValue]
        ], this.rep.apool);
    }
    
    return this.applyChangeset(builder);
  },
  
 /**
   * Removes a specified attribute on a line
   *  @param lineNum the number of the affected line
   *  @param attributeName the name of the attribute to remove, e.g. list
   *  @param attributeValue if given only attributes with equal value will be removed
   */
 removeAttributeOnLine: function(lineNum, attributeName, attributeValue){
   var builder = Changeset.builder(this.rep.lines.totalWidth());
   var hasMarker = this.lineHasMarker(lineNum);
   var found = false;

   var attribs = _(this.getAttributesOnLine(lineNum)).map(function (attrib) {
     if (attrib[0] === attributeName && (!attributeValue || attrib[0] === attributeValue)){
       found = true;
       return [attributeName, ''];
     }
     return attrib;
   });

   if (!found) {
     return;
   }

   ChangesetUtils.buildKeepToStartOfRange(this.rep, builder, [lineNum, 0]);

   var countAttribsWithMarker = _.chain(attribs).filter(function(a){return !!a[1];})
     .map(function(a){return a[0];}).difference(['author', 'lmkr', 'insertorder', 'start']).size().value();

   //if we have marker and any of attributes don't need to have marker. we need delete it
   if(hasMarker && !countAttribsWithMarker){
     ChangesetUtils.buildRemoveRange(this.rep, builder, [lineNum, 0], [lineNum, 1]);
   }else{
     ChangesetUtils.buildKeepRange(this.rep, builder, [lineNum, 0], [lineNum, 1], attribs, this.rep.apool);
   }

   return this.applyChangeset(builder);
 },
  
   /*
     Toggles a line attribute for the specified line number
     If a line attribute with the specified name exists with any value it will be removed
     Otherwise it will be set to the given value
     @param lineNum: the number of the line to toggle the attribute for
     @param attributeKey: the name of the attribute to toggle, e.g. list
     @param attributeValue: the value to pass to the attribute (e.g. indention level)
  */
  toggleAttributeOnLine: function(lineNum, attributeName, attributeValue) {
    return this.getAttributeOnLine(lineNum, attributeName) ?
      this.removeAttributeOnLine(lineNum, attributeName) :
      this.setAttributeOnLine(lineNum, attributeName, attributeValue);
    
  }
});

module.exports = AttributeManager;

}
, "ep_etherpad-lite/static/js/ace2_inner": null
, "ep_etherpad-lite/static/js/browser": null
, "ep_etherpad-lite/static/js/AttributePool": null
, "ep_etherpad-lite/static/js/Changeset": null
, "ep_etherpad-lite/static/js/ChangesetUtils": null
, "ep_etherpad-lite/static/js/skiplist": null
, "ep_etherpad-lite/static/js/cssmanager": null
, "ep_etherpad-lite/static/js/colorutils": null
, "ep_etherpad-lite/static/js/undomodule": null
, "unorm": null
, "ep_etherpad-lite/static/js/contentcollector": null
, "ep_etherpad-lite/static/js/changesettracker": null
, "ep_etherpad-lite/static/js/linestylefilter": null
, "ep_etherpad-lite/static/js/domline": null
, "ep_etherpad-lite/static/js/AttributeManager": null
, "ep_etherpad-lite/static/js/ace2_inner/index.js": null
, "ep_etherpad-lite/static/js/browser/index.js": null
, "ep_etherpad-lite/static/js/AttributePool/index.js": null
, "ep_etherpad-lite/static/js/Changeset/index.js": null
, "ep_etherpad-lite/static/js/ChangesetUtils/index.js": null
, "ep_etherpad-lite/static/js/skiplist/index.js": null
, "ep_etherpad-lite/static/js/cssmanager/index.js": null
, "ep_etherpad-lite/static/js/colorutils/index.js": null
, "ep_etherpad-lite/static/js/undomodule/index.js": null
, "unorm/index.js": null
, "ep_etherpad-lite/static/js/contentcollector/index.js": null
, "ep_etherpad-lite/static/js/changesettracker/index.js": null
, "ep_etherpad-lite/static/js/linestylefilter/index.js": null
, "ep_etherpad-lite/static/js/domline/index.js": null
, "ep_etherpad-lite/static/js/AttributeManager/index.js": null
});
