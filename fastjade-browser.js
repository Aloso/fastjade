/**
 * Library for parsing strings with a jade-like syntax and inserting variables from a context.
 * @copyright Ludwig Stecher
 */

var FastJade = (function() {
    
    ////////////////////////////////   RESOURCES    ////////////////////////////////
    
    var selfClosingNodes = {
        "area": 1,
        "base": 1,
        "br": 1,
        "col": 1,
        "command": 1,
        "embed": 1,
        "hr": 1,
        "img": 1,
        "input": 1,
        "keygen": 1,
        "link": 1,
        "meta": 1,
        "param": 1,
        "source": 1,
        "track": 1,
        "wbr": 1
    };
    
    var doctypes = {
        "html": "<!DOCTYPE html>",
        "5": "<!DOCTYPE html>",
        "default": "<!DOCTYPE html>",
        "xml": "<?xml version=\"1.0\" encoding=\"utf-8\" ?>",
        "transitional": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\">",
        "strict": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Strict//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd\">",
        "frameset": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Frameset//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd\">",
        "1.1": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.1//EN\" \"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd\">",
        "basic": "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML Basic 1.1//EN\" \"http://www.w3.org/TR/xhtml-basic/xhtml-basic11.dtd\">",
        "mobile": "<!DOCTYPE html PUBLIC \"-//WAPFORUM//DTD XHTML Mobile 1.2//EN\" \"http://www.openmobilealliance.org/tech/DTD/xhtml-mobile12.dtd\">"
    };
    
    // Constants
    var N_ROOT = 1,
        N_COMMENT = 2,
        N_HTML = 3,
        N_HTML_COMMENT = 4,
        N_FILTER = 5,
        N_TEXT = 6,
        N_TEXT_WITH_INJECTIONS = 7,
        N_JS_LINE = 8,
        N_JS_EXPR = 9,
        N_JS_EXPR_NO_VALIDATE = 10,
        N_JS_EXPR_ESC = 11,
        N_ARRAY = 12,
        N_INCLUDE = 13,
        N_EXTEND = 14;
    
    function addSlashes(string) {
        return string.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    }
    
    function escapeHtml(unsafe) {
        return ("" + unsafe)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
    }
    
    function objectToString(type, o) {
        if (typeof o === "string") return o;
        var vals = [];
        for (var key in o) if (o.hasOwnProperty(key)) {
            if (o[key] === true) vals.push(key + ":" + o[key]);
            else if (o[key] !== false) vals.push(key + ":" + o[key]);
        }
        return vals.join(type === "style" ? "; " : " ");
    }
    
    /**
     * This is an object containing many regexes for testing.
     * In most cases, the search string has to be at the beginning of the haystack.
     * Usage:
     * <pre>     if (regexPool.doctype.test(myString)) ...     </pre>
     *
     * This is the fastest way to test if a haystack begins with a string.
     * There is one exception: if the search string is one character long, use
     *
     * <pre>     if (myString[0] === "a") ...                   </pre>
     */
    var regexPool = {
        all_vertical_tabs: /\r/g,       // match \r        (global)
        first_nw_char_or_endl: /\S|$/,  // match the first non-whitespace character or the end of the string
        first_nw_char: /\S/,            // match the first non-whitespace character
        empty_line: /^\s*$/,            // match a string that is empty or contains only whitespace
        leading_ws: /^\s*/,             // match the whitespace at the beginning of the string
        one_leading_ws: /^\s?/,         // match 0 or 1 whitespace characters at the beginning of the string
        trailing_ws: /\s*$/,            // match the whitespace at the end of the string
        trim: /^\s+|\s+$/,              // match all leading and trailing whitespace
        first_ws: /\s/,                 // match first whitespace character
        
        
        doctype: /^doctype/,            // match doctype
        doctype_i: /^doctype/i,         // match doctype   (case-insensitive)
        em_equals: /^!=/,               // match !=
        em_brace: /^!{/,                // match !{
        hash_brace: /^#{/,              // match #{
        comment: /^\/\//,               // match //
        comment_dash: /^\/\/-/,         // match //-
        comment_plus_ws: /^\/\/\s*/,    // match // and additional whitespace
        dot_plus_ws: /^\.\s*/,          // match . and additional whitespace
        modifiers: /^(\.|!=|=)/,        // match . and != and =
        include: /^include\b/,          // match include
        
        filter_js: /^:javascript/,      //:javascript
        filter_js_plus_ws: /^:javascript\s*/,   //:javascript and additional whitespace
        
        // match 1 or more node names and 0 or more IDs/classes
        html_node_with_selectors:     /^([a-z0-9_-]+)(([.#][a-z0-9\u00C0-\u024F_-]+)*)/i,
        // match 0 or more node names and 1 or more IDs/classes
        html_node_opt_with_selectors: /^([a-z0-9_-]*)(([.#][a-z0-9\u00C0-\u024F_-]+)+)/i,
        
        //            attr name                   =    "string escaped "|'string escaped '|variable
        html_attr: /^([a-z0-9\u00C0-\u024F_-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[a-z0-9\u00C0-\u024F_-]+)/i,
        
        quoted_string: /^(".*?"|'.*?')/,
        quoted_string_esc: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
        quoted_string_esc_or_var: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[a-z0-9\u00C0-\u024F_]+)/i
    };
    
    
    //////////////////////////////// HELPER CLASSES ////////////////////////////////
    
    function Variable(string, type) {
        this.val = string;
        this.type = type;
    }
    
    function PartsCombinator() {
        "use strict";
        
        /** @type {Array.<Variable>} */
        var res = [];
        var last = null;
        var lastType = -1;
        
        /**
         * @param {*} val
         * @param {int} type
         */
        this.add = function (val, type) {
            if (type === lastType && lastType === N_TEXT) {
                last.val += val;
            } else if (type !== N_TEXT || val !== "") {
                last = new Variable(val, type);
                lastType = type;
                res.push(last);
            }
        };
        /** @param {Array.<Variable>} valArr */
        this.addMany = function (valArr) {
            for (var i = 0; i < valArr.length; i++) {
                this.add(valArr[i].val, valArr[i].type);
            }
        };
        /** @return {Array.<Variable>} */
        this.getResult = function () {
            return res;
        }
    }
    
    /**
     * @typedef {{
     *       type: (int),
     *       text: (string)?,
     *       indentWidth: (int)?,
     *       isText: (boolean)?,
     *       items: (boolean)?,
     *       children: (Node[])?,
     *       lineNumber: (int)?,
     *       warningShown: (boolean)?,
     *       noChildrenAllowed: (boolean)?
     * }} Node
     */
    
    /**
     * @typedef {{
     *      isEmpty: (boolean),
     *      level: (int)?,
     *      width: (int)?,
     *      parent: (Node)?,
     *      parentWidth: (int)?
     * }} Indent
     */
    
    /** @constructor */
    function IndentOrganizer() {
        "use strict";
        
        /** @type {Array.<[int, Node]>} */
        var activeIndents = [];
        /** @type {int} */
        var currentIndex = -1;
        
        /**
         * @param {string} str
         * @return {Indent}
         */
        this.findParent = function (str) {
            var abs = str.search(regexPool.first_nw_char_or_endl);
            if (abs === str.length) return {
                isEmpty: true
            };
            
            var tuple;
            for (var tupleID = currentIndex; tupleID >= 0; tupleID--) {
                tuple = activeIndents[tupleID];
                if (abs > tuple[0]) return {
                    isEmpty: false,
                    level: tupleID,
                    width: abs,
                    parent: tuple[1],
                    parentWidth: tuple[0]
                };
            }
            return {
                isEmpty: false,
                level: -1,
                width: abs
            };
        };
        /**
         * @param {Indent} indent
         * @param {boolean} addChild
         * @param {Node|object} obj
         */
        this.addNode = function (indent, addChild, obj) {
            currentIndex = indent.level + 1;
            activeIndents[currentIndex] = [indent.width, obj];
            if (addChild) indent.parent.children.push(obj);
        };
        /** @param {Node} child */
        this.addToLast = function (child) {
            activeIndents[currentIndex][1].children.push(child);
        };
    }
    
    var filter = {
        "javascript": function (text) {
            return {
                type: N_HTML,
                nodeName: "script",
                attr: {type: N_TEXT, text: " type=\"text/javascript\""},
                children: [{
                    type: N_TEXT,
                    text: "\n// <![CDATA[\n" + text + "\n// ]]>\n"
                }]
            };
        }
        /*
        +-------------------------------------------------+
        |       MARKDOWN is an experimental feature.      |
        |   Since it does not work yet, it is disabled.   |
        +-------------------------------------------------+
        
        "markdown": function (text) {
            var lines = text.split("\n");
            var output = "";
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (line[0] === "#") {
                    var match = line.match(/^(#{1,6})[ ]?/);
                    var hashTagLen = match[1].length;
                    var replaceLen = match[0].length;
                    output += "<h" + hashTagLen + ">" + line.substring(replaceLen) + "</h" + hashTagLen + ">\n";
                } else if (/\s{0,3}\* /.test(line)) {
                    var starPos = line.indexOf("*");
                    output += "<ul><li>" + line.substring(starPos + 1) + "</li></ul>\n";
                } else {
                    output += line + "\n";
                }
            }
            return {
                type: N_TEXT,
                text: output
            };
        }
        */
    };
    
    
    ////////////////////////////////    PROGRAM     ////////////////////////////////
    
    /**
     * @param {string} string
     * @return {Node}
     */
    function _parse(string) {
        "use strict";
    
        var lines = string.replace(/\r/g, "").split("\n");
    
        var rootNode = {type: N_ROOT, children: []};
    
        /** @type {string} */          var line, trimmedLine;
        /** @type {IndentOrganizer} */ var indentOrg = new IndentOrganizer();
        /** @type {Indent} */          var indent;
    
        for (var i = 0; i < lines.length; i++) {
            line = lines[i];
        
            indent = indentOrg.findParent(line);
            if (indent.isEmpty) continue;
            trimmedLine = line.substring(indent.width);
            if (indent.parent === undefined) indent.parent = rootNode;
        
            if (indent.parent.isText) {
                var pType = indent.parent.type;
                if (indent.parent.noChildrenAllowed) {
                    if (!indent.parent.warningShown) {
                        indent.parent.warningShown = true;
                        showError(WARN_COMPILE, "No children allowed in this node", i, lines[i]);
                    }
                    continue;
                }
                if (!indent.parent.indentWidth) {
                    indent.parent.indentWidth = indent.width;
                } else {
                    trimmedLine = line.substring(Math.min(indent.parent.indentWidth, indent.width));
                }
                indent.parent.children.push({
                    type: (pType === N_HTML_COMMENT || pType === N_COMMENT) ? N_TEXT :
                            N_TEXT_WITH_INJECTIONS,
                    text: trimmedLine,
                    children: []
                })
            } else if (trimmedLine[0] === "|") {
                // pipe (simple text)
                trimmedLine = trimmedLine.substring(trimmedLine[1] === " " ? 2 : 1);
                indentOrg.addNode(indent, true, {
                    type: N_TEXT_WITH_INJECTIONS,
                    text: trimmedLine,
                    isText: true,
                    noChildrenAllowed: true
                });
            } else if (trimmedLine[0] === "=") {
                // =
                trimmedLine = trimmedLine.substring(1);
                indentOrg.addNode(indent, true, {
                    type: N_JS_EXPR_ESC,
                    text: trimmedLine,
                    children: []
                });
            } else if (regexPool.em_equals.test(trimmedLine)) {
                // !=
                trimmedLine = trimmedLine.substring(2);
                indentOrg.addNode(indent, true, {
                    type: N_JS_EXPR,
                    text: trimmedLine,
                    children: []
                });
            } else if (regexPool.comment_dash.test(trimmedLine)) {
                // //- (invisible comment)
                indentOrg.addNode(indent, false, {
                    type: N_COMMENT,
                    children: []
                });
            } else if (regexPool.comment.test(trimmedLine)) {
                // // (html comment)
                indentOrg.addNode(indent, true, {
                    type: N_HTML_COMMENT,
                    isText: true,
                    text: trimmedLine.substring(2),
                    children: []
                });
            } else if (regexPool.doctype.test(trimmedLine)) {
                // doctype
                var doctype_type = doctypes.default;
                var argsString = trimmedLine.substring(7);
                if (argsString !== "") {
                    var args = argsString.trim().toLowerCase();
                    if (doctypes[args]) {
                        doctype_type = doctypes[args];
                    } else {
                        doctype_type = "<!DOCTYPE " + argsString.trim() + ">";
                    }
                }
                indentOrg.addNode(indent, true, {
                    type: N_TEXT,
                    text: doctype_type,
                    children: []
                });
            } else if (trimmedLine[0] === "-") {
                // javascript
                trimmedLine = trimmedLine.substring(trimmedLine[1] === " " ? 2 : 1);
                indentOrg.addNode(indent, true, {
                    type: N_JS_LINE,
                    text: trimmedLine,
                    children: []
                });
            } else if (trimmedLine[0] === ":") {
                // filter
                var filterName = "";
                var filterNameMatch = trimmedLine.match(/^:([a-z0-9_-]+)/);
                if (filterNameMatch !== null) filterName = filterNameMatch[1];
            
                var filterNode = {type: N_FILTER, children: []};
                indentOrg.addNode(indent, false, filterNode);
            
                var tempIndent, ii;
            
                if (filter[filterName]) {
                    var res = [];
                    for (ii = i + 1; ii < lines.length; ii++) {
                        tempIndent = indentOrg.findParent(lines[ii]);
                        if (tempIndent.isEmpty) {
                            res.push(lines[ii].substring(filterNode.indentWidth || 1000000000));
                        } else if (tempIndent.parent === filterNode) {
                            res.push(lines[ii].substring(filterNode.indentWidth || (filterNode.indentWidth = tempIndent.width)));
                        } else {
                            break;
                        }
                    }
                    i = ii - 1;
                    indentOrg.addNode(indent, true, filter[filterName](res.join("\n")));
                } else {
                    var LN = i;
                    for (ii = i + 1; ii < lines.length; ii++) {
                        tempIndent = indentOrg.findParent(lines[ii]);
                        if (!tempIndent.isEmpty && tempIndent.parent !== filterNode) {
                            break;
                        }
                    }
                    i = ii - 1;
                    showError(WARN_COMPILE, "Filter \"" + filterName + "\" is not supported", LN, lines[LN]);
                }
            } else if (regexPool.include.test(trimmedLine)) {
                // include
                indentOrg.addNode(indent, false, {
                    type: N_COMMENT,
                    text: "",
                    children: []
                });
                showError(WARN_COMPILE, "Includes are not supported in the browser", i, lines[i]);
            } else {
                // html element
                try {
                    var htmlNode = parseNodeString(trimmedLine);
                } catch (e) {
                    if (e.isCustomWarning) {
                        showError(WARN_COMPILE, e.message, i, lines[i]);
                        indentOrg.addNode(indent, false, {
                            type: N_COMMENT,
                            isText: true,
                            children: []
                        });
                        continue;
                    } else {
                        throw e;
                    }
                }
                if (htmlNode.nodeName === null) {
                    indentOrg.addNode(indent, true, {
                        type: N_TEXT_WITH_INJECTIONS,
                        text: htmlNode.after,
                        noChildrenAllowed: true,
                        isText: true
                    });
                } else switch (htmlNode.mods) {
                    case null:
                        indentOrg.addNode(indent, true, {
                            type: N_HTML,
                            nodeName: htmlNode.nodeName,
                            attr: {type: N_ARRAY, items: htmlNode.attr},
                            isText: false,
                            children: []
                        });
                        indentOrg.addToLast({
                            type: N_TEXT_WITH_INJECTIONS,
                            text: htmlNode.after
                        });
                        break;
                    case ".":
                        indentOrg.addNode(indent, true, {
                            type: N_HTML,
                            nodeName: htmlNode.nodeName,
                            attr: {type: N_ARRAY, items: htmlNode.attr},
                            isText: true,
                            children: []
                        });
                        indentOrg.addToLast({
                            type: N_TEXT_WITH_INJECTIONS,
                            text: htmlNode.after
                        });
                        break;
                    case "=":
                        indentOrg.addNode(indent, true, {
                            type: N_HTML,
                            nodeName: htmlNode.nodeName,
                            attr: {type: N_ARRAY, items: htmlNode.attr},
                            isText: false,
                            children: []
                        });
                        indentOrg.addToLast({
                            type: N_JS_EXPR_ESC,
                            text: htmlNode.after,
                            children: []
                        });
                        break;
                    case "!=":
                        indentOrg.addNode(indent, true, {
                            type: N_HTML,
                            nodeName: htmlNode.nodeName,
                            attr: {type: N_ARRAY, items: htmlNode.attr, children: []},
                            isText: false,
                            children: []
                        });
                        indentOrg.addToLast({
                            type: N_JS_EXPR,
                            text: htmlNode.after,
                            children: []
                        });
                        break;
                    default:
                        indentOrg.addNode(indent, false, {
                            type: N_COMMENT,
                            isText: true,
                            children: []
                        });
                        showError(WARN_COMPILE, "Unsupported node mode \"" + htmlNode.mods + "\n", i, lines[i]);
                }
            }
        }
    
        return rootNode;
    }
    
    
    /**
     * @param {string} string - the full line
     * @return {{nodeName: string|null, attr: string|Node[]|null, mods: string|null, after: string}}
     */
    function parseNodeString(string) {
        "use strict";
    
        var i;
    
        // 1 node name, 0-n css selectors
        var nodeNameWithSelectors = string.match(regexPool.html_node_with_selectors);
        if (nodeNameWithSelectors === null) {
            // 0-1 node names, 1-n css selectors
            nodeNameWithSelectors = string.match(regexPool.html_node_opt_with_selectors);
        }
        if (nodeNameWithSelectors === null) {
            return {nodeName: null, attr: null, mods: null, after: string};
        }
        var nodeName = nodeNameWithSelectors[1];
        if (nodeName === "") nodeName = "div";
        var cssAttributes = nodeNameWithSelectors[2];
        var cssAttributeArr = cssAttributes.replace(/[.#]/g, " $&").split(" ");
        var rest = string.substring(nodeNameWithSelectors[0].length);
    
        var id = null;
        var classNames = [];
        for (i = 1; i < cssAttributeArr.length; i++) {
            var cssAttr = cssAttributeArr[i];
            if (cssAttr[0] === ".") classNames.push(cssAttr.substring(1));
            else id = cssAttr.substring(1);
        }
    
        var attributes = [];
    
        if (rest[0] === "(") {
            rest = rest.substring(1);
            /** @type {{el: (string|Node)?, after: string}|null} */
            var result;
            while (true) {
                result = parseHtmlAttribute(rest);
                if (result === null) {
                    var e = new Error("Unclosed html attributes");
                    e.isCustomWarning = true;
                    throw e;
                }
                rest = result.after;
                if (result.el === undefined) break;
            
                attributes.push(result.el);
            }
        }
    
        if (id !== null) attributes.push(" id=\"" + id + "\"");
        if (classNames.length > 0) attributes.push(" class=\"" + classNames.join(" ") + "\"");
    
        var modifiers = rest.match(regexPool.modifiers);
        var mods = null;
        if (modifiers !== null) {
            mods = modifiers[0];
            if (rest[mods.length] === " ") {
                rest = rest.substring(mods.length + 1);
            } else {
                rest = rest.substring(mods.length);
            }
        } else if (rest[0] === " ") {
            rest = rest.substring(1);
        }
    
        return {
            nodeName: nodeName,
            attr: attributes,
            mods: mods,
            after: rest
        };
    }
    
    /**
     * @param {string} string
     * @return {({el: (string|Node)?, after: string}|null)}
     */
    function parseHtmlAttribute(string) {
        "use strict";
    
        var firstNWS = string.search(regexPool.first_nw_char_or_endl);
        var trimmed = string.substring(firstNWS);
        if (trimmed === "") return null;
        if (trimmed[0] === ")") return {after: trimmed.substring(1)};
    
        var key, value, len;
    
        var attr = trimmed.match(regexPool.html_attr);
        if (attr !== null) {
            key = attr[1];
            value = attr[2];
            len = attr[0].length;
            if (value[0] === "\"" || value[0] === "'") {
                value = value.substring(1, value.length - 1);
                return {
                    el: " " + key + "=\"" + escapeHtml(value) + "\"",
                    after: string.substring(firstNWS + len)
                };
            } else {
                // _ += (typeof a === 'undefined') ? '' : (a === true) ? "html" : (a === false) ? "" : "html=\"" + a + "\""
                return {
                    el: /** @type Node */ {
                        type: N_JS_EXPR_NO_VALIDATE,
                        text: "(typeof " + value + " === 'undefined') ? '' : " +
                        "(" + value + " === true) ? ' " + key + "' : " +
                        "(" + value + " === false) ? '' : " +
                        "' " + key + "=\"' + escapeHtml(objectToString('" + key + "', " + value + ")) + '\"'",
                        children: []
                    },
                    after: string.substring(firstNWS + len)
                };
            }
        } else {
            attr = trimmed.match(regexPool.html_attr_no_val);
        
            if (attr !== null) {
                key = attr[0];
                value = key;
                len = key.length;
                return {
                    el: " " + key + "=\"" + value + "\"",
                    after: string.substring(firstNWS + len)
                };
            } else {
                //TODO what about JSON?
                var e = new Error("Invalid html attribute");
                e.isCustomWarning = true;
                throw e;
            }
        }
    }
    
    
    
    
    /**
     * @param {Node} parsedTree
     * @param {PartsCombinator} combinator
     * @param {boolean?} breakAllStrings
     */
    function makeParts(parsedTree, combinator, breakAllStrings) {
        "use strict";
    
        var content = parsedTree;
        var children = parsedTree.children || [];
    
        var i;
    
        switch (content.type) {
            case N_ROOT:
                for (i = 0; i < children.length; i++) {
                    makeParts(children[i], combinator, breakAllStrings);
                }
                return;
            case N_ARRAY:
                for (i = 0; i < content.items.length; i++) {
                    var item = content.items[i];
                    if (typeof item === "string") {
                        combinator.add(item, N_TEXT);
                    } else {
                        makeParts(item, combinator);
                    }
                }
                return;
            case N_TEXT_WITH_INJECTIONS:
                combinator.addMany(stringSplitter(content.text));
                if (breakAllStrings) combinator.add("\n", N_TEXT);
                return;
            case N_TEXT:
                combinator.add(content.text, N_TEXT);
                if (breakAllStrings) combinator.add("\n", N_TEXT);
                return;
            case N_HTML:
                var nodeNameLC = content.nodeName.toLowerCase();
            
                if (selfClosingNodes[nodeNameLC]) {
                    if (content.attr.items && content.attr.items.length > 0) {
                        combinator.add("<" + nodeNameLC, N_TEXT);
                        makeParts(content.attr, combinator, false);
                        combinator.add("/>\n", N_TEXT);
                    } else {
                        combinator.add("<" + nodeNameLC + "/>\n", N_TEXT);
                    }
                } else if (children.length > 1 || (children[0] && children[0].children && children[0].children.length > 0)) {
                    if (content.attr.items && content.attr.items.length > 0) {
                        combinator.add("<" + nodeNameLC, N_TEXT);
                        makeParts(content.attr, combinator, false);
                        combinator.add(">", N_TEXT);
                    } else {
                        combinator.add("<" + nodeNameLC + ">", N_TEXT);
                    }
                    for (i = 0; i < children.length; i++) {
                        makeParts(children[i], combinator, true);
                    }
                    combinator.add("</" + nodeNameLC + ">\n", N_TEXT);
                } else {
                    if (content.attr.text) {
                        combinator.add("<" + nodeNameLC, N_TEXT);
                        combinator.add(content.attr.text, N_TEXT);
                        combinator.add(">", N_TEXT);
                    } else if (content.attr.items && content.attr.items.length > 0) {
                        combinator.add("<" + nodeNameLC, N_TEXT);
                        makeParts(content.attr, combinator, false);
                        combinator.add(">", N_TEXT);
                    } else {
                        combinator.add("<" + nodeNameLC + ">", N_TEXT);
                    }
                    for (i = 0; i < children.length; i++) {
                        makeParts(children[i], combinator);
                    }
                    combinator.add("</" + nodeNameLC + ">\n", N_TEXT);
                }
                return;
            case N_HTML_COMMENT:
                combinator.add("<!--", N_TEXT);
                if (content.text !== "") combinator.add(" " + content.text, N_TEXT);
                if (children.length > 0) {
                    combinator.add("\n", N_TEXT);
                    for (i = 0; i < children.length; i++) {
                        makeParts(children[i], combinator, true);
                    }
                }
                combinator.add("-->\n", N_TEXT);
                return;
            case N_JS_EXPR:
            case N_JS_EXPR_ESC:
            case N_JS_EXPR_NO_VALIDATE:
                combinator.add(content.text, content.type);
                for (i = 0; i < children.length; i++) {
                    makeParts(children[i], combinator);
                }
                return;
            case N_JS_LINE:
                if (children.length > 0) {
                    combinator.add(content.text + "\n    {", N_JS_LINE);
                    for (i = 0; i < children.length; i++) {
                        makeParts(children[i], combinator);
                    }
                    combinator.add("}", N_JS_LINE);
                } else {
                    combinator.add(content.text, N_JS_LINE);
                }
                return;
            default:
                showError(ERROR_INTERNAL, "Invalid node type " + content.type);
                throw new Error("Invalid node type " + content.type);
        }
    }
    
    /**
     * @param {string} string
     * @return {Array.<Variable>}
     */
    function stringSplitter(string) {
        "use strict";
        
        var res = [];
        var pos = 0, posBefore, endPos;
        
        while (pos <= string.length) {
            posBefore = pos;
            pos = string.indexOf("#{", posBefore);
            if (pos !== -1) {
                if (posBefore !== pos) {
                    res.push(new Variable(string.substring(posBefore, pos), N_TEXT));
                }
                pos += 2;
                endPos = string.indexOf("}", pos);
                if (endPos === -1) {
                    res.push(new Variable(string.substring(pos), N_JS_EXPR_ESC));
                    return res;
                } else {
                    res.push(new Variable(string.substring(pos, endPos), N_JS_EXPR_ESC));
                    pos = endPos + 1;
                }
            } else {
                pos = string.indexOf("!{", posBefore);
                if (pos !== -1) {
                    if (posBefore !== pos) {
                        res.push(new Variable(string.substring(posBefore, pos), N_TEXT));
                    }
                    pos += 2;
                    endPos = string.indexOf("}", pos);
                    if (endPos === -1) {
                        res.push(new Variable(string.substring(pos), N_JS_EXPR));
                        return res;
                    } else {
                        res.push(new Variable(string.substring(pos, endPos), N_JS_EXPR));
                        pos = endPos + 1;
                    }
                } else {
                    res.push(new Variable(string.substring(posBefore), N_TEXT));
                    return res;
                }
            }
        }
    }
    
    
    /**
     * @param {Variable[]} parts
     * @param {(string|null)?} extend
     */
    function createFunction(parts, extend) {
        "use strict";
        
        var res = "function anonymous(context) {\n" +
                "  with (context || {}) {\n" +
                "    var _ = \"\";\n";
        
        var el, x;
        for (var i = 0; i < parts.length; i++) {
            el = parts[i];
            switch (el.type) {
                case N_EXTEND:
                    showError(ERROR_INTERNAL, "type N_EXTEND in createFunction");
                    return new Error("[INTERNAL] type N_EXTEND in createFunction");
                    break;
                case N_TEXT:
                    res += "    _ += \"" + addSlashes(el.val).replace(/\n/g, "\\n") + "\";\n";
                    break;
                case N_JS_EXPR_ESC:
                    x = el.val;
                    res += "    _ += (typeof "+ x + " === 'undefined') ? 'undefined' : escapeHtml(" + x + ");\n";
                    break;
                case N_JS_EXPR_NO_VALIDATE:
                    x = el.val;
                    res += "    _ += " + x + ";\n";
                    break;
                case N_JS_EXPR:
                    x = el.val;
                    res += "    _ += (typeof "+ x + " === 'undefined') ? 'undefined' : " + x + ";\n";
                    break;
                case N_JS_LINE:
                    res += "    " + el.val + "\n";
                    break;
                default:
                    return new Error("Invalid node type " + el.type);
            }
        }
        if (extend !== null) {
            res += "    return (" + extend + ")(context);\n";
            res += "  }\n";
            res += "}";
        } else {
            res += "    return _;\n";
            res += "  }\n";
            res += "}";
        }
        return res;
    }
    
    ////////////////////////////////     MODULE     ////////////////////////////////
    
    var WARN_COMPILE = 1,
        WARN_INCLUDE = 2,
        ERROR_PARSE = 3,
        ERROR_INTERNAL = 4;
    
    var _label = null;
    
    function showError(type, warning, lineNumber, lineText) {
        switch (type) {
            case WARN_COMPILE:
                lineNumber++;
                if (_label === null) {
                    console.warn("Compiler warning: " + warning + "\nat line " + lineNumber + ":\n" + lineText);
                } else {
                    console.warn("Compiler warning: " + warning + "\nat line " + lineNumber + " in " + _label + ":\n" + lineText);
                }
                break;
            case WARN_INCLUDE:
                if (_label === null) {
                    console.warn("Compiler warning: " + warning + ":\n" + lineText);
                } else {
                    console.warn("Compiler warning: " + warning + " in " + _label + ":\n" + lineText);
                }
                break;
            case ERROR_PARSE:
                if (_label === null) {
                    console.warn("Parse error: " + warning);
                } else {
                    console.warn("Parse error in " + _label + ": " + warning);
                }
                break;
            case ERROR_INTERNAL:
                console.warn("Internal error:\n" + warning);
                break;
            default:
                console.warn(warning);
        }
    }
    
    /**
     * @param {string} str
     * @param {string?} label
     * @return {function|Error}
     */
    function compile(str, label) {
        if (!str && str !== "") {
            showError(WARN_COMPILE, "No string given", 0, "");
            throw new Error("[COMPILE] No string given");
        }
        
        _label = label || null;
        
        var combinator = new PartsCombinator();
        makeParts(_parse(str), combinator, true);
        var parts = combinator.getResult();
        var string = createFunction(parts, null);
        try {
            eval(string);
            // noinspection JSUnresolvedVariable
            return anonymous;
        } catch (e) {
            showError(ERROR_PARSE, "Invalid javascript:\n    " + e);
            var labelStr = (_label === null) ? "" : " in " + _label;
            return new Error("Parser warning: Invalid javascript" + labelStr);
        }
    }
    
    /**
     * @param {function(Object)} templateFunc
     * @param {Object} context
     * @return {string|Error}
     */
    function parse(templateFunc, context) {
        return templateFunc(context);
    }
    
    return {
        compile: compile,
        parse: parse,
        escapeHtml: escapeHtml,
        addSlashes: addSlashes,
        objectToCssString: objectToString
    };

})();